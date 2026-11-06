import {chromium,expect} from '@playwright/test';
import fixtureModule from '../../components/design/readerFixtures.ts';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const {readerPack,readerRaw,readerContextualized}=fixtureModule;
const report={checkedAt:new Date().toISOString(),checks:[],requests:[],errors:[],unexpected:[]};
const pass=s=>{report.checks.push(s);console.log('ok '+s);};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const browser=await chromium.launch({channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>{window.__readerCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.__readerCopyFail)throw Error('Invented clipboard failure');window.__readerCopies.push(text);}}});});
 let mode='normal',gate=null;
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());report.requests.push({path:url.pathname,query:url.search,method:req.method()});
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
  const other=url.pathname.includes('synthetic-reader-other');
  if(url.pathname.endsWith('/contextualized')){
   const entered=mode;if(entered==='slow-old-context'&&!other)await gate.promise;
   if(entered==='context-503')return reply({error:'Invented dossier read unavailable'},503);
   if(entered.startsWith('context-missing:'))return reply({success:false,status:entered.split(':')[1],error:'Invented missing dossier',personName:'Eleanor Finch'});
   return reply({success:true,personName:other?'Mabel Ashford':'Eleanor Finch',runId:url.searchParams.get('run')||readerPack.runId,markdown:other?'# SECOND_DOCUMENT\n\nOnly the new invented person.':entered==='slow-old-context'?'# LATE_PREVIOUS_DOCUMENT':readerContextualized});
  }
  if(url.pathname.endsWith('/pack')){
   if(mode==='slow-new-run'&&url.pathname.includes('/synthetic-second-run/')){await gate.promise;return reply({pack:{...readerPack,runId:'synthetic-second-run'}});}
   if(mode==='raw-fallback')return reply({error:'Invented pack unavailable'},503);
   return reply({pack:other?{...readerPack,person:{...readerPack.person,name:'Mabel Ashford'}}:readerPack});
  }
  if(url.pathname.endsWith('/raw'))return reply({markdown:readerRaw+'\n\nFALLBACK_DOCUMENT',personName:'Eleanor Finch'});
  if(/^\/api\/people\/[^/]+$/.test(url.pathname)){
   if(mode==='slow-new-person'&&other)await gate.promise;
   return reply({success:true,person:{name:other?'Mabel Ashford':'Eleanor Finch'},latestRunId:mode==='raw-missing'?null:readerPack.runId,vaultOnly:true});
  }
  report.unexpected.push(url.pathname);return route.abort();
 });
 await context.route(/https?:\/\/(?!localhost|127\.0\.0\.1)/,r=>{report.unexpected.push(r.request().url());return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503 (Service Unavailable)'))report.errors.push(m.text());});
 const go=async(surface,extra='')=>page.goto(`http://localhost:3457/design-council-preview?surface=reader-${surface}${extra}`);
 for(const [surface,text,filename] of [['raw',readerRaw,'Eleanor-Finch-raw-evidence.md'],['contextualized',readerContextualized,'Eleanor-Finch-contextualized.md']]){
  await go(surface);await page.getByRole('button',{name:'Copy',exact:true}).click();assert.equal(await page.evaluate(()=>window.__readerCopies.at(-1)),text);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download .md',exact:true}).click();const download=await pending;assert.equal(download.suggestedFilename(),filename);assert.equal(readFileSync(await download.path(),'utf8'),text);
  await page.getByRole('button',{name:'Original Markdown',exact:true}).click();await expect(page.locator('[data-original-markdown]')).toHaveText(text,{useInnerText:false});
 }
 pass('Both readers copy/download byte-identical full Markdown with original filenames; reading view retains the exact original');
 await go('raw');await page.evaluate(()=>window.__readerCopyFail=true);await page.getByRole('button',{name:'Copy',exact:true}).click();await expect(page.locator('main [role="alert"]')).toContainText('Copy failed');await expect(page.locator('[data-original-markdown]')).toBeVisible();await page.getByRole('button',{name:'Select original Markdown',exact:true}).click();await expect.poll(()=>page.evaluate(()=>getSelection().toString().trimEnd())).toBe(readerRaw.trimEnd());pass('Clipboard failure reveals and selects complete original Markdown without false success');
 await go('contextualized');assert.equal(await page.locator('aside[aria-label="Sources named in this paragraph"]').count(),6);await page.locator('a').filter({hasText:'Compare in raw document'}).first().click();await expect(page).toHaveURL(/surface=reader-raw/);await expect(page.locator('#raw-document-source-53-59-4e-2d-30-30-31')).toBeFocused();pass('Six claim-specific source notes lead to the matching raw section with the read-run retained');
 await go('raw','&source=UNKNOWN_SOURCE');await expect(page.locator('main [role="status"]')).toContainText('not identified as a section');
 await go('raw-long');await expect(page.locator('[data-document-reader] img')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.__readerUnsafe),undefined);await expect(page.getByRole('link',{name:/Image reference: Invented private image/})).toHaveAttribute('href','https://images.example.test/must-not-auto-load.png');pass('Missing source anchors stay honest; remote Markdown images and raw HTML never execute or auto-load');
 await go('documents');await page.getByRole('button',{name:'Copy Markdown',exact:true}).click();assert.equal(await page.evaluate(()=>window.__readerCopies.at(-1)),readerContextualized);await page.getByRole('tab',{name:'CST',exact:true}).click();const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();const document=await dl;assert.equal(document.suggestedFilename(),'Invented Source Transcription.md');assert.equal(readFileSync(await document.path(),'utf8'),readerRaw);pass('Embedded PS/CST tabs preserve exact stored text, titles, update provenance and filename contracts');
 await go('raw-live-controller','&readerRun=synthetic%20run%2Fone%3F');await expect(page.getByRole('heading',{name:'Raw Evidence Document',exact:true})).toBeVisible();assert.ok(report.requests.some(r=>r.path.endsWith('/runs/synthetic%20run%2Fone%3F/pack')));pass('Actual raw controller retains selected/latest run and safely encodes route/query values');
 mode='raw-fallback';await go('raw-live-controller','&readerRun=synthetic%20fallback');await expect(page.getByText('FALLBACK_DOCUMENT',{exact:true})).toBeVisible();await expect(page.getByText('Author and model not supplied by this document read.',{exact:true})).toBeVisible();assert.ok(report.requests.some(r=>r.path.endsWith('/raw')&&r.query==='?run=synthetic%20fallback'));pass('Pack failure keeps the original raw-API fallback and truthfully unknown document provenance');
 mode='raw-missing';await go('raw-live-controller');await expect(page.getByRole('heading',{name:'Raw document needs a stored capture run',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Download Context Pack',exact:true})).toHaveAttribute('href','/api/people/synthetic-reader/context-pack?format=markdown');await expect(page.getByRole('link',{name:'Open Story Writer',exact:true})).toBeVisible();pass('No-run raw state retains Context Pack, Story Writer and Person recovery links');
 for(const status of ['vault_only','no_runs','not_generated']){mode='context-missing:'+status;await go('contextualized-live-controller');await expect(page.getByRole('heading',{name:'Dossier Not Available',exact:true})).toBeVisible();if(status==='vault_only')await expect(page.getByRole('link',{name:'Download Context Pack',exact:true})).toBeVisible();else await expect(page.getByRole('link',{name:'Generate in AI Analysis',exact:true})).toBeVisible();}
 mode='context-503';await go('contextualized-live-controller');await expect(page.getByText('Invented dossier read unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Original Markdown',exact:true})).toHaveCount(0);mode='normal';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Contextualized Dossier',exact:true})).toBeVisible();pass('All contextualized missing states and read failure retain their original recovery choices; retry does not fabricate an empty document');
 mode='normal';await go('raw-live-controller');await expect(page.getByRole('heading',{name:'Raw Evidence Document',exact:true})).toBeVisible();await page.evaluate(()=>window.__readerNavigationMarker='retained');mode='slow-new-person';gate=defer();await page.getByRole('link',{name:'Other invented person',exact:true}).click();await expect(page.locator('main [role="status"]')).toContainText('Generating raw document');await expect(page.getByRole('heading',{name:'Raw Evidence Document',exact:true})).toHaveCount(0);assert.equal(await page.evaluate(()=>window.__readerNavigationMarker),'retained');gate.resolve();await expect(page.getByRole('link',{name:'Back to Mabel Ashford',exact:true})).toBeVisible();pass('Real Next person navigation clears old private content synchronously while the new read is delayed');
 mode='slow-old-context';gate=defer();await go('contextualized-live-controller');await expect.poll(()=>report.requests.filter(r=>r.path.endsWith('/contextualized')).length).toBeGreaterThan(4);await page.getByRole('link',{name:'Other invented person',exact:true}).click();await expect(page.getByRole('heading',{name:'SECOND_DOCUMENT',exact:true})).toBeVisible();gate.resolve();await page.waitForTimeout(150);await expect(page.getByRole('heading',{name:'LATE_PREVIOUS_DOCUMENT',exact:true})).toHaveCount(0);pass('Late aborted previous-person response cannot overwrite the new person document');
 mode='normal';await go('raw-live-controller','&readerRun=synthetic-first-run');await expect(page.getByRole('heading',{name:'Raw Evidence Document',exact:true})).toBeVisible();mode='slow-new-run';gate=defer();await page.getByRole('link',{name:'Other invented run',exact:true}).click();await expect(page.locator('main [role="status"]')).toContainText('Generating raw document');await expect(page.getByRole('button',{name:'Original Markdown',exact:true})).toHaveCount(0);gate.resolve();await expect(page.getByRole('complementary',{name:'Document provenance',exact:true}).getByText('synthetic-second-run',{exact:true})).toBeVisible();pass('Same-person run changes also clear prior content until the newly selected run arrives');
 for(const width of [1440,1280,390,320])for(const surface of ['raw','contextualized','documents','raw-long']){await page.setViewportSize({width,height:900});await go(surface,`&theme=${width<500?'dark':'light'}`);await expect(page.locator('[data-document-reader]').first()).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${surface} ${width}px overflow`);if(surface==='contextualized'&&width<500){await page.getByRole('button',{name:'Sources 1',exact:true}).first().click();await expect(page.locator('aside[aria-label="Sources named in this paragraph"]').first()).toBeVisible();}}
 pass('All readers, embedded documents, long literal data and phone source notes fit1440/1280/390/320px with dark phones');
 assert.ok(report.requests.every(r=>r.method==='GET'));assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);await context.close();
}finally{await browser.close();writeFileSync(new URL('./reader-acceptance.json',import.meta.url),JSON.stringify({...report,note:'All provider/API data invented and intercepted; no actual backend or private family data.'},null,2)+'\n');}
console.log(`${report.checks.length} reader groups passed.`);
