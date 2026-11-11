import { blush, eyes, feet, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/** Mouse: a slate-grey sneak with big pink ears and a swag sack that bulges once it has grabbed something. */
export const mouse: SpriteDraw = (ctx, p) => {
  const loaded = p.state === 'flee', mood = moodOf(p, loaded ? 'happy' : 'smug'), fur = '#7c7f92', belly = '#c9cbd6';
  if (p.dir === 1) {
    shape(ctx, [22, -30, 26, -62, 46, -62 - (loaded ? 10 : 0), 48, -32, 34, -22], '#b98a4e'); line(ctx, [28, -56, 42, -52], INK, 3);
    line(ctx, [-20, -10, -40, -4, -44, -18], '#e8a0a8', 5);
    feet(ctx, 0, 13, 9, '#5f6274', p.frame, p.state !== 'grab');
    shape(ctx, [-26, -6, -32, -36, -16, -60, 16, -60, 32, -36, 26, -6], fur);
    for (const s of [-1, 1]) { oval(ctx, s * 22, -64, 14, 14, fur); oval(ctx, s * 22, -64, 8, 8, '#f0b4bb', null); }
    oval(ctx, 0, -20, 14, 10, belly, null);
    eyes(ctx, 0, -42, 10, 6.2, { frame: p.frame, mood, state: p.state }, pestLook(p));
    oval(ctx, 0, -31, 4.5, 3.5, '#f08a9a'); mouth(ctx, 0, -23, 6, mood);
    for (const s of [-1, 1]) { line(ctx, [s * 6, -31, s * 24, -35], INK, 2); line(ctx, [s * 6, -29, s * 24, -26], INK, 2); }
    blush(ctx, 0, -32, 16, 4, '#ff9aa8', 0.5);
    return;
  }
  line(ctx, [26, -14, 44, -6, 50, -20, 40, -30], '#e8a0a8', 5);
  shape(ctx, [14, -34, 22, -62, 44, -60 - (loaded ? 10 : 0), 46, -34, 30, -22], '#b98a4e'); line(ctx, [20, -56, 34, -52], INK, 3);
  feet(ctx, 0, 13, 9, '#5f6274', p.frame, p.state !== 'grab');
  shape(ctx, [-26, -6, -32, -36, -16, -60, 16, -60, 30, -36, 26, -6], fur);
  oval(ctx, -24, -62, 13, 13, fur); oval(ctx, -24, -62, 7, 7, '#f0b4bb', null);
  oval(ctx, 12, -66, 13, 13, fur); oval(ctx, 12, -66, 7, 7, '#f0b4bb', null);
  oval(ctx, -2, -22, 14, 10, belly, null);
  shine(ctx, 14, -44, 5, 8, 0.3, 0.3);
  eyes(ctx, -6, -42, 9, 6, { frame: p.frame, mood, state: p.state }, pestLook(p));
  oval(ctx, -14, -30, 4, 3.2, '#f08a9a'); mouth(ctx, -12, -22, 6, mood);
  line(ctx, [-18, -30, -34, -34], INK, 2); line(ctx, [-18, -28, -34, -26], INK, 2);
};
