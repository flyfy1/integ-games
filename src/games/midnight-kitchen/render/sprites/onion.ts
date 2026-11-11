import { arc, crest, eyes, mouth, moodOf, oval, shape, shine, wisp, type SpriteDraw } from './kit';

/**
 * Onion: a weepy bulb. Tears well up while it recharges; it scrunches and puffs a sting cloud when it bursts.
 * Tiers deepen the purple and add sprouts; tier 3 wears a crest.
 */
export const onion: SpriteDraw = (ctx, p) => {
  const skin = ['#dcb8ea', '#c58fd8', '#a45fc4'][p.tier], squash = p.act === 2 ? 6 : 0, mood = moodOf(p, 'sad');
  shape(ctx, [-6, -70 + squash, -10, -92, -2, -100, 2, -86, 12, -98, 10, -70 + squash], '#7cc46a');
  if (p.tier >= 1) shape(ctx, [8, -72 + squash, 22, -90, 30, -84, 16, -70 + squash], '#7cc46a');
  if (p.tier === 2) shape(ctx, [-8, -72 + squash, -22, -90, -30, -84, -16, -70 + squash], '#7cc46a');
  shape(ctx, [0, -2, -30, -6, -42 - squash * 0.5, -34 + squash, -24, -66 + squash, 0, -78 + squash, 24, -66 + squash, 42 + squash * 0.5, -34 + squash, 30, -6], skin);
  arc(ctx, -30, -36, 34, -0.75, 0.75, '#7d3f98', 3); arc(ctx, 30, -36, 34, Math.PI - 0.75, Math.PI + 0.75, '#7d3f98', 3);
  shine(ctx, -18, -54, 6, 10, 0.45, 0.4);
  oval(ctx, -8, -2, 3, 2, '#e9d9b0', null); oval(ctx, 4, -1, 3, 2, '#e9d9b0', null); oval(ctx, 14, -3, 3, 2, '#e9d9b0', null);
  eyes(ctx, 0, -40, 12, 7, { frame: p.act === 2 ? 6 : p.frame, mood, state: p.state }, [0.15, p.dir === 1 ? -0.2 : 0.2]);
  mouth(ctx, 0, -22, 8, mood, p.act === 2);
  // tears
  if (p.act !== 2 && mood !== 'dead') for (const side of [-1, 1]) { const drop = (p.frame + (side > 0 ? 3 : 0)) % 8; oval(ctx, side * 15, -30 + drop * 1.6, 2.6, 3.6, '#8fd8ff', undefined, 2); }
  if (p.act === 2) for (const [x, f] of [[-34, 0], [34, 3], [0, 5]] as const) wisp(ctx, x, -60, 16, (p.frame + f) % 8, '#e7c9f2', 0.9);
  if (p.tier === 2) crest(ctx, 0, -10, 0.7);
};
