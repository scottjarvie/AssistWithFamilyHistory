# PR #88 original-download copy correction

Captured before and after from the actual app at `http://127.0.0.1:3459`, with sign-in disabled and no backend configured. No workspace records or export data were read or written.

1. [Delete account comparison](1-delete-account-comparison.png): removes the unsupported per-file download instruction and retains the warning that export excludes original files.
2. [Your data comparison](2-your-data-comparison.png): the same correction beside the export button.

Mobile captures at 390 px: [delete account](delete-account-after-mobile.png), [your data](your-data-after-mobile.png). Both pages rendered the corrected limitation without the removed instruction at desktop (1280 px) and mobile (390 px), with no horizontal overflow.

Development browser limitations: two `Invalid or unexpected token` page errors were observed during the first after-capture run. A later navigation run reported Next.js's `Router action dispatched before initialization` in its development hot-reloader. These runtime errors are not fixed or claimed resolved by this copy-only change. Authenticated export, file downloads, deletion, external support intake and production behavior were not exercised.

The JSON export note is checked in source by `pnpm check:support-contact`; no real export was requested. The regression check was observed failing on all three original claims before the copy fix, then passing after it.
