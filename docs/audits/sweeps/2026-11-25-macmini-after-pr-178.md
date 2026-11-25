# Family History after PR 178 — 2026-11-25 UTC

Mac mini, T3 preview incognito. The coordinator independently reported production commit `174437dc0f80630de82148ecbbb49fae8bdce810` ready at 14:47:32 UTC. The driver separately reported Convex and frontend timestamps of 14:47:20.795 and 14:47:29.581 UTC respectively. This check did not independently verify deployment metadata. Preview reported hidden and the owned tab was closed.

At approximately 14:50:12 UTC, Home showed a main region and heading with no generic application error. One credential-free GET to synthetic `/app/people/TEST-placeholder`, without following redirects, returned 307. Curl's resolved redirect destination was canonical same-origin `/sign-in`; the decoded `redirect_url` exactly preserved `/app/people/TEST-placeholder`. The literal Location header form was not captured.

No real record, signed-in access, app write or provider operation was used.
