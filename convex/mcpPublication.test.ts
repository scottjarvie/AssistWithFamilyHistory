/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
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
