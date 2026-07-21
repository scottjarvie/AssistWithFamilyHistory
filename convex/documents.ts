import { v } from "convex/values";
import {
  action,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  authorizeOwnedReferenceMutation,
  authorizeTenantAction,
  authorizeTenantMutation,
} from "./access";
import { filterByVaultOwner, matchesVaultOwner } from "./vaultCore";

const documentTypeValidator = v.union(v.literal("PS"), v.literal("CST"));

const stripMarkdown = (markdown: string) => {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[.*?\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

async function resolveDocumentPersonForMutation(
  ctx: MutationCtx,
  functionName: string,
  vaultOwnerId: string,
  personIdentifier: string,
) {
  const personId = ctx.db.normalizeId("persons", personIdentifier);
  if (personId) {
    return authorizeOwnedReferenceMutation(
      ctx,
      functionName,
      vaultOwnerId,
      await ctx.db.get(personId),
      "Person",
    );
  }

  const candidates = await ctx.db
    .query("persons")
    .withIndex("by_fsId", (q) => q.eq("fsId", personIdentifier))
    .collect();
  const candidate = filterByVaultOwner(candidates, vaultOwnerId)[0] ?? candidates[0] ?? null;
  return authorizeOwnedReferenceMutation(
    ctx,
    functionName,
    vaultOwnerId,
    candidate,
    "Person",
  );
}

async function resolveOwnedDocumentPerson(
  ctx: QueryCtx,
  vaultOwnerId: string,
  personIdentifier: string,
) {
  const personId = ctx.db.normalizeId("persons", personIdentifier);
  if (personId) {
    const person = await ctx.db.get(personId);
    return person && matchesVaultOwner(person.vaultOwnerId, vaultOwnerId) ? person : null;
  }

  const candidates = await ctx.db
    .query("persons")
    .withIndex("by_fsId", (q) => q.eq("fsId", personIdentifier))
    .collect();
  return filterByVaultOwner(candidates, vaultOwnerId)[0] ?? null;
}

export const upsertDocument = mutation({
  args: {
    vaultOwnerId: v.string(),
    personId: v.string(),
    importRunId: v.optional(v.id("importRuns")),
    type: documentTypeValidator,
    title: v.string(),
    contentMarkdown: v.string(),
    artifactPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const functionName = "documents.upsertDocument";
    const decision = await authorizeTenantMutation(ctx, functionName, args.vaultOwnerId);
    const vaultOwnerId = decision.owner;
    await resolveDocumentPersonForMutation(
      ctx,
      functionName,
      vaultOwnerId,
      args.personId,
    );
    const personId = args.personId;
    if (args.importRunId) {
      await authorizeOwnedReferenceMutation(
        ctx,
        functionName,
        vaultOwnerId,
        await ctx.db.get(args.importRunId),
        "Import run",
      );
    }
    const now = Date.now();
    const contentText = stripMarkdown(args.contentMarkdown);
    const existingRows = await ctx.db
      .query("documents")
      .withIndex("by_personId_type", (q) =>
        q.eq("personId", personId).eq("type", args.type)
      )
      .collect();
    const existing = filterByVaultOwner(existingRows, vaultOwnerId)[0] ?? null;

    const update = {
      title: args.title,
      contentMarkdown: args.contentMarkdown,
      contentText,
      importRunId: args.importRunId,
      artifactPath: args.artifactPath,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, update);
      return { documentId: existing._id, updated: true };
    }

    const documentId = await ctx.db.insert("documents", {
      vaultOwnerId,
      personId,
      type: args.type,
      ...update,
      createdAt: now,
    });

    return { documentId, updated: false };
  },
});

const getDocumentsByPersonArgs = { personId: v.string(), vaultOwnerId: v.string() };

export const getDocumentsByPersonInternal = internalQuery({
  args: getDocumentsByPersonArgs,
  handler: async (ctx, args) => {
    if (!(await resolveOwnedDocumentPerson(ctx, args.vaultOwnerId, args.personId))) return [];
    const results = await ctx.db
      .query("documents")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .collect();

    return filterByVaultOwner(results, args.vaultOwnerId).sort((a, b) =>
      a.type.localeCompare(b.type)
    );
  },
});

export const getDocumentsByPerson = action({
  args: getDocumentsByPersonArgs,
  handler: async (ctx, args): Promise<Doc<"documents">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "documents.getDocumentsByPerson",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.documents.getDocumentsByPersonInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

const getDocumentArgs = {
  vaultOwnerId: v.string(),
  personId: v.string(),
  type: documentTypeValidator,
};

export const getDocumentInternal = internalQuery({
  args: getDocumentArgs,
  handler: async (ctx, args) => {
    if (!(await resolveOwnedDocumentPerson(ctx, args.vaultOwnerId, args.personId))) return null;
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_personId_type", (q) =>
        q.eq("personId", args.personId).eq("type", args.type)
      )
      .collect();
    return filterByVaultOwner(rows, args.vaultOwnerId)[0] ?? null;
  },
});

export const getDocument = action({
  args: getDocumentArgs,
  handler: async (ctx, args): Promise<Doc<"documents"> | null> => {
    const decision = await authorizeTenantAction(
      ctx,
      "documents.getDocument",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.documents.getDocumentInternal, {
      ...args,
      vaultOwnerId: decision.owner,
    });
  },
});

const listArgs = { vaultOwnerId: v.string() };

export const listInternal = internalQuery({
  args: listArgs,
  handler: async (ctx, args) => {
    return filterByVaultOwner(
      await ctx.db.query("documents").collect(),
      args.vaultOwnerId
    );
  },
});

export const list = action({
  args: listArgs,
  handler: async (ctx, args): Promise<Doc<"documents">[]> => {
    const decision = await authorizeTenantAction(
      ctx,
      "documents.list",
      args.vaultOwnerId,
      (entry) => ctx.runMutation(internal.trustBoundary.recordShadowDenial, entry),
    );
    return ctx.runQuery(internal.documents.listInternal, {
      vaultOwnerId: decision.owner,
    });
  },
});
