/// <reference types="vite/client" />
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { FAMILY_HISTORY_SCOPES } from "../lib/mcp/catalog";
import { prepareLegacyOwner } from "../lib/mcp/testSupport";
const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "user_floor", issuer: "https://identity.example.test", clientId: "original" };
async function setup() {
 const t = convexTest(schema, modules);
 const connect = (clientId = identity.clientId, issuer = identity.issuer, observedClientName?: string) => t.mutation(internal.mcpGrants.resolveForRequest, { ...identity, clientId, issuer, observedClientName });
 await connect();
 const read = (clientId = identity.clientId, issuer = identity.issuer) => t.query(internal.mcpGrants.describeCallingConnection, { ...identity, clientId, issuer });
 const limit = async (action: "limit" | "pause" | "revoke", extra = {}, clientId = identity.clientId) => t.mutation(internal.mcpGrants.limitCallingConnection, { ...identity, clientId, action, revision: (await read(clientId)).revision, opId: crypto.randomUUID(), ...extra });
 const person = async (clientId: string, action: string) => {
  const list = await t.withIdentity({subject: identity.subject}).action(api.mcpGrants.listConnections, {vaultOwnerId: identity.subject});
  const row = list.connections.find(r => r.clientId === clientId)!;
  return t.withIdentity({subject: identity.subject}).mutation(api.mcpGrants.controlGrant, {vaultOwnerId: identity.subject, grantId: row.id, action, revision: row.revision ?? 0, carriedRevision: row.carriedRevision, opId: crypto.randomUUID()});
 };
 return {t, connect, read, limit, person};
}
describe("Decision 4 v2: one person floor, independent connections", () => {
 test.each([undefined, "Same name", "Different name", "Claude-User/1.0"])("names never change inheritance: %s", async name => {
  const {connect, limit, read} = await setup(); await limit("revoke");
  expect((await connect("new", "https://other-issuer.test", name)).state).toBe("revoked");
  expect((await read("new", "https://other-issuer.test")).tools).toEqual(["family_history_connection", "family_history_limit_connection"]);
 });
 test("existing client id retains its grant and names never merge it", async () => {
  const {connect, limit, read, t} = await setup(); await connect("already-existing"); await limit("revoke");
  expect((await connect("already-existing", identity.issuer, "Same name")).state).toBe("active");
  expect((await read()).state).toBe("revoked");
  expect(await t.run(ctx => ctx.db.query("mcpGrants").collect())).toHaveLength(2);
 });
 test("floor unions powers, pause and earliest end date across independent sources", async () => {
  const {connect, limit, read} = await setup(); await connect("second");
  const end = Date.now() + 100000;
  await limit("limit", {removeScopes:["family_history:research:write"], endsAt:end});
  await limit("limit", {removeScopes:["family_history:story:draft"], endsAt:end+1000}, "second");
  await limit("pause", {}, "second"); await connect("third");
  expect(await read("third")).toMatchObject({state:"paused", endsAt:end, powers:FAMILY_HISTORY_SCOPES.filter(s => !["family_history:research:write", "family_history:story:draft"].includes(s))});
 });
 test("person Restore releases inherited revisions; a later restriction counts again", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(2000000);
  try {
   const {connect, limit, read, person} = await setup(); await limit("revoke"); await connect("second");
   await person("second", "restore"); expect((await read("second")).state).toBe("active");
   expect((await read()).state).toBe("revoked");
   expect((await connect("third")).state).toBe("active");
   clock.mockReturnValue(1000000); await limit("pause");
   expect((await connect("fourth")).state).toBe("revoked");
   expect((await read("second")).state).toBe("active");
  } finally {clock.mockRestore();}
 });
 test("Forget stops a revoked source counting, without enabling its old token", async () => {
  const {connect, limit, person, read} = await setup(); await limit("revoke"); await person(identity.clientId,"remove");
  expect((await connect("new")).state).toBe("active"); expect((await read()).state).toBe("revoked");
 });
 test("all legacy pages count and Settings lists every current connection", async () => {
  const t=convexTest(schema,modules);
  for(let start=0; start<1005; start+=100) await t.run(async ctx => {
   for(let i=start; i<Math.min(start+100,1005); i++) await ctx.db.insert("mcpGrants", {vaultOwnerId:identity.subject,issuer:identity.issuer,clientId:`old-${i}`,label:"Legacy",clientProvenance:"manual",scopes:[...FAMILY_HISTORY_SCOPES],scopeChoice:"full",expiryChoice:"none",boundary:{kind:"whole_workspace"},status:i===0?"revoked":"active",requestedAt:i,updatedAt:i,useCount:0});
  });
  expect((await t.mutation(internal.mcpGrants.resolveForRequest,{...identity,clientId:"new"})).state).toBe("pending");
  await prepareLegacyOwner(t,identity.subject);
  expect((await t.mutation(internal.mcpGrants.resolveForRequest,{...identity,clientId:"new"})).state).toBe("revoked");
  const list=await t.withIdentity({subject:identity.subject}).action(api.mcpGrants.listConnections,{vaultOwnerId:identity.subject});
  expect(list.connections).toHaveLength(1006); expect(list.connections.filter(r=>r.status==="revoked")).toHaveLength(2);
 }, 20000);
 test("a stale person release cannot override a newer source revision", async () => {
  const {t,connect,limit,read}=await setup(); await limit("revoke"); await connect("second");
  const list=await t.withIdentity({subject:identity.subject}).action(api.mcpGrants.listConnections,{vaultOwnerId:identity.subject}); const row=list.connections.find(r=>r.clientId==="second")!;
  await limit("pause");
  await expect(t.withIdentity({subject:identity.subject}).mutation(api.mcpGrants.controlGrant,{vaultOwnerId:identity.subject,grantId:row.id,action:"restore",revision:row.revision??0,carriedRevision:row.carriedRevision,opId:"stale"})).rejects.toThrow("STALE_VERSION");
  expect((await read("second")).state).toBe("revoked");
 });
});

test("v1 cross-client links are split by complete bootstrap without widening either connection", async () => {
 const {t,limit,read,person,connect}=await setup(); await limit("revoke");
 await t.run(async ctx=>{
  const root=(await ctx.db.query("mcpGrants").collect())[0];
  const {_id,_creationTime,...fields}=root;void _creationTime;
  await ctx.db.insert("mcpGrants",{...fields,clientId:"old-linked",authorityGrantId:_id,hiddenAt:1});
  await ctx.db.insert("mcpClientAliases",{vaultOwnerId:identity.subject,issuer:identity.issuer,clientId:"old-linked",grantId:_id});
  const carried=(await ctx.db.query("mcpCarriedRestrictions").collect())[0];await ctx.db.patch(carried._id,{policyVersion:undefined});
 });
 expect((await connect("old-linked")).state).toBe("pending");await prepareLegacyOwner(t,identity.subject);
 expect((await connect("old-linked")).state).toBe("revoked");await person(identity.clientId,"restore");
 expect((await read()).state).toBe("active");expect((await read("old-linked")).state).toBe("revoked");
});
test("freshly observed Restore cannot release a newer revision on its source", async()=>{
 const {connect,limit,person,read}=await setup();await limit("revoke");await connect("second");await limit("pause");
 await person("second","restore");expect((await read("second")).state).toBe("active");expect((await connect("third")).state).toBe("revoked");
});
test("v1 person-restored authority is preserved when an old revoked child is split",async()=>{
 const {t,connect,read}=await setup();
 await t.run(async ctx=>{
  const root=(await ctx.db.query("mcpGrants").collect())[0];const {_id,_creationTime,...fields}=root;void _creationTime;
  await ctx.db.insert("mcpGrants",{...fields,clientId:"previously-revoked-child",status:"revoked",authorityGrantId:_id,hiddenAt:1});
  await ctx.db.insert("mcpClientAliases",{vaultOwnerId:identity.subject,issuer:identity.issuer,clientId:"previously-revoked-child",grantId:_id});
  const carry=(await ctx.db.query("mcpCarriedRestrictions").collect())[0];await ctx.db.patch(carry._id,{policyVersion:undefined});
 });
 expect((await connect("previously-revoked-child")).state).toBe("pending");await prepareLegacyOwner(t,identity.subject);
 expect((await connect("previously-revoked-child")).state).toBe("active");expect((await read()).state).toBe("active");
 expect((await connect("new-after-split")).state).toBe("active");
});
test("Forget on an inherited connection does not release its original source",async()=>{
 const {connect,limit,person}=await setup();await limit("revoke");await connect("second");await person("second","remove");
 expect((await connect("third")).state).toBe("revoked");
});
