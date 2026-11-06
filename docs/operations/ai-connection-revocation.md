# AI connection controls — AWL-0015

Signing in grants every current and future power with no end date. Each connection
stores removed powers, a revision, an optional pause and chosen end date. Legacy held
lists derive removed powers from the frozen baseline; future powers still arrive.
Untouched automatic grants are lifted only when original receipt provenance matches.
Explicit and ambiguous limits remain enforced. No data migration is required.

`family_history_connection` is always available, including when paused, expired or
revoked. `family_history_limit_connection` accepts only remove-powers, shorten-date,
pause and revoke actions for the verified calling connection. A caller supplies the
current revision and a unique opId. Identical replay is safe; stale writes and opId
reuse with different input are refused. Append-only `mcpGrantHistory` rows hold actor,
before/after, time, revision, safe sentence and operation id. Free text is redacted;
request payloads are hashed, never stored with possible credentials.

Only the signed-in website session may restore, resume, widen, or clear/extend an end
date. Restore on a revoked connection preserves the pre-revoke powers, pause, boundary
and end date. Restore on an active narrowed connection gives back removed powers and
the full record boundary; dates and pauses have separate controls.

Re-registration is matched to earlier owner/issuer connections by reported name when
no stable verified id is available. The match can only narrow: powers intersect,
refusal wins, the shortest end date wins, and pauses persist. Client aliases point to
one canonical grant so old registrations cannot bypass a new limit. No reported name
is treated as proof of identity. An unrecognisable client with no stable identity or
reported name cannot be correlated with an earlier client; it is a distinct connection.

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
