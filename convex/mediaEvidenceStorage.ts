"use node";

/* eslint-disable @typescript-eslint/no-explicit-any -- Generated internal references are runtime-validated by Convex. */
import { randomBytes, randomUUID } from "node:crypto";
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import {
  EvidenceB2Store,
  assertEvidenceBucketSeparation,
  isEvidenceB2AccessDenied,
  loadEvidenceB2Config,
  sha256Hex,
} from "../lib/media/evidenceB2";
import { finalizeEvidenceImage } from "../lib/media/evidenceFinalize";
import {
  EVIDENCE_UPLOAD_TTL_SECONDS,
  assertEvidenceUploadShape,
  assertSha256,
  privateEvidenceObjectKey,
} from "../lib/media/evidenceStandard";

const internalApi = anyApi;

const principalValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
  clientId: v.string(),
  scopes: v.array(v.string()),
});

const uploadInputValidator = v.object({
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
});

function storage(): EvidenceB2Store {
  const privateConfig = loadEvidenceB2Config("private");
  const publicConfig = loadEvidenceB2Config("public");
  assertEvidenceBucketSeparation(privateConfig, publicConfig);
  return new EvidenceB2Store(privateConfig);
}

const STORAGE_PROBE_PREFIX = "codex-test:awf-media-provider:";

function evidenceStores(): Record<"private" | "public", EvidenceB2Store> {
  const privateConfig = loadEvidenceB2Config("private");
  const publicConfig = loadEvidenceB2Config("public");
  assertEvidenceBucketSeparation(privateConfig, publicConfig);
  return {
    private: new EvidenceB2Store(privateConfig),
    public: new EvidenceB2Store(publicConfig),
  };
}

async function verifyEvidenceStore(
  store: EvidenceB2Store,
  objectKey: string,
  bytes: Uint8Array,
): Promise<{ bucketClass: "private" | "public"; sizeBytes: number; sha256: string; cleanedUp: true }> {
  let versionId: string | undefined;
  try {
    const written = await store.put({ objectKey, bytes, contentType: "text/plain" });
    versionId = written.versionId;
    const head = await store.head(objectKey, versionId);
    const stored = await store.read(objectKey, versionId);
    const expectedSha256 = sha256Hex(bytes);
    if (head.sizeBytes !== bytes.byteLength || stored.byteLength !== bytes.byteLength) {
      throw new Error(`${store.config.bucketClass} B2 probe byte length changed.`);
    }
    if (written.sha256 !== expectedSha256 || sha256Hex(stored) !== expectedSha256) {
      throw new Error(`${store.config.bucketClass} B2 probe SHA-256 changed.`);
    }
    return {
      bucketClass: store.config.bucketClass,
      sizeBytes: stored.byteLength,
      sha256: expectedSha256,
      cleanedUp: true,
    };
  } finally {
    if (versionId) await store.deleteVersion(objectKey, versionId);
  }
}

async function verifyCredentialCannotListBucket(
  source: EvidenceB2Store,
  forbiddenBucket: string,
  prefix: string,
): Promise<true> {
  const forbidden = new EvidenceB2Store({ ...source.config, bucket: forbiddenBucket });
  try {
    await forbidden.countVersionEntries(prefix);
  } catch (error) {
    if (isEvidenceB2AccessDenied(error)) return true;
    throw error;
  }
  throw new Error(`${source.config.bucketClass} B2 credential unexpectedly listed the other bucket.`);
}

function publicOrigin(): string {
  const raw = process.env.MCP_PUBLIC_ORIGIN?.trim() || "https://assistwithfamilyhistory.com";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("MCP_PUBLIC_ORIGIN must be a plain HTTPS origin.");
  }
  return url.origin;
}

export const beginMcpEvidenceUpload = internalAction({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    operationId: v.string(),
    requestHash: v.string(),
    input: uploadInputValidator,
  },
  handler: async (ctx, args) => {
    assertEvidenceUploadShape(args.input.contentType, args.input.sizeBytes);
    const expectedSha256 = assertSha256(args.input.sha256);
    if (!args.input.title.trim() || args.input.title.length > 200) throw new Error("Evidence title is invalid.");
    if (!args.input.fileName.trim() || args.input.fileName.length > 240) throw new Error("Evidence file name is invalid.");
    const store = storage();
    const uploadRef = `family_evidence_${randomUUID()}`;
    const relayToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + EVIDENCE_UPLOAD_TTL_SECONDS * 1000;
    const planned = await ctx.runMutation(internalApi.mediaEvidenceControl.planMcpEvidenceUpload, {
      ...args,
      uploadRef,
      relayTokenHash: sha256Hex(new TextEncoder().encode(relayToken)),
      objectKey: privateEvidenceObjectKey(store.config.environment, uploadRef, "original"),
      expiresAt,
      input: { ...args.input, contentType: args.input.contentType.toLowerCase(), sha256: expectedSha256 },
    });
    if (planned.state === "ready") {
      return {
        status: "pending_person_review" as const,
        uploadRef: planned.uploadRef,
        mediaId: String(planned.mediaId),
        replayed: true,
        reviewAuthority: "person_only" as const,
      };
    }
    const url = `${publicOrigin()}/api/mcp-media-upload/${encodeURIComponent(planned.uploadRef)}/${relayToken}`;
    await ctx.scheduler.runAt(
      planned.expiresAt + 5 * 60_000,
      internalApi.mediaEvidenceStorage.cleanupMcpEvidenceUpload,
      { uploadRef: planned.uploadRef },
    );
    return {
      status: "pending_upload" as const,
      uploadRef: planned.uploadRef,
      upload: {
        method: "PUT" as const,
        url,
        contentType: planned.contentType,
        sizeBytes: planned.sizeBytes,
        sha256: planned.sha256,
        expiresAt: planned.expiresAt,
      },
      next: {
        tool: "family_history_finish_evidence_upload",
        operationId: args.operationId,
        uploadRef: planned.uploadRef,
      },
      replayed: planned.replayed,
      privacy: "private_unreviewed" as const,
    };
  },
});

/** Called only by the first-party relay after it proves the opaque bearer token. */
export const authorizeMcpEvidenceRelay = action({
  args: { uploadRef: v.string(), relayToken: v.string() },
  handler: async (ctx, args) => {
    const relay = await ctx.runQuery(internalApi.mediaEvidenceControl.relayAuthorization, {
      uploadRef: args.uploadRef,
      relayTokenHash: sha256Hex(new TextEncoder().encode(args.relayToken)),
    });
    if (!relay) throw new Error("Upload authorization not found.");
    const store = storage();
    return {
      method: "PUT" as const,
      url: await store.signPut({
        objectKey: relay.objectKey,
        contentType: relay.contentType,
        contentLength: relay.sizeBytes,
        expiresAt: relay.expiresAt,
      }),
      contentType: relay.contentType,
      sizeBytes: relay.sizeBytes,
      sha256: relay.sha256,
    };
  },
});

/**
 * Production-safe provider proof for operators. It writes only an explicit
 * synthetic marker, verifies the exact version and bytes in both configured
 * buckets, and removes each version before returning.
 */
export const verifyEvidenceStorageProvider = internalAction({
  args: { runKey: v.string() },
  handler: async (_ctx, args) => {
    if (!args.runKey.startsWith(STORAGE_PROBE_PREFIX) || args.runKey.length > 120) {
      throw new Error(`Storage probe runKey must start with ${STORAGE_PROBE_PREFIX}`);
    }
    const stores = evidenceStores();
    const probeId = randomUUID();
    const bytes = new TextEncoder().encode(
      `[SYNTHETIC STORAGE PROBE - SAFE TO DELETE]\n${args.runKey}\n${probeId}\n`,
    );
    const objectRoot = `${stores.private.config.environment}/operational-probes/${probeId}`;
    const results = [];
    for (const bucketClass of ["private", "public"] as const) {
      results.push(await verifyEvidenceStore(
        stores[bucketClass],
        `${objectRoot}/${bucketClass}.txt`,
        bytes,
      ));
    }
    const residueCounts = {
      private: await stores.private.countVersionEntries(objectRoot),
      public: await stores.public.countVersionEntries(objectRoot),
    };
    if (residueCounts.private !== 0 || residueCounts.public !== 0) {
      throw new Error("B2 probe cleanup left a marked synthetic version.");
    }
    const credentialIsolationVerified = {
      privateCannotListPublic: await verifyCredentialCannotListBucket(
        stores.private,
        stores.public.config.bucket,
        objectRoot,
      ),
      publicCannotListPrivate: await verifyCredentialCannotListBucket(
        stores.public,
        stores.private.config.bucket,
        objectRoot,
      ),
    };
    return {
      ok: true as const,
      environment: stores.private.config.environment,
      bucketSeparationVerified: stores.private.config.bucket !== stores.public.config.bucket,
      credentialIsolationVerified,
      residueCounts,
      results,
    };
  },
});

/**
 * Mint a server-to-server read for the metadata-clean medium rendition only.
 * The MCP transport consumes this URL immediately; it never enters a tool
 * result, model transcript, or browser response.
 */
export const signMcpEvidenceRead = internalAction({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    mediaId: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.runQuery(internalApi.mcpEvidence.getEvidenceBatch, {
      principal: args.principal,
      grantId: args.grantId,
      items: [{ kind: "media", id: args.mediaId }],
    });
    const item = batch.b2Stored?.find((candidate: any) => candidate.id === args.mediaId);
    if (!item) throw new Error("Evidence is not available to this connection.");
    const cleanupState = await ctx.runQuery(internalApi.mediaEvidenceControl.sessionForCleanup, {
      uploadRef: (await ctx.runQuery(internalApi.mediaEvidenceControl.mediaUploadRef, {
        vaultOwnerId: args.principal.subject,
        mediaId: args.mediaId,
      }))?.uploadRef ?? "",
    });
    const manifest = cleanupState?.manifests?.medium;
    if (!manifest) throw new Error("Evidence is not available to this connection.");
    const store = storage();
    if (manifest.bucketClass !== "private" || manifest.bucketName !== store.config.bucket) {
      throw new Error("Evidence manifest does not match the private store.");
    }
    return {
      url: await store.signGet(manifest.objectKey, manifest.versionId),
      id: item.id,
      kind: item.kind,
      title: item.title,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    };
  },
});

export const finishMcpEvidenceUpload = internalAction({
  args: {
    principal: principalValidator,
    grantId: v.optional(v.string()),
    operationId: v.string(),
    requestHash: v.string(),
    input: v.object({ uploadRef: v.string() }),
  },
  handler: async (ctx, args) => {
    void args.requestHash;
    const session = await ctx.runMutation(internalApi.mediaEvidenceControl.claimSessionForFinish, {
      principal: args.principal,
      grantId: args.grantId,
      uploadRef: args.input.uploadRef,
      operationId: args.operationId,
    });
    if (session.state === "ready" && session.mediaId) {
      return {
        status: "pending_person_review" as const,
        mediaId: String(session.mediaId),
        uploadRef: session.ref,
        replayed: true,
        privacy: "private" as const,
        reviewStatus: "unreviewed" as const,
        rightsStatus: "unknown" as const,
        aiUseAllowed: false,
      };
    }
    const store = storage();
    try {
      const verified = await finalizeEvidenceImage({
        store,
        uploadRef: session.ref,
        objectKey: session.objectKey,
        declaredContentType: session.declaredContentType,
        declaredSizeBytes: session.declaredSizeBytes,
        expectedSha256: session.expectedSha256,
        fileModifiedTime: session.fileModifiedTime,
        scanTime: session.scanTime,
        inferredHistoricalEventDate: session.inferredHistoricalEventDate,
      });
      const committed = await ctx.runMutation(internalApi.mediaEvidenceControl.commitMcpEvidenceUpload, {
        principal: args.principal,
        grantId: args.grantId,
        uploadRef: session.ref,
        original: verified.original,
        tiny: verified.renditions.tiny,
        medium: verified.renditions.medium,
        large: verified.renditions.large,
        metadataProposal: verified.metadataProposal,
      });
      await ctx.scheduler.runAt(
        session.expiresAt + 5 * 60_000,
        internalApi.mediaEvidenceStorage.cleanupMcpEvidenceUpload,
        { uploadRef: session.ref },
      );
      return {
        status: "pending_person_review" as const,
        mediaId: String(committed.mediaId),
        uploadRef: session.ref,
        replayed: committed.replayed,
        privacy: "private" as const,
        reviewStatus: "unreviewed" as const,
        rightsStatus: "unknown" as const,
        aiUseAllowed: false,
        metadata: {
          cameraCaptureTime: verified.metadataProposal.temporal.cameraCaptureTime ?? null,
          hasPrivateGpsProposal: Boolean(verified.metadataProposal.location),
          gpsAssociation: verified.metadataProposal.location?.association ?? null,
          gpsDisclosurePrecision: verified.metadataProposal.location?.disclosurePrecision ?? null,
        },
        next: "The person reviews source, rights, people, date, and location before this connection can read the evidence later.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const terminal = /SHA-256|byte length changed|stored content type changed|bytes do not match|unsupported image|decode|retained embedded metadata/i.test(message);
      if (terminal) {
        await ctx.runMutation(internalApi.mediaEvidenceControl.markUploadFailed, {
          vaultOwnerId: session.vaultOwnerId,
          uploadRef: session.ref,
          failureCode: "verification_failed",
        });
      } else {
        // Provider/network/rendition writes can be retried with the same
        // operation and object. Exact versions written by a partial rendition
        // attempt were already removed by finalizeEvidenceImage.
        await ctx.runMutation(internalApi.mediaEvidenceControl.releaseUploadForRetry, {
          vaultOwnerId: session.vaultOwnerId,
          uploadRef: session.ref,
        });
      }
      await ctx.scheduler.runAt(
        session.expiresAt + 5 * 60_000,
        internalApi.mediaEvidenceStorage.cleanupMcpEvidenceUpload,
        { uploadRef: session.ref },
      );
      throw error;
    }
  },
});

export const cleanupMcpEvidenceUpload = internalAction({
  args: { uploadRef: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internalApi.mediaEvidenceControl.sessionForCleanup, args);
    if (!state || state.session.expiresAt > Date.now()) return;
    const store = storage();
    if (state.session.state === "ready" && state.manifests) {
      await Promise.all(Object.values(state.manifests).map((manifest: any) =>
        store.deleteVersionsExcept(manifest.objectKey, manifest.versionId)));
      return;
    }
    if (["authorized", "uploaded", "failed", "expired"].includes(state.session.state)) {
      await Promise.all([
        state.session.objectKey,
        privateEvidenceObjectKey(store.config.environment, state.session.ref, "tiny"),
        privateEvidenceObjectKey(store.config.environment, state.session.ref, "medium"),
        privateEvidenceObjectKey(store.config.environment, state.session.ref, "large"),
      ].map(async (key) => {
        try { await store.deleteAllVersions(key); } catch { /* reconciliation retries */ }
      }));
      await ctx.runMutation(internalApi.mediaEvidenceControl.markUploadFailed, {
        vaultOwnerId: state.session.vaultOwnerId,
        uploadRef: state.session.ref,
        failureCode: "expired_cleanup_complete",
      });
    }
  },
});
