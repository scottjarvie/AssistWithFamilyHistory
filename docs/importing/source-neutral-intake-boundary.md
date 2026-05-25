# Source-Neutral Intake Boundary

Last updated: 2026-05-21

## Purpose

The app should not make FamilySearch the only possible intake provider. Future intake may include GEDCOM, Ancestry exports, FindAGrave, local files, user uploads, and approved provider APIs.

This boundary keeps FamilySearch behavior stable while defining what a second provider must match.

## Reusable Concepts

These concepts are reusable across providers:

- Subject identity with provider ID and local vault person ID.
- Source containers and citations.
- Evidence text and indexed fields.
- Related person mentions.
- Place mentions.
- Media/memory metadata.
- Import diagnostics and warnings.
- Raw artifact retention.
- Preview-before-merge.
- Provisional relatives and review tasks.

## FamilySearch-Specific Assumptions To Isolate

- FamilySearch person ID shape like `KWCJ-4XD`.
- `familysearch.org/tree/person/...` page URL checks.
- Extension pacing and expansion diagnostics.
- Source key format generated from FamilySearch source sections.
- FamilySearch source and memory URL semantics.
- Provider-specific privacy and contributor fields.
- Current `fs-*` import key prefixes.

## Provider-Neutral Envelope

A future provider-neutral intake envelope should contain:

- `provider`: familysearch, gedcom, ancestry, findagrave, local_upload, manual
- `providerRunId`
- `capturedAt` or `importedAt`
- `subject`: provider ID, display name, lifespan, identity confidence
- `sources`: provider source ID, title, type, URL/reference, evidence text, indexed fields
- `memories` or `media`: provider media ID, title, type, URLs, privacy/contributor signals
- `relatedPeople`: provider IDs when available, names, roles, evidence source keys
- `places`: provider IDs when available, original names, normalized names
- `diagnostics`: partial failures, count mismatches, parser warnings, provider warnings
- `rawArtifactRefs`

FamilySearch capture packages can be one adapter into this envelope. Do not replace the current capture package format until regression tests exist.

## GEDCOM Path

GEDCOM import should be treated as a separate parser adapter, not a FamilySearch capture variant.

Minimum work split:

- GEDCOM parser fixture issue with small, anonymized files.
- Provider-neutral envelope adapter for GEDCOM individuals, families, events, sources, notes, and media references.
- Preview UI that shows identity, merge, source, and privacy warnings.
- Merge implementation that uses the same canonical storage contract as FamilySearch.

## Non-FamilySearch Provider Guardrails

- Do not add a provider without fixtures.
- Do not merge provider relationships without identity/role confidence.
- Do not fetch external URLs automatically from imported data.
- Do not treat user-uploaded notes as source evidence unless provenance is provided.
- Do not publish imported media without explicit privacy/rights review.

## Follow-Up Issue Split

Recommended implementation issues:

- Add provider-neutral intake envelope types and fixtures.
- Add GEDCOM parser fixture suite.
- Add source-neutral preview UI labels.
- Add provider-specific dedupe key policy.
- Add rights/privacy review for uploaded and provider-linked media.

## Current Envelope Fixtures

The repo now includes a provider-neutral intake envelope contract in `lib/intake/envelope.ts`.

Fixtures:

- `tests/fixtures/intake/familysearch-envelope.json`
- `tests/fixtures/intake/gedcom-envelope.json`

The FamilySearch browser capture adapter is represented by `familySearchCaptureToIntakeEnvelope`. New providers should target the envelope first, then use a separate review/merge layer to write canonical Convex records.

## Verification

Run before and after provider-neutral intake work:

```bash
pnpm check:familysearch-readiness-contract
pnpm check:capture-validation
pnpm check:familysearch-capture
pnpm check:intake-envelope
pnpm lint
```
