# Self-Audit Report — codex/foundation-route-long-hardening

Auditor: Claude (the same agent that authored most of this branch). This is the audit prompt at `docs/operations/external-audit-prompt.md` run against my own work. Conflict of interest acknowledged — I made an active effort to find what I might have rationalized away. Compare with the independent external auditor's report when it arrives.

Date: 2026-05-22

## Summary

`pnpm verify` passed 31/31 in ~24s on this branch.

I found **one Blocker, one High that's also security-critical at the same surface, one privacy-affecting High, two Mediums, three Lows, ten Confirmed-fine.** The Blocker and the highest-impact High are at the Convex function visibility layer — they were not in the scope of the gate-split work this branch focused on, which is why they survived to this audit. If you only act on one thing, act on the Blocker.

---

## Blocker findings

### B1. Unscoped Convex functions are publicly callable

**Where**: `convex/persons.ts`, `convex/events.ts`, `convex/relationships.ts`, `convex/sources.ts`, `convex/media.ts`, `convex/personEvents.ts`, `convex/ancestorDetails.ts` — all of them use `query`/`mutation` (Convex's public-by-default markers), not `internalQuery`/`internalMutation`.

**Concretely:**

- `convex/persons.ts:116` `list` → `ctx.db.query("persons").collect()` returns every person across every vault owner.
- `convex/persons.ts:156` `search` — same pattern.
- `convex/persons.ts:197` `update` — patches any person by ID with no owner check.
- `convex/persons.ts:360` `remove` — deletes any person + its relationships + its personEvents.
- `convex/events.ts` exports `create`, `update`, `remove`, `linkPerson`, `unlinkPerson`, `list`, `getForPerson`.
- `convex/relationships.ts` exports `createCouple`, `createParentChild`, `updateFacts`, `updateRelationType`, `remove`, etc.
- `convex/sources.ts`, `convex/media.ts`, `convex/personEvents.ts`, `convex/ancestorDetails.ts` — same shape.

**Why it matters**:

- `NEXT_PUBLIC_CONVEX_URL` is exposed to the browser by design (it's the Convex client connection URL).
- Convex's `query` and `mutation` are publicly callable from any client that knows the URL and function name.
- These 50+ functions read and write across vault-owner boundaries with **no auth check, no owner filter, no rate limit**.
- The Next.js app surface uses ONLY `api.vault.*` and `api.vaultMutations.*` (the owner-aware namespaces) — so this is dead code from the app's perspective. But Convex still publishes every export.

**Concrete failure mode**: Once `NEXT_PUBLIC_CONVEX_URL` points at a production deployment, anyone (Chrome devtools → Network → grab the URL → install the Convex JS client → call `client.query(api.persons.list)`) sees every person across every owner. Same for `media`, `sources`, etc. And the mutations let them write/delete.

**Suggested fix**:

```ts
// In convex/persons.ts, convex/events.ts, etc.:
import { internalQuery, internalMutation } from "./_generated/server";
// Change `export const x = query(...)` → `export const x = internalQuery(...)`
// Change `export const x = mutation(...)` → `export const x = internalMutation(...)`
```

Or delete the files outright if confirmed unused by the app surface (a `grep -rn "api.persons\|api.events\|api.relationships\|api.sources\|api.media\|api.personEvents\|api.ancestorDetails" app/ components/ lib/` returned zero hits).

Verify by re-running `pnpm verify` after the change. The app surface only uses `api.vault.*`, `api.vaultMutations.*`, `api.citations.*`, `api.documents.*`, `api.importRuns.*`, `api.places.*`, `api.researchLog.*` — those have proper owner scoping (vault_refs > 0 from my grep).

**File a Linear issue at HIGH/BLOCKER**.

---

## High findings

### H1. `getVaultSnapshot` does full table scans on every query

**Where**: `convex/vault.ts:69-90` — every Convex query that calls `getVaultSnapshot` ends up doing `ctx.db.query("tableName").collect()` for 20 tables, then filters in JS via `owned()`.

**Why it matters**:

- Indexes for owner scoping exist in `convex/schema.ts` (e.g. `by_owner` on persons, relationships, events, etc. — about 20 of them).
- The queries don't use them. They scan every row of every table and discard cross-owner data in JS.
- At single-owner scale (current local-dev) this is fine. At 10 owners × 1,000 persons each, every page load reads 10,000 person rows to render one owner's view.
- Compounds the Blocker above — even with the internalQuery fix, the legitimate owner queries are reading other owners' data into Convex memory before filtering.

**Concrete failure mode**: First production deploy with >1 owner. Pages get slow as O(total_db_size). Convex costs balloon. Bandwidth-billing surprise.

**Suggested fix**:

```ts
// Replace
ctx.db.query("persons").collect()
// with
ctx.db.query("persons").withIndex("by_owner", q => q.eq("vaultOwnerId", vaultOwnerId)).collect()
```

For each of the 20 tables, in `getVaultSnapshot`. The function already accepts `vaultOwnerId` (it's passed to `owned()`).

### H2. `isContextPackEligibleContextItem` ignores `aiUseAllowed`

**Where**: `convex/vault.ts:445-449`.

```ts
function isContextPackEligibleContextItem(item: Doc<"contextItems">) {
  const reviewed = item.reviewStatus === "reviewed" || item.reviewStatus === "redacted";
  const notPrivate = item.privacyLevel !== "private";
  return reviewed && notPrivate;
}
```

Compare with `convex/vault.ts:279-288` (the historicalContext gate):

```ts
function isContextPackEligibleHistoricalContext(entry: Doc<"historicalContext">) {
  // ...
  return (
    entry.aiUseAllowed === true &&
    (reviewStatus === "reviewed" || reviewStatus === "redacted") &&
    privacyLevel !== "private"
  );
}
```

**Why it matters**: The `contextItems` schema (`convex/schema.ts:623`) requires `aiUseAllowed: v.boolean()` — non-optional. The user can explicitly set it to `false` to opt a context item out of AI processing. The gate predicate ships it to the AI anyway.

**Concrete failure mode**: User marks a private family memory as `aiUseAllowed: false`. They generate a story via Story Writer. The memory gets shipped to the AI in the structured context pack at `convex/vault.ts:1431`. Privacy opt-out is silently bypassed.

**Suggested fix**:

```ts
function isContextPackEligibleContextItem(item: Doc<"contextItems">) {
  const reviewed = item.reviewStatus === "reviewed" || item.reviewStatus === "redacted";
  const notPrivate = item.privacyLevel !== "private";
  return item.aiUseAllowed === true && reviewed && notPrivate;
}
```

And add a corresponding behavioral assertion to `scripts/check-context-pack-contract.ts` mirroring the historicalContext one. The fix is 3 lines plus a test.

---

## Medium findings

### M1. AI structured export ships unfiltered media

**Where**: `convex/vault.ts:1429` `memories: workspace.media`.

The AI structured export bundles every media record on the workspace, with no privacy filter. `media.aiUseAllowed`, `media.privacyLevel`, `media.reviewStatus` are all ignored.

**Concrete failure mode**: User has a private photo with `aiUseAllowed: false`. They download the context pack as JSON or call the markdown export. The photo's title, description, URL, and FamilySearch source URL all ship to the AI.

The `mediaNeedingPrivacyReview` field at `convex/vault.ts:1407` provides a hint that some media are flagged — but the data is still in the `memories` array, so the AI receives it.

**Suggested fix**: Filter `memories` in the structured export by the same gate that `isPublicStoryMedia` uses for public output, OR by a dedicated AI gate (`reviewStatus reviewed + privacyLevel non-private + aiUseAllowed true`). If full media is still useful for some downstream consumer, expose it under a separate explicit field.

### M2. `missingContextPlaces` in AI export uses unfiltered entries

**Where**: `convex/vault.ts:1406` `missingContextPlaces: workspace.contextCoverage.missingPlaces`.

`missingPlaces` is computed from unfiltered `entries` (any context that exists, reviewed or not). For human surfaces that's correct. For the AI export it's misleading: "no missing places" claims coverage that the AI can't actually use because the underlying entries are unreviewed/private.

**Concrete failure mode**: Person has a place `X` with one unreviewed context entry. AI export ships `historicalContext: []` (correctly filtered) but `missingContextPlaces: []` (claims coverage). AI writes about place X based on its training data, the user gets a hallucinated setting.

**Suggested fix**: Compute `aiMissingPlaces` in `buildContextCoverage` based on `aiEligibleEntries` (places without AI-eligible context). Use it in the AI export. Leave `missingPlaces` for human surfaces.

---

## Low findings

### L1. Service worker accepts `START_EXTRACTION` without consent verification

**Where**: `extension/service-worker.ts:70-73`. The popup at `extension/popup/popup.ts:165` enforces consent by disabling the button. The service worker doesn't double-check.

Currently safe because:
- `externally_connectable` is not set in `extension/manifest.json`
- Only the extension's own popup and content scripts can send messages
- Content scripts don't send `START_EXTRACTION` (verified)

But the consent enforcement is single-layer. **Defense in depth**: have the popup pass `consentGiven: true` in the message; have the service worker reject if absent. Three lines of defensive code.

### L2. No test that SafeLink actually suppresses hydration warnings

**Where**: `components/layout/SafeLink.tsx`. The wrapper is taken on faith. If `next/link` ever stops forwarding `suppressHydrationWarning` to the underlying `<a>`, every nav link starts logging warnings and no automated check catches it.

**Suggested fix**: a small test that renders SafeLink under a server-render harness with a mock-extension attribute injected client-side, asserts no warning is logged. Or, simpler: a smoke test that runs `pnpm dev` + curl against `/app` and greps the server log for "hydration" warnings.

### L3. No Linear issue tracks SafeLink root-cause investigation

The SafeLink doc says "If we ever isolate the root-cause extension or attribute, replace this with a targeted fix and remove SafeLink." No issue tracks the investigation. The workaround tends to become permanent without an owner.

**Suggested fix**: file a Backlog issue with `work:tech-debt` + `area:vault` labels: "Identify the browser extension/attribute causing hydration warnings on anchor elements; replace SafeLink with a targeted fix or document the cause permanently."

---

## Confirmed-fine

Things I actively checked and traced:

1. **Public story bundle uses strict `publishableEntries` gate** — `convex/vault.ts:557-558` confirms `options.publicView` selects `publishableEntries.slice(0, 8)`. Traced through `getPublishedStory` and `getPublishedStoryByIdentifier`. No leak path.

2. **`getPublishedStoryByIdentifier` requires `status === "published"` before any read** — `convex/vault.ts:841` short-circuits before loading the vault snapshot.

3. **GEN-65 "currently available" fallback runs only on internal review page** — `app/app/stories/[storyId]/page.tsx:138-143`. The public route `app/stories/[id]/page.tsx:126` reads only the bundle's pre-gated `historicalContext`.

4. **OG image route uses only published-story shareable preview** — `app/stories/[id]/opengraph-image.tsx:32-35` calls `buildPublicStorySharePreview` with story title + person displayName/lifespan only. No media embedded.

5. **portraitUrl never leaks to Convex** — `grep -rnE "portraitUrl" convex/` returns zero hits. The field is parsed by Zod in `lib/familysearch/capture.ts:74` and never written to any Convex table.

6. **Capture parser uses Zod `safeParse`** — `lib/familysearch/capture.ts:104-130`. Strong against malformed input. Falls back to legacy evidence pack if the v2 schema fails. `check:capture-validation` covers edge cases.

7. **No code path assumes provider API access** — `grep -rnE "FAMILYSEARCH_API|fs_api|fs-api|provider.api" app/ lib/ convex/` returns zero hits. Per `docs/importing/familysearch-source-capture-runbook.md` this is correct (provider API is pending).

8. **sourceFacts does NOT auto-promote to person.birth/death** — `convex/vaultMutations.ts:772-796` only inserts/patches the `sourceFacts` table. No `ctx.db.patch("persons", ...)` path that pulls from sourceFacts.

9. **AI markdown export labels evidence vs. synthesis clearly** — `convex/vault.ts:1497-1517`. Source-Backed Facts section (line 1540) and Evidence Trace section (line 1530) are explicitly labeled and structurally separate from the research-pack synthesis content.

10. **Test honesty (3 random check scripts)** — Mutated `check:experimental-tools` source by removing a privacy note; check failed correctly. Mutated `check:story-publish` fixture by flipping `expectedCanPublish`; check failed correctly with exit code 1. Restored both. Selected randomly via `ls scripts/check-*.ts | sort -R | head -3`.

11. **Consent enforcement on extension** — `externally_connectable` not set in manifest. Content scripts don't send `START_EXTRACTION` (verified by grep). Popup is the only entry point and it enforces consent.

12. **AGENTS.md rules followed by this branch** — Linear-read before invent, route grouping, Done with verification, follow-up issues filed instead of TODOs, no new abstractions where existing patterns existed.

---

## Disagreements with prior decisions

### D1. The audit prompt under-emphasizes the Convex API surface

My own audit prompt at `docs/operations/external-audit-prompt.md` lists "Owner isolation and guest vaults" as item 3 of 9. Reading it cold, I wouldn't have prioritized it. In practice it's where the worst finding lives. The prompt should explicitly call out "first thing to check: are all Convex exports either owner-scoped or `internalQuery`/`internalMutation`?"

### D2. `pnpm verify` doesn't include a Convex visibility check

`scripts/check-protected-routes.ts` covers the Next.js route surface. Nothing covers the Convex function surface. A small check that asserts "every `export const x = query(...)` in `convex/*.ts` either references `vaultOwnerId` or is in an allowlist of public functions" would have caught the Blocker. Worth adding.

### D3. The gate split fix is correct but solved one of three asymmetric gates

When I split the historicalContext gate (commit `9246cb2`), I should have audited the parallel contextItems gate at the same time — they have the same shape of asymmetry. I missed it.

---

## Things I didn't get to

- **Convex query depth audit** — I confirmed the full-table-scan pattern at `getVaultSnapshot`. Didn't audit individual query handlers for additional N+1s within owner-scoped data (e.g., does `buildPersonOperations` re-scan events for each person on the audit page?).
- **AI prompt content** — I didn't read `lib/ai/storyWriter.ts` for prompt injection / system prompt safety.
- **Clerk integration paths** — `proxy.ts` and `lib/clerk/config.ts` look right, but I didn't trace what happens when a Clerk session is half-loaded.
- **CSP / security headers** — `next.config.ts` may or may not set good headers; I didn't check.
- **Public sitemap** — `app/sitemap.xml` may or may not respect `publicIndexing: "noindex"`; worth verifying.
- **Rate limits on the import + AI endpoints** — none visible at the Next.js API route layer.
- **Story slug enumerability** — slugs are 8-char-suffix; could be brute-forced. Probably acceptable risk for "published" stories but worth knowing.
- **The `evidenceRole` field on `contextItems`** — `"raw_material" | "researcher_conclusion" | ...` — does anywhere in the codebase enforce that AI surfaces label these correctly? I didn't trace.

---

## Recommended immediate action plan

1. **File B1 as a Linear Blocker issue.** Convert the 7 unscoped Convex files to `internalQuery`/`internalMutation` or delete them. Verify with `pnpm verify` and a fresh `pnpm build`. Probably a 30-minute fix.
2. **File H1 as a High issue.** Replace the 20 `ctx.db.query(table).collect()` calls in `getVaultSnapshot` with `withIndex("by_owner", ...)`. Verify by running smoke routes. ~1 hour.
3. **File H2 as a High issue.** 3-line gate fix + behavioral test. Probably 20 minutes.
4. **Bundle M1, M2 into one Medium issue.** AI export should filter media + use ai-eligible missingPlaces. ~1 hour with the test fixture update.
5. **Add a Convex visibility check** (D2) to `pnpm verify`. ~30 minutes.

Total time to resolve all High+/Blocker findings: ~3 hours.
