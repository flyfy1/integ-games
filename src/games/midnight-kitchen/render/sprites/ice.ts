import { crest, eyes, line, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Frost the Ice Cube: a cool customer. Tier 2 grows frost spikes and a scarf; tier 3 a crystal crown, glassy
 * facets and a crest. Leans into each shot and puffs a chip.
 */
export const ice: SpriteDraw = (ctx, p) => {
  const lean = p.act === 2 ? 4 : 0, mood = moodOf(p, 'smug'), body = ['#9fe0ff', '#8fd6ff', '#b8ecff'][p.tier];
  ctx.save(); ctx.translate(p.dir === 1 ? 0 : lean, p.dir === 1 ? -lean : 0);
  oval(ctx, 0, -3, 32, 6, '#7fc4e6', null);
  if (p.tier >= 1) for (const x of [-22, 0, 22]) shape(ctx, [x - 7, -62, x, -84 - (x === 0 ? 8 : 0), x + 7, -62], '#e6f9ff', undefined, 4, false);
  if (p.tier === 2) for (const x of [-11, 11]) shape(ctx, [x - 5, -64, x, -94, x + 5, -64], '#ffffff', undefined, 3.5, false);
  shape(ctx, [-32, -6, -34, -58, -26, -66, 26, -66, 34, -58, 32, -6, 24, -2, -24, -2], body);
  shape(ctx, [-34, -58, -26, -66, 26, -66, 34, -58, 22, -52, -22, -52], '#e2f8ff', undefined, 4);
  shine(ctx, -21, -30, 4, 15, 0.6, 0.1); shine(ctx, 22, -14, 6, 3, 0.35);
  if (p.tier === 2) { line(ctx, [-24, -48, -8, -8], '#ffffff', 2); line(ctx, [18, -50, 26, -20], '#ffffff', 2); }
  eyes(ctx, 0, -36, 12, 6.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, 0, -20, 8, mood, p.act === 2);
  if (p.tier >= 1) { // scarf
    shape(ctx, [-30, -14, 30, -14, 30, -6, -30, -6], p.tier === 2 ? '#3f7bd9' : '#e0575b', undefined, 3.5, false);
    shape(ctx, [16, -10, 24, 4, 32, 2, 26, -10], p.tier === 2 ? '#3f7bd9' : '#e0575b', undefined, 3);
  }
  if (p.tier === 2) crest(ctx, 0, -96, 0.75);
  ctx.restore();
};
