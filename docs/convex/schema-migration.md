# Schema Migration: Gramps → GEDCOM X

**Date:** 2026-02-11  
**Status:** Complete ✅  
**Convex Schema Version:** 2.0 (GEDCOM X-based)

---

## Summary

Migrated the Convex schema from a Gramps-inspired family-based model to the **GEDCOM X relationship-based model**. This brings the data model in line with FamilySearch's API format and provides better flexibility for complex family situations.

---

## Key Changes

### 1. **Replaced `families` Table with `relationships` Table**

**Before (Gramps model):**
```typescript
families: {
  partner1Id: Id<"persons">,
  partner2Id: Id<"persons"> | undefined,
  childIds: Id<"persons">[],
  marriageEventId: Id<"events"> | undefined,
}
```

**After (GEDCOM X model):**
```typescript
relationships: {
  type: "Couple" | "ParentChild" | "Godparent" | "Guardian" | "Other",
  person1: Id<"persons">,  // Parent or Spouse1
  person2: Id<"persons">,  // Child or Spouse2
  childRelationType?: "Biological" | "Adopted" | "Step" | "Foster" | "Guardianship" | "Unknown",
  facts?: [ /* Marriage, Divorce, etc. */ ],
}
```

**Why:**
- Direct Person↔Person relationships are more flexible
- Handles remarriages cleanly (multiple Couple relationships)
- Supports step-families, adoptions, unknown parents
- No need for a Family entity to be the hub

**Migration Path:**
- Each `family` becomes:
  - 1 Couple relationship (partner1 ↔ partner2)
  - N ParentChild relationships (each parent → each child)

### 2. **Embedded Common Facts on Person**

**Added to `persons` table:**
```typescript
persons: {
  // ... existing fields
  birth?: {
    date?: { original, formal, year, month, day, approximate },
    place?: { original, placeId },
    description?: string,
  },
  death?: {
    date?: { original, formal, year, month, day, approximate },
    place?: { original, placeId },
    description?: string,
  },
}
```

**Why:**
- Convex is document-oriented → embedding common fields improves performance
- Birth/death are queried frequently (for display, sorting, search)
- Still maintains full events table for complex queries
- Duplication is intentional (read optimization vs. normalization)

**Indexes:**
- No new indexes needed (embedded fields don't need separate indexes for person queries)

### 3. **Added `familySearchSync` Table**

**New table:**
```typescript
familySearchSync: {
  personId: Id<"persons">,
  fsPersonId: string,
  lastSynced: number,
  syncStatus: "never_synced" | "synced" | "conflict" | "error",
  changeHistory?: [{
    timestamp: number,
    changeType: string,
    source: "local" | "familysearch",
    description: string,
  }],
  lastError?: string,
}
```

**Why:**
- Track when each person was last synced with FamilySearch
- Detect conflicts (local changes + remote changes)
- Avoid redundant API calls
- Support bi-directional sync

**Indexes:**
- `by_person` - Find sync record for a person
- `by_fs_person` - Find local person by FamilySearch ID
- `by_status` - Find all conflicts
- `by_last_synced` - Find stale records

### 4. **Added Evidence Model Concept**

**Added to `citations` table:**
```typescript
citations: {
  // ... existing fields
  isEvidence: boolean,  // true = raw from record, false = researcher's conclusion
}
```

**Why:**
- GEDCOM X distinguishes "evidence" from "conclusions"
- Evidence = verbatim data from a source (census, birth certificate)
- Conclusion = researcher's interpretation combining multiple sources
- Follows Genealogical Proof Standard
- Enables AI to distinguish source data from inferences

**Index:**
- `by_evidence` - Query all evidence citations separately from conclusions

### 5. **Updated Place Model**

**Added to `places` table:**
```typescript
places: {
  // ... existing fields
  temporalDescription?: {
    startYear?: number,
    endYear?: number,
    formerNames?: string[],
  },
  familySearchId?: string,
}
```

**Why:**
- Places change names over time (e.g., "Leningrad" → "St. Petersburg")
- GEDCOM X supports temporal place descriptions
- FamilySearch ID enables place sync

**New Index:**
- `by_fsId` - Find place by FamilySearch ID

### 6. **Updated Events Model**

**Changed `events.placeId` to embedded object:**
```typescript
events: {
  // Before: placeId: Id<"places"> | undefined,
  // After:
  place?: {
    original: string,       // "Salt Lake City, Utah"
    placeId?: Id<"places">, // Link to places table
  },
}
```

**Why:**
- Preserves user's original text (may differ from standardized place)
- Still links to hierarchical place for queries
- Matches GEDCOM X PlaceReference structure

---

## API Changes

### Updated Functions

#### `helpers.ts`
- ❌ Removed: `createFamilyWithMarriage`
- ❌ Removed: `addChildToFamily`
- ❌ Removed: `removeChildFromFamily`
- ✅ Added: `createCoupleWithMarriage`
- ✅ Added: `createParentChildRelationship`
- ✅ Added: `addChildToCouple` (creates two ParentChild relationships)
- ✅ Added: `removeParentChildRelationship`
- ✅ Added: `createCitation` (with evidence flag)
- ✅ Added: `linkCitation`
- ✅ Added: `initializeFamilySearchSync`
- ✅ Added: `recordSyncChange`

#### `persons.ts`
- ✅ Updated: `create` - now accepts embedded `birth` and `death` facts
- ✅ Updated: `update` - now accepts embedded `birth` and `death` facts
- ✅ Added: `updateBirth` - update only birth fact
- ✅ Added: `updateDeath` - update only death fact
- ✅ Added: `getParents` - get all parents with relationship types
- ✅ Added: `getChildren` - get all children with relationship types
- ✅ Added: `getSpouses` - get all spouses with marriage facts
- ✅ Added: `getFamilySummary` - comprehensive family view

#### New: `relationships.ts`
- ✅ `createCouple` - create Couple relationship
- ✅ `createParentChild` - create ParentChild relationship
- ✅ `get` - get relationship by ID
- ✅ `listCouples` - list all Couple relationships
- ✅ `listParentChild` - list all ParentChild relationships
- ✅ `getCouplesForPerson` - get all marriages for a person
- ✅ `getChildrenForParent` - get all children relationships
- ✅ `getParentsForChild` - get all parent relationships
- ✅ `updateFacts` - update relationship facts (marriage, divorce)
- ✅ `updateRelationType` - change ParentChild type (Biological → Adopted, etc.)
- ✅ `remove` - delete relationship
- ✅ `getFamilyTree` - recursive ancestors + descendants query

#### `ancestorDetails.ts`
- ✅ Updated: `getAncestorWithDetails` - now uses relationships instead of families
  - Returns `spouses[]` instead of `families[]`
  - Returns `parents[]` and `children[]` separately
  - Each child includes `otherParent` info
- ✅ Updated: `searchAncestors` - uses embedded birth/death facts first, falls back to events

---

## Edge Cases Handled

### 1. **Remarriages**
- **Before:** Awkward - needed multiple Family records with same person as partner1/partner2
- **After:** Natural - multiple Couple relationships for the same person

### 2. **Step-Families**
- **Before:** Unclear - children in Family might not be biological to both parents
- **After:** Explicit - ParentChild relationships have `childRelationType` field
  - `Biological` - natural parent
  - `Step` - step-parent
  - `Adopted` - adoptive parent

### 3. **Unknown Parents**
- **Before:** Had to create Family with undefined partner2
- **After:** Simply don't create the second ParentChild relationship

### 4. **Same-Sex Couples**
- **Before:** `partner1` / `partner2` or `husband` / `wife` was awkward
- **After:** `person1` / `person2` with `type: "Couple"` is neutral

### 5. **Complex Custody Situations**
- **Before:** Hard to model - Family assumes nuclear structure
- **After:** Multiple ParentChild relationships with types (Foster, Guardianship)

### 6. **Adoptions**
- **Before:** Unclear - needed separate tracking
- **After:** Explicit - `childRelationType: "Adopted"` on ParentChild relationship
  - Can have both biological and adoptive parent relationships for same child

### 7. **Multiple Name Spellings (Evidence vs. Conclusion)**
- **Before:** Had to choose one spelling or use alternateNames
- **After:** Evidence citations capture source's exact spelling, conclusion is researcher's best interpretation

---

## Migration Script (For Future Data Migration)

When migrating existing data from the old schema to the new schema:

```typescript
// For each family:
const family = await ctx.db.get(familyId);

// 1. Create Couple relationship
const coupleRel = await ctx.db.insert("relationships", {
  type: "Couple",
  person1: family.partner1Id,
  person2: family.partner2Id,
  facts: family.marriageEventId ? [{
    type: "Marriage",
    // ... extract marriage details from event
  }] : [],
  createdAt: family.createdAt,
  updatedAt: family.updatedAt,
});

// 2. Create ParentChild relationships
for (const childId of family.childIds) {
  await ctx.db.insert("relationships", {
    type: "ParentChild",
    childRelationType: "Biological", // Default assumption
    person1: family.partner1Id,
    person2: childId,
    createdAt: family.createdAt,
    updatedAt: family.updatedAt,
  });
  
  if (family.partner2Id) {
    await ctx.db.insert("relationships", {
      type: "ParentChild",
      childRelationType: "Biological",
      person1: family.partner2Id,
      person2: childId,
      createdAt: family.createdAt,
      updatedAt: family.updatedAt,
    });
  }
}

// 3. Delete old family
await ctx.db.delete(familyId);
```

For embedding birth/death facts:

```typescript
// For each person:
const person = await ctx.db.get(personId);

// Find birth event
const birthEventLink = await ctx.db
  .query("personEvents")
  .withIndex("by_person", (q) => q.eq("personId", personId))
  .filter((q) => q.eq(q.field("role"), "primary"))
  .first();

if (birthEventLink) {
  const birthEvent = await ctx.db.get(birthEventLink.eventId);
  if (birthEvent?.type === "birth") {
    await ctx.db.patch(personId, {
      birth: {
        date: birthEvent.date,
        place: birthEvent.place,
        description: birthEvent.description,
      },
    });
  }
}

// Similar for death event
```

---

## Testing Checklist

- [ ] Create a person with embedded birth/death facts
- [ ] Create a Couple relationship
- [ ] Create ParentChild relationships (biological)
- [ ] Create ParentChild relationships (adopted, step)
- [ ] Query all spouses for a person
- [ ] Query all children for a person
- [ ] Query all parents for a person
- [ ] Get family tree (ancestors + descendants)
- [ ] Create citations with `isEvidence = true`
- [ ] Create citations with `isEvidence = false`
- [ ] Link citations to persons, relationships, events
- [ ] Create FamilySearch sync record
- [ ] Record sync changes
- [ ] Search for persons by name
- [ ] Get comprehensive ancestor details
- [ ] Handle remarriage (multiple Couple relationships)
- [ ] Handle step-family (different relationship types)
- [ ] Handle unknown parent (one-sided relationship)

---

## Documentation Updates

- [x] `schema.ts` - Comprehensive comments explaining GEDCOM X model
- [x] `README.md` - Added data model section explaining relationship-based approach
- [x] `helpers.ts` - Updated function comments
- [x] `persons.ts` - Added new query/mutation functions
- [x] `relationships.ts` - New file with relationship management
- [x] `ancestorDetails.ts` - Updated to use relationships
- [x] `SCHEMA_MIGRATION.md` - This document

---

## References

- [GEDCOM X Specification](https://github.com/FamilySearch/gedcomx)
- [FamilySearch API Documentation](https://www.familysearch.org/developers/)
- [Genealogical Proof Standard](https://www.bcgcertification.org/resources/standard.html)
- Internal: `~/clawd/research/family-history/open-source-genealogy-comparison.md`

---

**Next Steps:**

1. Test all new functions in Convex dashboard
2. Update frontend components to use new relationship model
3. Implement FamilySearch sync using new `familySearchSync` table
4. Build UI for managing different relationship types (biological, adopted, step)
5. Implement evidence vs. conclusion workflow in citation UI
