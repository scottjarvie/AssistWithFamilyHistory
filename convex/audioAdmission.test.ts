import {readFileSync} from "node:fs";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api} from "./_generated/api";
import type {Id} from "./_generated/dataModel";
const modules=import.meta.glob("./**/*.ts");
const owner="synthetic-audio-owner",issuer="https://identity.example.test";
const setup=()=>convexTest(schema,modules);
beforeEach(()=>{vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN",issuer);vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");});
afterEach(()=>vi.unstubAllEnvs());
const person=(t:ReturnType<typeof setup>)=>t.withIdentity({subject:owner,issuer});
async function stage(t:ReturnType<typeof setup>,bytes:Uint8Array,mimeType:string,operationId="synthetic-upload") {
 await person(t).mutation(api.vaultMutations.startMediaUpload,{vaultOwnerId:owner,operationId,sizeBytes:bytes.length,mimeType});
 const storageId=await t.run(ctx=>ctx.storage.store(new Blob([bytes as BlobPart],{type:mimeType})));
 await person(t).mutation(api.vaultMutations.stageMediaUpload,{vaultOwnerId:owner,operationId,storageId});
 return {vaultOwnerId:owner,operationId,storageId};
}
const attach=(t:ReturnType<typeof setup>,target:{vaultOwnerId:string;operationId:string;storageId:Id<"_storage">},mimeType="audio/webm")=>person(t).mutation(api.vaultMutations.attachMediaFile,{...target,title:"Generated tone",type:"audio",mimeType,sizeBytes:4});
const usage=(t:ReturnType<typeof setup>)=>t.run(ctx=>ctx.db.query("usageCounters").withIndex("by_owner",q=>q.eq("ownerId",owner)).unique());
test("direct attachment of a four-byte header has no validation proof and commits nothing",async()=>{
 const t=setup();const target=await stage(t,new Uint8Array([0x1a,0x45,0xdf,0xa3]),"audio/webm");
 await expect(attach(t,target)).rejects.toMatchObject({data:{code:"INVALID_AUDIO_CONTAINER"}});
 await expect(person(t).action(api.vaultReads.validateMediaUpload,{...target,mimeType:"audio/webm"})).rejects.toMatchObject({data:{code:"INVALID_AUDIO_CONTAINER"}});
 expect(await t.run(ctx=>ctx.db.query("media").collect())).toHaveLength(0);
 expect(await usage(t)).toMatchObject({storedBytes:0,reservedBytes:4});
 await person(t).mutation(api.vaultMutations.cancelMediaUpload,{vaultOwnerId:owner,operationId:target.operationId});
 expect(await usage(t)).toMatchObject({storedBytes:0,reservedBytes:0});
});
for(const [extension,mimeType] of Object.entries({webm:"audio/webm",ogg:"audio/ogg",mp4:"audio/mp4",aac:"audio/aac",mp3:"audio/mpeg",wav:"audio/wav",flac:"audio/flac"})) {
 test(`stored ${extension} passes the real validation action and attachment mutation once`,async()=>{
  const t=setup();const bytes=new Uint8Array(readFileSync(`lib/media/fixtures/audio/tone.${extension}`));const target=await stage(t,bytes,mimeType);
  await person(t).action(api.vaultReads.validateMediaUpload,{...target,mimeType});
  const saved=await attach(t,target,mimeType);expect(await usage(t)).toMatchObject({storedBytes:bytes.length,reservedBytes:0,dayUploads:1});
  expect(await person(t).mutation(api.vaultMutations.attachMediaFile,{...target,mediaId:saved.mediaId,title:"Generated tone",type:"audio",mimeType,sizeBytes:bytes.length})).toMatchObject({mediaId:saved.mediaId,created:false});
  expect(await usage(t)).toMatchObject({storedBytes:bytes.length,dayUploads:1});
 });
}
test("validation of one object cannot authorize a second object or operation",async()=>{
 const t=setup();const bytes=new Uint8Array(readFileSync("lib/media/fixtures/audio/tone.webm"));
 const first=await stage(t,bytes,"audio/webm","first");await person(t).action(api.vaultReads.validateMediaUpload,{...first,mimeType:"audio/webm"});
 const second=await stage(t,new Uint8Array([0x1a,0x45,0xdf,0xa3]),"audio/webm","second");
 await expect(attach(t,{...first,storageId:second.storageId})).rejects.toThrow();
 await expect(attach(t,second)).rejects.toMatchObject({data:{code:"INVALID_AUDIO_CONTAINER"}});
 expect(await usage(t)).toMatchObject({storedBytes:0});
 await attach(t,first);expect(await usage(t)).toMatchObject({storedBytes:bytes.length});
});
test("an audio attachment cannot hide behind a nonaudio MIME hint",async()=>{
 const t=setup();const target=await stage(t,new Uint8Array([0x1a,0x45,0xdf,0xa3]),"audio/webm");
 await expect(person(t).mutation(api.vaultMutations.attachMediaFile,{...target,title:"Synthetic",type:"audio",mimeType:"text/plain",sizeBytes:4})).rejects.toMatchObject({data:{code:"INVALID_AUDIO_CONTAINER"}});
 expect(await usage(t)).toMatchObject({storedBytes:0});
});
test("a metadata upsert cannot relabel an attached document as audio",async()=>{
 const t=setup();const args={vaultOwnerId:owner,type:"document" as const,title:"Synthetic document",personIds:[],importKey:"synthetic-reference",mimeType:"text/plain"};
 const saved=await person(t).mutation(api.vaultMutations.upsertMedia,args);
 const target=await stage(t,new Uint8Array([1,2,3,4]),"text/plain");
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...target,mediaId:saved.mediaId,title:args.title,type:"document",mimeType:"text/plain",sizeBytes:4});
 await expect(person(t).mutation(api.vaultMutations.upsertMedia,{...args,type:"audio",mimeType:"audio/webm"})).rejects.toMatchObject({data:{code:"INVALID_AUDIO_CONTAINER"}});
 expect((await t.run(ctx=>ctx.db.get(saved.mediaId)))?.type).toBe("document");
});
test("AI claims cannot request person storage validation",async()=>{
 const t=setup();const target=await stage(t,new Uint8Array([1,2,3,4]),"audio/webm");
 await expect(t.withIdentity({subject:owner,issuer,client_id:"synthetic-client"}).action(api.vaultReads.validateMediaUpload,{...target,mimeType:"audio/webm"})).rejects.toThrow(/website person session required/);
});

test("replacement validates the new stored object and uses existing accounting",async()=>{
 const t=setup();const bytes=new Uint8Array(readFileSync("lib/media/fixtures/audio/tone.wav"));
 const first=await stage(t,bytes,"audio/wav","first");await person(t).action(api.vaultReads.validateMediaUpload,{...first,mimeType:"audio/wav"});const saved=await attach(t,first,"audio/wav");
 const next=await stage(t,bytes,"audio/wav","replacement");await person(t).action(api.vaultReads.validateMediaUpload,{...next,mimeType:"audio/wav"});
 await person(t).mutation(api.vaultMutations.attachMediaFile,{...next,mediaId:saved.mediaId,title:"Generated replacement",type:"audio",mimeType:"audio/wav",sizeBytes:bytes.length});
 expect(await usage(t)).toMatchObject({storedBytes:bytes.length,reservedBytes:0,dayUploads:2});
});
