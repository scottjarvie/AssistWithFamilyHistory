/// <reference types="vite/client" />
/**
 * Adversarial tests for the product-grant layer.
 *
 * These are the tests that decide whether "the person approved it" is a real
 * boundary or decoration, so they probe from the outside — through the same
 * stateless HTTP transport a chosen AI uses — rather than calling the
 * authorizer directly.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import schema from "./schema";
import { internal } from "./_generated/api";
import {
  FAMILY_HISTORY_ALL_TOOL_NAMES,
  FAMILY_HISTORY_TOOLS,
  findTool,
  scopeForTool,
} from "../lib/mcp/catalog";
import { decideToolAccess, queueScopesForGrant } from "../lib/mcp/authorize";
import { seedGrant } from "../lib/mcp/testSupport";

const modules = import.meta.glob("./**/*.ts");
const RESOURCE = "https://family-history.example.test/mcp";
const ISSUER = "https://identity.example.test";
const OWNER_A = "user_grant_owner_AAAAAAAAAAAA";
const OWNER_B = "user_grant_owner_BBBBBBBBBBBB";
const CLIENT_ID = "synthetic-grant-client";
const PROTOCOL_VERSION = "2026-07-28";

let privateKey: KeyLike;
let jwk: JsonWebKey;

function rpc(method: string, token: string, params: Record<string, unknown> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "grant-probe", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  };
}

async function tokenFor(subject: string, audience: string | undefined = RESOURCE) {
  const jwt = new SignJWT({ scope: "openid offline_access", client_id: CLIENT_ID })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key", typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m");
  if (audience) jwt.setAudience(audience);
  return await jwt.sign(privateKey);
}

async function toolNames(t: ReturnType<typeof convexTest>, subject: string) {
  const response = await t.fetch("/mcp", rpc("tools/list", await tokenFor(subject)));
  const payload = await response.json();
  return (payload.result?.tools ?? []).map((tool: { name: string }) => tool.name);
}

async function callTool(
  t: ReturnType<typeof convexTest>,
  subject: string,
  name: string,
  args: Record<string, unknown>,
) {
  const response = await t.fetch("/mcp", rpc("tools/call", await tokenFor(subject), { name, arguments: args }));
  const payload = await response.json();
  expect(payload.error, `unexpected protocol error for ${name}`).toBeUndefined();
  const result = payload.result;
  const text = result?.content?.find((block: { type: string }) => block.type === "text")?.text;
  let body: Record<string, unknown> | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Some probes deliberately send invalid arguments; the SDK answers with a
    // plain-text validation message rather than our machine-error envelope.
    body = { code: "VALIDATION_ERROR", message: text };
  }
  return { isError: result?.isError === true, body, raw: payload };
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

describe("scope to tool matrix", () => {
  test("every tool names a scope, and no read scope reaches a tool that writes", () => {
    for (const tool of FAMILY_HISTORY_TOOLS) {
      expect(scopeForTool(tool.name)).toBe(tool.requiredScope);
      if (tool.requiredScope.endsWith(":read")) expect(tool.writes).toBe(false);
    }
  });

  test("a name outside the catalog maps to no scope at all", () => {
    for (const name of ["", "save_everything", "family_history_delete_person", "../persons"]) {
      expect(scopeForTool(name)).toBeNull();
    }
  });

  test("each alias resolves to the same entry, and therefore the same scope and handler", () => {
    for (const tool of FAMILY_HISTORY_TOOLS) {
      if (!tool.alias) continue;
      expect(findTool(tool.alias)).toBe(findTool(tool.name));
      expect(scopeForTool(tool.alias)).toBe(tool.requiredScope);
    }
  });

  test("two half-permissions never sum into one", () => {
    // A story draft needs story:draft. A grant with only research:write cannot
    // reach it, and a second grant elsewhere in the table cannot help, because
    // the authorizer is only ever handed one grant.
    const decision = decideToolAccess({
      toolName: "family_history_save_story_work",
      resolution: {
        state: "active",
        grant: {
          grantId: "g1",
          clientId: CLIENT_ID,
          issuer: ISSUER,
          scopes: ["family_history:research:write"],
          boundary: { kind: "whole_workspace" },
        },
      },
      now: Date.now(),
      input: {},
    });
    expect(decision.allowed).toBe(false);

    // The same is true for a batch that carries stories under research:write.
    const batch = decideToolAccess({
      toolName: "family_history_save_records",
      resolution: {
        state: "active",
        grant: {
          grantId: "g1",
          clientId: CLIENT_ID,
          issuer: ISSUER,
          scopes: ["family_history:research:write"],
          boundary: { kind: "whole_workspace" },
        },
      },
      now: Date.now(),
      input: { stories: [{ mode: "create" }] },
    });
    expect(batch.allowed).toBe(false);
  });

  test("Queue scopes come from the grant, not a hard-coded set", () => {
    expect(queueScopesForGrant([])).toEqual([]);
    expect(queueScopesForGrant(["family_history:queue:read"])).toEqual(["queue:read"]);
    expect(queueScopesForGrant(["family_history:queue:work"])).toEqual([
      "queue:read",
      "queue:claim",
      "queue:update",
      "queue:complete",
    ]);
  });
});

describe("grant states deny both discovery and calls", () => {
  test("an unapproved connection sees no tools and is told to ask the person", async () => {
    const t = convexTest(schema, modules);
    expect(await toolNames(t, OWNER_A)).toEqual([]);

    const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(call.isError).toBe(true);
    expect(call.body.code).toBe("GRANT_REQUIRED");
    expect(call.body.recovery).toContain("/settings/ai");

    // Exactly one pending request is raised, and a second call does not add
    // another for the same client.
    await callTool(t, OWNER_A, "family_history_get_brief", {});
    const pending = await t.run(async (ctx) =>
      await ctx.db
        .query("mcpGrants")
        .withIndex("by_owner_status", (q) => q.eq("vaultOwnerId", OWNER_A).eq("status", "pending"))
        .collect(),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].scopes).toEqual([]);
  });

  test("pending, revoked, expired, and denied all fail closed", async () => {
    for (const status of ["pending", "revoked", "expired", "denied"] as const) {
      const t = convexTest(schema, modules);
      await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER, status });
      expect(await toolNames(t, OWNER_A)).toEqual([]);
      const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
      expect(call.isError).toBe(true);
      expect(["GRANT_REQUIRED", "GRANT_REVOKED", "GRANT_EXPIRED"]).toContain(call.body.code);
    }
  });

  test("expiry is decided in code at read time, not by the token's lifetime", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      expiresAt: Date.now() - 1_000,
    });
    // The access token below is perfectly valid for another five minutes.
    const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(call.isError).toBe(true);
    expect(call.body.code).toBe("GRANT_EXPIRED");
  });

  test("revoking a grant denies the very next request with the same token", async () => {
    const t = convexTest(schema, modules);
    const grantId = await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const before = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(before.isError).toBe(false);

    await t.withIdentity({ subject: OWNER_A }).mutation(
      (await import("./_generated/api")).api.mcpGrants.revokeGrant,
      { vaultOwnerId: OWNER_A, grantId: grantId as never, reason: "Finished the project" },
    );

    // Same token, no waiting for it to expire.
    const after = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(after.isError).toBe(true);
    expect(after.body.code).toBe("GRANT_REVOKED");
    expect(await toolNames(t, OWNER_A)).toEqual([]);
  });
});

describe("scope filtering", () => {
  test("discovery shows exactly the approved surface, canonical plus alias", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });
    const names = await toolNames(t, OWNER_A);
    expect(names).toContain("family_history_get_brief");
    expect(names).toContain("get_family_history_brief");
    expect(names).not.toContain("family_history_save_person");
    expect(names).not.toContain("save_person");
    expect(names).not.toContain("family_history_get_evidence");
  });

  test("a write tool outside the grant is refused with the same words as an unknown tool", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });
    const ungranted = await callTool(t, OWNER_A, "family_history_save_person", {
      operationId: "probe-ungranted-tool",
      mode: "create",
      createKey: "person:probe",
      name: { given: "Probe", surname: "Person" },
      sex: "unknown",
      living: false,
    });
    const unknown = await callTool(t, OWNER_A, "family_history_delete_everything", {});
    expect(ungranted.body).toEqual(unknown.body);
    expect(ungranted.body.code).toBe("SCOPE_NOT_GRANTED");
  });

  test("the alias and the canonical name behave identically", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const canonical = await callTool(t, OWNER_A, "family_history_get_brief", {});
    const alias = await callTool(t, OWNER_A, "get_family_history_brief", {});
    expect(canonical.isError).toBe(false);
    expect(alias.isError).toBe(false);
    expect(alias.body.workspace).toBe(canonical.body.workspace);
  });
});

describe("record boundaries", () => {
  async function seedPerson(t: ReturnType<typeof convexTest>, owner: string, given: string) {
    return await t.run(async (ctx) =>
      ctx.db.insert("persons", {
        vaultOwnerId: owner,
        name: { given, surname: "Boundary" },
        sex: "unknown",
        living: false,
        researchStatus: "basic",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
  }

  test("a selected-people grant cannot be walked sideways onto another person", async () => {
    const t = convexTest(schema, modules);
    const inside = await seedPerson(t, OWNER_A, "Inside");
    const outside = await seedPerson(t, OWNER_A, "Outside");
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      boundary: { kind: "selected_people", personIds: [String(inside)] },
    });

    const allowed = await callTool(t, OWNER_A, "family_history_get_context", {
      kind: "person",
      id: String(inside),
    });
    expect(allowed.isError).toBe(false);

    const refused = await callTool(t, OWNER_A, "family_history_get_context", {
      kind: "person",
      id: String(outside),
    });
    expect(refused.isError).toBe(true);
    expect(refused.body.code).toBe("OUTSIDE_GRANT_BOUNDARY");
  });

  test("a boundary refusal is identical for a real record and an invented one", async () => {
    const t = convexTest(schema, modules);
    const inside = await seedPerson(t, OWNER_A, "Inside");
    const outside = await seedPerson(t, OWNER_A, "Outside");
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      boundary: { kind: "selected_people", personIds: [String(inside)] },
    });
    const real = await callTool(t, OWNER_A, "family_history_get_context", { kind: "person", id: String(outside) });
    const invented = await callTool(t, OWNER_A, "family_history_get_context", {
      kind: "person",
      id: "kn700000000000000000000000000",
    });
    expect(real.body).toEqual(invented.body);
  });

  test("a queue-only grant reaches no record tools at all", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      boundary: { kind: "queue_only" },
    });
    const names = await toolNames(t, OWNER_A);
    expect(names).toContain("family_history_get_queue");
    expect(names).not.toContain("family_history_get_brief");
    expect(names).not.toContain("family_history_save_person");
  });
});

describe("cross-owner isolation", () => {
  test("owner B's grant is invisible to owner A and vice versa", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER_B, clientId: CLIENT_ID, issuer: ISSUER });
    // Same client, different verified subject: A has no grant of their own.
    expect(await toolNames(t, OWNER_A)).toEqual([]);
    expect(await toolNames(t, OWNER_B)).not.toEqual([]);
  });

  test("no grant refusal anywhere names a record, an owner, or a table", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:queue:read"],
    });
    for (const name of FAMILY_HISTORY_ALL_TOOL_NAMES) {
      const call = await callTool(t, OWNER_A, name, {});
      if (!call.isError) continue;
      const text = JSON.stringify(call.body).toLowerCase();
      for (const leak of [OWNER_A.toLowerCase(), OWNER_B.toLowerCase(), "vaultownerid", "persons", "mcpgrants"]) {
        expect(text).not.toContain(leak);
      }
    }
  });
});

describe("the data layer refuses independently of the transport", () => {
  test("a write mutation called without a grant fails closed", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: { issuer: ISSUER, subject: OWNER_A, clientId: CLIENT_ID, scopes: [] },
        operationId: "no-grant-direct-write",
        requestHash: "hash",
        input: {
          mode: "create",
          createKey: "person:no-grant",
          name: { given: "No", surname: "Grant" },
          sex: "unknown",
          living: false,
        },
      }),
    ).rejects.toThrow(/GRANT_REQUIRED/);
  });

  test("a write mutation cannot borrow another owner's grant id", async () => {
    const t = convexTest(schema, modules);
    const otherGrant = await seedGrant(t, { vaultOwnerId: OWNER_B, clientId: CLIENT_ID, issuer: ISSUER });
    await expect(
      t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: { issuer: ISSUER, subject: OWNER_A, clientId: CLIENT_ID, scopes: [] },
        grantId: otherGrant,
        operationId: "borrowed-grant-write",
        requestHash: "hash",
        input: {
          mode: "create",
          createKey: "person:borrowed",
          name: { given: "Borrowed", surname: "Grant" },
          sex: "unknown",
          living: false,
        },
      }),
    ).rejects.toThrow(/GRANT_REQUIRED/);
  });

  test("a grant narrowed to reads cannot be used for a write even with a valid id", async () => {
    const t = convexTest(schema, modules);
    const readOnly = await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });
    await expect(
      t.mutation(internal.mcpFamilyHistory.savePerson, {
        principal: { issuer: ISSUER, subject: OWNER_A, clientId: CLIENT_ID, scopes: [] },
        grantId: readOnly,
        operationId: "read-grant-write",
        requestHash: "hash",
        input: {
          mode: "create",
          createKey: "person:read-only",
          name: { given: "Read", surname: "Only" },
          sex: "unknown",
          living: false,
        },
      }),
    ).rejects.toThrow(/SCOPE_NOT_GRANTED/);
  });
});

describe("token audience", () => {
  test("a token minted for a different resource is refused", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const response = await t.fetch(
      "/mcp",
      rpc("tools/list", await tokenFor(OWNER_A, "https://another-assist-product.example.test/mcp")),
    );
    expect(response.status).toBe(401);
  });

  test("a token with no audience claim is still accepted, because the grant is the authority", async () => {
    const t = convexTest(schema, modules);
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const response = await t.fetch("/mcp", rpc("tools/list", await tokenFor(OWNER_A, undefined)));
    expect(response.status).toBe(200);
  });
});
