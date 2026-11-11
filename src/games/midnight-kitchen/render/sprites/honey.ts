import { blush, box, crest, eyes, line, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/** Honey Jar: a low jar tipped into a sticky golden puddle. Tiers widen the puddle, add a bee and a crest. */
export const honey: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'happy'), wide = 44 + p.tier * 4, drip = [0, 1, 2, 3, 4, 3, 2, 1][p.frame % 8];
  oval(ctx, 0, -6, wide, 12, '#f2b632'); shine(ctx, -18, -9, 12, 3, 0.55, 0);
  shape(ctx, [-20, -8, -24, -40, -16, -50, 16, -50, 24, -40, 20, -8], '#ffd66b');
  box(ctx, -21, -58, 42, 10, 4, p.tier === 2 ? '#c0392b' : '#b8743f');
  if (p.tier >= 1) box(ctx, -22, -60, 44, 5, 2, p.tier === 2 ? '#ffffff' : '#d9a441', undefined, 2.5);
  shine(ctx, -14, -30, 4, 10, 0.45, 0.1);
  oval(ctx, 14, -46 + drip, 3, 4 + drip * 0.5, '#f2b632', undefined, 2);
  eyes(ctx, 0, -32, 9, 5.5, { frame: p.frame, mood, state: p.state }); mouth(ctx, 0, -20, 7, mood);
  blush(ctx, 0, -24, 14, 3.5, '#ff9a6a', 0.5);
  line(ctx, [14, -58, 30, -84], '#7c4826', 5); oval(ctx, 32, -88, 6, 8, '#b8743f');
  if (p.tier >= 1) oval(ctx, 32, -14, 5, 4, '#fff3b0', undefined, 3);
  if (p.tier === 2) {
    // a little bee friend
    const by = -72 + [0, -2, -3, -2, 0, 2, 3, 2][p.frame % 8];
    oval(ctx, -30, by - 6, 5, 4, 'rgba(255,255,255,0.9)', undefined, 2); oval(ctx, -24, by - 7, 5, 4, 'rgba(255,255,255,0.9)', undefined, 2);
    oval(ctx, -27, by, 7, 5.5, '#ffd24a', undefined, 2.5); line(ctx, [-28, by - 5, -28, by + 5], '#2a1810', 2.5);
    crest(ctx, -2, -6, 0.65);
  }
};
