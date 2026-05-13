# Convex Setup - Discover Their Stories

✅ **Convex has been installed and configured!**

## What Was Created

### 1. Package Installation
- Added `convex` package to dependencies
- Installed via pnpm

### 2. Schema (`convex/schema.ts`)
Implemented the full database schema based on the Gramps genealogy model:

**Core Tables:**
- `persons` — Individual people (name, sex, fsId, living, researchStatus, tags)
- `families` — Couple units linking two persons + children
- `events` — Life events (birth, death, marriage, etc.) with date and place
- `personEvents` — Junction linking persons to events with roles
- `places` — Hierarchical locations (city → state → country)
- `sources` — Original documents/records
- `citations` — Specific references within sources, with raw + edited text
- `citationLinks` — Junction linking citations to what they prove
- `media` — Photos, documents, scans
- `researchTasks` — Track research status per ancestor
- `stories` — AI or human narratives about ancestors
- `historicalContext` — Reusable place/time period context

**All tables include:**
- Proper TypeScript validators (using `v` from convex/values)
- Appropriate indexes for efficient queries
- FamilySearch ID indexes for integration
- Foreign key indexes for fast joins

### 3. API Functions

**`persons.ts`** — Person management
- create, get, getByFsId, list, search, update, remove

**`events.ts`** — Event management
- create, get, list, getForPerson, linkPerson, unlinkPerson, update, remove

**`sources.ts`** — Source document management
- create, get, getByFsId, list, update, remove

**`citations.ts`** — Citation management
- create, get, getForSource, getForTarget, list, linkToTarget, unlinkFromTarget, update, remove

**`ancestorDetails.ts`** — Comprehensive queries
- getAncestorWithDetails — Returns person with all events, citations, media, families, research tasks, and stories
- searchAncestors — Search with basic preview info (birth/death years)

**`helpers.ts`** — Utility functions
- createPersonWithBirth — Create person and birth event in one transaction
- createFamilyWithMarriage — Create family with marriage event
- addChildToFamily / removeChildFromFamily — Family management
- createHierarchicalPlace — Create nested place structure (city → state → country)

### 4. Configuration Files
- `convex/tsconfig.json` — TypeScript configuration for Convex
- `convex/README.md` — Comprehensive documentation
- Updated `.gitignore` to exclude Convex generated files

## Next Steps (DO NOT DO YET)

### 1. Initialize Convex Project
```bash
cd ~/IDE/discover-their-stories
npx convex init
```

This will:
- Create a Convex account (or link to existing)
- Set up your project in the Convex dashboard
- Generate `.env.local` with your deployment URL
- Create `convex/_generated/` directory with TypeScript types

### 2. Start Development Server
```bash
npx convex dev
```

This will:
- Start the Convex backend in development mode
- Watch for changes and auto-deploy
- Generate TypeScript types for your queries/mutations

### 3. Configure Next.js App

Update `app/layout.tsx` to wrap your app with ConvexProvider:

```typescript
import { ConvexProvider } from "convex/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ConvexProvider client={convex}>
          {children}
        </ConvexProvider>
      </body>
    </html>
  );
}
```

### 4. Deploy to Production (when ready)
```bash
npx convex deploy
```

## Example Usage

### Create a Person with Birth Event
```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const createPerson = useMutation(api.helpers.createPersonWithBirth);

const result = await createPerson({
  name: { given: "John", surname: "Smith" },
  sex: "male",
  living: false,
  birthDate: { year: 1850, month: 6, day: 15 },
});
```

### Get Comprehensive Ancestor Details
```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const ancestorDetails = useQuery(api.ancestorDetails.getAncestorWithDetails, {
  personId: "j97ab2c3d4e5f6g7h8i9j0k1",
});

// Returns:
// {
//   person: { ... },
//   events: [ ... ],  // with places and citations
//   citations: [ ... ],  // with sources
//   families: [ ... ],  // with partners and children
//   media: [ ... ],
//   researchTasks: [ ... ],
//   stories: [ ... ]
// }
```

### Search for Ancestors
```typescript
const searchResults = useQuery(api.ancestorDetails.searchAncestors, {
  query: "Smith",
  limit: 20,
});

// Returns persons with birth/death years for preview
```

## Schema Features

✅ **Event-Based Model** — Birth, death, marriage as first-class events (like Gramps)  
✅ **Source → Citation Two-Tier** — Sources are documents; citations are specific extracts  
✅ **Hierarchical Places** — Places link to parent places (city → state → country)  
✅ **Multi-Source Support** — Any fact can link to multiple citations  
✅ **Research Tracking** — researchStatus, researchPriority, researchTasks  
✅ **FamilySearch Integration** — fsId fields with indexes for lookups  
✅ **AI Story Generation** — First-class stories table  
✅ **Historical Context** — Reusable context snippets for places/time periods  
✅ **GEDCOM Compatible** — Schema maps to GEDCOM 7.0 for import/export

## Files Created

```
convex/
├── README.md                 # Documentation
├── ancestorDetails.ts        # Comprehensive query functions
├── citations.ts              # Citation CRUD + linking
├── events.ts                 # Event CRUD + person linking
├── helpers.ts                # Utility functions
├── persons.ts                # Person CRUD + search
├── schema.ts                 # Full database schema
├── sources.ts                # Source CRUD
└── tsconfig.json             # TypeScript config
```

## Database Design Notes

- All tables have `createdAt` and `updatedAt` timestamps
- Junction tables (personEvents, citationLinks) enable many-to-many relationships
- Indexes are optimized for common query patterns
- FamilySearch ID fields allow integration with FamilySearch API
- The schema supports both raw data extraction and human-edited versions

---

**Status:** ✅ Schema and functions created  
**Next:** Run `npx convex init` when ready to deploy
