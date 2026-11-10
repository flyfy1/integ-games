/** Fruit Orbit drawing: twilight backdrop, glass jar, HUD, aim guide, effects and the game-over card. */
import { BOUNDS, DANGER_LIMIT, RADII, TIER_COUNT, isOverLine, landingY, type World } from './sim';
import { FRUITS, drawFruit, type Mood } from './fruits';

type C = CanvasRenderingContext2D;
export const W = 360, H = 580;
const TAU = Math.PI * 2;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
const JAR_TOP = 56;

export type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
export type Ring = { x: number; y: number; from: number; to: number; life: number; max: number; color: string };
export type Popup = { x: number; y: number; text: string; life: number; max: number; color: string; size: number; banner?: boolean };
export type Effects = { sparks: Spark[]; rings: Ring[]; popups: Popup[] };

export type View = {
  world: World; fx: Effects;
  heldX: number; best: number; newBest: boolean;
  /** Highest tier this player has ever made; later tiers stay a mystery on the strip. */
  discovered: number;
  /** Seconds since each tier was last made, for the strip pulse. */
  stripPulse: number[];
  time: number; lostFor: number; paused: boolean; hint: boolean; reduced: boolean;
  /** Touch-first device: the hint and retry prompt talk about fingers rather than keys. */
  touch: boolean;
  t(en: string, zh: string): string;
};

export const formatScore = (value: number) => Math.round(value).toLocaleString('en-US');

function label(c: C, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', outline = false) {
  c.font = `800 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'alphabetic';
  if (outline) { c.lineJoin = 'round'; c.lineWidth = Math.max(3, size * 0.22); c.strokeStyle = 'rgba(24,10,40,.85)'; c.strokeText(value, x, y); }
  c.fillStyle = color; c.fillText(value, x, y);
}
function roundRect(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function jarPath(c: C) {
  const { left, right, floor } = BOUNDS, r = 12;
  c.beginPath(); c.moveTo(left - 2, JAR_TOP); c.lineTo(left - 2, floor + 2 - r); c.quadraticCurveTo(left - 2, floor + 2, left - 2 + r, floor + 2);
  c.lineTo(right + 2 - r, floor + 2); c.quadraticCurveTo(right + 2, floor + 2, right + 2, floor + 2 - r); c.lineTo(right + 2, JAR_TOP);
}

/** Static scenery, painted once per pixel scale. */
function paintBackdrop(c: C) {
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#150f33'); sky.addColorStop(0.55, '#26143f'); sky.addColorStop(1, '#3b1b47');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  for (const [x, y, r, color] of [[70, 120, 190, 'rgba(120,90,255,.2)'], [310, 420, 210, 'rgba(255,120,110,.16)'], [180, 600, 200, 'rgba(255,190,90,.1)']] as const) {
    const glow = c.createRadialGradient(x, y, 0, x, y, r); glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
  }
  let seed = 20261110;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 70; i++) { const size = rand() < 0.15 ? 1.5 : 0.9; c.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`; c.beginPath(); c.arc(rand() * W, rand() * H, size, 0, TAU); c.fill(); }
  // Jar interior, then the plinth it stands on.
  const { left, right, floor } = BOUNDS;
  jarPath(c); c.closePath();
  const glass = c.createLinearGradient(0, JAR_TOP, 0, floor); glass.addColorStop(0, 'rgba(20,10,44,.3)'); glass.addColorStop(1, 'rgba(12,6,30,.62)');
  c.fillStyle = glass; c.fill();
  roundRect(c, left - 10, floor + 4, right - left + 20, 7, 3.5); c.fillStyle = '#4b356e'; c.fill();
  roundRect(c, 8, 546, W - 16, 30, 15); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
}

function paintJarFront(c: C) {
  const { left } = BOUNDS;
  c.lineCap = 'round'; c.lineJoin = 'round';
  jarPath(c); c.strokeStyle = 'rgba(255,143,112,.22)'; c.lineWidth = 8; c.stroke();
  jarPath(c); c.strokeStyle = 'rgba(255,236,226,.7)'; c.lineWidth = 2.5; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 3; c.beginPath(); c.moveTo(left + 7, JAR_TOP + 14); c.lineTo(left + 7, 300); c.stroke();
  c.beginPath(); c.moveTo(left + 7, 316); c.lineTo(left + 7, 336); c.stroke();
}

export function createRenderer(c: C, pixelScale: number) {
  let backdrop: HTMLCanvasElement | undefined;
  const scenery = () => {
    if (!backdrop) {
      backdrop = document.createElement('canvas'); backdrop.width = Math.ceil(W * pixelScale); backdrop.height = Math.ceil(H * pixelScale);
      const b = backdrop.getContext('2d')!; b.scale(pixelScale, pixelScale); paintBackdrop(b); paintJarFront(b);
    }
    return backdrop;
  };

  function hud(v: View) {
    const { world } = v;
    label(c, formatScore(world.score), 58, 33, 28, '#ffffff', 'left');
    label(c, `${v.t('BEST', '最高')} ${formatScore(v.best)}`, 58, 49, 14, v.newBest ? '#ffd84a' : '#c4bce6', 'left');
    label(c, v.t('NEXT', '下一个'), 252, 32, 14, '#c4bce6', 'right');
    c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(282, 27, 22, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1.5; c.beginPath(); c.arc(282, 27, 22, 0, TAU); c.stroke();
    const icon = Math.min(15, 8 + world.next * 1.8);
    drawFruit(c, world.next, 282, 28, icon, 0, 'calm', pixelScale);
  }

  function dangerLine(v: View) {
    const { world } = v, { left, right, lineY } = BOUNDS;
    const near = world.bodies.some(b => b.touched && b.y - b.r < lineY + 34);
    const pulse = v.reduced ? 1 : 0.65 + 0.35 * Math.sin(v.time * 12);
    c.save(); c.setLineDash([9, 7]); c.lineCap = 'round';
    c.lineWidth = world.overflowing ? 3 : 2;
    c.strokeStyle = world.overflowing ? `rgba(255,107,122,${pulse})` : world.danger > 0 || near ? 'rgba(255,203,107,.85)' : 'rgba(255,255,255,.3)';
    c.beginPath(); c.moveTo(left + 5, lineY); c.lineTo(right - 5, lineY); c.stroke(); c.restore();
  }

  function dangerBadge(v: View) {
    const { world } = v, { lineY } = BOUNDS;
    if (world.danger > 0 && !world.over) {
      // A draining bar and a countdown say exactly how long is left, so the end never feels sudden.
      const leftover = Math.max(0, 1 - world.danger / DANGER_LIMIT), width = 150;
      roundRect(c, W / 2 - width / 2 - 8, lineY + 8, width + 16, 38, 12); c.fillStyle = 'rgba(30,8,24,.82)'; c.fill();
      c.strokeStyle = world.overflowing ? '#ff6b7a' : '#ffcb6b'; c.lineWidth = 1.5; c.stroke();
      label(c, world.overflowing ? `${v.t('TOO HIGH!', '太高了！')} ${Math.max(0, DANGER_LIMIT - world.danger).toFixed(1)}` : v.t('Phew!', '好险！'), W / 2, lineY + 28, 15, world.overflowing ? '#ffb3bb' : '#ffe2a8');
      roundRect(c, W / 2 - width / 2, lineY + 35, width, 5, 2.5); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
      if (leftover > 0.02) { roundRect(c, W / 2 - width / 2, lineY + 35, width * leftover, 5, 2.5); c.fillStyle = world.overflowing ? '#ff6b7a' : '#ffcb6b'; c.fill(); }
    }
  }

  function moodOf(v: View, b: World['bodies'][number]): Mood {
    const { world } = v;
    if (world.over) return 'dizzy';
    if (b.pop > 0) return 'happy';
    if (isOverLine(b) || (world.danger > 0 && b.y - b.r < BOUNDS.lineY + 46)) return 'worry';
    return (v.time + b.id * 1.37) % 4.3 < 0.13 ? 'blink' : 'calm';
  }

  function fruits(v: View) {
    const { world } = v;
    for (const b of world.bodies) {
      const popT = b.pop > 0 ? b.pop / 0.32 : 0;
      const radius = b.r * (v.reduced ? 1 : 1 + 0.16 * Math.sin(Math.PI * popT) * popT);
      drawFruit(c, b.tier, b.x, b.y, radius, b.angle, moodOf(v, b), pixelScale, RADII[b.tier]);
      if (!world.over && isOverLine(b)) {
        c.strokeStyle = `rgba(255,107,122,${v.reduced ? 0.9 : 0.55 + 0.4 * Math.sin(v.time * 12)})`; c.lineWidth = 3;
        c.beginPath(); c.arc(b.x, b.y, b.r + 2, 0, TAU); c.stroke();
      }
    }
  }

  function held(v: View) {
    const { world } = v;
    if (world.over) return;
    const tier = world.current, r = RADII[tier], x = v.heldX, y = BOUNDS.spawnY;
    const ready = world.cooldown <= 0, appear = v.reduced ? (ready ? 1 : 0) : Math.max(0, 1 - world.cooldown / 0.16);
    const land = landingY(world, x, r);
    c.save(); c.globalAlpha = ready ? 1 : 0.4;
    c.setLineDash([3, 9]); c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(x, y + r + 6); c.lineTo(x, Math.max(y + r + 6, land - r - 3)); c.stroke(); c.setLineDash([]);
    if (land > y + r) { c.fillStyle = 'rgba(255,255,255,.07)'; c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, land, r, 0, TAU); c.fill(); c.stroke(); }
    c.restore();
    if (appear <= 0) return;
    const eased = 1 - (1 - appear) * (1 - appear);
    const halo = c.createRadialGradient(x, y, r * 0.6, x, y, r + 14); halo.addColorStop(0, 'rgba(255,255,255,.22)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, r + 14, 0, TAU); c.fill();
    const bob = v.reduced ? 0 : Math.sin(v.time * 3) * 1.5;
    drawFruit(c, tier, x, y + bob, r * eased, 0, 'calm', pixelScale, r);
  }

  function effects(v: View) {
    const { fx } = v;
    for (const ring of fx.rings) {
      const t = 1 - ring.life / ring.max;
      c.globalAlpha = (1 - t) * 0.85; c.strokeStyle = ring.color; c.lineWidth = 4 * (1 - t) + 1;
      c.beginPath(); c.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * (v.reduced ? 0.6 : 1 - (1 - t) * (1 - t)), 0, TAU); c.stroke();
    }
    for (const s of fx.sparks) { c.globalAlpha = Math.min(1, s.life / s.max * 1.6); c.fillStyle = s.color; c.beginPath(); c.arc(s.x, s.y, s.size * (0.4 + 0.6 * s.life / s.max), 0, TAU); c.fill(); }
    for (const p of fx.popups) {
      const t = 1 - p.life / p.max;
      c.globalAlpha = Math.min(1, p.life / p.max * 2.5);
      const grow = v.reduced ? 1 : 0.7 + 0.3 * Math.min(1, t * 6);
      label(c, p.text, Math.max(46, Math.min(W - 46, p.x)), p.y - (v.reduced ? 0 : t * 26), p.size * grow, p.color, 'center', true);
    }
    c.globalAlpha = 1;
  }

  function strip(v: View) {
    const { world } = v;
    for (let tier = 0; tier < TIER_COUNT; tier++) {
      const x = 26 + tier * 30.8, y = 561, base = 8 + tier * 0.5;
      const pulse = v.reduced ? 0 : Math.max(0, 1 - v.stripPulse[tier] / 0.5);
      if (tier <= Math.max(v.discovered, world.biggest)) drawFruit(c, tier, x, y, base * (1 + pulse * 0.45), 0, null, pixelScale, base);
      else { c.fillStyle = 'rgba(255,255,255,.13)'; c.beginPath(); c.arc(x, y, base, 0, TAU); c.fill(); label(c, '?', x, y + 4.5, 12, 'rgba(255,255,255,.55)'); }
      if (tier === world.biggest) { c.strokeStyle = '#ffd84a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, base + 3.5, 0, TAU); c.stroke(); }
    }
  }

  function hint(v: View) {
    roundRect(c, 46, 236, 268, 76, 16); c.fillStyle = 'rgba(24,10,44,.72)'; c.fill();
    label(c, v.touch ? v.t('Drag to aim, release to drop', '拖动瞄准，松手落下') : v.t('Aim with mouse or ← →', '用鼠标或 ← → 瞄准'), W / 2, 266, 16, '#ffffff');
    label(c, v.touch ? v.t('Two alike merge into a bigger one', '两个相同的水果会合成更大的') : v.t('Click or Space drops · two alike merge', '点击或空格落下 · 相同的会合成'), W / 2, 292, 14.5, '#d6cef2');
  }

  function gameOver(v: View) {
    const { world } = v, show = v.reduced ? 1 : Math.min(1, Math.max(0, (v.lostFor - 0.35) / 0.3));
    if (show <= 0) return;
    c.save(); c.globalAlpha = show;
    jarPath(c); c.closePath(); c.fillStyle = 'rgba(14,6,30,.66)'; c.fill();
    const x = 34, w = W - 68, y = 150 + (1 - show) * 14, h = 286;
    roundRect(c, x, y, w, h, 20); c.fillStyle = '#2a1848'; c.fill(); c.strokeStyle = '#ff8f70'; c.lineWidth = 2.5; c.stroke();
    label(c, v.t('Jar overflow!', '罐子满啦！'), W / 2, y + 38, 24, '#ffb39f');
    label(c, formatScore(world.score), W / 2, y + 86, 42, '#ffffff');
    label(c, v.newBest ? v.t('NEW BEST!', '新纪录！') : `${v.t('Best', '最高')} ${formatScore(v.best)}`, W / 2, y + 110, 16, v.newBest ? '#ffd84a' : '#c4bce6');
    const tier = Math.max(0, world.biggest), fruit = FRUITS[tier];
    roundRect(c, x + 18, y + 126, w - 36, 84, 14); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
    drawFruit(c, tier, x + 62, y + 168, 28, 0, 'happy', pixelScale);
    label(c, v.t('Biggest fruit', '最大的水果'), x + 104, y + 158, 14, '#c4bce6', 'left');
    label(c, v.t(fruit.en, fruit.zh), x + 104, y + 180, 18, '#ffffff', 'left');
    label(c, `${v.t('Best chain', '最高连击')} ×${Math.max(1, world.bestChain)}`, x + 104, y + 199, 14, '#ffd84a', 'left');
    const ready = v.lostFor > 0.8;
    c.globalAlpha = show * (ready ? (v.reduced ? 1 : 0.72 + 0.28 * Math.sin(v.time * 4)) : 0.35);
    roundRect(c, x + 28, y + 228, w - 56, 40, 20); c.fillStyle = '#ff8f70'; c.fill();
    label(c, v.touch ? v.t('Tap to play again', '点击再来一局') : v.t('Click or Space to play again', '点击或按空格再来一局'), W / 2, y + 253.5, 15.5, '#2a1024');
    c.restore();
  }

  return function draw(v: View) {
    c.clearRect(0, 0, W, H);
    c.drawImage(scenery(), 0, 0, W, H);
    dangerLine(v);
    held(v);
    fruits(v);
    dangerBadge(v);
    effects(v);
    hud(v);
    strip(v);
    if (v.hint && !v.world.over) hint(v);
    if (v.world.over) gameOver(v);
    if (v.paused) { roundRect(c, W / 2 - 70, 268, 140, 44, 22); c.fillStyle = 'rgba(24,10,44,.85)'; c.fill(); label(c, v.t('PAUSED', '已暂停'), W / 2, 297, 20, '#ffffff'); }
  };
}
