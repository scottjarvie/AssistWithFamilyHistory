# Assist With Family History — Site Guide

The one product document for Assist With Family History. It is written for the people and AIs who build and maintain the site, and states the rules as they stand now. Git keeps the history; the [tracker](../tracker/GUIDE.md) holds current work. Shared rules every Assist site follows (support, storage limits, URL map, launch and update rules, navigation, the delivery rule) live in the family [Core Philosophy](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md); this guide covers only what is specific to Family History. Page layout lives in code and the [Family Folio design system](../design/family-folio-system.md). Open owner questions are in [`site-guide-content.json`](site-guide-content.json).

---

## What Family History is

**Assist With Family History assists your AI, so your AI can assist you with family history.** It is a durable, user-controlled research-to-story workspace: the person and their AI keep the people, how they are related, the sources behind every important detail, the questions still open, and the stories that come from it all — connected, attributed and still there when they return months later, possibly with a different AI.

The subject of the work can be a person, a family line, a relationship, a place, a building, a community, a religion, an event or an era — not only a pedigree position. A family tree is one view of the research, not its limit.

- **Not a family tree website.** FamilySearch and Ancestry are built around one tree and one answer per detail. Here the centre is the research — evidence, uncertainty, competing interpretations, questions and stories. FamilySearch stays the shared tree; this is the person's private research desk beside it.
- **Not an AI on its own.** The AI's work is organized, sourced and connected, and survives the conversation, the subscription and a change of AI.
- **Not a folder of scans.** Every file knows who and what it is about, what it says, and which claims and stories depend on it.
- **Not an autonomous genealogy service.** It does not promise complete genealogy, archive access, unattended research, automatic import, infallible conclusions or automatic publishing.

**Store generously; retrieve selectively.** Keep the original record, the exact wording, the transcription, who extracted which claim, the searches that came up empty, and why one interpretation currently leads — so a later, more capable AI can notice what nobody saw the first time. Give any AI a compact way to find the specific people, sources and questions it needs without loading the whole family into every request.

## The person, their AI, and the site

- **The person** decides what to research, which conclusions to accept, what is shared or published, and which AI they use.
- **Their AI** reads records, transcribes, compares evidence, proposes identities and relationships, researches context, plans research and drafts stories, using whatever abilities its client has.
- **The site** stores, organizes, connects and shows what they save, and offers tools a connected AI can use. It has no AI of its own and does not research on its own.

**The site governs only its own boundary.** The person may discuss anything with their AI and ask it to do anything in its own environment — search FamilySearch, read an archive, write to a cousin. Family History does not monitor or police that. It decides only whether that AI may use Family History's tools and data. A refused tool call limits the product operation, never the conversation; a broad conversation never authorizes one private read or one change here.

**The site never acts in the outside world.** It does not contact relatives, archives, churches or record providers, buy, publish elsewhere, crawl in the background, or act on FamilySearch. It never stores FamilySearch, Ancestry, archive, browser or AI passwords, cookies or sessions, and inherits none of the AI's outside access. Only what is deliberately saved through its own tools becomes Family History data.

**Human work is complete without an AI.** Everything an AI can save, the person can add, inspect, correct and organize by hand.

## Family History's trust rules

Genealogy has real consequences for real families. These hold everywhere in the product, for every person and every AI.

1. **Evidence first.** An important claim without a source is visibly marked unsourced. A source reference alone does not prove a claim: show which detail the source supports, how directly, what conflicts, and who reviewed it.
2. **Proposals are not conclusions.** An AI may *propose* a claim, identity match or relationship; only the person accepts it. Proposed, Accepted, Disputed and Rejected look different.
3. **Never silently merge people.** Two records that might be the same person stay separate until the person decides. No AI can merge or split identities.
4. **Keep the kinds of knowing apart.** Never flatten these into one undifferentiated truth: a record-supported fact, an exact quotation or transcription, the person's conclusion, a reasonable inference, historical context, family memory or lore, an AI suggestion or synthesis, and an unresolved contradiction.
5. **Context is setting, not proof.** "Cork was in famine in 1847" can enrich a story; it is not evidence that this family experienced it. If a parish was central to local life, that does not prove the person attended it.
6. **Corrections keep the trail.** Accepted claims can be superseded and names renormalized, but a correction is an attributed change, never a silent overwrite, and the path that led to the current understanding stays.
7. **Living people are private by default** (see [Living people and private material](#living-people-and-private-material)).
8. **Sharing and publishing are explicit acts**, never a side effect of import, AI use, a suggestion or a connection.
9. **No guarantee of accuracy.** The product never claims genealogical certainty, legal rights, archival completeness or that research is finished.

---

## Trees: separate workspaces

A person can keep **several trees**, each its own workspace, switched like a profile — for their own family, a friend's or relative's, or a genealogist's clients. Switching is a deliberate move, not a filter.

- **Inside a tree:** People, Relationships, Events, Claims, Sources and their files, the Places used, Projects and Questions, Stories, Notes, Research and Lists. Nothing in one tree appears in another.
- **Across all trees (account level):** Resources (websites, software and other research tools), Preferences, Instructions, the AI connection and the Queue (each Queue item names its tree). Whether Topics sit at account level or in each tree is an open owner question.
- **The AI** works in the active tree by default, switches only when the person asks or names a tree, and never mixes records between trees.

## Building blocks

A **building block** is a named kind of information the person and their AI can save, connect and revisit. Each has a stable link and a place to inspect and correct it.

### Main blocks

| Block | What it is |
| --- | --- |
| **Person** | Someone who lived or lives: names over time (birth, married, anglicized, nicknames), sex, living or deceased, life summary, identifiers such as a FamilySearch ID. Can be a family member, a witness, a neighbour, or someone whose identity is still uncertain. |
| **Source** | Anything that tells us something: a record, document, photograph, letter, journal, headstone, book, newspaper item, recording, or a family memory written down. Holds the original file(s), where it came from, a citation, a transcription, rights and privacy. Preserved once and connected to every person, place and event it mentions — never owned by one profile. |
| **Place** | A location as it was known at the time — country, county, parish, town, address, cemetery, church, school, farm, ship, mine. Places nest and their names and borders change over time. Buildings and institutions are places too. |
| **Project** | A piece of research work with a purpose (*Trace the Scottish line*, *Prepare for the reunion*, a client's request). Holds Questions and gathers the Research, Sources, Lists and Stories for the work. A scope for work, never permission to merge what is inside it. |
| **Question** | An open research problem (*Who were Mary Kelly's parents? Is this the same John Smith?*), inside a Project or standing alone. Holds the AI's plan, the research log (searched, found, *not* found), the Research produced, and the conclusion with its reasoning when answered. Questions can nest and can stay open for years without blocking other work. |
| **Story** | Something written to be read: a life sketch, migration story, day in the life, family narrative, a story about a place or a war. Every version records who wrote it and what was asked for. |
| **Topic** | A subject that connects many lives and is worth researching once: a war, a migration, a famine, a religious movement, an occupation, a community, a ship. Historical context attaches here and to Places, always labelled as context, with its own sources, confidence and time-and-place scope. |

### Who made it is never ambiguous

| Block | Who writes it |
| --- | --- |
| **Note** | Only the person: their thinking, a reminder, a hunch, something they remember. |
| **Research** | Only their AI: a saved report of what it looked at, found and did not find, its reasoning, sources, which AI, and the Preferences it followed. |
| **Story** | Made together; every version says who wrote it. |

### Supporting records

- **Relationship** — a link between two people (biological, adoptive, step, foster, guardian, spouse, partner, household, godparent, witness, neighbour, employer) with dates, evidence, confidence and state. Relationships get disputed, so each has its own small page. A provisional relative is research material, not an accepted identity.
- **Claim** — one statement a source makes about a subject: the exact original wording, the normalized value, the sources and citations that support or contradict it, primary / secondary / derivative / family lore, confidence, state (**Proposed · Accepted · Disputed · Rejected**), who added or accepted it, and why it currently leads. The interface and the AI tools say **Claim**, never "Fact". A Person's birth date is the currently accepted Claim; the others stay visible beside it.
- **Event** — something that happened (birth, baptism, marriage, census, migration, military service, death, burial) with a date that may be exact, approximate, inferred, disputed or a range, a place, and participants in roles.
- **Citation** — exactly where in a source a claim is found: page, line, image number, entry.
- **File** — an uploaded original and what is derived from it (see [Media](#media)).
- **Possible match** — two people suspected to be the same, with the evidence for and against, waiting for the person's *same person*, *different people* or *not sure yet*.
- **Import** — one FamilySearch capture or other import: what arrived, what was matched, warnings, and its review state.
- **External identifier** — a FamilySearch ID, Find a Grave ID or other link to the same person or record elsewhere.
- **Version and request** — saved versions of Research and Stories, each with its author and the request behind it.
- **Plan item** — one step in a Question's plan: what to search, in what order, who is doing it, what happened.
- **Connection** — any other link between two things (below).

### Shared family blocks, in Family History

- **Lists** — the person's own gatherings (*Ancestors missing a birth record · Graves to photograph · Photos to identify · Brick walls*). Entries point at real records; one person can be on many Lists.
- **Library** — shelves **Research · Sources · Instructions · Stories**. The Sources shelf is a flag on the sources the person returns to most (the family Bible, a grandfather's journal), not a copy of every source.
- **Preferences** — how the person wants help: research depth, citation style, original records over indexes, which lines matter most, story tone, what to do about living relatives. Preferences guide; they never grant permission.
- **Queue** and **AI Suggestions** — see [The Queue](#the-queue).

## How the blocks fit together

**Person, Relationship, Event, Place — the family picture.** The Tree, Timeline and Map are views over these records, not separate data. The friendliest start is one person and one known relationship; imports and the AI's research are accelerators into that picture, never a required shape.

**Source → Claim → Person — the evidence chain.** A Source is preserved once. Claims extracted from it each name their subject and citation. A page can always show the alternatives: *Census 1851 says about 1842; headstone says 1840; family memory says 1843 — 1842 leads because…*. This is the site's most important difference from a tree website.

**Project → Question → Plan → Research → Conclusion — the research loop.** The AI writes a plan; each piece of work becomes Research with its sources, including negative results, which stop the next AI repeating a dead end. New Claims and Possible matches arrive as **Proposed**. When answered, the Question holds the conclusion and its reasoning.

**Topic and Place — context reused.** Context about *the 1847 famine in Cork* is saved once on the Topic or Place, then shown wherever a life touches it, always labelled as historical context.

**Story — the output that leads back.** A story draws on accepted Claims, Sources, Notes and context. It can reveal a weak link and open a new Question.

**Where a starting thought lives.** Something the person remembers is a **Note**; a memory recorded from a relative is a **Source** of kind *family memory* that can support Claims labelled as family lore. A record they found is a **Source**. A piece of research work is a **Project**; a problem inside it is a **Question**. A request for their AI is a **Queue item**. Something to gather is a **List**.

**Separate interpretations.** Shared evidence does not force one answer. Each researcher, or their AI acting for them, may hold a different interpretation of the same records with its own reasoning, confidence, sources and authorship. The product keeps them side by side rather than resolving the conflict silently.

### Connections

Most links have a home of their own: a Claim links a Source to a Person, a Relationship links two People, an Event links People to a Place. Everything else is a **Connection** — two ends, a kind (*about, mentions, depicts, answers, contradicts, same as?*), a short reason, who made it, and the Research it came from. Connections show on both ends; the person can remove any of them, and every AI-made batch can be reviewed or removed together.

**Photos are the commonest case.** A wedding photo is one Source (perhaps two files: the front and the handwritten back), connected to each person shown in it (with an optional face box), the wedding Event, the church Place and any Story or Project that uses it. It appears on every one of those pages but is still one file, so a better scan or a correction updates it everywhere. AI-suggested tags and connections arrive as suggestions the person accepts.

**When an AI finds many things at once** — say 30 baptisms with the surname in a parish register — it saves (1) **Research** describing the search, criteria and what it left out; (2) a **List** of the 30 with its reason for each; and (3) **Proposed** Claims or Possible matches only for entries it believes belong to this family. The 30 never go straight onto anyone's Person page.

---

## Living people and private material

Privacy is a quiet boundary, not the product's headline: historical research mostly uses public records about people long dead. But living people and private family material need deliberate control.

- **Private by default** covers living people, private notes, correspondence, recent addresses, contributor details, restricted media, sensitive relationships, oral histories and unreviewed family claims. Private does not mean hidden from the owner's own workspace.
- **Records about living people and private memories stay unreadable to the AI until the person has reviewed them.**
- **Never infer death from age.** Deceased status comes from the person's explicit statement or supporting evidence, with its provenance visible.
- **Private, AI-readable and public are separate states.** Something may be visible to the owner but not to the AI; readable by the AI but never public. Public historical context never makes linked family details public. A deceased label never makes linked living relatives, private notes or sensitive relationships shareable.
- **Public stories pass a living-person and privacy check**, a light sensitive-info check, and can be unpublished by the person or their AI. Publishing one story never exposes the people, sources, notes or tree around it.
- **Sharing.** The only sharing is guarded public-story publishing. Any wider sharing is per tree, never a whole account; uses the family access words (Private, Unlisted, Trusted, Public); is explicit, previewable, revocable and attributed; and never broadens linked records.
- **Admin sees counts and metadata, never the content of anyone's family records.**
- **Marketing and examples use synthetic, clearly labelled families only** — never private data, real credentials or unresolved living-person material.
- **Identity is site-specific.** Signing in to or deleting a Family History account never signs a person into, deletes from, or moves data through another Assist site.
- **The person owns their data**: they can view and correct it, export it in a useful form, and delete records and their account. Deleting a record removes its attachments and content-bearing history.

## Stories

Storytelling is a primary capability, not a decorative export. The author — the person or their AI — stays in control of voice, structure and imagination; the product does not require a citation on every sentence.

- **The evidence layer is optional.** A passage *may* link to people, relationships, sources, events, places, claims, uncertainty notes and labelled context. The story stands on its own; a curious reader can open what lies behind a passage. Writers may link densely, lightly or not at all.
- **Context stays distinguishable from evidence** in the reader layer, and story language should make that difference clear without turning every paragraph into a disclaimer.
- **Corrections flow through.** A corrected claim updates the reader layer without erasing earlier versions or the research trail.
- **Every version records who wrote it and what was asked for.** Review and publication follow the guarded path above.

## Media

Family history is media-heavy: scanned records, old photographs, certificates, letters, headstones, recorded interviews, sometimes film. The family media storage standard (linked from Core) owns how bytes are stored. In Family History:

- **Every file belongs to a Source**, stored once and connected to everything it matters to. A portrait is a crop of a Source image chosen for that person. A photo uploaded with no context becomes a Source of kind *photograph* that can be described later.
- **One upload path for everyone.** The person's uploads and the AI's uploads use the same private storage, the same display sizes and the same deletion.
- **New uploads are private, unreviewed and not readable by the AI** until the person reviews them.
- **Originals are never altered.** Display sizes, portrait crops, enhanced copies, transcripts and translations are derived files linked to the original. Capture time and location in a file are proposals the person reviews, handled under the standard's privacy rules.
- **The AI reads the actual image, scan or audio** the person has allowed, not only its title, and never receives a raw storage link.
- **Audio and video need a transcript** as a derived file; oral history matters more here than on most sites.

---

## The Queue

The Queue is how the person hands work to their AI. Family History follows the family Queue in Core; what is specific here:

- **The directive is enough.** The person's words alone create an item. "Add context" is optional and offers three Family History groups: **who or where** (person, relationship, place, topic), **evidence** (source, claim, photo) and **work** (project, question, story, list).
- **Lifecycle and order** follow Core: **Waiting on AI · AI working · Needs your input · Answered · Everything**, with *Needs your input* as a flag. Record states — proposed, disputed, needs review, publishable — are never Queue states.
- **A directive never widens authority.** It cannot give the AI access to a person or source it may not read, or authorize a new objective, permanent deletion, an identity merge, accepting a disputed claim. When something only the person can supply is missing, the item asks the smallest exact question.
- **Priority is the person's.** The AI never sets it.
- **AI Suggestions** are where the AI parks ideas the person did not ask for (*these two Johns may be one person*, *nobody has looked for a burial record*). Accepting one creates a Queue item.
- **The Queue is not the build tracker** (`docs/tracker/`) and not a research-task list; it carries a person's directives inside the product.

## The AI connection and tools

The site's `/mcp` server is how a connected AI reads and saves. The family MCP and OAuth standard (linked from Core) owns the connection rules. Tool names start `family_history_`; tools return record identifiers and links so the AI can continue an existing record, tolerate a repeated request without duplicating, and attribute everything to the AI that did it.

**Connecting.** A first connection gets every current and future tool with no end date. Each new client ID starts with the narrowest unreleased limits in the person's durable restriction record, across all connections. No name or app identity matching is used. Existing client IDs keep their own grants. Either the person or AI can narrow, pause, revoke or shorten an end date; only a revision-checked person action can Restore, Resume, widen, change an end date or Forget. The floor is read without history scans; legacy conversion pages through all records and fails closed while incomplete. Settings lists every current connection separately. Archive and restore are reversible. AI may publish or unpublish stories after the light batch sensitive-info check. Media review, rights and living-person protections remain.

**No AI can ever** accept its own proposals, merge or split people, invite new people or change another person’s access, permanently delete, export the tree, act on FamilySearch or any outside provider, or touch billing. **No AI ever sees** another owner's records, raw storage links, provider credentials or raw database access. These are not grantable.

What the AI must be able to do, by job:

1. **Get oriented** — the active tree and the list of trees, then the tree's overview: counts, the home person, recent work, open Questions, what is waiting for review, Preferences and the Library catalogue.
2. **Find** — people (with name variants and lifespan), sources, places, projects, questions, topics, stories and lists, with the same filter families the pages use.
3. **Read** — one record with its connected context in manageable amounts: a person with claims, relationships, events and sources; a source with its file, transcription and claims; a question with its plan and log.
4. **Look at the evidence** — the actual image, scan or audio the person allows.
5. **Save** — people, relationships, events, places, sources with files, connections and photo tags as suggestions, proposed claims, possible matches, research, projects, plans and log entries, topics, stories and versions, notes the person dictates, and lists — in batches with per-item results.
6. **Work the Queue** — pick up, report progress, ask the person a question, answer, add attributed follow-ups, and park unrequested ideas in AI Suggestions.
7. **Switch trees** — only when the person asks or names a tree.

## Language

- Say **your AI** for the AI the person chooses; avoid "agent" in user-facing copy. Family History is the workspace, never the AI itself.
- Prefer **person, family, relationship, place, event, source, claim, question, context, story** over data-model terms; **where this came from** or **research trail** over "provenance" for general readers.
- Label the actual state: **source-backed**, **inferred**, **disputed**, **family lore**, **historical context**. Distinguish original, transcription, extraction, conclusion, synthesis and narrative.
- Describe hypotheses and separate interpretations as legitimate research states, not errors to hide.
- Never say "the AI knows your family", "automatic genealogy", "searches every archive", "imports everything", "proves your ancestry", "writes the true story", "works with any AI", "connects all your accounts".
- Name an AI client only to illustrate choice, never to imply a supported integration unless that client has been proven against production.
- The product is **Assist With Family History**, or **Family History** where shorter is clearer. "Discover Their Stories" is a retired name, kept only in historical records and required technical identifiers.
- The voice is calm, curious, humane and specific. It invites correction without scolding and never makes private-family safeguards the emotional headline. The visual character — a serious research folio, not a SaaS dashboard or chatbot — is set in the [Family Folio design system](../design/family-folio-system.md).

---

## For the person and their AI: defaults we set

This section is guidance for end users and the AI they connect — what `/ai`, `/ai.txt`, the Library Instructions and the tool descriptions should teach. These are defaults; the person's own Preferences and instructions win wherever the trust rules allow.

- **Start oriented.** Read the active tree's overview, the person's Preferences and the Library Instructions before researching. Work in the active tree; never mix trees.
- **Search before creating.** Find the existing person, source or question and continue it rather than making a duplicate.
- **Keep the original.** Save the source with its exact wording, citation and file before extracting claims from it. Preserve where it came from, when it was retrieved, and any transcription or translation as a derived item.
- **Propose, don't decide.** Save claims, identity matches and relationships as Proposed with a confidence and a one-line reason. The person accepts.
- **Record what was not found.** A search that came up empty is Research worth saving, with where and how it was searched.
- **Label context as context.** Place-and-era research goes on the Topic or Place and is never written onto a person as fact.
- **Many results → Research + List + a few proposals**, as described [above](#connections).
- **Living people stay private.** Do not ask to read or include unreviewed living-person or private-memory records, and treat anything about the living as private in stories and summaries.
- **Answer in chat, save as you go.** Batch saves into one call; say what was saved and link to it.
- **Ask the smallest question.** When only the person can supply something, set *Needs your input* with one exact question rather than guessing.
- **Prompts and research loops in the Library are optional starting points** — *make a research plan for an ancestor*, *compare evidence for a same-person hypothesis*, *research place and era context*, *draft interview questions for a relative*, *transcribe and translate a record*. Each carries its version, date, purpose and limits; the person or AI may edit, combine or ignore any of them. A prompt is one instruction; a loop is a repeatable pattern (gather, compare, record, find the next gap) run under the person's direction, never an autonomous engine.
- **Outside the site, the person directs their AI.** Searching FamilySearch, writing to an archive or contacting a cousin happens in the AI's own environment under the person's instructions; Family History stores only what is deliberately saved back.

---

## Related documents

| Document | Use it for |
| --- | --- |
| [Core Philosophy](https://github.com/scottjarvie/assistwithlife/blob/main/planning/assist-with-sites-core-philosophy.md) (Assist With Life) | Shared pages, URL map, Queue lifecycle, support, storage, launch, `/updates`, navigation and delivery rules for every Assist site; it links the family MCP/OAuth and media storage standards |
| [Family Folio design system](../design/family-folio-system.md) | Visual character, components and page families |
| [Ancestor data vault architecture](../product/ancestor-data-vault-philosophy-and-architecture.md) | Research-backed layered data model (originals, citations, mentions, candidate claims, conclusions, context graph); this guide's rules win where they differ |
| [Tracker](../tracker/GUIDE.md) | Current work, Cards and Work Orders |

### AWL-0015 revised decisions (2026-11-09)

Every new AI connection starts at the person’s narrowest unreleased restriction floor; existing client IDs keep their own grant. Names and app identities never match connections. Only revision-checked person actions release restrictions. Settings offers Restore and Forget and lists every current connection. Your AI may publish and unpublish stories after one batch sensitive-info check: secrets refuse; one acknowledgeContactDetails count object covers contact details and can accompany the first call. Business contacts are expected; remove only the person’s own private details. Media review, rights and living-person protections stay.
