# External Audit Prompt

This file is the prompt to hand a third-party AI agent (Claude/GPT/Gemini/etc.) when soliciting a serious external audit of the `codex/foundation-route-long-hardening` branch.

Copy everything below the `---` line into the auditor's context. It assumes they have file-system read access to the repo.

---

You are auditing the `codex/foundation-route-long-hardening` branch of **Discover Their Stories** — a Next.js 16 + Convex genealogy research and storytelling tool with an unattended Chrome extension for FamilySearch capture. Two agents have already worked this branch (Codex, then Claude); my goal is an honest external opinion before a wider audit pass.

I want you to be **adversarial, not collegial**. Disagree with prior decisions if you have grounds. Flag low-severity issues that look like patterns. Mark things "looks fine" only after you actually verified them, not as a default.

## Where to enter

Read these files **in order**, then form opinions:

1. `docs/operations/branch-wrap-up.md` — what shipped on this branch and why
2. `AGENTS.md` — operating rules
3. `docs/context/place-era-research-packs.md` — load-bearing data contract for historical context
4. `docs/importing/familysearch-capture-storage-map.md` — load-bearing data contract for intake

Run `pnpm verify` before forming any opinion. It runs 31 contract checks + typecheck + lint + tests + build in ~24s. Confirm baseline green. If anything fails on your machine, that is itself a finding.

## Five load-bearing invariants

The project documents these as non-negotiable. Audit assumes you respect them as design choices, not bugs:

1. **Evidence vs. conclusion** — citations carry `isEvidence: true|false` to separate raw record data from researcher inferences. Follows the Genealogical Proof Standard.
2. **GEDCOM X relationships, not Family entities** — Person↔Person (Couple, ParentChild, etc.), no Family table.
3. **Privacy-first split storage** — Convex holds the canonical structured graph; raw artifacts and exports stay local under `/data` (gitignored).
4. **Optional auth** — Clerk is gated by `REQUIRE_AUTH=true`. Default is local/guest with cookie-based vault ownership in `proxy.ts`.
5. **Three context gates, not one** — `historicalContext` flows through different filters per consumer. Doc: `docs/context/place-era-research-packs.md` "Gate Semantics By Surface". This was the highest-severity bug I fixed on this branch (commit `9246cb2`); auditor should verify the split holds end-to-end.

If you think any of these invariants is itself wrong, say so — but call out separately from the audit findings.

## What I already know is open (you can confirm, expand, or correct)

| Issue | Status | What I know |
| --- | --- | --- |
| GEN-48 Production-data privacy sweep | In Review | Requires a human operator with real owner-vault access. Local dev fixtures only. |
| GEN-23 Broader production privacy/security review | Backlog | Pending; expected to subsume the privacy sweep + more. |
| GEN-68 Delete legacy `dts:*` Linear labels | Backlog | Manual UI step. Linear MCP can't delete labels. |
| GEN-24/25/26/28/30 | Backlog | PM/UX decision items. Look at acceptance criteria for clarity if you have access to Linear. |

Confirm or rebut these; surface new ones I missed.

## What I want from you

A structured findings report. Use these severity levels:

- **Blocker** — must be fixed before any broader beta or external sharing.
- **High** — important correctness/privacy issue that can wait days, not weeks.
- **Medium** — real issue but the project can ship with it.
- **Low** — code smell, doc gap, opportunity for improvement.
- **Confirm** — something you actively verified is fine (cite the file/line you looked at).

For each finding, give me:
- **File and line range** (e.g. `convex/vault.ts:279-288`)
- **What's wrong** (or what you confirmed)
- **Why it matters** (concrete failure mode, not "best practice")
- **Suggested fix or next step** (concrete, not "consider refactoring")

## Specific things I want you to dig into

Don't limit yourself to these — but if you only had time for some, do these first.

### 1. The three-gate model (commit `9246cb2`)

- Does `convex/vault.ts` apply the right gate at every consumer? Walk the call graph: search for every reference to `contextCoverage.entries`, `contextCoverage.count`, `aiEligibleEntries`, `publishableEntries` and verify each picks the right one.
- Is there a leak path where unfiltered `entries` reaches the public story surface? Trace `buildStoryBundle({publicView: true})` through `getPublishedStory` and `getPublishedStoryByIdentifier` into `app/stories/[id]/page.tsx`.
- Is the `publishableCount` fallback in `lib/stories/publishSafety.ts` correct? Specifically: if a caller passes neither `count` nor `publishableCount`, what happens?
- The same gate model is duplicated for `contextItems` (see `isContextPackEligibleContextItem` in `convex/vault.ts`). Is the semantic consistent? Should they share a gate predicate?

### 2. Media privacy logic

- `isPublicStoryMedia` in `convex/vault.ts` decides which media can appear on a public story page. Does it correctly respect `mediaNeedingPrivacyReview` flag and `rightsStatus`?
- Are FamilySearch portrait URLs (`person.portraitUrl`) ever surfaced publicly? The storage map says they should remain raw artifacts only.
- Does the OG image route (`app/stories/[id]/opengraph-image.tsx`) ever fetch or embed private media?

### 3. Owner isolation and guest vaults

- `proxy.ts` middleware sets `VAULT_PREVIEW_COOKIE` for guest vault ownership. Does every Convex query that takes a `vaultOwnerId` actually filter by it?
- Run `grep -rn "filterByVaultOwner\|vaultOwnerId" convex/` — are there queries that read across owners by mistake?
- The `/api/*` route handlers call `getVaultAccessContext()`. Are there routes that don't?

### 4. FamilySearch capture compliance

- The browser extension under `extension/` is meant to be user-initiated and paced. Is there any code path that captures without explicit consent click? Look at `extension/service-worker.ts` start conditions.
- The capture-package JSON gets imported through `/api/import`. Is the parser hardened against malformed input? See `scripts/check-capture-validation.ts` for what's already covered.
- Does anywhere in the codebase assume direct FamilySearch API access (which is **not** approved per `docs/importing/familysearch-source-capture-runbook.md`)?

### 5. Evidence vs. conclusion boundary

- Audit `convex/vault.ts` and `convex/vaultMutations.ts` for any place where source-backed facts and researcher conclusions can get conflated.
- The `sourceFacts` table is meant to live separate from `persons.birth`/`persons.death` until promotion. Is there a code path that silently promotes?
- Story Writer reads from the context pack — does the AI surface receive evidence and conclusions clearly labeled, or is the distinction lost in the markdown rendering?

### 6. Test honesty

- Are the contract checks in `scripts/check-*.ts` actually catching what they claim? Pick three at random and try mutating the source to confirm the check fails.
- Is there silent-pass risk in the structural integration checks (string-match against TSX) flagged in `scripts/check-story-slugs.ts`?
- The fixture suite under `tests/fixtures/stories/` drives `assessStoryPublishReadiness`. Are the fixtures realistic? Anything missing?

### 7. Convex query performance

- Are any queries doing N+1 reads? Look at `buildPersonOperations`, `buildStoryBundle`, `getOperationsQueue`.
- The audit page calls `buildPeopleRows(snapshot)` which iterates every person. At what scale does this fall over?
- Are there indexes the schema is missing for the queries we have?

### 8. SafeLink wrapper

- `components/layout/SafeLink.tsx` applies `suppressHydrationWarning` to every `<Link>` in the app shell. Does it correctly forward `ref`, handle `asChild`, pass through all anchor attributes? Is the prop-spreading order safe?
- Is the root cause of the hydration mismatch actually a browser extension, or could it be something else (date formatting, conditional `typeof window`)? Worth investigating before keeping the workaround.

### 9. AGENTS.md and operating rules

- Are the rules in `AGENTS.md` actually being followed by the commits on this branch?
- Is the verification baseline coverage adequate? Are there `check:*` scripts that should be required for specific kinds of changes?

## What I do not want

- **Don't recommend refactors for refactor's sake.** "Split this 1500-line file" without a concrete failure mode is noise.
- **Don't recommend new tooling or frameworks** unless something is actively broken without them.
- **Don't recommend scope expansion** — no "you should add OAuth", no "you should add a public API", no "you should add testing framework X." If you think a new dependency belongs, justify it with a concrete pain point in the current code.
- **Don't recommend changes to the five invariants** above without explicit, severe grounds. If you disagree with one, say so in a separate section, not as a finding.

## Output format

Structure your response as:

```
## Summary
1-3 sentences. Did `pnpm verify` pass on your machine? Top-line impression.

## Blocker findings
(or "None.")

## High findings
...

## Medium findings
...

## Low findings
...

## Confirmed-fine
List the things you actively checked and found acceptable. This is as valuable as the findings.

## Disagreements with prior decisions
(Where you'd have done it differently. Tell me which prior commit and why.)

## Things I should look at that you didn't get to
(What's outside the scope of your audit but you noticed in passing.)
```

Be specific. "The gate looks OK" is not as useful as "I traced `getPublishedStory` → `buildStoryBundle({publicView:true})` → `historicalContext: contextCoverage?.publishableEntries.slice(0,8)` and confirmed family_review entries are excluded; tested by inspecting the `publishableEntries` filter at `convex/vault.ts:294-302`."

Length: as long as needed. I'd rather you take 5,000 words than miss something.
