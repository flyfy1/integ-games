import { blush, box, crest, eyes, flame, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Burner: a squat cast-iron camp stove, the warm heart of every board. Tier 2 gains brass knobs and three flames;
 * tier 3 burns blue in a polished chrome body with a gold crest. The flame leaps when it makes Heat.
 */
export const burner: SpriteDraw = (ctx, p) => {
  const lift = p.act ? 1.4 : 1, iron = ['#59627a', '#4f5f8a', '#c8d0e0'][p.tier], top = ['#3c4254', '#384466', '#8e98b0'][p.tier];
  const mood = moodOf(p, 'happy');
  // legs
  for (const x of [-26, 26]) box(ctx, x - 5, -12, 10, 12, 3, '#2c303c');
  // body
  box(ctx, -38, -46, 76, 38, 14, iron);
  if (p.tier === 2) { shine(ctx, -24, -36, 12, 4, 0.55, 0); box(ctx, -38, -24, 76, 6, 3, '#ffd24a'); }
  else shine(ctx, -24, -36, 11, 4, 0.3, 0);
  // grate
  box(ctx, -42, -56, 84, 12, 6, top);
  for (const x of [-22, 0, 22]) shape(ctx, [x - 4, -56, x - 2, -62, x + 2, -62, x + 4, -56], '#2c303c', null, 0, false);
  // flames
  const blue = p.tier === 2;
  if (p.tier >= 1) { flame(ctx, -22, -58, 14 * lift, (p.frame + 3) % 8, blue ? '#4fa8ff' : '#ff7a1a', blue ? '#dff6ff' : '#ffe27a'); flame(ctx, 22, -58, 14 * lift, (p.frame + 5) % 8, blue ? '#4fa8ff' : '#ff7a1a', blue ? '#dff6ff' : '#ffe27a'); }
  flame(ctx, 0, -58, (blue ? 28 : p.tier === 1 ? 24 : 22) * lift, p.frame, blue ? '#3f9bff' : '#ff8a1f', blue ? '#e8fbff' : '#ffe27a');
  // face
  eyes(ctx, 0, -30, 12, 6.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, 0, -17, 9, mood, p.act === 2);
  blush(ctx, 0, -20, 22, 5, '#ff9a6a', 0.5);
  // knobs
  if (p.tier >= 1) { oval(ctx, -31, -27, 4.5, 4.5, p.tier === 2 ? '#ffd24a' : '#d9a441', undefined, 3); oval(ctx, 31, -27, 4.5, 4.5, p.tier === 2 ? '#ffd24a' : '#d9a441', undefined, 3); }
  if (p.tier === 2) crest(ctx, 0, -6, 0.9);
};
