import { FAMILY_HISTORY_CONTROL_TOOLS } from "../lib/mcp/catalog";
import { readFileSync } from "node:fs";
/// <reference types="vite/client" />

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import schema from "./schema";
import { api } from "./_generated/api";
import { FAMILY_HISTORY_CANONICAL_TOOL_NAMES, FAMILY_HISTORY_SCOPES, FAMILY_HISTORY_TOOLS } from "../lib/mcp/catalog";
import { seedGrant } from "../lib/mcp/testSupport";
import { assertConnectorContract } from "./lib/mcpConnector/contract";
import { hasEmbeddedImageMetadata } from "../lib/media/evidenceStandard";
import { AI_COPY_MAX_BYTES } from "./lib/mcpConnector/mediaRead";
import sharp from "sharp";

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

async function accessToken(clientId = "synthetic-client", audience = RESOURCE) {
  return new SignJWT({ scope: "family_history:read family_history:write", client_id: clientId })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject(SUBJECT)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function connectOfficialClient(t: ReturnType<typeof convexTest>, token: string) {
  const client = new Client(
    { name: "family-history-official-client-proof", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(RESOURCE), {
    authProvider: { token: async () => token },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
      return t.fetch(new URL(request.url).pathname, { method: request.method, headers: request.headers, body });
    },
  }));
  return client;
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
  test.each(["full", "limited", "pending", "paused", "revoked", "expired"] as const)(
    "initialize and tools/list satisfy the family connector contract in the %s state", async state => {
      const t = convexTest(schema, modules);
      const grantId = await seedGrant(t, {
        vaultOwnerId: SUBJECT, clientId: CLIENT_ID, issuer: ISSUER,
        status: state === "pending" || state === "revoked" ? state : "active",
        expiresAt: state === "full" ? null : state === "expired" ? Date.now() - 1 : Date.now() + 10_000_000,
        ...(state === "limited" ? { scopes: ["family_history:context:read" as const], boundary: { kind: "selected_people" as const, personIds: ["synthetic-person"] } } : {}),
      });
      if (state === "paused" || state === "revoked") await t.run(async ctx => {
        const id = ctx.db.normalizeId("mcpGrants", grantId)!;
        await ctx.db.patch(id, state === "paused" ? { pausedAt: Date.now() } : { revokedAt: Date.now() });
      });
      const client = await connectOfficialClient(t, await accessToken());
      const text = client.getInstructions();
      const { tools } = await client.listTools();
      await client.close();
      const authorityMarkers = ["ACCESS.", "Only the person can give access back", "You can never widen", "Permanent deletion", "Living-person records", "reviewed, AI-allowed media", "rights that permit AI use", "media-review"];
      assertConnectorContract(text ?? "", authorityMarkers, tools, "family_history_");
      expect(text).toContain(`Actual connection: ${state === "full" || state === "limited" ? "active" : state}`);
      expect(tools.length).toBeGreaterThan(0);
      const descriptions = new Map([...FAMILY_HISTORY_TOOLS, ...FAMILY_HISTORY_CONTROL_TOOLS].map(tool => [tool.name, tool.description]));
      for (const tool of tools) expect(tool.description).toBe(descriptions.get(tool.name));
    },
  );

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

  test("publishes the same protected-resource metadata at the root compatibility path", async () => {
    const t = convexTest(schema, modules);
    const canonical = await t.fetch("/.well-known/oauth-protected-resource/mcp");
    const compatibility = await t.fetch("/.well-known/oauth-protected-resource");

    expect(compatibility.status).toBe(200);
    expect(compatibility.headers.get("location")).toBeNull();
    expect(await compatibility.json()).toEqual(await canonical.json());
  });

  /**
   * The product scope vocabulary is published for a human reader under a
   * vendor-prefixed key, and must NEVER appear as RFC 9728 `scopes_supported`.
   *
   * A conforming client treats `scopes_supported` as an instruction and copies
   * those values into the `scope` parameter of its authorization request. Clerk
   * is the authorization server and can only issue its own identity scopes, so
   * advertising `family_history:*` there makes OAuth fail with
   * `Invalid scope requested` before consent — which is exactly what happened to
   * a sibling Assist product with a real client.
   *
   * Two assertions, doing two different jobs: the equality catches drift between
   * what is published and what is enforced, and the absence check stops the
   * dangerous field ever coming back.
   */
  describe("the product scope vocabulary is discoverable without instructing a client", () => {
    test("publishes the seven enforced permissions under the vendor-prefixed key", async () => {
      const t = convexTest(schema, modules);
      const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
      const document = (await metadata.json()) as Record<string, unknown>;

      const published = document["x-assistwithfamilyhistory.productScopes"];
      expect(published).toEqual([...FAMILY_HISTORY_SCOPES]);
      expect(published).toHaveLength(FAMILY_HISTORY_SCOPES.length);
      // Nothing outside the ceiling may be published, ever. A published scope
      // with no tool and no code path is a promise the server cannot keep.
      for (const scope of published as string[]) {
        expect(scope.startsWith("family_history:")).toBe(true);
      }
    });

    test("does not emit scopes_supported, which would tell clients to ask Clerk for scopes it cannot issue", async () => {
      const t = convexTest(schema, modules);
      const metadata = await t.fetch("/.well-known/oauth-protected-resource/mcp");
      const document = (await metadata.json()) as Record<string, unknown>;

      // Asserted against the PARSED DOCUMENT, deliberately — not against the
      // source text and not against the raw body. The comment that explains this
      // rule necessarily names the field, so a substring search would fail on
      // its own explanation.
      expect(Object.keys(document)).not.toContain("scopes_supported");
      expect("scopes_supported" in document).toBe(false);
      // Nor under any other spelling a future edit might reach for.
      expect(Object.keys(document)).not.toContain("scope");
      expect(Object.keys(document)).not.toContain("scopes");
    });
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
      [...FAMILY_HISTORY_CANONICAL_TOOL_NAMES, ...FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name)].sort(),
    );
    for (const tool of payload.result.tools) {
      expect(tool.inputSchema?.properties?.ownerId).toBeUndefined();
      expect(tool.inputSchema?.properties?.vaultOwnerId).toBeUndefined();
    }
  });

  test("single-record write tools publish one object with every field, not an allOf a client flattens away", async () => {
    // Claude rendered the old `allOf: [{operationId}, oneOf[...]]` shape as
    // `{operationId}` alone, so the AI never saw `mode`, `name` or `personId`.
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch("/mcp", modernRequest("tools/list", await accessToken()));
    type PublishedSchema = {
      type?: string;
      allOf?: unknown;
      additionalProperties?: unknown;
      required?: string[];
      properties: Record<string, { enum?: string[] }>;
    };
    const tools = (await response.json()).result.tools as Array<{ name: string; inputSchema: PublishedSchema }>;
    const byName = new Map(tools.map((tool) => [tool.name, tool.inputSchema]));
    const expected: Record<string, string[]> = {
      family_history_save_person: ["operationId", "mode", "createKey", "personId", "expectedUpdatedAt", "name", "sex", "living"],
      family_history_save_relationship: ["operationId", "mode", "createKey", "relationshipId", "type", "person1", "person2"],
      family_history_save_event: ["operationId", "mode", "createKey", "eventId", "type", "personRoles"],
      family_history_save_source_evidence: ["operationId", "source", "citation", "facts"],
      family_history_save_research_work: ["operationId", "task", "finding"],
      family_history_save_story_work: ["operationId", "mode", "createKey", "storyId", "title", "content"],
    };
    for (const [name, keys] of Object.entries(expected)) {
      const inputSchema = byName.get(name)!;
      expect(inputSchema, name).toBeDefined();
      expect(inputSchema.type, name).toBe("object");
      expect(inputSchema.allOf, name).toBeUndefined();
      expect(inputSchema.additionalProperties, name).toBe(false);
      expect(inputSchema.required, name).toContain("operationId");
      for (const key of keys) expect(Object.keys(inputSchema.properties), `${name}.${key}`).toContain(key);
    }
    expect(byName.get("family_history_save_person")!.properties.mode.enum).toEqual(["create", "update"]);
  });

  test("the object envelope still enforces each mode's own rules on the server", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const call = async (args: Record<string, unknown>) => {
      const response = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), {
        name: "family_history_save_person",
        arguments: args,
      }, "family_history_save_person"));
      return (await response.json());
    };
    const refusedOutcome = (payload: { error?: unknown; result?: { isError?: boolean } }) => payload.error !== undefined || payload.result?.isError === true;
    // A create without the create-only required name and sex.
    expect(refusedOutcome(await call({ operationId: "envelope-missing", mode: "create", createKey: "person:envelope:missing", living: false }))).toBe(true);
    // An update field on a create.
    expect(refusedOutcome(await call({ operationId: "envelope-mixed", mode: "create", createKey: "person:envelope:mixed", name: { given: "A", surname: "B" }, sex: "unknown", living: false, personId: "abc", expectedUpdatedAt: 1 }))).toBe(true);
    // An unknown key.
    expect(refusedOutcome(await call({ operationId: "envelope-unknown", mode: "create", createKey: "person:envelope:unknown", name: { given: "A", surname: "B" }, sex: "unknown", living: false, species: "x" }))).toBe(true);
    const ok = await call({ operationId: "envelope-valid", mode: "create", createKey: "person:envelope:valid", name: { given: "Envelope", surname: "Valid" }, sex: "unknown", living: false });
    expect(refusedOutcome(ok)).toBe(false);
  });

  test("the official v2 MCP client negotiates, lists tools, and saves through the stateless handler", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const client = await connectOfficialClient(t, await accessToken());
    const catalog = await client.listTools();
    expect(catalog.tools.map((tool) => tool.name).sort()).toEqual([...FAMILY_HISTORY_CANONICAL_TOOL_NAMES, ...FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name)].sort());
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

test("all 14 hidden compatibility names still run canonical tools and record their use", async () => {
  const t = convexTest(schema, modules);
  await approvedConnection(t);
  const token = await accessToken();
  const used: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await t.fetch("/mcp", modernRequest("tools/call", token, { name, arguments: args }, name));
    const body = await response.json();
    expect(body.error, name).toBeUndefined();
    expect(body.result.isError, name).not.toBe(true);
    used.push(name);
    return body.result.structuredContent;
  };
  const person = (prefix: string) => ({ mode: "create", createKey: `legacy-${prefix}`, name: { given: prefix, surname: "Synthetic" }, sex: "unknown", living: false });
  const saved = await call("save_person", { operationId: "alias-person-operation", ...person("Legacy") });
  const person1 = saved.person.id;
  const person2 = (await call("save_person", { operationId: "alias-second-person", ...person("Related") })).person.id;
  await call("get_family_history_brief");
  await call("search_family_history", { query: "Legacy" });
  expect((await call("get_family_history_context", { kind: "person", id: person1 })).person._id).toBe(person1);
  await call("save_relationship", { operationId: "alias-relationship", mode: "create", createKey: "legacy-relationship", type: "Couple", person1, person2 });
  await call("save_event", { operationId: "alias-event", mode: "create", createKey: "legacy-event", type: "census", personRoles: [{ personId: person1, role: "primary" }] });
  await call("save_source_evidence", { operationId: "alias-source", source: { mode: "create", createKey: "legacy-source", type: "census", title: "Synthetic census" }, citation: { mode: "create", createKey: "legacy-citation", confidence: "high" } });
  await call("save_research_work", { operationId: "alias-research", task: { mode: "create", createKey: "legacy-task", personId: person1, type: "record_search", title: "Synthetic task" } });
  await call("save_story_work", { operationId: "alias-story", mode: "create", createKey: "legacy-story", personId: person1, type: "biography", title: "Synthetic draft", content: "A draft." });
  await call("save_complete_result", { operationId: "alias-complete", summary: "Synthetic research pass", person: person("Complete") });
  const suggestion = (await call("add_queue", { operationId: "alias-suggestion", addedBy: "ai_suggestion", directive: "Find another source", reason: "One is missing" })).item;
  await call("withdraw_suggestion", { operationId: "alias-withdraw", expectedVersion: 1, queueItemId: suggestion._id });
  const requested = (await call("add_queue", { operationId: "alias-requested", addedBy: "ai_on_request", directive: "Look for a source" })).item;
  await call("get_queue", { action: "list" });
  await call("update_queue", { action: "request_user_action", operationId: "alias-update", expectedVersion: 1, queueItemId: requested._id, requiredAction: "Which source?" });

  const aliases = FAMILY_HISTORY_TOOLS.flatMap(tool => tool.alias ? [tool.alias] : []);
  expect(aliases).toHaveLength(14);
  expect(new Set(used)).toEqual(new Set(aliases));
  const activity = await t.run(ctx => ctx.db.query("agentActivity").collect());
  expect(new Set(activity.filter(row => row.detail === "Compatibility alias called.").map(row => row.scope))).toEqual(new Set(aliases));
});

/**
 * Malformed JSON-RPC envelopes.
 *
 * There was no coverage here at all, which meant the difference between "your
 * message was broken" and "your permission was refused" was untested — and
 * those two answers send a client in opposite directions. A client told 401
 * retries authorization forever; a client told 400 fixes its message.
 *
 * These lock in three things for every case: it is a 4xx, it is **not** a 401,
 * and it is a well-formed JSON-RPC error rather than a crash.
 */
describe("a malformed envelope gets a straight answer, not an auth challenge", () => {
  /**
   * Bypasses `modernRequest` on purpose: the point is to send bad bytes.
   *
   * No `mcp-protocol-version` header, deliberately — this is what an ordinary
   * HTTP client or a half-implemented one actually sends, and it is the path
   * where a wrong `Accept` is still caught at the transport layer.
   */
  function rawRequest(body: string, token: string, accept = "application/json, text/event-stream"): RequestInit {
    return {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept,
        authorization: `Bearer ${token}`,
      },
      body,
    };
  }

  test("body that is not JSON returns 400 with JSON-RPC parse error -32700", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch("/mcp", rawRequest("{ this is not json", await accessToken()));

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(401);
    const payload = await response.json();
    expect(payload).toMatchObject({ jsonrpc: "2.0", error: { code: -32700 } });
    expect(payload.error.message).toMatch(/parse error/i);
    // A parse failure must never be dressed up as an authorization problem.
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  test("a JSON body with no method returns 400 with invalid-request -32600", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch(
      "/mcp",
      rawRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, params: {} }), await accessToken()),
    );

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(401);
    await expect(response.json()).resolves.toMatchObject({ jsonrpc: "2.0", error: { code: -32600 } });
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  test("a body missing its jsonrpc version returns 400 and echoes the id back", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch(
      "/mcp",
      rawRequest(JSON.stringify({ id: 7, method: "tools/list" }), await accessToken()),
    );

    expect(response.status).toBe(400);
    // Echoing the id is what lets a client match the error to the call it made.
    await expect(response.json()).resolves.toMatchObject({ error: { code: -32600 }, id: 7 });
  });

  test("an Accept header that does not include both media types returns 406, not 401", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const response = await t.fetch(
      "/mcp",
      rawRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }), await accessToken(), "text/html"),
    );

    expect(response.status).toBe(406);
    expect(response.status).not.toBe(401);
    const payload = await response.json();
    expect(payload.error.message).toMatch(/application\/json and text\/event-stream/);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  test("a broken body with no bearer at all is still a 401 — authorization is checked first", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: "{ this is not json",
    });

    // Deliberate ordering, asserted so nobody "fixes" it later: an anonymous
    // caller learns nothing about our parser, not even whether its body parsed.
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_token" });
  });
});

/**
 * Reconnect after a deploy, and the tool list refreshing with it.
 *
 * What already existed was stale-*write* rejection (`assertFresh` in
 * `convex/mcpFamilyHistory.test.ts`) and stale framing headers
 * (`features/mcp/proxy.test.ts`). Neither is this. This is the case in the
 * published guidance: "If tools look stale after a deploy: disconnect the MCP
 * server, reconnect it, sign in again, and confirm the family_history_* names
 * appear." That instruction was never tested.
 *
 * Because the transport is stateless, a reconnect is simply the next request —
 * so the property to prove is that a fresh connection on the same token always
 * gets the current catalog, and that a narrowed or revoked grant changes the
 * list on the very next `tools/list` with no reconnect ritual needed.
 */
describe("reconnecting refreshes the tool list without a session to reset", () => {
  test("a second connection on the same token lists the current catalog, identically", async () => {
    const t = convexTest(schema, modules);
    await approvedConnection(t);
    const token = await accessToken();

    const first = await t.fetch("/mcp", modernRequest("tools/list", token));
    const second = await t.fetch("/mcp", modernRequest("tools/list", token));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // No session id in either direction: there is no handshake state that could
    // be holding an old catalog.
    expect(first.headers.get("mcp-session-id")).toBeNull();
    expect(second.headers.get("mcp-session-id")).toBeNull();

    const firstNames = (await first.json()).result.tools.map((tool: { name: string }) => tool.name).sort();
    const secondNames = (await second.json()).result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(firstNames).toEqual([...FAMILY_HISTORY_CANONICAL_TOOL_NAMES, ...FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name)].sort());
    expect(secondNames).toEqual(firstNames);
  });

  test("narrowing the approved permissions shrinks the very next tools/list, with no reconnect", async () => {
    const t = convexTest(schema, modules);
    const grantId = await approvedConnection(t);
    const token = await accessToken();

    const before = (await (await t.fetch("/mcp", modernRequest("tools/list", token))).json()).result.tools;
    expect(before.length).toBe(FAMILY_HISTORY_CANONICAL_TOOL_NAMES.length + FAMILY_HISTORY_CONTROL_TOOLS.length);

    // The person narrows the connection to reading only.
    await t.run(async (ctx) => {
      await (ctx.db as unknown as { patch(id: unknown, value: unknown): Promise<void> }).patch(
        (ctx.db as unknown as { normalizeId(table: string, id: string): unknown }).normalizeId("mcpGrants", grantId),
        { scopes: ["family_history:context:read"] },
      );
    });

    const after = (await (await t.fetch("/mcp", modernRequest("tools/list", token))).json()).result.tools;
    expect(after.length).toBeLessThan(before.length);
    for (const tool of after) {
      // Every remaining name must be a read tool. A write name surviving a
      // narrowing is the exact bug this test exists to catch.
      expect(tool.name).not.toMatch(/save|update_queue/);
    }
  });

  test("a tools/list after revocation returns the refusal, not a cached catalog", async () => {
    const t = convexTest(schema, modules);
    const grantId = await approvedConnection(t);
    const token = await accessToken();

    expect((await (await t.fetch("/mcp", modernRequest("tools/list", token))).json()).result.tools.length).toBeGreaterThan(0);

    await t.run(async (ctx) => {
      await (ctx.db as unknown as { patch(id: unknown, value: unknown): Promise<void> }).patch(
        (ctx.db as unknown as { normalizeId(table: string, id: string): unknown }).normalizeId("mcpGrants", grantId),
        { status: "revoked" },
      );
    });

    const after = await t.fetch("/mcp", modernRequest("tools/list", token));
    const payload = await after.json();
    const tools = payload.result?.tools ?? [];
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name).sort());
  });
});

test.each(["person", "story"] as const)("%s context exports current media without historical private originals", async kind => {
  const t = convexTest(schema, modules); await approvedConnection(t);
  const { personId, mediaId, storyId } = await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", { vaultOwnerId: SUBJECT, name: { given: "Synthetic", surname: "Replacement" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 });
    const mediaId = await ctx.db.insert("media", { vaultOwnerId: SUBJECT, title: "Current reviewed replacement", type: "document", personIds: [personId], reviewStatus: "reviewed", privacyLevel: "family_review", rightsStatus: "owned", aiUseAllowed: true, url: "https://synthetic-storage.convex.cloud/api/storage/synthetic", createdAt: 1, updatedAt: 1,
      replacedB2Files: [{ replacedAt: 1, original: { bucketClass: "private", bucketName: "synthetic-old-private-bucket", objectKey: "synthetic-old-private-original", versionId: "old-version", sha256: "a".repeat(64), contentType: "image/jpeg", sizeBytes: 1, metadataClean: false, verifiedAt: "2026-10-01T00:00:00Z" }, metadataProposal: { temporal: { uploadTime: "2026-10-01T00:00:00Z" }, location: { latitude: 1.25, longitude: 2.5, source: "embedded_gps", status: "proposed", association: "person_media", precision: "exact_private", disclosurePrecision: "withheld" }, extractedFromOriginalSha256: "a".repeat(64), extractedAt: "2026-10-01T00:00:00Z", reversible: true, decision: "declined", declinedAt: "2026-10-02T00:00:00Z" } }],
    });
    const storyId = await ctx.db.insert("stories", { vaultOwnerId: SUBJECT, personId, title: "Synthetic draft", content: "Synthetic story content.", type: "biography", status: "draft", generatedBy: "human", citationIds: [], createdAt: 1, updatedAt: 1 });
    return { personId, mediaId, storyId };
  });
  const ownerReview = await t.withIdentity({ subject: SUBJECT }).action(api.vaultReads.getStoryReview, { vaultOwnerId: SUBJECT, storyId });
  expect(ownerReview?.media[0].replacedB2Files).toHaveLength(1);
  const response = await t.fetch("/mcp", modernRequest("tools/call", await accessToken(), { name: "family_history_get_context", arguments: { kind, id: String(kind === "person" ? personId : storyId) } }, "family_history_get_context"));
  expect(response.status).toBe(200); const payload = await response.json(); expect(payload.result.isError).not.toBe(true);
  const context = JSON.parse(payload.result.content[0].text); expect(context.media).toEqual([expect.objectContaining({ _id: mediaId, title: "Current reviewed replacement" })]);
  const text = JSON.stringify(payload); expect(text).not.toContain("replacedB2Files"); expect(text).not.toContain("synthetic-old-private"); expect(text).not.toContain("exact_private");
  expect(text).not.toContain("synthetic-storage.convex.cloud");
});

test.each(["expired", "paused", "revoked", "narrowed", "scope removed", "media re-reviewed", "media replaced"] as const)(
  "exact original links pass bytes on the product domain and stop working when %s", async change => {
    const resource = "https://assistwithfamilyhistory.com/mcp";
    vi.stubEnv("MCP_RESOURCE_URL", resource);
    const t = convexTest(schema, modules);
    const grantId = await approvedConnection(t);
    const bytes = Uint8Array.from(await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#145789" },
    }).png().toBuffer());
    const mediaId = await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
      return ctx.db.insert("media", { vaultOwnerId: SUBJECT, storageId, mimeType: "image/png", sizeBytes: bytes.length,
        title: "Original scan", type: "scan", personIds: [], reviewStatus: "reviewed", aiUseAllowed: true, rightsStatus: "owned", createdAt: 1, updatedAt: 1 });
    });
    const token = await accessToken(CLIENT_ID, resource);
    const read = (delivery?: "original") => t.fetch("/mcp", modernRequest("tools/call", token, {
      name: "family_history_get_evidence", arguments: { items: [{ kind: "media", id: mediaId }], delivery },
    }, "family_history_get_evidence"));
    const inline = await (await read()).json();
    expect(inline.result.content[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
    expect(JSON.stringify(inline)).not.toMatch(/mcp-evidence-original|\.convex\.(cloud|site)|backblazeb2/);

    const started = Date.now();
    const reply = await (await read("original")).json();
    expect(reply.result.isError).not.toBe(true);
    expect(JSON.stringify(reply)).not.toMatch(/\.convex\.(cloud|site)|backblazeb2/);
    const { url, expiresAt } = reply.result.structuredContent.original;
    const link = new URL(url);
    expect(link.origin).toBe("https://assistwithfamilyhistory.com");
    expect(expiresAt).toBeGreaterThan(started);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60_000);
    const download = await t.fetch(link.pathname);
    expect(download.status).toBe(200);
    expect(download.headers.get("location")).toBeNull();
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(download.headers.get("content-disposition")).toBe("attachment");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);

    if (change === "expired") {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(expiresAt);
    } else {
      await t.run(async ctx => {
        const grant = ctx.db.normalizeId("mcpGrants", grantId)!;
        if (change === "paused") await ctx.db.patch(grant, { pausedAt: Date.now() });
        if (change === "revoked") await ctx.db.patch(grant, { status: "revoked", revokedAt: Date.now() });
        if (change === "narrowed") await ctx.db.patch(grant, { boundary: { kind: "selected_people", personIds: ["different-person"] } });
        if (change === "scope removed") await ctx.db.patch(grant, { scopes: ["family_history:context:read"] });
        if (change === "media re-reviewed") await ctx.db.patch(mediaId, { aiUseAllowed: false });
        if (change === "media replaced") await ctx.db.patch(mediaId, { storageId: await ctx.storage.store(new Blob(["different bytes"])) });
      });
    }
    try {
      const denied = await t.fetch(link.pathname);
      expect(denied.status).toBe(404);
      expect(await denied.text()).toBe("Evidence is unavailable.");
    } finally {
      if (change === "expired") vi.useRealTimers();
    }
  },
);

test("the exact-original relay uses Backblaze server-side and respects a cleaned-copy-only approval", async () => {
  const resource = "https://assistwithfamilyhistory.com/mcp";
  vi.stubEnv("MCP_RESOURCE_URL", resource);
  vi.stubEnv("MEDIA_STORAGE_ENVIRONMENT", "development");
  for (const kind of ["PRIVATE", "PUBLIC"]) {
    vi.stubEnv(`B2_${kind}_ENDPOINT`, "https://b2.synthetic.example.test");
    vi.stubEnv(`B2_${kind}_REGION`, "us-west-000");
    vi.stubEnv(`B2_${kind}_BUCKET`, `synthetic-${kind.toLowerCase()}`);
    vi.stubEnv(`B2_${kind}_KEY_ID`, "not-a-real-key-id");
    vi.stubEnv(`B2_${kind}_APPLICATION_KEY`, "not-a-real-application-key");
  }
  const existingFetch = fetch;
  const tinyBytes = Uint8Array.from(await sharp({
    create: { width: 6, height: 4, channels: 3, background: "#254689" },
  }).jpeg().toBuffer());
  const { sha256Hex } = await import("../lib/media/evidenceB2");
  const onTiny = vi.fn<() => Promise<void>>();
  const b2Reads: string[] = [];
  let returnWrongMediumBytes = false;
  const relayFetch = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname.endsWith("b2.synthetic.example.test")) {
      expect(options?.redirect).toBe("error");
      const object = url.pathname.split("/").at(-1)!;
      b2Reads.push(object);
      if (object === "medium") {
        if (!returnWrongMediumBytes) return new Response("Missing copy", { status: 404 });
        const wrongBytes = tinyBytes.slice();
        wrongBytes[wrongBytes.length - 1] ^= 1;
        return new Response(wrongBytes);
      }
      if (object === "tiny") {
        await onTiny();
        return new Response(tinyBytes);
      }
      return new Response("exact B2 synthetic bytes");
    }
    return existingFetch(input, options);
  });
  vi.stubGlobal("fetch", relayFetch);
  const t = convexTest(schema, modules);
  const grantId = await approvedConnection(t);
  const manifest = { bucketClass: "private" as const, bucketName: "synthetic-private", objectKey: "private-object",
    versionId: "pinned-version", sha256: "a".repeat(64), sizeBytes: 24, contentType: "application/pdf", metadataClean: false,
    verifiedAt: "2026-11-24T00:00:00Z" };
  const mediaId = await t.run(ctx => ctx.db.insert("media", { vaultOwnerId: SUBJECT, title: "Synthetic original", type: "scan",
    personIds: [], b2Original: manifest, mediaState: "ready", reviewStatus: "reviewed", aiUseAllowed: true, rightsStatus: "owned", createdAt: 1, updatedAt: 1 }));
  const token = await accessToken(CLIENT_ID, resource);
  const read = () => t.fetch("/mcp", modernRequest("tools/call", token, { name: "family_history_get_evidence",
    arguments: { items: [{ kind: "media", id: mediaId }], delivery: "original" },
  }, "family_history_get_evidence"));
  const reply = await (await read()).json();
  expect(JSON.stringify(reply)).not.toContain("b2.synthetic.example.test");
  const link = new URL(reply.result.structuredContent.original.url);
  const response = await t.fetch(link.pathname);
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
  expect(await response.text()).toBe("exact B2 synthetic bytes");

  await t.run(ctx => ctx.db.patch(mediaId, { b2Original: { ...manifest, contentType: "image/tiff" } }));
  b2Reads.length = 0;
  const noCopy = (await (await t.fetch("/mcp", modernRequest("tools/call", token, {
    name: "family_history_get_evidence", arguments: { items: [{ kind: "media", id: mediaId }] },
  }, "family_history_get_evidence"))).json()).result;
  expect(noCopy.structuredContent.skipped).toMatchObject([{ reason: "CLEAN_COPY_UNAVAILABLE" }]);
  expect(noCopy.content.every((block: { type: string }) => block.type === "text")).toBe(true);
  expect(b2Reads).toEqual([]);
  const explicitOriginal = (await (await read()).json()).result.structuredContent.original.url;
  expect(new URL(explicitOriginal).hostname).toBe(new URL(resource).hostname);

  await t.run(ctx => ctx.db.patch(mediaId, { b2Renditions: { tiny: manifest, medium: manifest, large: manifest } }));
  expect((await t.fetch(link.pathname)).status).toBe(404);
  const refused = await (await read()).json();
  expect(refused.result.structuredContent.skipped).toMatchObject([{ reason: "ORIGINAL_UNAVAILABLE" }]);

  const tiny = { ...manifest, objectKey: "tiny", sizeBytes: tinyBytes.byteLength, sha256: sha256Hex(tinyBytes),
    contentType: "image/jpeg", metadataClean: true };
  const medium = { ...tiny, objectKey: "medium", sizeBytes: AI_COPY_MAX_BYTES + 1 };
  const inline = async () => (await t.fetch("/mcp", modernRequest("tools/call", token, {
    name: "family_history_get_evidence", arguments: { items: [{ kind: "media", id: mediaId }] },
  }, "family_history_get_evidence"))).json();
  await t.run(ctx => ctx.db.patch(mediaId, { b2Renditions: { tiny, medium, large: medium } }));
  b2Reads.length = 0;
  const fallback = (await inline()).result;
  expect(b2Reads).toEqual(["tiny"]);
  expect(fallback.structuredContent.delivered).toMatchObject([{ id: mediaId, label: "Smaller copy." }]);
  expect(fallback.content[0]).toMatchObject({ type: "image", data: Buffer.from(tinyBytes).toString("base64") });
  expect(JSON.stringify(fallback)).not.toMatch(/synthetic-private|pinned-version|private-object/);

  await t.run(ctx => ctx.db.patch(mediaId, { b2Renditions: { tiny, medium: { ...medium, sizeBytes: tiny.sizeBytes }, large: medium } }));
  b2Reads.length = 0;
  expect((await inline()).result.structuredContent.delivered).toMatchObject([{ label: "Smaller copy." }]);
  expect(b2Reads).toEqual(["medium", "tiny"]);
  returnWrongMediumBytes = true;
  b2Reads.length = 0;
  const wrongVersion = (await inline()).result;
  expect(b2Reads).toEqual(["medium", "tiny"]);
  expect(wrongVersion.structuredContent.delivered).toMatchObject([{ label: "Smaller copy." }]);
  expect(wrongVersion.content[0]).toMatchObject({ type: "image", data: Buffer.from(tinyBytes).toString("base64") });
  onTiny.mockImplementation(async () => t.run(ctx => ctx.db.patch(ctx.db.normalizeId("mcpGrants", grantId)!, { pausedAt: Date.now() })));
  const interrupted = (await inline()).result;
  expect(interrupted.isError).toBe(true);
  expect(interrupted.content.every((block: { type: string }) => block.type === "text")).toBe(true);
  expect(interrupted.structuredContent.nextCursor).toBeUndefined();
});

test("website photos are cleaned on demand and paged with inline documents and files", async () => {
  const t = convexTest(schema, modules);
  const grantId = await approvedConnection(t);
  const original = Uint8Array.from(await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#254689" },
  }).withExif({ IFD0: { Artist: "Synthetic metadata marker" } }).jpeg().toBuffer());
  expect(hasEmbeddedImageMetadata(original, "image/jpeg")).toBe(true);
  const pdfBytes = "%PDF-1.7\nSynthetic evidence fixture.\n";
  const { items, mediaId, personId, originalId, unapprovedId, pdfId } = await t.run(async ctx => {
    const fields = { vaultOwnerId: SUBJECT, createdAt: 1, updatedAt: 1 };
    const personId = await ctx.db.insert("persons", {
      ...fields, name: { given: "Synthetic", surname: "Ancestor" }, sex: "unknown", living: false, researchStatus: "basic",
    });
    const livingId = await ctx.db.insert("persons", {
      ...fields, name: { given: "Synthetic", surname: "Living" }, sex: "unknown", living: true, researchStatus: "basic",
    });
    const docs = await Promise.all([personId, personId, personId, livingId].map((ownerPerson, index) =>
      ctx.db.insert("documents", {
        ...fields, personId: ownerPerson, type: "PS", title: `Synthetic document ${index}`,
        contentMarkdown: "",
        contentText: index === 3 ? "Synthetic living person's private document." : "a".repeat(900_000),
      })));
    const originalId = await ctx.storage.store(new Blob([original], { type: "image/jpeg" }));
    const photo = { ...fields, type: "photo" as const, title: "Synthetic photo", personIds: [personId],
      mimeType: "image/jpeg", rightsStatus: "owned" as const };
    const mediaId = await ctx.db.insert("media", {
      ...photo, storageId: originalId, reviewStatus: "reviewed", aiUseAllowed: true,
    });
    const unapprovedId = await ctx.db.insert("media", {
      ...photo, storageId: await ctx.storage.store(new Blob([original], { type: "image/jpeg" })),
      reviewStatus: "unreviewed", aiUseAllowed: false,
    });
    const pdfId = await ctx.db.insert("media", {
      ...photo, type: "document", title: "Synthetic PDF", mimeType: "application/pdf",
      storageId: await ctx.storage.store(new Blob([pdfBytes], { type: "application/pdf" })),
      reviewStatus: "reviewed", aiUseAllowed: true,
    });
    return { personId, mediaId, originalId, unapprovedId, pdfId, items: [
      ...docs.map(id => ({ kind: "document", id })),
      { kind: "media", id: mediaId }, { kind: "media", id: unapprovedId }, { kind: "media", id: pdfId },
    ] };
  });
  const token = await accessToken();
  const read = async (selection = items, cursor?: string) => (await t.fetch("/mcp", modernRequest("tools/call", token, {
    name: "family_history_get_evidence", arguments: { items: selection, ...(cursor === undefined ? {} : { cursor }) },
  }, "family_history_get_evidence"))).json();
  const storedObjects = () => t.run(ctx => ctx.db.system.query("_storage").collect());
  const before = await storedObjects();
  expect((await read(items, "")).result.structuredContent.error.code).toBe("INVALID_MEDIA_CURSOR");

  const first = (await read()).result;
  const cursor = first.structuredContent.nextCursor;
  expect(cursor).toMatch(/^e2\.2\./);
  expect(first.structuredContent.delivered.map((item: { id: string }) => item.id)).toEqual(items.slice(0, 2).map(item => item.id));
  expect(first.structuredContent.skipped).toMatchObject([
    { id: items[3].id, reason: "AI_USE_NOT_ALLOWED" }, { id: unapprovedId, reason: "NOT_REVIEWED" },
  ]);
  const second = (await read(items, cursor)).result;
  expect(second.structuredContent.nextCursor).toBeUndefined();
  expect(second.structuredContent.delivered).toMatchObject([
    { id: items[2].id, mimeType: "text/markdown" }, { id: mediaId, mimeType: "image/jpeg", label: "Cleaned copy." },
    { id: pdfId, mimeType: "application/pdf" },
  ]);
  const image = second.content.find((block: { type: string }) => block.type === "image");
  const cleaned = Buffer.from(image.data, "base64");
  expect(hasEmbeddedImageMetadata(cleaned, "image/jpeg")).toBe(false);
  expect((await sharp(cleaned).metadata()).exif).toBeUndefined();
  expect(cleaned).not.toEqual(Buffer.from(original));
  expect(JSON.stringify(second)).not.toContain(originalId);
  expect(JSON.stringify(second)).not.toContain("private document");
  expect(second.content).toContainEqual({
    type: "resource", resource: { uri: `familyhistory://media/${pdfId}`, mimeType: "application/pdf",
      blob: Buffer.from(pdfBytes).toString("base64") },
  });
  expect((await read([{ kind: "media", id: mediaId }])).result.content[0]).toEqual(image);
  expect(await storedObjects()).toEqual(before);
  expect((await read([...items].reverse(), cursor)).result.structuredContent.error.code).toBe("INVALID_MEDIA_CURSOR");
  const altered = cursor.slice(0, -1) + (cursor.endsWith("0") ? "1" : "0");
  expect((await read(items, altered)).result.structuredContent.error.code).toBe("INVALID_MEDIA_CURSOR");

  await t.run(async ctx => ctx.db.patch(ctx.db.normalizeId("mcpGrants", grantId)!, {
    boundary: { kind: "selected_people", personIds: [String(personId)] },
  }));
  expect((await read(items, cursor)).result.structuredContent.error.code).toBe("INVALID_MEDIA_CURSOR");
  await t.run(ctx => ctx.db.patch(mediaId, { aiUseAllowed: false }));
  const denied = (await read([{ kind: "media", id: mediaId }])).result;
  expect(denied.structuredContent).toMatchObject({ delivered: [], skipped: [{ reason: "AI_USE_NOT_ALLOWED" }] });
  expect(denied.content.every((block: { type: string }) => block.type === "text")).toBe(true);
});

test("website WebM and UTF-16 evidence keeps its exact bytes after type checks", async () => {
  const t = convexTest(schema, modules);
  await approvedConnection(t);
  const fixture = readFileSync("lib/media/fixtures/audio/video.webm");
  const video = Uint8Array.from(fixture);
  const segmentSizeAt = fixture.indexOf(Buffer.from("18538067", "hex")) + 4;
  const clusterSizeAt = fixture.indexOf(Buffer.from("1f43b675", "hex")) + 4;
  const streamingVideo = video.slice();
  // Keep the fixture's existing size-field widths, but mark both masters unknown.
  streamingVideo.set([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], segmentSizeAt);
  streamingVideo.set([0x7f, 0xff], clusterSizeAt);
  const files = [
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: video, allowed: true },
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: streamingVideo, allowed: true },
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]), allowed: false },
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: video.slice(0, -1), allowed: false },
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: streamingVideo.slice(0, clusterSizeAt + 12), allowed: false },
    { type: "document", mimeType: "text/plain", bytes: new Uint8Array([0xff, 0xfe, 0x41, 0, 0x0a, 0]), allowed: true },
    { type: "document", mimeType: "text/plain", bytes: new Uint8Array([0xfe, 0xff, 0, 0x41, 0, 0x0a]), allowed: true },
    { type: "document", mimeType: "text/plain", bytes: new Uint8Array([0xff, 0xfe, 0, 0]), allowed: false },
    { type: "document", mimeType: "text/plain", bytes: new Uint8Array([0xfe, 0xff, 0x41]), allowed: false },
    { type: "video", mimeType: "video/webm;codecs=vp9", bytes: new TextEncoder().encode("not WebM"), allowed: false },
  ] as const;
  const items = await t.run(async ctx => Promise.all(files.map(async file => ({
    kind: "media",
    id: await ctx.db.insert("media", {
      vaultOwnerId: SUBJECT, type: file.type, title: "Synthetic website evidence", personIds: [],
      storageId: await ctx.storage.store(new Blob([file.bytes], { type: file.mimeType })),
      mimeType: file.mimeType, reviewStatus: "reviewed", aiUseAllowed: true, rightsStatus: "owned", createdAt: 1, updatedAt: 1,
    }),
  }))));
  const token = await accessToken();
  const read = async () => (await t.fetch("/mcp", modernRequest("tools/call", token, {
    name: "family_history_get_evidence", arguments: { items },
  }, "family_history_get_evidence"))).json();
  const { result } = await read();

  const resources = result.content.filter((block: { type: string }) => block.type === "resource");
  expect(resources).toEqual(files.flatMap((file, index) => file.allowed ? [{
    type: "resource",
    resource: {
      uri: `familyhistory://media/${items[index].id}`,
      mimeType: file.mimeType,
      blob: Buffer.from(file.bytes).toString("base64"),
    },
  }] : []));
  expect(result.structuredContent.skipped).toMatchObject(files.flatMap((file, index) =>
    file.allowed ? [] : [{ id: items[index].id, reason: "BYTES_NOT_AVAILABLE" }],
  ));

  await t.run(async ctx => {
    for (const [index, item] of items.entries()) {
      if (files[index].allowed) await ctx.db.patch(item.id, { aiUseAllowed: false });
    }
  });
  const denied = (await read()).result;
  expect(denied.structuredContent.delivered).toEqual([]);
  expect(denied.structuredContent.skipped).toEqual(expect.arrayContaining(files.flatMap((file, index) =>
    file.allowed ? [expect.objectContaining({ id: items[index].id, reason: "AI_USE_NOT_ALLOWED" })] : [],
  )));
  expect(denied.content.every((block: { type: string }) => block.type === "text")).toBe(true);
});

test("an invalid website image returns no bytes, and a reviewed replacement can retry", async () => {
  const t = convexTest(schema, modules);
  await approvedConnection(t);
  const mediaId = await t.run(async ctx => ctx.db.insert("media", {
    vaultOwnerId: SUBJECT, type: "photo", title: "Synthetic invalid photo", personIds: [],
    storageId: await ctx.storage.store(new Blob(["not an image"], { type: "image/jpeg" })),
    mimeType: "image/jpeg", reviewStatus: "reviewed", aiUseAllowed: true, rightsStatus: "owned", createdAt: 1, updatedAt: 1,
  }));
  const token = await accessToken();
  const read = async () => (await t.fetch("/mcp", modernRequest("tools/call", token, {
    name: "family_history_get_evidence", arguments: { items: [{ kind: "media", id: mediaId }] },
  }, "family_history_get_evidence"))).json();
  for (let attempt = 0; attempt < 2; attempt++) {
    const failed = (await read()).result;
    expect(failed.structuredContent).toMatchObject({ delivered: [], skipped: [{ reason: "CLEAN_COPY_UNAVAILABLE" }] });
    expect(failed.content).toHaveLength(1);
  }
  const corrected = Uint8Array.from(await sharp({
    create: { width: 4, height: 7, channels: 3, background: "#254689" },
  }).jpeg().toBuffer());
  await t.run(async ctx => ctx.db.patch(mediaId, {
    storageId: await ctx.storage.store(new Blob([corrected], { type: "image/jpeg" })),
  }));
  expect((await read()).result.content[0]).toMatchObject({ type: "image", mimeType: "image/jpeg" });
});

test("whole-person context keeps working drafts and withholds private review detail", async () => {
  const t = convexTest(schema, modules);
  await approvedConnection(t);
  const { personId, storyId } = await t.run(async ctx => {
    const fields = { vaultOwnerId: SUBJECT, createdAt: 1, updatedAt: 1 };
    const personId = await ctx.db.insert("persons", {
      ...fields, name: { given: "Synthetic", surname: "Ancestor" }, sex: "unknown", living: false, researchStatus: "basic",
    });
    const storyId = await ctx.db.insert("stories", {
      ...fields, personId, title: "Synthetic draft", content: "Approved working draft", type: "biography",
      status: "draft", generatedBy: "human", citationIds: [], unpublishReason: "private unpublish reason",
      assignedReviewer: "private assigned reviewer", secondReviewer: "private second reviewer", promptUsed: "private prompt",
    });
    await ctx.db.insert("researchChecks", {
      ...fields, personId, checkKey: "birth_record", status: "needs_review", applicability: "required",
      completionSource: "user", confidence: 0.5, notes: "private check memo", summary: "private check summary",
    });
    return { personId, storyId };
  });
  const owner = t.withIdentity({ subject: SUBJECT });
  const workspace = await owner.action(api.vaultReads.getPersonWorkspace, { vaultOwnerId: SUBJECT, personIdentifier: personId });
  expect(workspace?.stories[0]).toMatchObject({ assignedReviewer: "private assigned reviewer" });
  expect(workspace?.operations.nextActions).toContain("private check summary");

  const token = await accessToken();
  const read = async () => {
    const response = await t.fetch("/mcp", modernRequest("tools/call", token, {
      name: "family_history_get_context", arguments: { kind: "person", id: personId },
    }, "family_history_get_context"));
    const { result } = await response.json();
    expect(result.isError).not.toBe(true);
    return JSON.parse(result.content[0].text);
  };
  const context = await read();
  expect(context.stories).toEqual([expect.objectContaining({ _id: storyId, content: "Approved working draft" })]);
  expect(context.researchChecks).toContainEqual(expect.objectContaining({ checkKey: "birth_record", status: "needs_review" }));
  expect(JSON.stringify(context)).not.toMatch(/private (unpublish reason|assigned reviewer|second reviewer|prompt|check memo|check summary)/);
  await t.run(ctx => ctx.db.patch(personId, { living: true }));
  expect((await read()).stories).toEqual([]);
});

test("story context includes approved material and withholds the human review bundle", async () => {
  const t = convexTest(schema, modules);
  await approvedConnection(t);
  const { personId, storyId } = await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", {
      vaultOwnerId: SUBJECT, name: { given: "Synthetic", surname: "Ancestor" },
      sex: "unknown", living: false, researchStatus: "basic", notes: "private subject memo", createdAt: 1, updatedAt: 1,
    });
    const storyId = await ctx.db.insert("stories", {
      vaultOwnerId: SUBJECT, personId, title: "Synthetic draft", content: "Approved working draft",
      type: "biography", status: "draft", generatedBy: "human", citationIds: [], createdAt: 1, updatedAt: 1,
    });
    const livingRelative = await ctx.db.insert("persons", {
      vaultOwnerId: SUBJECT, name: { given: "InventedLivingRelative", surname: "Synthetic" },
      sex: "unknown", living: true, researchStatus: "basic", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("relationships", {
      vaultOwnerId: SUBJECT, type: "ParentChild", person1: personId, person2: livingRelative, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("storyReviewEvents", {
      vaultOwnerId: SUBJECT, storyId, eventType: "draft_edit", actorRole: "reviewer",
      humanReviewNote: "private reviewer memo", createdAt: 1, updatedAt: 1,
    });
    for (const approved of [false, true]) {
      await ctx.db.insert("historicalContext", {
        vaultOwnerId: SUBJECT, title: approved ? "Reviewed context" : "private historical note",
        timePeriod: { startYear: 1700, endYear: 2000 }, topic: "daily_life",
        content: "Invented background", sources: [], privacyLevel: approved ? "family_review" : "private",
        reviewStatus: approved ? "reviewed" : "unreviewed", aiUseAllowed: approved, createdAt: 1, updatedAt: 1,
      });
    }
    return { personId, storyId };
  });
  const ownerReview = await t.withIdentity({ subject: SUBJECT }).action(api.vaultReads.getStoryReview, {
    vaultOwnerId: SUBJECT, storyId,
  });
  expect(ownerReview?.reviewHistory[0].humanReviewNote).toBe("private reviewer memo");
  expect(ownerReview?.relationships[0]).toMatchObject({ relatedName: "InventedLivingRelative Synthetic" });
  const token = await accessToken();
  const read = async () => {
    const response = await t.fetch("/mcp", modernRequest("tools/call", token, {
      name: "family_history_get_context", arguments: { kind: "story", id: String(storyId) },
    }, "family_history_get_context"));
    return JSON.parse((await response.json()).result.content[0].text);
  };
  const context = await read();
  expect(context).toMatchObject({
    story: { content: "Approved working draft" },
    historicalContext: [{ title: "Reviewed context" }],
  });
  expect(JSON.stringify(context)).not.toMatch(/private subject memo|private reviewer memo|private historical note|InventedLivingRelative/);
  await t.run(ctx => ctx.db.patch(personId, { living: true }));
  expect(await read()).toBeNull();
});


describe("AWL-0015 controls through the authenticated wire", () => {
  test("narrow, pause, describe, revoke and re-register without regaining authority", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken();
    const call = async (name: string, args: Record<string, unknown>, bearer = token) => {
      const response = await t.fetch("/mcp", modernRequest("tools/call", bearer, { name, arguments: args }, name));
      return (await response.json()).result;
    };
    const first = await call("family_history_connection", {});
    expect(first.structuredContent).toMatchObject({ state: "active", revision: 0, endsAt: null });
    expect((await call("family_history_limit_connection", { action: "limit", revision: 0, opId: "wire-read-only", removeScopes: FAMILY_HISTORY_SCOPES.filter(s => !s.endsWith(":read")) })).isError).not.toBe(true);
    const refused = await call("family_history_save_person", { operationId: "refused-write" });
    expect(refused.structuredContent.error).toMatchObject({ code: "SCOPE_NOT_GRANTED", message: expect.stringContaining("family_history:research:write"), recovery: expect.stringContaining("https://assistwithfamilyhistory.com/settings/ai") });
    await call("family_history_limit_connection", { action: "pause", revision: 1, opId: "wire-pause" });
    expect((await call("family_history_connection", {})).structuredContent.state).toBe("paused");
    const stale = await call("family_history_limit_connection", { action: "revoke", revision: 0, opId: "wire-stale" });
    expect(stale.structuredContent.error.code).toBe("STALE_VERSION");
    await call("family_history_limit_connection", { action: "revoke", revision: 2, opId: "wire-revoke" });
    const newer = await accessToken("re-registered-synthetic-client");
    expect((await call("family_history_connection", {}, newer)).structuredContent.state).toBe("revoked");
    const catalog = await t.fetch("/mcp", modernRequest("tools/list", newer));
    expect((await catalog.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(tool => tool.name));
    expect((await call("family_history_connection", {})).structuredContent.state).toBe("revoked");
    const selfRestore = await call("family_history_limit_connection", { action: "restore", revision: 3, opId: "wire-self-restore" });
    expect(selfRestore?.isError).toBe(true);
  });
});

describe("Decision 4: reported identity is initialize-only", () => {
  test("no name, a Claude User-Agent and per-request clientInfo cannot evade a revoked predecessor", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: SUBJECT, issuer: ISSUER, clientId: "revoked-claude", observedClientName: "Claude", status: "revoked", expiresAt: null });
    const token = await accessToken("anonymous-registration");
    const request = modernRequest("tools/call", token, { name: "family_history_save_person", arguments: { operationId: "must-not-save" } }, "family_history_save_person");
    request.headers = { ...request.headers, "user-agent": "Claude-User/1.0" };
    const response = await t.fetch("/mcp", request);
    const body = await response.json();
    expect(body.result.structuredContent.error.code).toBe("GRANT_REVOKED");
    const grants = await t.run(ctx => ctx.db.query("mcpGrants").collect());
    expect(grants).toHaveLength(2);
    expect(grants.find(g => g.observedClientName === "Claude")).toBeDefined();
  });

  test("tool arguments and per-request names never merge otherwise unrestricted installations", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: SUBJECT, issuer: ISSUER, clientId: "named-full-client", observedClientName: "family-history-synthetic-client", expiresAt: null });
    const token = await accessToken("new-full-client");
    const request = modernRequest("tools/call", token, { name: "family_history_connection", arguments: {} }, "family_history_connection");
    request.headers = { ...request.headers, "user-agent": "family-history-synthetic-client" };
    const response = await t.fetch("/mcp", request);
    expect((await response.json()).result.structuredContent.powers).toEqual([...FAMILY_HISTORY_SCOPES]);
    const separate = await t.run(ctx => ctx.db.query("mcpClientAliases").collect());
    expect(new Set(separate.map(row => row.grantId)).size).toBe(2);
    const unnamed = (await t.run(ctx => ctx.db.query("mcpGrants").collect())).find(row => row.clientId === "new-full-client")!;
    expect(unnamed.observedClientName).toBeUndefined();
    // A later actual initialize may contribute the name, even with an existing row.
    const initialize = modernRequest("initialize", token, { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "family-history-synthetic-client", version: "1.0" } });
    await t.fetch("/mcp", initialize);
    const aliases = await t.run(ctx => ctx.db.query("mcpClientAliases").collect());
    expect(aliases.map(row => row.clientId).sort()).toEqual(["named-full-client", "new-full-client"]);
    const named = await t.withIdentity({ subject: SUBJECT }).action(api.mcpGrants.listConnections, { vaultOwnerId: SUBJECT });
    expect(named.connections).toHaveLength(2);
    expect(named.connections.every(row => !row.linkedByName)).toBe(true);
  });
});

// AWL-0016: aliases and canonical names enter the same real transport handlers.
test("Queue suggestion authority holds through canonical MCP and compatibility aliases",async()=>{
 const t=convexTest(schema,modules);await approvedConnection(t);const token=await accessToken();
 async function call(name:string,args:Record<string,unknown>){const response=await t.fetch("/mcp",modernRequest("tools/call",token,{name,arguments:args},name));const body=await response.json();return body.result;}
 for(const name of ["family_history_add_queue","add_queue"]){
  const missing=await call(name,{operationId:`missing-${name}`,directive:"Research a gap"});expect(missing.isError).toBe(true);expect(JSON.stringify(missing)).toContain("addedBy");
 }
 const created=await call("family_history_add_queue",{operationId:"suggestion-add",directive:"Research a gap",addedBy:"ai_suggestion",reason:"A record is missing"});expect(created.isError).not.toBe(true);
 const data=created.structuredContent??JSON.parse(created.content[0].text),item=data.item;
 for(const name of ["family_history_update_queue","update_queue"]){
  for(const [action,extra] of [["claim",{leaseMs:60000,nextStep:"Start"}],["checkpoint",{leaseMs:60000,nextStep:"Work"}],["complete",{resultSummary:"Done"}],["request_user_action",{requiredAction:"Which?"}],["fail",{failureCode:"STOP",failureSummary:"No",retryable:false}]] as const){
   const result=await call(name,{action,operationId:`${name}-${action}`,queueItemId:item._id,expectedVersion:1,...extra});expect(result.isError).toBe(true);
  }
  for(const action of ["accept","dismiss","edit_accept"]){const result=await call(name,{action,operationId:`${name}-${action}`,queueItemId:item._id,expectedVersion:1,directive:"Edit"});expect(result.isError).toBe(true);}
 }
 const list=await call("get_queue",{action:"list"});expect((list.structuredContent??JSON.parse(list.content[0].text)).page).toHaveLength(0);
 const own=await call("family_history_get_queue",{action:"list",suggestions:true});expect((own.structuredContent??JSON.parse(own.content[0].text)).page[0]._id).toBe(item._id);
});

test("AI cannot clear input or hide it through canonical, alias or generic archive calls",async()=>{
 const t=convexTest(schema,modules);await approvedConnection(t);const token=await accessToken();
 async function call(name:string,args:Record<string,unknown>){const r=await t.fetch("/mcp",modernRequest("tools/call",token,{name,arguments:args},name));return (await r.json()).result;}
 const added=await call("family_history_add_queue",{operationId:"flag-archive-create",directive:"Research what the person asked",addedBy:"ai_on_request"});const item=(added.structuredContent??JSON.parse(added.content[0].text)).item;
 const asked=await call("family_history_update_queue",{action:"request_user_action",operationId:"flag-archive-question",queueItemId:item._id,expectedVersion:1,requiredAction:"Which source?"});expect(asked.isError).not.toBe(true);
 for(const name of ["family_history_update_queue","update_queue"]){
  const archive=await call(name,{action:"archive",operationId:`flag-archive-${name}`,queueItemId:item._id,expectedVersion:2});expect(archive.isError).toBe(true);expect(JSON.stringify(archive)).toContain("Only the person can clear Needs your input");
  const clear=await call(name,{action:"clear_input",operationId:`flag-clear-${name}`,queueItemId:item._id,expectedVersion:2});expect(clear.isError).toBe(true);
  const revise=await call(name,{action:"checkpoint",operationId:`flag-revise-${name}`,queueItemId:item._id,expectedVersion:2,leaseMs:60000,nextStep:"Revise",needsInput:false,archivedAt:123});expect(revise.isError).toBe(true);
 }
 for(const name of ["family_history_archive_record","archive_record"]){const generic=await call(name,{operationId:`flag-generic-${name}`,kind:"queue",id:item._id,action:"archive",expectedUpdatedAt:123});expect(generic.isError).toBe(true);}
 const saved=await t.run(ctx=>ctx.db.get(item._id));expect(saved?.needsInput?.question).toBe("Which source?");expect(saved?.archivedAt).toBeUndefined();
});

// Explicit website JWT issuer for synthetic person identities; never an auth bypass.
beforeEach(()=>vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://convex.test"));

test("storage refusal is structured and the same AI token still reads the brief",async()=>{
 const t=convexTest(schema,modules);
 await approvedConnection(t);
 vi.stubEnv("MEDIA_STORAGE_ENVIRONMENT","development");
 for(const kind of ["PRIVATE","PUBLIC"]){
  for(const [key,value] of Object.entries({ENDPOINT:"https://storage.example.test",REGION:"synthetic",BUCKET:`synthetic-${kind.toLowerCase()}`,KEY_ID:"synthetic-test-key",APPLICATION_KEY:"synthetic-test-value"}))vi.stubEnv(`B2_${kind}_${key}`,value);
 }
 const personId=await t.run(async ctx=>{
  await ctx.db.insert("usageLimitSettings",{key:"site",planStoredBytes:{free:0},enforcement:"on",backfillCompletedAt:1,updatedAt:0,updatedBy:"synthetic-admin"});
  return ctx.db.insert("persons",{vaultOwnerId:SUBJECT,name:{given:"Invented",surname:"Ancestor"},sex:"unknown",living:false,researchStatus:"basic",createdAt:0,updatedAt:0});
 });
 const token=await accessToken();
 const refused=await t.fetch("/mcp",modernRequest("tools/call",token,{name:"family_history_begin_evidence_upload",arguments:{operationId:"synthetic-cap-refusal",personId:String(personId),title:"Invented evidence",fileName:"invented.jpg",contentType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)}},"family_history_begin_evidence_upload"));
 const body=await refused.json();
 expect(body.result.isError).toBe(true);
 expect(body.result.structuredContent).toMatchObject({code:"USAGE_LIMIT_REACHED",remaining:0,error:{code:"USAGE_LIMIT_REACHED",recovery:expect.any(String)}});
 expect(body.result.content[0].text).toMatch(/^Upload refused/);
 const next=await t.fetch("/mcp",modernRequest("tools/call",token,{name:"family_history_get_brief",arguments:{}},"family_history_get_brief"));
 const nextBody=await next.json();expect(nextBody.result.isError).not.toBe(true);
 expect(nextBody.result.structuredContent.storage.capBytes).toBe(0);
 vi.stubEnv("CONVEX_SITE_URL","https://relay.example.test");
 await t.run(async ctx=>{const settings=await ctx.db.query("usageLimitSettings").first();await ctx.db.patch(settings!._id,{planStoredBytes:{free:10}});});
 const argumentsAgain={operationId:"synthetic-cap-refusal",personId:String(personId),title:"Invented evidence",fileName:"invented.jpg",contentType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)};
 const retry=await (await t.fetch("/mcp",modernRequest("tools/call",token,{name:"family_history_begin_evidence_upload",arguments:argumentsAgain},"family_history_begin_evidence_upload"))).json();
 expect(retry.result.isError).not.toBe(true);
 await t.run(async ctx=>{const settings=await ctx.db.query("usageLimitSettings").first();await ctx.db.patch(settings!._id,{maxFileBytes:{image:1}});});
 const tooLarge=await (await t.fetch("/mcp",modernRequest("tools/call",token,{name:"family_history_begin_evidence_upload",arguments:{...argumentsAgain,operationId:"synthetic-file-refusal",sizeBytes:2}},"family_history_begin_evidence_upload"))).json();
 expect(tooLarge.result).toMatchObject({isError:true,structuredContent:{code:"FILE_TOO_LARGE",error:{code:"FILE_TOO_LARGE",recovery:expect.any(String)}}});
 expect(tooLarge.result.content[0].text).toMatch(/^This file/);

});

test("uncertain upload recovery reaches the AI as structured expiry and room advice", async () => {
 const t=convexTest(schema,modules);await approvedConnection(t);
 vi.stubEnv("MEDIA_STORAGE_ENVIRONMENT","development");vi.stubEnv("CONVEX_SITE_URL","https://relay.example.test");
 for(const kind of ["PRIVATE","PUBLIC"])for(const [key,value] of Object.entries({ENDPOINT:"https://storage.example.test",REGION:"synthetic",BUCKET:`synthetic-${kind.toLowerCase()}`,KEY_ID:"synthetic-test-key",APPLICATION_KEY:"synthetic-test-value"}))vi.stubEnv(`B2_${kind}_${key}`,value);
 const personId=await t.run(async ctx=>{
  await ctx.db.insert("usageLimitSettings",{key:"site",planStoredBytes:{free:1},enforcement:"on",backfillCompletedAt:1,updatedAt:0,updatedBy:"synthetic-admin"});
  return ctx.db.insert("persons",{vaultOwnerId:SUBJECT,name:{given:"Synthetic",surname:"Fixture"},sex:"unknown",living:false,researchStatus:"basic",createdAt:0,updatedAt:0});
 });
 const token=await accessToken(),name="family_history_begin_evidence_upload",args={operationId:"synthetic-recovery",personId:String(personId),title:"Synthetic evidence",fileName:"fixture",contentType:"text/plain",sizeBytes:1,sha256:"a".repeat(64)};
 const call=()=>t.fetch("/mcp",modernRequest("tools/call",token,{name,arguments:args},name));
 await call();const expiresAt=await t.run(async ctx=>{const session=await ctx.db.query("mediaUploadSessions").first();await ctx.db.patch(session!._id,{putState:"failed",putUncertain:true});return session!.expiresAt;});
 const {EvidenceB2Store}=await import("../lib/media/evidenceB2");const head=vi.spyOn(EvidenceB2Store.prototype,"head").mockRejectedValue(new Error("Synthetic unavailable"));
 try {
  const result=(await (await call()).json()).result;
  expect(result).toMatchObject({isError:true,structuredContent:{code:"UPLOAD_ATTEMPT_CLOSED",remaining:0,resetsAt:new Date(expiresAt).toISOString(),error:{code:"UPLOAD_ATTEMPT_CLOSED",recovery:expect.stringContaining("new upload now")}}});
  expect(result.content[0].text).toContain("same operation ID");expect(result.content[0].text).toContain("keeps its reserved room");
 }finally{head.mockRestore();}
});
