// Warm the real old service worker before publication, then verify its update and offline launch.
import {chromium} from '@playwright/test';import{mkdir,writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const out='test-results/ashfall-release';await mkdir(out,{recursive:true});
const context=await chromium.launchPersistentContext(`${out}/returning-profile`,{headless:true,viewport:{width:1280,height:900}});
const page=context.pages()[0]||await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('https://discuss.integ.life/sdk/v1/comments.js',r=>r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:''}));
const warm=process.argv.includes('--warm');
try{
 await page.goto('https://games.integ.life/play/ashfall/',{waitUntil:'networkidle'});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'networkidle'});
 if(warm){await page.evaluate(()=>localStorage.setItem('ashfall-release-preserve','2026-10-18'));await writeFile(`${out}/before.json`,JSON.stringify(await page.evaluate(async()=>({menu:document.querySelector('.ashfall-overlay')?.textContent,controller:navigator.serviceWorker.controller?.scriptURL,caches:await caches.keys()})),null,2));console.log('Warmed returning-user profile');}
 else{
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
  await page.waitForFunction(()=>document.querySelector('.af-eyebrow')?.textContent.includes('20 STAGES'),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('ashfall-release-preserve')),'2026-10-18');
  await page.locator('[data-act="4"]').click();await page.locator('[data-level="20"]').click();await page.locator('[data-control=difficulty]').selectOption('hard');await page.screenshot({path:`${out}/public-twenty.png`,fullPage:true});
  await page.locator('[data-control=start]').click();await page.waitForFunction(()=>document.querySelector('.ashfall')?.dataset.mode==='play');await page.locator('.ashfall').screenshot({path:`${out}/public-playing.png`});
  await page.keyboard.press('p');
  const online=await page.evaluate(async()=>({controller:navigator.serviceWorker.controller?.scriptURL,caches:await caches.keys(),ribbon:document.querySelector('.ashfall-ribbon')?.textContent}));
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-control=start]');
  assert.equal(await page.locator('[data-act]').count(),5);await context.setOffline(false);
  await writeFile(`${out}/after.json`,JSON.stringify({online,offlineCampaign:true,storagePreserved:true,errors},null,2));assert.equal(errors.length,0);console.log(JSON.stringify({online,offlineCampaign:true,storagePreserved:true}));
 }
}finally{await context.close();}
