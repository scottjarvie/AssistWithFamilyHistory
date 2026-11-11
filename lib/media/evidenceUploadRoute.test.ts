import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {ConvexError} from "convex/values";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({mutation:vi.fn()}));
vi.mock("@/lib/convex/server",()=>({getAuthedConvexClient:async()=>({mutation:mocks.mutation}),isConvexConfigured:()=>true,getConvexRuntimeIssue:()=>({title:"Unavailable",description:"Synthetic",statusCode:500})}));
vi.mock("@/lib/vault/server",()=>({getVaultAccessContext:async()=>({vaultOwnerId:"user_synthetic_route"})}));
import {POST} from "../../app/api/media/upload/route";
import {mediaUploadError} from "./uploadContract";
import {usageLimitError,checkFileSize} from "../../convex/lib/usageLimits/core";
beforeEach(()=>mocks.mutation.mockReset());afterEach(()=>vi.unstubAllEnvs());
function request(){const body=new FormData();body.set("file",new File(["scan"],"invented.txt",{type:"text/plain"}));return new NextRequest("https://site.example.test/api/media/upload",{method:"POST",body});}
it("L1/44: FILE_TOO_LARGE is a readable string through the actual route and browser reader",async()=>{const refusal=checkFileSize("web",4,2)!;mocks.mutation.mockRejectedValueOnce(new ConvexError(refusal));const response=await POST(request());const result=await response.json();expect(result).toMatchObject({code:"FILE_TOO_LARGE",error:refusal.message});expect(mediaUploadError(result)).toBe(refusal.message);});
it("L1: the actual route retains structured USAGE_LIMIT_REACHED and the reader localizes its reset",async()=>{vi.stubEnv("TZ","America/Phoenix");const refusal=usageLimitError({limit:"uploadsPerDay",unit:"uploads",used:1,cap:1,requested:1,remaining:0,resetsAt:"2026-11-12T00:00:00Z"},{timeZone:"UTC"});mocks.mutation.mockRejectedValueOnce(new ConvexError({code:"usage_limit_reached",message:refusal.message,usage:refusal}));const result=await (await POST(request())).json();expect(result).toMatchObject({code:"USAGE_LIMIT_REACHED",remaining:0,error:refusal.message});expect(mediaUploadError(result)).toBe(usageLimitError(refusal,{timeZone:"America/Phoenix"}).message);expect(mediaUploadError(result)).not.toBe(refusal.message);});
it("L3: an in-progress replay never calls cancellation",async()=>{mocks.mutation.mockResolvedValueOnce({created:false,busy:true,uploadUrl:""});expect((await POST(request())).status).toBe(409);expect(mocks.mutation).toHaveBeenCalledTimes(1);});
