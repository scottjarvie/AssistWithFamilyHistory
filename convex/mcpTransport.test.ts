/// <reference types="vite/client" />

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import schema from "./schema";
import { api } from "./_generated/api";
import { FAMILY_HISTORY_ALL_TOOL_NAMES, FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const RESOURCE = "https://family-history.example.test/mcp";
const ISSUER = "https://identity.example.test";
const SUBJECT = "user_mcp_transport_AAAAAAAAA";
const PROTOCOL_VERSION = "2026-07-28";
const CLIENT_ID = "synthetic-client";

/** Put an approved connection in place; every tool now requires one. */
async function approvedConnection(t: ReturnType<typeof convexTest>) {
  return await seedGrant(t, { vaultOwnerId: SUBJECT, clientId: CLIENT_ID, issuer: ISSUER });
}

let privateKey: KeyLike;
let jwk: JsonWebKey;

function modernRequest(
  method: string,
  token?: string,
  params: Record<string, unknown> = {},
  name?: string,
): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": method,
      ...(name ? { "mcp-name": name } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "family-history-synthetic-client", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  };
}

async function accessToken() {
  return new SignJWT({ scope: "family_history:read family_history:write", client_id: "synthetic-client" })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject(SUBJECT)
    .setAudience(RESOURCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "synthetic-key", use: "sig", alg: "RS256" };
});

beforeEach(() => {
  vi.stubEnv("MCP_RESOURCE_URL", RESOURCE);
  vi.stubEnv("MCP_AUTH_SERVER_URL", ISSUER);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== `${ISSUER}/.well-known/jwks.json`) throw new Error(`Unexpected external fetch: ${url}`);
    return Response.json({ keys: [jwk] }, { headers: { "cache-control": "no-store" } });
  }));
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stateless Family History MCP transport", () => {
  test("publishes protected-resource metadata and a real anonymous OAuth challenge", async () => {
    const t = convexTest(schema, modules);
    const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: RESOURCE,
      resource_name: "Assist With Family History",
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
    });

    const anonymous = await t.fetch("/mcp", modernRequest("tools/list"));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://family-history.example.test/.well-known/oauth-protected-resource/mcp"',
    );
    await expect(anonymous.json()).resolves.toMatchObject({ error: "invalid_token" });
  });

  /**
   * A conformant client should not have to read our prose to learn that six
   * `family_history:*` permissions exist. Before this, the protected-resource
   * document advertised where to authorize but never what could be asked for,
   * so a client could only request nothing or guess.
   *
   * The equality assertion is the point: it fails the moment someone hand-types
   * a scope into the metadata response or adds one to the catalog without the
   * other, which is exactly how an advertisement drifts from what is enforced.
   */
  test("advertises exactly the six enforced permissions as scopes_supported", async () => {
    const t = convexTest(schema, modules);
    const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
    const document = (await metadata.json()) as { scopes_supported?: unknown };

    expect(document.scopes_supported).toEqual([...FAMILY_HISTORY_SCOPES]);
    expect(document.scopes_supported).toHaveLength(6);
    // Nothing outside the ceiling may be advertised, ever. An advertised scope
    // that has no tool and no code path is a promise the server cannot keep.
    for (const scope of document.scopes_supported as string[]) {
      expect(scope.startsWith("family_history:")).toBe(true);
    }
  });

  /**
   * The audience posture, pinned by test so it stays a decision rather than an
   * accident. `aud` is validated when present and accepted when absent; the
   * reasoning lives beside the check in `convex/httpRoutes/mcp.ts`.
   */
  describe("audience posture: validated when present, accepted when absent", () => {
    async function tokenWithAudience(audience: string | undefined) {
      const jwt = new SignJWT({ client_id: CLIENT_ID })
        .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
        .setIssuer(ISSUER)
        .setSubject(SUBJECT)
        .setIssuedAt()
        .setExpirationTime("5m");
      if (audience !== undefined) jwt.setAudience(audience);
      return jwt.sign(privateKey);
    }

    test("a token whose audience names this resource is accepted", async () => {
      const t = convexTest(schema, modules);
      await approvedConnection(t);
      const response = await t.fetch("/mcp", modernRequest("tools/list", await tokenWithAudience(RESOURCE)));
      expect(response.status).toBe(200);
      expect((await response.json()).error).toBeUndefined();
    });

    test("a token minted for a different resource is refused", async () => {
      const t = convexTest(schema, modules);
      await approvedConnection(t);
      const response = await t.fetch(
        "/mcp",
        modernRequest("tools/list", await tokenWithAudience("https://some-other-assist-product.example.test/mcp")),
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_token" });
    });

    test("a token with no audience claim at all is accepted, because the issuer pin and the grant carry it", async () => {
      const t = convexTest(schema, modules);
      await approvedConnection(t);
      const response = await t.fetch("/mcp", modernRequest("tools/list", await tokenWithAudience(undefined)));
      expect(response.status).toBe(200);
      expect((await response.json()).error).toBeUndefined();
    });

    test("an audience-less token from another issuer is still refused", async () => {
      const t = convexTest(schema, modules);
      await approvedConnection(t);
      const foreign = await new SignJWT({ client_id: CLIENT_ID })
        .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
        .setIssuer("https://identity.some-other-product.example.test")
        .setSubject(SUBJECT)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      const response = await t.fetch("/mcp", modernRequest("tools/list", foreign));
      expect(response.status).toBe(401);
    });
  });

  test("normalizes only the retired production resource and issuer hosts", async () => {
    vi.stubEnv("MCP_RESOURCE_URL", "https://discovertheirstories.com/mcp");
    vi.stubEnv("MCP_AUTH_SERVER_URL", "https://clerk.discovertheirstories.com");
    const t = convexTest(schema, modules);

    const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
    await expect(metadata.json()).resolves.toMatchObject({
      resource: "https://assistwithfamilyhistory.com/mcp",
      authorization_servers: ["https://clerk.assistwithfamilyhistory.com"],
    });
  });

  test("an authenticated modern client lists the complete bounded tool catalog without a session", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch("/mcp", modernRequest("tools/list", await accessToken()));
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    const payload = await response.json();
    expect(payload.error).toBeUndefined();
    expect(payload.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(
      [...FAMILY_HISTORY_ALL_TOOL_NAMES].sort(),
    );
    for (const tool of payload.result.tools) {
      expect(tool.inputSchema?.properties?.ownerId).toBeUndefined();
      expect(tool.inputSchema?.properties?.vaultOwnerId).toBeUndefined();
    }
  });

  test("the official v2 MCP client negotiates, lists tools, and saves through the stateless handler", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const token = await accessToken();
    const client = new Client(
      { name: "family-history-official-client-proof", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
      authProvider: { token: async () => token },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const body = request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer();
        return t.fetch(new URL(request.url).pathname, {
          method: request.method,
          headers: request.headers,
          body,
        });
      },
    });

    await client.connect(transport);
    const catalog = await client.listTools();
    expect(catalog.tools.map((tool) => tool.name).sort()).toEqual([...FAMILY_HISTORY_ALL_TOOL_NAMES].sort());
    const result = await client.callTool({
      name: "save_person",
      arguments: {
        operationId: "official-client-save-person",
        mode: "create",
        createKey: "person:official-client:synthetic",
        name: { given: "Official", surname: "Client" },
        sex: "unknown",
        living: false,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ person: { created: true } });
    await client.close();
  });

  test("an authenticated modern client writes a canonical person without supplying tenant identity", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), {
      name: "save_person",
      arguments: {
        operationId: "transport-save-person",
        mode: "create",
        createKey: "person:transport:synthetic",
        name: { given: "Transport", surname: "Proof" },
        sex: "unknown",
        living: false,
        researchStatus: "basic",
        tags: ["synthetic-mcp-proof"],
      },
    }, "save_person"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.error).toBeUndefined();
    expect(payload.result.isError).not.toBe(true);
    const saved = JSON.parse(payload.result.content[0].text);
    expect(saved).toMatchObject({ deduplicated: false, person: { created: true } });

    const briefResponse = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), {
      name: "get_family_history_brief",
      arguments: {},
    }, "get_family_history_brief"));
    const briefPayload = await briefResponse.json();
    const brief = JSON.parse(briefPayload.result.content[0].text);
    expect(brief.recentPeople).toEqual([
      expect.objectContaining({ name: "Transport Proof", living: false }),
    ]);
  });

  test("the OAuth chosen-AI identity claims Queue work and the normal product read sees it", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const created = await t.withIdentity({ subject: SUBJECT }).mutation(api.queue.createQueueItem, {
      vaultOwnerId: SUBJECT,
      directive: "Review the synthetic census clue and preserve a sourced finding.",
      chosenAiId: "oauth-chosen-ai",
      idempotencyKey: "transport-queue-create",
    });
    expect(created.item).toMatchObject({ state: "waiting_for_your_ai", condition: "ready", version: 1 });

    const listResponse = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), {
      name: "get_queue",
      arguments: { action: "list", state: "waiting_for_your_ai", limit: 10 },
    }, "get_queue"));
    const listPayload = await listResponse.json();
    const list = JSON.parse(listPayload.result.content[0].text);
    expect(list.page).toEqual([
      expect.objectContaining({ _id: created.item._id, state: "waiting_for_your_ai" }),
    ]);

    const claimResponse = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), {
      name: "update_queue",
      arguments: {
        action: "claim",
        operationId: "transport-queue-claim",
        queueItemId: created.item._id,
        expectedVersion: 1,
        leaseMs: 120_000,
        nextStep: "Read the attached person and source context.",
      },
    }, "update_queue"));
    const claimPayload = await claimResponse.json();
    expect(claimPayload.result.isError).not.toBe(true);

    const productRead = await t.withIdentity({ subject: SUBJECT }).action(api.queue.getQueueItem, {
      vaultOwnerId: SUBJECT,
      queueItemId: created.item._id,
      activityPagination: { numItems: 20, cursor: null },
    });
    expect(productRead?.item).toMatchObject({ state: "working", condition: "active", version: 2 });
    expect(productRead?.activity.page.some((entry) => entry.eventType === "claimed")).toBe(true);
  });

  test("rejects a signed Clerk session-shaped JWT instead of treating it as chosen-AI authority", async () => {
    const token = await new SignJWT({ sid: "session_synthetic" })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "JWT" })
      .setIssuer(ISSUER)
      .setSubject(SUBJECT)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", modernRequest("tools/list", token));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_token" });
  });

  test("rejects an access-token JWT without Clerk's OAuth client identifier", async () => {
    const token = await new SignJWT({ scope: "family_history:read" })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
      .setIssuer(ISSUER)
      .setSubject(SUBJECT)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", modernRequest("tools/list", token));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_token" });
  });
});
