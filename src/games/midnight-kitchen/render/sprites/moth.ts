import { feelers } from './ant';
import { blush, eyes, mouth, moodOf, oval, pestLook, shape, type SpriteDraw } from './kit';

/** Moth: a dusty, fluffy night moth with eye-spot wings and feathery antennae, hypnotised by every Burner. */
export const moth: SpriteDraw = (ctx, p) => {
  const flap = [0, 0.35, 0.6, 0.35, 0, -0.25, -0.4, -0.25][p.frame % 8], mood = moodOf(p, p.state === 'bite' ? 'happy' : 'neutral');
  const front = p.dir === 1, cx = front ? 0 : -4;
  ctx.save(); ctx.translate(0, -48);
  // wings
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1); ctx.rotate(-flap * 0.6);
    shape(ctx, [4, -4, 20, -34, 44, -36, 50, -14, 34, 0], '#b8a3c8');
    shape(ctx, [4, 2, 30, 4, 40, 20, 22, 30, 8, 16], '#9a86ae');
    oval(ctx, 32, -18, 7, 6, '#f3d58a', undefined, 2.5); oval(ctx, 32, -18, 3, 3, '#4a3a5a', null);
    ctx.restore();
  }
  // fluffy body
  oval(ctx, cx, 10, 10, 18, '#8a7896');
  for (const y of [4, 12, 20]) oval(ctx, cx, y, 9, 2, '#6f5e7c', null);
  oval(ctx, cx, -10, 16, 14, '#e8dcc8');
  feelers(ctx, cx - 5, -20, cx - 20, -40, p.frame, '#5a4a66', 3); feelers(ctx, cx + 5, -20, cx + 20, -40, (p.frame + 4) % 8, '#5a4a66', 3);
  shape(ctx, [cx - 20, -42, cx - 26, -38, cx - 18, -34], '#e8dcc8', null); shape(ctx, [cx + 20, -42, cx + 26, -38, cx + 18, -34], '#e8dcc8', null);
  eyes(ctx, cx, -12, 7, 5.5, { frame: p.frame, mood, state: p.state }, front ? pestLook(p) : [-0.25, 0.1]);
  mouth(ctx, cx, -3, 5, mood, p.state === 'bite' && p.frame % 2 === 0);
  blush(ctx, cx, -5, 11, 3, '#ff9aa8', 0.5);
  ctx.restore();
};
