# Assist With Family History — Site Guide

**Canonical product direction** · Edition 2 · 6 October 2026 · Canonical since 6 October 2026

**Assist With Family History assists your AI, so your AI can assist you with family history.** A capable AI can already read an old record, compare two census entries, explain what life was like in a parish in 1850, and help write a grandparent's story. Family History is where the person and their AI **organize** that work and where it **lasts**: the people, how they are related, the sources behind every important detail, the questions still open, and the stories that come from it all.

This guide tells a builder what the site is made of — its **building blocks**, the pages each one needs, how the shared Assist pages apply here, and what the person's AI needs from the site. It is the Family History companion to the family [Core Site Guide](#documents-that-help-build-family-history), in the same shape as the Scriptures and Languages site guides.

**How this guide relates to the Project Philosophy.** This guide is canonical product direction (Scott, 6 October 2026). The [Project Philosophy](assist-with-family-history-project-philosophy.md) remains the reference for the long-form trust boundaries, language rules and capability-evidence history, and nothing here relaxes them. Where the two differ, this guide reflects newer owner direction; binding rulings are in [Decisions](#decisions).

**Status words.** *Built* means it exists in the repository and is live on assistwithfamilyhistory.com. *Partial* means some of it is live. *To build* means it is designed here and not yet built. Anything marked **Proposed** is a recommendation not yet ruled on; open questions live in [`site-guide-content.json`](site-guide-content.json).

---

## The promise

Family history work is long. A question about one great-grandmother can take years, pass through several AIs, and touch dozens of records. Most of that work today ends up scattered: a tree on one website, scans in a folder, a chat that found something useful last spring and is now impossible to find, and a story draft that no longer says where its details came from.

Family History keeps all of it connected:

- **People** and the many names they went by, without forcing two uncertain matches into one person.
- **Relationships** — parents, spouses, children, step and adoptive families, households, godparents, witnesses, neighbours — each with the evidence for it.
- **Sources**: the census page, the certificate, the journal, the photograph, the headstone, the recording of an aunt telling the story she was told — preserved once and connected to everyone they mention.
- **Claims** with their receipts: what each source actually says, how sure we are, and where sources disagree.
- **Places** and the **historical context** around a life, kept clearly apart from evidence about the person.
- **Projects** that gather a piece of research work, and the **Questions** inside them — the open research problems — with the AI's plan, what was searched, what was found, and what was *not* found.
- **Stories** made from all of the above, with a path back to the evidence when someone asks "how do we know that?"

**The more the family's research grows here, the more useful it becomes.** Success means the person can return months later, possibly with a different AI, and continue without re-explaining the family. Their own memories, the original records, and what each AI found are all still there and still easy to tell apart.

### Context that outlives the conversation

A future, much more capable AI will be able to take the same records and notice what nobody saw the first time: that two "different" men are the same person under a spelling variant, that a witness at a baptism was actually a cousin, that a migration lines up with a famine in the home parish. That only works if the site kept more than conclusions. **Store generously; retrieve selectively.** Keep the original record, the exact wording, the transcription, who extracted which claim, the searches that came up empty, and why one interpretation currently leads. Give any AI a compact way to find the specific people, sources and questions it needs without loading the whole family into every request.

### Who it is for and what makes it different

Family History is for anyone doing family history over time: the experienced genealogist, the relative who inherited a box of photographs, the cousin trying to solve one brick wall, the parent who wants their children to know who came before, and the storyteller who wants a life to be understood without inventing it.

- **From a family tree website** (FamilySearch, Ancestry): those are built around one tree and one answer per detail. Here the centre is the *research* — evidence, uncertainty, competing interpretations, questions and stories — and the tree is one view of it. FamilySearch stays the shared tree; this is the person's private research desk beside it.
- **From an AI on its own:** the AI's work is organized, sourced and connected, and it survives the conversation, the subscription and a change of AI.
- **From a folder of scans and documents:** every file knows who and what it is about, what it says, and which claims and stories depend on it.

---

## The person, their AI, and the site

Core owns this principle for the family. In Family History:

- **The person** decides what to research, which conclusions to accept, what is shared or published, and which AI they use. They may ask their AI to do anything in its own environment — search FamilySearch, read an archive, write to a cousin. The site does not police that conversation.
- **Their AI** reads records, transcribes, compares evidence, proposes identities and relationships, researches historical context, plans research, and drafts stories, using whatever abilities its client has.
- **The site** stores, organizes, connects and shows what the person and their AI save, and offers tools a connected AI can use. It has no AI of its own and does not research on its own. Its connection settings govern only its own records.

**Family History's extra rules,** because genealogy has real consequences for real families:

1. **Evidence first.** An important claim without a source is visibly marked as unsourced. The AI may *propose* a claim, an identity match or a relationship; only the person accepts it as their conclusion.
2. **Uncertainty stays visible.** Proposed, accepted, disputed and rejected are different states and look different. A correction never erases the trail that led to it.
3. **Never silently merge people.** Two records that might be the same person stay separate until the person decides.
4. **Context is setting, not proof.** "Cork was in famine in 1847" can enrich a story; it is not evidence that this family experienced it.
5. **Living people are private by default.** Nothing about a living person, a private memory or an unresolved relative is ever shown publicly. Public stories pass a living-person check.
6. **Human work is complete without an AI.** Everything an AI can save, the person can add or correct by hand.

---

## Trees: separate workspaces

A person can keep **several trees**, each its own workspace, and switch between them the way you switch profiles (Scott, 6 October 2026). The reason is real use: researching your own family, helping a friend or relative with theirs, or a genealogist working for clients. Switching trees changes almost everything you see, so it is a deliberate move, not a filter.

- **Inside a tree:** People, Relationships, Events, Claims, Sources and their files, the Places used, Projects and Questions, Stories, Notes, Research and Lists. Nothing in one tree appears in another.
- **Across all trees (account level):** Resources (websites, software and other research tools), Preferences, Instructions, the AI connection, and the Queue (each Queue item names its tree). **Proposed:** Topics also sit at account level, because a war or a migration is useful context in any tree; a Topic's connections to people stay inside their tree.
- **Your AI** works in the active tree by default, can list trees and switch to one by name, and never mixes records between trees.
- **Later:** copying a person from one tree to another, and handing a finished tree to the family it belongs to (this rides on sharing, which is not in the first builds).

## The building blocks at a glance

A **building block** is a named kind of information the person and their AI can save, connect and revisit. The Core Site Guide requires each one to say whether it gets a collection page, a detail page, or a section inside another record. The current database already holds most of the genealogy blocks in a person-centred, FamilySearch-shaped form; several family-standard blocks do not exist yet. The **Today** column says which.

### Main building blocks

| Building block | What it is | Pages | Today |
| --- | --- | --- | --- |
| **Person** | Someone who lived or lives. Names over time (birth, married, anglicized, nicknames), sex, living or deceased, life summary, identifiers such as a FamilySearch ID. A person can be a family member, a witness, a neighbour, or someone whose identity is still uncertain. | People collection · Person page | Partial — table and pages exist |
| **Source** | Anything that tells us something: a record, document, photograph, letter, journal, headstone, book, newspaper item, recording, or a family memory written down. Holds the original file(s), where it came from, a citation, a transcription, rights and privacy. One source connects to every person, place and event it mentions. | Sources collection · Source page | Partial — sources, citations and media are separate tables |
| **Place** | A location as it was known at the time: country, county, parish, town, address, cemetery, church, school, farm, ship, mine. Places nest (a parish inside a county) and their names and borders change over time. | Places collection · Place page | Partial |
| **Project** | A piece of research work with a purpose: *Trace the Scottish line*, *Prepare for the reunion*, a client's request. Holds Questions, and gathers the Research, Sources, Lists and Stories that belong to the work. | Projects collection · Project page | To build |
| **Question** | An open research problem: *Who were Mary Kelly's parents? Where did the family live before 1880? Is this the same John Smith?* The specific research unit inside a Project (or standing alone) — it holds the AI's plan, the research log (what was searched, what was found and *not* found), the Research produced, and the conclusion when it is answered. Big questions can hold smaller ones. | Questions collection · Question page | Partial — research tasks/checks exist with different vocabulary |
| **Story** | Something the person and their AI write to be read: a life sketch, a migration story, a day in the life, a family narrative, a story about a place or a war. Every version records who wrote it and what was asked for; details can link back to their claims and sources. Can be published after review. | Stories collection · Story page with editor | Partial — Story Writer and Story Studio exist |
| **Topic** | A subject that connects many lives and is worth researching once: a war, a migration, a famine, a religious movement, an occupation, a community, a ship. Historical context research attaches here and to Places, so it is reused across every ancestor it touches. | Topics collection · Topic page | Partial — context items and place/era packs exist |

### Content written by the person or their AI

Following the Scriptures split, which the family may adopt: **who made it** is never ambiguous.

| Block | Who writes it | Where it shows |
| --- | --- | --- |
| **Note** | Only the person. Their own thinking, a reminder, a hunch, something they remember. | Attached to anything; Your work |
| **Research** | Only their AI. A saved report: what it looked at, what it found, what it did not find, its reasoning, sources, which AI, and the Preferences it followed. | Attached to what it is about; Your work; Library Research shelf |
| **Story** | Made together; every version says who wrote it. | Stories |

### Supporting records

These make the main pages work. Each has a stable link and a place to inspect and correct it, but no main-menu destination.

- **Relationship.** A link between two people — biological, adoptive, step, foster, guardian, spouse, partner, household, godparent, witness, neighbour, employer — with dates, its evidence, confidence and state. Shown on both Person pages and in the Tree; opens to its own small page because relationships get disputed (*is this really her father?*).
- **Claim**. One statement a source makes about a subject: *born about 1842 in County Cork* — the exact original wording, the normalized value, the source and citation that support or contradict it, primary/secondary/family-lore, confidence, state (**Proposed · Accepted · Disputed · Rejected**), and who added or accepted it. Shown on the Person page's Claims section with conflicts side by side.
- **Event.** Something that happened — birth, baptism, marriage, census, migration, military service, death, burial — with a date that may be exact, approximate or a range, a place, and participants in roles (child, parent, witness, officiant, head of household). Shown on Person pages, timelines and maps.
- **Citation.** Exactly where in a source a claim is found: page, line, image number, entry.
- **File.** An uploaded original (photo, scan, PDF, audio, video) and what is made from it (display sizes, transcript). Stored once, inside a Source (a Source can hold several files, such as the front and back of a photo), and connected to everything it matters to. A Person's portrait is a crop of a Source image chosen for that person. See [Media](#media-in-family-history).
- **Possible match.** Two people the person or their AI suspects are the same, with the evidence, waiting for the person's decision. (Today: provisional relatives and merge review.)
- **Import.** One FamilySearch capture or other import: what arrived, what was matched, warnings, and its review state.
- **External identifier.** A FamilySearch ID, Find a Grave ID, or other link to the same person or record elsewhere.
- **Version and request.** Saved versions of Research and Stories, each with its author and the request behind it.
- **Plan item.** One step in a Question's plan: what to search, in what order, who is doing it, and what happened.
- **Connection.** Any other link between two things (see below).

### Shared family blocks, in Family History

- **Lists** — the person's own gatherings: *Ancestors missing a birth record · Graves to photograph · Records to order · Photos to identify · Cousins to interview · Brick walls*. Entries point at real records; one person can be on many Lists.
- **Library** — the small go-to shelf, ordered **Research · Sources · Instructions**, plus a **Stories** shelf (Core allows Family History this extra shelf). The Sources shelf is a flag on the Sources the person returns to most — the family Bible, a grandfather's journal, a county history — not a copy of every source.
- **Queue** and **AI Suggestions** — see [shared pages](#shared-pages-expressed-in-family-history).
- **Preferences** — how the person wants help: research depth, citation style, whether to prefer original records over indexes, which family lines matter most, tone for stories, what to do about living relatives.

## How the blocks fit together

**Person, Relationship, Event, Place — the family picture.** People are connected by Relationships and appear in Events at Places. The **Tree**, **Timeline** and **Map** are views of these records, not separate data. Start small: one person and one known relationship is already useful (live today, see 2.1.0).

**Source → Claim → Person — the evidence chain.** A Source is preserved once. Claims extracted from it each name their subject (a person, relationship or event) and their citation. A Person's birth date on their page is the currently accepted Claim, and the page can always show the others: *Census 1851 says about 1842; headstone says 1840; family memory says 1843 — 1842 leads because…*. This is the site's most important difference from a tree website.

**Project → Question → Plan → Research → Conclusion — the research loop.** A Project gathers a piece of work and holds its Questions. A Question names the problem and the people, places or sources it concerns. The AI writes a Plan (which records, in what order). Each piece of work becomes Research with its sources — including negative results, which genealogists value because they stop the next AI repeating a dead end. New Claims and Possible matches arrive as **Proposed** for the person to review. When answered, the Question holds the conclusion and the reasoning (a proof argument, in genealogy terms). A Question can also simply stay open for years.

**Topic and Place — context reused.** Research about *the 1847 famine in Cork* or *coal mining in 1890s Pennsylvania* is saved once on the Topic or Place, then shown wherever a life touches it, always labelled as historical context.

**Story — the output that leads back.** A Story draws on accepted Claims, Sources, Notes and context. Its evidence links are an optional reader layer, not a required citation format. A story can reveal a weak link and open a new Question.

**Where a starting thought lives.** A thing the person remembers is a **Note** (or, when recorded from a relative, a **Source** of kind *family memory*). A record they found is a **Source**. A piece of research work is a **Project**; a problem to solve inside it is a **Question**. A request for their AI is a **Queue item**. Something to gather is a **List**. Each links back to what it came from.

### Connections: the glue

Most links have a home of their own: a Claim links a Source to a Person, a Relationship links two People, an Event links People to a Place. Everything else is a **Connection**: a photo of a building connected to the Place, a Topic connected to a Person, a Story connected to a Question, one Source that mentions another. A Connection holds its two ends, a kind (*about, mentions, depicts, answers, contradicts, same as?*), a short reason, who made it, and the Research it came from. **Photos are the commonest case.** A 1910 wedding photo is one Source (perhaps two files, front and the handwritten back). It is connected to each person *shown in* it, with an optional box marking each face, to the wedding Event, the church Place (*taken at*), and any Story or Project that uses it. It shows on every one of those pages and in the Sources gallery, but it is still one file, so a better scan or a correction updates it everywhere. The AI may suggest tags and connections; they arrive as suggestions the person accepts. Connections show on both ends and in "what's connected to this" on every page. The person can remove any of them; every AI-made batch can be reviewed or removed together.

**When an AI finds many things at once.** Suppose the AI searches a parish register and finds 30 baptisms with the surname. That produces (1) **Research** describing the search, the criteria and what it left out; (2) a **List** of the 30 with the AI's reason for each; and (3) **Proposed** Claims or Possible matches only for the entries it believes belong to this family. The 30 do not go straight onto anyone's Person page.

---

## Building blocks and their pages

Every collection has **Table · Grid · List** views, search, sort and the Core's drill-down filter families; the AI's find tools use the same families. On a phone, collections become one-column lists with filters in a sheet, and detail pages keep their first screen for content.

### People collection

**Purpose:** find anyone fast and see where research is thin.
**Shows:** name (with variants searchable), lifespan, birth and death places, living flag, portrait thumbnail, relationship to the person's home person, counts of sources and open questions, and a research-coverage signal (*no birth source*, *parents unknown*).
**Filters:** surname, living/deceased, century, place, line (paternal/maternal of the home person), has open Questions, coverage gaps, added by (me, my AI, import).
**Grid** shows portraits; **Table** is the default.

### Person page — the life file

The most visited page on the site. Leads with **identity and life summary**: name, lifespan, portrait, places, and a short accepted summary. Then tabs or sections:

- **Overview** — family at a glance (parents, spouses, children, siblings), key events, open Questions, recent changes.
- **Claims & evidence** — every Claim grouped by kind (birth, marriage, residence…), accepted value first, alternatives and conflicts beside it, each with its sources. Unsourced claims are marked. *Accept*, *dispute*, *add source* in place.
- **Timeline** — the person's events in order, with optional historical context interleaved and clearly labelled.
- **Sources & media** — everything about this person, photos first (this replaces today's "Memories" tab, which holds uploaded files).
- **Research & notes** — the AI's Research and the person's Notes about this person, kept visibly apart.
- **Stories** — stories about or mentioning them.
- **History** — who changed what and when, including which AI.

**Actions:** add relative, add claim, add source or photo, ask your AI (prefilled Queue item), start a Question, mark possible match, write a story.

### Tree

**Purpose:** see the family picture and move around it. Not a separate record — a view over People and Relationships.
**Views:** pedigree (ancestors), descendants, family group (a couple and children), and later a fan chart. Proposed and disputed relationships draw differently from accepted ones. Clicking anyone opens their Person page or re-centres the tree. On a phone, a family-group card with swipe up to parents and down to children replaces a wide chart.

### Sources collection

**Purpose:** the family's archive, findable by what it is and who it mentions.
**Shows:** title, kind (census, vital record, church record, military, immigration, newspaper, photograph, letter, journal, headstone, book, recording, family memory…), date, place, repository, people mentioned, review state, rights.
**Filters:** kind, person mentioned, place, date, repository, has transcription, review state (unreviewed, reviewed), AI may read (yes/no), added by.
**Grid** is the photo-and-document gallery.

### Source page

Leads with the **original**: image viewer with zoom for scans and photos, an audio player for recordings, the document for PDFs. Beside it: the **citation** (repository, collection, page, image), the **transcription** (and translation), and **what this source says** — its Claims, each linked to a person, with *propose a claim from this line*. Then everyone and everything it is connected to (people shown or mentioned, places, events, Projects, Stories), its review/rights/privacy status (private, reviewed, AI may read), where it came from (import, upload, AI), and its history.

### Places collection and Place page

**Collection** filters: kind (country, county, parish, town, address, cemetery, church, building, ship), inside which place, time period, has people.
**Page:** the place's names over time and what it sat inside, a map, people and events there (by decade), Sources about it, historical context for each era with its own sources, Topics connected, and Stories set there.

### Projects collection and Project page

**Collection** filters: status (active, parked, done), subject person or line, place, who it is for (myself, a relative, a client), last worked.
**Page:** the Project's purpose in the person's words, its Questions with their state, and the Research, Sources, Lists and Stories gathered for it. *Send to my AI* creates a Queue item linked to the Project.

### Questions collection and Question page

**Collection** filters: status (open, being worked, answered, parked), Project, subject person, place, kind (identity, relationship, origin, date, location, other), who is working on it, last worked.
**Page:** the question in the person's words, its subjects, the current best answer and confidence, the AI's **Plan** with items and progress, the **research log** (searched, found, not found, by whom, when), linked Research, Proposed claims and Possible matches waiting for review, smaller Questions inside it, and the conclusion when answered. *Send to my AI* creates a Queue item linked to the Question.

### Topics collection and Topic page

**Collection** filters: kind (event, migration, religion, occupation, community, ship, institution), time period, place, has people.
**Page:** a sourced overview written by the AI or the person, a timeline, the places and people it touches, Stories that use it, and its own Research. Always labelled historical context.

### Stories collection and Story page

**Collection** filters: subject (person, family, place, topic), kind (biography, day in the life, migration, family narrative, anecdote, research summary), state (draft, in review, published), written by.
**Page:** reading view first; an editor beside it. Every version shows who wrote it and the request behind it. An optional evidence layer marks which lines rest on accepted claims, which on context, and which on family memory, each linking back. Review and publish follow the existing guarded path (living-person and privacy checks, explicit confirmation, unpublish).

### Possible matches and Imports

No main destination; reached from Home, People and the person page. **Possible matches** shows pairs side by side with the evidence for and against, with *same person*, *different people*, and *not sure yet*. **Imports** shows each FamilySearch capture, what was added or matched, warnings, and the review queue it created.

---

## Shared pages, expressed in Family History

Family History uses the Core Site Guide's shared pages. What changes here is the content and examples:

- **Public Home** — the promise in family-history words, a real example that connects a short answer to the records behind it (with a contradiction kept visible), FAQ, an early invitation to connect an AI, Ideas and Usage, and the family strip. Uses synthetic, clearly labelled example families only.
- **Signed-in Home** — the Queue composer first, then: what needs review (proposed claims, possible matches, unreviewed uploads), Questions recently worked, people recently changed, and a way back into whatever the person was last doing. For a new account, the friendly start: *add yourself or one ancestor and one relationship*.
- **Ideas and Usage** (`/ideas-and-usage`) — concrete ways to use it: *break a brick wall*, *turn a box of photos into an archive*, *prepare for a trip to the ancestral village*, *interview a grandparent*, *check a FamilySearch tree against the records*, *write a life sketch for a reunion*, *come back with a different AI*.
- **Queue** (`/queue`) and **Queue item** — composer first; the words alone are enough. "Add context" offers the three Family History groups the philosophy already defines: **who or where** (person, relationship, place, topic), **evidence** (source, claim, photo), and **work** (project, question, story, list). Uses the family lifecycle and order: **Waiting on AI · AI working · Needs your input · Answered · Everything**, with *Needs your input* as a flag.
- **AI Suggestions** — where the AI parks ideas the person did not ask for: *these two Johns may be one person*, *this 1880 census may show the family*, *nobody has looked for a burial record*. Accepting one creates a Queue item.
- **Lists** (`/lists`) — as above.
- **Library** (`/library`) — **Research · Sources · Instructions · Stories**. Public Instructions are the curated research prompts and loops the philosophy already approved (*make a research plan for an ancestor*, *compare evidence for a same-person hypothesis*, *research place and era context*, *draft interview questions for a relative*, *transcribe and translate a record*).
- **Your work** (`/work`) — the person's Notes, the AI's Research and Stories in one place, with *made by* always visible.
- **Connect your AI** (`/settings/ai`), **Preferences** (`/preferences`) and **For your AI** (`/ai`, `/ai.txt`) — three linked pages with different jobs.
- **Your stats** (`/me`) — people, sources, files and storage, Questions answered, what each connected AI read and saved.
- **Updates** (`/updates`), **Search** (`/search` — names with spelling variants, places, sources, everything the person owns), **Support** (the Assist With Life desk), and account controls (`/settings/data` export and delete, `/delete-account`).
- **Admin** (`/admin`, owner and admins) — Overview, Accounts (roles, Pro), AI activity (clients, tools, errors), Storage (bytes by account, files awaiting processing), and Public content (public Instructions, published stories). Admin sees counts and metadata, never the content of anyone's family records.

### Pages and routes (target)

Family History's signed-in pages currently live under `/app/...`. The Core URL map puts collections at the top level (`/people/...`, `/queue`, `/me`). This guide targets the Core map; old `/app/...` addresses redirect permanently.

| Page | Target route | Today |
| --- | --- | --- |
| Public Home · Updates · For your AI | `/` · `/updates` · `/ai`, `/ai.txt` | Built |
| Ideas and Usage · FAQ | `/ideas-and-usage` · on `/` | FAQ built on Home; Ideas and Usage to build |
| Signed-in Home | `/home` | Partial (`/app`) |
| People · Person | `/people` · `/people/[id]` | Partial (`/app/people`) |
| Tree | `/tree` (`?root=`) | To build |
| Sources · Source | `/sources` · `/sources/[id]` | Partial (`/app/source-docs`, media on person pages) |
| Places · Place | `/places` · `/places/[id]` | Partial (`/app/places`) |
| Trees (switcher) | `/trees` | To build |
| Projects · Project | `/projects` · `/projects/[id]` | To build |
| Questions · Question | `/questions` · `/questions/[id]` | Partial (`/app/research`, `/app/operations`) |
| Topics · Topic | `/topics` · `/topics/[id]` | To build |
| Stories · Story | `/stories` · `/stories/[id]` | Partial (`/app/stories`, `/app/story-writer`; public `/stories`) |
| Timeline · Map | `/timeline` · `/map` | Timeline placeholder; Map to build |
| Possible matches · Imports | `/matches` · `/imports` | Partial (`/app/imports`, operations) |
| Lists · List | `/lists` · `/lists/[id]` | To build |
| Your work · Note · Research | `/work` · `/notes/[id]` · `/research/[id]` | To build |
| Library | `/library` | To build |
| Queue · Queue item · AI Suggestions | `/queue` · `/queue/[id]` · `/queue/suggestions` | Partial (`/app/queue`) |
| Preferences · Connect your AI | `/preferences` · `/settings/ai` | Connect built (`/app/settings/ai`); Preferences to build |
| Your stats · Search · Support | `/me` · `/search` · Life support desk | Support link built; others to build |
| Export and delete | `/settings/data` · `/delete-account` | To build |
| Admin | `/admin`, `/admin/accounts`, `/admin/ai`, `/admin/storage`, `/admin/content` | To build |

## Navigation

- **Tree switcher:** the active tree's name sits at the top of every signed-in page and opens the list of trees; switching is deliberate and the whole site changes with it.
- **Phone:** a bottom bar of **People · Sources · Queue (raised, centre) · Library · Menu**. Tree opens from People and from every Person page. Menu holds Home, Tree, Places, Projects, Questions, Topics, Stories, Lists, Your work, AI Suggestions, Ideas and Usage, Your stats, Preferences, Updates and sign-out. A quick *add a memory or photo* button is reachable from most pages.
- **Larger screens:** top or side navigation (the person chooses; AWF-0051) with **Home · People · Tree · Sources · Places · Projects · Stories · Lists · Library · Queue**, Questions one level down under Projects, Topics one level down under Places, and AI Suggestions as a small dot beside Queue. Search and quick Queue entry are always within reach.
- **Profile menu:** Core's sections — **Learn** (Ideas and Usage, Connect your AI, For your AI, What's new), **You** (account, Preferences, Your stats, Export and delete), appearance (theme, navigation), **Admin** for the owner, sign-out.

---

## Tools for the person's AI

The site's `/mcp` server is how a connected AI reads and saves. The [family MCP and OAuth standard](#documents-that-help-build-family-history) owns the connection rules; this section maps the tools to Family History's blocks. Tool names start `family_history_`. Tools return record identifiers and links so the AI can continue an existing record, tolerate a repeated request without duplicating, and attribute everything to the AI that did it.

What the AI should be able to do, by job (current coverage in [Where Family History stands](#where-family-history-stands-6-october-2026)):

1. **Get oriented** — the active tree and the list of trees, then that tree's overview: counts, the home person, recent work, open Questions, what is waiting for review, the person's Preferences, and the Library catalogue.
2. **Find** — people (with name variants and lifespan), sources, places, projects, questions, topics, stories, lists, using the same filter families as the pages.
3. **Read** — one record with its connected context in manageable amounts: a person with claims, relationships, events and sources; a source with its file, transcription and claims; a question with its plan and log.
4. **Look at the evidence** — receive the actual image, scan or audio the person has allowed AI to read, not only its title.
5. **Save** — new people, relationships, events, places, sources (with files), connections and photo tags as suggestions, proposed claims, possible matches, research reports, projects, plans and log entries, topics, stories and story versions, notes the person dictates, lists — in batches with per-item results.
6. **Work the Queue** — pick up, report progress, ask the person a question, answer, and add attributed follow-ups; park unsolicited ideas in AI Suggestions.
7. **Switch trees** — only when the person asks or names a tree; every save lands in the active tree.
8. **Never** — accept its own proposals, merge people, publish, share, delete, or act as the person on FamilySearch. Those stay the person's.

**Connecting.** Signing in and clicking Allow is the approval, as on every Assist site; Settings only narrows. The limits above can never be granted to an AI, and records about living people and private memories stay unreadable to the AI until the person has reviewed them (Scott, 6 October 2026).

---

## Media in Family History

Family history is media-heavy: scanned records, old photographs, certificates, letters, headstones, recorded interviews, sometimes film. The family [media storage standard](#documents-that-help-build-family-history) owns how bytes are stored (Backblaze B2, private by default, exact versions, display sizes made at upload, the person's AI can read the photos). In Family History:

- **Every file belongs to a Source**, stored once and connected to every person, place, event, Project and Story it matters to. A portrait is a crop chosen from a Source image. Uploading a photo with no context creates a Source of kind *photograph* that can be described later.
- **One upload path for everyone.** The person's uploads and the AI's uploads use the same private B2 path, with the same display sizes and the same deletion.
- **Private, unreviewed and AI-not-allowed until the person says otherwise** is today's live behaviour for evidence uploads. This guide recommends keeping *private* as the default but letting the person's own Preferences decide whether newly uploaded files are readable by their AI immediately — still an open recommendation.
- **Originals are never altered.** Display sizes, crops for portraits, enhanced copies, transcripts and translations are derived files linked to the original.
- **Phone first for capture:** a photo of a headstone or a page in a relative's album, straight from the camera, any size, including iPhone HEIC; location data handled under the standard's privacy rules.
- **Audio and video** matter here more than on most sites (oral history). They are part of the standard's later classes and need a transcript as a derived file.

---

## Look and feel

The Project Philosophy's [design character](assist-with-family-history-project-philosophy.md#distinctive-design-and-interaction-character) stands: a serious, generous research folio — parchment surfaces, map and compass cues, margin notes, source marks, restrained teal and rust, and a visible thread from clue to evidence to story. Dense where comparison needs it, calm everywhere else; first-class light and dark; one-handed at 320px. Family History has no Claude Design prototype yet (AWF-0051 notes it was absent from the design project in September); the September 5 family brand assets are installed.

---

<a id="decisions-scott-needs-to-make"></a>

## Decisions

Dated decisions Scott has made that builders must follow. The questions, their options and the recommendations behind them are in [`site-guide-content.json`](site-guide-content.json).

| Date | Decision |
| --- | --- |
| 6 Oct 2026 | This Site Guide is canonical. The Project Philosophy is kept as the reference for trust boundaries, language rules and capability-evidence history. |
| 6 Oct 2026 | **Projects and Questions.** A Project gathers a piece of research work and holds Questions; Questions remain the specific research unit and can nest. |
| 6 Oct 2026 | **Claims**, not Facts, in the interface and the AI tools. A Claim is one source-backed statement with the states Proposed, Accepted, Disputed and Rejected. |
| 6 Oct 2026 | **Several trees.** Each tree is a separate workspace the person switches into, like a profile. Resources, Preferences, Instructions, the AI connection and the Queue carry across trees. The AI works in the active tree and never mixes trees. See [Trees](#trees-separate-workspaces). |
| 6 Oct 2026 | **Photos live inside Sources**, stored once, and are connectable to every person, place, event, Project and Story they matter to, with face tags and portrait crops. |
| 6 Oct 2026 | **Family memories:** what the person remembers is a Note; a memory recorded from a relative is a Source of kind *family memory* that can support Claims labelled as family lore. The Person page's "Memories" tab becomes "Sources & media". |
| 6 Oct 2026 | **Topics** are a main block for reusable historical context, always labelled as context. |
| 6 Oct 2026 | **Connecting an AI:** signing in and clicking Allow is the approval; Settings only narrows. No AI can publish, delete, merge people or share, and living-person and private-memory records stay unreadable to the AI until reviewed. This supersedes the "keep a second approval" recommendation in [sibling lessons](sibling-lessons-2026-10-06.md). |
| 6 Oct 2026 | **No new sharing in the first builds.** Guarded public-story publishing stays; Unlisted links and Trusted collaborators (AWF-0014/0015) come after the core blocks are in use, and will share one tree, never a whole account. |

---

## Where Family History stands (6 October 2026)

This is a dated snapshot, not a live ledger. The tracker owns current work; the production site and dated receipts establish what works. Live version on assistwithfamilyhistory.com: **2.2.0** (17 August 2026). Since then the private evidence-media pipeline, the Backblaze storage proof and MCP hardening shipped (last on 3 September) without a new public release entry. Scott plans to start entering real family data next, which is why settling the building blocks now is cheap: changing the model before data exists is an edit, afterwards it is a migration.

Three read-only audits were run on 6 October against the family standards as they stood that day: Core Site Guide proposal (24 Sep), Core Philosophy 1.14.x, MCP/OAuth standard 1.3.0 and media standard 1.8.0. Family History's own records still cite Core **1.6.3** (`tracker.json`) and media standard **1.4** (AWF-WO-012), so every family ruling since mid-August postdates its plans.

### Bring Your AI (MCP and OAuth): strong engineering, not yet finished

**What is solid and live:** a stateless `/mcp` on the 2026-07-28 protocol using the official SDK; 16 `family_history_` tools plus 12 older aliases from one catalogue; the connection is re-checked on every request, so revoking takes effect immediately; replay protection, batch saves and an all-or-nothing save; protected evidence reads that never hand out a storage link; a checksum-bound private image upload; Clerk OAuth with dynamic client registration; `/ai` and `/ai.txt` generated from the catalogue and checked for drift; a connection centre at `/app/settings/ai` to see, narrow and revoke.

**What remains:**

1. **Signing in is not yet the approval.** First contact creates a *pending* connection with no permissions, the AI sees an empty tool list, and every call returns `GRANT_REQUIRED` until the person ticks permissions in Settings. The family ruled on 1 September that **Allow completes setup**. This is decision 8 above.
2. **No real AI client has ever connected.** The only live proofs are a disposable test client on 12–13 August. Claude, ChatGPT and Codex have never been run against production (AWF-0043).
3. **Standard 1.3.0 conformance gaps (small):** `www.` machine paths redirect to the apex instead of answering directly; `offline_access` is not advertised and token renewal is untested; an identity-provider outage returns 401 (should be 503); the tools capability is not declared when the list is empty; `/llms.txt` is hand-written, names old tool aliases and is out of date; `/ai` lacks per-client steps and a "did it work?" check; no output schemas (AWF-WO-014).
4. **Tool gaps against this guide's blocks:** search needs typed text (no browsing by surname, place, dates, living/deceased) and has no paging; one record per read; no tools for places, historical context, the research log or possible matches; the AI cannot add a Queue item for the person or file its own follow-ups; no AI Suggestions; no Library; uploads accept only JPEG, PNG and WebP and cannot be attached to a specific source.

### Media: the AI's upload path is excellent; everything around it is unfinished

**What is solid and live:** two encrypted, versioned Backblaze B2 buckets with bucket-scoped keys (proved with zero residue on 3 September); a same-origin upload relay; byte-exact originals plus three metadata-free display sizes (192, 1200, 2400) made at upload; capture time and GPS kept as proposals the person reviews; short-lived private delivery.

**What remains:**

1. **The person's own uploads do not use that path.** Uploads from the Person page's Memories tab still go to legacy Convex storage with no display sizes, served raw with location data intact, and anything over 2 MiB is refused to the AI.
2. **Ordinary phone photos and scans probably fail.** Both upload routes pass the file through a Vercel function, which caps requests at about 4.5 MB, while the site advertises 25 MB. Not yet observed live; it is the first thing to check.
3. **No deletion at all.** No way to delete a file, every version and its display sizes. Replacing a file on a B2 record leaves the old copy being served.
4. **iPhone HEIC and TIFF scans** are stored raw; the AI path refuses them.
5. **The AI cannot always see the photo:** only the 1200 px copy, no region crops or contact sheets for large sets, and plain `INTERNAL_ERROR` instead of the standard's error names.
6. **No storage counting, no upload recovery** for a large batch, no camera capture or paste/drop, no PDF viewer or audio player (PDFs and audio show as broken images), no portraits, and no scans on source pages. The Memories tab is the only place media appears.

### Pages and features

| Area | State |
| --- | --- |
| Public Home, FAQ on Home, Updates, For your AI, Privacy | Built. Home lacks the family promise line, the person/AI/site explanation and Ideas and Usage link; `/features` and `/roadmap` still show "Coming soon", which the family ruled out on 20 August. |
| People, Person page, Places, Imports | Built and working with real data; the Person page is the most mature page on the site. |
| Queue | Built at `/app/queue` but with the retired four-state vocabulary, no archive, and no item page. |
| Stories (Story Writer, Story Studio, public story) | Built, including the guarded publish path. |
| Research Log, Research Queue (operations), Vault Audit | Built as earlier genealogy tools; overlap with the Queue and with the proposed Questions. |
| Connect your AI | Built at `/app/settings/ai`. |
| Sources, Source page, Relationships, Events, Tree, Map | Not built as pages; data exists inside Person pages. Timeline is a placeholder. |
| Questions, Topics, Notes/Research split, Lists, Library, Preferences, AI Suggestions, Ideas and Usage | Not built. |
| Your stats, Admin, Export and delete, Support source key, family strip, phone bottom bar, top/side navigation, dark mode, Table/Grid/List views | Not built (cards AWF-0010, 0016–0021, 0051). |
| Leftovers to retire | `/app/settings` (old OpenRouter key), `/api/process`, `/app/source-docs/*` and their aliases, `/features/source-docs`, the API-key "API Center" (`/app/api`), the guest vault, `/roadmap`. |

The work to close these gaps is proposed as Work Orders AWF-WO-015 to AWF-WO-019 in the [tracker](../tracker/GUIDE.md).

---

## Documents that help build Family History

| Document | Use it for |
| --- | --- |
| [Project Philosophy](assist-with-family-history-project-philosophy.md) | Trust boundaries, language rules, capability evidence history |
| Core Site Guide — `assistwithlife`, branch `codex/core-short-philosophy-proposal`, `planning/assist-with-sites-core-philosophy-short-proposal.md` | The shared pages every Assist site builds and the navigation pattern |
| Full Core Philosophy — `assistwithlife/planning/assist-with-sites-core-philosophy.md` | Detailed family standards, URL map, Queue law, launch and tracker rules |
| Bring Your AI MCP and OAuth standard — `assistwithlife/planning/bring-your-ai-mcp-oauth-standard.md`, with `mcp-site-guidance.md` and `mcp-connector-playbook.md` | Connection, grants, tool design, real-client proof |
| Media storage standard — `assistwithlife/planning/assist-media-storage-standard.md`, with `media-storage-lessons-2026-09.md` | B2 storage, uploads, display sizes, AI reading photos, deletion |
| Sibling guides — `assistwithscriptures/planning/site-guide.md`, `assistwithlanguages/docs/site-guide.html` | Worked examples of this document's shape |
| [Tracker](../tracker/GUIDE.md) | Approved work, Cards and Work Orders |

## Changelog

- **Edition 2 · 6 October 2026** — Scott ruled on all nine building-block decisions and the guide became canonical. Added Projects (holding Questions), several trees as separate workspaces, Claims in place of Facts, photos connectable from inside Sources, family-memory Sources, Topics, sign-in as the AI approval, and no new sharing in the first builds. Decisions now follow the Scriptures shape: a dated table here, with the questions and options in `site-guide-content.json`.
- **Draft edition 1 · 6 October 2026** — First Site Guide, written from the Project Philosophy 1.10.0, the Core Site Guide proposal (24 September), Core Philosophy 1.14.x, MCP/OAuth standard 1.3.0, media standard 1.8.0, the Scriptures (edition 9) and Languages (v1.1) guides, the current schema and routes, and 6 October audits of MCP, media and pages. Proposes the building-block model and nine decisions for Scott, and Work Orders AWF-WO-015 to AWF-WO-019.
