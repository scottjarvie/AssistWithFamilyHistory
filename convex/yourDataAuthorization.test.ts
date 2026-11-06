import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const OWNER = "user_export_owner";
afterEach(() => vi.unstubAllEnvs());

for (const mode of ["enforce", "shadow", undefined]) {
  describe(`your data authorization in ${mode ?? "unset"} mode`, () => {
    for (const caller of [undefined, "user_other_owner", OWNER]) {
      test(`${caller ?? "anonymous"} can read only their own vault`, async () => {
        vi.stubEnv("TRUST_BOUNDARY_MODE", mode);
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          await ctx.db.insert("persons", {
            vaultOwnerId: OWNER, name: { given: "Private", surname: "Fixture" },
            sex: "unknown", living: true, researchStatus: "not_started", createdAt: 1, updatedAt: 1,
          });
        });
        const client = caller ? t.withIdentity({ subject: caller }) : t;
        const reads = [
          () => client.action(api.yourData.exportPage, { vaultOwnerId: OWNER, table: "persons", cursor: null }),
          () => client.action(api.yourData.getYourStats, { vaultOwnerId: OWNER }),
          () => client.action(api.yourData.getLibraryShelves, { vaultOwnerId: OWNER }),
        ];
        for (const read of reads) {
          if (caller === OWNER) {
            await expect(read()).resolves.toBeDefined();
          } else {
            await expect(read()).rejects.toThrow(/Trust boundary denied/);
          }
        }
        if (caller === OWNER) {
          const page = await reads[0]();
          expect(page).toMatchObject({ rows: [expect.objectContaining({ vaultOwnerId: OWNER })], cursor: null });
        }
      });
    }
  });
}

test("recent AI saves include the newest activity beyond the cap", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 1001; i++) {
      await ctx.db.insert("agentActivity", {
        vaultOwnerId: OWNER, requestId: `fixture-${i}`, principalKind: "mcp",
        route: "fixture", method: "POST", outcome: "ok", statusCode: 200,
        createdAt: i === 1000 ? Date.now() : 1,
      });
    }
  });
  await expect(t.withIdentity({ subject: OWNER }).action(api.yourData.getYourStats, { vaultOwnerId: OWNER }))
    .resolves.toMatchObject({ ai: { savesLast30Days: 1, savesCapped: true } });
});
