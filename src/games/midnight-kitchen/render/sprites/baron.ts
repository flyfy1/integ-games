import { arc, blush, eyes, feet, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/**
 * The Pantry Baron: a portly mouse lord in a plum waistcoat and cape, a silver thimble for a crown, a monocle and
 * a cheese-wedge sceptre. Phases: the monocle cracks, the cape tears. `act` 1 lifts the sceptre and puffs his cheeks
 * to telegraph blowing out the lights.
 */
export const baron: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, p.tier >= 1 ? 'angry' : 'smug'), front = p.dir === 1, windup = p.act === 1;
  const fur = '#8a7f96', belly = '#d6cfe0', coat = '#5a2a6a';
  ctx.save(); ctx.scale(0.64, 0.64);
  // cape
  shape(ctx, [-46, -96, 46, -96, 60, -8, 20, 0, -20, 0, -60, -8], p.tier >= 2 ? '#7a1f2e' : '#9a2a3a');
  if (p.tier >= 2) shape(ctx, [40, -20, 52, -6, 60, -8, 54, -30], '#2a1810', null);
  // tail
  line(ctx, [front ? 30 : 40, -12, 68, -4, 72, -28, 60, -40], '#e8a0a8', 6);
  feet(ctx, 0, 18, 12, '#6a6076', p.frame, p.state !== 'bite');
  // body + waistcoat
  shape(ctx, [-38, -8, -46, -50, -28, -88, 28, -88, 46, -50, 38, -8], fur);
  shape(ctx, [-30, -10, -34, -50, -18, -74, 18, -74, 34, -50, 30, -10], coat);
  shape(ctx, [-10, -74, 0, -40, 10, -74], belly, INK, 3.5, false);
  for (const y of [-56, -42, -28]) oval(ctx, 0, y, 3, 3, '#ffd24a', INK, 2);
  // head
  const hx = front ? 0 : -8;
  for (const s of [-1, 1]) { oval(ctx, hx + s * 30, -122, 20, 20, fur); oval(ctx, hx + s * 30, -122, 11, 11, '#f0b4bb', null); }
  oval(ctx, hx, -102, 32, 26, fur); shine(ctx, hx - 14, -116, 8, 4, 0.35, -0.3);
  oval(ctx, hx, -88, 18, 10, belly, null);
  eyes(ctx, hx, -106, 12, 7.5, { frame: p.frame, mood, state: p.state }, pestLook(p));
  // monocle
  arc(ctx, hx + 12, -106, 11, 0, Math.PI * 2, '#ffd24a', 3); line(ctx, [hx + 22, -100, hx + 30, -70], '#ffd24a', 2);
  if (p.tier >= 1) line(ctx, [hx + 6, -112, hx + 14, -104, hx + 10, -98], INK, 2);
  oval(ctx, hx, -94, 5.5, 4.5, '#f08a9a');
  if (windup) { oval(ctx, hx, -82, 7, 6, '#7a2b2b', INK, 3); blush(ctx, hx, -88, 18, 7, '#ff8fa3', 0.8); }
  else mouth(ctx, hx, -83, 8, mood, p.state === 'bite' && p.frame % 2 === 0);
  // curly whiskers
  for (const s of [-1, 1]) { arc(ctx, hx + s * 22, -92, 10, s > 0 ? -0.4 : Math.PI - 1.4, s > 0 ? 1.4 : Math.PI + 0.4, INK, 2.5); }
  // thimble crown
  shape(ctx, [hx - 14, -124, hx - 12, -146, hx - 6, -152, hx + 6, -152, hx + 12, -146, hx + 14, -124], '#d4d9e4');
  for (const [x, y] of [[-6, -140], [0, -144], [6, -140], [-3, -132], [3, -132]]) oval(ctx, hx + x, y, 1.6, 1.6, '#8a92a4', null);
  shine(ctx, hx - 7, -142, 2, 6, 0.6, 0);
  // cheese sceptre
  const sx = front ? 52 : -56, raise = windup ? -24 : 0;
  line(ctx, [sx, -20, sx, -96 + raise], INK, 8); line(ctx, [sx, -20, sx, -96 + raise], '#b8743f', 4);
  shape(ctx, [sx - 14, -96 + raise, sx + 14, -96 + raise, sx, -124 + raise], '#ffd24a', INK, 4, false);
  oval(ctx, sx - 3, -104 + raise, 2.5, 2.5, '#e0a520', null); oval(ctx, sx + 4, -110 + raise, 2, 2, '#e0a520', null);
  ctx.restore();
};
