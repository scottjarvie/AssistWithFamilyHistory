import type { ObjectType } from "convex/values";
import { DEFAULT_LOCAL_VAULT_OWNER } from "../../../lib/vault/constants";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../searchServer";
import { filterByVaultOwner } from "../../vaultCore";
import type { sourceFactFields } from "../validators";

export async function writeSource(
  ctx: MutationCtx,
  args: Pick<Doc<"sources">,
    "title" | "type" | "repository" | "url" | "fsId" | "importKey" | "author" | "publicationDate" | "notes"
  >,
  vaultOwnerId: string,
) {
  const now = Date.now();
  let existing: Doc<"sources"> | null = null;

  const owners = vaultOwnerId === DEFAULT_LOCAL_VAULT_OWNER ? [vaultOwnerId, undefined] : [vaultOwnerId];
  const oldest = (rows: Array<Doc<"sources"> | null>) => rows.filter((row): row is Doc<"sources"> => row !== null).sort((a,b) => a._creationTime - b._creationTime)[0] ?? null;
  if (args.fsId) existing = oldest(await Promise.all(owners.map(owner => ctx.db.query("sources").withIndex("by_owner_fsId", q => q.eq("vaultOwnerId", owner).eq("fsId", args.fsId)).first())));
  if (!existing && args.importKey) existing = oldest(await Promise.all(owners.map(owner => ctx.db.query("sources").withIndex("by_owner_import_key", q => q.eq("vaultOwnerId", owner).eq("importKey", args.importKey)).first())));
  if (!existing && args.url) existing = oldest(await Promise.all(owners.map(owner => ctx.db.query("sources").withIndex("by_owner_url_title", q => q.eq("vaultOwnerId", owner).eq("url", args.url).eq("title", args.title)).first())));

  const payload = {
    ...args,
    vaultOwnerId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { sourceId: existing._id, created: false };
  }

  const sourceId = await ctx.db.insert("sources", {
    ...payload,
    createdAt: now,
  });

  return { sourceId, created: true };
}

export async function writeCitation(
  ctx: MutationCtx,
  args: Pick<Doc<"citations">,
    "sourceId" | "isEvidence" | "importKey" | "page" | "confidence" | "extractedText" | "editedText" | "url" | "accessDate" | "notes"
  >,
  vaultOwnerId: string,
) {
  const now = Date.now();
  let existing: Doc<"citations"> | null = null;

  if (args.importKey) {
    const matches = await ctx.db
      .query("citations")
      .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
      .collect();
    existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
  }

  if (!existing) {
    const sourceCitations = await ctx.db
      .query("citations")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    existing =
      filterByVaultOwner(sourceCitations, vaultOwnerId).find(
        (citation) =>
          citation.page === args.page &&
          citation.url === args.url &&
          citation.extractedText === args.extractedText
      ) || null;
  }

  const payload = {
    ...args,
    vaultOwnerId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { citationId: existing._id, created: false };
  }

  const citationId = await ctx.db.insert("citations", {
    ...payload,
    createdAt: now,
  });

  return { citationId, created: true };
}

export async function writeEvent(
  ctx: MutationCtx,
  args: Pick<Doc<"events">,
    "importKey" | "type" | "customType" | "date" | "endDate" | "place" | "description" | "notes"
  >,
  vaultOwnerId: string,
) {
  const now = Date.now();
  let existing: Doc<"events"> | null = null;

  if (args.importKey) {
    const matches = await ctx.db
      .query("events")
      .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
      .collect();
    existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
  }

  if (!existing) {
    const sameType = await ctx.db
      .query("events")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
    existing =
      filterByVaultOwner(sameType, vaultOwnerId).find(
        (event) =>
          event.date?.original === args.date?.original &&
          event.place?.original === args.place?.original &&
          event.description === args.description
      ) || null;
  }

  const payload = {
    ...args,
    vaultOwnerId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { eventId: existing._id, created: false };
  }

  const eventId = await ctx.db.insert("events", {
    ...payload,
    createdAt: now,
  });

  return { eventId, created: true };
}

export async function writePersonEvent(
  ctx: MutationCtx,
  args: Pick<Doc<"personEvents">, "personId" | "eventId" | "role">,
  vaultOwnerId: string,
) {
  const existingRows = await ctx.db
    .query("personEvents")
    .withIndex("by_person_and_event", (q) =>
      q.eq("personId", args.personId).eq("eventId", args.eventId)
    )
    .collect();
  const existing = filterByVaultOwner(existingRows, vaultOwnerId)[0] ?? null;

  if (existing) {
    await ctx.db.patch(existing._id, { role: args.role });
    return existing._id;
  }

  return await ctx.db.insert("personEvents", {
    ...args,
    vaultOwnerId,
    createdAt: Date.now(),
  });
}

export async function writeRelationship(
  ctx: MutationCtx,
  args: Pick<Doc<"relationships">, "type" | "childRelationType" | "person1" | "person2" | "facts" | "familySearchId" | "importKey">,
  vaultOwnerId: string,
) {
  const now = Date.now();
  let existing: Doc<"relationships"> | null = null;

  if (args.familySearchId) {
    const rows = await ctx.db
      .query("relationships")
      .withIndex("by_familySearchId", (q) => q.eq("familySearchId", args.familySearchId))
      .collect();
    existing = filterByVaultOwner(rows, vaultOwnerId)[0] ?? null;
  }

  if (!existing && args.importKey) {
    const matches = await ctx.db
      .query("relationships")
      .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
      .collect();
    existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
  }

  if (!existing) {
    const rows = await ctx.db
      .query("relationships")
      .withIndex("by_type_person1", (q) => q.eq("type", args.type).eq("person1", args.person1))
      .collect();
    existing =
      filterByVaultOwner(rows, vaultOwnerId).find((relationship) => relationship.person2 === args.person2) || null;
  }

  const payload = {
    ...args,
    vaultOwnerId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { relationshipId: existing._id, created: false };
  }

  const relationshipId = await ctx.db.insert("relationships", {
    ...payload,
    createdAt: now,
  });

  return { relationshipId, created: true };
}

export async function writeSourceFact(
  ctx: MutationCtx,
  args: ObjectType<typeof sourceFactFields>,
  vaultOwnerId: string,
) {
  const now = Date.now();
  const matches = await ctx.db
    .query("sourceFacts")
    .withIndex("by_import_key", (q) => q.eq("importKey", args.importKey))
    .collect();
  const existing = filterByVaultOwner(matches, vaultOwnerId)[0] ?? null;
  const payload = {
    ...args,
    vaultOwnerId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { sourceFactId: existing._id, created: false };
  }

  const sourceFactId = await ctx.db.insert("sourceFacts", {
    ...payload,
    createdAt: now,
  });
  return { sourceFactId, created: true };
}
