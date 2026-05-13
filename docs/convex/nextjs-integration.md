# Next.js Integration Guide

## 1. Environment Setup

After running `npx convex init`, you'll have a `.env.local` file with:

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

This URL is automatically used by the Convex client.

## 2. Root Layout Setup

Update `app/layout.tsx` to provide Convex to your entire app:

```typescript
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-client-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## 3. Convex Provider Component

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

**Why?** This wraps the client-side Convex setup in a separate component so your layout can stay server-side.

## 4. Using Queries in Components

### Client Component (useQuery)

```typescript
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function PersonList() {
  const persons = useQuery(api.persons.list, { living: false });

  if (persons === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {persons.map((person) => (
        <li key={person._id}>
          {person.name.given} {person.name.surname}
        </li>
      ))}
    </ul>
  );
}
```

### Server Component (fetchQuery)

```typescript
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function PersonListPage() {
  const persons = await fetchQuery(api.persons.list, { living: false });

  return (
    <ul>
      {persons.map((person) => (
        <li key={person._id}>
          {person.name.given} {person.name.surname}
        </li>
      ))}
    </ul>
  );
}
```

**Note:** `fetchQuery` fetches once at build/request time. `useQuery` subscribes to real-time updates.

## 5. Using Mutations

```typescript
"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function CreatePersonForm() {
  const createPerson = useMutation(api.helpers.createPersonWithBirth);
  const [given, setGiven] = useState("");
  const [surname, setSurname] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await createPerson({
        name: { given, surname },
        sex: "unknown",
        living: false,
        birthDate: { year: 1850 },
      });
      
      console.log("Created person:", result.personId);
      setGiven("");
      setSurname("");
    } catch (error) {
      console.error("Failed to create person:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Given name"
        value={given}
        onChange={(e) => setGiven(e.target.value)}
      />
      <input
        type="text"
        placeholder="Surname"
        value={surname}
        onChange={(e) => setSurname(e.target.value)}
      />
      <button type="submit">Create Person</button>
    </form>
  );
}
```

## 6. Optimistic Updates

For instant UI updates before server confirmation:

```typescript
const updatePerson = useMutation(api.persons.update);
const person = useQuery(api.persons.get, { id: personId });

const handleUpdate = async () => {
  // UI updates instantly, then syncs with server
  await updatePerson({
    id: personId,
    researchStatus: "thorough",
  });
};
```

## 7. Loading States

```typescript
const persons = useQuery(api.persons.list, {});

if (persons === undefined) {
  return <Skeleton />;  // Loading
}

if (persons.length === 0) {
  return <EmptyState />;  // No data
}

return <PersonList persons={persons} />;  // Data loaded
```

## 8. Error Handling

```typescript
const createPerson = useMutation(api.persons.create);
const [error, setError] = useState<string | null>(null);

const handleCreate = async (data: any) => {
  try {
    setError(null);
    await createPerson(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  }
};

{error && <div className="error">{error}</div>}
```

## 9. Real-Time Updates

Convex automatically keeps your UI in sync:

```typescript
// Component A: Creates a person
const createPerson = useMutation(api.persons.create);
await createPerson({ ... });

// Component B: List of persons
const persons = useQuery(api.persons.list, {});
// This automatically updates when Component A creates a person!
```

## 10. Type Safety

All queries and mutations are fully typed:

```typescript
const person = useQuery(api.persons.get, { id: personId });
// person is typed as Doc<"persons"> | null | undefined

const createPerson = useMutation(api.helpers.createPersonWithBirth);
// Arguments are type-checked against the function definition
```

## 11. Pagination Example

```typescript
const [limit, setLimit] = useState(50);
const persons = useQuery(api.persons.list, { limit });

return (
  <>
    <PersonList persons={persons} />
    <button onClick={() => setLimit(limit + 50)}>Load More</button>
  </>
);
```

## 12. Search Example

```typescript
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function PersonSearch() {
  const [query, setQuery] = useState("");
  const results = useQuery(api.persons.search, { query, limit: 20 });

  return (
    <div>
      <input
        type="search"
        placeholder="Search by name or FamilySearch ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results && (
        <ul>
          {results.map((person) => (
            <li key={person._id}>
              {person.name.given} {person.name.surname}
              {person.fsId && <span> ({person.fsId})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## 13. Comprehensive Ancestor View

```typescript
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function AncestorProfile({ personId }: { personId: Id<"persons"> }) {
  const data = useQuery(api.ancestorDetails.getAncestorWithDetails, { personId });

  if (!data) return <div>Loading...</div>;

  const { person, events, citations, families, media, researchTasks, stories } = data;

  return (
    <div className="ancestor-profile">
      <h1>
        {person.name.given} {person.name.surname}
      </h1>
      
      <section>
        <h2>Life Events</h2>
        <ul>
          {events.map((event) => (
            <li key={event._id}>
              <strong>{event.type}</strong>
              {event.date && ` - ${event.date.year}`}
              {event.place && ` in ${event.place.fullName}`}
              {event.citations.length > 0 && (
                <div className="citations">
                  {event.citations.map((cite) => (
                    <div key={cite._id}>
                      Source: {cite.source?.title}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Families</h2>
        {families.map((family) => (
          <div key={family._id}>
            <h3>
              {family.partner1?.name.given} & {family.partner2?.name.given}
            </h3>
            <ul>
              {family.children.map((child) => (
                <li key={child._id}>
                  {child.name.given} {child.name.surname}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>Research Tasks</h2>
        <ul>
          {researchTasks.map((task) => (
            <li key={task._id}>
              [{task.status}] {task.title}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Stories</h2>
        {stories.map((story) => (
          <article key={story._id}>
            <h3>{story.title}</h3>
            <div dangerouslySetInnerHTML={{ __html: story.content }} />
          </article>
        ))}
      </section>
    </div>
  );
}
```

## 14. Authentication (Future)

When you add auth, wrap the provider:

```typescript
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

Then in your mutations, use `ctx.auth`:

```typescript
export const create = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Unauthorized");
    // ...
  },
});
```

## Next Steps

1. ✅ Schema and functions are ready
2. ⏳ Run `npx convex init` to set up your Convex project
3. ⏳ Run `npx convex dev` to start development
4. ⏳ Create the ConvexClientProvider component
5. ⏳ Build your first UI component using useQuery
6. ⏳ Test creating/reading data
7. ⏳ Deploy with `npx convex deploy` when ready for production
