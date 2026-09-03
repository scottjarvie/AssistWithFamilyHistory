import { proxyFamilyHistoryMcpRequest } from "@/lib/mcp/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compatibility spelling used by clients that discover metadata from the
 * resource origin before they know its `/mcp` path. It returns the same
 * document directly; a redirect here would strand clients that do not replay
 * discovery requests across host or path redirects.
 */
export async function GET(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/.well-known/oauth-protected-resource");
}

export async function OPTIONS(request: Request) {
  return proxyFamilyHistoryMcpRequest(request, "/.well-known/oauth-protected-resource");
}
