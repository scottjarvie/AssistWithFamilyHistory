/* eslint-disable @typescript-eslint/no-explicit-any -- Exact manifests are runtime-validated at this internal boundary. */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertGrantPermits } from "./mcpGrants";
import { matchesVaultOwner } from "./vaultCore";

const principalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  scopes: v.array(v.string()),
});

const exactObjectValidator = v.object({
  bucketClass: v.union(v.literal("private"), v.literal("public")),
  bucketName: v.string(),
  objectKey: v.string(),
  versionId: v.string(),
  sha256: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  metadataClean: v.boolean(),
  verifiedAt: v.string(),
  transformation: v.optional(v.string()),
  sourceSha256: v.optional(v.string()),
});

const metadataProposalValidator = v.object({
  temporal: v.object({
    cameraCaptureTime: v.optional(v.string()),
    scanTime: v.optional(v.string()),
    fileModifiedTime: v.optional(v.string()),
    uploadTime: v.string(),
    inferredHistoricalEventDate: v.optional(v.string()),
  }),
  location: v.optional(v.object({
    latitude: v.number(),
    longitude: v.number(),
    source: v.literal("embedded_gps"),
    status: v.literal("proposed"),
    association: v.union(v.literal("person_media"), v.literal("event"), v.literal("place")),
    precision: v.literal("exact_private"),
    disclosurePrecision: v.union(v.literal("withheld"), v.literal("locality"), v.literal("region")),
  })),
  extractedFromOriginalSha256: v.string(),
  extractedAt: v.string(),
  reversible: v.literal(true),
  decision: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
  acceptedAt: v.optional(v.string()),
  declinedAt: v.optional(v.string()),
});

function machineError(code: string, message: string, recovery: string): never {
  throw new Error(`MCP_FAMILY_HISTORY_ERROR:${JSON.stringify({ code, message, recovery })}`);
}

async function ownedPerson(ctx: any, owner: string, personId: string): Promise<Doc<"persons">> {
  const id = ctx.db.normalizeId("persons", personId);
  const row = id ? await ctx.db.get(id) : null;
  if (!row || !matchesVaultOwner(row.vaultOwnerId, owner)) {
    machineError("NOT_FOUND", "The evidence target was not found.", "Use a person ID returned by Family History context.");
  }
  return row;
}

export const planMcpEvidenceUpload = internalMutation({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    operationId: v.string(),
    requestHash: v.string(),
    uploadRef: v.string(),
    relayTokenHash: v.string(),
    objectKey: v.string(),
    expiresAt: v.number(),
    input: v.object({
      personId: v.string(),
      sourceId: v.optional(v.string()),
      title: v.string(),
      description: v.optional(v.string()),
      fileName: v.string(),
      contentType: v.string(),
      sizeBytes: v.number(),
      sha256: v.string(),
      fileModifiedTime: v.optional(v.string()),
      scanTime: v.optional(v.string()),
      inferredHistoricalEventDate: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    const grant = await assertGrantPermits(ctx, {
      owner,
      grantId: args.grantId,
      toolName: "family_history_begin_evidence_upload",
      input: args.input,
    });
    const person = await ownedPerson(ctx, owner, args.input.personId);
    let sourceId: Id<"sources"> | undefined;
    if (args.input.sourceId) {
      const normalized = ctx.db.normalizeId("sources", args.input.sourceId);
      const source = normalized ? await ctx.db.get(normalized) : null;
      if (!source || !matchesVaultOwner(source.vaultOwnerId, owner)) {
        machineError("NOT_FOUND", "The evidence source was not found.", "Use a source ID returned by Family History context.");
      }
      sourceId = normalized!;
    }

    const prior = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_operation", (q) => q.eq("vaultOwnerId", owner).eq("operationId", args.operationId))
      .first();
    if (prior) {
      if (prior.requestHash !== args.requestHash || prior.sourceKind !== "chosen_ai") {
        machineError(
          "OPERATION_CONFLICT",
          "That operation ID already describes a different evidence upload.",
          "Retry the original request exactly, or use a new operation ID for genuinely different evidence.",
        );
      }
      if (prior.state === "ready" && prior.mediaId) {
        return { replayed: true as const, state: "ready" as const, uploadRef: prior.ref, mediaId: prior.mediaId };
      }
      if (prior.state !== "authorized" || prior.expiresAt <= Date.now()) {
        machineError("UPLOAD_EXPIRED", "That evidence upload is no longer active.", "Begin again with a new operation ID.");
      }
      await ctx.db.patch(prior._id, { relayTokenHash: args.relayTokenHash });
      return {
        replayed: true as const,
        state: "authorized" as const,
        uploadRef: prior.ref,
        expiresAt: prior.expiresAt,
        objectKey: prior.objectKey,
        contentType: prior.declaredContentType,
        sizeBytes: prior.declaredSizeBytes,
        sha256: prior.expectedSha256,
      };
    }

    await ctx.db.insert("mediaUploadSessions", {
      vaultOwnerId: owner,
      ref: args.uploadRef,
      sourceKind: "chosen_ai",
      state: "authorized",
      grantId: grant!._id,
      clientId: args.principal.clientId,
      operationId: args.operationId,
      requestHash: args.requestHash,
      title: args.input.title,
      description: args.input.description,
      fileName: args.input.fileName,
      personIds: [person._id],
      sourceId,
      declaredContentType: args.input.contentType,
      declaredSizeBytes: args.input.sizeBytes,
      expectedSha256: args.input.sha256,
      objectKey: args.objectKey,
      relayTokenHash: args.relayTokenHash,
      fileModifiedTime: args.input.fileModifiedTime,
      scanTime: args.input.scanTime,
      inferredHistoricalEventDate: args.input.inferredHistoricalEventDate,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
    return {
      replayed: false as const,
      state: "authorized" as const,
      uploadRef: args.uploadRef,
      expiresAt: args.expiresAt,
      objectKey: args.objectKey,
      contentType: args.input.contentType,
      sizeBytes: args.input.sizeBytes,
      sha256: args.input.sha256,
    };
  },
});

/** Resolve the bearer capability without accepting an owner or provider coordinate. */
export const relayAuthorization = internalQuery({
  args: { uploadRef: v.string(), relayTokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_ref", (q) => q.eq("ref", args.uploadRef))
      .first();
    if (
      !session
      || session.sourceKind !== "chosen_ai"
      || session.state !== "authorized"
      || session.relayTokenHash !== args.relayTokenHash
      || session.expiresAt <= Date.now()
    ) return null;
    return {
      vaultOwnerId: session.vaultOwnerId,
      objectKey: session.objectKey,
      contentType: session.declaredContentType,
      sizeBytes: session.declaredSizeBytes,
      sha256: session.expectedSha256,
      expiresAt: session.expiresAt,
    };
  },
});

export const sessionForFinish = internalQuery({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    uploadRef: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    await assertGrantPermits(ctx, {
      owner,
      grantId: args.grantId,
      toolName: "family_history_finish_evidence_upload",
      input: { uploadRef: args.uploadRef },
    });
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_ref", (q) => q.eq("vaultOwnerId", owner).eq("ref", args.uploadRef))
      .first();
    if (!session || session.sourceKind !== "chosen_ai" || String(session.grantId) !== args.grantId) {
      machineError("NOT_FOUND", "The evidence upload was not found.", "Use the uploadRef returned by the begin call in this connection.");
    }
    return session;
  },
});

/** Atomically stop further PUTs and grant exactly one finalizer the session. */
export const claimSessionForFinish = internalMutation({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    uploadRef: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    await assertGrantPermits(ctx, {
      owner,
      grantId: args.grantId,
      toolName: "family_history_finish_evidence_upload",
      input: { uploadRef: args.uploadRef },
    });
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_ref", (q) => q.eq("vaultOwnerId", owner).eq("ref", args.uploadRef))
      .first();
    if (!session || session.sourceKind !== "chosen_ai" || String(session.grantId) !== args.grantId) {
      machineError("NOT_FOUND", "The evidence upload was not found.", "Use the uploadRef returned by the begin call in this connection.");
    }
    if (session.operationId !== args.operationId) {
      machineError("OPERATION_CONFLICT", "Finish must use the same operation ID as begin.", "Retry with the operation ID returned in the begin response.");
    }
    if (session.state === "ready" && session.mediaId) return { ...session, replayed: true as const };
    if (session.state === "uploaded") {
      machineError("UPLOAD_IN_PROGRESS", "This evidence upload is already being verified.", "Retry finish once with the same operation ID and uploadRef.");
    }
    if (session.state !== "authorized" || session.expiresAt <= Date.now()) {
      machineError("UPLOAD_EXPIRED", "That evidence upload is no longer active.", "Begin again with a new operation ID.");
    }
    await ctx.db.patch(session._id, { state: "uploaded" });
    return { ...session, state: "uploaded" as const, replayed: false as const };
  },
});

export const commitMcpEvidenceUpload = internalMutation({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    uploadRef: v.string(),
    original: exactObjectValidator,
    tiny: exactObjectValidator,
    medium: exactObjectValidator,
    large: exactObjectValidator,
    metadataProposal: metadataProposalValidator,
  },
  handler: async (ctx, args) => {
    const owner = args.principal.subject.trim();
    await assertGrantPermits(ctx, {
      owner,
      grantId: args.grantId,
      toolName: "family_history_finish_evidence_upload",
      input: { uploadRef: args.uploadRef },
    });
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_ref", (q) => q.eq("vaultOwnerId", owner).eq("ref", args.uploadRef))
      .first();
    if (!session || session.sourceKind !== "chosen_ai" || String(session.grantId) !== args.grantId) {
      machineError("NOT_FOUND", "The evidence upload was not found.", "Use the uploadRef returned by the begin call in this connection.");
    }
    if (session.state === "ready" && session.mediaId) {
      return { replayed: true as const, mediaId: session.mediaId, original: (await ctx.db.get(session.mediaId))?.b2Original };
    }
    if (session.state !== "uploaded" || session.expiresAt <= Date.now()) {
      machineError("UPLOAD_EXPIRED", "That evidence upload is no longer active.", "Begin again with a new operation ID.");
    }
    await ownedPerson(ctx, owner, String(session.personIds[0]));

    const now = Date.now();
    const mediaId = await ctx.db.insert("media", {
      vaultOwnerId: owner,
      type: "photo",
      title: session.title,
      description: session.description,
      mimeType: args.original.contentType,
      sizeBytes: args.original.sizeBytes,
      personIds: session.personIds,
      sourceId: session.sourceId,
      mediaState: "ready",
      renditionState: "ready",
      uploadSessionRef: session.ref,
      b2Original: args.original,
      b2Renditions: { tiny: args.tiny, medium: args.medium, large: args.large },
      metadataProposal: args.metadataProposal,
      recordedVia: { actorKind: "chosen_ai", clientName: session.clientId, grantId: session.grantId },
      privacyLevel: "private",
      reviewStatus: "unreviewed",
      rightsStatus: "unknown",
      aiUseAllowed: false,
      privacyReviewNote:
        "A chosen AI uploaded this evidence. Review its exact source, rights, people, and proposed camera date/location before allowing any later AI use.",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(session._id, { state: "ready", mediaId, finalizedAt: now });
    return { replayed: false as const, mediaId, original: args.original };
  },
});

export const markUploadFailed = internalMutation({
  args: { vaultOwnerId: v.string(), uploadRef: v.string(), failureCode: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_ref", (q) => q.eq("vaultOwnerId", args.vaultOwnerId).eq("ref", args.uploadRef))
      .first();
    if (!session || session.state === "ready") return;
    await ctx.db.patch(session._id, { state: "failed", failedAt: Date.now(), failureCode: args.failureCode });
  },
});

export const releaseUploadForRetry = internalMutation({
  args: { vaultOwnerId: v.string(), uploadRef: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_owner_ref", (q) => q.eq("vaultOwnerId", args.vaultOwnerId).eq("ref", args.uploadRef))
      .first();
    if (!session || session.state !== "uploaded" || session.expiresAt <= Date.now()) return;
    await ctx.db.patch(session._id, {
      state: "authorized",
      failureCode: "retryable_finalize_failure",
    });
  },
});

export const sessionForCleanup = internalQuery({
  args: { uploadRef: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("mediaUploadSessions")
      .withIndex("by_ref", (q) => q.eq("ref", args.uploadRef))
      .first();
    if (!session) return null;
    const media = session.mediaId ? await ctx.db.get(session.mediaId) : null;
    return {
      session,
      manifests: media?.b2Original && media.b2Renditions
        ? {
            original: media.b2Original,
            tiny: media.b2Renditions.tiny,
            medium: media.b2Renditions.medium,
            large: media.b2Renditions.large,
          }
        : null,
    };
  },
});

export const mediaUploadRef = internalQuery({
  args: { vaultOwnerId: v.string(), mediaId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("media", args.mediaId);
    const media = id ? await ctx.db.get(id) : null;
    if (!media || !matchesVaultOwner(media.vaultOwnerId, args.vaultOwnerId) || !media.uploadSessionRef) return null;
    return { uploadRef: media.uploadSessionRef };
  },
});
