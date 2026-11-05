/** Real client controller, fully intercepted invented API. No request reaches an API/backend. */
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('components/design/fixtures/queue.json','utf8'));
const store=new Map(fixture.items.map(item=>[item._id,structuredClone(item)]));
const report={checkedAt:new Date().toISOString(),checks:[],mockWrites:[],unexpectedAPIs:[],errors:[]};
const pass=text=>{report.checks.push(text);console.log('ok '+text);};
let conflict=false,created=0;
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!url.pathname.startsWith('/api/queue')){report.unexpectedAPIs.push(url.href);await route.abort();return;}
  const send=async(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  const id=decodeURIComponent(url.pathname.slice('/api/queue/'.length));
  if(request.method()==='GET'){
   if(url.pathname==='/api/queue'){const page=[...store.values()].filter(item=>!url.searchParams.get('state')||item.state===url.searchParams.get('state'));await send({success:true,surfaceState:'ready',page,isDone:true,continueCursor:''});}
   else {const item=store.get(id);if(!item){await send({success:false,error:'Invented item not found'},404);return;}await send({success:true,surfaceState:'ready',item,activity:{page:fixture.activity[id]||[],isDone:true,continueCursor:''}});}
   return;
  }
  const body=request.postDataJSON();report.mockWrites.push({method:request.method(),path:url.pathname,body});
  if(request.method()==='POST'){
   assert.ok(body.directive);assert.equal(body.priority,'high');assert.ok(body.priorityReason);assert.equal(body.chosenAiId,'oauth-chosen-ai');assert.ok(body.idempotencyKey);
   const item={...structuredClone(fixture.items[3]),_id:`synthetic-created-${++created}`,directive:body.directive,summary:body.directive,requestedOutcome:body.requestedOutcome,priority:body.priority,priorityReason:body.priorityReason,condition:'ready',version:1,updatedAt:Date.now()};store.set(item._id,item);await send({success:true,item});return;
  }
  if(request.method()==='DELETE'){assert.equal(body.confirmation,'delete_queue_item_and_history');assert.ok(store.has(id));store.delete(id);await send({success:true});return;}
  assert.equal(request.method(),'PATCH');const item=store.get(id);assert.ok(item);assert.equal(body.expectedVersion,item.version);assert.ok(body.idempotencyKey);
  if(conflict){conflict=false;await send({success:false,error:'Synthetic version conflict'},409);return;}
  const patch={version:item.version+1,updatedAt:Date.now()};
  if(body.command==='claim'||body.command==='checkpoint'){assert.equal(body.leaseMs,1800000);assert.ok(body.nextStep);Object.assign(patch,{state:'working',condition:'active',activeActorKind:'user',nextStep:body.nextStep});}
  if(body.command==='complete'){assert.ok(body.resultSummary);Object.assign(patch,{state:'done',condition:'completed',resultSummary:body.resultSummary,completedAt:Date.now()});}
  if(body.command==='reopen'){assert.ok(body.reason);Object.assign(patch,{state:'waiting_for_your_ai',condition:'ready',resultSummary:undefined,resultRefs:undefined,completedAt:undefined,canceledReason:undefined,lastReopenReason:body.reason});}
  if(body.command==='cancel'){assert.ok(body.reason);Object.assign(patch,{state:'done',condition:'canceled',canceledReason:body.reason,resultSummary:'Canceled: '+body.reason,completedAt:Date.now(),canceledAt:Date.now()});}
  if(body.command==='resume'){assert.ok(body.answerSummary);Object.assign(patch,{state:'waiting_for_your_ai',condition:'ready',requiredAction:undefined,lastUserResponse:body.answerSummary});}
  Object.assign(item,patch);await send({success:true,item});
 });
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('409'))report.errors.push(message.text());});
 await page.goto('http://localhost:3457/design-council-preview?surface=queue-live-controller');await page.locator('table [data-row]').first().waitFor();
 await page.getByRole('button',{name:/^Look for an invented trade-directory entry/}).click();await page.getByRole('button',{name:'Work on this myself',exact:true}).click();await page.getByRole('textbox',{name:'Work on this yourself',exact:true}).fill('Synthetic claim plan');await page.getByRole('button',{name:'Start working',exact:true}).click();await expect(page.getByRole('button',{name:'Update next step',exact:true})).toBeVisible();pass('Claim keeps lease, expected version and idempotency fields and updates the selected thread');
 await page.getByRole('button',{name:'Update next step',exact:true}).click();await page.getByRole('textbox',{name:'Update the current step',exact:true}).fill('Synthetic next step');conflict=true;await page.getByRole('button',{name:'Save progress',exact:true}).click();await expect(page.getByRole('textbox',{name:'Update the current step',exact:true})).toHaveValue('Synthetic next step');await page.getByText('This item changed elsewhere. Reload it before trying again.',{exact:true}).waitFor();await page.getByRole('button',{name:'Save progress',exact:true}).click();await expect(page.getByRole('textbox',{name:'Update the current step',exact:true})).toHaveCount(0);pass('A version conflict retains the unfinished checkpoint; successful retry clears it');
 await page.getByRole('button',{name:'Record result',exact:true}).click();await page.getByRole('textbox',{name:'Record the result',exact:true}).fill('Synthetic completed comparison with uncertainty retained');await page.getByRole('button',{name:'Mark Done',exact:true}).click();await expect(page.getByRole('button',{name:'Reopen',exact:true})).toBeVisible();pass('Complete records the supplied result without a publication or identity action');
 await page.getByRole('button',{name:'Reopen',exact:true}).click();await page.getByRole('textbox',{name:'Reopen this handoff',exact:true}).fill('Synthetic reason to compare another source');await page.getByRole('button',{name:'Reopen in Waiting',exact:true}).click();await expect(page.getByRole('button',{name:'Work on this myself',exact:true})).toBeVisible();pass('Reopen records the reason and returns to Waiting without running work');
 await page.getByRole('button',{name:'Cancel handoff',exact:true}).click();await page.getByRole('textbox',{name:'Cancel this handoff',exact:true}).fill('Synthetic superseding question');await page.getByRole('button',{name:'Record cancellation',exact:true}).click();await expect(page.getByRole('button',{name:'Reopen',exact:true})).toBeVisible();pass('Cancel retains its reason and closes the same handoff');
 await page.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await page.getByRole('button',{name:/^Answer .* here$/}).first().click();await page.getByRole('textbox',{name:'Answer and resume',exact:true}).fill('Synthetic answer while keeping the source conflict');await page.getByRole('button',{name:'Return to Waiting',exact:true}).click();await expect(page.getByRole('textbox',{name:'Answer and resume',exact:true})).toHaveCount(0);pass('Inline row answer sends the existing resume command and preserves the answer in the returned record');
 await page.getByRole('button',{name:'Leave a directive',exact:true}).click();await page.getByRole('textbox',{name:'Directive',exact:true}).fill('A new synthetic directive');await page.getByRole('textbox',{name:'A useful result (optional)',exact:true}).fill('An invented evidence comparison');await page.getByRole('combobox',{name:'Priority',exact:true}).selectOption('high');await page.getByRole('textbox',{name:'Why high priority?',exact:true}).fill('Synthetic priority reason');await page.getByRole('button',{name:'Save directive',exact:true}).click();await page.locator('#queue-detail-title').filter({hasText:'A new synthetic directive'}).waitFor();pass('Create preserves directive, desired outcome, required high-priority reason and chosen-AI handoff fields');
 await page.getByRole('button',{name:'Delete item and activity',exact:true}).click();await page.getByRole('button',{name:'Keep it',exact:true}).click();assert.equal(report.mockWrites.filter(write=>write.method==='DELETE').length,0);await page.getByRole('button',{name:'Delete item and activity',exact:true}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('table [data-row="synthetic-created-1"]')).toHaveCount(0);pass('Permanent deletion keeps explicit confirmation and removes only the selected invented record');
 assert.equal(report.mockWrites.filter(write=>write.method==='PATCH').length,7);assert.deepEqual(report.unexpectedAPIs,[]);assert.deepEqual(report.errors,[]);await context.close();
}finally{await browser.close();writeFileSync(new URL('./queue-api-acceptance.json',import.meta.url),JSON.stringify({...report,networkAPIRequests:0,note:'All API requests intercepted and fulfilled in the browser. This proves client wiring, not backend acceptance.'},null,2)+'\n');}
console.log(`${report.checks.length} intercepted Queue controller checks passed.`);
