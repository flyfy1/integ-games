import { eyes, flame, INK, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/**
 * The Grease Golem: a wobbling heap of old fryer grease with bits of forgotten dinner stuck in it (a noodle, peas,
 * a bottle cap). Glossy amber; later phases glow hotter with flame eyes. `act` 1 rears back, cheeks full, to
 * telegraph a splatter or breath.
 */
export const greasegolem: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, p.tier >= 1 ? 'angry' : 'smug'), front = p.dir === 1, windup = p.act === 1;
  const body = ['#b88a2e', '#c4782a', '#d0602a'][Math.min(2, p.tier)], dark = ['#8a6420', '#94561c', '#9a3e1a'][Math.min(2, p.tier)];
  const wob = [0, 2, 3, 2, 0, -2, -3, -2][p.frame % 8];
  ctx.save(); ctx.scale(0.62, 0.62); ctx.translate(0, windup ? 4 : 0);
  // puddle
  ctx.save(); ctx.globalAlpha *= 0.8; oval(ctx, 0, -4, 70, 12, dark, null); ctx.restore();
  // arms
  for (const s of [-1, 1]) {
    const up = windup ? -30 : 0;
    shape(ctx, [s * 40, -60, s * 66, -50 + up, s * 74, -24 + up, s * 60, -14 + up, s * 44, -30], body);
    oval(ctx, s * 66, -22 + up, 12, 10, body);
  }
  // body: drippy mound
  shape(ctx, [-56, -6, -62, -46, -46, -92 + wob, -16, -112 - wob, 18, -110 + wob, 48, -90, 62, -50, 58, -6, 30, 2, 22, -6, 0, 2, -24, -6, -40, 2], body);
  shine(ctx, -26, -88, 16, 9, 0.5, -0.4); shine(ctx, 26, -94, 6, 4, 0.55, 0); shine(ctx, 40, -50, 4, 10, 0.35, 0.2);
  // things stuck in it
  ctx.save(); ctx.globalAlpha *= 0.85;
  oval(ctx, 34, -30, 6, 6, '#7cc46a', INK, 2.5); oval(ctx, 42, -40, 5, 5, '#7cc46a', INK, 2.5);
  shape(ctx, [-44, -60, -30, -70, -20, -56, -8, -66], null, '#f3dca0', 4);
  oval(ctx, 22, -70, 8, 8, '#c9ccd6', INK, 2.5); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; oval(ctx, 22 + Math.cos(a) * 8, -70 + Math.sin(a) * 8, 1.6, 1.6, '#8a92a4', null); }
  ctx.restore();
  // face
  const fx = front ? 0 : -14;
  if (p.tier >= 2 && mood !== 'dead') { flame(ctx, fx - 15, -52, 12, p.frame, '#ff6a1f', '#ffe27a'); flame(ctx, fx + 15, -52, 12, (p.frame + 3) % 8, '#ff6a1f', '#ffe27a'); }
  eyes(ctx, fx, -58, 15, 9.5, { frame: p.frame, mood, state: p.state }, front ? pestLook(p) : [-0.3, 0.1], p.tier >= 1 ? '#fff0c8' : '#ffffff');
  if (windup) oval(ctx, fx, -30, 14, 10, '#5a2010', INK, 4);
  else mouth(ctx, fx, -32, 16, mood, p.state === 'bite' && p.frame % 2 === 0);
  if (windup) { oval(ctx, fx - 28, -36, 9, 7, '#ff8a6a', null); oval(ctx, fx + 28, -36, 9, 7, '#ff8a6a', null); }
  ctx.restore();
};
