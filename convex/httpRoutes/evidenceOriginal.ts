import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { EVIDENCE_ORIGINAL_PATH, EVIDENCE_ORIGINAL_TOKEN } from "../../lib/mcp/contract";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const unavailable = () => new Response("Evidence is unavailable.", { status: 404, headers: privateHeaders });

export function registerEvidenceOriginalRoutes(http: HttpRouter) {
  http.route({
    pathPrefix: EVIDENCE_ORIGINAL_PATH,
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const token = new URL(request.url).pathname.slice(EVIDENCE_ORIGINAL_PATH.length);
      if (!EVIDENCE_ORIGINAL_TOKEN.test(token)) return unavailable();
      try {
        const file = await ctx.runQuery(internal.mcpEvidence.resolveOriginalLink, { token });
        if (!file) return unavailable();
        const stillAllowed = async () => {
          const current = await ctx.runQuery(internal.mcpEvidence.resolveOriginalLink, { token }).catch(() => null);
          return current?.version === file.version && current.mimeType === file.mimeType;
        };
        let stream: ReadableStream<Uint8Array>;
        if (file.storageId) {
          const blob = await ctx.storage.get(file.storageId);
          if (!blob) return unavailable();
          stream = blob.stream();
        } else if (file.original) {
          const { bucketName, objectKey, versionId } = file.original;
          const url = await ctx.runAction(internal.mediaEvidenceStorage.signEvidenceOriginal, { bucketName, objectKey, versionId });
          if (!await stillAllowed()) return unavailable();
          const response = await fetch(url, { redirect: "error" });
          if (!response.ok || !response.body) return unavailable();
          stream = response.body;
        } else return unavailable();
        if (!await stillAllowed()) {
          await stream.cancel().catch(() => {});
          return unavailable();
        }
        return new Response(stream, {
          headers: { ...privateHeaders, "Content-Type": file.mimeType, "Content-Disposition": "attachment" },
        });
      } catch {
        return unavailable();
      }
    }),
  });
}
