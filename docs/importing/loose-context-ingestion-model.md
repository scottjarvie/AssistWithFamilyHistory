# Loose Context Ingestion Model

Last updated: 2026-05-21

## Purpose

FamilySearch sources are only one part of the context needed for strong family-history stories. The vault also needs notes, journals, documents, cemetery details, building information, family memories, and research snippets without turning `persons.notes` into an unreviewable dumping ground.

This is a design boundary. Do not implement schema changes from this note until the follow-up implementation issues are accepted.

## Current Building Blocks

| Existing surface | Good for | Limit |
| --- | --- | --- |
| `sources` and `citations` | Evidence and provenance from records | Too source-shaped for personal notes and research snippets |
| `media` | Photos, scans, PDFs, audio/video links | Weak review/privacy metadata today |
| `documents` | Generated PS/CST documents | Not a general attachment model |
| `researchLog` | Activity history and outputs | Not granular enough for reusable context snippets |
| `researchTasks` | Next actions | Not source material |
| `historicalContext` | Place/time/topic context | Not person-owned loose material |
| `persons.notes` | Small internal note | Should not become the ingestion bucket |

## Proposed Conceptual Model

Introduce a future `contextItems` style model rather than overloading existing fields.

Suggested fields:

- `vaultOwnerId`
- `itemType`: note, journal_excerpt, document, cemetery_detail, building_detail, oral_history, research_snippet, image_note, transcript, other
- `title`
- `bodyMarkdown` or `artifactPath`
- `sourceKind`: user_entered, uploaded_file, family_memory, external_url, generated_summary, imported_provider
- `provenance`: author, createdDate, observedDate, capture/import ID, URL, citation, repository
- `privacyLevel`: private, family_review, publish_candidate, public_source
- `evidenceRole`: raw_material, researcher_conclusion, generated_summary, editorial_note
- `linkedPeople`, `linkedPlaces`, `linkedEvents`, `linkedStories`, `linkedSources`
- `reviewStatus`: unreviewed, reviewed, disputed, redacted, rejected
- `aiUseAllowed`: yes/no/review_required

## Attachment Rules

- Attach notes and journals to people only when the subject is explicit.
- Attach cemetery, church, building, workplace, migration, and local-history material to places or historical context when person linkage is indirect.
- Attach uploaded documents as raw artifacts first; extract citations or context items only after review.
- Keep researcher conclusions separate from raw transcripts and scans.
- Keep generated AI summaries linked back to their raw material and prompt/model metadata.

## UX Proposal

The first UI should be a simple review-first intake drawer or page:

1. Add material.
2. Choose item type and privacy level.
3. Link to people/places/events.
4. Mark whether AI can use it.
5. Save as unreviewed context.
6. Promote useful pieces into citations, historical context, story notes, or research tasks.

Do not bury this inside one text area on the person record.

## Follow-Up Issue Split

Recommended implementation issues:

- Add `contextItems` schema and owner-scoped queries/mutations.
- Add loose-context intake UI with privacy/review fields.
- Add artifact upload/local-file retention path for notes and documents.
- Add context-pack inclusion rules for reviewed context items.
- Add AI redaction and disclosure gates for loose context.

## Verification

Before implementation, confirm the data model against:

- `convex/schema.ts`
- `app/api/people/[id]/context-pack`
- Story Writer prompt construction
- Privacy and AI redaction checks
- Public story publish gates
