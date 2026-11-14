# Search performance and migration

MCP search previously matched substrings only in the newest 251 active records
per type. The new source-table search indexes cover people (primary/alternate
names, tags and FamilySearch ID), sources, stories, research tasks/findings,
events, places and topics. Indexed matching is word based, with prefix matching
on the final term, rather than arbitrary substrings. Empty queries still return
recent records. Results retain the existing kind priority and a maximum of 50
summaries; no per-hit hydration is needed. Owner and archive filters apply inside
the index before the result cap. Selected-people grants search only their explicit allowed person IDs using
substring matching; other record types are withheld. Hidden rows cannot affect
ranking, counts or the result cap.

`searchServer.ts` is a source-owned mutation adapter. Writers of these tables
must import their mutation builder from it, so insert, patch and replace update
`searchText` (and the person's normalized given-name key) atomically. Internal
migration writes derive the same fields. Do not change the generated builders.

Deploy through the normal coordinated Vercel production build. After backend
deployment, run the internal `searchBackfill:run` on **accomplished-dodo-308**.
It pages at most 200 records at a time with a 1 MB read budget, writes only derived fields
and progress, and returns `{ complete: true }` when all eight tables are done.
It can be rerun after interruption or an action timeout; it yields after eight
minutes when possible. Confirm all eight flags with `searchBackfill:status`. No real records are deleted, and original
fields and timestamps are preserved. Each table keeps the prior search path
until its completion flag is committed. Confirm completion before declaring
indexed search live. Do not point this at gallant-mallard-74: the production
operations guide documents that local binding as unrelated.

Source duplicate checks use owner/FamilySearch ID, owner/import key and
owner/URL/title indexes. After person backfill, name duplicate checks narrow by
owner, exact surname and normalized given name and compatible birth year (unknown, zero or the requested year) in
separate exact ranges, so a large same-name family does not need scanning. Ownerless records remain supported in the local
legacy vault. The historical surname fallback remains until migration is done.

## Remaining scale work

The website People explorer and several overview pages still assemble a full
vault snapshot. A 100,000-person/300,000-event vault exceeds Convex query limits
there; MCP indexing does not fix those pages. Replace their full-vault operation
and context calculations with maintained collection projections and pagination
in a separate change. The older internal `persons.search` also still scans all
people, but is not a publicly callable or website search path. The import UI is
FamilySearch record capture; no GEDCOM-tree import implementation was found.

Queries accept at most 16 terms; longer phrases receive a validation error.
