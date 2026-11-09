import { withGrantVersions } from "../lib/mcp/testSupport";
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
import { api, internal } from "./_generated/api";
import {
  FAMILY_HISTORY_CONTROL_TOOLS,
  FAMILY_HISTORY_ALL_TOOL_NAMES,
  FAMILY_HISTORY_SCOPES,
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
      "queue:add",
    ]);
  });
});

describe("grant states: sign-in approves, the person's no stands", () => {
  test("signing in approves a new connection for the ordinary permissions, once", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    expect(await toolNames(t, OWNER_A)).toContain("family_history_get_brief");

    const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(call.isError).toBe(false);

    // Exactly one grant exists for the client, over the whole workspace, and it
    // records that sign-in was the approval.
    const rows = await t.run(async (ctx) =>
      await ctx.db
        .query("mcpGrants")
        .withIndex("by_owner_client", (q) => q.eq("vaultOwnerId", OWNER_A).eq("clientId", CLIENT_ID))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].boundary.kind).toBe("whole_workspace");
    expect([...rows[0].scopes].sort()).toEqual([...FAMILY_HISTORY_SCOPES].sort());
    expect(rows[0].expiresAt).toBeUndefined();
    expect(rows[0].scopeChoice).toBe("full");
    expect(rows[0].expiryChoice).toBe("none");
    expect(JSON.parse(rows[0].consentSnapshot!).approvedBy).toBe("sign_in");
    // The never-list is outside the scope ceiling, so sign-in cannot reach it.
    expect(await toolNames(t, OWNER_A)).not.toContain("family_history_delete_person");
  });

  test("revoked and denied stay refused after signing in again", async () => {
    for (const status of ["revoked", "denied"] as const) {
      const t = withGrantVersions(convexTest(schema, modules));
      await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER, status });
      expect(await toolNames(t, OWNER_A)).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name));
      const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
      expect(call.isError).toBe(true);
      expect(call.body.code).toBe("GRANT_REVOKED");
    }
  });

  test("a waiting request from before sign-in approval becomes the whole grant", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER, status: "pending", scopes: [] });
    const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(call.isError).toBe(false);
    const rows = await t.run(async (ctx) => await ctx.db.query("mcpGrants").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
  });

  test("an ambiguous expired term stays expired on sign-in and keeps the person's narrowing", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
      expiresAt: Date.now() - 1_000,
    });
    const call = await callTool(t, OWNER_A, "family_history_get_brief", {});
    expect(call.isError).toBe(true);
    expect(call.body.code).toBe("GRANT_EXPIRED");
    const rows = await t.run(async (ctx) => await ctx.db.query("mcpGrants").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].scopes).toEqual(["family_history:context:read"]);
    expect(rows[0].expiresAt!).toBeLessThan(Date.now());
    expect(await toolNames(t, OWNER_A)).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name));
  });

  test("revoking a grant denies the very next request with the same token", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
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
    expect(await toolNames(t, OWNER_A)).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name));
  });

  test("revoking newest of multiple legacy approvals refuses the next MCP call with the same token", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    const olderId = await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const newestId = await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    await t.run((ctx) => ctx.db.patch(olderId as never, { authorityGrantId: newestId as never }));
    const token = await tokenFor(OWNER_A);
    const call = async () => {
      const response = await t.fetch("/mcp", rpc("tools/call", token, { name: "family_history_get_brief", arguments: {} }));
      const payload = await response.json();
      expect(payload.error).toBeUndefined();
      return payload.result;
    };
    expect((await call()).isError).not.toBe(true);
    const own = t.withIdentity({ subject: OWNER_A });
    await own.mutation(api.mcpGrants.revokeGrant, { vaultOwnerId: OWNER_A, grantId: newestId as never });
    const refused = await call();
    expect(refused.isError).toBe(true);
    expect(JSON.parse(refused.content.find((block: { type: string }) => block.type === "text").text).code).toBe("GRANT_REVOKED");
    expect(await toolNames(t, OWNER_A)).toEqual(FAMILY_HISTORY_CONTROL_TOOLS.map(t => t.name));
    const approved = await own.mutation(api.mcpGrants.approveGrant, {
      vaultOwnerId: OWNER_A, grantId: newestId as never, label: "Explicit reapproval",
      scopes: ["family_history:context:read"], boundary: { kind: "whole_workspace" }, expiresInDays: 7,
    });
    expect([olderId, newestId]).not.toContain(String(approved.id));
    expect((await call()).isError).not.toBe(true);
    expect(await t.run(ctx => ctx.db.get(newestId as never))).toMatchObject({ status: "revoked", authorityGrantId: approved.id });
    expect(await t.run(ctx => ctx.db.get(olderId as never))).toMatchObject({ status: "active" });
    // Historical raw rows retain their receipt; only the canonical authority gates calls.
  });
});

describe("scope filtering", () => {
  test("discovery shows exactly the approved surface, canonical plus alias", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    expect(ungranted.body.code).toEqual(unknown.body.code);
    expect(ungranted.body.message).toContain("family_history:research:write");
    expect(ungranted.body.code).toBe("SCOPE_NOT_GRANTED");
  });

  test("the alias and the canonical name behave identically", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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

  test("a grant narrowed to named Queue items lists only those items", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = withGrantVersions(convexTest(schema, modules));
    const create = (key: string) => t.withIdentity({ subject: OWNER_A }).mutation(api.queue.createQueueItem, {
      vaultOwnerId: OWNER_A,
      directive: `Synthetic Queue directive ${key}.`,
      idempotencyKey: `grant-queue:${key}`,
    });
    const allowed = (await create("allowed")).item;
    const excluded = (await create("excluded")).item;
    await seedGrant(t, {
      vaultOwnerId: OWNER_A,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      boundary: { kind: "queue_only", queueItemIds: [String(allowed._id)] },
    });
    const listed = await callTool(t, OWNER_A, "family_history_get_queue", { action: "list" });
    expect(listed.isError).toBe(false);
    const ids = (listed.body as { page: Array<{ _id: string }> }).page.map((item) => item._id);
    expect(ids).toEqual([String(allowed._id)]);
    expect(ids).not.toContain(String(excluded._id));
    // Filters still apply inside the boundary.
    const none = await callTool(t, OWNER_A, "family_history_get_queue", { action: "list", state: "done" });
    expect((none.body as { page: unknown[] }).page).toEqual([]);
    // The excluded item stays out of reach by id too.
    const detail = await callTool(t, OWNER_A, "family_history_get_queue", { action: "detail", queueItemId: String(excluded._id) });
    expect(detail.isError).toBe(true);
  });

  test("named Queue paging does not skip working items after expiry reconciliation", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = withGrantVersions(convexTest(schema, modules));
    const now = Date.now();
    const items = [];
    for (const key of ["oldest", "middle", "expired"]) {
      const created = await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.createQueueItem, {
        vaultOwnerId: OWNER_A,
        directive: `Synthetic paging directive ${key}.`,
        idempotencyKey: `paging:${key}`,
      });
      items.push(created.item);
    }
    await t.run(async (ctx) => {
      for (const [index, item] of items.entries()) {
        await ctx.db.patch(item._id, {
          updatedAt: now - 3_000 + index,
          state: "working",
          condition: "active",
          activeActorKind: "chosen_ai",
          activeActorId: "synthetic-paging-ai",
          leaseExpiresAt: now + 120_000,
        });
      }
    });
    const ordered = [...items].sort((a, b) => b._creationTime - a._creationTime || (a._id < b._id ? 1 : -1));
    // Put the expired row first for both the old updatedAt order and the
    // immutable creation-time/ID order used by the continuation cursor.
    await t.run(async (ctx) => {
      await ctx.db.patch(ordered[0]._id, { updatedAt: now, leaseExpiresAt: now - 1 });
      await ctx.db.patch(ordered[1]._id, { updatedAt: now - 1 });
      await ctx.db.patch(ordered[2]._id, { updatedAt: now - 2 });
    });
    await seedGrant(t, {
      vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER,
      boundary: { kind: "queue_only", queueItemIds: items.map((item) => String(item._id)) },
    });
    const list = async (cursor: string | null) => {
      const result = await callTool(t, OWNER_A, "family_history_get_queue", {
        action: "list", state: "working", limit: 1, cursor,
      });
      expect(result.isError).toBe(false);
      return result.body as { page: Array<{ _id: string }>; isDone: boolean; continueCursor: string };
    };
    const first = await list(null);
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(ordered[0]._id))).toMatchObject({ state: "working", needsInput: expect.objectContaining({actorId:"queue-expiry"}) });
    const second = await list(first.continueCursor);
    expect(second.page.map((item) => item._id)).toEqual([String(ordered[1]._id)]);
    const third = await list(second.continueCursor);
    expect(third.page.map((item) => item._id)).toEqual([String(ordered[2]._id)]);
    expect(third.isDone).toBe(true);
  });

  test("a whole-workspace grant without a Queue boundary still lists every Queue item", async () => {
    vi.stubEnv("TRUST_BOUNDARY_MODE", "enforce");
    const t = withGrantVersions(convexTest(schema, modules));
    for (const key of ["one", "two"]) {
      await t.withIdentity({ subject: OWNER_A }).mutation(api.queue.createQueueItem, {
        vaultOwnerId: OWNER_A,
        directive: `Synthetic Queue directive ${key}.`,
        idempotencyKey: `grant-queue-all:${key}`,
      });
    }
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const listed = await callTool(t, OWNER_A, "family_history_get_queue", { action: "list" });
    expect((listed.body as { page: unknown[] }).page).toHaveLength(2);
  });
});

describe("cross-owner isolation", () => {
  test("owner B's grant is invisible to owner A and vice versa", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    await seedGrant(t, {
      vaultOwnerId: OWNER_B,
      clientId: CLIENT_ID,
      issuer: ISSUER,
      scopes: ["family_history:context:read"],
    });
    // Same client, different verified subject: B's narrowed grant does not
    // govern A, who gets a grant of their own from signing in.
    expect(await toolNames(t, OWNER_A)).toContain("family_history_save_records");
    expect(await toolNames(t, OWNER_B)).not.toContain("family_history_save_records");
    const rows = await t.run(async (ctx) => await ctx.db.query("mcpGrants").collect());
    expect(rows.map((row) => row.vaultOwnerId).sort()).toEqual([OWNER_A, OWNER_B].sort());
  });

  test("no grant refusal anywhere names a record, an owner, or a table", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
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
    const t = withGrantVersions(convexTest(schema, modules));
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const response = await t.fetch(
      "/mcp",
      rpc("tools/list", await tokenFor(OWNER_A, "https://another-assist-product.example.test/mcp")),
    );
    expect(response.status).toBe(401);
  });

  test("a token with no audience claim is still accepted, because the grant is the authority", async () => {
    const t = withGrantVersions(convexTest(schema, modules));
    await seedGrant(t, { vaultOwnerId: OWNER_A, clientId: CLIENT_ID, issuer: ISSUER });
    const response = await t.fetch("/mcp", rpc("tools/list", await tokenFor(OWNER_A, undefined)));
    expect(response.status).toBe(200);
  });
});

test("new suggestion reads keep selected-person reach through open, dismissed, withdrawn and accepted views",async()=>{
 vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");const t=withGrantVersions(convexTest(schema,modules));
 const inside=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:OWNER_A,name:{given:"Allowed",surname:"Synthetic"},sex:"unknown",living:false,researchStatus:"not_started",createdAt:123,updatedAt:123}));
 const outside=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:OWNER_A,name:{given:"Outside",surname:"Synthetic"},sex:"unknown",living:false,researchStatus:"not_started",createdAt:123,updatedAt:123}));
 const template=(await t.withIdentity({subject:OWNER_A}).mutation(api.queue.createQueueItem,{vaultOwnerId:OWNER_A,directive:"Suggestion reach template",idempotencyKey:"suggestion-reach-template"})).item;
 const rows=await t.run(async ctx=>{const {_id,_creationTime,...fields}=(await ctx.db.get(template._id))!;void _id;void _creationTime;const result=[];for(const status of ["open","dismissed","withdrawn","accepted"] as const){for(const personId of [inside,outside]){const allowed=personId===inside;const id=await ctx.db.insert("queueItems",{...fields,addedBy:"ai_suggestion",suggestionStatus:status,raisedByCredentialId:`${ISSUER}#${CLIENT_ID}`,fromRecord:{kind:"person",refId:personId},summary:`${allowed?"Allowed":"Outside"} ${status}`,suggestionReason:`${allowed?"Allowed":"Private outside"} idea`,dismissReason:status==="dismissed"?(allowed?"Allowed dismiss":"Private outside dismiss"):undefined,archivedAt:["dismissed","withdrawn"].includes(status)?123:undefined,updatedAt:allowed?100:200});result.push({id,status,allowed});}}return result;});
 await seedGrant(t,{vaultOwnerId:OWNER_A,clientId:CLIENT_ID,issuer:ISSUER,boundary:{kind:"selected_people",personIds:[String(inside)]}});
 for(const filter of [{suggestions:true},{suggestions:true,archived:true},{}]){let cursor:string|null=null;const ids:string[]=[];let done=false;do{const result=await callTool(t,OWNER_A,"family_history_get_queue",{action:"list",...filter,limit:1,cursor});expect(result.isError).toBe(false);const body=result.body as {page:Array<{_id:string}>;continueCursor:string;isDone:boolean};expect(JSON.stringify(body)).not.toContain("Private outside");expect(body.page.every(row=>!rows.some(r=>r.id===row._id&&!r.allowed))).toBe(true);ids.push(...body.page.map(row=>row._id));cursor=body.continueCursor;done=body.isDone;}while(!done);const wanted=rows.filter(row=>row.allowed&&(filter.suggestions?filter.archived?["dismissed","withdrawn"].includes(row.status):row.status==="open":row.status==="accepted")).map(row=>String(row.id));for(const id of wanted)expect(ids).toContain(id);}
 for(const row of rows){const detail=await callTool(t,OWNER_A,"family_history_get_queue",{action:"detail",queueItemId:String(row.id)});expect(detail.isError).toBe(!row.allowed);if(!row.allowed)expect(JSON.stringify(detail)).not.toContain("Private outside");}
 const brief=await callTool(t,OWNER_A,"family_history_get_brief",{});expect(JSON.stringify(brief)).not.toContain("Outside accepted");
});

// Explicit website JWT issuer for synthetic person identities; never an auth bypass.
beforeEach(()=>vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://convex.test"));
