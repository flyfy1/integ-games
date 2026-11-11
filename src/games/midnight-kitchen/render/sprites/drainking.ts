import { feelers, legs, legsFront } from './ant';
import { box, eyes, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/**
 * The Drain King: a huge, oily-green drain roach crowned with a rusty plug on a chain, dripping sink water. Phases
 * crack his shell and turn his eyes red; `act` 1 rears up with the chain swinging to telegraph flood / dive.
 */
export const drainking: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, p.tier >= 1 ? 'angry' : 'smug'), front = p.dir === 1, windup = p.act === 1;
  const shell = p.tier >= 2 ? '#24403a' : '#2a4a44', head = '#3b5e54', sheen = '#7fe0c8';
  const drip = (p.frame % 8) * 2;
  ctx.save(); ctx.scale(0.6, 0.6); ctx.translate(0, windup ? -6 : 0);
  if (front) {
    shape(ctx, [-56, -30, -52, -80, -24, -104, 24, -104, 52, -80, 56, -30], shell); line(ctx, [0, -104, 0, -32], INK, 4);
    shine(ctx, -24, -88, 14, 6, 0.45, -0.3); shine(ctx, 24, -88, 8, 4, 0.35, 0.3);
    if (p.tier >= 1) line(ctx, [-34, -90, -24, -70, -36, -54], INK, 3);
    if (p.tier >= 2) line(ctx, [30, -96, 22, -74, 34, -60], INK, 3);
    legsFront(ctx, -14, 60, p.frame, INK, 6.5);
    feelers(ctx, -12, -54, -64, -110, p.frame, INK, 5); feelers(ctx, 12, -54, 64, -110, (p.frame + 4) % 8, INK, 5);
    oval(ctx, 0, -38, 34, 28, head); shine(ctx, -14, -50, 9, 4, 0.4, -0.3);
    eyes(ctx, 0, -42, 13, 9, { frame: p.frame, mood, state: p.state }, pestLook(p), p.tier >= 2 ? '#ffd8d0' : '#ffffff');
    mouth(ctx, 0, -20, 12, mood, (p.state === 'bite' && p.frame % 2 === 0) || windup);
  } else {
    legs(ctx, -14, 58, p.frame, INK, 6.5);
    feelers(ctx, -38, -44, -90, -84, p.frame, INK, 5); feelers(ctx, -26, -50, -48, -112, (p.frame + 4) % 8, INK, 5);
    shape(ctx, [-30, -14, -46, -50, -20, -86, 40, -90, 66, -56, 58, -18, 14, -8], shell); line(ctx, [16, -88, 22, -12], INK, 4);
    shine(ctx, 26, -72, 20, 6, 0.45, 0.2); shine(ctx, 46, -52, 7, 3, 0.4, 0.3);
    if (p.tier >= 1) line(ctx, [36, -84, 30, -60, 44, -44], INK, 3);
    if (p.tier >= 2) line(ctx, [0, -70, 8, -50, -4, -34], INK, 3);
    oval(ctx, -36, -36, 36, 30, head); shine(ctx, -50, -50, 10, 4, 0.4, -0.3);
    eyes(ctx, -38, -40, 13, 9, { frame: p.frame, mood, state: p.state }, pestLook(p), p.tier >= 2 ? '#ffd8d0' : '#ffffff');
    mouth(ctx, -36, -18, 11, mood, (p.state === 'bite' && p.frame % 2 === 0) || windup);
  }
  // plug crown on a chain
  const hx = front ? 0 : -36, swing = windup ? 18 : [0, 4, 6, 4, 0, -4, -6, -4][p.frame % 8];
  box(ctx, hx - 20, -80, 40, 14, 6, '#b8743f'); oval(ctx, hx, -84, 18, 6, '#d08a4a');
  for (const x of [-12, 0, 12]) shape(ctx, [hx + x - 5, -80, hx + x, -98, hx + x + 5, -80], '#e9c46a', INK, 3, false);
  line(ctx, [hx + 18, -70, hx + 30 + swing, -50, hx + 34 + swing * 1.4, -30], '#c9ccd6', 3.5);
  oval(ctx, hx + 34 + swing * 1.4, -26, 6, 6, '#c9ccd6', INK, 3);
  // drips
  ctx.save(); ctx.globalAlpha *= 0.85;
  oval(ctx, front ? -40 : 50, -36 + drip, 3, 4.5, sheen, INK, 2); oval(ctx, front ? 38 : -4, -64 + drip * 1.3, 2.5, 4, sheen, INK, 2);
  ctx.restore();
  if (windup) { ctx.save(); ctx.globalAlpha *= 0.8; for (const s of [-1, 1]) oval(ctx, s * 64, -10, 12, 5, '#8fd3ff', INK, 2.5); ctx.restore(); }
  ctx.restore();
};
