import { arc, INK, line, moodOf, oval, shape, type SpriteDraw } from './kit';

/**
 * Granny: a memory of the cook who made the forgotten dish. Drawn as a warm silhouette, backlit like a kitchen
 * doorway at dusk: amber halo, hair bun, round spectacles that catch the light, apron, a wooden spoon. Moods
 * change only the soft line of the mouth and the tilt of the head.
 */
export const granny: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'happy'), tilt = mood === 'sad' ? 0.08 : mood === 'worried' ? -0.06 : mood === 'happy' ? 0.04 : 0;
  // halo
  for (const [r, a] of [[62, 0.18], [48, 0.25], [36, 0.3]] as const) { ctx.save(); ctx.globalAlpha *= a; oval(ctx, 0, -58, r, r, '#ffcf7a', null); ctx.restore(); }
  const sil = '#5a3424', rim = '#ffc46a';
  ctx.save(); ctx.translate(0, -50); ctx.rotate(tilt); ctx.translate(0, 50);
  // shoulders and apron
  shape(ctx, [-44, 4, -40, -26, -22, -40, 22, -40, 40, -26, 44, 4], sil, rim, 3);
  shape(ctx, [-18, 4, -20, -30, 20, -30, 18, 4], '#7a4a32', rim, 2);
  line(ctx, [-20, -30, -12, -40], rim, 2); line(ctx, [20, -30, 12, -40], rim, 2);
  // head and bun
  oval(ctx, 0, -62, 24, 26, sil, rim, 3);
  oval(ctx, 0, -92, 13, 11, sil, rim, 3);
  arc(ctx, 0, -66, 25, Math.PI * 1.05, Math.PI * 1.95, '#8a5a40', 4);
  // spectacles catching the light
  for (const s of [-1, 1]) { oval(ctx, s * 10, -62, 7.5, 6.5, 'rgba(255,220,150,0.35)', '#ffd890', 2.5); oval(ctx, s * 10 - 2, -64, 2, 1.6, '#ffffff', null); }
  line(ctx, [-3, -62, 3, -62], '#ffd890', 2);
  // soft mouth
  if (mood === 'sad' || mood === 'worried') arc(ctx, 0, -40, 6, 1.2 * Math.PI, 1.8 * Math.PI, '#ffc46a', 2.5);
  else if (mood === 'happy') arc(ctx, 0, -52, 7, 0.2 * Math.PI, 0.8 * Math.PI, '#ffc46a', 2.5);
  else line(ctx, [-5, -46, 5, -46], '#ffc46a', 2.5);
  // wooden spoon
  line(ctx, [30, 2, 40, -44], INK, 7); line(ctx, [30, 2, 40, -44], '#c98a4a', 3.5); oval(ctx, 41, -50, 6, 9, '#c98a4a', INK, 2.5);
  ctx.restore();
};
