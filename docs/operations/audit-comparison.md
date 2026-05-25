# Audit Comparison — Self vs Third-Party (2026-05-22)

Two independent audits run on `codex/foundation-route-long-hardening` using the prompt at `docs/operations/external-audit-prompt.md`.

- **Self-audit** (Claude — same agent that authored the branch). Report: `docs/operations/claude-self-audit-report.md`.
- **Third-party audit** (external auditor). Findings posted by Scott Jarvie 2026-05-22; reproduced in this doc.

## Headline result

Both auditors found Blockers. **Each found one Blocker the other missed.** Together they surface a substantially more complete picture of the branch's privacy/security posture than either did alone.

If you only act on findings from one report, take the third-party report's Blockers first — its T-Blocker-1 (public bundle leak) is more impactful than my B1 because it requires only a slug, not a function-name guess.

## Findings overlap matrix

| Finding | Self (me) | Third-party | Final state |
| --- | --- | --- | --- |
| Public story Convex query returns private internal bundle fields | **MISSED** | T-Blocker-1 | Filed as GEN-77 (Blocker) |
| Legacy Convex queries bypass vault ownership (50+ exports) | B1 (Blocker) | T-Blocker-2 | Filed as GEN-69 (Blocker) — agreement |
| Active script uses unapproved FamilySearch API (`scripts/enrich-tier2.ts`) | **MISSED** | T-High-1 | Filed as GEN-78 (High) |
| `isContextPackEligibleContextItem` ignores `aiUseAllowed` | H2 (High) | T-High-2 | Filed as GEN-71 (High) — agreement |
| `getVaultSnapshot` does full table scans; `by_owner` indexes unused | H1 (High) | T-Medium-1 | Filed as GEN-70 (High) — severity reconciled at High |
| `check:story-slugs` doesn't catch public-route regression (mutation-confirmed) | **MISSED** | T-Medium-2 | Folded into GEN-75 with expanded scope |
| Extension service worker doesn't enforce consent at start boundary | L1 (Low) | T-Medium-3 | GEN-74 severity upgraded Low → Medium per their framing |
| SafeLink workaround still broad / root-cause unknown | L3 (Low) | T-Low-1 | Filed as GEN-76 — agreement |
| API route protection check doesn't cover Convex functions | D2 disagreement | T-Low-2 | Filed as GEN-73 (Medium) — agreement |
| AI structured export ships unfiltered media | M1 (Medium) | **MISSED** | Filed as GEN-72 (Medium) |
| AI export `missingContextPlaces` uses unfiltered entries | M2 (Medium) | **MISSED** | Filed as GEN-72 (Medium, combined with M1) |
| No test that SafeLink suppresses warnings | L2 (Low) | **MISSED** | Filed as GEN-75 (Low) |

## Things I missed (and what they reveal)

### T-Blocker-1 — Public story bundle leaks unfiltered internal fields

This is the most important miss. I asserted in my "Confirmed-fine" section:

> Public story bundle uses strict `publishableEntries` gate.

This was technically correct **about historicalContext specifically**. But I read it as "the bundle is gated for public use" — implicit assertion about the whole bundle. In reality `buildStoryBundle({publicView: true})` only gates two fields (`media`, `historicalContext`). The other ~10 fields (`contextCoverage`, `reviewHistory`, `provisionalRelatives`, `researchChecks`, `publishWarnings`, `evidence`, full `relatedPerson` Docs, `readiness`) return unfiltered.

The lesson: when a function takes a `publicView` flag, audit the *entire return shape*, not just the fields the calling page destructures. The page only renders 8 fields, but the Convex response carries everything.

This was a generalization error — I extrapolated from one verified field to a whole bundle.

### T-High-1 — Active script with FamilySearch API access

I said in Confirmed-fine #7: "No code path assumes provider API access — `grep -rnE "FAMILYSEARCH_API|fs_api|fs-api|provider.api" app/ lib/ convex/` returns zero hits."

Three problems with that:

1. I grepped only `app/ lib/ convex/`. **I didn't grep `scripts/`.** The script lives outside what I checked.
2. My regex pattern (`FAMILYSEARCH_API|fs_api|fs-api|provider.api`) was wrong-shaped. The actual code uses `api.familysearch.org` URL and `FS_TOKEN` env var. Those don't match my pattern.
3. The third-party auditor found it instantly. Probably grep'd `familysearch.org` or `FS_TOKEN` — better keyword choices.

The lesson: when claiming "no code does X," exhaustively define what X looks like in this codebase before grepping. Pattern-match on the obvious surface terms (URLs, env vars, well-known function names) rather than abstractions.

### T-Medium-2 — `check:story-slugs` mutation-test gap

This is the embarrassing one for the GEN-63 sweep. I claimed that `check:story-slugs` was "already mostly behavioral" with structural integration assertions in the structural section. The third-party auditor proved by mutation that the structural integration is *incomplete*: swapping the public route's identifier query is not caught.

I should have run mutation tests on every structural assertion when I sweep'd them. I ran mutations on 3 of 24 check scripts, all randomly chosen; the random pick didn't hit this one.

The lesson: random sampling is insufficient for a tech-debt sweep about silent-pass risk. The whole point of GEN-63 was identifying silent passes. I should have run mutation tests on every check that did source-file grepping for behavioral content. That's ~5 scripts. Not exhaustive — but more than 3.

## Things they missed

### M1 + M2 — AI export ships unfiltered media + uses unfiltered missingPlaces

The third-party auditor focused on the structural/owner-isolation layer and identified problems at the response-shape layer (their Blocker-1). I drilled deeper into the AI export's internal structure and caught two specific privacy bypasses they didn't mention:

- `memories: workspace.media` (unfiltered, ignores `media.aiUseAllowed`)
- `missingContextPlaces: workspace.contextCoverage.missingPlaces` (unfiltered, misleads AI about coverage)

These are the same *family* of issue as their Blocker-1 (public-bundle leak) but at a different surface (AI export to the owner's own AI client, not public-render to anonymous). They get filed as Medium not Blocker because:
- The AI export is owner-initiated (the owner asked for their data)
- The opt-out flag exists at the right schema layer but the gate ignores it
- The audit gap is "your own AI sees data you opted out" — bad, but not "anyone on the internet sees your data"

### L2 — No test that SafeLink suppresses warnings

They confirmed-fine SafeLink behavior on inspection but didn't flag the absence of a regression test. This one's small but real: if `next/link` ever stops forwarding `suppressHydrationWarning`, every nav link starts logging warnings and no automated check catches it.

## Severity disagreements and how we reconciled

### `getVaultSnapshot` full table scans

- My severity: **High** (compounds the public-function leak privacy issue + performance)
- Their severity: **Medium** (mainly framed as performance scaling)
- Final: **High** (filed as GEN-70). I'm keeping mine — the privacy compounding is real. Even if their separate Blocker-2 (legacy public Convex queries) is fixed, owner-aware queries still pull cross-owner data into Convex memory before filtering. That's a defense-in-depth gap with privacy implications, not just performance.

### Service worker consent

- My severity: **Low** ("defense in depth")
- Their severity: **Medium** ("the compliance boundary should live at the service-worker start point, not only in UI state")
- Final: **Medium** (GEN-74 upgraded). Their framing is stronger. The popup is UI state that can be bypassed during dev/extension upgrades. The service worker is the actual capture-initiation boundary.

### Public-function exposure

- My severity: **Blocker** (B1)
- Their severity: **Blocker** (T-Blocker-2)
- Final: **Blocker** (GEN-69). Agreement.

## What both reports agree on

Both reports independently called out:

1. The Convex function visibility surface is the highest-impact open issue (filed as GEN-69 / GEN-77 collectively).
2. `aiUseAllowed` enforcement is asymmetric across `historicalContext` (correct) vs `contextItems` (silently bypassed). GEN-71.
3. `getVaultSnapshot` doesn't use `by_owner` indexes. GEN-70.
4. `pnpm verify` needs a Convex visibility contract check to prevent recurrence. GEN-73.
5. SafeLink root-cause investigation hasn't happened. GEN-76.
6. The three-gate model for historicalContext, as implemented in commit `9246cb2`, is correct for the rendered public page (no false-positive at that layer).
7. publishableCount fallback in `publishSafety` is correct.
8. Media public gate (`isPublicStoryMedia`) is correct.
9. FamilySearch `portraitUrl` does not leak to canonical storage.
10. OG image route uses only published story/person text preview.
11. Evidence/conclusion split is preserved in import + context-pack markdown.

## Audit prompt corrections to file (D2 → for next iteration)

Things to improve in `docs/operations/external-audit-prompt.md` based on this comparison:

1. **Move the Convex public-function visibility item from #3 to #1** in the "Specific things I want you to dig into" list. Both audits independently found this is the highest-impact area.
2. **Add an explicit ask to grep `scripts/`** in the FamilySearch compliance section. Both my self-grep and the documented intake boundary focused on app code; the script that violated the rule lived in `scripts/`.
3. **Mention response-shape audits separately from rendered-page audits.** The third-party auditor caught the public bundle leak because they audited the Convex response shape directly, not just what the React page renders. The prompt should explicitly ask "what does the Convex response contain, not just what does the React component destructure?"
4. **Ask for mutation tests on every structural integration check**, not random sampling. Better: ask the auditor to run a mutation test against each `check:*` script that uses source-file string-match.

(These corrections won't be made to the prompt this branch. File as a follow-up after the Blocker fixes land.)

## Recommended order of operations (combined from both audits)

Updated from the self-audit's plan:

1. **GEN-77** (Blocker — public bundle leak) — most-impactful, narrowest fix scope
2. **GEN-69** (Blocker — public Convex functions)
3. **GEN-78** (High — quarantine enrich-tier2.ts)
4. **GEN-71** (High — contextItems aiUseAllowed)
5. **GEN-70** (High — vault snapshot index use)
6. **GEN-72** (Medium — AI export media + missingPlaces)
7. **GEN-73** (Medium — Convex visibility check guardrail)
8. **GEN-74** (Medium — service worker consent)
9. **GEN-75** (Low/Medium — SafeLink test + check-story-slugs gap)
10. **GEN-76** (Low — SafeLink root cause)

Total estimate: ~5 hours for Blockers + High, ~2 more hours for Medium, Low when convenient.

## Audit summary table

| Auditor | Blockers | Highs | Mediums | Lows | Confirmed-fine | Disagreements |
| --- | --- | --- | --- | --- | --- | --- |
| Self (Claude) | 1 | 2 | 2 | 3 | 12 | 3 |
| Third-party | 2 | 2 | 3 | 1 | 8 | 1 |
| **Union (combined)** | **2** | **3** | **3** | **4** | n/a | n/a |

Combined: **2 Blockers, 3 Highs, 3 Mediums, 4 Lows** — 12 actionable findings. All filed.

Branch state remains: 31/31 verify steps pass, clean working tree, not pushed. The branch is **not** beta-safe until at least GEN-77, GEN-69, GEN-71 land.
