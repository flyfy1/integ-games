import { legs, legsFront } from './ant';
import { eyes, INK, line, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/** Weevil: a rounded slate-brown beetle with a long curved snout for tunnelling. */
export const weevil: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'smug'), shell = '#7a6c8c', head = '#9a8ca8';
  if (p.dir === 1) {
    shape(ctx, [-26, -16, -30, -40, -16, -58, 16, -58, 30, -40, 26, -16], shell); line(ctx, [0, -58, 0, -18], INK, 3);
    for (const [x, y] of [[-12, -42], [12, -44], [-14, -26], [14, -26]]) oval(ctx, x, y, 3, 3, '#574a68', null);
    shine(ctx, -10, -50, 7, 3, 0.4, -0.2);
    legsFront(ctx, -8, 30, p.frame);
    oval(ctx, 0, -26, 14, 13, head);
    line(ctx, [0, -20, 0, -4, -4, 4], INK, 10); line(ctx, [0, -20, 0, -4, -4, 4], head, 5);
    eyes(ctx, 0, -32, 7.5, 5, { frame: p.frame, mood, state: p.state }, pestLook(p));
    return;
  }
  legs(ctx, -12, 30, p.frame);
  shape(ctx, [-10, -6, -20, -30, -6, -56, 26, -56, 38, -30, 30, -8], shell);
  line(ctx, [10, -56, 12, -8], INK, 3);
  for (const [x, y] of [[0, -40], [22, -42], [-2, -22], [24, -22]]) oval(ctx, x, y, 3, 3, '#574a68', null);
  shine(ctx, 20, -48, 9, 3, 0.4);
  oval(ctx, -16, -30, 14, 13, head);
  line(ctx, [-26, -28, -44, -22, -48, -8], INK, 10); line(ctx, [-26, -28, -44, -22, -48, -8], head, 5);
  eyes(ctx, -16, -34, 6.5, 5, { frame: p.frame, mood, state: p.state }, pestLook(p));
};
