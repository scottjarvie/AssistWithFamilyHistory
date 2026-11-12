// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { seedGrant } from "../../lib/mcp/testSupport";
import schema from "../../convex/schema";
import { fileCapsFor, audioPolicyFor, limitsFor } from "../../convex/usageLimits";
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
function lifecycle() {
  const exports: Record<string, string[]> = {
    "convex/mediaEvidenceStorage.ts": ["cleanupMcpEvidenceUpload"],
    "convex/mediaEvidenceControl.ts": ["markUploadFailed", "releaseUploadForRetry", "sessionForCleanup", "mediaUploadRef", "recordOrphanedCopies", "clearOrphanedCopies"],
    "convex/usageLimits.ts": ["expireReservations", "releaseOperation", "removeStoredBytes"],
  };
  const result: Record<string, string> = {};
  for (const [file, names] of Object.entries(exports)) {
    const text = readFileSync(file, "utf8"), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) {
        if (names.includes(decl.name.getText(ast))) result[decl.name.getText(ast)] = createHash("sha256").update(node.getText(ast)).digest("hex");
      }
      if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) result[node.name.text] = createHash("sha256").update(node.getText(ast)).digest("hex");
    }
  }
  for (const file of ["convex/media.ts", "convex/vaultMutations.ts", "convex/vaultReads.ts", "lib/media/evidenceB2.ts", "convex/crons.ts"]) result[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
  return result;
}
test("unset upload policies and lifecycle code match the captured baseline", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://identity.example.test");
  const policies = [], admissions = [];
  for (const enforcement of ["off", "warn", "on"] as const) for (const kind of ["image", "original", "audio", "voicenote", "web"]) for (const delta of [-1, 0, 1]) {
    const t = convexTest(schema, modules), owner = "synthetic", principal = { subject: owner, issuer: "https://identity.example.test", clientId: "synthetic-client", scopes: [] };
    const personId = await t.run(ctx => ctx.db.insert("persons", { vaultOwnerId: owner, name: { given: "Synthetic", surname: "Fixture" }, sex: "unknown", living: false, researchStatus: "basic", createdAt: 1, updatedAt: 1 }));
    const grantId = await seedGrant(t, { vaultOwnerId: owner, clientId: principal.clientId, scopes: ["family_history:evidence:write"] });
    await t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement, updatedAt: 0, updatedBy: "synthetic" }));
    const caps = await t.run(ctx => fileCapsFor(ctx, owner)), sizeBytes = caps[kind]! + delta;
    let outcome: unknown;
    try {
      const response = kind === "web"
        ? await t.withIdentity({ subject: owner, issuer: principal.issuer }).mutation(anyApi.vaultMutations.startMediaUpload, { vaultOwnerId: owner, operationId: "synthetic-operation", sizeBytes, mimeType: "application/pdf" })
        : await t.mutation(anyApi.mediaEvidenceControl.planMcpEvidenceUpload, { principal, grantId, operationId: "synthetic-operation", requestHash: "synthetic", uploadRef: "synthetic-upload", relayTokenHash: "synthetic-token", objectKey: "synthetic-object", expiresAt: Date.now() + 60000, input: { personId, title: "Synthetic", fileName: "synthetic", contentType: kind === "image" ? "image/jpeg" : kind === "original" ? "application/pdf" : "audio/wav", ...(kind === "voicenote" ? { audioKind: "voicenote" } : {}), sizeBytes, sha256: "a".repeat(64) } });
      outcome = response.refusal?.code ?? response.uploadRefusal?.code ?? "accepted";
    } catch (error) { outcome = (error as { data?: { code?: string } }).data?.code ?? "refused"; }
    admissions.push({ enforcement, kind, delta, outcome });
  }
  for (const enforcement of ["off", "warn", "on"] as const) {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("usageLimitSettings", { key: "site", enforcement, updatedAt: 0, updatedBy: "synthetic" }));
    policies.push(await t.run(async ctx => ({ enforcement, files: await fileCapsFor(ctx, "synthetic"), audio: await audioPolicyFor(ctx, "synthetic"), limits: await limitsFor(ctx, "synthetic") })));
  }
  const result = { policies, admissions, lifecycle: lifecycle() };
  if (process.env.UPLOAD_PARITY_CAPTURE) writeFileSync(process.env.UPLOAD_PARITY_CAPTURE, JSON.stringify(result, null, 2) + "\n");
  else expect(result).toEqual(JSON.parse(readFileSync("features/aiUpload/unsetBaseline.json", "utf8")));
});
