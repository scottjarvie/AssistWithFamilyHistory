# Stack upgrade plan: Next 16.1 → 16.4, Clerk 6 → 7 (FH1)

Status: plan only. Written 2026-10-21 by Claude (Opus 5.5) during an unattended
run. Nothing in this document has been done yet.

## Why

The rest of the Assist family runs Next 16.3 to 16.4 and `@clerk/nextjs` 7.7.5
(Core §9: one stack). Family History is on `next` 16.1.1, `eslint-config-next`
16.1.1, `@clerk/nextjs` ^6.38.2, React 19.2.3 and Convex ^1.32. Staying behind
means sibling code (proxy, media relay, shell pages) does not copy across
cleanly, and security fixes arrive later.

## Target versions (from `assistwithfood` origin/main, 2026-10-21)

| Package | Family History now | Target (Food) | Plants |
|---|---|---|---|
| `next` | 16.1.1 | **16.4.0** | 16.3.1 |
| `eslint-config-next` | 16.1.1 | **16.4.0** | 16.3.1 |
| `@clerk/nextjs` | ^6.38.2 | **7.7.5** (pinned) | 7.7.5 |
| `react`, `react-dom` | 19.2.3 | **19.2.8** | 19.2.8 |
| `convex` | ^1.32.0 | 1.44.0 (separate step, optional) | 1.44.0 |

Pin exact versions as Food does. Keep pnpm 10.26 (`packageManager`).

## Where Clerk is used (the whole blast radius)

Eleven files, 30 call sites:

| File | API |
|---|---|
| `proxy.ts` | `clerkMiddleware`, `createRouteMatcher`, `auth()`, `auth.protect()` |
| `app/layout.tsx` | `ClerkProvider` |
| `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx` | `SignIn`, `SignUp` |
| `app/api/vault/migrate-guest/route.ts`, `lib/convex/server.ts`, `lib/vault/server.ts` | `auth()` from `@clerk/nextjs/server` |
| `components/LocalSessionBridge.tsx` | `useAuth` |
| `components/layout/AppTopBar.tsx`, `components/layout/VaultAccountPanel.tsx` | `UserButton`, `useUser` |
| `components/layout/GuestVaultMigrationGate.tsx` | `useUser` |

MCP OAuth does not use the Clerk SDK at runtime: `convex/httpRoutes/mcp.ts`
verifies tokens with `jose` against the Clerk issuer, and the `.well-known`
documents are served from Convex. The Clerk upgrade therefore should not touch
the `/mcp` path, but it must be proven, not assumed.

## Steps (one branch, `claude/fh-next-clerk-upgrade`, one draft PR)

1. **Read first.** `node_modules/next/dist/docs/` for 16.2, 16.3 and 16.4
   release notes after installing, and Clerk's Core 3 / `@clerk/nextjs` v7
   upgrade guide. Run `npx @clerk/upgrade --from=core-2` (Clerk's codemod
   scanner) and record what it flags. Do not guess at API changes.
2. **Next first, alone.** Bump `next`, `eslint-config-next`, `react`,
   `react-dom`. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`. Fix
   deprecations (the `proxy.ts` convention is already in place, so the
   middleware rename is done). Check `next.config.ts` rewrites for `/mcp` and
   `/.well-known/*` still resolve.
3. **Clerk second.** Bump `@clerk/nextjs` to 7.7.5. Work through the files above
   in this order: `proxy.ts` (the `auth.protect()` and route-matcher shape),
   server `auth()` callers, then the client components. Compare each with the
   equivalent in `assistwithfood` origin/main (`proxy.ts`,
   `app/sign-in`, its `ClerkProvider` wrapper).
4. **Guest vault.** `proxy.ts` sets the guest cookie when Clerk reports no
   user and anonymous vaults are on. Confirm the v7 `auth()` result still
   gives `userId: null` for signed-out requests, and that
   `app/api/vault/migrate-guest` still binds the destination to the signed-in
   user (`check:convex-client-auth`, `check:protected-routes`).
5. **Verify locally.** `pnpm verify` (includes the build) and
   `pnpm check:mcp-contract`. Then `pnpm dev:sandbox` and walk: home, sign-in,
   `/app`, `/app/people`, `/app/settings/ai`, sign-out, at 375 and 1280 wide.
   `BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes`.
6. **MCP proof.** `pnpm test:convex` (transport, grant and OAuth metadata
   suites) and `pnpm mcp:lifecycle` against the sandbox, so discovery, the
   401 challenge and a tool call still behave.
7. **Client-visible notes in the PR.** Sign-in page look, `UserButton` look,
   any redirect differences.

Convex 1.32 → 1.44 is a separate, later PR. It changes the generated bindings
and `convex-test` behaviour and does not need to ride with the Next/Clerk work.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Clerk v7 changes `auth()` or `auth.protect()` behaviour in the proxy | Could lock people out of `/app` or expose a private page | Steps 3 to 5; `check:protected-routes`; manual signed-out walk |
| Guest vault cookie path changes | Guest work could fail to migrate on sign-up | Step 4 |
| Next 16.4 build differences on Vercel | A production build failure blocks the Convex deploy too | Full `pnpm verify` including the build before the PR leaves draft |
| Clerk Dashboard settings differ between v6 and v7 expectations | Sign-in could need a Clerk Dashboard change | Owner check only if the codemod or guide says so; that would be a **Needs Scott** item |

## Estimate

Half a day of agent work plus Scott's sign-in check on the preview.
