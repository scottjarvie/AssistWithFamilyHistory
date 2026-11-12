import {readFileSync} from "node:fs";
import {getHeapStatistics} from "node:v8";
import {describe,it,expect,vi,afterEach} from "vitest";
import {ConvexError} from "convex/values";
import {NextRequest} from "next/server";
import {sha256Hex} from "./evidenceB2";
import {finalizeEvidenceFile, type EvidenceVerificationStore} from "./evidenceFinalize";
import {audioContainerError,voiceNoteTooLongError,validateAudioContainer} from "../../convex/lib/media/audio";
import {mediaUploadError} from "./uploadContract";
import {mintPlaybackCapability,permitsPlayback} from "./playbackCapability";
const mocks=vi.hoisted(()=>({mutation:vi.fn(),action:vi.fn()}));
vi.mock("@/lib/convex/server",()=>({getAuthedConvexClient:async()=>mocks,isConvexConfigured:()=>true,getConvexRuntimeIssue:()=>({title:"Unavailable",statusCode:500})}));
vi.mock("@/lib/vault/server",()=>({getVaultAccessContext:async()=>({vaultOwnerId:"synthetic-owner"})}));
import {POST as upload} from "../../app/api/media/upload/route";
import {GET as playback} from "../../app/api/media/[mediaId]/file/route";
const formats={webm:"audio/webm",ogg:"audio/ogg",mp4:"audio/mp4",aac:"audio/aac",mp3:"audio/mpeg",wav:"audio/wav",flac:"audio/flac"};
function request(bytes:Uint8Array,type:string,voice=false){const form=new FormData();form.set("file",new File([bytes as BlobPart],"tone",{type}));if(voice)form.set("audioKind","voicenote");return new NextRequest("https://example.test/api/media/upload",{method:"POST",body:form});}
function store(bytes:Uint8Array,type:string):EvidenceVerificationStore{return {config:{bucket:"synthetic",bucketClass:"private",environment:"development"},head:async()=>({versionId:"v1",sizeBytes:bytes.length,contentType:type}),read:async()=>bytes,readRange:async(_k,_v,o,l)=>bytes.subarray(o,o+l),digest:async()=>({sha256:sha256Hex(bytes),sizeBytes:bytes.length,head:bytes.subarray(0,64*1024)}),put:vi.fn(),deleteVersion:vi.fn()};}
const finish=(bytes:Uint8Array,type:string,extra={})=>finalizeEvidenceFile({store:store(bytes,type),objectKey:"synthetic",declaredContentType:type,declaredSizeBytes:bytes.length,expectedSha256:sha256Hex(bytes),...extra});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();mocks.mutation.mockReset();mocks.action.mockReset();});
describe("audio originals",()=>{
 for(const [extension,type] of Object.entries(formats)) {
 const bytes=new Uint8Array(readFileSync(`lib/media/fixtures/audio/tone.${extension}`));
 it(`keeps complete ${extension} and refuses damaged bytes through both transports`,async()=>{
  expect((await finish(bytes,type)).original.contentType).toBe(type);
  for(const bad of [bytes.subarray(0,12),bytes.subarray(0,bytes.length-3)]) {
   await expect(finish(bad,type)).rejects.toBeInstanceOf(ConvexError);
   mocks.mutation.mockResolvedValueOnce({created:true,uploadUrl:"https://storage.example.test",maxVoiceNoteSeconds:600}).mockResolvedValueOnce({});
   const response=await upload(request(bad,type));const data=await response.json();
   expect(response.status).toBe(415);expect(data.code).toMatch(/AUDIO/);expect(mediaUploadError(data)).toBe(data.message);
   expect(mocks.mutation).toHaveBeenCalledTimes(2);mocks.mutation.mockReset();
  }
  mocks.mutation.mockResolvedValueOnce({created:true,storageId:"synthetic-storage",maxVoiceNoteSeconds:600}).mockResolvedValueOnce({mediaId:"synthetic-media"});
  expect((await upload(request(bytes,type))).status).toBe(200);
 });
 }
 for(const [name,type,code] of [["video.webm","audio/webm","AUDIO_HAS_VIDEO"],["vorbis.ogg","audio/ogg","UNSUPPORTED_AUDIO_TYPE"]])it(`refuses ${name} with a specific sentence`,async()=>{
  const bytes=new Uint8Array(readFileSync(`lib/media/fixtures/audio/${name}`));
  await expect(finish(bytes,type)).rejects.toMatchObject({data:{code}});
  mocks.mutation.mockResolvedValueOnce({created:true}).mockResolvedValueOnce({});
  expect(await (await upload(request(bytes,type))).json()).toMatchObject({code});
 });
 it("new upload server accepts legacy backend receipts without changing arguments",async()=>{
  const bytes=new Uint8Array(readFileSync("lib/media/fixtures/audio/tone.wav"));
  mocks.mutation.mockResolvedValueOnce({created:true,storageId:"synthetic"}).mockResolvedValueOnce({mediaId:"synthetic"});
  expect((await upload(request(bytes,"audio/wav"))).status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("mimeType");expect(mocks.mutation.mock.calls[0][1]).not.toHaveProperty("audioKind");
 });
 it("preserves the existing video upload path",async()=>{
  mocks.mutation.mockResolvedValueOnce({created:true,storageId:"synthetic"}).mockResolvedValueOnce({mediaId:"synthetic"});
  expect((await upload(request(new Uint8Array([1,2,3]),"video/webm"))).status).toBe(200);
  expect(mocks.mutation.mock.calls[1][1]).toMatchObject({mimeType:"video/webm",type:"video"});
 });
 it("uses measured duration for voice limits",async()=>{
  const bytes=new Uint8Array(readFileSync("lib/media/fixtures/audio/tone.wav"));
  await expect(finish(bytes,"audio/wav",{audioKind:"voicenote",maxVoiceNoteSeconds:0.01})).rejects.toMatchObject({data:{code:"AUDIO_TOO_LONG"}});
  mocks.mutation.mockResolvedValueOnce({created:true,maxVoiceNoteSeconds:0.01}).mockResolvedValueOnce({});
  expect(await (await upload(request(bytes,"audio/wav",true))).json()).toMatchObject({code:"AUDIO_TOO_LONG"});
 });
 it("keeps bounded reads near the original ceiling",async()=>{
  const size=512*1024*1024;const header=new Uint8Array(readFileSync("lib/media/fixtures/audio/tone.wav"));
  // A virtual PCM file avoids allocating a second original in this process.
  const bytes=new Uint8Array(44);bytes.set(new TextEncoder().encode("RIFF"));new DataView(bytes.buffer).setUint32(4,size-8,true);bytes.set(new TextEncoder().encode("WAVEfmt "),8);
  const view=new DataView(bytes.buffer);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);bytes.set(new TextEncoder().encode("data"),36);view.setUint32(40,size-44,true);
  let max=0;const result=await validateAudioContainer({size,read:async(offset,length)=>{max=Math.max(max,length);const chunk=new Uint8Array(length);if(offset<44)chunk.set(bytes.subarray(offset,Math.min(44,offset+length)));return chunk;}},"audio/wav");
  expect(result.valid).toBe(true);expect(max).toBeLessThanOrEqual(65536);expect(getHeapStatistics().used_heap_size).toBeLessThan(128*1024*1024);expect(header.length).toBeGreaterThan(44);
 });
 it("live reader preserves final sentences and existing fallbacks",()=>{
  for(const refusal of [audioContainerError("invalid-container"),audioContainerError("unsupported-type"),audioContainerError("video-track"),voiceNoteTooLongError(700,600)])expect(mediaUploadError({...refusal,error:refusal.message})).toBe(refusal.message);
  expect(mediaUploadError({error:"Temporary failure"})).toBe("Temporary failure");expect(mediaUploadError(null)).toBe("The file could not be added.");expect(mediaUploadError({success:true})).toBe("The file could not be added.");
 });
 it("scopes short-lived capabilities",()=>{vi.stubEnv("CLERK_SECRET_KEY","synthetic-test-key");const token=mintPlaybackCapability("a","b",0);expect(permitsPlayback(token,"a","b",1)).toBe(true);expect(permitsPlayback(token,"a","b",300000)).toBe(false);expect(permitsPlayback(token,"other","b",1)).toBe(false);});
 for(const [range,status] of [["bytes=1-2",206],["bytes=99-",416],["bytes=1-2,4-5",200],["nonsense",200]] as const)it(`streams ${range}`,async()=>{
 mocks.action.mockResolvedValue({url:"https://storage.example.test",mimeType:"audio/wav",sizeBytes:5});
 vi.stubGlobal("fetch",vi.fn(async()=>new Response("ab",{status:status===206?206:200,headers:status===206?{"Content-Range":"bytes 1-2/5"}:{}})));
 const response=await playback(new NextRequest("https://example.test/api/media/synthetic/file",{headers:{range}}),{params:Promise.resolve({mediaId:"synthetic"})});expect(response.status).toBe(status);expect(response.headers.get("cache-control")).toBe("private, no-store");vi.unstubAllGlobals();
 });
});
