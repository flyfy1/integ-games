import { aimed, box, crest, eyes, lookOf, mouth, moodOf, oval, shape, shine, type SpriteDraw } from './kit';

/**
 * Sgt. Pepper Mill: a turned-wood grinder with a stubby barrel (aimed down the lane). Tier 2: brass band and a
 * helmet-like cap; tier 3: twin barrels, dark lacquered wood, gold trim and a crest.
 */
export const pepper: SpriteDraw = (ctx, p) => {
  const recoil = p.act === 2 ? -5 : p.act === 1 ? 3 : 0, wood = ['#b9773f', '#a8683a', '#7a4a2e'][p.tier], dark = ['#83502a', '#7c4826', '#4e2c1a'][p.tier];
  const trim = p.tier >= 1 ? '#f0c04a' : '#c9ccd6', mood = moodOf(p, 'angry'), vertical = p.dir === 1;
  ctx.save(); ctx.translate(vertical ? 0 : recoil, vertical ? -recoil : 0);
  oval(ctx, 0, -5, 27, 7, dark);
  // barrel(s) behind the body when aiming up, in front when aiming right
  const barrels = () => aimed(ctx, p, vertical ? 22 : 14, vertical ? -30 : -38, () => {
    const one = (y: number) => { box(ctx, 0, y - 8, 32, 16, 6, '#4a4f5e'); box(ctx, 26, y - 9, 8, 18, 3, '#33363f'); oval(ctx, 34, y, 3.5, 6.5, '#15171c', null); };
    if (p.tier === 2) { one(-9); one(9); } else one(0);
    if (p.act === 2) { ctx.save(); ctx.globalAlpha = 0.9; oval(ctx, 46, 0, 10, 10, '#fff2b8', null); oval(ctx, 46, 0, 5, 5, '#ffffff', null); ctx.restore(); }
  });
  if (vertical) barrels();
  shape(ctx, [-25, -6, -28, -36, -18, -64, 18, -64, 28, -36, 25, -6], wood);
  shine(ctx, -15, -40, 5, 16, 0.25, 0.1);
  box(ctx, -22, -73, 44, 12, 5, trim);
  if (p.tier >= 1) shape(ctx, [-20, -73, -16, -88, 16, -88, 20, -73], p.tier === 2 ? '#3d4a6a' : '#5a6a46');
  oval(ctx, 0, p.tier >= 1 ? -94 : -84, 12, 11, dark); shine(ctx, -4, p.tier >= 1 ? -98 : -88, 4, 3);
  eyes(ctx, -2, -45, 10, 6, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, -2, -29, 8, mood === 'angry' ? 'neutral' : mood, p.act === 2);
  // moustache: he is a sergeant
  shape(ctx, [-2, -35, -14, -32, -20, -26, -10, -30, -2, -32, 6, -30, 16, -26, 10, -32], '#3a2418', null);
  if (p.tier === 2) { box(ctx, -26, -20, 52, 7, 3, '#f0c04a'); crest(ctx, 0, -78, 0.8); }
  if (!vertical) barrels();
  ctx.restore();
};
