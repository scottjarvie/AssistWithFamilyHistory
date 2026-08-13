function resolveConvexSiteOrigin() {
  const explicit = process.env.CONVEX_SITE_URL?.trim();
  if (explicit) {
    const url = new URL(explicit);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("CONVEX_SITE_URL must be HTTPS.");
    if (!url.hostname.endsWith(".convex.site") && url.hostname !== "localhost") throw new Error("CONVEX_SITE_URL must use a Convex site hostname.");
    return url.origin;
  }
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!cloud) throw new Error("Missing CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_URL.");
  const url = new URL(cloud);
  if (!url.hostname.endsWith(".convex.cloud")) throw new Error("NEXT_PUBLIC_CONVEX_URL must use a Convex cloud hostname.");
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  return url.origin;
}

export async function proxyFamilyHistoryMcpRequest(request: Request, path: string) {
  const target = new URL(path, resolveConvexSiteOrigin());
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > 256 * 1024) {
    return new Response("Family History MCP requests are limited to 256 KiB.", {
      status: 413,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });
  const responseHeaders = new Headers(upstream.headers);
  // Fetch owns transfer framing. Forwarding hop-by-hop or encoded byte-length
  // headers after it has exposed a response stream can make a second server
  // emit a successful response with no body.
  for (const name of [
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
