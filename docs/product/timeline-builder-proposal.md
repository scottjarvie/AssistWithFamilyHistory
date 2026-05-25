# Timeline Builder — Proposal (GEN-24)

Status: proposal awaiting PM decision
Date: 2026-05-25
Linear: GEN-24

## TL;DR

The vault already contains every piece of data Timeline Builder needs: typed events with dates, places, source-backed citations, and overlapping historical-context reports. A first cut is mostly UI work over an existing query path. Two product modes are on the table; one must be chosen before implementation starts.

## Data the vault already has

| Source | What's there | Where |
| --- | --- | --- |
| `events` table | 16 typed event kinds (birth, death, burial, marriage, immigration, census, residence, occupation, military, ...) + optional date object + place link | `convex/schema.ts:213` |
| `personEvents` link table | Connects person ↔ event with a role (primary/witness/etc.) | `convex/schema.ts:283` |
| `historicalContext` table | Place + year-range context reports (post-GEN-60) | `convex/schema.ts:1117` |
| `citations` + `citationLinks` | Source citations attached to events, with `isEvidence: true|false` | `convex/schema.ts:427` |
| Workspace pre-builds a timeline | `assemblePersonWorkspace` already returns `timeline: events sorted by date` | `convex/vault.ts:837` |

The piece that doesn't exist yet: a UI that renders this in chronological order with overlap badging for citations and context reports.

## Two modes — PM decision needed

### Mode A: Research mode

- **Audience**: the operator working a vault.
- **Emphasis**: gaps. A 12-year stretch with no events between marriage and the first census shows as "research gap, possible missed record." Date precision is shown (year only vs full date). Each event row carries a "weak/strong evidence" indicator from citation `isEvidence` + confidence.
- **Surface**: lives at `/app/people/[personId]/timeline`. Linked from the person workspace; reads `getPersonWorkspace`.
- **Output**: prompts (`Search for a Pennsylvania census between 1880 and 1900`) that can feed back into the research tasks queue.

### Mode B: Story mode

- **Audience**: writer + family viewer.
- **Emphasis**: narrative arc. Events grouped by life phase, with reviewed historical context (the publish-gated subset) overlaid as setting cards. Hides events with weak evidence (or marks them quietly).
- **Surface**: lives at `/app/people/[personId]/timeline-story` (or as a tab on the Story Writer). Could be the seed of a public story-page timeline component much later, but not in v1.
- **Output**: a printable/copyable narrative arc the writer can use as a structural outline.

Both modes share the same data query; they differ only in filter rules and visual treatment.

### Recommended start

**Mode A first.** It uses existing data without any new gating (operator-only surface, no public risk), produces a research-task output that integrates with existing routes, and the visual treatment is simpler. Mode B can layer on top once the research surface is solid.

## Smallest viable MVP (if Mode A picked)

A single page at `/app/people/[personId]/timeline` that:

1. Fetches `getPersonWorkspace`.
2. Renders `workspace.timeline` (already sorted) as a vertical list.
3. For each event:
   - icon + type label
   - date (with precision indicator)
   - place name + link to place workspace
   - citation count + "weak"/"strong" indicator from `isEvidence` / confidence
   - overlapping historical-context entries from `contextCoverage.entries` (year range intersects)
4. Insert gap rows between consecutive events with a delta > 5 years. Each gap row has a "Suggest research tasks" button that creates `researchTasks` entries.
5. No editing. No charts. No multi-person view. No public surface.

Estimated effort: **1-2 days** for the page + 0.5 day for the gap-detection helper + 0.5 day for the research-task creation button.

## Privacy / gating notes

- All data the page reads is owner-scoped via `getPersonWorkspace` (post-GEN-70). No new gates needed.
- The `contextCoverage.entries` shown next to events is the unfiltered set — appropriate for the operator-facing surface (matches the gate-semantics doc).
- No public-facing version in v1, so no publish-gate work needed.
- Adding event annotations (e.g. "private note") to the timeline would require respecting `aiUseAllowed` if AI surfaces ever consume the rendered timeline — out of scope for v1.

## Open questions for PM

1. Mode A or Mode B first? *Recommended: Mode A.*
2. Should gap-detection automatically create `researchTasks` entries, or just suggest them with a click? *Recommended: click-to-create.*
3. Should the timeline link from the Story Writer (Mode B affordance) or only from the person workspace (Mode A)? *Recommended: person workspace only in v1.*
4. Do gaps respect the existing `criticalMissing` checks (biography, relationships, timeline, birth/death) or use a fresh heuristic? *Recommended: respect existing checks; the timeline surface complements them.*

## Acceptance criteria for the eventual implementation

- New page renders correctly on `KWCJ-4XD` against local dev vault.
- `pnpm verify` passes with a new fixture covering at-least-one-gap scenario.
- Gap-detection helper unit-tested via `scripts/test-*.ts` pattern.
- Sidebar nav swaps from "Coming Soon" badge to active link.
- No public route; no new Convex query (uses existing `getPersonWorkspace`).

## Why this is a high-leverage next route

- **Existing data**: everything Timeline Builder reads is already in the vault and already gated. Zero schema migration.
- **Discovers research gaps**: pushes the user toward the next concrete research task, fueling the rest of the workflow.
- **No public-surface risk**: operator-only in v1, so doesn't need a new privacy gate.
- **Foundation for Story Writer enrichment**: Mode B can layer in later without re-doing the query.
