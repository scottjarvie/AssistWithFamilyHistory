/**
 * Convex server-client authentication contract (GEN-87/88).
 *
 * The unauthenticated Convex factory is reserved for published-story reads.
 * Every protected app/lib caller must attach the caller's Clerk JWT through
 * getAuthedConvexClient. Active CLI tooling must attach an explicit short-lived
 * token. Direct ConvexHttpClient construction elsewhere is rejected.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const serverFactoryPath = "lib/convex/server.ts";
const publicStoryFiles = new Set([
  "app/stories/[id]/page.tsx",
  "app/stories/[id]/opengraph-image.tsx",
]);
const publicStoryQueries = new Set([
  "api.vault.getPublishedStory",
  "api.vault.getPublishedStoryByIdentifier",
]);
// CLI tooling that attaches its own explicit short-lived token. Both are
// operator-run scripts, never part of a request path.
const explicitTokenCliFiles = new Set(["scripts/audit-vault.ts", "scripts/mcp-lifecycle.ts"]);
const excludedDirectories = new Set([
  ".next",
  "__tests__",
  "coverage",
  "dist",
  "legacy",
  "node_modules",
  "_generated",
]);
const failures: string[] = [];
let scannedFiles = 0;
let publicClientCalls = 0;

function normalizePath(file: string): string {
  return file.split(path.sep).join("/");
}

function relativePath(file: string): string {
  return normalizePath(path.relative(root, file));
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function walkActiveSource(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...walkActiveSource(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function expressionPath(expression: ts.Expression): string | null {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return current.text;
  if (ts.isPropertyAccessExpression(current)) {
    const parent = expressionPath(current.expression);
    return parent ? `${parent}.${current.name.text}` : null;
  }
  return null;
}

function resolvesToConvexServerModule(importer: string, moduleName: string): boolean {
  if (moduleName === "@/lib/convex/server") return true;
  if (!moduleName.startsWith(".")) return false;
  const resolved = normalizePath(path.resolve(path.dirname(importer), moduleName));
  const expected = normalizePath(path.join(root, "lib", "convex", "server"));
  return resolved === expected || resolved === `${expected}.ts`;
}

function isDirectAllowedPublicStoryCall(call: ts.CallExpression): boolean {
  const property = call.parent;
  if (!ts.isPropertyAccessExpression(property) || property.expression !== call || property.name.text !== "query") {
    return false;
  }
  const queryCall = property.parent;
  if (!ts.isCallExpression(queryCall) || queryCall.expression !== property) return false;
  const functionReference = queryCall.arguments[0];
  return Boolean(functionReference && publicStoryQueries.has(expressionPath(functionReference) ?? ""));
}

const files = [path.join(root, "app"), path.join(root, "lib"), path.join(root, "scripts")]
  .flatMap((dir) => walkActiveSource(dir))
  .sort();

for (const file of files) {
  scannedFiles += 1;
  const relative = relativePath(file);
  const source = readFileSync(file, "utf8");
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const unauthClientNames = new Set<string>();
  const convexBrowserClientNames = new Set<string>();
  const convexServerNamespaces = new Set<string>();
  const convexBrowserNamespaces = new Set<string>();
  let importsUnauthClient = false;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleName = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) continue;

      if (resolvesToConvexServerModule(file, moduleName)) {
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const specifier of clause.namedBindings.elements) {
            const importedName = specifier.propertyName?.text ?? specifier.name.text;
            if (importedName === "getConvexClient") {
              importsUnauthClient = true;
              unauthClientNames.add(specifier.name.text);
            }
          }
        } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          // Namespace imports expose getConvexClient even when the current code
          // only calls another member, so keep protected callers on auditable
          // named imports.
          importsUnauthClient = true;
          convexServerNamespaces.add(clause.namedBindings.name.text);
        }
      }

      if (moduleName === "convex/browser" && !clause.isTypeOnly) {
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const specifier of clause.namedBindings.elements) {
            if (specifier.isTypeOnly) continue;
            const importedName = specifier.propertyName?.text ?? specifier.name.text;
            if (importedName === "ConvexHttpClient") {
              convexBrowserClientNames.add(specifier.name.text);
            }
          }
        } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          convexBrowserNamespaces.add(clause.namedBindings.name.text);
        }
      }
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      resolvesToConvexServerModule(file, statement.moduleSpecifier.text)
    ) {
      const exportsUnauth = statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.some(
            (specifier) => (specifier.propertyName?.text ?? specifier.name.text) === "getConvexClient",
          )
        : true;
      if (exportsUnauth && relative !== serverFactoryPath) {
        failures.push(`${relative}:${lineOf(sourceFile, statement)} must not re-export getConvexClient.`);
      }
    }
  }

  const isFactory = relative === serverFactoryPath;
  const isPublicStoryFile = publicStoryFiles.has(relative);
  let validPublicCalls = 0;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      const directUnauthCall = ts.isIdentifier(expression) && unauthClientNames.has(expression.text);
      const namespaceUnauthCall =
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        convexServerNamespaces.has(expression.expression.text) &&
        expression.name.text === "getConvexClient";

      if (directUnauthCall || namespaceUnauthCall) {
        publicClientCalls += 1;
        if (isFactory) {
          // The shared factory owns construction and authenticated wrapping.
        } else if (isPublicStoryFile && isDirectAllowedPublicStoryCall(node)) {
          validPublicCalls += 1;
        } else if (isPublicStoryFile) {
          failures.push(
            `${relative}:${lineOf(sourceFile, node)} may use getConvexClient only as a direct .query(...) ` +
              "call to vault.getPublishedStory or vault.getPublishedStoryByIdentifier.",
          );
        } else {
          failures.push(
            `${relative}:${lineOf(sourceFile, node)} uses unauthenticated getConvexClient; protected app/lib ` +
              "code must await getAuthedConvexClient instead.",
          );
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const expression = unwrapExpression(node.expression);
      const directBrowserClient =
        ts.isIdentifier(expression) && convexBrowserClientNames.has(expression.text);
      const namespaceBrowserClient =
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        convexBrowserNamespaces.has(expression.expression.text) &&
        expression.name.text === "ConvexHttpClient";
      if ((directBrowserClient || namespaceBrowserClient) && !isFactory) {
        const isExplicitTokenCli =
          explicitTokenCliFiles.has(relative) &&
          source.includes("process.env.CONVEX_AUTH_TOKEN") &&
          /\.setAuth\s*\(/.test(source);
        if (!isExplicitTokenCli) {
          failures.push(
            `${relative}:${lineOf(sourceFile, node)} constructs ConvexHttpClient directly; use ` +
              "getAuthedConvexClient or the explicit short-lived-token CLI pattern.",
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (importsUnauthClient && !isFactory && !isPublicStoryFile) {
    failures.push(
      `${relative} imports getConvexClient outside the server factory/public-story allowlist; ` +
        "protected code must import getAuthedConvexClient.",
    );
  }
  if (importsUnauthClient && isPublicStoryFile && validPublicCalls === 0) {
    failures.push(
      `${relative} imports getConvexClient but has no direct allowlisted published-story query call.`,
    );
  }
}

if (failures.length > 0) {
  console.error(`Convex client auth contract failed after scanning ${scannedFiles} active app/lib/scripts files:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Convex client auth contract passed across ${scannedFiles} active app/lib/scripts files ` +
    `(${publicClientCalls} allowed unauthenticated factory/public-story calls).`,
);
