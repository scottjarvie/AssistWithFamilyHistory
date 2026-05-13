# Convex Deployment Checklist

When you're ready to start using Convex, follow these steps in order:

## Step 1: Initialize Convex Project
```bash
cd ~/IDE/discover-their-stories
npx convex init
```

**What happens:**
- Prompts you to create/link Convex account
- Creates `.env.local` with `NEXT_PUBLIC_CONVEX_URL`
- Generates `convex/_generated/` directory with TypeScript types
- Sets up Convex dashboard access

**Expected output:**
```
✔ Created .env.local with NEXT_PUBLIC_CONVEX_URL
✔ Generated convex/_generated/
✔ Your Convex deployment: https://your-app.convex.cloud
```

## Step 2: Start Development Server
```bash
npx convex dev
```

**What happens:**
- Pushes schema to Convex
- Creates all 12 tables with indexes
- Starts watching for changes
- Opens Convex dashboard in browser

**Expected output:**
```
✔ Deployed schema
✔ Created 12 tables
✔ Created 30+ indexes
✔ Dashboard: https://dashboard.convex.dev/...
```

**Leave this running!** It auto-deploys changes as you edit files.

## Step 3: Verify Schema in Dashboard

In the Convex dashboard (opened automatically):

1. **Tables tab** — Verify all 12 tables exist:
   - [ ] persons
   - [ ] families
   - [ ] events
   - [ ] personEvents
   - [ ] places
   - [ ] sources
   - [ ] citations
   - [ ] citationLinks
   - [ ] media
   - [ ] researchTasks
   - [ ] stories
   - [ ] historicalContext

2. **Functions tab** — Verify API functions:
   - [ ] persons: create, get, getByFsId, list, search, update, remove
   - [ ] events: create, get, list, getForPerson, linkPerson, unlinkPerson, update, remove
   - [ ] sources: create, get, getByFsId, list, update, remove
   - [ ] citations: create, get, getForSource, getForTarget, list, linkToTarget, unlinkFromTarget, update, remove
   - [ ] ancestorDetails: getAncestorWithDetails, searchAncestors
   - [ ] helpers: createPersonWithBirth, createFamilyWithMarriage, addChildToFamily, removeChildFromFamily, createHierarchicalPlace

3. **Test a query** — Run in dashboard:
   ```javascript
   api.persons.list({ limit: 10 })
   ```
   Should return `[]` (empty array, no data yet)

## Step 4: Set Up Next.js Integration

### 4a. Create ConvexProvider Component

Create `components/convex-client-provider.tsx`:

```typescript
"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

### 4b. Update Root Layout

Edit `app/layout.tsx`:

```typescript
import { ConvexClientProvider } from "@/components/convex-client-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

### 4c. Restart Next.js Dev Server

```bash
pnpm dev
```

If you see Convex errors, check:
- [ ] `.env.local` exists with `NEXT_PUBLIC_CONVEX_URL`
- [ ] `npx convex dev` is still running
- [ ] ConvexClientProvider is properly wrapped around children

## Step 5: Create Your First Component

Create a test component to verify everything works:

`components/person-list-test.tsx`:

```typescript
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function PersonListTest() {
  const persons = useQuery(api.persons.list, { limit: 10 });
  const createPerson = useMutation(api.helpers.createPersonWithBirth);

  const handleCreate = async () => {
    await createPerson({
      name: { given: "Test", surname: "Person" },
      sex: "unknown",
      living: false,
      birthDate: { year: 1850 },
    });
  };

  if (persons === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <button onClick={handleCreate}>Create Test Person</button>
      <h2>Persons ({persons.length})</h2>
      <ul>
        {persons.map((p) => (
          <li key={p._id}>
            {p.name.given} {p.name.surname}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Add it to a page and test:
- [ ] Click "Create Test Person" button
- [ ] Person appears in list immediately (real-time update!)
- [ ] Check Convex dashboard — person should be in `persons` table

## Step 6: Test Core Functionality

In the Convex dashboard, run these queries to verify:

### Create a person
```javascript
api.helpers.createPersonWithBirth({
  name: { given: "John", surname: "Smith" },
  sex: "male",
  living: false,
  birthDate: { year: 1850, month: 6, day: 15 }
})
```

### Search for the person
```javascript
api.persons.search({ query: "Smith" })
```

### Get comprehensive details
```javascript
api.ancestorDetails.getAncestorWithDetails({
  personId: "j97..." // Use the ID from create result
})
```

All should work without errors.

## Step 7: Production Deployment

When ready for production:

```bash
npx convex deploy --prod
```

**What happens:**
- Creates a production deployment (separate from dev)
- Pushes schema to production
- Generates production URL in `.env.local`

**Update Vercel/deployment:**
- Add `NEXT_PUBLIC_CONVEX_URL` environment variable with the production URL
- Redeploy your Next.js app

## Troubleshooting

### "No Convex URL found"
- Run `npx convex init` first
- Check `.env.local` has `NEXT_PUBLIC_CONVEX_URL`
- Restart dev server

### "Function not found"
- Make sure `npx convex dev` is running
- Check `convex/_generated/api.d.ts` exists
- Verify function name matches file/export

### "Schema validation error"
- Check function args match validators in code
- Use TypeScript — it catches most issues

### Types not updating
- Restart `npx convex dev`
- Check `convex/_generated/` directory exists
- Restart TypeScript server in VS Code

## Success Checklist

- [ ] `npx convex init` completed
- [ ] `npx convex dev` running (leave it running!)
- [ ] Dashboard shows all 12 tables
- [ ] Dashboard shows 60+ functions
- [ ] `.env.local` has Convex URL
- [ ] ConvexClientProvider added to layout
- [ ] Test component can query/mutate data
- [ ] Real-time updates work (create person, see it appear)
- [ ] TypeScript autocomplete works for api.persons.*, etc.

## Next Steps After Deployment

1. **Import FamilySearch data** — Use createPersonWithBirth helper
2. **Build UI components** — See `docs/convex/nextjs-integration.md`
3. **Add research workflow** — Use researchTasks table
4. **Generate stories** — Use stories table with AI
5. **Deploy to production** — `npx convex deploy --prod`

---

**Current Status:** Schema ready, waiting for initialization  
**Next Command:** `npx convex init`
