## Opus review: Story/record fixes (`cf9ef0e`) and personal Queue (`76b04ba`)

**Verdict: changes required.** The record fixes are accepted. The Queue keeps every original field, action and privacy guard, but it has one functional bug (Q-B1) and a navigation problem (Q-R1) that must be fixed before it becomes the Queue template.

This was a read-only review at frozen head `76b04ba33818752a0ee7324af83dd5e276920dea`. I edited nothing, started no servers or browsers, ran no checks, and did not delegate. It is not a formal scored round and it clears no other pages.

---

### 1. `cf9ef0e`: findings from my earlier review (`opus-place-story-0bafa4f.md`)

| # | Status | How I checked |
|---|---|---|
| **R1** counts are counts of real records | **Resolved** | The Review count is now blockers plus warnings, with "5 blockers · 3 warnings · N passed". Edit has no count; the type allows that and Contents shows "Open". The Life detail spells out each kind. Every capped list says "first N returned". I checked the caps against `convex/vault.ts`: evidence 8 sets of 3 citations, events 8, places 8, media 6, context 8, history 12. |
| **R2** active tab off-screen on phones | **Resolved** | `scrollIntoView({inline:"nearest"})` now runs on activation. |
| **R3** tabs cut off at 1440 | **Resolved** | The `xl` padding is tighter and the glyph is hidden between `lg` and `xl`. A scroll-edge fade is added. The `story-record` desktop capture shows all seven tabs plus "All 7" with nothing cut off. |
| **R4** "1 earlier entries" | **Resolved** | Fixed in both files. |
| **B1** "Open all 0" | **Resolved** | The link is hidden when the count is 0. |
| **B2** `WorkspaceStateCard` dark mode | **Resolved** | Uses theme tokens; no stone or white colours remain. |
| **B3** Person aliases hard-coded in the kit | **Resolved** | Each page now passes its own aliases (`RecordAlias[]`). |
| **T1** whole-draft source margin | **Resolved; the reader family is accepted** | At `xl` there is a rail headed "Recorded for this draft · Whole draft, not per paragraph" with citations, source facts, packs by title, a count of other person sources, and a cap note. On phones it is a "Draft sources · N" disclosure. The reading column is capped at about 68 characters. Evidence-tab badges and "AI-generated · which AI not recorded" are in. |
| **T2** phone dossier height | **Done** | Facts are two across and the three actions sit in one row. The story still starts just below the first 844px screen, which is acceptable. |
| **T3** Review panel | **Done** | Gates are sorted blockers first, warnings show on their matching gate row, codes are spelled out, and left borders replace tinted cards. |
| **T4** Review activity | **Done** | Rows now use the stream style with a glyph, date and actor chip. |
| **T5** Place "How to use" | **Done** | The evidence stream now leads. Single-group chips are hidden. |
| **T6** editor preview on phones | **Done** | The preview is hidden by default when the column is narrower than 768px; the toggle stays. |

**New small issues in `cf9ef0e`** (none blocking):
- **C1 · Honesty.** The Evidence badge "Other person source" claims something the page can't know. Each returned set carries at most 3 citations, so a set that shows 3 may hold the draft's citation beyond the cap. When `citations.length >= 3` and none match, say "No recorded citation among the first 3 returned".
- **C2 · No pending feedback on phones.** In the compact status actions, `[&_svg]:hidden` also hides the `Loader2` spinner below `lg`, so a phone shows no pending state beyond the disabled buttons. Hide only the decorative icons.

---

### 2. `76b04ba` Queue: privacy, preservation and contracts

I checked these in the source, comparing against `cf9ef0e:components/queue/QueueWorkspace.tsx`.

**Server page:**
- It adds only `getVaultAccessContext()`, which the `/app` layout already calls, so there is no new failure path.
- It passes the owner-scoped key `awf.collection.queue.${vaultOwnerId}`, matching the other collections, and keys the component by owner.
- It passes `normalizeQueueFilters(searchParams)`, which yields primitive strings only. No vault records reach the browser.

**Writes:**
- POST, all six PATCH commands and DELETE are unchanged:
  - same body fields, including `leaseMs` 30 minutes, `nextStep`, `answerSummary`, `resultSummary` and `reason`;
  - `expectedVersion`, a per-submit `idempotencyKey`, `chosenAiId:"oauth-chosen-ai"`;
  - the 409 message, the `maxLength` limits, the required high-priority reason;
  - the exact DELETE confirmation with "Keep it".
- The only change is that detail IDs are now `encodeURIComponent`-escaped, which is an improvement.

**Drafts:**
- Drafts live in React context only (`QueueDrafts`). Nothing reaches localStorage, and the provider sits under the owner key.
- Draft keys are `itemId:command`. They survive filter changes, the list unmounting during a state reload, the action form closing on a version change, and a 409.
- Drafts are cleared only after a successful write.

**Reads:**
- List and detail requests are sequenced, so a late response can't overwrite a newer one, including "Older activity".
- State is still fetched from the server. Other facets apply only to loaded items, and the copy says so.
- Counts are labelled "counts in the current load", show "Not in this load" for states outside the current filter, and read "Unavailable" on error.
- Built-in views carry no fabricated counts.

**Result references:** the known-route allowlist (`queueResultLink`) is unchanged. Other references are rendered as `break-all` plain text.

**Newly visible stored fields:** priority reason, handoff expiry, last response, reopen reason, cancellation reason, failure plus code, authority note, and raw context references (inside a disclosure).

**Actor truth:** the backend clears `activeActorKind` on every release (`convex/queue.ts`), so the "AI working" view (state working + any AI) and the actor column are truthful.

**Week boundary:** "Done this week" starts Monday 00:00 UTC, uses `completedAt ?? canceledAt`, and excludes items with no close date. Dates show as UTC.

**Harness:**
- `queue-live-controller` returns not-found when `isConvexConfigured()`.
- Without Convex, `/api/queue` itself returns unavailable.
- The NODE_ENV, VERCEL and CI gates still apply.
- In the readonly preview, every submit returns early and the buttons are disabled.

**Not implemented, as intended:**
- `needs_you` stays a stored state; no cross-state flag is advertised.
- No archive or restore was invented. I confirmed none exists in the source.

**No-removal check:**
- Present: the heading and purpose text, the Research Queue distinction, MCP/OAuth "See setup", "nothing runs until claimed", the four state explanations, state toggles, search, load more, the full thread with Older activity, the ledger, grouped attached context, delete, the empty/denied/error/loading states, and the privacy footer.
- Removed: nothing.

**Verdict on the preservation map:** it is accurate, with one wording error. It says phone answer-first "reorders the actual DOM with CSS". It doesn't. CSS `order` changes only the visual order; the DOM, and therefore screen readers, still read "You asked" first (see Q-T6).

---

### 3. Blocking bug

**Q-B1 · Answering in a row breaks or resets the selected thread** (`QueueWorkspace.tsx`, `replaceItem`).
- `RowReply` calls `onChanged` (that is, `replaceItem`) for whichever row was answered. `replaceItem` assumes that item is the selected one.
- **In "Everything":** `setDetail(c => ({...c, item}))` grafts row B onto thread A's detail, then `loadDetail(B)` replaces the detail with B's. The selected ID stays A, so the render check `detail.item._id !== selectedId` shows "Loading selected Queue item" indefinitely. Nothing re-fetches A.
- **In "Needs you"**, where in-row answering matters most: the state-leaving branch calls `setSelectedId(null)` and clears `?item=`, so the thread the person was reading jumps to another item.
- **Why tests missed it:** the intercepted check answers a row other than the selected one but asserts only that the form closes.
- **Fix:**
  - Update `items` for any changed item.
  - Touch `detail`, and call `loadDetail` or clear the selection, only when `item._id === selectedId`.
  - Add an acceptance assertion that the selected thread title is still rendered after an in-row answer on a different row.

---

### 4. Required fixes before the Queue is reused as a template

**Q-R1 · Navigation is the real problem: a full-width table plus a thread underneath doesn't support efficient triage.**
- The thread renders below the entire collection. With 7 invented items it starts about 1,950px down on desktop; on a phone it is past roughly 4,000 CSS px of a 5,759 CSS px page. At the real page size of 25 rows, every row click jumps several screens.
- "Back to loaded handoffs" returns to the top of the collection, not to the row you came from.
- There is no previous/next within the thread.
- The first item is auto-selected and fully loaded on every visit and every filter change, which makes the default page twice as long and adds a detail GET.
- The viewport captures prove that the reveal works, not that the navigation is efficient.

**What to build instead:** keep the decided pattern and change how the item opens.
- **Desktop (`lg` and up):** open the thread in a right-hand sheet, about 44–48rem wide, over the full-width table.
  - `?item=` drives it.
  - Esc or Close returns focus to the originating row.
  - The table keeps its scroll position and column comparison.
  - Add ↑/↓ or "Previous/Next loaded" in the sheet header.
- **Phone:** open the thread as a full-screen view with the answer first and a sticky Back that restores the row's scroll position.
- **Both:** no auto-selection; load the detail only when an item is opened. Direct `?item=` links still open the sheet or view.
- No new route is needed, so this involves no fabrication or contract change.

**Q-R2 · "Older activity" sits in the wrong place for an oldest-first list.** The loaded history is sorted oldest first, but the button stays at the bottom. Older entries are then inserted at the top, out of sight. Move the button above the first entry and keep scroll anchored.

**Q-R3 · False AI hint (existed before this commit, now in scope).** The focus block shows a `Bot` icon for every state except a person's own working claim. A Done item the person completed, or a needs-you pause, reads as AI-attributed. Use a neutral state glyph, or derive the icon from the latest activity's `actorKind`.

**Q-R4 · "Current actor: Not recorded" is wrong copy.** An empty `activeActorKind` means nobody holds the item now, not that the field is missing. Use "None (unclaimed)".

**Q-R5 · No way to recover from a conflict.** The 409 message says "Reload it before trying again", but the form offers no reload. Now that drafts survive, add a "Reload this item" action next to the error. It should call `loadDetail` and keep the draft; this is client-only. Before this, retrying sent the same stale `expectedVersion`.

**Q-R6 · Filter sheet** (the playbook's open item from §3.3).
- Show loaded counts on each facet option ("high · 2 loaded").
- Fix the labels: "All states", "Any priority".
- Don't close the sheet on every tap; offer Done, so several facets can be chosen in one pass.
- The existing API also accepts `priority` on the server. Consider sending it so the priority facet stops being load-limited. That is not a contract change.

**Q-R7 · Hydration mismatch on repeated URL keys.** With duplicate keys (`?state=a&state=b`), the server reads the first value and the client (`Object.fromEntries(URLSearchParams)`) reads the last. Normalise both with `getAll(k)[0]`.

---

### 5. Taste calls (final AI tastemaker; Scott overrides)

- **Q-T1 · Group tables don't line up.** Each state group is its own table, so the columns sit at different positions from group to group. The table header row also repeats in every group. Use fixed column widths in the shared kit and one table head, or sticky group rows.
- **Q-T2 · Label inconsistencies.**
  - "Needs You" and "Waiting For Your AI" in the group headers (title-cased) vs "Needs you" on the view tab. Use sentence case from one label source.
  - Separator spacing on phones: "answer· Priority" is missing a space.
- **Q-T3 · Phone header.** The setup line breaks across four lines: icon, sentence, "See setup", sentence. Make it one paragraph with an inline link.
- **Q-T4 · Focus ring and fixture dates.**
  - The programmatic-focus ring on `#queue-selected` sits right against the "Selected thread" text. Add padding or a ring offset, or show the ring only for keyboard-initiated reveals.
  - The fixture's expired item says Updated Nov 3 but Submitted Nov 4, and its trail is dated after expiry. Fix the fixture so judges don't misread the data.
- **Q-T5 · Built-in view tabs without counts are honest and right.** Don't add counts until the server can supply them.
- **Q-T6 · Answer-first only for sighted users.** Phone answer-first uses CSS order only. It is fine visually, but screen readers get ask-first on phones. Either render the DOM in answer-first order and lay out desktop with grid areas, or accept the difference and fix the wording in the preservation map.
- **Keep as is:**
  - the compact heading replacing the dark hero;
  - the state dictionary after the data;
  - "You asked" / "What needs you" / "Recorded result" block naming;
  - the ledger with newly visible stored fields;
  - the 240-character preview with "Read full update";
  - the readable light and dark states.

---

### 6. Constraints that need backend work (not this tranche)

- The persisted cross-state "Needs you" flag, which needs a model migration. This is Scott's decision.
- Server-side search, condition, actor and week filters, and true counts per view.
- Activity order and cursors are newest-first from the server.
- Idempotency keys are minted per submit, so a retry after an uncertain response is not idempotent. This existed before.
- Archive/Restore does not exist.

---

### Reuse decision

- **Record kit, Story reader and Place:** approved for reuse after C1. C2 is optional.
- **Queue:** not yet approved as the Queue template.
  - **Fix first:** Q-B1. It is small and clearly scoped.
  - **Before any other site copies the Queue:** Q-R1 (sheet or full-screen thread, no auto-selection, return to the originating row, previous/next), plus Q-R2 to Q-R5.
  - **When the filter interaction is revisited:** Q-R6 and Q-R7.
  - **Privacy, preservation and the command contracts:** approved now; nothing needs to change there.

**Screenshots inspected:**
- `queue-records`:
  - `queue--desktop`, full page;
  - `queue-item-answer-viewport` desktop and phone;
  - `queue-item-result-viewport` phone (dark);
  - `queue-filter-dark` phone;
  - `queue-new` phone;
  - `queue-expired` phone (thread and ledger);
  - `queue-denied-dark` phone.
- `record-review-fixes`: `story-record` desktop and phone.
- Code read against the `check-queue-api.mjs` interception.

**Receipt:** exact head `76b04ba33818752a0ee7324af83dd5e276920dea`, covering `cf9ef0e` and `76b04ba`, compared with the original Queue at `cf9ef0e` and the record review at `0bafa4f`. **Author:** Codex gpt-6.1-sol. **Reviewer:** Claude Opus 5.5 (read-only). **Verdict:** records approved; Queue changes required, with one blocking client bug (Q-B1) and a required navigation rework (Q-R1). No privacy or capability regressions. No site-wide acceptance and no formal score.
