import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(new URL('./gallery-inline.html',import.meta.url).href);
 await expect(page.getByRole('heading',{name:'Family History · design progress',exact:true})).toBeVisible();
 const milestones=page.locator('article[data-milestone]');assert.equal(await milestones.count(),6);assert.equal(await milestones.first().getAttribute('id'),'readers');
 await expect(milestones.first()).toContainText('Work in progress');await expect(page.locator('#settings')).toContainText('review pending');
 const archive=page.locator('#capture-archive');assert.equal(await archive.getAttribute('open'),null);
 const total=await page.locator('.shot').count();assert.equal(total,502);
 for(let i=0;i<6;i++) {
  const milestone=milestones.nth(i),select=milestone.locator('select'),options=await select.locator('option').count();
  for(let feature=0;feature<options;feature++)for(const device of ['desktop','mobile']) {
   await select.selectOption(String(feature));await milestone.locator(`.compare-controls button[data-device="${device}"]`).click();
   await expect(milestone.locator(`.compare-controls button[data-device="${device}"]`)).toHaveAttribute('aria-pressed','true');
   for(const version of ['after','before']) {
    const shot=milestone.locator(`.feature-shot[data-version="${version}"]`);await expect(shot.locator('img')).toHaveAttribute('alt',new RegExp(device));
    await shot.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('dialog .bar span')).toContainText(`of ${total}`);await page.keyboard.press('Escape');
   }
  }
 }
 await milestones.first().locator('select').selectOption('0');await milestones.first().locator('.compare-controls button[data-device="desktop"]').click();await milestones.first().getByRole('button',{name:'Enlarge latest screenshot',exact:true}).click();await expect(page.locator('dialog .bar span')).toContainText(`1 of ${total}`);
 await page.keyboard.press('ArrowRight');await expect(page.locator('dialog .bar span')).toContainText(`2 of ${total}`);assert.equal(await page.locator('dialog img').evaluate(n=>n.style.width),'390px');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('dialog img').evaluate(n=>n.style.width),'100%');await page.keyboard.press('Escape');
 for(const width of [1440,728,390,320]) {await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px gallery overflow`);}
 await page.locator('#council-ledger details summary').click();assert.equal(await page.locator('#council-ledger tbody tr').count(),9);await expect(page.locator('#council-ledger tbody tr').first()).toContainText('030963f');
 await archive.locator(':scope > summary').click();await page.locator('.shot').last().click();await expect(page.locator('dialog .bar span')).toContainText(`${total} of ${total}`);await page.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(errors,[]);
 console.log(`Gallery:6 newest-first milestones,20 page comparisons ×2 devices ×2 versions,9 ordered review receipts,${total} preserved images; lightbox/arrows/Escape/archive and1440/728/390/320px passed.`);
}finally {await browser.close();}
