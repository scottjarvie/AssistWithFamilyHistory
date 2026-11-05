/** Council capture at actual device viewport, retaining the entire scrollable page.
 * Unlike the shared runner, this never grows a phone viewport to the document's height.
 * Run under the site's lease + nice; all fixture paths remain local and synthetic.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const run=path.dirname(new URL(import.meta.url).pathname);
const config=JSON.parse(readFileSync(process.argv[3] || path.join(run,'../shots.json'),'utf8'));
const round=process.argv[2] || '2';if(!/^\d+$/.test(round))throw new Error('Round must be a number');
const out=process.argv[4] ? path.resolve(process.argv[4]) : path.join(run,`round-${round}/ours`);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const report={capturedAt:new Date().toISOString(),baseURL:config.baseURL,set:'shots',method:'Installed Chrome, actual 1440×900 / 390×844 device viewports, fullPage screenshot with no viewport growth. Console errors, page errors, HTTP errors, failed capability probes or page overflow block acceptance.',shots:[]};
try {
 for(const item of config.shots){
  for(const variant of item.variants || config.defaultVariants){
   const [device,scheme]=variant.split('-');const mobile=device==='mobile';
   const context=await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,colorScheme:scheme==='dark'?'dark':'light',reducedMotion:'reduce',locale:'en-US',timezoneId:config.timezone});
   const page=await context.newPage();
   const entry={name:item.name,variant,file:path.relative(process.cwd(),path.join(out,`${item.name}--${variant}.png`)),consoleErrors:[],pageErrors:[],capabilities:[],requestCount:0};
   page.on('pageerror',error=>entry.pageErrors.push(error.stack || String(error)));
   page.on('console',message=>{if(message.type()==='error')entry.consoleErrors.push(message.text());});
   page.on('request',()=>entry.requestCount++);
   try {
    const response=await page.goto(new URL(item.path,config.baseURL).href,{waitUntil:'domcontentloaded',timeout:30000});entry.status=response.status();
    await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
    for(const step of item.actions || []){
     if(step.click)await page.locator(step.click).first().click();
     if(step.fill)await page.locator(step.fill).first().fill(step.value || '');
     if(step.press)await page.keyboard.press(step.press);
     if(step.waitMs)await page.waitForTimeout(step.waitMs);
    }
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}'});
    await page.evaluate(async()=>{await document.fonts.ready;const height=document.documentElement.scrollHeight;for(let y=0;y<Math.min(height,7000);y+=innerHeight){scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,60));}scrollTo(0,0);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await page.waitForTimeout(500);
    for(const probe of item.capabilities || []){
     if(probe.on && probe.on!==device)continue;
     let ok=false;
     for(const selector of [].concat(probe.selector || [])){if(await page.locator(selector).count()){ok=true;break;}}
     if(!ok&&probe.text)ok=await page.getByText(probe.text,{exact:false}).count()>0;
     entry.capabilities.push({can:probe.can,ok});
    }
    const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    entry.dimensions=dimensions;entry.horizontalOverflow=dimensions.scrollWidth>dimensions.width+1;
    await page.screenshot({path:path.join(out,`${item.name}--${variant}.png`),fullPage:true});
    entry.ok=entry.status<400&&!entry.pageErrors.length&&!entry.consoleErrors.length&&!entry.horizontalOverflow&&entry.capabilities.every(p=>p.ok);
   } catch(error){entry.error=error.stack || String(error);entry.ok=false;}
   report.shots.push(entry);console.log(`${entry.ok?'ok':'FAIL'} ${item.name}--${variant}`);
   await context.close();
  }
 }
} finally {
 await browser.close();writeFileSync(path.join(out,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`${report.shots.filter(s=>s.ok).length}/${report.shots.length} captures passed.`);
if(report.shots.some(s=>!s.ok))process.exitCode=1;
