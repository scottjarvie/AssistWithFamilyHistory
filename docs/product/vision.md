# Discover Their Stories - Vision & Goals

*Last updated: 2026-05-20*

## The Big Picture

**Discover Their Stories** isn't just genealogy software. It's about transforming family history from a names-and-dates collection exercise into a deep, meaningful connection with ancestors as *real people*.

It is also an **AI family history lab**: an experimental product asking what modern AI can unlock for genealogy, ancestor context, research discovery, and story creation. Some ideas should become durable product surfaces. Others can stay in a clearly labeled experimental area while we learn whether they are useful.

### Product principles

> "Go beyond names and dates. Research deeply, tell stories, create content."

The canonical product-level doctrine is the
[Assist With Family History Project Philosophy](../planning/assist-with-family-history-project-philosophy.md).

The goal isn't just to find records or add names to a family tree. It's to:

- **Understand who your ancestors were** as people
- **Build high-quality operating data** about people, places, events, sources, relationships, memories, and research decisions
- **Amass useful context** from trusted sources, user notes, journals, documents, places, buildings, cemeteries, maps, and time-period research
- **Use AI as a research partner** to organize evidence, find gaps, and suggest next steps
- **Paint pictures of their lives** through context and storytelling
- **Connect emotionally** with your heritage
- **Share their stories** in compelling ways

See [Ancestor data vault philosophy and architecture](ancestor-data-vault-philosophy-and-architecture.md) for the working doctrine behind the vault: preserve originals first, extract reviewable claims and mentions second, promote clean conclusions only after review, and model the family, place, community, and historical context around each ancestor.

---

## What We're Building

A suite of AI-powered tools that help people:

### 1. Research Data Vault
- Store as much useful research data as possible about each person
- Connect people, places, events, sources, citations, documents, memories, and research tasks
- Preserve raw evidence while also building researcher conclusions
- Keep enough provenance that stories can be traced back to supporting evidence

### 2. Deep Research
- Understand historical context (not just individual records)
- Research the *places* ancestors lived — what was that town like? What industries existed?
- Research their *time periods* — what was happening in the world?
- Research their *religions* — what did they believe? How did they practice?
- Research their *occupations* — what did a cooper or a milliner actually do?
- Research the buildings, neighborhoods, cemeteries, migration paths, and local institutions that shaped daily life

### 3. Contextual Understanding
- What was life like for them day-to-day?
- What challenges did their generation face?
- What opportunities did they have (or lack)?
- What historical events shaped their lives?
- What larger place, era, family, migration, religious, occupational, or community patterns help explain their choices?

### 4. Storytelling & Content Creation
- **Stories** — Narrative accounts of ancestors' lives
- **Books** — Compilations of family histories
- **Podcasts** — Audio storytelling about ancestors
- **Timelines** — Visual representations of lives in context
- **Photo analysis** — Understanding and dating old photographs
- **Shareable ancestor pages** — Public or private story pages backed by researched evidence

### 5. AI-Assisted Discovery
- Use AI to synthesize information from multiple sources
- Identify patterns, conflicts, and research opportunities
- Generate narrative drafts from raw evidence
- Deep research assistance for historical context
- Support side tools that help with the operating work required before a good story can be written

### 6. Experimental Tooling
- Try small tools quickly when they might improve research or storytelling
- Keep unfinished experiments discoverable but clearly labeled as experimental
- Promote tools into the main product only after they prove useful
- Retire or hide experiments that do not help users understand ancestors or tell better stories

---

## Guiding Principles

### Privacy First
- Canonical structured genealogy data lives in the private vault backend
- Raw capture artifacts and exports remain on the user's computer
- User controls what (if anything) goes to AI services
- Sensitive information can be redacted before AI processing

### Respectful of Sources
- FamilySearch-compliant (no scraping, user-initiated only)
- Proper attribution and citation
- Distinguish between evidence and conclusions

### Accessible
- Tools should be usable by regular people, not just tech experts
- Clear explanations of what AI is doing
- Transparent about AI limitations

### LDS Context
- Many users will be members doing temple work
- That's valid, but it's not the *only* goal
- The deeper goal is connection and understanding
- Temple names can be a byproduct of deeper research

---

## Current State (Feb 2026)

The project has a foundation but is largely a **blank slate** for experimentation:

### Built So Far
- ✅ Next.js marketing site and app shell
- ✅ FamilySearch capture extension for sources and memories
- ✅ Capture package schema and compatibility mapping for structured FamilySearch intake
- ✅ Convex-backed Research Vault for people, places, sources, memories, documents, and import runs
- ✅ Context pack export and person/place workspaces
- ✅ Story Writer v1 draft workflow
- ✅ Settings page with API key management
- ✅ Raw artifact and export storage system

### Not Yet Built
- ⏳ Richer FamilySearch integrations beyond extension capture
- ⏳ Timeline Builder
- ⏳ Photo Analyzer
- ⏳ Research Planner
- ⏳ Podcast/audio features

---

## Tool Ideas to Explore

*These are experiments to try — not all will work or ship*

### Research Vault workflow (in progress)
Capture FamilySearch data → merge into person/place graph → generate documents, dossiers, and context packs

### Story Generator
Input: Evidence documents, family tree data
Output: Narrative stories suitable for sharing or publishing

### Historical Context Engine
Input: Place + Date
Output: Deep research on what life was like (economy, religion, politics, daily life)

### Photo Dating & Analysis
Input: Old photograph
Output: Estimated date range, clothing analysis, location clues, context

### Timeline Synthesizer
Input: Multiple sources for one person
Output: Visual timeline with historical events overlaid

### Podcast Script Generator
Input: Family stories or research
Output: Podcast-ready scripts with narrative structure

### Research Planner
Input: What you know about an ancestor
Output: Suggested research paths, record types to check, questions to answer

### "Day in the Life" Generator
Input: Ancestor's occupation, location, time period
Output: Vivid description of what a typical day might have looked like

---

## Technical Approach

### AI Integration
- **OpenRouter** for flexibility across models (Claude, GPT-4o, Gemini, etc.)
- User provides their own API key
- Redaction options for privacy

### Vault Architecture
- Convex stores canonical structured genealogy data
- Local filesystem keeps raw artifacts, exports, and caches
- Easy to backup and export

### Browser Extension
- Chrome Manifest V3
- Extracts data from FamilySearch with user consent
- Paced operations to respect FamilySearch

### Future Possibilities
- AI agents that can do multi-step research
- Integration with other genealogy sites (Ancestry, FindAGrave, etc.)
- Collaboration features for family groups
- Mobile app companion
- Maps, heatmaps, statistics, timelines, and other visual ways to discover family patterns
- Experimental feature surfaces for quick AI genealogy prototypes

---

## Success Metrics

Not vanity metrics — real impact:

- Do users feel more connected to their ancestors?
- Are they discovering things they didn't know?
- Are the stories compelling enough to share with family?
- Does the tool save time while improving depth?

---

## Notes & Ideas

*Space for ongoing thoughts*

- Consider integration with Hive blockchain for publishing stories
- AI News Daily workflow patterns might inform content generation here
- Voice narration for stories could be powerful (ElevenLabs TTS)
- Could generate "ancestor trading cards" with AI images
- Consider a dedicated experimental tools area where beta features can be tried without implying they are polished
- Maps and statistics can tell family stories too: where ancestors were born, died, buried, married, migrated, or clustered

---

*This document will evolve as we experiment and learn what works.*
