// DOM lifecycle fixtures deliberately force a boss clear; ordinary combat proof is ashfall-playtest.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const out='test-results/ashfall-campaign-acceptance';await mkdir(out,{recursive:true});
const server=process.env.ASHFALL_ORIGIN?null:await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0}});await server?.listen();
const origin=process.env.ASHFALL_ORIGIN||`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch();const checks=[],errors=[],measurements=[];
const check=(v,n)=>{assert.ok(v,n);checks.push(n);};
try{
for(const [name,viewport,mobile] of [['desktop',{width:1280,height:900},false],['portrait',{width:390,height:844},true],['small',{width:320,height:568},true],['landscape',{width:900,height:450},true]]){
const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
page.on('pageerror',e=>errors.push(`${name}: ${e}`));
await page.route('https://discuss.integ.life/sdk/v1/comments.js',r=>r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:''}));
await page.addInitScript(()=>{window.__contexts=[];const AC=window.AudioContext;if(AC)window.AudioContext=class extends AC{constructor(...a){super(...a);window.__contexts.push(this);}};});
const open=async()=>{await page.goto(`${origin}/play/ashfall/?ashfall-debug&ashfall-level=4&keep=yes`,{waitUntil:'networkidle'});if(mobile)await page.locator('[data-action=start-game]').tap();await page.waitForFunction(()=>!!window.__ashfall);await page.evaluate(()=>{__ashfall.manual(true);__ashfall.render();});};
await open();check(await page.locator('[role=radio]').count()===4,`${name}: four stage choices per act`);
for(const locale of ['en','zh']){
if(locale==='zh')await page.locator('[data-control=language]').click();
for(let act=0;act<5;act++){
 await page.locator(`[data-act="${act}"]`).click();
 check(await page.locator('[role=radio]').count()===4,`${name}/${locale}: act ${act+1} has four levels`);
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}/${locale}: no page overflow ${act}`);
}
await page.locator('[data-level="20"]').click();await page.locator('[data-control=difficulty]').selectOption('hard');
check(await page.evaluate(()=>__ashfall.g.mode)==='title',`${name}/${locale}: selection never autostarts`);
check(new URL(page.url()).searchParams.get('keep')==='yes',`${name}/${locale}: keeps other query fields`);
for(const el of await page.locator('.ashfall-overlay button,.ashfall-overlay select').all()){const r=await el.boundingBox();check(r.width>=48&&r.height>=48,`${name}/${locale}: 48px control`);}
await page.locator('.ashfall').screenshot({path:`${out}/${name}-${locale}-menu.png`});
}
// Check direct start and pause with real controls.
await page.locator('[data-control=start]').click();await page.waitForFunction(()=>__ashfall.g.mode==='play');
check(await page.evaluate(()=>__ashfall.g.level===20&&__ashfall.difficulty==='hard'),`${name}: stage and difficulty applied`);
check((await page.evaluate(()=>__contexts.map(c=>c.state))).includes('running'),`${name}: gesture unlocks audio`);
await page.evaluate(()=>{__ashfall.step(300);__ashfall.render();});
if(mobile){const j=page.locator('.a-jump');await j.tap();await page.evaluate(()=>__ashfall.step(5));check(await page.evaluate(()=>__ashfall.player.y<450),`${name}: real touch jump`);}
await page.keyboard.press('p');check(await page.evaluate(()=>{const t=__ashfall.g.time;__ashfall.step(60);return __ashfall.g.time===t;}),`${name}: pause freezes time`);
check((await page.evaluate(()=>__contexts.map(c=>c.state))).includes('suspended'),`${name}: pause suspends audio`);
await page.keyboard.press('p');
await page.evaluate(()=>{__ashfall.player.dead=true;__ashfall.player.deadT=1;__ashfall.render();});
await page.locator('.ashfall').screenshot({path:`${out}/${name}-death.png`});
await page.evaluate(()=>{__ashfall.step(200);__ashfall.render();});
// Render representative arena, use normal inputs to hit and confirm feedback (fixture positioning only).
await page.evaluate(()=>{const d=__ashfall;d.warp(d.level.ARENA.trigger+40);d.step(240);d.enemies.forEach(e=>e.dead=true);Object.assign(d.boss,{state:'idle',cd:100});Object.assign(d.player,{x:d.boss.x-160,y:d.boss.y,face:1,ammo:4,shootCd:0,invuln:true});d.press('shoot');d.step(10);d.render();});
check(await page.evaluate(()=>__ashfall.boss.armor<380&&__ashfall.g.impacts.length>0),`${name}: confirmed hit changes armor and shows marker`);
check(await page.evaluate(()=>__ashfall.g.shake===0&&__ashfall.g.flashFx===0),`${name}: reduced motion removes shake and fullscreen flash`);
await page.locator('.ashfall').screenshot({path:`${out}/${name}-combat.png`});
const timing=await page.evaluate(()=>{let t=performance.now();for(let i=0;i<30;i++)__ashfall.render();return (performance.now()-t)/30;});measurements.push({name,renderMs:timing});
await page.close();
}
// Resume through a fresh document, alternate reward and difficulty isolation.
const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
await page.route('https://discuss.integ.life/sdk/v1/comments.js',r=>r.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:''}));
await page.goto(`${origin}/play/ashfall/?ashfall-debug&ashfall-level=4&difficulty=easy`,{waitUntil:'networkidle'});
await page.locator('[data-control=start]').click();await page.waitForFunction(()=>__ashfall.g.mode==='play');
await page.evaluate(()=>{const d=__ashfall;d.manual(true);d.warp(d.level.ARENA.trigger+40);d.step(240);d.enemies.forEach(e=>e.dead=true);Object.assign(d.boss,{phase:2,armor:0,hp:1,state:'idle',cd:100});Object.assign(d.player,{x:d.boss.x-160,y:d.boss.y,face:1,ammo:4,shootCd:0,invuln:true});d.press('shoot');d.step(400);d.render();});
await page.locator('[data-reward=guard]').click();const totals=await page.evaluate(()=>({score:__ashfall.g.score,kills:__ashfall.g.kills}));await page.locator('.ashfall').screenshot({path:`${out}/reward.png`});
await page.reload({waitUntil:'networkidle'});await page.locator('[data-control=resume]').click();await page.waitForFunction(()=>__ashfall.g.mode==='play');
check(await page.evaluate(t=>__ashfall.g.level===5&&__ashfall.g.forge.guard===1&&__ashfall.g.results.length===1&&__ashfall.g.score===t.score&&__ashfall.g.kills===t.kills,totals),'reload restores stage, chosen reward and run totals once');
await page.locator('[data-action=restart]:visible').click();check(await page.evaluate(()=>__ashfall.g.level===4&&__ashfall.g.score===0&&__ashfall.g.forge.guard===0),'restart clears the run and perks');
await page.goto(`${origin}/play/ashfall/?ashfall-debug&difficulty=hard`,{waitUntil:'networkidle'});check(await page.locator('[data-control=resume]').count()===0,'difficulty records remain separate');
await page.close();
// The real cabinet adapter swallows quota errors. Read-back must still report failure.
const denied=await browser.newPage();await denied.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Denied','QuotaExceededError');};});
await denied.goto(`${origin}/play/ashfall/?ashfall-debug`,{waitUntil:'networkidle'});check((await denied.locator('.af-save').textContent()).includes('unavailable'),'denied storage shows truthful memory-only warning');await denied.close();
check(errors.length===0,'zero runtime errors');console.log(JSON.stringify({checks:checks.length,errors,measurements}));
}finally{await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,measurements},null,2));await browser.close();await server?.close();}
