import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type ConcernFile = {
  relativePath: string;
  absolutePath: string;
  content: string;
  sourceFile: ts.SourceFile;
};

export type MatchedDeclaration = {
  file: ConcernFile;
  name: string;
  node: ts.Node;
  initializer?: ts.Expression;
  text: string;
};

const MODULE_EXTENSION_PATTERN = /\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
const strippedSourceCache = new WeakMap<ts.SourceFile, string>();

export function canonicalModuleKey(filePath: string): string {
  return path.resolve(filePath).replace(MODULE_EXTENSION_PATTERN, "");
}

export function createConcernFile(
  relativePath: string,
  content: string,
  rootDir = process.cwd(),
): ConcernFile {
  const normalizedRelative = relativePath.replaceAll("\\", "/");
  const absolutePath = path.resolve(rootDir, normalizedRelative);
  const sourceFile = ts.createSourceFile(
    absolutePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  return {
    relativePath: normalizedRelative,
    absolutePath,
    content,
    sourceFile,
  };
}

/**
 * Load all existing files from a narrow, explicit list of paths where a single
 * concern may live (for example, a top-level Convex file and its planned split
 * target). Fails loudly if none of the listed files exist.
 */
export function readConcernFiles(
  relativePaths: readonly string[],
  rootDir = process.cwd(),
): ConcernFile[] {
  assert.ok(relativePaths.length > 0, "Concern file set must name at least one file");
  const files: ConcernFile[] = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.resolve(rootDir, relativePath);
    if (!existsSync(absolutePath)) continue;
    files.push(createConcernFile(relativePath, readFileSync(absolutePath, "utf8"), rootDir));
  }
  assert.ok(
    files.length > 0,
    `No files found in concern file set: ${relativePaths.join(", ")}`,
  );
  return files;
}

/**
 * Strip JS/TS comments using the TypeScript AST while preserving exact character
 * offsets and line breaks, so string literals, URLs, and regexes are untouched.
 */
export function stripCommentsFromSourceFile(sourceFile: ts.SourceFile): string {
  const cached = strippedSourceCache.get(sourceFile);
  if (cached !== undefined) return cached;

  const text = sourceFile.text;
  const ranges: Array<{ pos: number; end: number }> = [];
  const seen = new Set<number>();

  const collect = (pos: number) => {
    for (const range of ts.getLeadingCommentRanges(text, pos) ?? []) {
      if (!seen.has(range.pos)) {
        seen.add(range.pos);
        ranges.push({ pos: range.pos, end: range.end });
      }
    }
    for (const range of ts.getTrailingCommentRanges(text, pos) ?? []) {
      if (!seen.has(range.pos)) {
        seen.add(range.pos);
        ranges.push({ pos: range.pos, end: range.end });
      }
    }
  };

  const visit = (node: ts.Node) => {
    collect(node.pos);
    collect(node.end);
    for (const child of node.getChildren(sourceFile)) {
      visit(child);
    }
  };
  visit(sourceFile);

  if (ranges.length === 0) {
    strippedSourceCache.set(sourceFile, text);
    return text;
  }

  ranges.sort((a, b) => a.pos - b.pos);
  let out = "";
  let cursor = 0;
  for (const range of ranges) {
    if (range.pos < cursor) continue;
    out += text.slice(cursor, range.pos);
    out += text.slice(range.pos, range.end).replace(/[^\r\n]/g, " ");
    cursor = range.end;
  }
  out += text.slice(cursor);
  strippedSourceCache.set(sourceFile, out);
  return out;
}

export function stripComments(source: string, fileName = "source.ts"): string {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  return stripCommentsFromSourceFile(sourceFile);
}

export function combineConcernSources(
  files: readonly ConcernFile[],
  options: { stripComments?: boolean } = {},
): string {
  return files
    .map((file) =>
      options.stripComments ? stripCommentsFromSourceFile(file.sourceFile) : file.content,
    )
    .join("\n");
}

export function unwrapExpression(expression: ts.Expression): ts.Expression {
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

function hasExportModifier(node: ts.HasModifiers): boolean {
  return Boolean(
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function hasSyntaxError(node: ts.Node): boolean {
  if ((node.flags & ts.NodeFlags.ThisNodeHasError) !== 0) return true;
  let errored = false;
  const visit = (child: ts.Node) => {
    if (errored) return;
    if ((child.flags & ts.NodeFlags.ThisNodeHasError) !== 0) {
      errored = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return errored;
}

function assertCompleteNode(sourceFile: ts.SourceFile, node: ts.Node, label: string): void {
  assert.ok(!hasSyntaxError(node), `${label} has a syntax error or incomplete body`);
  const unwrapped = ts.isExpression(node) ? unwrapExpression(node) : node;

  if (ts.isBlock(unwrapped)) {
    const closeToken = unwrapped.getChildren(sourceFile).at(-1);
    assert.ok(
      closeToken?.kind === ts.SyntaxKind.CloseBraceToken && closeToken.getWidth(sourceFile) > 0,
      `${label} must have a complete block closing brace`,
    );
    return;
  }
  if (
    ts.isFunctionDeclaration(unwrapped) ||
    ts.isFunctionExpression(unwrapped) ||
    ts.isArrowFunction(unwrapped)
  ) {
    assert.ok(unwrapped.body, `${label} must have a function body`);
    if (ts.isBlock(unwrapped.body)) {
      assertCompleteNode(sourceFile, unwrapped.body, label);
    }
    return;
  }
  if (ts.isCallExpression(unwrapped)) {
    const closeToken = unwrapped.getChildren(sourceFile).at(-1);
    assert.ok(
      closeToken?.kind === ts.SyntaxKind.CloseParenToken && closeToken.getWidth(sourceFile) > 0,
      `${label} must have a complete closing parenthesis`,
    );
    return;
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    const closeToken = unwrapped.getChildren(sourceFile).at(-1);
    assert.ok(
      closeToken?.kind === ts.SyntaxKind.CloseBracketToken && closeToken.getWidth(sourceFile) > 0,
      `${label} must have a complete closing bracket`,
    );
    return;
  }
  if (ts.isObjectLiteralExpression(unwrapped)) {
    const closeToken = unwrapped.getChildren(sourceFile).at(-1);
    assert.ok(
      closeToken?.kind === ts.SyntaxKind.CloseBraceToken && closeToken.getWidth(sourceFile) > 0,
      `${label} must have a complete closing brace`,
    );
    return;
  }
  if (ts.isForOfStatement(unwrapped)) {
    if (ts.isBlock(unwrapped.statement)) {
      assertCompleteNode(sourceFile, unwrapped.statement, label);
    }
  }
}

function getNodeText(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  options: { stripComments?: boolean } = {},
): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const base = options.stripComments ? stripCommentsFromSourceFile(sourceFile) : sourceFile.text;
  return base.slice(start, end);
}

/**
 * Find an anchor that must appear once and only once. Missing or ambiguous
 * anchors both fail loudly before any downstream assertion runs.
 */
export function findUniqueIndex(source: string, anchor: string, label: string): number {
  assert.ok(anchor.length > 0, `${label}: anchor must be non-empty`);
  const first = source.indexOf(anchor);
  assert.ok(first >= 0, `Missing anchor for ${label}: ${JSON.stringify(anchor)}`);
  const second = source.indexOf(anchor, first + 1);
  assert.equal(
    second,
    -1,
    `Ambiguous anchor for ${label}: ${JSON.stringify(anchor)} appears more than once`,
  );
  return first;
}

/**
 * Slice strictly between two unique anchors. Fails if either anchor is missing,
 * duplicated, or reversed.
 */
export function sliceBetweenUniqueAnchors(
  source: string,
  startAnchor: string,
  endAnchor: string,
  label: string,
): string {
  const start = findUniqueIndex(source, startAnchor, `${label} start`);
  const end = findUniqueIndex(source, endAnchor, `${label} end`);
  assert.ok(
    end > start,
    `Reversed bounds for ${label}: end anchor ${JSON.stringify(endAnchor)} precedes start anchor ${JSON.stringify(startAnchor)}`,
  );
  return source.slice(start, end);
}

export function findUniqueFunctionDeclaration(
  files: readonly ConcernFile[],
  name: string,
  options: { exportedOnly?: boolean; stripComments?: boolean } = {},
): MatchedDeclaration {
  const matches: MatchedDeclaration[] = [];

  for (const file of files) {
    for (const statement of file.sourceFile.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name?.text !== name) continue;
      if (options.exportedOnly && !hasExportModifier(statement)) continue;
      assertCompleteNode(
        file.sourceFile,
        statement,
        `${file.relativePath}:${name}`,
      );
      matches.push({
        file,
        name,
        node: statement,
        text: getNodeText(file.sourceFile, statement, options),
      });
    }
  }

  assert.ok(
    matches.length > 0,
    `Missing ${options.exportedOnly ? "exported " : ""}function "${name}" in [${files.map((file) => file.relativePath).join(", ")}]`,
  );
  assert.equal(
    matches.length,
    1,
    `Ambiguous ${options.exportedOnly ? "exported " : ""}function "${name}" found ${matches.length} times across [${matches.map((match) => match.file.relativePath).join(", ")}]`,
  );
  return matches[0];
}

export function findUniqueExportedVariable(
  files: readonly ConcernFile[],
  name: string,
  options: { stripComments?: boolean } = {},
): MatchedDeclaration {
  const matches: MatchedDeclaration[] = [];

  for (const file of files) {
    for (const statement of file.sourceFile.statements) {
      if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
        assert.ok(
          declaration.initializer,
          `${file.relativePath}:${name} must have an initializer`,
        );
        assertCompleteNode(
          file.sourceFile,
          declaration.initializer,
          `${file.relativePath}:${name}`,
        );
        matches.push({
          file,
          name,
          node: statement,
          initializer: declaration.initializer,
          text: getNodeText(file.sourceFile, statement, options),
        });
      }
    }
  }

  assert.ok(
    matches.length > 0,
    `Missing exported variable "${name}" in [${files.map((file) => file.relativePath).join(", ")}]`,
  );
  assert.equal(
    matches.length,
    1,
    `Ambiguous exported variable "${name}" found ${matches.length} times across [${matches.map((match) => match.file.relativePath).join(", ")}]`,
  );
  return matches[0];
}

export function extractStringArrayElements(
  declaration: MatchedDeclaration,
  label: string,
): string[] {
  assert.ok(declaration.initializer, `${label} must have an initializer`);
  const unwrapped = unwrapExpression(declaration.initializer);
  assert.ok(
    ts.isArrayLiteralExpression(unwrapped),
    `${label} must be an array literal`,
  );
  assertCompleteNode(declaration.file.sourceFile, unwrapped, label);

  const values: string[] = [];
  for (const element of unwrapped.elements) {
    assert.ok(
      ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element),
      `${label} must contain only literal string entries (found ${ts.SyntaxKind[element.kind]})`,
    );
    values.push(element.text);
  }
  return values;
}

export function findUniqueForOfStatement(
  files: readonly ConcernFile[],
  iterableExpression: string,
  label: string,
  options: { stripComments?: boolean } = {},
): MatchedDeclaration {
  const matches: MatchedDeclaration[] = [];

  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (
        ts.isForOfStatement(node) &&
        node.expression.getText(file.sourceFile).trim() === iterableExpression
      ) {
        assertCompleteNode(file.sourceFile, node, `${file.relativePath}:${label}`);
        matches.push({
          file,
          name: iterableExpression,
          node,
          text: getNodeText(file.sourceFile, node, options),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sourceFile);
  }

  assert.ok(
    matches.length > 0,
    `Missing for-of loop over "${iterableExpression}" (${label}) in [${files.map((file) => file.relativePath).join(", ")}]`,
  );
  assert.equal(
    matches.length,
    1,
    `Ambiguous for-of loop over "${iterableExpression}" (${label}): found ${matches.length} matches`,
  );
  return matches[0];
}

export function findObjectLiteralsWithStringProperty(
  files: readonly ConcernFile[],
  propertyName: string,
  expectedValue: string,
  options: { stripComments?: boolean } = {},
): MatchedDeclaration[] {
  const matches: MatchedDeclaration[] = [];

  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const hasMatchingProp = node.properties.some((property) => {
          if (!ts.isPropertyAssignment(property)) return false;
          const key =
            ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text
              : null;
          if (key !== propertyName) return false;
          const value = unwrapExpression(property.initializer);
          return (
            (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) &&
            value.text === expectedValue
          );
        });
        if (hasMatchingProp) {
          assertCompleteNode(
            file.sourceFile,
            node,
            `${file.relativePath}:${propertyName}="${expectedValue}"`,
          );
          matches.push({
            file,
            name: `${propertyName}:${expectedValue}`,
            node,
            text: getNodeText(file.sourceFile, node, options),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sourceFile);
  }

  return matches;
}

type ConcernImportBinding =
  | { kind: "named"; targetFile: ConcernFile; exportedName: string }
  | { kind: "namespace"; targetFile: ConcernFile };

function concernImportsInFile(
  file: ConcernFile,
  filesByKey: ReadonlyMap<string, ConcernFile>,
): Map<string, ConcernImportBinding> {
  const imports = new Map<string, ConcernImportBinding>();

  for (const statement of file.sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".")) continue;
    if (statement.importClause?.isTypeOnly) continue;

    const targetKey = canonicalModuleKey(path.resolve(path.dirname(file.absolutePath), specifier));
    const targetFile = filesByKey.get(targetKey);
    if (!targetFile || targetFile === file) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const exportedName = element.propertyName?.text ?? element.name.text;
        imports.set(element.name.text, { kind: "named", targetFile, exportedName });
      }
    } else if (ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { kind: "namespace", targetFile });
    }
  }

  return imports;
}

function findUniqueExportedDeclarationInFile(
  file: ConcernFile,
  exportedName: string,
  options: { stripComments?: boolean },
): MatchedDeclaration {
  const matches: MatchedDeclaration[] = [];

  for (const statement of file.sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === exportedName &&
      hasExportModifier(statement)
    ) {
      assertCompleteNode(file.sourceFile, statement, `${file.relativePath}:${exportedName}`);
      matches.push({
        file,
        name: exportedName,
        node: statement,
        text: getNodeText(file.sourceFile, statement, options),
      });
      continue;
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportedName) continue;
        assert.ok(
          declaration.initializer,
          `${file.relativePath}:${exportedName} must have an initializer`,
        );
        assertCompleteNode(
          file.sourceFile,
          declaration.initializer,
          `${file.relativePath}:${exportedName}`,
        );
        matches.push({
          file,
          name: exportedName,
          node: statement,
          initializer: declaration.initializer,
          text: getNodeText(file.sourceFile, statement, options),
        });
      }
    }
  }

  assert.ok(
    matches.length > 0,
    `Missing delegated helper "${exportedName}" in ${file.relativePath}`,
  );
  assert.equal(
    matches.length,
    1,
    `Ambiguous delegated helper "${exportedName}" in ${file.relativePath}`,
  );
  return matches[0];
}

/**
 * Return the text of a matched declaration plus any helpers it directly calls
 * from other files in the same narrow concern file set. This lets thin Convex
 * wrappers move their bodies into `convex/lib/*` while keeping positive and
 * negative guards focused strictly on the called implementation.
 */
export function extractImplementationWithDelegatedHelpers(
  rootDeclaration: MatchedDeclaration,
  concernFiles: readonly ConcernFile[],
  options: { stripComments?: boolean; maxDepth?: number } = {},
): string {
  const maxDepth = options.maxDepth ?? 4;
  const filesByKey = new Map<string, ConcernFile>();
  for (const file of concernFiles) {
    filesByKey.set(canonicalModuleKey(file.absolutePath), file);
  }

  const visited = new Set<string>();
  const parts: string[] = [];

  const collect = (declaration: MatchedDeclaration, depth: number) => {
    const key = `${canonicalModuleKey(declaration.file.absolutePath)}#${declaration.name}`;
    if (visited.has(key)) return;
    visited.add(key);

    parts.push(getNodeText(declaration.file.sourceFile, declaration.node, options));
    if (depth >= maxDepth) return;

    const imports = concernImportsInFile(declaration.file, filesByKey);
    if (imports.size === 0) return;

    const targets: Array<{ targetFile: ConcernFile; exportedName: string }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        if (ts.isIdentifier(callee)) {
          const binding = imports.get(callee.text);
          if (binding?.kind === "named") {
            targets.push({ targetFile: binding.targetFile, exportedName: binding.exportedName });
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          const base = unwrapExpression(callee.expression);
          if (ts.isIdentifier(base)) {
            const binding = imports.get(base.text);
            if (binding?.kind === "namespace") {
              targets.push({ targetFile: binding.targetFile, exportedName: callee.name.text });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration.node);

    for (const target of targets) {
      const next = findUniqueExportedDeclarationInFile(
        target.targetFile,
        target.exportedName,
        options,
      );
      collect(next, depth + 1);
    }
  };

  collect(rootDeclaration, 0);
  return parts.join("\n");
}
