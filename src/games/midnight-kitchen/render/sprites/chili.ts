import { blush, eyes, flame, mouth, moodOf, shape, shine, type SpriteDraw } from './kit';

/** Chili: asleep until placed, then furious. `act` > 0 while the fuse burns: it glows, shakes and spits flames. */
export const chili: SpriteDraw = (ctx, p) => {
  const hot = p.act > 0, body = hot ? '#ff4d24' : '#e23b2e', shake = hot ? [0, 2, -2, 1, -1, 2, -2, 0][p.frame % 8] : 0;
  ctx.save(); ctx.translate(shake, 0);
  if (hot) { flame(ctx, -28, -16, 16, p.frame); flame(ctx, 28, -22, 18, (p.frame + 4) % 8); }
  shape(ctx, [-6, -2, -24, -18, -28, -50, -14, -76, 8, -80, 24, -64, 26, -36, 14, -12], body);
  shine(ctx, -14, -52, 5, 15, 0.45, 0.2);
  shape(ctx, [-12, -76, -6, -90, 6, -100, 14, -94, 8, -80], '#4f9a40');
  shape(ctx, [-18, -72, 0, -84, 18, -72, 6, -68, -6, -68], '#6fbb5c', undefined, 4);
  if (hot) { eyes(ctx, 0, -46, 10, 7, { frame: 0, mood: 'angry', state: p.state }); mouth(ctx, 0, -28, 10, 'angry', true); flame(ctx, 0, -98, 14, (p.frame + 2) % 8); }
  else { const mood = moodOf(p, 'smug'); eyes(ctx, 0, -46, 10, 6.5, { frame: p.frame % 2 ? 6 : p.frame, mood, state: p.state }); mouth(ctx, 0, -30, 8, mood); blush(ctx, 0, -36, 16, 4, '#ffb0a0', 0.5); }
  ctx.restore();
};
