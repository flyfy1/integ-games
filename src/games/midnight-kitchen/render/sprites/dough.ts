import { arc, blush, crest, eyes, line, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Bun the Dough: a sleepy, squishy wall. Tier 2 bakes a golden crust with score marks; tier 3 is a glossy braided
 * brioche with sesame and a crest. Bite marks show damage; it squashes as it breathes.
 */
export const dough: SpriteDraw = (ctx, p) => {
  const hp = p.hp ?? 1, fill = ['#f8e6c4', '#f0c07a', '#d9904a'][p.tier], breathe = [0, 0.5, 1, 1.5, 2, 1.5, 1, 0.5][p.frame % 8];
  const mood = moodOf(p, hp < 0.4 ? 'worried' : 'happy');
  const h = -78 + breathe, w = 46 + breathe * 0.5;
  shape(ctx, [-w, -2, -w - 2, -40 + breathe * 0.4, -22, h + 2, 22, h, w + 2, -42 + breathe * 0.4, w, -2], fill);
  shine(ctx, -20, -58, 13, 6, 0.45);
  if (p.tier === 0) { oval(ctx, 28, -20, 5, 3, '#fffaf0', null); oval(ctx, -30, -14, 4, 2.5, '#fffaf0', null); oval(ctx, 12, -62, 3, 2, '#fffaf0', null); }
  if (p.tier === 1) for (const x of [-18, 0, 18]) arc(ctx, x, -56, 12, Math.PI * 1.15, Math.PI * 1.85, '#a8662a', 3.5);
  if (p.tier === 2) {
    // braid ridges and sesame
    for (const x of [-26, -8, 10, 28]) arc(ctx, x, -48, 14, Math.PI * 1.1, Math.PI * 1.9, '#9a5422', 3.5);
    for (const [x, y] of [[-18, -68], [-4, -73], [12, -71], [26, -60], [-32, -56], [4, -62]]) oval(ctx, x, y, 2.6, 1.6, '#fff3d0', null, 0, 0.6);
    shine(ctx, 14, -66, 6, 3, 0.6, 0.4);
  }
  eyes(ctx, 0, -36, 14, 6.5, { frame: hp < 0.4 ? 0 : p.frame, mood, state: p.state }, p.dir === 1 ? lookOf(p) : [0.2, 0.25]);
  mouth(ctx, 0, -19, 9, mood);
  blush(ctx, 0, -24, 26, 6, '#ff9a8a', 0.45);
  // bite marks (on the side the pests come from)
  const bx = p.dir === 1 ? 0 : 44, by = p.dir === 1 ? -72 : -34;
  if (hp < 0.75) { oval(ctx, bx, by, 10, 9, '#9a6a44'); line(ctx, [bx - 8, by - 6, bx - 5, by, bx - 8, by + 6], '#2a1810', 3); }
  if (hp < 0.5) oval(ctx, p.dir === 1 ? -26 : 34, p.dir === 1 ? -62 : -62, 9, 8, '#9a6a44');
  if (hp < 0.25) oval(ctx, p.dir === 1 ? 26 : 42, p.dir === 1 ? -60 : -12, 9, 8, '#9a6a44');
  if (p.tier === 2) crest(ctx, 0, -82 + breathe, 0.8);
};
