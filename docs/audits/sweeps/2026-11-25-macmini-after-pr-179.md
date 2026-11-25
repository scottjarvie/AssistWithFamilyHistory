# Family History after PR 179 — 2026-11-25 UTC

Mac mini, T3 preview incognito. The coordinator independently reported production commit `8e2a15fbf2928638086e11daf57867c22eefb264` ready at 15:05:49 UTC. The driver separately reported Convex and frontend completion at 15:05:39.463 and 15:05:46.157 UTC respectively. This check did not independently verify deployment metadata. Preview reported hidden; the owned tab was closed.

At approximately 15:08:00 UTC, Home showed a main region and heading with no generic application error. One credential-free, no-follow GET to synthetic `/app/people/TEST-placeholder` returned HTTP 307. The raw Location was relative `/sign-in` with a `redirect_url` that decoded to the exact original canonical synthetic path.

No real data, signed-in access, app writes or provider operations were used.
