/**
 * The 5,000-person whole-tree import proof (`pnpm test:tree-import-5k`).
 *
 * convex-test answers every query by walking every document in every table,
 * so a test that builds a 100,000-row vault is quadratic and takes hours.
 * Real Convex uses real indexes and is not affected. This config keeps the
 * real handlers and the real convex-test engine, and only teaches its
 * in-memory store to keep the ids of each table in a set, so a query walks one
 * table instead of the whole database. Nothing else in convex-test changes,
 * and the ordinary `pnpm test:convex` run does not use this.
 */
import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";

function perTableDocumentIndex(): Plugin {
  const replacements: Array<[string, string]> = [
    [
      "    _documents = {};\n",
      "    _documents = {};\n    __tableIds = new Map();\n    __idsFor(table) { let ids = this.__tableIds.get(table); if (!ids) { ids = new Set(); this.__tableIds.set(table, ids); } return ids; }\n",
    ],
    [
      "const ids = new Set(Object.keys(this._documents).filter(isInTable));",
      "const ids = new Set(this.__idsFor(tableName));",
    ],
    [
      "                    delete this._documents[_id];",
      "                    delete this._documents[_id];\n                    this.__idsFor(tableNameFromId(_id)).delete(_id);",
    ],
    [
      "                    this._documents[_id] = write;",
      "                    this._documents[_id] = write;\n                    this.__idsFor(tableNameFromId(_id)).add(_id);",
    ],
  ];
  return {
    name: "convex-test-per-table-document-index",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").includes("convex-test/dist/index.js")) return null;
      let next = code.replace(/\r\n/g, "\n");
      for (const [from, to] of replacements) {
        if (!next.includes(from)) throw new Error(`convex-test changed shape; update vitest.treeimport.config.ts (${from.trim()})`);
        next = next.replace(from, to);
      }
      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  plugins: [perTableDocumentIndex()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "edge-runtime",
    include: ["convex/treeImport.test.ts"],
    env: { TREE_IMPORT_FULL: "1" },
    testTimeout: 7_200_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
