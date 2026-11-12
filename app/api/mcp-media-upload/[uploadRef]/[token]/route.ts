import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { EVIDENCE_RELAY_BODY_BYTES, EVIDENCE_IMAGE_TYPES } from "@/lib/media/evidenceStandard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    || declaredLength > EVIDENCE_RELAY_BODY_BYTES
  ) return reply(413, "Upload must declare a valid Content-Length within the evidence limit.");

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!(EVIDENCE_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return reply(415, "This evidence relay currently accepts JPEG, PNG, or WebP images.");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return reply(503, "Evidence upload is not configured.");
  const { uploadRef, token } = await context.params;
  const origin = new URL(convexUrl);
  if (!origin.hostname.endsWith(".convex.cloud")) return reply(503, "Evidence upload is not configured.");
  origin.hostname = origin.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  try {
    const authorization = await new ConvexHttpClient(convexUrl).action(
      makeFunctionReference<"action", { uploadRef: string; relayToken: string }, { relayToken: string }>("mediaEvidenceStorage:authorizeMcpEvidenceRelay"),
      { uploadRef, relayToken: token },
    );
    origin.pathname = `/evidence-upload/${encodeURIComponent(uploadRef)}/${encodeURIComponent(authorization.relayToken)}`;
    return await fetch(origin, {
      method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(declaredLength) },
      body: request.body, duplex: "half", redirect: "error",
    } as RequestInit);
  } catch {
    return reply(404, "Upload authorization not found.");
  }
}
