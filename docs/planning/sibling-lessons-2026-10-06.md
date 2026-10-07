# Sibling lessons for Family History — 6 October 2026

The owner asked that Family History build on what its siblings already do well rather than invent its own versions. This file compares Family History with Plants, Buying, Scriptures and Languages for each must-have item. For each one it says what Family History copies, what it doesn't, and why. Read it before starting any work on these areas.

This file records comparison and technical choices only. Choices about building blocks (trees, Projects and Questions, Sources and media, Connections) are being settled with the owner in a separate thread and in the draft site guide. Where this file touches those, it defers to them.

**What was read:**
- Family History: `main` at `f5fc595` (6 September 2026, v2.1.0 in `package.json`).
- Plants: `1c4b689` (v2.30.0).
- Buying: `f4a86e3`.
- Scriptures: `7055f24`.
- Languages: `4cab979`.
- Life: `ae5d34f`, for the family standards. The main ones are `planning/bring-your-ai-mcp-oauth-standard.md` v1.3.0, `planning/assist-media-storage-standard.md`, `planning/media-upload-recovery-buying-2026-10.md` and `planning/assist-with-sites-core-philosophy.md`.
- Food's `docs/planning/sibling-lessons-2026-10-06.md` (`assistwithfood` main). It covers the same siblings, so this file reuses its findings and only re-checks what matters here.

**Live checks:**
- These went through a web fetcher, because raw `curl` from the reading environment was refused by its network policy.
- `https://www.assistwithfamilyhistory.com/` and the apex both serve pages directly. The canonical tag points at the apex.
- Protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` answers on both hosts with the same document, with no redirect. The resource is `https://assistwithfamilyhistory.com/mcp`.
- `/ai.txt` is live.
- `/updates` tops out at **v2.2.0 on 17 August 2026**.
- Status codes and `WWW-Authenticate` headers were not observable. Re-check them from a machine that can `curl`.

## Decisions

1. **Upgrade the stack to the family pins, with Next.js 16.4.0 or later.**
   - Family History is on `next` 16.1.1, `convex` ^1.32, and `@clerk/nextjs` ^6.38. It is the oldest in the family.
   - Plants, Scriptures and Languages are on 16.3.1 / 1.44.0 / 7.7.5. Food is already on `next` 16.4.0.
   - 16.3.x has critical advisories, so the target is `next` ≥ 16.4.0, `eslint-config-next` to match, `convex` 1.44.0 and `@clerk/nextjs` 7.7.5.
   - Clerk 6 → 7 is a major version. Do it in its own PR and check sign-in, the Convex token template and the MCP OAuth path live.
   - Keep pnpm. Family History's scripts, CI and `pnpm verify` are built on it. Switching package managers buys nothing a person would notice.

2. **Keep the apex as the OAuth resource. Make every machine path answer on both hosts, and prove it from outside.**
   - Plants makes www canonical. Family History already published `https://assistwithfamilyhistory.com/mcp` as its resource, and existing grants and tokens are bound to it. Changing it would break every connected AI for no gain.
   - The family standard asks for one canonical resource identifier, with the machine paths served on both apex and www without a redirect. Family History meets that today (checked live above).
   - What's missing is a guard that keeps it true:
     - `proxy.ts` sends retired hosts (`discovertheirstories.com`, `*.vercel.app`) to the apex with a 308, and its matcher includes `/mcp`.
     - Copy Buying's `src/lib/canonical-host.ts` idea (`isSharedMachinePath`). Buying is also apex-canonical, so it's the closer template than Plants' `lib/canonicalHost.ts`.
     - Exempt `/mcp`, both `.well-known` paths, `/ai.txt`, `/llms.txt` and the upload paths from any host redirect.

3. **Run the outside probe after every deploy, not by hand.**
   - Scriptures' trap was a `/mcp` rewrite that only switched on with `MCP_PUBLIC_ROUTE=enabled`. Family History doesn't have that rewrite: `app/mcp/route.ts` forwards to Convex through `lib/mcp/proxy.ts`.
   - Family History's equivalent traps are its environment variables: `CONVEX_SITE_URL` / `NEXT_PUBLIC_CONVEX_URL`, `MCP_RESOURCE_URL` and `MCP_AUTH_SERVER_URL`.
   - `scripts/check-production-live.ts` already probes the right things, but:
     - it runs only on demand;
     - it checks only the canonical host;
     - its unauthenticated POST follows redirects.
   - Make it test both hosts with redirects off, and run it as a post-deploy step.
   - Don't copy the `MCP_PUBLIC_ROUTE` rewrite pattern. It adds a trap Family History doesn't have.

4. **Fix uploads first. Every byte path today goes through Vercel and fails above 4.5 MB.**
   - Family History says it accepts 25 MB (`lib/media/uploadContract.ts:18`, `lib/media/evidenceStandard.ts:11`). But both upload paths pass the bytes through a Vercel function:
     - Person uploads: `app/api/media/upload/route.ts:45,91` reads `request.formData()` and forwards the bytes to Convex.
     - AI uploads: `app/api/mcp-media-upload/[uploadRef]/[token]/route.ts`.
   - So multi-page PDFs, TIFF scans and recorded interviews over 4.5 MB fail with a Vercel 413 before Family History's own message runs.
   - This is the bug Plants describes in `lib/media/relay.ts:1-13`, and the details are in the Media section below.

5. **Copy the shape, not the whole engine, for Table, Grid and List.**
   - Plants' list engine is about 7,500 lines and tied to Plants' data port, query model and CSS.
   - Family History adopts its config shape and filter rules, built small in Family History's own Tailwind and shadcn components.
   - It adopts Scriptures' per-device view memory almost verbatim. Details are in the Views section below.

## What to copy, by area

### MCP and OAuth

Family History already does most of this its own way, and in places it is stronger.

What it already has:
- Clerk JWTs are verified directly with `jose` (`convex/httpRoutes/mcp.ts:140-226`). There is no `convex-mcp-gateway`.
- A fresh product-grant check on every call.
- A `tools/list` filtered by grant.
- Durable no-duplicate receipts: the `mcpOperations` table plus a request hash, so the same `operationId` with different content gives `IDEMPOTENCY_CONFLICT` (`convex/mcpFamilyHistory.ts:160-176`).
- Its own CIMD/DCR checks (`lib/mcp/clientMetadata.ts`, `convex/mcpClientTrust.ts`).

Copy:
- **The 401 / 503 / 403 split** from Buying's `src/lib/mcp-challenges.ts` and `convex/lib/mcp/oauth.ts:140-190`: `asciiOnly`, `responseForFailure`, `isUnreachableFailure`, `challengeAsToolResult`.
  - Today a JWKS fetch failure becomes `401 invalid_token` (`convex/httpRoutes/mcp.ts:221-226`). That tells the AI to sign in again when the real problem is that Clerk is unreachable. It should be a 503.
- **Identity scopes in discovery.** The family standard (§1) says discovery may list only scopes the provider can issue, and that `offline_access` must not be dropped "merely to hide product scopes". Plants (`convex/mcp.ts:68`) and Buying (`oauth.ts:208`) publish `openid email profile offline_access`.
  - Family History publishes no `scopes_supported` at all, and `convex/mcpTransport.test.ts:152` pins that absence. The risk is that a client never asks for a refresh token and the person has to reconnect when the token expires.
  - Change the test to allow identity scopes only, keep the `family_history:*` vocabulary under the vendor key, and prove renewal after the token expires.
- **Two details from Buying's `convex/lib/idempotency.ts`:** drop `undefined` entries from canonical JSON, and restrict the characters an operation key may contain. Family History's own receipts stay.
- **Buying's `sanitizeReportedClientName`** from `src/lib/mcp-client-identity.ts`, in place of the current trim-and-truncate on the client label.
- **A how-to-add-a-tool README and a tool snapshot test**, modelled on Buying's `convex/lib/mcp/README.md`, `convex/lib/mcp/toolsSnapshot.test.ts` and `scripts/check-mcp-tool-catalog.mjs`.
  - Splitting the 1,118-line `convex/httpRoutes/mcp.ts` into `oauth` / `transport` / `server` / `tools` the way Buying did is worth doing when that file is next touched heavily. It isn't worth a PR on its own.

Don't copy:
- Plants' `opId` spelling. Family History ships `operationId`, and the standard says not to break a live API.
- Buying's identical-for-everyone catalogue. Family History filters `tools/list` per grant on purpose.
- Buying's leftover gateway packages.

### Media and uploads

**1. The Convex relay.** This is the most important fix.
- Copy Plants' `lib/media/relay.ts`: a runtime-neutral handler with streaming SHA-256.
- Copy the Convex HTTP route at `convex/http.ts:39-67`.
- Copy the same-origin rewrite in `next.config.ts`, with the `MCP_MEDIA_RELAY=convex` switch, and set the switch.
- Keep Family History's own `authorizeMcpEvidenceRelay` (`convex/mediaEvidenceStorage.ts:181`) as the gate.
- Make upload addresses work on both apex and www, as Food does.
- Exclude the upload paths from the `proxy.ts` matcher. Next's proxy buffers request bodies and truncates them at 10 MB.

**2. Multipart.**
- Convex HTTP actions take about 20 MiB per body, and Family History's ceiling is 25 MB.
- Copy Plants' `lib/media/multipart.ts` (8 MiB parts) and `authorizeAiPhotoPartRelay` (`convex/mediaStorage.ts:696`).
- Rename the part hash header to `X-FamilyHistory-Part-SHA256`.

**3. Person uploads straight to storage.**
- Replace the form POST in `components/vault/MediaPrivacyReviewPanel.tsx:62-74` with: ask for an address, PUT with progress, then finalize.
- Copy Plants' `lib/media/browserUpload.ts`, `transfer.ts` (`putWithProgress`, `classifyUploadFailure`), `errors.ts`, `sha256.ts` and `finalize.ts`.
- Reuse Family History's existing begin → relay → finish session model from the MCP path (`convex/mediaEvidenceStorage.ts:118,302`), so people and AI share one route.

**4. Durable batches.**
- Family History has no IndexedDB or resume today.
- Start from Plants 2.30.0's compact pair, `lib/v2/data/queueUploadStorage.ts` and `queueUploads.ts`: two transfer lanes, `attemptRef`, a warning before closing the page, and Retry all.
- Add Buying's `src/lib/offline-capture.ts` pieces: a storage estimate, a persistent-storage request and a Web Lock.
- Add Buying's `page-presence.ts` and `upload-pace.ts`.
- Life's `planning/media-upload-recovery-buying-2026-10.md` is the checklist:
  - save before saying "queued";
  - attach each file independently;
  - resume on visibility and on reconnecting;
  - say "stalled" rather than retrying forever.

**5. Erasure.**
- Family History has no media delete. The only storage delete is on replace (`convex/vaultMutations.ts:1254`), and the B2 `"deleting"` state is declared but unused.
- Copy Buying's `convex/photoErasure.ts` order:
  1. Mark the media so nothing serves it.
  2. Check every table that can point at it.
  3. Delete it, keeping the row as the cleanup record.
- Also copy Plants' `markDeleting` / `markDeleted` (`convex/mediaControl.ts:991,1055`).
- Adapt the "still in use" walk to Family History's references: citations, sources, people, stories and Queue context. It must cover both storage backends, Convex `_storage` for person uploads and B2 for AI uploads.

**6. Prep in the browser: MIME sniffing only.**
- From Buying's `src/lib/prepare-photo.ts`, take the format sniffing for files the browser sends without a type, and the "too large" wording that names the file's own size.

Don't copy:
- Any browser downscaling, HEIC re-encoding of scans, or canvas work on PDFs or TIFFs. Family History keeps originals byte-exact (`lib/media/evidenceStandard.ts:4`), and its server already makes clean copies with location data stripped.
- Plants' photo-only allowlists (`relay.ts` JPEG/PNG/WebP, `sniffMedia`).
- Plants' plant record types in `beginUpload`.
- Plants' habit of turning a photo's capture time into the record date. Family History keeps capture time, scan time and historical date apart (`evidenceStandard.ts:45-51`).
- Buying's 100 MB "photo" ceiling, its 24-file cap and its location release.
- Plants' public and unlisted share paths. Family History media starts private.

Family History has to solve one thing itself: PDF, TIFF and HEIC files are accepted but have no preview copy. Neither sibling handles documents, so there's nothing to copy.

### Queue

- Today Family History's Queue holds text plus references to existing records (`app/api/queue/route.ts`, `components/queue/QueueWorkspace.tsx`). It has no attachments.
- Copy the composer behaviour from Buying's `src/components/queue/AskComposer.tsx`: a multi-file picker, files saved to the device outbox before the composer says "queued", and a voice note when that's wanted.
- Copy the upload strip and contract from Plants' `components/v2/queue/QueueUploads.tsx`, `lib/plants/queueUploadContract.ts` and `convex/queueUploadValidators.ts`.
- Each dropped file becomes an ordinary private media record, and the Queue item references it. It is not a separate Queue-owned file. That reuses Family History's existing review gate and erasure path.
- How that media hangs off Sources and Connections follows the building-block decisions being made in the other thread.
- If Queue items ever own files, deleting the item must release or erase them, as Buying's `photoErasure.ts:1-13` rule does.
- Don't copy Plants' 1,559-line `Composer.tsx` wholesale. Its plant encounter slots don't fit here.

### Admin and stats

Family History today has two separate allowlists:
- `ADMIN_USER_IDS` is checked in Next (`lib/auth/admin.ts`). Its refusal page tells a visitor that the page exists and names the environment variable (`app/app/api/admin/page.tsx:45`).
- `TRUST_BOUNDARY_SUPER_ADMIN_IDS` is checked in Convex (`convex/access.ts:184-191`).

It has no deployment-wide counts, no "Your stats" page and no storage totals. Each media row has `sizeBytes`, but nothing adds them up.

Copy:
- **One Convex-side allowlist** like Plants' `convex/admin.ts:10-30`. It reads the environment variable inside Convex and returns the same `null` to a signed-out visitor, a stranger and an unconfigured deployment. The admin page then shows a plain not-found with no hints.
- **Counts only.** Copy the capped, numbers-only aggregate reader (`lib/plants/admin.ts`, `AGGREGATE_SCAN_CAP`, the `OPERATIONAL_FIELDS` allowlist) and the `app/admin/{accounts,ai,storage}` pages. No family names, notes or media ever appear on admin pages.
- **Per-account storage counters**, updated in the same transaction as each upload or erasure. Plants does this with `photoOriginalBytes` / `photoCopyBytes` / `photoCount` and a per-row "counted" flag (`lib/media/photoStorage.ts`). Buying's `convex/photoStorageLedger.ts` adds a paged reconcile.
  - Count originals and copies across both storage backends.
  - Show the totals on a "Your stats" page like Plants' `app/me` with "No limit applies". The family storage standard says storage is counted before it is priced, with no quota.

Don't copy Plants' plan and Pro fields, `setPlan` or `planEvents`. Family History has no paid tier, and any change there is a money decision for the owner.

### Ideas and Usage

- Family History has nothing like this today. Its home page has a status roadmap (`components/marketing/FeatureShowcase.tsx`), not examples of use.
- The family rule (Life's `planning/assist-with-sites-core-philosophy.md`) says:
  - every home shows usage examples, with a "See more ideas" link to a public `/ideas-and-usage` page that is also linked from the profile menu;
  - the examples are fictional or public, never taken from someone's records;
  - the word "Ideas" is never used for AI Suggestions.

Copy:
- The data shape in Plants' `components/v2/marketing/ideas.ts`: rows of *what you ask*, *what your AI does*, and *what the site keeps*.
- The rotation in `components/v2/learn/rotation.ts`: three ideas a day signed out, one per visit signed in, remembered on the device only.
- The `/ideas-and-usage` page and an `/ideas` redirect.
- Seed the first rows from Life's family-history research loops (`lib/research-loops.ts:361-410`):
  - confirm a person is who you think;
  - break through a brick wall;
  - turn evidence into a story;
  - source a photograph;
  - plan a research session.
- Every right-hand cell must be something a shipped tool does today.

Don't copy:
- Plants' wording.
- Its "Coming later" list.
- Life's "Keep a family history straight" loop (`:655`), which is about health history, not genealogy.

### Table, Grid and List views

Family History has no shared list component and no view switch anywhere:
- People and Places are card grids with a search box.
- Operations is the only table.
- Stories, research tasks, the research log and every tab on a person or place page are plain lists with no search, sort or filter.

Copy:
- **From Plants' `components/v2/list-engine/types.ts` and `filter-bar/`: the config shape, not the code.**
  - Columns, with `unknown` values sorted last in both directions.
  - One row view that feeds all three views.
  - Filter families whose counts are worked out after the other filters are applied, so the counts are honest.
  - Filters kept in the URL.
  - Search text never remembered.
  - Rebuild it small, in Family History's Tailwind and shadcn components, under `components/collection/`.
- **From Scriptures' `components/collections/state.ts` (62 lines), almost verbatim.**
  - It keeps a desktop view and a separate phone view below 900 px, and the phone view defaults to List.
  - Views are stored per device, with an in-memory fallback.
  - Rename the key prefix and the event.
  - Fix its server default so phones don't flash Table while the page loads.
- **Remembered columns per device to start.** Plants keeps view memory per person on the server in a `surfaceStates` table. Add that later if people ask for it to follow them across devices.

Honest counts need care here. People and Operations filter on the server with a `limit`, so counts made in the browser would only count the loaded rows. Either the counts come from Convex, or the page says what they cover.

Adopt in this order:
1. People.
2. Operations (it already has a table and server sorting).
3. Queue.
4. Places.
5. Sources and Media on a person's page, where Grid suits media.
6. Stories and the research log.

Building-block pages (trees, Projects, Questions, Sources) get the same component once their shape is decided.

Don't copy:
- Plants' domain surfaces (`surfaces.tsx`, `catalogSurfaces.tsx` and the others).
- Its data port.
- The peek panel and bulk actions, until a page needs them.
- The `v2-*` CSS.
- No family site uses TanStack, so don't add it.

### /updates

Family History already has a typed release list: `lib/releaseNotes.ts`, rendered by `app/updates/page.tsx`. Its type is stronger than Plants' untyped list or Scriptures' version-less one. The problem is that it's stale:
- `appVersion` is hard-coded to `"2.1.0"`, and `package.json` says 2.1.0.
- The newest entry is v2.2.0 on 17 August.
- `main` has shipped MCP readiness, OAuth issuer support and the family branding since then, with no entry.

That's the same problem the owner saw in Buying and Scriptures.

Copy:
- Buying's `appVersion` read from `package.json` (`src/lib/releases.ts:15`), so the newest entry can't drift from the package version.
- Plants' `components/v2/updates/updates.test.tsx` checks: every entry has a version and a date, and the page renders from the list.
- Add a release check: the top entry's version must equal `package.json`, and a release PR that bumps the version without a new entry fails.
- Keep Family History's four release states. They match the family's.
- A release isn't done until its `/updates` entry is live on production. Read it back after the deploy, alongside the MCP probe in decision 3.

Don't copy Scriptures' entries without versions, or Plants' untyped release blob.

## For the owner

**Does approving a new AI connection need a second step?** The family standard's Core ruling is *Allow completes setup*: once a person signs in and clicks Allow, ordinary private reads and writes work. Family History instead holds every new connection at a pending grant until the person approves it again at `/app/settings/ai` (`lib/mcp/authorize.ts:88-94`, and the `GRANT_REQUIRED` text in `/ai.txt`). That extra step may be deliberate, because family records include living people. It is a product and privacy choice, so it isn't changed here. **Decided 6 October 2026:** Scott chose the family rule (signing in approves the AI), with living-person and private-memory records unreadable to the AI until reviewed. See the [Site Guide decisions](site-guide.md#decisions).

## Suggested order

1. Next.js ≥ 16.4.0 and the Convex upgrade, then Clerk 7 in its own PR.
2. The upload relay, multipart, and direct person uploads. This matches the earlier audit's upload size test.
3. Host guard plus the post-deploy probe on both hosts, and the 401/503/403 split with identity scopes.
4. Catch `/updates` up, and add the version check.
5. The shared view component on People, then Operations.
6. Erasure and storage counters, then admin counts and Your stats.
7. Ideas and Usage.
8. Queue attachments, once the Sources and media building block is settled.
