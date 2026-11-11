import { blush, box, crest, eyes, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Salt Shaker: a glass shaker that flings salt crystals; deadly to slugs and mold. It tips toward its target on
 * the strike. Tier 2 is blue-banded ceramic; tier 3 a cut-crystal shaker with a gold cap and crest.
 */
export const salt: SpriteDraw = (ctx, p) => {
  const glass = ['#e8f2fa', '#f4f7fb', '#e6f3ff'][p.tier], cap = ['#c9ccd6', '#4f7fd0', '#ffd24a'][p.tier], mood = moodOf(p, 'neutral');
  const tip = p.act === 2 ? 0.28 : p.act === 3 ? 0.14 : p.act === 1 ? -0.08 : 0;
  ctx.save();
  if (p.dir === 1) ctx.translate(0, -tip * 10); else ctx.rotate(tip);
  oval(ctx, 0, -4, 24, 6, '#8a94a8', null);
  shape(ctx, [-22, -4, -26, -30, -20, -58, 20, -58, 26, -30, 22, -4], glass);
  // the salt inside
  shape(ctx, [-22, -6, -25, -26, 25, -26, 22, -6], '#ffffff', null);
  for (const [x, y] of [[-12, -16], [-2, -12], [10, -18], [16, -10], [-16, -9]]) oval(ctx, x, y, 2, 2, '#dfe6f0', null);
  if (p.tier === 1) box(ctx, -25, -36, 50, 6, 2, '#4f7fd0', undefined, 3);
  if (p.tier === 2) for (const x of [-14, 0, 14]) shape(ctx, [x - 4, -52, x, -56, x + 4, -52, x, -10], 'rgba(160,210,255,0.35)', null);
  shine(ctx, -15, -40, 4, 12, 0.7, 0.1);
  // cap with holes
  shape(ctx, [-21, -58, -20, -74, -10, -84, 10, -84, 20, -74, 21, -58], cap);
  for (const [x, y] of [[-6, -76], [0, -79], [6, -76], [0, -71]]) oval(ctx, x, y, 1.8, 1.8, '#2a1810', null);
  eyes(ctx, 0, -42, 9.5, 6, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, 0, -30, 7, mood, p.act === 2);
  blush(ctx, 0, -34, 16, 4, '#ff9aa8', 0.45);
  if (p.act === 2) for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.25; oval(ctx, (p.dir === 1 ? 0 : 20) + Math.cos(a) * (20 + i * 4), -84 + Math.sin(a) * 18, 2.5, 2.5, '#ffffff', undefined, 1.5); }
  if (p.tier === 2) crest(ctx, 0, -88, 0.7);
  ctx.restore();
};
