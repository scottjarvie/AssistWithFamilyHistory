# Narrow record-only action review — November 1, 2026

Root reviewed the exact whole `convex/yourData.ts` module, its shared owner helper and internal query call graph after the bounded active-connection count correction. Reviewed module SHA-256: `9d4ed28a1f7c83bd41593e5dc3a97c5d5eb1b670cfdd9901dfb4320446e6ff0a`.

The native Sandbox allowlist adds only `getYourStats`, `getLibraryShelves` and `exportPage`, with their exact exported-statement hashes in `scripts/record-only-action-hashes.json`. These statements call internal helpers; their hashes alone do not certify helper changes. Future changes to this module or call graph require a fresh manual source review and snapshot verification, not merely unchanged exported hashes.

These actions read owner-scoped existing synthetic records. Their owner helper refuses anonymous, wrong-owner or denied decisions even in shadow mode. The only mutation is the existing denial audit. Statistics and Library reads are bounded. Export reads only its explicit table list, 200 rows per page, and excludes original file bytes and API-key machinery. The three import-owned tables are included to preserve export parity; this does not enable import execution.

All existing wrappers remain. Unapproved actions, import execution, media/provider operations, MCP and crons remain blocked. This approval is source-only for an independently verified native Sandbox and marked synthetic owner. It does not authorize production binding changes, provider configuration, broad secrets, real-record copies, or declaring authenticated/browser/provider acceptance without observation.
