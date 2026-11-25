# Family History after PR 176 — 2026-11-25 UTC

Mac mini; T3 preview incognito. The coordinator independently reported production commit `45d612fe7c3cc509a63b08587aed1a98b99bef1c` ready at 08:15:34 UTC. This pass did not independently verify deployment metadata. The preview reported hidden and the owned tab was closed.

At approximately 08:18:29 UTC, Home showed a main region and heading with no generic application error. One credential-free GET per synthetic raw route was made without following redirects or retaining response bodies:

| Route pattern | First status | Resolved redirect | Return parameter |
| --- | --- | --- | --- |
| `/app/people/[personId]/raw` | 307 | Same-origin `/sign-in` | Decoded value preserved the exact synthetic requested path and `?run=TEST-run`. |
| `/app/source-docs/[personId]/raw` | 307 | Same-origin `/sign-in` | Decoded value preserved the exact synthetic requested path and `?run=TEST-run`. |

The HTTP tool reported curl's resolved `redirect_url`; the literal Location header form (relative or absolute) was not captured. No redirects were followed or requests repeated. No signed-in access, private records, app writes or provider operations were performed.
