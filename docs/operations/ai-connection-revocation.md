# AI connection controls — AWL-0015

Signing in grants every current and future power with no end date. Each connection
stores removed powers, a revision, an optional pause and chosen end date. Marked chosen
lists derive removed powers from the frozen baseline; future powers still arrive.
Unmarked Settings or ambiguous legacy lists retain their stored powers instead of
being inferred full from the old seven-power baseline.
Untouched automatic grants are lifted only when original receipt provenance matches.
Explicit and ambiguous limits remain enforced. Legacy indexing runs automatically.

`family_history_connection` is always available, including when paused, expired or
revoked. `family_history_limit_connection` accepts only remove-powers, shorten-date,
pause and revoke actions for the verified calling connection. A caller supplies the
current revision and a unique opId. Identical replay is safe; stale writes and opId
reuse with different input are refused. Append-only `mcpGrantHistory` rows hold actor,
before/after, time, revision, safe sentence and operation id. Free text is redacted;
request payloads are hashed, never stored with possible credentials.

Only the signed-in website session may restore, resume, widen, or clear/extend an end
date. Restore on a revoked connection preserves the pre-revoke powers, pause, boundary
and end date, even after that date has passed. Restore on an active narrowed connection gives back removed powers and
the full record boundary; dates and pauses have separate controls.

Every restriction updates one durable `mcpCarriedRestrictions` record per owner.
Entries contain source grant/revision, lineage, issuer, withheld powers, pause,
revocation, chosen end date and record boundary. Connect reads that record, never
recent grant history and never a capped scan. Unknown registrations and changed
self-reported names cannot exclude a restricted predecessor. Server registration
names take precedence; fallback clientInfo is accepted only on initialize. Names
(including DCR names) may only narrow; User-Agent and per-request names are ignored.
URL-shaped client ids and failed CIMD lookups do not establish a different app either.

Existing pre-ledger owners are converted automatically in background pages. Every
page is processed, with no history cap. Connections fail closed while this one-time
conversion is pending, with an honest retry message and no extra approval step.
Legacy full, partial, paused, denied, revoked and expired histories are indexed by
durable authority pointers when present. Without those pointers, all unresolved
restrictions carry: a later consent timestamp alone never proves a release.
An explicit person reapproval replaces authority and releases the observed entries.

A registration that inherits joins the same authority. Indexed client aliases and
lineage pointers resolve all members to one current grant for tool gates, writes,
and touches. Superseded rows retain receipts but never independent access. Merges
keep the oldest root stable and intersect limits, preserving pause through revoke
and Restore. Settings obtains every page of current connections and shows superseded
history separately. Same-name merges say **Linked by name** and explain that separate
installations may share that name. Unresolved inherited limits are also shown before
a connection next makes a call.

A person release checks both the grant revision and the owner's carried-record
revision. It clears only the current lineage's observed entries in that same
transaction, then records any limits that still apply. No permanent exemption is
stored: a later restriction always creates a new source revision. An old Settings
view or replayed Restore cannot clear a newer restriction on another predecessor.
Current releases and later restrictions are compared by revision, including when
timestamps are identical or the clock moves backwards.

The internal read-only `mcpGrants:countOwnersWithUnaliasedSuccessors` query returns
only a distinct owner count: an unresolved restricted predecessor and a later,
unaliased different client id in the same issuer. It excludes restored/superseded
limits and has no recent-row cap. Its audit may read legacy history; authorization
never does. It returns no personal data and changes no records.

Removing a connection hides it, preserving the refusal and history. Reconnecting
reveals a hidden refusal for person review; it never enables access again.

Media review, rights and living-person gates remain. `family_history_archive_record`
is a reversible soft delete with AI attribution. Archive and restore never delete or
purge records or storage. The person can recover records in `/app/archive`, linked
from the Library. This site currently has no group-sharing tool; invitations and public
links remain unavailable. No API-key purge path is introduced.

## Verification and shipping

The Convex tests cover revisions, retries, self-narrowing, person-only restoration,
re-registration, inherited refusals, safe history and record recovery. Transport tests
prove controls remain available after shutdown. `pnpm verify` checks catalog, guidance,
permissions, tenant guards and the frontend build. No manual production Convex deploy:
Vercel deploys Convex before the frontend after the approved ship step merges the PR.
