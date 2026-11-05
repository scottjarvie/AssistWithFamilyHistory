import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(new URL('./gallery-inline.html',import.meta.url).href);
 assert.equal(await page.locator('section h2').first().innerText(),'Personal Queue views and thread');
 const total=await page.locator('.shot').count();assert.ok(total>200);
 await page.locator('.shot').first().click();await expect(page.locator('dialog')).toBeVisible();assert.ok((await page.locator('dialog .bar span').innerText()).startsWith(`1 of ${total}`));
 await page.keyboard.press('ArrowRight');assert.ok((await page.locator('dialog .bar span').innerText()).startsWith(`2 of ${total}`));
 assert.equal(await page.locator('dialog img').evaluate(node=>node.style.width),'390px');
 await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('dialog img').evaluate(node=>node.style.width),'100%');
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();await page.locator('.shot').last().click();assert.ok((await page.locator('dialog .bar span').innerText()).startsWith(`${total} of ${total}`));await page.getByRole('button',{name:'Close',exact:true}).click();
 assert.deepEqual(errors,[]);console.log(`Gallery: ${total} numbered images; newest first, readable-size lightbox, arrows, Escape and last image passed.`);
}finally{await browser.close();}
