/** Opus27bee8e follow-ups: real table geometry, staged facets, URL history and retained private drafts. */
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const base='http://localhost:3457/design-council-preview';
const fixture=JSON.parse(readFileSync('components/design/fixtures/queue.json','utf8'));
const report={checkedAt:new Date().toISOString(),checks:[],errors:[],unexpectedAPIs:[],mockWrites:[]};
const pass=text=>{report.checks.push(text);console.log('ok '+text);};
const observe=p=>{p.on('pageerror',e=>report.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('409'))report.errors.push(m.text());});};
const browser=await chromium.launch({channel:'chrome'});
try{
 for(const width of [1440,1280]){
  const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();observe(p);
  for(const surface of ['operations','people','research']){
   await p.goto(base+'?surface='+surface);const table=p.locator('table.collection-table').first();await table.waitFor();
   const fit=await table.evaluate(t=>({table:t.scrollWidth,container:t.parentElement.clientWidth,head:t.querySelectorAll('thead').length,cells:[...t.querySelectorAll('td[data-label]')].map(cell=>({label:cell.dataset.label,width:cell.clientWidth,scroll:cell.scrollWidth}))}));
   assert.ok(fit.table<=fit.container+1,JSON.stringify({width,surface,...fit}));assert.equal(fit.head,1);const identityWidth=await table.locator('tr[data-row] th[scope=row]').first().evaluate(n=>n.clientWidth);const metricLabel=surface==='operations'?'Type':surface==='people'?'Sources':'Priority';const metricWidth=await table.locator(`td[data-label="${metricLabel}"]`).first().evaluate(n=>n.clientWidth);assert.ok(identityWidth>metricWidth*1.5,`${surface} weighted columns must actually apply`);
   assert.deepEqual(fit.cells.filter(cell=>cell.scroll>cell.width+1),[],`${surface} ${width}px overflowing cells`);
   if(surface==='operations'){
    const first=p.locator('table [data-row]').first(),wrapper=await table.locator('..').boundingBox();
    const action=await first.locator('td[data-label="Next action"]').boundingBox();assert.ok(action.x+action.width<=wrapper.x+wrapper.width+1);
    assert.equal(await first.locator('th[scope=row] .operation-details').evaluate(n=>getComputedStyle(n).display),'none');
    assert.equal(await p.locator('table tbody').count(),3);const wordRects=await p.locator('table [data-row="provisional:synthetic-provisional"] strong').evaluate(node=>{const range=document.createRange();range.setStart(node.firstChild,0);range.setEnd(node.firstChild,8);return range.getClientRects().length;});assert.equal(wordRects,1,'An ordinary first word should not fracture in the identity column');
    await first.locator('summary').filter({hasText:'Actions'}).click();const identity=await first.locator('th[scope=row]').boundingBox();for(const button of await first.locator('th[scope=row] button, th[scope=row] a').all()){const box=await button.boundingBox();if(box)assert.ok(box.x>=identity.x-1&&box.x+box.width<=identity.x+identity.width+1,`Expanded action stays inside Entry at${width}`);}await first.locator('summary').filter({hasText:'Actions'}).click();
   }
   pass(`${width}px ${surface} keeps every selected field inside one aligned, readable-width table`);
  }
  await c.close();
 }
 const c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();observe(p);await c.route('**/api/**',r=>{report.unexpectedAPIs.push(r.request().url());return r.abort();});
 await p.goto(base+'?surface=operations');await p.getByRole('textbox',{name:'Search operations',exact:true}).fill('Unsubmitted search');
 await p.getByRole('button',{name:'Filter research rows',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'Canonical people',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();await expect(p.getByRole('button',{name:'Filter research rows',exact:true})).toBeFocused();await expect(p.getByRole('textbox',{name:'Search operations',exact:true})).toHaveValue('Unsubmitted search');assert.ok(!new URL(p.url()).searchParams.has('type'));
 await p.getByRole('textbox',{name:'Search operations',exact:true}).fill('Finch');let navigations=0;p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())navigations++;});
 await p.getByRole('button',{name:'Filter research rows',exact:true}).click();const dialog=p.getByRole('dialog');
 for(const name of ['Canonical people','Ready to review','Completion','Ascending'])await dialog.getByRole('button',{name,exact:true}).click();
 assert.equal(navigations,0);await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Apply',exact:true}).click();await expect(p.locator('table [data-row]')).toHaveCount(1);assert.equal(navigations,1);
 const url=new URL(p.url());assert.equal(url.searchParams.get('q'),'Finch');assert.equal(url.searchParams.get('type'),'person');assert.equal(url.searchParams.get('storyWorkflow'),'ready_to_review');assert.equal(url.searchParams.get('sortBy'),'completion');assert.equal(url.searchParams.get('sortDirection'),'asc');assert.ok(!url.searchParams.has('missingCheck'));
 pass('Shared filter sheet cancels cleanly, retains typed search and applies four staged values with one GET');
 await p.goto(base+'?surface=operations-empty&sortBy=completion&sortDirection=asc');await p.getByRole('heading',{name:'This vault does not have any people yet',exact:true}).waitFor();await expect(p.getByRole('link',{name:'All research',exact:true})).toHaveAttribute('aria-current','page');await expect(p.getByRole('link',{name:'Import capture package',exact:true})).toBeVisible();await p.getByRole('button',{name:'Filter research rows',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'Default: missing critical',exact:true}).waitFor();await p.getByRole('dialog').getByRole('button',{name:'Default: descending',exact:true}).waitFor();await p.keyboard.press('Escape');pass('Ordering never turns an empty vault into a filtered-empty claim and both defaults have real names');
 await c.close();
 const nav=await browser.newContext({viewport:{width:1440,height:1000}}),q=await nav.newPage();observe(q);await nav.route('**/api/**',r=>{report.unexpectedAPIs.push(r.request().url());return r.abort();});
 await q.goto(base+'?surface=home');await q.goto(base+'?surface=queue');await q.locator('table [data-row]').first().waitFor();await q.getByRole('combobox',{name:'Sort loaded records',exact:true}).selectOption('title');await q.getByRole('button',{name:'Reverse sort direction',exact:true}).click();
 const order=await q.locator('table [data-queue-item]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.queueItem,title:n.childNodes[0].textContent})));
 for(let i=0;i<3;i++){
  await q.locator('table [data-queue-item]').first().click();await expect(q.locator('#queue-detail-title')).toHaveText(order[0].title);await q.getByRole('button',{name:'Next loaded handoff',exact:true}).click();await expect(q.locator('#queue-detail-title')).toHaveText(order[1].title);await q.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await expect(q.locator(`table [data-queue-item="${order[1].id}"]`)).toBeFocused();await expect(q.getByRole('dialog')).toHaveCount(0);
 }
 await q.goBack();await q.waitForURL(url=>url.searchParams.get('surface')==='home');await q.goForward();await q.waitForURL(url=>url.searchParams.get('surface')==='queue'&&!url.searchParams.get('item'));await q.goForward();await expect(q.locator('#queue-detail-title')).toHaveText(order[1].title);await q.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await expect(q.getByRole('dialog')).toHaveCount(0);await q.goBack();await q.waitForURL(url=>url.searchParams.get('surface')==='home');
 pass('Sorted/grouped Queue arrows follow visible rows; close returns to the viewed row and triage adds no duplicate Back entries, even after Forward');
 await q.goto(base+'?surface=queue&item=synthetic-queue-needs-you');await q.locator('#queue-detail-title').waitFor();const length=await q.evaluate(()=>history.length);await q.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await expect(q.getByRole('dialog')).toHaveCount(0);assert.ok(!new URL(q.url()).searchParams.has('item'));assert.equal(await q.evaluate(()=>history.length),length);pass('A direct item link closes with URL replacement rather than leaving the page');await nav.close();
 for(const width of [320,390]){
  const phone=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),m=await phone.newPage();observe(m);await phone.route('**/api/**',r=>{report.unexpectedAPIs.push(r.request().url());return r.abort();});
  await m.goto(base+'?surface=queue&item=synthetic-queue-needs-you&theme=dark');await m.locator('#queue-detail-title').waitFor();assert.ok(await m.locator('#queue-selected > div').first().evaluate(n=>n.getBoundingClientRect().height<=65));await m.getByRole('button',{name:'Back to loaded handoffs',exact:true}).click();await m.getByRole('button',{name:'+ Filter',exact:true}).click();await m.getByRole('dialog').getByRole('button',{name:/Needs you.*loaded/}).click();await m.getByRole('dialog').getByRole('button',{name:/Waiting for your AI/}).getByText('Not loaded',{exact:true}).waitFor();await expect(m.getByRole('dialog').getByRole('button',{name:'Done',exact:true})).toBeInViewport();await m.getByRole('button',{name:'Done',exact:true}).click();
  await m.goto(base+'?surface=operations&theme=dark');const row=m.locator('li[data-row]:visible').first();assert.ok((await row.boundingBox()).height<400);await row.getByText('Needs genealogy evidence',{exact:false}).waitFor();await row.locator('summary').filter({hasText:'Full research details'}).click();for(const name of ['death record','2 documents','Ashford, Kent, England · Utah, United States'])await row.getByText(name,{exact:true}).waitFor();assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass(`${width}px dark phone has a one-row Queue header, honest loaded-state facets and concise Operations with every fact still reachable`);await phone.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedAPIs,[]);
}finally{await browser.close();writeFileSync(new URL('./review-refinements-acceptance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(`${report.checks.length} council-refinement checks passed.`);
