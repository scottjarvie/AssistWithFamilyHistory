import { proxyFamilyHistoryMcpRequest } from "@/lib/mcp/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/mcp");
}

export async function OPTIONS(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/mcp");
}

export function GET() {
  return new Response("Family History MCP uses POST. Setup: /ai", {
    status: 405,
    headers: { Allow: "POST,OPTIONS", "Content-Type": "text/plain; charset=utf-8" },
  });
}
