# Cross-model code and taste review: foundation tranche

- **Reviewed head:** `903c7040da1058bd24215d538e5aa7e028eaef97` (branch `design/assistwithfamilyhistory-council-2026-11-05`)
- **Baseline:** `99980b51ca02dc24642c3d634a8de67b559d896d`
- **Code author:** Codex gpt-6.1-sol
- **Reviewer / AI tastemaker:** Claude Opus 5.5 (`claude-opus-5-5`). Read-only. This is a code and taste review, not formal blinded scoring.
- **Date:** 2026-11-05 (America/Phoenix)
- **Method:** read the brief, capabilities, folio system doc, Assist playbook, and the full diff (16 files). Checked routes, auth/proxy, Convex summary shape and token use. Viewed the round-1 `ours` captures (home desktop/mobile/dark, people dark), the baseline home and the decided `home--desk-trays--desktop` reference. Did not run a browser, tests or a build.

## Verdict

**Approve as a foundation tranche, with changes requested before it counts as a Home round.** It is safe and removes nothing: there are no auth, Convex, proxy, import or publishing changes, and the harness is properly gated. The tokens, type and surfaces are moving in the right direction. Structurally, though, Home is still the old dashboard with new styling, not the decided desk-of-trays pattern. One change also weakens meaning: it turns the gap and unsourced warnings from rust into the teal used for links and actions. Neither problem blocks the commit. Both should be fixed before Home goes to blinded judging.

## Safety, privacy and auth

- **No backend or auth changes.** `git diff --stat` shows nothing under `convex/`, `lib/`, `proxy.ts` or `app/app/`.
- **The harness is gated.** `app/design-council-preview/page.tsx:28` calls `notFound()` unless `NODE_ENV === "development"` and neither `VERCEL` nor `CI` is set. `NODE_ENV` is inlined at build time, so a production build always returns 404. `robots: noindex`. The fixtures are invented, and the sidebar gets `vaultOwnerId="synthetic-design-only"` only as a prop. The shell components make no Convex queries, so nothing reaches a backend. The route sits outside `/app/*`, so it is not hidden behind auth, but it also does not bypass any: it never touches a protected read. Acceptable.
- Residual (Info): any `next dev` server bound to a LAN interface serves this page. The data is synthetic, so the risk is nil. Mention it in the folio doc so no one copies the pattern with real data.

## No-removal audit (verified)

- **Home populated:** all six totals, recent people (name, lifespan, status, critical gaps), Story Studio and Research Queue actions, recent imports and their empty state, the four workspace stations with descriptions, and the AI context packs paragraph are all present. Removing `truncate` on names *adds* information. The count tiles become links, which adds access (`/app/research` is the correct destination for open tasks: that page renders "Open Tasks").
- **Home empty:** markup unchanged apart from one border class.
- **People:** the search input, every research-state option, the Filter submit, the import/first-start actions, person links, lifespan, status, Living/Deceased, unsourced provenance, all five counts, last import and pagination are all present.
- **Hidden, hover-only, icon-only or deeper:** none found.
- **Information *weakened* (not removed):** see F1. The warning semantics of "critical gaps" and "needs a source" lost their distinct colour.

## Findings (most severe first)

### F1 · Medium · Warnings recoloured to the link/action colour
`components/vault/DashboardView.tsx:134-136` (critical gaps span) and `components/vault/PeopleExplorerView.tsx:106` ("Starting statement · needs a source"): `text-amber-800` and `text-amber-700` became `text-primary`.
In the screenshots, "3 critical gaps" now looks like a teal link inside a row that is already a link. The brief says *uncertain claims … remain distinguishable*, and the folio doc assigns **rust to annotations**. The tranche adds `--annotation` and `--annotation-surface` in `app/globals.css:54,100`, never registers them in `@theme inline` (no `--color-annotation`), and uses them nowhere. The palette has lost all of its rust: the page is now monochrome teal.
**Fix:** add `--color-annotation`, `--color-annotation-surface`, `--color-evidence` and `--color-evidence-surface` to `@theme inline`. Render gaps and unsourced flags as `text-annotation`, ideally as a small chip with an icon (playbook §2.3) so colour is not the only signal. This is the cheapest fix with the biggest effect.

### F2 · Medium (taste/structure) · Home is not yet the decided desk-of-trays pattern
`components/vault/DashboardView.tsx` (whole populated branch).
Compared with `home--desk-trays--desktop.jpg`:
- **Tab labels:** `.folio-tray:before` (`globals.css:277`) draws an *unlabelled* 3rem nub. In the decided pattern the tray's label sits in the folder tab (small mono caps, e.g. "RECENTLY TOUCHED"), with one large count at top right and one named link in the footer. Here the label stays in a grey header bar and the nub reads as a rendering artefact. It repeats eight times on one screen, on each station card as well.
- **Generic grid:** "Everything in your workspace" (`:206-224`) is a 2×2 grid of identical icon cards that repeats the sidebar. That is the playbook §7 anti-pattern "generic SaaS bento grid of identical cards with no focal point". Wrapping each card in `folio-tray` makes it look more like a tray without making it one.
- **Count tiles:** a 3×2 grid of bare numbers with labels, separate from their trays. In the pattern, each tray carries its own count.
- **Unused data:** evidence-first trays are possible today with no backend change. `getDashboardSummary` already returns `operationsHighlights` (people sorted by `requiredMissingCount`, top 5) and `counts.provisionalRelatives`, and `DashboardView` uses neither (it didn't at baseline either). A **Research gaps** tray (count = sum of required-missing, top 3 people, "Work the Research Queue ›") and a **Recently touched** tray (existing `recentPeople`, image slots) need nothing new from the backend. **Recent imports / Intake** and **Stories** trays come from existing counts and links.
**Fix:** see "What to fix first".

### F3 · Medium · The committed gallery uses absolute local file paths
`design-council/2026-11-05-family-folio/build-gallery.py:13` writes `src="{image}"` with `str(image)` as an absolute path. The committed `gallery.html` therefore contains `/Users/scottjarvie/.t3/worktrees/…/round-1/ours/*.png`, and those images are git-ignored (`.gitignore:78`).
The gallery renders only on this machine via `file://`, and not at all as a claude.ai artifact. Playbook §6.3 exists because the gallery has to work *inside claude.ai*. Commit 903c704 says it "fits inline artifact constraints", but no image will load there. It also writes the local username and worktree path into a tracked file.
**Fix:** write paths relative to the run folder (`image.relative_to(run)`). When publishing, upload the PNGs as artifact files or assets, or inline them as downscaled `data:` URIs within the 16 MB limit. Also `html.escape(..., quote=True)` the `src`.

### F4 · Low-Medium · Count links: no visible affordance, and Documents opens the wrong place
`DashboardView.tsx:152-163`. The tiles are now `<Link>` elements but have no hover, focus or underline style, so they look exactly like the old static numbers and the new capability can't be discovered. Add `hover:bg-muted/60` and a `focus-visible:ring` to each tile.
`:156` sends **Documents → `/app/people`**, a page that lists no documents. `rounds.md` discloses this honestly. Still, it misses playbook §3.6 ("no number without its records"). Until a "behind the number" drawer exists, either link to `/app/source-docs` (if that route lists documents; verify first), or leave the tile non-interactive with a "per person" sub-label rather than imply it leads to the records.

### F5 · Low · Dark mode cannot be reached in the product; the shell stays light
Nothing outside the harness applies `.dark` (`app/design-council-preview/page.tsx:30` is the only setter, and there is no ThemeProvider or `prefers-color-scheme`). So the dark tokens and the "dark People readability" fix affect only harness captures today.
In those captures, `components/layout/AppTopBar.tsx:27` (`bg-white/95 border-stone-200`) is a bright white strip across the top, and the empty-state hero (`DashboardView.tsx:49-79`) still hard-codes `#1f2f35`, `stone-*` and `amber-*`.
**Recommendation:** fix the top bar's tokens next. It is a single line and appears in every capture. Don't score dark captures as user-facing until Scott decides whether the product gets a theme switch or follows the system setting. That decision changes product behaviour, so it is his call.

### F6 · Low · `.folio-tray-heading h2` font size is dead CSS
`app/globals.css:276` sets `font-size:.875rem`, but every tray `h2` carries `text-lg`, and utilities beat components. Only the font-family override takes effect, turning the baseline Cormorant tray titles into sans. That may be intended (the folio doc says tray headings use Instrument Sans), but the dead `.875rem` hints that small tab-style labels were meant (see F2). Either remove it or adopt the label-in-tab design.

### F7 · Low · Recent-people row layout
`DashboardView.tsx:127-128`:
- The new inner `<div>` lacks `min-w-0` and `break-words`. With `truncate` gone, an unbroken token (a long FamilySearch-style ID or hyphenated name) can overflow the row.
- The JSX between lines 128 and 140 is indented one level too shallow.
- A 56px illustration repeated identically on every row raises row height about 40% and adds no recognition, since every person shows the same document glyph. The playbook wants an image slot, and that is satisfied. For taste: 40px is enough, and a slot that varies by something real (e.g. initials, or a different glyph for unsourced records) would earn its space. Don't let it suggest a portrait exists (the folio doc already says this).

### F8 · Low · `build-gallery.py` robustness
- `:6` `int(p.name.split('-')[1])` crashes on `round-1b` or `round-final`.
- The UTC timestamp written into a tracked `gallery.html` dirties git on every rebuild.
- The CSS has no dark variant. The artifact contract wants tokens and dark mode, but this is cosmetic.

### F9 · Info · Body background flattened
`globals.css:152`: the third gradient is now a solid `var(--background)` in both stops. The light parchment loses its gentle 3-stop drift, which is fine and nearly invisible. A plain `var(--background)` colour would be simpler than a gradient between two identical stops.

## Taste decision (AI-side, Scott overrides)

**Direction: right flair, structure not yet started.** The parchment, the Cormorant H1 with the mono "YOUR RESEARCH DESK" kicker, hairline trays, the calmer radius and the teal primary all read as a crafted archival folio rather than SaaS. That is a clear improvement on baseline, and dark People is readable now.

What's off:
1. Removing all rust made the page cold and flattened its one attention signal (F1).
2. The tray nubs are decoration without function (F2).
3. The page leads with the same rows plus a grid of navigation cards, not evidence-first trays.

It is heading the right way, but it is **not** yet the decided Home pattern, and I would not call Home done or put it to blinded scoring as a "trays" round.

## What to fix first (ordered)

1. **F1:** register the annotation and evidence colours and restore rust chips for critical gaps and unsourced records (Home and People). About 15 minutes; restores meaning.
2. **F2:** rebuild the populated Home as labelled trays (label in the folder tab, one count, top 3-4 items, one named footer link), evidence first. Use existing data only, at most about seven trays:
   - Recently touched people (image slots)
   - Research gaps (`operationsHighlights` + `openTasks` → `/app/operations` / `/app/research`)
   - Recent imports / Intake (`recentImports`, `counts.imports`)
   - Stories (`counts.stories` → Story Studio)
   - Places (`counts.places`)
   - Provisional relatives, only when `> 0`
   - With your AI, only if a real queue summary exists (do not invent it)

   Fold the six totals into their trays. Keep "Everything in your workspace" as a compact one-line index, or drop it to the bottom as a list, rather than a 2×2 bento. Keep every link and description so nothing is removed. Keep the context-pack paragraph.
3. **F3:** make the gallery portable before showing it to Scott.
4. **F4 and F5:** add count-link affordance and a correct Documents destination; give the top bar semantic tokens.
5. The rest when convenient.
