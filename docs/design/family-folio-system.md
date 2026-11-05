# Family History folio system

2026-11-05 · local council implementation, not a release receipt.

Structure follows Scott's Assist design playbook (4 November). Product nouns, privacy and capability truth follow this repo's Site Guide. The run ledger and page-by-page status live in `design-council/2026-11-05-family-folio/`.

## Roles

- Parchment background and pale paper cards; ink text, teal navigation/actions, rust annotations, evidence green. Never use a color alone to convey review or provenance.
- `.dark` defines the same semantic roles, including illustration colors and background washes. Hard-coded light surfaces remain migration work until each route's pass.
- Cormorant Garamond: editorial page headings. Instrument Sans: controls, labels, tray headings and body. IBM Plex Mono: small provenance labels and quantities. Keep body labels readable; do not reduce text to fit a dense layout.
- Base radius .5rem; hairline borders. Space with the existing 4px Tailwind scale. Compact controls retain 44px touch targets; mouse controls can be smaller when labelled and discoverable.
- `.folio-tray`: restrained paper surface with a folder edge. `.folio-tray-heading`: grouped tray label above its contents. Do not create decorative empty panels.
- `ArchiveIllustration`: Codex-written inline SVG, using currentColor, no network request. Decorative fallback for a missing image, never a claim that a portrait exists.

## Page families

Home leads with recently touched evidence; collection uses real saved views and a grouped table with full controls; record uses an identity dossier and one dated evidence stream; sticky counted tabs include an always-visible All menu and phone Contents list. Activity lanes exist only for actual entry kinds. Stats numbers expose their records; AI permissions retain clear revoke, scope narrowing, end dates and human-only authority. Reader pages keep source/provenance context beside the narrative. Queue lists and threads retain current state truth; do not silently change lifecycle semantics in a visual pass.

## Scope truth

This document records the target system and implemented primitives. It does not claim every page uses them yet. No data model, permission, provider, import or publishing behavior changes accompany this design tranche. New backend capabilities require their own implementation evidence.
