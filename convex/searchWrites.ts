/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncMediaPeople, EXPLORER_TABLES, type ExplorerChange } from "./peopleExplorer";
import type { MutationCtx } from "./_generated/server";
export const SEARCH_TABLES = ["persons", "sources", "stories", "researchTasks", "researchLog", "events", "places", "topics"] as const;
export type SearchTable = typeof SEARCH_TABLES[number];
export function searchText(table: SearchTable, row: any): string {
  switch (table) {
    case "persons": return `${row.name.given} ${row.name.surname} ${(row.alternateNames ?? []).map((n: any) => `${n.given} ${n.surname}`).join(" ")} ${(row.tags ?? []).join(" ")} ${row.fsId ?? ""}`;
    case "sources": return `${row.title} ${row.repository ?? ""} ${row.author ?? ""} ${row.type}`;
    case "stories": return `${row.title} ${(row.tags ?? []).join(" ")} ${row.type}`;
    case "researchTasks": return `${row.title} ${row.description ?? ""} ${row.notes ?? ""}`;
    case "researchLog": return `${row.summary} ${row.details ?? ""}`;
    case "events": return `${row.type} ${row.customType ?? ""} ${row.description ?? ""} ${row.place?.original ?? ""} ${row.date?.original ?? ""}`;
    case "places": return `${row.name} ${row.fullName} ${row.type} ${(row.alternateNames ?? []).map((n: any) => n.name).join(" ")}`;
    case "topics": return `${row.name} ${row.kind} ${(row.alternateNames ?? []).join(" ")} ${row.description ?? ""}`;
  }
}
export function searchFields(table: SearchTable, row: any) {
  return { searchText: searchText(table, row), ...(table === "persons" ? { nameGivenKey: row.name.given.trim().toLowerCase() } : {}) };
}
/** Keep the source-table index in the same transaction as every normal write. */
export function withSearchWrites<T extends { db: MutationCtx["db"] }>(ctx: T, changes?: ExplorerChange[]): T {
  const db = ctx.db;
  return { ...ctx, db: new Proxy(db, { get(target, key) {
    if (key === "insert") return async (table: any, value: any) => {
      const id = await target.insert(table, SEARCH_TABLES.includes(table) ? { ...value, ...searchFields(table, value) } : value);
      if (table === "media") await syncMediaPeople({db: target}, id as any);
      if (changes && EXPLORER_TABLES.includes(table)) changes.push({table, before: null, after: await target.get(id)});
      return id;
    };
    if (key === "delete") return async (...args: any[]) => {
      const id = args.length === 2 ? args[1] : args[0];
      const isMedia = !!target.normalizeId("media", id);
      const table = EXPLORER_TABLES.find(t => target.normalizeId(t as any, id));
      const before = table && changes ? await target.get(id) : null;
      const result = await (target.delete as any).apply(target, args);
      if (table && changes) changes.push({table, before, after: null});
      if (isMedia) await syncMediaPeople({db: target}, id);
      return result;
    };
    if (key === "patch" || key === "replace") return async (...args: any[]) => {
      const explicitTable = args.length === 3;
      const id = args[explicitTable ? 1 : 0], value = args[explicitTable ? 2 : 1];
      const explorerTable = changes ? EXPLORER_TABLES.find(t => target.normalizeId(t as any, id)) : undefined;
      const before = explorerTable ? await target.get(id) : null;
      const table = explicitTable ? SEARCH_TABLES.find(t => t === args[0]) : SEARCH_TABLES.find(t => target.normalizeId(t, id));
      if (!table) {
        const result = await (target[key] as any).apply(target, args);
        if (target.normalizeId("media", id)) await syncMediaPeople({db: target}, id);
        if (explorerTable && changes) changes.push({table: explorerTable, before, after: await target.get(id)});
        return result;
      }
      const old = key === "patch" ? await target.get(id) : {};
      if (old === null) return (target[key] as any).apply(target, args);
      const updated = { ...value, ...searchFields(table, { ...old, ...value }) };
      const result = await (target[key] as any).apply(target, explicitTable ? [table, id, updated] : [id, updated]);
      if (explorerTable && changes) changes.push({table: explorerTable, before, after: await target.get(id)});
      return result;
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }) };
}
