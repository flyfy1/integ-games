import { blush, box, crest, eyes, line, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Shelly the Egg Lobber: an egg in a cup with a spoon catapult. The spoon whips forward on the throw (up the
 * screen on the tall board). Tier 2: a red cup and a doubled spoon; tier 3: a golden cup, two eggs loaded, crest.
 */
export const egg: SpriteDraw = (ctx, p) => {
  const cup = ['#6fa8dc', '#e06c75', '#f0c04a'][p.tier], mood = moodOf(p, p.act ? 'angry' : 'worried');
  const spoon = () => {
    // cocked back at rest, forward after the throw; drawn pointing up (-y) and turned by aim
    const angle = p.act === 2 ? 0.75 : p.act === 3 ? 0.45 : p.act === 1 ? -0.95 : -0.6;
    ctx.save(); ctx.translate(p.dir === 1 ? 24 : 26, -30); ctx.rotate(p.dir === 1 ? angle * 0.45 - 0.15 : angle);
    {
      box(ctx, -3, -46, 6, 48, 3, '#c9ccd6');
      oval(ctx, 0, -52, 11, 13, '#e4e8ef');
      if (p.act < 2) { oval(ctx, 0, -54, 7, 8.5, '#fff8e8', undefined, 3); if (p.tier === 2) oval(ctx, 3, -42, 5, 6, '#fff8e8', undefined, 3); }
    }
    ctx.restore();
  };
  shape(ctx, [-20, -2, -8, -10, 8, -10, 20, -2], cup);
  shape(ctx, [-27, -34, -23, -14, -8, -8, 8, -8, 23, -14, 27, -34], cup);
  if (p.tier >= 1) line(ctx, [-23, -24, 23, -24], '#fff3d0', 4);
  shape(ctx, [-22, -36, -25, -58, -12, -84, 12, -84, 25, -58, 22, -36, 0, -30], '#fff6e2');
  shine(ctx, -10, -68, 5, 10, 0.55, 0.3);
  eyes(ctx, 0, -55, 9.5, 6, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, 0, -42, 7, mood === 'angry' ? 'neutral' : mood, p.act === 2);
  blush(ctx, 0, -46, 15, 4, '#ff9aa8', 0.5);
  spoon();
  if (p.tier === 2) crest(ctx, 0, -18, 0.75);
};
