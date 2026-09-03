/**
 * Trust-boundary registration contract (GEN-87/88).
 *
 * Convex functions are public when they are registered with the public
 * query/mutation/action builders imported from `_generated/server`. Merely
 * accepting or mentioning `vaultOwnerId` is not authorization: protected
 * functions must execute the shared backend guard.
 *
 * This check uses the TypeScript AST instead of matching handler bodies with a
 * regex. That keeps nested object literals, comments containing guard names,
 * and aliased Convex builder imports from creating false passes.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type PublicFunctionKind = "query" | "mutation" | "action";

type PublicFunction = {
  key: string;
  kind: PublicFunctionKind;
  file: string;
  line: number;
  initializer: ts.CallExpression;
  sourceFile: ts.SourceFile;
  verifiedActionHelpers: ReadonlySet<string>;
};

const PUBLIC_QUERY_ALLOWLIST: Record<string, string> = {
  "vault.getPublishedStory":
    "Anonymous story-by-id read; the Convex handler enforces published status and returns the public DTO.",
  "vault.getPublishedStoryByIdentifier":
    "Anonymous story-by-slug/id read; the Convex handler enforces published status and returns the public DTO.",
  "trustBoundary.getShadowLogSummary":
    "Always-enforced control-plane summary guarded by the configured Convex super-admin allowlist.",
};

// Public system mutations are exceptional. Add one only when it cannot be an
// internalMutation and document the non-user principal that authorizes it.
// An entry here bypasses the authorizeTenantMutation requirement.
const PUBLIC_MUTATION_SYSTEM_ALLOWLIST: Record<string, string> = {};

// Public bearer-capability actions are exceptional. They must accept an opaque,
// short-lived capability instead of an owner coordinate, resolve all tenant
// authority server-side, and return a uniform refusal. This allowlist exists so
// that such a route is visible and reviewed instead of pretending a Clerk
// session is available where the protocol deliberately has none.
const PUBLIC_ACTION_CAPABILITY_ALLOWLIST: Record<string, string> = {
  "mediaEvidenceStorage.authorizeMcpEvidenceRelay":
    "Resolves a short-lived hashed relay capability to one checksum-bound upload; accepts no owner or record coordinate.",
};

const GENERATED_SERVER_MODULE = "./_generated/server";
const PUBLIC_BUILDERS = new Set<PublicFunctionKind>(["query", "mutation", "action"]);
const convexDir = path.join(process.cwd(), "convex");
const failures: string[] = [];
const inventory: PublicFunction[] = [];

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function hasExportModifier(node: ts.VariableStatement): boolean {
  return Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function importedBuilders(sourceFile: ts.SourceFile): Map<string, string> {
  const builders = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== GENERATED_SERVER_MODULE) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly) continue;
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      builders.set(specifier.name.text, importedName);
    }
  }

  return builders;
}

function getHandlerNode(initializer: ts.CallExpression): ts.Node | null {
  const registration = initializer.arguments[0];
  if (!registration || !ts.isObjectLiteralExpression(unwrapExpression(registration))) return null;

  const object = unwrapExpression(registration) as ts.ObjectLiteralExpression;
  for (const property of object.properties) {
    const propertyName = property.name && ts.isIdentifier(property.name) ? property.name.text : null;
    if (propertyName !== "handler") continue;

    if (ts.isPropertyAssignment(property)) return property.initializer;
    if (ts.isMethodDeclaration(property)) return property;
    return null;
  }

  return null;
}

function isNestedExecutionBoundary(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/**
 * Find a real call in this function's execution scope. Comments and strings are
 * absent from the AST, and nested function bodies are deliberately skipped so
 * an unused inner function cannot spoof authorization for its parent.
 */
function containsCall(node: ts.Node, functionName: string): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (child !== node && isNestedExecutionBoundary(child)) return;
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(unwrapExpression(child.expression)) &&
      (unwrapExpression(child.expression) as ts.Identifier).text === functionName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function firstExecutionCall(
  node: ts.Node,
  predicate: (call: ts.CallExpression) => boolean,
): ts.CallExpression | null {
  let first: ts.CallExpression | null = null;
  const visit = (child: ts.Node) => {
    if (child !== node && isNestedExecutionBoundary(child)) return;
    if (ts.isCallExpression(child) && predicate(child)) {
      if (!first || child.getStart() < first.getStart()) first = child;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return first;
}

function callIdentifier(call: ts.CallExpression): string | null {
  const expression = unwrapExpression(call.expression);
  return ts.isIdentifier(expression) ? expression.text : null;
}

function isTenantDataCall(call: ts.CallExpression): boolean {
  const expression = unwrapExpression(call.expression);
  if (!ts.isPropertyAccessExpression(expression)) return false;

  const method = expression.name.text;
  if (["runQuery", "runMutation", "runAction"].includes(method)) {
    return ts.isIdentifier(unwrapExpression(expression.expression)) &&
      (unwrapExpression(expression.expression) as ts.Identifier).text === "ctx";
  }

  const parent = unwrapExpression(expression.expression);
  return ts.isPropertyAccessExpression(parent) &&
    parent.name.text === "db" &&
    ts.isIdentifier(unwrapExpression(parent.expression)) &&
    (unwrapExpression(parent.expression) as ts.Identifier).text === "ctx";
}

function callArgumentContains(
  outerCall: ts.CallExpression,
  innerCall: ts.CallExpression,
): boolean {
  return outerCall.arguments.some(
    (argument) =>
      innerCall.getStart() >= argument.getStart() &&
      innerCall.getEnd() <= argument.getEnd(),
  );
}

/**
 * Allow one auditable level of local delegation for action handlers. A helper
 * is trusted only when it is a non-exported, top-level function whose own body
 * directly calls authorizeTenantAction. Helpers calling other helpers are not
 * transitively trusted.
 */
function verifiedLocalActionHelpers(sourceFile: ts.SourceFile): Set<string> {
  const helpers = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const exported = ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (
        !exported &&
        statement.name &&
        statement.name.text !== "authorizeTenantAction" &&
        statement.body &&
        containsCall(statement, "authorizeTenantAction")
      ) {
        helpers.add(statement.name.text);
      }
      continue;
    }

    if (!ts.isVariableStatement(statement) || hasExportModifier(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (
        declaration.name.text !== "authorizeTenantAction" &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
        containsCall(initializer, "authorizeTenantAction")
      ) {
        helpers.add(declaration.name.text);
      }
    }
  }

  return helpers;
}

function containsIdentifier(node: ts.Node, identifier: string): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(child) && child.text === identifier) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function validateAllowlist(name: string, entries: Record<string, string>) {
  for (const [key, reason] of Object.entries(entries)) {
    if (reason.trim().length < 20) {
      failures.push(`${name} entry ${key} needs a concrete reason of at least 20 characters.`);
    }
  }
}

validateAllowlist("PUBLIC_QUERY_ALLOWLIST", PUBLIC_QUERY_ALLOWLIST);
validateAllowlist("PUBLIC_MUTATION_SYSTEM_ALLOWLIST", PUBLIC_MUTATION_SYSTEM_ALLOWLIST);
validateAllowlist("PUBLIC_ACTION_CAPABILITY_ALLOWLIST", PUBLIC_ACTION_CAPABILITY_ALLOWLIST);

const sourceFiles = readdirSync(convexDir, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts"),
  )
  .map((entry) => path.join(convexDir, entry.name))
  .sort();

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const builders = importedBuilders(sourceFile);
  const actionHelpers = verifiedLocalActionHelpers(sourceFile);
  const moduleName = path.basename(file, ".ts");
  const trackedPublicCalls = new Set<ts.CallExpression>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;

      const callee = unwrapExpression(initializer.expression);
      if (!ts.isIdentifier(callee)) continue;
      const importedBuilder = builders.get(callee.text);
      if (!importedBuilder || !PUBLIC_BUILDERS.has(importedBuilder as PublicFunctionKind)) continue;

      const entry: PublicFunction = {
        key: `${moduleName}.${declaration.name.text}`,
        kind: importedBuilder as PublicFunctionKind,
        file: path.relative(process.cwd(), file),
        line: lineOf(sourceFile, declaration),
        initializer,
        sourceFile,
        verifiedActionHelpers: actionHelpers,
      };
      inventory.push(entry);
      trackedPublicCalls.add(initializer);
    }
  }

  // Fail closed if a public Convex builder is invoked through an unsupported
  // registration shape such as an unexported local followed by a re-export.
  const findUntrackedBuilderCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (ts.isIdentifier(callee)) {
        const importedBuilder = builders.get(callee.text);
        if (importedBuilder && PUBLIC_BUILDERS.has(importedBuilder as PublicFunctionKind)) {
          if (!trackedPublicCalls.has(node)) {
            failures.push(
              `${path.relative(process.cwd(), file)}:${lineOf(sourceFile, node)} invokes public Convex builder ` +
                `"${callee.text}" outside a direct exported const registration; use ` +
                "`export const name = query|mutation|action({...})` so the trust-boundary inventory can classify it.",
            );
          }
        }
      }
    }
    ts.forEachChild(node, findUntrackedBuilderCalls);
  };
  findUntrackedBuilderCalls(sourceFile);
}

for (const entry of inventory) {
  if (entry.kind === "query") {
    if (!PUBLIC_QUERY_ALLOWLIST[entry.key]) {
      failures.push(
        `${entry.file}:${entry.line} ${entry.key} is a public query. Only the two published-story reads ` +
          "and the always-enforced shadow-log summary may remain public queries; convert this protected read " +
          "to an action and call authorizeTenantAction in its handler.",
      );
    }
    continue;
  }

  const handler = getHandlerNode(entry.initializer);
  if (!handler) {
    failures.push(
      `${entry.file}:${entry.line} ${entry.key} has no statically inspectable inline handler; ` +
        "the trust-boundary check requires an inline handler so authorization cannot be hidden behind an alias.",
    );
    continue;
  }

  const requiredGuard = entry.kind === "action" ? "authorizeTenantAction" : "authorizeTenantMutation";
  const isSystemAllowlisted =
    entry.kind === "mutation" && Boolean(PUBLIC_MUTATION_SYSTEM_ALLOWLIST[entry.key]);
  const isCapabilityAllowlisted =
    entry.kind === "action" && Boolean(PUBLIC_ACTION_CAPABILITY_ALLOWLIST[entry.key]);

  const callsVerifiedActionHelper =
    entry.kind === "action" &&
    [...entry.verifiedActionHelpers].some((helperName) => containsCall(handler, helperName));

  if (
    !isSystemAllowlisted &&
    !isCapabilityAllowlisted &&
    !containsCall(handler, requiredGuard) &&
    !callsVerifiedActionHelper
  ) {
    const mentionOnly = containsIdentifier(handler, "vaultOwnerId");
    failures.push(
      `${entry.file}:${entry.line} ${entry.key} must call ${requiredGuard}(...) inside its handler.` +
        (mentionOnly
          ? " Referencing vaultOwnerId is tenant filtering, not caller authorization."
          : " A public Convex function must authenticate before accessing tenant data."),
    );
    continue;
  }

  if (!isSystemAllowlisted && !isCapabilityAllowlisted) {
    const acceptedGuards = new Set([
      requiredGuard,
      ...(entry.kind === "action" ? [...entry.verifiedActionHelpers] : []),
    ]);
    const firstGuard = firstExecutionCall(
      handler,
      (call) => acceptedGuards.has(callIdentifier(call) ?? ""),
    );
    const firstDataCall = firstExecutionCall(handler, isTenantDataCall);
    if (
      firstGuard &&
      firstDataCall &&
      firstDataCall.getStart() < firstGuard.getStart() &&
      !callArgumentContains(firstDataCall, firstGuard)
    ) {
      failures.push(
        `${entry.file}:${entry.line} ${entry.key} touches Convex data before ${requiredGuard}; ` +
          "authorization must be the first tenant-sensitive operation.",
      );
    }
  }
}

const counts = inventory.reduce(
  (result, entry) => {
    result[entry.kind] += 1;
    return result;
  },
  { query: 0, mutation: 0, action: 0 },
);

const inventoryLabel = `${inventory.length} public functions (${counts.query} queries, ${counts.mutation} mutations, ${counts.action} actions)`;

if (failures.length > 0) {
  console.error(`Trust-boundary contract failed; inventoried ${inventoryLabel}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Trust-boundary contract passed; inventoried ${inventoryLabel}.`);
