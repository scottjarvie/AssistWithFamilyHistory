/**
 * Real Convex-runtime tests for API-key mint/revoke/list (convex-test),
 * mirroring convex/ownerScoping.test.ts. Covers owner isolation and that the
 * stored secret hash is never returned.
 */
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const OWNER_A = "user_keyOwnerAAAAAAAAAAAAAA";
const OWNER_B = "user_keyOwnerBBBBBBBBBBBBBB";

const mintArgs = (owner: string, keyId: string, label: string) => ({
  vaultOwnerId: owner,
  keyId,
  hashedSecret: "hash_" + keyId,
  label,
  scopes: ["people:read", "context:read"],
  tier: "standard" as const,
});

describe("api key lifecycle", () => {
  test("mint then list returns the key without its secret hash", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.apiKeys.mintKey, mintArgs(OWNER_A, "dts_live_aaa111", "Claude Code"));

    const keys = await t.query(api.apiKeys.listKeys, { vaultOwnerId: OWNER_A });
    expect(keys.length).toBe(1);
    expect(keys[0].keyId).toBe("dts_live_aaa111");
    expect(keys[0].status).toBe("active");
    // hashedSecret must never be exposed
    expect((keys[0] as Record<string, unknown>).hashedSecret).toBeUndefined();
  });

  test("revoke flips status and is owner-guarded", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.apiKeys.mintKey, mintArgs(OWNER_A, "dts_live_bbb222", "key"));

    // another owner cannot revoke it
    await expect(
      t.mutation(api.apiKeys.revokeKey, { vaultOwnerId: OWNER_B, keyId: "dts_live_bbb222" }),
    ).rejects.toThrow(/not found/);

    await t.mutation(api.apiKeys.revokeKey, { vaultOwnerId: OWNER_A, keyId: "dts_live_bbb222" });
    const keys = await t.query(api.apiKeys.listKeys, { vaultOwnerId: OWNER_A });
    expect(keys[0].status).toBe("revoked");
    expect(typeof keys[0].revokedAt).toBe("number");
  });

  test("mint rejects a non-dts key id and an empty label", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.apiKeys.mintKey, { ...mintArgs(OWNER_A, "bad_prefix_1", "x") }),
    ).rejects.toThrow(/prefix/);
    await expect(
      t.mutation(api.apiKeys.mintKey, { ...mintArgs(OWNER_A, "dts_live_ccc333", "   ") }),
    ).rejects.toThrow(/label/);
  });

  test("list is owner-scoped", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.apiKeys.mintKey, mintArgs(OWNER_A, "dts_live_aaa", "a"));
    await t.mutation(api.apiKeys.mintKey, mintArgs(OWNER_B, "dts_live_bbb", "b"));
    const aKeys = await t.query(api.apiKeys.listKeys, { vaultOwnerId: OWNER_A });
    expect(aKeys.length).toBe(1);
    expect(aKeys[0].keyId).toBe("dts_live_aaa");
  });
});
