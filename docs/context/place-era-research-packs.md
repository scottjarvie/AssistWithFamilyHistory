# Place And Era Research Packs

Last updated: 2026-05-22

## Purpose

Place and era research packs give Story Writer and research operators responsible historical context around a person without turning general background into unsupported person facts.

The first useful pack type should be **Locality Era Brief**: a reviewed place or locality plus a narrow year window around a sourced event. This fits the current app because the vault already has:

- `places` with hierarchy and optional temporal descriptions;
- `events` with place/date links;
- `historicalContext` rows with `placeId`, `timePeriod`, `topic`, `content`, and `sources`;
- person context packs that include historical context when a person's places and life/event years overlap the context row.

## First Pack

Start with `locality-era-brief`.

Use it when a FamilySearch source, memory, or source-backed fact gives both a place and a date or date range. The pack should answer:

- what kind of place this was at the time;
- which daily-life, work, religion, migration, school, military, or civic systems shaped the setting;
- which public events or disruptions matter enough to mention;
- which statements are sourced historical context and which are AI or writer synthesis.

## Storage Model

Use the existing `historicalContext` table for the first implementation.

- `placeId`: the place the pack describes.
- `timePeriod`: the scoped year window for the pack.
- `topic`: the strongest topic bucket, such as `daily_life`, `migration`, `religion`, or `economy`.
- `title`: human-readable pack title.
- `content`: reviewed Markdown research report.
- `sources`: public URLs, archive references, books, or reviewed source notes used for the context.
- `packType`: typed research-pack kind, starting with `locality_era_brief`.
- `templateVersion`: explicit template version, currently `locality-era/v1`.
- `privacyLevel`, `reviewStatus`, and `aiUseAllowed`: gates that decide whether the pack can enter AI-assisted context packs.
- `categoryBlocks`: structured sections that separate source-backed summaries from story-safe synthesis notes.

Use `contextItems` for person-specific notes, private family material, unreviewed memories, or researcher conclusions that should not become broadly reusable place context.

Do not add a dedicated `researchPacks` table until the app needs multiple linked sections, pack versions, or per-pack review workflow. The typed templates in `lib/context/researchPacks.ts` are the contract for that future migration.

## Structured Metadata

The current implementation enriches `historicalContext` instead of creating a second storage surface:

```ts
packType: "locality_era_brief";
templateVersion: "locality-era/v1";
privacyLevel: "private" | "family_review" | "publish_candidate" | "public_source";
reviewStatus: "unreviewed" | "reviewed" | "disputed" | "redacted" | "rejected";
aiUseAllowed: boolean;
categoryBlocks: Array<{
  category:
    | "scope"
    | "place_summary"
    | "daily_life"
    | "institutions"
    | "migration_work_religion"
    | "evidence_limits"
    | "story_synthesis";
  summary: string;
  sourcedClaims: Array<{
    text: string;
    sourceRefs: string[];
    confidence: "high" | "medium" | "low";
  }>;
  synthesisNotes?: string;
}>;
```

Story drafts saved from Story Writer may record the eligible `historicalContext` IDs in `contextPackIds` so reviewers can see which background packs were available at generation time.

## Gate Semantics By Surface

The pack metadata gates apply differently to each surface. The AI context-pack export only includes research packs that are reviewed, non-private, and allowed for AI use; the public story page applies an even stricter publish gate; the human-facing surfaces (person workspace, vault audit, story publish-readiness signal, story workflow status) stay unfiltered so the reviewer can act on unreviewed and private rows.

| Surface | Filter applied | Where |
| --- | --- | --- |
| AI context-pack export (markdown and structured) | `aiUseAllowed === true` ∧ `reviewStatus ∈ {reviewed, redacted}` ∧ `privacyLevel ≠ private` | `isContextPackEligibleHistoricalContext` → `contextCoverage.aiEligibleEntries` |
| Public story page bundle | `privacyLevel ∈ {publish_candidate, public_source}` ∧ `reviewStatus ∈ {reviewed, redacted}` | `isPublishablePublicHistoricalContext` → `contextCoverage.publishableEntries` |
| Person workspace UI, vault audit, story publish-readiness signal, story workflow status | unfiltered | `contextCoverage.entries` / `count` |

The human-facing surfaces stay unfiltered on purpose: a reviewer needs to see unreviewed and private rows in order to promote, redact, or reject them. If those rows disappeared from the person workspace and audit, the review work the gate is built around would be invisible. The publish-safety check uses `publishableCount` when available so the public gate stays strict even though the count is unfiltered.

When adding a new surface that may consume historical context, choose explicitly: the AI gate, the public gate, or neither. Do not add a fourth filter at the data layer.

## Attachment Rules

Attach packs conservatively.

- To a place: store public or reviewed place context in `historicalContext.placeId`.
- To a person: expose only through context packs when the person has matching place coverage and overlapping life/event years.
- To a story: use as background context, not as evidence that the person experienced every condition described.
- To a source: source-backed facts stay in `sourceFacts`; context packs may explain the surrounding setting.
- To a private note or family memory: use `contextItems` with privacy and review fields first.

## Evidence Boundary

Research packs are not canonical person facts.

- A pack can say the town economy was shaped by mining.
- A person fact can say the person was a miner only when a source says so.
- A pack can say a migration corridor was common.
- A person story can say the person used that route only when a source supports it.
- AI synthesis must be labeled as synthesis and kept separate from source quotations, paraphrases, and source-backed facts.

## Privacy Boundary

Keep context public only when it is public history or reviewed archive context. Keep private by default when it contains:

- living people;
- recent family addresses or institutions;
- private memories, notes, or correspondence;
- sensitive religious, medical, displacement, or relationship context;
- unreviewed media or contributor metadata.

Story Writer may use reviewed packs for setting, constraints, and texture. It should avoid implying unsupported personal experience. Prefer careful phrasing such as "would have lived in a town shaped by..." when the connection is contextual rather than evidenced.

See `docs/operations/agent-handoff-runbook.md` for the broader review and handoff workflow that surrounds these gates.

## Template Catalog

The typed catalog is in `lib/context/researchPacks.ts` and currently covers:

- Locality Era Brief;
- Region And Era Context;
- Occupation And Work Context;
- Religion And Community Context;
- Migration Corridor Context;
- Building Or Institution Context;
- Local Event Context;
- Cemetery And Burial Context.

Each template must define required inputs, research questions, output sections, attachment rules, evidence boundaries, privacy notes, and Story Writer use rules.

## Implementation Follow-Ups

Further routes should:

- add a guided place workspace flow that can prefill Locality Era Brief sections from linked events and source facts;
- add explicit sourced-claim editing inside each category block instead of source lists only;
- show context-pack provenance and `contextPackIds` in story review screens;
- add a dedicated research-pack review queue if multiple operators start authoring packs in parallel.
