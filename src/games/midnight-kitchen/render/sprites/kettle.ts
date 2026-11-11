import { aimed, arc, crest, eyes, lookOf, mouth, moodOf, oval, shape, shine, wisp, type SpriteDraw } from './kit';

/**
 * Kettle: a round steel kettle. The spout points down the lane (up the screen on the tall board) and jets steam on
 * its attack. Tier 2: enamel blue with a whistle cap; tier 3: polished copper-gold with a crest.
 */
export const kettle: SpriteDraw = (ctx, p) => {
  const steel = ['#b4bccb', '#5d8fd6', '#e8b25a'][p.tier], lid = ['#8a92a4', '#3f6fb8', '#c58a34'][p.tier];
  const mood = moodOf(p, p.act === 2 ? 'angry' : 'neutral'), vertical = p.dir === 1;
  const spout = () => aimed(ctx, p, vertical ? 26 : 24, vertical ? -40 : -32, () => {
    shape(ctx, [-4, -6, 22, -18, 28, -12, 26, -4, -2, 8], steel);
    if (p.act >= 2) { wisp(ctx, 36, -12, 18, p.frame, '#ffffff', 0.9); oval(ctx, 40, -14, 9, 7, 'rgba(255,255,255,0.85)', null); oval(ctx, 54, -18, 7, 6, 'rgba(255,255,255,0.7)', null); }
  });
  if (vertical) spout();
  arc(ctx, -4, -64, 26, Math.PI, Math.PI * 2, '#2a1810', 9); arc(ctx, -4, -64, 26, Math.PI, Math.PI * 2, p.tier === 2 ? '#7a4a2e' : '#5a4030', 4);
  shape(ctx, [-34, -4, -40, -36, -28, -62, 20, -62, 32, -36, 28, -4], steel);
  shine(ctx, -22, -40, 5, 15, 0.5, 0.2);
  oval(ctx, -4, -64, 22, 6, lid); oval(ctx, -4, -72, 5, 5, p.tier === 1 ? '#e0575b' : '#3b3f4d');
  eyes(ctx, -4, -38, 11, 6.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, -4, -22, 8, mood === 'angry' ? 'neutral' : mood, p.act === 2);
  if (p.tier === 2) crest(ctx, -4, -82, 0.75);
  if (!vertical) spout();
};
