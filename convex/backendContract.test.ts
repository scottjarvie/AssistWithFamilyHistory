import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import http from "./http";
import schema from "./schema";
import { FAMILY_HISTORY_CONTROL_TOOLS, FAMILY_HISTORY_TOOLS } from "../lib/mcp/catalog";

const modules = import.meta.glob<Record<string, unknown>>([
  "./**/*.ts", "!./_generated/**", "!./**/*.test.ts", "!./**/*.d.ts",
]);

test("registered Convex function names, kinds, visibility and HTTP routes", async () => {
  const definitions = await Promise.all(Object.entries(modules).map(async ([path, load]) => {
    const modulePath = path.slice(2, -3);
    return Object.entries(await load()).flatMap(([name, value]) => {
      if (typeof value !== "function") return [];
      const fn = value as { isPublic?: boolean; isInternal?: boolean; isQuery?: boolean; isMutation?: boolean; isAction?: boolean };
      if (!fn.isPublic && !fn.isInternal) return [];
      const visibility = fn.isPublic ? "public" : "internal";
      const kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : fn.isAction ? "action" : "unknown";
      expect(kind, `${modulePath}:${name}`).not.toBe("unknown");
      return [`${modulePath}:${name} ${visibility} ${kind}`];
    });
  }));
  const functions = definitions.flat().sort();
  expect(functions).toContain("vaultReads:getOwnedMediaFile public action");
  expect(functions).toMatchSnapshot();
  expect(http.getRoutes().map(([path, method]) => `${method} ${path}`)).toMatchSnapshot();
});

test("Convex schema validators and indexes by table", () => {
  // Convex uses this runtime serializer when deploying the schema.
  const serializable = schema as unknown as { export(): string };
  const exported: { schemaValidation: boolean; tables: { tableName: string }[] } = JSON.parse(serializable.export());
  const tables = exported.tables.map(table => `${table.tableName} ${createHash("sha256").update(JSON.stringify(table)).digest("hex")}`).sort();
  expect({ schemaValidation: exported.schemaValidation, tables }).toMatchSnapshot();
});

test("connector tool listings and compatibility aliases", () => {
  expect({
    listed: [...FAMILY_HISTORY_CONTROL_TOOLS, ...FAMILY_HISTORY_TOOLS].map(tool => tool.name),
    aliases: FAMILY_HISTORY_TOOLS.flatMap(tool => tool.alias ? [`${tool.alias} → ${tool.name}`] : []),
  }).toMatchSnapshot();
});
