// @vitest-environment node
import { expect, test } from "vitest";
import ts from "typescript";
import { EXPLORER_TABLES } from "../../convex/peopleExplorer";

/** Check actual ID/table types, including dynamic generic writers and either patch signature. */
test("source-table writes cannot bypass the central mutation builders", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const problems: string[] = [];
  const tables = (type: ts.Type): string[] => {
    if (type.isUnion()) return type.types.flatMap(tables);
    if (type.isStringLiteral()) return [type.value];
    const brand = type.getProperty("__tableName");
    if (brand) return tables(checker.getTypeOfSymbolAtLocation(brand, brand.valueDeclaration ?? program.getSourceFiles()[0]));
    return ["<unknown>"];
  };
  for (const file of program.getSourceFiles()) {
    const name = file.fileName.replaceAll("\\", "/");
    if (!name.includes("/convex/") || /\.(test|spec)\.ts$/.test(name) || name.includes("/_generated/") || name.endsWith("/searchServer.ts")) continue;
    const raw = file.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith("/_generated/server") && !node.importClause?.isTypeOnly && node.importClause?.namedBindings && (ts.isNamespaceImport(node.importClause.namedBindings) || (ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some(s => !s.isTypeOnly && ["mutation", "internalMutation"].includes(s.propertyName?.text ?? s.name.text)))));
    if (!raw) continue;
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && checker.getTypeAtLocation(node.expression.expression).getProperty("normalizeId") && checker.getTypeAtLocation(node.expression.expression).getProperty("query") && ["insert", "patch", "replace", "delete"].includes(node.expression.name.text)) {
        const arg = node.arguments[node.arguments.length === 3 ? 1 : 0];
        if (arg) {
          const names = tables(checker.getTypeAtLocation(arg));
          if (names.includes("<unknown>") || names.some(n => EXPLORER_TABLES.includes(n))) problems.push(`${name}:${file.getLineAndCharacterOfPosition(node.pos).line + 1} ${names.join("|")}`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(file);
  }
  expect(problems, "Use searchServer builders for projection source writes").toEqual([]);
}, 60_000);
