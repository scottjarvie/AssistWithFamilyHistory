# PR #88 copy verification

Captured from the actual app at `http://127.0.0.1:3443`, without credentials or a backend, before and after the copy changes.

1. [Support before/after](1-support-comparison.png): closed intake warning, status link and conditional request guidance.
2. [Delete-account before/after](2-delete-account-comparison.png): export covers workspace records and excludes original files. Browser metadata now describes account deletion status and data export, with self-service deletion explicitly unavailable.

Full desktop captures: [support before](support-before.png), [support after](support-after.png), [delete-account before](delete-account-before.png), [delete-account after](delete-account-after.png).

Mobile captures (390 px): [support](support-after-mobile.png), [delete-account](delete-account-after-mobile.png). Both routes returned HTTP 200, had no horizontal overflow, and raised no browser page errors at desktop (1280 px) and mobile widths. The local server used a fallback after failing to download Cormorant Garamond; the copy is still visible. Authenticated export, deletion, external desk intake, and production behavior were not exercised.
