import { eyes, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/** Slug: a long glistening olive hump on a slime puddle, eyes on stalks. It stretches and bunches as it crawls. */
export const slug: SpriteDraw = (ctx, p) => {
  const stretch = [0, 2, 4, 2, 0, -2, -4, -2][p.frame % 8], mood = moodOf(p, p.state === 'bite' ? 'angry' : 'neutral'), body = '#7f9a3a', belly = '#c4d978';
  const open = p.state === 'bite' && p.frame % 2 === 0;
  ctx.save(); ctx.globalAlpha *= 0.65; oval(ctx, 6, -3, 48 + stretch, 9, '#d6f08a', null); ctx.restore();
  if (p.dir === 1) {
    shape(ctx, [-36, -4, -40, -30, -20, -54 + stretch * 0.5, 20, -54 + stretch * 0.5, 40, -30, 36, -4], body);
    shape(ctx, [-30, -6, -10, -14, 10, -14, 30, -6], belly, null);
    shine(ctx, -12, -44, 10, 4, 0.5, -0.2);
    for (const [x, y] of [[14, -38], [-18, -30], [4, -26]]) oval(ctx, x, y, 3, 3, '#5f7628', null);
    for (const s of [-1, 1]) { line(ctx, [s * 10, -48, s * 16, -76], INK, 8); line(ctx, [s * 10, -48, s * 16, -76], body, 4); }
    eyes(ctx, 0, -78, 16, 6.5, { frame: p.frame, mood, state: p.state }, pestLook(p));
    mouth(ctx, 0, -22, 8, mood, open);
    return;
  }
  shape(ctx, [-40 - stretch, -4, -44 - stretch, -26, -26, -44, 6, -56 + stretch * 0.5, 34, -40, 46 + stretch, -14, 40 + stretch, -3], body);
  shape(ctx, [-30, -6, -10, -12, 20, -10, 40 + stretch, -4], belly, null);
  shine(ctx, 8, -44, 15, 4, 0.5, 0.1); shine(ctx, 26, -34, 5, 2, 0.4, 0.3);
  for (const [x, y] of [[14, -34], [26, -26], [4, -24]]) oval(ctx, x, y, 3, 3, '#5f7628', null);
  line(ctx, [-32, -36, -36, -60], INK, 8); line(ctx, [-32, -36, -36, -60], body, 4);
  line(ctx, [-20, -42, -18, -66], INK, 8); line(ctx, [-20, -42, -18, -66], body, 4);
  eyes(ctx, -27, -64, 9, 6.5, { frame: p.frame, mood, state: p.state }, pestLook(p));
  mouth(ctx, -34, -20, 7, mood, open);
};
