# AI connection controls — AWL-0015 revised decisions 4 and 5

A first connection has full current and future powers with no end date. Every new
client ID instead starts with the narrowest unreleased restrictions in the person's
single `mcpCarriedRestrictions` record. There is no name, host, registration-method
or app-identity comparison, including across issuers. Withheld powers union, any
revoke or pause applies, and the earliest chosen end date wins. Record boundaries
intersect. Existing client IDs retain their own grant exactly; different connections
never share subsequent authority or receive each other's later restrictions.

Each restriction writes its source grant and revision. New connections read the
owner record, with no history scan or cap. Legacy owners are converted once, through
all paginated grants, failing closed until complete. The v2 conversion splits old
cross-client links while preserving their limits. The client lookup table is now
only an index for an exact authenticated client ID, never an app matching mechanism.
Unmarked Settings and ambiguous legacy lists retain their stored powers; only
provably untouched automatic defaults lift to full access.

Settings lists every current connection, with superseded same-client receipts in
separate history. A connection created at the floor says "Started with the limits
of your most limited AI" and offers Restore. Only the person may Restore, Resume,
widen, change an end date or Forget. These changes check both the grant revision
and owner record revision atomically. Releases remove only observed inherited source
revisions and entries belonging to the restored connection; newer source restrictions
remain. Later restrictions always write a new entry, even with identical or backwards
clocks. Forget on a revoked connection removes its entries from the floor while its
old token remains revoked. AI controls only narrow their own connection and require
revision plus idempotency key. Media review, rights and living-person gates remain.

The AI can publish and unpublish stories through the existing story save tools,
including batch and complete-result saves. Published with `publicIndexing: noindex`
is unlisted; `index` is public. Publication and edits to published content re-read the current publish power,
stored body and version in the same mutation, then run one sensitive-info check
over the entire batch before writes. Story bodies are inline text only; unsupported
or file-backed body inputs refuse rather than bypass scanning. Secrets always refuse with
a category and location, never matched values, including JSON-quoted credentials.
Contact matches use horizontal separators and never span lines or merge adjacent values. Contact details return one aggregate
summary with counts. A single top-level `acknowledgeContactDetails: { emails, phones,
addresses }` equal to those exact counts allows the whole batch and is accepted
on the first call. Business contacts are expected; tools and /ai tell the AI to
remove only the person's own private details. Publication and unpublication retain
verified AI attribution and story history; the person can also unpublish. Inviting
people, money, messaging, permanent deletion and external provider actions remain off.

The internal read-only `countOwnersWithUnaliasedSuccessors` returns only the distinct
owner count requested by the campaign: a restricted, unreleased predecessor and a
later unaliased different client ID from the same issuer. Audit scans are uncapped
and read-only; authorization never scans history. Production release remains Vercel's
coordinated Convex deployment followed by the frontend. Never deploy Convex manually.

`family_history_unpublish_story` accepts only a story id and expected version. It
requires an active, unpaused, unexpired grant and ownership; all publish powers may
be removed. It cannot edit content or increase visibility. Contact acknowledgement
counts must equal every category found, including zero; blanket high counts refuse.

## Opus and cross-site audit follow-up

Each restricted new connection immediately writes its own carried entry. Forget
releases only that connection's entries. Bootstrap selects current connections,
excluding same-client replaced/rotated history; explicit person reapproval is
ordered by immutable paginated insertion order rather than caller timestamps.
A floor-started connection stores its own access separately from inherited access.
Restore removes inherited powers/boundary while preserving its own restrictions;
Resume and widening use its own policy. Shorter dates and no-op saves release
nothing and retain inherited provenance. Exact source/revision pairs still protect
later restrictions on the original source.

Every MCP mutation compares its final public story projections with their prior
projections. Creating, editing, attaching related people or visible metadata, and
reactivating archived public content all repeat current publish-power validation,
the stored/version-bound sensitive-info check, shared story readiness (including
living-person evidence), and the pending-second-review gate in the committing
transaction. The AI may move a draft into review; it never supplies the website's
human confirmation. Changed public stories receive verified AI history. Publication
checks inspect public text fields before public redaction. Media in the public DTO
exposes titles only, not file bytes or storage links. Unsupported file-backed story
bodies refuse. A restore failure offers `restoreAsPrivate: true`, which restores
without reactivating public links, unpublishing affected stories if needed.

Credential-shaped assignments require a quoted key or no space before the colon
or equals, and a non-space value of at least eight characters. JSON escaping,
snake_case prefixes, next-line values, credential URLs, common provider token
prefixes and Luhn-valid card numbers are checked. Ordinary story prose is not a
credential. Contact acknowledgements must exactly match every category, including
zero. The human website path retains its normal readiness/review gates and does
not enforce the AI credential scanner; restoration may return advisory warnings.
