import { eyes, line, mouth, oval, shape, shine, type SpriteDraw } from './kit';

/** Old Ladle: a tall steel ladle with a bowl for a face and a droopy moustache. */
export const ladle: SpriteDraw = (ctx, p) => {
  line(ctx, [8, -44, 16, -96], '#3b2416', 13); line(ctx, [8, -44, 16, -96], '#aeb6c6', 7);
  shape(ctx, [10, -96, 18, -104, 26, -98, 20, -90], '#aeb6c6', '#3b2416', 4);
  oval(ctx, 0, -30, 34, 30, '#c9d0de');
  oval(ctx, 0, -40, 26, 12, '#e6eaf2', null);
  shine(ctx, -18, -44, 6, 10, 0.5, 0.5);
  eyes(ctx, -2, -34, 11, 6.5, { frame: p.frame, mood: p.mood ?? 'neutral' }, [0, 0.1]);
  shape(ctx, [-2, -22, -18, -18, -24, -10, -10, -16, -2, -18, 6, -16, 20, -10, 14, -18], '#f4f6fa', '#3b2416', 3);
  mouth(ctx, -2, -11, 6, p.mood ?? 'neutral');
};
