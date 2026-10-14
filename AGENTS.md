# Family History agent notes

Product direction is the [Site Guide](/Users/scottjarvie/IDE/local-development-rollout/family-history-completion-20261007/docs/planning/site-guide.md); keep it current when owner decisions or implemented behavior change. The [Project Philosophy](docs/planning/assist-with-family-history-project-philosophy.md) supplies domain language and trust boundaries. Use [docs/README.md](docs/README.md) for the relevant architecture references. [Tracker context](docs/tracker/GUIDE.md) is optional, not an authorization prerequisite.

Family history data is private by default. Living-person details, raw FamilySearch captures, memories, private notes and unresolved relationship claims must not become public through imports, stories, exports or AI handoffs. Preserve provenance and distinguish a source's claim from a verified conclusion. Browser capture stays user-mediated unless approved FamilySearch API access and scopes exist.

For source capture or research, follow the existing [capture runbook](docs/importing/familysearch-source-capture-runbook.md), [storage map](docs/importing/familysearch-capture-storage-map.md), and applicable [place/era research-pack contract](docs/context/place-era-research-packs.md). Preserve raw evidence and reviewed work; do not replace these procedures with a summary-only research pass.

Local setup uses the family coordinator's registered checkout and selected-site launcher. Live remains withheld while owner enforcement is unverified; do not bypass the launcher refusal or alter production policy merely to start localhost. Sandbox is a separate record-only backend: preserve its native SQLite, configuration and storage, and keep provider/media execution disabled.

Use [the handoff runbook](docs/operations/agent-handoff-runbook.md) for delivery details. Choose relevant existing checks from `package.json`; `pnpm verify` is the full repository check when the change warrants it.
