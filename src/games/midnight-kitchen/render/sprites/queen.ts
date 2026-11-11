import { feelers, legs, legsFront } from './ant';
import { box, eyes, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/**
 * Queen Crumb: a huge ant with a purple cape, a sugar-crystal crown and a sugar-cube sceptre. `tier` is her phase
 * (angrier each time, the crown blushes pink and cracks); `act` 1 raises the sceptre to telegraph an attack.
 */
export const queen: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, p.tier >= 2 ? 'angry' : p.tier === 1 ? 'smug' : 'neutral'), front = p.dir === 1, windup = p.act === 1;
  const shell = p.tier >= 2 ? '#a8304e' : '#8e3550', head = p.tier >= 2 ? '#c8445e' : '#b44a64';
  ctx.save(); ctx.scale(0.62, 0.62);
  if (front) {
    oval(ctx, 0, -84, 40, 30, '#5c1f36'); shine(ctx, -14, -98, 14, 6, 0.3);
    shape(ctx, [-44, -66, 44, -66, 54, -18, 0, -6, -54, -18], '#6d3a9a');
    legsFront(ctx, -16, 50, p.frame, INK, 6);
    oval(ctx, 0, -50, 24, 20, shell);
    feelers(ctx, -10, -60, -34, -104, p.frame, INK, 5); feelers(ctx, 10, -60, 34, -104, (p.frame + 4) % 8, INK, 5);
    oval(ctx, 0, -34, 34, 28, head); shine(ctx, -14, -46, 9, 4, 0.4, -0.3);
    eyes(ctx, 0, -38, 13, 9, { frame: p.frame, mood, state: p.state }, pestLook(p));
    mouth(ctx, 0, -18, 10, mood, p.state === 'bite' && p.frame % 2 === 0);
  } else {
    legs(ctx, -16, 44, p.frame, INK, 6);
    oval(ctx, 22, -76, 40, 34, '#5c1f36'); shine(ctx, 34, -92, 14, 6, 0.3);
    for (const y of [-92, -76, -60]) line(ctx, [-6, y, 52, y + 4], '#431428', 4);
    shape(ctx, [-30, -60, 30, -64, 46, -20, 0, -8, -44, -18], '#6d3a9a');
    oval(ctx, 0, -50, 24, 20, shell);
    feelers(ctx, -20, -62, -48, -100, p.frame, INK, 5); feelers(ctx, 4, -66, 26, -106, (p.frame + 4) % 8, INK, 5);
    oval(ctx, -10, -34, 32, 28, head); shine(ctx, -22, -46, 9, 4, 0.4, -0.3);
    eyes(ctx, -13, -38, 13, 9, { frame: p.frame, mood, state: p.state }, pestLook(p));
    mouth(ctx, -13, -18, 10, mood, p.state === 'bite' && p.frame % 2 === 0);
  }
  // crown of sugar crystals
  const cx = front ? 0 : -12;
  ctx.save(); ctx.translate(cx, 0);
  shape(ctx, [-24, -58, -28, -84, -14, -72, 0, -94, 14, -72, 28, -84, 26, -60], p.tier >= 2 ? '#ffd0dc' : '#ffffff', INK, 4, false);
  oval(ctx, 0, -72, 4.5, 4.5, '#ff5d8a', INK, 2);
  if (p.tier >= 1) line(ctx, [8, -86, 4, -76, 10, -68], INK, 2.5);
  ctx.restore();
  // sceptre: raised high on the wind-up
  const sx = front ? -58 : -52, lift = windup ? -26 : 0;
  ctx.save(); ctx.translate(sx, -8); ctx.rotate(windup ? -0.35 : 0);
  line(ctx, [0, 0, -6, -66 + lift], INK, 9); line(ctx, [0, 0, -6, -66 + lift], '#e9c46a', 4);
  ctx.translate(-6, -78 + lift); ctx.rotate(0.3); box(ctx, -12, -12, 24, 24, 4, '#ffffff'); shine(ctx, -4, -5, 5, 3, 0.6);
  if (windup) for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; line(ctx, [Math.cos(a) * 18, Math.sin(a) * 18, Math.cos(a) * 26, Math.sin(a) * 26], '#ffe27a', 3); }
  ctx.restore();
  ctx.restore();
};
