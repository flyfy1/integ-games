// Ashfall — a cinematic post-apocalyptic side-scrolling action game in vanilla JS + Canvas 2D.
// Fixed 60 Hz simulation, hit-stop and slow-motion on top, one render pass per animation frame.

import { createAudio } from './audio.js';
import { buildArt, LAYER_W, makeCanvas } from './art.js';
import { VIEW_W, VIEW_H, FLOOR, ZONES, ARENA, WORLD_END, zoneIndexAt, buildSolids, PITS, ENEMIES, MEDKITS, CHECKPOINTS, LIGHTS, PROPS, AMBUSHES } from './level.js';
import { drawPlayer, drawEnemy, drawBoss, bladeLocal, MUZZLE } from './sprites.js';

const DT = 1 / 60;
const G = 2050, RUN = 300, JUMP_V = 730, MAX_FALL = 1150;
const ROLL_T = 0.42, ROLL_SPEED = 470, ROLL_IFRAME = [0.03, 0.33];
const MAX_HP = 100, MAG = 4, RELOAD_SHELL = 0.36;
const BUF = { jump: 0.13, attack: 0.28, shoot: 0.16, roll: 0.16, reload: 0.2 };
const SERIF = 'Georgia, "Times New Roman", serif';
const CJK = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "STSong", serif';

// Three-hit combo: anticipation (windup) → strike (active, hitbox live) → follow-through (recover).
const ATTACKS = [
  { windup: 0.11, active: 0.115, recover: 0.26, raise: -2.05, to: 1.0, end: 0.78, dmg: 12, knock: 240, lunge: 120, stop: 0.065, shake: 3, chainAt: 0.45 },
  { windup: 0.095, active: 0.115, recover: 0.27, raise: 1.75, to: -1.9, end: -1.3, dmg: 14, knock: 260, lunge: 140, stop: 0.07, shake: 4, chainAt: 0.45 },
  { windup: 0.22, active: 0.13, recover: 0.38, raise: -2.75, to: 1.4, end: 1.2, dmg: 30, knock: 460, lunge: 360, stop: 0.13, shake: 10, chainAt: 2 }
];
const ENEMY_DEF = {
  husk: { hp: 34, w: 30, h: 60, speed: 88, score: 100 },
  hound: { hp: 24, w: 54, h: 34, speed: 215, score: 120 },
  brute: { hp: 120, w: 52, h: 104, speed: 58, score: 400, poise: 46 },
  drone: { hp: 26, w: 34, h: 34, speed: 170, score: 150 }
};
const BOSS = { armor: 400, hp: 480, w: 140, h: 220 };
const PLATES = [
  { th: 0.82, poly: [[-80, -62], [-58, -112], [-38, -86], [-56, -44]] },
  { th: 0.66, poly: [[-70, -8], [-40, -30], [60, -14], [64, 0], [-66, 0]] },
  { th: 0.5, poly: [[-40, -48], [30, -54], [58, -20], [-50, -10]] },
  { th: 0.34, poly: [[-50, -110], [16, -124], [40, -100], [-10, -88], [-56, -92]] },
  { th: 0.18, poly: [[12, -98], [76, -88], [68, -52], [20, -58]] },
  { th: 0, poly: [[-22, -82], [32, -86], [36, -40], [-18, -38]] }
];

const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function createAshfall(host, services) {
  host.replaceChildren();
  const params = new URLSearchParams(globalThis.location?.search || '');
  const debug = params.has('ashfall-debug');
  const reduced = !!services.isReducedMotion;
  const rand = services.random || Math.random;

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.className = 'ashfall';
  const style = document.createElement('style');
  style.textContent = `.ashfall{position:relative;width:100%;display:flex;flex-direction:column;align-items:center;gap:10px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.ashfall canvas{display:block;width:100%;max-width:min(1280px,calc((100dvh - 24px) * 16 / 9));aspect-ratio:16/9;border-radius:14px;background:#050607;touch-action:none;outline:none;box-shadow:0 18px 60px #0008}
.ashfall-touch{display:none;width:100%;max-width:min(1280px,calc((100dvh - 24px) * 16 / 9));justify-content:space-between;align-items:flex-end;gap:12px;touch-action:none;padding:0 4px}
.ashfall-touch.on{display:flex}
.ashfall-pad{position:relative;width:min(44vw,190px);height:78px;border-radius:40px;border:1px solid #6b5a4a;background:#15110ecc;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#f3e2cf;font-size:20px;touch-action:none}
.ashfall-pad i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;background:#f3e2cf22;border:1px solid #f3e2cf66;transition:transform .05s}
.ashfall-pad.to-l .l,.ashfall-pad.to-r .r{color:#ffb070;text-shadow:0 0 10px #ff8a3a}
.ashfall-actions{display:grid;grid-template-areas:"reload roll fire" ". slash jump";grid-template-columns:40px 64px 72px;gap:8px 10px;align-items:center;justify-items:center}
.ashfall-actions button{width:64px;height:64px;border-radius:50%;border:1px solid #6b5a4a;background:#15110ecc;color:#f3e2cf;font:700 11px Georgia,serif;letter-spacing:.06em;touch-action:none;padding:0}
.ashfall-actions .a-jump,.ashfall-actions .a-slash{width:72px;height:72px;font-size:12px}.ashfall-actions .a-reload{width:40px;height:40px;font-size:16px}
.ashfall-actions .a-slash{border-color:#c98a5a}.ashfall-actions button.held{background:#e08a4a;color:#120a06}
.ashfall-rotate{display:none;margin:0;color:#d9c3ab;font:13px Georgia,serif;letter-spacing:.04em;opacity:.8}
.game-stage:has(>.ashfall){grid-template-columns:minmax(0,1fr)}.ashfall{min-width:0;max-width:100%}.is-immersive .ashfall,:fullscreen .ashfall{height:100%;justify-content:center}
@media (orientation:portrait){.is-immersive .ashfall.is-touch{justify-content:flex-end;padding-top:58px;gap:22px}.is-immersive .ashfall.is-touch .ashfall-rotate{display:block;order:-1;margin-bottom:auto}.is-immersive .ashfall-touch.on{padding-bottom:max(18px,env(safe-area-inset-bottom))}.is-immersive .ashfall-pad{height:96px;width:min(46vw,210px)}.is-immersive .ashfall-actions{grid-template-columns:44px 72px 84px}.is-immersive .ashfall-actions button{width:72px;height:72px}.is-immersive .ashfall-actions .a-jump,.is-immersive .ashfall-actions .a-slash{width:84px;height:84px}.is-immersive .ashfall-actions .a-reload{width:44px;height:44px}}
@media (orientation:landscape) and (max-height:600px){.ashfall canvas{max-width:min(1280px,calc((100dvh - 20px) * 16 / 9));border-radius:6px}.ashfall-touch.on{position:absolute;inset:auto 0 max(6px,env(safe-area-inset-bottom)) 0;margin:auto;max-width:none;padding:0 max(10px,env(safe-area-inset-left)) 0 max(10px,env(safe-area-inset-right));pointer-events:none}.ashfall-touch.on>*{pointer-events:auto}.ashfall.is-touch canvas{max-width:min(calc((100dvh - 20px) * 16 / 9),calc(100vw - 290px))}.ashfall-touch.on{align-items:flex-end;inset:0;padding-bottom:max(16px,env(safe-area-inset-bottom))}.ashfall-pad,.ashfall-actions button{opacity:.8;background:#15110ecc}.ashfall-pad{height:120px;width:122px;padding:0 12px;border-radius:26px}.ashfall-pad i{width:40px;height:40px;margin:-20px}.ashfall-actions{grid-template-areas:"reload fire" "roll jump" "slash jump";grid-template-columns:58px 60px;gap:8px}.ashfall-actions button{width:56px;height:56px}.ashfall-actions .a-jump{width:60px;height:124px;border-radius:30px}.ashfall-actions .a-slash{width:58px;height:58px}.ashfall-actions .a-reload{width:40px;height:40px}.ashfall-actions button.held{opacity:.95}}`;
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W; canvas.height = VIEW_H; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Ashfall game canvas');
  const touch = document.createElement('div'); touch.className = 'ashfall-touch';
  root.append(style, canvas, touch); host.append(root);
  const ctx = canvas.getContext('2d');

  const art = buildArt(7);
  const lightCv = makeCanvas(VIEW_W / 2, VIEW_H / 2), lctx = lightCv.getContext('2d');
  const patterns = art.ground.map((tile) => (ctx.createPattern ? ctx.createPattern(tile, 'repeat') : null));
  const audio = createAudio();

  // ---------- input ----------
  const held = { left: false, right: false, jump: false };
  const buffers = { jump: 0, attack: 0, shoot: 0, roll: 0, reload: 0 };
  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump',
    j: 'attack', J: 'attack', z: 'attack', Z: 'attack', k: 'shoot', K: 'shoot', x: 'shoot', X: 'shoot',
    l: 'roll', L: 'roll', Shift: 'roll', c: 'roll', C: 'roll', r: 'reload', R: 'reload'
  };
  const pressAction = (a, down) => {
    if (a === 'left' || a === 'right' || a === 'jump') held[a] = down;
    if (down && a in buffers) buffers[a] = BUF[a];
    if (down) g.usedActions.add(a);
  };
  const anyStart = () => {
    audio.unlock();
    if (g.mode === 'title' && g.titleT > 0.6) startGame();
    else if (g.mode === 'victory' && g.victoryT > 2.5) { resetGame(); startGame(); }
  };
  const onKeyDown = (e) => {
    if (!root.isConnected || e.target instanceof HTMLInputElement) return;
    if (e.key === 'p' || e.key === 'P') { if (g.mode === 'play') { userPaused = !userPaused; userPaused ? audio.suspend() : audio.resume(); } return; }
    const a = keyMap[e.key];
    if (a || e.key === 'Enter') { e.preventDefault(); }
    if (g.mode !== 'play') { if (a || e.key === 'Enter') anyStart(); return; }
    if (a && !e.repeat) pressAction(a, true);
    audio.unlock();
  };
  const onKeyUp = (e) => { const a = keyMap[e.key]; if (a) pressAction(a, false); };
  const clearInput = () => { held.left = held.right = held.jump = false; touch.querySelectorAll('.held').forEach((b) => b.classList.remove('held')); };
  const onPointer = (e) => {
    canvas.focus(); audio.unlock();
    if (g.mode !== 'play') { anyStart(); return; }
    if (e.pointerType === 'mouse') pressAction(e.button === 2 ? 'shoot' : 'attack', true);
  };
  const listeners = [];
  const listen = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); listeners.push([t, type, fn, opt]); };
  listen(window, 'keydown', onKeyDown); listen(window, 'keyup', onKeyUp); listen(window, 'blur', clearInput);
  listen(canvas, 'pointerdown', onPointer); listen(canvas, 'contextmenu', (e) => e.preventDefault());
  listen(host, 'integ:clear-controls', clearInput);

  // Touch controls: two movement pads on the left, actions on the right.
  const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  if (coarse) {
    touch.classList.add('on');
    root.classList.add('is-touch');
    // Move pad: one thumb slides left/right; the half under the thumb is the held direction.
    const pad = document.createElement('div'); pad.className = 'ashfall-pad'; pad.setAttribute('aria-label', 'Move left or right');
    pad.innerHTML = '<span class="l">◀</span><i></i><span class="r">▶</span>';
    const knob = pad.querySelector('i');
    let padId = null;
    const padMove = (e) => {
      const r = pad.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dir = Math.abs(dx) < 0.16 ? 0 : Math.sign(dx);
      if (held.left !== (dir < 0)) pressAction('left', dir < 0);
      if (held.right !== (dir > 0)) pressAction('right', dir > 0);
      pad.classList.toggle('to-l', dir < 0); pad.classList.toggle('to-r', dir > 0);
      knob.style.transform = `translateX(${clamp(dx, -1, 1) * r.width * 0.32}px)`;
    };
    const padEnd = (e) => { if (e.pointerId !== padId) return; padId = null; pressAction('left', false); pressAction('right', false); pad.classList.remove('to-l', 'to-r'); knob.style.transform = ''; };
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); if (g.mode !== 'play') { anyStart(); return; } padId = e.pointerId; pad.setPointerCapture?.(e.pointerId); padMove(e); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
    pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd); pad.addEventListener('lostpointercapture', padEnd);
    const mk = (label, action, area) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label; btn.setAttribute('aria-label', action); btn.style.gridArea = area; btn.className = `a-${area}`;
      const up = () => { btn.classList.remove('held'); pressAction(action, false); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('held'); audio.unlock(); if (g.mode !== 'play') { anyStart(); return; } pressAction(action, true); navigator.vibrate?.(6); });
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
      return btn;
    };
    const cluster = document.createElement('div'); cluster.className = 'ashfall-actions';
    cluster.append(mk('↻', 'reload', 'reload'), mk('ROLL', 'roll', 'roll'), mk('FIRE', 'shoot', 'fire'), mk('SLASH', 'attack', 'slash'), mk('JUMP', 'jump', 'jump'));
    touch.append(pad, cluster);
    const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'stage-pause'; pause.textContent = 'Ⅱ'; pause.setAttribute('aria-label', 'Pause game');
    pause.addEventListener('click', () => host.dispatchEvent(new CustomEvent('integ:pause-request', { bubbles: true })));
    const rotate = document.createElement('p'); rotate.className = 'ashfall-rotate'; rotate.textContent = '↻  Turn your phone sideways for the full view';
    root.append(pause, rotate);
  }

  // ---------- state ----------
  let g, player, enemies, boss, solids;
  let userPaused = false, shellPaused = false;

  function makeBoss() {
    const R = (() => { let s = 1234; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    return {
      x: ARENA.right - 230, y: FLOOR, face: -1, phase: 1, armor: BOSS.armor, hp: BOSS.hp, state: 'dormant', t: 0, wake: 0, cd: 1,
      attack: null, windup: 1, flash: 0, walkPhase: 0, cannonAngle: 0.15, shakeX: 0, poise: 200, vx: 0, last: null, events: [], staggerReady: 0,
      plates: PLATES.map((p) => {
        const cx = p.poly.reduce((s, q) => s + q[0], 0) / p.poly.length, cy = p.poly.reduce((s, q) => s + q[1], 0) / p.poly.length;
        return { ...p, gone: false, crack: 0, rivets: p.poly.map(([x, y]) => [lerp(x, cx, 0.22), lerp(y, cy, 0.22)]), crackLine: [0, 1, 2, 3].map((i) => { const q = p.poly[i % p.poly.length]; return [lerp(cx, q[0], 0.8) + (R() - 0.5) * 8, lerp(cy, q[1], 0.8) + (R() - 0.5) * 8]; }).flatMap((pt, i) => (i % 2 ? [[cx, cy], pt] : [pt])) };
      })
    };
  }

  function resetGame() {
    solids = buildSolids();
    g = {
      mode: 'title', titleT: 0, time: 0, playT: 0, victoryT: 0, cam: { x: 0, y: 0 }, shake: 0, hitstop: 0, slow: null, flashFx: 0, flashColor: '#fff',
      letterbox: 1, letterTarget: 1, cards: [], hintT: 0, usedActions: new Set(), zoneShown: -1, cpIdx: 0, kills: 0, deaths: 0, score: 0,
      pellets: [], bolts: [], waves: [], markers: [], beams: [], particles: [], popups: [], lights: [], medkits: MEDKITS.map(([x, y]) => ({ x, y, taken: false })),
      arenaLocked: false, gateY: 0, cine: null, deathT: 0, dmgVignette: 0, lastDodge: 0, intensity: 0, stepCue: 0, bot: false, botS: { hold: 0 },
      ash: Array.from({ length: 70 }, () => ({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, z: 0.3 + Math.random() * 0.9, s: Math.random() })),
      usedTouch: coarse, blastId: 0, seenZones: new Set(), ambush: null, ambushDone: new Set(), introSeen: false
    };
    player = {
      x: CHECKPOINTS[0], y: FLOOR, vx: 0, vy: 0, w: 24, h: 62, face: 1, grounded: true, coyote: 0, hp: MAX_HP, hpGhost: MAX_HP, ammo: MAG,
      reloading: false, reloadT: 0, shootT: 9, shootCd: 0, pumpT: -1, rolling: false, rollT: 0, rollK: 0, rollCd: 0, atk: null, swingId: 0,
      bladeAngle: 1.05, trail: [], iframe: 0, flash: 0, hurtT: 0, landT: 0, squash: 1, runPhase: 0, anim: 'idle', dead: false, deadT: 0,
      jumpCut: false, safe: { x: CHECKPOINTS[0], y: FLOOR }, scarf: null, charged: 0, invuln: false
    };
    player.scarf = Array.from({ length: 7 }, (_, i) => ({ x: player.x - i * 5, y: player.y - 48 }));
    enemies = ENEMIES.map(([type, x], i) => spawnEnemy(type, x, i));
    boss = makeBoss();
    g.cam.x = 0;
  }
  function spawnEnemy(type, x, i) {
    const d = ENEMY_DEF[type];
    const y = type === 'drone' ? 300 : surfaceY(x, 380) ?? FLOOR;
    return { type, x, y, home: x, vx: 0, vy: 0, w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, face: -1, state: 'patrol', t: 0, windup: 0.5, cd: 0.6 + (i % 3) * 0.3,
      flash: 0, dead: false, deadT: 0, walkPhase: i, grounded: false, seed: i * 1.7, hover: 0, poise: d.poise || 0, hitBy: -1, aim: null, awake: false, lockT: 0 };
  }
  function surfaceY(x, fromY) {
    let best = null;
    for (const s of solids) if (x >= s.x && x <= s.x + s.w && s.y >= fromY - 4 && (best === null || s.y < best)) best = s.y;
    return best;
  }

  function startGame() {
    g.mode = 'play'; g.playT = 0; g.letterTarget = 0; g.hintT = 0; g.zoneShown = -1;
    audio.unlock(); audio.play('start'); audio.setMode('woods');
  }

  // ---------- effects helpers ----------
  const addShake = (v) => { g.shake = Math.max(g.shake, reduced ? v * 0.3 : v); };
  const hitStop = (t) => { g.hitstop = Math.max(g.hitstop, t); };
  const slowMo = (scale, t) => { g.slow = { scale, t }; };
  const flash = (c, v = 1) => { if (reduced) v *= 0.3; g.flashFx = Math.max(g.flashFx, v); g.flashColor = c; };
  const light = (x, y, r, tint, life, a = 1) => g.lights.push({ x, y, r, tint, life, max: life, a });
  function part(o) { if (g.particles.length < 700) g.particles.push({ vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, size: 2, life: 0.5, ...o, max: o.life ?? 0.5 }); }
  function sparks(x, y, dir, n, color = '#ffd27a', speed = 420) {
    for (let i = 0; i < n; i++) { const a = (dir > 0 ? 0 : Math.PI) + (rand() - 0.5) * 1.6 - 0.25, s = speed * (0.35 + rand()); part({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 900, drag: 2, life: 0.18 + rand() * 0.25, color, size: 1.6 }); }
  }
  function dust(x, y, n, spread = 30, color = '#6a6058') { for (let i = 0; i < n; i++) part({ kind: 'smoke', x: x + (rand() - 0.5) * spread, y: y - rand() * 6, vx: (rand() - 0.5) * 80, vy: -20 - rand() * 40, life: 0.5 + rand() * 0.5, size: 8 + rand() * 10, color, drag: 2 }); }
  function ashBurst(e) {
    const top = e.y - (e.type === 'drone' ? 20 : e.h);
    for (let i = 0; i < 34; i++) part({ kind: rand() < 0.3 ? 'ember' : 'ash', x: e.x + (rand() - 0.5) * e.w, y: top + rand() * e.h, vx: (rand() - 0.5) * 90, vy: -40 - rand() * 90, g: -30, drag: 1.2, life: 0.8 + rand() * 0.9, size: 1.5 + rand() * 2.5, color: rand() < 0.5 ? '#2a2826' : '#4a4038' });
  }
  function popup(x, y, text, color = '#f3dcc0') { g.popups.push({ x, y, text, color, life: 1 }); }
  function card(title, sub, chapter, dur = 4.2) { g.cards = [{ title, sub, chapter, t: 0, dur }]; }

  // ---------- collision ----------
  function rectOf(o, hOverride) { const h = hOverride ?? o.h; return { x: o.x - o.w / 2, y: o.y - h, w: o.w, h }; }
  function bounds(o) {
    if (g.ambush && o === player) return [g.ambush.l + 14, g.ambush.r - 14];
    if (!g.arenaLocked) return [16, WORLD_END - 16];
    return o === player || o.x > ARENA.left ? [ARENA.left + 26, ARENA.right - 26] : [16, ARENA.left - 40];
  }
  function moveBody(o, dt, h = o.h) {
    o.hitWall = 0;
    o.x += o.vx * dt;
    let r = rectOf(o, h);
    for (const s of solids) {
      if (s.oneway || !overlap(r, s)) continue;
      if (o.y - s.y < 8 && o.vy >= 0 && o.grounded) { o.y = s.y; r = rectOf(o, h); continue; } // tiny step-up
      if (o.x < s.x + s.w / 2) o.x = s.x - o.w / 2 - 0.01; else o.x = s.x + s.w + o.w / 2 + 0.01;
      o.hitWall = Math.sign(o.vx) || 1; o.vx = 0; r = rectOf(o, h);
    }
    const [lo, hi] = bounds(o);
    if (o.x < lo) { o.x = lo; o.vx = Math.max(0, o.vx); o.hitWall = -1; } if (o.x > hi) { o.x = hi; o.vx = Math.min(0, o.vx); o.hitWall = 1; }
    const prevY = o.y; o.y += o.vy * dt; const was = o.grounded; o.grounded = false; r = rectOf(o, h);
    for (const s of solids) {
      if (o.x + o.w / 2 <= s.x || o.x - o.w / 2 >= s.x + s.w) continue;
      if (s.oneway) { if (o.vy >= 0 && prevY <= s.y + 2 && o.y >= s.y) { o.y = s.y; o.vy = 0; o.grounded = true; } continue; }
      if (!overlap(r, s)) continue;
      if (o.vy >= 0 && prevY <= s.y + 10) { o.y = s.y; o.vy = 0; o.grounded = true; }
      else if (o.vy < 0) { o.y = s.y + s.h + h; o.vy = 0; }
      r = rectOf(o, h);
    }
    o.justLanded = !was && o.grounded;
  }
  const solidAt = (x, y) => solids.some((s) => !s.oneway && x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h);
  const groundBelow = (x, y, depth = 70) => solids.some((s) => x >= s.x && x <= s.x + s.w && s.y >= y - 6 && s.y <= y + depth);

  // ---------- player ----------
  function hitPlayer(dmg, srcX, knock = 260) {
    const p = player;
    if (p.dead || p.invuln || g.cine || g.mode !== 'play') return false;
    if (p.rolling && p.rollT > ROLL_IFRAME[0] && p.rollT < ROLL_IFRAME[1]) {
      if (g.time - g.lastDodge > 1.2) { g.lastDodge = g.time; slowMo(0.35, 0.22); popup(p.x, p.y - 80, 'EVADED', '#9fd8ff'); audio.play('warn'); }
      return false;
    }
    if (p.iframe > 0) return false;
    p.hp -= dmg; p.iframe = 0.9; p.flash = 0.12; p.hurtT = 0.28; p.atk = null; p.reloading = false;
    p.vx = Math.sign(p.x - srcX || 1) * knock; p.vy = -230; p.grounded = false; p.rolling = false;
    audio.play('hurt'); addShake(8); hitStop(0.075); if (coarse) navigator.vibrate?.(35); g.dmgVignette = 1; flash('#7a0c08', 0.25);
    for (let i = 0; i < 8; i++) part({ kind: 'ichor', x: p.x, y: p.y - 40, vx: (rand() - 0.5) * 220, vy: -rand() * 260, g: 1200, life: 0.6, size: 2.2, color: '#5a1410' });
    if (p.hp <= 0) killPlayer();
    return true;
  }
  function killPlayer() {
    const p = player; p.hp = 0; p.dead = true; p.deadT = 0; g.deaths++; slowMo(0.3, 1.1); audio.play('death'); g.letterTarget = 1;
  }
  function respawn() {
    const p = player, cp = CHECKPOINTS[g.cpIdx];
    Object.assign(p, { x: cp, y: surfaceY(cp, 380) ?? FLOOR, vx: 0, vy: 0, hp: MAX_HP, hpGhost: MAX_HP, ammo: MAG, dead: false, deadT: 0, atk: null, rolling: false, reloading: false, iframe: 1.2, hurtT: 0, invuln: false });
    p.scarf.forEach((pt) => { pt.x = p.x; pt.y = p.y - 48; });
    if (g.ambush) { for (const e of enemies) if (e.ambush && !e.dead) { e.dead = true; e.deadT = 1; } g.ambush = null; }
    g.pellets = []; g.bolts = []; g.waves = []; g.markers = []; g.beams = []; g.letterTarget = 0; g.cam.x = clamp(p.x - VIEW_W * 0.4, 0, WORLD_END - VIEW_W);
    if (g.arenaLocked || boss.state !== 'dormant') {
      const phase2 = boss.phase === 2 && boss.state !== 'dying';
      const fresh = makeBoss();
      if (phase2) { fresh.phase = 2; fresh.armor = 0; fresh.plates.forEach((pl) => (pl.gone = true)); fresh.wake = 1; fresh.hp = Math.max(boss.hp, BOSS.hp * 0.6); }
      boss = fresh; boss.resumePhase2 = phase2; g.arenaLocked = false; g.gateY = 0;
      audio.setMode('foundry');
    }
    enemies.forEach((e) => { if (!e.dead && !e.ambush) { e.x = e.home; e.state = 'patrol'; e.hp = e.maxHp; e.y = e.type === 'drone' ? 300 : surfaceY(e.home, 380) ?? FLOOR; e.vx = 0; } });
  }

  function updatePlayer(dt) {
    const p = player;
    p.iframe -= dt; p.flash -= dt; p.shootT += dt; p.shootCd -= dt; p.rollCd -= dt; p.coyote -= dt; p.hurtT -= dt; p.landT -= dt;
    p.squash = lerp(p.squash, 1, Math.min(1, dt * 14));
    if (p.dead) { p.deadT += dt; p.vx = approach(p.vx, 0, 900 * dt); p.vy += G * dt; moveBody(p, dt); if (p.deadT > 2.4) respawn(); return; }
    const control = !g.cine && p.hurtT <= 0;
    const move = control ? (held.right ? 1 : 0) - (held.left ? 1 : 0) : 0;
    // --- roll ---
    if (control && buffers.roll > 0 && p.grounded && !p.rolling && p.rollCd <= 0 && (!p.atk || p.atk.phase !== 'active')) {
      buffers.roll = 0; p.face = move || p.face; p.rolling = true; p.rollT = 0; p.atk = null; p.reloading = false; audio.play('roll'); dust(p.x, p.y, 4); p.squash = 0.8;
    }
    if (p.rolling) {
      p.rollT += dt; p.rollK = p.rollT / ROLL_T; p.vx = p.face * ROLL_SPEED * (1 - 0.5 * p.rollK);
      if (p.rollT >= ROLL_T) { p.rolling = false; p.rollCd = 0.25; p.vx *= 0.5; }
    } else {
      const lock = p.atk && p.atk.phase !== 'recover';
      const target = lock ? 0 : move * RUN;
      const accel = p.grounded ? (move ? 2600 : 3000) : 1700;
      if (!(p.atk && p.atk.phase === 'active')) p.vx = approach(p.vx, target, accel * dt);
      else p.vx = approach(p.vx, 0, 900 * dt);
      if (move && !p.atk && p.hurtT <= 0) p.face = move;
    }
    // --- jump ---
    if (control && buffers.jump > 0 && (p.grounded || p.coyote > 0) && !p.rolling && (!p.atk || p.atk.phase === 'recover')) {
      buffers.jump = 0; p.vy = -JUMP_V; p.grounded = false; p.coyote = 0; p.jumpCut = false; p.atk = null; p.squash = 1.25;
      audio.play('jump'); dust(p.x, p.y, 4, 20);
    }
    if (!held.jump && p.vy < -250 && !p.jumpCut) { p.vy = -250; p.jumpCut = true; }
    const grav = p.atk && p.atk.phase === 'active' && !p.grounded ? 0.35 : p.vy > 0 ? 1.45 : 1;
    p.vy = Math.min(MAX_FALL, p.vy + G * grav * dt);
    // --- melee ---
    if (control && buffers.attack > 0 && !p.rolling) {
      if (!p.atk) { buffers.attack = 0; startAttack(0); }
      else if (p.atk.phase !== 'windup' && p.atk.step < 2) { p.atk.queued = true; buffers.attack = 0; }
    }
    updateAttack(dt);
    // --- shotgun ---
    if (control && buffers.shoot > 0 && !p.rolling && p.shootCd <= 0 && (!p.atk || p.atk.phase === 'recover')) {
      buffers.shoot = 0;
      if (p.ammo > 0) fire(); else { audio.play('empty'); p.shootCd = 0.25; if (!p.reloading) startReload(); }
    }
    if (p.pumpT >= 0) { p.pumpT -= dt; if (p.pumpT < 0) { audio.play('pump'); part({ kind: 'shell', x: p.x - p.face * 4, y: p.y - 44, vx: -p.face * (90 + rand() * 60), vy: -260, g: 1300, vr: 18, life: 1.2, size: 3, color: '#a03a22' }); } }
    if (control && buffers.reload > 0 && !p.reloading && p.ammo < MAG && !p.rolling) { buffers.reload = 0; startReload(); }
    if (!p.reloading && p.ammo === 0 && p.shootCd <= 0 && !p.rolling) startReload();
    if (p.reloading) {
      if (p.atk || p.rolling) p.reloading = false;
      else { p.reloadT += dt; if (p.reloadT >= RELOAD_SHELL) { p.reloadT = 0; p.ammo++; audio.play('shell'); if (p.ammo >= MAG) { p.reloading = false; audio.play('pump'); } } }
    }
    // --- integrate ---
    const wasAir = !p.grounded, vyBefore = p.vy;
    moveBody(p, dt, p.rolling ? 34 : p.h);
    if (p.grounded) p.coyote = 0.1;
    if (p.justLanded && wasAir) { p.squash = vyBefore > 650 ? 0.72 : 0.86; if (vyBefore > 500) { p.landT = 0.1; audio.play('land'); dust(p.x, p.y, 6, 26); } }
    if (p.grounded && Math.abs(p.vx) > 40 && !p.rolling) {
      const before = Math.sin(p.runPhase); p.runPhase += Math.abs(p.vx) * dt * 0.042; if (Math.sign(Math.sin(p.runPhase)) !== Math.sign(before)) { audio.play('step'); if (rand() < 0.4) dust(p.x - p.face * 6, p.y, 1, 6); }
    }
    if (p.grounded && !p.rolling && groundBelow(p.x - 30, p.y, 8) && groundBelow(p.x + 30, p.y, 8)) p.safe = { x: p.x, y: p.y };
    if (p.y > VIEW_H + 120) {
      p.hp -= 30; g.dmgVignette = 1; audio.play('hurt'); addShake(6);
      if (p.hp <= 0) { p.y = p.safe.y; p.x = p.safe.x; killPlayer(); }
      else { Object.assign(p, { x: p.safe.x, y: p.safe.y, vx: 0, vy: 0, iframe: 1.2, atk: null, rolling: false }); popup(p.x, p.y - 80, '-30', '#ff8a6a'); }
    }
    // --- animation state ---
    p.anim = p.dead ? 'dead' : p.hurtT > 0 ? 'hurt' : !p.grounded ? (p.vy < 0 ? 'jump' : 'fall') : p.landT > 0 ? 'land' : Math.abs(p.vx) > 30 ? 'run' : 'idle';
    if (!p.atk) {
      const rest = p.anim === 'run' ? 0.95 + Math.sin(p.runPhase) * 0.18 : p.anim === 'jump' ? 0.2 : p.anim === 'fall' ? 0.5 : 1.08;
      p.bladeAngle += (rest - p.bladeAngle) * Math.min(1, dt * 12);
    }
    // scarf chain follows the neck with lag
    const anchor = { x: p.x - p.face * 3, y: p.y - (p.rolling ? 22 : 50) };
    let prev = anchor;
    p.scarf.forEach((pt, i) => {
      const speed = Math.min(1, Math.abs(p.vx) / RUN), wave = Math.sin(g.time * (5 + speed * 7) - i * 0.9) * (1 + speed * 2.2) * (i / 6);
      const tx = prev.x - p.face * (2.2 + speed * 3.6) - p.vx * 0.004, ty = prev.y + 3.6 - speed * 2.4 + wave - p.vy * 0.004;
      pt.x += (tx - pt.x) * 0.5; pt.y += (ty - pt.y) * 0.5; prev = pt;
    });
    p.scarf[0].x = anchor.x; p.scarf[0].y = anchor.y;
    p.hpGhost = approach(p.hpGhost, p.hp, (p.hpGhost > p.hp ? 40 : 400) * dt);
    p.trail = p.trail.filter((t) => (t.life -= dt) > 0);
  }

  function startAttack(step) {
    const p = player;
    p.atk = { step, phase: 'windup', t: 0, k: 0, from: p.bladeAngle, id: ++p.swingId, queued: false, swept: ATTACKS[step].raise };
    p.reloading = false;
  }
  function bladeWorld(angle) {
    const p = player, saved = p.bladeAngle; p.bladeAngle = angle;
    const b = bladeLocal(p, g.time); p.bladeAngle = saved;
    const w = (q) => ({ x: p.x + q.x * p.face, y: p.y + q.y * (p.squash || 1) });
    return { hand: w(b.hand), tip: w(b.tip) };
  }
  function updateAttack(dt) {
    const p = player, a = p.atk; if (!a) return;
    const A = ATTACKS[a.step];
    a.t += dt;
    if (a.phase === 'windup') {
      a.k = Math.min(1, a.t / A.windup); p.bladeAngle = lerp(a.from, A.raise, easeOut(a.k));
      if (a.step === 2) p.charged = a.k;
      if (a.t >= A.windup) {
        a.phase = 'active'; a.t = 0; a.k = 0; p.charged = 0;
        audio.play('slash', a.step); p.vx = p.face * A.lunge; if (a.step === 2 && !p.grounded) p.vy = Math.max(p.vy, 200);
      }
    } else if (a.phase === 'active') {
      const prevAngle = p.bladeAngle;
      a.k = Math.min(1, a.t / A.active); p.bladeAngle = lerp(A.raise, A.to, easeInOut(a.k));
      const prevGeo = bladeWorld(prevAngle), geo = bladeWorld(p.bladeAngle);
      p.trail.push({ a: prevGeo, b: geo, life: 0.14, max: 0.14, heavy: a.step === 2 });
      if (a.t > DT * 1.5) { meleeHits(a.swept, p.bladeAngle, a, A); a.swept = p.bladeAngle; }
      if (a.t >= A.active) { a.phase = 'recover'; a.t = 0; a.k = 0; if (a.step === 2 && p.grounded) { const tip = geo.tip; sparks(tip.x, Math.min(tip.y, p.y), p.face, 10, '#ffb36a', 300); dust(tip.x, p.y, 5, 30); addShake(3); } }
    } else {
      a.k = Math.min(1, a.t / A.recover); p.bladeAngle = lerp(A.to, A.end, easeOut(a.k));
      if (a.queued && a.k >= A.chainAt && a.step < 2) { const next = a.step + 1; startAttack(next); return; }
      if (a.t >= A.recover) p.atk = null;
    }
  }
  function meleeHits(a0, a1, atk, A) {
    const p = player, pts = [];
    for (let i = 0; i <= 4; i++) { const geo = bladeWorld(lerp(a0, a1, i / 4)); for (let j = 1; j <= 4; j++) pts.push({ x: lerp(geo.hand.x, geo.tip.x, j / 4), y: lerp(geo.hand.y, geo.tip.y, j / 4) }); }
    const hitPoint = (r) => pts.find((q) => q.x > r.x - 6 && q.x < r.x + r.w + 6 && q.y > r.y - 6 && q.y < r.y + r.h + 6);
    for (const e of enemies) {
      if (e.dead || e.hitBy === atk.id) continue;
      const q = hitPoint(enemyRect(e)); if (!q) continue;
      e.hitBy = atk.id; damageEnemy(e, A.dmg, p.face, A.knock, atk.step === 2 ? 'heavy' : 'melee', q.x, q.y);
      hitStop(A.stop); addShake(A.shake); audio.play('hit', e.type === 'drone' ? 1 : atk.step === 2 ? 2 : 0); p.vx *= 0.25;
    }
    if (boss.state !== 'dormant' && boss.hitBy !== atk.id) {
      const q = hitPoint(bossRect());
      if (q) { p.vx *= 0.25; boss.hitBy = atk.id; damageBoss(A.dmg * (atk.step === 2 ? 1.15 : 1), atk.step === 2 ? 'heavy' : 'melee', q.x, q.y, p.face); hitStop(A.stop * 0.9); addShake(A.shake); audio.play('hit', 1); }
    }
    // Blade parries enemy bolts.
    for (const b of g.bolts) if (!b.dead && pts.some((q) => Math.hypot(q.x - b.x, q.y - b.y) < 16)) { b.dead = true; sparks(b.x, b.y, p.face, 12, '#9fe0ff', 380); audio.play('hit', 1); hitStop(0.05); popup(b.x, b.y - 20, 'PARRY', '#9fe0ff'); }
  }
  function fire() {
    const p = player;
    p.ammo--; p.shootT = 0; p.shootCd = 0.5; p.pumpT = 0.26; p.reloading = false; p.atk = null;
    const mx = p.x + MUZZLE.x * p.face, my = p.y + MUZZLE.y;
    const blast = { id: ++g.blastId, sounded: new Set() };
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 0.4 + (rand() - 0.5) * 0.06, s = 1350 + rand() * 300;
      g.pellets.push({ x: mx, y: my, x0: mx, px: mx, py: my, vx: Math.cos(a) * s * p.face, vy: Math.sin(a) * s, life: 0.2 + rand() * 0.05, blast, hit: new Set() });
    }
    p.vx -= p.face * (p.grounded ? 170 : 240); if (!p.grounded) p.vy = Math.min(p.vy, p.vy - 60);
    audio.play('shot'); addShake(6); hitStop(0.025); flash('#ffcf8a', 0.12);
    light(mx + p.face * 20, my, 360, 'warm', 0.09, 1.4);
    for (let i = 0; i < 10; i++) { const a = (rand() - 0.5) * 0.6; part({ kind: 'spark', x: mx, y: my, vx: Math.cos(a) * 700 * p.face * (0.4 + rand()), vy: Math.sin(a) * 300, drag: 6, life: 0.12 + rand() * 0.1, color: '#ffe2a0', size: 2 }); }
    part({ kind: 'muzzle', x: mx, y: my, life: 0.06, size: 1, face: p.face });
    for (let i = 0; i < 4; i++) part({ kind: 'smoke', x: mx + p.face * i * 8, y: my, vx: p.face * (40 + rand() * 60), vy: -20 - rand() * 30, drag: 2, life: 0.7 + rand() * 0.4, size: 6 + rand() * 6, color: '#8a8078' });
  }
  function startReload() { const p = player; if (p.ammo >= MAG) return; p.reloading = true; p.reloadT = -0.12; audio.play('reloadStart'); }

  // ---------- enemies ----------
  function enemyRect(e) { return e.type === 'drone' ? { x: e.x - 17, y: e.y - 17, w: 34, h: 34 } : { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; }
  function damageEnemy(e, dmg, dir, knock, kind, hx, hy) {
    e.hp -= dmg; e.flash = 0.11;
    let stagger = e.type !== 'brute' || kind === 'heavy';
    if (e.type === 'brute') { e.poise -= dmg; if (e.poise <= 0) { stagger = true; e.poise = ENEMY_DEF.brute.poise; } }
    if (stagger && e.hp > 0) { e.state = 'hurt'; e.t = 0; e.vx = dir * knock * (e.type === 'brute' ? 0.45 : 1); if (e.type !== 'drone' && (kind === 'heavy' || e.type === 'hound')) { e.vy = -220; e.grounded = false; } if (e.type === 'drone') e.vy = -40; }
    else e.vx += dir * knock * 0.15;
    sparks(hx, hy, dir, kind === 'shot' ? 4 : 9, kind === 'heavy' ? '#ffe0a0' : '#ffc070');
    for (let i = 0; i < (kind === 'shot' ? 2 : 6); i++) part({ kind: 'ichor', x: hx, y: hy, vx: dir * (80 + rand() * 260), vy: -rand() * 260, g: 1200, life: 0.5, size: 2 + rand() * 2, color: e.type === 'drone' ? '#3a3a3a' : '#2a0e0c' });
    light(hx, hy, 140, 'warm', 0.08, 0.8);
    if (e.hp <= 0) killEnemy(e, dir);
  }
  function killEnemy(e, dir) {
    e.dead = true; e.deadT = 0; e.state = 'dead'; e.vx = dir * 160; g.kills++;
    const pts = ENEMY_DEF[e.type].score; g.score += pts; popup(e.x, e.y - e.h - 10, `+${pts}`);
    audio.play('kill'); ashBurst(e); hitStop(0.09); addShake(e.type === 'brute' ? 10 : 6); light(e.x, e.y - 30, 260, 'warm', 0.25, 1.2);
    if (e.type === 'drone' || e.type === 'brute') { audio.play('explode'); for (let i = 0; i < 14; i++) part({ kind: 'debris', x: e.x, y: e.y - (e.type === 'drone' ? 0 : 50), vx: (rand() - 0.5) * 420, vy: -150 - rand() * 300, g: 1300, vr: (rand() - 0.5) * 20, life: 2.2, size: 3 + rand() * 4, color: '#2a2422' }); }
    if (player.hp < 70 && rand() < 0.3) g.medkits.push({ x: e.x, y: (surfaceY(e.x, e.y - 20) ?? FLOOR) - 20, taken: false, small: true });
  }
  function enemyAttackHit(e, rect, dmg) { if (overlap(rect, rectOf(player, player.rolling ? 34 : player.h))) hitPlayer(dmg, e.x); }

  function updateEnemies(dt) {
    const p = player;
    let threat = 0;
    for (const e of enemies) {
      if (e.dead) { e.deadT += dt; if (e.type === 'drone') { e.vy += G * 0.5 * dt; e.y += e.vy * dt; } continue; }
      e.awake = Math.abs(e.x - p.x) < 820 && !p.dead;
      if (!e.awake) continue;
      e.t += dt; e.flash -= dt; e.cd -= dt;
      const dx = p.x - e.x, adx = Math.abs(dx), dy = p.y - e.y, sd = Math.sign(dx) || 1;
      if (e.state !== 'patrol' && e.state !== 'hurt') threat++;
      const D = ENEMY_DEF[e.type];
      if (e.type === 'drone') { updateDrone(e, dt, dx, adx, sd); continue; }
      const st = e.state;
      if (st === 'patrol') {
        e.vx = approach(e.vx, e.face * D.speed * 0.35, 400 * dt);
        if (Math.abs(e.x - e.home) > 70) e.face = Math.sign(e.home - e.x) || 1;
        if (adx < (e.type === 'hound' ? 560 : 470) && Math.abs(dy) < 140) { e.state = 'chase'; e.t = 0; }
      } else if (st === 'chase') {
        e.face = sd;
        const reach = { husk: 60, hound: 250, brute: 118 }[e.type];
        e.vx = approach(e.vx, adx > reach * 0.8 ? sd * D.speed : 0, 900 * dt);
        if (adx < reach && Math.abs(dy) < (e.type === 'hound' ? 90 : 60) && e.cd <= 0 && e.grounded && !p.dead) {
          e.state = 'windup'; e.t = 0; e.windup = { husk: 0.5, hound: 0.46, brute: 0.85 }[e.type]; audio.play(e.type === 'brute' ? 'bigWarn' : 'warn');
        }
        if (adx > 900) e.state = 'patrol';
      } else if (st === 'windup') {
        e.vx = approach(e.vx, e.type === 'husk' ? -sd * 20 : 0, 900 * dt);
        if (e.type !== 'brute' && e.t < e.windup * 0.6) e.face = sd;
        if (e.t >= e.windup) {
          e.state = 'active'; e.t = 0;
          if (e.type === 'husk') e.vx = e.face * 170;
          if (e.type === 'hound') { e.vx = e.face * 580; e.vy = -330; e.grounded = false; audio.play('roll'); }
          if (e.type === 'brute') { addShake(10); audio.play('slam'); const x0 = e.x + e.face * 20, x1 = e.x + e.face * 150; dust((x0 + x1) / 2, e.y, 12, 120, '#6a5a4a'); sparks((x0 + x1) / 2, e.y - 4, e.face, 8, '#ffb36a'); enemyAttackHit(e, { x: Math.min(x0, x1), y: e.y - 70, w: 130, h: 70 }, 22); }
        }
      } else if (st === 'active') {
        if (e.type === 'husk') { if (e.t < 0.14) enemyAttackHit(e, { x: e.face > 0 ? e.x : e.x - 62, y: e.y - 58, w: 62, h: 46 }, 12); if (e.t > 0.14) { e.state = 'recover'; e.t = 0; } }
        else if (e.type === 'hound') { enemyAttackHit(e, enemyRect(e), 11); if (e.grounded && e.t > 0.1) { e.state = 'recover'; e.t = 0; } }
        else if (e.type === 'brute') { if (e.t > 0.1) { e.state = 'recover'; e.t = 0; } }
        e.vx = approach(e.vx, 0, (e.type === 'hound' ? 200 : 900) * dt);
      } else if (st === 'recover') {
        e.vx = approach(e.vx, 0, 1200 * dt);
        if (e.t > { husk: 0.6, hound: 0.7, brute: 1.1 }[e.type]) { e.state = 'chase'; e.t = 0; e.cd = 0.4 + rand() * 0.7; }
      } else if (st === 'hurt') {
        e.vx = approach(e.vx, 0, 1100 * dt);
        if (e.t > (e.type === 'brute' ? 0.5 : 0.34) && e.grounded) { e.state = 'chase'; e.t = 0; e.cd = Math.max(e.cd, 0.25); }
      }
      // ledge guard: walkers never step off into pits on their own
      if (e.grounded && (e.state === 'chase' || e.state === 'patrol') && !groundBelow(e.x + Math.sign(e.vx) * (e.w / 2 + 6), e.y, 30)) { e.vx = 0; if (e.state === 'patrol') e.face *= -1; }
      e.vy = Math.min(MAX_FALL, e.vy + G * dt);
      moveBody(e, dt);
      if (Math.abs(e.vx) > 10 && e.grounded) e.walkPhase += Math.abs(e.vx) * dt * 0.05;
      if (e.y > VIEW_H + 150) { e.dead = true; e.deadT = 1; g.kills++; g.score += D.score; }
    }
    return threat;
  }
  function updateDrone(e, dt, dx, adx, sd) {
    const p = player;
    const tx = p.x - sd * 250, ty = clamp(p.y - 165, 120, 360);
    if (e.state === 'patrol') { e.y = 300 + Math.sin(g.time + e.seed) * 10; if (adx < 520) { e.state = 'chase'; e.t = 0; } return; }
    if (e.state === 'hurt') { e.vx = approach(e.vx, 0, 700 * dt); e.vy = approach(e.vy, 0, 500 * dt); if (e.t > 0.35) { e.state = 'chase'; e.t = 0; } }
    else if (e.state === 'chase') {
      e.face = sd; e.vx = approach(e.vx, clamp((tx - e.x) * 2, -170, 170), 500 * dt); e.vy = approach(e.vy, clamp((ty - e.y) * 2, -150, 150), 500 * dt);
      if (adx < 470 && e.cd <= 0) { e.state = 'windup'; e.t = 0; e.windup = 0.9; e.lockT = 0.62; e.aim = { x: p.x, y: p.y - 34 }; audio.play('warn'); }
    } else if (e.state === 'windup') {
      e.vx = approach(e.vx, 0, 400 * dt); e.vy = approach(e.vy, 0, 400 * dt); e.face = sd;
      if (e.t < e.lockT) e.aim = { x: p.x, y: p.y - 34 };
      if (e.t >= e.windup) {
        const a = Math.atan2(e.aim.y - e.y, e.aim.x - e.x);
        g.bolts.push({ x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 2, dmg: 10, r: 6, color: 'red' });
        audio.play('bolt'); light(e.x, e.y, 160, 'red', 0.1, 1); e.state = 'recover'; e.t = 0; e.vx = -Math.cos(a) * 120;
      }
    } else if (e.state === 'recover') { e.vx = approach(e.vx, 0, 300 * dt); if (e.t > 1.1) { e.state = 'chase'; e.t = 0; e.cd = 0.3 + rand() * 0.8; } }
    e.x += e.vx * dt; e.y += e.vy * dt;
  }

  // ---------- boss ----------
  function bossRect() { return { x: boss.x - BOSS.w / 2, y: boss.y - BOSS.h, w: BOSS.w, h: BOSS.h }; }
  function damageBoss(dmg, kind, hx, hy, dir) {
    const b = boss;
    sparks(hx, hy, dir, kind === 'shot' ? 3 : 12, '#ffe6a0', 480); light(hx, hy, 160, 'warm', 0.08, 1);
    if (b.state === 'transform' || b.state === 'dying' || b.state === 'dormant' || b.state === 'intro') return;
    b.flash = 0.1;
    if (b.phase === 1) {
      b.armor -= dmg * (kind === 'shot' ? 0.7 : 1);
      const frac = b.armor / BOSS.armor;
      b.plates.forEach((pl, i) => {
        if (pl.gone) return;
        pl.crack = clamp((pl.th + 0.16 - frac) / 0.16, 0, 1);
        if (frac <= pl.th && i < b.plates.length - 1) popPlate(pl);
      });
      if (b.armor <= 0) { startTransform(); return; }
    } else {
      b.hp -= dmg;
      if (b.hp <= 0) { startDying(); return; }
    }
    b.poise -= dmg;
    if (b.poise <= 0 && g.playT >= b.staggerReady && !(b.attack === 'charge' && b.state === 'active')) { b.state = 'stagger'; b.t = 0; b.attack = null; b.poise = b.phase === 1 ? 200 : 260; b.staggerReady = g.playT + 6; audio.play('plate'); popup(b.x, b.y - 240, 'STAGGERED', '#ffcf8a'); }
  }
  function popPlate(pl) {
    const b = boss; pl.gone = true;
    const ty = b.y - 112 + 0 - 30;
    const cx = pl.poly.reduce((s, q) => s + q[0], 0) / pl.poly.length, cy = pl.poly.reduce((s, q) => s + q[1], 0) / pl.poly.length;
    const wx = b.x + cx * b.face, wy = ty + cy;
    part({ kind: 'plate', x: wx, y: wy, vx: (rand() - 0.3) * 300 * -b.face, vy: -380 - rand() * 200, g: 1400, vr: (rand() - 0.5) * 12, life: 4, size: 1, poly: pl.poly.map(([x, y]) => [(x - cx) * b.face, y - cy]) });
    sparks(wx, wy, -b.face, 16, '#ffd08a', 520); audio.play('plate'); addShake(5); hitStop(0.06); light(wx, wy, 220, 'warm', 0.18, 1.2);
  }
  function bossMuzzle() { const b = boss, hip = -112, ca = b.cannonAngle; return { x: b.x + b.face * (-40 + Math.cos(ca) * 88), y: b.y + hip - 70 + Math.sin(ca) * 88 }; }
  function chooseAttack() {
    const b = boss, p = player, adx = Math.abs(p.x - b.x);
    b.face = Math.sign(p.x - b.x) || b.face;
    const w = { slam: adx < 270 ? 5 : 0.6, barrage: adx > 200 ? 3 : 1, charge: adx > 300 ? 3 : 0.8, walk: adx > 280 ? 2 : 0 };
    if (b.phase === 2) { w.missiles = 2.6; w.beam = 2.6; }
    if (b.last && w[b.last]) w[b.last] *= 0.25;
    let total = 0; for (const k in w) total += w[k];
    let r = rand() * total, pick = 'slam'; for (const k in w) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    if (b.next) { pick = b.next; b.next = null; }
    if (pick === 'walk') { b.state = 'walk'; b.t = 0; return; }
    if (b.phase === 2 && rand() < 0.3) b.next = { slam: 'charge', beam: 'missiles' }[pick] || null;
    const f = b.phase === 2 ? 0.92 : 1.12;
    b.attack = pick; b.last = pick; b.state = 'windup'; b.t = 0;
    b.windup = { slam: 0.95, barrage: 0.85, charge: 1.05, missiles: 0.7, beam: 1.15 }[pick] * f;
    if (pick === 'slam') { b.slamX = clamp(b.x + b.face * 72, ARENA.left + 40, ARENA.right - 40); audio.play('bigWarn'); }
    if (pick === 'charge') { audio.play('bigWarn'); }
    if (pick === 'barrage') audio.play('warn');
    if (pick === 'beam') { b.beamHigh = b.lastBeamHigh === undefined ? rand() < 0.5 : !b.lastBeamHigh; b.lastBeamHigh = b.beamHigh; audio.play('laserCharge'); }
    if (pick === 'missiles') audio.play('bigWarn');
  }
  function startTransform() {
    const b = boss; b.state = 'transform'; b.t = 0; b.attack = null; b.armor = 0; b.events = [];
    slowMo(0.25, 0.7); flash('#ffffff', 0.9); audio.play('armorBreak'); addShake(14); hitStop(0.15);
    g.letterTarget = 1; player.invuln = true; g.bolts = []; g.waves = []; g.markers = []; g.beams = [];
    g.cine = { kind: 'transform', t: 0 };
  }
  function startDying() {
    const b = boss; b.state = 'dying'; b.t = 0; b.attack = null; b.hp = 0; b.nextBoom = 0;
    slowMo(0.3, 1.6); flash('#ffffff', 1); audio.play('explode'); audio.play('armorBreak'); addShake(16); hitStop(0.2);
    g.letterTarget = 1; player.invuln = true; g.bolts = []; g.waves = []; g.markers = []; g.beams = []; g.score += 5000;
    g.cine = { kind: 'dying', t: 0 }; audio.setMode('victory');
  }
  function explosion(x, y, big = 1) {
    audio.play('explode'); addShake(6 * big); light(x, y, 300 * big, 'warm', 0.3, 1.5);
    for (let i = 0; i < 16 * big; i++) { const a = rand() * 6.28, s = 100 + rand() * 380 * big; part({ kind: 'ember', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, g: 200, life: 0.4 + rand() * 0.6, size: 2 + rand() * 3 }); }
    for (let i = 0; i < 6 * big; i++) part({ kind: 'smoke', x: x + (rand() - 0.5) * 40, y: y + (rand() - 0.5) * 40, vx: (rand() - 0.5) * 120, vy: -40 - rand() * 80, drag: 1.5, life: 1 + rand() * 0.8, size: 14 + rand() * 16 * big, color: '#3a302c' });
    part({ kind: 'flare', x, y, life: 0.18, size: 90 * big });
  }

  function updateBoss(dt) {
    const b = boss, p = player;
    if (b.state === 'dormant') {
      if (!g.arenaLocked && p.x > ARENA.trigger && !p.dead) startBossIntro();
      return;
    }
    b.t += dt; b.flash -= dt; b.shakeX = b.state === 'windup' && b.attack === 'charge' ? (rand() - 0.5) * 4 : 0;
    const dx = p.x - b.x, adx = Math.abs(dx), sd = Math.sign(dx) || 1;
    for (const ev of b.events) { ev.t -= dt; if (ev.t <= 0 && !ev.done) { ev.done = true; ev.fn(); } }
    b.events = b.events.filter((ev) => !ev.done);
    switch (b.state) {
      case 'intro': break;
      case 'idle':
        b.cd -= dt; if (adx > 40) b.face = sd;
        if (b.cd <= 0) chooseAttack();
        break;
      case 'walk':
        { const goal = b.retreat ? (ARENA.left + ARENA.right) / 2 : p.x, gd = Math.sign(goal - b.x) || 1; b.face = b.retreat ? gd : sd; b.x += gd * (b.phase === 2 ? 130 : 95) * dt; b.walkPhase += dt * 5;
          if (b.retreat && (Math.abs(goal - b.x) < 60 || b.t > 1.2)) { b.retreat = false; b.state = 'idle'; b.cd = 0.2; break; } }
        if (Math.floor(b.walkPhase / Math.PI) !== Math.floor((b.walkPhase - dt * 5) / Math.PI)) { addShake(2); audio.play('land'); dust(b.x + b.face * 20, b.y, 3, 40); }
        if (!b.retreat && (adx < 230 || b.t > 1.5)) chooseAttack();
        break;
      case 'windup': {
        const k = b.t / b.windup;
        if (b.attack === 'barrage' && k < 0.72) { b.aim = { x: p.x, y: p.y - 34 }; const sx = b.x - b.face * 40, sy = b.y - 182; b.cannonAngle = lerp(b.cannonAngle, clamp(Math.atan2(p.y - 36 - sy, Math.max(40, (p.x - sx) * b.face)), -0.6, 0.9), 0.2); }
        if (b.attack === 'charge') b.x -= b.face * 30 * dt;
        if (b.t >= b.windup) { b.state = 'active'; b.t = 0; bossActiveStart(); }
        break;
      }
      case 'active': bossActive(dt); break;
      case 'recover': if (b.t >= b.recover) { b.state = 'idle'; b.cd = b.next ? 0.15 : b.phase === 2 ? 0.45 : 0.75; b.attack = null; b.cannonAngle = lerp(b.cannonAngle, 0.15, 0.1); } break;
      case 'stunned': if (b.t >= (b.phase === 2 ? 1.1 : 1.5)) { b.state = 'walk'; b.t = 0; b.retreat = true; b.attack = null; } break;
      case 'stagger': if (b.t >= 1.1) { b.state = 'idle'; b.cd = 0.2; } break;
      case 'transform': updateTransform(dt); break;
      case 'dying': updateDying(dt); break;
    }
    b.x = clamp(b.x, ARENA.left + 150, ARENA.right - 150);
    // Keep the player from standing inside the machine.
    const br = { x: b.x - 58, y: b.y - 190, w: 116, h: 190 };
    if (!p.dead && b.state !== 'dying' && overlap(br, rectOf(p, p.rolling ? 34 : p.h)) && !(b.attack === 'charge' && b.state === 'active')) {
      if (!p.rolling) p.x = p.x < b.x ? br.x - p.w / 2 : br.x + br.w + p.w / 2;
    }
    // hazards
    for (const w of g.waves) {
      w.x += w.dir * w.speed * dt; w.life -= dt;
      if (w.x < ARENA.left + 20 || w.x > ARENA.right - 20) w.life = 0;
      if (Math.abs(p.x - w.x) < 22 && p.y > FLOOR - 40) hitPlayer(11, w.x - w.dir * 10);
      if (rand() < 0.5) part({ kind: 'ember', x: w.x, y: FLOOR - rand() * 20, vx: (rand() - 0.5) * 60, vy: -rand() * 160, life: 0.4, size: 2 });
    }
    g.waves = g.waves.filter((w) => w.life > 0);
    for (const m of g.markers) {
      m.t += dt;
      if (m.t >= m.dur && !m.done) { m.done = true; explosion(m.x, FLOOR - 20, 1); if (Math.abs(p.x - m.x) < 62 && p.y > FLOOR - 120) hitPlayer(13, m.x); }
    }
    g.markers = g.markers.filter((m) => !m.done || m.t < m.dur + 0.1);
    for (const bm of g.beams) {
      bm.t += dt;
      if (bm.t < bm.dur && rand() < 0.6) sparks(bm.x1 - Math.sign(bm.x1 - bm.x0) * 10, bm.y, -Math.sign(bm.x1 - bm.x0), 2, '#ff8a6a', 300);
      if (bm.t < bm.dur) { const r = { x: Math.min(bm.x0, bm.x1), y: bm.y - bm.th / 2, w: Math.abs(bm.x1 - bm.x0), h: bm.th }; if (overlap(r, rectOf(p, p.rolling ? 34 : p.h))) hitPlayer(15, b.x); }
    }
    g.beams = g.beams.filter((bm) => bm.t < bm.dur + 0.25);
  }
  function startBossIntro() {
    g.arenaLocked = true; boss.state = 'intro'; boss.t = 0; g.letterTarget = 1; g.cine = { kind: 'bossIntro', t: 0 };
    audio.play('gate'); player.vx = 0;
    // Stragglers caught inside the arena crumble to ash as the gate falls.
    for (const e of enemies) if (!e.dead && e.x > ARENA.left - 20) { e.dead = true; e.deadT = 0; ashBurst(e); }
    if (boss.resumePhase2) { boss.phase = 2; g.medkits.push({ x: (ARENA.left + ARENA.right) / 2, y: FLOOR - 20, taken: false }); }
  }
  function bossActiveStart() {
    const b = boss, p = player;
    const f = b.phase === 2;
    if (b.attack === 'slam') {
      audio.play('slam'); addShake(15); flash('#ff9a4a', 0.15); light(b.slamX, FLOOR - 20, 420, 'warm', 0.3, 1.5);
      dust(b.slamX, FLOOR, 18, 160, '#5a4a40'); sparks(b.slamX, FLOOR - 4, -1, 10, '#ffb36a', 500); sparks(b.slamX, FLOOR - 4, 1, 10, '#ffb36a', 500);
      if (Math.abs(p.x - b.slamX) < 95 && p.y > FLOOR - 120) hitPlayer(18, b.slamX, 380);
      const waves = () => { [-1, 1].forEach((dir) => g.waves.push({ x: b.slamX + dir * 60, dir, speed: f ? 480 : 420, life: 3 })); };
      waves(); if (f) b.events.push({ t: 0.45, fn: () => { if (b.state !== 'dying' && b.state !== 'transform') { waves(); audio.play('slam'); addShake(6); } } });
      b.recover = f ? 0.7 : 0.95;
    } else if (b.attack === 'barrage') {
      const volley = () => {
        const m = bossMuzzle(), aim = b.aim || { x: p.x, y: p.y - 34 }, base = Math.atan2(aim.y - m.y, aim.x - m.x);
        const n = f ? 5 : 3;
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.13; g.bolts.push({ x: m.x, y: m.y, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, life: 2.4, dmg: 10, r: 9, color: 'warm' }); }
        audio.play('bolt'); audio.play('shot'); light(m.x, m.y, 260, 'warm', 0.12, 1.2); addShake(4);
      };
      volley(); if (f) b.events.push({ t: 0.35, fn: () => { if (b.state === 'active' || b.state === 'recover') volley(); } });
      b.recover = f ? 0.75 : 0.8;
    } else if (b.attack === 'charge') {
      b.vx = b.face * (f ? 940 : 820); audio.play('roar');
    } else if (b.attack === 'missiles') {
      audio.play('missile');
      const offsets = f ? [-200, -100, 0, 100, 200] : [-120, 0, 120];
      offsets.forEach((o, i) => {
        const x = clamp(p.x + o + (rand() - 0.5) * 30, ARENA.left + 40, ARENA.right - 40);
        g.markers.push({ x, t: -i * 0.12, dur: 1.15 });
        part({ kind: 'missile', x: b.x - b.face * 30, y: b.y - 230, vx: (rand() - 0.5) * 120, vy: -900, life: 0.5, size: 3 });
      });
      b.recover = 1.4;
    } else if (b.attack === 'beam') {
      audio.play('laser'); addShake(5);
      const y = FLOOR - (b.beamHigh ? 52 : 15);
      g.beams.push({ x0: b.x + b.face * 70, x1: b.face > 0 ? ARENA.right : ARENA.left, y, th: b.beamHigh ? 14 : 18, t: 0, dur: 0.36 });
      b.recover = 0.8;
    }
    if (b.attack !== 'charge') { b.state = 'recover'; b.t = 0; }
  }
  function bossActive(dt) {
    const b = boss, p = player;
    if (b.attack === 'charge') {
      b.x += b.vx * dt; b.walkPhase += dt * 14;
      if (rand() < 0.7) dust(b.x - b.face * 40, b.y, 1, 30);
      const r = { x: b.x - 70, y: b.y - 200, w: 140, h: 200 };
      if (overlap(r, rectOf(p, p.rolling ? 34 : p.h))) hitPlayer(18, b.x, 520);
      const wall = b.face > 0 ? ARENA.right - 150 : ARENA.left + 150;
      if ((b.face > 0 && b.x >= wall) || (b.face < 0 && b.x <= wall)) {
        b.x = wall; b.state = 'stunned'; b.t = 0; b.vx = 0; audio.play('slam'); addShake(14); flash('#ff9a4a', 0.12);
        sparks(b.x + b.face * 70, b.y - 100, -b.face, 24, '#ffd08a', 600); dust(b.x + b.face * 60, b.y, 10, 60);
        for (let i = 0; i < 8; i++) part({ kind: 'debris', x: b.x + b.face * 80, y: b.y - 150 - rand() * 100, vx: -b.face * rand() * 200, vy: rand() * 100, g: 1300, vr: (rand() - 0.5) * 20, life: 2, size: 3 + rand() * 5, color: '#2a2220' });
      }
    }
  }
  function updateTransform() {
    const b = boss, t = b.t, c = g.cine;
    const remaining = b.plates.filter((pl) => !pl.gone);
    if (t > 0.5 && remaining.length && (!c.nextPop || t >= c.nextPop)) { popPlate(remaining[(rand() * remaining.length) | 0]); explosion(b.x + (rand() - 0.5) * 120, b.y - 100 - rand() * 100, 0.7); c.nextPop = t + 0.22; }
    if (t > 1.9 && !c.roared) {
      c.roared = true; audio.play('roar'); addShake(18); flash('#ff7a32', 0.35); audio.setMode('boss2');
      part({ kind: 'ring', x: b.x, y: b.y - 120, life: 0.8, size: 20 });
      const p = player; if (Math.abs(p.x - b.x) < 280) { p.vx = Math.sign(p.x - b.x || -1) * 600; p.vy = -260; p.grounded = false; }
    }
    if (t > 2.2 && !c.carded) { c.carded = true; card('WARDEN · UNBOUND', '核 心 暴 露', '', 2.2); }
    if (t > 3.3) {
      b.phase = 2; b.state = 'idle'; b.cd = 1.4; b.poise = 260; g.letterTarget = 0; player.invuln = false; g.cine = null;
      g.medkits.push({ x: clamp(b.x - b.face * 260, ARENA.left + 60, ARENA.right - 60), y: FLOOR - 20, taken: false });
    }
  }
  function updateDying() {
    const b = boss, t = b.t;
    if (t < 2.4 && t >= (b.nextBoom || 0)) { b.nextBoom = t + 0.17; explosion(b.x + (rand() - 0.5) * 150, b.y - 30 - rand() * 190, 0.8); }
    if (t > 2.4 && !b.bigBoom) { b.bigBoom = true; explosion(b.x, b.y - 120, 2.4); flash('#ffffff', 1); audio.play('slam'); addShake(20); }
    if (t > 4.2 && g.mode === 'play') {
      g.mode = 'victory'; g.victoryT = 0; g.cine = null;
      const timeBonus = Math.max(0, Math.round(4000 - g.playT * 8));
      g.timeBonus = timeBonus; g.score = Math.max(0, g.score + timeBonus - g.deaths * 250);
      const best = services.storage?.get('ashfall-best', 0) ?? 0; g.best = Math.max(best, g.score); services.storage?.set('ashfall-best', g.best);
      services.reportScore?.(g.score); services.reportComplete?.(1); services.sound?.play?.('success');
    }
  }

  // ---------- projectiles ----------
  // Pellets hit hardest point-blank: 8 damage falling to 3 by ~300 px.
  const pelletDmg = (s) => Math.max(3, 8 - 5 * Math.abs(s.x - s.x0) / 300);
  function updateProjectiles(dt) {
    const p = player;
    for (const s of g.pellets) {
      s.px = s.x; s.py = s.y;
      for (let k = 0; k < 2 && s.life > 0; k++) {
        s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
        if (solidAt(s.x, s.y)) { s.life = 0; sparks(s.x, s.y, -Math.sign(s.vx), 3, '#ffd08a', 200); break; }
        for (const e of enemies) {
          if (e.dead || s.hit.has(e)) continue;
          const r = enemyRect(e);
          if (s.x > r.x && s.x < r.x + r.w && s.y > r.y && s.y < r.y + r.h) {
            s.hit.add(e); s.life = 0; damageEnemy(e, pelletDmg(s), Math.sign(s.vx), e.type === 'brute' ? 60 : 120, 'shot', s.x, s.y);
            if (e.dead) hitStop(0.06); else hitStop(0.02);
            if (!s.blast.sounded.has(e)) { s.blast.sounded.add(e); audio.play('hit', e.type === 'drone' ? 1 : 0); } break;
          }
        }
        if (s.life > 0 && boss.state !== 'dormant' && boss.state !== 'intro') {
          const r = bossRect(); if (s.x > r.x && s.x < r.x + r.w && s.y > r.y && s.y < r.y + r.h) { s.life = 0; damageBoss(pelletDmg(s), 'shot', s.x, s.y, Math.sign(s.vx)); if (!s.blast.sounded.has(boss)) { s.blast.sounded.add(boss); audio.play('hit', 1); } }
        }
      }
      s.life -= dt;
    }
    g.pellets = g.pellets.filter((s) => s.life > 0);
    for (const b of g.bolts) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (solidAt(b.x, b.y)) { b.dead = true; sparks(b.x, b.y, -Math.sign(b.vx), 6, '#ff8a5a', 200); }
      const r = rectOf(p, p.rolling ? 34 : p.h);
      if (!b.dead && b.x > r.x - b.r && b.x < r.x + r.w + b.r && b.y > r.y - b.r && b.y < r.y + r.h + b.r) { if (hitPlayer(b.dmg, b.x - b.vx * 0.01)) b.dead = true; }
      if (rand() < 0.5) part({ kind: 'ember', x: b.x, y: b.y, vx: -b.vx * 0.05, vy: -b.vy * 0.05, life: 0.25, size: 1.6, color: b.color === 'red' ? '#ff5a3a' : '#ffa050' });
    }
    g.bolts = g.bolts.filter((b) => !b.dead && b.life > 0);
  }

  function updateParticles(dt) {
    for (const q of g.particles) {
      q.life -= dt; q.vy += q.g * dt; q.vx *= 1 - Math.min(1, q.drag * dt); q.vy *= 1 - Math.min(1, q.drag * dt * 0.5);
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === 'missile' && rand() < 0.6) part({ kind: 'smoke', x: q.x, y: q.y + 10, vx: 0, vy: 20, life: 0.6, size: 5, color: '#4a403a' });
      if ((q.kind === 'debris' || q.kind === 'plate' || q.kind === 'shell') && q.vy > 0) {
        const sy = surfaceY(q.x, q.y - 30);
        if (sy !== null && q.y > sy - 2 && q.y < sy + 30) { q.y = sy - 2; q.vy *= -0.3; q.vx *= 0.6; q.vr *= 0.5; if (q.kind === 'plate' && Math.abs(q.vy) > 60) { audio.play('plate'); } }
      }
    }
    g.particles = g.particles.filter((q) => q.life > 0);
    for (const t of g.popups) { t.life -= dt * 0.8; t.y -= 30 * dt; }
    g.popups = g.popups.filter((t) => t.life > 0);
    for (const l of g.lights) l.life -= dt;
    g.lights = g.lights.filter((l) => l.life > 0);
  }

  function updateAmbush(dt) {
    const p = player;
    if (!g.ambush) {
      if (p.dead || g.arenaLocked) return;
      const a = AMBUSHES.find((am, i) => !g.ambushDone.has(i) && p.x >= am.x && p.x <= am.r);
      if (!a) return;
      g.ambush = a; g.ambushT = 0; audio.play('bigWarn'); audio.play('gate'); addShake(6);
      popup(p.x, p.y - 100, 'THE ASH STIRS', '#ff9a6a');
      a.wave.forEach(([type, x], i) => {
        const e = spawnEnemy(type, x, 100 + enemies.length + i); e.ambush = true; e.state = 'chase'; e.cd = 0.8 + i * 0.3; e.face = Math.sign(p.x - x) || 1;
        enemies.push(e); ashBurst(e); light(x, e.y - 30, 220, 'warm', 0.4, 1.2);
      });
      return;
    }
    const a = g.ambush; g.ambushT += dt;
    for (const x of [a.l, a.r]) if (rand() < 0.5) part({ kind: 'ember', x: x + (rand() - 0.5) * 16, y: FLOOR - rand() * 220, vx: (rand() - 0.5) * 30, vy: -60 - rand() * 90, life: 0.8, size: 2 });
    const left = enemies.some((e) => !e.dead && (e.ambush || (e.awake && e.x > a.l - 30 && e.x < a.r + 30)));
    if (!left && g.ambushT > 1) { g.ambushDone.add(AMBUSHES.indexOf(a)); g.ambush = null; audio.play('checkpoint'); popup(p.x, p.y - 100, 'CLEARED', '#ffcf8a'); }
  }
  function updatePickups() {
    const p = player, r = rectOf(p);
    for (const m of g.medkits) {
      if (m.taken) continue;
      if (r.x < m.x + 12 && r.x + r.w > m.x - 12 && r.y < m.y + 12 && r.y + r.h > m.y - 14) {
        if (p.hp >= MAX_HP && !m.small) continue;
        m.taken = true; const amt = m.small ? 20 : 40; p.hp = Math.min(MAX_HP, p.hp + amt); audio.play('pickup'); popup(m.x, m.y - 20, `+${amt}`, '#ff9a8a');
        for (let i = 0; i < 12; i++) part({ kind: 'ember', x: m.x, y: m.y, vx: (rand() - 0.5) * 120, vy: -60 - rand() * 120, life: 0.6, size: 2, color: '#ff8a7a' });
      }
    }
    for (let i = g.cpIdx + 1; i < CHECKPOINTS.length; i++) if (p.x >= CHECKPOINTS[i]) {
      g.cpIdx = i; audio.play('checkpoint'); p.ammo = MAG; p.reloading = false; p.hp = Math.min(MAX_HP, p.hp + 25); popup(p.x, p.y - 90, 'EMBER KINDLED', '#ffc47a');
      for (let k = 0; k < 20; k++) part({ kind: 'ember', x: CHECKPOINTS[i], y: (surfaceY(CHECKPOINTS[i], 380) ?? FLOOR) - 40, vx: (rand() - 0.5) * 80, vy: -50 - rand() * 120, life: 1, size: 2 });
    }
  }

  // ---------- bot (debug verification only; drives the same input buffers a player would) ----------
  function botThink() {
    const p = player, s = g.botS;
    held.left = held.right = false;
    if (s.hold > 0) { s.hold -= DT; held.jump = true; } else held.jump = false;
    if (p.dead || g.cine || g.mode !== 'play') return;
    const go = (d) => { if (d > 0) held.right = true; else if (d < 0) held.left = true; };
    const press = (k) => { buffers[k] = BUF[k]; };
    const jump = (t = 0.35) => { if (p.grounded) { press('jump'); s.hold = t; held.jump = true; } };
    const b = boss;
    if (g.arenaLocked && b.state !== 'dormant' && b.state !== 'intro') {
      const dx = b.x - p.x, adx = Math.abs(dx), sd = Math.sign(dx) || 1;
      for (const w of g.waves) { const rel = (w.x - p.x) * -w.dir; if (rel > 0 && rel < 110) { jump(0.4); } }
      for (const m of g.markers) if (!m.done && Math.abs(m.x - p.x) < 85 && m.t > m.dur - 0.75) { go(Math.sign(p.x - m.x) || 1); if (m.t > m.dur - 0.2 && p.grounded) { press('roll'); } return; }
      for (const bm of g.bolts) { const rel = (bm.x - p.x) * -Math.sign(bm.vx); if (rel > 0 && rel < 140 && Math.abs(bm.y - (p.y - 30)) < 60) { if (p.grounded) { go(-Math.sign(bm.vx)); press('roll'); } return; } }
      if (b.state === 'windup') {
        const rem = b.windup - b.t;
        if (b.attack === 'beam') { if (!b.beamHigh && rem < 0.12) jump(0.45); if (b.beamHigh && rem < 0.05 && p.grounded) { go(sd); press('roll'); } return; }
        if (b.attack === 'slam') { if (Math.abs(p.x - b.slamX) < 130) { go(-sd); if (rem < 0.18) { go(-sd); press('roll'); } } return; }
        if (b.attack === 'charge') { if (rem < 0.08) { go(sd); press('roll'); } return; }
        if (b.attack === 'barrage') { go(sd); return; }
        if (b.attack === 'missiles') return;
      }
      if (b.attack === 'charge' && b.state === 'active') { const rel = (p.x - b.x) * b.face; if (rel > 0 && rel < 230) { go(-b.face); press('roll'); } return; }
      if (b.state === 'active' || (b.state === 'recover' && b.attack === 'beam')) return;
      if (adx < 118) { if (p.face !== sd) go(sd); press('attack'); }
      else { go(sd); if (p.ammo > 0 && adx < 330 && (b.state === 'stunned' || b.state === 'stagger' || adx > 200)) { if (p.face === sd) press('shoot'); } }
      return;
    }
    // exploration
    let target = null, best = 1e9;
    for (const e of enemies) { if (e.dead || !e.awake) continue; const d = Math.abs(e.x - p.x); if (d < 380 && d < best && Math.abs(e.y - p.y) < 220) { best = d; target = e; } }
    let dir = 1;
    if (target) {
      const dx = target.x - p.x, adx = Math.abs(dx), sd = Math.sign(dx) || 1;
      if (target.type === 'drone') {
        if (target.state === 'windup' && target.t > target.windup - 0.18 && p.grounded) { go(sd); press('roll'); return; }
        if (p.face !== sd) { go(sd); return; }
        if (p.ammo > 0 && adx < 420) { press('shoot'); dir = 0; }
        else if (adx < 60 && p.grounded) { jump(0.4); press('attack'); dir = sd; }
        else dir = sd;
      } else {
        if (target.state === 'windup' && adx < 150 && target.t > target.windup - 0.2 && p.grounded) { go(sd); press('roll'); return; }
        if (target.state === 'active' && target.type === 'hound' && adx < 160 && p.grounded) { go(sd); press('roll'); return; }
        const reach = target.type === 'brute' ? 92 : target.type === 'hound' ? 70 : 64;
        if (adx < reach) { if (p.face !== sd) go(sd); press('attack'); dir = 0; }
        else { dir = sd; if (target.type === 'brute' && p.ammo > 0 && adx < 260 && p.face === sd) press('shoot'); }
      }
    }
    if (dir) go(dir);
    if (dir && p.grounded) {
      const ahead = p.x + dir * 34;
      if (!groundBelow(ahead, p.y, 70) || solidAt(p.x + dir * 30, p.y - 12) || solidAt(p.x + dir * 30, p.y - 40)) jump(0.4);
    }
    if (!dir && p.ammo < 2 && !p.reloading) press('reload');
  }

  // ---------- main tick ----------
  function tick(dt) {
    g.time += dt;
    g.shake = Math.max(0, g.shake - dt * 30);
    g.flashFx = Math.max(0, g.flashFx - dt * 3);
    g.dmgVignette = Math.max(0, g.dmgVignette - dt * 1.6);
    g.letterbox += (g.letterTarget - g.letterbox) * Math.min(1, dt * 3);
    for (const k in buffers) buffers[k] = Math.max(0, buffers[k] - dt);
    if (g.mode === 'title') { g.titleT += dt; g.cam.x = 40 + Math.sin(g.titleT * 0.05) * 30; updateParticles(dt); updateAmbient(dt); return; }
    if (g.mode === 'victory') { g.victoryT += dt; updateParticles(dt); updateAmbient(dt); return; }
    if (g.hitstop > 0) { g.hitstop -= dt; player.flash -= dt; boss.flash -= dt; for (const e of enemies) e.flash -= dt; return; }
    let sdt = dt;
    if (g.slow) { sdt = dt * g.slow.scale; g.slow.t -= dt; if (g.slow.t <= 0) g.slow = null; }
    g.playT += sdt;
    if (g.bot) botThink();
    if (g.cine) updateCine(sdt);
    updatePlayer(sdt);
    const threat = updateEnemies(sdt);
    updateBoss(sdt);
    updateProjectiles(sdt);
    updateParticles(sdt);
    updatePickups();
    updateAmbush(sdt);
    updateAmbient(sdt);
    // camera
    const p = player;
    let tx = p.x - VIEW_W * 0.42 + p.face * 70 + p.vx * 0.12;
    if (g.arenaLocked) tx = clamp(tx, ARENA.left - 10, ARENA.right - VIEW_W + 10);
    if (g.cine) tx = g.cine.kind === 'bossIntro' ? (ARENA.left + ARENA.right) / 2 - VIEW_W / 2 : boss.x - VIEW_W / 2;
    tx = clamp(tx, 0, WORLD_END - VIEW_W);
    g.cam.x += (tx - g.cam.x) * Math.min(1, sdt * 4.5);
    const ty = clamp((p.y - 420) * 0.55, -110, 30);
    g.cam.y += (ty - g.cam.y) * Math.min(1, sdt * 3);
    // area cards + music
    const zi = zoneIndexAt(p.x);
    if (!g.seenZones.has(zi) && !g.arenaLocked) { g.seenZones.add(zi); g.zoneShown = zi; const z = ZONES[zi]; card(z.name, z.sub, `CHAPTER ${z.chapter}`); audio.setMode(z.id); }
    if (!g.arenaLocked) audio.setIntensity(threat * 0.3);
    g.hintT += sdt;
    for (const c of g.cards) c.t += dt;
    g.cards = g.cards.filter((c) => c.t < c.dur);
  }
  function updateCine(dt) {
    const c = g.cine; c.t += dt * (c.kind === 'bossIntro' && g.introSeen ? 2.4 : 1);
    if (c.kind === 'bossIntro') {
      const b = boss; b.t = c.t; player.vx = approach(player.vx, 0, 2000 * dt);
      g.gateY = Math.min(1, c.t / 0.8);
      if (c.t > 0.8 && c.t < 0.9) addShake(8);
      b.wake = clamp((c.t - 1.0) / 0.6, 0, 1);
      if (c.t > 1.5 && !c.roared) { c.roared = true; audio.play('roar'); addShake(14); audio.setMode(boss.phase === 2 ? 'boss2' : 'boss1'); card('THE FOUNDRY WARDEN', '铸 炉 守 卫', 'GUARDIAN', 2.4); }
      if (c.t > 3.3) { g.introSeen = true; g.cine = null; g.letterTarget = 0; b.state = 'idle'; b.cd = 1.6; b.t = 0; b.wake = 1; }
    } else if (c.kind === 'transform') { /* driven by boss.t */ }
  }
  function updateAmbient(dt) {
    for (const a of g.ash) {
      a.x += (-14 - a.z * 22) * dt; a.y += (16 + a.z * 26) * dt + Math.sin(g.time * 1.3 + a.s * 9) * 0.25;
      if (a.y > VIEW_H + 5) { a.y = -5; a.x = Math.random() * (VIEW_W + 80); } if (a.x < -10) a.x = VIEW_W + 10;
    }
    // ambient embers from fires
    const camMid = g.cam.x + VIEW_W / 2;
    for (const pit of PITS) if (pit.zone === 2 && Math.abs(pit.x - camMid) < 700 && Math.random() < 0.3 * dt * 60) part({ kind: 'ember', x: pit.x + Math.random() * pit.w, y: VIEW_H, vx: 0, vy: -120 - Math.random() * 100, g: -20, life: 1.2, size: 1.8 });
    if (Math.random() < 0.35) for (const l of LIGHTS) if (l.kind !== 'lamp' && l.kind !== 'lantern' && Math.abs(l.x - (g.cam.x + VIEW_W / 2)) < 700 && Math.random() < 0.15) part({ kind: 'ember', x: l.x + (Math.random() - 0.5) * 30, y: l.y - 10, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, g: -10, life: 1.4 + Math.random(), size: 1.5 });
  }

  // ---------- rendering ----------
  let scale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect?.(); if (!r || !r.width) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.min(1920, Math.round(r.width * dpr)), h = Math.round(w * 9 / 16);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    scale = canvas.width / VIEW_W;
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(canvas);

  function zoneBlend() {
    const cx = g.cam.x + VIEW_W / 2, T = 800;
    const f1 = clamp((cx - (ZONES[1].start - T / 2)) / T, 0, 1), f2 = clamp((cx - (ZONES[2].start - T / 2)) / T, 0, 1);
    return [1 - f1, f1 * (1 - f2), f2];
  }
  function drawLayer(img, factor, alpha, yShift = 0) {
    if (alpha <= 0.01) return;
    const off = (((g.cam.x * factor) % LAYER_W) + LAYER_W) % LAYER_W;
    ctx.globalAlpha = alpha;
    const y = -g.cam.y * factor * 0.5 + yShift;
    ctx.drawImage(img, -off, y); if (LAYER_W - off < VIEW_W) ctx.drawImage(img, LAYER_W - off, y);
    ctx.globalAlpha = 1;
  }
  function drawFog(wts, factor, alpha, y, speed) {
    const t = g.time * speed;
    wts.forEach((w, i) => {
      if (w <= 0.01) return;
      const spr = art.fog[i], span = spr.width * 0.9;
      const off = (((g.cam.x * factor + t) % span) + span) % span;
      ctx.globalAlpha = alpha * w;
      for (let x = -off - span; x < VIEW_W + span; x += span) ctx.drawImage(spr, x, y - g.cam.y * factor * 0.5, spr.width, spr.height);
    });
    ctx.globalAlpha = 1;
  }

  function render() {
    resize();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const wts = zoneBlend();
    const sh = g.shake, shx = sh ? (Math.random() - 0.5) * sh : 0, shy = sh ? (Math.random() - 0.5) * sh : 0;
    // sky + parallax
    let firstSky = true;
    wts.forEach((w, i) => { if (w > 0.01) { ctx.globalAlpha = firstSky ? 1 : w; firstSky = false; ctx.drawImage(art.skies[i], 0, 0); } });
    ctx.globalAlpha = 1;
    wts.forEach((w, i) => drawLayer(art.layers[i].far, 0.1, w, 0));
    drawFog(wts, 0.2, 0.55, 250, 6);
    wts.forEach((w, i) => drawLayer(art.layers[i].mid, 0.3, w, 0));
    drawFog(wts, 0.45, 0.5, 300, 10);
    wts.forEach((w, i) => drawLayer(art.layers[i].near, 0.6, w, 0));
    drawFog(wts, 0.7, 0.35, 330, 16);
    // world
    ctx.save(); ctx.translate(Math.round(-g.cam.x + shx), Math.round(-g.cam.y + shy));
    drawWorldBack();
    drawTelegraphs();
    for (const e of enemies) if (!e.dead || e.deadT < 0.7) if (Math.abs(e.x - g.cam.x - VIEW_W / 2) < VIEW_W) drawActor((c) => drawEnemy(c, e, art, g.time), e.x, e.y, 220, 220, 'rgba(185,215,220,0.58)', 8, e.flash);
    if (boss.state !== 'dormant' || Math.abs(boss.x - g.cam.x) < VIEW_W + 200) drawActor((c) => drawBoss(c, boss, art, g.time), boss.x, boss.y, 480, 400, 'rgba(255,150,80,0.5)', 12, boss.flash);
    drawTrail();
    drawActor((c) => drawPlayer(c, player, art, g.time), player.x, player.y, 240, 220, 'rgba(255,196,140,0.6)', 8, player.flash);
    drawProjectiles();
    drawParticles();
    drawBeams();
    drawGroundFog();
    ctx.restore();
    // foreground parallax
    wts.forEach((w, i) => drawLayer(art.layers[i].fg, 1.25, w * 0.62, 0));
    drawLighting(wts, shx, shy);
    drawAsh(wts);
    drawPost(wts);
    drawHUD();
  }

  // Actors are drawn into a scratch canvas, then composited with a soft rim glow so dark
  // silhouettes stay readable against equally dark painted backgrounds.
  const actorCv = makeCanvas(980, 820), actx = actorCv.getContext('2d');
  function drawActor(fn, x, y, w, h, rim, blur, flashT = 0) {
    const s = Math.min(coarse ? 1.5 : 2, scale), pad = 40, cw = Math.ceil(w * s), ch = Math.ceil(h * s);
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, cw + 2, ch + 2);
    actx.setTransform(s, 0, 0, s, (w / 2 - x) * s, (h - pad - y) * s);
    fn(actx);
    if (flashT > 0) { // silhouette-preserving hit flash: bright for a frame, then a fading warm tint
      actx.setTransform(1, 0, 0, 1, 0, 0); actx.globalCompositeOperation = 'source-atop';
      actx.fillStyle = flashT > 0.07 ? 'rgba(255,248,236,0.9)' : `rgba(255,214,170,${0.45 * flashT / 0.07})`; actx.fillRect(0, 0, cw, ch);
      actx.globalCompositeOperation = 'source-over';
    }
    ctx.save(); ctx.shadowColor = rim; ctx.shadowBlur = blur * scale;
    ctx.drawImage(actorCv, 0, 0, cw, ch, x - w / 2, y - (h - pad), w, h);
    ctx.restore();
  }

  function drawWorldBack() {
    const x0 = g.cam.x - 300, x1 = g.cam.x + VIEW_W + 300;
    // pits
    for (const pit of PITS) {
      if (pit.x + pit.w < x0 || pit.x > x1) continue;
      if (pit.zone === 2) {
        const gr = ctx.createLinearGradient(0, FLOOR + 20, 0, VIEW_H + 120); gr.addColorStop(0, '#2a0c04'); gr.addColorStop(0.5, '#c0420e'); gr.addColorStop(1, '#ffb04a');
        ctx.fillStyle = gr; ctx.fillRect(pit.x, FLOOR + 10, pit.w, 400);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(g.time * 3 + pit.x) * 0.1;
        ctx.drawImage(art.warmGlow, pit.x - 60, FLOOR - 40, pit.w + 120, 260); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else {
        const gr = ctx.createLinearGradient(0, FLOOR, 0, VIEW_H + 100); gr.addColorStop(0, '#050606'); gr.addColorStop(1, pit.zone === 0 ? '#0a1414' : '#0a0a0c');
        ctx.fillStyle = gr; ctx.fillRect(pit.x, FLOOR, pit.w, 400);
        if (pit.zone === 0) { ctx.strokeStyle = 'rgba(140,170,170,0.12)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = VIEW_H - 40 + i * 9 + Math.sin(g.time + i) * 2; ctx.beginPath(); ctx.moveTo(pit.x + 10 + i * 6, y); ctx.lineTo(pit.x + pit.w - 10 - i * 8, y); ctx.stroke(); } }
      }
    }
    // props
    for (const [type, x] of PROPS) {
      const img = art.props[type]; if (!img || x + img.width < x0 || x - img.width > x1) continue;
      const base = surfaceY(x, 380) ?? FLOOR;
      ctx.drawImage(img, x - img.width / 2, base - img.height + (type === 'tree' ? 8 : 2));
    }
    for (const l of LIGHTS) {
      if (l.x < x0 || l.x > x1) continue;
      const base = surfaceY(l.x, 380) ?? FLOOR;
      const P = art.props;
      if (l.kind === 'lantern') ctx.drawImage(P.lantern, l.x - 40, base - 108);
      else if (l.kind === 'campfire') { ctx.drawImage(P.campfire, l.x - 45, base - 28); flame(l.x, base - 14, 1.1); }
      else if (l.kind === 'barrel') { ctx.drawImage(P.barrel, l.x - 22, base - 56); flame(l.x, base - 56, 0.8); }
      else if (l.kind === 'lamp') ctx.drawImage(P.lamp, l.x - 72, base - 258);
      else if (l.kind === 'furnace') { ctx.drawImage(P.furnace, l.x - 120, base - 258); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + Math.sin(g.time * 4 + l.x) * 0.12; ctx.drawImage(art.warmGlow, l.x - 70, base - 110, 140, 130); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; flame(l.x, base - 6, 1.3); }
      else if (l.kind === 'brazier') { ctx.drawImage(P.brazier, l.x - 35, base - 110); flame(l.x, base - 82, 1); }
    }
    // checkpoints: ember shrines
    CHECKPOINTS.forEach((x, i) => {
      if (i === 0 || x < x0 || x > x1) return;
      const base = surfaceY(x, 380) ?? FLOOR;
      ctx.fillStyle = '#121010'; ctx.fillRect(x - 3, base - 70, 6, 70); ctx.fillRect(x - 14, base - 74, 28, 6);
      ctx.fillStyle = '#5a2a1a'; ctx.beginPath(); ctx.moveTo(x + 3, base - 66); ctx.lineTo(x + 26, base - 60 + Math.sin(g.time * 3) * 3); ctx.lineTo(x + 3, base - 50); ctx.fill();
      if (g.cpIdx >= i) flame(x, base - 76, 0.6);
    });
    // terrain
    for (const s of solids) {
      if (s.x + s.w < x0 || s.x > x1) continue;
      const zi = zoneIndexAt(s.x + s.w / 2);
      if (s.kind === 'car') { ctx.drawImage(art.props.car, s.x, s.y - 2, s.w, s.h + 4); continue; }
      if (s.kind === 'crate') { ctx.drawImage(art.props.crate, s.x, s.y, s.w, s.h); continue; }
      if (s.oneway) { drawPlank(s, zi); continue; }
      ctx.fillStyle = patterns[zi] || '#15191a'; ctx.fillRect(s.x, s.y, s.w, VIEW_H + 200 - s.y);
      const lip = art.lips[zi];
      for (let x = s.x; x < s.x + s.w; x += 512) { const w = Math.min(512, s.x + s.w - x); ctx.drawImage(lip, 0, 0, w, 44, x, s.y - 20, w, 44); }
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(s.x, s.y + 4, 3, 300); ctx.fillRect(s.x + s.w - 3, s.y + 4, 3, 300);
    }
    // ambush curtains
    if (g.ambush) for (const x of [g.ambush.l, g.ambush.r]) {
      const a = Math.min(1, g.ambushT * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, FLOOR - 260, 0, FLOOR); gr.addColorStop(0, 'rgba(255,90,30,0)'); gr.addColorStop(1, `rgba(255,120,50,${0.45 * a})`);
      ctx.fillStyle = gr; ctx.fillRect(x - 14, FLOOR - 260, 28, 260);
      ctx.fillStyle = `rgba(255,220,170,${0.6 * a})`; ctx.fillRect(x - 1.5, FLOOR - 200 + Math.sin(g.time * 7 + x) * 10, 3, 200);
      ctx.restore();
    }
    // arena gate
    if (g.gateY > 0) {
      const x = ARENA.left - 6, h = 330 * g.gateY;
      ctx.fillStyle = '#100c0b'; ctx.fillRect(x - 18, FLOOR - 330, 36, h);
      ctx.strokeStyle = '#2e2420'; ctx.lineWidth = 3; for (let y = FLOOR - 330 + 12; y < FLOOR - 330 + h; y += 22) { ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x + 18, y); ctx.stroke(); }
      ctx.fillStyle = '#c7902e'; ctx.fillRect(x - 18, FLOOR - 330 + h - 8, 36, 4);
    }
    // medkits
    for (const m of g.medkits) {
      if (m.taken || m.x < x0 || m.x > x1) continue;
      const bob = Math.sin(g.time * 3 + m.x) * 3;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; ctx.drawImage(art.redGlow, m.x - 26, m.y - 26 + bob, 52, 52); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2a1a16'; ctx.fillRect(m.x - 10, m.y - 9 + bob, 20, 18); ctx.fillStyle = '#e04a3a'; ctx.fillRect(m.x - 2, m.y - 6 + bob, 4, 12); ctx.fillRect(m.x - 6, m.y - 2 + bob, 12, 4);
    }
  }
  function drawPlank(s, zi) {
    if (s.kind === 'oneway') { // fallen log
      ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(s.x, s.y - 2, s.w, 16, 8) : ctx.rect(s.x, s.y - 2, s.w, 16); ctx.fill();
      ctx.strokeStyle = '#2e241c'; ctx.lineWidth = 1.2; for (let x = s.x + 10; x < s.x + s.w - 10; x += 14) { ctx.beginPath(); ctx.moveTo(x, s.y + 1); ctx.lineTo(x + 9, s.y + 3); ctx.stroke(); }
      ctx.fillStyle = 'rgba(230,170,110,0.25)'; ctx.fillRect(s.x + 4, s.y - 2, s.w - 8, 1.5);
      ctx.fillStyle = '#0c0a08'; ctx.fillRect(s.x + 20, s.y + 12, 6, FLOOR - s.y - 12); ctx.fillRect(s.x + s.w - 30, s.y + 12, 6, FLOOR - s.y - 12);
    } else if (s.kind === 'awning') {
      ctx.fillStyle = '#2a1c18'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w, s.y); ctx.lineTo(s.x + s.w - 6, s.y + 16); ctx.lineTo(s.x + 6, s.y + 16); ctx.fill();
      ctx.fillStyle = '#4a2a20'; for (let x = s.x + 6; x < s.x + s.w - 10; x += 24) ctx.fillRect(x, s.y + 2, 12, 12);
      ctx.fillStyle = '#121214'; ctx.fillRect(s.x + 10, s.y + 16, 5, FLOOR - s.y - 16); ctx.fillRect(s.x + s.w - 15, s.y + 16, 5, FLOOR - s.y - 16);
      ctx.fillStyle = 'rgba(255,170,100,0.3)'; ctx.fillRect(s.x, s.y, s.w, 1.5);
    } else { // catwalk
      ctx.fillStyle = '#1a1412'; ctx.fillRect(s.x, s.y, s.w, 8);
      ctx.strokeStyle = '#2e2420'; ctx.lineWidth = 1; for (let x = s.x; x < s.x + s.w; x += 8) { ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x + 6, s.y + 8); ctx.stroke(); }
      ctx.strokeStyle = '#140e0c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x, s.y - 30); ctx.lineTo(s.x + s.w, s.y - 30); ctx.stroke();
      for (let x = s.x; x <= s.x + s.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x, s.y - 30); ctx.stroke(); }
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x + 30, s.y + 8); ctx.lineTo(s.x + 30, -40); ctx.moveTo(s.x + s.w - 30, s.y + 8); ctx.lineTo(s.x + s.w - 30, -40); ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,70,0.35)'; ctx.fillRect(s.x, s.y, s.w, 1.2);
    }
  }
  function flame(x, y, size) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5; ctx.drawImage(art.warmGlow, x - 50 * size, y - 60 * size, 100 * size, 100 * size);
    for (let i = 0; i < 4; i++) {
      const t = g.time * (6 + i) + x, h = (24 + Math.sin(t) * 6 + i * 3) * size, w = (9 - i * 1.5) * size, ox = Math.sin(t * 1.3) * 3 * size;
      ctx.globalAlpha = 0.55 - i * 0.08; ctx.fillStyle = ['#ff5a1a', '#ff8a2a', '#ffc04a', '#fff0b0'][i];
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.8 + ox, y - h * 0.6, x + ox * 1.5, y - h); ctx.quadraticCurveTo(x + w * 0.8 + ox, y - h * 0.6, x + w, y); ctx.fill();
    }
    ctx.restore();
  }
  function drawTelegraphs() {
    const pulse = 0.5 + Math.sin(g.time * 22) * 0.5;
    // brute slam zones
    for (const e of enemies) if (!e.dead && e.type === 'brute' && e.state === 'windup') {
      const k = e.t / e.windup, x0 = e.x + e.face * 20, x1 = e.x + e.face * 150;
      dangerRect(Math.min(x0, x1), e.y - 6, 130, 8, k, pulse);
    }
    // drone laser sights
    for (const e of enemies) if (!e.dead && e.type === 'drone' && e.state === 'windup' && e.aim) {
      const k = e.t / e.windup, locked = e.t >= e.lockT;
      const a = Math.atan2(e.aim.y - e.y, e.aim.x - e.x); dangerLine(e.x, e.y, e.x + Math.cos(a) * 900, e.y + Math.sin(a) * 900, locked ? 1 : k * 0.5, pulse, !locked);
    }
    const b = boss;
    if (b.state === 'windup') {
      const k = b.t / b.windup;
      if (b.attack === 'slam') {
        const x = b.slamX; dangerRect(x - 95, FLOOR - 8, 190, 10, k, pulse);
        chevrons(x, FLOOR - 40 - 30 * (1 - k), 0, k);
      } else if (b.attack === 'charge') {
        const xe = b.face > 0 ? ARENA.right : ARENA.left, xs = b.x;
        ctx.fillStyle = `rgba(255,40,20,${0.08 + 0.18 * k})`; ctx.fillRect(Math.min(xs, xe), FLOOR - 200, Math.abs(xe - xs), 200);
        for (let i = 0; i < 8; i++) { const x = xs + b.face * (100 + ((i * 90 + g.time * 400) % 720)); if ((x - xs) * b.face < Math.abs(xe - xs)) arrow(x, FLOOR - 100, b.face, 0.3 + 0.5 * k); }
      } else if (b.attack === 'barrage') {
        const m = bossMuzzle(), aim = b.aim || { x: player.x, y: player.y - 34 }, base = Math.atan2(aim.y - m.y, aim.x - m.x), n = b.phase === 2 ? 5 : 3;
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.13; dangerLine(m.x, m.y, m.x + Math.cos(a) * 1000, m.y + Math.sin(a) * 1000, k, pulse, true); }
      } else if (b.attack === 'beam') {
        const y = FLOOR - (b.beamHigh ? 52 : 15), xe = b.face > 0 ? ARENA.right : ARENA.left, xs = b.x + b.face * 70;
        dangerLine(xs, y, xe, y, k, pulse, true);
        for (let i = 1; i < 6; i++) chevrons(xs + (xe - xs) * i / 6, y + (b.beamHigh ? 30 : -30), b.beamHigh ? Math.PI : 0, k);
      } else if (b.attack === 'missiles') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.drawImage(art.redGlow, b.x - b.face * 30 - 40, b.y - 270, 80, 80); ctx.restore();
      }
    }
    for (const m of g.markers) {
      if (m.done || m.t < 0) continue;
      const k = m.t / m.dur;
      ctx.fillStyle = `rgba(255,50,20,${0.12 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(m.x, FLOOR - 2, 66, 10, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,250,240,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(m.x, FLOOR - 2, 66 * k, 10 * k, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(m.x, FLOOR - 2, 66, 10, 0, 0, 7); ctx.stroke();
      if (k > 0.7) { ctx.fillStyle = '#ffd0a0'; ctx.fillRect(m.x - 2, FLOOR - 2 - (1 - k) * 1500, 4, 26); }
    }
  }
  function dangerLine(x0, y0, x1, y1, k, pulse, dash) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,60,30,${0.25 + 0.35 * k})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (dash) ctx.setLineDash?.([16, 10]);
    ctx.strokeStyle = `rgba(255,250,240,${0.35 + 0.6 * k * (0.6 + 0.4 * pulse)})`; ctx.lineWidth = 1.6 + k; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  function dangerRect(x, y, w, h, k, pulse) {
    ctx.fillStyle = `rgba(255,50,20,${0.15 + 0.3 * k})`; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(255,250,240,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  }
  function chevrons(x, y, rot, k) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = `rgba(255,240,220,${0.4 + 0.6 * k})`; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-9, i * 10 - 6); ctx.lineTo(0, i * 10 + 2); ctx.lineTo(9, i * 10 - 6); ctx.stroke(); }
    ctx.restore();
  }
  function arrow(x, y, dir, a) { ctx.strokeStyle = `rgba(255,236,220,${a})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - dir * 14, y - 18); ctx.lineTo(x, y); ctx.lineTo(x - dir * 14, y + 18); ctx.stroke(); }
  function drawTrail() {
    const tr = player.trail; if (!tr.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // Crescent: transparent near the hand, hot at the blade's edge, fading with age.
    const col = (heavy) => (heavy ? '255,196,130' : '190,225,255');
    for (const t of tr) {
      const k = t.life / t.max, ia = mix(t.a.hand, t.a.tip, 0.38), ib = mix(t.b.hand, t.b.tip, 0.38);
      const gr = ctx.createLinearGradient((ia.x + ib.x) / 2, (ia.y + ib.y) / 2, (t.a.tip.x + t.b.tip.x) / 2, (t.a.tip.y + t.b.tip.y) / 2);
      gr.addColorStop(0, `rgba(${col(t.heavy)},0)`); gr.addColorStop(0.75, `rgba(${col(t.heavy)},${0.32 * k})`); gr.addColorStop(1, `rgba(255,255,255,${0.75 * k})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ia.x, ia.y); ctx.lineTo(t.a.tip.x, t.a.tip.y); ctx.lineTo(t.b.tip.x, t.b.tip.y); ctx.lineTo(ib.x, ib.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`; ctx.lineWidth = (t.heavy ? 3 : 2) * k + 0.4; ctx.beginPath(); ctx.moveTo(t.a.tip.x, t.a.tip.y); ctx.lineTo(t.b.tip.x, t.b.tip.y); ctx.stroke();
    }
    const last = tr[tr.length - 1]; ctx.globalAlpha = 0.5 * last.life / last.max; ctx.drawImage(last.heavy ? art.warmGlow : art.coolGlow, last.b.tip.x - 40, last.b.tip.y - 40, 80, 80);
    ctx.restore();
  }
  function drawProjectiles() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const s of g.pellets) {
      ctx.strokeStyle = 'rgba(255,200,120,0.85)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,230,1)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.008, s.y - s.vy * 0.008); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.globalAlpha = 0.7; ctx.drawImage(art.warmGlow, s.x - 12, s.y - 12, 24, 24); ctx.globalAlpha = 1;
    }
    for (const b of g.bolts) {
      const glow = b.color === 'red' ? art.redGlow : art.warmGlow;
      ctx.globalAlpha = 0.9; ctx.drawImage(glow, b.x - b.r * 4, b.y - b.r * 4, b.r * 8, b.r * 8);
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff2e0'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, 7); ctx.fill();
      ctx.strokeStyle = b.color === 'red' ? 'rgba(255,80,60,0.6)' : 'rgba(255,150,70,0.6)'; ctx.lineWidth = b.r; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.stroke();
    }
    for (const w of g.waves) {
      ctx.globalAlpha = Math.min(1, w.life); ctx.drawImage(art.warmGlow, w.x - 40, FLOOR - 70, 80, 90);
      ctx.strokeStyle = 'rgba(255,190,110,0.95)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - w.dir * 30, FLOOR); ctx.quadraticCurveTo(w.x - w.dir * 4, FLOOR - 40, w.x + w.dir * 10, FLOOR); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,50,0.6)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(w.x - w.dir * 50, FLOOR); ctx.quadraticCurveTo(w.x - w.dir * 20, FLOOR - 26, w.x, FLOOR); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawBeams() {
    if (!g.beams.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const bm of g.beams) {
      const k = bm.t < bm.dur ? 1 : Math.max(0, 1 - (bm.t - bm.dur) / 0.25), th = bm.th * (0.8 + Math.random() * 0.4) * k;
      const x = Math.min(bm.x0, bm.x1), w = Math.abs(bm.x1 - bm.x0);
      ctx.fillStyle = `rgba(255,60,30,${0.5 * k})`; ctx.fillRect(x, bm.y - th, w, th * 2);
      ctx.fillStyle = `rgba(255,220,200,${0.95 * k})`; ctx.fillRect(x, bm.y - th * 0.3, w, th * 0.6);
      ctx.globalAlpha = 0.6 * k; ctx.drawImage(art.redGlow, bm.x0 - 60, bm.y - 60, 120, 120); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawParticles() {
    for (const q of g.particles) {
      const k = Math.max(0, q.life / q.max);
      switch (q.kind) {
        case 'spark': ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = q.color; ctx.globalAlpha = k; ctx.lineWidth = q.size; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke(); ctx.restore(); break;
        case 'ember': ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * 0.9; ctx.fillStyle = q.color || '#ffa050'; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); ctx.globalAlpha = k * 0.35; ctx.drawImage(art.warmGlow, q.x - q.size * 3, q.y - q.size * 3, q.size * 6, q.size * 6); ctx.restore(); break;
        case 'ash': ctx.globalAlpha = k; ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.size, q.size * 0.7); ctx.globalAlpha = 1; break;
        case 'smoke': ctx.globalAlpha = k * 0.28; ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.6 - k * 0.6), 0, 7); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'ichor': ctx.globalAlpha = k; ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.size, q.size); ctx.globalAlpha = 1; break;
        case 'debris': case 'shell': ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.globalAlpha = Math.min(1, k * 3); ctx.fillStyle = q.color; ctx.fillRect(-q.size, -q.size * 0.6, q.size * 2, q.size * 1.2); if (q.kind === 'shell') { ctx.fillStyle = '#c8a050'; ctx.fillRect(-q.size, -q.size * 0.6, q.size * 0.7, q.size * 1.2); } ctx.restore(); break;
        case 'plate': ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = '#35302c'; ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); q.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); break;
        case 'muzzle': { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(q.x, q.y); ctx.scale(q.face, 1); ctx.globalAlpha = k; ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(46, 0); ctx.lineTo(0, 7); ctx.fill(); ctx.fillStyle = '#ffb050'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(30, -16); ctx.lineTo(22, 0); ctx.lineTo(30, 16); ctx.lineTo(0, 14); ctx.fill(); ctx.drawImage(art.warmGlow, -40, -40, 110, 80); ctx.restore(); break; }
        case 'flare': ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.drawImage(art.warmGlow, q.x - q.size, q.y - q.size, q.size * 2, q.size * 2); ctx.globalAlpha = k * 0.8; ctx.drawImage(art.whiteGlow, q.x - q.size * 0.4, q.y - q.size * 0.4, q.size * 0.8, q.size * 0.8); ctx.restore(); break;
        case 'ring': { const r = q.size + (1 - k) * 420; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,150,80,${k})`; ctx.lineWidth = 6 * k + 1; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.stroke(); ctx.restore(); break; }
        case 'missile': ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.drawImage(art.warmGlow, q.x - 14, q.y - 14, 28, 40); ctx.fillStyle = '#fff'; ctx.fillRect(q.x - 2, q.y - 6, 4, 12); ctx.restore(); break;
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawGroundFog() {
    const gr = ctx.createLinearGradient(0, FLOOR - 70, 0, FLOOR + 30);
    const wts = zoneBlend(); const col = wts[2] > 0.5 ? '160,90,60' : wts[1] > 0.5 ? '140,120,110' : '130,150,148';
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.7, `rgba(${col},0.12)`); gr.addColorStop(1, `rgba(${col},0.02)`);
    ctx.fillStyle = gr; ctx.fillRect(g.cam.x - 50, FLOOR - 70, VIEW_W + 100, 100);
    const spr = art.fog[wts.indexOf(Math.max(...wts))], span = spr.width;
    const off = ((g.cam.x * 0.1 + g.time * 22) % span + span) % span;
    ctx.globalAlpha = 0.28; for (let x = g.cam.x - off - span; x < g.cam.x + VIEW_W + span; x += span) ctx.drawImage(spr, x, FLOOR - 150, span, 220); ctx.globalAlpha = 1;
  }
  function drawLighting(wts, shx, shy) {
    const ambient = 0.5 * wts[0] + 0.46 * wts[1] + 0.4 * wts[2];
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, lightCv.width, lightCv.height);
    lctx.fillStyle = `rgba(3,5,8,${ambient})`; lctx.fillRect(0, 0, lightCv.width, lightCv.height);
    lctx.globalCompositeOperation = 'destination-out';
    const cx = g.cam.x - shx, cy = g.cam.y - shy, all = [];
    for (const l of LIGHTS) { if (Math.abs(l.x - cx - VIEW_W / 2) > VIEW_W) continue; const fl = 1 - l.f * 0.25 + Math.sin(g.time * 9 + l.x) * 0.06 * l.f + (Math.random() - 0.5) * 0.05 * l.f; all.push({ x: l.x, y: l.y, r: l.r, a: 0.95 * fl, tint: 'warm' }); }
    CHECKPOINTS.forEach((x, i) => { if (i && g.cpIdx >= i) all.push({ x, y: (surfaceY(x, 380) ?? FLOOR) - 76, r: 150, a: 0.7, tint: 'warm' }); });
    for (const l of g.lights) all.push({ x: l.x, y: l.y, r: l.r, a: l.a * (l.life / l.max), tint: l.tint });
    const p = player; all.push({ x: p.x, y: p.y - 40, r: 260, a: 0.6, tint: null });
    if (boss.state !== 'dormant') { const exposed = boss.phase === 2 || boss.state === 'transform'; all.push({ x: boss.x + boss.face * 4, y: boss.y - 204, r: exposed ? 360 : 200, a: exposed ? 0.9 : 0.5, tint: 'warm' }); }
    for (const e of enemies) if (!e.dead && e.awake && e.type === 'drone') all.push({ x: e.x, y: e.y, r: 120, a: 0.5, tint: 'red' });
    for (const b of g.bolts) all.push({ x: b.x, y: b.y, r: 120, a: 0.8, tint: b.color === 'red' ? 'red' : 'warm' });
    for (const s of g.pellets) all.push({ x: s.x, y: s.y, r: 70, a: 0.5, tint: null });
    for (const l of all) { lctx.globalAlpha = Math.min(1, l.a); const r = l.r; lctx.drawImage(art.whiteGlow, (l.x - cx - r) / 2, (l.y - cy - r) / 2, r, r); }
    lctx.globalAlpha = 1;
    ctx.drawImage(lightCv, 0, 0, VIEW_W, VIEW_H);
    // additive warm bloom for local lights
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const l of all) { if (!l.tint) continue; const spr = l.tint === 'red' ? art.redGlow : l.tint === 'cool' ? art.coolGlow : art.warmGlow; ctx.globalAlpha = Math.min(0.32, 0.22 * l.a); const r = l.r * 0.8; ctx.drawImage(spr, l.x - cx - r, l.y - cy - r, r * 2, r * 2); }
    ctx.restore();
  }
  function drawAsh(wts) {
    ctx.save();
    for (const a of g.ash) {
      const ember = wts[2] > 0.5 ? a.s < 0.35 : a.s < 0.08;
      if (ember) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(g.time * 4 + a.s * 20); ctx.fillStyle = '#ff9a4a'; }
      else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.25 + a.z * 0.35; ctx.fillStyle = '#a8a29a'; }
      const s = 0.8 + a.z * 1.8; ctx.fillRect(a.x, a.y, s, s * 0.8);
    }
    ctx.restore();
  }
  function drawPost(wts) {
    // colour grade
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.22;
    ctx.fillStyle = wts[2] > 0.5 ? '#7a3a1a' : wts[1] > 0.5 ? '#4a3a40' : '#2a4a4a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    ctx.drawImage(art.vignette, 0, 0);
    if (g.dmgVignette > 0 || player.hp < 30) {
      const a = Math.max(g.dmgVignette * 0.6, player.hp < 30 && !player.dead ? 0.25 + Math.sin(g.time * 5) * 0.12 : 0);
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; const gr = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.6); gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, 'rgba(140,10,0,1)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.restore();
    }
    if (g.flashFx > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.85, g.flashFx * 0.7); ctx.fillStyle = g.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.restore(); }
    // film grain
    ctx.save(); ctx.globalAlpha = 0.06; ctx.globalCompositeOperation = 'overlay';
    const ox = (Math.random() * 256) | 0, oy = (Math.random() * 256) | 0;
    for (let x = -ox; x < VIEW_W; x += 256) for (let y = -oy; y < VIEW_H; y += 256) ctx.drawImage(art.grain, x, y);
    ctx.restore();
    // letterbox
    const lb = g.letterbox * 58; if (lb > 0.5) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, lb); ctx.fillRect(0, VIEW_H - lb, VIEW_W, lb); }
  }

  function text(str, x, y, size, color, opts = {}) {
    ctx.font = `${opts.weight || 400} ${size}px ${opts.font || SERIF}`; ctx.textAlign = opts.align || 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${opts.spacing || 0}px`;
    if (opts.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, x + 1.5, y + 2); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  function drawHUD() {
    ctx.save();
    const p = player;
    if (g.mode === 'play') {
      const lbOff = g.letterbox * 58, hudA = clamp(1 - g.letterbox * 1.3, 0, 1);
      // Small portrait canvases: enlarge the HUD so it stays legible on phones.
      const hs = coarse && canvas.clientWidth && canvas.clientWidth < 560 ? 1.7 : 1;
      ctx.globalAlpha = hudA;
      ctx.save(); ctx.scale(hs, hs);
      // health
      const x = 30, y = 30;
      ctx.fillStyle = 'rgba(8,6,6,0.7)'; ctx.fillRect(x - 4, y - 4, 228, 18);
      ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.fillRect(x, y, 220 * p.hpGhost / MAX_HP, 10);
      const hg = ctx.createLinearGradient(x, 0, x + 220, 0); hg.addColorStop(0, '#7a1a14'); hg.addColorStop(1, '#e0603a');
      ctx.fillStyle = hg; ctx.fillRect(x, y, 220 * Math.max(0, p.hp) / MAX_HP, 10);
      ctx.strokeStyle = 'rgba(230,190,150,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x - 4.5, y - 4.5, 229, 19);
      text('VITALITY', x, y + 28, 10, 'rgba(230,200,170,0.75)', { align: 'left', spacing: 3 });
      // shells
      for (let i = 0; i < MAG; i++) {
        const sx = x + 92 + i * 16, sy = y + 22, full = i < p.ammo;
        ctx.fillStyle = full ? '#b03a24' : 'rgba(80,60,50,0.5)'; ctx.fillRect(sx, sy, 10, 13);
        ctx.fillStyle = full ? '#d8b060' : 'rgba(80,70,50,0.5)'; ctx.fillRect(sx, sy + 10, 10, 4);
      }
      if (p.reloading) { text('RELOADING', x + 160, y + 28, 10, '#ffcf8a', { align: 'left', spacing: 2 }); ctx.fillStyle = '#ffcf8a'; ctx.fillRect(x + 92 + p.ammo * 16, y + 38, 10 * clamp(p.reloadT / RELOAD_SHELL, 0, 1), 2); }
      else if (p.ammo === 0) text('EMPTY · R', x + 160, y + 28, 10, '#ff8a6a', { align: 'left', spacing: 2 });
      ctx.restore(); ctx.save(); ctx.translate(VIEW_W, 0); ctx.scale(hs, hs); ctx.translate(-VIEW_W, 0);
      text(`${g.score}`, VIEW_W - 30, y + 4, 22, '#f0dcc4', { align: 'right', spacing: 2 });
      text(`ASH CLAIMED ${g.kills}`, VIEW_W - 30, y + 28, 10, 'rgba(230,200,170,0.7)', { align: 'right', spacing: 3 });
      ctx.restore();
      ctx.globalAlpha = 1;
      // boss bar
      if (g.arenaLocked && !g.cine && g.letterbox < 0.3 && boss.state !== 'intro' && boss.state !== 'dormant') {
        ctx.save(); ctx.translate(VIEW_W / 2, VIEW_H); ctx.scale(hs, hs); ctx.translate(-VIEW_W / 2, -VIEW_H);
        const bw = 520, bx = VIEW_W / 2 - bw / 2, by = VIEW_H - 46 - lbOff;
        text(boss.phase === 1 ? 'THE FOUNDRY WARDEN' : 'THE WARDEN · UNBOUND', VIEW_W / 2, by - 14, 13, '#f0dcc4', { spacing: 5 });
        ctx.fillStyle = 'rgba(8,6,6,0.75)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 14);
        const frac = boss.phase === 1 ? boss.armor / BOSS.armor : boss.hp / BOSS.hp;
        const bgr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        if (boss.phase === 1) { bgr.addColorStop(0, '#5a5a5e'); bgr.addColorStop(1, '#b8b2a8'); } else { bgr.addColorStop(0, '#8a2a10'); bgr.addColorStop(1, '#ffb050'); }
        ctx.fillStyle = bgr; ctx.fillRect(bx, by, bw * Math.max(0, frac), 8);
        ctx.strokeStyle = 'rgba(230,190,150,0.5)'; ctx.strokeRect(bx - 3.5, by - 3.5, bw + 7, 15);
        text(boss.phase === 1 ? 'ARMOR' : 'CORE', bx + bw + 14, by + 4, 9, 'rgba(230,200,170,0.7)', { align: 'left', spacing: 2 });
        ctx.restore();
      }
      // popups
      for (const t of g.popups) { ctx.globalAlpha = Math.min(1, t.life * 2); text(t.text, t.x - g.cam.x, t.y - g.cam.y, 13, t.color, { weight: 700, spacing: 2 }); }
      ctx.globalAlpha = 1;
      // area / boss cards
      for (const c of g.cards) {
        const a = c.t < 0.9 ? c.t / 0.9 : c.t > c.dur - 1.1 ? Math.max(0, (c.dur - c.t) / 1.1) : 1;
        if (a <= 0) continue;
        ctx.globalAlpha = a; const cy = g.arenaLocked ? VIEW_H * 0.22 : VIEW_H * 0.36;
        if (c.chapter) text(c.chapter, VIEW_W / 2, cy - 44, 12, 'rgba(230,180,130,0.9)', { spacing: 8 });
        text(c.title, VIEW_W / 2, cy, 40, '#f3e6d4', { spacing: 10 + (1 - a) * 6 });
        ctx.strokeStyle = 'rgba(230,180,130,0.6)'; ctx.lineWidth = 1; const lw = 180 * a; ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - lw, cy + 30); ctx.lineTo(VIEW_W / 2 + lw, cy + 30); ctx.stroke();
        text(c.sub, VIEW_W / 2, cy + 52, 18, 'rgba(230,210,190,0.85)', { font: CJK, spacing: 4 });
      }
      ctx.globalAlpha = 1;
      // control hints
      const used = g.usedActions, learned = ['jump', 'attack', 'shoot', 'roll'].every((k) => used.has(k));
      const hEnd = learned ? Math.min(13, Math.max(6, g.hintT)) : 13, ht = g.hintT;
      const ha = ht < 1.4 ? 0 : ht < 2.4 ? ht - 1.4 : ht > hEnd ? Math.max(0, 1 - (ht - hEnd)) : 1;
      if (ha > 0 && !g.arenaLocked && hs === 1) {
        ctx.globalAlpha = ha * 0.92;
        const hy = coarse ? 112 : VIEW_H - 54;
        ctx.fillStyle = 'rgba(6,5,5,0.6)'; ctx.fillRect(VIEW_W / 2 - 360, hy - 22, 720, 44);
        ctx.strokeStyle = 'rgba(230,180,130,0.35)'; ctx.strokeRect(VIEW_W / 2 - 360.5, hy - 22.5, 721, 45);
        const items = coarse ? [['◀ ▶', 'move'], ['JUMP', 'leap'], ['SLASH', '3-hit combo'], ['FIRE', 'shotgun'], ['ROLL', 'evade'], ['↻', 'reload']] : [['A D', 'move'], ['W / SPACE', 'jump'], ['J', 'slash ×3'], ['K', 'shotgun'], ['L / SHIFT', 'roll'], ['R', 'reload']];
        const step = 720 / items.length;
        items.forEach(([k, v], i) => { const cx = VIEW_W / 2 - 360 + step * (i + 0.5); text(k, cx, hy - 7, 12, used.has(['left', 'jump', 'attack', 'shoot', 'roll', 'reload'][i]) ? '#ffcf8a' : '#f3e6d4', { weight: 700, spacing: 2 }); text(v, cx, hy + 10, 10, 'rgba(220,200,180,0.7)', { spacing: 1 }); });
        ctx.globalAlpha = 1;
      }
      if (p.dead && p.deadT > 0.6) {
        const a = Math.min(1, (p.deadT - 0.6) / 0.6);
        ctx.fillStyle = `rgba(0,0,0,${a * 0.55})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.globalAlpha = a; text('YOU FELL', VIEW_W / 2, VIEW_H / 2 - 10, 46, '#d8b8a0', { spacing: 14 }); text('the ash remembers your last ember', VIEW_W / 2, VIEW_H / 2 + 34, 14, 'rgba(220,200,180,0.7)', { spacing: 3 }); ctx.globalAlpha = 1;
      }
      if (userPaused) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); text('PAUSED', VIEW_W / 2, VIEW_H / 2, 36, '#f3e6d4', { spacing: 12 }); text('press P to continue', VIEW_W / 2, VIEW_H / 2 + 36, 13, 'rgba(220,200,180,0.7)', { spacing: 3 }); }
    } else if (g.mode === 'title') {
      const t = g.titleT, a = clamp((t - 0.3) / 1.5, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.35})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = a;
      text('A S H F A L L', VIEW_W / 2, VIEW_H * 0.38, 64, '#f3e6d4', { spacing: 8 });
      text('灰 烬 降 临', VIEW_W / 2, VIEW_H * 0.38 + 50, 20, 'rgba(230,200,170,0.85)', { font: CJK, spacing: 6 });
      ctx.strokeStyle = 'rgba(230,180,130,0.6)'; ctx.beginPath(); ctx.moveTo(VIEW_W / 2 - 140, VIEW_H * 0.38 + 78); ctx.lineTo(VIEW_W / 2 + 140, VIEW_H * 0.38 + 78); ctx.stroke();
      text('through the dead woods, the hollow quarter and the iron foundry', VIEW_W / 2, VIEW_H * 0.38 + 100, 13, 'rgba(220,200,180,0.7)', { spacing: 2 });
      ctx.globalAlpha = a * (0.55 + Math.sin(t * 3) * 0.35);
      text(coarse ? 'TAP TO BEGIN' : 'PRESS ANY KEY TO BEGIN', VIEW_W / 2, VIEW_H * 0.72, 15, '#ffcf8a', { spacing: 6 });
      const best = services.storage?.get('ashfall-best', 0) ?? 0;
      if (best) { ctx.globalAlpha = a * 0.7; text(`BEST ${best}`, VIEW_W / 2, VIEW_H * 0.72 + 30, 11, 'rgba(220,200,180,0.8)', { spacing: 4 }); }
    } else if (g.mode === 'victory') {
      const t = g.victoryT, a = clamp(t / 1.5, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = a;
      text('THE FOUNDRY FALLS SILENT', VIEW_W / 2, VIEW_H * 0.3, 36, '#f3e6d4', { spacing: 8 });
      text('铸 炉 归 于 沉 寂', VIEW_W / 2, VIEW_H * 0.3 + 44, 18, 'rgba(230,200,170,0.85)', { font: CJK, spacing: 4 });
      const m = Math.floor(g.playT / 60), s = Math.floor(g.playT % 60);
      const rows = [['TIME', `${m}:${String(s).padStart(2, '0')}`], ['ASH CLAIMED', `${g.kills}`], ['FALLS', `${g.deaths}`], ['TIME BONUS', `+${g.timeBonus || 0}`], ['SCORE', `${g.score}`]];
      rows.forEach(([k, v], i) => { const y = VIEW_H * 0.48 + i * 26; ctx.globalAlpha = clamp((t - 1 - i * 0.25) / 0.5, 0, 1); text(k, VIEW_W / 2 - 20, y, 12, 'rgba(220,200,180,0.75)', { align: 'right', spacing: 3 }); text(v, VIEW_W / 2 + 20, y, 16, i === 4 ? '#ffcf8a' : '#f3e6d4', { align: 'left', spacing: 2, weight: i === 4 ? 700 : 400 }); });
      if (t > 2.5) { ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.35; text(coarse ? 'TAP TO DESCEND AGAIN' : 'PRESS ENTER TO DESCEND AGAIN', VIEW_W / 2, VIEW_H * 0.86, 13, '#ffcf8a', { spacing: 5 }); }
    }
    ctx.restore();
  }

  // ---------- loop ----------
  resetGame();
  if (coarse) startGame(); // the shell's "Start game" tap already was the start gesture

  let raf = 0, last = 0, acc = 0, destroyed = false;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : DT; last = now;
    audio.setMuted(!!services.sound?.muted);
    if (!shellPaused && !userPaused && !(debug && g.manual)) {
      acc += dt; let n = 0;
      while (acc >= DT && n < 6) { tick(DT); acc -= DT; n++; }
      if (n === 6) acc = 0;
    }
    render();
  }
  raf = requestAnimationFrame(frame);

  if (debug) {
    globalThis.__ashfall = {
      get g() { return g; }, get player() { return player; }, get boss() { return boss; }, get enemies() { return enemies; },
      start() { startGame(); }, bot(on = true) { g.bot = on; }, manual(on = true) { g.manual = on; },
      step(n = 1) { for (let i = 0; i < n; i++) tick(DT); }, render() { render(); },
      warp(x) { player.x = x; player.y = surfaceY(x, 0) ?? FLOOR; player.safe = { x: player.x, y: player.y }; g.cam.x = clamp(x - VIEW_W * 0.42, 0, WORLD_END - VIEW_W); for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (x >= CHECKPOINTS[i]) { g.cpIdx = Math.max(g.cpIdx, i); break; } },
      press(a, d = true) { pressAction(a, d); }
    };
  }

  return {
    pause() { shellPaused = true; audio.suspend(); clearInput(); },
    resume() { shellPaused = false; last = 0; if (!userPaused) audio.resume(); },
    restart() { resetGame(); startGame(); userPaused = false; },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); ro?.disconnect(); audio.destroy();
      listeners.forEach(([t, type, fn, opt]) => t.removeEventListener(type, fn, opt));
      if (globalThis.__ashfall) delete globalThis.__ashfall;
      host.replaceChildren();
    }
  };
}
