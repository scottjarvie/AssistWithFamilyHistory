import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { countsReady, ownerTableCounter } from "./vaultCounts";
import { getVaultSnapshot } from "./vault";
import { normalizeVaultOwnerId, sortByTimestampDesc } from "./vaultCore";

const status = v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done"));
export const researchPageArgs = {vaultOwnerId: v.string(), cursor: v.union(v.string(), v.null())};
type ResearchPerson = Pick<Doc<"persons">, "_id" | "fsId"> & {name: {given: string; surname: string}};
export type TaskWithPerson = Doc<"researchTasks"> & {person: ResearchPerson | null};
export type LogWithPerson = Doc<"researchLog"> & {person: ResearchPerson | null};
const personSummary = (person: Doc<"persons">): ResearchPerson => ({_id: person._id, fsId: person.fsId, name: {given: person.name.given, surname: person.name.surname}});

export type TaskPage = PaginationResult<TaskWithPerson> & {totals: Record<string, number>};
export type LogPage = PaginationResult<LogWithPerson> & {totals: Record<string, number>};

async function personForRow(ctx:QueryCtx,owner:string,id:string|undefined){
 const personId=id?ctx.db.normalizeId("persons",id):null;
 const person=personId?await ctx.db.get(personId):null;
 const bytes=person?new TextEncoder().encode(JSON.stringify(person)).byteLength:0;
 return {person:person?.vaultOwnerId===owner&&person.archivedAt===undefined?personSummary(person):null,bytes};
}
const afterKey=(cursor:string|null)=>cursor?.startsWith("r2:")?cursor.slice(3):"";
// Pages hydrate only people referenced by the returned rows, not the whole tree.
// Exactly one paginator in each query; a byte-split page may contain fewer than 50.
export const tasks = internalQuery({args: {...researchPageArgs, status: v.optional(status), search: v.optional(v.string())}, handler: async (ctx, args): Promise<TaskPage> => {
  const ready = await countsReady(ctx);
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const needle = args.search?.trim().toLowerCase();
  if (!ready) {
    const snapshot = await getVaultSnapshot(ctx, owner);
    const people = new Map(snapshot.people.map(p => [String(p._id), personSummary(p)]));
    const all = sortByTimestampDesc(snapshot.researchTasks).map(t => ({...t, person: t.personId ? people.get(String(t.personId)) ?? null : null}));
    const filtered = all.filter(t => (!args.status || t.status === args.status) && (!needle || `${t.title} ${t.description || t.type} ${t.person ? `${t.person.name.given} ${t.person.name.surname}` : ""}`.toLowerCase().includes(needle)));
    const offset = args.cursor?.startsWith("s:") ? Number(args.cursor.slice(2)) : 0;
    const totals: Record<string, number> = {active: all.length};
    for (const t of all) totals[`status:${t.status}`] = (totals[`status:${t.status}`] ?? 0) + 1;
    return {page: filtered.slice(offset, offset + 50), isDone: offset + 50 >= filtered.length, continueCursor: `s:${offset + 50}`, totals};
  }
  const range = args.status
    ? ctx.db.query("researchTasks").withIndex("by_owner_active_status_cursor", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined).eq("status", args.status!).gt("researchCursorKey",afterKey(args.cursor)))
    : ctx.db.query("researchTasks").withIndex("by_owner_active_cursor", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined).gt("researchCursorKey",afterKey(args.cursor)));
  const result = await range.paginate({cursor:null, numItems: 50, maximumRowsRead: 50, maximumBytesRead: 250_000});
  let last=afterKey(args.cursor),processed=0,used=0,payload=0;const page:TaskWithPerson[]=[];
  const people=new Map<string,Awaited<ReturnType<typeof personForRow>>>();
  for(const row of result.page){
    const id=row.personId?String(row.personId):"";
    if(used>=500_000&&id&&!people.has(id))break;
    let p=people.get(id);if(!p){p=await personForRow(ctx,owner,id||undefined);people.set(id,p);used+=p.bytes;}
    payload+=new TextEncoder().encode(JSON.stringify(p.person)).byteLength;
    page.push({...row,person:p.person});last=row.researchCursorKey!;processed++;if(payload>=500_000)break;
  }
  const counter = await ownerTableCounter(ctx, owner, "researchTasks");
  const matches = needle ? page.filter(t => `${t.title} ${t.description || t.type} ${t.person ? `${t.person.name.given} ${t.person.name.surname}` : ""}`.toLowerCase().includes(needle)) : page;
  return {page:matches,continueCursor:`r2:${last}`,isDone:processed===result.page.length&&result.isDone,totals:counter.counts};
}});
export const log = internalQuery({args: researchPageArgs, handler: async (ctx, args): Promise<LogPage> => {
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  if (!await countsReady(ctx)) {
    const snapshot = await getVaultSnapshot(ctx, owner);
    const people = new Map(snapshot.people.map(p => [String(p._id), personSummary(p)]));
    const all = sortByTimestampDesc(snapshot.researchLog);
    const offset = args.cursor?.startsWith("s:") ? Number(args.cursor.slice(2)) : 0;
    const totals: Record<string, number> = {active: all.length};
    for (const row of all) for (const key of [`activity:${row.activityType}`, `author:${row.creationProvenance?.actorKind ?? "unattributed"}`, `status:${row.status}`]) totals[key] = (totals[key] ?? 0) + 1;
    return {page: all.slice(offset, offset + 50).map(row => ({...row, person: row.entityType === "person" && row.entityId ? people.get(String(row.entityId)) ?? null : null})), isDone: offset + 50 >= all.length, continueCursor: `s:${offset + 50}`, totals};
  }
  const result = await ctx.db.query("researchLog").withIndex("by_owner_active_cursor", q => q.eq("vaultOwnerId", owner).eq("archivedAt", undefined).gt("researchCursorKey",afterKey(args.cursor)))
    .paginate({cursor:null, numItems: 50, maximumRowsRead: 50, maximumBytesRead: 250_000});
  let last=afterKey(args.cursor),processed=0,used=0,payload=0;const page:LogWithPerson[]=[];
  const people=new Map<string,Awaited<ReturnType<typeof personForRow>>>();
  for(const row of result.page){
    const id=row.entityType==="person"&&row.entityId?String(row.entityId):"";
    if(used>=500_000&&id&&!people.has(id))break;
    let p=people.get(id);if(!p){p=await personForRow(ctx,owner,id||undefined);people.set(id,p);used+=p.bytes;}
    payload+=new TextEncoder().encode(JSON.stringify(p.person)).byteLength;
    page.push({...row,person:p.person});last=row.researchCursorKey!;processed++;if(payload>=500_000)break;
  }
  const counter = await ownerTableCounter(ctx, owner, "researchLog");
  return {page,continueCursor:`r2:${last}`,isDone:processed===result.page.length&&result.isDone,totals:counter.counts};
}});

export const version = internalQuery({args: {vaultOwnerId: v.string()}, handler: async (ctx, args) => {
  const owner = normalizeVaultOwnerId(args.vaultOwnerId);
  const [persons, tasks, log] = await Promise.all((["persons", "researchTasks", "researchLog"] as const).map(table => ownerTableCounter(ctx, owner, table)));
  return {ready: await countsReady(ctx), revisions: [persons?.revision ?? 0, tasks?.revision ?? 0, log?.revision ?? 0], tasks: tasks?.counts.active ?? 0, log: log?.counts.active ?? 0};
}});
