# Family History after search coverage metadata — 2026-11-25 UTC

Mac mini, T3 preview, incognito. The coordinator reported production commit `08fdf77472685e59a5b0b35ed0222ae3cfe61856` ready at 07:26:35 UTC; deployment metadata was not independently verified in this browser pass. The preview reported hidden and the owned tab was closed.

- Home `/` and AI guide `/ai`: main and heading present; no generic application error observed.
- Exactly one anonymous same-origin POST `/mcp`, with no body and credentials omitted, returned HTTP 401 and a Bearer `WWW-Authenticate` challenge.

No authenticated profile, tokens, OAuth flow, tool calls, private search data or fixtures were used. Signed-in search coverage metadata remains synthetic only and was not verified against live owner data. No app data or settings were changed.
