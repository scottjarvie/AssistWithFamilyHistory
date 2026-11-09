import { beforeEach,afterEach,expect,test,vi} from "vitest";
import {convexTest} from "convex-test";
import type {Id} from "./_generated/dataModel";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import {queueIdentity} from "../lib/queue/identity";
const modules=import.meta.glob("./**/*.ts"),owner="user_suggestion_owner_A",other="user_suggestion_owner_B";
const principal={ownerId:owner,actorKind:"chosen_ai" as const,actorId:"oauth-chosen-ai",credentialId:"https://issuer.test#research-ai",scopes:["queue:read","queue:add","queue:suggest","queue:claim","queue:update","queue:complete"]};
afterEach(()=>vi.unstubAllEnvs());
function setup(){vi.stubEnv("TRUST_BOUNDARY_MODE","enforce");return convexTest(schema,modules);}
const add=(t:ReturnType<typeof setup>,key="add",extra={})=>t.mutation(internal.queue.agentAddQueueItem,{principal,directive:"Research the missing burial",addedBy:"ai_suggestion",reason:"No burial citation in the census research",idempotencyKey:key,...extra});
const review=(t:ReturnType<typeof setup>,item:{_id:Id<"queueItems">;version:number},action:"accept"|"dismiss"|"restore"|"archive"|"clear_input",extra={})=>t.withIdentity({subject:owner}).mutation(api.queue.reviewQueueItem,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:item.version,idempotencyKey:crypto.randomUUID(),action,...extra});

test("AI adds must classify intent; power refusal leaves requests available; read defaults never rewrite",async()=>{
 const t=setup();await expect(add(t,"missing",{addedBy:undefined})).rejects.toThrow(/addedBy: ai_on_request or ai_suggestion/);
 const restricted={...principal,scopes:principal.scopes.filter(s=>s!=="queue:suggest")};
 await expect(add(t,"off",{principal:restricted})).rejects.toThrow(/power is off/);
 const requested=await add(t,"request",{principal:restricted,addedBy:"ai_on_request"});expect(requested.item.addedBy).toBe("ai_on_request");
 expect(queueIdentity({state:"needs_you",pickedUpAt:1,requiredAction:"Which parish?",updatedAt:4,createdByActorKind:"chosen_ai"})).toMatchObject({state:"working",addedBy:"ai_on_request",needsInput:{question:"Which parish?",raisedAt:4}});
 expect(queueIdentity({state:"needs_you",resultSummary:"Report saved"})).toMatchObject({state:"done",addedBy:"person"});
});

test("every work command refuses open suggestions in the mutation; only the person reviews",async()=>{
 const t=setup(),{item}=await add(t);
 const common={principal,queueItemId:item._id,expectedVersion:1,idempotencyKey:"work"};
 const attempts=[
 ()=>t.mutation(internal.queue.agentClaimQueueItem,{...common,leaseMs:60000,nextStep:"Start"}),
 ()=>t.mutation(internal.queue.agentCheckpointQueueItem,{...common,leaseMs:60000,nextStep:"Continue"}),
 ()=>t.mutation(internal.queue.agentCompleteQueueItem,{...common,resultSummary:"Done"}),
 ()=>t.mutation(internal.queue.agentRequestUserAction,{...common,requiredAction:"Which source?"}),
 ()=>t.mutation(internal.queue.agentFailQueueItem,{...common,failureCode:"NO",failureSummary:"Stopped",retryable:false}),
 ()=>t.withIdentity({subject:owner}).mutation(api.queue.claimQueueItemAsUser,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:1,idempotencyKey:"person-work",leaseMs:60000,nextStep:"Start"})];
 for(const attempt of attempts)await expect(attempt()).rejects.toThrow(/suggestion/i);
 for(const action of ["accept","dismiss"] as const){await expect(t.mutation(api.queue.reviewQueueItem,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:1,idempotencyKey:action,action,directive:"Edit accept"})).rejects.toThrow(/missing_identity/);await expect(t.withIdentity({subject:other}).mutation(api.queue.reviewQueueItem,{vaultOwnerId:other,queueItemId:item._id,expectedVersion:1,idempotencyKey:action,action})).rejects.toThrow(/not found/);}
 expect((await t.run(ctx=>ctx.db.get(item._id)))?.version).toBe(1);
});

test("accept/edit first/option choice, exact dismiss reason, restore and withdrawal remain attributed",async()=>{
 const t=setup(),first=await add(t,"first",{options:["Parish register","Cemetery index"]});
 const accepted=await review(t,first.item,"accept",{optionIndex:1});expect(accepted.item).toMatchObject({state:"waiting_for_your_ai",addedBy:"ai_suggestion",suggestionStatus:"accepted"});expect(accepted.item.directive).toContain("Cemetery index");
 await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:first.item._id,expectedVersion:2,idempotencyKey:"claim",leaseMs:60000,nextStep:"Search index"});
 const second=await add(t,"second");const edited=await review(t,second.item,"accept",{directive:"Search only the 1901 parish register"});expect(edited.item.directive).toBe("Search only the 1901 parish register");
 const third=await add(t,"third");const dismissed=await review(t,third.item,"dismiss",{reason:"  Keep my wording.\nNo, thanks.  "});expect(dismissed.item.dismissReason).toBe("  Keep my wording.\nNo, thanks.  ");expect(dismissed.item.archivedAt).toBeTypeOf("number");
 await expect(add(t,"repeat")).rejects.toThrow(/new reason/);await add(t,"new-reason",{reason:"A new source changes the search"});
 const restored=await review(t,dismissed.item,"restore");expect(restored.item.suggestionStatus).toBe("open");expect(restored.item.archivedAt).toBeUndefined();
 await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:third.item._id,expectedVersion:3,idempotencyKey:"withdraw-after-person"})).rejects.toThrow(/before the person acts/);
 const fourth=await add(t,"fourth",{reason:"Another search gap"});await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal:{...principal,credentialId:"other-ai"},queueItemId:fourth.item._id,expectedVersion:1,idempotencyKey:"other-withdraw"})).rejects.toThrow(/own suggestion/);
 const withdrawn=await t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:fourth.item._id,expectedVersion:1,idempotencyKey:"withdraw"});expect(withdrawn.item.suggestionStatus).toBe("withdrawn");expect(withdrawn.item.archivedBy).toBe(principal.credentialId);
});

test("exact owner-private count past a page; lanes and default AI actionable list exclude suggestions",async()=>{
 const t=setup();for(let i=0;i<61;i++)await add(t,`suggestion-${i}`);
 const requested=await add(t,"requested",{addedBy:"ai_on_request"});
 expect(await t.withIdentity({subject:owner}).mutation(api.queue.queueCounts,{vaultOwnerId:owner})).toEqual({available:true,suggestions:61,needsInput:0});
 expect(await t.withIdentity({subject:other}).mutation(api.queue.queueCounts,{vaultOwnerId:other})).toEqual({available:true,suggestions:0,needsInput:0});
 const args={principal,paginationOpts:{numItems:25,cursor:null}};
 const work=await t.action(internal.queue.agentListQueueItems,args);expect(work.page.map(i=>i._id)).toEqual([requested.item._id]);
 const suggestions=await t.action(internal.queue.agentListQueueItems,{...args,suggestions:true});expect(suggestions.page).toHaveLength(25);expect(suggestions.isDone).toBe(false);
 const archived=await review(t,requested.item,"archive");expect((await t.action(internal.queue.agentListQueueItems,args)).page).toHaveLength(0);await review(t,archived.item,"restore");
});

test("input flag raising/answering/clearing keeps all three states; legacy mapping and foreign origin guards",async()=>{
 const t=setup(),added=await add(t,"requested",{addedBy:"ai_on_request"});
 const question=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:added.item._id,expectedVersion:1,idempotencyKey:"question",requiredAction:"Which parish?"});expect(question.item.state).toBe("waiting_for_your_ai");expect(question.item.needsInput?.question).toBe("Which parish?");
 expect((await t.withIdentity({subject:owner}).mutation(api.queue.queueCounts,{vaultOwnerId:owner})).needsInput).toBe(1);
 const answer=await t.withIdentity({subject:owner}).mutation(api.queue.resumeQueueItem,{vaultOwnerId:owner,queueItemId:added.item._id,expectedVersion:2,idempotencyKey:"answer",answerSummary:"Whitby"});expect(answer.item.state).toBe("waiting_for_your_ai");expect(answer.item.needsInput).toBeUndefined();
 const claimed=await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:added.item._id,expectedVersion:3,idempotencyKey:"claim",leaseMs:60000,nextStep:"Read"});
 const q=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:added.item._id,expectedVersion:claimed.item.version,idempotencyKey:"q2",requiredAction:"Read both?"});expect(q.item.state).toBe("working");
 const cleared=await review(t,q.item,"clear_input");expect(cleared.item.state).toBe("working");
 const reclaimed=await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:added.item._id,expectedVersion:cleared.item.version,idempotencyKey:"reclaim",leaseMs:60000,nextStep:"Continue after the answer"});
 const completed=await t.mutation(internal.queue.agentCompleteQueueItem,{principal,queueItemId:added.item._id,expectedVersion:reclaimed.item.version,idempotencyKey:"complete",resultSummary:"Saved report"});
 const doneQuestion=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:added.item._id,expectedVersion:completed.item.version,idempotencyKey:"q3",requiredAction:"Another pass?"});expect(doneQuestion.item.state).toBe("done");expect(doneQuestion.item.needsInput?.question).toBe("Another pass?");
 const foreign=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:other,name:{given:"Private",surname:"Other"},sex:"unknown",living:false,researchStatus:"not_started",createdAt:Date.now(),updatedAt:Date.now()}));
 await expect(add(t,"foreign-origin",{fromRecord:{kind:"person",refId:foreign}})).rejects.toThrow();
});

test("legacy input state and attribution are projected without migrating stored rows",async()=>{
 const t=setup();const {item}=await add(t,"legacy-request",{addedBy:"ai_on_request"});
 await t.run(ctx=>ctx.db.patch(item._id,{state:"needs_you",addedBy:undefined,needsInput:undefined,requiredAction:"Keep this exact old question",pickedUpAt:123}));
 const read=await t.withIdentity({subject:owner}).action(api.queue.getQueueItem,{vaultOwnerId:owner,queueItemId:item._id,activityPagination:{numItems:25,cursor:null}});
 expect(read?.item).toMatchObject({state:"working",addedBy:"ai_on_request",needsInput:{question:"Keep this exact old question"}});
 const stored=await t.run(ctx=>ctx.db.get(item._id));expect(stored?.state).toBe("needs_you");expect(stored?.addedBy).toBeUndefined();
});

test("From record title and origin view are owner-checked; narrowed suggestion reads remain usable",async()=>{
 const t=setup();const personId=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Invented",surname:"Finch"},sex:"unknown",living:false,researchStatus:"not_started",createdAt:Date.now(),updatedAt:Date.now()}));
 const {item}=await add(t,"from-person",{fromRecord:{kind:"person",refId:personId}});
 const origin=await t.withIdentity({subject:owner}).mutation(api.queue.getQueueOrigin,{vaultOwnerId:owner,queueItemId:item._id});expect(origin?.title).toBe("Invented Finch");expect(origin?.href).toBe(`/app/people/${personId}`);
 await expect(t.withIdentity({subject:other}).mutation(api.queue.getQueueOrigin,{vaultOwnerId:other,queueItemId:item._id})).rejects.toThrow(/not found/);
 const list=await t.action(internal.queue.agentListQueueItems,{principal,queueItemIds:[item._id],suggestions:true,paginationOpts:{numItems:25,cursor:null}});expect(list.page.map(i=>i._id)).toEqual([item._id]);
});

test("counter backfill is cursor-resumable, dry-run only, replay-safe and complete beyond 500 rows",async()=>{
 const t=setup();const base=await t.withIdentity({subject:owner}).mutation(api.queue.createQueueItem,{vaultOwnerId:owner,directive:"Template",idempotencyKey:"counter-template"});
 await t.run(async ctx=>{const doc=(await ctx.db.get(base.item._id))!;const {_id,_creationTime,...fields}=doc;void _id;void _creationTime;
  for(let i=0;i<601;i++)await ctx.db.insert("queueItems",{...fields,vaultOwnerId:other,counterIncluded:undefined,addedBy:i<301?"ai_suggestion":undefined,suggestionStatus:i<301?"open":undefined,state:i<301?"waiting_for_your_ai":"done",needsInput:i>=301?{question:`Question ${i}`,raisedAt:123,actorId:"legacy-ai"}:undefined});
 });
 async function pass(dryRun:boolean){let cursor:string|null=null,scanned=0,changed=0,suggestions=0,needsInput=0;let done=false;do{const result=await t.mutation(internal.queue.backfillQueueCounters,{vaultOwnerId:other,cursor,dryRun});scanned+=result.scanned;changed+=result.changed;suggestions+=result.suggestions;needsInput+=result.needsInput;done=result.isDone;cursor=result.continueCursor;}while(!done);return {scanned,changed,suggestions,needsInput};}
 const dry=await pass(true);expect(dry).toEqual({scanned:601,changed:601,suggestions:301,needsInput:300});expect(await t.run(ctx=>ctx.db.query("queueCounters").withIndex("by_owner",q=>q.eq("vaultOwnerId",other)).first())).toBeNull();
 expect(await t.withIdentity({subject:other}).mutation(api.queue.queueCounts,{vaultOwnerId:other})).toMatchObject({available:false,suggestions:null,needsInput:null});
 const first=await t.mutation(internal.queue.backfillQueueCounters,{vaultOwnerId:other,cursor:null,dryRun:false});expect(await t.mutation(internal.queue.backfillQueueCounters,{vaultOwnerId:other,cursor:null,dryRun:false})).toEqual(first);
 expect((await t.withIdentity({subject:other}).mutation(api.queue.queueCounts,{vaultOwnerId:other})).available).toBe(false);
 let cursor=first.continueCursor,done=first.isDone;while(!done){const r=await t.mutation(internal.queue.backfillQueueCounters,{vaultOwnerId:other,cursor,dryRun:false});cursor=r.continueCursor;done=r.isDone;}
 expect(await t.withIdentity({subject:other}).mutation(api.queue.queueCounts,{vaultOwnerId:other})).toEqual({available:true,suggestions:301,needsInput:300});
 expect(await pass(true)).toEqual({scanned:601,changed:0,suggestions:301,needsInput:300});
 const stats=await t.query(internal.yourData.getYourStatsInternal,{vaultOwnerId:other});expect(stats.queue).toMatchObject({available:true,count:601,needsInput:300,suggestions:301,byState:{waiting_for_your_ai:0,working:0,done:300}});
 const flagged=await t.withIdentity({subject:other}).action(api.queue.listQueueItems,{vaultOwnerId:other,state:"needs_you",paginationOpts:{numItems:50,cursor:null}});expect(flagged.page).toHaveLength(50);expect(flagged.page.every(i=>i.state==="done")).toBe(true);
 console.log("AWL-0016 synthetic dry-run: scanned 601; counter markers needed 601; open suggestions 301; flagged items 300. After backfill: markers needed 0.");
});

test("dismissal checks find an old idea past 500 newer rows; withdraw retains an audit row",async()=>{
 const t=setup();const added=await add(t,"old-idea");const dismissed=await review(t,added.item,"dismiss");
 await t.run(async ctx=>{const doc=(await ctx.db.get(added.item._id))!;const {_id,_creationTime,...fields}=doc;void _id;void _creationTime;for(let i=0;i<601;i++)await ctx.db.insert("queueItems",{...fields,directive:`Unrelated ${i}`,summary:`Unrelated ${i}`,wasDismissed:false});});
 await expect(add(t,"repeated-old-idea")).rejects.toThrow(/new reason/);await review(t,dismissed.item,"restore");await expect(add(t,"repeated-restored-idea")).rejects.toThrow(/new reason/);
 const own=await add(t,"withdraw-audited",{reason:"New evidence gives a different search"});await t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:own.item._id,expectedVersion:1,idempotencyKey:"withdraw-with-history"});
 const activity=await t.run(ctx=>ctx.db.query("queueActivity").withIndex("by_item_created",q=>q.eq("queueItemId",own.item._id)).order("desc").first());expect(activity).toMatchObject({eventType:"reviewed",actorId:principal.credentialId,commandId:"withdraw-with-history"});
});

test("AI cannot clear input through completion, revision, failure or pickup; flagged Answered agrees with the pill",async()=>{
 const t=setup();const {item}=await add(t,"input-guard",{addedBy:"ai_on_request"});
 const claim=await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:item._id,expectedVersion:1,idempotencyKey:"guard-claim",leaseMs:60000,nextStep:"Read"});
 const raised=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:item._id,expectedVersion:claim.item.version,idempotencyKey:"guard-question",requiredAction:"Which branch?"});
 expect(raised.item).toMatchObject({state:"working",needsInput:{question:"Which branch?"}});expect(raised.item.activeActorId).toBeUndefined();expect(raised.item.leaseExpiresAt).toBeUndefined();
 const common={principal,queueItemId:item._id,expectedVersion:raised.item.version,idempotencyKey:"cannot-clear"};
 await expect(t.mutation(internal.queue.agentClaimQueueItem,{...common,leaseMs:60000,nextStep:"Skip the question"})).rejects.toThrow(/person/);
 await expect(t.mutation(internal.queue.agentCheckpointQueueItem,{...common,leaseMs:60000,nextStep:"Revise"})).rejects.toThrow();
 await expect(t.mutation(internal.queue.agentCompleteQueueItem,{...common,resultSummary:"Ignore the question"})).rejects.toThrow();
 await expect(t.mutation(internal.queue.agentFailQueueItem,{...common,failureCode:"NO",failureSummary:"Ignore the question",retryable:false})).rejects.toThrow();
 expect((await t.run(ctx=>ctx.db.get(item._id)))?.needsInput?.question).toBe("Which branch?");
 const clear=await review(t,raised.item,"clear_input");const reclaim=await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:item._id,expectedVersion:clear.item.version,idempotencyKey:"guard-reclaim",leaseMs:60000,nextStep:"Continue"});
 const completed=await t.mutation(internal.queue.agentCompleteQueueItem,{principal,queueItemId:item._id,expectedVersion:reclaim.item.version,idempotencyKey:"guard-complete",resultSummary:"Report"});
 const answeredFlag=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:item._id,expectedVersion:completed.item.version,idempotencyKey:"guard-followup",requiredAction:"Another pass?"});
 const pill=await t.withIdentity({subject:owner}).mutation(api.queue.queueCounts,{vaultOwnerId:owner});const tab=await t.withIdentity({subject:owner}).action(api.queue.listQueueItems,{vaultOwnerId:owner,state:"needs_you",paginationOpts:{numItems:50,cursor:null}});
 expect(pill.needsInput).toBe(tab.page.length);expect(pill.needsInput).toBe(1);expect(tab.page[0].state).toBe("done");
 const archived=await review(t,answeredFlag.item,"archive");expect((await t.withIdentity({subject:owner}).mutation(api.queue.queueCounts,{vaultOwnerId:owner})).needsInput).toBe(0);await review(t,archived.item,"restore");expect((await t.withIdentity({subject:owner}).mutation(api.queue.queueCounts,{vaultOwnerId:owner})).needsInput).toBe(1);
});

test("a broken From record removes only its link and never the Queue item",async()=>{
 const t=setup();const {item}=await add(t,"broken-origin");await t.run(ctx=>ctx.db.patch(item._id,{fromRecord:{kind:"person",refId:"deleted-or-mismatched-id"}}));
 const detail=await t.withIdentity({subject:owner}).action(api.queue.getQueueItem,{vaultOwnerId:owner,queueItemId:item._id,activityPagination:{numItems:25,cursor:null}});expect(detail?.item._id).toBe(item._id);expect(detail?.item.fromRecord).toBeUndefined();
});

test("AI archive and withdraw cannot hide a flagged item, while the person's archive remains available",async()=>{
 const t=setup(),{item}=await add(t,"archive-guard",{addedBy:"ai_on_request"});
 const raised=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:item._id,expectedVersion:1,idempotencyKey:"archive-question",requiredAction:"Which record?"});
 const archivePrincipal={...principal,scopes:[...principal.scopes,"queue:archive"]};
 await expect(t.mutation(internal.queue.agentArchiveQueueItem,{principal:archivePrincipal,queueItemId:item._id,expectedVersion:raised.item.version,idempotencyKey:"ai-archive-flag"})).rejects.toThrow("Only the person can clear Needs your input");
 expect((await t.run(ctx=>ctx.db.get(item._id)))?.archivedAt).toBeUndefined();
 const archived=await review(t,raised.item,"archive");expect(archived.item.archivedAt).toBeTypeOf("number");await review(t,archived.item,"restore");
 const suggestion=await add(t,"flagged-suggestion");await t.run(ctx=>ctx.db.patch(suggestion.item._id,{needsInput:{question:"A preserved question",raisedAt:123,actorId:owner}}));
 await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:suggestion.item._id,expectedVersion:1,idempotencyKey:"withdraw-flag"})).rejects.toThrow("Only the person can clear Needs your input");
});

test("person edit/reply markers are permanent and dismiss-reopen never re-enables AI withdrawal",async()=>{
 const t=setup(),{item}=await add(t,"person-marker");
 const edited=await t.withIdentity({subject:owner}).mutation(api.queue.reviewQueueItem,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:1,idempotencyKey:"person-edit",action:"edit"});
 const firstAct=edited.item.personActedAt;expect(firstAct).toBeTypeOf("number");
 const dismissed=await review(t,edited.item,"dismiss");const reopened=await review(t,dismissed.item,"restore");expect(reopened.item.personActedAt).toBe(firstAct);
 await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:item._id,expectedVersion:reopened.item.version,idempotencyKey:"withdraw-after-reopen"})).rejects.toThrow(/before the person acts/);
 const work=await add(t,"reply-marker",{addedBy:"ai_on_request"});const question=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:work.item._id,expectedVersion:1,idempotencyKey:"reply-question",requiredAction:"Which branch?"});
 const reply=await t.withIdentity({subject:owner}).mutation(api.queue.resumeQueueItem,{vaultOwnerId:owner,queueItemId:work.item._id,expectedVersion:question.item.version,idempotencyKey:"person-reply",answerSummary:"The mother's branch"});expect(reply.item.personActedAt).toBeTypeOf("number");
});

test("an old withdraw operation ID cannot bypass a later permanent person action",async()=>{
 const t=setup(),{item}=await add(t,"replay-withdraw");const withdrawn=await t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:item._id,expectedVersion:1,idempotencyKey:"original-withdraw"});
 const restored=await review(t,withdrawn.item,"restore");
 await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:item._id,expectedVersion:restored.item.version,idempotencyKey:"original-withdraw"})).rejects.toThrow(/before the person acts/);
 expect((await t.run(ctx=>ctx.db.get(item._id)))?.suggestionStatus).toBe("open");
});

test("Queue read power does not hydrate private origin titles or bypass living-person record gates",async()=>{
 const t=setup();const id=await t.run(ctx=>ctx.db.insert("persons",{vaultOwnerId:owner,name:{given:"Private living",surname:"Origin"},sex:"unknown",living:true,researchStatus:"not_started",createdAt:123,updatedAt:123}));
 const {item}=await add(t,"private-from",{fromRecord:{kind:"person",refId:id}});
 const ai=await t.action(internal.queue.agentGetQueueItem,{principal,queueItemId:item._id,activityPagination:{numItems:25,cursor:null}});expect(ai?.item).not.toHaveProperty("fromRecordTitle");expect(JSON.stringify(ai)).not.toContain("Private living");
 const person=await t.withIdentity({subject:owner}).action(api.queue.getQueueItem,{vaultOwnerId:owner,queueItemId:item._id,activityPagination:{numItems:25,cursor:null}});expect(person?.item).toMatchObject({fromRecordTitle:"Private living Origin"});
});

test("AI archive still respects item-level operation restrictions and flags outrank withdrawal retries",async()=>{
 const t=setup(),{item}=await add(t,"item-scope",{addedBy:"ai_on_request"});await t.run(ctx=>ctx.db.patch(item._id,{authority:{...item.authority,operations:["queue:read"]}}));
 await expect(t.mutation(internal.queue.agentArchiveQueueItem,{principal:{...principal,scopes:[...principal.scopes,"queue:archive"]},queueItemId:item._id,expectedVersion:1,idempotencyKey:"archive-read-only"})).rejects.toThrow(/authority/);
 const suggestion=await add(t,"flag-after-person");const accepted=await review(t,suggestion.item,"accept");await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:accepted.item._id,expectedVersion:accepted.item.version,idempotencyKey:"accepted-question",requiredAction:"Which branch?"});
 await expect(t.mutation(internal.queue.agentWithdrawSuggestion,{principal,queueItemId:accepted.item._id,expectedVersion:3,idempotencyKey:"withdraw-person-flag"})).rejects.toThrow("Only the person can clear Needs your input");
});

test("questions require an unclaimed item or this exact AI connection's claim",async()=>{
 const t=setup(),{item}=await add(t,"claim-ownership",{addedBy:"ai_on_request"});
 const claimed=await t.mutation(internal.queue.agentClaimQueueItem,{principal,queueItemId:item._id,expectedVersion:1,idempotencyKey:"claim-owner",leaseMs:60000,nextStep:"Read source"});
 expect(claimed.item.activeCredentialId).toBe(principal.credentialId);
 const otherAi={...principal,credentialId:"https://issuer.test#second-ai"};
 await expect(t.mutation(internal.queue.agentRequestUserAction,{principal:otherAi,queueItemId:item._id,expectedVersion:claimed.item.version,idempotencyKey:"steal-with-question",requiredAction:"My question"})).rejects.toThrow(/Another AI connection/);
 await expect(t.mutation(internal.queue.agentArchiveQueueItem,{principal:{...otherAi,scopes:[...otherAi.scopes,"queue:archive"]},queueItemId:item._id,expectedVersion:claimed.item.version,idempotencyKey:"steal-with-archive"})).rejects.toThrow(/Another AI connection/);
 expect(await t.run(ctx=>ctx.db.get(item._id))).toMatchObject({version:claimed.item.version,activeCredentialId:principal.credentialId,leaseExpiresAt:claimed.item.leaseExpiresAt});
 const asked=await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:item._id,expectedVersion:claimed.item.version,idempotencyKey:"own-question",requiredAction:"Which register?"});expect(asked.item.state).toBe("working");expect(asked.item.activeCredentialId).toBeUndefined();expect(asked.item.leaseExpiresAt).toBeUndefined();
 const human=await add(t,"human-claim-question",{addedBy:"ai_on_request"});const humanClaim=await t.withIdentity({subject:owner}).mutation(api.queue.claimQueueItemAsUser,{vaultOwnerId:owner,queueItemId:human.item._id,expectedVersion:1,idempotencyKey:"human-claim",leaseMs:60000,nextStep:"I am reading"});
 await expect(t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:human.item._id,expectedVersion:humanClaim.item.version,idempotencyKey:"human-steal",requiredAction:"Stop reading?"})).rejects.toThrow(/Another actor/);
 const legacy=await add(t,"legacy-claim-question",{addedBy:"ai_on_request"});await t.run(ctx=>ctx.db.patch(legacy.item._id,{activeActorKind:"chosen_ai",activeActorId:"oauth-chosen-ai",leaseExpiresAt:Date.now()+60000}));
 await expect(t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:legacy.item._id,expectedVersion:1,idempotencyKey:"legacy-steal",requiredAction:"Stop?"})).rejects.toThrow(/ambiguous/);
 for(const [key,patch] of [["canceled",{condition:"canceled" as const}],["archived",{archivedAt:123}],["expired",{handoffExpiresAt:1}]] as const){const row=await add(t,key,{addedBy:"ai_on_request"});await t.run(ctx=>ctx.db.patch(row.item._id,patch));await expect(t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:row.item._id,expectedVersion:1,idempotencyKey:key+"-question",requiredAction:"Invalid question"})).rejects.toThrow();expect((await t.run(ctx=>ctx.db.get(row.item._id)))?.needsInput).toBeUndefined();}
});

test("briefs filter non-work before their limit, expose questions separately, and obey Queue reach",async()=>{
 const t=setup(),work=await add(t,"brief-work",{addedBy:"ai_on_request"});
 const question=await add(t,"brief-question",{addedBy:"ai_on_request"});await t.mutation(internal.queue.agentRequestUserAction,{principal,queueItemId:question.item._id,expectedVersion:1,idempotencyKey:"brief-ask",requiredAction:"Exact question for the person?"});
 const archived=await add(t,"brief-archived",{addedBy:"ai_on_request"});await review(t,archived.item,"archive");
 await t.run(async ctx=>{const source=(await ctx.db.get(work.item._id))!;const {_id,_creationTime,...fields}=source;void _id;void _creationTime;for(let i=0;i<601;i++)await ctx.db.insert("queueItems",{...fields,summary:`Non-work ${i}`,addedBy:"ai_suggestion",suggestionStatus:"open",updatedAt:Date.now()+i});});
 const briefPrincipal={issuer:"https://issuer.test",subject:owner,clientId:"research-ai",scopes:["family_history:read"]};
 const brief=await t.query(internal.mcpFamilyHistory.getBrief,{principal:briefPrincipal,queueRead:true});expect(brief.queue.map(row=>row.id)).toEqual([work.item._id]);expect(brief.questionsForPerson).toEqual([expect.objectContaining({id:question.item._id,question:"Exact question for the person?",personActions:["Answer","Archive"]})]);
 const hidden=await t.query(internal.mcpFamilyHistory.getBrief,{principal:briefPrincipal,queueRead:false});expect(hidden.queueAvailable).toBe(false);expect(hidden.queue).toEqual([]);expect(hidden.questionsForPerson).toEqual([]);
 const foreign=await add(t,"brief-foreign",{principal:{...principal,ownerId:other},addedBy:"ai_on_request"});
 const named=await t.query(internal.mcpFamilyHistory.getBrief,{principal:briefPrincipal,queueRead:true,queueItemIds:[question.item._id,foreign.item._id]});expect(named.queue).toEqual([]);expect(named.questionsForPerson.map(row=>row.id)).toEqual([question.item._id]);
});

// Explicit website JWT issuer for synthetic person identities; never an auth bypass.
beforeEach(()=>vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://convex.test"));

test("person Queue doors refuse AI-token identities even with the same owner and issuer",async()=>{
 const t=setup(),{item}=await add(t,"ai-token-person-doors");
 const ai=t.withIdentity({subject:owner,issuer:"https://convex.test",client_id:"oauth-ai",scope:"openid offline_access",aud:"convex"});
 const args={vaultOwnerId:owner,queueItemId:item._id,expectedVersion:1,idempotencyKey:"oauth-person-review"};
 const reads=[()=>ai.action(api.queue.listQueueItems,{vaultOwnerId:owner,paginationOpts:{numItems:25,cursor:null}}),()=>ai.action(api.queue.getQueueItem,{vaultOwnerId:owner,queueItemId:item._id,activityPagination:{numItems:25,cursor:null}}),()=>ai.mutation(api.queue.queueCounts,{vaultOwnerId:owner}),()=>ai.mutation(api.queue.getQueueOrigin,{vaultOwnerId:owner,queueItemId:item._id}),()=>ai.action(api.yourData.getYourStats,{vaultOwnerId:owner})];
 for(const read of reads)await expect(read()).rejects.toThrow(/person session/);
 for(const action of ["accept","edit","dismiss","archive","restore","clear_input"] as const)await expect(ai.mutation(api.queue.reviewQueueItem,{...args,action})).rejects.toThrow(/person session/);
 await expect(ai.mutation(api.queue.createQueueItem,{vaultOwnerId:owner,directive:"AI impersonating a person",idempotencyKey:"ai-create-person"})).rejects.toThrow(/person session/);
 await expect(ai.mutation(api.queue.resumeQueueItem,{...args,answerSummary:"AI answer"})).rejects.toThrow(/person session/);
 const extraDoors=[()=>ai.mutation(api.queue.assignQueueItemToAi,{...args,chosenAiId:"oauth-chosen-ai"}),()=>ai.mutation(api.queue.claimQueueItemAsUser,{...args,leaseMs:60000,nextStep:"Impersonate"}),()=>ai.mutation(api.queue.checkpointQueueItemAsUser,{...args,leaseMs:60000,nextStep:"Impersonate"}),()=>ai.mutation(api.queue.completeQueueItemAsUser,{...args,resultSummary:"AI result"}),()=>ai.mutation(api.queue.cancelQueueItem,{...args,reason:"AI cancel"}),()=>ai.mutation(api.queue.reopenQueueItem,{...args,reason:"AI reopen"}),()=>ai.action(api.queue.deleteQueueItem,{vaultOwnerId:owner,queueItemId:item._id,confirmation:"delete_queue_item_and_history"})];for(const call of extraDoors)await expect(call()).rejects.toThrow(/person session/);
 const foreignIssuer=t.withIdentity({subject:owner,issuer:"https://ai-issuer.test",aud:"convex"});await expect(foreignIssuer.mutation(api.queue.queueCounts,{vaultOwnerId:owner})).rejects.toThrow(/person session/);
 const wrongAudience=t.withIdentity({subject:owner,issuer:"https://convex.test",aud:"https://family.test/mcp"});await expect(wrongAudience.mutation(api.queue.queueCounts,{vaultOwnerId:owner})).rejects.toThrow(/person session/);
 expect((await t.run(ctx=>ctx.db.get(item._id)))?.suggestionStatus).toBe("open");
});


test("suggestion attribution uses the person's connection name only for display",async()=>{
 const t=setup();const connectionId=await t.run(ctx=>ctx.db.insert("mcpGrants",{vaultOwnerId:owner,clientId:"research-ai",issuer:"https://issuer.test",label:"My research companion",clientProvenance:"manual",scopes:[],boundary:{kind:"whole_workspace"},status:"active",requestedAt:123,updatedAt:123,useCount:0}));
 const own=await add(t,"named-ai",{connectionId});expect(own.item.aiName).toBe("My research companion");
 const different=await add(t,"unmatched-label",{connectionId,principal:{...principal,credentialId:"other-ai"}});expect(different.item.aiName).toBe("Your AI");
});


test("native Clerk Convex website claims without azp can review; OAuth markers and foreign azp cannot",async()=>{
 const t=setup(),{item}=await add(t,"native-clerk-session");
 const claims={aud:"convex",exp:2000003600,fva:[0,-1],iat:2000000000,iss:"https://convex.test",nbf:1999999995,sid:"sess_synthetic_native_convex",sts:"active",sub:owner,v:2};
 expect(Object.keys(claims).sort()).toEqual(["aud","exp","fva","iat","iss","nbf","sid","sts","sub","v"]);
 const website=t.withIdentity({...claims,issuer:claims.iss,subject:claims.sub});
 expect(await website.mutation(api.queue.queueCounts,{vaultOwnerId:owner})).toMatchObject({suggestions:1});
 const accepted=await website.mutation(api.queue.reviewQueueItem,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:1,idempotencyKey:"native-person-accept",action:"accept"});expect(accepted.item.suggestionStatus).toBe("accepted");
 for(const marker of [{client_id:"oauth-ai"},{scope:"openid"},{scp:["openid"]},{azp:"https://foreign.example"}]){const machine=t.withIdentity({...claims,...marker,issuer:claims.iss,subject:claims.sub});await expect(machine.mutation(api.queue.queueCounts,{vaultOwnerId:owner})).rejects.toThrow(/person session/);await expect(machine.mutation(api.queue.reviewQueueItem,{vaultOwnerId:owner,queueItemId:item._id,expectedVersion:accepted.item.version,idempotencyKey:crypto.randomUUID(),action:"archive"})).rejects.toThrow(/person session/);}
 const matching=t.withIdentity({...claims,issuer:claims.iss,subject:claims.sub,azp:"https://assistwithfamilyhistory.com"});await expect(matching.mutation(api.queue.queueCounts,{vaultOwnerId:owner})).resolves.toMatchObject({available:true});
});
