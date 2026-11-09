/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { permittedTools } from "../lib/mcp/authorize";
import { seedGrant } from "../lib/mcp/testSupport";
import { assertSafePublication } from "../lib/stories/sensitiveInfo";
const modules=import.meta.glob("./**/*.ts");
const owner="user_publication";
const principal={subject:owner,issuer:"https://identity.example.test",clientId:"synthetic-mcp-client",scopes:[]};
async function setup() {
 const t=convexTest(schema,modules); const grantId=await seedGrant(t,{vaultOwnerId:owner,expiresAt:null});
 const personId=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Ancestor",surname:"Synthetic"},sex:"unknown",living:false,researchStatus:"in_progress",createdAt:1,updatedAt:1}));
 return {t,grantId,personId};
}
test("contact counts cover one whole batch, and secrets always refuse without echoing values",()=>{
 const text=Array.from({length:12},(_,i)=>`shop${i}@example.test`).join("\n")+"\n555-123-4567\n123 Market Street";
 expect(()=>assertSafePublication(text)).toThrow('12 email addresses, 1 phone numbers and 1 street addresses');
 expect(()=>assertSafePublication(text,{emails:11,phones:1,addresses:1})).toThrow('PUBLICATION_CONTACT_DETAILS');
 expect(assertSafePublication(text,{emails:12,phones:1,addresses:1})).toEqual({emails:12,phones:1,addresses:1});
 const secret="password=keep-this-out";
 expect(()=>assertSafePublication(secret,{emails:100,phones:100,addresses:100})).toThrow('PUBLICATION_SECRET');
 try {assertSafePublication(secret);} catch(error) {expect(String(error)).not.toContain('keep-this-out');expect(String(error)).toContain('line 1');}
});
test("AI can publish an unlisted story, edit it with acknowledgement on the first call, and unpublish with history",async()=>{
 const {t,grantId,personId}=await setup();
 const saved=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"publish",requestHash:"publish",input:{mode:"create",createKey:"story:publish",personId,type:"biography",title:"Ancestor",content:"An ordinary history.",status:"published",publicIndexing:"noindex"}});
 const story=await t.run(ctx=>ctx.db.get(saved.story.id)); expect(story).toMatchObject({status:"published",generatedBy:"ai",publicIndexing:"noindex"});
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story!.publicSlug!})).not.toBeNull();
 const updated=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"edit-public",requestHash:"edit-public",input:{mode:"update",storyId:story!._id,expectedUpdatedAt:story!.updatedAt,content:"Business: shop@example.test",publicIndexing:"index",acknowledgeContactDetails:{emails:1,phones:0,addresses:0}}});
 expect(updated.publicationContactDetails).toEqual({emails:1,phones:0,addresses:0});
 const row=await t.run(ctx=>ctx.db.get(story!._id));
 await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"unpublish",requestHash:"unpublish",input:{mode:"update",storyId:row!._id,expectedUpdatedAt:row!.updatedAt,status:"draft"}});
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story!.publicSlug!})).toBeNull();
 const events=await t.run(ctx=>ctx.db.query("storyReviewEvents").collect()); expect(events).toHaveLength(3);expect(events.every(e=>e.actorName?.includes(principal.clientId))).toBe(true);
});
test("a batch gets one aggregate acknowledgement, and refusal makes no writes",async()=>{
 const {t,grantId,personId}=await setup();
 const input={summary:"A batch",stories:[1,2].map(n=>({mode:"create",createKey:`batch:${n}`,personId,type:"biography",title:`Story ${n}`,content:`shop${n}@example.test`,status:"published"}))};
 await expect(t.mutation(internal.mcpFamilyHistory.saveCompleteResult,{principal,grantId,operationId:"batch-no-ack",requestHash:"batch-no-ack",input})).rejects.toThrow('2 email addresses');
 expect(await t.run(ctx=>ctx.db.query("stories").collect())).toHaveLength(0);
 const result=await t.mutation(internal.mcpFamilyHistory.saveCompleteResult,{principal,grantId,operationId:"batch-with-ack",requestHash:"batch-with-ack",input:{...input,acknowledgeContactDetails:{emails:2,phones:0,addresses:0}}});
 expect(result.publicationContactDetails).toEqual({emails:2,phones:0,addresses:0});expect(await t.run(ctx=>ctx.db.query("stories").collect())).toHaveLength(2);
});
test("JSON-quoted secrets refuse, and contact matches never cross lines or merge adjacent values",()=>{
 for(const text of ['{"password":"x"}', '"api_key": "private-value"', '{"access_token":\n"private-value"}']) expect(()=>assertSafePublication(text,{emails:100,phones:100,addresses:100})).toThrow('PUBLICATION_SECRET');
 const text='first@example.test second@example.test\n555-123-4567 555-234-5678\n123 Main Street 456 Side Road\n789\nOther Street\n555-123-\n4567\nthird@\nexample.test';
 expect(assertSafePublication(text,{emails:2,phones:2,addresses:2})).toEqual({emails:2,phones:2,addresses:2});
 for (const insufficient of [{emails:1,phones:2,addresses:2},{emails:2,phones:1,addresses:2},{emails:2,phones:2,addresses:1}]) expect(()=>assertSafePublication(text,insufficient)).toThrow('PUBLICATION_CONTACT_DETAILS');
 expect(()=>assertSafePublication({storageId:"unreadable"},{emails:100,phones:100,addresses:100})).toThrow('PUBLICATION_UNSCANNABLE');
});
test("stored content is scanned at its current version, never a caller's stale preview",async()=>{
 const {t,grantId,personId}=await setup();
 const storyId=await t.run(ctx=>ctx.db.insert("stories",{vaultOwnerId:owner,personId,type:"biography",title:"Stored draft",content:'{"password":"never-echo-this"}',citationIds:[],status:"draft",generatedBy:"human",createdAt:1,updatedAt:1}));
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"stored-secret",requestHash:"stored-secret",input:{mode:"update",storyId,expectedUpdatedAt:1,status:"published",acknowledgeContactDetails:{emails:100,phones:100,addresses:100}}})).rejects.toThrow('PUBLICATION_SECRET');
 await t.run(ctx=>ctx.db.patch(storyId,{content:"New body",updatedAt:2}));
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"stale-version",requestHash:"stale-version",input:{mode:"update",storyId,expectedUpdatedAt:1,status:"published"}})).rejects.toThrow('STALE_VERSION');
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"unscannable",requestHash:"unscannable",input:{mode:"update",storyId,expectedUpdatedAt:2,status:"published",content:{fileId:"not-readable"},acknowledgeContactDetails:{emails:100,phones:100,addresses:100}}})).rejects.toThrow('PUBLICATION_UNSCANNABLE');
 expect((await t.run(ctx=>ctx.db.get(storyId)))!.status).toBe('draft');
});
test.each(['single','batch','complete'] as const)("%s publishing rechecks the current power in the visibility mutation",async kind=>{
 const {t,grantId,personId}=await setup();
 // Simulate transport having already accepted the request with this grant id.
 const before=await t.query(internal.mcpGrants.describeCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId});
 await t.mutation(internal.mcpGrants.limitCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId,action:"limit",removeScopes:["family_history:story:draft"],revision:before.revision,opId:`restrict-${kind}`});
 const story={mode:"create",createKey:`power:${kind}`,personId,type:"biography",title:"Not published",content:"Safe text",status:"published"};
 const fn=kind==='single'?internal.mcpFamilyHistory.saveStoryWork:kind==='batch'?internal.mcpFamilyHistory.saveRecords:internal.mcpFamilyHistory.saveCompleteResult;
 await expect(t.mutation(fn,{principal,grantId,operationId:`publish-${kind}`,requestHash:`publish-${kind}`,input:kind==='single'?story:{summary:"Publish batch",stories:[story]}})).rejects.toThrow('SCOPE_NOT_GRANTED');
 expect(await t.run(ctx=>ctx.db.query("stories").collect())).toHaveLength(0);
});
test("blanket and extra-category acknowledgements cannot skip the exact summary",()=>{
 const text='shop@example.test';
 for (const counts of [{emails:999,phones:999,addresses:999},{emails:2,phones:0,addresses:0},{emails:1,phones:1,addresses:0}]) expect(()=>assertSafePublication(text,counts)).toThrow('1 email addresses, 0 phone numbers and 0 street addresses');
 expect(()=>assertSafePublication('No contacts',{emails:999,phones:999,addresses:999})).toThrow('0 email addresses, 0 phone numbers and 0 street addresses');
 expect(assertSafePublication(text,{emails:1,phones:0,addresses:0})).toEqual({emails:1,phones:0,addresses:0});
});
test("an active grant with all powers removed can only unpublish, with ownership and history",async()=>{
 const {t,grantId,personId}=await setup();
 const saved=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"before-limit",requestHash:"before-limit",input:{mode:"create",createKey:"unpublish-only",personId,type:"biography",title:"Public ancestor",content:"Public text",status:"published"}});
 const story=await t.run(ctx=>ctx.db.get(saved.story.id));
 const before=await t.query(internal.mcpGrants.describeCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId});
 await t.mutation(internal.mcpGrants.limitCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId,action:"limit",removeScopes:[...FAMILY_HISTORY_SCOPES],revision:before.revision,opId:"remove-every-power"});
 const resolved=await t.mutation(internal.mcpGrants.resolveForRequest,{subject:owner,issuer:principal.issuer,clientId:principal.clientId});
 expect(permittedTools(resolved,Date.now()).map(tool=>tool.name)).toEqual(["family_history_unpublish_story"]);
 const args={principal,grantId,operationId:"active-only-unpublish",requestHash:"active-only-unpublish",input:{storyId:story!._id,expectedUpdatedAt:story!.updatedAt}};
 await expect(t.mutation(internal.mcpFamilyHistory.unpublishStory,{...args,input:{...args.input,content:"Injected edit"}} as never)).rejects.toThrow(/Validator|Extra field/);
 await t.mutation(internal.mcpFamilyHistory.unpublishStory,args);
 const after=await t.run(ctx=>ctx.db.get(story!._id));expect(after).toMatchObject({status:"draft",content:story!.content});
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story!.publicSlug!})).toBeNull();
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"cannot-republish",requestHash:"cannot-republish",input:{mode:"update",storyId:story!._id,expectedUpdatedAt:after!.updatedAt,status:"published"}})).rejects.toThrow('SCOPE_NOT_GRANTED');
 const foreignId=await t.run(ctx=>ctx.db.insert("stories",{vaultOwnerId:"user_other_owner",type:"biography",title:"Foreign",content:"Foreign",status:"published",generatedBy:"human",citationIds:[],createdAt:1,updatedAt:1}));
 await expect(t.mutation(internal.mcpFamilyHistory.unpublishStory,{...args,operationId:"foreign-denied",requestHash:"foreign-denied",input:{storyId:foreignId,expectedUpdatedAt:1}})).rejects.toThrow('NOT_FOUND');
 expect((await t.run(ctx=>ctx.db.query("storyReviewEvents").collect())).at(-1)).toMatchObject({fromStatus:"published",toStatus:"draft",actorRole:"story_writer"});
});
test.each(['paused','expired','revoked'] as const)("%s grants cannot unpublish",async state=>{
 const {t,grantId,personId}=await setup();
 const storyId=await t.run(async ctx=>{
  await ctx.db.patch(grantId as never,state==='paused'?{pausedAt:1}:state==='expired'?{expiryChoice:"chosen",expiresAt:Date.now()-1}:{status:"revoked"});
  return ctx.db.insert("stories",{vaultOwnerId:owner,personId,type:"biography",title:"Public",content:"Public",status:"published",generatedBy:"human",citationIds:[],createdAt:1,updatedAt:1});
 });
 await expect(t.mutation(internal.mcpFamilyHistory.unpublishStory,{principal,grantId,operationId:`denied-${state}`,requestHash:`denied-${state}`,input:{storyId,expectedUpdatedAt:1}})).rejects.toThrow(state==='expired'?'GRANT_EXPIRED':'GRANT_REVOKED');
 expect((await t.run(ctx=>ctx.db.get(storyId)))!.status).toBe('published');
});
