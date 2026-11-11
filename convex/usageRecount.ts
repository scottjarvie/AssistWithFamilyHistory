import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { mediaBytes, recomputeOwner } from "./usageLimits";

/** Resumable, bounded all-account driver. Dry run writes job metadata only, never counters or files. */
export const allAccountsStep=internalMutation({args:{jobId:v.optional(v.id("usageRecountJobs")),dryRun:v.optional(v.boolean())},handler:async(ctx,a)=>{
 const id=a.jobId ?? await ctx.db.insert("usageRecountJobs",{dryRun:a.dryRun!==false,phase:0,cursor:null,accountsSeen:0,bytes:0,files:0,unknownSizeFiles:0,unattributedFiles:0,notReady:0,done:false,startedAt:Date.now()});
 const job=(await ctx.db.get(id))!;
 if(job.done)return {...job,jobId:id};
 const tables=["media","mediaUploadSessions","usageCounters","uploadReservations","usageLimitOverrides","_storage"] as const;
 if(job.phase<tables.length){
  const table=tables[job.phase];
  const page=table==="_storage"?await ctx.db.system.query("_storage").paginate({cursor:job.cursor,numItems:100}):await ctx.db.query(table).paginate({cursor:job.cursor,numItems:100});
  let accountsSeen=job.accountsSeen,bytes=job.bytes,files=job.files,unknownSizeFiles=job.unknownSizeFiles,unattributedFiles=job.unattributedFiles;
  for(const row of page.page){
   const ownerId="ownerId" in row?row.ownerId:"vaultOwnerId" in row?row.vaultOwnerId:undefined;
   if(ownerId && !(await ctx.db.query("usageRecountOwners").withIndex("by_job_owner",q=>q.eq("jobId",id).eq("ownerId",ownerId)).unique())){await ctx.db.insert("usageRecountOwners",{jobId:id,ownerId});accountsSeen++;}
   if("sha256" in row && "size" in row){
    const media=await ctx.db.query("media").withIndex("by_storage",q=>q.eq("storageId",row._id)).first();
    const reservation=await ctx.db.query("uploadReservations").withIndex("by_storage",q=>q.eq("storageId",row._id)).first();
    if(!media&&!reservation){unattributedFiles++;files++;bytes+=row.size;}
   }else if("type" in row){
    const stored=row.storageId?await ctx.db.system.get(row.storageId):null;
    const count=(row.storageId?1:0)+(row.b2Original?1+Object.keys(row.b2Renditions ?? {}).length:0)+(row.replacedB2Files ?? []).reduce((n,x)=>n+1+Object.keys(x.renditions ?? {}).length,0);
    files+=count;
    bytes+=mediaBytes(row)-(row.storageId?row.sizeBytes ?? 0:0)+(stored?.size ?? 0);
    if(row.storageId&&!stored)unknownSizeFiles++;
    if(!ownerId)unattributedFiles+=count;
   }else if("orphanedBytes" in row && row.orphanedBytes){bytes+=row.orphanedBytes;files++;if(!ownerId)unattributedFiles++;}
  }
  await ctx.db.patch(id,{accountsSeen,bytes,files,unknownSizeFiles,unattributedFiles,cursor:page.isDone?null:page.continueCursor,phase:job.phase+(page.isDone?1:0)});
 }else if(job.phase===tables.length){
  if(job.dryRun)await ctx.db.patch(id,{done:true});
  else {
   const page=await ctx.db.query("usageRecountOwners").withIndex("by_job_owner",q=>q.eq("jobId",id)).paginate({cursor:job.cursor,numItems:1});
   const owner=page.page[0];
   const result=owner?await recomputeOwner(ctx,owner.ownerId):{done:true};
   if(result.done)await ctx.db.patch(id,{cursor:page.isDone?null:page.continueCursor,phase:job.phase+(page.isDone?1:0)});
  }
 }else if(job.phase===tables.length+1){
  const page=await ctx.db.query("usageCounters").paginate({cursor:job.cursor,numItems:100});
  await ctx.db.patch(id,{notReady:job.notReady+page.page.filter(r=>!r.ready).length,cursor:page.isDone?null:page.continueCursor,phase:job.phase+(page.isDone?1:0)});
 }else{
  if(job.notReady||job.unknownSizeFiles||job.unattributedFiles)throw new Error("Backfill incomplete: unresolved owners, sizes or counters");
  const settings=await ctx.db.query("usageLimitSettings").withIndex("by_key",q=>q.eq("key","site")).unique();
  if(settings)await ctx.db.patch(settings._id,{backfillCompletedAt:Date.now()});
  else await ctx.db.insert("usageLimitSettings",{key:"site",enforcement:"off",backfillCompletedAt:Date.now(),updatedAt:Date.now(),updatedBy:"internal-backfill"});
  await ctx.db.patch(id,{done:true});
 }
 return {...(await ctx.db.get(id))!,jobId:id};
}});

/** Size-only repair for legacy Convex originals; B2 exact manifests already require sizes. */
export const repairConvexSizesPage=internalMutation({args:{cursor:v.union(v.string(),v.null())},handler:async(ctx,a)=>{
 const page=await ctx.db.query("media").paginate({cursor:a.cursor,numItems:100});let repaired=0,unknownSizeFiles=0;
 for(const row of page.page){if(!row.storageId)continue;const stored=await ctx.db.system.get(row.storageId);if(!stored){unknownSizeFiles++;continue;}if(row.sizeBytes!==stored.size){await ctx.db.patch(row._id,{sizeBytes:stored.size});repaired++;if(row.vaultOwnerId){const counter=await ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",row.vaultOwnerId!)).unique();if(counter)await ctx.db.patch(counter._id,{revision:counter.revision+1});}}}
 return {repaired,unknownSizeFiles,cursor:page.continueCursor,isDone:page.isDone};
}});
