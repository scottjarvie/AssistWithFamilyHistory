# Assist With Family History Project Philosophy

> **Philosophy status:** Canonical product identity and claim boundary
>
> **Product document version:** 1.2.0
>
> **Capability evidence last verified:** 2026-08-07
>
> **Repository evidence revision:** `2ec5b70`
>
> **Scope:** Product truth, language, trust, and design direction—not an
> implementation plan, production claim, or permission to change application
> behavior

This document defines what Assist With Family History is, how it fits the
Assist family, and which claims its public and signed-in experiences may make.
It supersedes “genealogy database,” “private family vault,” “automatic
researcher,” and “AI story generator” descriptions when they shrink or
overstate the product. Architecture notes, Linear issues, release evidence, and
operational runbooks remain authoritative for delivery status; they do not
redefine the product.

## Family Core alignment record

> **Document:** Assist With Family History — Project Philosophy
>
> **Canonical:**
> `docs/planning/assist-with-family-history-project-philosophy.md`
>
> **Family Core:** Assist With Sites — Core Philosophy v1.5.0 (2026-08-07)
>
> **Aligned:** 2026-08-07 — repository and public claims reviewed at `2ec5b70`
>
> **Adopted:** The shared chassis: the three-way person / Assist workspace /
> your AI promise; dependable family routes and truth surfaces; the Queue
> contract; scoped, revocable authority; provenance and activity; shared access
> vocabulary; identity, privacy, export, and deletion rules; family navigation;
> the Support Desk convention; website launch truth; and the repo-owned Cards /
> Work Orders / Guide operating contract. Adoption accepts these requirements;
> it does not prove they are implemented or prescribe the primary experience.
>
> **Deferred/gaps:** The unverified big/public-launch requirements recorded below,
> including the family Queue, MCP and AI setup paths, complete activity history,
> export and deletion, `/me`, `/admin`, Support Desk, family navigation, and the
> product tracker. These remain explicit alignment gaps rather than hidden
> assumptions.
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
> document; checked-out revision `2ec5b70`; public/deployed state remains
> separately unverified where marked **Unknown**.

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
| **Coming soon** | Committed soft-launch work required for the big/public launch; it may appear publicly only beside a plainly unfinished, non-working control or claim |
| **In design** | Required or deliberately designed, but not yet proven as a complete current path; do not imply availability |
| **Later** | Unscheduled, exploratory, or gated behind real usage; not a commitment and not eligible for a public **Coming soon** label |
| **Intentional product-specific difference** | A justified Family History domain or brand choice that preserves the shared family behavior |
| **Unknown** | Repository evidence cannot establish the live, provider, catalog, or authenticated operational state |

### Adoption and contradiction matrix

| Contract area | Status | Evidence-backed Family History decision |
|---|---|---|
| Person / Assist workspace / your AI split | **Current / verified philosophy; Coming soon public-shell alignment** | The enduring split below already makes the person authoritative, Family History durable, and “your AI” user-chosen. The current home source does not yet use the required “Assist your AI, so it can assist you with family history” turn of phrase or link to `/ai` |
| Domain promise, users, objects, and primary experience | **Intentional product-specific difference** | Keep the research-to-story promise and the connected vocabulary of people, families, relationships, places, buildings, events, sources, claims, questions, context, collections, projects, and stories. Family History decides how researchers, relatives, storytellers, and their chosen AI move through that evidence. The family chassis fixes dependable assistance and trust boundaries, not this domain model or experience |
| Product Queue | **Coming soon** | `/app/operations`, `researchTasks`, research checks, and handoff export are real research-operations foundations, but they are not the family product Queue at `/queue` and do not implement its four states or directive-first creation path |
| Queue authority | **In design** | Adopt the family rule: the directive authorizes only reversible, in-scope record changes plainly requested. New objectives, destructive work, identity merges, disputed promotion, publication, purchases, access changes, and outside-world actions return to **Needs you** |
| Queue context objects | **Intentional product-specific difference; In design** | “Add context” offers three Family History groups: a research subject, evidence, or a work thread. Their concrete objects are defined in the Queue section below; attaching context stays optional |
| Internal project tracker | **In design — required alignment gap** | No repo-owned tracker with exactly Cards, Work Orders, and Guide was found. `AGENTS.md` and `docs/agent-workflow.md` point to Linear, which does not satisfy the v1.5.0 repo-owned handoff contract. Bootstrap it in a separate follow-up; do not confuse it with the product Queue |
| MCP and AI setup paths | **Coming soon** | No `/mcp`, `/ai`, `/ai.txt`, or `/settings/ai` route exists. `/llms.txt`, internal app APIs, the API Center, key-management primitives, and a static capability manifest do not substitute for a verified scoped MCP connection and generated current briefing |
| Activity and provenance | **Current / verified partial foundation; Coming soon complete contract** | Import runs, research logs, story review events, source links, model/prompt fields, and the `agentActivity` schema provide partial evidence. The repo does not prove a plain-language, record-visible entry for every meaningful AI create, change, or delete |
| Access and sharing | **Current / verified Private and guarded Public foundations; In design Unlisted and Trusted** | Owner-scoped vault reads/writes and filtered public-story publication exist in source. Family History intentionally needs rare Public stories plus later Trusted collaboration and read-only Unlisted views; no complete invite or unlisted-link lifecycle is verified |
| Identity boundary | **Current / verified source foundation; Unknown deployed state** | Source supports per-site Clerk identity and owner isolation when configured, plus local/guest modes for controlled environments. No shared Assist identity or cross-site session is claimed, and exact deployed Clerk/trust-boundary configuration is not proven here |
| Export and deletion | **Coming soon** | Person context-pack export and key revocation are narrower current tools. No complete owner export, `/settings/data`, `/delete-account`, coordinated record/account deletion, attachment purge, or content-bearing-history purge is verified |
| Public truth surfaces and honesty | **Current / verified partial source; Coming soon alignment** | `/updates`, public marketing, roadmap, privacy, and `/llms.txt` exist in source. The home page lacks the required FAQ and `/ai` invitation; `/updates` lacks the exact **Local / In review / Backend live / Public & live** labels and AI-written 1.1.1 release habit; and stale or unverified public statements need a separate sentence-by-sentence honesty pass before a big/public launch |
| `/me` and `/admin` | **Coming soon** | No family `/me` or owner `/admin` route exists. `/app/audit` is a private genealogy-readiness view and `/app/api/admin` is an API-key operator surface; neither is the family usage/stats contract |
| Support Desk | **In design / deferred dependency** | `/contact` exists, but no registered Assist With Life Support Desk source key or header/footer desk link is present. Link it only when the shared desk is live; do not market it beforehand |
| Brand, design, and themes | **Intentional product-specific difference; Coming soon accessibility floor** | Preserve Discover Their Stories’ compass, parchment, teal/rust, archival annotations, evidence-thread motif, typography, and editorial voice as the product's own design system. The designed philosophy reader already supports light/dark; the product UI does not yet prove first-class light/dark coverage. The family swatches `#8FD7B4` and `#245A43` identify Family History in shared portfolio wayfinding; they do not replace or dictate the product palette |
| Dense information | **Intentional product-specific difference; Current / verified partial foundation; Coming soon dependable behavior** | Family History may be denser than a sibling because evidence comparison requires it. People reads are capped and the operations view has a contained table, filters, sorting controls, and bounded rendering. Cursor pagination, table-first people view, click-to-sort columns, remembered preferences, account-saved views, and complete phone drill-down are not verified. The family contract supplies performance and phone-usability guardrails, not a uniform layout |
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

## The durable Assist family and trust model

The research-to-story workspace becomes durable help through a clear division
of roles. An Assist product is not the AI. The person chooses the AI that helps
them.

- **Your AI does the reasoning and work under your direction.** It can inspect
  permitted material, identify patterns and contradictions, research
  elsewhere, ask questions, propose connections, and help shape narratives
  through capabilities you separately authorize.
- **Family History provides durable family-history memory, organization, and
  tools.** It gives the work persistent structured context, retrieval,
  provenance, relationships, history, questions, queues, and visual
  understanding after the original conversation is gone.
- **You keep visibility and authority.** You can see what is known, inferred,
  disputed, changed, or waiting; correct the understanding; and decide who or
  what may retrieve, add, update, delete, promote, share, or publish in each
  family tree, person, source, story, collection, or research project.

The benefit is different for each side. Your AI receives continuity and
well-labeled evidence instead of reconstructing a family from scattered chats.
You receive clarity: what is known, what is inferred, what is disputed, what
changed, what needs attention, and which stories the material can support.

The practical work may begin with a person, a family line, a document, a
photograph, a place, a building, a remembered story, a historical question, or
an unresolved contradiction. The person may authorize their AI, in the AI's
own environment, to browse, research, or communicate elsewhere. Only selected
information deliberately submitted through Family History's scoped interface
becomes Family History data.

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

## The research-to-story loop

Family History should preserve the whole arc from first clue to responsible
story, not only the final family-tree value.

1. **Begin with an authorized question or source.** A person or authorized AI
   names the scope, reason for the work, source, known constraints, and next
   useful question.
2. **Retrieve the connected context.** Your AI receives the permitted people,
   relationships, places, dates, sources, claims, notes, historical context,
   open questions, and prior work needed for this step.
3. **Gather without flattening.** Records, documents, media, memories, family
   lore, observations, and outside research enter with their original form,
   provenance, privacy, rights, and review state intact.
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
  story into an explicitly shared or public state.

These permissions are not interchangeable. Read is not write. Create is not
update or delete. Proposal authority is not authority to accept a claim, merge
an identity, or publish a story. Access to one person or research project does
not carry into another.

The permitted actor, scope, and operations must be visible, editable,
revocable, and auditable. Retrieval and every data-changing action should
retain the acting person or AI, operation, scope, time, relevant policy, and
result in provenance or audit history. Your AI cannot grant itself broader
authority, inherit another actor's permission, or expand access because it
found a related person.

Permission and operating preference answer different questions:

- **Permission asks:** may this person or AI perform this operation at all?
- **Operating preference asks:** when an already-permitted operation occurs,
  may it save directly, require review, or pause at a
  risk-proportionate checkpoint?

Automation and review preferences never grant permission. “Review everything”
does not create read access. “Save routine research automatically” does not
create update authority. A queue item identifies work to do; it does not widen
the actor's scope.

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

Canonical person, relationship, place, or event records are the current
working conclusions—not a place to erase every conflicting claim.

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

## Storytelling principles

Storytelling is a primary capability, not a decorative export. It is also not
permission to fabricate.

1. **Begin with what the evidence can support.** The narrative should use
   source-backed facts, reviewed claims, and relevant context.
2. **Make uncertainty readable.** Use careful language when identity,
   chronology, motive, or experience is uncertain or contested.
3. **Separate life detail from setting.** Explain which details come from the
   person's evidence and which describe the wider place or era.
4. **Link the story back to its foundation.** A reader or reviewer should be
   able to inspect the sources, claims, and context behind important details.
5. **Preserve human meaning.** Evidence discipline should support clarity,
   dignity, emotion, and connection—not reduce a life to a citation list.
6. **Do not invent interiority.** AI may suggest narrative structure, but it
   must not present imagined thoughts, motives, dialogue, or experiences as
   fact.
7. **Keep revision honest.** A corrected claim should be able to update the
   story while preserving its prior version and research trail.
8. **Respect audience and rights.** Private material, living people, restricted
   media, and culturally sensitive stories need the applicable review before
   sharing.

AI-generated narratives should identify their generated or edited status. The
goal is a compelling, source-aware story that teaches the reader what is known
and lets uncertainty breathe—not a confident fiction wearing citations.

## Living people and private family material

Privacy is a quiet boundary, not the public identity of Family History.
Historical research often uses public records, public archives, and people who
are long deceased. The public promise should lead with evidence, connection,
understanding, and story.

Still, living people and private family material require deliberate control.
Private notes, correspondence, recent addresses, contributor details,
restricted media, sensitive relationships, oral histories, and unreviewed
family claims should remain user-controlled.

Private, AI-eligible, and public are separate states:

- something may be visible to its owner but not permitted for AI use;
- something may be permitted for a chosen AI but not for Trusted collaborators
  or Unlisted links;
- something may be available to a named collaborator but excluded from every
  bounded link and public story;
- something may be included in a private bounded view but not publicly
  publishable; and
- public historical context does not make every linked family detail public.

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
Family History data held about them in a useful form, see every active share,
delete a record, and request deletion of the site-specific account. Record
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
**Trusted**, and **Public**. Private is the default. A product does not need to
offer every higher level, but it must not invent a competing name or meaning.

The repository currently proves owner-scoped Private foundations and a
guarded, separately promoted Public story path in source. Family History also
needs two distinct future sharing modes—Trusted collaboration and Unlisted
bounded views. Neither is verified as a complete current repository
capability; both are **In design**. Public storytelling is an intentional,
rare domain extension, not permission to make the underlying vault public.

### Trusted collaboration inside a project

A Trusted collaborator is an identifiable person invited into a family-history
project. Their access is account-bound or identity-bound and limited to the named
family tree, research project, person, story, collection, or narrower record.
The owner grants each allowed operation independently: retrieve, comment or
review, add, update, delete, promote, or publish where relevant.

Collaboration is not blanket vault access. The invite, acceptance, actor,
scope, allowed operations, changes, and revocation should remain visible and
auditable. Removing a collaborator ends future access without erasing the
attributed research or review history they already contributed.

### An Unlisted link to a bounded view

An Unlisted link is a long, unguessable, read-only address that gives its holder
access only to a deliberately selected story, tree branch, collection, or other
bounded view. It is not secret, never expires on its own, and works until the
owner revokes it. It is not an invitation into the project, does not identify
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

### Public storytelling remains separate

Publishing a story publicly is a separate, explicit promotion decision. An
invite does not publish; creating or opening an Unlisted link does not make its
contents public or searchable; and a public story does not expose the
underlying project, tree branch, collection, private sources, or research
notes.

Living people and private family documents are excluded from Trusted access,
Unlisted views, and publication by default unless the owner deliberately grants
the relevant person, scope, operation, and audience access after review.
Inherited relationships, public historical context, or an already-public story
must never silently broaden that boundary. One owner-visible screen must
eventually list every active Unlisted or Trusted grant and make each one
revocable.

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
| Product owners | [Family alignment](#family-core-alignment-record), [One-sentence identity](#one-sentence-identity), [Who this serves](#who-this-serves-and-what-they-need), [Practical picture](#practical-picture-think-of-it-as), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-website), [Product scope](#product-scope-and-non-goals), [Durable family model](#the-durable-assist-family-and-trust-model), and [Shared authority](#user-owned-data-and-shared-authority) | What Family History helps with, who it serves, how it adopts the family contract, why a durable workspace matters, who owns the work, and what the product must not become |
| Implementers | [Builder reference](#builder-reference-operating-model-and-capability-truth), [AI and Queue model](#how-your-ai-and-the-family-history-queue-work), [Information model](#durable-information-model), [Provenance](#provenance-uncertainty-and-changing-understanding), and [Maintenance](#maintenance-and-claim-verification) | What must persist, how work begins or resumes, which distinctions must survive, and what needs proof |
| AI and integration builders | [Builder reference](#builder-reference-operating-model-and-capability-truth), [AI and Queue model](#how-your-ai-and-the-family-history-queue-work), [Shared authority](#user-owned-data-and-shared-authority), [Questions and queues](#questions-queues-and-unfinished-work), and [Detailed trust boundaries](#detailed-trust-boundaries-for-builders) | Where the chosen AI works, which Family History operations may be used, what a durable handoff contains, and where the site's responsibility stops |
| Writers and designers | [One-sentence identity](#one-sentence-identity), [Practical picture](#practical-picture-think-of-it-as), [Why not a quick feature?](#why-not-just-ask-your-ai-to-build-a-quick-feature), [Why not a conventional site?](#why-this-instead-of-a-conventional-website), [Product scope](#product-scope-and-non-goals), [Storytelling principles](#storytelling-principles), [Capability truth](#capability-truth), [Language rules](#language-rules), and [Homepage implications](#public-homepage-and-future-shell-implications) | How to explain the product simply, differentiate it responsibly, state what may be claimed now, describe evidence and uncertainty, and preserve the intended feel |

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
   promoting, sharing, or publishing;
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

Work can begin in either direction.

### Begin in your preferred AI environment

A person and their AI may begin with a conversation, document, research
question, or outside investigation in the AI environment they already use.
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
History graph. Exact chips and arguments remain **In design** until the product
Queue is implemented and tested.

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

The directive itself authorizes the person's chosen AI to make reversible,
in-scope Family History record changes plainly necessary to complete the
request, but only inside an already granted actor, record, and operation scope.
It does not authorize a new objective, destructive work, identity merge,
promotion of a disputed claim, publication, purchase, access or identity
change, outside communication, or action in the world. If the requested result
would cross one of those boundaries—or the intended scope is genuinely
unclear—the card moves to **Needs you** with the smallest question that unlocks
it.

Permission and Queue authority remain separate layers. A directive cannot
grant an AI access to a person or source it was not allowed to read; a general
write grant cannot invent a directive; and a review preference cannot widen
either one.

### A Queue is continuity, not a todo list

A useful queue item preserves:

- the directive verbatim, the exact scope, and requested outcome;
- its one family Queue state;
- the handoff line: who it was left for, when, and whether it was picked up;
- priority and why the work matters now;
- any optional evidence, context, questions, assumptions, and prior attempts;
- the responsible person or AI and the operations actually authorized;
- the exact next step while Working or blocker question while Needs you; and
- result links, provenance, decisions, and history.

That continuity changes the work. One AI session can stop and a later session
or compatible client can understand what has already happened, what remains
uncertain, and the smallest useful action to take next. The person can see
progress and results without treating the queue as permission or trusting an
opaque “working” state.

> **Capability truth:** The current repository has research tasks, research
> checks and logs, an operations console, compact handoff export, and selected
> quality and audit foundations. That console is **not** the family Queue, and
> no `/queue` route or complete arbitrary-client pickup-and-return path is
> verified. The product Queue is **Coming soon** for the big/public launch.

### The product Queue is not the project tracker

The Queue carries a person's family-history directive inside the product. The
internal tracker coordinates building the product. The tracker has exactly
three top-level concepts: **Cards** record one outcome and current truth;
**Work Orders** bundle an owner-approved, bounded tranche; and the **Guide**
teaches a new person or AI how to continue. Work Order execution
(`Ready / Active / Complete / Superseded`) remains separate from independent
audit (`Not audited / Passed / Follow-up needed`), with real model/agent
provenance and evidence recorded for both.

No repo-owned Cards / Work Orders / Guide source or stable entry point is
verified in this repository. Linear coordination and the product's research
operations console are not substitutes. This is an **In design — required
alignment gap** for a separate bootstrap task; this documentation-only task
does not create a competing board or automatic dispatcher.

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
AI's existing scope. Work may pause for the person, their AI, a provider, an
archive, or better evidence. When only the person can unblock it, the Queue
state is **Needs you**; when nothing has picked it up, it is **Waiting for your
AI**. The next session should resume without reconstructing the whole
conversation.

## Capability truth

Every user-facing capability must have exactly one status. Status is based on
current proof, not design intent.

| Status | Meaning | Claim rule |
|---|---|---|
| **Current / verified** | Verified in the checked-out repository, with the exact evidence boundary stated | May be described as a repository foundation; it is not automatically a deployed or production claim |
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
| Relationships | First-class person-to-person relationship rows, roles, facts, provisional relatives, and guarded promotion/merge flow | **Current / verified partial foundation.** Broader social/institutional relationships and full competing-interpretation history remain **In design** |
| Context | Loose context items plus place/era research packs with sources, confidence, review, privacy, and AI-use gates | **Current / verified partial foundation.** Buildings and institutions are pack/context types; a complete first-class context graph remains **In design** |
| Questions and operations | Research tasks, research checks, research log, `/app/operations`, compact handoff export, and quality-gated check writes | **Current / verified partial foundation.** This is a research-operations console, not the family Queue. `/queue`, its four states, directive-first creation, and a complete multi-AI pickup/return path are **Coming soon** |
| AI context and Story Writer | Owner-scoped person context packs; manual prompt copy; optional OpenRouter generation; editable draft save with model/prompt metadata | **Current / verified repository foundation.** Generation is person-centered and first-party; arbitrary chosen-AI connectivity and every story subject remain unverified |
| Story Studio and publication | Draft/review/published states, reviewer assignment, evidence/context/privacy/living-person gates, explicit human confirmation, public story DTO filtering, and unpublish paths | **Current / verified repository foundation.** Public availability remains **Unknown** pending deployment/user-path proof; broader publishing, collaboration, books, and collections are **Later** |
| Collaboration and bounded sharing | Owner-scoped private vault operations plus guarded public-story publication; no complete invite or unlisted-link path | **Current / verified Private and guarded Public foundations.** Trusted project collaboration and read-only, non-expiring Unlisted links are **In design** and distinct from publication |
| Scoped authority | Scope vocabulary, API-key mint/list/suspend/revoke primitives, owner checks, story roles, guarded publish actions, and selected review/audit events | **Current / verified partial foundation.** Incoming API-key resolution to an external AI is explicitly unfinished; self-asserted story headers are not a public authorization model |
| API and AI connections | Internal app APIs, API-key management, scope presets, the `agentActivity` schema, a static planning capability manifest, a story OpenAPI skeleton, `/api/capabilities`, API Center source, and `/llms.txt` | **Current / verified internal/planning foundation only.** No verified incoming external-AI authentication, public agent API, `/mcp`, `/ai`, `/ai.txt`, or `/settings/ai` path |
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

- MCP connectivity or “works with any AI” setup;
- automatic record import or direct FamilySearch/provider API access;
- Ancestry, Findmypast, Find a Grave, newspaper, archive, or universal provider
  integration;
- general archival access, unattended crawling, or provider account access;
- universal search across every person, source, claim, note, and story;
- a complete per-person and per-AI read/create/update/delete/promote/publish
  authority matrix;
- complete chosen-AI run history, work claiming, leases, retries, or quotas;
- first-class generalized claims, institutions, buildings, communities,
  topics, collections, and story versioning;
- automatic story generation for every subject type;
- timelines, maps, pedigree explorers, relationship graphs, heatmaps, or
  migration visualizations as completed experiences;
- named project collaboration, collaborator invitations, or family review;
- scoped Unlisted links for a story, tree branch, collection, or
  bounded view;
- books, exhibits, audio/podcast production, or general publishing;
- owner-vault export and coordinated account deletion; or
- cross-product Assist data retrieval, navigation, or publication.

## Detailed trust boundaries for builders

Assist With Family History does not:

- store FamilySearch, Ancestry, archive, browser, or chosen-AI passwords,
  cookies, or sessions;
- independently contact relatives, researchers, archives, churches,
  repositories, or record providers;
- browse, crawl, or retrieve records in the background unless a separately
  shipped Family History integration explicitly says it does;
- decide what external sites, tools, accounts, communications, or actions a
  person may authorize their chosen AI to use;
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
authorized relationship with their AI. Your AI may browse, research, or
communicate elsewhere when you authorize it. Family History does not operate
or inherit that outside access. It receives only the material intentionally
submitted through its own scoped path.

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
and allowed operation; preserve provenance and audit; support revocation; and
keep retrieval separate from mutation.

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
- use **AI environment** for the external place where the person and their
  chosen AI converse and work; naming a client must not imply a shipped
  integration or preferred vendor;
- describe the product **Queue** as a directive-first handoff with exactly
  **Needs you**, **Working**, **Waiting for your AI**, and **Done**—not as a
  generic todo list, autonomous runner, internal project tracker, or unlimited
  authority grant; and
- label **Current / verified**, **Coming soon**, **In design**, **Later**,
  **Intentional product-specific difference**, or **Unknown** directly.

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
- Explain provenance in human language: “see where each detail came from.”
- Show user-owned scoped authority without depicting read access as blanket
  permission to change or publish.
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
roadmap/status copy, privacy copy, and `/llms.txt`, but no front-page FAQ,
family `/ai` invitation, `/ai`, `/ai.txt`, family row, or Support Desk link.
`/llms.txt` does not substitute for `/ai.txt`. The current `/about` local-only
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

- Center the current research subject and its connected evidence, context,
  questions, and stories.
- Make **known**, **proposed**, **disputed**, **needs review**, **waiting**, and
  **ready to continue** visually distinct.
- Let people move naturally between person, relationship, place, event, source,
  claim, question, and story views.
- Keep the selected scope, acting person or AI, independently allowed
  operations, and revocation controls understandable.
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
- Show historical context as setting, never as silent proof of personal
  experience.
- Keep sharing and publication explicit, previewable, reviewable, reversible
  where supported, and separate from ordinary saving.
- Give Trusted collaboration an invite, identity, scope, operation, history,
  and revoke surface. Give Unlisted links a reviewed content boundary, clear
  “anyone with the link” audience, no indexing, no automatic expiry, and an
  immediate revoke surface.
- Keep public publication as a separate promotion step; never let an invite or
  link silently become a public story.
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

1. classify every material capability as **Current / verified**, **Coming
   soon**, **In design**, **Later**, **Intentional product-specific
   difference**, or **Unknown**;
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
   boundary;
6. verify any chosen-AI connection against the real authentication path,
   incoming credential resolution, exact tools, scope enforcement, revocation,
   audit, and a synthetic retrieve → work → save → inspect result;
7. verify any AI-client or queue claim against the real work-creation and
   pickup path, identity and scope enforcement, priority and evidence
   preservation, claim or lease behavior where used, checkpoints, blockers,
   stale-work recovery, result return, audit, and exact next-step continuity;
8. verify any publishing claim against draft/review state, source and context
   visibility, living/private checks, human confirmation, public filtering,
   unpublish behavior, and exact public route;
9. verify any Trusted-collaboration claim against the invite and acceptance
   lifecycle, named identity, exact record scope, per-operation authority,
   living/private boundaries, attribution, audit history, and revocation;
   separately verify any Unlisted-link claim against its reviewed content
   boundary, anyone-with-the-link disclosure, read-only behavior, no-expiry
   rule, non-indexing, recipient-safe filtering, and revocation;
10. confirm that collaboration, bounded links, and public publication remain
   independently controlled and that none silently broadens another;
11. verify the family contract version and rerun the adoption/contradiction
    matrix, including the repo-owned tracker entry point;
12. update the evidence date, repository revision, and evidence references when
    a status changes; and
13. update the Markdown and HTML companion together and refresh the
    HTML source digest.

Changes to the one-sentence identity, Assist family model, research-to-story
purpose, user-owned scoped-authority principle, provenance boundary,
living/private-material boundary, or trust/non-goal boundary require explicit
product-owner approval. Evidence-led capability status updates may change
without redefining the philosophy.

Assist With Sites — Core Philosophy v1.5.0 is the authoritative shared chassis
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

- Assist With Sites — Core Philosophy v1.5.0 (2026-08-07), authoritative
  internal family source held outside this repository and intentionally not
  linked from public product surfaces
- `AGENTS.md`
- `docs/README.md`
- `docs/product/vision.md`
- `docs/product/ai-family-history-lab.md`
- `docs/product/product-map.md`
- `docs/product/ancestor-data-vault-philosophy-and-architecture.md`
- `docs/product/agent-platform-design.md`
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

Earlier revisions consulted Linear coordination material. This v1.1.0
alignment did not update Linear and does not use issue state as proof of source,
deployment, or production behavior. The family tracker gap is therefore
recorded here for a separate repo-owned Cards / Work Orders / Guide follow-up
rather than hidden in a new or modified issue.

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
