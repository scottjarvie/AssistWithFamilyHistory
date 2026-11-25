# Family History public surface after D2 — 2026-11-25

Mac mini, T3 preview incognito. The coordinator independently reported production commit `8a091ea796c683bdbdfa1de953ae5d83e28fbd40` ready at 07:08:12 UTC; the browser did not independently verify deployment metadata. The preview tab reported hidden and was closed after the checks.

- Public Home `/`: main and heading present; no generic application error observed.
- AI guide `/ai`: main and heading present; no generic application error observed.
- Anonymous ordinary GET `/mcp`: HTTP 405, with a message that MCP uses POST and directs setup to `/ai`. Response headers were not exposed by the browser check, so a standard authentication challenge cannot be verified. No POST, credentials, OAuth flow or tool call was attempted.

No signed-in profile was opened. Evidence bytes, B2 pinned-version behavior and hosted HEIC delivery remain unverified. No media, records, fixtures or provider access were tested.
