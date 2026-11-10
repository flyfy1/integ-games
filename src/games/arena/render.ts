/**
 * Pocket Survivor drawing: a cartoon Three Kingdoms battlefield. Reads the simulation state and never changes it.
 * Cosmetic effects (particles, damage numbers, banners, scene changes) live here and use their own tiny generator,
 * so gameplay randomness stays untouched. Characters, props and ground tiles are baked to offscreen sprites once
 * per resolution; the per-frame work is almost entirely image blits.
 */
import { BLADES, BOLT, ENEMIES, MAX_LEVEL, PASSIVE_CARDS, PASSIVE_IDS, WEAPON_CARDS, WEAPON_IDS, type EnemyKind } from './data';
import { BOSS_TIME, pickupRadius, type Card, type Enemy, type SimEvent, type State } from './sim';
import { bake, C, canvasOf, drawArcher, drawArrow, drawBandit, drawBruiser, drawBurst, drawCoin, drawCrescent, drawDragonBeam, drawFireball, drawHero, drawIcon as artIcon, drawIngot, drawJade, drawPeach, drawPuff, drawRider, drawSoldier, drawSpear, drawTalisman, drawWarlord, E, glowSprite, INK, L, R, star, TAU, type Ctx, type Sprite } from './art';
import { buildScenes, drawGround, hash, sceneIndex, type Scene } from './scenes';

export type View = { w: number; h: number; scale: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Ui = {
  best: number; newBest: boolean; selected: number; locked: boolean; touch: boolean; paused: boolean; clock: number;
  stick: { x: number; y: number; dx: number; dy: number } | null; hint: string; burstLabel: string; retryLabel: string;
};

const TEXT = '#3a2418', BROWN = '#735238';
export const ENEMY_NAME: Record<string, string> = { grub: 'a Foot Soldier', skitter: 'a Bandit pack', brute: 'a Hammer Bruiser', spitter: 'an Archer', charger: 'a Cavalry Lancer', warden: 'the Warlord' };
const KIND_COLOR: Record<EnemyKind, string> = { grub: 'starG', skitter: 'starR', brute: 'starW', spitter: 'starG', charger: 'starR', warden: 'starG' };
/** Banner text from the simulation, re-themed at display time only. */
const BANNER_TEXT: Record<string, string> = {
  'SWARM CLOSING IN': 'BANDIT AMBUSH!', 'ELITE INCOMING': 'ENEMY OFFICER APPROACHES', 'THE WARDEN AWAKENS': 'THE WARLORD TAKES THE FIELD',
  'ANOTHER WARDEN RISES': 'ANOTHER WARLORD RISES', 'WARDEN DOWN - ENDLESS MODE': 'WARLORD DOWN - ENDLESS MODE', 'WARDEN DOWN': 'WARLORD DOWN'
};
const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const font = (size: number, weight = 800) => `${weight} ${size}px ${FONT}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const mod = (value: number, size: number) => ((value % size) + size) % size;

/** Side inset that keeps HUD text clear of the shell's round corner buttons on touch layouts. */
const inset = (ui: Ui) => (ui.touch ? 62 : 14);
export function xpBarRect(view: View, ui: Ui): Rect { const x = inset(ui) + 50; return { x, y: 39, w: view.w - inset(ui) - x, h: 12 }; }
/** The burst meter doubles as a tap target, so touch layouts without the Attack button can still fire it. */
export function burstRect(view: View, ui: Ui): Rect { const w = ui.touch ? 220 : 228, h = ui.touch ? 36 : 30; return { x: (view.w - w) / 2, y: view.h - h - 10, w, h }; }
/** Level-up cards: a stacked list on narrow stages, three columns on wide ones. Shared by drawing and hit-testing. */
export function cardRects(view: View, count: number): Rect[] {
  const { w, h } = view, gap = 12;
  if (w < 620) {
    const cw = Math.min(w - 28, 440), ch = Math.max(64, Math.min(98, (h - 96 - gap * (count - 1)) / count)), total = count * ch + (count - 1) * gap, top = Math.max(60, (h - total) / 2 + 22);
    return Array.from({ length: count }, (_, index) => ({ x: (w - cw) / 2, y: top + index * (ch + gap), w: cw, h: ch }));
  }
  const wideGap = 22, cw = Math.min(250, (w - 56 - wideGap * 2) / 3), ch = Math.min(226, h - 140), total = count * cw + (count - 1) * wideGap;
  return Array.from({ length: count }, (_, index) => ({ x: (w - total) / 2 + index * (cw + wideGap), y: (h - ch) / 2 + 26, w: cw, h: ch }));
}

function label(c: Ctx, value: string, x: number, y: number, size: number, color = C.cream, align: CanvasTextAlign = 'left', weight = 800) {
  c.font = font(size, weight); c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y);
}
function outlined(c: Ctx, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', edge = INK, weight = 800) {
  c.font = font(size, weight); c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = Math.max(3, size / 4.2); c.strokeStyle = edge; c.strokeText(value, x, y); c.fillStyle = color; c.fillText(value, x, y);
}
function wrap(c: Ctx, value: string, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const word of value.split(' ')) { const next = line ? `${line} ${word}` : word; if (line && c.measureText(next).width > width) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}
/** A framed cartoon meter: ink frame, dark track, two-tone fill with a highlight band. */
function meter(c: Ctx, x: number, y: number, w: number, h: number, ratio: number, fill: string, light: string, track: string, frame = INK) {
  R(c, x - 2, y - 2, w + 4, h + 4, h / 2 + 2); c.fillStyle = frame; c.fill();
  R(c, x, y, w, h, h / 2); c.fillStyle = track; c.fill();
  const fw = w * Math.max(0, Math.min(1, ratio));
  if (fw > 0.5) { c.save(); R(c, x, y, w, h, h / 2); c.clip(); c.fillStyle = fill; c.fillRect(x, y, fw, h); c.fillStyle = light; c.fillRect(x, y + 1.5, fw, h * 0.34); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + fw - 2, y, 2, h); c.restore(); }
}
/** Parchment scroll with wooden rollers on the short ends (`upright`) or on the sides. */
function scroll(c: Ctx, x: number, y: number, w: number, h: number, upright: boolean, lit: boolean) {
  c.fillStyle = 'rgba(30,14,10,0.35)'; R(c, x + 2, y + 5, w, h, 8); c.fill();
  R(c, x, y, w, h, 7); c.fillStyle = lit ? '#fff6dc' : C.parchment; c.fill();
  c.save(); R(c, x, y, w, h, 7); c.clip(); c.strokeStyle = C.parchmentDark; c.lineWidth = 7; R(c, x, y, w, h, 7); c.stroke(); c.restore();
  R(c, x, y, w, h, 7); c.strokeStyle = lit ? C.gold : INK; c.lineWidth = lit ? 3.5 : 2; c.stroke();
  if (lit) { R(c, x - 2.6, y - 2.6, w + 5.2, h + 5.2, 9.5); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); }
  const rod = (rx: number, ry: number, rw: number, rh: number) => {
    R(c, rx, ry, rw, rh, 5); c.fillStyle = C.wood; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.fillStyle = C.woodLight; if (upright) R(c, rx + 8, ry + 2, rw - 16, 2.4, 1.2); else R(c, rx + 2, ry + 8, 2.4, rh - 16, 1.2); c.fill();
    c.fillStyle = C.gold; c.strokeStyle = INK; c.lineWidth = 1.6;
    if (upright) { R(c, rx - 2, ry - 1, 7, rh + 2, 3); c.fill(); c.stroke(); R(c, rx + rw - 5, ry - 1, 7, rh + 2, 3); c.fill(); c.stroke(); }
    else { R(c, rx - 1, ry - 2, rw + 2, 7, 3); c.fill(); c.stroke(); R(c, rx - 1, ry + rh - 5, rw + 2, 7, 3); c.fill(); c.stroke(); }
  };
  if (upright) { rod(x - 6, y - 6, w + 12, 11); rod(x - 6, y + h - 5, w + 12, 11); } else { rod(x - 6, y - 5, 11, h + 10); rod(x + w - 5, y - 5, 11, h + 10); }
}
function plaque(c: Ctx, x: number, y: number, w: number, h: number, r = 8, fill = C.woodDark) {
  R(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); c.strokeStyle = C.goldDark; c.lineWidth = 1.5; c.stroke();
}
/** Small coloured glyphs for weapons, passives and bonus cards. */
export function drawIcon(c: Ctx, key: string, x: number, y: number, s: number, color: string) { artIcon(c, key, x, y, s, color); }

let cjk: boolean | null = null;
const CJK_FONT = '900 20px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
/** True when the device can really draw a Han glyph (compared against a guaranteed-missing code point). */
function hasCjk(): boolean {
  if (cjk !== null) return cjk;
  cjk = false;
  try {
    const probe = (glyph: string) => { const made = canvasOf(24, 24); if (!made) return ''; made.c.font = CJK_FONT; made.c.textBaseline = 'middle'; made.c.textAlign = 'center'; made.c.fillText(glyph, 12, 12); return Array.from(made.c.getImageData(0, 0, 24, 24).data.filter((_, i) => i % 4 === 3)).join(','); };
    const a = probe('勝'), b = probe('￿'); cjk = a !== '' && a !== b && /[1-9]/.test(a);
  } catch { cjk = false; }
  return cjk;
}
function seal(c: Ctx, x: number, y: number, size: number, glyph: string, icon: string) {
  c.save(); c.translate(x, y); c.rotate(-0.1);
  R(c, -size / 2, -size / 2, size, size, size * 0.18); c.fillStyle = C.red; c.fill(); c.strokeStyle = C.redDark; c.lineWidth = 1.6; c.stroke();
  R(c, -size / 2 + 3, -size / 2 + 3, size - 6, size - 6, size * 0.1); c.strokeStyle = 'rgba(255,243,214,0.75)'; c.lineWidth = 1.2; c.stroke();
  if (hasCjk()) { c.font = CJK_FONT.replace('20px', `${Math.round(size * 0.58)}px`); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = C.cream; c.fillText(glyph, 0, size * 0.04); }
  else artIcon(c, icon, 0, 0, size * 0.32, C.cream);
  c.restore();
}

// ---- baked art kit -------------------------------------------------------------------------------------------------------------
type Cast = { draw: (c: Ctx, frame: number, elite: boolean) => void; frames: number; box: readonly number[]; height: number; rate: number };
const CAST: Record<Exclude<EnemyKind, 'warden'>, Cast> = {
  grub: { draw: drawSoldier, frames: 4, box: [-27, -50, 21, 5], height: 38, rate: 2.2 },
  skitter: { draw: drawBandit, frames: 4, box: [-24, -46, 19, 5], height: 28, rate: 3.6 },
  brute: { draw: drawBruiser, frames: 4, box: [-33, -64, 28, 6], height: 50, rate: 1.5 },
  spitter: { draw: drawArcher, frames: 5, box: [-27, -50, 29, 5], height: 40, rate: 2 },
  charger: { draw: drawRider, frames: 7, box: [-36, -68, 42, 7], height: 46, rate: 2.6 }
};
/** The general is drawn a little larger than his hit circle so he reads at phone size. */
const HERO_SIZE = 1.16;
const HERO_BOX = [-42, -68, 40, 14], BOSS_BOX = [-64, -128, 98, 12];
type Buffer = { el: HTMLCanvasElement; c: Ctx; res: number; box: readonly number[] };
type Kit = {
  res: number; cast: Record<string, Sprite[]>; item: Record<string, Sprite>; fx: Record<string, Sprite>; shadow: HTMLCanvasElement; glow: Record<string, HTMLCanvasElement>;
  scenes: Scene[]; hero: Buffer; boss: Buffer;
};
function buildKit(res: number): Kit | null {
  const cast: Record<string, Sprite[]> = {};
  for (const kind of Object.keys(CAST) as (keyof typeof CAST)[]) {
    const def = CAST[kind];
    for (const elite of [false, true]) {
      const frames: Sprite[] = [];
      for (let frame = 0; frame < def.frames; frame++) { const made = bake(res * (elite ? 1.55 : 1), def.box, c => def.draw(c, frame, elite), true); if (!made) return null; frames.push(made); }
      cast[elite ? `${kind}!` : kind] = frames;
    }
  }
  const item: Record<string, Sprite> = {}, fx: Record<string, Sprite> = {};
  const put = (into: Record<string, Sprite>, key: string, scale: number, box: readonly number[], draw: (c: Ctx) => void) => { const made = bake(res * scale, box, draw); if (made) into[key] = made; return !!made; };
  const ok = [
    put(item, 'jade', 1.3, [-7, -7, 7, 7], drawJade), put(item, 'coin', 1.3, [-8, -8, 8, 8], drawCoin), put(item, 'ingot', 1.3, [-11, -8, 11, 8], drawIngot),
    put(item, 'peach', 1.3, [-11, -14, 11, 10], drawPeach), put(item, 'talisman', 1.3, [-9, -11, 9, 11], drawTalisman),
    put(item, 'spear', 1.2, [-22, -6, 4, 6], c => drawSpear(c, false)), put(item, 'storm', 1.2, [-22, -6, 4, 6], c => drawSpear(c, true)),
    put(item, 'crescent', 1.2, [-17, -15, 17, 8], c => drawCrescent(c, false)), put(item, 'halo', 1.2, [-17, -15, 17, 8], c => drawCrescent(c, true)),
    put(item, 'arrow', 1.3, [-19, -6, 4, 6], c => drawArrow(c, false)), put(item, 'fireArrow', 1.3, [-19, -6, 4, 6], c => drawArrow(c, true)),
    put(item, 'fireball', 1.3, [-17, -9, 9, 9], drawFireball),
    put(item, 'beam', 0.8, [-2, -22, 266, 22], c => drawDragonBeam(c, false)), put(item, 'beamAzure', 0.8, [-2, -22, 266, 22], c => drawDragonBeam(c, true)),
    put(fx, 'fire', 40, [-1.1, -1.1, 1.1, 1.1], c => drawBurst(c, '#ff7a2e', '#ffd23a', '#8f1d1d')), put(fx, 'spark', 26, [-1.1, -1.1, 1.1, 1.1], c => drawBurst(c, '#6fd3ff', '#eaf9ff', '#2a6fb8')),
    put(fx, 'puff', 12, [-1.05, -1.05, 1.05, 1.05], c => drawPuff(c, '#fff8e6', '#e6d2aa')), put(fx, 'dust', 10, [-1.05, -1.05, 1.05, 1.05], c => drawPuff(c, '#e8d2a6', '#c9ab78')),
    put(fx, 'smoke', 12, [-1.05, -1.05, 1.05, 1.05], c => drawPuff(c, '#c9bfc4', '#a0949c')),
    ...(['starW:#ffffff:#c9b58a', 'starG:#ffd23a:#b3741e', 'starR:#ff6b5a:#8f1d1d', 'starJ:#7ff0cc:#1f8f6e'].map(spec => { const [key, fill, edge] = spec.split(':'); return put(fx, key, 8, [-1.1, -1.1, 1.1, 1.1], c => { star(c, 0, 0, 1, 0.4, 4); c.fillStyle = fill; c.fill(); c.strokeStyle = edge; c.lineWidth = 0.14; c.stroke(); }); }))
  ];
  if (ok.includes(false)) return null;
  const shadow = canvasOf(64, 32); if (!shadow) return null;
  { const g = shadow.c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(34,18,30,0.5)'); g.addColorStop(0.6, 'rgba(34,18,30,0.36)'); g.addColorStop(1, 'rgba(34,18,30,0)'); shadow.c.scale(1, 0.5); shadow.c.fillStyle = g; shadow.c.fillRect(0, 0, 64, 64); }
  const glow: Record<string, HTMLCanvasElement> = {};
  for (const [key, color] of [['warm', '#ffb347'], ['gold', '#ffd75a'], ['red', '#ff3b30'], ['white', '#fff6dc'], ['dark', '#3a0f1c'], ['jade', '#5ff0c8']] as const) { const made = glowSprite(color, 96, key === 'red' ? 0.25 : 0); if (!made) return null; glow[key] = made; }
  const buffer = (box: readonly number[], r: number): Buffer | null => { const made = canvasOf((box[2] - box[0]) * r, (box[3] - box[1]) * r); return made ? { el: made.el, c: made.c, res: r, box } : null; };
  const hero = buffer(HERO_BOX, res * HERO_SIZE), boss = buffer(BOSS_BOX, Math.min(res, 2));
  if (!hero || !boss) return null;
  return { res, cast, item, fx, shadow: shadow.el, glow, scenes: buildScenes(res), hero, boss };
}
function vignetteOf(w: number, h: number, color: string, strength: number, start: number): HTMLCanvasElement | null {
  const made = canvasOf(Math.ceil(w / 4), Math.ceil(h / 4)); if (!made) return null;
  const { el, c } = made, cw = el.width, ch = el.height, reach = Math.hypot(cw, ch) / 2, g = c.createRadialGradient(cw / 2, ch / 2, reach * start, cw / 2, ch / 2, reach * 1.02);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(',');
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${strength})`); c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  return el;
}

type Particle = { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; size: number; grow: number; spr: string };
type FloatText = { x: number; y: number; life: number; max: number; text: string; color: string; edge: string; size: number };
type Pop = { x: number; y: number; r: number; life: number; max: number; kind: 'ring' | 'fire' | 'spark' };
type Scorch = { x: number; y: number; r: number; life: number };

export function createRenderer(reduced: boolean) {
  let seed = 0x2f6e2b1, particles: Particle[] = [], texts: FloatText[] = [], pops: Pop[] = [], scorches: Scorch[] = [];
  let shake = 0, hurt = 0, banner = { text: '', tone: 'warn' as 'warn' | 'good' | 'place', life: 0 }, pickupGlow = 0;
  let kit: Kit | null = null, kitRes = 0, kitFailed = false, pendingRes = 0, pendingFrames = 0;
  let scene = -1, lastScene = -1, fade = 0, runSalt = 0, heroDir = 1, thrust = 0, lastBoltCd = 0, dustTimer = 0;
  let vignettes: Record<string, HTMLCanvasElement | null> = {}, vignetteSize = '';
  const visible: Enemy[] = [];
  const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const emit = (spr: string, x: number, y: number, count: number, speed: number, size: number, life: number, grow = 0, g = 0) => {
    if (reduced) return;
    for (let index = 0; index < count && particles.length < 240; index++) { const angle = rnd() * TAU, v = speed * (0.35 + rnd() * 0.65), span = life * (0.7 + rnd() * 0.5); particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, g, life: span, max: span, size: size * (0.7 + rnd() * 0.6), grow, spr }); }
  };
  let textCap = 30;
  const say = (x: number, y: number, text: string, color: string, size: number, life = 0.55, edge = INK) => { while (texts.length >= textCap) texts.shift(); texts.push({ x, y, life, max: life, text, color, edge, size }); };

  return {
    reset() { particles = []; texts = []; pops = []; scorches = []; shake = 0; hurt = 0; banner.life = 0; pickupGlow = 0; scene = -1; lastScene = -1; fade = 0; runSalt += 7919; heroDir = 1; thrust = 0; lastBoltCd = 0; },
    /** Feeds one simulation event into the cosmetic layer. */
    onEvent(event: SimEvent, s: State) {
      if (event.type === 'dmg') {
        say(event.x + (rnd() - 0.5) * 12, event.y - 6, event.crit ? `${event.amount}!` : String(event.amount), event.crit ? C.gold : C.cream, event.crit ? 18 : 14, event.crit ? 0.6 : 0.42, event.crit ? '#7a1a18' : INK);
        emit(event.crit ? 'starG' : 'starW', event.x, event.y + 6, 1, 30, event.crit ? 7 : 5, 0.2, 0.6);
      } else if (event.type === 'kill') {
        const big = event.elite || event.kind === 'warden';
        emit('puff', event.x, event.y - 4, big ? 7 : 2, big ? 150 : 60, big ? 10 : event.r * 0.62, big ? 0.55 : 0.32, 0.6);
        emit(KIND_COLOR[event.kind], event.x, event.y, big ? 12 : 3, big ? 260 : 140, big ? 7 : 4.4, big ? 0.6 : 0.36);
        if (pops.length < 60) pops.push({ x: event.x, y: event.y, r: event.r * (big ? 3.2 : 1.9), life: 0.26, max: 0.26, kind: 'ring' });
        if (big) shake = Math.max(shake, 5);
      } else if (event.type === 'boom') {
        const bolt = event.r === BOLT.blast;
        if (pops.length < 70) pops.push({ x: event.x, y: event.y, r: event.r, life: bolt ? 0.26 : 0.4, max: bolt ? 0.26 : 0.4, kind: bolt ? 'spark' : 'fire' });
        if (bolt) emit('starJ', event.x, event.y, 3, 170, 4.4, 0.3);
        else { emit('smoke', event.x, event.y - 6, 2, 36, event.r * 0.17, 0.6, 0.8, -50); emit('starG', event.x, event.y, 5, 210, 5, 0.4); if (scorches.length < 24) scorches.push({ x: event.x, y: event.y, r: event.r * 0.8, life: 2.6 }); shake = Math.max(shake, 2.5); }
      }
      else if (event.type === 'hurt') { hurt = 0.4; shake = Math.max(shake, 7); emit('starR', s.px, s.py - 8, 7, 240, 5, 0.32); say(s.px, s.py - 48, `-${event.amount}`, '#ff7a6e', 19, 0.8, '#5a0f14'); }
      else if (event.type === 'gem') {
        pickupGlow = 0.18;
        if (event.kind === 'heart') { say(s.px, s.py - 48, '+HP', '#ffb3c0', 17, 0.9, '#7a1a2c'); emit('starR', s.px, s.py - 10, 4, 170, 4, 0.34); }
        else if (event.kind === 'magnet') { say(s.px, s.py - 68, 'TALISMAN!', '#ffe27a', 16, 0.9, '#7a4a12'); emit('starG', s.px, s.py - 10, 6, 230, 4.4, 0.36); }
        else if (particles.length < 160) emit(event.value >= 5 ? 'starG' : 'starJ', s.px + (rnd() - 0.5) * 14, s.py - 12, 1, 40, 4, 0.3, 0, -60);
      }
      else if (event.type === 'burst') { shake = Math.max(shake, 7); emit('dust', s.px, s.py + 4, 12, 230, 9, 0.5, 0.8); emit('starG', s.px, s.py - 6, 14, 330, 6, 0.5); }
      else if (event.type === 'bossdown') { shake = Math.max(shake, 10); emit('starG', event.x, event.y, 30, 340, 8, 0.9); emit('puff', event.x, event.y, 14, 190, 16, 0.8, 0.8); pops.push({ x: event.x, y: event.y, r: 120, life: 0.6, max: 0.6, kind: 'fire' }); }
      else if (event.type === 'banner') banner = { text: BANNER_TEXT[event.text] ?? event.text, tone: event.tone, life: 3.2 };
    },
    banner(text: string, tone: 'warn' | 'good' = 'good', life = 3.2) { banner = { text, tone, life }; },

    draw(c: Ctx, s: State, view: View, ui: Ui, dt: number) {
      const { w, h, scale } = view, time = ui.clock, live = !ui.paused;
      textCap = w < 620 ? 12 : 30;
      if (live) {
        for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.9; p.vy *= 0.9; }
        for (const t of texts) { t.life -= dt; if (!reduced) t.y -= 38 * dt; }
        for (const p of pops) p.life -= dt;
        for (const p of scorches) p.life -= dt;
        particles = particles.filter(p => p.life > 0); texts = texts.filter(t => t.life > 0); pops = pops.filter(p => p.life > 0); scorches = scorches.filter(p => p.life > 0);
        shake = Math.max(0, shake - dt * 28); hurt = Math.max(0, hurt - dt); banner.life = Math.max(0, banner.life - dt); pickupGlow = Math.max(0, pickupGlow - dt);
        thrust = Math.max(0, thrust - dt * 6); fade = Math.max(0, fade - dt / 2.2);
        if (s.phase === 'play') {
          if (s.boltCd > lastBoltCd + 0.2) thrust = 1;
          lastBoltCd = s.boltCd;
          if (s.moving && Math.abs(s.faceX) > 0.25) heroDir = s.faceX > 0 ? 1 : -1;
          if (s.moving) { dustTimer -= dt; if (dustTimer <= 0) { dustTimer = 0.16; emit('dust', s.px - s.faceX * 5, s.py + 8, 1, 14, 4.6, 0.36, 0.9); } }
        }
      }
      // scene progression is a pure function of run time, so it never touches the simulation
      const now = sceneIndex(s.time, s.won, s.wonAt);
      if (now !== scene) {
        lastScene = scene; scene = now; fade = lastScene >= 0 && !reduced ? 1 : 0;
        if (kit && (banner.tone !== 'warn' || banner.life <= 0.4)) banner = { text: kit.scenes[scene].name.toUpperCase(), tone: 'place', life: 2.6 };
      }
      const matrix = typeof c.getTransform === 'function' ? c.getTransform() : null, dpr = matrix && matrix.a > 0 ? matrix.a : 1;
      // sprites are baked at the exact device scale so the crowd blits 1:1; a resize rebuilds once the size settles
      const res = Math.min(3, Math.max(1, Math.round(scale * dpr * 1000) / 1000));
      if (kit && kitRes !== res) { if (pendingRes === res) pendingFrames++; else { pendingRes = res; pendingFrames = 0; } }
      if ((!kit || (kitRes !== res && pendingFrames > 10)) && !kitFailed) { const built = buildKit(res); if (built) { kit = built; kitRes = res; if (banner.life <= 0) banner = { text: built.scenes[scene].name.toUpperCase(), tone: 'place', life: 2.6 }; } else if (!kit) kitFailed = true; }
      const shakeX = reduced ? 0 : (rnd() - 0.5) * shake, shakeY = reduced ? 0 : (rnd() - 0.5) * shake;
      const halfW = w / 2 / scale, halfH = h / 2 / scale, left = s.px - halfW, top = s.py - halfH, right = left + halfW * 2, bottom = top + halfH * 2;
      const M = dpr * scale, ox = (w / 2 + shakeX) * dpr - s.px * M, oy = (h / 2 + shakeY) * dpr - s.py * M;
      const world = () => c.setTransform(M, 0, 0, M, ox, oy), screen = () => c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = (x: number) => w / 2 + (x - s.px) * scale + shakeX, sy = (y: number) => h / 2 + (y - s.py) * scale + shakeY;
      c.lineJoin = 'round'; c.lineCap = 'round';
      if (!kit) { c.fillStyle = '#a2d06c'; c.fillRect(0, 0, w, h); }
      else {
        const k = kit, stage = k.scenes[scene], flicker = reduced ? 0 : Math.sin(time * 9) * 0.6 + Math.sin(time * 23) * 0.4;
        world();
        drawGround(c, stage, runSalt + scene * 101, left - 4, top - 4, halfW * 2 + 8, halfH * 2 + 8, k.glow.warm, flicker);
        if (fade > 0 && lastScene >= 0) drawGround(c, k.scenes[lastScene], runSalt + lastScene * 101, left - 4, top - 4, halfW * 2 + 8, halfH * 2 + 8, k.glow.warm, flicker, fade);
        // ---- ground decals ----
        for (const mark of scorches) { c.globalAlpha = Math.min(0.1, mark.life * 0.1); c.fillStyle = '#4a2414'; E(c, mark.x, mark.y + 2, mark.r * 0.8, mark.r * 0.46); c.fill(); }
        c.globalAlpha = 0.3; c.drawImage(k.glow.white, s.px - 78, s.py - 40, 156, 104); c.globalAlpha = 1;
        const reach = pickupRadius(s);
        c.setLineDash([5, 7]); c.lineDashOffset = reduced ? 0 : -time * 14; c.strokeStyle = pickupGlow > 0 ? 'rgba(255,246,220,0.8)' : 'rgba(255,246,220,0.34)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(s.px, s.py + 4, reach, reach, 0, 0, TAU); c.stroke(); c.setLineDash([]);
        // cull and depth-sort the crowd
        visible.length = 0;
        for (const enemy of s.enemies) if (enemy.hp > 0 && enemy.x > left - 70 && enemy.x < right + 70 && enemy.y > top - 40 && enemy.y < bottom + 110) visible.push(enemy);
        visible.sort((a, b) => a.y + a.r - b.y - b.r);
        for (const enemy of visible) {
          if (enemy.kind === 'warden') { const pulse = reduced ? 1 : 1 + Math.sin(time * 4) * 0.06; c.globalAlpha = 0.5; c.drawImage(k.glow.dark, enemy.x - 120 * pulse, enemy.y - 46 * pulse, 240 * pulse, 150 * pulse); c.globalAlpha = 1; }
          else if (enemy.elite) { const pulse = reduced ? 1 : 1 + Math.sin(time * 5 + enemy.id) * 0.1, size = enemy.r * 3.2 * pulse; c.globalAlpha = 0.7; c.drawImage(k.glow.gold, enemy.x - size, enemy.y + enemy.r * 0.6 - size * 0.5, size * 2, size); c.globalAlpha = 1; }
          // charge tells: a red lane on the ground along the committed direction
          if ((enemy.kind === 'charger' || enemy.kind === 'warden') && enemy.mode === 1) {
            const boss = enemy.kind === 'warden', length = boss ? 230 : 150, width = boss ? enemy.r * 1.4 : 13, blink = reduced || Math.floor(time * 12) % 2 ? 0.5 : 0.3;
            c.save(); c.translate(enemy.x, enemy.y); c.rotate(Math.atan2(enemy.dy, enemy.dx));
            c.globalAlpha = blink; c.fillStyle = '#ff3b30'; R(c, 0, -width / 2, length, width, width / 2); c.fill(); c.globalAlpha = 0.9; c.strokeStyle = '#fff3d6'; c.lineWidth = 1.6; c.setLineDash([6, 6]); R(c, 0, -width / 2, length, width, width / 2); c.stroke(); c.setLineDash([]);
            c.fillStyle = '#fff3d6'; for (let x = 26; x < length - 10; x += 30) { L(c, [x + 8, 0, x, -width * 0.32, x + 3, 0, x, width * 0.32]); c.fill(); }
            c.restore(); c.globalAlpha = 1;
          }
        }
        // fire-arrow target rings
        for (const zone of s.zones) {
          const progress = 1 - zone.t / zone.max;
          c.globalAlpha = 0.08 + progress * 0.1; c.fillStyle = '#ff7a2e'; E(c, zone.x, zone.y, zone.r, zone.r * 0.94); c.fill();
          c.globalAlpha = 0.18; E(c, zone.x, zone.y, zone.r * progress, zone.r * progress * 0.94); c.fill();
          c.globalAlpha = 0.95; c.setLineDash([9, 6]); c.lineDashOffset = reduced ? 0 : time * 30; c.strokeStyle = '#8f1d1d'; c.lineWidth = 3.4; E(c, zone.x, zone.y, zone.r, zone.r * 0.94); c.stroke(); c.strokeStyle = '#ffd23a'; c.lineWidth = 1.6; c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        }
        // war-drum shockwaves roll along the ground under the fighters
        for (const ring of s.rings) {
          const radius = Math.min(ring.r, ring.maxR), q = radius / ring.maxR, a = Math.max(0, 1 - q);
          const circle = (r: number) => { c.beginPath(); c.arc(s.px, s.py + 3, Math.max(0.1, r), 0, TAU); };
          if (ring.burst) {
            c.globalAlpha = 0.05 + a * 0.12; c.fillStyle = '#fff3d6'; circle(radius); c.fill();
            c.globalAlpha = Math.min(1, a * 1.7 + 0.12);
            circle(radius); c.strokeStyle = '#b3262b'; c.lineWidth = 11; c.stroke(); c.strokeStyle = C.gold; c.lineWidth = 6.5; c.stroke(); c.strokeStyle = '#fffbe8'; c.lineWidth = 2.4; c.stroke();
            c.globalAlpha *= 0.7; circle(radius * 0.8); c.strokeStyle = C.gold; c.lineWidth = 3; c.stroke(); circle(radius * 0.58); c.strokeStyle = '#fff3d6'; c.lineWidth = 2; c.stroke(); circle(radius * 0.36); c.lineWidth = 1.2; c.stroke();
            c.strokeStyle = '#fff3d6'; c.lineWidth = 2.6; c.beginPath(); for (let i = 0; i < 18; i++) { const angle = i / 18 * TAU + ring.id; c.moveTo(s.px + Math.cos(angle) * radius * 0.88, s.py + 3 + Math.sin(angle) * radius * 0.88); c.lineTo(s.px + Math.cos(angle) * (radius * 1.04 + 6), s.py + 3 + Math.sin(angle) * (radius * 1.04 + 6)); } c.stroke();
          } else {
            const main = ring.slow ? '#6fd3ff' : C.gold, edge = ring.slow ? '#1f5fa8' : '#a8501c';
            c.globalAlpha = 0.04 + a * 0.08; c.fillStyle = main; circle(radius); c.fill();
            c.globalAlpha = Math.min(1, a * 1.5 + 0.18);
            circle(radius); c.strokeStyle = edge; c.lineWidth = 7; c.stroke(); c.strokeStyle = main; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#fffbe8'; c.lineWidth = 1.5; c.stroke();
            c.globalAlpha *= 0.6; circle(radius * 0.78); c.strokeStyle = main; c.lineWidth = 2.2; c.stroke(); circle(radius * 0.54); c.lineWidth = 1.2; c.stroke();
            if (ring.slow) { c.strokeStyle = '#eaf9ff'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 12; i++) { const angle = i / 12 * TAU + ring.id * 0.7; c.moveTo(s.px + Math.cos(angle) * (radius + 3), s.py + 3 + Math.sin(angle) * (radius + 3)); c.lineTo(s.px + Math.cos(angle + 0.06) * (radius + 9), s.py + 3 + Math.sin(angle + 0.06) * (radius + 9)); c.lineTo(s.px + Math.cos(angle - 0.03) * (radius + 14), s.py + 3 + Math.sin(angle - 0.03) * (radius + 14)); } c.stroke(); }
          }
          c.globalAlpha = 1;
        }
        // shadows
        for (const enemy of visible) { const r = enemy.kind === 'charger' ? enemy.r * 1.5 : enemy.r * 1.15; c.drawImage(k.shadow, enemy.x - r, enemy.y + enemy.r * 0.9 - r * 0.36, r * 2, r * 0.72); }
        if (s.phase !== 'dead') { c.drawImage(k.shadow, s.px - 13, s.py + 9 - 4.6, 26, 9.2); E(c, s.px, s.py + 9, 17, 7.2); c.strokeStyle = 'rgba(42,27,43,0.45)'; c.lineWidth = 3.6; c.stroke(); c.strokeStyle = '#fff6dc'; c.lineWidth = 1.8; c.stroke(); }
        // pickups: jade, coins, ingots, peaches and talismans
        let gemIndex = 0;
        for (const gem of s.gems) {
          gemIndex++;
          if (gem.x < left - 20 || gem.x > right + 20 || gem.y < top - 20 || gem.y > bottom + 20) continue;
          const sprite = gem.kind === 'heart' ? k.item.peach : gem.kind === 'magnet' ? k.item.talisman : gem.value >= 20 ? k.item.ingot : gem.value >= 5 ? k.item.coin : k.item.jade;
          const bob = reduced ? 0 : Math.sin(gem.age * 5 + gem.x) * 1.6, special = gem.kind !== 'xp';
          if (special) { c.globalAlpha = 0.75; c.drawImage(gem.kind === 'heart' ? k.glow.white : k.glow.gold, gem.x - 17, gem.y - 17, 34, 34); c.globalAlpha = 1; }
          if (gem.pull && !reduced) { const dx = gem.x - s.px, dy = gem.y - s.py, d = Math.hypot(dx, dy) || 1, lag = Math.min(16, 4 + gem.speed * 0.025); c.globalAlpha = 0.22; c.drawImage(sprite.img, gem.x + dx / d * lag * 2 + sprite.x, gem.y + dy / d * lag * 2 + sprite.y, sprite.w, sprite.h); c.globalAlpha = 0.45; c.drawImage(sprite.img, gem.x + dx / d * lag + sprite.x, gem.y + dy / d * lag + sprite.y, sprite.w, sprite.h); c.globalAlpha = 1; }
          c.drawImage(sprite.img, gem.x + sprite.x, gem.y + bob + sprite.y, sprite.w, sprite.h);
          if (!reduced) { const twinkle = Math.sin(time * 4.2 + gemIndex * 1.7); if (twinkle > 0.82) { const size = (twinkle - 0.82) * 26, spark = k.fx.starW; c.drawImage(spark.img, gem.x + 2.6 - size / 2, gem.y + bob - 3.4 - size / 2, size, size); } }
        }
        // ---- the cast, back to front ----
        const heroBuffer = k.hero, dead = s.phase === 'dead';
        { const b = heroBuffer; b.c.setTransform(1, 0, 0, 1, 0, 0); b.c.globalCompositeOperation = 'source-over'; b.c.clearRect(0, 0, b.el.width, b.el.height); b.c.setTransform(b.res, 0, 0, b.res, -b.box[0] * b.res, -b.box[1] * b.res); drawHero(b.c, time, s.moving && s.phase === 'play', reduced, reduced ? 0 : thrust);
          if (hurt > 0 || dead) { b.c.setTransform(1, 0, 0, 1, 0, 0); b.c.globalCompositeOperation = 'source-atop'; b.c.fillStyle = dead ? 'rgba(120,110,130,0.6)' : `rgba(255,70,60,${Math.min(0.45, hurt * 1.3)})`; b.c.fillRect(0, 0, b.el.width, b.el.height); } }
        const drawHeroSprite = (alpha: number) => {
          const b = heroBuffer, squash = reduced ? 0 : hurt * 0.5, fy = s.py + 9;
          c.globalAlpha = alpha;
          if (dead) { c.setTransform(M * HERO_SIZE, 0, 0, M * HERO_SIZE, ox + s.px * M, oy + fy * M); c.rotate(-1.42 * heroDir); c.scale(heroDir, 1); }
          else c.setTransform(M * HERO_SIZE * heroDir * (1 + squash * 0.3), 0, 0, M * HERO_SIZE * (1 - squash * 0.24), ox + s.px * M, oy + fy * M);
          c.drawImage(b.el, b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1]); c.globalAlpha = 1;
        };
        const blink = s.invuln > 0 && s.phase === 'play' ? (reduced ? 0.7 : Math.floor(time * 14) % 2 ? 0.45 : 1) : 1;
        let heroDrawn = false;
        for (const enemy of visible) {
          if (!heroDrawn && enemy.y + enemy.r > s.py + 9) { drawHeroSprite(blink); heroDrawn = true; }
          const fy = enemy.y + enemy.r * 0.9;
          if (enemy.kind === 'warden') {
            const b = k.boss, dir = enemy.mode ? (enemy.dx >= 0 ? 1 : -1) : s.px >= enemy.x ? 1 : -1;
            b.c.setTransform(1, 0, 0, 1, 0, 0); b.c.globalCompositeOperation = 'source-over'; b.c.clearRect(0, 0, b.el.width, b.el.height); b.c.setTransform(b.res, 0, 0, b.res, -b.box[0] * b.res, -b.box[1] * b.res); drawWarlord(b.c, time + enemy.id, enemy.mode, reduced);
            if (enemy.flash > 0) { b.c.setTransform(1, 0, 0, 1, 0, 0); b.c.globalCompositeOperation = 'source-atop'; b.c.fillStyle = 'rgba(255,255,255,0.34)'; b.c.fillRect(0, 0, b.el.width, b.el.height); }
            if (enemy.mode === 2 && !reduced) { c.globalAlpha = 0.28; for (const lag of [2, 1]) { c.setTransform(M * dir, 0, 0, M, ox + (enemy.x - enemy.dx * 22 * lag) * M, oy + (fy - enemy.dy * 22 * lag) * M); c.drawImage(b.el, b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1]); } c.globalAlpha = 1; }
            c.setTransform(M * dir, 0, 0, M, ox + enemy.x * M, oy + fy * M); c.drawImage(b.el, b.box[0], b.box[1], b.box[2] - b.box[0], b.box[3] - b.box[1]);
            continue;
          }
          const def = CAST[enemy.kind], set = k.cast[enemy.elite ? `${enemy.kind}!` : enemy.kind];
          let frame = reduced ? 0 : Math.floor(mod(time * def.rate + enemy.id * 0.37, 1) * 4), dir = s.px >= enemy.x ? 1 : -1, size = enemy.r / ENEMIES[enemy.kind].r;
          if (enemy.kind === 'spitter') { const dx = s.px - enemy.x, dy = s.py - enemy.y; if (enemy.cd < 0.5 && dx * dx + dy * dy < 90000) frame = 4; if (enemy.t < 0.22) size *= 0.55 + enemy.t * 2; }
          else if (enemy.kind === 'charger') { if (enemy.mode === 1) { frame = 4; dir = enemy.dx >= 0 ? 1 : -1; } else if (enemy.mode === 2) { frame = reduced ? 5 : 5 + (Math.floor(time * 14) & 1); dir = enemy.dx >= 0 ? 1 : -1; } }
          else if (enemy.t < 0.22) size *= 0.55 + enemy.t * 2;
          const sprite = set[frame], image = enemy.flash > 0 && sprite.hit ? sprite.hit : sprite.img;
          if (enemy.kind === 'charger' && enemy.mode === 2 && !reduced) { c.setTransform(M, 0, 0, M, ox, oy); c.globalAlpha = 0.7; c.strokeStyle = '#fff8e6'; c.lineWidth = 2; c.beginPath(); for (const off of [-9, -2, 5]) { c.moveTo(enemy.x - enemy.dx * 20 - enemy.dy * off, enemy.y - 8 - enemy.dy * 20 + enemy.dx * off); c.lineTo(enemy.x - enemy.dx * (44 + off) - enemy.dy * off, enemy.y - 8 - enemy.dy * (44 + off) + enemy.dx * off); } c.stroke(); c.globalAlpha = 1; }
          if (Math.abs(M * size - sprite.res) < 0.002) { c.setTransform(dir, 0, 0, 1, Math.round(ox + enemy.x * M), Math.round(oy + fy * M)); c.drawImage(image, sprite.px, sprite.py); }
          else { c.setTransform(M * size * dir, 0, 0, M * size, ox + enemy.x * M, oy + fy * M); c.drawImage(image, sprite.x, sprite.y, sprite.w, sprite.h); }
        }
        if (!heroDrawn) drawHeroSprite(blink);
        world();
        // tells and health bars above heads
        for (const enemy of visible) {
          if (enemy.kind === 'warden') continue;
          const size = enemy.r / ENEMIES[enemy.kind].r, head = enemy.y + enemy.r * 0.9 - CAST[enemy.kind].height * size;
          if (enemy.kind === 'charger' && enemy.mode === 1) { const pop = reduced ? 1 : 1 + Math.sin(time * 20) * 0.12; c.save(); c.translate(enemy.x, head - 10); c.scale(pop, pop); R(c, -2.6, -11, 5.2, 11, 2.2); c.fillStyle = '#ff3b30'; c.fill(); c.strokeStyle = '#fff3d6'; c.lineWidth = 1.5; c.stroke(); E(c, 0, 4.4, 2.8, 2.8); c.fill(); c.stroke(); c.restore(); }
          if (enemy.elite ? enemy.hp < enemy.maxHp : enemy.kind === 'brute' && enemy.hp < enemy.maxHp * 0.7) { const width = enemy.elite ? Math.max(24, enemy.r * 2.2) : 22, y = head - 7; R(c, enemy.x - width / 2 - 1.4, y - 1.4, width + 2.8, 6.8, 3.4); c.fillStyle = INK; c.fill(); R(c, enemy.x - width / 2, y, Math.max(2, width * Math.max(0, enemy.hp / enemy.maxHp)), 4, 2); c.fillStyle = enemy.elite ? C.gold : '#ff5a4f'; c.fill(); }
        }
        // falling fire arrows
        for (const zone of s.zones) {
          const progress = 1 - zone.t / zone.max, count = zone.r > 60 ? 6 : 4, arrow = k.item.fireArrow, base = hash(Math.floor(zone.x * 3), Math.floor(zone.y * 3), 5);
          for (let i = 0; i < count; i++) {
            const h2 = hash(base, i, 9), fx = zone.x + ((h2 % 100) / 100 - 0.5) * zone.r * 1.2, fy = zone.y + (((h2 >>> 8) % 100) / 100 - 0.5) * zone.r * 0.9, lead = Math.max(0, 1 - progress * (1 + ((h2 >>> 16) % 30) / 100)), x = fx + lead * 70, y = fy - lead * 250;
            c.globalAlpha = 0.6; c.drawImage(k.glow.warm, x - 12, y - 12, 24, 24); c.globalAlpha = 1;
            c.setTransform(M * -0.27 * 1.5, M * 0.963 * 1.5, M * -0.963 * 1.5, M * -0.27 * 1.5, ox + x * M, oy + y * M); c.drawImage(arrow.img, arrow.x, arrow.y, arrow.w, arrow.h); world();
          }
        }
        // enemy missiles: always on top of the crowd, with a red glow so they read on every ground
        for (const shot of s.enemyShots) {
          if (shot.x < left - 20 || shot.x > right + 20 || shot.y < top - 20 || shot.y > bottom + 20) continue;
          const d = Math.hypot(shot.vx, shot.vy) || 1, cos = shot.vx / d, sin = shot.vy / d, sprite = shot.source === 'warden' ? k.item.fireball : k.item.arrow, big = shot.source === 'warden' ? 1.15 : 1.25, halo = shot.r * 2.3;
          world(); c.globalAlpha = 0.7; c.drawImage(k.glow.red, shot.x - halo, shot.y - halo, halo * 2, halo * 2); c.globalAlpha = 1;
          c.setTransform(M * cos * big, M * sin * big, -M * sin * big, M * cos * big, ox + (shot.x + cos * 3) * M, oy + (shot.y + sin * 3) * M); c.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h);
        }
        world();
        // ---- the general's arsenal ----
        for (const beam of s.beams) {
          const azure = beam.width >= 26, sprite = azure ? k.item.beamAzure : k.item.beam, age = 1 - beam.life / 0.24, grow = reduced ? 1 : Math.min(1, 0.35 + age * 4), alpha = Math.min(1, beam.life / 0.1), cos = Math.cos(beam.angle), sin = Math.sin(beam.angle), kx = beam.length / 262 * grow, ky = beam.width / 17 * (0.8 + alpha * 0.2);
          world(); c.globalAlpha = alpha * 0.5; c.globalCompositeOperation = 'lighter'; c.save(); c.translate(beam.x, beam.y); c.rotate(beam.angle); c.drawImage(azure ? k.glow.jade : k.glow.warm, 0, -beam.width * 1.6, beam.length * grow, beam.width * 3.2); c.restore(); c.globalCompositeOperation = 'source-over';
          c.globalAlpha = alpha; c.setTransform(M * cos * kx, M * sin * kx, -M * sin * ky, M * cos * ky, ox + beam.x * M, oy + beam.y * M); c.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h); c.globalAlpha = 1;
        }
        world();
        for (const shot of s.shots) {
          const d = Math.hypot(shot.vx, shot.vy) || 1, cos = shot.vx / d, sin = shot.vy / d, sprite = shot.blast ? k.item.storm : k.item.spear, tail = shot.blast ? 34 : 26, half = shot.blast ? 3.4 : 2.6;
          world(); c.globalAlpha = 0.6; c.fillStyle = shot.blast ? '#9be6ff' : '#fff8e6'; L(c, [shot.x - cos * 6 - sin * half, shot.y - sin * 6 + cos * half, shot.x - cos * 6 + sin * half, shot.y - sin * 6 - cos * half, shot.x - cos * tail, shot.y - sin * tail]); c.fill(); c.globalAlpha = 1;
          if (shot.blast) { c.globalAlpha = 0.7; c.drawImage(k.glow.jade, shot.x - 11, shot.y - 11, 22, 22); c.globalAlpha = 1; }
          const big = shot.blast ? 1.25 : 1.05;
          c.setTransform(M * cos * big, M * sin * big, -M * sin * big, M * cos * big, ox + (shot.x + cos * 4) * M, oy + (shot.y + sin * 4) * M); c.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h);
        }
        world();
        if (s.weapons.blades) {
          const level = s.weapons.blades, count = BLADES.count[level], radius = BLADES.radius[level], haloed = level >= MAX_LEVEL, sprite = haloed ? k.item.halo : k.item.crescent, cy = s.py - 4;
          if (haloed) { c.globalAlpha = 0.3; c.strokeStyle = C.gold; c.lineWidth = 2.4; c.beginPath(); c.arc(s.px, cy, radius, 0, TAU); c.stroke(); c.globalAlpha = 1; }
          if (!reduced) for (let index = 0; index < count; index++) {
            const angle = s.bladeAngle + index / count * TAU;
            c.globalAlpha = 0.3; c.strokeStyle = haloed ? '#ff8a2e' : '#ffffff'; c.lineWidth = 8; c.beginPath(); c.arc(s.px, cy, radius, angle - (haloed ? 0.78 : 0.62), angle - 0.1); c.stroke();
            c.globalAlpha = 0.6; c.strokeStyle = haloed ? '#ffe27a' : '#fff8e6'; c.lineWidth = 3; c.beginPath(); c.arc(s.px, cy, radius, angle - (haloed ? 0.5 : 0.4), angle - 0.1); c.stroke();
          }
          c.globalAlpha = 1;
          for (let index = 0; index < count; index++) {
            const angle = s.bladeAngle + index / count * TAU, turn = angle + Math.PI / 2, cos = Math.cos(turn), sin = Math.sin(turn), big = haloed ? 1.15 : 1;
            c.setTransform(M * cos * big, M * sin * big, -M * sin * big, M * cos * big, ox + (s.px + Math.cos(angle) * radius) * M, oy + (cy + Math.sin(angle) * radius) * M); c.drawImage(sprite.img, sprite.x, sprite.y, sprite.w, sprite.h);
          }
          world();
        }
        // ---- impact effects ----
        for (const pop of pops) {
          const q = 1 - pop.life / pop.max;
          if (pop.kind === 'ring') { c.globalAlpha = (1 - q) * 0.9; c.strokeStyle = '#fff8e6'; c.lineWidth = 3.4 * (1 - q) + 1; c.beginPath(); c.arc(pop.x, pop.y, reduced ? pop.r * 0.8 : pop.r * (0.45 + q * 0.55), 0, TAU); c.stroke(); }
          else {
            const sprite = pop.kind === 'fire' ? k.fx.fire : k.fx.spark, size = reduced ? pop.r * 0.9 : pop.r * (0.55 + q * 0.6);
            c.globalAlpha = Math.min(1, (1 - q) * 1.8); c.drawImage(sprite.img, pop.x - size, pop.y - size, size * 2, size * 2);
            c.globalAlpha = (1 - q) * 0.8; c.strokeStyle = pop.kind === 'fire' ? '#ffe27a' : '#eaf9ff'; c.lineWidth = 3 * (1 - q) + 1; c.beginPath(); c.arc(pop.x, pop.y, pop.r * (0.6 + q * 0.5), 0, TAU); c.stroke();
          }
        }
        c.globalAlpha = 1;
        for (const p of particles) { const q = 1 - p.life / p.max, size = p.size * (1 + p.grow * q), sprite = k.fx[p.spr]; c.globalAlpha = Math.min(1, (1 - q) * 2); c.drawImage(sprite.img, p.x - size, p.y - size, size * 2, size * 2); }
        c.globalAlpha = 1;
        // a second pass keeps the general readable even when the crowd and its dust stand in front of him
        if (!dead && (visible.length || particles.length)) { drawHeroSprite(0.8 * blink); world(); }
        if (s.hp < s.maxHp && s.phase === 'play') { R(c, s.px - 16.4, s.py + 15.6, 32.8, 6.8, 3.4); c.fillStyle = INK; c.fill(); R(c, s.px - 15, s.py + 17, Math.max(2, 30 * Math.max(0, s.hp / s.maxHp)), 4, 2); c.fillStyle = s.hp / s.maxHp < 0.3 ? '#ff5a4f' : '#7cf29a'; c.fill(); }
        screen();
        // ambient motes drift in screen space with a little parallax; positions are a pure function of time
        if (!reduced) {
          const kind = stage.mote;
          for (let i = 0; i < 14; i++) {
            const a = hash(i, 3, 17) / 4294967296, b = hash(i, 5, 29) / 4294967296, drift = 10 + a * 16;
            const x = mod(a * (w + 60) + time * (kind === 'ember' ? 6 : drift) - s.px * scale * 0.35 + Math.sin(time * 1.3 + i) * 12, w + 60) - 30;
            const y = mod(b * (h + 60) + time * (kind === 'ember' ? -26 - b * 16 : 16 + b * 14) - s.py * scale * 0.35, h + 60) - 30;
            if (kind === 'ember') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + Math.sin(time * 6 + i * 2) * 0.3; c.drawImage(k.glow.warm, x - 7, y - 7, 14, 14); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.9; c.fillStyle = '#ffe27a'; E(c, x, y, 1.5, 1.5); c.fill(); }
            else { c.globalAlpha = 0.85; c.fillStyle = kind === 'leaf' ? (i % 2 ? '#7cc95a' : '#5faa48') : kind === 'petal' ? (i % 2 ? '#ffc2d4' : '#ffffff') : (i % 2 ? '#e8533f' : '#f2a03a'); E(c, x, y, 5, 2.2, time * (1.2 + a) + i); c.fill(); }
          }
          c.globalAlpha = 1;
        }
        // vignette, tinted per scene
        const sizeKey = `${w}x${h}`; if (sizeKey !== vignetteSize) { vignettes = {}; vignetteSize = sizeKey; }
        if (!(stage.id in vignettes)) vignettes[stage.id] = vignetteOf(w, h, stage.vignette, stage.shade, 0.56);
        const shade = vignettes[stage.id]; if (shade) c.drawImage(shade, 0, 0, w, h);
        // hurt feedback: a red rim only, never a full-canvas flash
        if (hurt > 0 && !reduced) { if (!('hurt' in vignettes)) vignettes.hurt = vignetteOf(w, h, '#ff3b30', 0.9, 0.7); const rim = vignettes.hurt; if (rim) { c.globalAlpha = Math.min(0.55, hurt * 1.6); c.drawImage(rim, 0, 0, w, h); c.globalAlpha = 1; } }
      }
      screen();
      // floating numbers are drawn in screen space so they stay a readable size on every stage
      for (const t of texts) { const q = t.life / t.max, pop = reduced ? 1 : 1 + Math.max(0, q - 0.72) * 2.2; c.globalAlpha = Math.min(1, q * 2.4); outlined(c, t.text, sx(t.x), sy(t.y), t.size * pop, t.color, 'center', t.edge, 900); }
      c.globalAlpha = 1;
      // off-screen threat pointers
      for (const enemy of s.enemies) {
        if (!enemy.elite && enemy.kind !== 'warden') continue;
        const ex = sx(enemy.x), ey = sy(enemy.y);
        if (ex > 0 && ex < w && ey > 0 && ey < h) continue;
        const angle = Math.atan2(ey - h / 2, ex - w / 2), ax = Math.max(26, Math.min(w - 26, ex)), ay = Math.max(112, Math.min(h - 60, ey)), boss = enemy.kind === 'warden';
        c.save(); c.translate(ax, ay); E(c, 0, 0, 14, 14); c.fillStyle = boss ? C.red : C.gold; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); artIcon(c, boss ? 'helm' : 'swords', 0, 0, 8.4, C.cream);
        c.rotate(angle); L(c, [25, 0, 16, -6.4, 16, 6.4]); c.fillStyle = boss ? C.red : C.gold; c.fill(); c.stroke(); c.restore();
      }
      if (ui.stick) { c.globalAlpha = 0.8; c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.arc(ui.stick.x, ui.stick.y, 44, 0, TAU); c.stroke(); c.strokeStyle = C.cream; c.lineWidth = 3; c.stroke(); E(c, ui.stick.x + ui.stick.dx * 30, ui.stick.y + ui.stick.dy * 30, 17, 17); c.fillStyle = C.gold; c.fill(); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke(); c.globalAlpha = 1; }

      this.hud(c, s, view, ui, hurt);
      if (s.phase === 'levelup') this.cards(c, s, view, ui);
      else if (s.phase === 'dead') this.gameOver(c, s, view, ui);
      else if (ui.paused) { plaque(c, w / 2 - 96, h / 2 - 32, 192, 64, 14, C.wood); c.strokeStyle = INK; c.lineWidth = 2; R(c, w / 2 - 98, h / 2 - 34, 196, 68, 15); c.stroke(); outlined(c, 'PAUSED', w / 2, h / 2 + 1, 26, C.cream); }
    },

    hud(c: Ctx, s: State, view: View, ui: Ui, hurtGlow: number) {
      const { w } = view, pad = inset(ui);
      // lacquered beam across the top
      c.fillStyle = 'rgba(52,26,18,0.9)'; c.fillRect(0, 0, w, 58); c.fillStyle = 'rgba(122,74,44,0.6)'; c.fillRect(0, 0, w, 2); c.fillStyle = C.goldDark; c.fillRect(0, 58, w, 2); c.fillStyle = INK; c.fillRect(0, 60, w, 1.5);
      // HP
      const hpX = pad + 11, hpW = Math.max(70, Math.min(176, w / 2 - 40 - hpX)), ratio = Math.max(0, s.hp / s.maxHp), low = ratio < 0.3;
      meter(c, hpX, 11, hpW, 20, ratio, low ? '#ff3b30' : '#e8473f', low ? '#ff9a8a' : '#ff8273', '#4a1f1c', hurtGlow > 0 ? '#ffffff' : INK);
      artIcon(c, 'vitality', hpX - 3, 20.5, 11.5, C.red);
      outlined(c, `${Math.ceil(s.hp)}/${s.maxHp}`, hpX + hpW / 2 + 4, 21.5, 14, C.cream, 'center', INK, 900);
      // timer plaque and kills
      plaque(c, w / 2 - 30, 7, 60, 28, 9); outlined(c, clock(s.time), w / 2, 21.5, 19, C.cream, 'center', INK, 900);
      c.font = font(15, 900); const koText = String(s.kills), koW = c.measureText(koText).width;
      outlined(c, koText, w - pad, 21.5, 15, C.cream, 'right', INK, 900); artIcon(c, 'swords', w - pad - koW - 14, 21, 10, C.cream);
      if (w >= 620) label(c, `SCORE ${s.score}`, w - pad - koW - 34, 21.5, 14, '#e6c99a', 'right');
      // XP
      const bar = xpBarRect(view, ui);
      outlined(c, `LV ${s.level}`, pad, bar.y + bar.h / 2 + 0.5, 15, C.gold, 'left', INK, 900);
      meter(c, bar.x, bar.y, bar.w, bar.h, s.xp / s.need, C.jade, '#8ff0cf', '#17352e');
      // build chips: weapons first, wrapping to a second row on narrow stages
      const goal = s.boss ? '' : s.won ? 'ENDLESS' : `WARLORD ${clock(Math.max(0, BOSS_TIME - s.time))}`;
      c.font = font(14, 900); const goalW = goal ? c.measureText(goal).width + 38 : 0;
      let x = 10, y = 80, bottom = 96;
      const chips: [string, string, number][] = [];
      for (const id of WEAPON_IDS) if (s.weapons[id]) chips.push([id, WEAPON_CARDS[id].color, s.weapons[id]]);
      for (const id of PASSIVE_IDS) if (s.passives[id]) chips.push([id, PASSIVE_CARDS[id].color, s.passives[id]]);
      for (const [key, color, level] of chips) { if (x + 30 > w - 10 - (y === 80 ? goalW + 6 : 0)) { x = 10; y += 34; bottom = y + 16; } this.chip(c, key, x, y, color, level); x += 33; }
      if (goal) {
        const gx = w - 10 - goalW;
        L(c, [gx, 67, w - 10, 67, w - 10, 93, gx, 93, gx + 7, 80]); c.fillStyle = s.won ? C.goldDark : C.redDark; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
        artIcon(c, s.won ? 'bounty' : 'helm', gx + 21, 80, 8.6, C.cream); label(c, goal, w - 17, 80.5, 14, C.cream, 'right', 900);
      }
      if (s.boss) {
        const bw = Math.min(w - 56, 430), bx = (w - bw) / 2 + 12, by = bottom + 10;
        meter(c, bx, by, bw, 16, s.boss.hp / s.boss.maxHp, '#c92a2a', '#ff6b5a', '#3a1418');
        E(c, bx - 8, by + 8, 15, 15); c.fillStyle = C.redDark; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); artIcon(c, 'helm', bx - 8, by + 8, 10, C.cream);
        outlined(c, 'THE WARLORD', w / 2 + 6, by + 8.5, 14, C.cream, 'center', INK, 900);
        bottom = by + 18;
      }
      if (banner.life > 0) {
        const place = banner.tone === 'place', text = place ? `~ ${banner.text} ~` : banner.text; let size = w < 420 ? 18 : 22;
        c.font = font(size, 900); const measured = c.measureText(text).width; if (measured > w - 40) size = Math.max(14, size * (w - 40) / measured);
        c.font = font(size, 900); const tw = c.measureText(text).width, by = bottom + 26;
        c.globalAlpha = Math.min(1, banner.life * 2, (3.4 - banner.life) * 4);
        L(c, [w / 2 - tw / 2 - 26, by - 16, w / 2 + tw / 2 + 26, by - 16, w / 2 + tw / 2 + 16, by, w / 2 + tw / 2 + 26, by + 16, w / 2 - tw / 2 - 26, by + 16, w / 2 - tw / 2 - 16, by]);
        c.fillStyle = banner.tone === 'warn' ? 'rgba(143,29,29,0.92)' : place ? 'rgba(58,36,24,0.88)' : 'rgba(31,110,86,0.92)'; c.fill(); c.strokeStyle = C.gold; c.lineWidth = 1.6; c.stroke();
        outlined(c, text, w / 2, by + 0.5, size, banner.tone === 'warn' ? '#ffe27a' : C.cream, 'center', INK, 900); c.globalAlpha = 1;
      }
      // burst meter
      if (s.phase === 'play') {
        const { x: bx, y: by, w: bw, h: bh } = burstRect(view, ui), full = s.burst >= s.burstNeed, pulse = full && !reduced ? 0.5 + Math.sin(ui.clock * 8) * 0.5 : 1;
        meter(c, bx + 14, by + 3, bw - 14, bh - 6, s.burst / s.burstNeed, full ? C.gold : '#c9722e', full ? '#fff0a8' : '#e89a52', '#3a2016', full ? `rgba(255,${Math.round(200 + pulse * 55)},${Math.round(120 + pulse * 120)},1)` : INK);
        if (full) { R(c, bx + 10, by - 1, bw - 6, bh + 2, bh / 2 + 1); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); }
        E(c, bx + 14, by + bh / 2, bh / 2 + 3, bh / 2 + 3); c.fillStyle = full ? C.gold : C.wood; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); artIcon(c, 'pulse', bx + 14, by + bh / 2 + 0.5, bh * 0.36, C.cream);
        if (full) label(c, ui.burstLabel, bx + bw / 2 + 12, by + bh / 2 + 0.5, 14, TEXT, 'center', 900); else outlined(c, 'BURST CHARGING', bx + bw / 2 + 12, by + bh / 2 + 0.5, 14, C.cream, 'center', INK, 900);
        if (ui.hint) { c.font = font(14, 800); const hw = c.measureText(ui.hint).width + 28; R(c, (w - hw) / 2, by - 40, hw, 28, 14); c.fillStyle = 'rgba(52,26,18,0.86)'; c.fill(); c.strokeStyle = C.goldDark; c.lineWidth = 1.5; c.stroke(); label(c, ui.hint, w / 2, by - 25.5, 14, C.cream, 'center', 800); }
      }
    },
    chip(c: Ctx, key: string, x: number, y: number, color: string, level: number) {
      const max = level >= MAX_LEVEL;
      R(c, x, y - 15, 30, 32, 7); c.fillStyle = max ? '#fff0b8' : C.parchment; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      if (max) { R(c, x + 1.8, y - 13.2, 26.4, 28.4, 5.4); c.strokeStyle = C.goldDark; c.lineWidth = 1.6; c.stroke(); }
      artIcon(c, key, x + 15, y - 3.6, 9.4, color);
      for (let index = 0; index < MAX_LEVEL; index++) { c.fillStyle = index < level ? (max ? C.goldDark : C.red) : '#c9b48a'; R(c, x + 3.6 + index * 4.7, y + 10, 3.6, 3.4, 1); c.fill(); }
    },

    cards(c: Ctx, s: State, view: View, ui: Ui) {
      const { w, h } = view, rects = cardRects(view, s.choices.length);
      c.fillStyle = 'rgba(34,16,18,0.72)'; c.fillRect(0, 0, w, h);
      const titleY = Math.max(24, rects[0].y - 56), title = `LEVEL ${s.level}`;
      c.font = font(22, 900); const tw = c.measureText(title).width;
      L(c, [w / 2 - tw / 2 - 30, titleY - 17, w / 2 + tw / 2 + 30, titleY - 17, w / 2 + tw / 2 + 19, titleY, w / 2 + tw / 2 + 30, titleY + 17, w / 2 - tw / 2 - 30, titleY + 17, w / 2 - tw / 2 - 19, titleY]); c.fillStyle = C.red; c.fill(); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
      outlined(c, title, w / 2, titleY + 0.5, 22, C.gold, 'center', INK, 900);
      outlined(c, ui.touch ? 'Tap an upgrade' : 'Pick with 1 2 3, or arrows + Enter', w / 2, titleY + 30, 14, C.cream, 'center', INK, 700);
      s.choices.forEach((card: Card, index: number) => {
        const base = rects[index], selected = index === ui.selected, wide = base.h > 130, r = { ...base, y: base.y - (selected && wide ? 5 : 0) };
        const tagFill = card.evolve ? C.red : card.tag.startsWith('NEW') ? C.jadeDark : card.kind === 'bonus' ? C.goldDark : C.brown, tagText = card.evolve ? C.gold : C.cream;
        const medal = (mx: number, my: number, radius: number) => { E(c, mx, my, radius, radius); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); E(c, mx, my, radius - 4, radius - 4); c.strokeStyle = card.evolve ? C.gold : card.color; c.lineWidth = 3; c.stroke(); artIcon(c, card.key, mx, my, radius * 0.56, card.color); };
        const tag = (cx: number, cy: number, align: 'center' | 'right') => { c.font = font(13, 900); const width = c.measureText(card.tag).width + 16, left = align === 'center' ? cx - width / 2 : cx - width; R(c, left, cy - 10, width, 20, 6); c.fillStyle = tagFill; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); label(c, card.tag, left + width / 2, cy + 0.5, 13, tagText, 'center', 900); };
        scroll(c, r.x, r.y, r.w, r.h, wide, selected);
        if (wide) {
          const o = Math.max(0, (r.h - 204) / 2);
          medal(r.x + r.w / 2, r.y + 56 + o, 36);
          label(c, card.name, r.x + r.w / 2, r.y + 112 + o, 19, TEXT, 'center', 900);
          tag(r.x + r.w / 2, r.y + 137 + o, 'center');
          c.font = font(14, 600); wrap(c, card.desc, r.w - 36).slice(0, 3).forEach((line, row) => label(c, line, r.x + r.w / 2, r.y + 164 + o + row * 18, 14, BROWN, 'center', 600));
          c.save(); c.translate(r.x + r.w - 24, r.y + 28); c.rotate(0.1); R(c, -11, -11, 22, 22, 5); c.fillStyle = C.red; c.fill(); c.strokeStyle = C.redDark; c.lineWidth = 1.5; c.stroke(); label(c, String(index + 1), 0, 1, 14, C.cream, 'center', 900); c.restore();
        } else {
          const cy = r.y + r.h / 2, tx = r.x + 80;
          medal(r.x + 44, cy, Math.min(27, r.h / 2 - 7));
          c.font = font(14, 600); const lines = wrap(c, card.desc, r.w - 80 - 22).slice(0, 2), block = 24 + lines.length * 17, y0 = cy - block / 2 + 9;
          label(c, card.name, tx, y0, 17, TEXT, 'left', 900);
          tag(r.x + r.w - 16, y0, 'right');
          lines.forEach((line, row) => label(c, line, tx, y0 + 23 + row * 17, 14, BROWN, 'left', 600));
        }
      });
    },

    gameOver(c: Ctx, s: State, view: View, ui: Ui) {
      const { w, h } = view, pw = Math.min(340, w - 28), ph = Math.min(318, h - 28), px = (w - pw) / 2, py = Math.max(14, (h - ph) / 2);
      c.fillStyle = 'rgba(34,16,18,0.7)'; c.fillRect(0, 0, w, h);
      scroll(c, px, py, pw, ph, true, false);
      seal(c, px + 34, py + 40, 34, s.won ? '勝' : '敗', s.won ? 'helm' : 'swords');
      if (s.won) outlined(c, 'WARLORD SLAYER', w / 2 + 14, py + 38, pw < 320 ? 21 : 24, C.gold, 'center', '#7a1a18', 900); else label(c, 'DEFEATED', w / 2 + 8, py + 38, 27, '#b3262b', 'center', 900);
      label(c, s.won ? `Fell in endless battle to ${ENEMY_NAME[s.killer] ?? 'the horde'}` : `Struck down by ${ENEMY_NAME[s.killer] ?? 'the horde'}`, w / 2, py + 68, 14, BROWN, 'center', 700);
      const rows: [string, string][] = [['Time', clock(s.time)], ['Foes felled', String(s.kills)], ['Level', String(s.level)], ['Score', String(s.score)], ['Best', String(Math.max(ui.best, s.score))]];
      const rowH = Math.min(30, (ph - 160) / rows.length);
      rows.forEach(([name, value], index) => {
        const y = py + 100 + index * rowH;
        c.strokeStyle = 'rgba(115,82,56,0.4)'; c.lineWidth = 1.4; c.setLineDash([2, 5]); c.beginPath(); c.moveTo(px + 30, y + rowH / 2 - 1.5); c.lineTo(px + pw - 30, y + rowH / 2 - 1.5); c.stroke(); c.setLineDash([]);
        label(c, name, px + 30, y, 15, BROWN, 'left', 700); label(c, value, px + pw - 30, y, 17, index === 3 ? '#b3262b' : TEXT, 'right', 900);
      });
      if (ui.newBest) outlined(c, 'NEW BEST!', w / 2, py + ph - 62, 16, C.gold, 'center', '#7a1a18', 900);
      else if (!s.won) label(c, s.time >= BOSS_TIME ? 'The Warlord still holds the field' : `The Warlord arrives at ${clock(BOSS_TIME)}`, w / 2, py + ph - 62, 14, BROWN, 'center', 700);
      c.globalAlpha = ui.locked ? 0.4 : 1;
      R(c, px + 26, py + ph - 47, pw - 52, 32, 16); c.fillStyle = C.red; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); R(c, px + 29, py + ph - 44, pw - 58, 26, 13); c.strokeStyle = C.gold; c.lineWidth = 1.4; c.stroke();
      label(c, ui.retryLabel, w / 2, py + ph - 30.5, 15, C.cream, 'center', 900); c.globalAlpha = 1;
    }
  };
}
export type Renderer = ReturnType<typeof createRenderer>;
