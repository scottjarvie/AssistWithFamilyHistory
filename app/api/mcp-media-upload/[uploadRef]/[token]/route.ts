import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createHash } from "node:crypto";
import { EVIDENCE_ORIGINAL_MAX_BYTES, EVIDENCE_IMAGE_TYPES } from "@/lib/media/evidenceStandard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const authorizeRelay = makeFunctionReference<
  "action",
  { uploadRef: string; relayToken: string },
  { method: "PUT"; url: string; contentType: string; sizeBytes: number; sha256: string }
>("mediaEvidenceStorage:authorizeMcpEvidenceRelay");

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

/**
 * First-party upload relay for clients whose network allowlist admits the
 * product hostname but not a private storage provider.
 *
 * The caller supplies only an opaque bearer capability and bytes. Convex
 * resolves the owner, grant, exact object key, type, length and hash; this
 * route never accepts those authority coordinates and never returns the B2
 * signed URL it uses server-to-server.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadRef: string; token: string }> },
): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    !Number.isSafeInteger(declaredLength)
    || declaredLength < 1
    || declaredLength > EVIDENCE_ORIGINAL_MAX_BYTES
  ) return reply(413, "Upload must declare a valid Content-Length within the evidence limit.");

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!(EVIDENCE_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return reply(415, "This evidence relay currently accepts JPEG, PNG, or WebP images.");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return reply(503, "Evidence upload is not configured.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== declaredLength) return reply(400, "Upload byte length changed in transit.");

  const { uploadRef, token } = await context.params;
  try {
    const authorization = await new ConvexHttpClient(convexUrl).action(authorizeRelay, {
      uploadRef,
      relayToken: token,
    });
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (
      authorization.method !== "PUT"
      || authorization.contentType.toLowerCase() !== contentType
      || authorization.sizeBytes !== bytes.byteLength
      || authorization.sha256 !== digest
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
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    // Invalid, expired, revoked, reused and cross-owner capabilities are
    // intentionally indistinguishable at this public bearer endpoint.
    return reply(404, "Upload authorization not found.");
  }
}
