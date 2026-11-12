# Internal storage manifest

`storageCheck:manifestPage({ cursor: null, limit: 1..100 })` is a read-only
internal listing of stored media references for an operator storage check.
Continue with `nextCursor` until `isDone`, including across empty pages. Pages
read one source record, plus bounded indexed lookups for upload references.
A large retained history can span multiple pages. Source records use creation
order; object slots use their saved order. No schema or indexes are changed.

Coverage: `media` (Convex originals, B2 originals, copies, replacement history),
`mediaUploadSessions` (original slots, multipart originals and possible partial
image copies), and `uploadReservations` (Convex objects not already held by
media, once per storage id). Capacity-only reservations identify no object.
A session's saved media/history takes precedence over its pending locator.
Public B2 manifests have role `public` and a null charge owner. There is no
separate stored catalogue-object table in the current schema. Remote URLs and
local mirror paths are not managed provider objects.

Pending provider slots have null versions; partial copies have null sizes.
The schema retains neither exact failed-attempt versions nor individual
multipart-part object locators. Provider version/multipart listing must resolve
these unknowns; they must not be treated as zero or as a complete exact-version
inventory. A missing charge owner is null, never inferred from an object key.
No bucket names, titles, filenames, dates, locations, relationships, text,
capabilities or file contents are returned.

`revision` is a cumulative SHA-256 digest of the emitted reference metadata,
independent of page size. Only completed-pass revisions are comparable. Run two
complete passes from a null cursor and require matching terminal revisions
before accepting a result. A change behind the cursor is detected by the next
pass, not by the current prefix digest. This is not a global write counter,
and cannot detect a write reverted between observations. It adds no writes or
changes to the existing upload, cleanup or accounting paths.

`storageCheck:convexStoragePage` uses the same arguments and returns paged
`{ storageId, size }` system metadata with `nextCursor` and `isDone`. It reads
no stored file contents. Repeat that inventory as part of the two-pass check.
Both queries are internal only and have no website, HTTP or AI-tool wrapper.
