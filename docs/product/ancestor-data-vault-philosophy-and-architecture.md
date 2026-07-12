# Ancestor Data Vault Philosophy And Architecture

Last updated: 2026-06-28

Status: draft product architecture. This document is a research-backed direction note, not an approved schema migration.

## Philosophy

Discover Their Stories should be built around one core idea:

> Preserve the originals, extract the meaningful bits, keep uncertainty visible, and use every reviewed piece of data to drive the next research step and the eventual story.

AI is strongest when it has rich, well-labeled context. The product should therefore gather more than names, dates, and parent-child links. It should preserve the records, memories, places, communities, institutions, writings, images, and research notes that explain what happened to a person and what happened around that person.

The app should support a research loop:

1. Gather records and artifacts.
2. Preserve the original material losslessly.
3. Extract candidate facts, claims, mentions, relationships, places, dates, and context.
4. Analyze source quality, conflicts, gaps, and possible next records.
5. Promote reviewed claims into canonical person/place/event data.
6. Display current understanding while keeping uncertainty visible.
7. Use gaps and clues to drive the next search.
8. Write stories only after enough evidence and context exists.

This means the vault is not just a family tree. It is a private research operating system for a family historian and their AI agents.

## Why Existing Genealogy Models Are Not Enough By Themselves

The existing repo correctly uses GEDCOM X ideas: people, relationships, events, places, sources, citations, evidence, and conclusions. That is a strong foundation. But this product wants to go farther:

- Store full originals, not only extracted facts.
- Capture unstructured material such as journals, letters, stories, memories, maps, neighborhood notes, church histories, and local context.
- Track people who appear in records before we know whether they are ancestors.
- Track churches, schools, employers, cemeteries, ships, military units, neighbors, witnesses, informants, and repositories.
- Record AI analysis runs as provenance-bearing research work, not magic transformations.
- Keep private/unreviewed material visible to the owner but out of AI/public surfaces until reviewed.

The right model is layered. Do not push every extracted clue directly into `persons.birth`, `relationships`, or `events`. Store raw material first, extract candidate claims second, promote conclusions third.

## Research Scan

### GEDCOM 7

GEDCOM 7 is still the most important exchange format to support. It covers individuals, families, events, sources, notes, repositories, multimedia, and GEDZip packaging. It is useful for import/export portability and as a sanity check for common genealogy expectations.

Limit for this product: GEDCOM is exchange-oriented and lineage/tree-oriented. It is not enough for original artifact preservation, AI extraction provenance, ambiguous mentions, rich place/community context, or source-by-source analysis workflows.

Use it for:

- future GEDCOM import/export;
- compatibility vocabulary for people, families, events, notes, sources, repositories, multimedia;
- not as the internal database ceiling.

### GEDCOM X And FamilySearch

GEDCOM X is closer to this product's needs because it models genealogical data as persons, relationships, sources, records, conclusions, source references, evidence references, media, agents, events, and places. FamilySearch's developer docs also state that its API is built on GEDCOM X.

Use it as the main conceptual backbone:

- subject/person/relationship/event/place/source concepts;
- original and normalized values;
- source descriptions and source references;
- conclusion versus evidence separation;
- media/document bundling;
- extensibility.

### Gramps And Gramps Web

Gramps is a mature genealogy application with first-class people, families, events, places, sources, citations, repositories, media, notes, and tasks. Gramps Web exposes similar record types and has database-layer privacy filtering.

Use it as a product-pattern reference:

- rich CRUD for many record types, not only people;
- event-centric views;
- notes/media/repositories as first-class records;
- task lists and research organization;
- privacy levels that affect views and exports.

Do not copy Gramps directly. The product's differentiator is AI-first intake, review, context synthesis, and story generation.

### Genealogical Proof Standard And Evidence Analysis

Professional genealogy emphasizes:

- reasonably exhaustive research;
- complete source citations;
- analysis and correlation;
- conflict resolution;
- written conclusions.

Evidence analysis also distinguishes:

- source type: original, derivative, authored;
- information type: primary, secondary, undetermined;
- evidence role: direct, indirect, negative;
- proof/conclusion: the reasoned answer after correlation.

Use this as the review model. The database should not just say "birth date: 1843." It should be able to say:

- which source carried the claim;
- whether the source was original or derivative;
- who likely supplied the information;
- whether the claim directly answers the research question;
- which other claims conflict or corroborate it;
- what conclusion was accepted and why.

### Archival And Preservation Models

PREMIS models preservation metadata around Objects, Events, Rights, and Agents. W3C PROV models provenance around Entities, Activities, and Agents. Both are useful because AI extraction is an activity that uses original entities and generates derived entities.

Use these ideas for:

- raw artifact identity, checksum/hash, file type, storage key, and source URL;
- preservation events such as captured, uploaded, OCRed, transcribed, extracted, redacted, reviewed;
- agents such as user, browser extension, provider, AI model, import script;
- rights and privacy state.

### Cultural Heritage And Archival Graphs

CIDOC CRM and Records in Contexts both handle cultural/archival data as networks of people, places, activities, records, events, and organizations. They are useful for the user's goal of knowing the family, city, country, neighborhood, church, and people around an ancestor.

Use these ideas for the context graph:

- organizations: churches, schools, regiments, employers, societies, courts, repositories;
- built places: homes, farms, churches, cemeteries, workplaces, ships, institutions;
- social relations: witness, informant, neighbor, employer, minister, sponsor, executor, guardian;
- activities: migration, military service, land transfer, probate, religious participation, schooling;
- records as things created by people/institutions in a historical context.

### IIIF, TEI, And Dublin Core

IIIF is useful for multi-page images, annotations, canvases, and deep links into a digitized object. TEI is useful for structured transcription of letters, diaries, names, dates, places, and organizations. Dublin Core is useful as a simple metadata vocabulary for titles, creators, dates, descriptions, formats, rights, sources, coverage, and relations.

Use these as optional inspiration, not required internal standards:

- page/image manifests and annotations;
- transcription segments that point to text regions;
- title/creator/date/rights/coverage metadata;
- later export or interop with libraries/archives.

### Wikidata / Knowledge Graph Statements

Wikidata's statement pattern is valuable: subject + property + value, with qualifiers, references, and ranks. Genealogy needs the same shape for claims:

- subject: person, place, event, relationship, organization, artifact, story;
- property: birth date, residence, occupation, religion, witness role, address, migration route;
- value: literal, date, place, entity link, text span;
- qualifiers: date range, role, source line, confidence, scope;
- references: citations and original artifacts;
- rank/status: candidate, accepted, preferred, deprecated, rejected, conflict.

This maps well to `sourceFacts`, but `sourceFacts` is currently too person/fact-type-specific for the full vision.

### Record-Type Research

FamilySearch, NARA, and common genealogy practice point to a wide record universe:

- vital and civil registration records;
- census and population schedules;
- church/parish records;
- cemetery and burial records;
- immigration, emigration, naturalization, passport, and passenger records;
- military, draft, pension, and service records;
- land, property, tax, court, probate, and guardianship records;
- newspapers, obituaries, directories, local histories, gazetteers, maps;
- schools, hospitals, poorhouses, workhouses, prisons, employment, unions, fraternal groups;
- diaries, letters, journals, family bibles, oral histories, photos, audio, video, and private family notes.

The storage model must expect this variety from the beginning.

## Proposed Layered Model

### Layer 1: Original Artifacts

Purpose: store exactly what came in.

Examples:

- FamilySearch capture package;
- source page image;
- PDF;
- photo;
- newspaper clipping;
- scanned letter;
- diary page;
- audio interview;
- GEDCOM file;
- user note export;
- AI/agent-gathered JSON bundle.

Potential future table or generalized model: `artifacts` / `originalRecords`.

Important fields:

- `vaultOwnerId`
- `artifactType`
- `provider`
- `sourceUrl`
- `repository`
- `collectionTitle`
- `storageKey` / `url` / `filePath`
- `checksum`
- `mimeType`
- `sizeBytes`
- `capturedAt`
- `capturedBy`
- `rightsStatus`
- `privacyLevel`
- `reviewStatus`
- `aiUseAllowed`
- `rawMetadata`

Rule: originals are never summarized away. Even if the AI extraction is wrong, the original remains available for reprocessing.

### Layer 2: Source Descriptions And Citations

Purpose: describe what the artifact/source is and how to cite it.

Current tables:

- `sources`
- `citations`
- `citationLinks`
- `documents`
- `media`

Recommended direction:

- add repositories as a first-class concept eventually;
- let citations point to exact page/line/region/text-span when possible;
- keep source citation text separate from extracted claim text;
- preserve citation style fields, not just a freeform citation string;
- support source classification: original, derivative, authored;
- support information classification per extracted claim: primary, secondary, undetermined.

### Layer 3: Extracted Mentions

Purpose: store what the record appears to mention before identity resolution.

Examples:

- "John Jarvie, age 42, miner, born Scotland"
- "Mrs. Mary Smith, informant"
- "St. Paul's Parish"
- "neighbor: William Brown"
- "witness: Sarah Jones"
- "ship: SS Nevada"
- "employer: Utah Copper Company"

Potential future table: `recordMentions`.

Important fields:

- `artifactId`
- `sourceId`
- `citationId`
- `mentionType`: person, place, organization, event, role, occupation, address, relationship, object
- `rawText`
- `normalizedText`
- `textSpan`
- `candidateEntityId`
- `identityConfidence`
- `resolutionStatus`: unresolved, matched, new_entity_candidate, rejected, ambiguous

Rule: do not force every mentioned person into `persons`. Many are neighbors, informants, witnesses, ministers, employers, clerks, or possible relatives. They still matter.

### Layer 4: Candidate Claims

Purpose: store each extracted assertion as reviewable data.

Current table:

- `sourceFacts`

Recommended direction:

- evolve `sourceFacts` or add a more general `claims` table;
- support all target types, not only person facts;
- support richer claim types and values;
- support qualifiers, references, confidence, conflict/corroboration, and review status.

Potential claim shape:

```ts
{
  subjectType: "person" | "relationship" | "event" | "place" | "organization" | "artifact";
  subjectId?: string;
  predicate: string;
  value: unknown;
  valueText: string;
  qualifiers: Array<{ key: string; value: string }>;
  sourceId: Id<"sources">;
  citationId: Id<"citations">;
  artifactId?: string;
  sourceClass?: "original" | "derivative" | "authored" | "unknown";
  informationClass?: "primary" | "secondary" | "undetermined";
  evidenceClass?: "direct" | "indirect" | "negative" | "contextual";
  confidence: "high" | "medium" | "low";
  status: "candidate" | "accepted" | "preferred" | "conflict" | "rejected";
}
```

Rule: AI may create claims, but humans or trusted gates promote conclusions.

### Layer 5: Canonical Conclusions

Purpose: store the current best operating view.

Current tables:

- `persons`
- `relationships`
- `events`
- `places`
- `personEvents`

These should stay relatively clean. Canonical rows answer: "What do we currently believe is true enough to display as the main profile?" They should not store every conflicting fact. Conflicting facts stay in candidate claims and analysis.

Rule: canonical fields should always be traceable back to accepted claims/citations.

### Layer 6: Context Graph

Purpose: explain the world around the ancestor.

Current tables:

- `contextItems`
- `historicalContext`
- `places`
- `researchLog`

Recommended direction:

- keep `historicalContext` for reusable place/era packs;
- keep `contextItems` for private or person-specific loose material;
- add or emulate context entities when needed:
  - organizations;
  - buildings/institutions;
  - cemeteries;
  - neighborhoods;
  - churches/parishes/congregations;
  - occupations;
  - military units;
  - ships/routes;
  - schools;
  - employers;
  - social cluster people.

Rule: context can enrich a story, but it is not automatically evidence that a person experienced a thing. The story should distinguish "source says" from "local context suggests."

### Layer 7: Research Operations And AI Runs

Purpose: manage the loop.

Current tables:

- `researchTasks`
- `researchChecks`
- `researchLog`
- `importRuns`
- `agentActivity`

Recommended direction:

- add `analysisRuns` or `agentRuns` for AI extraction/research jobs;
- store prompt/model/input IDs/output IDs;
- record derived claims and tasks from each run;
- show "why the AI thinks this is next" through evidence gaps;
- keep failed searches and negative evidence.

Negative evidence is important. If a researcher searched the expected 1880 census district and did not find the person, that failed search can be meaningful.

## Data We Should Be Ready To Store

### Person-Centered Data

- names and variants;
- sex/gender where sources support it;
- birth, death, burial, baptism/christening;
- residences and addresses;
- occupations, employers, workplaces;
- education, literacy, language;
- religion, parish/church membership, rites;
- military service;
- immigration/naturalization/passports;
- property, land, tax, court, probate;
- health/medical only with high privacy caution;
- migration routes and travel;
- social roles: witness, informant, sponsor, godparent, executor, guardian, neighbor, employer, minister.

### Family And Social Network Data

- parent/child/spouse relationships;
- adoption, step, foster, guardianship;
- household composition by record;
- FAN club: friends, associates, neighbors;
- witnesses and informants;
- people repeatedly appearing near the ancestor;
- possible but unproven relatives.

### Place And Community Data

- country/region/county/city/town/village/parish/address;
- boundary and name changes over time;
- churches, schools, cemeteries, hospitals, poorhouses, prisons, workplaces;
- economic systems, industries, migration corridors;
- disasters, wars, epidemics, local events;
- maps, gazetteers, directories, local histories.

### Source And Artifact Data

- source description;
- repository;
- collection;
- page/image/line/region;
- transcription;
- OCR text;
- translation;
- abstract;
- citation;
- rights and privacy;
- checksum and storage location;
- capture/import provenance.

### AI/Research Data

- extraction runs;
- prompts/models;
- confidence and uncertainty;
- candidate claims;
- rejected claims and why;
- conflicts;
- next-search suggestions;
- negative searches;
- story readiness.

## Product Workflow

### Intake

Inputs should land in a review-first intake queue. FamilySearch is the first provider, but the model should also accept GEDCOM, local uploads, newspaper clippings, FindAGrave, Ancestry exports, archive images, notes, and agent-collected bundles.

Every import should produce:

- original artifact references;
- source/citation candidates;
- extracted mentions;
- extracted claims;
- warnings and privacy flags;
- suggested review tasks.

### Analysis

AI should classify the material, extract claims, identify mentioned entities, compare claims to existing vault data, and propose next actions.

AI should not silently overwrite canonical facts.

### Review

The human or trusted operator reviews:

- identity matches;
- privacy;
- rights;
- source quality;
- claim confidence;
- conflicts;
- whether a claim becomes accepted/preferred/rejected.

### Display

The app can display partial understanding early:

- "Known from sources"
- "Candidate claims"
- "Conflicts"
- "People mentioned near this person"
- "Places to research"
- "Context available"
- "Research gaps"

This matters because the research loop should show progress before the final story exists.

### Story

Story Writer should receive only reviewed, AI-eligible context. It should know:

- which claims are source-backed;
- which claims are accepted conclusions;
- which context is general background;
- which details are uncertain;
- which sources should be cited;
- which private material must stay private.

## Implementation Direction

### Near Term

1. Document the layered model as the product doctrine.
2. Audit current schema against the layers.
3. Keep improving the provider-neutral intake envelope.
4. Preserve original artifacts through B2/Convex storage before widening imports.
5. Generalize `sourceFacts` thinking toward a broader claim model.
6. Expand `contextItems` write paths so links to people/places/events/sources are actually populated.
7. Add research task generation from gaps and extracted clues.

### Medium Term

1. Add a first-class artifact/source-document model.
2. Add record mentions before canonical identity resolution.
3. Add generalized claims with qualifiers/references/status.
4. Add organization/institution/building/cemetery context entities or a flexible context-entity table.
5. Add AI analysis run provenance.
6. Add review queue UX for claim promotion.
7. Add story-source provenance views.

### Later

1. GEDCOM 7 import/export.
2. TEI-like transcript markup for diaries/letters.
3. IIIF-compatible page/image annotation export.
4. Public/private family collaboration.
5. Maps, network graphs, timelines, and place/community dashboards.

## Design Rules

1. Preserve originals first.
2. Extract, do not overwrite.
3. Store mentions before identity resolution.
4. Treat source claims as candidates until reviewed.
5. Keep canonical data clean and traceable.
6. Model context around the person, not only the person.
7. Keep AI output provenance-bearing and reviewable.
8. Store negative searches and failed hypotheses.
9. Privacy defaults to private, unreviewed, and not AI-eligible.
10. Public and AI surfaces must be stricter than owner-visible research surfaces.

## Open Questions

- Should `sourceFacts` evolve into a generalized `claims` table or remain person-focused while a separate `claims` table handles broader graph claims?
- Should organizations/buildings/cemeteries/churches be separate tables, or should the first version use a flexible `contextEntities` table?
- Should original artifacts live in Convex storage, B2, or a hybrid abstraction with storage provider metadata?
- What is the first best UX: "Add source/document", "Add research item", or "Drop anything into intake"?
- How much review can be trusted to AI agents before a human confirms promotion?
- How should we present social-cluster people without confusing them with ancestors?

## Sources Consulted

- GEDCOM official specification: https://gedcom.io/specifications/FamilySearchGEDCOMv7.html
- GEDCOM X overview and specifications: https://gedcomx.org/ and https://gedcomx.org/Specifications.html
- FamilySearch GEDCOM X developer notes: https://developers.familysearch.org/main/docs/gedcom-x
- Gramps manual and record-type model: https://gramps-project.org/wiki/index.php/Gramps_6.0_Wiki_Manual
- Gramps Web features: https://www.grampsweb.org/features/
- Board for Certification of Genealogists standards page: https://bcgcertification.org/ethics-standards
- FamilySearch Genealogical Proof Standard wiki: https://www.familysearch.org/en/wiki/Genealogical_Proof_Standard
- Evidence Explained discussion of source/evidence reasoning: https://www.evidenceexplained.com/
- W3C PROV overview: https://www.w3.org/TR/prov-overview/
- PREMIS Data Dictionary: https://www.loc.gov/standards/premis/v3/
- IIIF Presentation API: https://iiif.io/api/presentation/3.0/
- Wikidata statements model: https://www.wikidata.org/wiki/Help:Statements
- CIDOC CRM: https://cidoc-crm.org/
- Records in Contexts: https://www.ica.org/ica-network/expert-groups/egad/records-in-contexts-ric/
- Dublin Core metadata terms: https://www.dublincore.org/documents/dcmi-terms/
- TEI names, dates, people, and places: https://tei-c.org/release/doc/tei-p5-doc/en/html/ND.html
- FamilySearch record finder: https://www.familysearch.org/en/wiki/United_States_Record_Finder
- FamilySearch online record types by location: https://www.familysearch.org/en/wiki/Online_Genealogy_Records_by_Location
- National Archives genealogy resources: https://www.archives.gov/research/genealogy
