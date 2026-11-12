import {formatBytes} from "../lib/usageLimits/core";
import { anyApi, type HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { EVIDENCE_RELAY_BODY_BYTES, EVIDENCE_UPLOAD_TYPES } from "../../lib/media/evidenceStandard";

// Generated references; internal ones are reachable only from this server.
const publicApi = anyApi;
export const EVIDENCE_UPLOAD_PATH_PREFIX = "/evidence-upload/";

function reply(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload relay on the Convex site, for files up to 20 MiB.
 *
 * Same contract as the older product-hostname relay, which ran as a Vercel
 * function and so refused anything over about 4.5 MB: the caller sends only an
 * opaque capability and bytes; Convex resolves the owner, grant, object key,
 * type, length and hash; the B2 signed URL is used server-to-server here and
 * never returned.
 */
export const evidenceUploadRelay = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.slice(EVIDENCE_UPLOAD_PATH_PREFIX.length).split("/");
  // /{ref}/{token} carries a whole file; /{ref}/{token}/{partNumber} one part
  // of a file over 20 MiB.
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !part)) {
    return reply(404, "Upload authorization not found.");
  }
  let uploadRef: string;
  let token: string;
  try {
    [uploadRef, token] = parts.slice(0, 2).map((part) => decodeURIComponent(part));
  } catch {
    return reply(404, "Upload authorization not found.");
  }
  let partNumber: number | undefined;
  if (parts.length === 3) {
    partNumber = Number(parts[2]);
    if (!/^[1-9][0-9]{0,4}$/.test(parts[2]) || !Number.isSafeInteger(partNumber)) {
      return reply(404, "Upload authorization not found.");
    }
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > EVIDENCE_RELAY_BODY_BYTES) {
    return reply(413, `Upload must declare a valid Content-Length of at most ${formatBytes(EVIDENCE_RELAY_BODY_BYTES)}.`);
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!(EVIDENCE_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
    return reply(415, `This relay accepts ${EVIDENCE_UPLOAD_TYPES.join(", ")}.`);
  }

  let claimed = false;
  let uncertain = false;
  const relayTokenHash = await sha256Hex(new TextEncoder().encode(token).buffer as ArrayBuffer);
  const settle = (succeeded: boolean) => ctx.runMutation(publicApi.mediaEvidenceControl.settleEvidencePut, {
    uploadRef, relayTokenHash, ...(partNumber !== undefined ? { partNumber } : {}), succeeded, uncertain,
  });
  try {
    const authorization = await ctx.runAction(publicApi.mediaEvidenceStorage.prepareMcpEvidenceRelay, {
      uploadRef,
      relayToken: token,
      ...(partNumber !== undefined ? { partNumber } : {}),
    }) as { method: "PUT"; url: string; contentType: string; sizeBytes: number; sha256: string | null; alreadyStored?: boolean };
    claimed = true;
    if (authorization.sizeBytes !== declaredLength || authorization.contentType.toLowerCase() !== contentType) throw new Error("Upload authorization not found.");
    // Allocate once, and stop a streaming sender at its declared boundary.
    const bytes = new Uint8Array(declaredLength);
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing upload bytes.");
    let offset = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value.byteLength > bytes.length - offset) throw new Error("Upload byte length changed in transit.");
        bytes.set(value, offset); offset += value.byteLength;
      }
    } finally { await reader.cancel(); }
    if (offset !== bytes.length) throw new Error("Upload byte length changed in transit.");
    const digest = await sha256Hex(bytes.buffer);
    if (
      authorization.method !== "PUT"
      || authorization.contentType.toLowerCase() !== contentType
      || authorization.sizeBytes !== bytes.byteLength
      // A part has no hash of its own; the whole file's hash is checked at finish.
      || (partNumber === undefined && authorization.sha256 !== digest)
    ) throw new Error("Upload authorization not found.");

    uncertain = true;
    const stored = authorization.alreadyStored ? new Response(null, { status: 204 }) : await fetch(authorization.url, {
      method: "PUT",
      headers: partNumber === undefined
        ? { "Content-Type": authorization.contentType, "Content-Length": String(authorization.sizeBytes) }
        : { "Content-Length": String(authorization.sizeBytes) },
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!stored.ok) { uncertain = false; throw new Error("The private evidence store did not accept the upload."); }
    if (partNumber !== undefined) {
      const etag = stored.headers.get("etag");
      if (!etag) throw new Error("The private evidence store did not accept the upload.");
      await ctx.runMutation(publicApi.mediaEvidenceControl.recordMcpEvidencePart, {
        uploadRef,
        relayTokenHash: await sha256Hex(new TextEncoder().encode(token).buffer as ArrayBuffer),
        partNumber,
        etag,
        sizeBytes: bytes.byteLength,
        sha256: digest,
      });
    } else {
      await settle(true);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    if (claimed) await settle(false).catch(() => { /* Revoked connections leave the ordinary session to cleanup. */ });
    // Invalid, expired, revoked, reused and cross-owner capabilities are
    // intentionally indistinguishable at this public bearer endpoint.
    return reply(404, "Upload authorization not found.");
  }
});

export function registerEvidenceUploadRoutes(http: HttpRouter) {
  http.route({ pathPrefix: EVIDENCE_UPLOAD_PATH_PREFIX, method: "PUT", handler: evidenceUploadRelay });
}
