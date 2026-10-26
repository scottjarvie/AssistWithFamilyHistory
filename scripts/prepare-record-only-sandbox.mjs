// Source-only local native snapshot. No runtime, state, deploy or provider changes.
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// RECORD_ONLY_SANDBOX_TARGET lets the snapshot test prepare a throwaway copy.
const target=process.env.RECORD_ONLY_SANDBOX_TARGET?resolve(process.env.RECORD_ONLY_SANDBOX_TARGET):resolve(root,'sandbox-backend');
if(existsSync(resolve(target,'.convex')))throw Error('Persistent state exists: preserve it and coordinate source adoption');
if(existsSync(target))throw Error('Snapshot exists: explicitly preserve/archive before preparation');
const whitelist=JSON.parse(readFileSync(resolve(root,'scripts/record-only-actions.json')));
const hashes=JSON.parse(readFileSync(resolve(root,'scripts/record-only-action-hashes.json')));
mkdirSync(target,{recursive:true});
const archive=resolve(target,'.tracked-source.tar');
execFileSync('git',['archive','--output',archive,'HEAD'],{cwd:root});
// Relative paths: GNU tar on Windows reads a drive letter (C:) as a remote host.
execFileSync('tar',['-xf','.tracked-source.tar'],{cwd:target});unlinkSync(archive);
function runtimeFiles(directory) {return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?runtimeFiles(resolve(directory,entry.name)):[resolve(directory,entry.name)]);}
const rewritten=[];
for(const file of runtimeFiles(resolve(target,'convex'))){
 const relative=file.slice(resolve(target,'convex').length+1).split(sep).join('/');
 if(relative.startsWith('_generated/')||relative.startsWith('tests/')||relative.includes('.test.')||!/\.[jt]s$/.test(file))continue;
 const source=readFileSync(file,'utf8');
 if(/\b(?:actionGeneric|internalActionGeneric|httpActionGeneric)\b/.test(source))throw Error('Unreviewed direct builder '+relative);
 const next=source.replace(/(['"])(\.{1,2}(?:\/\.\.)*\/)_(?:generated)\/server(?:\.js)?\1/g,(_match,quote,prefix)=>`${quote}${prefix}_local/recordOnlyServer${quote}`);
 if(next!==source){writeFileSync(file,next);rewritten.push(relative);}
}
for(const [file,names] of Object.entries(whitelist)){
 // Hash the committed (LF) text even in a CRLF Windows checkout.
 const original=readFileSync(resolve(root,'convex',file),'utf8').replace(/\r\n/g,'\n');
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
 output=output.replace(/(['"])(\.{1,2}(?:\/\.\.)*\/)_(?:generated)\/server(?:\.js)?\1/g,(_match,quote,prefix)=>`${quote}${prefix}_local/recordOnlyServer${quote}`);
 const alias='import {action as recordOnlyAction} from "./_generated/server";\n';
 const first=source.statements[0];
 // Convex recognizes a runtime directive only before every import/statement.
 if(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text==='use node') {
  output=output.slice(0,first.end)+'\n'+alias+output.slice(first.end);
 } else output=alias+output;
 writeFileSync(resolve(target,'convex',file),output);
}
writeFileSync(resolve(target,'convex/crons.ts'),'import {cronJobs} from "convex/server";\nexport default cronJobs();\n');
writeFileSync(resolve(target,'convex/auth.config.ts'),'export default {providers:[{domain:"https://improved-ram-86.clerk.accounts.dev",applicationID:"convex"}]};\n');
mkdirSync(resolve(target,'convex/_local'),{recursive:true});
const wrapper=`// Source-owned native record-only gate. Codegen never replaces this module.
export * from '../_generated/server';
import {action as realAction,internalAction as realInternalAction,httpAction as realHttpAction} from '../_generated/server';
async function refuse(){throw Error('LOCAL_SANDBOX_RECORD_ONLY: action/provider unavailable');}
function blockedDefinition(definition:unknown){return {...(definition&&typeof definition==='object'?definition:{}),handler:refuse};}
export const action=((definition:unknown)=>realAction(blockedDefinition(definition) as never)) as typeof realAction;
export const internalAction=((definition:unknown)=>realInternalAction(blockedDefinition(definition) as never)) as typeof realInternalAction;
export const httpAction=(()=>realHttpAction(refuse)) as typeof realHttpAction;
`;
writeFileSync(resolve(target,'convex/_local/recordOnlyServer.ts'),wrapper);
// Local backend always enforces owner checks; never preserves legacy shadow denials.
const accessPath=resolve(target,'convex/access.ts');let access=readFileSync(accessPath,'utf8');
const original='return value === "enforce" ? "enforce" : "shadow";';if(!access.includes(original))throw Error('Unknown trust boundary shape');access=access.replace(original,'return "enforce"; // isolated native snapshot: always enforce existing owner checks');writeFileSync(accessPath,access);
writeFileSync(resolve(target,'source-receipt.json'),JSON.stringify({status:'source only; no database/start/push/browser proof',deploymentName:'anonymous-family-history-completion-20261007',cloudPort:4323,sitePort:4324,issuer:'https://improved-ram-86.clerk.accounts.dev',audience:'convex',ownerChecks:'always enforce original existing owner policy',actions:whitelist,codegenPolicy:'Generated server untouched; source-owned wrapper survives codegen; --codegen disable remains acceptable for locked snapshot',wrapperGuardSha256:createHash('sha256').update(wrapper).digest('hex'),buildersRewritten:rewritten,crons:'empty'},null,2)+'\n');
console.log('Prepared record-only source at '+target+'; no runtime or state provisioned.');
