# Family History MCP and evidence-media adoption

**Status:** Proposed product-specific implementation brief
**Date:** 2026-08-30
**Repository baseline:** `origin/main` at `01a6e743ca99b6aabf31975c31009146383eaa87`
**Tracker:** AWF-WO-012 and AWF-0046 through AWF-0048
**Family inputs:** `assist-with-life` commit `ee63aaf`, especially
`planning/assist-media-storage-standard.md`,
`planning/mcp-connector-playbook.md`,
`planning/bring-your-ai-mcp-oauth-standard.md`, and
`planning/personal-ai-success-scenarios.md`

This program extends AWF-WO-011. It does not reopen that Work Order's grant,
tool, Queue, or review decisions, erase AWF-0045's deployed Convex-byte work, or
claim that Family History already conforms to the family B2 standard.

## Outcome and product split

**Assist With Family History is the person's private, source-grounded family
history vault and research-to-story record; the person's chosen AI searches,
compares evidence, identifies uncertainty, and drafts sourced proposals and
stories inside the exact people, source, and work boundary the person granted.**

Family History owns identity, living-person protection, durable people and
relationships, source/citation/media provenance, claims and conflicts, Queue
state, review and rights decisions, grants, audit history, and final human
authority. The AI owns research, comparison, synthesis, and drafting. It may
propose a conflict resolution; only the person settles it. It never publishes a
story, merges identities, changes access, or acts in FamilySearch on its own.

## Current, Partial, and Later truth

### Current in `origin/main`

- The stateless OAuth MCP has fourteen namespaced `family_history_*` tools plus
  twelve compatibility aliases, six person-approved scopes, server-derived
  ownership, record boundaries, immediate revocation, Queue work, batch record
  saves, a complete-result save, correction, and generated setup guidance.
- `family_history_get_evidence` retrieves bounded batches of source-grounded
  text and real stored bytes. It uniformly gates owner/boundary reach, review,
  `aiUseAllowed`, rights, living-person context, item size, and total response
  size.
- AWF-0045 added person-facing upload of scans, photographs, PDFs, transcripts,
  recordings, and video into private Convex file storage. New or replaced bytes
  are Private, unreviewed, and unavailable to AI until the person reviews rights
  and explicitly allows AI use.
- Reference-only FamilySearch media remain honest `BYTES_NOT_AVAILABLE`; capture
  is user-mediated and the product does not retain FamilySearch credentials.
- `lib/storage/objectStore.ts` is an unused public-URL B2 helper designed for
  public media. It has no caller and is not a safe private evidence foundation.

### Partial

- Convex Storage makes reviewed evidence readable, but rows do not carry the
  family B2 exact-version/hash/derivative manifest, durable upload sessions,
  checksum-bound operation identity, or all-version cleanup proof.
- The connection can read reviewed files but cannot upload evidence through an
  MCP `begin -> direct PUT -> finish` path. Normal files therefore cannot move
  from a byte-capable chosen AI into the vault without a person repeating the
  upload.
- Images are delivered as stored. The current path does not prove full image
  decode, GPS/EXIF/XMP stripping for normal renditions, provenance extraction,
  sealed derivatives, or source-exact archival-original policy.
- Source/deploy and a disposable protocol client exist, but no named AI client
  has proved the complete current research-to-story media lifecycle.

### Later under this Proposed program

- Dedicated encrypted private B2 storage for family-history evidence, with
  Convex authority, exact source and rendition manifests, provenance, review,
  idempotent sessions, revocation, and exact cleanup.
- Connected-AI evidence upload tools around the same gates as person upload,
  followed by person review before any later AI retrieval.
- Product-native batch handling for scans/photos, PDFs/transcripts, and recorded
  interviews without exposing provider URLs.
- One source-grounded deceased-ancestor scenario through a real compatible
  client, UI review, replay/revoke, and zero-residue cleanup.

## Family History media decisions

1. **Private is the only visibility in the first tranche.** Living-person
   media, raw captures, notes, interviews, and unresolved evidence are private
   by default. Trusted, Unlisted, and Public retain the family meanings but are
   not added here.
2. **Public story media is a separate human publication program.** If later
   approved, it uses a rights-reviewed cleaned derivative and explicit
   attachment selection. Publishing a story never publishes its sources or
   attachments automatically.
3. **A file is evidence, not truth.** Uploading never confirms a person,
   relationship, event, fact, conflict resolution, identity merge, story, or
   FamilySearch change.
4. **AI uploads still wait for person review.** Finish may create an attributed
   Private, unreviewed item and link it to the AI's draft/result. It cannot set
   `reviewed`, `aiUseAllowed`, rights approval, public visibility, or final fact
   authority. The AI may describe the file it already handled; future retrieval
   remains blocked until the person reviews it.
5. **Preserve archival evidence and safe working renditions separately.** For a
   source artifact whose exact original matters, retain the source-exact bytes
   in a separately authorized archival role with hash and provenance; extract
   useful metadata into structured provenance; use a GPS/EXIF/XMP-clean sealed
   working original and derivatives for normal UI and AI delivery. Ordinary MCP
   authority never retrieves the restricted archival original.
6. **Person, source, citation, story, and work links remain many-to-many.** A
   media item has one owner but may support several people, claims, citations,
   or story sections. The control plane records each relationship; storage keys
   do not encode family names or relationships.
7. **Evidence write is a separate opt-in scope.** Add
   `family_history:evidence:write`; do not hide file creation inside research
   proposal, story draft, or the default grant. Uploading sensitive family
   evidence is different authority from saving an attributed text proposal.

## Storage and control-plane contract

Convex remains authoritative for verified owner, granted people/work boundary,
media relationships, living status, privacy, review, AI-use permission, rights,
provenance, upload session, operation identity, exact B2 manifest, retention,
deletion, and audit. B2 stores encrypted bytes only. Provider credentials and
raw object URLs never reach the browser or AI.

Do not extend the current public-URL `objectStore.ts` helper into the private
path. Build or adapt a server-only private provider seam that fails closed when
bindings are absent and uses opaque collision-safe keys. Provider topology,
keys, CORS, encryption, and lifecycle are separately configured and proved;
this brief does not create them.

The upload lifecycle is:

1. `family_history_begin_evidence_upload` re-resolves the active
   `family_history:evidence:write` grant, verifies
   the approved people/work boundary and target record relationships, validates
   supported type and size, and binds `opId + expectedSha256 + length + type +
   target links + provenance declaration` into one durable session.
2. It returns one session-bounded presigned PUT and required headers. A byte-
   capable client uploads the real file without base64 passing through model
   text.
3. `family_history_finish_evidence_upload` rechecks the current grant and
   target reach, verifies actual length/hash/type and complete decode, creates
   source-exact and safe-working manifest roles where required, and atomically
   creates or attaches one attributed Private, unreviewed media record with
   `aiUseAllowed: false`.
4. Same operation and bytes replay the original result. Changed bytes conflict.
   Permanent failures are terminal and clean their exact attempts. Concurrent
   finishes and superseded versions never delete a committed manifest.
5. Person review remains an ordinary signed-in product mutation unreachable by
   MCP. Only after review, rights approval, and AI-use approval may
   `family_history_get_evidence` deliver the safe permitted rendition.

Inline bytes are optional only for tiny fully decoded images proved reliable
in a named client. They are never the normal scan, PDF, audio, or video path.

## Tool rhythm

Preserve the current domain tools and add only the missing upload operations:

1. `family_history_get_brief`
2. `family_history_search`
3. `family_history_get_context`
4. `family_history_list_queue` / Queue detail and claim where applicable
5. `family_history_get_evidence` — batch reviewed text/images/PDF/audio within
   grant, living-person, rights, and byte budgets
6. `family_history_begin_evidence_upload`
7. direct HTTP PUT by a byte-capable client
8. `family_history_finish_evidence_upload`
9. `family_history_save_records` for a source touching several records, or
   `family_history_save_complete_result` for one all-or-nothing reviewed draft
10. current correction/Queue completion tools for follow-up

The AI never supplies a vault owner id, tenant coordinate, provider key, raw
storage URL, or record outside its returned boundary. Do not expose media,
manifest, upload-session, rights, review, or citation tables as generic CRUD.

## Retrieval and error contract

- Scans/photos: return a cleaned, bounded rendition first; allow a larger
  reviewed rendition only when needed.
- PDFs/transcripts: return bounded text plus selected pages/resource content;
  preserve exact source and citation ids.
- Audio interviews: return a protected content/resource block within budget;
  a transcript is separate attributed evidence and never invented.
- Video: metadata, transcript, poster/contact-sheet, or a separately authorized
  short-lived capability; never inline a large recording.
- `not_reviewed`, `ai_use_not_allowed`, `rights_restricted`,
  `outside_grant_boundary`, `bytes_not_available`, and `too_large` retain their
  existing honest meanings.
- `invalid_image` / `invalid_document` / `invalid_audio`: replace mismatched or
  corrupt bytes.
- `upload_incomplete`: finish the PUT and retry while the session lives.
- `media_unavailable`: stop; never fall back to Convex Storage or a public URL.
- `not_authorized` or uniform not-found: reconnect or ask the person for the
  exact grant; do not enumerate family records.
- `operation_conflict` and `session_expired` follow the family replay contract.
- A truncated batch names what remains and the safe next call.

## Privacy and non-goals

- No real family, living-person, private note, raw capture, interview, or
  unresolved relationship data in development/proof.
- No automatic FamilySearch crawling, browser-session reuse, credential
  storage, provider API assumption, or mirroring of reference-only media.
- No AI review approval, rights approval, conflict settlement, identity merge,
  visibility/access change, publication, export, permanent deletion, or
  outside-world action.
- No provider account, bucket, key, secret, binding, billing, DNS, production
  data, migration, deployment, or named-client setup under this documentation
  change.
- No migration of existing Convex files until additive copy, counts, checksums,
  authorization parity, UI/MCP parity, rollback, and cleanup are approved.
- No conformance claim from a family standard, source implementation, deploy,
  or one client/tool list.

## Proof ladder and first success scenario

Use a marked, synthetic or public-domain deceased-ancestor branch. Upload a
license-clean census-like scan or family-group document, keep it Private and
unreviewed, review it as the person, let the chosen AI retrieve it, preserve a
source and citation, compare two readings, create a structured proposal rather
than settle the conflict, save one private story packet, show it in the normal
UI after reload, replay without duplicates, revoke and prove denial, then clean
every marked record, grant, session, and provider version.

Keep specified, implemented, locally verified, provider configured, deployed,
real-byte, authorization, named-client, and operational restore/rotation/
migration evidence separate. This Work Order is only specified.

## Copyable worker prompt

> Take ownership of AWF-WO-012 as one ambitious Family History release program
> after Scott moves it to Ready. Start from a fresh isolated worktree of current
> `origin/main` and preserve every unrelated checkout and change. Read
> AGENTS.md, the Family History Project Philosophy, the ancestor-vault product
> architecture, tracker Guide, FamilySearch capture/storage and runbook docs,
> AWF-WO-011, AWF-0041, AWF-0045, this brief, and the four family sources at
> `assist-with-life` commit `ee63aaf`. Begin from the real foundation: fourteen
> namespaced tools plus aliases, person-approved grants, protected batch
> evidence, private Convex byte storage, person review/rights/AI-use gates, and
> reference-only FamilySearch media. Do not reopen those decisions or adapt the
> unused public-URL B2 helper into a private path. Deliver the coherent next
> outcome: Convex-controlled exact B2 manifests, source-exact restricted
> archival evidence plus clean normal renditions where required,
> checksum-bound `family_history_begin_evidence_upload` -> direct PUT ->
> `family_history_finish_evidence_upload`, current batch retrieval, one-call
> source/result saves, and exact cleanup. Make routine architecture, schema,
> tests, UI, and sequencing decisions yourself. Keep every new or AI-created
> item Private and unreviewed with AI use off; only the signed-in person may
> review rights, allow later AI retrieval, settle conflicts, merge identities,
> change access, or publish. Preserve living-person privacy, user-mediated
> FamilySearch capture, many-to-many provenance, uniform denial, idempotency,
> and no legacy fallback. Stop before provider setup, secrets, billing, DNS,
> production data, migration execution, deployment, or named-client action not
> explicitly authorized. Build vertical stages, run the full repo gate and
> realistic marked synthetic browser/MCP checks, keep tracker truth current,
> obtain one bounded independent review, and report source, local, PR/CI,
> provider, deploy, real-byte, authorization, named-client, restore, and
> migration rungs separately. Never claim a rung you did not run.
