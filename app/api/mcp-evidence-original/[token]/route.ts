import { EVIDENCE_ORIGINAL_PATH, EVIDENCE_ORIGINAL_TOKEN } from "@/lib/mcp/contract";
import { proxyFamilyHistoryMcpRequest } from "@/lib/mcp/proxy";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (EVIDENCE_ORIGINAL_TOKEN.test(token)) {
    try {
      // The bearer capability is the only credential needed upstream.
      const upstream = await proxyFamilyHistoryMcpRequest(new Request(request.url), `${EVIDENCE_ORIGINAL_PATH}${token}`);
      if (upstream.status === 200 && upstream.body && !upstream.headers.has("Location")) {
        return new Response(upstream.body, {
          headers: { ...privateHeaders, "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream", "Content-Disposition": "attachment" },
        });
      }
    } catch { /* Same refusal for every unavailable file. */ }
  }
  return new Response("Evidence is unavailable.", { status: 404, headers: privateHeaders });
}
