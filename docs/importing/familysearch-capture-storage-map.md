# FamilySearch Capture To Vault Storage Map

Last updated: 2026-05-21

## Purpose

This is the storage contract for FamilySearch capture packages before bulk live capture resumes.

The current supported input is a user-mediated browser capture package from the Chrome extension. Direct FamilySearch provider API access is still pending and must not be assumed by agents, code, or import plans.

## Storage Classes

Use these classes when reviewing importer changes and writing regression tests:

| Class | Meaning | Merge posture |
| --- | --- | --- |
| Canonical vault data | The app treats this as part of the owner vault graph | Merge only after preview validation passes |
| Evidence/provenance | Source-backed text, URLs, citations, import metadata, and artifact links | Preserve; do not summarize away |
| Raw artifact | Original capture package or legacy evidence pack on disk | Keep lossless for audit and reprocessing |
| Provisional graph data | Possible people or relationships that are useful but uncertain | Create review objects; do not silently merge |
| Review-blocked/private | Living/private/admin/failed-expansion or identity-risk data | Require human review before use beyond storage |

## Capture Package Field Map

| Capture field | Current storage target | Class | Contract |
| --- | --- | --- | --- |
| `schemaVersion` | `importRuns.captureVersion`, preview report | Evidence/provenance | Must be `2.0` for native packages. Legacy evidence packs can enter compatibility mode only through `parseCapturePackage`. |
| `captureId` | `importRuns.captureId`, local run folder key | Evidence/provenance | Stable dedupe/audit key. Do not use as a person identity key. |
| `capturedAt` | `importRuns.capturedAt`, citation `accessDate`, local run ID seed | Evidence/provenance | Must parse and cannot be materially in the future. |
| `extractorVersion` | `importRuns.metadata.extractorVersion` | Evidence/provenance | Used to debug extension drift and fixture failures. |
| `extractionDurationMs` | Raw artifact only | Raw artifact | Do not merge into canonical vault. Useful for extension diagnostics. |
| `pageType` | `importRuns.pageTypes`, research log activity type | Evidence/provenance | Drives sources versus memories handling. Does not prove completeness. |
| `pageUrl` | `importRuns.sourceUrls`, preview report | Evidence/provenance | Must be a FamilySearch person page. Provider/API imports need equivalent source URL or request provenance. |
| `pageTitle` | `importRuns.metadata.pageTitle` | Evidence/provenance | Debug metadata only. |
| `uiLocale` | Raw artifact only | Raw artifact | Keep for later parsing/debugging. Do not canonicalize names/dates from locale assumptions alone. |
| `person.familySearchId` | `persons.fsId`, `importRuns.personFsId`, provisional relative anchors | Canonical vault data | Primary external person identity. Must be present before merge. |
| `person.name` | `persons.name`, `importRuns.personName` | Canonical vault data | Split into given/surname heuristically today. Identity mismatch should become a warning, not an automatic overwrite strategy. |
| `person.birthDate` | `persons.birth.date` | Canonical vault data | Header-level fact only. Source-indexed birth facts need evidence-backed extraction before updating this further. |
| `person.deathDate` | `persons.death.date`, `persons.living` inference | Canonical vault data | Missing death date marks `living: true` today; this is conservative and can create review work. |
| `person.portraitUrl` | Raw artifact only | Raw artifact | Do not auto-import as public media until privacy and rights review exists. |
| `sources[].id` | `sources.fsId` | Evidence/provenance | External source identifier when available. |
| `sources[].sourceKey` | `sources.importKey`, `citations.importKey`, event/relationship/provisional keys | Evidence/provenance | Main per-person dedupe key. Duplicate keys produce preview warnings. |
| `sources[].title` | `sources.title`, event descriptions, provisional source titles | Canonical vault data | Source type and event type are inferred from title. Keep original title. |
| `sources[].sourceType` | Source type classifier input | Evidence/provenance | Heuristic only. Do not treat as canonical without classifier coverage. |
| `sources[].citation` | `citations.extractedText`, `sources.notes` | Evidence/provenance | Preserve as evidence text. |
| `sources[].rawText` | `citations.extractedText` or `editedText`, `events.notes`, `sources.notes` | Evidence/provenance | Preserve; never replace with AI summary. |
| `sources[].webPageUrl` | `sources.url`, `citations.url`, outbound links | Evidence/provenance | Must parse when present. External record links remain evidence links, not crawl targets. |
| `sources[].date` | Citation page/date fallback, event date fallback | Evidence/provenance | Weak date signal; event-specific indexed fields win when available. |
| `sources[].indexed.fields[]` | Event inference, sex inference, related people/place extraction | Canonical plus provisional | Current extraction is label heuristic. Tests must cover known labels before widening auto-merge behavior. |
| `sources[].relatedPeople[]` | Existing FS IDs become `persons` and `relationships`; missing FS IDs become `provisionalRelatives` | Provisional graph data | Related people without FamilySearch IDs must stay provisional. Relationship role heuristics need review for ambiguous labels. |
| `sources[].placeMentions[]` | `places`, citation links, event place fallback | Canonical vault data | Place names are deduped by normalized full name. FamilySearch place IDs are not currently stored from captures. |
| `sources[].outboundUrls[]` | Raw artifact only today | Raw artifact | Do not auto-fetch outbound URLs. Promote selected URLs only through source/citation fields. |
| `sources[].tags[]` | `citations.notes` | Evidence/provenance | Tags are imported as notes, not canonical classifications. |
| `memories[].id` | `media.importKey` | Evidence/provenance | Per-person memory dedupe key. |
| `memories[].title` | `media.title` | Canonical vault data | Required for imported media rows. |
| `memories[].description` | `media.description` | Evidence/provenance | Preserve original text. |
| `memories[].mediaType` | `media.type`, `media.mimeType` | Canonical vault data | Classification is MIME-style heuristic. |
| `memories[].imageUrl` / `thumbnailUrl` | `media.url` | Evidence/provenance | Store link only. Do not assume rights to republish. |
| `memories[].memoryUrl` / `familySearchUrl` | `media.familySearchUrl` | Evidence/provenance | Store as source location. |
| `memories[].createdAt` | `media.date` when parseable | Evidence/provenance | Treat as memory artifact date, not necessarily historical event date. |
| `memories[].attachedBy` | Raw artifact only today | Review-blocked/private | Potential living/private contributor data. Keep raw until privacy policy exists. |
| `memories[].relatedPeople[]` | Raw artifact only today | Provisional graph data | Do not auto-merge memory relationships yet. |
| `memories[].placeMentions[]` | `places` only | Canonical vault data | Place creation happens, but no citation/media link exists yet. |
| `memories[].notes` | Raw artifact only today | Review-blocked/private | Preserve raw; do not auto-expose. |
| `placeMentions[]` top-level | Raw artifact only today | Raw artifact | Not imported globally yet. |
| `diagnostics.mode` | `importRuns.metadata.mode`, preview warnings | Evidence/provenance | `admin` mode requires explicit review. |
| `diagnostics.totalSources` / `totalMemories` | Preview warnings | Evidence/provenance | Count mismatches do not block by default but must be visible. |
| `diagnostics.expandedSections` | Raw artifact only | Raw artifact | Useful for extension QA. |
| `diagnostics.failedExpansions` | Preview/import warnings, research task | Review-blocked/private | Requires review before treating capture as complete. |
| `diagnostics.warnings[]` | Import warnings, review task description | Review-blocked/private | Warnings create high-priority review task after merge. |
| `diagnostics.errors[]` | Import warnings today unless validation blocks | Review-blocked/private | Fatal errors should block in validation before merge when represented by readiness checks. |

## Auto-Merge Rules

The importer may auto-merge:

- The primary person shell by `person.familySearchId`.
- Source containers by `fs-source:<personFsId>:<sourceKey>`.
- Evidence citations by `fs-citation:<personFsId>:<sourceKey>`.
- Event rows when the source title/indexed fields clearly imply a supported event type.
- Places by normalized full name.
- Related people and relationships only when the related person has a FamilySearch ID and the role is an obvious spouse, parent, or child.
- Memories as media rows by `fs-memory:<personFsId>:<memory.id>`.

The importer must not auto-merge:

- Related people without FamilySearch IDs.
- Ambiguous relationship roles.
- Memory related people.
- `attachedBy` or contributor data.
- Portrait URLs or memory images into public story surfaces.
- Top-level place mentions without a linking model.
- Source-indexed fields into canonical person facts beyond the current header birth/death fields without regression coverage.
- Any data from an admin-mode or warning-heavy capture without visible human review.

## Review And Follow-Up Gaps

These gaps should become implementation issues rather than hidden TODOs:

- Add regression coverage proving this map across capture fixtures and Convex mutation calls.
- Add a source-backed fact extraction layer before widening canonical person fact updates.
- Add explicit media/privacy review before republishing FamilySearch memory images.
- Add first-class links from memory place mentions and memory related people to media evidence.
- Add a provider-neutral intake envelope before adding GEDCOM, Ancestry, FindAGrave, or approved FamilySearch API ingestion.

## Verification

Run after changing this contract or importer behavior:

```bash
pnpm check:familysearch-readiness-contract
pnpm check:capture-validation
pnpm check:familysearch-capture
pnpm check:api-inventory
pnpm lint
```
