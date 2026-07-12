import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filterByVaultOwner, resolveOwner } from "./vaultCore";

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
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const now = Date.now();
    const contentText = stripMarkdown(args.contentMarkdown);
    const existingRows = await ctx.db
      .query("documents")
      .withIndex("by_personId_type", (q) =>
        q.eq("personId", args.personId).eq("type", args.type)
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
      personId: args.personId,
      type: args.type,
      ...update,
      createdAt: now,
    });

    return { documentId, updated: false };
  },
});

export const getDocumentsByPerson = query({
  args: { personId: v.string(), vaultOwnerId: v.string() },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const results = await ctx.db
      .query("documents")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .collect();

    return filterByVaultOwner(results, vaultOwnerId).sort((a, b) =>
      a.type.localeCompare(b.type)
    );
  },
});

export const getDocument = query({
  args: {
    vaultOwnerId: v.string(),
    personId: v.string(),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_personId_type", (q) =>
        q.eq("personId", args.personId).eq("type", args.type)
      )
      .collect();
    return filterByVaultOwner(rows, vaultOwnerId)[0] ?? null;
  },
});

export const list = query({
  args: { vaultOwnerId: v.string() },
  handler: async (ctx, args) => {
    const vaultOwnerId = await resolveOwner(ctx, args.vaultOwnerId);
    return filterByVaultOwner(
      await ctx.db.query("documents").collect(),
      vaultOwnerId
    );
  },
});
