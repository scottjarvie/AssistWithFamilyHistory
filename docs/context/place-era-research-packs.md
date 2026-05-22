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

Use `contextItems` for person-specific notes, private family material, unreviewed memories, or researcher conclusions that should not become broadly reusable place context.

Do not add a dedicated `researchPacks` table until the app needs multiple linked sections, pack versions, or per-pack review workflow. The typed templates in `lib/context/researchPacks.ts` are the contract for that future migration.

## Future Structured Metadata

When this moves from contract to implementation, enrich `historicalContext` instead of creating a new storage surface first:

```ts
packType: "locality_era_brief";
templateVersion: "place-era/v1";
privacyLevel: "private" | "family_review" | "publish_candidate" | "public_source";
reviewStatus: "unreviewed" | "reviewed" | "disputed" | "redacted" | "rejected";
aiUseAllowed: boolean;
categoryBlocks: Array<{
  category:
    | "place_identity"
    | "era_overview"
    | "daily_life"
    | "occupation_economy"
    | "religion_community"
    | "migration_transport"
    | "buildings_institutions"
    | "local_events"
    | "evidence_limits";
  summary: string;
  sourcedClaims: Array<{
    text: string;
    sourceRefs: string[];
    confidence: "high" | "medium" | "low";
  }>;
  synthesisNotes?: string;
}>;
```

The context-pack query should only include research packs that are reviewed, non-private, and allowed for AI use when the destination is AI-assisted writing.

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

The first implementation route should:

- add a guided place workspace flow that can prefill a `town-era-context` report from linked events;
- show template labels in the Add Context Report form;
- add context-pack formatting that separates sourced context from AI synthesis notes;
- add Story Writer prompt language that treats packs as background unless source-backed facts support a person-specific claim.
