/**
 * The Shove Pond frog: body, legs, pattern and a face. Pure canvas drawing with no game state, so the arcade home
 * hero can draw the same frogs without loading the game. Units: s is half a cell; the frog is centred on (0, 0).
 */
export const PALETTE = [
  { body: '#5fd068', dark: '#2f8a3c', belly: '#c9f5b0' },
  { body: '#ff9f43', dark: '#b8621a', belly: '#ffe0b8' },
  { body: '#a77bff', dark: '#6a43c4', belly: '#e3d4ff' },
  { body: '#ff6fa8', dark: '#c23a72', belly: '#ffd3e4' },
  { body: '#4fc3f7', dark: '#1d7fae', belly: '#d2f1ff' },
  { body: '#ffd54f', dark: '#b8901a', belly: '#fff3c4' }
];
export type Pal = (typeof PALETTE)[number];

/**
 * idle: a small smile. shock: being shoved (wide eyes, an "O"). smug: just splashed someone (heavy lids, grin).
 * brace: squeezed eyes, gritted teeth. sulk: back from the water (lids down, glare, duckweed on the head).
 * win: "^ ^" and an open smile.
 */
export type Face = 'idle' | 'shock' | 'smug' | 'brace' | 'sulk' | 'win';
export type FrogPose = {
  face: Face;
  /** Pupil offset in units of s (where the frog is looking). */
  lookX: number; lookY: number;
  /** Eyes shut for a blink (idle only). */
  blink?: boolean;
  braced?: boolean;
  pattern?: number;
  /** 0..1 phase of the sulk drip, or -1 for none. */
  drip?: number;
};

const TAU = Math.PI * 2;

/** Draws the frog at the current transform's origin (the caller translates, squashes and sets alpha). */
export function drawFrog(ctx: CanvasRenderingContext2D, s: number, pal: Pal, pose: FrogPose) {
  const braced = !!pose.braced;
  if (braced) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.72, s * 0.52, 0, 0, TAU); ctx.stroke();
  }
  // Legs (spread when braced).
  ctx.fillStyle = pal.dark;
  const spread = braced ? 1.25 : 1;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(side * s * 0.42 * spread, s * 0.2, s * 0.2, s * 0.12, side * 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(side * s * 0.34 * spread, -s * 0.18, s * 0.13, s * 0.09, -side * 0.5, 0, TAU); ctx.fill();
  }
  // Body.
  ctx.fillStyle = pal.body;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.36, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = pal.belly;
  ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.25, s * 0.18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = pal.dark;
  if (pose.pattern === 1) for (const [dx, dy] of [[-0.18, -0.05], [0.2, 0.02], [0.02, -0.2]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.06, 0, TAU); ctx.fill(); }
  else if (pose.pattern === 2) ctx.fillRect(-s * 0.05, -s * 0.34, s * 0.1, s * 0.3);
  eyes(ctx, s, pal, pose);
  // Mouths read only from about 14 px per half cell; smaller frogs keep the eyes.
  if (s >= 14) mouth(ctx, s, pal, pose.face);
  if (pose.face === 'shock') sweat(ctx, s);
  if (pose.face === 'sulk') duckweed(ctx, s, pose.drip ?? -1);
}

function eyes(ctx: CanvasRenderingContext2D, s: number, pal: Pal, pose: FrogPose) {
  const ex = s * 0.2, ey = -s * 0.28, r = s * 0.13;
  const line = Math.max(1.3, s * 0.055);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const cx = side * ex;
    if (pose.face === 'win') {
      // Happy closed eyes: ^ ^
      ctx.strokeStyle = '#132'; ctx.lineWidth = line;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.8, ey + r * 0.35); ctx.lineTo(cx, ey - r * 0.45); ctx.lineTo(cx + r * 0.8, ey + r * 0.35); ctx.stroke();
      continue;
    }
    if (pose.face === 'brace') {
      // Squeezed shut: > <
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, ey, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#132'; ctx.lineWidth = line;
      const k = -side; // left eye ">", right eye "<"
      ctx.beginPath(); ctx.moveTo(cx - k * r * 0.55, ey - r * 0.55); ctx.lineTo(cx + k * r * 0.45, ey); ctx.lineTo(cx - k * r * 0.55, ey + r * 0.55); ctx.stroke();
      continue;
    }
    if (pose.blink && pose.face === 'idle') {
      ctx.fillStyle = pal.body; ctx.beginPath(); ctx.arc(cx, ey, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#132'; ctx.lineWidth = line;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.75, ey + r * 0.1); ctx.quadraticCurveTo(cx, ey + r * 0.55, cx + r * 0.75, ey + r * 0.1); ctx.stroke();
      continue;
    }
    const wide = pose.face === 'shock' ? 1.35 : 1;
    const pr = s * 0.06 * (pose.face === 'shock' ? 0.55 : 1);
    const lx = pose.face === 'shock' ? 0 : pose.lookX * s, ly = pose.face === 'shock' ? 0 : pose.lookY * s;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, ey, r * wide, 0, TAU); ctx.fill();
    ctx.fillStyle = '#132'; ctx.beginPath(); ctx.arc(cx + lx, ey + ly, pr, 0, TAU); ctx.fill();
    // Heavy lids: smug covers the top 45%, sulk the top 30% (the lid is the body colour with a dark rim).
    const lid = pose.face === 'smug' ? 0.45 : pose.face === 'sulk' ? 0.32 : 0;
    if (lid > 0) {
      const y = ey - r + lid * 2 * r;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, ey, r + 0.5, 0, TAU); ctx.clip();
      ctx.fillStyle = pal.body; ctx.fillRect(cx - r - 1, ey - r - 1, 2 * r + 2, y - (ey - r) + 1);
      ctx.restore();
      ctx.strokeStyle = pal.dark; ctx.lineWidth = Math.max(1.2, s * 0.045);
      // Sulk lids slope down toward the nose: a glare.
      const tilt = pose.face === 'sulk' ? side * -r * 0.28 : 0;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.95, y - tilt); ctx.lineTo(cx + r * 0.95, y + tilt); ctx.stroke();
    }
  }
}

function mouth(ctx: CanvasRenderingContext2D, s: number, pal: Pal, face: Face) {
  const y = -s * 0.07, line = Math.max(1.3, s * 0.05);
  ctx.strokeStyle = pal.dark; ctx.lineWidth = line; ctx.lineCap = 'round';
  switch (face) {
    case 'idle': {
      const w = s * 0.13;
      ctx.beginPath(); ctx.moveTo(-w, y - s * 0.015); ctx.quadraticCurveTo(0, y + s * 0.07, w, y - s * 0.015); ctx.stroke();
      break;
    }
    case 'shock': {
      ctx.fillStyle = '#5a1f2a';
      ctx.beginPath(); ctx.ellipse(0, y + s * 0.03, s * 0.075, s * 0.095, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'smug': {
      // A lopsided grin: one corner up, filled.
      const w = s * 0.17;
      ctx.fillStyle = '#5a1f2a';
      ctx.beginPath(); ctx.moveTo(-w, y - s * 0.01); ctx.quadraticCurveTo(0, y + s * 0.13, w, y - s * 0.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-w, y - s * 0.01); ctx.lineTo(w, y - s * 0.05); ctx.stroke();
      break;
    }
    case 'brace': {
      const w = s * 0.12;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-w, y - s * 0.03, w * 2, s * 0.07);
      ctx.strokeRect(-w, y - s * 0.03, w * 2, s * 0.07);
      ctx.beginPath(); for (const k of [-0.33, 0, 0.33]) { ctx.moveTo(k * w * 1.5, y - s * 0.03); ctx.lineTo(k * w * 1.5, y + s * 0.04); } ctx.stroke();
      break;
    }
    case 'sulk': {
      const w = s * 0.12;
      ctx.beginPath(); ctx.moveTo(-w, y + s * 0.035); ctx.quadraticCurveTo(0, y - s * 0.03, w, y + s * 0.035); ctx.stroke();
      break;
    }
    case 'win': {
      const w = s * 0.15;
      ctx.fillStyle = '#5a1f2a';
      ctx.beginPath(); ctx.moveTo(-w, y - s * 0.02); ctx.quadraticCurveTo(0, y + s * 0.16, w, y - s * 0.02); ctx.closePath(); ctx.fill();
      break;
    }
  }
}

function sweat(ctx: CanvasRenderingContext2D, s: number) {
  ctx.strokeStyle = '#bfefff'; ctx.lineWidth = Math.max(1.3, s * 0.05); ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * s * 0.5, -s * 0.42); ctx.lineTo(side * s * 0.58, -s * 0.3);
    ctx.moveTo(side * s * 0.6, -s * 0.5); ctx.lineTo(side * s * 0.68, -s * 0.38); ctx.stroke();
  }
}

/** A duckweed leaf stuck on the head, and a drip running off it. */
function duckweed(ctx: CanvasRenderingContext2D, s: number, drip: number) {
  ctx.save();
  ctx.translate(s * 0.06, -s * 0.36);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#5ccc72'; ctx.strokeStyle = '#2f7a3f'; ctx.lineWidth = Math.max(1, s * 0.03);
  const r = s * 0.17;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.ellipse(0, 0, r, r * 0.62, 0, 0.35, TAU - 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (drip >= 0) {
    const y = -s * 0.3 + drip * s * 0.5;
    ctx.globalAlpha *= 1 - drip * 0.8;
    ctx.fillStyle = '#9fe3ff';
    ctx.beginPath(); ctx.ellipse(s * 0.24, y, s * 0.04, s * 0.06, 0, 0, TAU); ctx.fill();
  }
}

/** Two crossed red strokes over the head: the frog has a grudge. */
export function drawGrudge(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const r = s * 0.14;
  ctx.save();
  ctx.strokeStyle = '#ff5a5f'; ctx.lineWidth = Math.max(2, s * 0.07); ctx.lineCap = 'round';
  // The anime "vein pop" (💢): four brackets bowed toward the centre.
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r * 0.25, y + sy * r);
    ctx.quadraticCurveTo(x + sx * r * 0.3, y + sy * r * 0.3, x + sx * r, y + sy * r * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}
