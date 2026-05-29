# Engineering Audit — Production Hardening (2026-05-29)

> **Type:** Report / snapshot (point-in-time). Not durable guidance.
> **Branch:** `scott/engineering-audit` · **Tracking epic:** [GEN-86](https://linear.app/jarvie/issue/GEN-86) · **Children:** GEN-87 … GEN-102
> **Method:** 8 specialized read-only subagents (Architecture, Frontend/UX, Convex/DB, Vercel/Runtime cost, Type safety, Tests, Security, DX) each cited `file:line` evidence; every P0/P1 finding then went through an independent adversarial verifier that re-read the cited code. Findings below reflect the **post-verification** picture (refuted/over-stated claims removed or downgraded).

---

## 1. Executive summary

This is a **strong prototype with a better skeleton than its age suggests**. The frontend is server-component-first (20/25 app pages are RSCs, no client-side live Convex), the vault data model is coherent, the public-story DTO uses a careful explicit field allowlist, and there is a real single-command health gate — `pnpm verify` (34 steps) — that **is enforced in CI** on every PR and push to main. Type discipline is good (`strict: true`, almost no `any`). Most "clutter" candidates (`output/`, `.archive/`, `data/`, `test-artifacts/`) are already gitignored — non-issues.

Against that solid base, the audit found **one dominant, independently-corroborated P0** plus a focused set of high-value follow-ups.

### 🔴 The headline (P0): the Convex backend has no authentication

Three domains (Security, Architecture, Convex) confirmed it by reading the code: **zero `ctx.auth`/`getUserIdentity` anywhere in `convex/`**, no `auth.config.ts`, and the Next server calls Convex with an unauthenticated client passing `vaultOwnerId` as a **trusted string argument**. `matchesVaultOwner()` only compares the row's owner to the *same client-supplied* owner, so it cannot stop a caller who simply supplies the victim's id. The high-value aggregate functions are exported **public** while leaf tables were correctly locked to `internal`. Because `NEXT_PUBLIC_CONVEX_URL` ships in the client bundle, **anyone can call these with another user's Clerk userId and read or mutate their entire private genealogy vault**, bypassing every Next-layer control (auth, owner isolation, publish-safety, living-person protection). Every other security finding is a symptom of this root cause. → **GEN-87** (must close before any multi-tenant public-beta exposure).

### What verification killed (don't spend time here)

- **"Middleware (proxy.ts) not registered"** → **REFUTED.** The middleware bundle is compiled and active (`clerkMiddleware` + `auth.protect` present in `.next` chunks). The empty `middleware-manifest.json` map is a Next 16/turbopack reporting quirk.
- **"verify.sh not enforced in CI"** → **REFUTED.** `.github/workflows/ci.yml` runs `pnpm verify` + smoke routes on every PR and push to main.
- **"output/.archive/data/test-artifacts clutter"** → **NON-ISSUE.** Already gitignored/untracked.

---

## 2. Subagent findings (by domain)

### Architecture & structure
Clear intentional spine (Convex data layer → `lib/` business rules → thin API routes → product pages); separation of concerns is generally good. Weaknesses: the authorization boundary lives only in Next.js (→ GEN-87); a legacy `persons.ts`/`relationships.ts` CRUD layer writes the shared tables **unscoped** but is internal-only and app-dead (→ GEN-100C); dead `ancestorDetails.ts` (296L, → GEN-100A); name/dedupe logic reimplemented instead of reusing `vaultCore` helpers (→ GEN-100B); two ~1.8k-line god-modules (→ GEN-102A).

### Frontend & UX performance
Client/server discipline is genuinely good — **leave the RSC architecture alone.** Real problems: every list page loads the full vault snapshot (→ GEN-92); zero `loading.tsx`/`error.tsx`/`Suspense` so navigation blanks (→ GEN-96); a 3-request waterfall on the source-docs AI page and a documents double-fetch (→ GEN-99); no pagination on large lists (→ GEN-99C).

### Convex / backend / database
Reads cleanly; ownership consistently enforced *within* the (publicly-callable) functions; public-story DTO carefully gated. Dominant risks: `getVaultSnapshot` over-fetch (→ GEN-92), O(people × everything) in-memory joins with a quadratic citation lookup (→ GEN-93A), and `bulkRefreshResearchChecks` scanning **13 full tables unfiltered inside a mutation** (→ GEN-93B). ~15 unused indexes + unindexed dedupe scans (→ GEN-98).

### Vercel / runtime / cost
Per-user `force-dynamic` + no static caching is correct (leave it). Real issues: local-filesystem artifact storage is **non-durable on Vercel** (→ GEN-91, a correctness bug); GET endpoints fire up to 4 Convex calls incl. the heavy recompute (→ GEN-90); `/api/process` is an uncapped AI spend vector with a retired default model (→ GEN-89).

### Type safety & contracts
`strict` on, `any` nearly absent, intake/evidence paths fully zod-validated (leave them). Risks at runtime boundaries: context-pack contract defined 3× with no shared type — and a **silent privacy-gate failure mode** if the server field is renamed (→ GEN-94A); API bodies parsed as `any` with hand-rolled validation (→ GEN-94B); untyped OpenRouter response with silent `JSON.parse` degrade (→ GEN-94, GEN-102D).

### Tests & quality
Impressive gate model for a fast-built prototype; publish-safety/gate logic well covered. Biggest gap: the newest, highest-blast-radius feature — anonymous→authed vault **migration** — has **zero tests** (→ GEN-95A); `OWNED_TABLES` ↔ `by_owner` parity is an unenforced manual contract (→ GEN-95B); no runtime owner-scoping test (→ GEN-95C); no real test runner (→ GEN-101A); brittle source-string grep checks (→ GEN-101B).

### Security & permissions
Next layer is well-built (owner resolved server-side, public-story allowlist, publish gating, clean secrets). The structural hole is the Convex no-auth boundary (→ GEN-87) and the public-vs-internal inconsistency on the aggregate functions (→ GEN-87 evidence). Symptoms: publish gate only in the API route, guest-migration takeover, client-asserted `redactionMode` (→ GEN-88).

### DX & AI-agent readiness
Contract-gate foundation is excellent — **leave verify.sh + the 30 check:\* gates alone.** Gaps in onboarding surface: README contradicts the code (build tool, auth posture, Node version), `.env.example` omits dev-critical Clerk flags, no `CLAUDE.md`, docs "Active Docs" index mixes durable guidance with dated snapshots (→ GEN-97).

---

## 3. Top recommended improvements (highest impact first)

| # | Improvement | Issue | Benefit | Risk to fix |
|---|---|---|---|---|
| 1 | Close the Convex trust boundary (auth or internalize) | GEN-87 | **Eliminates cross-tenant data-breach risk** | High — needs human design |
| 2 | Enforce publish-gate / migration-binding / redaction in backend | GEN-88 | Makes privacy gates authoritative | Medium |
| 3 | Cap `/api/process` (allowlist, size, rate limit, model) | GEN-89 | Stops uncapped AI bills | Low |
| 4 | No Convex writes on GET reads | GEN-90 | Cuts Convex spend that scales with views | Low |
| 5 | Durable artifact storage (off local FS) | GEN-91 | Fixes silent prod data loss | Medium |
| 6 | Split `getVaultSnapshot` into scoped loaders | GEN-92 | Faster pages, lower cost as vaults grow | Medium |
| 7 | De-quadratic joins + indexed `bulkRefresh` | GEN-93 | Removes the worst scaling cliffs | Low-Med |
| 8 | Shared zod contracts (context-pack + API bodies) | GEN-94 | Closes a silent privacy-gate failure mode | Low |
| 9 | Migration + owner-scoping tests + parity check | GEN-95 | Protects the conversion path + isolation | Low |
| 10 | loading/error states | GEN-96 | App stops feeling like it hangs | Low |

---

## 4. Performance & cost review

- **Convex read cost scales with total vault size on every page view, not with what the page shows** (GEN-92). Single-person views (`getPersonWorkspace`, `getContextPack`) load the entire vault — worst cost-to-value ratio; fix these first.
- **Compute is O(people × related rows)** with a quadratic citation lookup (GEN-93A) — degrades fastest for the engaged users with the biggest trees.
- **`bulkRefreshResearchChecks` reads 13 full tables inside a write transaction** (GEN-93B) and is also triggered on GET reads (GEN-90) — the single biggest avoidable Convex spend.
- **`/api/process` has no spend ceiling** (GEN-89) — the only place the server pays for AI, open to unbounded OpenRouter charges; default model is retired.
- **~15 indexes are maintained on every write for zero reads** (GEN-98A); imports do unindexed full-table dedupe scans (GEN-98B).
- **Frontend:** 3-request waterfall + documents double-fetch + unpaginated lists (GEN-99). Add `private` Cache-Control + ETags on markdown endpoints (GEN-102C).

## 5. Scaling risks

The database *shape* and indexes are sound (GEDCOM-X, `by_owner` everywhere). The scaling risk is entirely in **read/compute patterns**, not schema:
1. Whole-vault snapshot on every navigation (GEN-92) — linear in vault size.
2. O(P × N) JS joins (GEN-93A) — quadratic-ish per page.
3. 13-table scan in a mutation (GEN-93B) — risks Convex transaction read limits on large vaults.
4. Unpaginated list/table pages mounting heavy per-row client components (GEN-99C).
5. Unindexed import dedupe ≈ O(imported × existing) (GEN-98B).

All are per-tenant bounded today (small guest vaults are fine) — they're future cliffs, addressed incrementally without schema migrations.

## 6. Test review

**Keep (good, behavioral):** `test-context-gates`, `test-vault-core`, `check-story-publish-safety` + story fixtures, `check-public-story-policy`, `check-convex-visibility` (strongest structural guardrail), `check-protected-routes`, `check-no-plain-next-link`, `check-agent-quality-gates`, `check-review-gates`, `check-person-identifiers`.

**Gaps (GEN-95):** anonymous→authed migration has **zero** coverage; `OWNED_TABLES`↔`by_owner` parity unenforced; no runtime test that owner A can't see owner B's rows (only a static grep).

**Quality (GEN-101):** no real runner (`tsx a && tsx b && tsx c`, each script redefines `assert`); brittle source-string grep checks give false confidence (green when logic breaks) and false friction (red on copy edits); `check-public-beta-launch` conflates Linear-ID bookkeeping with a CI gate.

**Recommended strategy:** adopt `node:test` (zero new deps) or vitest; migrate the genuine behavioral tests with coverage; keep structural guardrails as separate lint-style scripts; add migration + owner-scoping tests first.

## 7. Cleanup candidates

- **Delete:** `convex/ancestorDetails.ts` (296L, zero references) — GEN-100A. Safe mechanical win.
- **De-duplicate:** route name/dedupe logic through `vaultCore` helpers — GEN-100B.
- **Retire/internalize:** legacy `persons.ts` + `relationships.ts` (unscoped, app-dead, already internal) — GEN-100C.
- **Remove:** ~15 unused indexes — GEN-98A.
- **Reorganize:** docs "Active Docs" index; move dated reports (incl. this file) to a Reports/Snapshots section — GEN-97D.
- **Do NOT "clean up":** `output/`, `.archive/`, `data/`, `test-artifacts/`, `tsconfig.tsbuildinfo` — already gitignored/untracked.

## 8. Phased refactor roadmap

- **Phase 0 — Trust boundary (do first, needs human sign-off):** GEN-87, GEN-88.
- **Phase 1 — Cost & spend guards (fast $ wins):** GEN-89, GEN-90.
- **Phase 2 — Durability:** GEN-91.
- **Phase 3 — Performance & scale:** GEN-92, GEN-93.
- **Phase 4 — Contracts:** GEN-94.
- **Phase 5 — Tests:** GEN-95.
- **Phase 6 — UX:** GEN-96.
- **Phase 7 — DX truth-up:** GEN-97.
- **Phase 8 — Medium cleanup:** GEN-98, GEN-99, GEN-100, GEN-101.
- **Phase 9 — Deferred polish:** GEN-102.

## 9. Implementation steps in order

1. **GEN-87** — Convex auth/trust boundary *(human design decision required)*.
2. **GEN-88** — re-assert publish-gate + migration binding + redaction in the backend (depends on 1).
3. **GEN-89** — `/api/process` spend caps + model allowlist + fix default model.
4. **GEN-90** — remove write-amplification on GET reads.
5. **GEN-91** — durable artifact storage *(human picks Convex-canonical vs blob)*.
6. **GEN-92** — split `getVaultSnapshot` (single-person surfaces first).
7. **GEN-93** — de-quadratic joins + indexed `bulkRefreshResearchChecks` (pairs with 4 & 6).
8. **GEN-94** — shared zod context-pack contract + API body validation.
9. **GEN-95** — migration tests + `OWNED_TABLES` parity check + owner-scoping test *(human picks harness)*.
10. **GEN-96** — loading/error states + skeletons.
11. **GEN-97** — README / `.env.example` / `CLAUDE.md` / `.nvmrc` / docs index.
12. **GEN-98** — index hygiene *(human confirms drop list)*.
13. **GEN-99** — FE waterfalls, double-fetch, pagination *(human picks page size)*.
14. **GEN-100** — dead-code & duplication cleanup.
15. **GEN-101** — test-runner + behavioral-check upgrade *(human picks runner)*.
16. **GEN-102** — deferred polish (god-module split last — it conflicts with everything).

> **Quick early wins** that can run in parallel with Phase 0 design (safe for coding agents, low risk): GEN-90, GEN-95B (parity check), GEN-96, GEN-97, GEN-100A (delete dead file).

## 10. Do-first / don't-touch / needs-human

**Do first:** Phase 0 (GEN-87/88) — the only present cross-tenant data-breach risk.

**Leave alone for now (correct & load-bearing):** the public-story DTO allowlist (`buildPublicStoryBundle`), the three-gate context logic, the server-component frontend architecture, the `internal*` aliasing pattern, GEDCOM-X schema modeling, and `verify.sh` + the CI gate.

**Needs human/product review before changing:** the Convex auth approach + anonymous-vault token scheme (GEN-87); artifact-storage target (GEN-91); which ~15 indexes to drop (GEN-98); AI default model + rate-limit thresholds (GEN-89); test-runner choice (GEN-95C/101A); list page-size (GEN-99C); whether to delete vs internalize legacy persons/relationships (GEN-100C).

**Safe to delegate to coding agents (with tests):** GEN-90, GEN-92 (per step), GEN-93, GEN-94, GEN-95A/B, GEN-96, GEN-97, GEN-100A/B, GEN-99A/B.
