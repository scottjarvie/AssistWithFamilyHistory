# Route Audit

Date: 2026-05-13

## App Route Map

| Route | Product Area | Current Role | Recommendation |
| --- | --- | --- | --- |
| `/app` | Workspace | Dashboard for counts, recent imports, recent people, and context packs | Keep as the app home. |
| `/app/people` | Research Vault | Person explorer and entry point into person workspaces | Keep primary. |
| `/app/people/[personId]` | Research Vault, Story Studio | Person workspace with evidence, timeline, operations status, and story links | Keep primary. |
| `/app/places` | Research Vault | Place explorer and context entry point | Keep primary. |
| `/app/imports` | Intake and Import | FamilySearch capture package import | Keep primary. |
| `/app/operations` | Research Operations | Cross-vault research queue | Keep primary; label as Research Queue in navigation. |
| `/app/research` | Research Operations, AI Research Assistant | Open tasks and research log | Keep primary; label as Research Log in navigation. |
| `/app/story-writer` | Story Studio | Person picker for story drafting | Keep primary. |
| `/app/people/[personId]/story-writer` | Story Studio | Person-specific story drafting workspace | Keep primary. |
| `/app/people/[personId]/raw` | Derived Artifacts | Raw evidence document view | Keep as person subview. |
| `/app/people/[personId]/contextualized` | AI Research Assistant | AI-assisted dossier view | Keep as person subview. |
| `/app/people/[personId]/ai` | AI Research Assistant | Legacy staged AI export/import flow | Keep as person subview until replaced by research assistant flows. |
| `/app/source-docs/*` | Legacy Compatibility | Redirects or legacy source-document views | Keep for compatibility, but do not promote in sitemap or nav. |
| `/app/tools` | Legacy Compatibility | Redirects to imports | Keep redirect only; do not promote in sitemap or nav. |

## Public Route Map

| Route | Current Role | Recommendation |
| --- | --- | --- |
| `/` | Marketing home | Keep. |
| `/features` | Feature overview | Keep, but keep language aligned to the product map. |
| `/features/source-docs` | Research Vault intake deep dive | Keep until a broader Research Vault public page exists. |
| `/extension` | Extension install/use page | Keep. |
| `/roadmap` | Public roadmap | Keep, but avoid over-committing exact future tools. |
| `/about`, `/contact`, `/privacy` | Trust and support pages | Keep. |

## Changes Made From This Audit

- Added `/app/operations` to the sitemap.
- Removed legacy redirect routes `/app/source-docs` and `/app/tools` from the sitemap.
- Grouped app sidebar navigation into Workspace, Research Vault, Research Work, and Stories & Tools.
- Renamed the sidebar labels for `/app/operations` and `/app/research` to Research Queue and Research Log.

## Next Structural Work

- Add a dedicated Story Studio/shareable ancestor story area when saved story outputs are ready to become first-class pages.
- Introduce broader feature modules for new work instead of expanding `features/source-docs/`.
- Eventually migrate raw/contextualized source-doc internals into a research-vault or research-assistant module while preserving route redirects.

