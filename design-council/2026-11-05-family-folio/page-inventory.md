# Family Folio — page inventory

Run: 2026-11-05-family-folio. Source inspection: 2026-11-05. Lead implementation: Codex gpt-6.1-sol.

All 45 existing `app/**/page.tsx` files are represented below. “Pending” means the council implementation/verification is not yet established; it does not mean the baseline route is absent. Three person subroutes reexport legacy implementations. Redirects stay reachable. Every listed capability is baseline scope to preserve, with browser probes still to be established.

## Existing routes

| Route | Playbook family | Implementation | Baseline capability | Council status |
|---|---|---|---|---|
| `/` | Site-specific public home | Hero, FeatureShowcase, FamilyHistoryFaq, CTASection | Navigation, CTAs, FAQ, capability explanation | Pending |
| `/about` | Learning-reader / public editorial | Inline page | Mission, principles, workflow, links | Pending |
| `/ai` | Settings-AI informational / public reader | Inline catalogue-driven page | Actual catalogue tool groups and counts, permissions, never-permitted boundaries, setup steps | Pending |
| `/contact` | Site-specific support handoff | Inline page | Shared support desk link | Pending |
| `/extension` | Site-specific installation guide | Inline page | Extension download/install and capture guidance | Pending |
| `/features` | Collection-like capability map / reader | Inline page | Working, coming-soon and later capability groups | Pending |
| `/features/source-docs` | Learning-reader | Inline page | Extension-to-contextualization workflow, output examples, CTA | Pending |
| `/privacy` | Learning-reader | Inline page | Policy sections and support link; flag legacy prose truth separately | Pending |
| `/roadmap` | Activity / reader | Inline page | Current, coming-soon and later groups | Pending |
| `/updates` | Activity | ReleaseLog | Static release entries, category/type filters, release detail; privacy-safe public surface | Pending |
| `/stories/[id]` | Learning-reader | Inline page + Prose | Published narrative, evidence, places, events, media, published-only guard, canonical slug redirect | Pending |
| `/sign-in/[[...sign-in]]` | Site-specific authentication | Clerk SignIn | Sign-in, configuration fallback | Pending |
| `/sign-up/[[...sign-up]]` | Site-specific authentication | Clerk SignUp | Sign-up, configuration fallback | Pending |
| `/local-session` | Site-specific local authentication | LocalSessionBridge | Guarded local mode and return destination | Pending |
| `/settings/ai` | Redirect | redirect | Retain redirect to /app/settings/ai | Pending |
| `/app` | Home — desk trays | DashboardView, FolioTray | First start, recent people, workspace counts, recent imports, full workspace navigation, story/research links | Structural trays built in tranche 2; independent acceptance pending |
| `/app/people` | Collection | PeopleExplorerView, CollectionWorkspace | Name/FS ID/year search, research-state filter, living/deceased, unsourced provenance, source/import/memory/document/story counts, last import, pagination, first connection/import CTA | Grouped Table/List/Grid, saved browser views, sort, density, columns and selection built in tranche 2; independent acceptance pending |
| `/app/people/new` | Site-specific focused creation | PrivateFamilyStart | Two people and relationship, correction, cancel, duplicate and error states, existing-workspace alternative | Pending |
| `/app/people/[personId]` | Record + sticky sections | PersonHeader, ResearchChecksPanel, ContextItemsPanel, MediaPrivacyReviewPanel, DocumentsViewer, LifeTimeline | Claims/facts, sources, events, relationships/provisional relatives, places, memories/media, research tasks/log/checks, context, stories, imports, document and AI-analysis links | Dossier/stream built; Opus c187b04 conditional, lead fixes 57 full/16 Record/38 captures passed; next meaningful cross-model review pending |
| `/app/people/[personId]/raw` | Learning-reader (reexport) | Source-docs raw page | Raw evidence, copy/download, back navigation | Pending |
| `/app/people/[personId]/contextualized` | Learning-reader (reexport) | Source-docs contextualized page | Structured AI dossier, copy/download, back navigation | Pending |
| `/app/people/[personId]/ai` | Site-specific evidence-processing workbench (reexport) | Source-docs AI page | Living-person warning, redacted/original choice, privacy controls, normalize/cluster/synthesize stages | Pending |
| `/app/people/[personId]/story-writer` | Site-specific focused writing session | StoryWriterStudio | Context/readiness inputs, generate draft, copy prompt, manual editing, save, saved-story link, return to person | Pending |
| `/app/places` | Collection | Inline page | Place search, linked-person/event/source/context counts, place links | Built local tranche 3; captures/checks pass, Opus conditional; lead fixes checked, taste refinement pending |
| `/app/places/[placeId]` | Record + sections | Inline page + ContextReportForm | Place identity, people/events/sources, context slots, research activity, place media, add context report | Pending |
| `/app/imports` | Site-specific capture intake + collection | Inline client page | JSON paste, preview, warnings/privacy review, merge confirmation/recovery, backend status, latest warnings and recent imports | Pending |
| `/app/operations` | Collection — research operations, distinct from personal Queue | Inline page + OperationRowActions | Search, row type, story state/readiness, missing check, freshness, sort/direction, row actions, handoff links, progress and operating explanations | Pending |
| `/app/research` | Collection + activity | Inline page | Open task title/person/priority/description; research-log summary/activity kind/person | Built local tranche 3; captures/checks pass, Opus conditional; lead fixes checked, taste refinement pending |
| `/app/audit` | Stats — instrument panel | Inline page | Coverage/readiness totals, workflow distribution, priority people, evidence/research links | Pending |
| `/app/queue` | Queue list + embedded Queue item | QueueWorkspace | State filters, loaded search, pagination, directive/outcome/priority/reason creation, selected detail, context/result links, history, claim/checkpoint/resume/complete/cancel/reopen, supported archive/restore/delete flows | Pending |
| `/app/stories` | Collection | Inline page | Saved stories, status/workflow/readiness summaries, person/story/public links | Built local tranche 3; captures/checks pass, Opus conditional; lead fixes checked, taste refinement pending |
| `/app/stories/[storyId]` | Record + learning-reader/editor | StoryEditorForm, StoryReviewAssignmentForm, StoryReviewHistoryPanel, StoryStatusActions | Edit, assignment, review history, readiness/context/grounding evidence, research-pack provenance, publication safeguards | Pending |
| `/app/story-writer` | Collection / writing-session launcher | Inline page | Eligible person list/readiness and person-specific writing links | Built local tranche 3; captures/checks pass, Opus conditional; lead fixes checked, taste refinement pending |
| `/app/settings/ai` | Settings-AI matrix | AiConnectionCenter | Scopes/boundaries, labels, end dates, pending/active/revoked/expired distinctions, audit, decline/revoke reason and confirmation; never imply AI can widen grants | Pending |
| `/app/settings` | Site-specific legacy provider settings | Inline client page | OpenRouter key, model, privacy, Admin Mode; retain despite planned retirement | Pending |
| `/app/api` | Settings-AI / legacy developer key matrix | ApiKeyManager | OAuth/MCP guidance, existing mint/scopes/rotate/revoke/suspend tooling and first-success path | Pending |
| `/app/api/admin` | Admin ledger | ApiKeyManager | Operator-gated current-vault key oversight, stale-key indicators, suspend/revoke; retain server gate | Pending |
| `/app/experiments` | Collection | Registry-driven inline page | Maturity/visibility/privacy labels, eligibility and actual launch availability | Pending |
| `/app/timeline` | Activity — currently placeholder | Inline page | Existing capability explanation and links; not an implemented event explorer | Pending |
| `/app/source-docs` | Redirect | redirect | Retain redirect to /app/imports | Pending |
| `/app/source-docs/[personId]` | Redirect | redirect | Retain redirect to /app/people/[personId] | Pending |
| `/app/source-docs/[personId]/raw` | Learning-reader | Inline page | Implementation of raw evidence reader; copy/download/back links | Pending |
| `/app/source-docs/[personId]/contextualized` | Learning-reader | Inline page | Implementation of contextualized dossier reader; copy/download/back links | Pending |
| `/app/source-docs/[personId]/ai` | Site-specific evidence-processing workbench | Inline client page | Implementation of staged AI analysis, privacy and living-person controls | Pending |
| `/app/tools` | Redirect | redirect | Retain redirect to /app/imports | Pending |

## Not-existing target routes — separate from the existing-page pass

The Site Guide target map is product direction, not proof these routes or their backend records exist. Do not render invented capabilities or claim these targets implemented. Any new page must use genuinely implemented records, owner boundaries and behavior. `/settings/ai` already exists as a redirect and `/stories/[id]` exists as a guarded public story reader.

| Target routes | Intended family | Current relationship / dependency |
|---|---|---|
| `/home` | Home | Current signed-in home is `/app` |
| `/people`, `/people/[id]` | Collection / record | Current `/app/people` and detail; route migration not done |
| `/tree`, `/trees` | Site-specific tree / collection | Not built; Tree/workspace model depends on AWF-WO-015 |
| `/sources`, `/sources/[id]` | Collection / record | Legacy source-docs redirects and person media are not Source pages |
| `/places`, `/places/[id]` | Collection / record | Current `/app/places` and detail |
| `/projects`, `/projects/[id]` | Collection / record | Not built; new blocks depend on AWF-WO-015 |
| `/questions`, `/questions/[id]` | Collection / record | Research/operations are partial predecessors, not these pages |
| `/topics`, `/topics/[id]` | Collection / record | Not built; model dependency |
| `/stories` | Collection | Current private collection `/app/stories`; public story `/stories/[id]` exists |
| `/timeline`, `/map` | Activity / site-specific map | `/app/timeline` is placeholder; no working Map |
| `/matches`, `/imports` | Collection / site-specific intake | Partial predecessor `/app/imports` and operations |
| `/lists`, `/lists/[id]` | Collection / record | Not built; model dependency |
| `/work`, `/notes/[id]`, `/research/[id]` | Collection / reader | Not built; distinct Notes/Research model absent |
| `/library` | Collection / learning-reader | Not built |
| `/queue`, `/queue/[id]`, `/queue/suggestions` | Queue list / item / collection | Current `/app/queue` has embedded detail; standalone item and suggestions absent |
| `/preferences` | Settings | Not built; legacy `/app/settings` is not Preferences |
| `/me`, `/search` | Stats / collection search | Not built |
| `/settings/data`, `/delete-account` | Settings-data / focused confirmation | Not built; do not invent export/delete behavior |
| `/admin`, `/admin/accounts`, `/admin/ai`, `/admin/storage`, `/admin/content` | Admin | Broad admin absent; `/app/api/admin` only operator key oversight |
| `/ideas-and-usage` | Learning-reader | Not built; FAQ exists on public Home |

No generic study/quiz session exists. Saved views, grouped collection tables, density/columns/bulk selection and standalone Queue item pages are not existing baseline capabilities. Add decided controls only with real implementation; do not fabricate working controls for a screenshot.

## Tracker constraints and scope evidence

- Direct Scott council request authorizes ordinary local design work; a proposed Work Order is optional context, not a gate. It does not authorize marking whole unrelated Work Orders complete. The explicit overnight rule controls delivery: local commits only; no push, PR, merge or deploy.
- AWF-0051 is backlog under proposed AWF-WO-016. It requires browser-local Top/Side navigation on wide screens, automatic phone navigation without overwriting the preference, same destinations/active meaning, preserved filters and unfinished forms, independent theme choice. Its old “not implemented” text must be compared with current source before being treated as live truth.
- AWF-WO-016 (pages) and AWF-WO-019 (shared pages) remain proposed. Source inspection can proceed inside this council's direct authorization without recording approval Scott did not give.
- Ready orders: AWF-WO-009 joined Queue-to-sourced-result acceptance; AWF-WO-010 first private person/relationship browser proof.
- Active orders: AWF-WO-011 AI connections; AWF-WO-012 private evidence lifecycle; AWF-WO-015 building-block schema; AWF-WO-018 media; AWF-WO-020 local Live/Sandbox. Their audit state is separate from execution.
- AWF-WO-015 records that Questions, Notes, Research, Topics, Lists, Preferences and generic Connections are absent. New pages depend on real records and history-preserving model work. No sharing/publication/MCP-permission changes belong in the visual pass.
- AWF-WO-018 owns Source/File/media shape, portraits and scan viewers; do not invent functioning media capabilities from illustration.
- AWF-WO-020 says runtime/browser acceptance pending; Local Live remains withheld until independent production owner enforcement proof. Use isolated local fixtures, retain authentication, never target council captures at production.
- AWF-WO-011 permits connection UI against approved grant fields but forbids behavior claims unsupported by edge enforcement. Real-family access, provider/security mutation, publication, permanent deletion and sharing/access changes remain outside this design pass.
- No separate blanket backend-first UI hold was found in these inspected Work Orders. Backend dependencies and missing delivery/runtime proof remain material; no release is authorized by this run.

## Capability preservation audit starting point

Implementation status is initially **Pending** for every route. Browser capability inventories, baseline screenshots and per-round probes must establish what is reachable on desktop and phone. Keep raw/contextualized evidence, warnings, provenance, source counts, all current filters, pagination, legacy tooling and publication/privacy guards. An empty-state or backend-unavailable capture is not proof of a populated route.
