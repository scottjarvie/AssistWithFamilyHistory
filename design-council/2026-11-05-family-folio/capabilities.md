# Capability contract · 2026-11-05

Full route-by-route baseline: page-inventory.md. A visual pass must keep every listed capability. No auth, Convex, API, import semantics, publishing or grant enforcement changes are authorized by this design run.

## Initial capture tranche

- Home populated: recent people with lifespan, status and critical gaps; Story Studio and Research Queue actions; six workspace totals; recent imports and merge status; Intake/Vault/Research/Stories links and descriptions; AI context pack explanation. Totals will become links to their existing source pages.
- Home empty: private first connection action, AI connection guidance, reviewed-capture import alternative, privacy explanation, complete workspace map.
- People: query input and submit, every research-state option, first-connection/import action, person links, lifespan, research state, living/deceased, unsourced provenance, all five counts, last import and pagination.
- Shared shell: every existing destination and account control remains reachable.

Automated visible-element probes are in ../shots.json. They supplement interaction checks, not replace them. Fixture rows are invented and test presentation only. Real backend acceptance is separate; no fixture capture proves a backend feature works.

## No-removal audit rule

Per round, inspect each changed node for text becoming icon-only, hover-only, hidden or deeper; list it in rounds.md. Do not clamp text or silently collapse facts. Existing public and specialist pages remain on the inventory until built and captured; shared token adoption alone does not complete a page.
