# FamilySearch Live Capture Pilot Checklist

This is the login-ready pilot plan for restarting live FamilySearch capture. It assumes the current supported path is still user-mediated browser capture through the Chrome extension, not direct FamilySearch provider API access.

Use this doc with:

- `docs/importing/familysearch-source-capture-runbook.md`
- `docs/importing/familysearch-capture-storage-map.md`
- `docs/security/privacy-ai-safety-review.md`
- `/app/imports` for preview, warning review, and merge decisions

## Route Goal

Run a small, conservative pilot that proves the loop from logged-in FamilySearch page to local capture package to import preview to post-merge verification.

The pilot should collect enough information to validate capture reliability, storage decisions, privacy review, and research/story handoff. It should not try to maximize volume.

## Before Login

Codex or another agent can do this without the user's authenticated FamilySearch session:

1. Verify the extension builds and capture/import checks pass.
2. Open the local app and confirm `/app/imports` loads.
3. Prepare the capture queue template below.
4. Confirm the first target people are deceased or otherwise safe for review.
5. Confirm no real FamilySearch credentials, cookies, or private notes are copied into repo files.
6. Stop and ask the user to authenticate FamilySearch in their browser before any live page capture.

## User Login Checkpoint

Only the user should authenticate FamilySearch. The agent can continue after the user confirms:

- FamilySearch is open in the browser with the user's session.
- The unpacked extension is loaded from `extension/`.
- The first target person page is visible.
- The user is comfortable with one-person-at-a-time capture for the pilot.

Do not ask for or store the FamilySearch password, session cookies, 2FA codes, or account recovery details.

## Live Page Shape Validation

The authenticated browser flow was validated against FamilySearch person sources and memories routes on May 21, 2026:

- Sources route: `/en/tree/person/sources/<FAMILYSEARCH_ID>`
- Memories route: `/en/tree/person/memories/<FAMILYSEARCH_ID>`
- Both pages expose the same person header, tab navigation, visible counts, and source/memory list content expected by the capture runbook.

Do not persist live FamilySearch page content into repo fixtures. Use live validation for selectors, page accessibility, and route assumptions only unless the user explicitly exports a reviewed capture package.

## First Capture Queue

Fill this table before the live session or during the authenticated session. Keep it small for the first pass: three to five people is enough.

| Priority | FamilySearch ID | Target page | Reason for capture | Expected evidence | Privacy risk | Merge intent | Owner note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | `FILL-ME` | sources | Validate source capture on a known deceased person | approximate source count if known | low / unknown / high | preview-only / merge-if-clean | why this person matters |
| P2 | `FILL-ME` | sources | Validate duplicate detection or source-rich profile | approximate source count if known | low / unknown / high | preview-only / merge-if-clean | known caveats |
| P3 | `FILL-ME` | memories | Validate memory/media privacy defaults | approximate memory count if known | low / unknown / high | preview-only | confirm rights before publishing |

Queue rules:

- Prefer deceased people with well-understood identity context for the first pilot.
- Include one source-heavy person and one memory/media page if available.
- Do not include living people in the first pilot unless the user explicitly directs it during the session and the result stays preview-only.
- Do not store real private target notes in repository fixtures or tracker Cards.
- If the queue needs private details, keep them in an access-controlled live
  session handoff; the repository tracker may contain only a safe redacted
  reference.

## One-Person Capture Loop

Run this loop for each queue row.

1. Open the target FamilySearch URL:
   - sources: `https://www.familysearch.org/en/tree/person/sources/<FAMILYSEARCH_ID>`
   - memories: `https://www.familysearch.org/en/tree/person/memories/<FAMILYSEARCH_ID>`
2. Confirm the visible FamilySearch ID and person name match the queue.
3. Confirm the page type matches the queue row.
4. Open the extension popup.
5. Confirm consent and use standard mode.
6. Start capture only after the user-visible page is stable.
7. Wait for the capture to finish. Do not navigate away mid-capture.
8. Save or copy the capture package.
9. Paste the package into `/app/imports`.
10. Run preview/review before any merge. For API-level validation, use the import preview route with `preview=true`.
11. Read every warning, failed expansion, duplicate notice, living/private marker, and source count mismatch.
12. Merge only when the package is clean enough for the queue's merge intent.
13. After merge, confirm the imported person, sources, citations, memories, and operation/research rows are visible where expected.
14. Write the capture handoff note before moving to the next queue row.

## Stopping Rules

Stop the live session or mark the queue row blocked when any of these happen:

- FamilySearch shows friction, throttling, account warning, unexpected login prompt, or repeated page errors.
- The visible person ID or page person name does not match the queue.
- The page appears to be for a living person or includes private family notes not intended for import review.
- Source or memory count is materially different from expected and the reason is not obvious.
- Capture diagnostics show failed expansions, missing person identity, schema mismatch, or extension runtime errors.
- `/app/imports` shows high-severity warnings, duplicate-source ambiguity, living/private markers, or an identity mismatch.
- The merge would overwrite canonical facts without source-backed review.
- The user asks to pause or the session context becomes unclear.

When in doubt, keep the package preview-only and write a handoff note.

## Handoff Note Format

Use one note per captured person.

```md
### FamilySearch live capture handoff

- Queue row:
- FamilySearch ID:
- Person name shown on page:
- Target page:
- Captured at:
- Capture mode: standard
- Capture package location or paste status:
- Preview result:
- Imported/merged: yes/no
- Sources captured:
- Memories captured:
- Failed expansions:
- Warnings:
- Duplicate notices:
- Living/private markers:
- Media/privacy review needed:
- Post-merge verification:
- Next research action:
- Next story action:
- Stop rule triggered:
```

## Verification

Run these before asking the user to log in:

```bash
pnpm build:extension
pnpm check:extension
pnpm check:familysearch-capture
pnpm check:familysearch-readiness-contract
pnpm check:familysearch-live-pilot
pnpm check:privacy-ai-safety
pnpm lint
pnpm build
```

During live QA:

- Browser-check `/app/imports` on desktop.
- Validate at least one package through preview before any merge.
- Keep browser console open and record extension or app errors in the handoff.
- Confirm media imported from FamilySearch remains private, unreviewed, unknown-rights, and not AI-eligible by default.

## Completion Criteria

The live pilot is complete when:

- Each queue row has a handoff note.
- At least one source capture package validates in preview.
- Any merged package has post-merge verification notes.
- Any blocked row has a clear stop rule and next action.
- Follow-up tracker Cards exist for extension drift, import regressions, privacy
  review gaps, or source-backed fact extraction discovered during the session.
