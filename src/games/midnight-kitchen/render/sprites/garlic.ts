import { arc, blush, crest, curve, eyes, lookOf, mouth, moodOf, oval, shape, shine, wisp, type SpriteDraw } from './kit';

/**
 * Garlic: a plump, proud bulb whose stink shoves pests into the next lane. Puffs its cheeks on the wind-up and
 * blasts a green cloud on the strike. Tier 2 sprouts a braid of stems; tier 3 wears a garlic-braid wreath and crest.
 */
export const garlic: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, p.act === 2 ? 'smug' : 'happy'), puff = p.act === 1 ? 4 : p.act === 2 ? -2 : 0, skin = ['#f6efe2', '#f3e6d0', '#fff6e6'][p.tier];
  // stems
  curve(ctx, -2, -76, -6, -92, 4, -104, '#2a1810', 9); curve(ctx, -2, -76, -6, -92, 4, -104, '#8cc06e', 5);
  if (p.tier >= 1) { curve(ctx, 4, -76, 16, -88, 22, -100, '#2a1810', 8); curve(ctx, 4, -76, 16, -88, 22, -100, '#8cc06e', 4); }
  // bulb: cloves as lobes
  shape(ctx, [0, -2, -26, -4, -40 - puff, -26, -36 - puff, -52, -16, -72, 0, -80, 16, -72, 36 + puff, -52, 40 + puff, -26, 26, -4], skin);
  arc(ctx, -14, -40, 30, -0.9, 0.9, '#d7c7aa', 3); arc(ctx, 14, -40, 30, Math.PI - 0.9, Math.PI + 0.9, '#d7c7aa', 3);
  for (const x of [-6, 2, 10]) oval(ctx, x, -2, 3, 2, '#c9b48a', null);
  shine(ctx, -20, -54, 6, 12, 0.6, 0.4);
  // purple streaks (pride of the bulb)
  if (p.tier >= 1) { arc(ctx, -22, -32, 18, -1.1, -0.2, '#b07ac4', 3); arc(ctx, 22, -32, 18, Math.PI + 0.2, Math.PI + 1.1, '#b07ac4', 3); }
  eyes(ctx, 0, -40, 11, 6.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  if (p.act === 1) oval(ctx, 0, -24, 7, 5, '#f3e6d0'); else mouth(ctx, 0, -24, 8, mood, p.act === 2);
  blush(ctx, 0, -30, 22, puff ? 8 : 5, '#ff9aa8', puff ? 0.75 : 0.45);
  if (p.act === 2) for (const [x, f] of [[-30, 0], [30, 2], [-14, 4], [16, 6]] as const) wisp(ctx, x + (p.dir === 1 ? 0 : 18), -70, 18, (p.frame + f) % 8, '#a8d86a', 0.9);
  if (p.tier === 2) {
    // braid wreath
    for (let i = 0; i < 5; i++) oval(ctx, -28 + i * 14, -6, 7, 5, '#efe2c8', undefined, 2.5);
    crest(ctx, 0, -84, 0.75);
  }
};
