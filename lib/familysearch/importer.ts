import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { CaptureMemory, CapturePackage, CaptureSource } from "@/lib/familysearch/capture";

type ImportArtifactPaths = {
  capturePackagePath?: string;
  evidencePackPath?: string;
  rawDocumentPath?: string;
  contextualizedPath?: string;
};

export interface ImportCaptureOptions {
  client: ConvexHttpClient;
  vaultOwnerId: string;
  capture: CapturePackage;
  compatibilityMode: boolean;
  artifactPaths: ImportArtifactPaths;
}

export interface ImportCaptureResult {
  personId: string;
  personFsId: string;
  personName: string;
  counts: {
    sources: number;
    citations: number;
    memories: number;
    relationships: number;
    places: number;
    events: number;
    warnings: number;
  };
  warnings: string[];
  importRunId: string;
  mergeStatus: "created" | "merged" | "updated" | "partial";
}

type NormalizedPlace = {
  placeId: string;
  name: string;
  fullName: string;
};

export async function importCapturePackageToConvex({
  client,
  vaultOwnerId,
  capture,
  compatibilityMode,
  artifactPaths,
}: ImportCaptureOptions): Promise<ImportCaptureResult> {
  const personName = splitName(capture.person.name);
  const warnings = [
    ...capture.diagnostics.warnings.map((warning) => warning.message),
    ...capture.diagnostics.errors.map((error) => error.message),
  ];

  const personResult = await client.mutation(api.vaultMutations.upsertPerson, {
    vaultOwnerId,
    fsId: capture.person.familySearchId,
    name: personName,
    sex: inferSex(capture.sources),
    living: inferLiving(capture.person.deathDate),
    birth: buildLifeFact(capture.person.birthDate),
    death: buildLifeFact(capture.person.deathDate),
    tags: ["familysearch-import"],
    notes: compatibilityMode
      ? "Imported via legacy evidence-pack compatibility flow."
      : `Imported from FamilySearch ${capture.pageType} capture.`,
  });

  const personId = String(personResult.personId);
  const counts = {
    sources: 0,
    citations: 0,
    memories: 0,
    relationships: 0,
    places: 0,
    events: 0,
    warnings: warnings.length,
  };

  const placeCache = new Map<string, NormalizedPlace>();

  for (const source of capture.sources) {
    counts.sources += 1;

    const sourceType = classifySourceType(source.title, source.sourceType);
    const sourceResult = await client.mutation(api.vaultMutations.upsertSource, {
      vaultOwnerId,
      title: source.title,
      type: sourceType,
      repository: "FamilySearch",
      url: source.webPageUrl,
      fsId: source.id,
      importKey: `fs-source:${capture.person.familySearchId}:${source.sourceKey}`,
      notes: [source.citation, source.rawText].filter(Boolean).join("\n\n") || undefined,
    });

    const citationResult = await client.mutation(api.vaultMutations.upsertCitation, {
      vaultOwnerId,
      sourceId: sourceResult.sourceId,
      isEvidence: true,
      importKey: `fs-citation:${capture.person.familySearchId}:${source.sourceKey}`,
      page: source.date,
      confidence: inferCitationConfidence(source),
      extractedText: source.citation || source.rawText || undefined,
      editedText: source.rawText || undefined,
      url: source.webPageUrl,
      accessDate: capture.capturedAt.slice(0, 10),
      notes: source.tags.length > 0 ? `Tags: ${source.tags.join(", ")}` : undefined,
    });
    counts.citations += 1;

    await client.mutation(api.citations.linkToTarget, {
      vaultOwnerId,
      citationId: citationResult.citationId,
      targetType: "person",
      targetId: personId,
      field: "imported_source",
    });

    const sourcePlaces = source.placeMentions.length > 0 ? source.placeMentions : extractPlaceMentions(source);
    for (const placeMention of sourcePlaces) {
      const normalizedPlace = await ensurePlace(
        client,
        vaultOwnerId,
        placeCache,
        placeMention.name,
        "fullName" in placeMention ? placeMention.fullName : undefined
      );
      counts.places += normalizedPlace.created ? 1 : 0;
      await client.mutation(api.citations.linkToTarget, {
        vaultOwnerId,
        citationId: citationResult.citationId,
        targetType: "place",
        targetId: normalizedPlace.place.placeId,
        field: placeMention.role || "mentioned_in_source",
      });
    }

    const eventInput = await buildEventFromSource(client, vaultOwnerId, placeCache, source);
    if (eventInput) {
      const eventResult = await client.mutation(api.vaultMutations.upsertEvent, {
        vaultOwnerId,
        ...eventInput,
      });
      counts.events += eventResult.created ? 1 : 0;
      await client.mutation(api.vaultMutations.upsertPersonEvent, {
        vaultOwnerId,
        personId: personResult.personId,
        eventId: eventResult.eventId,
        role: "primary",
      });
      await client.mutation(api.citations.linkToTarget, {
        vaultOwnerId,
        citationId: citationResult.citationId,
        targetType: "event",
        targetId: String(eventResult.eventId),
        field: source.title,
      });
    }

    const relatedPeople = source.relatedPeople.length > 0 ? source.relatedPeople : extractRelatedPeople(source);
    for (const related of relatedPeople) {
      if (isPrimaryPersonReference(related.name, related.role, capture.person.name)) {
        continue;
      }

      const relatedFamilySearchId = "familySearchId" in related ? related.familySearchId : undefined;
      if (relatedFamilySearchId) {
        const relatedPersonName = splitName(related.name);
        const relatedPerson = await client.mutation(api.vaultMutations.upsertPerson, {
          vaultOwnerId,
          fsId: relatedFamilySearchId,
          name: relatedPersonName,
          sex: inferSexFromRole(related.role),
          living: false,
          notes: `Discovered from ${source.title}`,
        });

        const relation = await maybeCreateRelationship(client, vaultOwnerId, {
          personId: personResult.personId,
          relatedPersonId: relatedPerson.personId,
          relatedName: related.name,
          role: related.role,
          sourceKey: source.sourceKey,
        });

        if (relation) {
          counts.relationships += relation.created ? 1 : 0;
          await client.mutation(api.citations.linkToTarget, {
            vaultOwnerId,
            citationId: citationResult.citationId,
            targetType: "relationship",
            targetId: relation.relationshipId,
            field: related.role || "related_person",
          });
        }
      } else {
        await client.mutation(api.vaultMutations.upsertProvisionalRelative, {
          vaultOwnerId,
          anchorPersonId: personResult.personId,
          anchorPersonFsId: capture.person.familySearchId,
          displayName: related.name,
          relationshipHint: related.role,
          sourceKey: source.sourceKey,
          sourceTitle: source.title,
          possiblePlaces: sourcePlaces.map((place) =>
            "fullName" in place ? place.fullName || place.name : place.name
          ),
          notes: `Extracted from ${source.title}`,
        });
      }
    }
  }

  for (const memory of capture.memories) {
    const memoryResult = await importMemory(client, {
      vaultOwnerId,
      memory,
      personId: personResult.personId,
      personFsId: capture.person.familySearchId,
    });
    counts.memories += memoryResult.created ? 1 : 0;

    for (const placeMention of memory.placeMentions) {
      const normalizedPlace = await ensurePlace(
        client,
        vaultOwnerId,
        placeCache,
        placeMention.name,
        placeMention.fullName
      );
      counts.places += normalizedPlace.created ? 1 : 0;
    }
  }

  if (warnings.length > 0) {
    await client.mutation(api.vaultMutations.ensureResearchTask, {
      vaultOwnerId,
      personId: personResult.personId,
      type: "verification",
      title: "Review import warnings",
      description: warnings.join(" "),
      priority: "high",
    });
  }

  if (capture.sources.length > 0) {
    await client.mutation(api.vaultMutations.ensureResearchTask, {
      vaultOwnerId,
      personId: personResult.personId,
      type: "story_writing",
      title: "Draft a contextualized person sheet",
      description: "Use the imported sources, memories, and places to draft a narrative summary.",
      priority: "medium",
    });
  }

  await client.mutation(api.researchLog.upsert, {
    vaultOwnerId,
    entityType: "person",
    entityId: personResult.personId,
    activityType: capture.pageType === "memories" ? "tier2_memories" : "tier2_sources",
    status: "done",
    summary: `Imported FamilySearch ${capture.pageType} capture`,
    details: `Imported ${capture.sources.length} sources and ${capture.memories.length} memories.`,
    outputRefs: Object.values(artifactPaths).filter(Boolean),
  });

  const importRunId = await client.mutation(api.importRuns.record, {
    vaultOwnerId,
    personId: personResult.personId,
    personFsId: capture.person.familySearchId,
    personName: capture.person.name,
    captureId: capture.captureId,
    captureVersion: capture.schemaVersion,
    pageTypes: [capture.pageType],
    sourceUrls: [capture.pageUrl],
    capturedAt: Date.parse(capture.capturedAt),
    compatibilityMode,
    mergeStatus:
      warnings.length > 0
        ? "partial"
        : personResult.created
          ? "created"
          : capture.memories.length > 0 && capture.sources.length === 0
            ? "updated"
            : "merged",
    counts,
    warnings,
    artifactPaths,
    metadata: {
      extractorVersion: capture.extractorVersion,
      mode: capture.diagnostics.mode,
      pageTitle: capture.pageTitle,
    },
  });

  await client.mutation(api.vaultMutations.bulkRefreshResearchChecks, {
    vaultOwnerId,
    personId: personResult.personId,
    source: "import",
  });

  return {
    personId,
    personFsId: capture.person.familySearchId,
    personName: capture.person.name,
    counts,
    warnings,
    importRunId: String(importRunId),
    mergeStatus:
      warnings.length > 0
        ? "partial"
        : personResult.created
          ? "created"
          : capture.memories.length > 0 && capture.sources.length === 0
            ? "updated"
            : "merged",
  };
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      given: fullName.trim() || "Unknown",
      surname: fullName.trim() || "Unknown",
    };
  }

  const surname = parts.pop() || "Unknown";
  return {
    given: parts.join(" "),
    surname,
  };
}

function buildLifeFact(date?: string) {
  if (!date) return undefined;
  const parsed = parseDate(date);
  return {
    date: parsed,
  };
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const yearMatch = value.match(/(\d{4})/);
  return {
    original: value,
    year: yearMatch ? Number(yearMatch[1]) : undefined,
  };
}

function inferLiving(deathDate?: string) {
  return !deathDate;
}

function inferSex(sources: CaptureSource[]) {
  const labels = sources.flatMap((source) => source.indexed.fields);
  const sexField = labels.find((field) => /sex/i.test(field.label));
  return inferSexFromValue(sexField?.value);
}

function inferSexFromRole(role?: string) {
  return inferSexFromValue(role);
}

function inferSexFromValue(value?: string) {
  const normalized = value?.toLowerCase() || "";
  if (normalized.includes("female") || normalized.includes("mother") || normalized.includes("wife")) {
    return "female" as const;
  }
  if (normalized.includes("male") || normalized.includes("father") || normalized.includes("husband")) {
    return "male" as const;
  }
  return "unknown" as const;
}

function classifySourceType(title: string, sourceType: CaptureSource["sourceType"]) {
  const normalized = title.toLowerCase();
  if (normalized.includes("census")) return "census" as const;
  if (normalized.includes("church") || normalized.includes("parish") || normalized.includes("bapt")) {
    return "church_record" as const;
  }
  if (normalized.includes("death") || normalized.includes("birth") || normalized.includes("marriage")) {
    return "vital_record" as const;
  }
  if (normalized.includes("immigration") || normalized.includes("naturalization")) {
    return "immigration" as const;
  }
  if (normalized.includes("obituary")) return "obituary" as const;
  if (normalized.includes("newspaper")) return "newspaper" as const;
  if (normalized.includes("photo")) return "photograph" as const;
  if (normalized.includes("letter")) return "letter" as const;
  if (normalized.includes("book")) return "book" as const;
  if (sourceType === "memory" || normalized.includes("find a grave") || normalized.includes("familysearch.org")) {
    return "website" as const;
  }
  return "other" as const;
}

function inferCitationConfidence(source: CaptureSource) {
  if (source.expanded && source.rawText.length > 150) return "high" as const;
  if (source.indexed.fields.length > 0) return "medium" as const;
  return "low" as const;
}

function extractRelatedPeople(source: CaptureSource) {
  return source.indexed.fields
    .filter((field) => /name|spouse|father|mother|child|son|daughter/i.test(field.label))
    .map((field) => ({
      name: field.value.trim(),
      role: field.label,
    }))
    .filter((person) => person.name.length > 0);
}

function normalizePersonLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isPrimaryPersonReference(name: string, role: string | undefined, subjectName: string) {
  const normalizedName = normalizePersonLabel(name);
  const normalizedSubject = normalizePersonLabel(subjectName);

  if (normalizedName !== normalizedSubject) {
    return false;
  }

  const normalizedRole = normalizePersonLabel(role || "");
  return normalizedRole === "" || normalizedRole === "name";
}

function extractPlaceMentions(source: CaptureSource) {
  return source.indexed.fields
    .filter((field) => /place|location|residence|parish|county|city|town/i.test(field.label))
    .map((field) => ({
      name: field.value.trim(),
      role: field.label,
    }))
    .filter((place) => place.name.length > 0);
}

async function ensurePlace(
  client: ConvexHttpClient,
  vaultOwnerId: string,
  cache: Map<string, NormalizedPlace>,
  rawName: string,
  fullName?: string
) {
  const normalizedFullName = fullName || rawName;
  const cacheKey = normalizedFullName.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      place: cached,
      created: false,
    };
  }

  const parts = normalizedFullName.split(",").map((part) => part.trim()).filter(Boolean);
  const place = await client.mutation(api.places.upsert, {
    vaultOwnerId,
    name: parts[0] || normalizedFullName,
    fullName: normalizedFullName,
    type: inferPlaceType(parts),
  });

  const normalized = {
    placeId: String(place.placeId),
    name: parts[0] || normalizedFullName,
    fullName: normalizedFullName,
  };
  cache.set(cacheKey, normalized);
  return {
    place: normalized,
    created: !place.updated,
  };
}

function inferPlaceType(parts: string[]) {
  if (parts.length >= 4) return "address" as const;
  if (parts.length === 3) return "city" as const;
  if (parts.length === 2) return "state" as const;
  return "other" as const;
}

async function buildEventFromSource(
  client: ConvexHttpClient,
  vaultOwnerId: string,
  cache: Map<string, NormalizedPlace>,
  source: CaptureSource
) {
  const eventType = inferEventType(source);
  if (!eventType) return null;

  const eventDateField = source.indexed.fields.find((field) => /event date|date/i.test(field.label));
  const eventPlaceField = source.indexed.fields.find((field) => /event place|place|location/i.test(field.label));

  const normalizedPlace = eventPlaceField?.value
    ? await ensurePlace(client, vaultOwnerId, cache, eventPlaceField.value.trim())
    : null;

  return {
    importKey: `fs-event:${source.sourceKey}`,
    type: eventType.type,
    customType:
      "customType" in eventType && typeof eventType.customType === "string"
        ? eventType.customType
        : undefined,
    date: parseDate(eventDateField?.value || source.date),
    place: normalizedPlace
      ? {
          original: normalizedPlace.place.fullName,
          placeId: normalizedPlace.place.placeId as never,
        }
      : undefined,
    description: source.title,
    notes: source.rawText || undefined,
  };
}

function inferEventType(source: CaptureSource) {
  const title = source.title.toLowerCase();
  const eventTypeField = source.indexed.fields.find((field) => /event type/i.test(field.label));
  const normalized = `${title} ${eventTypeField?.value || ""}`.toLowerCase();
  if (normalized.includes("marriage")) return { type: "marriage" as const };
  if (normalized.includes("census")) return { type: "census" as const };
  if (normalized.includes("death") || normalized.includes("burial")) return { type: "death" as const };
  if (normalized.includes("birth")) return { type: "birth" as const };
  if (normalized.includes("immigration") || normalized.includes("arrival")) return { type: "immigration" as const };
  if (normalized.includes("residence")) return { type: "residence" as const };
  if (normalized.includes("bapt")) return { type: "baptism" as const };
  return null;
}

async function maybeCreateRelationship(
  client: ConvexHttpClient,
  vaultOwnerId: string,
  args: {
    personId: unknown;
    relatedPersonId: unknown;
    relatedName: string;
    role?: string;
    sourceKey: string;
  }
) {
  const role = args.role?.toLowerCase() || "";
  if (role.includes("spouse") || role.includes("wife") || role.includes("husband")) {
    const result = await client.mutation(api.vaultMutations.upsertRelationship, {
      vaultOwnerId,
      type: "Couple",
      person1: args.personId as never,
      person2: args.relatedPersonId as never,
      importKey: `fs-rel:${args.sourceKey}:spouse:${args.relatedName.toLowerCase()}`,
    });
    return { relationshipId: String(result.relationshipId), created: result.created };
  }
  if (role.includes("father") || role.includes("mother") || role.includes("parent")) {
    const result = await client.mutation(api.vaultMutations.upsertRelationship, {
      vaultOwnerId,
      type: "ParentChild",
      childRelationType: "Biological",
      person1: args.relatedPersonId as never,
      person2: args.personId as never,
      importKey: `fs-rel:${args.sourceKey}:parent:${args.relatedName.toLowerCase()}`,
    });
    return { relationshipId: String(result.relationshipId), created: result.created };
  }
  if (role.includes("child") || role.includes("son") || role.includes("daughter")) {
    const result = await client.mutation(api.vaultMutations.upsertRelationship, {
      vaultOwnerId,
      type: "ParentChild",
      childRelationType: "Biological",
      person1: args.personId as never,
      person2: args.relatedPersonId as never,
      importKey: `fs-rel:${args.sourceKey}:child:${args.relatedName.toLowerCase()}`,
    });
    return { relationshipId: String(result.relationshipId), created: result.created };
  }
  return null;
}

async function importMemory(
  client: ConvexHttpClient,
  args: {
    vaultOwnerId: string;
    memory: CaptureMemory;
    personId: unknown;
    personFsId: string;
  }
) {
  return await client.mutation(api.vaultMutations.upsertMedia, {
    vaultOwnerId: args.vaultOwnerId,
    type: classifyMemoryType(args.memory.mediaType),
    title: args.memory.title,
    description: args.memory.description,
    url: args.memory.imageUrl || args.memory.thumbnailUrl,
    mimeType: args.memory.mediaType,
    date: args.memory.createdAt ? parseMemoryDate(args.memory.createdAt) : undefined,
    personIds: [args.personId as never],
    familySearchUrl: args.memory.familySearchUrl || args.memory.memoryUrl,
    importKey: `fs-memory:${args.personFsId}:${args.memory.id}`,
  });
}

function classifyMemoryType(mediaType?: string) {
  const normalized = mediaType?.toLowerCase() || "";
  if (normalized.startsWith("image/")) return "photo" as const;
  if (normalized.startsWith("video/")) return "video" as const;
  if (normalized.startsWith("audio/")) return "audio" as const;
  if (normalized.includes("pdf")) return "document" as const;
  return "other" as const;
}

function parseMemoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
