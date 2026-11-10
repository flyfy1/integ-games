/**
 * Pocket Survivor drawing. Reads the simulation state and never changes it. Cosmetic effects (particles, damage
 * numbers, banners) live here and use their own tiny generator, so gameplay randomness stays untouched.
 */
import { MAX_LEVEL, PASSIVE_CARDS, PASSIVE_IDS, WEAPON_CARDS, WEAPON_IDS, BLADES, type EnemyKind } from './data';
import { BOSS_TIME, PLAYER_R, pickupRadius, type Card, type Enemy, type SimEvent, type State } from './sim';

export type View = { w: number; h: number; scale: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Ui = {
  best: number; newBest: boolean; selected: number; locked: boolean; touch: boolean; paused: boolean; clock: number;
  stick: { x: number; y: number; dx: number; dy: number } | null; hint: string; burstLabel: string; retryLabel: string;
};

const ACCENT = '#70f0c2', INK = '#f7f9ff', MUTED = '#a8b1c5', DANGER = '#ff6b7a', GOLD = '#ffd166', PANEL = '#111a2c';
const ENEMY_COLOR: Record<EnemyKind, string> = { grub: '#ff6b7a', skitter: '#ffa45c', brute: '#a78bfa', spitter: '#c3e88d', charger: '#ff5fa2', warden: '#e5484d' };
export const ENEMY_NAME: Record<string, string> = { grub: 'a Grub', skitter: 'a Skitter swarm', brute: 'a Brute', spitter: 'a Spitter', charger: 'a Charger', warden: 'the Warden' };
const font = (size: number, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const TAU = Math.PI * 2;

/** Side inset that keeps HUD text clear of the shell's round corner buttons on touch layouts. */
const inset = (ui: Ui) => (ui.touch ? 62 : 14);
export function xpBarRect(view: View, ui: Ui): Rect { const x = inset(ui) + 46; return { x, y: 42, w: view.w - inset(ui) - x, h: 10 }; }
/** The burst meter doubles as a tap target, so touch layouts without the Attack button can still fire it. */
export function burstRect(view: View, ui: Ui): Rect { const w = ui.touch ? 204 : 190, h = ui.touch ? 34 : 26; return { x: (view.w - w) / 2, y: view.h - h - 10, w, h }; }
/** Level-up cards: a stacked list on narrow stages, three columns on wide ones. Shared by drawing and hit-testing. */
export function cardRects(view: View, count: number): Rect[] {
  const { w, h } = view, gap = 10;
  if (w < 620) {
    const cw = Math.min(w - 24, 440), ch = Math.max(64, Math.min(98, (h - 96 - gap * (count - 1)) / count)), total = count * ch + (count - 1) * gap, top = Math.max(60, (h - total) / 2 + 22);
    return Array.from({ length: count }, (_, index) => ({ x: (w - cw) / 2, y: top + index * (ch + gap), w: cw, h: ch }));
  }
  const cw = Math.min(250, (w - 48 - gap * 2) / 3), ch = Math.min(220, h - 140), total = count * cw + (count - 1) * gap;
  return Array.from({ length: count }, (_, index) => ({ x: (w - total) / 2 + index * (cw + gap), y: (h - ch) / 2 + 20, w: cw, h: ch }));
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + radius, y); c.lineTo(x + w - radius, y); c.arcTo(x + w, y, x + w, y + radius, radius); c.lineTo(x + w, y + h - radius); c.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  c.lineTo(x + radius, y + h); c.arcTo(x, y + h, x, y + h - radius, radius); c.lineTo(x, y + radius); c.arcTo(x, y, x + radius, y, radius); c.closePath();
}
function label(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'left', weight = 700) {
  c.font = font(size, weight); c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y);
}
function outlined(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
  c.font = font(size, 800); c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = Math.max(3, size / 5); c.strokeStyle = '#060a12e6'; c.strokeText(value, x, y); c.fillStyle = color; c.fillText(value, x, y);
}
function wrap(c: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of value.split(' ')) { const next = line ? `${line} ${word}` : word; if (line && c.measureText(next).width > width) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}
function polygon(c: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rotation: number) {
  c.beginPath(); for (let index = 0; index < sides; index++) { const angle = rotation + index / sides * TAU; if (index) c.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); else c.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); } c.closePath();
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.4); c.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); c.closePath();
}

/** Small vector glyphs for weapons, passives and bonus cards. */
export function drawIcon(c: CanvasRenderingContext2D, key: string, x: number, y: number, s: number, color: string) {
  c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1.6, s * 0.16); c.lineCap = 'round'; c.lineJoin = 'round';
  const line = (points: number[]) => { c.beginPath(); for (let index = 0; index < points.length; index += 2) { if (index) c.lineTo(points[index] * s, points[index + 1] * s); else c.moveTo(points[index] * s, points[index + 1] * s); } };
  switch (key) {
    case 'bolt': line([0.25, -1, -0.5, 0.1, 0.05, 0.1, -0.25, 1, 0.55, -0.2, 0, -0.2]); c.closePath(); c.fill(); break;
    case 'blades': c.beginPath(); c.arc(0, 0, s * 0.85, -0.4, Math.PI * 0.9); c.arc(s * 0.3, -s * 0.25, s * 0.55, Math.PI * 0.75, -0.2, true); c.closePath(); c.fill(); break;
    case 'pulse': c.beginPath(); c.arc(0, 0, s * 0.9, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.45, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.12, 0, TAU); c.fill(); break;
    case 'lance': line([-0.9, 0.9, 0.5, -0.5]); c.stroke(); line([0.95, -0.95, 0.15, -0.65, 0.65, -0.15]); c.closePath(); c.fill(); break;
    case 'meteor': c.beginPath(); c.arc(-0.25 * s, 0.3 * s, s * 0.5, 0, TAU); c.fill(); line([0.2, -0.3, 0.9, -1]); c.stroke(); line([0.45, 0.05, 1, -0.45]); c.stroke(); break;
    case 'might': polygon(c, 0, 0, s * 0.95, 4, -Math.PI / 2); c.fill(); polygon(c, 0, 0, s * 0.5, 4, Math.PI / 4); c.fill(); break;
    case 'haste': line([-0.8, -0.7, -0.1, 0, -0.8, 0.7]); c.stroke(); line([0.1, -0.7, 0.8, 0, 0.1, 0.7]); c.stroke(); break;
    case 'vitality': heart(c, 0, 0, s * 0.8); c.fill(); break;
    case 'magnet': c.beginPath(); c.arc(0, -0.05 * s, s * 0.6, Math.PI, 0); c.lineTo(0.6 * s, 0.8 * s); c.moveTo(-0.6 * s, -0.05 * s); c.lineTo(-0.6 * s, 0.8 * s); c.lineWidth = s * 0.36; c.lineCap = 'butt'; c.stroke(); break;
    case 'quick': c.beginPath(); c.arc(0, 0, s * 0.85, 0, TAU); c.stroke(); line([0, -0.5, 0, 0, 0.4, 0.25]); c.stroke(); break;
    case 'regen': line([0, -0.85, 0, 0.85]); c.lineWidth = s * 0.36; c.stroke(); line([-0.85, 0, 0.85, 0]); c.stroke(); break;
    case 'heal': heart(c, 0, 0, s * 0.8); c.fill(); c.strokeStyle = '#111a2c'; c.lineWidth = s * 0.18; line([0, -0.35, 0, 0.3]); c.stroke(); line([-0.32, -0.02, 0.32, -0.02]); c.stroke(); break;
    default: c.beginPath(); c.arc(0, 0, s * 0.85, 0, TAU); c.fill(); c.fillStyle = '#111a2c'; c.beginPath(); c.arc(0, 0, s * 0.45, 0, TAU); c.fill();
  }
  c.restore();
}

function drawEnemy(c: CanvasRenderingContext2D, e: Enemy, time: number) {
  const r = e.r, white = e.flash > 0, base = white ? '#ffffff' : ENEMY_COLOR[e.kind], dark = '#1a0d16';
  c.save(); c.translate(e.x, e.y);
  if (e.elite) { c.strokeStyle = GOLD; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, r + 5, 0, TAU); c.stroke(); }
  c.fillStyle = base; c.strokeStyle = dark; c.lineWidth = 2;
  const eye = (ex: number, ey: number, size: number) => { c.fillStyle = white ? '#fff' : '#fff7f0'; c.beginPath(); c.arc(ex, ey, size, 0, TAU); c.fill(); c.fillStyle = '#1a0d16'; c.beginPath(); c.arc(ex + Math.cos(e.face) * size * 0.4, ey + Math.sin(e.face) * size * 0.4, size * 0.5, 0, TAU); c.fill(); };
  if (e.kind === 'grub') {
    const squish = 1 + Math.sin(time * 7 + e.id) * 0.07;
    c.beginPath(); c.ellipse(0, 0, r * squish, r / squish, 0, 0, TAU); c.fill(); c.stroke();
    eye(-r * 0.35, -r * 0.15, r * 0.26); eye(r * 0.35, -r * 0.15, r * 0.26);
  } else if (e.kind === 'skitter') {
    c.rotate(e.face); c.beginPath(); c.moveTo(r * 1.5, 0); c.lineTo(-r, r * 0.95); c.lineTo(-r * 0.45, 0); c.lineTo(-r, -r * 0.95); c.closePath(); c.fill(); c.stroke();
  } else if (e.kind === 'brute') {
    polygon(c, 0, 0, r * 1.08, 6, Math.PI / 6); c.fill(); c.stroke();
    c.fillStyle = white ? '#fff' : '#6d4fd1'; polygon(c, 0, r * 0.1, r * 0.62, 6, Math.PI / 6); c.fill();
    c.strokeStyle = dark; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-r * 0.62, -r * 0.5); c.lineTo(-r * 0.12, -r * 0.3); c.moveTo(r * 0.62, -r * 0.5); c.lineTo(r * 0.12, -r * 0.3); c.stroke();
    eye(-r * 0.34, -r * 0.12, r * 0.17); eye(r * 0.34, -r * 0.12, r * 0.17);
  } else if (e.kind === 'spitter') {
    polygon(c, 0, 0, r * 1.25, 4, 0); c.fill(); c.stroke(); eye(0, 0, r * 0.42);
    if (e.cd < 0.5 && !white) { c.strokeStyle = '#fff7'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 1.5, 0, TAU); c.stroke(); }
  } else if (e.kind === 'charger') {
    c.rotate(e.mode === 1 ? Math.atan2(e.dy, e.dx) : e.face);
    if (e.mode === 1) { c.fillStyle = '#ff5fa255'; c.fillRect(0, -3, 150, 6); c.fillStyle = e.t % 0.16 < 0.08 ? '#ffffff' : base; }
    c.beginPath(); c.moveTo(r * 1.45, 0); c.lineTo(-r * 0.2, r * 1.05); c.lineTo(-r * 1.1, r * 0.7); c.lineTo(-r * 0.6, 0); c.lineTo(-r * 1.1, -r * 0.7); c.lineTo(-r * 0.2, -r * 1.05); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = dark; c.beginPath(); c.arc(r * 0.35, 0, r * 0.24, 0, TAU); c.fill();
  } else {
    if (e.mode === 1) { c.save(); c.rotate(Math.atan2(e.dy, e.dx)); c.fillStyle = '#e5484d44'; c.fillRect(0, -r * 0.7, 230, r * 1.4); c.restore(); }
    c.fillStyle = white ? '#fff' : '#7a1f2b'; c.beginPath();
    for (let index = 0; index < 20; index++) { const angle = time * 0.8 + index / 20 * TAU, radius = index % 2 ? r * 0.98 : r * 1.28; if (index) c.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else c.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = base; c.beginPath(); c.arc(0, 0, r * 0.86, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = white ? '#fff' : '#ffd166'; c.beginPath(); c.arc(0, 0, r * 0.42, 0, TAU); c.fill();
    eye(0, 0, r * 0.3);
  }
  c.restore();
  if ((e.kind === 'brute' || e.elite) && e.hp < e.maxHp) { const width = r * 2.2; c.fillStyle = '#060a12cc'; c.fillRect(e.x - width / 2, e.y - r - 11, width, 4); c.fillStyle = e.elite ? GOLD : DANGER; c.fillRect(e.x - width / 2, e.y - r - 11, width * Math.max(0, e.hp / e.maxHp), 4); }
}

function drawPlayer(c: CanvasRenderingContext2D, s: State, time: number, reduced: boolean) {
  const bob = s.moving && !reduced ? Math.sin(time * 16) * 1.2 : 0, r = PLAYER_R + 2;
  c.save(); c.translate(s.px, s.py);
  c.fillStyle = '#0006'; c.beginPath(); c.ellipse(0, r * 0.95, r * 0.9, r * 0.32, 0, 0, TAU); c.fill();
  if (s.invuln > 0 && s.phase === 'play') c.globalAlpha = reduced ? 0.6 : (Math.floor(time * 14) % 2 ? 0.35 : 0.9);
  const step = s.moving ? Math.sin(time * 16) * 2.5 : 0;
  c.fillStyle = '#0b3b33'; c.beginPath(); c.ellipse(-4, r * 0.82 + step * 0.4, 3.4, 2.4, 0, 0, TAU); c.ellipse(4, r * 0.82 - step * 0.4, 3.4, 2.4, 0, 0, TAU); c.fill();
  c.translate(0, bob);
  c.strokeStyle = '#0b3b33'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -r + 1); c.quadraticCurveTo(-s.faceX * 5, -r - 6, -s.faceX * 6, -r - 8); c.stroke();
  c.fillStyle = GOLD; c.beginPath(); c.arc(-s.faceX * 6, -r - 9, 2.8, 0, TAU); c.fill();
  c.fillStyle = ACCENT; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#c9fff0'; c.beginPath(); c.ellipse(-r * 0.3, -r * 0.42, r * 0.34, r * 0.2, -0.5, 0, TAU); c.fill();
  const ox = s.faceX * 2.6, oy = s.faceY * 2.2;
  for (const side of [-1, 1]) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(side * 3.9 + ox, -0.5 + oy, 3, 0, TAU); c.fill(); c.fillStyle = '#082a25'; c.beginPath(); c.arc(side * 3.9 + ox * 1.4, -0.5 + oy * 1.4, 1.5, 0, TAU); c.fill(); }
  c.restore();
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type FloatText = { x: number; y: number; life: number; max: number; text: string; color: string; size: number };
type Pop = { x: number; y: number; r: number; life: number; max: number; color: string };

export function createRenderer(reduced: boolean) {
  let seed = 0x2f6e2b1, particles: Particle[] = [], texts: FloatText[] = [], pops: Pop[] = [];
  let shake = 0, hurt = 0, banner = { text: '', tone: 'warn' as 'warn' | 'good', life: 0 }, pickupGlow = 0;
  const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const sparks = (x: number, y: number, color: string, count: number, speed: number, size = 3) => {
    if (reduced) return;
    for (let index = 0; index < count && particles.length < 260; index++) { const angle = rnd() * TAU, v = speed * (0.35 + rnd() * 0.65), life = 0.25 + rnd() * 0.3; particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life, max: life, color, size: size * (0.6 + rnd() * 0.7) }); }
  };

  return {
    reset() { particles = []; texts = []; pops = []; shake = 0; hurt = 0; banner.life = 0; pickupGlow = 0; },
    /** Feeds one simulation event into the cosmetic layer. */
    onEvent(event: SimEvent, s: State) {
      if (event.type === 'dmg') {
        if (texts.length >= 32) texts.shift();
        texts.push({ x: event.x + (rnd() - 0.5) * 10, y: event.y - 4, life: 0.5, max: 0.5, text: String(event.amount), color: event.crit ? GOLD : INK, size: event.crit ? 17 : 13 });
      } else if (event.type === 'kill') {
        const color = ENEMY_COLOR[event.kind], big = event.elite || event.kind === 'warden';
        sparks(event.x, event.y, color, big ? 26 : 6, big ? 240 : 130, big ? 5 : 3);
        if (pops.length < 60) pops.push({ x: event.x, y: event.y, r: event.r * (big ? 3 : 1.9), life: 0.26, max: 0.26, color });
        if (big) shake = Math.max(shake, 5);
      } else if (event.type === 'boom') { pops.push({ x: event.x, y: event.y, r: event.r, life: 0.3, max: 0.3, color: '#ffe3b0' }); sparks(event.x, event.y, '#ffb86b', 8, 170); }
      else if (event.type === 'hurt') { hurt = 0.4; shake = Math.max(shake, 7); sparks(s.px, s.py, DANGER, 10, 160); texts.push({ x: s.px, y: s.py - 22, life: 0.8, max: 0.8, text: `-${event.amount}`, color: DANGER, size: 17 }); }
      else if (event.type === 'gem') { pickupGlow = 0.18; if (event.kind === 'heart') texts.push({ x: s.px, y: s.py - 22, life: 0.9, max: 0.9, text: '+HP', color: '#ff8fab', size: 16 }); if (event.kind === 'magnet') texts.push({ x: s.px, y: s.py - 22, life: 0.9, max: 0.9, text: 'MAGNET', color: '#9aa7ff', size: 15 }); }
      else if (event.type === 'burst') { shake = Math.max(shake, 6); sparks(s.px, s.py, ACCENT, 24, 300, 4); }
      else if (event.type === 'bossdown') { shake = Math.max(shake, 10); sparks(event.x, event.y, GOLD, 40, 320, 5); }
      else if (event.type === 'banner') banner = { text: event.text, tone: event.tone, life: 3.2 };
    },
    banner(text: string, tone: 'warn' | 'good' = 'good', life = 3.2) { banner = { text, tone, life }; },

    draw(c: CanvasRenderingContext2D, s: State, view: View, ui: Ui, dt: number) {
      const { w, h, scale } = view, time = ui.clock, live = !ui.paused;
      if (live) {
        for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
        for (const t of texts) { t.life -= dt; if (!reduced) t.y -= 34 * dt; }
        for (const p of pops) p.life -= dt;
        particles = particles.filter(p => p.life > 0); texts = texts.filter(t => t.life > 0); pops = pops.filter(p => p.life > 0);
        shake = Math.max(0, shake - dt * 28); hurt = Math.max(0, hurt - dt); banner.life = Math.max(0, banner.life - dt); pickupGlow = Math.max(0, pickupGlow - dt);
      }
      // ---- world ----
      c.fillStyle = '#0c1820'; c.fillRect(0, 0, w, h);
      const shakeX = reduced ? 0 : (rnd() - 0.5) * shake, shakeY = reduced ? 0 : (rnd() - 0.5) * shake;
      const halfW = w / 2 / scale, halfH = h / 2 / scale, left = s.px - halfW, top = s.py - halfH;
      c.save(); c.translate(w / 2 + shakeX, h / 2 + shakeY); c.scale(scale, scale); c.translate(-s.px, -s.py);
      const tile = 64, x0 = Math.floor(left / tile) - 1, x1 = Math.ceil((left + halfW * 2) / tile) + 1, y0 = Math.floor(top / tile) - 1, y1 = Math.ceil((top + halfH * 2) / tile) + 1;
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const hash = ((gx * 73856093) ^ (gy * 19349663)) >>> 0, pick = hash % 11, x = gx * tile, y = gy * tile;
        if ((gx + gy) & 1) { c.fillStyle = '#0f1d27'; c.fillRect(x, y, tile, tile); }
        if (pick === 0) { c.fillStyle = '#16303a'; c.beginPath(); c.arc(x + 14 + hash % 30, y + 12 + (hash >> 5) % 34, 3 + hash % 3, 0, TAU); c.fill(); }
        else if (pick === 1) { c.strokeStyle = '#1b3a44'; c.lineWidth = 2; const px = x + 18 + hash % 24, py = y + 18 + (hash >> 4) % 24; c.beginPath(); c.moveTo(px - 5, py); c.lineTo(px + 5, py); c.moveTo(px, py - 5); c.lineTo(px, py + 5); c.stroke(); }
        else if (pick === 2) { c.fillStyle = '#132833'; roundRect(c, x + 10, y + 10, tile - 20, tile - 20, 8); c.fill(); }
      }
      // pickup range and gems
      c.strokeStyle = pickupGlow > 0 ? '#70f0c244' : '#70f0c21c'; c.lineWidth = 1.5; c.beginPath(); c.arc(s.px, s.py, pickupRadius(s), 0, TAU); c.stroke();
      for (const gem of s.gems) {
        if (gem.x < left - 20 || gem.x > left + halfW * 2 + 20 || gem.y < top - 20 || gem.y > top + halfH * 2 + 20) continue;
        const bob = reduced ? 0 : Math.sin(gem.age * 5 + gem.x) * 1.5;
        if (gem.kind === 'heart') { c.fillStyle = '#ff8fab'; c.strokeStyle = '#3d0f1d'; c.lineWidth = 1.5; heart(c, gem.x, gem.y + bob, 7); c.fill(); c.stroke(); continue; }
        if (gem.kind === 'magnet') { c.fillStyle = '#1b2350'; c.beginPath(); c.arc(gem.x, gem.y + bob, 10, 0, TAU); c.fill(); drawIcon(c, 'magnet', gem.x, gem.y + bob, 7, '#9aa7ff'); continue; }
        const size = gem.value >= 20 ? 7.5 : gem.value >= 5 ? 6 : 4.5;
        c.fillStyle = gem.value >= 20 ? GOLD : gem.value >= 5 ? '#7fb2ff' : ACCENT; c.strokeStyle = '#062a2399'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(gem.x, gem.y - size + bob); c.lineTo(gem.x + size * 0.75, gem.y + bob); c.lineTo(gem.x, gem.y + size + bob); c.lineTo(gem.x - size * 0.75, gem.y + bob); c.closePath(); c.fill(); c.stroke();
      }
      // meteor telegraphs
      for (const zone of s.zones) {
        const progress = 1 - zone.t / zone.max;
        c.fillStyle = '#c4a1ff22'; c.beginPath(); c.arc(zone.x, zone.y, zone.r * progress, 0, TAU); c.fill();
        c.strokeStyle = '#c4a1ffaa'; c.lineWidth = 2; c.beginPath(); c.arc(zone.x, zone.y, zone.r, 0, TAU); c.stroke();
        c.fillStyle = '#ffe3b0'; c.beginPath(); c.arc(zone.x + (1 - progress) * 40, zone.y - (1 - progress) * 150, 6, 0, TAU); c.fill();
      }
      for (const enemy of s.enemies) if (enemy.x > left - 60 && enemy.x < left + halfW * 2 + 60 && enemy.y > top - 60 && enemy.y < top + halfH * 2 + 60) drawEnemy(c, enemy, time);
      for (const shot of s.enemyShots) { c.fillStyle = '#ff7a45'; c.strokeStyle = '#fff3d6'; c.lineWidth = 1.5; c.beginPath(); c.arc(shot.x, shot.y, shot.r, 0, TAU); c.fill(); c.stroke(); }
      // weapons
      for (const beam of s.beams) {
        const alpha = Math.max(0, beam.life / 0.24), ex = beam.x + Math.cos(beam.angle) * beam.length, ey = beam.y + Math.sin(beam.angle) * beam.length;
        c.lineCap = 'round'; c.globalAlpha = alpha * 0.55; c.strokeStyle = '#ff9f6b'; c.lineWidth = beam.width; c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(ex, ey); c.stroke();
        c.globalAlpha = alpha; c.strokeStyle = '#fff3d6'; c.lineWidth = Math.max(2, beam.width * 0.3); c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(ex, ey); c.stroke(); c.globalAlpha = 1; c.lineCap = 'butt';
      }
      for (const ring of s.rings) {
        const radius = Math.min(ring.r, ring.maxR), alpha = Math.max(0.15, 1 - radius / ring.maxR);
        c.globalAlpha = alpha; c.strokeStyle = ring.burst ? '#eafff8' : ACCENT; c.lineWidth = ring.burst ? 7 : 4; c.beginPath(); c.arc(s.px, s.py, radius, 0, TAU); c.stroke();
        c.globalAlpha = alpha * 0.12; c.fillStyle = ACCENT; c.beginPath(); c.arc(s.px, s.py, radius, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      for (const shot of s.shots) {
        const d = Math.hypot(shot.vx, shot.vy) || 1, tx = shot.vx / d * 11, ty = shot.vy / d * 11;
        c.lineCap = 'round'; c.strokeStyle = '#7fd8ff'; c.lineWidth = shot.blast ? 5 : 4; c.beginPath(); c.moveTo(shot.x - tx, shot.y - ty); c.lineTo(shot.x, shot.y); c.stroke();
        c.fillStyle = '#eaf8ff'; c.beginPath(); c.arc(shot.x, shot.y, shot.blast ? 3.4 : 2.6, 0, TAU); c.fill(); c.lineCap = 'butt';
      }
      if (s.weapons.blades) {
        const count = BLADES.count[s.weapons.blades], radius = BLADES.radius[s.weapons.blades];
        c.strokeStyle = '#ffd16618'; c.lineWidth = 1; c.beginPath(); c.arc(s.px, s.py, radius, 0, TAU); c.stroke();
        if (!reduced) { c.strokeStyle = '#ffd16640'; c.lineWidth = 5; c.lineCap = 'round'; for (let index = 0; index < count; index++) { const angle = s.bladeAngle + index / count * TAU; c.beginPath(); c.arc(s.px, s.py, radius, angle - 0.5, angle - 0.12); c.stroke(); } c.lineCap = 'butt'; }
        for (let index = 0; index < count; index++) {
          const angle = s.bladeAngle + index / count * TAU;
          c.save(); c.translate(s.px + Math.cos(angle) * radius, s.py + Math.sin(angle) * radius); c.rotate(angle + Math.PI / 2);
          c.fillStyle = GOLD; c.strokeStyle = '#3a2a05'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-13, 3); c.quadraticCurveTo(0, -15, 13, 3); c.quadraticCurveTo(0, -3, -13, 3); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = '#fff6d6'; c.beginPath(); c.arc(0, -5, 2.2, 0, TAU); c.fill(); c.restore();
        }
      }
      for (const pop of pops) { const k = 1 - pop.life / pop.max; c.globalAlpha = (1 - k) * 0.8; c.strokeStyle = pop.color; c.lineWidth = 3 * (1 - k) + 1; c.beginPath(); c.arc(pop.x, pop.y, reduced ? pop.r * 0.8 : pop.r * (0.45 + k * 0.55), 0, TAU); c.stroke(); }
      c.globalAlpha = 1;
      for (const p of particles) { c.globalAlpha = Math.max(0, p.life / p.max); c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      c.globalAlpha = 1;
      if (s.phase !== 'dead') drawPlayer(c, s, time, reduced);
      if (s.hp < s.maxHp && s.phase === 'play') { c.fillStyle = '#060a12cc'; c.fillRect(s.px - 15, s.py + 17, 30, 4); c.fillStyle = s.hp / s.maxHp < 0.3 ? DANGER : '#7cf29a'; c.fillRect(s.px - 15, s.py + 17, 30 * Math.max(0, s.hp / s.maxHp), 4); }
      c.restore();
      // floating numbers are drawn in screen space so they stay a readable size on every stage
      const sx = (x: number) => w / 2 + (x - s.px) * scale + shakeX, sy = (y: number) => h / 2 + (y - s.py) * scale + shakeY;
      for (const t of texts) { c.globalAlpha = Math.min(1, t.life / t.max * 2.2); outlined(c, t.text, sx(t.x), sy(t.y), t.size, t.color); }
      c.globalAlpha = 1;
      // off-screen threat arrows
      for (const enemy of s.enemies) {
        if (!enemy.elite && enemy.kind !== 'warden') continue;
        const ex = sx(enemy.x), ey = sy(enemy.y);
        if (ex > 0 && ex < w && ey > 0 && ey < h) continue;
        const angle = Math.atan2(ey - h / 2, ex - w / 2), ax = Math.max(22, Math.min(w - 22, ex)), ay = Math.max(104, Math.min(h - 54, ey));
        c.save(); c.translate(ax, ay); c.rotate(angle); c.fillStyle = enemy.kind === 'warden' ? DANGER : GOLD; c.strokeStyle = '#060a12'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, 9); c.lineTo(-3, 0); c.lineTo(-8, -9); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
      // hurt feedback: a red rim only, never a full-canvas flash
      if (hurt > 0 && !reduced) { const reach = Math.hypot(w, h) / 2, edge = c.createRadialGradient(w / 2, h / 2, reach * 0.72, w / 2, h / 2, reach * 1.02); edge.addColorStop(0, '#ff6b7a00'); edge.addColorStop(1, '#ff6b7a'); c.globalAlpha = Math.min(0.45, hurt * 1.4); c.fillStyle = edge; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
      if (ui.stick) { c.strokeStyle = '#70f0c2aa'; c.lineWidth = 3; c.beginPath(); c.arc(ui.stick.x, ui.stick.y, 44, 0, TAU); c.stroke(); c.fillStyle = '#70f0c2cc'; c.beginPath(); c.arc(ui.stick.x + ui.stick.dx * 30, ui.stick.y + ui.stick.dy * 30, 16, 0, TAU); c.fill(); }

      this.hud(c, s, view, ui, hurt);
      if (s.phase === 'levelup') this.cards(c, s, view, ui);
      else if (s.phase === 'dead') this.gameOver(c, s, view, ui);
      else if (ui.paused) { c.fillStyle = '#060a12cc'; roundRect(c, w / 2 - 90, h / 2 - 30, 180, 60, 14); c.fill(); label(c, 'PAUSED', w / 2, h / 2, 24, INK, 'center'); }
    },

    hud(c: CanvasRenderingContext2D, s: State, view: View, ui: Ui, hurtGlow: number) {
      const { w } = view, pad = inset(ui);
      const top = c.createLinearGradient(0, 0, 0, 104); top.addColorStop(0, '#060a12f2'); top.addColorStop(0.6, '#060a12c4'); top.addColorStop(1, '#060a1200'); c.fillStyle = top; c.fillRect(0, 0, w, 104);
      // HP
      const hpW = Math.max(84, Math.min(170, w / 2 - pad - 36)), ratio = Math.max(0, s.hp / s.maxHp);
      c.fillStyle = '#273149'; roundRect(c, pad, 12, hpW, 20, 6); c.fill();
      if (ratio > 0) { c.fillStyle = ratio < 0.3 ? DANGER : '#e5546a'; roundRect(c, pad, 12, Math.max(8, hpW * ratio), 20, 6); c.fill(); }
      c.strokeStyle = hurtGlow > 0 ? '#ffffff' : '#060a12'; c.lineWidth = 2; roundRect(c, pad, 12, hpW, 20, 6); c.stroke();
      label(c, `${Math.ceil(s.hp)} / ${s.maxHp}`, pad + hpW / 2, 22.5, 14, INK, 'center', 800);
      // timer and kills
      outlined(c, clock(s.time), w / 2, 22, 19, INK);
      label(c, `${s.kills} KO`, w - pad, 22, 15, INK, 'right', 800);
      if (w >= 620) label(c, `SCORE ${s.score}`, w - pad - 96, 22, 14, MUTED, 'right');
      // XP
      const bar = xpBarRect(view, ui);
      label(c, `LV ${s.level}`, pad, bar.y + bar.h / 2 + 0.5, 14, ACCENT, 'left', 800);
      c.fillStyle = '#273149'; roundRect(c, bar.x, bar.y, bar.w, bar.h, 5); c.fill();
      c.fillStyle = '#8b7cff'; roundRect(c, bar.x, bar.y, Math.max(0, bar.w * Math.min(1, s.xp / s.need)), bar.h, 5); c.fill();
      // build chips
      let x = 12; const y = 73;
      for (const id of WEAPON_IDS) { const level = s.weapons[id]; if (!level) continue; this.chip(c, id, x, y, WEAPON_CARDS[id].color, level); x += 30; }
      for (const id of PASSIVE_IDS) { const level = s.passives[id]; if (!level || x > w - 130) continue; this.chip(c, id, x, y, PASSIVE_CARDS[id].color, level); x += 30; }
      // goal
      const goal = s.boss ? '' : s.won ? 'ENDLESS' : `WARDEN ${clock(Math.max(0, BOSS_TIME - s.time))}`;
      if (goal) label(c, goal, w - 12, y, 14, s.won ? GOLD : MUTED, 'right', 800);
      if (s.boss) {
        const bw = Math.min(w - 32, 420), bx = (w - bw) / 2, by = 96;
        c.fillStyle = '#060a12cc'; roundRect(c, bx - 3, by - 3, bw + 6, 20, 7); c.fill();
        c.fillStyle = '#e5484d'; roundRect(c, bx, by, bw * Math.max(0, s.boss.hp / s.boss.maxHp), 14, 5); c.fill();
        label(c, 'THE WARDEN', w / 2, by + 7.5, 14, INK, 'center', 800);
      }
      if (banner.life > 0) { c.globalAlpha = Math.min(1, banner.life * 2, (3.4 - banner.life) * 4); outlined(c, banner.text, w / 2, s.boss ? 142 : 124, w < 420 ? 18 : 22, banner.tone === 'warn' ? '#ffb86b' : ACCENT); c.globalAlpha = 1; }
      // burst meter
      if (s.phase === 'play') {
        const { x: bx, y: by, w: bw, h: bh } = burstRect(view, ui), full = s.burst >= s.burstNeed, pulse = full && !reduced ? 0.5 + Math.sin(ui.clock * 8) * 0.5 : 1;
        c.fillStyle = '#060a12cc'; roundRect(c, bx, by, bw, bh, bh / 2); c.fill();
        c.fillStyle = full ? ACCENT : '#2c6b5a'; roundRect(c, bx, by, Math.max(bh, bw * Math.min(1, s.burst / s.burstNeed)), bh, bh / 2); c.fill();
        c.strokeStyle = full ? `rgba(234,255,248,${0.45 + pulse * 0.55})` : '#3b4a66'; c.lineWidth = 2; roundRect(c, bx, by, bw, bh, bh / 2); c.stroke();
        label(c, full ? ui.burstLabel : 'BURST CHARGING', w / 2, by + bh / 2 + 0.5, 14, full ? '#06231c' : INK, 'center', 800);
        if (ui.hint) outlined(c, ui.hint, w / 2, by - 20, 14, INK);
      }
    },
    chip(c: CanvasRenderingContext2D, key: string, x: number, y: number, color: string, level: number) {
      c.fillStyle = '#060a12b3'; roundRect(c, x, y - 12, 26, 24, 6); c.fill();
      if (level >= MAX_LEVEL) { c.strokeStyle = GOLD; c.lineWidth = 1.5; roundRect(c, x, y - 12, 26, 24, 6); c.stroke(); }
      drawIcon(c, key, x + 13, y - 2, 7, color);
      for (let index = 0; index < MAX_LEVEL; index++) { c.fillStyle = index < level ? color : '#3b4a66'; c.fillRect(x + 3 + index * 4.2, y + 7.5, 3.2, 2.5); }
    },

    cards(c: CanvasRenderingContext2D, s: State, view: View, ui: Ui) {
      const { w, h } = view, rects = cardRects(view, s.choices.length);
      c.fillStyle = '#060a12c7'; c.fillRect(0, 0, w, h);
      const titleY = Math.max(22, rects[0].y - 34);
      outlined(c, `LEVEL ${s.level}`, w / 2, titleY, 22, GOLD);
      label(c, ui.touch ? 'Tap an upgrade' : 'Pick with 1 2 3, or arrows + Enter', w / 2, titleY + 22, 14, MUTED, 'center', 600);
      s.choices.forEach((card: Card, index: number) => {
        const r = rects[index], selected = index === ui.selected, wide = r.h > 130;
        c.fillStyle = selected ? '#1c2a47' : PANEL; roundRect(c, r.x, r.y, r.w, r.h, 14); c.fill();
        c.strokeStyle = selected ? card.color : '#33415f'; c.lineWidth = selected ? 3 : 1.5; roundRect(c, r.x, r.y, r.w, r.h, 14); c.stroke();
        c.fillStyle = card.color; roundRect(c, r.x, r.y, 6, r.h, 3); c.fill();
        if (wide) {
          c.fillStyle = '#060a1299'; c.beginPath(); c.arc(r.x + r.w / 2, r.y + 46, 30, 0, TAU); c.fill(); drawIcon(c, card.key, r.x + r.w / 2, r.y + 46, 17, card.color);
          label(c, card.name, r.x + r.w / 2, r.y + 96, 18, INK, 'center', 800);
          label(c, card.tag, r.x + r.w / 2, r.y + 118, 14, card.evolve ? GOLD : card.color, 'center', 800);
          c.font = font(14, 500); wrap(c, card.desc, r.w - 28).slice(0, 3).forEach((line, row) => label(c, line, r.x + r.w / 2, r.y + 144 + row * 18, 14, '#d5dbea', 'center', 500));
          label(c, String(index + 1), r.x + r.w - 18, r.y + 18, 14, MUTED, 'center', 800);
        } else {
          const cy = r.y + r.h / 2, tx = r.x + 70;
          c.fillStyle = '#060a1299'; c.beginPath(); c.arc(r.x + 38, cy, 24, 0, TAU); c.fill(); drawIcon(c, card.key, r.x + 38, cy, 14, card.color);
          c.font = font(14, 500); const lines = wrap(c, card.desc, r.w - 70 - 14).slice(0, 2), block = 22 + lines.length * 17, y0 = cy - block / 2 + 9;
          label(c, card.name, tx, y0, 17, INK, 'left', 800);
          label(c, card.tag, r.x + r.w - 12, y0, 14, card.evolve ? GOLD : card.color, 'right', 800);
          lines.forEach((line, row) => label(c, line, tx, y0 + 22 + row * 17, 14, '#d5dbea', 'left', 500));
        }
      });
    },

    gameOver(c: CanvasRenderingContext2D, s: State, view: View, ui: Ui) {
      const { w, h } = view, pw = Math.min(340, w - 24), ph = Math.min(318, h - 16), px = (w - pw) / 2, py = Math.max(8, (h - ph) / 2);
      c.fillStyle = '#060a12b8'; c.fillRect(0, 0, w, h);
      c.fillStyle = PANEL; roundRect(c, px, py, pw, ph, 18); c.fill(); c.strokeStyle = s.won ? GOLD : DANGER; c.lineWidth = 2; roundRect(c, px, py, pw, ph, 18); c.stroke();
      label(c, s.won ? 'WARDEN SLAYER' : 'SWARMED', w / 2, py + 34, 26, s.won ? GOLD : DANGER, 'center', 800);
      label(c, s.won ? `Fell in endless mode to ${ENEMY_NAME[s.killer] ?? 'the swarm'}` : `Taken down by ${ENEMY_NAME[s.killer] ?? 'the swarm'}`, w / 2, py + 62, 14, MUTED, 'center', 600);
      const rows: [string, string][] = [['Time', clock(s.time)], ['Kills', String(s.kills)], ['Level', String(s.level)], ['Score', String(s.score)], ['Best', String(Math.max(ui.best, s.score))]];
      const rowH = Math.min(30, (ph - 150) / rows.length);
      rows.forEach(([name, value], index) => { const y = py + 96 + index * rowH; label(c, name, px + 28, y, 16, MUTED, 'left', 600); label(c, value, px + pw - 28, y, 17, index === 3 ? ACCENT : INK, 'right', 800); });
      if (ui.newBest) label(c, 'NEW BEST!', w / 2, py + ph - 56, 15, GOLD, 'center', 800);
      else if (!s.won) label(c, `The Warden arrives at ${clock(BOSS_TIME)}`, w / 2, py + ph - 56, 14, MUTED, 'center', 600);
      c.globalAlpha = ui.locked ? 0.35 : 1; c.fillStyle = ACCENT; roundRect(c, px + 24, py + ph - 42, pw - 48, 30, 15); c.fill(); label(c, ui.retryLabel, w / 2, py + ph - 26.5, 15, '#06231c', 'center', 800); c.globalAlpha = 1;
    }
  };
}
export type Renderer = ReturnType<typeof createRenderer>;
