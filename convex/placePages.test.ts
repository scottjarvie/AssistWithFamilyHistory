import {expect,test,vi,afterEach} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {api,internal} from "./_generated/api";
import {withSearchWrites} from "./searchWrites";
import type {PlaceSection} from "./placePages";
afterEach(()=>vi.unstubAllEnvs());
const modules=import.meta.glob("./**/*.ts"),owner="user_syntheticPlacePages";
const person=(i:number)=>({vaultOwnerId:owner,name:{given:`Invented ${i}`,surname:"Reed"},sex:"unknown"as const,living:false,researchStatus:"basic"as const,createdAt:i,updatedAt:i});
const place=(name:string)=>({vaultOwnerId:owner,name,fullName:`${name}, Synthetic County`,type:"parish"as const,createdAt:0,updatedAt:0});
test("place pages keep exact totals, accepted unique media, complete bounded sections and tenant gates",async()=>{
 vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://synthetic-local.invalid");
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const a=await ctx.db.insert("places",place("Ashford")),b=await ctx.db.insert("places",place("Whitby"));
  const p=await ctx.db.insert("persons",{...person(1),birth:{place:{original:"Ashford",placeId:a}}});
  const p2=await ctx.db.insert("persons",{...person(2),death:{place:{original:"Ashford",placeId:a}}});
  const p3=await ctx.db.insert("persons",person(3));
  const foreign=await ctx.db.insert("persons",{...person(4),vaultOwnerId:"user_other"});
  let lastEvent:import("./_generated/dataModel").Id<"events">|undefined;
  for(let i=0;i<120;i++)lastEvent=await ctx.db.insert("events",{vaultOwnerId:owner,type:"census",place:{original:"Ashford",placeId:a},date:{original:String(1800+i),year:1800+i},createdAt:i,updatedAt:i});
  for(const id of [p,p3,foreign])await ctx.db.insert("personEvents",{vaultOwnerId:owner,personId:id,eventId:lastEvent!,role:"primary",createdAt:0});
  const source=await ctx.db.insert("sources",{vaultOwnerId:owner,title:"Invented register",type:"other",createdAt:0,updatedAt:0});
  const cite=await ctx.db.insert("citations",{vaultOwnerId:owner,sourceId:source,isEvidence:true,confidence:"high",createdAt:0,updatedAt:0});
  await ctx.db.insert("citationLinks",{vaultOwnerId:owner,citationId:cite,targetType:"place",targetId:String(a),createdAt:0});
  const media=await ctx.db.insert("media",{vaultOwnerId:owner,title:"Ashford mention",type:"photo",personIds:[],createdAt:0,updatedAt:0});
  const explicit=await ctx.db.insert("media",{vaultOwnerId:owner,title:"Portrait with no locality text",type:"photo",personIds:[],createdAt:0,updatedAt:0});
  const connection=(id:string,state:"accepted"|"proposed"="accepted")=>({vaultOwnerId:owner,from:{kind:"media"as const,id},to:{kind:"place"as const,id:String(a)},relation:"taken_at"as const,state,createdAt:0,updatedAt:0});
  const c1=await ctx.db.insert("connections",connection(String(media))),c2=await ctx.db.insert("connections",connection(String(media)));
  await ctx.db.insert("connections",connection(String(explicit)));await ctx.db.insert("connections",connection(String(explicit),"proposed"));
  for(let i=0;i<2;i++)await ctx.db.insert("historicalContext",{vaultOwnerId:owner,placeId:a,timePeriod:{startYear:1800,endYear:1900},topic:"other",title:`Invented context ${i}`,content:"Synthetic",sources:[],createdAt:i,updatedAt:i});
  for(let i=0;i<4;i++)await ctx.db.insert("researchLog",{vaultOwnerId:owner,entityType:"place",entityId:a,activityType:"other",status:"done",summary:`Invented research ${i}`,createdAt:i,updatedAt:i});
  return {a,b,p,p2,p3,foreign,media,explicit,c1,c2,lastEvent:lastEvent!};
 });
 const before=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});
 expect(before?.mode).toBe("legacy");if(before?.mode==="legacy"){
  expect(before.workspace.header.totals.media).toBe(1);
  expect(before.workspace.pages.context?.page).toHaveLength(2);
 }
 const legacyList=await t.query(internal.placePages.list,{vaultOwnerId:owner,cursor:null,search:"ashford"});
 expect(legacyList).toMatchObject({total:2,mediaMode:"mentions",page:[{_id:ids.a,stats:{events:120,citations:1,media:1}}]});
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})) { /* resume */ }
 const initial=await t.withIdentity({subject:owner}).action(api.vaultReads.getPlaceWorkspace,{vaultOwnerId:owner,placeId:ids.a});
 expect(initial?.header.totals).toEqual({events:120,citations:1,media:2,context:2,research:4});
 expect(initial?.pages).toEqual({});
 expect(initial?.header.firstYear).toBe(1800);expect(initial?.header.lastYear).toBe(1919);
 async function all(section:PlaceSection){let cursor:string|null=null;const rows=[];for(let calls=0;calls<100;calls++){const r=await t.query(internal.placePages.section,{vaultOwnerId:owner,placeId:ids.a,section,cursor});expect(r.page.length).toBeLessThanOrEqual(50);rows.push(...r.page);if(r.isDone)return rows;expect(r.continueCursor).not.toBe(cursor);cursor=r.continueCursor;}throw Error("No continuation progress");}
 expect(await all("events")).toHaveLength(120);
 expect(new Set((await all("people")).map(p=>p.id))).toEqual(new Set([ids.p,ids.p2,ids.p3]));
 expect(await all("sources")).toHaveLength(1);expect(await all("context")).toHaveLength(2);expect(await all("research")).toHaveLength(4);expect(await all("media")).toHaveLength(2);
 expect(await t.query(internal.placePages.initial,{vaultOwnerId:"user_other",placeId:ids.a})).toBeNull();
 await expect(t.query(internal.placePages.section,{vaultOwnerId:"user_other",placeId:ids.a,section:"events",cursor:null})).rejects.toThrow("Place not found");
 const signed=t.withIdentity({subject:owner,issuer:"https://synthetic-local.invalid"});
 await expect(t.withIdentity({subject:"user_other",issuer:"https://synthetic-local.invalid"}).mutation(api.places.unlinkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media})).rejects.toThrow();
 expect(await signed.mutation(api.places.unlinkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media})).toEqual({linked:true});
 expect(await signed.mutation(api.places.unlinkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media})).toEqual({linked:false});
 expect(await t.run(ctx=>ctx.db.get(ids.media))).not.toBeNull();
 for(const id of [ids.c1,ids.c2])expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({state:"rejected",rejectedBy:owner,rejectedAt:expect.any(Number)});
 const unlinked=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});if(unlinked?.mode!=="indexed")throw Error("not indexed");expect(unlinked.header.totals.media).toBe(1);
 expect(await signed.mutation(api.places.unlinkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media})).toEqual({linked:false});
 await signed.mutation(api.places.linkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media});
 await t.run(async ctx=>{const db=withSearchWrites(ctx).db;const edges=await ctx.db.query("placeMediaConnectionEdges").withIndex("by_pair",q=>q.eq("vaultOwnerId",owner).eq("placeId",ids.a).eq("mediaId",ids.media)).collect();for(const edge of edges)await db.delete(ctx.db.normalizeId("connections",edge.connectionId)!);await db.patch(ids.c1,{state:"accepted"});await db.patch(ids.c2,{state:"accepted"});});
 const mention=await t.query(internal.placePages.mentions,{vaultOwnerId:owner,placeId:ids.a});expect(mention.some(m=>m.id===ids.media&&m.linked)).toBe(true);
 await t.run(async ctx=>{const db=withSearchWrites(ctx).db;await db.patch(ids.media,{archivedAt:0});await db.patch(ids.lastEvent,{place:{original:"Whitby",placeId:ids.b},date:{original:"1770",year:1770}});});
 const changed=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});if(changed?.mode!=="indexed")throw Error("not indexed");expect(changed.header.totals.media).toBe(1);expect(changed.header.totals.events).toBe(119);expect(changed.header.lastYear).toBe(1918);
 await t.run(async ctx=>{const db=withSearchWrites(ctx).db;await db.patch(ids.media,{archivedAt:undefined});await db.patch(ids.c1,{state:"rejected"});});
 const restored=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});if(restored?.mode!=="indexed")throw Error("not indexed");expect(restored.header.totals.media).toBe(2);
 await t.run(ctx=>withSearchWrites(ctx).db.delete(ids.c2));
 const removed=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});if(removed?.mode!=="indexed")throw Error("not indexed");expect(removed.header.totals.media).toBe(1);
 await t.withIdentity({subject:owner,issuer:"https://synthetic-local.invalid"}).mutation(api.places.linkMedia,{vaultOwnerId:owner,placeId:ids.a,mediaId:ids.media});
 const relinked=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.a});if(relinked?.mode!=="indexed")throw Error("not indexed");expect(relinked.header.totals.media).toBe(2);
});

test("legacy media linked before its counter backfill is removed from place totals on archive and delete",async()=>{
 vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN","https://synthetic-local.invalid");
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const p=await ctx.db.insert("places",place("Invented Parish"));
  const media=[];
  for(let i=0;i<2;i++)media.push(await ctx.db.insert("media",{vaultOwnerId:owner,title:`Legacy ${i}`,type:"photo",personIds:[],createdAt:0,updatedAt:0}));
  return {p,media};
 });
 const signed=t.withIdentity({subject:owner,issuer:"https://synthetic-local.invalid"});
 for(const mediaId of ids.media)await signed.mutation(api.places.linkMedia,{vaultOwnerId:owner,placeId:ids.p,mediaId});
 expect(await t.run(ctx=>ctx.db.query("vaultCountMembers").withIndex("by_record",q=>q.eq("recordId",String(ids.media[0]))).unique())).toBeNull();
 await t.run(async ctx=>{const db=withSearchWrites(ctx).db;await db.patch(ids.media[0],{archivedAt:0});await db.delete(ids.media[1]);});
 while(!await t.mutation(internal.vaultCounts.backfillStep,{})) { /* finish after the racing edits */ }
 const initial=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.p});
 if(initial?.mode!=="indexed")throw Error("not indexed");expect(initial.header.totals.media).toBe(0);
 expect((await t.query(internal.placePages.section,{vaultOwnerId:owner,placeId:ids.p,section:"media",cursor:null})).page).toEqual([]);
 await t.run(ctx=>withSearchWrites(ctx).db.patch(ids.media[0],{archivedAt:undefined}));
 const restored=await t.query(internal.placePages.initial,{vaultOwnerId:owner,placeId:ids.p});if(restored?.mode!=="indexed")throw Error("not indexed");expect(restored.header.totals.media).toBe(1);
});
