# Assist With Family History Project Philosophy

> **Philosophy status:** Canonical product identity and claim boundary
>
> **Product document version:** 1.6.0
>
> **Philosophy date:** 2026-08-11
>
> **Capability evidence last verified:** 2026-08-12
>
> **Repository evidence revision:** `AWF-WO-006 source foundation — protected release and named-client proof remain separate`
>
> **Scope:** Product truth, language, trust, and design direction—not an
> implementation plan, production claim, or permission to change application
> behavior

This document defines what Assist With Family History is, how it fits the
Assist family, and which claims its public and signed-in experiences may make.
It supersedes “genealogy database,” “private family vault,” “automatic
researcher,” and “AI story generator” descriptions when they shrink or
overstate the product. Repository tracker Cards and Work Orders, architecture
notes, release evidence, and operational runbooks remain authoritative for
delivery status; they do not redefine the product. Historical Linear ids are
provenance only and are not a current operating dependency.

## Family Core alignment record

> **Document:** Assist With Family History — Project Philosophy
>
> **Canonical:**
> `docs/planning/assist-with-family-history-project-philosophy.md`
>
> **Family Core:** Assist With Sites — Core Philosophy v1.6.3 (2026-08-08)
>
> **Aligned:** 2026-08-08 — the complete published Core, repository, tracker,
> delivery configuration, and public deployment records reviewed through
> prerequisite merge `f7edb92` and state proof `dc30429`
>
> **Adopted:** The shared chassis: the three-way person / Assist workspace /
> your AI promise; dependable family routes and truth surfaces; the Queue
> contract; scoped, revocable authority; provenance and activity; shared access
> vocabulary; identity, privacy, export, and deletion rules; family navigation;
> the Support Desk convention; website launch truth; and the repo-owned Cards /
> Work Orders / Guide operating contract; exact state-versus-software
> publication boundary; and separate GitHub, Vercel, and live-alias proof
> gates; plus §17's ordered setup, retrofit, and agent-handoff paths. Adoption
> accepts these requirements; it does not prove they are implemented or
> prescribe the primary experience.
>
> **Deferred/gaps:** The unverified big/public-launch requirements recorded below,
> including complete activity history,
> export and deletion, `/me`, `/admin`, Support Desk, and family navigation;
> plus the approved but unverified People/relationships-first onboarding,
> selected-object visibility, simple collaboration roles, separate
> interpretations, optional passage/source reader layer, and prompt/loop
> library.
> Tracker/provider setup is **Current / verified** in AWF-WO-001 through useful
> state commit `dc30429`. Independent audit remains **Not audited** in AWF-0004;
> that fact does not erase the observed delivery evidence. Product capability
> gaps remain explicit rather than assumptions.
>
> **Differs:** Family History keeps its
> research-to-story purpose and audience; Research Spine; domain objects and
> workflows; citation-grade evidence, uncertainty, and living-person review
> gates; information architecture and information density; rare, explicit
> public-story workflow; content and voice; and the Discover Their Stories
> archival compass, palette, typography, motifs, and editorial identity. Its
> research operations console remains distinct from both the product Queue and
> the internal build tracker.
>
> **Evidence:** Dated capability ledger and repository evidence handoff in this
> document; `docs/tracker/`; published Core v1.6.3 commit
> `db658ab091bcfbb71f62db55d5b8b6d51b64e52f`, source SHA-256
> `6c354eb33422d6b48453c578b93d5a32551fbe3008ce58673a0f11437335a30c`;
> PRs #28 and #29; AWF-WO-001; state
> commit `dc30429`; Actions run `31273074126`; Vercel ignored deployment
> `dpl_8FfUtYW5FBJ6sZLbXGkiZtbQvf3a`; retained live deployment
> `dpl_vngjLJMJRMBgo7dM6gpBvT2p7C6J`. Product capabilities remain separately
> unverified where marked **Unknown**.

> **Owner authority clarification:** 2026-08-09 — a person may discuss or
> direct their chosen AI however they want outside Family History. The product
> neither controls those conversations nor polices that AI's overall behavior.
> Family History controls only its own boundary: access to its tools and data,
> operations performed through the product, and specifically approved,
> recorded handoffs to that AI.

> **Product direction synthesis:** 2026-08-11 — People and relationships are
> the friendly first step into a connected private archive. Imports and the
> owner's chosen AI may accelerate that picture under explicit authority;
> uncertainty, separate interpretations, optional story evidence, living-person
> review, selected-object visibility, simple collaboration roles, and an
> optional prompt/loop library are preserved as product direction rather than
> claimed current implementation.

Core v1.6.3 reorganizes rather than changes Family History's installed
operating contract: §16.1 owns the Cards / Work Orders / Guide tracker rules,
§16.2 owns state-versus-software publishing and its three provider proof gates,
and §16.3 owns launch posture. Section 17 applies those rules through ordered
new-project setup, retrofit, and agent-handoff paths; it is not a competing
tracker or local policy. The repository-owned tracker remains durable
current-work truth. Linear is optional historical or portfolio context only and
never a work, migration, or AI-handoff gate.

This document is derived from the internal family contract rather than a copy
of it. That contract is a shared chassis and trust/operations contract, not a
site template. It wins where a shared route, trust boundary, privacy rule,
activity convention, truth surface, navigation convention, or support contract
directly conflicts. Family History remains authoritative for its purpose,
users, domain objects, workflows, evidence model, information architecture,
content, density, voice, branding, palette, typography, motifs, and primary
experience. The goal is a clearly related sibling, not another version of the
same site.

Use these status labels throughout this revision:

| Status | Meaning here |
|---|---|
| **Current / verified** | Proven in this checked-out repository at the stated revision; still not a deployment or production claim |
| **Partial / verified foundation** | Specific pieces are proven, but the complete capability or user path is not; name both the proven pieces and the missing boundary |
| **Coming soon** | Committed soft-launch work required for the big/public launch; it may appear publicly only beside a plainly unfinished, non-working control or claim |
| **In design** | Required or deliberately designed, but not yet proven as a complete current path; do not imply availability |
| **Later** | Unscheduled, exploratory, or gated behind real usage; not a commitment and not eligible for a public **Coming soon** label |
| **Intentional product-specific difference** | A justified Family History domain or brand choice that preserves the shared family behavior |
| **Unknown** | Repository evidence cannot establish the live, provider, catalog, or authenticated operational state |

### Adoption and contradiction matrix

| Contract area | Status | Evidence-backed Family History decision |
|---|---|---|
| Person / Assist workspace / your AI split | **Current / verified philosophy and `/ai` source; Coming soon full public-shell alignment** | The enduring split below makes the person authoritative, Family History durable, and “your AI” user-chosen. `/ai` now teaches that split in Family History's archival voice; the current home source still does not use the required “Assist your AI, so it can assist you with family history” turn of phrase or provide the complete launch invitation/FAQ alignment |
| Domain promise, users, objects, and primary experience | **Intentional product-specific difference** | Keep the research-to-story promise and the connected vocabulary of people, families, relationships, places, buildings, events, sources, claims, questions, context, collections, projects, and stories. Family History decides how researchers, relatives, storytellers, and their chosen AI move through that evidence. The family chassis fixes dependable assistance and trust boundaries, not this domain model or experience |
| Friendly start and connected archive | **Intentional product-specific difference; In design onboarding** | People and relationships are the primary friendly start, but not a forced container. An authorized import or chosen-AI research handoff may quickly extend that first connected picture. Sources, documents, media, places, buildings, events, claims, and stories remain many-to-many records with provenance and uncertainty; no direct provider integration is implied |
| Product Queue | **Current / verified repository and deployed Next.js backend foundation; Coming soon designed/authenticated experience** | `queueItems`, `queueActivity`, command receipts, owner-scoped `/api/queue` seams, and focused contracts implement directive-first creation, exactly four product states, bounded handoff commands, cursor pagination, idempotency, concurrency, retry/failure/cancel/expiry, and hard deletion. PR #31 passed full CI, merged as `e65b03a`, and received successful Vercel preview/production statuses; the retained live alias and signed-out sign-in redirect were observed. `/app/operations` and `researchTasks` remain separate. No final `/queue` page, authenticated persistence, exact production Convex build-plan log, or arbitrary chosen-AI pickup path is claimed |
| Queue authority | **Current / verified Queue-command foundation; Coming soon external identity proof** | Queue commands enforce bounded leases, exact actor/item operations, and the family rule that attached context grants no domain mutation authority. A Queue item never silently expands authority. Product grants must explicitly bind actor/AI, scope, permitted data, operation or external-action category, approval, and expiry/revocation. Missing authority returns to **Needs you** with the smallest exact question. Where a complete grant already exists, the Queue may give that chosen AI a recorded external-action intent and selected context, then attribute success, denial, failure, or return; Family History itself never performs the outside-world action. Incoming chosen-AI credentials are not yet resolved to this authority |
| Queue context objects | **Intentional product-specific difference; Current / verified repository backend foundation** | Optional owner-verified references use three Family History groups: research subject (person, relationship, place, event), evidence (source, citation, media, context item), or work thread (research task/check, story, import run, provisional relative). Directive-only creation remains valid. Project/collection adapters stay unimplemented because no matching durable model exists |
| Prompt and research-loop library | **In design** | A small curated menu may help the person's chosen AI begin useful family-history work. Every prompt or loop is optional, editable, combinable, and ignorable, with version/freshness/provenance/limits metadata. It is assistance, not a required workflow or site-owned automation engine |
| Internal project tracker | **Current / verified — independent audit pending** | `docs/tracker/` carries canonical Cards, Work Orders, Guide, factual metadata, and generated Kanban/Work Orders readers in Family History's archival identity. Current instructions use that durable source rather than mandatory Linear. State commit `dc30429` proved the lightweight GitHub path, Vercel ignored-build cancellation, and retained live deployment. AWF-WO-001 keeps completed execution separate from AWF-0004's future independent audit; do not confuse this build tracker with the product Queue |
| MCP and AI setup paths | **Current / verified source and isolated official-client foundation; Partial deployed/named-client journey** | `/mcp`, protected-resource metadata, `/ai`, `/ai.txt`, and twelve Family History workflow tools now cover bounded brief/search/context, canonical people/relationship/event/evidence/research/story saves, one-call complete results, granular corrections, and Queue continuation. OAuth tokens select the owner server-side; operations are replay-safe; living-person discovery and public story gates stay bounded. The official v2 MCP client plus generated signed-token tests prove negotiation, discovery, a canonical write, and product reads through the real stateless handler with isolated synthetic tenants. Provider registration/consent, a named compatible client, production authentication, reconnect, and revocation remain unproved and must not be inferred from source, local, CI, or deployment evidence |
| Activity and provenance | **Current / verified Queue-specific history and partial wider foundation; Coming soon complete product contract** | Queue state-changing commands now emit append-only, actor-attributed history and idempotency receipts that share the item's deletion lifecycle. Import runs, research logs, story review events, source links, model/prompt fields, and `agentActivity` remain separate partial foundations; the repo still does not prove one complete history for every meaningful product create, change, or delete |
| Access and sharing | **Current / verified Private and guarded Public foundations; In design Unlisted and Trusted** | Use one selected-object visibility vocabulary for appropriate stories, collections, and source/record surfaces: Private, Unlisted, Trusted, Public. Trusted collaboration uses simple Viewer, Contributor, Editor, and Owner roles scoped to the relevant boundary. Sharing stays deliberate, reviewable, revocable, and subject to living/sensitive review; complete invite, link, role, and visibility lifecycles are not verified |
| Identity boundary | **Current / verified source foundation; Unknown deployed state** | Source supports per-site Clerk identity and owner isolation when configured, plus local/guest modes for controlled environments. No shared Assist identity or cross-site session is claimed, and exact deployed Clerk/trust-boundary configuration is not proven here |
| Export and deletion | **Coming soon** | Person context-pack export and key revocation are narrower current tools. No complete owner export, `/settings/data`, `/delete-account`, coordinated record/account deletion, attachment purge, or content-bearing-history purge is verified |
| Public truth surfaces and honesty | **Partial / verified source; Coming soon alignment** | `/updates`, public marketing, roadmap, privacy, and `/llms.txt` exist in source. The home page lacks the required FAQ and `/ai` invitation; `/updates` lacks the exact **Local / In review / Backend live / Public & live** labels and AI-written 1.1.1 release habit; and stale or unverified public statements need a separate sentence-by-sentence honesty pass before a big/public launch |
| `/me` and `/admin` | **Coming soon** | No family `/me` or owner `/admin` route exists. `/app/audit` is a private genealogy-readiness view and `/app/api/admin` is an API-key operator surface; neither is the family usage/stats contract |
| Support Desk | **In design / deferred dependency** | `/contact` exists, but no registered Assist With Life Support Desk source key or header/footer desk link is present. Link it only when the shared desk is live; do not market it beforehand |
| Brand, design, and themes | **Intentional product-specific difference; Coming soon accessibility floor** | Preserve Discover Their Stories’ compass, parchment, teal/rust, archival annotations, evidence-thread motif, typography, and editorial voice as the product's own design system. The designed philosophy reader already supports light/dark; the product UI does not yet prove first-class light/dark coverage. The family swatches `#8FD7B4` and `#245A43` identify Family History in shared portfolio wayfinding; they do not replace or dictate the product palette |
| Dense information | **Intentional product-specific difference; Partial / verified foundation; Coming soon dependable behavior** | Family History may be denser than a sibling because evidence comparison requires it. People reads are capped and the operations view has a contained table, filters, sorting controls, and bounded rendering. Cursor pagination, table-first people view, click-to-sort columns, remembered preferences, account-saved views, and complete phone drill-down are not verified. The family contract supplies performance and phone-usability guardrails, not a uniform layout |
| Family navigation | **Coming soon** | No family catalog row exists in the public or signed-in shell. It must show the whole verified roster without leaking cross-site counts or activity |
| Launch stage | **Unknown current publication state; adopted sequence** | Repository and public-copy evidence cannot prove the real domain, Assist With Life catalog listing, deployment, or authenticated operation. Do not call this soft-launched, big/public-launched, or production-ready without fresh external proof |
| Native privacy and review readiness | **Later guardrail only** | No native package is claimed or currently designed. Revisit native review requirements only after substantial recurring website use demonstrates a distinct native job; this does not shape the present product philosophy or website experience |

This matrix is the current contradiction/adoption record. The dated capability
ledger later in the document provides the deeper repository evidence boundary.

## One-sentence identity

**Assist With Family History is a durable, user-controlled research-to-story
workspace where your AI can work with connected evidence and context, and
where you can understand, correct, and turn that work into meaningful,
source-aware stories.**

> **Family front-door line:** “Assist your AI, so it can assist you with family
> history.” This required family phrase sits beside—not in place of—the fuller
> research-to-story identity above.

The higher purpose is connection: not only knowing that something happened,
but understanding the human life and larger world the evidence can responsibly
help reveal.

## Who this serves and what they need

Family History serves people doing evidence-led work about lives and
relationships: family historians, relatives preserving what they know,
researchers resolving uncertain identities, and storytellers trying to make a
life understandable without outrunning its sources. They may be experienced
genealogists or simply the family member holding a box of documents and a
question. The product does not require professional vocabulary or one preferred
way to organize a family.

Their recurring jobs are to preserve a clue without losing its origin; connect
people, relationships, places, events, and historical context; compare
conflicting evidence; keep uncertainty visible; decide what needs more research
or review; and turn responsibly supported understanding into a story another
person can follow. Some work is solitary, some eventually involves a trusted
relative, and all of it needs to remain understandable after the current AI
conversation ends.

## Practical picture: think of it as…

Not merely a family tree, record cabinet, private archive, or text generator.
Think of it as several kinds of help gathered around the same research trail:

- **A life file that can hold more than one name.** Follow a person through
  name variants, identities, records, dates, and places without forcing every
  uncertain match into one profile.
- **A web of relationships bigger than a pedigree.** Connect families across
  generations while also preserving households, witnesses, neighbors,
  communities, institutions, and other relationships that help explain a
  life.
- **A place-and-event thread.** Bring people, buildings, migrations, work,
  faith, conflict, celebration, and other events together across time without
  pretending that proximity proves personal experience.
- **A source table where important details keep their receipts.** Keep
  documents, records, photographs, media, family memories, citations, and
  extracts connected to the claims and story details they support.
- **An open-question board.** Make uncertainty, contradictions, missing
  evidence, competing interpretations, and the next useful research step
  visible instead of smoothing them into false certainty.
- **A lens on the wider world.** Add sourced historical context about a place,
  community, culture, religion, event, or era while keeping that context
  distinct from evidence about a particular person.
- **A story workshop with a path back to the evidence.** Build grounded stories
  about a person, family line, place, building, community, or time period, and
  let readers or reviewers follow connections across generations and trace
  important details back to their sources and uncertainty.

Its distinctive value is the connected trail between evidence, uncertainty,
context, relationships, questions, and story. A family tree may be one useful
view of that trail, but it is not the product's limit or its measure of
understanding.

This is prepared explanatory structure around the family front-door line. The
facets are grounded in the enduring product, but they do not claim that every
corresponding view, visualization, import, AI
connection, or publishing path is currently available. The dated
[capability ledger](#dated-repository-capability-ledger) states what the
checked-out repository can honestly support.

## Why not just ask your AI to build a quick feature?

Sometimes that is exactly the right move. A quick transcription helper, record
comparison, timeline mockup, or page for one research question can solve an
immediate problem. The difference begins when the work needs to survive that
moment.

A durable Family History workspace keeps people and name variants,
relationships, places, buildings, events, sources, claims, uncertainty,
questions, context, and stories as connected records—not as scattered chat
turns or the temporary state of one generated page. It preserves where a
detail came from, what changed, why an interpretation currently leads, and
what remains unresolved. Through an available manual handoff or a separately
shipped connection, a later AI session can resume the research without
reconstructing the family, the evidence, and the decisions from scratch.

The enduring advantage is the family-history loop: a clue can become preserved
evidence, a cautious claim, a relationship or context connection, a new
question, and eventually a grounded story; a correction can travel back
through that trail without erasing its history. The person can inspect and
correct each stage, control who or what may act, and continue even when the
chosen AI or its interface changes.

Family History is therefore not an argument against asking your AI to build or
analyze something. It is the durable, domain-shaped place where the useful
records, relationships, research state, and story trail remain after the
one-off tool or conversation has done its job.

## Why this instead of a conventional website?

A family-tree site, searchable archive, file store, storytelling tool, or
other focused website can be valuable. Family History is meant for the
long-running work that crosses those categories: your chosen AI can reason and
perform separately authorized work while the workspace preserves the connected
family-history record and gives you an inspectable place to understand what
happened and what comes next.

That distinction matters when one new record changes more than one field. It
might introduce a name variant, challenge an identity or relationship, move an
event to a different place or date, create a research question, alter the
historical context, and require a story revision. Family History should keep
those effects connected and reviewable rather than reducing them to an
isolated profile edit, uploaded file, search result, or generated paragraph.

It also provides a durable coordination model: people and their chosen AIs can
work from explicit scopes, questions, evidence, authority, state, blockers,
and next steps. Trusted collaboration inside a project and an Unlisted,
read-only view of a selected story, tree branch, collection, or view extend
that model where appropriate—but both remain **In design** until their complete
user paths are implemented and verified. Human-complete research, correction,
organization, and writing must remain possible without an AI connection.

> **Marketing and PR takeaways**
>
> - **A family tree shows connections. Family History preserves why those
>   connections are believed—and how responsible stories grow from them.**
> - **Bring your chosen AI; keep the research trail.**
> - **From clue to evidence to story, with a path back when understanding
>   changes.**
>
> Use these as enduring positioning, not as proof that every AI connection,
> collaboration mode, visualization, import, or publishing path is currently
> shipped. Pair feature-specific use with the dated
> [capability ledger](#dated-repository-capability-ledger).

## Product scope and non-goals

Family History exists to help people collect, connect, and understand evidence
so they and their AI can tell meaningful, source-aware stories. Its subject can
be a person, family line, relationship, place, building, community, culture,
religion, event, or time period—not only a pedigree position.

The scope is deliberately broader than a genealogy database and narrower than
an autonomous genealogy service. It preserves the research trail and makes it
usable for understanding and storytelling; it does not turn every clue into a
fact, every family memory into evidence, or every generated passage into a
true story.

At the human product level, Family History must:

- keep sources, claims, uncertainty, context, and stories connected without
  making them indistinguishable;
- let people see, question, and correct the understanding as evidence or
  interpretation changes;
- preserve flexible relationships and historical context that help explain a
  life without treating proximity or context as proof of personal experience;
- keep living-person and private family material inside a quiet,
  user-controlled boundary; and
- require sharing, collaboration, and publication to be explicit, bounded,
  reviewable, revocable, and auditable rather than automatic.

It is not a promise of complete genealogy, universal archival access,
unattended research, automatic record import, universal AI compatibility,
infallible conclusions, or automatic public storytelling. The detailed
[capability ledger](#dated-repository-capability-ledger) and
[builder trust boundaries](#detailed-trust-boundaries-for-builders) state the
current implementation boundary without redefining this purpose.

It is also not a governor for the person's AI. People may discuss or direct
their AI however they choose outside this product, including requests broader
than any Family History grant. Family History neither controls those external
conversations nor claims authority over the AI's overall behavior. It enforces
only whether that AI may use Family History tools or data, perform an operation
through Family History, or receive a specifically approved handoff from it.

## The durable Assist family and trust model

The research-to-story workspace becomes durable help through a clear division
of roles. An Assist product is not the AI. The person chooses the AI that helps
them.

- **Your AI does the reasoning and work under your direction.** You may discuss
  or direct it however you want in its own environment. When it reaches into
  Family History, it can inspect only permitted material and use only granted
  product operations. With a specifically approved handoff it may also receive
  selected context and an external-action intent to carry out outside the
  product.
- **Family History provides durable family-history memory, organization, and
  tools.** It gives the work persistent structured context, retrieval,
  provenance, relationships, history, questions, queues, and visual
  understanding after the original conversation is gone.
- **You keep visibility and authority.** You can see what is known, inferred,
  disputed, changed, or waiting; correct the understanding; and decide who or
  what may retrieve, add, update, delete, promote, share, or publish in each
  family tree, person, source, story, collection, or research project.

Family History controls its own boundary, not the external conversation. Its
settings and grants determine whether a named AI may read selected workspace
data, receive sensitive context, create, update, or delete a record, share,
publish, or export through the product, or receive a recorded handoff carrying
an external-action intent. If the owner has disallowed one of those product
data or tool operations, Family History denies it. That denial does not forbid
the person from discussing the same subject or request with their AI elsewhere.

The benefit is different for each side. Your AI receives continuity and
well-labeled evidence instead of reconstructing a family from scattered chats.
You receive clarity: what is known, what is inferred, what is disputed, what
changed, what needs attention, and which stories the material can support.

The practical work may begin with a person, a family line, a document, a
photograph, a place, a building, a remembered story, a historical question, or
an unresolved contradiction. The person may authorize their AI, in the AI's
own environment, to browse, research, communicate, contact someone, or take
another outside action. Family History does not perform that action. When the
owner wants the product to supply private context or a formal instruction for
it, Family History may do so only through a visible, granular, revocable grant
and a specifically approved, attributable handoff. Only selected information
deliberately submitted through Family History's scoped interface becomes
Family History data.

Family History does not inherit browser sessions, passwords, archive accounts,
FamilySearch access, or the authority of the person's external AI. A shared
Assist identity also does not authorize silent movement of family-history
information into Assist With Life, Memory, Homes, Moving, Finances, Buying, or
another product. Every connection must be separately shipped, explicit,
understandable, reviewable, revocable, and visible in provenance.

This division of roles is enduring product philosophy. It does not claim that
every AI connection, research tool, visualization, sharing mode, or story
workflow is currently available. The capability ledger below keeps that
product truth explicit.

## A friendly start: people, relationships, and a connected archive

The private Family History archive or workspace is the trust boundary, but it
is not a single required first container. The underlying work begins with
connected People, families and relationships, places and buildings, events,
sources and documents, media, claims and observations, questions, and stories.
Each of those records can be reached from more than one direction.

The friendliest first step is usually one person and a known family
relationship. That gives someone a recognizable first picture without asking
them to understand the whole information model. From there they can add another
relative, connect a source, record an event or place, preserve a memory, or ask
their chosen AI to help extend the picture.

An authorized import from existing family-history work can accelerate that
start. FamilySearch capture, another genealogy service, an exported tree,
research files, a census, a journal, or a group of photographs may contribute
people, relationships, evidence, and context together. Import is an
accelerator—not a replacement for the person-centered model and not proof that
Family History has a live direct connection to every named provider.

The graph is deliberately many-to-many:

- one census entry can describe several people, a household, a place, and an
  event;
- one photograph can connect several people to a building, occasion, date, and
  photographer;
- one journal or document can support multiple claims and stories;
- one place, church, home, school, or event can connect many lives; and
- one person can carry several sources, names, relationships, hypotheses, and
  stories without collapsing them into one unquestioned record.

The user may direct their chosen AI outside Family History to research
FamilySearch, another service, an archive, the web, or supplied files. With the
necessary Family History workspace grant, that AI may deliberately save the
resulting evidence and context into the correct connected records. The save
must preserve the original source, capture or retrieval provenance,
uncertainty, acting AI, time, and any transformation or interpretation. The
product does not inherit the AI's external access and does not claim automatic
provider access merely because the AI can return a result.

## The research-to-story loop

Family History should preserve the whole arc from first clue to responsible
story, not only the final family-tree value.

1. **Begin with someone and a connection.** The friendly path starts with a
   person and known relationship, while still allowing an authorized source,
   import, question, place, event, or story to enter first. Name the scope,
   source, known constraints, and next useful question.
2. **Retrieve the connected context.** Your AI receives the permitted people,
   relationships, places, dates, sources, claims, notes, historical context,
   open questions, and prior work needed for this step.
3. **Gather without flattening.** Records, documents, media, memories, family
   lore, observations, authorized imports, and outside research enter with
   their original form, provenance, privacy, rights, uncertainty, and review
   state intact, connected to every relevant person/place/event rather than
   forced under one profile.
4. **Extract and connect cautiously.** Your AI may propose identities, name
   variants, events, relationships, places, topics, claims, contradictions,
   and historical context. Proposals remain distinct from accepted
   conclusions.
5. **Research the gaps.** Questions and weak points become durable work:
   another record to seek, a place to investigate, a relationship to test, a
   conflict to resolve, or a context pack to build.
6. **Review according to authority and risk.** Routine permitted saves may
   follow the user's operating preference. Identity merges, disputed claims,
   living-person material, and publication require the applicable stronger
   checkpoints.
7. **Build the story from connected evidence.** A draft may combine accepted
   claims, source-backed detail, and clearly labeled historical context while
   keeping uncertainty visible.
8. **Trace, correct, and continue.** The person can move from a story detail
   back to its evidence, revise the understanding without erasing the research
   trail, and resume later with the useful state intact.

The loop can produce a story about a person, family line, place, building,
community, culture, religion, event, or time period. A story is not always the
end: it can reveal a weak link, invite correction, or generate the next
research question.

The current repository implements valuable parts of this loop: user-mediated
FamilySearch capture, preview and import, structured vault records, candidate
source facts, context packs, research tasks and checks, an operations handoff
queue, Story Writer drafts, Story Studio review, and guarded publication.
It does not yet implement the entire generalized loop across every subject,
source, AI, authority scope, and visualization.

## User-owned data and shared authority

Family-history data is user-owned. Every person and every chosen AI acts only
through explicit authority granted for a selected family tree, person, source,
story, collection, research project, or narrower record.

Authority is independently controllable for each actor and operation:

- **retrieve or read** — observe, search, summarize, or use permitted
  information without changing it;
- **add or create** — introduce a person, relationship, source, claim, note,
  question, task, context item, story draft, or other record;
- **update** — revise an existing record or state while preserving the history
  required by that record's contract;
- **delete** — remove information subject to its retention, recovery, rights,
  and audit rules; and
- **promote or publish, where relevant** — move provisional material into an
  accepted conclusion, private material into a reusable state, or a reviewed
  story into an explicitly shared or public state;
- **share or export through Family History** — disclose a reviewed, bounded
  set of data to an approved audience or produce an owner-requested copy; and
- **receive an external-action handoff** — give the named chosen AI a selected
  private context package plus one specifically approved outside-world intent,
  without Family History performing that action itself.

These permissions are not interchangeable. Read is not write. Create is not
update or delete. Proposal authority is not authority to accept a claim, merge
an identity, or publish a story. Access to one person or research project does
not carry into another.

Every grant must name the actor or chosen AI, scope, permitted data, operation
or action category, approval, and expiry or revocation condition. Those terms
must be visible, editable where safe, revocable, and auditable. Retrieval,
every data-changing action, and every external-action handoff should retain the
acting person or AI, operation or intent, scope, approval, time, relevant
policy, result, and any denial, failure, or return in provenance or activity
history. Your AI cannot grant itself broader authority, inherit another
actor's permission, or expand access because it found a related person.

Permission and operating preference answer different questions:

- **Permission asks:** may this person or AI perform this operation at all?
- **Operating preference asks:** when an already-permitted operation occurs,
  may it save directly, require review, or pause at a
  risk-proportionate checkpoint?

Automation and review preferences never grant permission. “Review everything”
does not create read access. “Save routine research automatically” does not
create update authority. A queue item identifies work to do; it does not widen
the actor's scope.

These grants govern Family History, not the person's speech. An owner may ask
their AI about any topic or outside action in the AI's own environment even
when Family History has denied that AI access to related workspace data or
tools. The product must refuse the disallowed data/tool operation while making
no claim to forbid or police the external conversation. Conversely, a broad
external conversation does not authorize the AI to retrieve one private note,
change one record, export one file, publish one story, or receive one sensitive
handoff from Family History.

This is the intended Assist-family authority model. The current repository has
owner-scoped records, signed-in key-management primitives, a scope vocabulary,
guarded story roles, human-review gates, and selected activity history. It does
**not** yet prove a complete per-person, per-AI, per-record operation matrix or
a working external-AI credential-to-tool path. Those remain in design until
implemented and verified end to end.

## Durable information model

The durable model should describe meaning and relationships, not only mirror a
provider's tree or today's database tables.

### People, identities, and names

A person can have multiple names, spellings, titles, languages, identifiers,
and uncertain matches. The model should preserve original source wording,
normalized display forms, name usage over time, and the evidence for an
identity conclusion. Two records that might describe the same person should
not be silently merged.

### Families and relationships

Relationships are first-class, directional where necessary, and flexible
enough for biological, adoptive, step, foster, guardian, household, social,
religious, witness, neighbor, and other historically meaningful connections.
A family may be understood through a changing network, not only one rigid
couple-and-children shape.

Relationship evidence, date ranges, roles, competing interpretations, and
review state should remain visible. A provisional relative is useful research
material, not yet an accepted identity.

### Places, buildings, and communities

Places include countries, regions, towns, parishes, neighborhoods, addresses,
cemeteries, migration routes, and jurisdictions whose names or boundaries may
change over time. Buildings and institutions—homes, churches, schools,
workplaces, courts, ships, hospitals, military units, and archives—can shape a
story and deserve durable connections.

The model must distinguish “this source places the person here” from “this
building or community existed in the surrounding context.” Context can enrich
a story without becoming evidence of personal experience.

### Events, dates, and time

Events may involve multiple people in different roles. Dates may be exact,
approximate, inferred, disputed, open-ended, or expressed as ranges. Historical
periods, wars, migrations, religious movements, economic conditions, and local
events can overlap a life without proving how a person experienced them.

### Sources, documents, records, and media

The workspace should preserve source descriptions, citations, original
artifacts, transcriptions, extracts, scans, photographs, audio, video, letters,
journals, oral histories, family memories, archive references, and provider
links.

Original material should remain distinct from edited text, summaries, and
conclusions. Rights, privacy, repository, page or image reference, capture
time, checksum where available, and transformation history belong with the
material.

A source is not owned by one profile. A census, photograph, journal, letter,
record, or media item can connect to several people and also to a relationship,
place, building, event, claim, collection, or story. Preserve the original once
and make those links explicit; do not duplicate or flatten it into a
one-source-one-person model.

### Claims and interpretations

A claim is a statement that may be supported, challenged, or refined. It
should identify:

- what subject and property it concerns;
- its original and normalized value;
- supporting and conflicting evidence;
- whether the source information is primary, secondary, derivative,
  contextual, or unknown;
- confidence and uncertainty;
- candidate, accepted, preferred, disputed, rejected, or superseded state;
- who or what created or changed it; and
- why one interpretation currently leads.

Uncertain research belongs inside the workspace rather than in an untracked
side conversation. A person or authorized AI may save a source-linked
hypothesis, proposed relationship, candidate identity, or possible event with
its confidence, concise rationale or evidence notes, actor, and timestamp. It
must remain visibly distinct from a confirmed fact and must never silently
rewrite the connected family picture as certain.

Canonical person, relationship, place, or event records can carry a practical
working conclusion, but they are not a place to erase every conflicting claim.
When evidence is shared, each researcher—or their authorized AI acting on their
behalf—may retain or select a different interpretation with its own rationale,
confidence, sources, and reasoning. Family History preserves shared evidence,
separate interpretations, authorship, and history rather than forcing one
official answer. A later correction or promotion is an attributed review event,
not a silent overwrite.

### Research notes, questions, and history

Notes may be raw material, researcher conclusions, generated summaries, leads,
editorial guidance, negative search results, or reminders. Their role should be
visible. Research history should preserve what was searched, what was found,
what was not found, who or what acted, and what changed afterward.

### Stories and narratives

Stories have subjects, scope, source links, claim links, context links, author
or AI attribution, version history, review state, audience, and publication
state. A story can be short or long, private or public, provisional or mature.
Its evidence trail should survive revisions.

### Topics, themes, and historical context

Topics and themes help connect research across people and places: migration,
work, religion, education, language, war, health, community, culture, daily
life, and more. Historical context should carry its own sources, confidence,
time and place scope, review state, and limits.

### Collections and research projects

A collection or research project can gather related people, places, sources,
questions, and stories without changing their underlying ownership or truth.
It is a scope for work and presentation, not permission to merge every record
inside it.

### Visual understanding

Pedigrees, relationship graphs, timelines, maps, migration paths, place
clusters, source coverage, contradiction views, and story-evidence trails are
derived views over the same records. Each view should reveal scope, source,
calculation, freshness, and uncertainty when those details matter.

## Provenance, uncertainty, and changing understanding

Provenance is central. It answers: **Where did this come from, what happened to
it, and why do we currently believe or use it?**

The product must never flatten these into indistinguishable truth:

- a record-supported fact;
- an exact quotation or transcription;
- a researcher's conclusion;
- a reasonable inference;
- general historical context;
- a family memory or family lore;
- an AI suggestion or synthesis; and
- an unresolved contradiction.

A source reference alone does not prove a claim. The system should make the
relationship legible: which detail the source supports, how directly it
supports it, what conflicts, how confident the current interpretation is, and
who reviewed it.

Correction should improve the current understanding without deleting the path
that led there. Accepted claims may be superseded. Names and places may be
renormalized. A family story may become more cautious when a record is
reinterpreted. The useful history is not clutter; it is what makes future AI
reasoning and human trust possible.

Shared evidence does not require shared interpretation. Two collaborators may
look at the same census and select different same-person or relationship
hypotheses. Both can remain legible with their sources, reasoning, confidence,
author/AI attribution, timestamp, review state, and later correction history.

## Relationships and historical context

Family history becomes meaningful through connections.

- A person connects to family, associates, neighbors, witnesses, employers,
  institutions, places, events, sources, claims, and stories.
- A place connects to changing jurisdictions, buildings, communities,
  religions, industries, routes, disasters, and eras.
- A source connects to the people and claims it mentions, not merely the
  profile where it was first found.
- A story connects its details to evidence and its atmosphere to clearly
  labeled context.

The model should permit partial understanding. “Possibly the same person,”
“reported by a grandchild,” “the town was shaped by mining,” and “no record
found in the expected district” can all be useful without pretending to be
settled facts.

Context must not impersonate evidence. If a parish was central to local life,
that does not prove a person attended it. If a migration corridor was common,
that does not prove a family used it. Story language should make the difference
clear without turning every paragraph into a legal disclaimer.

## Storytelling and the optional evidence layer

Storytelling is a primary capability, not a decorative export. Family History
does not prescribe how the person or their chosen AI must write, and it does
not police voice, structure, imagination, or whether every sentence carries a
citation. The author remains in control of the story.

The product's job is to make rich, source-aware writing and reading pleasantly
possible. A story may optionally connect a passage to:

- one or more people and relationships;
- a memory, journal, photograph, letter, census, document, or other source;
- an event, place, city, building, church, school, workplace, or route;
- a claim, hypothesis, competing interpretation, or uncertainty note; and
- wider place/era context that is clearly distinct from evidence about a
  particular person's experience.

Those connections form an optional reader layer. The story should stand on its
own as a readable narrative; a curious reader can open the people, source,
place, event, image, context, or research trail behind a passage when desired.
A writer may link densely, lightly, or not at all. The product offers the
capability rather than turning one evidence format into a writing policy.

When references are used, Family History preserves author or AI attribution,
source provenance, uncertainty, story version history, and the distinction
between original material, interpretation, and historical setting. A corrected
claim can update the optional reader layer without erasing the prior story or
research trail. Private material, living people, restricted media, and
culturally sensitive content still require the applicable audience/rights
review before the product shares or publishes them; that is a product boundary,
not control over the author's external writing process.

## Living people and private family material

Privacy is a quiet boundary, not the public identity of Family History.
Historical research often uses public records, public archives, and people who
are long deceased. The public promise should lead with evidence, connection,
understanding, and story.

Still, living people and private family material require deliberate control.
Private notes, correspondence, recent addresses, contributor details,
restricted media, sensitive relationships, oral histories, and unreviewed
family claims should remain user-controlled.

Private by default does not mean hidden from the authorized family workspace.
The owner and specifically authorized collaborators or chosen AIs may see the
living relatives relevant to their granted archive/project scope. The product
must not infer that someone is deceased merely because of age or an old date;
deceased status comes from an explicit user assertion or supporting evidence,
and its provenance remains visible.

Private, AI-eligible, and public are separate states:

- something may be visible to its owner but not permitted for AI use;
- something may be permitted for a chosen AI but not for Trusted collaborators
  or Unlisted links;
- something may be available to a named collaborator but excluded from every
  bounded link and public story;
- something may be included in a private bounded view but not publicly
  publishable; and
- public historical context does not make every linked family detail public.

Sensitive material remains private by default and is excluded from public
surfaces and any broader Unlisted, Trusted, export, or AI scope unless the
owner explicitly grants the relevant actor, scope, data, operation, and
audience after a visible living/sensitive review. That default does not block
properly authorized workspace access. Private data belongs to the owner: they
must be able to view and correct it while it is retained, export it in a useful
form, and delete it subject only to narrow disclosed retention requirements.

Deceased records may have an easier sharing path once status is explicitly
supported, but they still follow the owner's visibility settings, source and
media rights, and deliberate review. A deceased label does not make every
linked living relative, private note, or sensitive relationship shareable.

Sharing and publishing are explicit, reviewable state changes—never automatic
side effects of import, AI use, a “published” suggestion, or connection to
another Assist product.

### Identity, export, and deletion boundary

Family History identity is site-specific. Signing into or deleting a Family
History account must not sign a person into, delete from, or silently move data
through another Assist product. The repository contains conditional Clerk
identity and owner-isolation foundations, but the exact deployed identity and
trust-boundary configuration is **Unknown** until verified in the real
environment.

Before the big/public launch, `/settings/data` must let a person export the
Family History data held about them in a useful form, view and correct their
records, see every active share and AI grant, delete a record, and request
deletion of the site-specific account. Record
deletion removes the record, attachments, and content-bearing history; only a
minimal content-free tombstone may remain when operationally necessary.
Account deletion must map and remove the Clerk identity, Convex owner records,
raw artifacts and exports, media/storage objects, Unlisted links, AI grants, and
other processors keyed to that account, with any lawful retention explained
plainly. `/delete-account` provides the stable public explanation and signed-in
request path required for later Google Play readiness. None of these complete
paths is verified today, so they are **Coming soon**, not Current.

## Collaboration and bounded sharing

Family History adopts the family access vocabulary: **Private**, **Unlisted**,
**Trusted**, and **Public**. Private is the default. Family History intends all
four for appropriate selected objects and views, with each complete path still
labeled **In design** until verified; it must not invent a competing name or
meaning.

The visibility choice belongs to a selected object or reviewed view—not to the
whole archive by accident. Appropriate stories, collections, source/record
surfaces, and other deliberately bounded views may be Private, Unlisted,
Trusted, or Public. Every change is explicit, previewable, reviewable,
revocable, and attributable. Making one story Public or one source Unlisted
does not broaden linked people, notes, media, claims, or the archive around it.

The repository currently proves owner-scoped Private foundations and a
guarded, separately promoted Public story path in source. Family History also
needs two distinct future sharing modes—Trusted collaboration and Unlisted
bounded views. Neither is verified as a complete current repository
capability; both are **In design**. Public visibility for a deliberately
reviewed story, collection, or appropriate source/record view is intentional
and bounded, never permission to make the underlying vault public.

### Trusted collaboration inside a project

A Trusted collaborator is an identifiable person invited into a family-history
project or selected boundary. Their access is tied to a named Assist With Family
History account, for example an account email, and limited to the named archive,
family tree, research project, person, story, collection, share, or narrower
record.

Keep the roles simple:

| Role | Plain meaning |
|---|---|
| **Viewer** | Read the approved shared records and stories. |
| **Contributor** | Add sources, notes, candidate facts, hypotheses, and other proposed research without silently promoting them to confirmed truth. |
| **Editor** | Organize and improve the shared records inside the granted boundary while preserving provenance and interpretation history. |
| **Owner** | Manage the relevant people/archive boundary, sharing, roles, permissions, and consequential promotion/publication controls. |

Roles are a starting bundle, not an enterprise permission system. The visible
grant still names the exact archive/project/share scope, relevant data,
operation limits, approval, and revoke condition. Viewer never implies edit;
Contributor never implies merge or publish; Editor never implies ownership;
Owner applies only to the boundary actually granted.

Collaboration is not blanket vault access. The invite, acceptance, actor,
scope, allowed operations, changes, and revocation should remain visible and
auditable. Removing a collaborator ends future access without erasing the
attributed research or review history they already contributed.

Shared evidence does not force a shared conclusion. A Contributor, Editor, or
their authorized AI may retain or select a hypothesis with its rationale,
confidence, sources, reasoning, and authorship while another collaborator keeps
a different interpretation. Private working material can remain private until
deliberately shared. The product preserves the linked evidence and parallel
interpretation history instead of silently resolving conflict.

### An Unlisted link to a bounded view

An Unlisted link is a long, unguessable, read-only address that gives its holder
access only to a deliberately selected story, tree branch, collection,
appropriate source/record surface, or other bounded view. It is not secret,
never expires on its own, and works until the owner revokes it. It is not an
invitation into the project, does not identify
its holder as a collaborator, and does not grant access to neighboring people,
sources, notes, stories, or the full tree.

Before creating a link, the owner should be able to review exactly what the
view contains, who it is intended for, that anyone holding the address can open
it, that it is not indexed or listed, and whether any supported copying or
download is allowed. Its status and scope must be understandable, revocable,
and auditable; revocation ends access immediately. A tree-branch link is a
bounded view of selected relationships and supporting material—not a transfer
of ownership or a copy of the whole family tree.

Trusted collaboration and Unlisted sharing can coexist, but neither implies
the other. A collaborator does not automatically receive an Unlisted link, and
a link holder does not gain collaboration or mutation authority.

### Public visibility remains separate

Making a story, collection, or appropriate source/record view Public is a
separate, explicit promotion decision. An invite does not publish; creating or
opening an Unlisted link does not make its contents public or searchable; and a
Public object does not expose the underlying project, tree branch, collection,
private sources, research notes, or connected records outside its reviewed
boundary.

Living people and sensitive family documents stay inside the Private workspace
by default but may be visible to the owner and specifically authorized Trusted
collaborators or chosen AIs inside their granted scope. Moving that material to
broader Trusted access, an Unlisted view, an export, or Public visibility
requires a deliberate living/sensitive review naming the relevant data,
recipient/audience, and operation.
Inherited relationships, public historical context, or an already-public story
must never silently broaden that boundary. One owner-visible screen must
eventually list every active Unlisted, Trusted, or chosen-AI grant and make each
one revocable. A chosen AI receiving a separately approved private handoff does
not make that material collaborator-visible, Unlisted, or Public.

## Human visibility and control

A person should be able to answer these questions without learning database or
AI-platform vocabulary:

1. Which family tree, person, story, collection, or research project am I
   viewing?
2. Who or what may retrieve information here?
3. Who or what may add, update, delete, promote, merge, or publish here?
4. What do we currently know, suspect, dispute, and still need to research?
5. Which sources support this claim or story detail?
6. Which details are context, inference, family lore, or AI synthesis?
7. What changed, who or what changed it, and can I correct or recover it?
8. Which Queue work **Needs you**, is **Working**, is **Waiting for your AI**,
   or is **Done**—and which separate research records remain proposed,
   disputed, or under review?
9. What is private, AI-eligible, available to named collaborators, included in
   a bounded link, or public?
10. Which outside or cross-Assist connections exist, what can they do, and how
    do I revoke them?
11. Which external-action handoffs were approved, which AI received them, what
    selected data went with them, and what result, failure, or return was
    recorded?

Visual and batch review are controls, not universal gates. Within explicit
operation authority, the person may choose direct saving, review-before-save,
or risk-proportionate checkpoints. Identity merges, destructive deletion,
promotion of disputed claims, and publication deserve stronger proof than
adding a low-risk research note.

Family History should remain useful without an AI. A person must be able to
inspect, correct, organize, research, write, and control their information
through human-complete workflows.

## How to use this document

Read the family contract adoption record, identity, practical picture, two
differentiation sections, product scope, durable family model, and
research-to-story loop first. They are the philosophical heart and the shared
alignment boundary. The later builder reference translates that philosophy
into operating contracts and dated capability truth without replacing it. For
focused work, use this map:

| Reader | Start with | Questions answered |
|---|---|---|
| Product owners | [Family alignment](#family-core-alignment-record), [One-sentence identity](#one-sentence-identity), [Who this serves](#who-this-serves-and-what-they-need), [Practical picture](#practical-picture-think-of-it-as), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-website), [Product scope](#product-scope-and-non-goals), [Durable family model](#the-durable-assist-family-and-trust-model), [Friendly start](#a-friendly-start-people-relationships-and-a-connected-archive), and [Shared authority](#user-owned-data-and-shared-authority) | What Family History helps with, who it serves, how it adopts the family contract, why a durable workspace matters, how People/relationships and imports enter the connected archive, who owns the work, and what the product must not become |
| Implementers | [Builder reference](#builder-reference-operating-model-and-capability-truth), [AI and Queue model](#how-your-ai-and-the-family-history-queue-work), [Information model](#durable-information-model), [Provenance](#provenance-uncertainty-and-changing-understanding), and [Maintenance](#maintenance-and-claim-verification) | What must persist, how work begins or resumes, which distinctions must survive, and what needs proof |
| AI and integration builders | [Builder reference](#builder-reference-operating-model-and-capability-truth), [AI and Queue model](#how-your-ai-and-the-family-history-queue-work), [Shared authority](#user-owned-data-and-shared-authority), [Questions and queues](#questions-queues-and-unfinished-work), and [Detailed trust boundaries](#detailed-trust-boundaries-for-builders) | Where the chosen AI works, which Family History operations may be used, what a durable handoff contains, and where the site's responsibility stops |
| Writers and designers | [One-sentence identity](#one-sentence-identity), [Practical picture](#practical-picture-think-of-it-as), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-website), [Product scope](#product-scope-and-non-goals), [Storytelling and evidence](#storytelling-and-the-optional-evidence-layer), [Capability truth](#capability-truth), [Language rules](#language-rules), and [Homepage implications](#public-homepage-and-future-shell-implications) | How to explain the product simply, differentiate it responsibly, state what may be claimed now, preserve writer control while offering optional evidence exploration, and preserve the intended feel |

Anyone publishing a capability claim must read both
[Capability truth](#capability-truth) and
[Maintenance and claim verification](#maintenance-and-claim-verification).

## Builder reference: operating model and capability truth

The sections above define the human promise, durable trust model, and
research-to-story philosophy. The sections below are the secondary reference
for people and AIs making product, design, engineering, integration, and
feature decisions.

Use this builder reference to preserve five implementation contracts:

1. the chosen AI works alongside Family History rather than being replaced by
   it;
2. queue work carries scope, evidence, authority, state, blockers, and the
   exact next step across sessions;
3. observing or retrieving remains distinct from changing, deleting,
   promoting, sharing, publishing, exporting, or receiving an external-action
   handoff;
4. implementation claims use the complete status vocabulary in the family
   alignment record, with **Coming soon** reserved for committed
   big/public-launch work; and
5. repository foundations, deployed behavior, public proof, and authenticated
   operational proof remain distinct.

This boundary makes the document easier to absorb; it does not make the
builder material optional. Any design or feature choice that touches AI work,
authority, provenance, queues, sharing, publication, or a capability claim
must follow the relevant sections below.

## How your AI and the Family History Queue work

Family History is designed to work alongside the AI environment a person
chooses, not replace it. A person may continue working in ChatGPT, Codex,
Claude, OpenClaude, Gemini, Hermes, or a future compatible system. These names
are examples of user choice—not a preferred vendor list or a claim that direct
integration with each client is currently shipped.

The enduring split is:

- **Your chosen AI remains the place for conversation, reasoning, research,
  synthesis, and judgment.**
- **Family History gives that work durable domain memory, scoped records and
  tools, a resumable Queue, and a visual place for you to understand progress,
  evidence, uncertainty, and results.**
- **You decide which AI may use which Family History scope and operation.**
  Neither an AI client's general capability nor an unrelated Queue item grants
  broader Family History authority.

People remain free to discuss or direct their AI however they want outside
Family History, including requests beyond the product's current settings. The
product does not monitor, control, or police those conversations or the AI's
general behavior. It enforces only its side of the boundary: whether that AI
may use Family History tools, retrieve selected Family History data, perform a
Family History operation, or receive a specifically approved recorded handoff.

Work can begin in either direction.

### Begin in your preferred AI environment

A person and their AI may begin with a conversation, document, research
question, or outside investigation in the AI environment they already use.
That conversation may include any instruction the person chooses; it is not
limited by Family History settings. Those settings matter only when the AI
asks Family History for data, a tool operation, or an approved handoff.
Through an available manual handoff or a separately shipped, authorized
connection, they can retrieve the relevant Family History context, work with
it, and return selected sources, notes, claims, questions, or story material to
the permitted scope.

Family History then preserves the useful result beyond that conversation. The
person can inspect it visually, see where it came from, correct it, connect it
to related people and evidence, and decide what should happen next.

### Begin in Family History

A person may instead begin in the site by defining work for later: the family,
person, source, story, collection, or research project in scope; the question
or requested outcome; relevant evidence and context; priority; constraints;
and the authority available to the chosen AI.

That directive can wait in the Queue until the person or an authorized,
compatible AI path picks it up. The result returns to the same durable context
with its acting identity, evidence, state, history, and next step intact. This
direction supports asynchronous work without requiring the person to keep one
chat open or reconstruct the assignment later.

### An optional library of prompts and research loops

Family History may offer a small, curated menu of proven starting patterns for
the person's chosen AI. It is help, not an automation engine. The person or AI
may inspect an entry, edit it, adapt it, combine it with another, or ignore it
entirely. No entry is a required route, a permission grant, or a policy.

A **prompt** is one editable instruction for a single piece of work. A
**research loop** is a reusable repeat pattern: gather, compare, record what was
learned, identify the next gap, and continue under the user's authority. The
distinction should remain clear so a simple prompt does not masquerade as an
autonomous workflow.

Useful candidates include:

- make a research plan for an ancestor or family line;
- compare evidence and frame a same-person hypothesis;
- identify gaps, conflicts, and the next useful sources;
- create a source-aware story outline;
- research place and era context;
- draft interview questions for living relatives;
- translate, transcribe, or interpret a supplied source; and
- create a brief for a family tree, visual, or story project.

Every entry carries transparent freshness and provenance appropriate to its
form: version, created date, last reviewed or updated date, author/maintainer
when meaningful, intended purpose, and known assumptions or limits. Older
patterns may still be useful, but neither the product nor a chosen AI should
silently treat age as current truth. The library is **In design**; current
research-planner references and prompt exports do not prove a shipped curated
library or a compatible chosen-AI connection.

### The directive is enough; context is optional

The Family History Queue begins with one required field: the person's directive
in their own words. No category, attachment, family-tree selection, or form may
block submission. “Add context” is one optional tap and offers three
genealogy-shaped groups:

1. **Research subject** — a person, family line, relationship, place, building,
   community, event, or era.
2. **Evidence** — a source, document, record, photograph, media item, memory,
   citation, or claim.
3. **Work thread** — a research question, project, collection, or story.

These groups are an **Intentional product-specific difference**: they keep the
family's directive-first interaction while preserving the richer Family
History graph. Backend adapters are **Current / verified in source** for
owner-verified person, relationship, place, event, source, citation, media,
context item, research task/check, story, import run, and provisional-relative
references. Final chips and interaction remain for the designed Queue
experience. Project/collection adapters wait for matching durable records.

### Four Queue states, exactly

| State | Family History meaning | Card requirement |
|---|---|---|
| **Needs you** | Work stopped on a decision, fact, file, review, or authority only the person can provide | The smallest exact question, answerable in place |
| **Working** | The person's AI has picked up the directive | The current step in genealogy language |
| **Waiting for your AI** | The directive was accepted but no AI has picked it up | Plainly state that nothing is running; before connection, link to `/ai` |
| **Done** | A result or answered question is attached | The readable result, evidence links, provenance, and any remaining uncertainty |

There is no fifth product Queue state. **Needs review**, **provisional**,
**disputed**, **publishable**, and similar terms remain valuable record or
evidence states; they do not become Queue states. Current database values such
as `todo`, `in_progress`, and `blocked` belong to the existing research-task
implementation and must not be presented as the family Queue vocabulary.

### Bounded directive authority

The directive records what the person wants and can provide action-specific
approval, but it never silently expands the chosen AI's standing authority. A
Queue handoff is allowed only when the product can identify the AI, exact
scope, permitted data, operation or external-action category, approval, and
expiry or revocation condition.

Inside that explicit grant, the directive may authorize reversible, in-scope
Family History record changes plainly necessary to complete the request. It
does not silently authorize a new objective, destructive work, identity merge,
promotion of a disputed claim, publication, purchase, access or identity
change, or a different outside action. If required authority is missing or the
intended scope is genuinely unclear, the card moves to **Needs you** with the
smallest exact question that unlocks it.

Family History never independently contacts a relative or archive, makes an
offer, purchases, publishes, or otherwise acts in the outside world. When the
owner has already granted the necessary external-action category, however, the
Queue may hand the named chosen AI a specifically approved intent and selected
context. It records the actor, scope, permitted data, action approval, time,
expiry/revocation condition, result, and any denial, failure, or return. The
chosen AI—not Family History—then decides and acts under the person's direction
outside the product.

Permission and Queue authority remain separate layers. A directive cannot
grant an AI access to a person or source it was not allowed to read; a general
write grant cannot invent a directive; and a review preference cannot widen
either one. If an owner has disallowed a Family History operation, the product
must deny it. That denial does not forbid the person from discussing or asking
for the same thing in their AI's external environment.

### A Queue is continuity, not a todo list

A useful queue item preserves:

- the directive verbatim, the exact scope, and requested outcome;
- its one family Queue state;
- the handoff line: who it was left for, when, and whether it was picked up;
- priority and why the work matters now;
- any optional evidence, context, questions, assumptions, and prior attempts;
- the responsible person or AI and the operations actually authorized;
- any external-action intent, selected data disclosure, approval, expiry or
  revocation condition, and receipt;
- the exact next step while Working or blocker question while Needs you; and
- result links, provenance, decisions, and history.

That continuity changes the work. One AI session can stop and a later session
or compatible client can understand what has already happened, what remains
uncertain, and the smallest useful action to take next. The person can see
progress and results without treating the queue as permission or trusting an
opaque “working” state.

> **Capability truth:** The current source has a distinct product Queue backend
> with directive-only creation, four states, owner-verified context, bounded
> commands, leases, retry/failure/cancel/expiry conditions, cursor pagination,
> idempotency, concurrency protection, attributed activity, and hard deletion.
> The research-operations console remains separate. PR #31's full CI,
> Vercel preview/production statuses, live alias, and signed-out Queue
> protection are verified. No final `/queue` page, authenticated persistence,
> exact production Convex build-plan log, or arbitrary-client
> credential-to-tool round trip is verified; those remain **Coming soon**.

### The product Queue is not the project tracker

The Queue carries a person's family-history directive inside the product. The
internal tracker coordinates building the product. The tracker has exactly
three top-level concepts: **Cards** record one outcome and current truth;
**Work Orders** bundle an owner-approved, bounded tranche; and the **Guide**
teaches a new person or AI how to continue. Work Order execution
(`Ready / Active / Complete / Superseded`) remains separate from independent
audit (`Not audited / Passed / Follow-up needed`), with real model/agent
provenance and evidence recorded for both.

The canonical tracker source is `docs/tracker/`, with generated Kanban and Work
Orders views in `docs/tracker/board.html` and the stable one-minute contract in
`docs/tracker/GUIDE.md`. Current agent instructions use this repository truth;
historical Linear references do not route or authorize work. AWF-WO-001 is the
bounded migration and AWF-0004 preserves independent audit as a later fact.
This package still does not substitute for the product's research operations
console, create a competing board, or add an automatic dispatcher.

The state fast lane is **Current / verified**. PR #28 carried its software,
workflow, validators, provider configuration, and branch policy through normal
full CI and a real production build. Useful state commit `dc30429` then ran only
the lightweight GitHub validation path; Vercel canceled deployment
`dpl_8FfUtYW5FBJ6sZLbXGkiZtbQvf3a` after the ignore classifier validated all 5
changes and before application output; and `discovertheirstories.com` remained
on successful deployment `dpl_vngjLJMJRMBgo7dM6gpBvT2p7C6J`. Vercel's current
inspection schema exposes one empty build envelope even for the canceled record,
so evidence should say “canceled before application build/output” rather than
claiming its provider array is empty.

## Questions, queues, and unfinished work

The earlier [AI and Queue model](#how-your-ai-and-the-family-history-queue-work)
explains the two directions of work. This section defines the durable research
contract behind that handoff.

Questions belong to the person, relationship, source, claim, place, event,
story, collection, or research project they concern. They can remain open
without blocking unrelated work.

The product Queue is the durable front door for new instructions and resumable work:
records to seek, captures to review, claims to compare, provisional identities
to resolve, context to research, stories to revise, and publication checks to
complete.

A useful queue item records:

- scope and requested outcome;
- responsible person or AI;
- source or evidence references;
- exactly one Queue state: **Needs you**, **Working**, **Waiting for your AI**,
  or **Done**;
- questions and assumptions;
- next action and checkpoint;
- result links and history; and
- what authority the assigned actor actually has.

The Queue coordinates work under the bounded directive authority above. It
does not turn every question into an approval gate or grant access beyond the
AI's existing scope. When the needed grant already exists, it may hand the
work to that chosen AI and record the approval, actor, scope, time, result, and
any failure or return. Work may pause for the person, their AI, a provider, an
archive, or better evidence. When missing authority or information can only be
supplied by the person, the Queue state is **Needs you** and asks the smallest
exact question; when nothing has picked it up, it is **Waiting for your AI**.
The next session should resume without reconstructing the whole conversation.

## Capability truth

Every user-facing capability must have exactly one status. Status is based on
current proof, not design intent.

| Status | Meaning | Claim rule |
|---|---|---|
| **Current / verified** | Verified in the checked-out repository, with the exact evidence boundary stated | May be described as a repository foundation; it is not automatically a deployed or production claim |
| **Partial / verified foundation** | Named pieces are verified, but the complete capability or user path is not | Describe only the proven pieces and state the missing boundary in the same claim; never shorten this to Current |
| **Coming soon** | Committed work required for the big/public launch but not yet verified | May appear on a soft-launch public surface only beside the unfinished claim or non-working future control; never on `/updates`, `/ai`, or `/ai.txt` as though usable |
| **In design** | The philosophy or an active design/architecture direction defines it, but the complete user path is not verified | Must be labeled “in design”; no direct action or implied availability |
| **Later** | Desired, partial, exploratory, or unscheduled capability | May appear only as future direction, never as a promise |
| **Intentional product-specific difference** | Family History needs a different domain object, workflow detail, safety gate, voice, or visual treatment while keeping shared family behavior | State the reason and preserve the family boundary it extends |
| **Unknown** | The repository cannot prove current live, provider, catalog, or authenticated operational state | Do not infer a launch or availability state; verify externally before a claim |

For public availability, **Current / verified** must be upgraded with exact deployed
environment and user-path proof. Source code, a route, a mockup, a Linear issue,
or an older production observation is not sufficient by itself.

### Dated repository capability ledger

> **Time-sensitive evidence—verified 2026-08-07 at repository commit
> `2ec5b70`:** This table describes the checked-out source. It does not prove
> deployment, provider configuration, authenticated production behavior, or
> safe operation with private family data.

| Capability area | Repository evidence | Honest interpretation |
|---|---|---|
| Research vault | Owner-scoped Convex tables for people, alternate names, relationships, events, places, sources, citations, candidate source facts, media, context, imports, tasks, logs, stories, and historical context | **Current / verified repository foundation.** Richer generalized claims, institutions, collections, and version histories remain **In design** |
| FamilySearch intake | User-mediated Chrome extension capture, package validation, preview, merge, dedupe, warnings, and raw/provenance contracts | **Current / verified repository foundation.** Automatic import, provider API access, unattended crawling, and universal genealogy integration are not claimed |
| Provenance and uncertainty | Source/citation separation, citation confidence and conflicts, candidate/accepted/conflict/rejected source facts, import runs, research logs, and context source references | **Current / verified partial foundation.** A complete generalized claim/provenance graph and immutable research history remain **In design** |
| Relationships | First-class person-to-person relationship rows, roles, facts, provisional relatives, and guarded promotion/merge flow | **Current / verified partial foundation.** People/relationship-first onboarding, wider many-to-many source/context links, stored hypotheses, and full separate-interpretation history remain **In design** |
| Context | Loose context items plus place/era research packs with sources, confidence, review, privacy, and AI-use gates | **Current / verified partial foundation.** Buildings and institutions are pack/context types; a complete first-class context graph remains **In design** |
| Questions and operations | Research tasks/checks/log, `/app/operations`, compact handoff export, plus distinct `queueItems`, `queueActivity`, idempotent command receipts, `/api/queue`, exact four-state transitions, owner-verified context adapters, bounded queries, leases, retry/failure/cancel/expiry, and deletion contracts | **Current / verified repository and deployed Next.js backend foundation.** PR #31 passed full CI and Vercel preview/production; the signed-out live protection boundary was observed. The operations console remains distinct. Final `/queue` UI, authenticated persistence, exact Convex deploy-log proof, and a complete external chosen-AI pickup/return path are **Coming soon** |
| AI context and Story Writer | Owner-scoped person context packs; manual prompt copy; optional OpenRouter generation; editable draft save with model/prompt metadata | **Current / verified repository foundation.** Generation is person-centered and first-party; arbitrary chosen-AI connectivity and every story subject remain unverified |
| Prompt and research-loop library | Product docs mention research planners and prompt exports; no verified curated library, freshness metadata, or chosen-AI library path | **In design.** Optional, editable prompt/loop patterns are approved direction, not a shipped feature or automation engine |
| Story Studio and publication | Draft/review/published states, reviewer assignment, evidence/context/privacy/living-person gates, explicit human confirmation, public story DTO filtering, and unpublish paths | **Current / verified repository foundation.** Optional passage-to-evidence reader links and selected-object visibility beyond the guarded story path remain **In design**; public availability is **Unknown** pending deployed user-path proof |
| Collaboration and bounded sharing | Owner-scoped private vault operations plus guarded public-story publication; no complete invite, role, interpretation, or unlisted-link path | **Current / verified Private and guarded Public foundations.** Selected-object Private / Unlisted / Trusted / Public visibility, Viewer / Contributor / Editor / Owner roles, shared evidence with separate interpretations, and living/sensitive review are **In design** |
| Scoped authority | Scope vocabulary, API-key mint/list/suspend/revoke primitives, owner checks, story roles, guarded publish actions, selected review/audit events, and bounded Queue command scopes | **Current / verified partial foundation.** Queue commands do not grant domain authority, but no complete grant yet binds an external chosen AI, scope, permitted data, operation/external-action category, approval, expiry/revocation, and attributable result. Incoming API-key resolution remains unfinished; self-asserted story headers are not a public authorization model |
| API and AI connections | Internal app APIs, API-key management, Queue scope presets, `agentActivity`, capability manifest, story OpenAPI skeleton, `/api/capabilities`, API Center source, `/llms.txt`, plus `/mcp`, `/ai`, and `/ai.txt` | **Current / verified source and isolated official-client foundation; Partial deployed connection.** Twelve stateless MCP workflow tools resolve the owner from an exact-issuer, Clerk-shaped OAuth access token with an OAuth client identifier, keep reads bounded, and write canonical records with receipts and human publication gates. Ordinary Clerk session JWTs are rejected. The official v2 client and a generated signed token have exercised the real handler and isolated tenants. No provider registration/consent, named client, production-authenticated journey, reconnect, revocation, or `/settings/ai` path is claimed |
| Search and retrieval | Person/place/stories views, owner-scoped API reads, context packs, filters, and queue exports | **Current / verified narrow retrieval surfaces.** Universal search across the full information model is **In design** |
| Visualization | People/place workspaces and data suitable for relational views; Timeline route is explicitly a placeholder | **Current / verified partial foundation; In design full experience.** Do not claim timeline, pedigree, map, heatmap, or general graph experiences as shipped |
| Retention, export, and deletion | Person context-pack export, low-level record operations, and key revocation plus a documented lifecycle gap | **Current / verified narrow tools; Coming soon complete contract.** No complete owner-vault export, coordinated retention policy, `/settings/data`, `/delete-account`, or cross-store deletion workflow is verified |
| Cross-product Assist links | Philosophy and portfolio direction only | **Later.** No qualifying explicit, reviewable, revocable Family History connection is verified |

The family contract makes its Tier A gaps committed big/public-launch work, so
this philosophy labels those gaps **Coming soon**. That status is not delivery
proof. The repository's Timeline placeholder remains **Later** because no
active owned delivery commitment is verified. Unscheduled ideas stay **Later**
and must not borrow the **Coming soon** label.

### Explicitly unclaimed until verified

Do not claim these as current merely because the information model anticipates
them or a planning artifact names them:

- universal “works with any AI” compatibility, a named-client provider consent
  journey, production-authenticated reconnect/revocation, or granular client grants;
- people/relationship-first onboarding or automatic construction of a connected
  family picture from an external service;
- automatic record import or direct FamilySearch/provider API access;
- Ancestry, Findmypast, Find a Grave, newspaper, archive, or universal provider
  integration;
- general archival access, unattended crawling, or provider account access;
- universal search across every person, source, claim, note, and story;
- a complete per-person and per-AI read/create/update/delete/promote/publish
  authority matrix;
- a deployed named-client credential-to-Queue round trip, provider/client
  compatibility beyond the protocol foundation, or quotas;
- granular, recorded external-action handoffs with selected private context,
  action-category approval, expiry/revocation, result, and failure/return;
- first-class generalized claims, institutions, buildings, communities,
  topics, collections, and story versioning;
- a curated prompt/research-loop library, freshness review process, or
  site-operated autonomous research engine;
- automatic story generation for every subject type;
- timelines, maps, pedigree explorers, relationship graphs, heatmaps, or
  migration visualizations as completed experiences;
- named project collaboration, Viewer/Contributor/Editor/Owner roles, separate
  collaborator interpretations, or family review;
- scoped Unlisted links for a story, tree branch, collection, or
  bounded view;
- optional passage-level story/source exploration, books, exhibits,
  audio/podcast production, or general publishing;
- owner-vault export and coordinated account deletion; or
- cross-product Assist data retrieval, navigation, or publication.

## Detailed trust boundaries for builders

Assist With Family History does not:

- store FamilySearch, Ancestry, archive, browser, or chosen-AI passwords,
  cookies, or sessions;
- independently contact relatives, researchers, archives, churches,
  repositories, or record providers;
- independently make offers, purchase, publish, share, export, or take another
  outside-world action without the applicable explicit owner-approved product
  operation;
- browse, crawl, or retrieve records in the background unless a separately
  shipped Family History integration explicitly says it does;
- decide what external sites, tools, accounts, communications, or actions a
  person may authorize their chosen AI to use;
- control or police what the person discusses with their AI outside Family
  History, even when that request exceeds the product's grants;
- present an inference, family story, generated summary, or historical
  generalization as a record-supported fact;
- silently overwrite accepted facts, merge identities, or flatten
  contradictions;
- let an actor change, delete, promote, merge, or publish merely because that
  actor may retrieve;
- treat an automation or review preference as authority;
- turn a Trusted invitation into blanket vault access or let an Unlisted link
  expose neighboring or newly connected records outside its reviewed view;
- treat an Unlisted link as collaboration authority, index or list it, add an
  automatic expiry, or convert either sharing mode into public publication;
- publish living-person information, private family material, restricted
  media, or unreviewed claims automatically;
- silently share information with another person, AI, family tree, research
  project, public surface, or Assist product;
- guarantee genealogical accuracy, legal rights, cultural interpretation,
  archival completeness, or that research is finished; or
- dictate or police the conduct of the person's chosen AI outside this
  product.

These boundaries apply to Family History, not to the person's independently
authorized relationship with their AI. Your AI may browse, research,
communicate, contact someone, make an offer, purchase, or take another outside
action when you direct it under that relationship. Family History does not
operate or inherit that outside access. It receives only material intentionally
submitted through its own scoped path.

Family History must enforce its own side precisely. A disallowed tool call,
private-data retrieval, record mutation, product share/publish/export, or
external-action handoff is denied even if the person and AI have discussed it
elsewhere. That denial limits the product operation, not the conversation. A
permitted external-action handoff names the chosen AI, selected context, scope,
action category, approval, time, and expiry or revocation condition, then
records the result and any denial, failure, or return. The platform supplies
the bounded handoff; it does not become the outside-world actor.

The current first-party Story Writer may use an OpenRouter key kept in the
user's local browser settings for an explicit generation request. That narrow
browser-local setting is not a FamilySearch/archive credential store, an
external-AI account connection, or evidence that the product keeps provider
sessions. Public wording should not generalize it into “Family History connects
to your accounts.”

The repository can mint, list, suspend, and revoke Family History API keys, but
it does not yet resolve an incoming key into an externally usable Family
History tool session. A future verified connection is different from
collecting credentials used to access an outside provider. Family History
authorization must derive and enforce acting identity, family and record scope,
permitted data, allowed product operation or external-action handoff category,
approval, and expiry/revocation; preserve provenance and activity; and keep
retrieval, mutation, product sharing/publishing/export, and outside-action
handoffs distinct.

## Language rules

Public and product language should:

- say **“your AI”** for the AI the person chooses;
- describe Family History as the durable research-to-story workspace, not as
  the AI itself;
- say **person**, **family**, **relationship**, **place**, **building**,
  **event**, **source**, **claim**, **question**, **context**, and **story**
  before technical data-model terms;
- say **source-aware**, **evidence-backed**, **inferred**, **disputed**,
  **family lore**, or **historical context** according to the actual state;
- use **research trail** or **where this came from** when “provenance” would
  slow a general reader;
- distinguish original material, transcription, extraction, conclusion,
  synthesis, and narrative;
- say that People and relationships are the friendly first step while imports
  and outside research are accelerators into the connected archive—not the
  required shape of every record;
- describe hypotheses and separate interpretations as durable, attributable
  research states rather than errors to hide or one official answer to force;
- describe prompts and loops as optional, editable, combinable, ignorable
  patterns with freshness/provenance metadata—not site-owned automation;
- preserve the writer's control: story evidence links are an optional reader
  layer, not a mandatory citation format or product-policed writing style;
- distinguish observing or retrieving from adding, updating, deleting,
  promoting, merging, and publishing;
- name the actual tree, person, source, story, collection, or research-project
  scope when describing access;
- use **Trusted collaborator** for an identifiable person invited into a
  project with explicit operations;
- use **Unlisted link** for non-expiring, owner-revocable, read-only access to a
  selected story, tree branch, collection, or bounded view without project
  membership or mutation authority;
- use **public story** only for separately promoted, publicly available
  narrative output;
- keep private, AI-eligible, collaborator-visible, link-visible, and public
  states separate;
- distinguish external user-authorized AI activity from a Family
  History-operated integration;
- say plainly that people may discuss or direct their AI however they want
  outside the product, while Family History grants govern only access to its
  tools, data, operations, and recorded handoffs;
- describe an **external-action handoff** as selected context plus one approved
  intent given to the named chosen AI—not as Family History contacting,
  offering, purchasing, publishing, or acting on the person's behalf;
- use **AI environment** for the external place where the person and their
  chosen AI converse and work; naming a client must not imply a shipped
  integration or preferred vendor;
- describe the product **Queue** as a directive-first handoff with exactly
  **Needs you**, **Working**, **Waiting for your AI**, and **Done**—not as a
  generic todo list, autonomous runner, internal project tracker, or unlimited
  authority grant; and
- label **Current / verified**, **Partial / verified foundation**, **Coming
  soon**, **In design**, **Later**, **Intentional product-specific difference**,
  or **Unknown** directly.

Avoid **“agent”** in user-facing copy when **“your AI”** communicates the idea.
Technical documentation may retain agent, API key, scope, MCP, or tool where
implementation precision requires it.

Do not say **“the AI knows your family,” “automatic genealogy,” “searches every
archive,” “imports everything,” “proves your ancestry,” “writes the true
story,” “works with any AI,” “connects all your accounts,”** or **“publishes for
you”** unless the exact narrower statement is currently verified.

Use **Family History** for the enduring product identity. Use **Discover Their
Stories** for the current repository/application name where compatibility,
delivery, or historical precision requires it. This philosophy does not claim
that branding, domains, redirects, or provider configuration have changed.

## Distinctive design and interaction character

Family History should feel like a serious, generous research folio rather than
a generic SaaS dashboard or chatbot wrapper. Its visual language comes from
archives and field research: parchment-like surfaces, map and compass cues,
margin notes, captions, source marks, restrained teal and rust, and a visible
thread running from clue to evidence to interpretation to story. Typography is
editorial and deliberately paired; it should make long-form reading and dense
evidence comparison feel related without making either look like the other.

The interface may be information-rich because the domain requires comparison,
provenance, and changing interpretations. Density is organized rather than
removed: decision columns lead, sources and confidence sit beside the claims
they qualify, and deeper detail opens without losing the current person or
research trail. On a phone, the experience becomes narrower and more focused,
not a miniature desktop table.

The voice is calm, curious, humane, and specific. It distinguishes record,
memory, inference, context, and story without sounding clinical; it invites
correction without scolding; and it never turns private-family safeguards into
the emotional headline. Shared Assist routes and controls should feel native to
this system, but they do not replace its information architecture, typography,
palette, imagery, density, or interaction rhythm.

## Public homepage and future shell implications

These are design constraints, not a UI specification or authorization to
change the application.

### Public homepage

- Lead with research-to-story: collect and connect evidence so people and
  their AI can understand lives and tell grounded stories.
- Make the friendly first step concrete: begin with someone and a known family
  connection, then add relatives and let authorized imports or chosen-AI
  research accelerate the connected picture. Do not claim a final onboarding
  UI or direct provider connection until verified.
- Make the Assist family model clear: your AI reasons and researches; Family
  History remembers and organizes; you remain the authority.
- Use the family turn of phrase at least once: **“Assist your AI, so it can
  assist you with family history.”** Keep the fuller research-to-story identity
  as the product-specific promise around it.
- Include six to ten real FAQ questions on the home page, one honest screenshot
  of the working product, and an early invitation to `/ai`. The setup offer
  explains the outcome in human terms rather than leading with MCP.
- Show that the subject can be a person, family, place, building, community,
  culture, religion, event, or era—not only a pedigree node.
- Demonstrate the path from source to claim to context to story, including an
  honest contradiction or uncertain detail.
- Demonstrate many-to-many connection: one photograph, census, journal,
  document, place, building, or event may relate to several people and stories.
- Explain provenance in human language: “see where each detail came from.”
- Show user-owned scoped authority without depicting read access as blanket
  permission to change or publish.
- Explain the control boundary plainly: Family History does not police a
  person's external AI conversation; it grants or denies only its own data,
  tools, product operations, and recorded handoffs.
- Show both work directions: continue in a preferred AI environment and
  preserve selected context in Family History, or create scoped queued work in
  Family History for a later authorized pickup.
- Name example AI environments only to illustrate user choice, and label the
  actual connection status rather than implying universal compatibility.
- Explain that Trusted collaboration and Unlisted links are different
  **In design** access modes; do not present either as current until verified.
- Keep living/private material as a quiet control, not the emotional headline.
- Use the complete status vocabulary in this document whenever future
  connections, imports, AI tools, or visualizations appear. **Coming soon** is
  only for committed big/public-launch work; unscheduled work is **Later**.
- Keep `/updates`, `/ai`, and `/ai.txt` strictly current. A future control is
  visibly non-working and labeled **Coming soon**; a button, form, or link that
  accepts action must already work.
- Version `/updates` entries as 1.1.1, date each entry, label it **Local**, **In
  review**, **Backend live**, or **Public & live**, and make the AI that ships a
  change write the entry as part of shipping.
- Carry the family row and Support Desk link in the shell when their
  destinations are verified. The row is wayfinding only and never exposes
  cross-site records, counts, or activity.
- Use synthetic, clearly labeled illustrations. Never use private family data,
  real credentials, or unresolved living-person material as marketing proof.
- Prefer a human editorial character—archival paper, margin notes, maps,
  captions, family annotations, and a visible evidence thread—over a generic
  chatbot, SaaS dashboard, or glowing autonomous-AI aesthetic.

The current public source is only a partial foundation. It has `/updates`,
roadmap/status copy, privacy copy, `/llms.txt`, `/ai`, and `/ai.txt`, but no
front-page FAQ, complete family `/ai` invitation, family row, or Support Desk
link. The new setup surfaces keep provider/named-client proof Partial rather
than treating `/llms.txt` or source implementation as a live connection. The current `/about` local-only
storage/export statement also conflicts with the Convex-backed architecture,
and source alone cannot prove that “working now” claims are deployed. Those
public-copy corrections belong to a separate implementation and live-proof
route; this docs-only task records the gap without silently changing the site.

### Website launch sequence

| Stage | Family History meaning | Evidence rule |
|---|---|---|
| **1 · Soft launch** | The real site is online on its public domain, listed by Assist With Life, and still changing before active marketing | Public shell, privacy boundary, and active controls work; committed unfinished Tier A claims say **Coming soon**; truth surfaces remain strictly current |
| **2 · Big launch / public launch** | The website is ready to market because every family Tier A requirement and the sentence-by-sentence honesty pass are verified | No Tier A **Coming soon** labels remain; deployment and representative public/authenticated paths have fresh proof |

The repository does not establish the current external launch stage, so it is
**Unknown** here. Do not infer soft launch from a public-looking route, private
beta copy, a merge, or a deployment configuration.

> **Future native guardrail — Later:** Only after substantial recurring website
> use reveals a distinct native job should Family History evaluate an app-store
> package and its then-current privacy, deletion, reviewer-access, accessibility,
> sharing, and SDK declarations. This later gate does not drive today's
> information architecture, design system, or website priorities.

### Future signed-in shell

- Offer People and relationships as the friendly first step without forcing
  every user through one container. In an empty workspace, let authorized
  imports or returned chosen-AI research extend that first graph after review.
- Center the current research subject and its connected evidence, context,
  questions, and stories.
- Make **known**, **proposed**, **disputed**, **needs review**, **waiting**, and
  **ready to continue** visually distinct.
- Let people move naturally between person, relationship, place, event, source,
  claim, question, and story views.
- Keep the selected scope, acting person or AI, independently allowed
  operations or external-action handoff categories, approval, expiry, and
  revocation controls understandable.
- Put source, date, confidence, author, review state, and uncertainty beside
  the details they qualify.
- Make the story-to-evidence path bidirectional: inspect the evidence behind a
  line, or see which stories use a claim.
- Treat questions and Queue work as durable research objects, not transient
  notifications.
- Show the directive, one of the four family Queue states, handoff line,
  optional context/evidence, responsible person or AI, next step or exact
  blocker question, result, and history so a person can understand progress
  without opening the originating AI conversation.
- When a Queue item includes an external-action intent, show the selected data,
  named chosen AI, approved category, time, expiry/revocation condition, and
  result or failure without implying that Family History performed the action.
- Show historical context as setting, never as silent proof of personal
  experience.
- Keep sharing and publication explicit, previewable, reviewable, reversible
  where supported, and separate from ordinary saving.
- Give Trusted collaboration an invite, identity, scope, operation, history,
  role (Viewer / Contributor / Editor / Owner), and revoke surface. Give
  Unlisted links a reviewed content boundary, clear
  “anyone with the link” audience, no indexing, no automatic expiry, and an
  immediate revoke surface.
- Keep public publication as a separate promotion step; never let an invite or
  link silently become a public story.
- Let collaborators share evidence while retaining separate, attributed
  hypotheses and conclusions; never force one official interpretation.
- Let a story stand on its own while offering optional passage-level paths to
  people, memories, documents, events, places/buildings, images, and historical
  context.
- Offer the curated prompt/loop library as an optional menu with visible
  version, review date, purpose, maintainer/provenance, and assumptions/limits.
- Provide `/me` for a person's own useful counts, storage, Queue activity, AI
  footprint, and links to data controls. Provide owner-only `/admin` for
  aggregate users, usage, health, and public-content operations without
  reading private family content to produce stats.
- Use bounded, indexed, paginated data access; make tables the default for
  dense comparison; let meaningful columns sort on click; show organized
  filters; remember browser-local preferences; and keep account-saved views as
  explicit records. On phones, show fewer decision columns and drill down
  instead of shrinking or horizontally scrolling the whole product by default.
- Keep Family History’s archival compass and evidence-thread character while
  delivering first-class light and dark themes, 44px targets, visible focus,
  non-color status labels, reduced motion, and no page-level overflow at 320px.
- Use bottom navigation with at most five primary destinations on phones. The
  current mobile drawer is a **Coming soon** family-shell alignment gap, not an
  intentional Family History exception.
- Keep human workflows complete when no AI is connected.
- Keep connection and capability status truthful inside the shell as well as
  on the homepage.

## Maintenance and claim verification

This document is stable product philosophy. Its capability ledger is dated and
can drift.

Before changing a public page, onboarding flow, signed-in shell, product
description, AI guide, provider guide, or integration claim:

1. classify every material capability as **Current / verified**, **Partial /
   verified foundation**, **Coming soon**, **In design**, **Later**,
   **Intentional product-specific difference**, or **Unknown**;
2. verify public **Current / verified** claims against the exact deployed environment and
   relevant user path—not only source code, a merged commit, a provider
   setting, a Linear issue, or an older observation;
3. default missing, stale, contradictory, partial, or unscheduled evidence to
   **In design**, **Later**, **Unknown**, or omission; never use **Coming soon**
   without a committed big/public-launch path;
4. verify trust-sensitive language against current identity, owner isolation,
   actor scope, operation authority, provenance, AI/privacy gates, rights,
   public DTOs, revocation, and provider behavior;
5. verify any import claim against the exact provider, consent flow, capture
   method, validation, merge gate, dedupe, provenance, and living/private-data
   boundary; distinguish a user- or chosen-AI-authorized outside retrieval from
   a verified direct Family History integration;
6. verify any chosen-AI connection against the real authentication path,
   incoming credential resolution, exact tools, actor, permitted-data and
   operation scopes, approval, expiry/revocation, activity, and a synthetic
   retrieve → work → save → inspect result;
7. verify any AI-client or queue claim against the real work-creation and
   pickup path, identity and scope enforcement, priority and evidence
   preservation, claim or lease behavior where used, checkpoints, blockers,
   stale-work recovery, result return, activity, exact next-step continuity,
   and—where an external-action handoff is claimed—the named AI, selected data,
   approved action category, expiry/revocation, result, denial, failure, and
   return path;
8. verify any publishing claim against draft/review state, source and context
   visibility, living/private checks, human confirmation, public filtering,
   unpublish behavior, exact public route, and the selected-object boundary;
9. verify any Trusted-collaboration claim against the invite and acceptance
   lifecycle, named identity, Viewer/Contributor/Editor/Owner role, exact record
   scope, per-operation authority, living/private boundaries, separate
   interpretation history, attribution, audit history, and revocation;
   separately verify any Unlisted-link claim against its reviewed content
   boundary, anyone-with-the-link disclosure, read-only behavior, no-expiry
   rule, non-indexing, recipient-safe filtering, and revocation;
10. confirm that collaboration, bounded links, and public publication remain
   independently controlled and that none silently broadens another;
11. verify any prompt/loop-library claim against the actual entries, optional
    and editable behavior, version, created/reviewed dates, author/maintainer,
    purpose, assumptions/limits, and chosen-AI access path; never infer an
    autonomous engine from a prompt export;
12. verify any living/deceased claim from explicit owner assertion or evidence,
    never age alone, and test the reviewed boundary separately for Private,
    AI, Trusted, Unlisted, export, and Public use;
13. verify any hypothesis or claim workflow preserves sources, confidence,
    rationale, actor/AI, timestamp, separate collaborator interpretations, and
    later correction history without silent canonical promotion;
14. verify the family contract version and rerun the adoption/contradiction
    matrix, including the repo-owned tracker entry point;
15. update the evidence date, repository revision, and evidence references when
    a status changes; and
16. update the Markdown and HTML companion together and refresh the
    HTML source digest.

Changes to the one-sentence identity, Assist family model, research-to-story
purpose, user-owned scoped-authority principle, provenance boundary,
living/private-material boundary, or trust/non-goal boundary require explicit
product-owner approval. Evidence-led capability status updates may change
without redefining the philosophy.

Assist With Sites — Core Philosophy v1.6.3 is the authoritative shared chassis
and trust/operations contract for this package. It is not the product template.
Sibling documents may offer structural examples, but they are not evidence of
Family History capability, identity, experience, or design and cannot override
this product's verified domain truth unless that truth conflicts with a shared
route, trust, privacy, activity, navigation, support, or release requirement.

The Markdown file is canonical. Its HTML companion is a designed reader, not a
second source of product truth. Any substantive Markdown change must regenerate
the HTML companion and refresh its `source-sha256` metadata. Commit,
publication, deployment, provider, and live-proof state are reported
separately.

## Evidence handoff

The repository-foundation boundary in this revision was reconciled against:

- Assist With Sites — Core Philosophy v1.6.3 (2026-08-08), authoritative
  internal family source held outside this repository and intentionally not
  linked from public product surfaces
- `docs/tracker/GUIDE.md`, `docs/tracker/cards/`, and
  `docs/tracker/work-orders/`
- `AGENTS.md`
- `docs/README.md`
- `docs/product/vision.md`
- `docs/product/ai-family-history-lab.md`
- `docs/product/product-map.md`
- `docs/product/ancestor-data-vault-philosophy-and-architecture.md`
- `docs/product/agent-platform-design.md`
- `docs/product/queue-foundation-design-handoff.md`
- `docs/api/route-inventory.md`
- `docs/api/capability-manifest.json`
- `docs/api/story-agent-openapi-skeleton.yaml`
- `docs/importing/familysearch-capture-storage-map.md`
- `docs/importing/familysearch-source-capture-runbook.md`
- `docs/importing/loose-context-ingestion-model.md`
- `docs/context/place-era-research-packs.md`
- `docs/operations/agent-handoff-runbook.md`
- `docs/operations/product-health-gates.md`
- `docs/security/privacy-ai-safety-review.md`
- `docs/security/convex-trust-boundary-inventory.md`
- `docs/security/vault-owner-isolation.md`
- `app/page.tsx`
- `app/about/page.tsx`
- `app/privacy/page.tsx`
- `app/updates/page.tsx`
- `app/llms.txt/route.ts`
- `app/app/people/page.tsx`
- `app/app/operations/page.tsx`
- `app/app/settings/page.tsx`
- `app/app/api/page.tsx`
- `app/app/api/admin/page.tsx`
- `components/marketing/Hero.tsx`
- `components/marketing/FeatureShowcase.tsx`
- `components/layout/Footer.tsx`
- `components/layout/AppSidebar.tsx`
- `components/layout/appNavigation.ts`
- `convex/schema.ts`
- `convex/apiKeys.ts`
- `convex/queue.ts`
- `convex/access.ts`
- `lib/auth/scopes.ts`
- `lib/stories/capabilities.ts`
- `lib/stories/publishSafety.ts`
- `lib/context/taxonomy.ts`
- `components/vault/StoryWriterStudio.tsx`
- `app/api/process/route.ts`
- `app/api/people/[id]/context-pack/route.ts`
- `app/api/people/[id]/stories/route.ts`
- `app/api/stories/[id]/status/route.ts`
- `app/api/keys/route.ts`
- `app/app/timeline/page.tsx`

Earlier revisions consulted Linear coordination material. Scott retired Linear
as a current dependency on 2026-08-08. Historical issue ids remain dated
provenance only and never prove source, deployment, production behavior,
priority, approval, or completion. Current work and handoff live in the
repository tracker.

Exact handoff rule:

- use this document for enduring identity, language, authority, and trust;
- use the dated ledger only as a map to current source evidence;
- re-run repository and user-path proof before presenting a capability as live;
- preserve the distinction between source-complete, deployed, publicly proven,
  and authenticated/operationally proven; and
- when newer evidence conflicts, update the ledger rather than quietly
  rewriting the philosophy.

## Documentation package verification

The companion reader must pass all of these checks before handoff:

- Markdown internal links resolve to headings in this file.
- Markdown and HTML share the same substantive section order and capability
  statuses.
- HTML `source-sha256` matches the canonical Markdown file.
- The reader has a working keyboard skip link and visible focus styles.
- Tables and long code/path text do not cause page-level horizontal overflow.
- The reader is checked at 320, 390, 768, 1280, and 1440 CSS pixels.
- Light and dark themes remain readable.
- Browser console and page errors are empty.
- No private family/user data, credentials, provider state, or live production
  content is required for the proof.

The exact completed proof belongs in the local commit handoff and may be
reproduced from the canonical Markdown, HTML metadata, and browser checks. This
section defines the acceptance contract; it does not claim a check passed
before it was run.

## Changelog

- **1.6.0 · 2026-08-12** — recorded the AWF-WO-006 source and isolated official
  v2 client MCP foundation: twelve product-native research-to-story tools,
  a stateless protected resource, server-derived vault identity, bounded reads,
  replay-safe canonical writes, one-call complete-result preservation,
  optimistic corrections, Queue continuation, and `/ai` plus `/ai.txt` setup
  truth. Kept protected release, deployed provider behavior, named-client
  registration/consent, production authentication, reconnect, and revocation
  as separate unproved layers rather than inferring them from local proof.
- **1.5.0 · 2026-08-11** — synthesized Scott's approved Family History product
  direction: People and relationships are the friendly first step into a
  connected private archive; imports and user-authorized chosen-AI research are
  accelerators with original-source provenance, not claims of live provider
  integration; sources/context are many-to-many; uncertain hypotheses are
  stored with confidence, rationale, provenance, and correction history;
  collaborators may share evidence while retaining separate interpretations;
  living people are visible inside specifically authorized workspace scope but
  reviewed deliberately for broader AI/share/export/public use and never
  inferred deceased from age alone; selected objects use Private / Unlisted /
  Trusted / Public visibility; Trusted roles are Viewer / Contributor / Editor
  / Owner; story references are a rich optional reader layer rather than a
  product-policed writing format; and a curated prompt/loop library is optional,
  editable, combinable, ignorable, and freshness/provenance labeled. It also
  clarifies that Family History controls its own tool/data/operation boundary,
  not the person's external conversations with their chosen AI. All new
  directions remain evidence-bounded and unclaimed where not implemented.
- **1.4.1 · 2026-08-09** — recorded PR #31, full Actions run
  `31328562901`, main merge `e65b03a`, successful Vercel preview and
  production statuses, retained live-alias proof, and signed-out Queue
  protection. Kept the exact Convex build-plan log, authenticated persistence,
  external chosen-AI connection, and final designed Queue experience explicitly
  unverified in AWF-0030 and AWF-0029.
- **1.4.0 · 2026-08-09** — recorded the distinct product Queue backend
  foundation: directive-only creation, exactly four product states,
  owner-verified Family History context adapters, bounded and idempotent
  commands, actor leases, optimistic concurrency, retry/failure/cancel/expiry
  conditions, attributed activity, hard deletion, cursor pagination, and a
  narrow seven-tool internal chosen-AI boundary. Kept the final designed Queue UI,
  deployed/authenticated proof, incoming credential resolution, and live MCP
  connection explicitly unverified.
- **1.3.3 · 2026-08-09** — clarified the family authority boundary throughout:
  people may discuss or direct their chosen AI however they want outside the
  product; Family History controls only access to its tools, data, product
  operations, and specifically approved recorded handoffs. Replaced the
  categorical outside-action prohibition with granular, revocable authority
  by actor/AI, scope, permitted data, operation or action category, approval,
  expiry/revocation, and attributable result. The platform still never acts
  independently in the outside world; when authority already exists, the Queue
  may hand selected context and an external-action intent to the chosen AI and
  record success, denial, failure, or return. No capability status was promoted
  and no provider compatibility was claimed.
- **1.3.2 · 2026-08-08** — reattested against published Assist With Sites Core
  Philosophy v1.6.3 at commit
  `db658ab091bcfbb71f62db55d5b8b6d51b64e52f` and its source digest; aligned
  navigation to clarified §16 tracker, publishing, and launch sections and §17
  setup, retrofit, and handoff paths; reaffirmed Cards / Work Orders / Guide as
  durable current-work truth and Linear as optional context only. No tracker
  mechanics, provider policy, application behavior, or product identity changed.
- **1.3.1 · 2026-08-08** — recorded PR #28's full software lane, ruleset
  `20590341`, same-SHA lightweight Actions proof, Vercel ignored-build
  cancellation, and retained live deployment; closed AWF-WO-001 execution while
  preserving AWF-0004 as a separate future independent audit.
- **1.3.0 · 2026-08-08** — aligned to Assist With Sites Core Philosophy
  v1.6.2; installed the Family History Cards / Work Orders / Guide source and
  generated readers; retired mandatory Linear operation; recorded the exact
  state-versus-software publication boundary; and kept GitHub, Vercel, live
  alias, and independent-audit proof explicitly pending until observed.
- **1.2.0 · 2026-08-07** — adopted the one-family-Core / one-product-Project
  Philosophy hierarchy from Assist With Sites — Core Philosophy v1.5.0;
  renamed the canonical package and repository discovery links; added the exact
  alignment record, explicit audience/jobs section, and distinctive design and
  interaction character; and retained the evidence-backed gaps, Family History
  domain model, research-to-story workflow, and restrained **Later** native
  guardrail.
- **1.1.0 · 2026-08-07** — derived the product philosophy explicitly from
  Assist With Sites — Core Philosophy v1.4.4; added the evidence-backed
  adoption/contradiction matrix and complete truth-status vocabulary; aligned
  the Queue states, directive authority, access names, public truth surfaces,
  website launch sequence, concise later native guardrail, dense-data behavior,
  `/me`, `/admin`, Support
  Desk, family row, identity/deletion boundaries, and distinct design contract;
  and recorded the missing repo-owned Cards / Work Orders / Guide tracker as a
  required follow-up without claiming implementation.
- **1.0.0 · 2026-07-30** — established the canonical research-to-story product
  philosophy, evidence ledger, safety boundaries, and synchronized editorial
  reader.
