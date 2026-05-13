# Convex Quick Reference - Discover Their Stories

## Common Patterns

### Creating a Complete Person Record

```typescript
// 1. Create the person with birth event
const { personId, birthEventId } = await createPersonWithBirth({
  name: { given: "John", surname: "Smith" },
  sex: "male",
  living: false,
  fsId: "KWH1-1K7",
  birthDate: { year: 1850, month: 6, day: 15, approximate: false },
  birthPlaceId: scotlandPlaceId,
  birthDescription: "Born in Bathgate, Scotland",
});

// 2. Add more events
const deathEventId = await createEvent({
  type: "death",
  date: { year: 1920, month: 12, day: 3 },
  placeId: utahPlaceId,
});

await linkPerson({
  personId,
  eventId: deathEventId,
  role: "primary",
});

// 3. Add a source and citation
const sourceId = await createSource({
  title: "1860 United States Census",
  type: "census",
  repository: "FamilySearch",
  url: "https://familysearch.org/...",
});

const citationId = await createCitation({
  sourceId,
  page: "Page 4, Line 6",
  confidence: "high",
  extractedText: "John Smith, age 10, b. Scotland",
  editedText: "John Smith (age 10) was born in Scotland.",
});

// 4. Link citation to the birth event
await linkToTarget({
  citationId,
  targetType: "event",
  targetId: birthEventId,
});
```

### Creating a Family

```typescript
// Create husband and wife
const husbandId = await createPersonWithBirth({
  name: { given: "John", surname: "Smith" },
  sex: "male",
  living: false,
  birthDate: { year: 1850 },
});

const wifeId = await createPersonWithBirth({
  name: { given: "Mary", surname: "Jones" },
  sex: "female",
  living: false,
  birthDate: { year: 1852 },
});

// Create family with marriage
const { familyId, marriageEventId } = await createFamilyWithMarriage({
  partner1Id: husbandId.personId,
  partner2Id: wifeId.personId,
  marriageDate: { year: 1870, month: 6, day: 15 },
  marriagePlaceId: scotlandPlaceId,
});

// Add children
const childId = await createPersonWithBirth({
  name: { given: "Robert", surname: "Smith" },
  sex: "male",
  living: false,
  birthDate: { year: 1871 },
});

await addChildToFamily({
  familyId,
  childId: childId.personId,
});
```

### Creating Places (Hierarchical)

```typescript
// Option 1: Create hierarchy in one call
const { leafPlaceId } = await createHierarchicalPlace({
  city: "Bathgate",
  county: "West Lothian",
  state: "Scotland",
  country: "United Kingdom",
});

// Use leafPlaceId (the city) in events
const birthEventId = await createEvent({
  type: "birth",
  date: { year: 1850 },
  placeId: leafPlaceId,
});

// Option 2: Create individual places
const countryId = await createPlace({
  name: "United Kingdom",
  fullName: "United Kingdom",
  type: "country",
});

const stateId = await createPlace({
  name: "Scotland",
  fullName: "Scotland, United Kingdom",
  type: "state",
  parentId: countryId,
});
```

### Searching and Querying

```typescript
// Search by name
const results = await searchAncestors({
  query: "Smith",
  limit: 20,
});

// Search by FamilySearch ID
const person = await getByFsId({ fsId: "KWH1-1K7" });

// Get all events for a person
const events = await getForPerson({ personId });

// Get all citations for an event
const citations = await getForTarget({
  targetType: "event",
  targetId: eventId,
});

// Get comprehensive ancestor details
const ancestorDetails = await getAncestorWithDetails({ personId });
// Returns: person, events, citations, families, media, researchTasks, stories
```

### Research Task Management

```typescript
// Create a research task
const taskId = await createResearchTask({
  personId,
  type: "source_extraction",
  title: "Extract all census records for John Smith",
  status: "todo",
  priority: "high",
  assignedTo: "vincent",
});

// Update task status
await updateResearchTask({
  id: taskId,
  status: "in_progress",
});

// Complete task
await updateResearchTask({
  id: taskId,
  status: "done",
  completedAt: Date.now(),
});
```

### Story Generation

```typescript
// Create a story
const storyId = await createStory({
  personId,
  type: "biography",
  title: "Life of John Smith",
  content: `# John Smith (1850-1920)...`,
  citationIds: [citation1Id, citation2Id],
  status: "draft",
  generatedBy: "ai",
});

// Update story status
await updateStory({
  id: storyId,
  status: "published",
});
```

### Research Log Tracking

```typescript
// Upsert a research log entry for a specific entity + activity
await api.researchLog.upsert({
  entityType: "person",
  entityId: personId,
  activityType: "tier1_bulk_import",
  status: "done",
  summary: "Imported from Ancestry 8-gen JSON",
  outputRefs: ["ancestry-8gen-raw.json"],
});

// List log entries for an entity (optionally filter by activity/status)
const logs = await api.researchLog.listForEntity({
  entityType: "person",
  entityId: personId,
  activityType: "tier1_bulk_import",
});
```

## Query Hooks (React)

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// Query hooks (automatically update on data changes)
const person = useQuery(api.persons.get, { id: personId });
const events = useQuery(api.events.getForPerson, { personId });
const ancestorDetails = useQuery(api.ancestorDetails.getAncestorWithDetails, { personId });

// Mutation hooks
const createPerson = useMutation(api.persons.create);
const updatePerson = useMutation(api.persons.update);
const deletePerson = useMutation(api.persons.remove);

// Usage
await createPerson({ name: { given: "John", surname: "Smith" }, ... });
await updatePerson({ id: personId, researchStatus: "thorough" });
await deletePerson({ id: personId });
```

## Indexes Used for Fast Queries

### Persons
- `by_fsId` — Lookup by FamilySearch ID
- `by_surname` — Find all with same surname
- `by_research_status` — Filter by research completion
- `by_living` — Separate living vs deceased

### Events
- `by_type` — All births, deaths, marriages, etc.
- `by_place` — All events at a location

### PersonEvents
- `by_person` — All events for a person
- `by_event` — All people at an event
- `by_person_and_event` — Check if specific link exists

### Citations
- `by_source` — All citations from a source
- `by_confidence` — Filter by reliability

### CitationLinks
- `by_citation` — What does this citation prove?
- `by_target` — What citations prove this fact?
- `by_citation_and_target` — Check if specific link exists

## Common Filters

```typescript
// Get all deceased persons
await list({ living: false });

// Get persons needing research
await list({ researchStatus: "not_started" });

// Get all birth events
await listEvents({ type: "birth" });

// Get all census sources
await listSources({ type: "census" });

// Get high-confidence citations
await listCitations({ confidence: "very_high" });
```

## Data Validation

All fields use Convex validators:
- `v.string()` — Required string
- `v.optional(v.string())` — Optional string
- `v.number()` — Required number
- `v.boolean()` — Required boolean
- `v.id("tableName")` — Foreign key reference
- `v.array(v.string())` — Array of strings
- `v.object({ ... })` — Nested object
- `v.union(v.literal("a"), v.literal("b"))` — Enum

Invalid data will be rejected automatically.

## Error Handling

```typescript
try {
  await createPerson({ ... });
} catch (error) {
  console.error("Failed to create person:", error);
}

// Sources can't be deleted if citations reference them
try {
  await removeSource({ id: sourceId });
} catch (error) {
  // Error: "Cannot delete source: 5 citation(s) reference this source."
}
```

## Performance Tips

1. **Use indexes** — Queries with indexes are much faster
2. **Batch operations** — Create person + birth event in one mutation (helpers.ts)
3. **Limit results** — Use `limit` parameter on list queries
4. **Cache queries** — useQuery hooks cache results automatically
5. **Denormalize when needed** — Store frequently-accessed data redundantly

## Testing in Convex Dashboard

After running `npx convex dev`, visit the Convex dashboard to:
- View all tables and data
- Run queries directly
- Test mutations
- Monitor performance
- See real-time updates
