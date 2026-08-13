# Product Map

Assist With Family History is an AI-assisted genealogy research and storytelling workspace. The product should help users gather operating data, reason about it, and turn it into shareable ancestor stories.

It should also operate as an AI family history lab: a place to try many tools and workflows while the product learns what helps users understand ancestors and tell better stories.

## Product Areas

### Research Vault

The vault is the source of truth for structured genealogy data.

- People and relationships
- Places and place context
- Events, dates, and timelines
- Sources, citations, memories, documents, and generated artifacts
- Import runs and provenance
- Research checks, tasks, notes, and log entries
- User-entered notes, journals, documents, family memories, uploaded artifacts, and loose research context

### Intake and Import

The intake layer brings data into the vault.

- FamilySearch extension capture
- Capture package import
- Console extractor fallback
- Future direct API integrations
- Future imports from Ancestry, FindMyPast, GEDCOM, local files, and user uploads

### Research Operations

Operations are the work-management layer for making the vault reliable enough to support stories.

- Missing record coverage
- Identity and merge review
- Provisional relatives
- Stale checks
- Suggested next actions
- AI-agent handoff context

### AI Research Assistant

AI should help with the work before story writing, not only the final prose.

- Summarize source evidence
- Identify conflicts and weak claims
- Suggest next records to seek
- Research place, era, religion, occupation, migration, and social context
- Generate tasks with traceable evidence

### Context Intelligence

Context Intelligence explains the world around the ancestor.

- Place, region, country, and town research
- Era and year-specific context
- Occupations, religions, buildings, cemeteries, migration paths, and local institutions
- Maps, heatmaps, location clusters, and genealogy statistics
- Context packs that can be attached to people, places, events, and stories

### Story Studio

The main product goal is to preserve and share ancestor stories.

- Short ancestor stories
- Longer narrative drafts
- Shareable ancestor pages
- Books, family collections, and print-ready outputs
- Audio or podcast-style scripts
- Story readiness checks based on evidence quality

### Side Tools

Side tools are valid when they improve the vault or make stories stronger.

- Timeline builder
- Photo analyzer
- Document transcriber
- Place context researcher
- Family group sheets
- Citation cleaner
- Research prompt/export tools

### Experimental Tools Lab

Experimental tools are allowed and expected. They should be easy to add, clearly labeled, and safe to try.

- Hidden or beta tools for early testing
- Maturity labels so users know what is stable
- Privacy warnings for sensitive workflows
- Promotion path from experiment to product feature

## Product Rule

Every feature should answer at least one of these questions:

1. Does it improve the operating data?
2. Does it help the researcher decide what to do next?
3. Does it make ancestor stories more accurate, vivid, or shareable?
4. Does it teach us whether a new AI genealogy workflow is worth keeping?

## Current Implementation Decision

`features/source-docs/` stays as a legacy compatibility module for now. It owns raw document generation, contextualized dossiers, redaction, and old source-document routes. New work should be named around the broader product surface, such as `features/research-vault/`, `features/story-studio/`, or `features/research-assistant/`, then source-doc internals can be migrated gradually.
