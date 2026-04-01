import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildOperationSummary,
  filterByVaultOwner,
  formatPersonName,
  inferResearchChecks,
  normalizeVaultOwnerId,
  sortByTimestampDesc,
} from "./vaultCore";

type VaultSnapshot = {
  people: Doc<"persons">[];
  relationships: Doc<"relationships">[];
  events: Doc<"events">[];
  personEvents: Doc<"personEvents">[];
  places: Doc<"places">[];
  sources: Doc<"sources">[];
  citations: Doc<"citations">[];
  citationLinks: Doc<"citationLinks">[];
  media: Doc<"media">[];
  importRuns: Doc<"importRuns">[];
  researchTasks: Doc<"researchTasks">[];
  researchLog: Doc<"researchLog">[];
  documents: Doc<"documents">[];
  stories: Doc<"stories">[];
  historicalContext: Doc<"historicalContext">[];
  researchChecks: Doc<"researchChecks">[];
  provisionalRelatives: Doc<"provisionalRelatives">[];
};

async function getVaultSnapshot(ctx: QueryCtx, vaultOwnerId: string): Promise<VaultSnapshot> {
  const owned = <T extends { vaultOwnerId?: string }>(rows: T[]) => filterByVaultOwner(rows, vaultOwnerId);

  const [
    people,
    relationships,
    events,
    personEvents,
    places,
    sources,
    citations,
    citationLinks,
    media,
    importRuns,
    researchTasks,
    researchLog,
    documents,
    stories,
    historicalContext,
    researchChecks,
    provisionalRelatives,
  ] = await Promise.all([
    ctx.db.query("persons").collect(),
    ctx.db.query("relationships").collect(),
    ctx.db.query("events").collect(),
    ctx.db.query("personEvents").collect(),
    ctx.db.query("places").collect(),
    ctx.db.query("sources").collect(),
    ctx.db.query("citations").collect(),
    ctx.db.query("citationLinks").collect(),
    ctx.db.query("media").collect(),
    ctx.db.query("importRuns").collect(),
    ctx.db.query("researchTasks").collect(),
    ctx.db.query("researchLog").collect(),
    ctx.db.query("documents").collect(),
    ctx.db.query("stories").collect(),
    ctx.db.query("historicalContext").collect(),
    ctx.db.query("researchChecks").collect(),
    ctx.db.query("provisionalRelatives").collect(),
  ]);

  return {
    people: owned(people),
    relationships: owned(relationships),
    events: owned(events),
    personEvents: owned(personEvents),
    places: owned(places),
    sources: owned(sources),
    citations: owned(citations),
    citationLinks: owned(citationLinks),
    media: owned(media),
    importRuns: owned(importRuns),
    researchTasks: owned(researchTasks),
    researchLog: owned(researchLog),
    documents: owned(documents),
    stories: owned(stories),
    historicalContext: owned(historicalContext),
    researchChecks: owned(researchChecks),
    provisionalRelatives: owned(provisionalRelatives),
  };
}

function getPersonByIdentifier(snapshot: VaultSnapshot, personIdentifier: string) {
  return (
    snapshot.people.find(
      (person) => person.fsId === personIdentifier || String(person._id) === personIdentifier
    ) ?? null
  );
}

function getPersonPlaces(person: Doc<"persons">, events: Doc<"events">[], places: Doc<"places">[]) {
  const placeById = new Map(places.map((place) => [String(place._id), place]));
  const placeMap = new Map<string, Doc<"places">>();

  const addPlaceId = (placeId: Id<"places"> | undefined) => {
    if (!placeId) return;
    const place = placeById.get(String(placeId));
    if (place) placeMap.set(String(place._id), place);
  };

  addPlaceId(person.birth?.place?.placeId);
  addPlaceId(person.death?.place?.placeId);
  for (const event of events) {
    addPlaceId(event.place?.placeId);
  }

  return Array.from(placeMap.values());
}

function getPersonSourceRecords(
  snapshot: VaultSnapshot,
  person: Doc<"persons">,
  events: Doc<"events">[]
) {
  const targetIds = new Set([String(person._id), ...events.map((event) => String(event._id))]);
  const relevantLinks = snapshot.citationLinks.filter((link) => {
    if (link.targetType === "person") return link.targetId === String(person._id);
    if (link.targetType === "event") return targetIds.has(link.targetId);
    return false;
  });

  const citations = relevantLinks
    .map((link) => {
      const citation = snapshot.citations.find((entry) => entry._id === link.citationId);
      if (!citation) return null;
      const source = snapshot.sources.find((entry) => entry._id === citation.sourceId);
      return source
        ? {
            ...citation,
            source,
            field: link.field,
          }
        : null;
    })
    .filter(Boolean) as Array<Doc<"citations"> & { source: Doc<"sources">; field?: string }>;

  const sourceMap = new Map<string, { source: Doc<"sources">; citations: typeof citations }>();
  for (const citation of citations) {
    const key = String(citation.source._id);
    const existing = sourceMap.get(key);
    if (existing) {
      existing.citations.push(citation);
    } else {
      sourceMap.set(key, { source: citation.source, citations: [citation] });
    }
  }

  return {
    citations,
    groupedSources: Array.from(sourceMap.values()),
  };
}

function buildPersonOperations(snapshot: VaultSnapshot, person: Doc<"persons">) {
  const personEvents = snapshot.personEvents
    .filter((link) => link.personId === person._id)
    .map((link) => snapshot.events.find((event) => event._id === link.eventId))
    .filter(Boolean) as Doc<"events">[];
  const personRelationships = snapshot.relationships.filter(
    (relationship) => relationship.person1 === person._id || relationship.person2 === person._id
  );
  const personMedia = snapshot.media.filter((item) => item.personIds.includes(person._id));
  const personStories = snapshot.stories.filter((story) => story.personId === person._id);
  const personPlaces = getPersonPlaces(person, personEvents, snapshot.places);
  const personDocuments = snapshot.documents.filter(
    (document) => document.personId === (person.fsId || String(person._id))
  );
  const personImportRuns = sortByTimestampDesc(
    snapshot.importRuns.filter((run) => run.personId === person._id || run.personFsId === person.fsId)
  );
  const personChecks = snapshot.researchChecks.filter((check) => check.personId === person._id);
  const personProvisional = snapshot.provisionalRelatives.filter(
    (relative) => relative.anchorPersonId === person._id && relative.mergeState === "provisional"
  );
  const personSources = getPersonSourceRecords(snapshot, person, personEvents).groupedSources.map(
    (entry) => entry.source
  );

  const resolvedChecks = inferResearchChecks({
    person,
    sources: personSources,
    events: personEvents,
    relationships: personRelationships,
    media: personMedia,
    documents: personDocuments,
    stories: personStories,
    places: personPlaces,
    importRuns: personImportRuns,
    provisionalRelatives: personProvisional,
    existingChecks: personChecks,
  });
  const summary = buildOperationSummary(
    resolvedChecks.map((check) => ({
      checkKey: check.checkKey,
      status: check.status,
      applicability: check.applicability,
      lastReviewedAt: check.lastReviewedAt,
      summary: "summary" in check ? check.summary : undefined,
    }))
  );

  return {
    checks: resolvedChecks,
    summary,
    relatedEvents: personEvents,
    relatedRelationships: personRelationships,
    relatedMedia: personMedia,
    relatedStories: personStories,
    relatedPlaces: personPlaces,
    relatedDocuments: personDocuments,
    relatedImportRuns: personImportRuns,
    provisionalRelatives: personProvisional,
    relatedSources: personSources,
  };
}

function buildPeopleRows(snapshot: VaultSnapshot) {
  return snapshot.people.map((person) => {
    const operations = buildPersonOperations(snapshot, person);
    const latestImport = operations.relatedImportRuns[0] ?? null;
    const hasStory = operations.relatedStories.length > 0;
    const keyPlaces = operations.relatedPlaces.slice(0, 2).map((place) => place.fullName || place.name);

    return {
      ...person,
      displayName: formatPersonName(person),
      routeId: person.fsId || String(person._id),
      stats: {
        sources: operations.relatedSources.length,
        memories: operations.relatedMedia.length,
        documents: operations.relatedDocuments.length,
        stories: operations.relatedStories.length,
        tasks: snapshot.researchTasks.filter(
          (task) => task.personId === person._id && task.status !== "done"
        ).length,
        imports: operations.relatedImportRuns.length,
        provisionalRelatives: operations.provisionalRelatives.length,
      },
      operations: {
        completionPercent: operations.summary.completionPercent,
        requiredMissingCount: operations.summary.requiredMissingCount,
        recommendedMissingCount: operations.summary.recommendedMissingCount,
        staleChecksCount: operations.summary.staleChecksCount,
        criticalMissing: operations.summary.criticalMissing,
        nextActions: operations.summary.nextActions,
      },
      latestImport,
      keyPlaces,
      hasStory,
      lastTouched:
        latestImport?.importedAt ??
        person.updatedAt ??
        person.createdAt,
      researchChecks: operations.checks,
    };
  });
}

async function assemblePersonWorkspace(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string
) {
  const snapshot = await getVaultSnapshot(ctx, vaultOwnerId);
  const person = getPersonByIdentifier(snapshot, personIdentifier);
  if (!person) return null;

  const operations = buildPersonOperations(snapshot, person);
  const sourceRecords = getPersonSourceRecords(snapshot, person, operations.relatedEvents);
  const relatedPeople = new Map<string, Doc<"persons">>();

  for (const relationship of operations.relatedRelationships) {
    const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
    const related = snapshot.people.find((entry) => entry._id === relatedId);
    if (related) relatedPeople.set(String(related._id), related);
  }

  return {
    person: {
      ...person,
      displayName: formatPersonName(person),
      routeId: person.fsId || String(person._id),
    },
    documents: sortByTimestampDesc(operations.relatedDocuments),
    stories: sortByTimestampDesc(operations.relatedStories),
    researchTasks: sortByTimestampDesc(
      snapshot.researchTasks.filter((task) => task.personId === person._id)
    ),
    researchLog: sortByTimestampDesc(
      snapshot.researchLog.filter(
        (entry) => entry.entityType === "person" && String(entry.entityId) === String(person._id)
      )
    ),
    importRuns: operations.relatedImportRuns,
    sources: sourceRecords.groupedSources,
    citations: sourceRecords.citations,
    events: operations.relatedEvents,
    timeline: [...operations.relatedEvents].sort(
      (a, b) => (a.date?.year ?? 0) - (b.date?.year ?? 0)
    ),
    relationships: operations.relatedRelationships.map((relationship) => {
      const relatedId = relationship.person1 === person._id ? relationship.person2 : relationship.person1;
      const relatedPerson = snapshot.people.find((entry) => entry._id === relatedId);
      return relatedPerson
        ? {
            ...relationship,
            relatedPerson,
            relatedName: formatPersonName(relatedPerson),
          }
        : null;
    }).filter(Boolean),
    media: sortByTimestampDesc(operations.relatedMedia),
    places: operations.relatedPlaces,
    provisionalRelatives: sortByTimestampDesc(operations.provisionalRelatives),
    researchChecks: operations.checks,
    operations: operations.summary,
    stats: {
      sources: operations.relatedSources.length,
      citations: sourceRecords.citations.length,
      events: operations.relatedEvents.length,
      memories: operations.relatedMedia.length,
      stories: operations.relatedStories.length,
      documents: operations.relatedDocuments.length,
      places: operations.relatedPlaces.length,
      imports: operations.relatedImportRuns.length,
      provisionalRelatives: operations.provisionalRelatives.length,
    },
    relatedPeople: Array.from(relatedPeople.values()),
  };
}

export const getPeopleExplorer = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    researchStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("basic"),
        v.literal("in_progress"),
        v.literal("thorough"),
        v.literal("complete")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const search = args.search?.trim().toLowerCase();

    const rows = buildPeopleRows(snapshot).filter((person) => {
      if (args.researchStatus && person.researchStatus !== args.researchStatus) return false;
      if (!search) return true;
      return [
        person.displayName,
        person.fsId || "",
        String(person._id),
        person.birth?.date?.original || "",
        person.death?.date?.original || "",
        ...person.keyPlaces,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const sorted = rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return args.limit ? sorted.slice(0, args.limit) : sorted;
  },
});

export const getPersonWorkspace = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    return assemblePersonWorkspace(ctx, normalizeVaultOwnerId(args.vaultOwnerId), args.personIdentifier);
  },
});

export const getPersonResearchChecks = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await assemblePersonWorkspace(
      ctx,
      normalizeVaultOwnerId(args.vaultOwnerId),
      args.personIdentifier
    );
    return workspace?.researchChecks ?? [];
  },
});

export const getProvisionalRelatives = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    if (!args.personIdentifier) {
      return sortByTimestampDesc(snapshot.provisionalRelatives);
    }

    const person = getPersonByIdentifier(snapshot, args.personIdentifier);
    if (!person) return [];
    return sortByTimestampDesc(
      snapshot.provisionalRelatives.filter((relative) => relative.anchorPersonId === person._id)
    );
  },
});

export const getOperationsQueue = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    rowType: v.optional(v.union(v.literal("person"), v.literal("provisional"))),
    missingCheck: v.optional(v.string()),
    storyStatus: v.optional(v.union(v.literal("has_story"), v.literal("no_story"))),
    staleOnly: v.optional(v.boolean()),
    sortBy: v.optional(
      v.union(
        v.literal("missingCritical"),
        v.literal("completion"),
        v.literal("lastTouched"),
        v.literal("sourceCount"),
        v.literal("storyReadiness"),
        v.literal("newestImport")
      )
    ),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot).map((row) => ({
      rowType: "person" as const,
      id: row.routeId,
      personIdentifier: row.routeId,
      displayName: row.displayName,
      relationshipHint: undefined,
      lifespan: `${row.birth?.date?.year || "?"} to ${row.death?.date?.year || "?"}`,
      keyPlaces: row.keyPlaces,
      completionPercent: row.operations.completionPercent,
      sourceCount: row.stats.sources,
      memoryCount: row.stats.memories,
      documentCount: row.stats.documents,
      storyCount: row.stats.stories,
      openTaskCount: row.stats.tasks,
      latestImportAt: row.latestImport?.importedAt ?? null,
      lastTouched: row.lastTouched,
      missingCritical: row.operations.criticalMissing,
      nextActions: row.operations.nextActions,
      staleChecksCount: row.operations.staleChecksCount,
      researchChecks: row.researchChecks,
      anchorPersonIdentifier: row.routeId,
      badge: row.researchStatus,
    }));

    const provisionalRows = snapshot.provisionalRelatives
      .filter((relative) => relative.mergeState === "provisional")
      .map((relative) => {
        const anchor = snapshot.people.find((person) => person._id === relative.anchorPersonId);
        const sourceStoryCount = anchor
          ? snapshot.stories.filter((story) => story.personId === anchor._id).length
          : 0;
        return {
          rowType: "provisional" as const,
          id: String(relative._id),
          personIdentifier: null,
          displayName: relative.displayName,
          relationshipHint: relative.relationshipHint,
          lifespan:
            relative.possibleBirthYear || relative.possibleDeathYear
              ? `${relative.possibleBirthYear || "?"} to ${relative.possibleDeathYear || "?"}`
              : "Undated",
          keyPlaces: relative.possiblePlaces || [],
          completionPercent: 0,
          sourceCount: relative.evidenceCount,
          memoryCount: 0,
          documentCount: 0,
          storyCount: sourceStoryCount,
          openTaskCount: 0,
          latestImportAt: null,
          lastTouched: relative.updatedAt,
          missingCritical: ["identity_review", "relationships"],
          nextActions: [
            `Review ${relative.displayName} and decide whether to promote or merge.`,
          ],
          staleChecksCount: 0,
          researchChecks: [],
          anchorPersonIdentifier: anchor?.fsId || String(relative.anchorPersonId),
          badge: relative.relationshipHint || "provisional",
        };
      });

    let rows = [...peopleRows, ...provisionalRows];
    const search = args.search?.trim().toLowerCase();

    rows = rows.filter((row) => {
      if (args.rowType && row.rowType !== args.rowType) return false;
      if (args.storyStatus === "has_story" && row.storyCount === 0) return false;
      if (args.storyStatus === "no_story" && row.storyCount > 0) return false;
      if (args.staleOnly && row.staleChecksCount === 0) return false;
      if (args.missingCheck && !row.missingCritical.includes(args.missingCheck)) return false;
      if (!search) return true;
      return [row.displayName, row.relationshipHint || "", ...row.keyPlaces, row.lifespan]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const direction = args.sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (args.sortBy) {
        case "completion":
          return direction * (a.completionPercent - b.completionPercent);
        case "sourceCount":
          return direction * (a.sourceCount - b.sourceCount);
        case "storyReadiness":
          return direction * ((a.storyCount > 0 ? 1 : 0) - (b.storyCount > 0 ? 1 : 0));
        case "newestImport":
          return direction * ((a.latestImportAt ?? 0) - (b.latestImportAt ?? 0));
        case "lastTouched":
          return direction * ((a.lastTouched ?? 0) - (b.lastTouched ?? 0));
        case "missingCritical":
        default:
          return direction * (a.missingCritical.length - b.missingCritical.length);
      }
    });

    const visibleRows = args.limit ? rows.slice(0, args.limit) : rows;
    const personRows = visibleRows.filter((row) => row.rowType === "person");
    const averageCompletion =
      personRows.length === 0
        ? 0
        : Math.round(
            personRows.reduce((total, row) => total + row.completionPercent, 0) / personRows.length
          );

    return {
      summary: {
        visibleRows: visibleRows.length,
        provisionalRows: visibleRows.filter((row) => row.rowType === "provisional").length,
        missingRequired: visibleRows.reduce((total, row) => total + row.missingCritical.length, 0),
        missingRecommended: personRows.reduce(
          (total, row) =>
            total +
            row.researchChecks.filter(
              (check) =>
                check.applicability === "recommended" &&
                (check.status === "missing" || check.status === "needs_review")
            ).length,
          0
        ),
        staleChecks: visibleRows.reduce((total, row) => total + row.staleChecksCount, 0),
        averageCompletion,
      },
      rows: visibleRows,
    };
  },
});

export const getOperationsSummary = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const rows = buildPeopleRows(snapshot);
    return {
      people: rows.length,
      provisional: snapshot.provisionalRelatives.filter((relative) => relative.mergeState === "provisional").length,
      avgCompletion:
        rows.length === 0
          ? 0
          : Math.round(rows.reduce((total, row) => total + row.operations.completionPercent, 0) / rows.length),
      missingRequired: rows.reduce((total, row) => total + row.operations.requiredMissingCount, 0),
      staleChecks: rows.reduce((total, row) => total + row.operations.staleChecksCount, 0),
    };
  },
});

export const getPlacesExplorer = query({
  args: {
    vaultOwnerId: v.string(),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const search = args.search?.trim().toLowerCase();
    const rows = snapshot.places.filter((place) => {
      if (!search) return true;
      return `${place.name} ${place.fullName}`.toLowerCase().includes(search);
    }).map((place) => ({
      ...place,
      stats: {
        events: snapshot.events.filter((event) => event.place?.placeId === place._id).length,
        citations: snapshot.citationLinks.filter(
          (link) => link.targetType === "place" && link.targetId === String(place._id)
        ).length,
        media: snapshot.media.filter(
          (item) => item.description?.includes(place.name) || item.title.includes(place.name)
        ).length,
      },
    }));

    return args.limit ? rows.slice(0, args.limit) : rows;
  },
});

export const getPlaceWorkspace = query({
  args: {
    vaultOwnerId: v.string(),
    placeId: v.id("places"),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const place = snapshot.places.find((entry) => entry._id === args.placeId);
    if (!place) return null;

    const events = snapshot.events.filter((event) => event.place?.placeId === args.placeId);
    const linkedPersonIds = new Set<Id<"persons">>();
    for (const event of events) {
      for (const link of snapshot.personEvents.filter((entry) => entry.eventId === event._id)) {
        linkedPersonIds.add(link.personId);
      }
    }
    for (const person of snapshot.people) {
      if (person.birth?.place?.placeId === args.placeId || person.death?.place?.placeId === args.placeId) {
        linkedPersonIds.add(person._id);
      }
    }

    const people = snapshot.people
      .filter((person) => linkedPersonIds.has(person._id))
      .map((person) => ({
        ...person,
        routeId: person.fsId || String(person._id),
      }));
    const citations = snapshot.citationLinks.filter(
      (link) => link.targetType === "place" && link.targetId === String(args.placeId)
    );
    const sources = citations
      .map((link) => snapshot.citations.find((citation) => citation._id === link.citationId))
      .filter(Boolean)
      .map((citation) => snapshot.sources.find((source) => source._id === citation!.sourceId))
      .filter(Boolean);

    return {
      place,
      events,
      people,
      sources,
      citations,
      contextEntries: sortByTimestampDesc(
        snapshot.historicalContext.filter((entry) => entry.placeId === args.placeId)
      ),
      media: snapshot.media.filter(
        (item) => item.description?.includes(place.name) || item.title.includes(place.name)
      ),
      researchLog: sortByTimestampDesc(
        snapshot.researchLog.filter(
          (entry) => entry.entityType === "place" && String(entry.entityId) === String(args.placeId)
        )
      ),
      openTasks: sortByTimestampDesc(
        snapshot.researchTasks.filter(
          (task) => task.status !== "done" && (task.description || "").toLowerCase().includes(place.name.toLowerCase())
        )
      ),
    };
  },
});

export const getDashboardSummary = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const peopleRows = buildPeopleRows(snapshot);
    const personById = new Map(snapshot.people.map((person) => [String(person._id), person]));

    return {
      counts: {
        people: snapshot.people.length,
        places: snapshot.places.length,
        stories: snapshot.stories.length,
        documents: snapshot.documents.length,
        imports: snapshot.importRuns.length,
        openTasks: snapshot.researchTasks.filter((task) => task.status !== "done").length,
        provisionalRelatives: snapshot.provisionalRelatives.filter(
          (relative) => relative.mergeState === "provisional"
        ).length,
      },
      recentPeople: peopleRows
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 6),
      recentImports: sortByTimestampDesc(snapshot.importRuns)
        .slice(0, 6)
        .map((run) => {
          const linkedPerson = run.personId ? personById.get(String(run.personId)) ?? null : null;
          return {
            ...run,
            personRouteId: linkedPerson?.fsId || (run.personId ? String(run.personId) : run.personFsId),
          };
        }),
      operationsHighlights: peopleRows
        .sort((a, b) => b.operations.requiredMissingCount - a.operations.requiredMissingCount)
        .slice(0, 5),
    };
  },
});

export const getResearchOverview = query({
  args: {
    vaultOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await getVaultSnapshot(ctx, normalizeVaultOwnerId(args.vaultOwnerId));
    const personById = new Map(snapshot.people.map((person) => [String(person._id), person]));

    return {
      tasks: sortByTimestampDesc(snapshot.researchTasks).map((task) => ({
        ...task,
        person: task.personId ? personById.get(String(task.personId)) ?? null : null,
      })),
      logEntries: sortByTimestampDesc(snapshot.researchLog).map((entry) => ({
        ...entry,
        person:
          entry.entityType === "person" && entry.entityId !== undefined
            ? personById.get(String(entry.entityId)) ?? null
            : null,
      })),
    };
  },
});

export const getContextPack = query({
  args: {
    vaultOwnerId: v.string(),
    personIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await assemblePersonWorkspace(ctx, normalizeVaultOwnerId(args.vaultOwnerId), args.personIdentifier);
    if (!workspace) return null;

    const structured = {
      person: workspace.person,
      stats: workspace.stats,
      operations: workspace.operations,
      researchChecks: workspace.researchChecks,
      timeline: workspace.timeline,
      relationships: workspace.relationships,
      places: workspace.places,
      provisionalRelatives: workspace.provisionalRelatives,
      sources: workspace.sources,
      memories: workspace.media,
      documents: workspace.documents,
      stories: workspace.stories,
      openResearchTasks: workspace.researchTasks.filter((task) => task.status !== "done"),
      unresolvedConflicts: workspace.importRuns.flatMap((run) => run.warnings).slice(0, 12),
      recentImports: workspace.importRuns.slice(0, 5),
    };

    const markdown = [
      `# Context Pack: ${workspace.person.displayName}`,
      "",
      `- FamilySearch ID: ${workspace.person.fsId || "Unknown"}`,
      `- Research status: ${workspace.person.researchStatus}`,
      `- Completion: ${workspace.operations.completionPercent}%`,
      `- Missing critical checks: ${workspace.operations.criticalMissing.join(", ") || "None"}`,
      "",
      "## Person Summary",
      "",
      `- Name: ${workspace.person.displayName}`,
      `- Birth: ${workspace.person.birth?.date?.original || "Unknown"}${workspace.person.birth?.place?.original ? ` in ${workspace.person.birth.place.original}` : ""}`,
      `- Death: ${workspace.person.death?.date?.original || "Unknown"}${workspace.person.death?.place?.original ? ` in ${workspace.person.death.place.original}` : ""}`,
      "",
      "## Operations",
      "",
      ...workspace.researchChecks.map(
        (check) => `- ${check.checkKey}: ${check.status} (${check.applicability})`
      ),
      "",
      "## Timeline",
      "",
      ...workspace.timeline.map(
        (event) =>
          `- ${event.date?.original || "Undated"}: ${event.type}${event.place?.original ? ` in ${event.place.original}` : ""}`
      ),
      "",
      "## Relationships",
      "",
      ...workspace.relationships.map((relationship) => `- ${relationship!.type}: ${relationship!.relatedName}`),
      "",
      "## Provisional Relatives",
      "",
      ...(workspace.provisionalRelatives.length > 0
        ? workspace.provisionalRelatives.map(
            (relative) => `- ${relative.displayName}${relative.relationshipHint ? ` (${relative.relationshipHint})` : ""}`
          )
        : ["- No provisional relatives currently waiting for review."]),
      "",
      "## Places",
      "",
      ...workspace.places.map((place) => `- ${place.fullName || place.name || "Unknown place"}`),
      "",
      "## Sources",
      "",
      ...workspace.sources.map((entry) => `- ${entry.source.title}`),
      "",
      "## Memories",
      "",
      ...workspace.media.map((item) => `- ${item.title}`),
      "",
      "## Open Research Questions",
      "",
      ...workspace.researchTasks
        .filter((task) => task.status !== "done")
        .map((task) => `- ${task.title}: ${task.description || task.type}`),
      "",
      "## Unresolved Import Warnings",
      "",
      ...(structured.unresolvedConflicts.length > 0
        ? structured.unresolvedConflicts.map((warning) => `- ${warning}`)
        : ["- No unresolved import warnings recorded."]),
    ].join("\n");

    return {
      structured,
      markdown,
    };
  },
});
