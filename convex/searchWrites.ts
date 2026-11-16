/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncMediaPeople, EXPLORER_TABLES, type ExplorerChange } from "./peopleExplorer";
import { COUNT_TABLES, syncCount, researchOrderTime, type CountTable } from "./vaultCounts";
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
/** Called with the underlying writer so derived metadata never re-enters the adapter. */
export async function syncSourceCount(ctx: {db: MutationCtx["db"]}, table: CountTable, id: string, row: any, touch = false) {
  if (row && (table === "researchTasks" || table === "researchLog")) {
    const key = researchOrderTime(row);
    if (row.researchOrderTime !== key) await ctx.db.patch(id as any, {researchOrderTime: key});
  }
  await syncCount(ctx, table, id, row, touch);
}

const writeScopes = new WeakMap<object, {flush: () => Promise<void>}>();
/** Drain queued writes before the mutation ends; maintenance errors cannot be swallowed. */
export async function flushSearchWrites(ctx: {db: MutationCtx["db"]}) {
  await writeScopes.get(ctx.db)?.flush();
}

/** Keep the source-table index in the same transaction as every normal write. */
export function withSearchWrites<T extends { db: MutationCtx["db"] }>(ctx: T, changes?: ExplorerChange[], personsOnly = false): T {
  const db = ctx.db;
  let pending: Promise<unknown> = Promise.resolve();
  let maintenanceError: unknown;
  const serialized = <R>(write: () => Promise<R>): Promise<R> => {
    const result = pending.then(write);
    pending = result.catch(() => undefined);
    return result;
  };
  const maintain = async (table: CountTable, id: string, row: any) => {
    try { await syncSourceCount({db}, table, id, row, true); }
    catch (error) { maintenanceError = error; throw error; }
  };
  const wrapped = new Proxy(db, { get(target, key) {
    if (key === "insert") return (table: any, value: any) => serialized(async () => {
      const id = await target.insert(table, SEARCH_TABLES.includes(table) ? { ...value, ...searchFields(table, value) } : value);
      if (table === "media") await syncMediaPeople({db: target}, id as any);
      if (changes && EXPLORER_TABLES.includes(table) && (!personsOnly || table === "persons")) changes.push({table, before: null, after: await target.get(id)});
      if (COUNT_TABLES.includes(table)) await maintain(table, id, await target.get(id));
      return id;
    });
    if (key === "delete") return (...args: any[]) => serialized(async () => {
      const id = args.length === 2 ? args[1] : args[0];
      const isMedia = !!target.normalizeId("media", id);
      const table = EXPLORER_TABLES.find(t => (!personsOnly || t === "persons") && target.normalizeId(t as any, id));
      const before = table && changes ? await target.get(id) : null;
      const countTable = COUNT_TABLES.find(t => target.normalizeId(t, id));
      const result = await (target.delete as any).apply(target, args);
      if (countTable) await maintain(countTable, id, null);
      if (table && changes) changes.push({table, before, after: null});
      if (isMedia) await syncMediaPeople({db: target}, id);
      return result;
    });
    if (key === "patch" || key === "replace") return (...args: any[]) => serialized(async () => {
      const explicitTable = args.length === 3;
      const id = args[explicitTable ? 1 : 0], value = args[explicitTable ? 2 : 1];
      const countTable = COUNT_TABLES.find(t => target.normalizeId(t, id));
      const explorerTable = changes ? EXPLORER_TABLES.find(t => (!personsOnly || t === "persons") && target.normalizeId(t as any, id)) : undefined;
      const before = explorerTable ? await target.get(id) : null;
      const table = explicitTable ? SEARCH_TABLES.find(t => t === args[0]) : SEARCH_TABLES.find(t => target.normalizeId(t, id));
      if (!table) {
        const result = await (target[key] as any).apply(target, args);
        if (countTable) await maintain(countTable, id, await target.get(id));
        if (target.normalizeId("media", id)) await syncMediaPeople({db: target}, id);
        if (explorerTable && changes) changes.push({table: explorerTable, before, after: await target.get(id)});
        return result;
      }
      const old = key === "patch" ? await target.get(id) : {};
      if (old === null) return (target[key] as any).apply(target, args);
      const updated = { ...value, ...searchFields(table, { ...old, ...value }) };
      const result = await (target[key] as any).apply(target, explicitTable ? [table, id, updated] : [id, updated]);
      if (countTable) await maintain(countTable, id, await target.get(id));
      if (explorerTable && changes) changes.push({table: explorerTable, before, after: await target.get(id)});
      return result;
    });
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  writeScopes.set(wrapped, {flush: async () => {await pending; if (maintenanceError) throw maintenanceError;}});
  return {...ctx, db: wrapped};
}
