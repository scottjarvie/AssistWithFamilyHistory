---
id: AWF-WO-012
title: Let a chosen AI propose which record to believe, and let the person confirm it
execution: proposed
audit: not-audited
cards: AWF-0046, AWF-0047
created: 2026-08-17
updated: 2026-08-17
proposed-by: Claude, after building the person half of the conflict lifecycle
---

## Goal

A person opens a conflicting fact and finds their AI has already done the
research: here is what the parish register says, here is what the family bible
says, here is which one I believe and exactly why, and here is the evidence on
both sides. They read it, and confirm or decline in one act. The reading that
lost stays in the vault either way.

This Work Order builds the **proposal**. It does not build AI resolution
authority, and it must not, until AWF-0046's open question is answered.

## Why this bundle exists

Conflict is the ordinary condition of genealogy. The vault can now flag one, show
both readings, let its owner settle it with recorded reasoning, and keep the
losing record — that shipped on 2026-08-17. And a connected AI can now finally
*see* conflicts, because the field claiming to hold them held import warnings
instead.

What is missing is the part people actually want automated. Clicking "I believe
the source" takes two seconds. Finding the parish register, reading the family
bible transcript, noticing that one was written within days and the other copied
decades later, and writing that down — that is the work. An AI can do it. Today
it can only leave the result as free-text research notes with nothing linking it
to the conflict it answers, so a person has to find the note, find the fact, and
re-do the comparison in their head.

AWF-0047 belongs in the same bundle for a blunt reason: this Work Order's whole
value is putting a careful comparison in front of a person at the moment they are
deciding. Shipping that on top of a detector that compares a city to a year would
spend the AI's research effort, and the person's attention, on conflicts that are
not conflicts.

## App / AI split

Assist With Family History owns the conflict record, the proposal record, the
review surface, the decision, the durable research log, and final authority over
which reading the vault believes. The person's chosen AI owns the research: the
gathering, the comparison, the reasoning, and the recommendation.

The line between them is the subject of AWF-0046 and is currently: **the AI
proposes, the person confirms.** Nothing in this Work Order may move it.

## Current truth

**Current, on `claude/fh-conflict-visible`, `pnpm verify` 57/57.**

- `structured.unresolvedConflicts` in the AI context pack carries the real
  `sourceFacts` conflict rows, with both readings, the citation behind the
  disagreeing one, and the authority statement
  (`convex/contextPackBuilder.ts`).
- `citations.conflictsWith` has its first reader, so the opposing record travels
  with the conflict.
- `vaultMutations.resolveSourceFactConflict` settles a conflict from the person
  workspace via `/api/operations/conflicts`, requires a reason of at least 20
  characters, records it to `researchLog`, closes the `conflict_resolution` task
  once the last conflict on that person is settled, and deletes nothing.
- `mayAiSetSourceFactStatus` (`lib/vault/conflictResolution.ts`) refuses any MCP
  write that takes a fact out of `conflict`, closing a hole that would otherwise
  have let an AI resolve one by re-saving it with a new status.

**Partial.** Proposal is possible but shapeless. An AI proposes through
`family_history_save_research_work` — a research task note or finding — with no
structured link to the `sourceFacts` row it answers, no place in the person
workspace where the proposal appears beside the conflict, and no way to accept it
in one act. The person has to reconstruct the comparison themselves, which is
most of what they were trying to avoid.

**Blocked.** Nothing here may widen AI authority. AWF-0046 is `needs-you` on
exactly one question: may a chosen AI ever settle a conflicting fact itself, or
only propose? The recommendation on that Card is propose-only, permanently. If
Scott chooses that, this Work Order is unblocked as written. If Scott chooses
otherwise, this Work Order stays the right shape and a separate, explicitly
approved piece adds the authority — with a rewritten consent screen, because
the current one says the opposite.

**Later / excluded.** General in-vault conflict detection between any two
citations already in the vault; conflict types beyond name, birth, and death;
FamilySearch-side conflict resolution; and any automatic rewriting of a person's
canonical fact when a source reading is believed.

## Sequence

1. Fix AWF-0047 first. Compare like with like in the detector, and assert the
   absence of the false conflict in `scripts/check-source-facts.ts`. Everything
   after this puts research effort and human attention on whatever the detector
   emits, so it should emit only real disagreements.
2. Design the proposal record. Smallest shape that carries the work: which
   `sourceFacts` row it answers, which reading it recommends, the reasoning, and
   the evidence on each side as citation references. Prefer extending an existing
   table over inventing a new concept; `researchTasks` of type
   `conflict_resolution` already exist and are already opened per person, so the
   honest question is whether a proposal is a task field, a `researchLog` entry
   with a typed shape, or its own row.
3. Let the AI write one through the existing `family_history:research:write`
   permission. No new scope. A proposal is a proposal whichever record holds it,
   and it must be refused the moment it tries to be a decision.
4. Show it in the person workspace beside the conflict it answers: both readings,
   the AI's recommendation, its reasoning, the evidence on each side, and who
   proposed it. Confirming pre-fills the reason from the AI's reasoning and calls
   the existing `resolveSourceFactConflict` — the person's words remain editable,
   and the resulting `researchLog` entry must record that the reasoning came from
   an AI proposal the person accepted, not from the person unaided.
5. Add declining as a first-class outcome. A declined proposal stays visible with
   the person's reason, because "my AI suggested the census and I disagreed"
   is exactly the kind of research judgment this product exists to preserve.
6. Make a vault with many conflicts workable: review proposals in a list, and
   confirm several in one pass, without ever confirming one the person has not
   read.
7. Verify, including the two-owner and refusal cases, and run the browser checks
   on desktop and phone.

## Dependencies

- AWF-0046's authority decision, for step 3 onward.
- The shipped conflict-resolution slice: `resolveSourceFactConflict`,
  `/api/operations/conflicts`, `lib/vault/conflictResolution.ts`, and the
  corrected context pack.
- AWF-WO-011's connection surface: a proposal is only reachable by an AI a person
  has actually connected and granted `family_history:research:write`.
- The `conflict_resolution` research task the FamilySearch importer already
  opens (`lib/familysearch/importer.ts:275-284`).

## Exclusions

- No AI authority to set a `sourceFacts` row to `accepted` or `rejected`, by any
  tool, batch, or path, unless AWF-0046 is decided otherwise and a separate
  approved piece of work implements it with revised consent copy.
- No deletion of a losing reading, its citation, or its source, under any
  outcome.
- No automatic rewriting of a person's canonical name, birth, or death fact when
  a source reading is believed. That stays a separate deliberate edit.
- No auto-confirming a proposal, however confident the AI says it is, and no
  "confirm all" that does not require the person to have seen each one.
- No new OAuth scope, no widened `research:write` limit text, and no change to
  `NEVER_PERMITTED` within this Work Order.
- No conflict detection between two citations already in the vault. Real work,
  different bundle.

## Stop rules

Stop and return to Scott if the design starts to need AI resolve authority to be
useful; if the consent-screen sentence "Proposals only. It cannot accept a
conclusion for you" would have to change; if a proposal record would need to
carry living-person private notes to be legible; or if batch review cannot be
built without a path that confirms something unread.

## Verification

- `scripts/check-source-facts.ts` asserts the AWF-0047 false conflict is gone,
  and the repository fixture mutated to disagree on birth date yields exactly one
  conflict.
- Convex-runtime tests: a proposal is owner-scoped and invisible across vaults; a
  confirmed proposal produces the same durable `researchLog` reasoning path as an
  unaided resolution, additionally recording that an AI proposed it; a declined
  proposal survives with the person's reason.
- An MCP test proving every proposal path is still refused with `FORBIDDEN` when
  it attempts to set a status out of `conflict`, extending the existing case in
  `convex/mcpFamilyHistory.test.ts`.
- `scripts/test-context-pack-conflicts.ts` extended to assert an open proposal
  travels with its conflict in the context pack, so a second AI does not redo
  work a first one already did.
- `pnpm verify`, `pnpm tracker:verify`, and `pnpm tracker:verify-browser`.
- Browser checks of the conflict review surface at desktop and phone widths,
  including the many-conflicts case.

## Human gates

1. Scott answers AWF-0046: propose-only, or may an AI resolve? Steps 3 onward do
   not begin until then. Step 1 (AWF-0047) is unblocked now.
2. Scott approves this Work Order moving from Proposed to Ready.
3. Any change to consent copy, scope text, or `NEVER_PERMITTED` is a separate
   explicit gate, not part of execution.

Routine design, implementation, tests, fixtures, and documentation inside the
approved shape do not need repeated technical approval.

## Execution evidence

Not started. The prerequisite slice it builds on is recorded on AWF-0046 under
Evidence, verified 2026-08-17: `pnpm verify` 57/57, `pnpm test` 115/115,
`pnpm test:convex` 193/193.

## History

- 2026-08-17 · Claude — proposed after building the person half of the conflict
  lifecycle on `claude/fh-conflict-visible`. Deliberately scoped to the proposal
  and its review surface, with AI resolution authority excluded and held on
  AWF-0046 for Scott. AWF-0047 included as step 1 because this Work Order's value
  depends on the conflicts it presents being real.
