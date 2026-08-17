/// <reference types="vite/client" />

/**
 * The acceptance ladder, proved locally.
 *
 * `docs/planning/family-history-bring-your-ai-alignment.md` §5 lists eleven
 * things that must hold before the connection can be called Current.
 * `scripts/mcp-lifecycle.ts` runs that ladder against a live endpoint with a
 * person at the keyboard. This suite proves every rung of it that does NOT need
 * a live provider, a person, or real bytes — using the same official MCP client,
 * the same protocol pin, and the same assertions the harness makes, so a
 * regression is caught here rather than discovered during a live run.
 *
 * Proved here (server behaviour, no live endpoint):
 *   1 anonymous challenge · 2 branded protected-resource metadata ·
 *   3 discovery filtered by grant and empty without one · 4 out-of-scope refusal
 *   without leakage · 7 batch save, correction, stale-write refusal ·
 *   8 unknown-tool / ungranted / cross-owner refusals byte-identical ·
 *   9 operationId replay · 10 revoke denies the very next call and discovery.
 *
 * NOT proved here, and honestly still awaiting a live run:
 *   5 a real Queue assignment made by a person · 6 real evidence bytes ·
 *   10's reconnect half (a person re-approving in the product) · 11 cleanup
 *   against the acceptance deployment (`convex/mcpAcceptanceFixture.test.ts`
 *   proves the cleanup logic, not a live residue-free re-query).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import schema from "./schema";
import { FAMILY_HISTORY_CANONICAL_TOOL_NAMES, findTool } from "../lib/mcp/catalog";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const RESOURCE = "https://family-history.example.test/mcp";
const ISSUER = "https://identity.example.test";
const OWNER = "user_ladder_owner_AAAAAAAAAAA";
const OTHER_OWNER = "user_ladder_other_BBBBBBBBBBB";
const CLIENT_ID = "ladder-client";
const PROTOCOL_VERSION = "2026-07-28";
const RUN_KEY = "codex-test:awf-joined:ladder-local";

let privateKey: KeyLike;
let jwk: JsonWebKey;

async function accessToken(subject: string) {
  return new SignJWT({ scope: "openid offline_access", client_id: CLIENT_ID })
    .setProtectedHeader({ alg: "RS256", kid: "ladder-key", typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setAudience(RESOURCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

type ToolCallResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
};

/** The same official client and protocol pin the live harness connects with. */
async function connect(t: ReturnType<typeof convexTest>, token: string) {
  const client = new Client(
    { name: `[SYNTHETIC QA - DELETE ME] ${RUN_KEY}`, version: "1.0.0" },
    { versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    authProvider: { token: async () => token },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body =
        request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
      // `Mcp-Name` is the protocol's tool-name header and is left exactly as the
      // client set it. The client's own name reaches the server through
      // `clientInfo` in the body, which is where the grant label comes from.
      return t.fetch(new URL(request.url).pathname, {
        method: request.method,
        headers: request.headers,
        body,
      });
    },
  });
  await client.connect(transport);
  return client;
}

/** The harness's own refusal readers, so both agree on what a refusal looks like. */
function refusalCode(result: ToolCallResult): string | null {
  if (!result.isError) return null;
  const structured = result.structuredContent?.error as { code?: string } | undefined;
  if (structured?.code) return structured.code;
  const text = result.content?.find((block) => block.type === "text")?.text ?? "";
  try {
    return (JSON.parse(text) as { code?: string }).code ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function refusalPayload(result: ToolCallResult): string {
  return JSON.stringify(result.structuredContent ?? result.content ?? null);
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  return (await client.callTool({ name, arguments: args })) as ToolCallResult;
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "ladder-key", use: "sig", alg: "RS256" };
});

beforeEach(() => {
  vi.stubEnv("MCP_RESOURCE_URL", RESOURCE);
  vi.stubEnv("MCP_AUTH_SERVER_URL", ISSUER);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== `${ISSUER}/.well-known/jwks.json`) throw new Error(`Unexpected external fetch: ${url}`);
      return Response.json({ keys: [jwk] }, { headers: { "cache-control": "no-store" } });
    }),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("chosen-AI lifecycle ladder (locally provable rungs)", () => {
  test("1 · an anonymous request is challenged with this resource's own metadata", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain("resource_metadata=");
    expect(challenge).toContain("/.well-known/oauth-protected-resource/mcp");
  });

  test("2 · protected-resource metadata is well formed and names the branded resource", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/.well-known/oauth-protected-resource/mcp");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resource).toBe(RESOURCE);
    expect(body.resource_name).toBe("Assist With Family History");
    expect(Array.isArray(body.authorization_servers) && body.authorization_servers.length).toBeTruthy();
    expect(body.bearer_methods_supported).toContain("header");
  });

  test("3 · discovery is empty without a grant and filtered by it afterwards", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken(OWNER);

    const beforeApproval = await connect(t, token);
    expect((await beforeApproval.listTools()).tools).toEqual([]);
    await beforeApproval.close();

    // The refused first call raised exactly one pending request for the person.
    const pending = await t.run(async (ctx) => ctx.db.query("mcpGrants").collect());
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
    expect(pending[0].observedClientName).toContain(RUN_KEY);

    await t.run(async (ctx) => ctx.db.delete(pending[0]._id));
    await seedGrant(t, {
      vaultOwnerId: OWNER,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });

    const afterApproval = await connect(t, token);
    const names = (await afterApproval.listTools()).tools.map((tool) => tool.name);
    await afterApproval.close();

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(findTool(name), `${name} must be in the catalog`).toBeTruthy();
      expect(findTool(name)!.requiredScope).toBe("family_history:context:read");
    }
    // A read-only grant reaches no write tool at all.
    expect(names).not.toContain("family_history_save_records");
  });

  test("4 · an out-of-scope call refuses with the right code and leaks nothing", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken(OWNER);
    await seedGrant(t, {
      vaultOwnerId: OWNER,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });
    const client = await connect(t, token);
    const listed = new Set((await client.listTools()).tools.map((tool) => tool.name));
    const notGranted = FAMILY_HISTORY_CANONICAL_TOOL_NAMES.find((name) => !listed.has(name))!;
    const result = await callTool(client, notGranted, { operationId: `${RUN_KEY}:out-of-scope` });
    await client.close();

    expect(refusalCode(result)).toBe("SCOPE_NOT_GRANTED");
    const payload = refusalPayload(result);
    expect(payload).not.toContain(OWNER);
    expect(payload).not.toContain("vaultOwnerId");
    expect(payload).not.toContain(notGranted);
  });

  test("7 · one batch save, one correction, and a stale write refused", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken(OWNER);
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const client = await connect(t, token);

    const batch = await callTool(client, "family_history_save_records", {
      operationId: `${RUN_KEY}:save-records`,
      summary: "[SYNTHETIC QA - DELETE ME] One synthetic census household.",
      people: [
        {
          mode: "create",
          createKey: `${RUN_KEY}:person-a`,
          name: { given: "Synthetic", surname: "Householder" },
          sex: "unknown",
          living: false,
          tags: [RUN_KEY],
        },
        {
          mode: "create",
          createKey: `${RUN_KEY}:person-b`,
          name: { given: "Synthetic", surname: "Spouse" },
          sex: "unknown",
          living: false,
          tags: [RUN_KEY],
        },
      ],
      relationships: [
        {
          mode: "create",
          createKey: `${RUN_KEY}:couple`,
          type: "Couple",
          person1CreateKey: `${RUN_KEY}:person-a`,
          person2CreateKey: `${RUN_KEY}:person-b`,
        },
      ],
    });
    expect(batch.isError).not.toBe(true);
    const saved = batch.structuredContent as {
      results: { people: Array<{ id?: string; status: string }>; relationships: Array<{ status: string }> };
    };
    expect(saved.results.people).toHaveLength(2);
    expect(saved.results.people.every((row) => row.status === "created")).toBe(true);
    expect(saved.results.relationships[0].status).toBe("created");
    const personId = saved.results.people[0].id!;
    expect(personId).toBeTruthy();

    const context = await callTool(client, "family_history_get_context", { kind: "person", id: personId });
    const updatedAt = (context.structuredContent as { person: { updatedAt: number } }).person.updatedAt;
    expect(typeof updatedAt).toBe("number");

    const correction = await callTool(client, "family_history_save_person", {
      operationId: `${RUN_KEY}:correction`,
      mode: "update",
      personId,
      expectedUpdatedAt: updatedAt,
      researchStatus: "in_progress",
    });
    expect(correction.isError).not.toBe(true);

    // The same expectedUpdatedAt is now stale, because the correction moved it.
    const stale = await callTool(client, "family_history_save_person", {
      operationId: `${RUN_KEY}:stale-write`,
      mode: "update",
      personId,
      expectedUpdatedAt: updatedAt,
      researchStatus: "thorough",
    });
    await client.close();
    expect(refusalCode(stale)).toBe("STALE_VERSION");
  });

  test("8 · unknown, ungranted, invented, and cross-owner refusals are indistinguishable", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    await seedGrant(t, { vaultOwnerId: OTHER_OWNER, clientId: CLIENT_ID, issuer: ISSUER });

    const owner = await connect(t, await accessToken(OWNER));
    const created = await callTool(owner, "family_history_save_person", {
      operationId: `${RUN_KEY}:owner-person`,
      mode: "create",
      createKey: `${RUN_KEY}:owner-person`,
      name: { given: "Synthetic", surname: "Private" },
      sex: "unknown",
      living: false,
    });
    const personId = (created.structuredContent as { person: { id: string } }).person.id;

    const readOnly = await connect(t, await accessToken(OWNER));
    const unknownTool = await callTool(readOnly, "family_history_definitely_not_a_tool", {});
    expect(refusalCode(unknownTool)).toBe("SCOPE_NOT_GRANTED");

    const other = await connect(t, await accessToken(OTHER_OWNER));
    const crossOwner = await callTool(other, "family_history_get_context", { kind: "person", id: personId });
    const invented = await callTool(other, "family_history_get_context", {
      kind: "person",
      id: `${personId.slice(0, -4)}zzzz`,
    });
    await owner.close();
    await readOnly.close();
    await other.close();

    // Another owner's real record and an id that never existed must be the same
    // answer, or a refusal becomes an existence oracle.
    expect(refusalPayload(crossOwner)).toBe(refusalPayload(invented));
    expect(refusalPayload(crossOwner)).not.toContain(OWNER);
  });

  test("9 · replaying an operationId returns the stored receipt instead of writing twice", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken(OWNER);
    await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const client = await connect(t, token);

    const args = {
      operationId: `${RUN_KEY}:replay`,
      summary: "[SYNTHETIC QA - DELETE ME] Replay probe.",
      people: [
        {
          mode: "create",
          createKey: `${RUN_KEY}:replay-person`,
          name: { given: "Synthetic", surname: "Replay" },
          sex: "unknown",
          living: false,
        },
      ],
    };
    const first = await callTool(client, "family_history_save_records", args);
    const second = await callTool(client, "family_history_save_records", args);
    await client.close();

    // `deduplicated` is the one field that is meant to differ: it is how the
    // replay announces itself. Everything else must be the stored receipt.
    const strip = (result: ToolCallResult) => {
      const { deduplicated: _ignored, ...rest } = (result.structuredContent ?? {}) as Record<string, unknown>;
      void _ignored;
      return JSON.stringify(rest);
    };
    expect((first.structuredContent as { deduplicated?: boolean }).deduplicated).toBe(false);
    expect((second.structuredContent as { deduplicated?: boolean }).deduplicated).toBe(true);
    expect(strip(second)).toBe(strip(first));
    const people = await t.run(async (ctx) => ctx.db.query("persons").collect());
    expect(people).toHaveLength(1);
  });

  test("10 · revoking denies the very next call and empties discovery, on the same token", async () => {
    const t = convexTest(schema, modules);
    const token = await accessToken(OWNER);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER, clientId: CLIENT_ID, issuer: ISSUER });
    const client = await connect(t, token);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);

    await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("mcpGrants", grantId)!;
      await ctx.db.patch(id, { status: "revoked", revokedAt: Date.now(), updatedAt: Date.now() });
    });

    // Same connection, same still-valid token: nothing had to expire.
    const denied = await callTool(client, "family_history_get_brief", {});
    expect(refusalCode(denied)).toBe("GRANT_REVOKED");
    expect((await client.listTools()).tools).toEqual([]);
    await client.close();
  });
});
