import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import {planFor,summaryFor,limitsFor,assertWriteBatch} from "./usageLimits";
import {ownerReady,formatBytes} from "./lib/usageLimits/core";
const modules=import.meta.glob("./**/*.ts");
const owner="user_synthetic_allowance",admin="user_synthetic_operator",issuer="https://identity.example.test";
beforeEach(()=>{vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN",issuer);vi.stubEnv("TRUST_BOUNDARY_SUPER_ADMIN_IDS",admin);vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");});
afterEach(()=>vi.unstubAllEnvs());
const setup=()=>convexTest(schema,modules);
const person=(t:ReturnType<typeof setup>,subject=owner,extra={})=>t.withIdentity({subject,issuer,...extra});
async function settings(t:ReturnType<typeof setup>,extra={}){await t.run(ctx=>ctx.db.insert("usageLimitSettings",{key:"site",enforcement:"on",backfillCompletedAt:1,planStoredBytes:{free:20},updatedAt:0,updatedBy:admin,...extra}));}
async function blob(t:ReturnType<typeof setup>,bytes=5){return t.run(ctx=>ctx.storage.store(new Blob(["a".repeat(bytes)])));}
async function start(t:ReturnType<typeof setup>,operationId="upload-one",sizeBytes=5,attemptId="attempt-one"){return person(t).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:owner,operationId,sizeBytes,attemptId});}
async function attach(t:ReturnType<typeof setup>,operationId:string,storageId:Awaited<ReturnType<typeof blob>>){return person(t).mutation(api.vaultMutations.attachMediaFile,{vaultOwnerId:owner,operationId,storageId,title:"Invented scan",type:"document",mimeType:"text/plain",sizeBytes:999});}
const numbers=(t:ReturnType<typeof setup>)=>t.run(ctx=>ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",owner)).unique());
test("B1: Convex administrator list decides Pro and admin access without a Next allowlist stub",async()=>{
 const t=setup();expect(planFor(admin)).toBe("pro");expect(planFor(owner)).toBe("free");
 await person(t,admin).mutation(api.usageLimits.adminSetSiteLimits,{limits:{planStoredBytes:{pro:30}},reason:"Synthetic policy"});
 expect(await person(t,admin).action(api.usageLimits.adminOverview,{})).toMatchObject({site:{planStoredBytes:{pro:30}}});
});
test("B2: every allowance door rejects administrator AI claims",async()=>{
 const t=setup();const ai=person(t,admin,{client_id:"invented-client",scope:"family_history:write"});
 const counterId=await t.run(ctx=>ctx.db.insert("usageCounters",{ownerId:owner,storedBytes:0,reservedBytes:0,inFlight:0,hourKey:"",hourUploads:0,dayKey:"",dayUploads:0,dayUploadBytes:0,dayDownloadBytes:0,ready:true,revision:0,updatedAt:0}));
 for(const call of [()=>ai.mutation(api.usageLimits.adminSetSiteLimits,{limits:{},enforcement:"on",reason:"Synthetic"}),()=>ai.mutation(api.usageLimits.adminSetPersonLimits,{counterId,limits:{storedBytesPerUser:1},reason:"Synthetic"}),()=>ai.action(api.usageLimits.adminOverview,{}),()=>ai.action(api.usageLimits.ownerStorage,{})])await expect(call()).rejects.toThrow(/website person session required/);
 expect(await t.run(ctx=>ctx.db.query("usageLimitSettings").first())).toBeNull();
});
test("S1/N1: legacy start closes when on and shadow never discloses another account",async()=>{
 const t=setup();await settings(t);
 await expect(person(t).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:owner})).rejects.toThrow(/declaration required/);
 vi.stubEnv("TRUST_BOUNDARY_MODE","shadow");await expect(person(t).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:"user_other_synthetic",sizeBytes:1,operationId:"foreign"})).rejects.toThrow(/Owner mismatch/);
});
test("S6/L3: browser start/stage/attach/replay/replace/cancel and shared-attempt safety",async()=>{
 const t=setup();await settings(t);expect((await start(t)).created).toBe(true);
 const concurrent=await start(t,"upload-one",5,"attempt-two");expect(concurrent).toMatchObject({created:false,busy:true,uploadUrl:""});
 const id=await blob(t);await person(t).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:owner,operationId:"upload-one",attemptId:"attempt-one",storageId:id});
 await person(t).mutation(api.vaultMutations.cancelMediaUpload,{vaultOwnerId:owner,operationId:"upload-one",attemptId:"attempt-two"});expect(await t.run(ctx=>ctx.db.system.get(id))).not.toBeNull();
 await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});
 const saved=await attach(t,"upload-one",id);expect((await numbers(t))?.storedBytes).toBe(5);expect(saved.storage?.usedBytes).toBe(5);
 expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner})).toMatchObject({done:false,restarts:1});
 await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});
 expect((await start(t)).mediaId).toBe(saved.mediaId);expect((await numbers(t))?.storedBytes).toBe(5);
 await start(t,"replacement",6);const replacement=await blob(t,6);
 await person(t).mutation(api.vaultMutations.attachMediaFile,{vaultOwnerId:owner,operationId:"replacement",storageId:replacement,mediaId:saved.mediaId,title:"Invented replacement",type:"document",mimeType:"text/plain",sizeBytes:999});
 expect((await numbers(t))?.storedBytes).toBe(6);expect(await t.run(ctx=>ctx.db.system.get(id))).toBeNull();
 expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner})).toMatchObject({done:false,restarts:2});
 await start(t,"cancel",2);const abandoned=await blob(t,2);await person(t).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:owner,operationId:"cancel",attemptId:"attempt-one",storageId:abandoned});await person(t).mutation(api.vaultMutations.cancelMediaUpload,{vaultOwnerId:owner,operationId:"cancel",attemptId:"attempt-one"});expect(await t.run(ctx=>ctx.db.system.get(abandoned))).toBeNull();expect((await numbers(t))?.reservedBytes).toBe(0);
});
test("N4/S6: expired retry reopens before sweep; FILE_TOO_LARGE and remaining use exact shapes",async()=>{
 const t=setup();await settings(t);await start(t);await t.run(async ctx=>{const r=await ctx.db.query("uploadReservations").first();await ctx.db.patch(r!._id,{expiresAt:0});});expect((await start(t)).created).toBe(true);expect((await numbers(t))?.dayUploads).toBe(1);
 await expect(start(t,"no-room",20)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED",requested:20,remaining:15}}});
 await person(t,admin).mutation(api.usageLimits.adminSetSiteLimits,{limits:{maxFileBytes:{web:2}},reason:"Synthetic cap"});await expect(start(t,"too-large",3)).rejects.toMatchObject({data:{code:"FILE_TOO_LARGE",max:2,got:3}});
});
test("L5/core: unknown owners have no numbers; recorded backfill readies an empty owner and enforces cap",async()=>{
 const t=setup();expect(await t.run(ctx=>summaryFor(ctx,owner))).toEqual({ready:false,plan:"free",line:"Storage is still being counted."});await settings(t,{planStoredBytes:{free:0}});expect(await person(t).action(api.usageLimits.ownerStorage,{})).toMatchObject({ready:true,usedBytes:0,remainingBytes:0});await expect(start(t)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED",remaining:0}}});expect(ownerReady(null,{backfillCompletedAt:1})).toBe(true);expect(formatBytes(999_999_990)).not.toContain("1000 MB");
});
test("L7/N8/52/53: patch tables preserve unrelated entries and every accepted edit is audited",async()=>{
 const t=setup(),a=person(t,admin);await settings(t,{planStoredBytes:{free:2,pro:20},maxFileBytes:{web:10,image:20}});
 await a.mutation(api.usageLimits.adminSetSiteLimits,{limits:{planStoredBytes:{pro:30},maxFileBytes:{web:null}},reason:"Synthetic adjustment"});
 const row=await t.run(ctx=>ctx.db.query("usageLimitSettings").first());expect(row).toMatchObject({planStoredBytes:{free:2,pro:30},maxFileBytes:{image:20}});
 const before=row?.planStoredBytes;await a.mutation(api.usageLimits.adminSetSiteLimits,{limits:{uploadsPerHour:400},reason:"Synthetic count"});expect((await t.run(ctx=>ctx.db.query("usageLimitSettings").first()))?.planStoredBytes).toEqual(before);
 expect((await t.run(ctx=>ctx.db.query("usageLimitAudit").collect())).map(r=>r.field)).toEqual(expect.arrayContaining(["planStoredBytes","maxFileBytes","uploadsPerHour"]));
 await expect(a.mutation(api.usageLimits.adminSetSiteLimits,{limits:{maxFileBytes:{image:21*1024*1024}},reason:"Unsupported ceiling"})).rejects.toThrow(/transport ceiling/);
});
test("S4: existing advertised write and transcription sizes survive storage enforcement",async()=>{const t=setup();await settings(t);await t.run(async ctx=>{const effective=await limitsFor(ctx,owner);expect(effective.limits.mcpBatchMaxBytes).toBe(256*1024);expect(effective.limits.mcpBatchMaxItems).toBeGreaterThanOrEqual(50);await assertWriteBatch(ctx,owner,"synthetic-records",50,60000);await assertWriteBatch(ctx,owner,"synthetic-transcript",1,100000);});});
test("S2/22/40: aged unclaimed blob is found; dry-run and delete preserve referenced and staged objects",async()=>{
 vi.useFakeTimers();try{const t=setup();const orphan=await blob(t),kept=await blob(t);await t.run(ctx=>ctx.db.insert("media",{vaultOwnerId:owner,storageId:kept,type:"document",title:"Invented retained scan",personIds:[],createdAt:0,updatedAt:0}));vi.advanceTimersByTime(26*60*60*1000);
 const dry=await t.mutation(internal.usageLimits.sweepUnclaimedStorage,{cursor:null});expect(dry.candidates.map(x=>x.storageId)).toContain(orphan);expect(dry.candidates.map(x=>x.storageId)).not.toContain(kept);expect(await t.run(ctx=>ctx.db.system.get(orphan))).not.toBeNull();
 await t.mutation(internal.usageLimits.sweepUnclaimedStorage,{cursor:null,dryRun:false});expect(await t.run(ctx=>ctx.db.system.get(orphan))).toBeNull();expect(await t.run(ctx=>ctx.db.system.get(kept))).not.toBeNull();}finally{vi.useRealTimers();}
});
test("L10/14/19: resumable all-owner count reports missing attribution and refuses completion",async()=>{
 const t=setup();await t.run(async ctx=>{for(let i=0;i<105;i++)await ctx.db.insert("media",{vaultOwnerId:i===104?undefined:owner,storageId:await ctx.storage.store(new Blob(["x"])),type:"document",title:"Invented scan",personIds:[],createdAt:0,updatedAt:0});});
 let job=await t.mutation(internal.usageRecount.allAccountsStep,{});for(let n=0;n<20&&!job.done;n++)job=await t.mutation(internal.usageRecount.allAccountsStep,{jobId:job.jobId});expect(job).toMatchObject({done:true,accountsSeen:1,bytes:105,unattributedFiles:1});expect(await numbers(t)).toBeNull();
 let backfill=await t.mutation(internal.usageRecount.allAccountsStep,{dryRun:false});let blocked=false;for(let n=0;n<25&&!backfill.done;n++){try{backfill=await t.mutation(internal.usageRecount.allAccountsStep,{jobId:backfill.jobId});}catch(e){expect(String(e)).toContain("Backfill incomplete");blocked=true;break;}}expect(blocked).toBe(true);expect(await t.run(ctx=>ctx.db.query("usageLimitSettings").first())).toBeNull();
});

import {seedGrant} from "../lib/mcp/testSupport";
import {EvidenceB2Store} from "../lib/media/evidenceB2";
function storageEnvironment(){vi.stubEnv("MEDIA_STORAGE_ENVIRONMENT","development");for(const kind of ["PRIVATE","PUBLIC"])for(const [key,value] of Object.entries({ENDPOINT:"https://storage.example.test",REGION:"synthetic",BUCKET:`synthetic-${kind}`,KEY_ID:"invented",APPLICATION_KEY:"invented"}))vi.stubEnv(`B2_${kind}_${key}`,value);}
async function aiSession(t:ReturnType<typeof setup>,ref="synthetic-session",sizeBytes=5,sha256="a".repeat(64)){
 const personId=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Invented",surname:"Ancestor"},sex:"unknown",living:false,researchStatus:"basic",createdAt:0,updatedAt:0}));
 const principal={subject:owner,issuer,clientId:"synthetic-media-client",scopes:[]};const grantId=await seedGrant(t,{vaultOwnerId:owner,issuer,clientId:principal.clientId,scopes:["family_history:evidence:write"]});
 const args={principal,grantId,operationId:ref,uploadRef:ref};
 const planned=await t.mutation(internal.mediaEvidenceControl.planMcpEvidenceUpload,{...args,requestHash:"synthetic",relayTokenHash:"synthetic",objectKey:`synthetic/${ref}/original`,expiresAt:Date.now()+60000,input:{personId:String(personId),title:"Invented scan",fileName:"invented.jpg",contentType:"image/jpeg",sizeBytes,sha256}});
 return {args,planned};
}
function manifest(slot:string){return {bucketClass:"private" as const,bucketName:"synthetic-private",objectKey:`synthetic/synthetic-session/${slot}`,versionId:`invented-${slot}`,sha256:"a".repeat(64),contentType:"image/jpeg",sizeBytes:5,metadataClean:slot!=="original",verifiedAt:"2026-11-11T00:00:00Z"};}
const metadataProposal={temporal:{uploadTime:"2026-11-11T00:00:00Z"},extractedFromOriginalSha256:"a".repeat(64),extractedAt:"2026-11-11T00:00:00Z",reversible:true as const,decision:"pending" as const};
test.each([false,true])("S3/S6: real AI plan/finish counts original and copies; pre-deploy=%s",async legacy=>{
 const t=setup();await settings(t);const {args}=await aiSession(t);
 expect((await numbers(t))?.reservedBytes).toBe(5);
 const jobs=await t.run(ctx=>ctx.db.system.query("_scheduled_functions").collect());expect(jobs.length).toBeGreaterThan(0);
 if(legacy)await t.run(async ctx=>{const r=await ctx.db.query("uploadReservations").first();await ctx.db.delete(r!._id);const c=await ctx.db.query("usageCounters").first();await ctx.db.patch(c!._id,{reservedBytes:0,inFlight:0});});
 await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});
 await t.mutation(internal.mediaEvidenceControl.claimSessionForFinish,args);
 const {operationId:unused,...commitArgs}=args;void unused;
 const result=await t.mutation(internal.mediaEvidenceControl.commitMcpEvidenceUpload,{...commitArgs,original:manifest("original"),tiny:manifest("tiny"),medium:manifest("medium"),large:manifest("large"),metadataProposal});expect(result).not.toHaveProperty("refusal");expect((await numbers(t))?.storedBytes).toBe(20);expect((await numbers(t))?.reservedBytes).toBe(0);
 expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner})).toMatchObject({done:false,restarts:1});
 const replay=await t.mutation(internal.mediaEvidenceControl.commitMcpEvidenceUpload,{...commitArgs,original:manifest("original"),tiny:manifest("tiny"),medium:manifest("medium"),large:manifest("large"),metadataProposal});expect(replay.replayed).toBe(true);expect((await numbers(t))?.storedBytes).toBe(20);
});
test("S5/S6/N5/51: AI cleanup scheduled atomically; failed delete retains bytes and expiry releases only on success",async()=>{
 const t=setup();storageEnvironment();await settings(t);const {args}=await aiSession(t);await t.mutation(internal.mediaEvidenceControl.recordOrphanedCopies,{uploadRef:args.uploadRef,bytes:7});await t.run(async ctx=>{const row=await ctx.db.query("mediaUploadSessions").first();await ctx.db.patch(row!._id,{expiresAt:0});});
 await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});
 const deletion=vi.spyOn(EvidenceB2Store.prototype,"deleteAllVersions").mockRejectedValue(new Error("Synthetic provider failure"));
 try{await expect(t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload,{uploadRef:args.uploadRef,attempt:7})).rejects.toThrow(/Synthetic provider failure/);expect(await numbers(t)).toMatchObject({reservedBytes:5,storedBytes:7});
 deletion.mockResolvedValue();await t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload,{uploadRef:args.uploadRef});expect(await numbers(t)).toMatchObject({reservedBytes:0,storedBytes:0});expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner})).toMatchObject({done:false,restarts:1});}finally{deletion.mockRestore();}
});
test("L10/14: successful all-account backfill records completion and readies subsequent empty accounts",async()=>{
 const t=setup();await t.run(ctx=>ctx.db.insert("media",{vaultOwnerId:owner,storageId:undefined,type:"document",title:"Invented reference",personIds:[],createdAt:0,updatedAt:0}));let job=await t.mutation(internal.usageRecount.allAccountsStep,{dryRun:false});for(let i=0;i<25&&!job.done;i++)job=await t.mutation(internal.usageRecount.allAccountsStep,{jobId:job.jobId});expect(job.done).toBe(true);expect((await t.run(ctx=>ctx.db.query("usageLimitSettings").first()))?.backfillCompletedAt).toBeGreaterThan(0);expect(await t.run(ctx=>summaryFor(ctx,"user_new_synthetic"))).toMatchObject({ready:true,usedBytes:0});
});
test("owner-only meter returns this person's counters; overrides contain only personal edits",async()=>{const t=setup();await settings(t);await start(t);const a=await person(t).action(api.usageLimits.ownerStorage,{}),b=await person(t,"user_other_synthetic").action(api.usageLimits.ownerStorage,{});expect(a?.usedBytes).toBe(5);expect(b?.usedBytes).toBe(0);const counter=(await numbers(t))!;await person(t,admin).mutation(api.usageLimits.adminSetPersonLimits,{counterId:counter._id,limits:{uploadsPerHour:3},reason:"Synthetic edit"});const patch=await t.run(ctx=>ctx.db.query("usageLimitOverrides").first());expect(patch).not.toHaveProperty("planStoredBytes");expect(patch).not.toHaveProperty("maxFileBytes");});
test("missing storage metadata counts as zero and leaves a recounted owner ready",async()=>{const t=setup();const id=await blob(t);await t.run(async ctx=>{await ctx.db.insert("media",{vaultOwnerId:owner,storageId:id,type:"document",title:"Invented dangling reference",personIds:[],createdAt:0,updatedAt:0});await ctx.storage.delete(id);});for(let i=0;i<2;i++)await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});expect((await numbers(t))?.ready).toBe(true);});

import sharp from "sharp";
import {sha256Hex} from "../lib/media/evidenceB2";
test("S6/42/43: real AI finish generates and counts copies without charging extra uploads or applying a copy policy cap",async()=>{
 const t=setup();storageEnvironment();await settings(t,{planStoredBytes:{free:100000},maxFileBytes:{copy:0}});
 const bytes=new Uint8Array(await sharp({create:{width:8,height:8,channels:3,background:"#888888"}}).jpeg().toBuffer());
 const {args}=await aiSession(t,"synthetic-real",bytes.byteLength,sha256Hex(bytes));
 const head=vi.spyOn(EvidenceB2Store.prototype,"head").mockResolvedValue({versionId:"synthetic-original",sizeBytes:bytes.byteLength,contentType:"image/jpeg"});
 const read=vi.spyOn(EvidenceB2Store.prototype,"read").mockResolvedValue(bytes);
 const put=vi.spyOn(EvidenceB2Store.prototype,"put").mockImplementation(async input=>({versionId:`synthetic-${input.objectKey.split("/").at(-1)}`,sha256:sha256Hex(input.bytes)}));
 try{const result=await t.action(internal.mediaEvidenceStorage.finishMcpEvidenceUpload,{principal:args.principal,grantId:args.grantId,operationId:args.operationId,requestHash:"synthetic",input:{uploadRef:args.uploadRef}});expect(result).toMatchObject({status:"pending_person_review"});expect(put).toHaveBeenCalledTimes(3);const total=bytes.byteLength+put.mock.calls.reduce((n,[input])=>n+input.bytes.byteLength,0);expect(await numbers(t)).toMatchObject({storedBytes:total,reservedBytes:0,dayUploads:1,hourUploads:1,inFlight:0});}finally{head.mockRestore();read.mockRestore();put.mockRestore();}
});
test("41: a full allowance never refuses or charges the owner's streamed export",async()=>{const t=setup();await settings(t,{planStoredBytes:{free:0}});await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Invented",surname:"Export"},sex:"unknown",living:false,researchStatus:"basic",createdAt:0,updatedAt:0}));const output=await person(t).action(api.yourData.exportPage,{vaultOwnerId:owner,table:"persons",cursor:null});expect(output.rows).toHaveLength(1);expect(await numbers(t)).toBeNull();});
test("14/19/40: an unregistered system-storage blob blocks global backfill completion",async()=>{const t=setup();await blob(t);let job=await t.mutation(internal.usageRecount.allAccountsStep,{dryRun:false});let blocked=false;for(let n=0;n<25&&!job.done;n++){try{job=await t.mutation(internal.usageRecount.allAccountsStep,{jobId:job.jobId});}catch(error){expect(String(error)).toContain("Backfill incomplete");blocked=true;break;}}expect(blocked).toBe(true);expect(job.unattributedFiles).toBe(1);});
test("58/67: AI reservation matches the session and a live finish lease postpones cleanup",async()=>{const t=setup();await settings(t);const {args}=await aiSession(t);const before=await t.run(async ctx=>({r:await ctx.db.query("uploadReservations").first(),s:await ctx.db.query("mediaUploadSessions").first()}));expect(before.r?.expiresAt).toBe(before.s?.expiresAt);await t.mutation(internal.mediaEvidenceControl.claimSessionForFinish,args);const after=await t.run(async ctx=>({r:await ctx.db.query("uploadReservations").first(),s:await ctx.db.query("mediaUploadSessions").first()}));expect(after.r?.expiresAt).toBe(after.s?.expiresAt);expect(after.s!.expiresAt).toBeGreaterThan(before.s!.expiresAt);expect(await t.action(internal.mediaEvidenceStorage.cleanupMcpEvidenceUpload,{uploadRef:args.uploadRef})).toBeNull();expect((await numbers(t))?.reservedBytes).toBe(5);});
test("60: bounded size repair fills legacy metadata without changing the object",async()=>{const t=setup();const id=await blob(t,7);const rowId=await t.run(ctx=>ctx.db.insert("media",{vaultOwnerId:owner,storageId:id,type:"document",title:"Invented legacy scan",personIds:[],createdAt:0,updatedAt:0}));await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner});expect(await t.mutation(internal.usageRecount.repairConvexSizesPage,{cursor:null})).toMatchObject({repaired:1,unknownSizeFiles:0});expect(await t.mutation(internal.usageLimits.recomputeStep,{ownerId:owner})).toMatchObject({done:false,restarts:1});expect((await t.run(ctx=>ctx.db.get(rowId)))?.sizeBytes).toBe(7);expect((await t.run(ctx=>ctx.db.system.get(id)))?.size).toBe(7);});
test("61/65: admin On really refuses and the admin view uses the same batch defaults as checks",async()=>{const t=setup(),a=person(t,admin);await a.mutation(api.usageLimits.adminSetSiteLimits,{limits:{planStoredBytes:{free:0}},enforcement:"on",reason:"Synthetic policy"});await t.run(async ctx=>{const row=await ctx.db.query("usageLimitSettings").first();await ctx.db.patch(row!._id,{backfillCompletedAt:1});});await expect(start(t)).rejects.toMatchObject({data:{usage:{code:"USAGE_LIMIT_REACHED"}}});const view=await a.action(api.usageLimits.adminOverview,{}) as {site:{limits:{mcpBatchMaxItems:number}}};expect(view.site.limits.mcpBatchMaxItems).toBe((await t.run(ctx=>limitsFor(ctx,owner))).limits.mcpBatchMaxItems);});
test.each(["photo","audio","video","document","text"])("62: confirmed replacement subtraction covers %s bytes",async kind=>{const t=setup();await settings(t,{planStoredBytes:{free:10}});await start(t,"first");const saved=await attach(t,"first",await blob(t));await start(t,"second");const id=await blob(t);await person(t).mutation(api.vaultMutations.attachMediaFile,{vaultOwnerId:owner,operationId:"second",mediaId:saved.mediaId,storageId:id,title:"Invented replacement",type:kind==="text"?"document":kind as "photo"|"audio"|"video"|"document",mimeType:kind==="text"?"text/plain":`${kind}/synthetic`,sizeBytes:5});expect((await numbers(t))?.storedBytes).toBe(5);expect((await start(t,"third")).created).toBe(true);});

import {siteDefaults} from "../lib/media/siteDefaults";
import {FAMILY_HISTORY_TOOLS} from "../lib/mcp/catalog";
import {AI_STORAGE_NOTE} from "./lib/usageLimits/core";
import {EVIDENCE_RELAY_BODY_BYTES,isMultipartEvidenceUpload} from "../lib/media/evidenceStandard";
import {GET as aiGuide} from "../app/ai.txt/route";
test("L11/L12/36/55/69: upload descriptions keep their introductions, append the core note, and policy prose follows the brief",async()=>{
 const begin=FAMILY_HISTORY_TOOLS.find(t=>t.name==="family_history_begin_evidence_upload")!,finish=FAMILY_HISTORY_TOOLS.find(t=>t.name==="family_history_finish_evidence_upload")!;
 expect(begin.description).toMatch(/^Authorize one replay-safe upload/);expect(finish.description).toMatch(/^Join any uploaded parts/);
 for(const tool of [begin,finish])expect(tool.description.endsWith(AI_STORAGE_NOTE)).toBe(true);
 const guide=await aiGuide().text();expect(guide).not.toMatch(/photos up to 20 MiB|originals up to 512 MiB|make room before retrying/);expect(guide).toContain("uploadFileCaps.original");
 expect(begin.description).toContain(formatBytes(EVIDENCE_RELAY_BODY_BYTES));
 expect(begin.description).toContain("up to "+formatBytes(siteDefaults.image)+" by default");
 expect(begin.description).toContain("up to "+formatBytes(siteDefaults.original)+" by default");
 for(const kind of ["image","original"])expect(begin.description).toContain("read uploadFileCaps."+kind+" from family_history_get_brief for the current limit");
 expect(EVIDENCE_RELAY_BODY_BYTES).toBe(20*1024*1024);expect(isMultipartEvidenceUpload(EVIDENCE_RELAY_BODY_BYTES+1)).toBe(true);
});
