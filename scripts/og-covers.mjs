// 1200×630 link-preview covers (og:image) from the 640×360 game art: the cover over a blurred copy of itself,
// with the title and the site underneath. Run after capture-game-art when a cover changes:
//   node scripts/og-covers.mjs            → public/game-art/<slug>-og.jpg for every game
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const rows = JSON.parse(readFileSync(new URL('../src/core/catalog-data.json', import.meta.url), 'utf8'));
const art = new URL('../public/game-art/', import.meta.url);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [slug, title, , tagline, , accent] of rows) {
  const src = `data:image/jpeg;base64,${readFileSync(new URL(`${slug}-cover.jpg`, art)).toString('base64')}`;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0f1a;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="position:absolute;inset:-40px;background:url(${src}) center/cover;filter:blur(28px) brightness(.45) saturate(1.2)"></div>
  <img src="${src}" style="position:absolute;left:56px;top:56px;width:640px;height:360px;border-radius:18px;box-shadow:0 18px 48px rgba(0,0,0,.55);outline:3px solid ${esc(accent || '#ffffff')}66;outline-offset:0">
  <div style="position:absolute;left:740px;right:56px;top:56px;height:360px;display:flex;flex-direction:column;justify-content:center;color:#fff">
    <div style="font-size:60px;font-weight:800;line-height:1.05;letter-spacing:-.5px">${esc(title)}</div>
    <div style="margin-top:18px;font-size:28px;line-height:1.3;color:#d6dcea;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden">${esc(tagline)}</div>
  </div>
  <div style="position:absolute;left:56px;right:56px;bottom:52px;display:flex;justify-content:space-between;align-items:center;color:#fff">
    <div style="font-size:34px;font-weight:700">Play free in your browser</div>
    <div style="font-size:30px;font-weight:600;color:${esc(accent || '#7CF5D4')}">games.integ.life</div>
  </div></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: new URL(`${slug}-og.jpg`, art).pathname, type: 'jpeg', quality: 84 });
}
await browser.close();
console.log(`og covers: ${rows.length}`);
