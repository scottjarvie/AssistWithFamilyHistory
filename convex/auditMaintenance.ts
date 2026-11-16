import type {MutationCtx} from "./_generated/server";
import {placeTotals} from "./placeCounts";
import {syncCount} from "./vaultCounts";
/** Run after context membership deltas, using the underlying central writer.
 * The place flag, source ledger and exact 32-shard counter commit together. */
export async function refreshPlaceAudit(ctx:Pick<MutationCtx,"db">, id:string, coveredOwner?:string) {
 const placeId=ctx.db.normalizeId("places",id);
 const place=placeId?await ctx.db.get(placeId):null;
 if(!place)return;
 const totals=coveredOwner===place.vaultOwnerId?{counts:{context:1}}:place.vaultOwnerId?await placeTotals(ctx,place.vaultOwnerId,place._id):null;
 const auditWithoutContext=(totals?.counts.context??0)===0;
 if(place.auditWithoutContext!==auditWithoutContext) {
  await ctx.db.patch(place._id,{auditWithoutContext});
  await syncCount(ctx,"places",id,{...place,auditWithoutContext});
 }
}
