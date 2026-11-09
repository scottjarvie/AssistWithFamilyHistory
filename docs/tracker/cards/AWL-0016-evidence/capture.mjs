import {chromium,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const phase=process.argv[2],report={phase,checks:[],errors:[],requests:[]};
const pages=[['09','/design-council-preview?surface=me-queue'],['03','/design-council-preview?surface=person'],['04','/design-council-preview?surface=settings-ai'],['05','/ai'],['06','/'],['07','/design-council-preview?surface=research']];
async function visit(width,path,run){
 const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width,height:1000}});
 page.on('pageerror',e=>{report.errors.push(`${width} ${path}: ${e}`);console.log('PAGEERROR',String(e));});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,500));});
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))report.requests.push(r.url());});
 try{console.log('capture',phase,width,path);await page.goto('http://localhost:3443'+path);await page.waitForLoadState('networkidle');if(path.startsWith('/design-council-preview')){try{await page.locator('[data-fixture-hydrated="true"]').waitFor({timeout:15000});}catch(e){console.log(await page.evaluate(()=>({url:location.href,marker:document.querySelector('[data-fixture-hydrated]')?.outerHTML.slice(0,120),text:document.body.innerText.slice(0,200)})));throw e;}}
 await run(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);report.checks.push(`${phase} ${width} ${path}`);
 }finally{await browser.close();}
}
try{
 for(const width of [1440,390]){
  for(const [id,path] of pages)await visit(width,path,async page=>{
   if(id==='03'){await page.getByRole('tab',{name:/^Sources/}).click();await page.locator('#record-section-sources').waitFor();}
   if(id==='06'){await page.locator('#family-history-faq').scrollIntoViewIfNeeded();const q=page.getByText('How do Queue requests and AI suggestions differ?',{exact:true});if(await q.count())await q.click();}
   await page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/${id}-${phase}-${width}.png`,fullPage:id!=='06'});
  });
  if(phase==='after'){
   await visit(width,'/design-council-preview?surface=queue',async page=>{
    await page.getByRole('button',{name:/AI suggestions/}).waitFor();await expect(page.getByRole('button',{name:/^Look for Eleanor’s missing burial record/})).toHaveCount(0);await expect(page.getByRole('link',{name:'Needs your input 3',exact:true})).toBeVisible();await page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/01-after-${width}.png`,fullPage:true});
    await page.getByRole('link',{name:'Needs your input 3',exact:true}).click();await expect(page.getByRole('button',{name:/^Answer .* here$/})).toHaveCount(3);await expect(page.getByRole('button',{name:'Archive',exact:true})).toHaveCount(3);report.checks.push(`${width}: input tab shows three questions with Answer and Archive, including Answered`);await page.getByRole('button',{name:/AI suggestions/}).click();await expect(page.locator('[aria-label="Queue state summary"]')).toHaveCount(0);await expect(page.getByRole('heading',{name:/^Waiting on AI/})).toHaveCount(0);await expect(page.locator('p:visible').filter({hasText:/^a\. Start with the parish register$/})).toBeVisible();await expect(page.locator('p:visible').filter({hasText:/^Evidence: Invented census finding · no burial citation$/})).toBeVisible();await expect(page.getByRole('link',{name:'From: Eleanor Finch',exact:true})).toBeVisible();await page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/11-after-${width}.png`,fullPage:true});await page.getByRole('button',{name:/^Look for Eleanor’s missing burial record/}).click();await page.getByRole('dialog',{name:'Selected thread',exact:true}).waitFor();const edit=page.getByRole('button',{name:'Edit first',exact:true});await edit.evaluate(el=>el.scrollIntoView({block:'center'}));await edit.click();await expect(page.getByRole('textbox',{name:'Edit suggestion wording'})).toBeVisible();
    await page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/02-after-${width}.png`,fullPage:false});
   });
   await visit(width,'/design-council-preview?surface=queue-origin',page=>page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/08-after-${width}.png`,fullPage:true}));
   await visit(width,'/',async page=>{await page.getByText('A Queue with three work states and a Needs your input flag that preserves directives and results across sessions.',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`docs/tracker/cards/AWL-0016-evidence/10-after-${width}.png`});});
  }
 }
}finally{writeFileSync(`docs/tracker/cards/AWL-0016-evidence/browser-${phase}.json`,JSON.stringify(report,null,2)+'\n');}
