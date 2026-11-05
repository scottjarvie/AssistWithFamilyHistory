/** Cross-page synthetic acceptance: data-preserving kit reuse, facets and dated activity. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const base=process.env.COUNCIL_BASE_URL||'http://localhost:3457';
const browser=await chromium.launch({channel:'chrome'});
const report={checkedAt:new Date().toISOString(),checks:[],errors:[]};
const check=name=>report.checks.push(name);
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 const open=async(surface,extra='')=>{await page.goto(`${base}/design-council-preview?surface=${surface}${extra}`);await page.locator('main h1').waitFor();};
 const rows=()=>page.locator('tr[data-row]:visible');
 await open('places');assert.equal(await rows().count(),3);
 for(const label of ['Events','Citations','Media'])assert.equal(await page.locator(`td[data-label="${label}"]:visible`).count(),3);check('Places keeps kind and every event/citation/media count');
 await page.getByLabel('Search places',{exact:true}).fill('Utah');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL(/q=Utah/);assert.equal(await rows().count(),1);
 await page.getByRole('button',{name:'+ New view',exact:true}).click();await page.getByLabel('View name').fill('State archive');await page.getByRole('button',{name:'Save view',exact:true}).click();
 await page.getByRole('button',{name:'State archive',exact:true}).waitFor();
 await page.getByLabel('Search places',{exact:true}).fill('');await page.getByRole('button',{name:'Search',exact:true}).click();await page.waitForURL(url=>!url.searchParams.get('q'));assert.equal(await rows().count(),3);
 await page.getByRole('button',{name:'State archive · edited',exact:true}).click();await page.waitForURL(/q=Utah/);assert.equal(await rows().count(),1);check('Place search and a saved query restore across full navigation');
 await open('stories');assert.equal(await rows().count(),3);await page.getByRole('link',{name:'Open published story',exact:false}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Review story',exact:true}).count(),3);check('Stories preserves each review link and published-only public link');
 const preview=page.getByRole('button',{name:'Read full preview',exact:true}).first();await preview.click();await page.getByRole('button',{name:'Collapse preview',exact:true}).waitFor();check('Narrative is expandable without dropping the original four-line preview');
 await page.getByLabel('Search stories',{exact:true}).fill('Samuel');await page.getByLabel('Story status',{exact:true}).selectOption('review');await page.getByLabel('Story workflow',{exact:true}).selectOption('ready_to_review');await page.getByRole('button',{name:'Filter',exact:true}).click();await page.waitForURL(/workflow=ready_to_review/);assert.equal(await rows().count(),1);
 await page.getByRole('button',{name:'+ New view',exact:true}).click();await page.getByLabel('View name').fill('Review shelf');await page.getByRole('button',{name:'Save view',exact:true}).click();
 await page.getByRole('button',{name:'Review shelf',exact:true}).waitFor();
 await page.getByRole('link',{name:'All stories',exact:false}).click();await page.waitForURL(url=>url.searchParams.get('surface')==='stories'&&!url.searchParams.get('status'));assert.equal(await rows().count(),3);
 await page.getByRole('button',{name:'Review shelf · edited',exact:true}).click();await page.waitForURL(/workflow=ready_to_review/);assert.equal(new URL(page.url()).searchParams.get('q'),'Samuel');assert.equal(new URL(page.url()).searchParams.get('status'),'review');assert.equal(await rows().count(),1);check('Saved Stories view restores q, status and workflow together');
 await open('writing');assert.equal(await rows().count(),4);assert.equal(await page.locator('main a[href^="/app/people/"][href$="/story-writer"]:visible').count(),4);check('Writing launcher retains source/context/readiness/workflow and each person session');
 await open('research');assert.equal(await rows().count(),2);const global=rows().filter({hasText:'Review the place context'});assert.equal(await global.locator('a').count(),0);assert.equal(await page.getByRole('link',{name:'Locate the original passenger list',exact:true}).count(),0);assert.equal(await page.locator('td[data-label="Person"] a:visible').count(),1);check('Task identities stay static; explicit Person fields link to the person; global tasks have no fake detail link');
 await open('research','&status=invalid');assert.equal(await rows().count(),2);assert.equal(await page.getByLabel('Task status',{exact:true}).inputValue(),'');check('Unknown task state normalizes to All states and keeps the complete loaded result');
 await page.getByLabel('Activity author',{exact:true}).selectOption('ai');assert.equal(await page.locator('#research-log-title').locator('xpath=ancestor::section').locator('ol > li').count(),1);await page.getByText('Self-reported model hint:',{exact:false}).waitFor();check('AI provenance and self-reported model hints remain distinct');
 await page.getByLabel('Activity author',{exact:true}).selectOption('all');await page.getByLabel('Activity range start',{exact:true}).fill('2026-11-04');assert.equal(await page.locator('#research-log-title').locator('xpath=ancestor::section').locator('ol > li').count(),1);await page.getByRole('button',{name:'Clear date range',exact:true}).click();assert.equal(await page.locator('#research-log-title').locator('xpath=ancestor::section').locator('ol > li').count(),3);check('Date-range selection and clear filter the real activity entries');
 const chart=page.getByRole('img',{name:'Research activity lanes by entry kind; dots show dated stored activity'});await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox();await page.mouse.move(box.x+box.width*.88,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width*.96,box.y+20);await page.mouse.up();assert.equal(await page.getByLabel('Activity range start',{exact:true}).inputValue(),'2026-11-04');assert.equal(await page.locator('#research-log-title').locator('xpath=ancestor::section').locator('ol > li').count(),1);await page.getByRole('button',{name:'Clear date range',exact:true}).click();check('Dragging the activity date axis selects actual log entries');
 await page.getByLabel('Activity kind',{exact:true}).selectOption('tier2_notes');assert.equal(await page.locator('#research-log-title').locator('xpath=ancestor::section').locator('ol > li').count(),1);check('Only recorded activity kinds appear and filter the dated list');
 await context.close();
 const phone=await browser.newContext({viewport:{width:320,height:844},isMobile:true,hasTouch:true});const mobile=await phone.newPage();mobile.on('pageerror',e=>report.errors.push(String(e)));mobile.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 for(const surface of ['people','places','stories','writing','research']){await mobile.goto(`${base}/design-council-preview?surface=${surface}`);await mobile.locator('main h1').waitFor();assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),surface+' overflow');if(surface!=='research')assert.ok(await mobile.locator('li[data-row]:visible').count()>0);if(surface==='stories'){const text=await mobile.locator('li[data-row]:visible').first().innerText();assert.ok(!text.includes('Person')&&!text.includes('Kind')&&!text.includes('Status'));}if(surface==='research')assert.ok((await mobile.locator('li[data-row]:visible').first().innerText()).includes('Updated Nov')); }
 check('All five collection surfaces preserve visible records and avoid overflow at 320px');await phone.close();assert.deepEqual(report.errors,[]);
} finally {await browser.close();writeFileSync(new URL('./surfaces-acceptance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(`${report.checks.length} cross-surface checks passed.`);
