# Design and IA Foundation vNext

Status: accepted foundation with one active public-shell slice
Linear: GEN-111
Reconciled: 2026-07-17 against main `9e2b1ce`, production public routes, open PRs #12-#18, and current Linear issues

## Decision

Discover Their Stories will describe one evidence-to-story journey everywhere:

> **Capture → Vault → Research → Story**

This is the **Research Spine**. It is a vocabulary and orientation model, not a second workflow engine. The public site explains the journey; the private workspace eventually uses the same stage names where current route and user evidence support them.

Privacy, provenance, uncertainty, and publish readiness are cross-cutting meanings attached to records, claims, people, and stories. They must not become four competing navigation systems, and they must not be collapsed into one generic “safe” badge.

## Evidence reconciled

### Current main

- The public home, features, roadmap, updates, privacy, and shared layout components use a parchment/teal/rust editorial identity with a compass mark.
- `/extension` is public but uses a standalone amber/green/blue/purple presentation and omits the shared `MarketingNav` and `Footer`.
- `app/features/page.tsx` already presents an Intake/Vault/Research/Stories sequence.
- The private sidebar contains Vault, Research Queue, and Story Studio concepts, but its navigation, identity, and status UI are outside the first slice.
- `app/globals.css` contains both light and dark semantic tokens, but source presence does not prove that the dark palette is a suitable workspace default.

### Production

- `https://discovertheirstories.com/`, `/features`, `/extension`, `/privacy`, `/roadmap`, and `/updates` returned HTTP 200 on 2026-07-17.
- The live extension page still renders the legacy presentation while the other public routes expose the shared AI Heritage Studio shell.
- Production public routes are evidence for the current mismatch, not permission to inspect authenticated routes or family-history data.

### Open PR ownership

PRs #12-#18 are green and mergeable but still open. Their stack owns sitemap normalization, public story failure handling, Convex/Vercel deployment behavior, auth propagation, publish/redaction gates, and the broader trust boundary.

The active public slice does not edit any file changed by those PRs. In particular it avoids `package.json`, `scripts/verify.sh`, `docs/README.md`, private app routes, API routes, Convex code, auth, and story publication code.

### Linear dedupe

- GEN-8 already owns extension TypeScript/runtime integrity. This foundation does not change extension runtime behavior.
- GEN-16 and GEN-61 already own evidence-first Story Studio review and research-pack provenance.
- GEN-66 already owns AI/publish eligibility badges in the person workspace.
- GEN-82 already owns the app account top bar and removal of the raw Clerk user ID.
- GEN-109 is the accepted ancestor-vault doctrine and evidence model.
- GEN-43 already owns targeted public-link hydration suppression.

GEN-111 is therefore the canonical issue for the public capture-to-vault bridge. It must not reopen the completed private-workspace work above.

## Target information architecture

### Public promise

The public shell keeps its existing route navigation. Public pages may use the Research Spine as an explanatory device:

1. **Capture** — a user deliberately brings source material into a capture package.
2. **Vault** — originals and provenance are preserved before interpretation.
3. **Research** — sources, conflicts, gaps, and historical context are reviewed.
4. **Story** — writing begins from reviewed evidence and publishing remains intentional.

The spine is not a progress tracker unless a future feature has real per-user state.

### Private workspace hypothesis

`Overview / Capture / Vault / Research / Story` is a useful future grouping hypothesis, not an approved navigation migration. Current route ownership, mobile behavior, existing badges, operator needs, and authenticated browser evidence must be revalidated after PRs #12-#18 drain.

### Cross-cutting meaning

Future shared status primitives must preserve four distinct dimensions:

| Dimension | Question it answers | Examples |
| --- | --- | --- |
| Privacy scope | Who or what may use or see this? | Private, AI-eligible, Public |
| Provenance | Where did this statement come from? | Source-backed, Context, AI-drafted |
| Review/uncertainty | How strongly is the claim accepted? | Candidate, Accepted, Conflict, Rejected |
| Publish readiness | Where is the story in the release process? | Gathering, Drafting, Ready, Published |

Color cannot be the only carrier of meaning. `AI-drafted` is not evidence, `Private` is not an error, and `Ready` is not the same as `Public`.

## Design foundation

### Accepted now

- One public compass identity, editorial type system, and parchment/teal/rust shell.
- Shared `MarketingNav` and `Footer` on all public marketing routes, including `/extension`.
- One reusable `ResearchSpine` public component with canonical stage order and plain-language descriptions.
- Calm privacy language: capture is user-initiated; the user controls the package; import is a reviewed step; capture does not publish a story.
- Existing extension download and `/app/imports` destinations remain unchanged.

### Deferred

- Extracting a universal `BrandLockup`.
- Replacing all literal marketing colors with semantic tokens.
- Authenticated workspace theming or navigation regrouping.
- A shared cross-product status-chip component.
- Global CTA vocabulary changes.
- Aligning the existing `/features` labels from Intake/Vault/Research/Stories to the canonical Capture/Vault/Research/Story vocabulary.
- Shared mobile-menu behavior beyond the accessible-name correction, including an explicit `aria-controls` relationship and Escape-to-close behavior.

### Rejected from the advisory audit

- Do not switch the private workspace to `.dark` because a dark token set exists.
- Do not add Sources, Artifacts, or Memories navigation entries without current routes and ownership.
- Do not replace the workspace book glyph or rename “Enter Studio” in a public-only slice.
- Do not demote Agents/API/Lab without authenticated workflow evidence and an owner-facing UX decision.
- Do not use one color/status taxonomy for privacy, provenance, review, and readiness.

### Revalidation-dependent

- Whether GEN-82's top bar also needs a persistent “Private vault” cue.
- Whether private navigation should adopt the Research Spine labels.
- Whether existing GEN-16/61/66 badges can share a primitive without losing safety meaning.
- Whether the global public CTA should become “Enter your vault.”
- Whether the `.dark` palette passes contrast, warmth, and owner-taste review in the authenticated shell.

## Active slice: public extension bridge

Allowed files:

- `app/extension/page.tsx`
- `components/layout/MarketingNav.tsx` (accessible name only; shared behavior unchanged)
- `components/marketing/ResearchSpine.tsx` (new)
- `scripts/check-public-research-spine.ts` (new behavior lock)
- this specification

Required behavior:

- Render the existing shared marketing navigation and footer.
- Preserve an accessible home name when the mobile wordmark is visually hidden.
- Explain Capture → Vault → Research → Story through the reusable spine.
- Preserve both extension download links and the `/app/imports` destination.
- Preserve the user-mediated, consent-based FamilySearch capture boundary.
- State that capture does not itself publish family-history data.
- Remove the prose-breaking `break-all` treatment.
- Keep extension runtime, FamilySearch interaction, private routes, auth, and data untouched.

Proof:

- Run the focused behavior lock directly because the active PR stack owns the shared package/verify registration files.
- Run typecheck, lint, production build, and the public marketing route smoke gate.
- Browser and accessibility proof at widths 390, 768, 1024, and 1440, including horizontal overflow and console checks.
- Fresh independent AI review of the final diff; correct accepted findings before the draft PR.

## Next revalidation action

After this slice is browser-proven and PRs #12-#18 have drained, inspect the authenticated shell with synthetic or empty-vault state only. Compare the current GEN-16/61/66 status treatments and GEN-82 top bar against this four-dimension model. Then decide whether a shared status primitive or workspace navigation change is still useful. No private family-history record is required for that decision.
