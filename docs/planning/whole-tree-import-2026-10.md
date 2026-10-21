# Whole-tree import through MCP (October 2026)

Status: implemented on branch `claude/familyhistory-20261021` (draft PR), not deployed.
Written 2026-10-21 by Claude (Opus 5.5) during an unattended run for Scott.

## What a person can do

A person asks their own AI to bring their family tree in. The AI is already
signed in to FamilySearch in the person's browser (or reads a GEDCOM file the
person gives it). It walks the tree (direct ancestors, their children and
descendants, cousins), and sends everything to Assist With Family History in
batches of up to 500 records. Thousands of people arrive with all their names,
facts, relationships, sources, citations, notes, photo references and
FamilySearch ids. If the walk is interrupted, the AI asks where it got to and
carries on. Running it again later refreshes the same records instead of
copying them.

Family History itself never signs in to FamilySearch, never stores a
FamilySearch password or session, and never calls FamilySearch. The AI reads
what the person can see; this site stores what the AI sends.

## Audit: what existed before this change

Read against GEDCOM 7 and GEDCOM X, from `convex/schema.ts`,
`convex/mcpFamilyHistory.ts` and `convex/httpRoutes/mcp.ts` at `6dfb0d6`.

| Concept (GEDCOM 7 / GEDCOM X) | Before | Gap for a whole tree |
|---|---|---|
| Person (INDI / Person) | `persons`: one primary name, sex, living, embedded birth and death, `fsId` | Fine for one person. No list of outside ids; only FamilySearch had a slot. |
| Names with types (NAME + TYPE / NameForm + type) | `alternateNames[]` with free-text `type` | Supported. No mapping from GEDCOM / GEDCOM X type names. |
| Facts and events with date and place (EVEN, BIRT, CHR, RESI... / Fact) | `events` + `personEvents` roles; 27 event types plus `custom` | Supported, but each MCP fact needed its own call or a `createKey` the AI invented. No outside fact id. |
| Couple (FAM HUSB/WIFE / Couple relationship) | `relationships` type `Couple` with dated facts | Supported. |
| Parent-child with lineage (FAM CHIL + PEDI / ParentChild + lineage) | `relationships` type `ParentChild` + `childRelationType` (Biological, Adopted, Step, Foster, Guardianship, Unknown) | Supported. FamilySearch's child-and-parents relationship has a lineage per parent; that maps to one ParentChild row per parent. |
| Sources (SOUR record / SourceDescription) | `sources` with repository, url, citationText, record date and place, `externalIds` | Supported. |
| Citations with page and quality (SOUR PAGE QUAY / SourceReference + qualifier) | `citations` with page, five-step confidence, extracted text; `citationLinks` to person, relationship, event or place | No GEDCOM QUAY mapping. Links could not point at a note or a media reference. |
| Notes on any record (NOTE / Note) | Free-text `notes` fields on some tables; `contextItems` for loose context | No note that can sit on any record, including one fact, with its own outside id. |
| Media references (OBJE / SourceDescription of a memory) | `media` with remote `url`, `personIds`, `familySearchUrl` | Supported as a reference. No outside id key. |
| External ids (REFN, EXID, FamilySearch PID / Identifier) | `persons.fsId`, `sources.fsId`, `relationships.familySearchId`, `sources.externalIds` | No common list on persons, relationships, events, citations, media. No way to find "the person whose Ancestry id is X". |
| Provenance of each import (HEAD SOUR / Attribution) | `creationProvenance` on persons, relationships, places and original-record tables; `importRuns` for single-person browser captures | No record of which bulk import touched a record, no session, no progress. |
| Batch write | `family_history_save_records`: one source page's worth (50 people, 50 relationships, 20 evidence items), per-item results, keyed by AI-invented `createKey` | Capped for a census page, not a tree. 5,000 people would be ~100 calls each needing hand-made keys, with no session, no cursor, no dry run. |
| Duplicates | `connections` relation `possibly_same_as`, state `proposed`; merging is on the never-permitted list | Nothing raised suggestions automatically. |
| Request size | 256 KiB per MCP request | Too small for 500 records with facts. |

The existing building blocks were sound: the evidence-versus-conclusion split,
replay-safe operation receipts, server-derived provenance, proposed-only
connections and the never-merge rule. The import is built on them rather than
beside them.

## What changed

### Schema (`convex/schema.ts`)

- `externalIds[]` (`{ system, id, url? }`) on persons, relationships, events,
  citations and media (sources already had it).
- `importJobId` on persons, relationships, events, sources, citations, media,
  notes and the duplicate-suggestion connections: the provenance of each
  import. `creationProvenance.method = "import"` marks records an import
  created.
- `events.creationProvenance` and `citations.creationProvenance` (they had none).
- New `notes` table: a note on any record (person, relationship, one fact,
  source, citation, media) via the shared record reference. GEDCOM NOTE.
- `citationLinks.targetType` adds `note` and `media`, so a citation can support
  any fact, note or photo as well as people, relationships, events and places.
- New `treeImports` (one resumable session per tree) and `treeImportBatches`
  (one activity row per batch, with failed rows kept).
- `persons` index `by_owner_surname_birth_year` for duplicate suggestions;
  `connections` index `by_import_job`.
- `mcpRecordKeys.recordType` adds `note` and `media`.
- All three new tables are in `OWNED_TABLES` (`convex/vaultMigration.ts`).

Every new field is optional, so existing rows stay valid. No data migration.

### MCP tools (`lib/mcp/catalog.ts`, `convex/httpRoutes/mcp.ts`, `convex/treeImport.ts`)

| Tool | Scope | What it does |
|---|---|---|
| `family_history_begin_tree_import` | `research:write` | Start one import session for a tree (`importKey`, `system`, label, root id, expected size), or resume the session with that key. Returns `importJobId`, `nextBatchIndex` and the saved cursor. |
| `family_history_import_tree_batch` | `research:write` | Up to 500 records per call: sources, persons, relationships, media, citations, notes. `dryRun`, `batchIndex`, `cursor`, `final`. Per-item results. |
| `family_history_get_tree_import` | `context:read` | Recent imports, or one import's progress per kind, the cursor, the last 20 batches with failed rows, and a page of possible duplicates. |

All three need a whole-workspace connection; a connection limited to selected
people is refused (`OUTSIDE_GRANT_BOUNDARY`). The MCP request ceiling rose from
256 KiB to 1 MiB so a full batch fits.

### How a record is keyed

Every record is keyed by its id on the outside site, namespaced by system and
kind: `ext:familysearch:person:KWCJ-RN4`. The key lives in `mcpRecordKeys`
(owner-scoped, indexed), so lookups are one index read.

- Facts are keyed under their person: `KWCJ-RN4/<fact id>`. Send the
  FamilySearch fact id, or a stable name like `birth`, if a citation or note
  needs to point at the fact. A fact without a key gets one derived from its
  type, date, place and value.
- A citation without its own id is keyed by its source, page and targets.
- `otherIds` on a person (an Ancestry id, a GEDCOM xref) are remembered in
  their own namespace, so a later import from that other system lands on the
  same person.
- People and sources captured earlier by the browser extension (which set
  `fsId`) are found by PID and linked, not duplicated.
- A couple or parent-child pair the person already entered by hand is found by
  its two people and linked.

### The update rule

- A record an import created takes the newer outside values on a later batch
  (`updated`), or reports `unchanged`.
- Anything else (the person typed it, or an older capture made it) is never
  overwritten. The import fills only its blank fields and names every field it
  left alone in `kept`. That is how "Grandma" stays "Grandma" even when
  FamilySearch says "Erzsébet".
- Outside ids are always merged in, never replaced.

### Batches, chunks and resuming

- One call carries at most 500 records. The server cuts it into
  transaction-sized chunks in dependency order (sources, people, relationships,
  media, citations, notes), each chunk one Convex mutation with its own replay
  receipt (`operationId#n`). Rows inside a batch may point at people sent
  earlier in the same batch.
- A row that cannot be saved comes back `failed` with a code
  (`MISSING_PERSON`, `MISSING_SOURCE`, `MISSING_TARGET`, `VALIDATION_ERROR`,
  `CONFLICT`) and what to do. The rest of the batch saves.
- Sending the same `operationId` again replays: finished chunks return their
  receipts, unfinished ones run, nothing is counted twice.
- `batchIndex` must be `nextBatchIndex` or an earlier one (a resend). A gap is
  refused with the expected number. The AI's own `cursor` (where it is in its
  walk, up to 500 characters) is stored with each batch and returned by
  `begin` and `get`.
- `dryRun: true` runs the same code with a writer that changes nothing and
  returns what a real send would do, including in-batch references.
- Each batch writes one `treeImportBatches` row and one `agentActivity` row
  ("batch 7: 480 created, 20 updated, 0 failed, 3 possible duplicates"), so the
  connection centre shows the work.

### Duplicates are suggestions

When an import creates a person, the server looks for people in the vault with
the same surname, the same first given name (folded for accents and case) and
a birth year within two. Each match (up to three) becomes a proposed
`possibly_same_as` connection with its reason. Nothing is merged; merging stays
on the never-permitted list. `family_history_get_tree_import` pages the
suggestions with a link to the person's page.

Known limit: the surname match is exact (after trimming) and people without a
birth year are not checked. FamilySearch trees often hold genuine duplicates of
their own; those are suggested too, which is what the person would want.

### Privacy

Imported people, notes and media references are private like everything else.
Living people come in marked living, and their notes stay out of AI context
reads (the `context:read` promise). Media arrives as a reference only: the URL
is FamilySearch's own and only the person's signed-in browser can open it. No
bytes are fetched, so the Backblaze media path is untouched.

## How an AI should run an import

1. `family_history_get_brief`, then `family_history_begin_tree_import` with an
   `importKey` such as `familysearch:<root PID>` and `system: "familysearch"`.
2. Walk the tree. For each batch: sources first, then people, then the
   relationships, media, citations and notes that point at them. Optionally
   send the first batch with `dryRun: true`.
3. Send `batchIndex = nextBatchIndex` and a `cursor` that would let you resume
   (for example "generation 6 done; next PID LZX4-9QP").
4. Resend failed rows in a later batch once what they point at exists.
5. Set `final: true` on the last batch, then tell the person how many people
   arrived and how many possible duplicates are waiting for them.

## How this was checked

`convex/treeImport.test.ts` runs the real handlers in `convex-test` against a
deterministic synthetic tree (`lib/treeImport/syntheticTree.ts`): ten
generations of ancestors plus collateral lines, with typed names, GEDCOM and
GEDCOM X fact types, lineage, sources, citations with quality, notes on people,
facts and couples, and photo references. Each run asserts every record lands
with zero failed rows, one activity row per batch, citation links on facts,
lineage on every parent-child row, and the saved cursor.

- `pnpm test:convex` (inside `pnpm verify`) imports a 300-person tree with
  Convex's real per-transaction limits enforced, so every chunk is proven to
  fit, plus idempotent re-import, operationId replay, dry run, resume and batch
  gaps, missing-person rows, a hand-entered person who is linked and not
  overwritten, duplicate suggestions, cross-system ids, and the
  selected-people refusal.
- `pnpm test:tree-import-5k` imports the full 5,000-person tree in 500-record
  batches, also under transaction limits. `convex-test` answers every query by
  walking every document in the database, which makes a 100,000-row vault
  quadratic (hours), so this run uses `vitest.treeimport.config.ts`, which
  gives the in-memory store a per-table document index. Production Convex
  uses real indexes and is unaffected.

No live deployment was touched.

## Follow-ups (not in this change)

- **People list and person page for imported data.** The signed-in UI shows
  persons, relationships and events today. Notes and the duplicate suggestions
  have no screen yet; a "Possible duplicates" review list on the person page
  is the natural next card.
- **Import progress in the app.** A small "Imports" panel (from
  `treeImports`) on `/app` or the connection centre.
- **Deletion and export.** When account export and deletion land (shell-pages
  work), they must include `notes`, `treeImports` and `treeImportBatches`.
- **Places.** Imported places stay as text (`place.original`). Turning them
  into the hierarchical `places` table is a separate, careful pass.
- **Live proof.** One real FamilySearch walk of a small branch by Scott's own
  AI, after deploy.

## Needs Scott

- **FamilySearch terms.** FamilySearch's terms of use limit automated access to
  its site. The person's AI reading their own tree in their own signed-in
  browser is the person's own action, but a fast automated walk of thousands of
  pages could still trip FamilySearch's rules or rate limits. The approved
  route for scale is the FamilySearch API with an app key. Recommendation:
  describe the import as "your AI, in your browser, at a human pace" on `/ai`,
  and decide whether to apply for FamilySearch API access later.
- **Living people.** A full tree brings in living relatives (cousins, their
  children). They stay private and out of AI context notes, but they are now
  stored. Confirm that is acceptable, or say if living people should be
  skipped by default.
