import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { PrivateFamilyStart } from "../components/vault/PrivateFamilyStart";

const markup = renderToStaticMarkup(<PrivateFamilyStart />);
const componentSource = readFileSync(
  new URL("../components/vault/PrivateFamilyStart.tsx", import.meta.url),
  "utf8",
);
const mutationSource = readFileSync(
  new URL("../convex/vaultMutations.ts", import.meta.url),
  "utf8",
);

assert.match(markup, /Who belongs in this first connection/);
assert.match(markup, /Given name/);
assert.match(markup, /Are they living/);
assert.match(markup, /Choose explicitly/);
assert.match(markup, /Create an optional Queue handoff/);
assert.match(markup, /Your AI receives nothing unless you choose this/);
assert.match(markup, /Known is not yet proven/);
assert.match(markup, /min-h-11|min-h-12/);
assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);

assert.match(componentSource, /if \(createHandoff\) \{[\s\S]*fetch\("\/api\/queue"/);
assert.match(componentSource, /fetch\("\/api\/first-start"[\s\S]*if \(createHandoff\)/);
assert.match(componentSource, /Correct details/);
assert.match(componentSource, /Nothing has been written yet/);
assert.match(componentSource, /Nothing was saved/);

assert.match(mutationSource, /authorizeTenantMutation\([\s\S]*"vaultMutations\.startPrivateWorkspace"/);
assert.match(mutationSource, /evidenceStatus: "unsourced"/);
assert.match(mutationSource, /by_owner_creation_operation/);
assert.match(mutationSource, /First start is only available in an empty private workspace/);

// The People pages ask only "may the first start be offered?". They must not
// load the whole-vault dashboard summary for that yes/no.
for (const page of ["../app/app/people/page.tsx", "../app/app/people/new/page.tsx"]) {
  const pageSource = readFileSync(new URL(page, import.meta.url), "utf8");
  assert.match(pageSource, /api\.vaultReads\.getFirstStartEligibility/, page);
  assert.doesNotMatch(pageSource, /getDashboardSummary/, page);
}
assert.match(mutationSource, /isFirstStartEligible\(ctx, vaultOwnerId\)/);

// Every table the whole-vault snapshot reads, plus the Queue, decides emptiness.
const vaultSource = readFileSync(new URL("../convex/vault.ts", import.meta.url), "utf8");
const vaultModule = ts.createSourceFile("convex/vault.ts", vaultSource, ts.ScriptTarget.Latest, true);
const snapshot = vaultModule.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "getVaultSnapshot",
);
assert.ok(
  snapshot?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  "convex/vault.ts must export getVaultSnapshot",
);
const snapshotEnd = snapshot.body?.getLastToken();
assert.ok(
  snapshotEnd?.kind === ts.SyntaxKind.CloseBraceToken && snapshotEnd.getWidth() > 0,
  "getVaultSnapshot must have a complete function body",
);
const snapshotSource = snapshot.getText();
const snapshotTables = [...snapshotSource.matchAll(/byOwner\("(\w+)"\)/g)].map((match) => match[1]);
const emptyTablesStart = vaultSource.indexOf("export const FIRST_START_EMPTY_TABLES = [");
assert.ok(emptyTablesStart >= 0, "convex/vault.ts must define FIRST_START_EMPTY_TABLES");
const emptyTablesEnd = vaultSource.indexOf("\n] as const;", emptyTablesStart);
assert.ok(emptyTablesEnd > emptyTablesStart, "FIRST_START_EMPTY_TABLES must have a closing bracket");
const emptyTablesSource = vaultSource.slice(emptyTablesStart, emptyTablesEnd);
const emptyTables = [...emptyTablesSource.matchAll(/"(\w+)"/g)].map((match) => match[1]);
assert.ok(snapshotTables.length >= 20, "found the snapshot's owner tables");
assert.deepEqual([...emptyTables].sort(), [...snapshotTables, "queueItems"].sort());

console.log("Private first-start UI, authority, and evidence-boundary contract passed");
