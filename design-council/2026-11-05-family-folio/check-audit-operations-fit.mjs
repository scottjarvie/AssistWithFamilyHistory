import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const report={checkedAt:new Date().toISOString(),checks:[],errors:[]};
const browser=await chromium.launch({channel:'chrome'});
try {for(const width of [1440,1280]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://localhost:3457/design-council-preview?surface=operations');const table=page.locator('table.collection-table');await expect(table).toBeVisible();
 const fit=await table.evaluate(t=>({width:t.scrollWidth,container:t.parentElement.clientWidth,overflow:[...t.querySelectorAll('td[data-label]')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.dataset.label)}));assert.ok(fit.width<=fit.container+1);assert.deepEqual(fit.overflow,[]);
 const header=table.getByRole('button',{name:'Coverage',exact:true});const lines=await header.evaluate(n=>{const walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let node;const rects=[];while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);rects.push(...[...range.getClientRects()].map(r=>r.y));}return new Set(rects).size;});assert.equal(lines,1,'Coverage heading stays on one line');
 await expect(table.locator('td[data-label="Coverage"] .text-warning').first()).toHaveCSS('white-space','nowrap');report.checks.push(`Operations ${width}px table/cells fit; Coverage heading and stale-check phrase stay whole`);console.log('ok '+report.checks.at(-1));await context.close();
 }assert.deepEqual(report.errors,[]);
}finally{await browser.close();writeFileSync(new URL('./audit-operations-fit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
