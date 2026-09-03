---
id: AWF-WO-012
title: Carry private family evidence safely between the person and their chosen AI
execution: active
audit: not-audited
cards: AWF-0046, AWF-0047, AWF-0048
created: 2026-08-30
updated: 2026-09-03
proposed-by: Codex
proposal-evidence: current origin/main MCP, grants, protected evidence, private Convex upload, FamilySearch boundary, tracker, Project Philosophy, family media standard, connector playbook, and success-scenario reconciliation
---

## Goal

Move scans, record pages, PDFs, transcripts, and recorded interviews through a
private checksum-verified byte path that the person and their chosen AI can use
without weakening living-person privacy, review, rights, provenance, conflict
authority, or exact cleanup.

## Why this tranche exists

AWF-WO-011 built the product grant, Queue, workflow tools, protected evidence,
connection center, and current private Convex-byte foundation. AWF-0045 made a
reviewed scan readable. The next gap is product-specific: adopt the family B2
manifest/lifecycle contract and give a connected AI a direct upload path while
keeping person review between upload and any future AI read.

The full contract and copyable worker prompt are in
`docs/planning/family-history-mcp-media-adoption.md`.

## Current truth

- **Current:** namespaced workflow tools and aliases, person-approved grants,
  immediate revoke, protected batch evidence, person upload to private Convex
  Storage, review/rights/AI-use gates, and honest reference-only refusal.
- **Merged and deployed:** a fail-closed two-bucket B2
  contract; exact private originals; three metadata-clean image renditions;
  version/hash/length/type/full-decode verification; durable replay-safe upload
  sessions; a same-origin relay; separate evidence-write consent; begin/finish
  MCP tools; person-only review handoff; structured camera/GPS proposals; and
  clean-rendition-only reads. Arbitrary server fetches of FamilySearch/media
  reference URLs were removed.
- **Provider configured:** Backblaze contains exactly one project-private and
  one project-public bucket with encryption and version retention, each using
  a separate bucket-scoped key. Production Convex contains the bindings;
  Vercel and source control do not contain the B2 secrets. A guarded production
  action for byte/hash/read/delete verification is deployed but not yet run.
- **Still partial:** person uploads remain on the legacy private Convex path;
  connected-AI uploads currently admit JPEG, PNG, and WebP only; PDFs,
  transcripts, audio, video, resumable multi-part batches, migration, provider
  execution proof, real-upload proof, and named-client proof remain.
- **Later in this active order:** finish the remaining media classes and batch
  behavior, then run the full marked media-to-story acceptance/cleanup
  lifecycle.

## Sequence

1. AWF-0046 — add the private exact-version B2/control-plane foundation and
   safe archival/working rendition contract.
2. AWF-0047 — add begin/direct-PUT/finish tools that create Private unreviewed
   evidence and preserve person-only review.
3. AWF-0048 — release and prove the marked deceased-ancestor media-to-story
   lifecycle, refusals, replay/revoke, UI, and exact cleanup.

AWF-0047 may design against AWF-0046 while its schema stabilizes, but cannot
commit outside its manifest. AWF-0048 is the integrated proof gate.

## Dependencies

- Family History Project Philosophy, ancestor-vault architecture, tracker
  Guide, and user-mediated FamilySearch capture/runbooks.
- AWF-WO-011, AWF-0041, and AWF-0045.
- Family standards at `assist-with-life` commit `6d256fb`, including media
  standard v1.4, the MCP connector playbook v1.9, and the September lessons.
- Existing protected PR/CI, Convex/Vercel, provider, synthetic fixture, and
  cleanup paths.

## Exclusions

- No real family or living-person data; no unattended FamilySearch access,
  credential/session storage, or automatic mirroring.
- No AI review/rights approval, conflict settlement, identity merge, sharing,
  publication, export, permanent delete, or outside-world/provider action.
- No generic CRUD, caller-supplied owner coordinate, public-storage fallback,
  or current-file migration without a separate approved program.
- This Active Work Order authorizes no bucket, key, secret, provider,
  billing, DNS, production data, deployment, or named-client claim.

## Stop rules

Scott approved continuing this media/MCP alignment program through the
2026-09-02 owner delegation. That satisfied the implementation gate and this
order is Active. Stop again before
provider/security posture, secrets, billing, DNS, production data, migration,
deployment, public/trusted/unlisted visibility, or real-client setup not
explicitly authorized. Routine architecture, additive schema, implementation,
tests, docs, migration dry-runs, marked non-production fixtures, and protected
PR mechanics belong to the executor after Ready.

## Verification

- Existing grant, boundary, Queue, batch, evidence, media-byte, living-person,
  rights, docs-truth, MCP contract, typecheck, lint, tests, build, and tracker
  gates.
- New exact-version/checksum/type/decode, metadata/rendition, idempotency,
  expiry, concurrency, cleanup, review handoff, and no-fallback tests.
- Provider inventory and least-privilege denial without secret values.
- Marked browser and named-client proof only under their explicit gates,
  followed by exact zero-residue cleanup.
- One independent bounded review; non-blocking hardening becomes follow-up.

## Human gates

The implementation scope is approved. Provider topology or credentials,
billing, DNS, production data, migration execution, deployment,
public/trusted/unlisted visibility, and a real named-client connection each
retain the smallest separate gate described above. The desired provider shape
is exactly two project-specific B2 buckets—one private and one public—not the
generic four-bucket family example.

On 2026-09-03 Scott explicitly authorized the Backblaze, Convex, and Vercel
production work for this soft launch. That authorization was used only for the
two Family History buckets, their corresponding restricted keys and Convex
bindings, and normal reviewed deployment. The synthetic provider check's cloud
object deletion still requires its separate action-time confirmation.

## Execution evidence

On 2026-09-02 Codex fast-forwarded local `main` to `ac47339`, branched normally,
reconciled the Project Philosophy/tracker/stable runbooks and the family
standards at `assist-with-life` `6d256fb`, and audited current code before
editing. The local implementation listed above has completed its local
verification rung.

Local verification now passes TypeScript, lint with no errors, the 107-test
vault/privacy/story regression suite, the 189-test Convex suite, the eight-test
media storage suite, production build, tracker parity, and the MCP, trust-
boundary, protected-route, client-auth, API-inventory, media-byte, review-gate,
connection-center, public-AI-truth, owner-table, and Convex-visibility contracts.
No deployed or provider-backed proof is implied by those local results.

The first production deployment of merged pull request #70 built the Next.js
application successfully but Convex rejected `mediaEvidenceStorage` because the
Vercel Linux-x64 `sharp` binary was bundled for Convex's Linux-arm64 Node
runtime. The focused hotfix marks `sharp` as a Convex server-installed external
package so Convex installs the native binary for its own runtime. Pull request
#71 passed local and GitHub verification, merged as `459dde8`, and replacement
Vercel deployment `dpl_8d3HKVrShztuvfEYUZHRcWSp27LJ` completed successfully.
The canonical homepage and OAuth resource metadata return 200, and the live AI
guide publishes the evidence-write scope plus both upload tools. Provider-byte
proof remains pending until Backblaze is configured.

On 2026-09-03 Codex inventoried Backblaze, created exactly the private and
public Family History buckets with default encryption and version retention,
created separate read/write keys restricted to each bucket, and saved the
masked production bindings in Convex only. Pull request #72 added an internal
production-only provider checker that accepts only marked synthetic run keys,
writes to each configured bucket, verifies exact length and SHA-256 on the
stored version, and removes that exact version in a `finally` cleanup. Full
local verification passed all 58 commands in 186 seconds; GitHub and Vercel PR
checks passed; the merge is on main as `1f9c090`; post-merge main CI passed; and
the production Convex function list exposes the checker. The final Run action
and its byte/hash/cleanup receipt remain pending action-time deletion
confirmation, so provider-byte success is not yet claimed.

Read-only provider evidence: the signed-in Vercel account contains the retained
`assistwithfamilyhistory` project, connected to this GitHub repository and the
active `assistwithfamilyhistory.com` Vercel CDN/domain. Its project
environment-variable list contains Clerk/Convex/site bindings only—no B2 media
bindings. The overview's Production Deployment card exposed no deployment row
during this audit. Backblaze opened at its sign-in page, so bucket/key inventory
could not be verified. No bucket, key, secret,
environment value, deployment, DNS, production row, real family byte, or
named-client state was created or changed.

## Tracker update and handoff

Keep each Card's Current/Partial/Later and proof ladder current. Preserve
AWF-WO-011 and AWF-0045 history. Synchronize public truth only after the
corresponding runtime and retained evidence exist.

## History

- 2026-08-30 · Codex — proposed the Family History-specific media-storage and
  MCP adoption program from current `origin/main`; documentation/tracker only,
  with no application, provider, secret, deploy, migration, or production-data
  change.
- 2026-09-02 · Scott via owner delegation — approved continuing the Family
  History media/MCP alignment program while preserving the separate provider,
  secret, deployment, domain, production-data, and named-client gates.
- 2026-09-02 · Codex — moved the approved program into active execution and
  built the first local vertical slice: exact private image originals, clean
  renditions, proposed date/GPS evidence, replay-safe same-origin chosen-AI
  upload, private person review, and clean-rendition retrieval. Provider audit
  remains blocked at Backblaze sign-in; no external state changed.
- 2026-09-02 · Codex — merged pull request #70 after local and GitHub CI passed.
  The production deployment then failed specifically at Convex native-module
  analysis for `sharp`; recorded the failure and opened the documented
  external-package hotfix rather than claiming deployment success.
- 2026-09-02 · Codex — merged the focused `sharp` runtime hotfix in pull request
  #71; replacement Vercel/Convex production deployment completed, post-merge
  main CI passed verify plus route smoke tests, and public AI guidance exposed
  the new scope/tools. Backblaze bytes and named-client use remain unproved.
- 2026-09-03 · Scott and Codex — Scott authorized the Family History provider,
  Convex, and Vercel work; Codex created the isolated two-bucket topology and
  restricted keys, bound production Convex, and merged/deployed the guarded
  provider checker in pull request #72. Live execution remains pending the
  separate confirmation required for its immediate cleanup deletion.
