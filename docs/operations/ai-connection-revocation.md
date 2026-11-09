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
addresses }` covering at least those counts allows the whole batch and is accepted
on the first call. Business contacts are expected; tools and /ai tell the AI to
remove only the person's own private details. Publication and unpublication retain
verified AI attribution and story history; the person can also unpublish. Inviting
people, money, messaging, permanent deletion and external provider actions remain off.

The internal read-only `countOwnersWithUnaliasedSuccessors` returns only the distinct
owner count requested by the campaign: a restricted, unreleased predecessor and a
later unaliased different client ID from the same issuer. Audit scans are uncapped
and read-only; authorization never scans history. Production release remains Vercel's
coordinated Convex deployment followed by the frontend. Never deploy Convex manually.
