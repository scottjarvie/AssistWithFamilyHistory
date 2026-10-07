---
id: AWF-WO-018
title: Make media work the way family photos, scans and recordings need
execution: proposed
audit: not-audited
cards: AWF-0065, AWF-0066, AWF-0067, AWF-0068, AWF-0048
created: 2026-10-06
updated: 2026-10-06
proposed-by: Claude (Opus 5.5) from Scott's site-guide and readiness request
---

## Goal

One private upload path for every file of any size and phone format, complete
deletion, an AI that can see every photo, and pages that show family media well.

## Why this bundle exists

The AI upload path and B2 storage are proven; the person's uploads, deletion,
large files, HEIC, viewers and portraits are not. This follows on from AWF-WO-012
under media standard 1.8.0 (WO-012 was planned against 1.4).

## Current truth

See AWF-0065 to AWF-0068 and the Site Guide's media snapshot.

## Sequence

1. Confirm the live upload size limit with a synthetic 8 MB file.
2. Direct-to-B2 uploads for person and AI, HEIC/TIFF intake, storage counters,
   migration of Convex media (AWF-0065).
3. Deletion and replacement fix (AWF-0066).
4. AI reading at any size, regions, contact sheets, error names, `/ai.txt`
   guidance (AWF-0067).
5. Viewer, portraits, source and place scans, phone capture, upload recovery
   (AWF-0068), with the Sources pages from AWF-WO-016.
6. Media-to-story lifecycle proof with a real client (AWF-0048).
7. Close or re-baseline AWF-WO-012 with its remaining proofs.

## Dependencies

- AWF-WO-015 for the Source ↔ File shape.
- B2 credentials and CORS settings already provisioned for production.

## Exclusions

- No public media bucket, no Pro-gated processing, no FamilySearch memory
  mirroring.

## Stop rules

Stop if a migration cannot prove every byte moved and every old copy is
accounted for.

## Verification

Media tests; `pnpm verify`; live phone uploads (Android and iPhone) on apex and
www; deletion re-query with zero residue; real-client read of a large scan.

## Human gates

Scott's approval; any change to B2 bucket settings or lifecycle rules is
executor work under existing access, but new paid storage tiers are Scott's.

## Execution evidence

None yet. Proposed on 2026-10-06; Scott approves scope before it becomes Ready.

## History

- 2026-10-06: Proposed from the Site Guide draft and the MCP, media and page audits.
