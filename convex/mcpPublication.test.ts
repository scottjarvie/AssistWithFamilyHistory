/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import * as storyVault from "./vault";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { permittedTools } from "../lib/mcp/authorize";
import { seedGrant } from "../lib/mcp/testSupport";
import { RESEARCH_CHECK_DEFINITIONS } from "./vaultCore";
import { assertSafePublication } from "../lib/stories/sensitiveInfo";
const modules=import.meta.glob("./**/*.ts");
const narrative = "The ancestor lived in a documented community, supported by reviewed sources and historical context. ".repeat(6);
const owner="user_publication";
const principal={subject:owner,issuer:"https://identity.example.test",clientId:"synthetic-mcp-client",scopes:[]};
async function setup() {
 const t=convexTest(schema,modules); const grantId=await seedGrant(t,{vaultOwnerId:owner,expiresAt:null});
 const personId=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Ancestor",surname:"Synthetic"},sex:"unknown",living:false,birth:{date:{original:"1800",year:1800}},death:{date:{original:"1880",year:1880}},researchStatus:"in_progress",createdAt:1,updatedAt:1}));
 await t.run(async ctx=>{
  const sourceId=await ctx.db.insert("sources",{vaultOwnerId:owner,title:"Reviewed historical source",type:"book",createdAt:1,updatedAt:1});
  const citationId=await ctx.db.insert("citations",{vaultOwnerId:owner,sourceId,isEvidence:true,confidence:"high",createdAt:1,updatedAt:1});
  await ctx.db.insert("citationLinks",{vaultOwnerId:owner,citationId,targetType:"person",targetId:String(personId),createdAt:1});
  await ctx.db.insert("historicalContext",{vaultOwnerId:owner,timePeriod:{startYear:1790,endYear:1890},topic:"daily_life",title:"Historical setting",content:"Reviewed context",sources:[],privacyLevel:"publish_candidate",reviewStatus:"reviewed",aiUseAllowed:true,createdAt:1,updatedAt:1});
  for(const check of RESEARCH_CHECK_DEFINITIONS) await ctx.db.insert("researchChecks",{vaultOwnerId:owner,personId,checkKey:check.key,status:"complete",applicability:"required",completionSource:"user",confidence:1,createdAt:1,updatedAt:1});
 });
 return {t,grantId,personId};
}
async function createPublic(t: Awaited<ReturnType<typeof setup>>["t"], grantId: string, personId: Awaited<ReturnType<typeof setup>>["personId"], content = narrative) {
 const draft=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:crypto.randomUUID(),requestHash:crypto.randomUUID(),input:{mode:"create",createKey:crypto.randomUUID(),personId,type:"biography",title:"Ancestor story",content,status:"review"}});
 return t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:crypto.randomUUID(),requestHash:crypto.randomUUID(),input:{mode:"update",storyId:draft.story.id,expectedUpdatedAt:draft.story.updatedAt,status:"published",publicIndexing:"noindex"}});
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
 const saved=await createPublic(t,grantId,personId);
 const story=await t.run(ctx=>ctx.db.get(saved.story.id)); expect(story).toMatchObject({status:"published",generatedBy:"ai",publicIndexing:"noindex"});
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story!.publicSlug!})).not.toBeNull();
 const updated=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"edit-public",requestHash:"edit-public",input:{mode:"update",storyId:story!._id,expectedUpdatedAt:story!.updatedAt,content:narrative+"Business: shop@example.test",publicIndexing:"index",acknowledgeContactDetails:{emails:1,phones:0,addresses:0}}});
 expect(updated.publicationContactDetails).toEqual({emails:1,phones:0,addresses:0});
 const row=await t.run(ctx=>ctx.db.get(story!._id));
 await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"unpublish",requestHash:"unpublish",input:{mode:"update",storyId:row!._id,expectedUpdatedAt:row!.updatedAt,status:"draft"}});
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story!.publicSlug!})).toBeNull();
 const events=await t.run(ctx=>ctx.db.query("storyReviewEvents").collect()); expect(events).toHaveLength(4);expect(events.every(e=>e.actorName?.includes(principal.clientId))).toBe(true);
});
test("a batch gets one aggregate acknowledgement, and refusal makes no writes",async()=>{
 const {t,grantId,personId}=await setup();
 const review=await t.mutation(internal.mcpFamilyHistory.saveCompleteResult,{principal,grantId,operationId:"batch-review",requestHash:"batch-review",input:{summary:"A batch",stories:[1,2].map(n=>({mode:"create",createKey:`batch:${n}`,personId,type:"biography",title:`Story ${n}`,content:narrative+`shop${n}@example.test`,status:"review"}))}});
 const input={summary:"Publish batch",stories:(review.saved as {stories:Array<{id:string;updatedAt:number}>}).stories.map(row=>({mode:"update",storyId:row.id,expectedUpdatedAt:row.updatedAt,status:"published"}))};
 await expect(t.mutation(internal.mcpFamilyHistory.saveCompleteResult,{principal,grantId,operationId:"batch-no-ack",requestHash:"batch-no-ack",input})).rejects.toThrow('2 email addresses');
 expect((await t.run(ctx=>ctx.db.query("stories").collect())).every(row=>row.status==="review")).toBe(true);
 const result=await t.mutation(internal.mcpFamilyHistory.saveCompleteResult,{principal,grantId,operationId:"batch-with-ack",requestHash:"batch-with-ack",input:{...input,acknowledgeContactDetails:{emails:2,phones:0,addresses:0}}});
 expect(result.publicationContactDetails).toEqual({emails:2,phones:0,addresses:0});expect(await t.run(ctx=>ctx.db.query("stories").collect())).toHaveLength(2);
});
test("JSON-quoted secrets refuse, and contact matches never cross lines or merge adjacent values",()=>{
 for(const text of ['{"password":"long-secret-value"}', '"api_key": "private-value"', '{"access_token":\n"private-value"}']) expect(()=>assertSafePublication(text,{emails:100,phones:100,addresses:100})).toThrow('PUBLICATION_SECRET');
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
 const saved=await createPublic(t,grantId,personId);
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
test("ordinary story prose is allowed, while credential-shaped secrets and card numbers refuse",()=>{
 for(const prose of ['The family secret: he was adopted…','She kept one token: a lock of hair',"The password = 'Zion'"]) expect(()=>assertSafePublication(prose)).not.toThrow();
 for(const secret of ['auth_token:abcdefgh123','db_password=abcdefgh123','AWS_SECRET_ACCESS_KEY=abcdefgh123','{"password":"abcdefgh123"}','{\\"api_key\\":\\"abcdefgh123\\"}','auth_token:\nabcdefgh123','https://user:pass@example.test','xoxb-1234567890-secret','rk_live_1234567890','sk_live_1234567890','access-production-1234abcd-5678','4111 1111 1111 1111','4242424242424242']) expect(()=>assertSafePublication(secret)).toThrow('PUBLICATION_SECRET');
 expect(()=>assertSafePublication('4242424242424243')).not.toThrow();
});
async function publishFixture() {
 const f=await setup();
 const saved=await createPublic(f.t,f.grantId,f.personId);
 return {...f,story:(await f.t.run(ctx=>ctx.db.get(saved.story.id)))!};
}
test("the website and AI both refuse a living:false person without dates",async()=>{
 const {t,grantId,personId}=await setup();
 await t.run(ctx=>ctx.db.patch(personId,{birth:undefined,death:undefined}));
 const saved=await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"no-dates-draft",requestHash:"no-dates-draft",input:{mode:"create",createKey:"no-dates",personId,type:"biography",title:"No dates",content:narrative,status:"review"}});
 await expect(t.withIdentity({subject:owner}).mutation(api.vaultMutations.updateStoryStatus,{vaultOwnerId:owner,storyId:saved.story.id,status:"published",humanReviewConfirmed:true,humanReviewNote:"I checked this ancestor."})).rejects.toThrow('publish_gate_failed');
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"no-dates-publish",requestHash:"no-dates-publish",input:{mode:"update",storyId:saved.story.id,expectedUpdatedAt:saved.story.updatedAt,status:"published"}})).rejects.toThrow('PUBLISH_GATE_FAILED');
 expect((await t.run(ctx=>ctx.db.get(saved.story.id)))!.status).toBe('review');
});
test("second review blocks edits and public restoration, with private restoration available",async()=>{
 const {t,grantId,story}=await publishFixture();
 await t.run(ctx=>ctx.db.patch(story._id,{secondReviewRequired:true}));
 await expect(t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"edit-second-review",requestHash:"edit-second-review",input:{mode:"update",storyId:story._id,expectedUpdatedAt:story.updatedAt,content:narrative+"More history."}})).rejects.toThrow('Second review');
 await t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"archive-public",requestHash:"archive-public",input:{kind:"story",id:story._id,expectedUpdatedAt:story.updatedAt,action:"archive"}});
 const archived=(await t.run(ctx=>ctx.db.get(story._id)))!;
 expect(await t.query(api.vault.getPublishedStoryByIdentifier,{storyIdentifier:story.publicSlug!})).toBeNull();
 await expect(t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"restore-public",requestHash:"restore-public",input:{kind:"story",id:story._id,expectedUpdatedAt:archived.updatedAt,action:"restore"}})).rejects.toThrow('restoreAsPrivate');
 expect((await t.run(ctx=>ctx.db.get(story._id)))!.archivedAt).toBeDefined();
 await t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"restore-private",requestHash:"restore-private",input:{kind:"story",id:story._id,expectedUpdatedAt:archived.updatedAt,action:"restore",restoreAsPrivate:true}});
 expect(await t.run(ctx=>ctx.db.get(story._id))).toMatchObject({status:"draft"});
 expect((await t.run(ctx=>ctx.db.get(story._id)))!.archivedAt).toBeUndefined();
});
test("adding a living relative to a published story is gated in the committing transaction",async()=>{
 const {t,grantId,personId}=await publishFixture();
 const living=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Living",surname:"Relative"},sex:"unknown",living:true,researchStatus:"in_progress",createdAt:1,updatedAt:1}));
 await expect(t.mutation(internal.mcpFamilyHistory.saveRelationship,{principal,grantId,operationId:"attach-living",requestHash:"attach-living",input:{mode:"create",createKey:"living-relative",type:"ParentChild",person1:personId,person2:living}})).rejects.toThrow('PUBLISH_GATE_FAILED');
 expect(await t.run(ctx=>ctx.db.query("relationships").collect())).toHaveLength(0);
});
test("the human website publish path does not enforce the AI credential scanner",async()=>{
 const {t,story}=await publishFixture();
 await t.run(ctx=>ctx.db.patch(story._id,{content:narrative+'\npassword=abcdefgh123'}));
 await t.withIdentity({subject:owner}).mutation(api.vaultMutations.updateStoryStatus,{vaultOwnerId:owner,storyId:story._id,status:"published",humanReviewConfirmed:true,humanReviewNote:"I reviewed the content and consent to publication."});
 expect((await t.run(ctx=>ctx.db.get(story._id)))!.status).toBe('published');
});
test("public restoration scans stored content and rechecks publishing power, or restores privately",async()=>{
 const {t,grantId,story}=await publishFixture();
 await t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"hide",requestHash:"hide",input:{kind:"story",id:story._id,expectedUpdatedAt:story.updatedAt,action:"archive"}});
 const archived=(await t.run(ctx=>ctx.db.get(story._id)))!;
 await t.run(ctx=>ctx.db.patch(story._id,{content:narrative+'\n{"db_password":"abcdefgh123"}'}));
 await expect(t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"secret-restore",requestHash:"secret-restore",input:{kind:"story",id:story._id,expectedUpdatedAt:archived.updatedAt,action:"restore"}})).rejects.toThrow('PUBLICATION_SECRET');
 expect((await t.run(ctx=>ctx.db.get(story._id)))!.archivedAt).toBeDefined();
 await t.run(ctx=>ctx.db.patch(story._id,{content:narrative}));
 const before=await t.query(internal.mcpGrants.describeCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId});
 await t.mutation(internal.mcpGrants.limitCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId,action:"limit",removeScopes:["family_history:story:draft"],revision:before.revision,opId:"remove-publish-for-restore"});
 await expect(t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"power-restore",requestHash:"power-restore",input:{kind:"story",id:story._id,expectedUpdatedAt:archived.updatedAt,action:"restore"}})).rejects.toThrow('restoreAsPrivate');
 await t.mutation(internal.mcpFamilyHistory.archiveRecord,{principal,grantId,operationId:"private-restore-without-publish",requestHash:"private-restore-without-publish",input:{kind:"story",id:story._id,expectedUpdatedAt:archived.updatedAt,action:"restore",restoreAsPrivate:true}});
 expect((await t.run(ctx=>ctx.db.get(story._id)))!.status).toBe('draft');
});
test("editing a public source repeats secret and publish-power checks before committing",async()=>{
 const {t,grantId}=await publishFixture();
 const source=(await t.run(ctx=>ctx.db.query("sources").collect()))[0];const citation=(await t.run(ctx=>ctx.db.query("citations").collect()))[0];
 const input={source:{mode:"update",sourceId:source._id,expectedUpdatedAt:source.updatedAt,title:"auth_token:abcdefgh123"},citation:{mode:"update",citationId:citation._id,expectedUpdatedAt:citation.updatedAt}};
 await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence,{principal,grantId,operationId:"source-secret",requestHash:"source-secret",input})).rejects.toThrow('PUBLICATION_SECRET');
 expect((await t.run(ctx=>ctx.db.get(source._id)))!.title).toBe(source.title);
 const before=await t.query(internal.mcpGrants.describeCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId});
 await t.mutation(internal.mcpGrants.limitCallingConnection,{subject:owner,issuer:principal.issuer,clientId:principal.clientId,action:"limit",removeScopes:["family_history:story:draft"],revision:before.revision,opId:"remove-publish-for-source"});
 await expect(t.mutation(internal.mcpFamilyHistory.saveSourceEvidence,{principal,grantId,operationId:"source-no-publish",requestHash:"source-no-publish",input:{...input,source:{...input.source,title:"Renamed public source"}}})).rejects.toThrow('SCOPE_NOT_GRANTED');
 expect((await t.run(ctx=>ctx.db.get(source._id)))!.title).toBe(source.title);
});
test("the three story-prose sentences pass without weakening credential detection",()=>{
 for(const text of ['The family secret: grandfather was adopted in 1890.','Her only token: photographs of the farm.','The secret: everyone knew.']) expect(()=>assertSafePublication(text)).not.toThrow();
 for(const text of ['auth_token:grandfather','SECRET:grandfather','token:abc123def456','secret:abc-def-ghi','{"token":"grandfather"}']) expect(()=>assertSafePublication(text)).toThrow('PUBLICATION_SECRET');
});
test("unpublish leaves review and draft stories exactly as they are",async()=>{
 const {t,grantId,personId}=await setup();
 for(const status of ['review','draft'] as const) {
  const storyId=await t.run(ctx=>ctx.db.insert("stories",{vaultOwnerId:owner,personId,type:"biography",title:"Not public",content:narrative,citationIds:[],status,generatedBy:"human",createdAt:1,updatedAt:1}));
  const before=await t.run(ctx=>ctx.db.get(storyId));
  const history=await t.run(ctx=>ctx.db.query("storyReviewEvents").collect());
  const result=await t.mutation(internal.mcpFamilyHistory.unpublishStory,{principal,grantId,operationId:`unpublish-${status}`,requestHash:`unpublish-${status}`,input:{storyId,expectedUpdatedAt:1}});
  expect(result.unchanged).toBe(true);expect(await t.run(ctx=>ctx.db.get(storyId))).toEqual(before);
  expect(await t.run(ctx=>ctx.db.query("storyReviewEvents").collect())).toEqual(history);
 }
});
test("private writes and a direct public-story edit never hydrate unrelated public stories",async()=>{
 const {t,grantId,personId,story}=await publishFixture();
 const unrelated=new Set<string>();
 await t.run(async ctx=>{
  const otherPerson=await ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Other",surname:"Person"},sex:"unknown",living:false,researchStatus:"in_progress",createdAt:1,updatedAt:1});
  for(let i=0;i<200;i++) unrelated.add(String(await ctx.db.insert("stories",{vaultOwnerId:owner,personId:otherPerson,type:"biography",title:`Broken ${i}`,content:narrative,citationIds:[],status:"published",generatedBy:"human",secondReviewRequired:true,createdAt:1,updatedAt:1})));
 });
 const original=storyVault.loadStoryScopedSnapshot;
 const seen:string[]=[];
 const spy=vi.spyOn(storyVault,"loadStoryScopedSnapshot").mockImplementation(async(ctx,vaultOwner,id)=>{
  if(unrelated.has(String(id)))throw new Error("Unrelated publication must not be loaded");
  seen.push(String(id));return original(ctx,vaultOwner,id);
 });
 try {
  await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"private-write-isolated",requestHash:"private-write-isolated",input:{mode:"create",createKey:"isolated-private",personId,type:"biography",title:"Private draft",content:"Private text",status:"draft"}});
  expect(seen).toEqual([]);
  await t.mutation(internal.mcpFamilyHistory.saveStoryWork,{principal,grantId,operationId:"public-edit-isolated",requestHash:"public-edit-isolated",input:{mode:"update",storyId:story._id,expectedUpdatedAt:story.updatedAt,content:narrative+"A checked addition."}});
  expect(seen.length).toBeGreaterThan(0);expect(seen.every(id=>id===String(story._id))).toBe(true);
 } finally {spy.mockRestore();}
});
