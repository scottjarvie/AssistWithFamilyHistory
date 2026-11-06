import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:3457/design-council-preview?surface=operations');await page.getByRole('button',{name:'list',exact:true}).click();
 const first=page.locator('li[data-row="person:synthetic-eleanor"]');await first.locator('summary').filter({hasText:'Full research details'}).click();await first.getByText('2 documents',{exact:true}).waitFor();
 await page.locator('summary').filter({hasText:'Options'}).click();await page.getByRole('checkbox',{name:'Evidence',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Next action',exact:true}).uncheck();await page.getByRole('button',{name:'Close options',exact:true}).click();
 await expect(first.getByText('2 documents',{exact:true})).toHaveCount(0);await expect(first.getByText('Compare the two invented census households.',{exact:true})).toHaveCount(0);await first.locator('summary').filter({hasText:'Selected research details'}).waitFor();
 await page.locator('summary').filter({hasText:'Options'}).click();await page.getByRole('button',{name:'Show all columns',exact:true}).click();await page.getByRole('button',{name:'Close options',exact:true}).click();await expect(first.getByText('2 documents',{exact:true})).toBeVisible();await expect(first.getByText('Compare the two invented census households.',{exact:true}).first()).toBeVisible();assert.deepEqual(errors,[]);await context.close();console.log('Operations chosen fields hide and restore in the concise List and its full details.');
}finally{await browser.close();}
