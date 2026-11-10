/**
 * The Fruit Orbit cast: eleven hand-drawn tiers, from a blueberry up to a sun melon. Every fruit is painted in a unit
 * circle (radius 1 = its collision radius) so one painter serves the jar, the preview and the evolution strip. Tiers
 * differ by silhouette details and pattern, not only by colour. Bodies are cached as sprites; faces are drawn live so
 * they can blink, cheer and worry.
 */
type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export type Mood = 'calm' | 'happy' | 'worry' | 'blink' | 'dizzy';
export const FRUITS: ReadonlyArray<{ en: string; zh: string; color: string; light: string }> = [
  { en: 'Blueberry', zh: '蓝莓', color: '#6272ea', light: '#aab6ff' },
  { en: 'Cherry', zh: '樱桃', color: '#ef3b5d', light: '#ff9aa8' },
  { en: 'Lime', zh: '青柠', color: '#58c24f', light: '#c9f58f' },
  { en: 'Peach', zh: '蜜桃', color: '#ffab85', light: '#ffe0c2' },
  { en: 'Lemon', zh: '柠檬', color: '#ffdf3d', light: '#fff7b0' },
  { en: 'Apple', zh: '苹果', color: '#e8323f', light: '#ff9d94' },
  { en: 'Orange', zh: '香橙', color: '#ff9a26', light: '#ffd08a' },
  { en: 'Kiwi', zh: '奇异果', color: '#86cc3f', light: '#c9f07a' },
  { en: 'Moon Melon', zh: '月亮蜜瓜', color: '#e8d59a', light: '#fbf3cf' },
  { en: 'Ring Pumpkin', zh: '星环南瓜', color: '#ff8a2e', light: '#ffc58a' },
  { en: 'Sun Melon', zh: '太阳西瓜', color: '#37b85a', light: '#ffe27a' }
];

/** Sprites reach a little past the collision circle for stems, rings and rays. */
export const SPRITE_REACH = 1.3;

function ball(c: C, light: string, base: string, dark: string, radius = 1) {
  const g = c.createRadialGradient(-0.35 * radius, -0.42 * radius, 0.08 * radius, 0, 0, 1.05 * radius);
  g.addColorStop(0, light); g.addColorStop(0.55, base); g.addColorStop(1, dark);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill();
}
function disc(c: C, x: number, y: number, r: number, fill: string) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function outline(c: C, radius = 1) { c.strokeStyle = 'rgba(40,12,54,.38)'; c.lineWidth = 0.055; c.beginPath(); c.arc(0, 0, radius - 0.027, 0, TAU); c.stroke(); }
function shine(c: C, radius = 1) {
  c.fillStyle = 'rgba(255,255,255,.5)';
  c.beginPath(); c.ellipse(-0.42 * radius, -0.52 * radius, 0.2 * radius, 0.11 * radius, -0.65, 0, TAU); c.fill();
  disc(c, -0.66 * radius, -0.24 * radius, 0.05 * radius, 'rgba(255,255,255,.5)');
}
function leaf(c: C, x: number, y: number, length: number, turn: number, color: string) {
  c.save(); c.translate(x, y); c.rotate(turn);
  c.fillStyle = color; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(length * 0.5, -length * 0.5, length, 0); c.quadraticCurveTo(length * 0.5, length * 0.5, 0, 0); c.fill();
  c.strokeStyle = 'rgba(20,60,20,.45)'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(length * 0.08, 0); c.lineTo(length * 0.88, 0); c.stroke();
  c.restore();
}
function stem(c: C, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, color: string, width = 0.1) {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke();
}
function star(c: C, x: number, y: number, outer: number, inner: number, points: number, color: string, turn = -Math.PI / 2) {
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < points * 2; i++) { const r = i % 2 ? inner : outer, a = turn + i * Math.PI / points; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill();
}
function dimple(c: C, y = -0.8) { c.fillStyle = 'rgba(60,10,20,.4)'; c.beginPath(); c.ellipse(0, y, 0.2, 0.07, 0, 0, TAU); c.fill(); }
/** Evenly scattered skin pores (golden-angle spiral), kept away from the rim. */
function pores(c: C, count: number, color: string, size = 0.03) {
  for (let i = 0; i < count; i++) { const r = Math.sqrt((i + 0.6) / count) * 0.82, a = i * 2.39996; disc(c, Math.cos(a) * r, Math.sin(a) * r, size, color); }
}
function clipBall(c: C, radius = 1) { c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.clip(); }

const PAINTERS: ReadonlyArray<(c: C) => void> = [
  // 0 Blueberry: small, with a star-shaped crown.
  (c) => { ball(c, '#aab6ff', '#6272ea', '#3a3fa8'); outline(c); star(c, 0, -0.66, 0.3, 0.14, 5, '#2c2f85'); disc(c, 0, -0.66, 0.07, '#1d1f63'); shine(c); },
  // 1 Cherry: glossy with a long curved stem and one leaf.
  (c) => { ball(c, '#ff9aa8', '#ef3b5d', '#a8123a'); outline(c); dimple(c, -0.82); stem(c, 0, -0.82, 0.05, -1.15, 0.38, -1.22, '#7a9a3a', 0.11); leaf(c, 0.2, -1.12, 0.42, 0.5, '#5fc04a'); shine(c); },
  // 2 Lime: a sliced wheel with rind, pith and eight segments.
  (c) => {
    ball(c, '#c9f58f', '#58c24f', '#2f8f3a'); outline(c); disc(c, 0, 0, 0.84, '#f1fbcf');
    const g = c.createRadialGradient(0, 0, 0.1, 0, 0, 0.76); g.addColorStop(0, '#d5f59a'); g.addColorStop(1, '#a4de57');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.76, 0, TAU); c.fill();
    c.strokeStyle = '#f1fbcf'; c.lineWidth = 0.055; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 0.76, Math.sin(a) * 0.76); c.stroke(); }
    disc(c, 0, 0, 0.09, '#f1fbcf');
  },
  // 3 Peach: soft blush, a side crease and a leaf.
  (c) => {
    ball(c, '#ffe6cc', '#ffab85', '#ee6a6c'); outline(c);
    const g = c.createRadialGradient(0.4, 0.35, 0.05, 0.4, 0.35, 0.8); g.addColorStop(0, 'rgba(255,90,110,.55)'); g.addColorStop(1, 'rgba(255,90,110,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.97, 0, TAU); c.fill();
    stem(c, 0.02, -0.97, -0.42, -0.5, -0.5, 0.25, 'rgba(190,70,80,.5)', 0.05);
    stem(c, 0, -0.9, 0, -1.05, 0.06, -1.12, '#7a5a35', 0.09); leaf(c, 0.06, -0.98, 0.5, -0.35, '#62c450'); shine(c);
  },
  // 4 Lemon: pointed nubs on both ends and a pitted skin.
  (c) => {
    c.fillStyle = '#e9b800'; c.beginPath(); c.ellipse(-1.0, 0, 0.17, 0.22, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(1.0, 0, 0.17, 0.22, 0, 0, TAU); c.fill();
    ball(c, '#fff9bd', '#ffdf3d', '#dfa300'); outline(c); pores(c, 16, 'rgba(190,140,0,.38)'); shine(c);
  },
  // 5 Apple: two-tone skin, a woody stem and a leaf.
  (c) => {
    ball(c, '#ff9d94', '#e8323f', '#9c1028'); outline(c);
    const g = c.createRadialGradient(-0.45, 0.5, 0.05, -0.45, 0.5, 0.75); g.addColorStop(0, 'rgba(255,225,95,.6)'); g.addColorStop(1, 'rgba(255,225,95,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.97, 0, TAU); c.fill();
    dimple(c); stem(c, 0, -0.8, -0.02, -1.0, 0.1, -1.2, '#6b4226', 0.09); leaf(c, 0.06, -1.02, 0.5, -0.3, '#5fc04a'); shine(c);
  },
  // 6 Orange: pitted peel with a green star calyx.
  (c) => { ball(c, '#ffd590', '#ff9a26', '#d96800'); outline(c); pores(c, 26, 'rgba(180,80,0,.32)', 0.028); star(c, 0, -0.74, 0.2, 0.09, 5, '#3f9b3a'); disc(c, 0, -0.74, 0.05, '#2b6f2a'); shine(c); },
  // 7 Kiwi: fuzzy brown rim, green flesh and a ring of seeds.
  (c) => {
    c.strokeStyle = '#5c3f1f'; c.lineWidth = 0.04; c.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const a = i * TAU / 40; c.beginPath(); c.moveTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95); c.lineTo(Math.cos(a + 0.06) * 1.05, Math.sin(a + 0.06) * 1.05); c.stroke(); }
    ball(c, '#b89262', '#8a6336', '#5c3f1f'); outline(c);
    const g = c.createRadialGradient(0, 0, 0.2, 0, 0, 0.85); g.addColorStop(0, '#d2f28a'); g.addColorStop(1, '#7cc437');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.85, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(240,250,200,.4)'; c.lineWidth = 0.03;
    for (let i = 0; i < 18; i++) { const a = i * TAU / 18; c.beginPath(); c.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); c.lineTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78); c.stroke(); }
    c.fillStyle = '#f6f9d4'; c.beginPath(); c.ellipse(0, 0, 0.3, 0.25, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1c10';
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16 + 0.1; c.beginPath(); c.ellipse(Math.cos(a) * 0.47, Math.sin(a) * 0.43, 0.055, 0.03, a, 0, TAU); c.fill(); }
  },
  // 8 Moon Melon: pale netted rind with craters.
  (c) => {
    ball(c, '#fdf6d6', '#e8d59a', '#b39a57'); outline(c);
    c.save(); clipBall(c, 0.95); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 0.035;
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(i * 0.32 - 0.25, -1); c.quadraticCurveTo(i * 0.32 + 0.3, 0, i * 0.32 - 0.25, 1); c.stroke();
      c.beginPath(); c.moveTo(-1, i * 0.32 + 0.22); c.quadraticCurveTo(0, i * 0.32 - 0.26, 1, i * 0.32 + 0.22); c.stroke();
    }
    c.restore();
    for (const [x, y, r] of [[0.5, -0.45, 0.17], [-0.56, 0.42, 0.13], [0.36, 0.6, 0.1], [-0.5, -0.5, 0.08]]) {
      disc(c, x, y, r, 'rgba(150,125,60,.35)'); c.strokeStyle = 'rgba(120,98,40,.5)'; c.lineWidth = 0.03; c.beginPath(); c.arc(x, y, r, 0.4, 3.4); c.stroke();
    }
    c.fillStyle = '#8a9a4a'; c.beginPath(); c.ellipse(0, -0.95, 0.12, 0.09, 0, 0, TAU); c.fill(); shine(c);
  },
  // 9 Ring Pumpkin: ribbed, with a planetary ring worn like a hoop.
  (c) => {
    const ring = (from: number, to: number, color: string, width: number) => { c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); c.ellipse(0, 0.36, 1.2, 0.27, -0.2, from, to); c.stroke(); };
    ring(Math.PI, TAU, '#9d86e0', 0.1);
    ball(c, '#ffcf9a', '#ff8a2e', '#c4500d', 0.95); outline(c, 0.95);
    c.strokeStyle = 'rgba(150,60,0,.34)'; c.lineWidth = 0.04;
    for (const rx of [0.28, 0.62]) { c.beginPath(); c.ellipse(0, 0, rx, 0.93, 0, 0, TAU); c.stroke(); }
    c.fillStyle = '#5f7a2a'; c.beginPath(); c.moveTo(-0.1, -0.9); c.lineTo(-0.06, -1.12); c.lineTo(0.12, -1.1); c.lineTo(0.1, -0.9); c.closePath(); c.fill();
    shine(c, 0.95);
    ring(0, Math.PI, 'rgba(60,20,90,.35)', 0.16); ring(0, Math.PI, '#d9ccff', 0.1); ring(0.2, Math.PI - 0.2, '#f4efff', 0.03);
  },
  // 10 Sun Melon: striped melon wearing a corona of rays.
  (c) => {
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16, w = 0.13, tip = i % 2 ? 1.17 : 1.26;
      c.fillStyle = i % 2 ? '#ffb020' : '#ffd84a'; c.beginPath();
      c.moveTo(Math.cos(a - w) * 0.95, Math.sin(a - w) * 0.95); c.lineTo(Math.cos(a) * tip, Math.sin(a) * tip); c.lineTo(Math.cos(a + w) * 0.95, Math.sin(a + w) * 0.95); c.closePath(); c.fill();
    }
    ball(c, '#a8f5ac', '#37b85a', '#167236', 0.97);
    c.save(); clipBall(c, 0.97); c.strokeStyle = 'rgba(14,92,44,.75)'; c.lineWidth = 0.1;
    for (const rx of [0.22, 0.55, 0.86]) { c.beginPath(); c.ellipse(0, 0, rx, 1.02, 0, 0, TAU); c.stroke(); }
    c.strokeStyle = 'rgba(14,92,44,.75)'; c.beginPath(); c.moveTo(0, -1); c.lineTo(0, 1); c.stroke();
    c.restore();
    c.strokeStyle = '#ffe27a'; c.lineWidth = 0.06; c.beginPath(); c.arc(0, 0, 0.955, 0, TAU); c.stroke();
    shine(c, 0.95);
  }
];

/** Paints the body of `tier` in unit space, centred on the origin. */
export function paintFruitBody(c: C, tier: number) { c.save(); PAINTERS[tier](c); c.restore(); }

const INK = '#2b1830';
/** Small fruit get proportionally bigger features so their faces still read at phone size. */
const faceScale = (tier: number) => 1.12 - tier * 0.047;

/** Paints the face of `tier` in unit space. */
export function paintFace(c: C, tier: number, mood: Mood) {
  const k = faceScale(tier), ex = 0.33 * k, ey = 0.02, er = 0.105 * k, my = ey + 0.3 * k;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  disc(c, -ex - 0.2 * k, ey + 0.2 * k, 0.1 * k, 'rgba(255,105,140,.42)'); disc(c, ex + 0.2 * k, ey + 0.2 * k, 0.1 * k, 'rgba(255,105,140,.42)');
  c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 0.055 * k;
  for (const side of [-1, 1]) {
    const x = side * ex;
    if (mood === 'happy') { c.beginPath(); c.arc(x, ey + er * 0.5, er, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
    else if (mood === 'blink') { c.beginPath(); c.moveTo(x - er, ey); c.lineTo(x + er, ey); c.stroke(); }
    else if (mood === 'dizzy') { c.beginPath(); c.moveTo(x - er, ey - er); c.lineTo(x + er, ey + er); c.moveTo(x + er, ey - er); c.lineTo(x - er, ey + er); c.stroke(); }
    else if (mood === 'worry') {
      disc(c, x, ey, er * 1.25, '#ffffff'); c.strokeStyle = INK; c.beginPath(); c.arc(x, ey, er * 1.25, 0, TAU); c.stroke();
      disc(c, x, ey - er * 0.35, er * 0.5, INK);
      c.beginPath(); c.moveTo(x - side * er * 1.5, ey - er * 2.3); c.lineTo(x + side * er * 0.9, ey - er * 1.75); c.stroke();
    } else {
      c.fillStyle = INK; c.beginPath(); c.ellipse(x, ey, er * 0.85, er * 1.1, 0, 0, TAU); c.fill();
      disc(c, x - er * 0.25, ey - er * 0.4, er * 0.36, '#ffffff');
    }
  }
  c.strokeStyle = INK; c.fillStyle = INK;
  if (mood === 'happy') {
    c.fillStyle = '#7a1f3d'; c.beginPath(); c.arc(0, my - 0.06 * k, 0.17 * k, 0, Math.PI); c.closePath(); c.fill();
    c.fillStyle = '#ff8fa3'; c.beginPath(); c.arc(0, my + 0.07 * k, 0.08 * k, Math.PI, TAU); c.fill();
  } else if (mood === 'worry') { c.beginPath(); c.ellipse(0, my + 0.02 * k, 0.07 * k, 0.09 * k, 0, 0, TAU); c.fill(); }
  else if (mood === 'dizzy') { c.beginPath(); c.moveTo(-0.14 * k, my + 0.03 * k); c.quadraticCurveTo(-0.07 * k, my - 0.05 * k, 0, my + 0.03 * k); c.quadraticCurveTo(0.07 * k, my + 0.11 * k, 0.14 * k, my + 0.03 * k); c.stroke(); }
  else { c.beginPath(); c.arc(0, my - 0.1 * k, 0.15 * k, Math.PI * 0.18, Math.PI * 0.82); c.stroke(); }
  c.restore();
}

const sprites = new Map<string, HTMLCanvasElement>();
/** A cached body sprite for `tier`, `radius` canvas units big at `pixelScale` device pixels per unit. */
function sprite(tier: number, radius: number, pixelScale: number): HTMLCanvasElement {
  const key = `${tier}:${radius}:${pixelScale}`;
  let canvas = sprites.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    const size = Math.max(2, Math.ceil(radius * SPRITE_REACH * 2 * pixelScale));
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d')!;
    c.translate(size / 2, size / 2); c.scale(radius * pixelScale, radius * pixelScale);
    paintFruitBody(c, tier);
    sprites.set(key, canvas);
  }
  return canvas;
}

/**
 * Draws a whole fruit. `nativeRadius` picks the cached sprite (the tier's real radius in the jar, or the icon size);
 * `radius` is the size to draw at, so a growing or popping fruit reuses the same sprite.
 */
export function drawFruit(c: C, tier: number, x: number, y: number, radius: number, angle: number, mood: Mood | null, pixelScale: number, nativeRadius = radius) {
  const reach = radius * SPRITE_REACH;
  c.save(); c.translate(x, y); if (angle) c.rotate(angle);
  c.drawImage(sprite(tier, nativeRadius, pixelScale), -reach, -reach, reach * 2, reach * 2);
  if (mood) { c.scale(radius, radius); paintFace(c, tier, mood); }
  c.restore();
}
