import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {localLiveEnabled,localSandboxEnabled,LOCAL_LIVE_ISSUER,LOCAL_SANDBOX_ISSUER,verifyLocalSession,verifyLocalConvexToken} from '../lib/localLiveAuth';
let pair: Awaited<ReturnType<typeof generateKeyPair>>; before(async()=>{pair=await generateKeyPair('RS256');}); const keys=async()=>pair.publicKey;
const now=Math.floor(Date.now()/1000);
const token=(claims:Record<string,unknown>,key=pair.privateKey)=>new SignJWT({iss:LOCAL_LIVE_ISSUER,sub:'user_synthetic',sid:'sess_synthetic',azp:'https://local.assistwithfamilyhistory.com',nbf:now-1,iat:now,exp:now+120,...claims}).setProtectedHeader({alg:'RS256'}).sign(key);
test('signed session establishes owner only from own issuer and exact local origin',async()=>{
 assert.deepEqual(await verifyLocalSession(await token({}),keys),{userId:'user_synthetic',sessionId:'sess_synthetic'});
 for(const claims of [{iss:'https://wrong.clerk.accounts.dev'},{azp:'https://attacker.example'},{exp:1},{nbf:now+500},{sts:'pending'},{sub:'guest_unsafe'},{sid:undefined}])assert.equal(await verifyLocalSession(await token(claims),keys),null);
 const other=await generateKeyPair('RS256');assert.equal(await verifyLocalSession(await token({},other.privateKey),keys),null);
});
test('Convex bridge requires independently signed audconvex token for the same verified subject',async()=>{
 const session=await verifyLocalSession(await token({}),keys);assert.ok(session);
 assert.ok(await verifyLocalConvexToken(await token({aud:'convex',sid:undefined}),session,keys));
 for(const claims of [{aud:'other'},{sub:'user_other',aud:'convex'},{iss:LOCAL_SANDBOX_ISSUER,aud:'convex'},{aud:'convex',exp:1},{aud:'convex',azp:'https://attacker.example'}])assert.equal(await verifyLocalConvexToken(await token(claims),session,keys),null);
 assert.equal(await verifyLocalConvexToken(await token({aud:'convex'}),null,keys),null);
});
test('Sandbox identity never accepts production session or generic shared localhost origin',async()=>{
 const claims={iss:LOCAL_SANDBOX_ISSUER,azp:'http://family-history.localhost:3443'};
 const session=await verifyLocalSession(await token(claims),keys,'sandbox');assert.ok(session);
 assert.ok(await verifyLocalConvexToken(await token({...claims,aud:'convex'}),session,keys,'sandbox'));
 assert.equal(await verifyLocalSession(await token({...claims,azp:'http://localhost:3443'}),keys,'sandbox'),null);
 assert.equal(await verifyLocalSession(await token({}),keys,'sandbox'),null);
});
test('public-only adapters failclosed outside exact local mode and endpoint',()=>{
 const live={NODE_ENV:'development',LOCAL_DEVELOPMENT_MODE:'live',CONVEX_DEPLOYMENT:'prod:gallant-mallard-74',NEXT_PUBLIC_CONVEX_URL:'https://gallant-mallard-74.convex.cloud'};assert.equal(localLiveEnabled(live),true);
 for(const wrong of [{NODE_ENV:'production'},{VERCEL:'1'},{CI:'1'},{CLERK_SECRET_KEY:'placeholder'},{NEXT_PUBLIC_CONVEX_URL:'https://wrong.convex.cloud'}])assert.equal(localLiveEnabled({...live,...wrong}),false);
 assert.equal(localSandboxEnabled({...live,LOCAL_DEVELOPMENT_MODE:'sandbox'}),false);
});
