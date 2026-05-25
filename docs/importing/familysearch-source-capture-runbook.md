# FamilySearch Source Capture Runbook

FamilySearch source capture is a core intake front door for the Research Vault. Until direct FamilySearch API access is approved, capture must stay browser-mediated, user-visible, and conservative.

## Current Status

- Primary entry point: Chrome extension in `extension/`.
- Priority page: `https://www.familysearch.org/en/tree/person/sources/<FAMILYSEARCH_ID>`.
- Secondary page: `https://www.familysearch.org/en/tree/person/memories/<FAMILYSEARCH_ID>`.
- Direct provider API access: pending. Do not design agent work that assumes API credentials or automated FamilySearch API calls are available.
- Legacy fallback: console scripts documented in `docs/importing/familysearch-console-extractor.md`.

## Allowed Work

- User opens a specific FamilySearch person sources page while signed in with their own session.
- User starts capture from the extension popup after consent.
- Extension captures visible source and memory evidence into a local capture package.
- Agent or developer imports a reviewed capture package through the app intake flow or local import tooling.
- Agent may help inspect extension behavior, run local checks, validate capture package shape, and document warnings.

## Not Allowed

- Broad unattended crawling, search-result scraping, or tree traversal.
- Hidden background capture that starts without the user opening the page and clicking capture.
- Aggressive pacing intended to bypass normal FamilySearch UI limits.
- Credential handling outside the user's browser session.
- Exporting or importing living/private person data without explicit review.
- Treating the pending provider API as available in product code, planning, or agent prompts.

## Standard Capture Flow

For the first logged-in restart session, use `docs/importing/familysearch-live-capture-pilot.md` as the pilot checklist and run one-person-at-a-time capture.

1. Load the unpacked extension from `extension/`.
2. Open the FamilySearch person sources page for one person.
3. Confirm the page shows the expected person and source count.
4. Open the extension popup and acknowledge the consent checkbox.
5. Run capture in standard mode.
6. Save or copy the generated capture package.
7. Paste it into `/app/imports` and run review/preview.
8. Copy the validation report if another agent or human reviewer needs a handoff packet.
9. Review warnings, failed expansions, duplicate detection, and person identity match before merging into the vault.
10. Confirm the merge only after the package is ready.

## Pacing And Modes

Standard mode is the default:

- 1.5 seconds between source expansions.
- 0.5 seconds between actions.
- 50 expansion cap.

Admin mode is only for local/internal verification:

- It must not be used for broad unattended capture.
- It should be used only when validating extension behavior against known pages.
- Any production workflow that needs faster capture should wait for an approved provider API route or a product decision.

## Capture Package Quality Gates

A capture package is not ready for merge until it has:

- `schemaVersion` set to `2.0`.
- FamilySearch person ID and person name.
- Page URL and capture timestamp.
- Source or memory counts that are plausible for the page.
- Diagnostics with expansion count, failed expansion count, warnings, and errors.
- No obvious cross-person identity mismatch.
- No unexpected living/private data that needs manual review.

## Agent Handoff

Agents can safely work on:

- Extension TypeScript and generated runtime sync.
- Capture package validation.
- Import parser behavior.
- Duplicate detection.
- Warnings and diagnostics.
- Intake review screens.
- Runbooks and verification checklists.

Agents should not be assigned:

- Unattended FamilySearch browsing.
- Provider API integration until credentials and terms are approved.
- Admin-mode capture at scale.
- Merge automation that bypasses owner isolation or review.

## API Impact

This route is browser-first today. It does not add provider API parity yet.

Future API work should be treated as a separate product surface:

- OpenAPI/capability docs: needed before exposing capture imports to external agents.
- Scopes/tiers: future capture-import scopes should separate read, import, merge, and admin review.
- Agent handoff: agents need a capability manifest that says browser capture is manual/user-mediated.
- Security/abuse risk: provider scraping, credential misuse, private person leakage, duplicate poisoning, and merge-by-default behavior are the major risks.

See also:

- `docs/importing/familysearch-live-capture-pilot.md` for the login-ready pilot checklist, first queue template, stop rules, and capture handoff format.
- `docs/importing/familysearch-capture-storage-map.md` for the capture-to-vault field contract.
- `docs/importing/familysearch-provider-api-readiness.md` for the future approved-provider boundary.
- `docs/importing/source-neutral-intake-boundary.md` for non-FamilySearch and GEDCOM planning.

## Verification Checklist

Run local checks after changing extension or capture intake behavior:

```bash
pnpm build:extension
pnpm check:extension
pnpm check:familysearch-capture
pnpm check:familysearch-readiness-contract
pnpm check:familysearch-live-pilot
pnpm check:api-inventory
pnpm check:protected-routes
pnpm lint
pnpm build
```

Manual verification for capture changes:

- Load the unpacked extension.
- Open one known FamilySearch sources page.
- Confirm popup detects the person and source count.
- Start capture and confirm progress advances.
- Download/copy the capture package.
- Confirm the JSON imports or validates without schema errors.
- Confirm warnings are visible before any merge or vault write.
