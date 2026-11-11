import { aimed, blush, box, crest, eyes, line, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Toaster: a retro toaster that fires toast with a hefty knock. The toast pops up on the wind-up and the lever
 * snaps on the strike. Tier 1 mint, tier 2 cherry red with chrome, tier 3 four-slot chrome with gold trim and a crest.
 */
export const toaster: SpriteDraw = (ctx, p) => {
  const body = ['#8fd6c0', '#e0575b', '#d9dee8'][p.tier], trim = p.tier === 2 ? '#ffd24a' : '#c9ccd6', mood = moodOf(p, p.act === 2 ? 'angry' : 'happy');
  const pop = p.act === 1 ? -16 : p.act === 2 ? -4 : -6, slots = p.tier === 2 ? [-20, -7, 7, 20] : p.tier === 1 ? [-14, 14] : [0];
  // toast peeking out
  for (const x of slots) { shape(ctx, [x - 7, -56, x - 8, -62 + pop, x - 4, -68 + pop, x + 4, -68 + pop, x + 8, -62 + pop, x + 7, -56], '#e8b46a', undefined, 3.5); }
  // feet
  oval(ctx, -24, -4, 8, 4, '#2c303c'); oval(ctx, 24, -4, 8, 4, '#2c303c');
  box(ctx, -38, -60, 76, 56, 18, body);
  shine(ctx, -24, -46, 6, 10, 0.55, 0.3);
  box(ctx, -38, -20, 76, 7, 3, trim, undefined, 3.5);
  for (const x of slots) box(ctx, x - 8, -62, 16, 6, 3, '#2a1810', null);
  eyes(ctx, 0, -40, 11, 6.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, 0, -27, 8, mood === 'angry' ? 'neutral' : mood, p.act === 2);
  blush(ctx, 0, -31, 20, 4.5, '#ff9a8a', 0.5);
  // lever on the side, aimed at the pests (it doubles as the barrel the toast leaves from)
  aimed(ctx, p, p.dir === 1 ? 0 : 36, p.dir === 1 ? -62 : -36, () => {
    const snap = p.act === 2 ? 6 : 0;
    box(ctx, 0, -5 + snap * 0.3, 10 + snap, 10, 3, '#3b3f4d');
    if (p.act === 2) { line(ctx, [18, -10, 26, -14], '#ffffff', 3); line(ctx, [18, 10, 26, 14], '#ffffff', 3); }
  });
  if (p.tier === 2) crest(ctx, 0, -4, 0.75);
};
