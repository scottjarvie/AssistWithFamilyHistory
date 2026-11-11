import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api,internal} from "./_generated/api";
const modules=import.meta.glob("./**/*.ts");
const OWNER="user_synthetic_owner",OTHER="user_synthetic_other",GUEST="guest_synthetic",ISSUER="https://identity.example.test";
const setup=()=>convexTest(schema,modules);
type Test=ReturnType<typeof setup>;
beforeEach(()=>{vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN",ISSUER);vi.stubEnv("TRUST_BOUNDARY_MODE","shadow");vi.stubEnv("TRUST_BOUNDARY_SUPER_ADMIN_IDS","");});
afterEach(()=>vi.unstubAllEnvs());
const person=(t:Test,subject=OWNER)=>t.withIdentity({subject,issuer:ISSUER});
const blob=(t:Test,size=5)=>t.run(ctx=>ctx.storage.store(new Blob(["x".repeat(size)])));
const counter=(t:Test,ownerId=OWNER)=>t.run(ctx=>ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",ownerId)).unique());
async function settings(t:Test){await t.run(ctx=>ctx.db.insert("usageLimitSettings",{key:"site",enforcement:"on",backfillCompletedAt:1,planStoredBytes:{free:1000,pro:1000},updatedAt:0,updatedBy:"synthetic"}));}
async function start(t:Test,operationId:string,sizeBytes=5,owner=OWNER){return person(t,owner).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:owner,operationId,sizeBytes,attemptId:operationId});}
const args=(storageId:Awaited<ReturnType<typeof blob>>,owner=OWNER)=>({vaultOwnerId:owner,storageId,title:"Invented scan",type:"document" as const,mimeType:"text/plain",sizeBytes:5});
const stage=(t:Test,operationId:string,storageId:Awaited<ReturnType<typeof blob>>)=>person(t).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:OWNER,operationId,attemptId:operationId,storageId});
const cancel=(t:Test,operationId:string)=>person(t).mutation(api.vaultMutations.cancelMediaUpload,{vaultOwnerId:OWNER,operationId,attemptId:operationId});
const reservation=(t:Test,operationId:string)=>t.run(ctx=>ctx.db.query("uploadReservations").filter(q=>q.eq(q.field("operationId"),operationId)).unique());

test.each(["shadow","enforce"])("replacement refuses a foreign media row without changing either counter or blob in %s",async mode=>{
 vi.stubEnv("TRUST_BOUNDARY_MODE",mode);const t=setup();await settings(t);
 await person(t).mutation(api.vaultMutations.attachMediaFile,args(await blob(t,30)));
 const otherBlob=await blob(t,40),saved=await person(t,OTHER).mutation(api.vaultMutations.attachMediaFile,args(otherBlob,OTHER));
 const before=await counter(t),otherBefore=await counter(t,OTHER),mediaBefore=await t.run(ctx=>ctx.db.get(saved.mediaId));
 await expect(person(t).mutation(api.vaultMutations.attachMediaFile,{...args(await blob(t,1)),mediaId:saved.mediaId})).rejects.toThrow(/reference_owner_mismatch/);
 expect(await counter(t)).toEqual(before);expect(await counter(t,OTHER)).toEqual(otherBefore);
 expect(await t.run(ctx=>ctx.db.get(saved.mediaId))).toEqual(mediaBefore);
 expect((await t.run(ctx=>ctx.db.system.get(otherBlob)))?.size).toBe(40);
});

test("legacy guest migration transfers only moved stored bytes atomically and preserves readiness",async()=>{
 const t=setup();await settings(t);
 await person(t).mutation(api.vaultMutations.attachMediaFile,args(await blob(t)));
 await person(t,GUEST).mutation(api.vaultMutations.attachMediaFile,args(await blob(t,7),GUEST));
 await person(t,OTHER).mutation(api.vaultMutations.attachMediaFile,args(await blob(t,9),OTHER));
 await t.run(async ctx=>{
  const media=await ctx.db.query("media").withIndex("by_owner",q=>q.eq("vaultOwnerId",GUEST)).unique();await ctx.db.patch(media!._id,{sizeBytes:999});
  await ctx.db.insert("mediaUploadSessions",{vaultOwnerId:GUEST,ref:"synthetic-session",sourceKind:"migration",state:"failed",operationId:"synthetic",requestHash:"synthetic",title:"Invented scan",fileName:"invented.txt",personIds:[],declaredContentType:"text/plain",declaredSizeBytes:3,expectedSha256:"synthetic",objectKey:"synthetic",relayTokenHash:"synthetic",createdAt:0,expiresAt:0,orphanedBytes:3});
  const c=await ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",GUEST)).unique();await ctx.db.patch(c!._id,{storedBytes:10,ready:false});
 });
 await t.mutation(internal.usageLimits.recomputeStep,{ownerId:OWNER});
 const targetBefore=await counter(t),sourceBefore=await counter(t,GUEST),otherBefore=await counter(t,OTHER);
 expect(await person(t).mutation(api.vaultMigration.migrateGuestVault,{fromVaultOwnerId:GUEST,toVaultOwnerId:OWNER})).toMatchObject({total:2,perTable:{media:1,mediaUploadSessions:1}});
 expect(await counter(t)).toMatchObject({storedBytes:15,ready:targetBefore!.ready,revision:targetBefore!.revision+1});
 expect(await counter(t,GUEST)).toMatchObject({storedBytes:0,ready:false,revision:sourceBefore!.revision+1});
 expect(await counter(t,OTHER)).toEqual(otherBefore);
 expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:OWNER})).toMatchObject({done:false,restarts:1});
 expect(await t.run(ctx=>ctx.db.query("media").withIndex("by_owner",q=>q.eq("vaultOwnerId",GUEST)).collect())).toEqual([]);
 expect((await t.run(ctx=>ctx.db.query("mediaUploadSessions").unique()))?.vaultOwnerId).toBe(OWNER);
 const countersBeforeRetry=await t.run(ctx=>ctx.db.query("usageCounters").collect());
 expect(await person(t).mutation(api.vaultMigration.migrateGuestVault,{fromVaultOwnerId:GUEST,toVaultOwnerId:OWNER})).toMatchObject({total:0});
 expect(await t.run(ctx=>ctx.db.query("usageCounters").collect())).toEqual(countersBeforeRetry);
});

test("one pending operation owns a staged blob, including at attach",async()=>{
 const t=setup();await settings(t);const id=await blob(t);await start(t,"first");await start(t,"second");await stage(t,"first",id);
 await expect(stage(t,"second",id)).rejects.toThrow(/another pending upload/);
 await expect(person(t).mutation(api.vaultMutations.attachMediaFile,args(id))).rejects.toThrow(/another pending upload/);
 await expect(person(t).mutation(api.vaultMutations.attachMediaFile,{...args(id),operationId:"second"})).rejects.toThrow(/another pending upload/);
 expect((await reservation(t,"second"))?.storageId).toBeUndefined();
 await cancel(t,"second");expect((await t.run(ctx=>ctx.db.system.get(id)))?.size).toBe(5);
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...args(id),operationId:"first"});
 expect(await counter(t)).toMatchObject({storedBytes:5,reservedBytes:0,inFlight:0});
});

test.each(["expire","cancel"])("%s preserves another live hold on a legacy shared blob and its upload can finish",async cleanup=>{
 const t=setup();await settings(t);const id=await blob(t);await start(t,"first");await start(t,"second");await stage(t,"first",id);
 await t.run(async ctx=>{const first=await ctx.db.query("uploadReservations").filter(q=>q.eq(q.field("operationId"),"first")).unique();const second=await ctx.db.query("uploadReservations").filter(q=>q.eq(q.field("operationId"),"second")).unique();await ctx.db.patch(first!._id,{expiresAt:0});await ctx.db.patch(second!._id,{storageId:id});});
 if(cleanup==="expire")expect(await t.action(internal.usageLimits.expireReservations,{})).toEqual({released:1,failed:0});else await cancel(t,"first");
 expect((await t.run(ctx=>ctx.db.system.get(id)))?.size).toBe(5);
 expect(await reservation(t,"first")).toMatchObject({status:"released"});expect(await reservation(t,"second")).toMatchObject({status:"reserved"});
 expect(await counter(t)).toMatchObject({storedBytes:0,reservedBytes:5,inFlight:1});
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...args(id),operationId:"second"});
 expect(await counter(t)).toMatchObject({storedBytes:5,reservedBytes:0,inFlight:0});
});

test("cancel preserves a saved media blob while releasing the obsolete hold",async()=>{
 const t=setup();await settings(t);const id=await blob(t);await start(t,"old");await stage(t,"old",id);
 const mediaId=await t.run(ctx=>ctx.db.insert("media",{vaultOwnerId:OWNER,storageId:id,title:"Invented saved scan",type:"document",personIds:[],createdAt:0,updatedAt:0}));
 await cancel(t,"old");expect((await t.run(ctx=>ctx.db.system.get(id)))?.size).toBe(5);
 expect((await t.run(ctx=>ctx.db.get(mediaId)))?.storageId).toBe(id);
 expect(await counter(t)).toMatchObject({reservedBytes:0,inFlight:0});
});

test("expiry rolls back a failing row's delete and still commits an unrelated row",async()=>{
 const t=setup();await settings(t);const badBlob=await blob(t,3),goodBlob=await blob(t,4);
 await start(t,"bad",3);await stage(t,"bad",badBlob);
 await start(t,"good",4,OTHER);await person(t,OTHER).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:OTHER,operationId:"good",attemptId:"good",storageId:goodBlob});
 await t.run(async ctx=>{
  const c=await ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",OWNER)).unique();
  const {_id:unusedId,_creationTime:unusedTime,...duplicate}=c!;void unusedId;void unusedTime;
  await ctx.db.insert("usageCounters",duplicate);
  for(const row of await ctx.db.query("uploadReservations").collect())await ctx.db.patch(row._id,{expiresAt:0});
 });
 // The bad row deletes first, then its duplicate counter makes release fail.
 expect(await t.action(internal.usageLimits.expireReservations,{})).toEqual({released:1,failed:1});
 expect((await t.run(ctx=>ctx.db.system.get(badBlob)))?.size).toBe(3);
 expect(await reservation(t,"bad")).toMatchObject({status:"reserved"});
 expect(await t.run(ctx=>ctx.db.system.get(goodBlob))).toBeNull();
 expect(await reservation(t,"good")).toMatchObject({status:"released"});
 expect(await counter(t,OTHER)).toMatchObject({reservedBytes:0,inFlight:0});
 expect((await reservation(t,"bad"))?.expiryFailureAt).toEqual(expect.any(Number));
 await t.run(async ctx=>{const r=await ctx.db.query("uploadReservations").filter(q=>q.eq(q.field("operationId"),"bad")).unique();await ctx.db.patch(r!._id,{expiryFailureAt:123});});
 expect(await t.action(internal.usageLimits.expireReservations,{})).toEqual({released:0,failed:1});
 expect((await reservation(t,"bad"))?.expiryFailureAt).toBe(123);
});


test.each([false,true])("same-blob reattach is a replay and leaves room for another upload; fresh operation=%s",async freshOperation=>{
 const t=setup();await settings(t);
 await t.run(async ctx=>{const site=await ctx.db.query("usageLimitSettings").unique();await ctx.db.patch(site!._id,{planStoredBytes:{free:10,pro:10}});});
 const id=await blob(t),saved=await person(t).mutation(api.vaultMutations.attachMediaFile,args(id));
 const mediaBefore=await t.run(ctx=>ctx.db.get(saved.mediaId)),before=await counter(t);
 if(freshOperation)await start(t,"repeat");
 const replay=await person(t).mutation(api.vaultMutations.attachMediaFile,{...args(id),mediaId:saved.mediaId,title:"Ignored replay edit",...(freshOperation?{operationId:"repeat"}:{})});
 expect(replay).toMatchObject({mediaId:saved.mediaId,created:false,storage:{usedBytes:5,remainingBytes:5}});
 expect(await counter(t)).toMatchObject({storedBytes:5,reservedBytes:0,inFlight:0,revision:before!.revision});
 expect(await t.run(ctx=>ctx.db.get(saved.mediaId))).toEqual(mediaBefore);
 expect((await t.run(ctx=>ctx.db.system.get(id)))?.size).toBe(5);
 if(freshOperation)expect(await reservation(t,"repeat")).toMatchObject({status:"released"});
 expect(await start(t,"next")).toMatchObject({created:true});
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...args(await blob(t)),operationId:"next"});
 expect(await counter(t)).toMatchObject({storedBytes:10,reservedBytes:0,inFlight:0});
});

test("expiry carries one cutoff through every scheduled page while the clock advances",async()=>{
 vi.useFakeTimers();
 try{
  const before=Date.now(),t=setup();await settings(t);await start(t,"expired-0",1);
  await t.run(async ctx=>{
   const first=await ctx.db.query("uploadReservations").unique();await ctx.db.patch(first!._id,{expiresAt:before-1});
   for(let i=1;i<250;i++)await ctx.db.insert("uploadReservations",{ownerId:OWNER,operationId:`expired-${i}`,bytes:1,day:first!.day,source:"web",status:"reserved",expiresAt:before-1});
   await ctx.db.insert("uploadReservations",{ownerId:OWNER,operationId:"later",bytes:1,day:first!.day,source:"web",status:"reserved",expiresAt:before+1});
   const c=await ctx.db.query("usageCounters").unique();await ctx.db.patch(c!._id,{reservedBytes:251,inFlight:251,dayUploadBytes:251});
  });
  expect(await t.action(internal.usageLimits.expireReservations,{})).toEqual({released:100,failed:0});
  const scheduled=await t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toHaveLength(1);expect(scheduled[0].args).toEqual([{cursor:expect.any(String),before}]);
  vi.setSystemTime(before+60_000);
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers());
  const rows=await t.run(ctx=>ctx.db.query("uploadReservations").collect());
  expect(rows.filter(row=>row.status==="released")).toHaveLength(250);
  expect(await reservation(t,"later")).toMatchObject({status:"reserved"});
  expect(await counter(t)).toMatchObject({storedBytes:0,reservedBytes:1,inFlight:1});
 }finally{vi.useRealTimers();}
});
