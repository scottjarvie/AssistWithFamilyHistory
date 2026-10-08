// Source-only local native snapshot. No runtime, state, deploy or provider changes.
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(root,'sandbox-backend');
if(existsSync(resolve(target,'.convex')))throw Error('Persistent state exists: preserve it and coordinate source adoption');
const whitelist=JSON.parse(readFileSync(resolve(root,'scripts/record-only-actions.json')));
const hashes=JSON.parse(readFileSync(resolve(root,'scripts/record-only-action-hashes.json')));
mkdirSync(target,{recursive:true});
cpSync(resolve(root,'convex'),resolve(target,'convex'),{recursive:true,filter:p=>!p.includes('.test.')});
cpSync(resolve(root,'lib'),resolve(target,'lib'),{recursive:true,filter:p=>!p.includes('.test.')});
if(existsSync(resolve(root,'convex.json')))cpSync(resolve(root,'convex.json'),resolve(target,'convex.json'));
writeFileSync(resolve(target,'package.json'),JSON.stringify({private:true,type:'module',dependencies:JSON.parse(readFileSync(resolve(root,'package.json'))).dependencies},null,2)+'\n');
for(const [file,names] of Object.entries(whitelist)){
 const original=readFileSync(resolve(root,'convex',file),'utf8');
 const source=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true);
 const replacements=[];const found=new Set();
 for(const statement of source.statements){
  if(!ts.isVariableStatement(statement)||!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  for(const declaration of statement.declarationList.declarations){
   if(!ts.isIdentifier(declaration.name)||!names.includes(declaration.name.text))continue;
   const name=declaration.name.text;const initializer=declaration.initializer;
   if(!initializer||!ts.isCallExpression(initializer)||initializer.expression.getText(source)!=='action')throw Error('Unrecognized approved action shape '+file+':'+name);
   const hash=createHash('sha256').update(statement.getText(source)).digest('hex');
   if(hashes[file+':'+name]!==hash)throw Error('Approved action source changed: re-review '+file+':'+name);
   found.add(name);replacements.push([initializer.expression.getStart(source),initializer.expression.end]);
  }
 }
 if(found.size!==names.length)throw Error('Missing approved handler '+file);
 let output=original;for(const [start,end] of replacements.reverse())output=output.slice(0,start)+'recordOnlyAction'+output.slice(end);
 writeFileSync(resolve(target,'convex',file),'import {actionGeneric as recordOnlyAction} from "convex/server";\n'+output);
}
writeFileSync(resolve(target,'convex/crons.ts'),'import {cronJobs} from "convex/server";\nexport default cronJobs();\n');
writeFileSync(resolve(target,'convex/auth.config.ts'),'export default {providers:[{domain:"https://improved-ram-86.clerk.accounts.dev",applicationID:"convex"}]};\n');
const guardPath=resolve(target,'convex/_generated/server.js');let server=readFileSync(guardPath,'utf8');
for(const [name,builder] of [['action','actionGeneric'],['internalAction','internalActionGeneric'],['httpAction','httpActionGeneric']]){
 const from=`export const ${name} = ${builder};`;if(!server.includes(from))throw Error('Unknown generated shape');server=server.replace(from,`export const ${name}=(definition)=>disabledAction(${builder},definition);`);
}
server+='\nfunction disabledAction(builder,definition){const handler=async()=>{throw Error("LOCAL_SANDBOX_RECORD_ONLY: action/provider unavailable");};if(builder===httpActionGeneric)return builder(handler);return builder(typeof definition==="function"?handler:{...definition,handler});}\n';
writeFileSync(guardPath,server);
// Local backend always enforces owner checks; never preserves legacy shadow denials.
const accessPath=resolve(target,'convex/access.ts');let access=readFileSync(accessPath,'utf8');
const original='return value === "enforce" ? "enforce" : "shadow";';if(!access.includes(original))throw Error('Unknown trust boundary shape');access=access.replace(original,'return "enforce"; // isolated native snapshot: always enforce existing owner checks');writeFileSync(accessPath,access);
writeFileSync(resolve(target,'source-receipt.json'),JSON.stringify({status:'source only; no database/start/push/browser proof',deploymentName:'anonymous-family-history-completion-20261007',cloudPort:4323,sitePort:4324,issuer:'https://improved-ram-86.clerk.accounts.dev',audience:'convex',ownerChecks:'always enforce original existing owner policy',actions:whitelist,requiredPushFlag:'--codegen disable',generatedGuardSha256:createHash('sha256').update(server).digest('hex'),crons:'empty'},null,2)+'\n');
console.log('Prepared record-only source at '+target+'; no runtime or state provisioned.');
