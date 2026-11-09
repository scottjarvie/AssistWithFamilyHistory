import {beforeEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import {NextRequest} from "next/server";
import schema from "../convex/schema";
import {api,internal} from "../convex/_generated/api";
const state=vi.hoisted(()=>({owner:"user_http_queue_A" as string|null,client:null as unknown as ReturnType<typeof convexTest>}));
vi.mock("@/lib/vault/server",()=>({getVaultAccessContext:async()=>{if(!state.owner)throw new Error("Authentication required");return {vaultOwnerId:state.owner};}}));
vi.mock("@/lib/convex/server",()=>({isConvexConfigured:()=>true,getAuthedConvexClient:async()=>state.client.withIdentity({subject:state.owner!}),getConvexRuntimeIssue:()=>({title:"Queue refusal",description:"Authentication or Queue command refused",statusCode:403})}));
import {GET,POST} from "../app/api/queue/route";
import {PATCH} from "../app/api/queue/[id]/route";
import Suggestions from "../app/suggestions/page";
const modules=import.meta.glob("../convex/**/*.ts");
beforeEach(()=>{vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");state.client=convexTest(schema,modules);state.owner="user_http_queue_A";});
const request=(path:string,body?:unknown)=>new NextRequest(`https://family.test${path}`,body?{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:undefined);

test("human HTTP routes refuse unaccepted work and anonymous accept/dismiss/edit-accept",async()=>{
 const {item}=await state.client.mutation(internal.queue.agentAddQueueItem,{principal:{ownerId:state.owner!,actorKind:"chosen_ai",actorId:"oauth-chosen-ai",credentialId:"test-ai",scopes:["queue:add","queue:suggest"]},directive:"Search a missing source",addedBy:"ai_suggestion",reason:"A gap",idempotencyKey:"http-suggestion"});
 const context={params:Promise.resolve({id:item._id})};
 const claim=await PATCH(request(`/api/queue/${item._id}`,{command:"claim",leaseMs:60000,nextStep:"Work",expectedVersion:1,idempotencyKey:"claim"}),context);expect(claim.status).not.toBe(200);
 const ordinary=await GET(request("/api/queue"));expect((await ordinary.json()).page).toHaveLength(0);
 const list=await GET(request("/api/queue?suggestions=true"));expect((await list.json()).counts.suggestions).toBe(1);
 state.owner=null;
 for(const action of ["accept","dismiss"]){const r=await PATCH(request(`/api/queue/${item._id}`,{command:"review",action,directive:"Edited",expectedVersion:1,idempotencyKey:action}),context);expect(r.status).toBe(403);}
 state.owner="user_http_queue_B";expect((await GET(request("/api/queue?suggestions=true"))).status).toBe(200);expect((await (await GET(request("/api/queue?suggestions=true"))).json()).page).toHaveLength(0);
 state.owner="user_http_queue_A";
 const accept=await PATCH(request(`/api/queue/${item._id}`,{command:"review",action:"accept",directive:"Only parish records",expectedVersion:1,idempotencyKey:"accept-edit"}),context);expect(accept.status).toBe(200);expect((await accept.json()).item).toMatchObject({directive:"Only parish records",suggestionStatus:"accepted",state:"waiting_for_your_ai"});
});
test("person POST defaults to person and legacy suggestions URL redirects",async()=>{
 const r=await POST(new NextRequest("https://family.test/api/queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({directive:"Requested research",idempotencyKey:"post"})}));expect(r.status).toBe(201);expect((await r.json()).item.addedBy).toBe("person");
 expect(()=>Suggestions()).toThrow(/NEXT_REDIRECT/);
 await expect(state.client.withIdentity({subject:state.owner!}).action(api.queue.listQueueItems,{vaultOwnerId:state.owner!,paginationOpts:{numItems:25,cursor:null}})).resolves.toMatchObject({isDone:true});
});

// Explicit website JWT issuer for synthetic person identities; never an auth bypass.
beforeEach(()=>vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://convex.test"));
