# Family History folio system

2026-11-05 · local council implementation, not a release receipt.

Structure follows Scott's Assist design playbook (4 November). Product nouns, privacy and capability truth follow this repo's Site Guide. The run ledger and page-by-page status live in `design-council/2026-11-05-family-folio/`.

## Roles

- Parchment background and pale paper cards; ink text, teal navigation/actions, rust annotations, evidence green. Never use a color alone to convey review or provenance.
- `.dark` defines the same semantic roles, including illustration colors and background washes. Hard-coded light surfaces remain migration work until each route's pass.
- Cormorant Garamond: editorial page headings. Instrument Sans: controls, labels, tray headings and body. IBM Plex Mono: small provenance labels and quantities. Keep body labels readable; do not reduce text to fit a dense layout.
- Base radius .5rem; hairline borders. Space with the existing 4px Tailwind scale. Compact controls retain 44px touch targets; mouse controls can be smaller when labelled and discoverable.
- `.folio-tray`: restrained paper surface with a folder edge. `.folio-tray-tab`: the tray label on its folder edge. Each tray carries one count and a named footer destination. Do not create decorative empty panels.
- `ArchiveIllustration`: Codex-written inline SVG, using currentColor, no network request. Decorative fallback for a missing image, never a claim that a portrait exists.

## Page families

Home leads with recently touched evidence; collection uses real saved views and a grouped table with full controls; record uses an identity dossier and one dated evidence stream; sticky counted tabs include an always-visible All menu and phone Contents list. Activity lanes exist only for actual entry kinds. Stats numbers expose their records; AI permissions retain clear revoke, scope narrowing, end dates and human-only authority. Reader pages keep source/provenance context beside the narrative. Queue lists and threads retain current state truth; do not silently change lifecycle semantics in a visual pass.

## Scope truth

This document records the target system and implemented primitives. It does not claim every page uses them yet. No data model, permission, provider, import or publishing behavior changes accompany this design tranche. New backend capabilities require their own implementation evidence.

## Structural tranche · 5 November

`FolioTray` is the shared Home primitive; populated Home uses seven evidence-first trays and keeps the complete workspace index. `CollectionWorkspace` is the reusable loaded-record presentation: Table/List/Grid, grouping, sort/direction, density, chosen columns, selection and saved views. Its phone table becomes labelled records rather than shrinking columns. Phone Group/Sort are single-level choice sheets; presentation lives in Options. Real filters remain with each route's search form.

Saved views/preferences live only in the current browser, with an account-specific key provided by the authenticated route; saving a view explicitly retains its search terms and facets. Record objects and selection IDs are never copied into preferences. Storage denial leaves controls usable for the session. The new kit makes no global-query or server-cursor claim.

The synthetic harness may identify which surface it renders for navigation highlighting. It is development-only, contains invented data and is reachable on a dev server's network interface; never copy real data into it.

### Required client boundary

Every collection's rows must be a minimal server-projected DTO containing only displayed fields. Never pass raw Convex documents, private notes, raw evidence, storage paths, provider metadata or unused relationship/research data to the client kit. People uses `projectPeopleCollectionRow` at the server boundary; the regression contract proves those fields cannot enter the collection payload. The client may arrange records; it does not need their unseen content.

### Expanded collection use

People, Places, Stories, writing candidates and research tasks share the kit. The default is a desktop Table and a phone List; explicit Table/List/Grid choices override it. Chosen fields wrap rather than clamp. Detail/actions stay outside recognition links. Numeric columns align right; image slots use handwritten SVG fallback, never inferred photos. New identity columns are versioned so older saved views keep information previously displayed in the identity.

Collections declare their own URL facet keys and built-in views. Named views save and restore those facets together, without changing unrelated URL controls. Research activity uses only recorded entry kinds and timestamps; filters affect the real log list, with date inputs alongside pointer range selection. Server-recorded author origin is separate from unverified model hints. Original route queries and limits stay authoritative.

### Identity links and compact facts

`rowHref` must open the record named by the row identity. Tasks without a real task-detail route keep static titles; their Person field links explicitly to that person. List facts put numeric labels after counts, text bare, and ambiguous dates behind a short prefix such as Updated or Imported. Full field labels remain in table headers and fact titles.

### Shared facets and activity ledger

CollectionFilters owns declared URL facets in a single-level picker and direct removable chips; current choices survive search submissions. Counts are loaded-collection counts, omitted when a filtered server result cannot prove other values' totals. Stories reads as List by default without overriding an explicit choice. Built-in state links clear named-view identity and selection subset, retaining presentation preferences; named views restore presentation and facets together. Wrapped view tabs leave every built-in visible on phones.

ActivityLedger is a dated, monthly ledger of stored updates. Only recorded kinds get lanes; unknown authors stay Not attributed. Phone lane pills and desktop lane labels drive the same filter. Custom range replaces the preset, optional bounds work independently, and invalid order pauses date filtering with an explanation. Dates and copy explicitly mean updates in UTC. Connection display names require server evidence and are not inferred from self-reported model text.

Home now has five trays: recently touched, research gaps, recent imports, AI guidance and a counted vault index. The index retains all Stories/Places/Documents text and exact destinations rather than inventing a missing Library route.
