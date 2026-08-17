/**
 * Client ID Metadata Document validation.
 *
 * A client identifier that is an HTTPS URL is an instruction to go and fetch
 * something, which makes it an SSRF surface. These tests hold the strict rules
 * that make that safe enough to do: no redirects, no private hosts, a small
 * ceiling, JSON only, and a document that names itself correctly.
 */
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import {
  CLIENT_METADATA_MAX_BYTES,
  evaluateMetadataResponse,
  isForbiddenMetadataHost,
  validateClientIdUrl,
  validateClientMetadataDocument,
} from "../lib/mcp/clientMetadata";

const modules = import.meta.glob("./**/*.ts");
const CLIENT_URL = "https://client.example.test/mcp-client.json";

function goodDocument(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    client_id: CLIENT_URL,
    client_name: "Synthetic MCP Client",
    redirect_uris: ["https://client.example.test/callback", "http://127.0.0.1:7777/callback"],
    token_endpoint_auth_method: "none",
    code_challenge_methods_supported: ["S256"],
    grant_types: ["authorization_code", "refresh_token"],
    ...overrides,
  });
}

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

describe("client identifier URLs", () => {
  test("rejects non-HTTPS, credentials, query, and fragment", () => {
    expect(validateClientIdUrl("http://client.example.test/c.json")).toMatchObject({ reason: "NON_HTTPS" });
    expect(validateClientIdUrl("https://user:pw@client.example.test/c.json")).toMatchObject({
      reason: "URL_HAS_CREDENTIALS",
    });
    expect(validateClientIdUrl("https://client.example.test/c.json?x=1")).toMatchObject({
      reason: "URL_HAS_QUERY_OR_FRAGMENT",
    });
    expect(validateClientIdUrl("https://client.example.test/c.json#f")).toMatchObject({
      reason: "URL_HAS_QUERY_OR_FRAGMENT",
    });
    expect(validateClientIdUrl("not a url")).toMatchObject({ reason: "MALFORMED_URL" });
  });

  test("rejects private-network, loopback, and cloud metadata hosts", () => {
    for (const host of [
      "https://127.0.0.1/c.json",
      "https://localhost/c.json",
      "https://10.0.0.5/c.json",
      "https://169.254.169.254/c.json",
      "https://metadata.google.internal/c.json",
      "https://build.internal/c.json",
      "https://printer.local/c.json",
      "https://[::1]/c.json",
    ]) {
      expect(validateClientIdUrl(host), host).toMatchObject({ reason: "PRIVATE_NETWORK_HOST" });
    }
    expect(isForbiddenMetadataHost("client.example.test")).toBe(false);
  });

  test("accepts a well-formed public HTTPS identifier", () => {
    const result = validateClientIdUrl(CLIENT_URL);
    expect(result.ok).toBe(true);
  });
});

describe("metadata responses", () => {
  test("a redirect is a rejection, never a hop to follow", () => {
    expect(
      evaluateMetadataResponse(
        CLIENT_URL,
        { status: 302, redirected: false, headers: headers({ location: "https://elsewhere.test/c.json" }) },
        "",
      ),
    ).toMatchObject({ reason: "REDIRECT_REFUSED" });

    expect(
      evaluateMetadataResponse(
        CLIENT_URL,
        { status: 200, redirected: true, headers: headers({ "content-type": "application/json" }) },
        goodDocument(),
      ),
    ).toMatchObject({ reason: "REDIRECT_REFUSED" });
  });

  test("an oversize document is refused by declared length and by body length", () => {
    expect(
      evaluateMetadataResponse(
        CLIENT_URL,
        {
          status: 200,
          headers: headers({
            "content-type": "application/json",
            "content-length": String(CLIENT_METADATA_MAX_BYTES + 1),
          }),
        },
        goodDocument(),
      ),
    ).toMatchObject({ reason: "TOO_LARGE" });

    expect(
      validateClientMetadataDocument(CLIENT_URL, "x".repeat(CLIENT_METADATA_MAX_BYTES + 1)),
    ).toMatchObject({ reason: "TOO_LARGE" });
  });

  test("non-JSON content is refused", () => {
    expect(
      evaluateMetadataResponse(
        CLIENT_URL,
        { status: 200, headers: headers({ "content-type": "text/html" }) },
        goodDocument(),
      ),
    ).toMatchObject({ reason: "NOT_JSON" });
  });
});

describe("document contents", () => {
  test("client_id must exactly equal the URL it was fetched from", () => {
    expect(
      validateClientMetadataDocument(CLIENT_URL, goodDocument({ client_id: "https://client.example.test/other.json" })),
    ).toMatchObject({ reason: "CLIENT_ID_MISMATCH" });
    expect(validateClientMetadataDocument(CLIENT_URL, goodDocument({ client_id: undefined }))).toMatchObject({
      reason: "CLIENT_ID_MISMATCH",
    });
  });

  test("redirect URIs must be HTTPS or a real loopback", () => {
    expect(
      validateClientMetadataDocument(CLIENT_URL, goodDocument({ redirect_uris: ["http://evil.example.test/cb"] })),
    ).toMatchObject({ reason: "INSECURE_REDIRECT_URI" });
    expect(validateClientMetadataDocument(CLIENT_URL, goodDocument({ redirect_uris: [] }))).toMatchObject({
      reason: "MISSING_REDIRECT_URIS",
    });
    expect(validateClientMetadataDocument(CLIENT_URL, goodDocument()).ok).toBe(true);
  });

  test("a public client must declare PKCE", () => {
    expect(
      validateClientMetadataDocument(CLIENT_URL, goodDocument({ code_challenge_methods_supported: ["plain"] })),
    ).toMatchObject({ reason: "PKCE_NOT_DECLARED" });
    expect(
      validateClientMetadataDocument(CLIENT_URL, goodDocument({ code_challenge_methods_supported: undefined })),
    ).toMatchObject({ reason: "PKCE_NOT_DECLARED" });
  });

  test("a confidential client is out of scope for this surface", () => {
    expect(
      validateClientMetadataDocument(CLIENT_URL, goodDocument({ token_endpoint_auth_method: "client_secret_basic" })),
    ).toMatchObject({ reason: "PUBLIC_CLIENT_MUST_USE_NONE" });
  });
});

describe("validateClient", () => {
  test("a valid document is cached as a registration, and a rejection is recorded too", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(goodDocument(), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    const trusted = await t.action(internal.mcpClientTrust.validateClient, { clientId: CLIENT_URL });
    expect(trusted).toMatchObject({ trusted: true, provenance: "cimd", clientName: "Synthetic MCP Client" });

    const rows = await t.run(async (ctx) => ctx.db.query("mcpClientRegistrations").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "valid", provenance: "cimd" });
    expect(rows[0].expiresAt).toBeGreaterThan(Date.now());

    vi.unstubAllGlobals();
  });

  test("an opaque provider client identifier is honestly reported as untrusted, not invented", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(internal.mcpClientTrust.validateClient, { clientId: "client_abc123" });
    expect(result).toMatchObject({ trusted: false, provenance: "manual" });
  });

  test("a private-network client identifier never reaches the network", async () => {
    const t = convexTest(schema, modules);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await t.action(internal.mcpClientTrust.validateClient, {
      clientId: "https://169.254.169.254/c.json",
    });
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe("PRIVATE_NETWORK_HOST");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
