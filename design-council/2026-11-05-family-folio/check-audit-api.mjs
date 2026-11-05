/** Real Audit fetch controller with fully intercepted invented responses. No backend traffic. */
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const report={checkedAt:new Date().toISOString(),checks:[],requests:[],unexpectedAPIs:[],errors:[],expectedHTTPFailures:0};
const pass=text=>{report.checks.push(text);console.log('ok '+text);};
const browser=await chromium.launch({channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 let scenario='metrics',failOnce=false;
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname!=='/api/audit/records'||route.request().method()!=='GET'){report.unexpectedAPIs.push(url.pathname);return route.abort();}
  const metric=url.searchParams.get('metric'),offset=Number(url.searchParams.get('offset'));
  report.requests.push({metric,offset,keys:[...url.searchParams.keys()]});
  if(scenario==='race'&&metric==='people')await new Promise(resolve=>setTimeout(resolve,250));
  if(scenario==='pages'&&offset===50&&failOnce){failOnce=false;report.expectedHTTPFailures++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Invented temporary read failure'})});}
  const total=scenario==='zero'?0:scenario==='pages'?120:2;
  const rows=Array.from({length:Math.max(0,Math.min(50,total-offset))},(_,index)=>({id:`${metric}-${offset+index}`,title:`Invented ${metric} record ${String(offset+index+1).padStart(3,'0')}`,kind:metric.startsWith('workflow:')||metric==='people'?'Person':'Record',detail:'Synthetic minimal matching row',href:null,destination:null}));
  try {await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,page:{metric,total,rows,nextOffset:offset+50<total?offset+50:null}})});}catch{/* An aborted old sheet is expected in the race check. */}
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503 (Service Unavailable)'))report.errors.push(m.text());});
 await page.goto('http://localhost:3457/design-council-preview?surface=audit-live-controller');
 const metrics=await page.locator('[data-audit-metric]').evaluateAll(nodes=>nodes.map(n=>n.dataset.auditMetric));
 for(const metric of metrics){await page.locator(`[data-audit-metric="${metric}"]`).click();const sheet=page.getByRole('dialog');await expect(sheet.getByText('2 matching records · 2 loaded',{exact:true})).toBeVisible();await expect(sheet.getByText(`Invented ${metric} record 001`,{exact:true})).toBeVisible();await page.keyboard.press('Escape');}
 assert.deepEqual([...new Set(report.requests.map(r=>r.metric))],metrics);assert.ok(report.requests.every(r=>r.offset===0&&r.keys.join(',')==='metric,offset'));pass('All16 instrument numbers call the real read controller with their exact metric/offset and no caller-supplied owner');
 scenario='pages';failOnce=true;await page.locator('[data-audit-metric="people"]').click();let sheet=page.getByRole('dialog');await expect(sheet.getByText('120 matching records · 50 loaded',{exact:true})).toBeVisible();await expect(sheet.getByText(/This read has 120 matches; the instrument snapshot showed 10/)).toBeVisible();await sheet.getByRole('button',{name:'Load more matches',exact:true}).click();await expect(sheet.getByRole('alert')).toContainText('Invented temporary read failure');await expect(sheet.getByText('120 matching records · 50 loaded',{exact:true})).toBeVisible();await sheet.getByRole('button',{name:'Try again',exact:true}).click();await expect(sheet.getByText('120 matching records · 100 loaded',{exact:true})).toBeVisible();await sheet.getByRole('button',{name:'Load more matches',exact:true}).click();await expect(sheet.getByText('120 matching records · 120 loaded',{exact:true})).toBeVisible();await expect(sheet.getByText('Invented people record 120',{exact:true})).toBeVisible();pass('Live pagination retains loaded rows after a failed next page, retries the same offset and shows changed snapshot totals honestly');
 await sheet.getByRole('textbox',{name:'Search loaded matches'}).fill('record 120');await expect(sheet.getByText('Invented people record 120',{exact:true})).toBeVisible();await expect(sheet.getByText('Invented people record 001',{exact:true})).toHaveCount(0);await sheet.getByRole('button',{name:'Refresh matches',exact:true}).click();await expect(sheet.getByText('120 matching records · 50 loaded',{exact:true})).toBeVisible();await expect(sheet.getByText(/No loaded matches contain/)).toBeVisible();await sheet.getByRole('textbox',{name:'Search loaded matches'}).fill('');await expect(sheet.getByText('Invented people record 001',{exact:true})).toBeVisible();await page.keyboard.press('Escape');pass('Loaded search stays explicitly bounded and refreshing replaces old pages without silently clearing the search');
 scenario='race';await page.locator('[data-audit-metric="people"]').click();await page.keyboard.press('Escape');await page.locator('[data-audit-metric="sources"]').click();sheet=page.getByRole('dialog');await expect(sheet.getByText('Invented sources record 001',{exact:true})).toBeVisible();await page.waitForTimeout(300);await expect(sheet.getByText('Invented people record 001',{exact:true})).toHaveCount(0);await page.keyboard.press('Escape');pass('Closing/switching sheets aborts old reads; a late person response cannot replace source matches');
 scenario='zero';await page.locator('[data-audit-metric="citations"]').click();sheet=page.getByRole('dialog');await expect(sheet.getByText('0 matching records · 0 loaded',{exact:true})).toBeVisible();await expect(sheet.getByText(/No records match this metric/)).toBeVisible();pass('Live zero-result response is distinct from a failed read');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedAPIs,[]);await context.close();
} finally {await browser.close();writeFileSync(new URL('./audit-api-acceptance.json',import.meta.url),JSON.stringify({...report,networkAPIRequests:0,note:'All API requests fulfilled with invented data in browser. Client/controller proof, not live backend acceptance. Development StrictMode may replay the mount read; abandoned requests are aborted.'},null,2)+'\n');}
console.log(`${report.checks.length} intercepted Audit controller checks passed.`);
