# Assist With Family History Core Philosophy

> **Philosophy status:** Canonical product identity and claim boundary
>
> **Capability evidence last verified:** 2026-07-29
>
> **Repository evidence revision:** `2afbfa3`
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

## One-sentence identity

**Assist with discovering and telling family stories—grounded in evidence and
connected across generations.**

That is the plain-language promise of Assist With Family History. Behind it is
a durable, user-controlled research-to-story workspace where your AI can work
with connected evidence and context, and where you can understand, correct,
and shape that work into meaningful, source-aware stories.

The higher purpose is connection: not only knowing that something happened,
but understanding the human life and larger world the evidence can responsibly
help reveal.

## Think of it as…

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

These are facets of the enduring product, not a claim that every corresponding
view, visualization, import, AI connection, or publishing path is currently
available. The dated [capability ledger](#dated-repository-capability-ledger)
states what the checked-out repository can honestly support.

## The Assist family model

The simple promise becomes durable help through a clear division of roles. An
Assist product is not the AI. The person chooses the AI that helps them.

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

## How to use this document

Read the front-door promise and Assist family model first. For focused work,
use this map:

| Reader | Start with | Questions answered |
|---|---|---|
| Product owners | [One-sentence identity](#one-sentence-identity), [Think of it as…](#think-of-it-as), [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-shared-authority), [Collaboration and sharing](#collaboration-and-bounded-sharing), and [Trust boundaries](#trust-boundaries-and-non-goals) | What Family History helps with, why story matters, who owns the work, how access may be shared, and what the product must not imply |
| Implementers | [Research-to-story loop](#the-research-to-story-loop), [Information model](#durable-information-model), [Provenance](#provenance-uncertainty-and-changing-understanding), and [Maintenance](#maintenance-and-claim-verification) | What must persist, which distinctions must survive, how research resumes, and what needs proof |
| AI and integration builders | [Assist family model](#the-assist-family-model), [Shared authority](#user-owned-data-and-shared-authority), [Questions and queues](#questions-queues-and-unfinished-work), and [Trust boundaries](#trust-boundaries-and-non-goals) | What your AI may do, which Family History operations may be used, what must remain reviewable, and where the site's responsibility stops |
| Writers and designers | [One-sentence identity](#one-sentence-identity), [Think of it as…](#think-of-it-as), [Storytelling principles](#storytelling-principles), [Capability truth](#capability-truth), [Language rules](#language-rules), and [Homepage implications](#public-homepage-and-future-shell-implications) | How to explain the product simply, what may be claimed now, how to describe evidence and uncertainty, and how the philosophy should feel |

Anyone publishing a capability claim must read both
[Capability truth](#capability-truth) and
[Maintenance and claim verification](#maintenance-and-claim-verification).

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

## Questions, queues, and unfinished work

Questions belong to the person, relationship, source, claim, place, event,
story, collection, or research project they concern. They can remain open
without blocking unrelated work.

The queue is the durable front door for new instructions and resumable work:
records to seek, captures to review, claims to compare, provisional identities
to resolve, context to research, stories to revise, and publication checks to
complete.

A useful queue item records:

- scope and requested outcome;
- responsible person or AI;
- source or evidence references;
- status such as active, waiting, blocked, needs review, or done;
- questions and assumptions;
- next action and checkpoint;
- result links and history; and
- what authority the assigned actor actually has.

The queue coordinates work; it does not grant authority or turn every question
into an approval gate. Work may pause for a person, another AI, a provider, an
archive, or better evidence. The next session should be able to resume without
reconstructing the whole conversation.

## Collaboration and bounded sharing

Family History needs two distinct sharing modes. Neither is verified as a
current repository capability; both are **In design**.

### Named collaboration inside a project

A named collaborator is an identifiable person invited into a family-history
project. Their access is account- or identity-bound and limited to the named
family tree, research project, person, story, collection, or narrower record.
The owner grants each allowed operation independently: retrieve, comment or
review, add, update, delete, promote, or publish where relevant.

Collaboration is not blanket vault access. The invite, acceptance, actor,
scope, allowed operations, changes, and revocation should remain visible and
auditable. Removing a collaborator ends future access without erasing the
attributed research or review history they already contributed.

### A share link to a bounded view

A share link gives its holder access only to a deliberately selected story,
tree branch, collection, or other bounded view. It is not an invitation into
the project, does not identify its holder as a collaborator, and does not grant
access to neighboring people, sources, notes, stories, or the full tree.

Before creating a link, the owner should be able to review exactly what the
view contains, who it is intended for, whether it expires, whether it is
discoverable, and whether any supported copying or download is allowed. A
link's status and scope must be understandable, revocable, and auditable. A
tree-branch link is a bounded view of selected relationships and supporting
material—not a transfer of ownership or a copy of the whole family tree.

Named collaboration and link sharing can coexist, but neither implies the
other. A collaborator does not automatically receive a share link, and a link
holder does not gain collaboration or mutation authority.

### Public storytelling remains separate

Publishing a story publicly is a separate, explicit promotion decision. An
invite does not publish; creating or opening a share link does not make its
contents public or searchable; and a public story does not expose the
underlying project, tree branch, collection, private sources, or research
notes.

Living people and private family documents are excluded from collaboration,
bounded views, and publication by default unless the owner deliberately grants
the relevant person, scope, operation, and audience access after review.
Inherited relationships, public historical context, or an already-public story
must never silently broaden that boundary.

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
- something may be permitted for a chosen AI but not for named collaborators
  or share links;
- something may be available to a named collaborator but excluded from every
  bounded link and public story;
- something may be included in a private bounded view but not publicly
  publishable; and
- public historical context does not make every linked family detail public.

Sharing and publishing are explicit, reviewable state changes—never automatic
side effects of import, AI use, a “published” suggestion, or connection to
another Assist product.

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
8. What is active, waiting, blocked, needs me, or ready to resume?
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

## Capability truth

Every user-facing capability must have exactly one status. Status is based on
current proof, not design intent.

| Status | Meaning | Claim rule |
|---|---|---|
| **Current** | Verified in the checked-out repository, with the exact evidence boundary stated | May be described as a repository foundation; it is not automatically a deployed or production claim |
| **In design** | The philosophy or an active design/architecture direction defines it, but the complete user path is not verified | Must be labeled “in design”; no direct action or implied availability |
| **Later** | Desired, partial, exploratory, or unscheduled capability | May appear only as future direction, never as a promise |

For public availability, **Current** must be upgraded with exact deployed
environment and user-path proof. Source code, a route, a mockup, a Linear issue,
or an older production observation is not sufficient by itself.

### Dated repository capability ledger

> **Time-sensitive evidence—verified 2026-07-29 at repository commit
> `2afbfa3`:** This table describes the checked-out source. It does not prove
> deployment, provider configuration, authenticated production behavior, or
> safe operation with private family data.

| Capability area | Repository evidence | Honest interpretation |
|---|---|---|
| Research vault | Owner-scoped Convex tables for people, alternate names, relationships, events, places, sources, citations, candidate source facts, media, context, imports, tasks, logs, stories, and historical context | **Current repository foundation.** Richer generalized claims, institutions, collections, and version histories remain in design |
| FamilySearch intake | User-mediated Chrome extension capture, package validation, preview, merge, dedupe, warnings, and raw/provenance contracts | **Current repository foundation.** Not automatic import, provider API access, unattended crawling, or universal genealogy integration |
| Provenance and uncertainty | Source/citation separation, citation confidence and conflicts, candidate/accepted/conflict/rejected source facts, import runs, research logs, and context source references | **Current partial foundation.** Not a complete generalized claim/provenance graph or immutable research history |
| Relationships | First-class person-to-person relationship rows, roles, facts, provisional relatives, and guarded promotion/merge flow | **Current partial foundation.** Broader social/institutional relationships and full competing-interpretation history remain in design |
| Context | Loose context items plus place/era research packs with sources, confidence, review, privacy, and AI-use gates | **Current partial foundation.** Buildings and institutions are pack/context types, not a complete first-class context graph |
| Questions and operations | Research tasks, research checks, research log, operations queue, compact handoff export, and quality-gated check writes | **Current partial foundation.** Not a complete durable multi-AI run, lease, checkpoint, and recovery system |
| AI context and Story Writer | Owner-scoped person context packs; manual prompt copy; optional OpenRouter generation; editable draft save with model/prompt metadata | **Current repository foundation.** Generation is person-centered and first-party; it is not proof of arbitrary chosen-AI connectivity or every story subject |
| Story Studio and publication | Draft/review/published states, reviewer assignment, evidence/context/privacy/living-person gates, explicit human confirmation, public story DTO filtering, and unpublish paths | **Current repository foundation.** Public availability still needs deployment/user-path proof; broader publishing, collaboration, books, and collections are not established |
| Collaboration and bounded sharing | Philosophy direction plus backlog decisions for family review, family-sharing artifacts, and richer sharing settings; no complete invite or scoped-link path is verified | **In design.** Named project collaboration and bounded links for a selected story, tree branch, collection, or view are distinct future modes. Current guarded story publication proves neither |
| Scoped authority | Scope vocabulary, API-key mint/list/suspend/revoke primitives, owner checks, story roles, guarded publish actions, and selected review/audit events | **Current partial foundation.** Incoming API-key resolution to an external AI is explicitly unfinished; self-asserted story headers are not a public authorization model |
| API and AI connections | Internal app APIs, a static planning capability manifest, a story OpenAPI skeleton, `/api/capabilities`, API Center source, and `llms.txt` | **Current internal/planning foundation only.** No verified public agent API, no MCP server, no universal AI setup path |
| Search and retrieval | Person/place/stories views, owner-scoped API reads, context packs, filters, and queue exports | **Current narrow retrieval surfaces.** No verified universal search across the full information model |
| Visualization | People/place workspaces and data suitable for relational views; Timeline route is explicitly a placeholder | **Partial foundation / in design.** Do not claim timeline, pedigree, map, heatmap, or general graph experiences as shipped |
| Retention, export, and deletion | Low-level record and key revocation paths plus documented lifecycle gap | **In design.** No complete owner-vault export, coordinated retention policy, account deletion, or cross-store recovery workflow is verified |
| Cross-product Assist links | Philosophy and portfolio direction only | **Later.** No qualifying explicit, reviewable, revocable Family History connection is verified |

No item in this philosophy is designated **Coming soon**. The repository uses
that label on a Timeline placeholder, but a placeholder is not delivery proof.
Until an active, owned delivery commitment and user path are verified, this
philosophy classifies the capability as **In design** or **Later**.

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
- scoped or unlisted share links for a story, tree branch, collection, or
  bounded view;
- books, exhibits, audio/podcast production, or general publishing;
- owner-vault export and coordinated account deletion; or
- cross-product Assist data retrieval, navigation, or publication.

## Trust boundaries and non-goals

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
- turn a collaborator invitation into blanket vault access or let a share link
  expose neighboring or newly connected records outside its reviewed view;
- treat a share link as collaboration authority, make it discoverable by
  default, or convert either sharing mode into public publication;
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

Family History may eventually issue its own scoped credentials so an approved
AI client can call Family History tools. That is different from collecting the
credentials used to access an outside provider. Family History authorization
must derive and enforce acting identity, family and record scope, and allowed
operation; preserve provenance and audit; support revocation; and keep
retrieval separate from mutation.

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
- use **named collaborator** for an identifiable person invited into a project
  with explicit operations;
- use **share link** for access to a selected story, tree branch, collection,
  or bounded view without project membership or mutation authority;
- use **public story** only for separately promoted, publicly available
  narrative output;
- keep private, AI-eligible, collaborator-visible, link-visible, and public
  states separate;
- distinguish external user-authorized AI activity from a Family
  History-operated integration; and
- label **Current**, **In design**, and **Later** capability status directly.

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

## Public homepage and future shell implications

These are design constraints, not a UI specification or authorization to
change the application.

### Public homepage

- Lead with research-to-story: collect and connect evidence so people and
  their AI can understand lives and tell grounded stories.
- Make the Assist family model clear: your AI reasons and researches; Family
  History remembers and organizes; you remain the authority.
- Show that the subject can be a person, family, place, building, community,
  culture, religion, event, or era—not only a pedigree node.
- Demonstrate the path from source to claim to context to story, including an
  honest contradiction or uncertain detail.
- Explain provenance in human language: “see where each detail came from.”
- Show user-owned scoped authority without depicting read access as blanket
  permission to change or publish.
- Explain that named collaboration and bounded share links are different
  in-design access modes; do not present either as current until verified.
- Keep living/private material as a quiet control, not the emotional headline.
- Use a visible **Current / In design / Later** ledger whenever future
  connections, imports, AI tools, or visualizations appear.
- Use synthetic, clearly labeled illustrations. Never use private family data,
  real credentials, or unresolved living-person material as marketing proof.
- Prefer a human editorial character—archival paper, margin notes, maps,
  captions, family annotations, and a visible evidence thread—over a generic
  chatbot, SaaS dashboard, or glowing autonomous-AI aesthetic.

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
- Treat questions and queue work as durable research objects, not transient
  notifications.
- Show historical context as setting, never as silent proof of personal
  experience.
- Keep sharing and publication explicit, previewable, reviewable, reversible
  where supported, and separate from ordinary saving.
- Give named collaboration an invite, identity, scope, operation, history, and
  revoke surface. Give share links a reviewed content boundary, audience,
  expiry/discoverability status, and revoke surface.
- Keep public publication as a separate promotion step; never let an invite or
  link silently become a public story.
- Keep human workflows complete when no AI is connected.
- Keep connection and capability status truthful inside the shell as well as
  on the homepage.

## Maintenance and claim verification

This document is stable product philosophy. Its capability ledger is dated and
can drift.

Before changing a public page, onboarding flow, signed-in shell, product
description, AI guide, provider guide, or integration claim:

1. classify every material capability as **Current**, **In design**, or
   **Later**;
2. verify public **Current** claims against the exact deployed environment and
   relevant user path—not only source code, a merged commit, a provider
   setting, a Linear issue, or an older observation;
3. default missing, stale, contradictory, partial, or unscheduled evidence to
   **In design**, **Later**, or omission;
4. verify trust-sensitive language against current identity, owner isolation,
   actor scope, operation authority, provenance, AI/privacy gates, rights,
   public DTOs, revocation, and provider behavior;
5. verify any import claim against the exact provider, consent flow, capture
   method, validation, merge gate, dedupe, provenance, and living/private-data
   boundary;
6. verify any chosen-AI connection against the real authentication path,
   incoming credential resolution, exact tools, scope enforcement, revocation,
   audit, and a synthetic retrieve → work → save → inspect result;
7. verify any publishing claim against draft/review state, source and context
   visibility, living/private checks, human confirmation, public filtering,
   unpublish behavior, and exact public route;
8. verify any collaboration claim against the invite and acceptance lifecycle,
   named identity, exact record scope, per-operation authority, living/private
   boundaries, attribution, audit history, and revocation; separately verify
   any share-link claim against its reviewed content boundary, audience,
   expiry and discoverability state, recipient-safe filtering, and revocation;
9. confirm that collaboration, bounded links, and public publication remain
   independently controlled and that none silently broadens another;
10. update the evidence date, repository revision, and evidence references when
   a status changes; and
11. update the Markdown and HTML companion in the same commit and refresh the
   HTML source digest.

Changes to the one-sentence identity, Assist family model, research-to-story
purpose, user-owned scoped-authority principle, provenance boundary,
living/private-material boundary, or trust/non-goal boundary require explicit
product-owner approval. Evidence-led capability status updates may change
without redefining the philosophy.

The Finance philosophy and reusable template established the shared family
structure. Buying, Memory, and Moving were used to compare authority language,
capability ledgers, evidence handoff, and HTML-reader conventions. No
repository-local Assist With Homes philosophy package was found in the
available checkouts at verification time, so this package does not invent or
attribute Homes-specific structure.

The Markdown file is canonical. Its HTML companion is a designed reader, not a
second source of product truth. Any substantive Markdown change must update
the HTML in the same commit and refresh the HTML's `source-sha256` metadata.

## Evidence handoff

The repository-foundation boundary in this revision was reconciled against:

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
- `convex/schema.ts`
- `convex/apiKeys.ts`
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

Linear product truth was checked against the **Current Product & Architecture
Map**, **AI Family History Lab Thesis**, `GEN-26`, `GEN-28`, `GEN-35`, `GEN-45`,
`GEN-61`, `GEN-109`, and `GEN-117`. Linear was used as coordination evidence,
not as proof that source or production behavior exists.

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
