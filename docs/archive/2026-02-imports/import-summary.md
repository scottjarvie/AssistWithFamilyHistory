# Discover Their Stories — Data Import Status

**Last updated: 2026-02-17**

## Database Totals

| Table | Count | Notes |
|-------|-------|-------|
| persons | 251 | All with FamilySearch IDs and notes |
| places | 326 | From 8-gen ancestry pull |
| relationships | 372 | 250 parent-child + 122 couple |
| sources | 3,228 | Properly titled and typed |
| citations | 3,249 | All linked to persons |
| citationLinks | 3,249 | source → citation → person |
| media | 617 | Unique memories (photos, docs, scans) |
| notes | 168 | Merged into person records |

## Source Type Breakdown

| Type | Count |
|------|-------|
| vital_record | 1,755 |
| church_record | 546 |
| other | 424 |
| census | 359 |
| website | 81 |
| immigration | 26 |
| obituary | 14 |
| military | 12 |
| book | 7 |
| newspaper | 4 |

## Import Scripts (in order)

1. `scripts/import-ancestry-json.ts` — Tier 1: persons, places, relationships
2. `fetch-all-tier2.sh` (in research dir) — Download raw sources/memories/notes JSON
3. `scripts/fix-sources-import.ts` — Update sources with titles/types/citations
4. `scripts/import-citations.ts` — Create citations + person links
5. `scripts/import-memories.ts` — Import memories to media table

## Raw Data Files

All at `~/clawd/research/family-history/`:
- `gedcom/ancestry-8gen-raw.json` — 2.5MB, 255 persons
- `sources/*.json` — 254 files, ~3,300 source records
- `memories/*.json` — 254 files, ~860 memory records  
- `notes/*.json` — 254 files, ~170 note records

## Re-running

Token expires every ~15-30 min. To re-fetch:
1. Log into FamilySearch via browser (Church Account SSO, username "jarvie")
2. Extract `fssessionid` cookie
3. Run `fetch-all-tier2.sh <token>` (skips already-downloaded files)
4. Run import scripts in order above
