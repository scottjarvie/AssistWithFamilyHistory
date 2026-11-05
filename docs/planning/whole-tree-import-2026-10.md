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
For GEDCOM, `importKey` must identify one file and remain stable when resuming
that file. Its encoded value scopes every xref (people, facts, sources and
links), so `@I1@` in two files cannot silently identify the same person.

- Facts are keyed under their person: `KWCJ-RN4/<fact id>`. Send the
  FamilySearch fact id, or a stable name like `birth`, if a citation or note
  needs to point at the fact. A fact without a key gets one derived from its
  type, date, place and value.
- A citation without its own id is keyed by its source, page, targets and all
  accepted evidence fields (excerpt, URL, notes, quality and access date).
  Changed keyless evidence creates another citation; use an explicit key for
  intentional corrections to one existing citation.
- Globally stable `otherIds` on a person (such as FamilySearch or Ancestry
  ids) are remembered in their own namespace. GEDCOM xrefs are file-local;
  they cannot establish a cross-file identity. To link a GEDCOM person to an
  existing person, send that person's globally stable id in `otherIds`.
- People and sources captured earlier by the browser extension (which set
  `fsId`) are found by PID and linked, not duplicated.
- A couple or parent-child pair the person already entered by hand is found by
  its two people and linked.

### The update rule

- A later batch refreshes fields only while they still match the values the
  import last wrote (`updated`), or reports `unchanged`. Manual corrections,
  including cleared fields, are retained. Legacy rows without the optional
  import baseline retain populated fields conservatively.
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

### PR 86 repair verification — 1 November 2026

Four regression tests failed before the repair and passed afterward: living
people withheld from duplicate suggestions, complete rollback of a person row
when a later fact fails, manual corrections surviving reimport, and file-local
GEDCOM xrefs. Duplicate reads also filter historical suggestions if either
endpoint is now living. There is no dedicated person AI privacy review flag;
living people remain excluded from this suggestion path until that exists.

Rows use nested mutations, following `save_records`' rollback boundary. The
optional `mcpRecordKeys.lastImportedJson` baseline distinguishes unchanged
imported fields from later edits. No schema fields or tables were removed,
and uploaded originals are untouched. Main was brought in by a normal merge.

Verification: application tests, Convex tests (including the 300-person import),
typecheck, lint, production build, and all remaining verification contracts
passed locally. The optional 5,000-person stress test and authenticated/live
provider flows were not run. No screen changes, merge of this PR, or deployment.

## Import identity repair � 5 November 2026

Person/fact components are escaped independently in durable fact keys. Citation
and note fact targets use the same encoder. Fallback fact values and citation
targets are serialized as structured tuples before hashing, so delimiters in
outside IDs, places or text cannot impersonate tuple boundaries.

Ordinary explicit IDs retain their existing mapping when encoding is unchanged.
If the old composite differs and already exists, the importer returns
`LEGACY_IDENTITY_REVIEW_REQUIRED`. It keeps the original records and mappings;
it neither guesses a match nor silently rekeys, duplicates or deletes them.
This also applies in dry runs. Such a mapping needs owner review and a deliberate
repair before that row can resume; changing outside IDs to evade the refusal
would lose the original identity and is not a supported recovery. Other batch
rows can continue and operation replay remains unchanged.

This is source behavior, not a claim of deployed or provider-tested capability.

Generated facts and citations have dedicated durable lookup namespaces
(`factGenerated` and `citationGenerated`), separate from explicit outside IDs.
An explicit ID that spells a generated key therefore remains a distinct record.
Prefer a stable explicit key for facts or citations that other records reference.
Citation results report both `key` and `keyOrigin` (`explicit` or `generated`).
Use those values in a note's subject to name the intended citation. Fact targets
and note subjects also accept `keyOrigin`; a generated fact's local key is its
bounded `fact~` hash returned by `factReferenceKeyFor` (without a person
prefix). Supplying an explicit fact ID avoids needing to compute that fallback.
When `keyOrigin` is omitted, lookup succeeds only when the key resolves in one
domain; two different matches return `AMBIGUOUS_TARGET`, without guessing.
Generated citation keys hash the source ID, page, all accepted evidence fields
and sorted structured target tuples into a fixed-length key, so maximum-length
source IDs remain supported.
Field-specific links retain separate entries for each supported field, including
a whole-record link without a field. Repeating a batch adds no duplicate links.
Older rows without matching outside-ID evidence cannot be refreshed as explicit
IDs merely because a generated key happens to spell an incoming explicit ID.

Person context on the public MCP route now reads imported person notes through
the same bounded owner-filtered helper as the internal reader. Living-person
notes remain withheld. Dry-run planning also restores local and cross-chunk
planned identities when one item fails, matching the real nested transaction's
rollback boundary; dependent rows cannot succeed against a failed phantom row.

Dry-run chunk handoff carries a key-to-record-identity map, preserving aliases
and distinct new records across chunk boundaries. Chunk-scoped placeholder IDs
do not collide with placeholders from earlier chunks. Older keys-only internal
handoffs are refused if they lack identity mappings; restart the dry run instead
of guessing. Resending an already processed batch refreshes its records but
keeps the forward cursor and next batch index. Exact operation receipt replays
remain inert.

Generated fact identity includes the full structured date and place, value and
description as well as its type. Two keyless occupation descriptions or different
structured dates therefore remain separate assertions. Reimporting an explicit
fact reports its change or retained manual correction on the parent person row;
receipts keep unchanged rows when they carry `kept` conflicts.

Dry planning carries virtual documents and imported baselines as well as identity
maps between chunks. Repeated new or existing records are compared against the
prior planned version, with failed-item rollback restoring that state. This plan
is private internal state; only ordinary results are returned to the MCP caller.
A plan above the bounded byte budget refuses with `DRY_RUN_PLAN_LIMIT` and asks
for smaller dry-run batches, without saving records.

Generated fact identity keeps the original type string, including custom URI
namespaces and punctuation. Events also retain `importedFact` with the accepted
structured assertion, preserving empty values separately from descriptions.
People retain `importedNames`, including the preferred name classification,
and alternate nicknames remain in `alternateNames` as well.

When the compact batch receipt would exceed its size budget, it returns an
explicit `resultsTrimmed` notice and `resultDetails`, rather than dropping kept
conflicts silently. Pass `importJobId`, `resultsOperationId` from
`resultDetails.operationId`, `resultsChunkIndex` (initially 0) and `resultsOffset`
(initially 0) to `family_history_get_tree_import`. Each page returns at most ten
entries, expanding a row's retained conflicts one field per entry. Follow `next`
until null. Owner- and import-bound chunk receipts hold the original results;
replaying the batch returns the same retrieval pointer. Legacy receipts without
those details are explicitly unavailable, never fabricated.

Dry-run relationship equivalence consults planned relationships in addition to
stored relationships, so aliases link to one relationship and report retained
lineage/facts even when the people themselves are only planned.

Expanded chunk results are now byte-bounded before persistence. Large conflict
sets go into owner/import-bound detail receipts of at most 48 KB of entries;
the chunk receipt carries compact rows and page counts. Replay reuses those
pages, and result retrieval retains `keyOrigin` on ordinary and conflict entries.
This protects the [Convex document limit](https://docs.convex.dev/production/state/limits)
at the chunk write, before the later batch-summary budget is applied.

Virtual media and citations retain planned person/source IDs in their documents
and baselines. Duplicate suggestions use effective planned person values plus a
bounded persisted scan, including planned index moves. Large index adjustments
refuse the dry run explicitly rather than increasing scan cost without bound.

External-system labels are encoded as their own identity component. New import
mappings carry an optional encoding-version marker; ambiguous unversioned
system/key combinations refuse for review without linking or rekeying originals.
Safe existing mappings keep their keys. Dry relationship matching applies the
virtual overlay before accepting a stored candidate. New citation links count as
an updated outcome, and planned links participate in repeat detection.

Relationship planning also tracks original index positions. It overlays changed
rows, adds planned rows, and preserves the bounded index order before selecting
an equivalent relationship. Planned moves of either endpoint therefore do not
reuse an obsolete stored match; excessive index adjustments refuse a smaller
batch rather than producing a false prediction.

Unversioned fact mappings must verify both the outside fact ID and its owned
person/event link before use. Ambiguous encoded mappings refuse import without
rekeying originals. Person imports resolve every eligible alias before writing;
aliases identifying different people fail instead of choosing by input order.
Legacy FamilySearch PID lookup is owner-indexed.

Internal chunk and detail receipts use `treeImportReceipts`, keyed by owner,
import job, raw parent operation ID, numeric chunk and numeric detail index.
Caller operation IDs remain in `mcpOperations` and cannot collide with internal
receipts. Unambiguous legacy chunk receipts remain readable for resume; old
collisions refuse explicitly. The new private receipt table follows vault
ownership migration with the existing operational tables.

FamilySearch primary IDs, aliases and person references resolve importer mappings
and owner-scoped captured PIDs together. Neither source outranks a conflicting
identity. Dry planning applies the virtual person overlay and carries original
PID index positions across chunks, so planned changes do not hide disagreements.

Person aliases deduplicate against the primary canonical mapping key before
registration. Equivalent GEDCOM-prefixed system labels therefore create one
file-scoped mapping, preserving repeated imports and references.

Citation evidence conflicts fail the entire citation item before new links are
added. Partial refreshes and import baselines roll back with that item, retaining
original corrected evidence and links. Existing notes retain their subjects
during import, including when optional content is omitted. Failures name
the conflict for user review; neither changes an original identity.

Refreshing citation evidence must explicitly include every existing target,
including field-specific and manual links. Otherwise the item refuses and
rolls back; it never silently deletes links or applies new evidence to stale
targets. This check includes virtual links across dry-run chunks and uses a
bounded stored-link scan. FamilySearch source lookup and references use the
owner/PID index; conflicting mappings or duplicate owned identities refuse
without selecting, merging or rekeying an original.

Before adding citation links or refreshing evidence, the incoming record must
explicitly resubmit every substantive field retained in the stored citation.
Omitted excerpt, page, notes, URL, access date or known quality refuses the item
atomically. The default medium confidence means unspecified quality rather than
an outside quality assertion. Omitted quality preserves an existing rating.
Partial replays that change neither evidence nor links remain valid. New target
links are planned and deduplicated before any insertion or attribution change.

Creation defaults do not act as refresh values: omitted media personKeys/type,
source type and note noteType retain stored values and associations. Explicit
empty media personKeys still requests clearing imported associations, subject
to manual-edit preservation. Creation defaults remain part of the import
baseline so later explicit values can refresh them. Import person/relationship
fact dates accept the model range flag through public validation and storage,
including embedded birth/death dates; unrelated public date schemas stay strict.

A newly imported person whose sex is omitted stores unknown in both the record
and its imported baseline. Later explicit sex can refresh that default, while
actual manual corrections (including a later change back to unknown) remain
protected. Existing records do not acquire a new default during partial refresh.

Existing editedText is a human interpretation that the import interface cannot
confirm. Citations retaining it refuse evidence/source changes and new targets
atomically; unchanged replays remain valid. Real batches reserve the owner-wide
operation ID and request hash, job and batch index before the first chunk.
Every chunk and finalization validates that binding; completion replaces the
reservation in place. Dry runs never reserve or write. Older orphaned chunk
receipts are adopted only by their original job/request, preventing another
job or MCP tool from taking an interrupted operation identity.

Nested partial refreshes merge supplied leaves against their imported baselines,
retaining omitted details and protecting actual manual edits. Linked place and
record-reference objects stay atomic. Raw imported facts and embedded/event
projections retain omitted components; value-only refreshes retain descriptions.
Changed date text requires retained structured date metadata to be resubmitted
without manual conflicts. Conflicting duplicate fact identities within one
person refuse atomically; identical duplicates are idempotent. Public person
and relationship writers plus legacy Convex date/name validators preserve
imported range dates and alternate nicknames. Authorization is unchanged.

A date-text correction that cannot supply a replacement year refuses rather
than retaining an old inferred display/index year. Relationship facts merge
by exact type only when that identity is unambiguous: omitted nested details
and unmentioned facts remain, and manual deletions stay protected. Ambiguous
replacements require review; unchanged full replays remain valid. Retained
facts must be fully resubmitted before changing relationship endpoints/type,
and conflicting retained endpoints cannot receive newly changed facts.

Date projections preserve the effective structured year when a partial refresh
omits year, rather than reinferring from text. Supplied date components use
the effective protected values; omitted non-year components remain partial.
Relationship dates are merged and checked before inference. Changed text
requires every retained year/month/day/formal/range/approximate component,
including false flags; conflicting manual components refuse atomically.
Endpoint confirmation compares the supplied facts, not a preview that has
already retained conflicting manual values.

Relationship import baselines now distinguish proven inferred years from
explicit or unmarked legacy metadata. Text-only corrections can advance a
proven inferred year; manual, explicit, legacy and unparseable conflicts still
require complete-date review. Explicitly confirming the same year clears the
inference marker even without a document change. The marker stays internal to
import mappings and follows dry planning and resume. Legacy relationship
createCouple/updateFacts validators also retain imported date range metadata.

Media refresh cannot transfer an earlier privacy, rights or AI-use decision to
changed content or associations. Such an item refuses atomically with
MEDIA_REVIEW_REQUIRED, retaining the approved original, its baseline and
review decision. Unchanged replay stays valid; private/unreviewed references
remain refreshable and AI-ineligible. Every citation/note target, relationship
person and media/source association must resolve to an existing owned row,
including in dry planning. Stale mappings are retained for review, never
silently removed or redirected to replacement records.

A mapped FamilySearch person whose populated current PID contradicts the
requested PID requires identity review before importing or linking more
material, including fact-scoped citations/notes and external aliases. Neither
old mappings nor the corrected person are silently rekeyed. First-linked
records and new person aliases retain baselines only for import-written
fields; populated original fields remain outside refresh authority. Later
manual clearing of those imported fields stays protected across providers.

Relationship endpoints, type and lineage cannot refresh to different
attribution while any notes or citation links remain attached. The item
refuses atomically, including without embedded relationship facts; unchanged
replay and unattached identity refresh remain available. Attachment reads use
bounded subject/target indexes and include effective planning rows.
Joined-acceptance cleanup now includes notes in its existing bounded owner
scan and refuses when a note references the marked graph. It never deletes
notes or expands cleanup authority; inspect uses the same refusal.

The same bounded attachment guard now covers event assertions and media
content/associations independently of media review status. Refreshing an
attached explicit fact or replacing attached unreviewed media refuses
atomically; notes and citation evidence retain their original meaning. A
fact refusal rolls back its enclosing person item and all import baselines.
Unchanged replay and unattached refresh remain supported. Existing reviewed
media restrictions also remain; no attachments are removed or redirected.

Relationship fact changes and citation-backed note content changes now use
the same attachment refusal. Citation evidence/target changes also refuse
when explanatory notes would acquire different attribution. No old material
is deleted or reassigned. Subject contexts now include owner-indexed notes;
get_context accepts note, citation and reviewed AI-allowed media metadata.
Note previews give direct full-note IDs. The new direct kinds require the
existing whole-workspace boundary; selected-people/Queue grants stay narrow.
A bounded privacy walk withholds notes/new contexts for living, unapproved
media, restricted rights, missing/foreign references or excessive traversal.
notesWithheld makes that limit explicit; cycles still check all reachable
privacy constraints within the bound. Existing source/event/relationship
representations remain, with owned people filtered in the touched readers.

Citation privacy is shared by direct and aggregated MCP reads. Source
contexts filter citation payloads/links/claims; MCP person/story snapshots
are filtered before evidence groups and derived claims are assembled. Stored
records and ordinary owner review remain intact. Bounded filtering reports
citationsWithheld/citationReadTruncated. Citation-backed claims without an
aggregated citation row are checked separately within the same candidate
bound, and living source-fact associations also participate in the predicate.
Person assertion refresh checks retained person-field citations before
changing cited name/sex/living/birth/death fields. Unknown/unscoped fields
require review; explicitly unrelated fields may refresh. The entire person
item refuses atomically, preserving events, links and import baselines.

Source inline notes follow the same privacy decision as separate subject
notes. Unsafe inline text is omitted from source reads and nested source
objects in MCP person/story views, with explicit withholding flags; stored
notes and ordinary owner review remain intact. Repeated source IDs share
one privacy decision within an aggregate read. Source material changes
also refuse atomically when retained citations, notes, captured content,
claims, personas, media or typed connections would gain different attribution.
Unchanged replay and unattached refresh remain available.

Citation evidence refresh now also refuses when retained source facts would
inherit a different source or assertion, preserving accepted and other human
decisions and the source/citation invariant. The lookup is bounded through
by_citation and includes planning state. Unchanged evidence may still gain
a target without changing those source facts. Replay preserves semantic
results and reports deduplicated=true, distinct from a first execution.

Person blank fills now check bounded owner/record import histories when the
incoming identity has no authority over a field. A known prior import value
followed by an empty current field requires review before another identity
can refill it. This also covers an alias registered earlier without that
field, including dry planning across chunks. Other mappings are never
adopted as write authority; genuinely unpopulated fields may still be filled.
Acceptance cleanup now scans imports within its existing owner ceiling and
refuses deletion of any selected grant referenced by a surviving import,
including completed imports. It does not delete imports or broaden cleanup.


Citation/story and legacy event-note attribution follow-up (2026-11-05):
Changed citation evidence now refuses when an owned story retains its citation
ID, including drafts and reviewed/published stories. The owner-index scan is
bounded at 50 stories; more rows require review because absence of a reference
cannot be proved within that ceiling. Unchanged evidence can still gain a target.
Fact assertion changes also honor nonempty legacy events.notes, alongside
separate notes and citation links, with whole-item rollback. No notes, stories,
review history or originals are deleted or reassigned. Added 12 synthetic cases
for story states/source and excerpt refresh, bounded scans, owner isolation,
legacy event writer, replay, rollback and permitted refreshes. All remain UNRUN;
fixture review/publication metadata is in-memory setup, not real user proof.
No UI route/layout changes, provider calls, real database writes or deployment.
