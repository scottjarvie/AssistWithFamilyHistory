import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api,internal} from "./_generated/api";
const modules=import.meta.glob("./**/*.ts");
const OWNER="user_synthetic_r2_owner",OTHER="user_synthetic_r2_other",ISSUER="https://identity.example.test";
beforeEach(()=>{vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN",ISSUER);vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");vi.stubEnv("TRUST_BOUNDARY_SUPER_ADMIN_IDS",OWNER);});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
const setup=()=>convexTest(schema,modules);
const person=(t:ReturnType<typeof setup>,subject=OWNER,claims={})=>t.withIdentity({subject,issuer:ISSUER,...claims});
async function settings(t:ReturnType<typeof setup>,cap=20){await t.run(ctx=>ctx.db.insert("usageLimitSettings",{key:"site",enforcement:"on",backfillCompletedAt:1,planStoredBytes:{free:cap,pro:cap},updatedAt:0,updatedBy:"synthetic"}));}
const blob=(t:ReturnType<typeof setup>,size=5)=>t.run(ctx=>ctx.storage.store(new Blob(["x".repeat(size)])));
const counter=(t:ReturnType<typeof setup>)=>t.run(ctx=>ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",OWNER)).unique());
async function start(t:ReturnType<typeof setup>,operationId:string,sizeBytes=5){return person(t).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:OWNER,operationId,sizeBytes,attemptId:operationId});}
async function stage(t:ReturnType<typeof setup>,operationId:string,storageId:Awaited<ReturnType<typeof blob>>){await person(t).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:OWNER,operationId,attemptId:operationId,storageId});}
const attachArgs=(storageId:Awaited<ReturnType<typeof blob>>)=>({vaultOwnerId:OWNER,storageId,title:"Invented scan",type:"document" as const,mimeType:"text/plain",sizeBytes:5});

test.each(["shadow","enforce"])("F1: unsigned guest remap cannot alter readiness, usage or ownership in %s",async mode=>{
 vi.stubEnv("TRUST_BOUNDARY_MODE",mode);const t=setup();await settings(t,5);
 await person(t).mutation(api.vaultMutations.attachMediaFile,attachArgs(await blob(t)));
 const before=await counter(t);expect(before).toMatchObject({ready:true,storedBytes:5});
 await expect(start(t,"over-cap",1)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED",remaining:0}}});
 const rowsBefore=await t.run(ctx=>ctx.db.query("usageCounters").collect());
 await expect(person(t).mutation(api.vaultMigration.migrateGuestVault,{fromVaultOwnerId:"guest_invented",toVaultOwnerId:OWNER})).rejects.toThrow(/guest_source_unverified/);
 expect(await t.run(ctx=>ctx.db.query("usageCounters").collect())).toEqual(rowsBefore);
 expect(await counter(t)).toEqual(before);
 await expect(start(t,"over-cap",1)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED",remaining:0}}});
});

test.each(["shadow","enforce"])("F2: attach refuses another owner's request and administrator AI claims in %s",async mode=>{
 vi.stubEnv("TRUST_BOUNDARY_MODE",mode);const t=setup();await settings(t);const id=await blob(t);
 await expect(person(t,OTHER).mutation(api.vaultMutations.attachMediaFile,attachArgs(id))).rejects.toThrow(/owner_mismatch/);
 await expect(person(t,OWNER,{client_id:"synthetic-ai",scope:"family_history:write"}).mutation(api.vaultMutations.attachMediaFile,attachArgs(id))).rejects.toThrow(/website person session required/);
 expect(await counter(t)).toBeNull();expect(await t.run(ctx=>ctx.db.query("media").first())).toBeNull();
 expect(await t.run(ctx=>ctx.db.system.get(id))).not.toBeNull();
});

test("F3/F5: expiry releases referenced and missing holds without blocking unrelated rows",async()=>{
 const t=setup();await settings(t);const kept=await blob(t);
 await start(t,"referenced");await stage(t,"referenced",kept);
 await person(t).mutation(api.vaultMutations.attachMediaFile,attachArgs(kept));
 const missing=await blob(t,3);await start(t,"missing",3);await stage(t,"missing",missing);
 const abandoned=await blob(t,4);await start(t,"abandoned",4);await stage(t,"abandoned",abandoned);
 await t.run(async ctx=>{await ctx.storage.delete(missing);for(const row of await ctx.db.query("uploadReservations").collect())await ctx.db.patch(row._id,{expiresAt:0});});
 expect(await t.mutation(internal.usageLimits.expireReservations,{})).toEqual({released:3,failed:0});
 expect(await t.run(ctx=>ctx.db.system.get(kept))).not.toBeNull();
 expect(await t.run(ctx=>ctx.db.system.get(abandoned))).toBeNull();
 expect(await counter(t)).toMatchObject({storedBytes:5,reservedBytes:0,inFlight:0});
 expect(await t.mutation(internal.usageLimits.expireReservations,{})).toEqual({released:0,failed:0});
});

test("F4: a blob cannot be attached twice; missing legacy objects count zero without disabling enforcement or backfill",async()=>{
 const t=setup();await settings(t);const id=await blob(t);
 const first=await person(t).mutation(api.vaultMutations.attachMediaFile,attachArgs(id));
 await expect(person(t).mutation(api.vaultMutations.attachMediaFile,attachArgs(id))).rejects.toThrow(/already attached/);
 expect(await counter(t)).toMatchObject({storedBytes:5,ready:true});
 const replacement=await blob(t,6);
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...attachArgs(replacement),mediaId:first.mediaId,sizeBytes:6});
 expect(await t.run(ctx=>ctx.db.system.get(id))).toBeNull();
 await t.run(ctx=>ctx.db.insert("media",{vaultOwnerId:OWNER,storageId:id,title:"Invented missing legacy scan",type:"document",personIds:[],sizeBytes:5,createdAt:0,updatedAt:0}));
 expect(await t.query(internal.usageLimits.dryRunPage,{ownerId:OWNER,table:"media",cursor:null})).toMatchObject({bytes:6,missingObjects:1,unknownSizeFiles:0});
 for(let n=0;n<3;n++){const result=await t.mutation(internal.usageLimits.recomputeStep,{ownerId:OWNER});if(result.done){expect(result.missingObjects).toBe(1);break;}}
 expect(await counter(t)).toMatchObject({storedBytes:6,ready:true});
 expect(await t.mutation(internal.usageRecount.repairConvexSizesPage,{cursor:null})).toMatchObject({missingObjects:1,unknownSizeFiles:0});
 let job=await t.mutation(internal.usageRecount.allAccountsStep,{dryRun:false});
 for(let n=0;n<30&&!job.done;n++)job=await t.mutation(internal.usageRecount.allAccountsStep,{jobId:job.jobId});
 expect(job).toMatchObject({done:true,missingObjects:1,unknownSizeFiles:0,notReady:0});
 await expect(start(t,"still-enforced",15)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED",remaining:14}}});
});

test("F5: an aged blob referenced only by an expired reservation survives the deleting sweep",async()=>{
 vi.useFakeTimers();const t=setup();await settings(t);const staged=await blob(t),unclaimed=await blob(t);
 await start(t,"waiting");await stage(t,"waiting",staged);vi.advanceTimersByTime(26*60*60*1000);
 const preview=await t.mutation(internal.usageLimits.sweepUnclaimedStorage,{cursor:null});
 expect(preview.candidates.map(row=>row.storageId)).toContain(unclaimed);
 expect(preview.candidates.map(row=>row.storageId)).not.toContain(staged);
 await t.mutation(internal.usageLimits.sweepUnclaimedStorage,{cursor:null,dryRun:false});
 expect(await t.run(ctx=>ctx.db.system.get(staged))).not.toBeNull();
 expect(await t.run(ctx=>ctx.db.system.get(unclaimed))).toBeNull();
 expect(await counter(t)).toMatchObject({reservedBytes:5,inFlight:1});
});
