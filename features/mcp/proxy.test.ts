import { afterEach, describe, expect, test, vi } from "vitest";
import { GET as getMetadata } from "../../app/.well-known/oauth-protected-resource/mcp/route";
import { proxyFamilyHistoryMcpRequest } from "../../lib/mcp/proxy";

const CLOUD_URL = "https://family-history-proxy-test.convex.cloud";
const SITE_URL = "https://family-history-proxy-test.convex.site";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("branded Family History MCP proxy", () => {
  test("reconstructs the Convex site URL and preserves metadata headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", CLOUD_URL);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(`${SITE_URL}/.well-known/oauth-protected-resource/mcp`);
      return Response.json({ resource: "https://discovertheirstories.com/mcp" }, {
        headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
      });
    }));
    const response = await getMetadata(new Request("https://discovertheirstories.com/.well-known/oauth-protected-resource/mcp"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    await expect(response.json()).resolves.toMatchObject({ resource: "https://discovertheirstories.com/mcp" });
  });

  test("preserves the anonymous challenge and rejects an oversized body before forwarding", async () => {
    vi.stubEnv("CONVEX_SITE_URL", SITE_URL);
    const fetchMock = vi.fn(async () => Response.json({ error: "invalid_token" }, {
      status: 401,
      headers: { "www-authenticate": 'Bearer resource_metadata="https://discovertheirstories.com/.well-known/oauth-protected-resource/mcp"' },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const challenge = await proxyFamilyHistoryMcpRequest(new Request("https://discovertheirstories.com/mcp", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), "/mcp");
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get("www-authenticate")).toContain("resource_metadata=");

    const oversized = await proxyFamilyHistoryMcpRequest(new Request("https://discovertheirstories.com/mcp", {
      method: "POST", body: "x".repeat(256 * 1024 + 1),
    }), "/mcp");
    expect(oversized.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns a live upstream stream without forwarding stale framing headers", async () => {
    vi.stubEnv("CONVEX_SITE_URL", SITE_URL);
    let releaseChunk!: () => void;
    const chunkReady = new Promise<void>((resolve) => { releaseChunk = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      async start(controller) {
        await chunkReady;
        controller.enqueue(new TextEncoder().encode('{"resource":"streamed"}'));
        controller.close();
      },
    }), {
      headers: {
        "content-type": "application/json",
        "content-length": "999",
        "content-encoding": "gzip",
        "transfer-encoding": "chunked",
      },
    })));

    let settled = false;
    const responsePromise = proxyFamilyHistoryMcpRequest(
      new Request("https://discovertheirstories.com/.well-known/oauth-protected-resource/mcp"),
      "/.well-known/oauth-protected-resource/mcp",
    ).then((response) => { settled = true; return response; });
    await vi.waitFor(() => expect(settled).toBe(true));
    const response = await responsePromise;
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("transfer-encoding")).toBeNull();
    releaseChunk();
    await expect(response.json()).resolves.toEqual({ resource: "streamed" });
  });
});
