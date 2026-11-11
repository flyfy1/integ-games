import { blush, box, crest, eyes, line, mouth, moodOf, oval, shape, shine, wisp, type SpriteDraw } from './kit';

/**
 * Rice Cooker: a round, motherly cooker that warms and mends its neighbours. The lid lifts and a heart of steam
 * rises when it pulses. Tier 1 cream, tier 2 sakura pink with a flower, tier 3 deluxe black-and-gold with a crest.
 */
export const ricecooker: SpriteDraw = (ctx, p) => {
  const body = ['#f6efe0', '#ffc6d2', '#3a3f52'][p.tier], lid = ['#e3dac6', '#ff9fb4', '#22252e'][p.tier], mood = moodOf(p, 'happy');
  const lift = p.act === 2 ? -6 : p.act === 3 ? -3 : 0, led = p.tier === 2 ? '#ffd24a' : '#7ee0a0';
  oval(ctx, -22, -4, 8, 4, '#8a7a66'); oval(ctx, 22, -4, 8, 4, '#8a7a66');
  shape(ctx, [-40, -8, -44, -34, -36, -56, 36, -56, 44, -34, 40, -8, 28, -2, -28, -2], body);
  shine(ctx, -28, -40, 5, 10, 0.5, 0.3);
  // control panel
  box(ctx, -16, -24, 32, 14, 6, p.tier === 2 ? '#15171c' : '#ffffff', undefined, 3);
  oval(ctx, -6, -17, 3, 3, led, null); oval(ctx, 6, -17, 3, 3, p.act ? '#ff6b6b' : '#c9ccd6', null);
  // lid and handle
  ctx.save(); ctx.translate(0, lift);
  shape(ctx, [-38, -54, -30, -70, 30, -70, 38, -54], lid);
  box(ctx, -10, -78, 20, 9, 4, p.tier === 2 ? '#ffd24a' : '#8a7a66', undefined, 3.5);
  if (p.tier === 1) { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; oval(ctx, 22 + Math.cos(a) * 4, -64 + Math.sin(a) * 4, 3, 3, '#ffffff', undefined, 1.5); } oval(ctx, 22, -64, 2, 2, '#ffd24a', null); }
  ctx.restore();
  eyes(ctx, 0, -40, 11, 6, { frame: p.frame, mood, state: p.state }, [0, 0.1], p.tier === 2 ? '#fff6e0' : '#ffffff');
  mouth(ctx, 0, -30, 7, mood);
  blush(ctx, 0, -33, 22, 5, '#ff8fa3', 0.5);
  if (p.act >= 2) {
    // a heart of steam
    ctx.save(); ctx.globalAlpha = 0.9;
    ctx.translate(0, -92 + lift);
    shape(ctx, [0, 8, -10, -2, -10, -8, -5, -12, 0, -8, 5, -12, 10, -8, 10, -2], '#ff8fa3', '#ffffff', 2.5);
    ctx.restore();
  } else wisp(ctx, 0, -78, 12, p.frame, '#ffffff', 0.6);
  if (p.tier === 2) { line(ctx, [-40, -36, 40, -36], '#ffd24a', 3); crest(ctx, 0, -6, 0.7); }
};
