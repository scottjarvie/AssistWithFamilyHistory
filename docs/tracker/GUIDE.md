# Assist With Family History tracker guide

This repository-owned tracker is the durable owner-and-AI view of work for
Assist With Family History / Discover Their Stories. It travels with every
authorized clone. Markdown is canonical; the generated board and guide are
zero-setup readers, not separate sources of truth.

## The three concepts

- **Cards** preserve one outcome and its current truth, next safe action,
  constraints, evidence, provenance, and dated history.
- **Work Orders** bundle a bounded execution tranche. Your AI may propose one;
  only Scott moves it from Proposed to Ready. A Ready order may be executed,
  and a separate AI audits completion.
- **Guide** is this stable operating contract. It lets a future person or AI
  continue without reconstructing an old conversation.

`tracker.json` is factual implementation metadata. `board.html` and
`guide.html` are generated reading views. Supporting specifications and dated
reports remain evidence, not new tracker concepts.

## One-minute orientation

Open `board.html`. Start with **Needs You**, then scan **Doing** and **Next**.
Kanban shows motion; Work Orders show approved bundles, derived progress,
execution evidence, and the separate audit result.

A Needs You Card must teach before asking: why Scott is needed, the smallest
action, the recommendation, alternatives and trade-offs, what each choice
changes, the safe default, the consequence of waiting, and evidence. If your
AI can safely decide within approved scope, the Card is not Needs You.

## Canonical states

Cards use exactly:

- `backlog` — real work, not presently selected.
- `next` — safe to pick up within a Ready or Active Work Order.
- `doing` — active execution.
- `needs-you` — blocked on Scott's consequential decision or human-only act.
- `done` — completion evidence exists; Work Order audit remains separate.

Work Order execution is exactly `proposed`, `ready`, `active`, `complete`, or
`superseded`. Audit is independently `not-audited`, `passed`, or
`follow-up-needed`. Complete never silently means audited.

## Authority and handoff

The bounded loop is **your AI proposes; Scott approves scope; your AI
executes; a separate AI audits**. There is no automatic dispatcher. A Work
Order states its goal, included Cards, sequence, dependencies, exclusions,
stop rules, verification, and genuine human gates.

Copy prompt carries the Project, Project Philosophy, Family Core, full Card,
linked Work Order, current evidence, and update rules. Copy Work Order carries
the approved tranche and all included Cards.

## Durable authoring rules

- Cards live in `docs/tracker/cards/` with stable `AWF-####` ids.
- Work Orders live in `docs/tracker/work-orders/` with stable `AWF-WO-###` ids.
- Append dated, attributed history. Do not erase earlier truth or invent
  provenance.
- Treat living-person details, private family notes, memory media, raw capture
  artifacts, and unresolved relationship claims as private. Tracker source in
  this public repository must contain no such material.
- Run `pnpm tracker:build` and `pnpm tracker:verify` after state edits.

## Project operation is repository-owned

Cards, Work Orders, Guide, repository evidence, pull requests, deployments,
and live proof are the current operating sources. Historical Linear ids may
remain in old reports or fixtures as provenance, but agents do not query,
update, or depend on Linear to begin, route, verify, or finish work.

## Safe publication classes

Tracker software—generators, parsers, validators, board behavior or styling,
templates, package scripts, workflows, instruction files, and build/deployment
configuration—uses a normal branch, pull request, full CI, and deployment.

State only—Cards, Work Orders, this Guide, factual `tracker.json`, generated
readers, and the canonical Project Philosophy Markdown/HTML pair—may use the
locally validated trusted-owner direct-main path:

```text
git add docs/tracker/cards docs/tracker/work-orders docs/tracker/GUIDE.md docs/tracker/board.html docs/tracker/guide.html docs/tracker/tracker.json docs/planning/assist-with-family-history-project-philosophy.md docs/planning/assist-with-family-history-project-philosophy.html
pnpm tracker:commit-state -- "Update Family History tracker state"
git push origin HEAD:main
```

The helper rejects mixed or uncertain changes, runs both tracker and Project
Philosophy validators, requires local `main`, and writes the final
`skip-checks: true` trailer. GitHub still runs its lightweight state-recording
path. Vercel separately compares the complete range since its previous
successful deployment and ignores only the same strict validated state class.
Any uncertainty builds normally.

Never use this route for software or open a skipped-check pull request. If
canonical-branch protection rejects the trusted-owner publication, stop and
repair policy through the normal protected path.

## Family History character

This tracker uses archival paper, evidence green, annotation rust, restrained
editorial density, and research-to-story language. Other products may copy the
information architecture and safety contract, not this identity.
