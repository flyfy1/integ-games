import { eyes, feet, mouth, moodOf, oval, pestLook, type SpriteDraw } from './kit';

/** Mold Spore: a fuzzy teal puffball on stubby feet, shedding glowing motes. Sad rather than wicked. */
export const spore: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'sad'), front = p.dir === 1;
  feet(ctx, 0, 12, 8, '#2f5f52', p.frame, p.state !== 'bite');
  const puff = p.frame % 8 < 4 ? 0 : 1.5;
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3; oval(ctx, Math.cos(a) * 24, -38 + Math.sin(a) * 22, 13 + puff, 13 + puff, '#3f9a80'); }
  oval(ctx, 0, -38, 27, 25, '#55b394', null);
  for (const [x, y] of [[-14, -54], [12, -56], [20, -34], [-20, -30]]) oval(ctx, x, y, 3.5, 3.5, '#2c7a63', null);
  const ex = front ? 0 : -3;
  eyes(ctx, ex, -40, 9.5, 6.5, { frame: p.frame, mood, state: p.state }, pestLook(p), '#effff8');
  mouth(ctx, ex, -26, 7, mood, p.state === 'bite' && p.frame % 2 === 0);
  ctx.save(); ctx.globalAlpha *= 0.85;
  for (let i = 0; i < 3; i++) { const f = (p.frame + i * 3) % 8; oval(ctx, -30 + i * 30, -70 - f * 3, 3, 3, '#c8ffe8', null); }
  ctx.restore();
};
