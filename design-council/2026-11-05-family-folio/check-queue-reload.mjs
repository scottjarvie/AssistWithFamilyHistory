/** Isolated, intercepted stale-version scenarios on later list/activity pages. No real API traffic. */
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('components/design/fixtures/queue.json','utf8'));
const store=new Map(fixture.items.map(item=>[item._id,structuredClone(item)]));
const activities=structuredClone(fixture.activity);
const order=['synthetic-queue-working','synthetic-queue-ai','synthetic-queue-needs-you','synthetic-queue-expired','synthetic-queue-waiting','synthetic-queue-done','synthetic-queue-old'];
const report={checkedAt:new Date().toISOString(),checks:[],reads:[],mockWrites:[],unexpectedAPIs:[],errors:[]};
const pass=text=>{report.checks.push(text);console.log('ok '+text);};
let conflict='row';
const appendEvent=(item,summary)=>{const event={...fixture.activity[item._id][0],_id:`${item._id}-new-${item.version}`,summary,itemVersion:item.version,eventType:'checkpoint',createdAt:Date.now()};activities[item._id].unshift(event);};
const browser=await chromium.launch({channel:'chrome'});
try{
 const c=await browser.newContext({viewport:{width:1440,height:1000}});
 await c.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url()),id=decodeURIComponent(url.pathname.slice('/api/queue/'.length));
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(!url.pathname.startsWith('/api/queue')){report.unexpectedAPIs.push(url.pathname);await route.abort();return;}
  if(r.method()==='GET'){
   report.reads.push(url.pathname+url.search);const start=Number(url.searchParams.get('cursor')||0),end=start+2;
   if(url.pathname==='/api/queue'){const rows=order.map(id=>store.get(id)).filter(item=>!url.searchParams.get('state')||item.state===url.searchParams.get('state'));await send({success:true,surfaceState:'ready',page:rows.slice(start,end),isDone:end>=rows.length,continueCursor:end<rows.length?String(end):''});}
   else{const item=store.get(id);assert.ok(item);const rows=activities[id];await send({success:true,surfaceState:'ready',item,activity:{page:rows.slice(start,end),isDone:end>=rows.length,continueCursor:end<rows.length?String(end):''}});}
   return;
  }
  assert.equal(r.method(),'PATCH');const body=r.postDataJSON(),item=store.get(id);assert.equal(body.expectedVersion,item.version);assert.ok(body.idempotencyKey);report.mockWrites.push({id,body});
  if(conflict){item.version++;if(conflict==='detail')Object.assign(item,{state:'done',condition:'completed',resultSummary:'Synthetic result recorded elsewhere'});appendEvent(item,'Synthetic external version change');conflict='';await send({success:false,error:'Synthetic version conflict'},409);return;}
  item.version++;
  if(body.command==='resume'){assert.ok(body.answerSummary);Object.assign(item,{state:'waiting_for_your_ai',condition:'ready',requiredAction:undefined,lastUserResponse:body.answerSummary});}
  if(body.command==='checkpoint'){assert.equal(body.leaseMs,1800000);assert.ok(body.nextStep);item.nextStep=body.nextStep;}
  appendEvent(item,'Synthetic progress recorded');await send({success:true,item});
 });
 const p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('409'))report.errors.push(m.text());});
 await p.goto('http://localhost:3457/design-council-preview?surface=queue-live-controller');await expect(p.locator('table [data-row]')).toHaveCount(2);await p.getByRole('button',{name:'Load more handoffs',exact:true}).click();await expect(p.locator('table [data-row]')).toHaveCount(4);
 await p.getByRole('button',{name:'Answer Compare Eleanor’s two census households here',exact:true}).click();await p.getByRole('textbox',{name:'Answer and resume',exact:true}).fill('Private synthetic answer on list page two');await p.getByRole('button',{name:'Return to Waiting',exact:true}).click();await p.getByRole('button',{name:'Reload this item',exact:true}).waitFor();const listReads=report.reads.filter(path=>path.startsWith('/api/queue?')).length;await p.getByRole('button',{name:'Reload this item',exact:true}).click();await expect(p.getByRole('textbox',{name:'Answer and resume',exact:true})).toHaveValue('Private synthetic answer on list page two');await expect(p.locator('table [data-row]')).toHaveCount(4);assert.equal(report.reads.filter(path=>path.startsWith('/api/queue?')).length,listReads);await p.getByRole('button',{name:'Return to Waiting',exact:true}).click();await expect(p.getByRole('textbox',{name:'Answer and resume',exact:true})).toHaveCount(0);await expect(p.locator('table [data-row]')).toHaveCount(4);pass('Reloading a conflicted row on list page two retains every loaded row, cursor and private answer');
 await p.getByRole('button',{name:/^Review the invented parish image/}).click();await p.getByRole('button',{name:'Update next step',exact:true}).click();await p.getByRole('textbox',{name:'Update the current step',exact:true}).fill('Private checkpoint kept after state changes');conflict='detail';await p.getByRole('button',{name:'Save progress',exact:true}).click();await p.getByRole('button',{name:'Reload this item',exact:true}).click();await expect(p.getByRole('button',{name:'Reopen',exact:true})).toBeVisible();await expect(p.getByRole('textbox',{name:'Update the current step',exact:true})).toHaveCount(0);pass('A conflict reload hides a command that the fresh item state no longer allows');
 const human=store.get('synthetic-queue-working');Object.assign(human,{version:human.version+1,state:'working',condition:'active',activeActorKind:'user'});appendEvent(human,'Synthetic person resumed work');await p.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await p.getByRole('button',{name:/^Review the invented parish image/}).click();await p.getByRole('button',{name:'Update next step',exact:true}).click();await expect(p.getByRole('textbox',{name:'Update the current step',exact:true})).toHaveValue('Private checkpoint kept after state changes');pass('An unavailable command keeps its draft in private memory and restores it when applicable again');
 await p.getByRole('button',{name:'Older activity',exact:true}).click();const trail=p.locator('#queue-activity-heading').locator('xpath=ancestor::section[1]').locator('ol > li');await expect(trail).toHaveCount(4);await p.getByRole('button',{name:'Save progress',exact:true}).scrollIntoViewIfNeeded();await p.evaluate(()=>{window.queueLoadingFlashes=0;window.queueLoadingObserver=new MutationObserver(()=>{if(document.querySelector('[aria-label="Loading selected Queue item"]'))window.queueLoadingFlashes++;});window.queueLoadingObserver.observe(document.querySelector('#queue-selected'),{childList:true,subtree:true});});await p.getByRole('button',{name:'Save progress',exact:true}).click();await expect(p.getByRole('textbox',{name:'Update the current step',exact:true})).toHaveCount(0);await expect(trail).toHaveCount(5);assert.equal(await p.evaluate(()=>window.queueLoadingFlashes),0);await p.evaluate(()=>window.queueLoadingObserver.disconnect());
 while(await p.getByRole('button',{name:'Older activity',exact:true}).count()){const before=await trail.count();await p.getByRole('button',{name:'Older activity',exact:true}).click();await expect.poll(()=>trail.count()).toBeGreaterThan(before);}await expect(trail).toHaveCount(activities[human._id].length);pass('Successful progress quietly refreshes the thread, keeps earlier activity pages and de-duplicates overlapping cursors');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedAPIs,[]);await c.close();
}finally{await browser.close();writeFileSync(new URL('./queue-reload-acceptance.json',import.meta.url),JSON.stringify({...report,networkAPIRequests:0,note:'All API requests browser-fulfilled with invented data. Client behavior only, no backend acceptance.'},null,2)+'\n');}
console.log(`${report.checks.length} intercepted Queue reload checks passed.`);
