# Hydration Mismatch Notes (`SafeLink` workaround)

Last updated: 2026-05-22 (GEN-76)

## What we know

Commit `4354084` (Add Experimental Tools Lab, 2026-05-21) said:

> Suppressed known browser-extension anchor hydration noise on app-shell and person-workspace links found during QA.

It did not name the offending extension, attribute, or repro steps. The commit added `suppressHydrationWarning` to ~30 anchors. Later commits consolidated the workaround behind `components/layout/SafeLink.tsx` and `SafeAnchor`.

## What we've ruled out (from code inspection only)

These are common hydration-mismatch sources. None of them apply to the affected anchors:

- **Date/time formatting**: none of the suppressed anchors render dates server-side.
- **`typeof window` branches**: app-shell links don't condition on browser availability.
- **Random IDs / `Math.random`**: app-shell links use stable hrefs.
- **`Date.now`/`new Date()` in JSX**: not present in the suppressed paths.
- **Locale-formatted numbers**: not present.

That leaves browser-extension DOM mutation as the most likely cause, but it has not been *confirmed* against a specific extension.

## Browser extensions known to mutate anchors

Listed in order of likelihood for this codebase based on user-reported QA notes (none confirmed):

1. **Grammarly** — injects `data-gramm`, `data-gramm_editor`, `data-enable-grammarly` on editable text containers and sometimes anchors. Most common false-positive in React apps.
2. **LastPass / 1Password / Bitwarden** — inject icons / form helpers, but typically on `<input>`, not `<a>`. Lower likelihood.
3. **Honey / Capital One Shopping** — coupon injection. Mutates anchors that match deal patterns. Lower likelihood.
4. **Google Translate (auto-translate page)** — wraps text nodes; rarely directly modifies anchor attributes.
5. **Dark Reader / Stylish** — adds inline styles; wouldn't mismatch attributes but could cause class-name diffs in extreme configurations.
6. **FamilySearch helper extensions** — unverified; the project is FamilySearch-adjacent, so worth checking.
7. **Privacy Badger / uBlock Origin** — typically remove/block elements, not modify them. Lower likelihood for hydration mismatch.

## Repro plan (needs a human at a keyboard with Chrome)

The agent can't run the browser; this is the step-by-step a human/QA can follow when the time comes to close GEN-76:

1. **Establish baseline.** Temporarily revert SafeLink to plain Next.js `Link` in one file (e.g. `components/layout/Footer.tsx`). Run `pnpm dev` and load `http://127.0.0.1:3443/` in Chrome **with no extensions enabled**. Verify no hydration warning in console.

2. **Enable one extension at a time.** Re-enable one extension, reload. Repeat for each of the candidates above. The first one to make the warning reappear is the suspect.

3. **Inspect the offending anchor.** With devtools elements panel, find the anchor that React's warning identifies as mismatched. Compare the SSR HTML (`view-source:`) with the live DOM. The injected attribute will be in the live DOM but not the SSR HTML.

4. **Document the attribute name.** Add to this file:

   ```
   Confirmed extension: <name>
   Injected attribute(s): data-foo, data-bar
   ```

5. **Decide remediation.**

   - **Option A (preferred):** Strip the attribute client-side via a layout `useEffect`. Remove SafeLink and unwind the migration. The single layout effect catches the extension's mutation cleanly.
   - **Option B:** Keep SafeLink permanently and document the extension in `SafeLink.tsx`. Acceptable if the extension is non-removable for the target user population.
   - **Option C:** Selectively `suppressHydrationWarning` only on the *specific* attribute (React supports this when scoped to particular children). Not always possible.

## Why this isn't being done now

- **Agent doesn't have a live browser.** Step 2 requires human interaction with Chrome's extension manager.
- **It's a behavioral fix, not a security fix.** The other 9 audit findings (GEN-69 through GEN-75, GEN-77, GEN-78) are higher impact and don't require browser repro.
- **SafeLink works.** Per `pnpm check:safelink-suppression`, the wrapper correctly applies the prop. The risk is "we don't know *why* we need it," not "it's broken."

## When to revisit

Re-investigate when:
- A user reports a hydration warning despite SafeLink being used (signals the workaround isn't actually working).
- Next.js upgrade changes anchor handling.
- The project ships outside the developer's own browser and we need predictable behavior.

Until then this is a documented known-unknown rather than an unowned mystery.
