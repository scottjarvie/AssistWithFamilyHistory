# Assist With Family History

A durable, user-controlled research-to-story workspace. The person and their
own AI keep the people, how they are related, the sources behind every
important detail, the open questions and the stories that come from it all.
The site stores, organizes and shows what they save, and offers tools a
connected AI can use ("Bring your AI"). It has no AI of its own.

Product truth lives in the [Site Guide](docs/planning/site-guide.md). Current
work lives in the [tracker](docs/tracker/GUIDE.md). Agent rules are in
[AGENTS.md](AGENTS.md).

## Run it locally

```bash
pnpm install
pnpm dev:sandbox    # http://family-history.localhost:3443, synthetic records
pnpm verify         # the full local check before any push
```

`pnpm dev:sandbox` needs the sandbox environment file first; see
[Local Live and Sandbox](docs/operations/local-development.md).
`pnpm preview:local` is the lighter preview. Merging to `main` deploys
production; see [How production deploys](docs/operations/how-production-deploys.md).

## Where things live

| Folder | What is there |
| --- | --- |
| `app/` | Next.js routes: signed-in pages under `app/app/`, API routes under `app/api/`, public pages (home, stories, `/ai.txt`, `/updates`) beside them |
| `convex/` | Backend: schema, reads, writes and the AI connector (see [convex/README.md](convex/README.md)) |
| `components/` | Screens by area (`vault/`, `queue/`, `ai/`, `marketing/`, `records/`) |
| `lib/` | Shared logic: FamilySearch capture and import, MCP grants, media storage, Queue |
| `extension/` | The Chrome capture extension |
| `features/` | Feature-level tests and fixtures |
| `scripts/` | Contract checks run by `pnpm verify`, plus local tooling |
| `tests/` | Playwright specs and shared fixtures |
| `docs/` | Site Guide, tracker, runbooks and audits ([index](docs/README.md)) |
| `design-council/` | A finished design review round, kept for reference |
