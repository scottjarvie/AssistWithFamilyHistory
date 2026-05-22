# Privacy And AI Safety Review

Date: 2026-05-21

## Scope

Reviewed FamilySearch capture/import, media memories, context packs, source-doc AI analysis, Story Writer, public story pages, Convex fallback states, and OpenRouter error handling.

## Current Controls

- External AI calls through `/api/process` now require `privacyAcknowledged: true` and a `redactionMode`.
- Source-doc AI analysis defaults to redacted evidence packs and blocks unredacted OpenRouter submission when living-person indicators are detected.
- Story Writer shows an AI privacy review panel and blocks in-app OpenRouter generation when the person is marked living.
- OpenRouter provider errors are sanitized so provider response bodies, keys, and raw request details are not reflected to users.
- Convex runtime fallback messages are actionable but no longer expose raw backend exception text.
- FamilySearch memory imports default to `privacyLevel: private`, `reviewStatus: unreviewed`, `rightsStatus: unknown`, and `aiUseAllowed: false`.
- Public story bundles filter media to reviewed publishable/public-source assets with non-restricted known rights.
- Publish warnings now call out linked media that is private, unreviewed, or rights-restricted.

## Risks And Mitigations

| Flow | Risk | Current mitigation | Remaining follow-up |
| --- | --- | --- | --- |
| FamilySearch memories | Contributor names, private notes, and media URLs could be republished accidentally. | Imported media is private/unreviewed by default; public story media filters require explicit review and rights state. | Build a first-class media review UI for owner approval and notes. |
| Source-doc AI | Raw source text may include living-person details or contact data. | Redactor handles emails, phones, SSNs, and living indicators; unredacted living-risk submissions are blocked. | Expand redactor fixtures for addresses and modern relationship phrases. |
| Story Writer | Context packs may contain unresolved import warnings or provisional relatives. | Story Writer displays privacy warnings and blocks living-person generation. | Add a stricter generated-story save warning when unresolved warnings remain. |
| Public stories | Public pages could expose unreviewed media. | Public story query filters media through review/rights gates. | Add admin-facing review controls for `privacyLevel`, `reviewStatus`, and `rightsStatus`. |
| Backend/AI failures | Raw provider/backend errors could leak internals. | OpenRouter and Convex user-facing errors are sanitized. | Add structured server logging when a production log destination exists. |

## Verification

Run:

```bash
pnpm check:privacy-ai-safety
pnpm check:public-beta-launch
pnpm lint
pnpm build
```
