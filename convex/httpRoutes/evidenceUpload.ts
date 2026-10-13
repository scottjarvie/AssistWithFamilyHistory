import { anyApi, type HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { EVIDENCE_ORIGINAL_MAX_BYTES, EVIDENCE_UPLOAD_TYPES } from "../../lib/media/evidenceStandard";

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
  if (parts.length !== 2 || !parts[0] || !parts[1]) return reply(404, "Upload authorization not found.");
  let uploadRef: string;
  let token: string;
  try {
    [uploadRef, token] = parts.map((part) => decodeURIComponent(part));
  } catch {
    return reply(404, "Upload authorization not found.");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > EVIDENCE_ORIGINAL_MAX_BYTES) {
    return reply(413, "Upload must declare a valid Content-Length of at most 20 MiB.");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!(EVIDENCE_UPLOAD_TYPES as readonly string[]).includes(contentType)) {
    return reply(415, `This relay accepts ${EVIDENCE_UPLOAD_TYPES.join(", ")}.`);
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== declaredLength) return reply(400, "Upload byte length changed in transit.");

  try {
    const authorization = await ctx.runAction(publicApi.mediaEvidenceStorage.authorizeMcpEvidenceRelay, {
      uploadRef,
      relayToken: token,
    }) as { method: "PUT"; url: string; contentType: string; sizeBytes: number; sha256: string };
    if (
      authorization.method !== "PUT"
      || authorization.contentType.toLowerCase() !== contentType
      || authorization.sizeBytes !== bytes.byteLength
      || authorization.sha256 !== await sha256Hex(bytes)
    ) return reply(404, "Upload authorization not found.");

    const stored = await fetch(authorization.url, {
      method: "PUT",
      headers: {
        "Content-Type": authorization.contentType,
        "Content-Length": String(authorization.sizeBytes),
      },
      body: bytes,
    });
    if (!stored.ok) return reply(502, "The private evidence store did not accept the upload.");
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    // Invalid, expired, revoked, reused and cross-owner capabilities are
    // intentionally indistinguishable at this public bearer endpoint.
    return reply(404, "Upload authorization not found.");
  }
});

export function registerEvidenceUploadRoutes(http: HttpRouter) {
  http.route({ pathPrefix: EVIDENCE_UPLOAD_PATH_PREFIX, method: "PUT", handler: evidenceUploadRelay });
}
