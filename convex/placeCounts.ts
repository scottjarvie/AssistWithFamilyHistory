/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { counterShard } from "./vaultCounts";
export type DirectPlace = {owner: string; placeId: Id<"places">; kind: "events"|"citations"|"context"|"research"; year?: number};
export function directPlaces(ctx: Pick<QueryCtx,"db">, table: string, row: any): DirectPlace[] {
  if (!row?.vaultOwnerId || row.archivedAt !== undefined) return [];
  let id: Id<"places"> | null = null;
  let kind: DirectPlace["kind"] = "events";
  if (table === "events") id = row.place?.placeId ?? null;
  else if (table === "citationLinks" && row.targetType === "place") {id = ctx.db.normalizeId("places", row.targetId); kind="citations";}
  else if (table === "historicalContext") {id=row.placeId??null;kind="context";}
  else if (table === "researchLog" && row.entityType === "place" && row.entityId) {id=ctx.db.normalizeId("places",String(row.entityId));kind="research";}
  if (!id) return [];
  return [{owner:row.vaultOwnerId,placeId:id,kind,...(table==="events"&&typeof row.date?.year==="number"?{year:row.date.year}:{})}];
}
async function delta(ctx:Pick<MutationCtx,"db">,owner:string,placeId:Id<"places">,id:string,keys:string[],amount:number) {
  const shard=counterShard(id);
  const old=await ctx.db.query("placeCounterShards").withIndex("by_place_shard",q=>q.eq("vaultOwnerId",owner).eq("placeId",placeId).eq("shard",shard)).unique();
  const counts:Record<string,number>={...old?.counts};
  for(const key of keys) counts[key]=(counts[key]??0)+amount;
  if(Object.values(counts).some(n=>n<0||!Number.isSafeInteger(n)))throw new Error("Invalid place counter; source transaction rolled back");
  if(old) await ctx.db.patch(old._id,{counts}); else await ctx.db.insert("placeCounterShards",{vaultOwnerId:owner,placeId,shard,counts});
}
export async function syncDirectPlaces(ctx:Pick<MutationCtx,"db">,id:string,old:DirectPlace[],next:DirectPlace[]) {
  if(JSON.stringify(old)===JSON.stringify(next))return;
  for(const [rows,amount] of [[old,-1],[next,1]] as const)for(const item of rows)await delta(ctx,item.owner,item.placeId,id,[item.kind,...(item.year===undefined?[]:[`year:${item.year}`])],amount);
}
async function changeMediaRef(ctx:Pick<MutationCtx,"db">,owner:string,placeId:Id<"places">,mediaId:Id<"media">,amount:number) {
  const old=await ctx.db.query("placeMediaMembers").withIndex("by_place_media",q=>q.eq("vaultOwnerId",owner).eq("placeId",placeId).eq("mediaId",mediaId)).unique();
  const refs=(old?.refs??0)+amount;
  if(refs<0)throw new Error("Invalid place media membership");
  const media=await ctx.db.get(mediaId);
  const active=refs>0&&!!media&&media.vaultOwnerId===owner&&media.archivedAt===undefined;
  const orderKey=`${(media?._creationTime??0).toFixed(6).padStart(24,"0")}:${mediaId}`;
  if(!!old?.active!==active)await delta(ctx,owner,placeId,String(mediaId),["media"],active?1:-1);
  if(refs===0){if(old)await ctx.db.delete(old._id);return;}
  const value={vaultOwnerId:owner,placeId,mediaId,refs,active,orderKey};
  if(old)await ctx.db.patch(old._id,value);else await ctx.db.insert("placeMediaMembers",value);
}
/** Only accepted explicit media/place Connections contribute. Proposed/rejected
 * links stay research material and text mentions never become count members. */
export async function syncPlaceMediaConnection(ctx:Pick<MutationCtx,"db">,id:string,row:any) {
  const old=await ctx.db.query("placeMediaConnectionEdges").withIndex("by_connection",q=>q.eq("connectionId",id)).unique();
  const pair=row?.state==="accepted"&&row.archivedAt===undefined?(row.from.kind==="media"&&row.to.kind==="place"?{media:row.from.id,place:row.to.id}:row.to.kind==="media"&&row.from.kind==="place"?{media:row.to.id,place:row.from.id}:null):null;
  const mediaId=pair?ctx.db.normalizeId("media",pair.media):null;
  const placeId=pair?ctx.db.normalizeId("places",pair.place):null;
  const next=mediaId&&placeId?{vaultOwnerId:row.vaultOwnerId,placeId,mediaId}:null;
  if(old&&next&&old.vaultOwnerId===next.vaultOwnerId&&old.placeId===next.placeId&&old.mediaId===next.mediaId)return;
  if(old){await changeMediaRef(ctx,old.vaultOwnerId,old.placeId,old.mediaId,-1);await ctx.db.delete(old._id);}
  if(next){await changeMediaRef(ctx,next.vaultOwnerId,next.placeId,next.mediaId,1);await ctx.db.insert("placeMediaConnectionEdges",{connectionId:id,...next});}
}
export async function refreshMediaAvailability(ctx:Pick<MutationCtx,"db">,id:string) {
  const mediaId=ctx.db.normalizeId("media",id);
  if(!mediaId)return;
  const media=await ctx.db.get(mediaId);
  const members=await ctx.db.query("placeMediaMembers").withIndex("by_media",q=>q.eq("mediaId",mediaId)).collect();
  for(const member of members){
    const active=!!media&&media.vaultOwnerId===member.vaultOwnerId&&media.archivedAt===undefined;
    if(active===member.active)continue;
    await delta(ctx,member.vaultOwnerId,member.placeId,id,["media"],active?1:-1);
    await ctx.db.patch(member._id,{active});
  }
}
export async function placeTotals(ctx:Pick<QueryCtx,"db">,owner:string,placeId:Id<"places">) {
  const rows=await ctx.db.query("placeCounterShards").withIndex("by_place_shard",q=>q.eq("vaultOwnerId",owner).eq("placeId",placeId)).collect();
  const counts:Record<string,number>={events:0,citations:0,media:0,context:0,research:0};
  for(const row of rows)for(const[key,n]of Object.entries(row.counts))counts[key]=(counts[key]??0)+n;
  const years=Object.keys(counts).filter(key=>key.startsWith("year:")&&counts[key]>0).map(key=>Number(key.slice(5)));
  return {counts,firstYear:years.length?Math.min(...years):null,lastYear:years.length?Math.max(...years):null};
}
