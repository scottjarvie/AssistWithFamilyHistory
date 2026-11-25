# Family History after PR 180 — 2026-11-25 UTC

Mac mini, T3 preview incognito. The coordinator independently reported production commit `1507a151fb5c18fde8da5a844ff175162611eb11` ready at 15:38:17 UTC. The driver described the change as test-only with no runtime diff. This pass did not independently verify deployment metadata. Preview reported hidden; the owned tab was closed.

At approximately 15:40:16 UTC, Home showed a main region and heading with no generic application error. One credential-free no-follow GET to synthetic `/app/people/TEST-placeholder` returned HTTP 307. The raw Location was relative `/sign-in` with `redirect_url` decoding to the exact original canonical synthetic path. This matches the preceding #179 observation.

No signed-in account, real data, provider operation, app write or MCP probe was used.
