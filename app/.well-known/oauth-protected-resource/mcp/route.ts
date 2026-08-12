import { proxyFamilyHistoryMcpRequest } from "@/lib/mcp/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/.well-known/oauth-protected-resource/mcp");
}

export async function OPTIONS(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/.well-known/oauth-protected-resource/mcp");
}
