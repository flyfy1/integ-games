import { eyes, INK, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/**
 * Mold Brute: a hulking heap of fuzzy grey-green mold with mushroom caps on its back and two heavy fists. Its
 * arms swing as it lumbers and slam down when it bites. Bursts into spores when it falls.
 */
export const brute: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'angry'), smash = p.state === 'bite' ? (p.frame % 2 ? 1 : 0) : 0, sway = [0, 2, 3, 2, 0, -2, -3, -2][p.frame % 8];
  const fur = '#4f6e5c', dark = '#37503f', front = p.dir === 1;
  const fist = (x: number, y: number) => { oval(ctx, x, y, 13, 12, '#5f8a70'); oval(ctx, x - 4, y - 4, 4, 3, '#86b596', null); };
  // legs
  oval(ctx, -16, -6, 12, 7, dark); oval(ctx, 16, -6, 12, 7, dark);
  // body: lumpy mound
  const lumps: [number, number, number][] = [[-30, -40, 18], [-14, -62, 20], [10, -66, 20], [30, -46, 18], [0, -40, 30]];
  for (const [x, y, r] of lumps) oval(ctx, x, y + sway * 0.3, r, r * 0.95, fur);
  oval(ctx, 0, -34, 34, 26, fur, null);
  for (const [x, y] of [[-24, -50], [18, -60], [26, -32], [-6, -70]]) oval(ctx, x, y, 4, 4, dark, null);
  shine(ctx, -16, -66, 8, 4, 0.3, -0.3);
  // mushroom caps on the back
  for (const [x, y, s] of [[-18, -80, 1], [12, -84, 0.8]] as const) { oval(ctx, x, y + 8 * s, 3 * s, 8 * s, '#efe2c8'); shape(ctx, [x - 12 * s, y + 2, x - 8 * s, y - 8 * s, x + 8 * s, y - 8 * s, x + 12 * s, y + 2], '#c4626a'); oval(ctx, x - 3 * s, y - 3 * s, 2 * s, 2 * s, '#ffe9d0', null); }
  // face under a heavy brow
  const fx = front ? 0 : -8;
  shape(ctx, [fx - 22, -48, fx, -54, fx + 22, -48, fx + 18, -42, fx - 18, -42], dark, null);
  eyes(ctx, fx, -38, 10, 6, { frame: p.frame, mood, state: p.state }, front ? pestLook(p) : [-0.3, 0.1], '#f0ffe8');
  mouth(ctx, fx, -20, 12, mood, smash === 1);
  if (mood !== 'dead') for (const s of [-1, 1]) shape(ctx, [fx + s * 6, -18, fx + s * 4, -12, fx + s * 8, -14], '#ffffff', INK, 1.5, false);
  // arms
  const reach = smash ? 10 : 0;
  if (front) { fist(-40, -20 + sway + reach); fist(40, -20 - sway + reach); }
  else { fist(-38 - reach, -22 + sway + reach * 1.4); fist(30, -18 - sway); }
};
