# AI Family History Lab

Discover Their Stories is an experiment in what modern AI can make possible for family history, genealogy, and connection to ancestors.

The product is not only a genealogy database, and it is not only a story writer. It is a lab for gathering ancestor context, trying many tools, learning which workflows matter, and turning the useful pieces into grounded stories and shareable family-history experiences.

## Core Question

What can we do now, with AI and modern software, that family historians could not realistically do before?

That question should stay alive in product planning. The site should be willing to try tools, expose beta experiments carefully, hide unfinished work when needed, and keep the pieces that help users understand and tell better stories.

## Primary Outcome

The primary outcome is story.

Stories may be written narratives, public ancestor pages, family books, timelines, maps, audio scripts, exhibits, or other shareable outputs. The format can vary, but the goal is consistent: help users understand ancestors as real people and share that understanding with family.

## Context Is King

AI output is only as strong as the context it receives. The product should help users collect and organize as much useful, trustworthy context as possible:

- Core person facts: names, dates, places, relationships, parents, children, siblings, spouses, and life events.
- Source evidence: census records, birth certificates, marriage records, cemetery records, obituaries, church records, military records, immigration records, newspapers, and other trusted sources.
- User material: notes, journals, documentation, family memories, research snippets, oral-history notes, uploaded documents, and local artifacts.
- Place context: countries, regions, towns, neighborhoods, buildings, cemeteries, churches, workplaces, and migration routes.
- Time context: years, eras, wars, economic conditions, religious movements, local events, occupations, customs, and daily life.
- Research context: open questions, weak claims, conflicts, confidence levels, next actions, and provenance.

The vault exists to preserve this context. The operations layer exists to identify what context is missing. The AI layer exists to reason over that context. Story Studio exists to turn it into something meaningful.

## Display And Discovery

The product should support normal genealogy displays because they help users inspect and trust the data:

- Pedigree and family relationship views.
- Tables and database-style lists.
- Person, place, source, and event workspaces.
- Statistics by family line, location, time period, source type, or research status.
- Maps, pins, heatmaps, migration paths, birth/death/burial/marriage distributions, and place clusters.

These views are not just reporting. They can become stories themselves: where a family came from, where they moved, what places shaped them, and which gaps still matter.

## Experimental Tool Bias

The product should have a bias toward making promising ideas real enough to test.

Not every tool needs to become a polished permanent feature. Some tools can live behind an experimental surface with clear maturity labels, privacy warnings, and no promise that the workflow is final. This is especially useful while the user base is small and the product is still discovering what helps.

Good experiment candidates include:

- Photo analysis and photo dating.
- Timeline builder.
- Place and era research packs.
- Occupation, religion, migration, and building context builders.
- Map and statistics explorers.
- Document transcription and handwriting workflows.
- Research planners and prompt exports.
- Story collections, family books, exhibits, and audio scripts.
- Ancestor cards or visual summaries.
- Collaborative family review workflows.

## Guardrails

Experimentation should not weaken trust.

- Raw evidence, researcher conclusions, and AI synthesis must stay distinguishable.
- Living-person data and private family material require extra caution.
- AI calls should be disclosed, and redaction state should be visible when sensitive data is involved.
- Experimental features must not corrupt canonical vault data.
- Public publishing should be intentional and reversible.

## Repository Tracker Work Areas

Cards and Work Orders should use stable product areas instead of one giant
backlog or an external system that a future AI may not be able to read. The
current work-area family is:

- Product OS & Agent Workflow
- Intake & Source Capture
- Research Vault
- Context Intelligence
- Research Operations & Agent Handoff
- Story Studio & Publishing
- Experimental Tools Lab
- Privacy, Trust & Quality

Agents use those areas to understand which part of the product they are working
in and how features interact. The current priority and authorized next tranche
come from `docs/tracker/`, not from an area label by itself.
