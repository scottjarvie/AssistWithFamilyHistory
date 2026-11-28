import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  auditConvexSourceFiles,
  checkTrustBoundary,
  convexModuleKey,
  isConvexRegistrationCandidate,
} from "./check-trust-boundary";
import {
  createConcernFile,
  extractImplementationWithDelegatedHelpers,
  extractStringArrayElements,
  findObjectLiteralsWithStringProperty,
  findUniqueExportedVariable,
  findUniqueForOfStatement,
  findUniqueFunctionDeclaration,
  findUniqueIndex,
  sliceBetweenUniqueAnchors,
  stripComments,
} from "./lib/sourceGuards";

describe("sourceGuards bound and anchor validation", () => {
  test("findUniqueIndex and sliceBetweenUniqueAnchors accept valid unique spans and reject missing, reversed, or ambiguous bounds", () => {
    const source = "alpha\nconst start = 1;\nmiddle();\nconst end = 2;\nomega";
    assert.equal(findUniqueIndex(source, "const start = 1;", "start"), 6);
    assert.equal(
      sliceBetweenUniqueAnchors(source, "const start = 1;", "const end = 2;", "span"),
      "const start = 1;\nmiddle();\n",
    );

    assert.throws(
      () => findUniqueIndex(source, "doesNotExist", "missing"),
      /Missing anchor/,
    );
    assert.throws(
      () => findUniqueIndex(`${source}\nconst start = 1;`, "const start = 1;", "dup"),
      /Ambiguous anchor/,
    );
    assert.throws(
      () => sliceBetweenUniqueAnchors(source, "const end = 2;", "const start = 1;", "reversed"),
      /Reversed bounds/,
    );
    assert.throws(
      () => sliceBetweenUniqueAnchors(`${source}\nconst end = 2;`, "const start = 1;", "const end = 2;", "ambiguous-end"),
      /Ambiguous anchor/,
    );
  });

  test("stripComments removes comments without corrupting URLs or regexes", () => {
    const raw = [
      "// aiUseAllowed: true",
      'const url = "https://example.test/a//b"; /* reviewStatus: "reviewed" */',
      "const ok = /foo\\/bar/.test(url);",
    ].join("\n");
    const stripped = stripComments(raw);
    assert.ok(!stripped.includes("aiUseAllowed: true"));
    assert.ok(!stripped.includes('reviewStatus: "reviewed"'));
    assert.ok(stripped.includes('"https://example.test/a//b"'));
    assert.ok(stripped.includes("/foo\\/bar/"));
  });

  test("findUniqueFunctionDeclaration finds a moved implementation across a narrow concern set while ignoring re-exports", () => {
    const vaultReExport = createConcernFile(
      "convex/vault.ts",
      'export { getVaultSnapshot } from "./lib/vaultSnapshot";\n',
    );
    const snapshotImpl = createConcernFile(
      "convex/lib/vaultSnapshot.ts",
      'export async function getVaultSnapshot() { return byOwner("persons"); }\n',
    );

    const found = findUniqueFunctionDeclaration(
      [vaultReExport, snapshotImpl],
      "getVaultSnapshot",
      { exportedOnly: true },
    );
    assert.equal(found.file.relativePath, "convex/lib/vaultSnapshot.ts");
    assert.match(found.text, /byOwner\("persons"\)/);

    assert.throws(
      () => findUniqueFunctionDeclaration([vaultReExport], "getVaultSnapshot", { exportedOnly: true }),
      /Missing exported function/,
    );

    const duplicate = createConcernFile(
      "convex/vault.ts",
      'export async function getVaultSnapshot() { return []; }\n',
    );
    assert.throws(
      () => findUniqueFunctionDeclaration([duplicate, snapshotImpl], "getVaultSnapshot", { exportedOnly: true }),
      /Ambiguous exported function/,
    );

    const truncated = createConcernFile(
      "convex/lib/vaultSnapshot.ts",
      'export async function getVaultSnapshot() { return byOwner("persons");\n',
    );
    assert.throws(
      () => findUniqueFunctionDeclaration([truncated], "getVaultSnapshot", { exportedOnly: true }),
      /syntax error|incomplete|closing brace/i,
    );
  });

  test("extractStringArrayElements reads moved array constants and rejects non-literal entries", () => {
    const moved = createConcernFile(
      "convex/lib/vaultSnapshot.ts",
      'export const FIRST_START_EMPTY_TABLES = ["persons", "queueItems"] as const;\n',
    );
    const decl = findUniqueExportedVariable([moved], "FIRST_START_EMPTY_TABLES");
    assert.deepEqual(extractStringArrayElements(decl, "FIRST_START_EMPTY_TABLES"), [
      "persons",
      "queueItems",
    ]);

    const dynamic = createConcernFile(
      "convex/lib/vaultSnapshot.ts",
      'export const FIRST_START_EMPTY_TABLES = ["persons", ...otherTables] as const;\n',
    );
    const dynamicDecl = findUniqueExportedVariable([dynamic], "FIRST_START_EMPTY_TABLES");
    assert.throws(
      () => extractStringArrayElements(dynamicDecl, "FIRST_START_EMPTY_TABLES"),
      /literal string entries/,
    );
  });

  test("extractImplementationWithDelegatedHelpers follows called helpers in the concern set without leaking unrelated sibling helpers", () => {
    const wrapper = createConcernFile(
      "convex/vaultMutations.ts",
      [
        'import { attachMediaBody, reviewMediaBody } from "./lib/vaultWrites/media";',
        "export const attachMediaFile = mutation({",
        "  handler: async (ctx, args) => attachMediaBody(ctx, args),",
        "});",
        "export const reviewMedia = mutation({",
        "  handler: async (ctx, args) => reviewMediaBody(ctx, args),",
        "});",
      ].join("\n"),
    );
    const safeMediaHelper = createConcernFile(
      "convex/lib/vaultWrites/media.ts",
      [
        "export async function attachMediaBody() {",
        '  return { aiUseAllowed: false, reviewStatus: "unreviewed" };',
        "}",
        "export async function reviewMediaBody(args: { aiUseAllowed: boolean }) {",
        "  return { aiUseAllowed: args.aiUseAllowed };",
        "}",
      ].join("\n"),
    );

    const attachDecl = findUniqueExportedVariable([wrapper], "attachMediaFile");
    const safeImpl = extractImplementationWithDelegatedHelpers(
      attachDecl,
      [wrapper, safeMediaHelper],
      { stripComments: true },
    );
    assert.match(safeImpl, /aiUseAllowed:\s*false/);
    assert.match(safeImpl, /reviewStatus:\s*"unreviewed"/);
    assert.doesNotMatch(safeImpl, /aiUseAllowed:\s*(true|args\.)/);

    const unsafeMediaHelper = createConcernFile(
      "convex/lib/vaultWrites/media.ts",
      [
        "export async function attachMediaBody() {",
        '  return { aiUseAllowed: true, reviewStatus: "unreviewed" };',
        "}",
        "export async function reviewMediaBody(args: { aiUseAllowed: boolean }) {",
        "  return { aiUseAllowed: args.aiUseAllowed };",
        "}",
      ].join("\n"),
    );
    const unsafeImpl = extractImplementationWithDelegatedHelpers(
      attachDecl,
      [wrapper, unsafeMediaHelper],
      { stripComments: true },
    );
    assert.match(unsafeImpl, /aiUseAllowed:\s*true/);
  });

  test("findUniqueForOfStatement isolates the target loop even if sibling loops reorder", () => {
    const reordered = createConcernFile(
      "convex/httpRoutes/evidenceDelivery.ts",
      [
        "for (const item of batch.b2Stored) { fetch(item.url); }",
        "for (const item of batch.stored) { actionCtx.storage.get(item.storageId); }",
      ].join("\n"),
    );
    const loop = findUniqueForOfStatement([reordered], "batch.stored", "stored loop", {
      stripComments: true,
    });
    assert.doesNotMatch(loop.text, /item\.url/);

    const duplicated = createConcernFile(
      "convex/httpRoutes/evidenceDelivery.ts",
      [
        "for (const item of batch.stored) { a(); }",
        "for (const item of batch.stored) { b(); }",
      ].join("\n"),
    );
    assert.throws(
      () => findUniqueForOfStatement([duplicated], "batch.stored", "stored loop"),
      /Ambiguous for-of loop/,
    );
  });

  test("findObjectLiteralsWithStringProperty scopes each JSON-RPC wire object to its own braces", () => {
    const transport = createConcernFile(
      "convex/httpRoutes/mcp.ts",
      [
        "const bad = { jsonrpc: \"2.0\", id: 1, result: { ok: true } };",
        "const good = { jsonrpc: \"2.0\", id: 2, result: { resultType: \"complete\", ok: true } };",
      ].join("\n"),
    );
    const objects = findObjectLiteralsWithStringProperty([transport], "jsonrpc", "2.0", {
      stripComments: true,
    });
    assert.equal(objects.length, 2);
    assert.equal(objects[0].text.includes('resultType: "complete"'), false);
    assert.equal(objects[1].text.includes('resultType: "complete"'), true);
  });
});

describe("check-trust-boundary recursive subtree discovery and relative classification", () => {
  test("isConvexRegistrationCandidate skips only _generated, declarations, and tests (not arbitrary underscore folders)", () => {
    assert.equal(isConvexRegistrationCandidate("vault.ts"), true);
    assert.equal(isConvexRegistrationCandidate("lib/vaultWrites/evidence.ts"), true);
    assert.equal(isConvexRegistrationCandidate("httpRoutes/mcp.ts"), true);
    assert.equal(isConvexRegistrationCandidate("_private/hidden.ts"), true);
    assert.equal(isConvexRegistrationCandidate("_generated/server.ts"), false);
    assert.equal(isConvexRegistrationCandidate("_generated/api.d.ts"), false);
    assert.equal(isConvexRegistrationCandidate("lib/foo.d.ts"), false);
    assert.equal(isConvexRegistrationCandidate("lib/foo.test.ts"), false);
    assert.equal(isConvexRegistrationCandidate("httpRoutes/evidenceDelivery.test.ts"), false);
    assert.equal(isConvexRegistrationCandidate("lib/foo.spec.ts"), false);
    assert.equal(isConvexRegistrationCandidate("README.md"), false);
  });

  test("convexModuleKey preserves root keys and qualifies nested paths", () => {
    assert.equal(convexModuleKey("vault.ts"), "vault");
    assert.equal(convexModuleKey("queue.ts"), "queue");
    assert.equal(convexModuleKey("lib/vault.ts"), "lib/vault");
    assert.equal(convexModuleKey("lib/vaultWrites/evidence.ts"), "lib/vaultWrites/evidence");
  });

  test("auditConvexSourceFiles catches unguarded nested public builders via relative _generated/server and searchServer imports", () => {
    const result = auditConvexSourceFiles([
      {
        convexRelativePath: "lib/nestedGenerated.ts",
        displayPath: "convex/lib/nestedGenerated.ts",
        content: [
          'import { mutation } from "../_generated/server";',
          "export const leak = mutation({",
          "  args: {},",
          "  handler: async (ctx) => ctx.db.query(\"persons\").collect(),",
          "});",
        ].join("\n"),
      },
      {
        convexRelativePath: "lib/deep/nestedSearch.ts",
        displayPath: "convex/lib/deep/nestedSearch.ts",
        content: [
          'import { mutation } from "../../searchServer";',
          "export const leakSearch = mutation({",
          "  args: {},",
          "  handler: async (ctx) => ctx.db.query(\"persons\").collect(),",
          "});",
        ].join("\n"),
      },
      {
        convexRelativePath: "_private/hidden.ts",
        displayPath: "convex/_private/hidden.ts",
        content: [
          'import { query } from "../_generated/server";',
          "export const secretRead = query({",
          "  args: {},",
          "  handler: async () => null,",
          "});",
        ].join("\n"),
      },
    ]);

    assert.deepEqual(
      result.inventory.map((entry) => entry.key),
      ["lib/nestedGenerated.leak", "lib/deep/nestedSearch.leakSearch", "_private/hidden.secretRead"],
    );
    assert.equal(result.failures.length, 3);
    assert.ok(result.failures.some((failure) => failure.includes("lib/nestedGenerated.leak")));
    assert.ok(result.failures.some((failure) => failure.includes("lib/deep/nestedSearch.leakSearch")));
    assert.ok(result.failures.some((failure) => failure.includes("_private/hidden.secretRead")));
  });

  test("nested files cannot spoof root allowlists or root queue wrapper exemptions", () => {
    const spoofed = auditConvexSourceFiles([
      {
        convexRelativePath: "lib/vault.ts",
        displayPath: "convex/lib/vault.ts",
        content: [
          'import { query } from "../_generated/server";',
          "export const getPublishedStory = query({",
          "  args: {},",
          "  handler: async () => null,",
          "});",
        ].join("\n"),
      },
      {
        convexRelativePath: "lib/queue.ts",
        displayPath: "convex/lib/queue.ts",
        content: [
          'import { mutation } from "../_generated/server";',
          'import { requireWebsitePerson, authorizeTenantMutation } from "../access";',
          "async function authorizeWebsitePersonTenantMutation(ctx: any, fn: string, owner: string) {",
          "  await requireWebsitePerson(ctx);",
          "  return authorizeTenantMutation(ctx, fn, owner);",
          "}",
          "export const spoofedQueueWrite = mutation({",
          "  args: {},",
          "  handler: async (ctx) => {",
          '    await authorizeWebsitePersonTenantMutation(ctx, "lib/queue.spoofedQueueWrite", "owner");',
          "    return null;",
          "  },",
          "});",
        ].join("\n"),
      },
    ]);

    assert.equal(spoofed.failures.length, 2);
    assert.ok(spoofed.failures.some((failure) => failure.includes("lib/vault.getPublishedStory")));
    assert.ok(spoofed.failures.some((failure) => failure.includes("lib/queue.spoofedQueueWrite")));
  });

  test("properly guarded nested public mutations and internal functions pass, and live repo scan includes Convex subtrees", () => {
    const cleanNested = auditConvexSourceFiles([
      {
        convexRelativePath: "lib/guarded.ts",
        displayPath: "convex/lib/guarded.ts",
        content: [
          'import { mutation, internalQuery } from "../searchServer";',
          'import { authorizeTenantMutation } from "../access";',
          "export const safeWrite = mutation({",
          "  args: {},",
          "  handler: async (ctx) => {",
          '    await authorizeTenantMutation(ctx, "lib/guarded.safeWrite", "owner");',
          '    return ctx.db.query("persons").collect();',
          "  },",
          "});",
          "export const internalRead = internalQuery({",
          "  args: {},",
          "  handler: async () => null,",
          "});",
        ].join("\n"),
      },
    ]);
    assert.deepEqual(cleanNested.failures, []);
    assert.equal(cleanNested.inventory.length, 1);
    assert.equal(cleanNested.inventory[0].key, "lib/guarded.safeWrite");

    const live = checkTrustBoundary(process.cwd());
    assert.deepEqual(live.failures, []);
    assert.ok(live.scannedFiles.includes("lib/vaultWrites/evidence.ts"));
    assert.ok(live.scannedFiles.includes("httpRoutes/mcp.ts"));
    assert.ok(!live.scannedFiles.some((file) => file.startsWith("_generated/")));
    assert.ok(!live.scannedFiles.some((file) => file.endsWith(".test.ts")));
    assert.ok(live.inventory.some((entry) => entry.key === "vault.getPublishedStory"));
  });
});
