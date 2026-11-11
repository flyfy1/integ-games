import { blush, eyes, INK, mouth, moodOf, oval, pestLook, shine, type SpriteDraw } from './kit';
import { stewPot } from './stew';

/**
 * The Bloom: the forgotten dish. A blue-flowered casserole that grew a great soft crown of mold at the back of the
 * fridge. Intimidating but sad: drooping mold tendrils, a crown of fuzz, glowing spores. Phase 2 the tendrils lash;
 * phase 3 the mold thins and the stew shows through. `state === 'calm'` (finale) is the mold settling, warming.
 */
export const bloom: SpriteDraw = (ctx, p) => {
  const calm = p.state === 'calm', mood = moodOf(p, calm ? 'sad' : p.tier >= 1 ? 'angry' : 'sad'), windup = p.act === 1;
  const mold = calm ? '#7fb8a4' : ['#4e8c7c', '#3f7f6e', '#5a9a88'][Math.min(2, p.tier)], fuzz = calm ? '#d8efe4' : '#bfe8da';
  const sway = [0, 2, 3, 2, 0, -2, -3, -2][p.frame % 8], thin = p.tier >= 2 || calm;
  ctx.save(); ctx.scale(0.6, 0.6);
  // tendrils
  const lash = windup ? 1.6 : p.tier >= 1 ? 1.2 : 1;
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const x0 = s * (40 + i * 10), y0 = -60 - i * 10;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + s * 24 * lash, y0 - 20 + sway * s, x0 + s * 34 * lash, y0 + 20, x0 + s * (26 + i * 8) * lash, y0 + 46 - sway);
    ctx.strokeStyle = INK; ctx.lineWidth = 13 - i * 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = mold; ctx.lineWidth = 8 - i * 3; ctx.stroke();
  }
  // the dish
  stewPot(ctx, 0, 0, 1, thin ? 0.6 : 0.25, p.frame);
  // mold crown
  const puffs: [number, number, number][] = thin
    ? [[-40, -70, 18], [-18, -92, 22], [12, -96, 22], [38, -74, 18]]
    : [[-50, -66, 20], [-34, -94, 24], [-6, -112, 26], [24, -106, 24], [48, -78, 22], [0, -80, 34]];
  for (const [x, y, r] of puffs) oval(ctx, x, y + sway * 0.4, r, r, mold);
  if (!thin) oval(ctx, 0, -80, 44, 26, mold, null);
  for (const [x, y, r] of puffs) { ctx.save(); ctx.globalAlpha *= 0.55; oval(ctx, x - r * 0.3, y - r * 0.35 + sway * 0.4, r * 0.45, r * 0.3, fuzz, null); ctx.restore(); }
  // glowing spore motes
  ctx.save(); ctx.globalAlpha *= calm ? 0.5 : 0.9;
  for (let i = 0; i < 4; i++) { const f = (p.frame + i * 2) % 8; oval(ctx, -36 + i * 24, -126 - f * 2.5, 3.5, 3.5, calm ? '#ffe9b0' : '#c8ffe8', null); }
  ctx.restore();
  // face in the mold
  const fx = 0, fy = thin ? -82 : -84;
  eyes(ctx, fx, fy, 15, 9.5, { frame: p.frame, mood, state: p.state }, calm ? [0, 0.1] : pestLook(p), calm ? '#fff6e0' : '#effff8');
  mouth(ctx, fx, fy + 22, 12, mood, (p.state === 'bite' && p.frame % 2 === 0) || windup);
  if (calm) blush(ctx, fx, fy + 12, 26, 7, '#ffb08a', 0.7);
  shine(ctx, -22, -100, 10, 5, 0.25, -0.4);
  ctx.restore();
};
