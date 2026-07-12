# Discover Their Stories

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

**A Family History AI Toolset** - Go beyond names and dates. Research deeply, tell stories, create content.

![Discover Their Stories Homepage](https://img.shields.io/badge/Status-Active%20Development-brightgreen)

## 🌟 Overview

Discover Their Stories is a platform for family historians who want to go beyond collecting names and dates. It transforms genealogical data into compelling narratives using AI assistance.

### Key Principles

- **🔍 Research Depth** - Understand context, not just collect facts
- **📖 Storytelling First** - Turn data into compelling narratives  
- **🎨 Content Creation** - Photos, documents, timelines, and shareable stories
- **🤖 AI Assistance** - Leverage modern AI for analysis and synthesis
- **🔒 Privacy First** - Structured vault data lives in Convex, while raw artifacts and exports stay on your machine

## ✨ Features

### Research Vault And Story Workflow (Available Now)

Capture FamilySearch data, merge it into a canonical vault, and move from evidence to story drafts from one person workspace:

| Output | Description |
|--------------|-------------|
| **Raw Evidence Document** | Complete, lossless capture of all source data (deterministic, no AI) |
| **Contextualized Dossier** | AI-assisted synthesis that identifies patterns, conflicts, and research opportunities |
| **Context Pack** | AI-ready package of evidence, places, memories, relationships, and research gaps |
| **Story Drafts** | Short and long narrative drafts generated from researched person context |

#### How It Works

1. **Extract** - Use the browser extension to capture sources from FamilySearch
2. **Import** - Upload the capture package JSON to the Imports workspace
3. **Organize** - Open the person workspace to review sources, places, memories, documents, and research tasks
4. **Research** - Use the operations queue and research log to find gaps, weak evidence, and next actions
5. **Write** - Draft stories from context packs and save outputs back to the vault

### Available Next

- 📷 **Photo Analyzer** - Extract context and dates from old photographs
- 📅 **Timeline Builder** - Visual timelines synthesized from sources
- 🎯 **Research Assistant** - Turn evidence gaps into next actions, prompts, and research plans
- 🌐 **Shareable Ancestor Pages** - Publish researched ancestor stories with supporting context

## 🚀 Getting Started

### Prerequisites

- Node.js 20 (see `.nvmrc`)
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/scottjarvie/discover-their-stories.git
cd discover-their-stories

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3443](http://localhost:3443) to see the app.

### Browser Extension Setup

The browser extension is located in the `/extension` folder:

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `/extension` folder
4. Navigate to a FamilySearch person's sources or memories page (for example `familysearch.org/tree/person/sources/XXXX-XXX`)
5. Click the extension icon to start extraction

## 📁 Project Structure

```
discover-their-stories/
├── app/                    # Next.js App Router pages
│   ├── app/               # App routes (dashboard, tools)
│   ├── features/          # Feature marketing pages
│   ├── about/             # About page
│   ├── roadmap/           # Roadmap page
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/                # ShadCN UI components
│   ├── layout/            # Layout components (nav, sidebar, footer)
│   └── marketing/         # Marketing page components
├── docs/                  # Product, setup, operations, and archived notes
│   ├── archive/           # Historical implementation notes and old plans
│   ├── convex/            # Convex integration and schema docs
│   ├── deployment/        # Deployment checklists
│   ├── importing/         # FamilySearch import/extractor docs
│   └── product/           # Vision and product direction
├── convex/                # Convex backend (GEDCOM X data model)
│   ├── schema.ts          # Data model following GEDCOM X
│   ├── persons.ts         # Person operations
│   ├── relationships.ts   # Relationship operations
│   ├── events.ts          # Event operations
│   ├── sources.ts         # Source/citation operations
│   └── helpers.ts         # Helper functions
├── features/              # Feature modules
│   └── source-docs/       # Legacy source-document routes and generators
│       ├── components/    # Feature-specific components
│       └── lib/           # Schemas, generators, utils
├── lib/                   # Shared utilities
│   ├── storage/           # Raw artifact and export storage layer
│   └── ai/                # OpenRouter integration
├── extension/             # Chrome browser extension (MV3)
│   ├── content/           # Content scripts for extraction
│   ├── popup/             # Extension popup UI
│   └── lib/               # Capture package schema and import helpers
├── scripts/               # One-off import, audit, and maintenance scripts
└── data/                  # Local artifacts and exports (gitignored)
    └── source-docs/       # Legacy artifact retention for captures and documents
        └── {personId}/    # Per-person folder
            └── runs/      # Versioned extraction runs
```

See [docs/README.md](docs/README.md) for the full documentation index.

## 📊 Data Model (GEDCOM X)

This project uses the **GEDCOM X data model** adapted for Convex's document-oriented storage. Key differences from traditional genealogy software:

### Relationship-Based (Not Family-Based)

**Traditional approach:**
```
Family entity contains:
  - Husband
  - Wife
  - Children[]
```

**Our approach (GEDCOM X):**
```
Relationships are direct Person↔Person:
  - Couple (John ↔ Mary)
  - ParentChild (John → Child1, Mary → Child1)
  - ParentChild (John → Child2, Mary → Child2)
```

**Why this is better:**
- ✅ Handles remarriages cleanly (multiple Couple relationships)
- ✅ Step-families (ParentChild with type "Step")
- ✅ Adoptions (ParentChild with type "Adopted")
- ✅ Unknown parents (one-sided relationships)
- ✅ Same-sex couples (no husband/wife designation)
- ✅ Complex family situations without workarounds

### Embedded Facts for Performance

Common facts (birth, death) are **embedded on Person records** for fast reads:
```typescript
person.birth.date.year  // Fast: no join needed
person.death.place.original  // Fast: no join needed
```

These facts are **also stored in the events table** for:
- Complex queries (all births in a year)
- Multiple witnesses/participants
- Events without a known person yet

### Evidence vs. Conclusion

Citations distinguish **evidence** (raw from records) from **conclusions** (researcher's interpretation):
- `citation.isEvidence = true` → Verbatim from a census, birth certificate, etc.
- `citation.isEvidence = false` → Researcher's conclusion combining multiple sources

This follows the **Genealogical Proof Standard** and enables AI to distinguish between source data and inferences.

### FamilySearch Integration

Every entity tracks its FamilySearch ID for bi-directional sync:
- `person.fsId` → FamilySearch Person ID
- `relationship.familySearchId` → FamilySearch Relationship ID
- `source.fsId` → FamilySearch Source ID

The `familySearchSync` table tracks:
- When each person was last synced
- What changed (local vs. remote)
- Conflict detection (simultaneous edits)

### Core Entities

| Entity | Purpose | GEDCOM X Equivalent |
|--------|---------|---------------------|
| **Person** | Individual (living or deceased) | Person |
| **Relationship** | Direct Person↔Person link (Couple, ParentChild) | Relationship |
| **Event** | Standalone events (census, occupation, etc.) | Event |
| **Place** | Hierarchical place descriptions | PlaceDescription |
| **Source** | Top-level source (book, census, etc.) | SourceDescription |
| **Citation** | Specific reference within source | SourceReference |
| **Story** | AI-generated or user-written narratives | *(our extension)* |
| **ResearchTask** | AI-suggested research tasks | *(our extension)* |
| **FamilySearchSync** | Sync state per person | *(our extension)* |

## ⚙️ Configuration

All environment variables are documented in [`.env.example`](.env.example) — copy it to `.env.local` and fill in your values. That file is the source of truth for variable names and defaults.

### OpenRouter API Key

To use in-app AI processing:

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Open **Settings** in the app (`/app/settings`)
3. Enter your API key and click **Save**
4. Select your preferred AI model (Claude, GPT-4o, Gemini, etc.)

### Privacy Controls

- **Auto-redact sensitive info** - Automatically removes emails, phone numbers, addresses before AI processing
- **Living person detection** - Warns when data may contain living individuals
- **Original vs Redacted toggle** - Choose which version to send to AI

### Admin Mode

For development/testing, enable Admin Mode in Settings:
- Faster extraction pacing (no delays)
- No expansion caps
- Testing features enabled

### Authentication (Clerk)

Sign-in is powered by Clerk, and the auth posture is driven entirely by environment variables. The logic lives in `lib/clerk/config.ts` (the `isClerkEnabled` / `isAnonymousVaultEnabled` predicates) and the route gating lives in `proxy.ts` (the Next.js middleware export), **not** in a `middleware.ts` file. `.env.example` is the source of truth for the variable names.

**When is Clerk active?** `isClerkEnabled()` returns true only when all of these hold:

- A publishable key starting with `pk_` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) **and** a secret key starting with `sk_` (`CLERK_SECRET_KEY`) are both present. With the keys present, Clerk auto-enables.
- Clerk is **not** explicitly disabled. Setting `DISABLE_CLERK=true` or `NEXT_PUBLIC_DISABLE_CLERK=true` turns Clerk off even when keys are present.
- In **local development** (`NODE_ENV=development`), Clerk stays off unless you opt in with `ENABLE_CLERK_DEV=true` or `NEXT_PUBLIC_ENABLE_CLERK_DEV=true`. This keeps local work key-free by default; the dev opt-in does not affect deployed builds.

**Route protection and guest vaults.** Gating in `proxy.ts` is governed by two more flags:

- `REQUIRE_AUTH=true` forces sign-in on `/app` and protected API routes (the `PROTECTED_ROUTE_PATTERNS`).
- `ALLOW_ANONYMOUS_VAULT` (or `NEXT_PUBLIC_ALLOW_ANONYMOUS_VAULT`) governs guest-vault posture. When anonymous vaults are **not** enabled, protected routes require sign-in. When enabled, signed-out visitors get a cookie-backed guest vault instead. Guest vaults are off by default — enable only for an explicit preview deployment.

When Clerk keys are absent, `proxy.ts` short-circuits to a pass-through and no auth runs at all.

**Convex tenant boundary.** Private Convex calls also carry a Clerk JWT from
`getAuthedConvexClient()`; the backend verifies that token and the requested
vault owner before touching family data. `TRUST_BOUNDARY_MODE` defaults to
`shadow`, where would-be denials are recorded for rollout analysis, and the
exact value `enforce` makes them fail closed. Set the same server-only mode in
Vercel and Convex. Enforcement also requires
`CLERK_JWT_ISSUER_DOMAIN`, `REQUIRE_AUTH=true`, and anonymous vaults off.
See the [guarded rollout runbook](docs/operations/gen-87-clerk-convex-auth-setup.md).

The only anonymous Convex data reads are published-story lookups. Convex checks
published status and applies the public redacted DTO itself; the Next route is
not trusted to enforce that rule.

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router, webpack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Components | ShadCN UI |
| Validation | Zod |
| AI Integration | OpenRouter API |
| Storage | Convex (canonical structured graph) + local artifacts |
| Extension | Chrome Manifest V3 |

## 🔒 Data Privacy

Your data stays with you:

- ✅ Canonical structured data can live in Convex while raw artifacts and exports remain local
- ✅ Nothing sent to external servers without explicit action
- ✅ Sensitive information auto-redacted before AI processing
- ✅ Export everything in readable formats (JSON, Markdown)
- ✅ Minimal tracking; sign-in is via Clerk and the auth posture is configurable (see [Authentication](#authentication-clerk)). Deployed beta requires sign-in by default.

## 📋 Compliance Note

This tool is designed to work with FamilySearch in a compliance-friendly manner:

- ✅ User-initiated extraction only (no automated scraping)
- ✅ Paced operations with built-in delays
- ✅ Read-only behavior (no modifications to FamilySearch)
- ✅ Clear consent before data capture
- ✅ Follows FamilySearch plugin guidance

Please ensure you comply with [FamilySearch's Terms of Use](https://www.familysearch.org/legal/terms) when using this tool.

## 🗺️ Roadmap

### Phase 1: Foundation ✅
- [x] Platform setup (Next.js, Tailwind, ShadCN)
- [x] Marketing website
- [x] App dashboard with sidebar navigation
- [x] Settings page with API key management
- [x] Browser extension skeleton

### Phase 2: Research Vault ✅
- [x] Capture package schema and compatibility mapping
- [x] Imports workspace and person/place vault views
- [x] Raw document and contextualized dossier generation
- [x] Context-pack export
- [x] AI processing pipeline (3 stages)
- [x] Research operations queue and research log
- [x] Story Writer v1 handoff

### Phase 3: Story Studio (Current)
- [x] Story Writer v1
- [ ] Narrative templates
- [ ] Shareable ancestor story pages
- [ ] Timeline visualization

### Phase 4: Research Assistant And Side Tools
- [ ] Photo Analyzer
- [ ] Research Assistant
- [ ] Place and era context researcher
- [ ] Collaboration features

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Contact

Created by [@scottjarvie](https://github.com/scottjarvie)

---

*Discover Their Stories - Because every ancestor has a story worth telling.*
