import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,cpSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
test('source-owned guard survives fresh generated builders and refuses every unapproved action registration',async()=>{
 const folder=mkdtempSync(resolve('.record-only-codegen-test-'));
 try{
 mkdirSync(resolve(folder,'_local'));mkdirSync(resolve(folder,'_generated'));
 // Simulate codegen replacing generated builders with the unmodified current source.
 cpSync('convex/_generated/server.js',resolve(folder,'_generated/server.js'));
 cpSync('sandbox-backend/convex/_local/recordOnlyServer.ts',resolve(folder,'_local/recordOnlyServer.ts'));
 const module=await import(pathToFileURL(resolve(folder,'_local/recordOnlyServer.ts')).href);
 let executed=false;
 for(const builder of [module.action,module.internalAction,module.httpAction]){
  for(const original of [()=>{executed=true;return null;},{handler:()=>{executed=true;return null;}}]){
   const wrapped=builder(original);
   await assert.rejects(()=>wrapped._handler(),/LOCAL_SANDBOX_RECORD_ONLY/);
  }
 }
 assert.equal(executed,false);
 assert.equal(readFileSync('convex/_generated/server.js','utf8'),readFileSync('sandbox-backend/convex/_generated/server.js','utf8'));
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('each vetted statement calls raw builder only through its explicit approved alias',()=>{
 const whitelist=JSON.parse(readFileSync('scripts/record-only-actions.json','utf8')) as Record<string,string[]>;
 let count=0;
 for(const [file,names] of Object.entries(whitelist)){
  const source=readFileSync('sandbox-backend/convex/'+file,'utf8');
  assert.match(source,/import \{action as recordOnlyAction\} from "\.\/_generated\/server"/);
  assert.match(source,/_local\/recordOnlyServer/);
  const uses=[...source.matchAll(/export const (\w+) = recordOnlyAction\(/g)].map(match=>match[1]);
  assert.deepEqual(uses,names);count+=uses.length;
 }
 assert.equal(count,26);
 assert.match(readFileSync('sandbox-backend/convex/vaultReads.ts','utf8'),/export const getOwnedMediaFile = action\(/);
 assert.match(readFileSync('sandbox-backend/convex/access.ts','utf8'),/return "enforce"/);
});

test('approved Node actions preserve the use-node directive before every import',()=>{
 const original=readFileSync('convex/vaultReads.ts','utf8');const snapshot=readFileSync('sandbox-backend/convex/vaultReads.ts','utf8');
 assert.match(original,/^"use node";/);assert.match(snapshot,/^"use node";/);
 assert.ok(snapshot.indexOf('"use node";')<snapshot.indexOf('import {action as recordOnlyAction}'));
 const media=readFileSync('sandbox-backend/convex/mediaEvidenceStorage.ts','utf8');assert.match(media,/^"use node";/);assert.match(media,/_local\/recordOnlyServer/);
});
