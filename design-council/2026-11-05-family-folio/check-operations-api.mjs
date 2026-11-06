/** Fully intercepted real Operations row-action wiring; no API request reaches a backend. */
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const report={checkedAt:new Date().toISOString(),checks:[],mockWrites:[],errors:[],unexpectedAPIs:[]};
const pass=text=>{report.checks.push(text);console.log('ok '+text);};
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Synthetic unavailable clipboard');}},configurable:true});});
 await context.route('**/api/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;
  if(path==='/api/convex/people'&&r.method()==='GET'){await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,people:[{_id:'synthetic-eleanor',displayName:'Eleanor Finch',routeId:'synthetic-eleanor'},{_id:'synthetic-target',displayName:'Invented reviewed target',routeId:'synthetic-target'}]})});return;}
  if(['/api/operations/checks','/api/operations/provisional'].includes(path)&&r.method()==='POST'){report.mockWrites.push({path,body:r.postDataJSON()});await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true})});return;}
  report.unexpectedAPIs.push(path);await route.abort();
 });
 const p=await context.newPage();p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await p.goto('http://localhost:3457/design-council-preview?surface=operations-live-controller');await expect(p.locator('table [data-row]')).toHaveCount(4);
 let row=p.locator('table [data-row="person:synthetic-eleanor"]');await row.getByText('Actions ⌄',{exact:true}).click();await row.getByRole('button',{name:'Handoff',exact:true}).click();await expect(p.getByRole('dialog').getByRole('textbox')).toHaveValue(/Compare the two invented census households/);await p.keyboard.press('Escape');pass('Handoff retains its full private packet and manual-copy fallback');
 for(const [name,status] of [['Mark birth record done','complete'],['Mark birth record not applicable','not_applicable']]){await row.getByRole('button',{name,exact:true}).click();await expect.poll(()=>report.mockWrites.length).toBe(status==='complete'?1:2);assert.deepEqual(report.mockWrites.at(-1),{path:'/api/operations/checks',body:{personIdentifier:'synthetic-eleanor',checkKey:'birth_record',status,completionSource:'user'}});}
 pass('Check updates retain the exact first-missing-check, status and completion-source contract');
 row=p.locator('table [data-row="provisional:synthetic-provisional"]');await row.getByText('Actions ⌄',{exact:true}).click();await row.getByRole('button',{name:'Promote',exact:true}).click();await expect(p.getByRole('dialog').getByRole('button',{name:'Promote',exact:true})).toBeDisabled();await p.getByRole('dialog').getByRole('textbox').fill('Reviewed invented evidence and retained all uncertainty.');await p.getByRole('dialog').getByRole('button',{name:'Promote',exact:true}).click();await expect.poll(()=>report.mockWrites.length).toBe(3);assert.deepEqual(report.mockWrites.at(-1).body,{provisionalId:'synthetic-provisional',action:'promote',humanReviewConfirmed:true,humanReviewNote:'Reviewed invented evidence and retained all uncertainty.'});pass('Promote requires a human review note and retains the explicit confirmation payload');
 await row.getByRole('button',{name:'Merge',exact:true}).click();await expect(p.getByRole('dialog').getByRole('button',{name:/Invented reviewed target/})).toBeDisabled();await expect(p.getByRole('dialog').getByRole('button',{name:/Eleanor Finch/})).toHaveCount(0);await p.getByRole('dialog').getByRole('textbox').last().fill('Reviewed target identity, source image and anchor risk.');await p.getByRole('dialog').getByRole('button',{name:/Invented reviewed target/}).click();await expect.poll(()=>report.mockWrites.length).toBe(4);assert.deepEqual(report.mockWrites.at(-1).body,{provisionalId:'synthetic-provisional',action:'merge',targetPersonIdentifier:'synthetic-target',anchorPersonIdentifier:'synthetic-eleanor',humanReviewConfirmed:true,humanReviewNote:'Reviewed target identity, source image and anchor risk.'});pass('Merge excludes the anchor and retains target identity, review note and confirmation');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedAPIs,[]);await context.close();
}finally{await browser.close();writeFileSync(new URL('./operations-api-acceptance.json',import.meta.url),JSON.stringify({...report,networkAPIRequests:0,note:'All API calls fulfilled with invented records in browser interception. Client wiring only, no backend acceptance.'},null,2)+'\n');}
console.log(`${report.checks.length} intercepted Operations checks passed.`);
