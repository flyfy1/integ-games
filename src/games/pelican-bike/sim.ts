import { buildRows, LEVELS, ROWS } from './levels';
import { MAXST, PH, PW, T, W, WATER_Y } from './theme';
import type { Checkpoint, Crumble, Enemy, Goal, Item, Mover, Spring } from './types';

/** Headless, deterministic simulation of one stage. No DOM, no audio, no randomness: the game shell and the tests both drive it. */

export const STEP = 1 / 120;
export const PICKUP_R = 38;
export const DEAD_TIME = 0.8;
const BUCKET = 160;

export type Input = { left: boolean; right: boolean; down: boolean; jump: boolean; turbo: boolean; jumpPressed: boolean };
export const noInput = (): Input => ({ left: false, right: false, down: false, jump: false, turbo: false, jumpPressed: false });

export type SimEventKind = 'jump' | 'flap' | 'land' | 'fish' | 'star' | 'stomp' | 'crate' | 'spring' | 'hurt' | 'die' | 'check' | 'oneup' | 'crumble' | 'jelly' | 'clear' | 'respawn';
export type SimEvent = { k: SimEventKind; x: number; y: number; n?: number; s?: string };

export type Player = {
  x: number; y: number; vx: number; vy: number; dir: number;
  ground: boolean; coyote: number; jbuf: number; jumps: number; cut: boolean;
  stamina: number; gliding: boolean; turbo: boolean;
  hp: number; maxHp: number; inv: number; hurtT: number; dead: boolean; deadT: number;
  wheel: number; pedal: number; tilt: number; pouch: number; flap: number; sx: number; sy: number;
  streak: number; streakT: number; riding: number;
};

export type Sim = {
  lv: number;
  grid: string[][]; cols: number; worldW: number;
  items: Item[]; itemBuckets: number[][]; enemies: Enemy[]; enemySpawn: Enemy[]; movers: Mover[]; crumbles: Crumble[]; springs: Spring[]; checks: Checkpoint[]; goal: Goal;
  P: Player;
  spawnX: number; spawnY: number;
  time: number; fishGot: number; fishTot: number; starGot: number; starTot: number;
  deaths: number; hits: number; score: number; cleared: boolean; timeBonus: number;
  events: SimEvent[];
};

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function newPlayer(): Player {
  return {
    x: 80, y: 300, vx: 0, vy: 0, dir: 1, ground: false, coyote: 0, jbuf: 0, jumps: 0, cut: false,
    stamina: MAXST, gliding: false, turbo: false, hp: 3, maxHp: 3, inv: 0, hurtT: 0, dead: false, deadT: 0,
    wheel: 0, pedal: 0, tilt: 0, pouch: 0, flap: 0, sx: 1, sy: 1, streak: 0, streakT: 0, riding: -1
  };
}

export function createSim(lv: number, baseScore = 0): Sim {
  const rows = buildRows(lv);
  const cols = rows[0].length;
  const s: Sim = {
    lv, grid: Array.from({ length: ROWS }, () => new Array<string>(cols).fill('.')), cols, worldW: cols * T,
    items: [], itemBuckets: [], enemies: [], enemySpawn: [], movers: [], crumbles: [], springs: [], checks: [], goal: { x: cols * T - 200, y: 440 },
    P: newPlayer(), spawnX: 80, spawnY: 300,
    time: 0, fishGot: 0, fishTot: 0, starGot: 0, starTot: 0, deaths: 0, hits: 0, score: baseScore, cleared: false, timeBonus: 0, events: []
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = rows[r][c], wx = c * T, wy = r * T;
      if (ch === '#' || ch === 'B' || ch === '=' || ch === '^') s.grid[r][c] = ch;
      else if (ch === 'x') { s.grid[r][c] = 'x'; s.crumbles.push({ r, c, x: wx, y: wy, state: 0, t: 0 }); }
      else if (ch === 'P') { s.spawnX = wx; s.spawnY = wy + T - PH; }
      else if (ch === 'o') { s.items.push({ type: 'fish', x: wx + 20, y: wy + 20, ph: (c + r) * 0.5, got: false }); s.fishTot++; }
      else if (ch === '*') { s.items.push({ type: 'star', x: wx + 20, y: wy + 20, ph: c * 0.3, got: false }); s.starTot++; }
      else if (ch === 'S') s.springs.push({ x: wx + 4, y: wy + 16, w: 32, h: 24, comp: 0 });
      else if (ch === 'C') s.checks.push({ x: wx + 8, y: wy - 24, w: 24, h: 64, active: false });
      else if (ch === 'F') s.goal = { x: wx + 20, y: wy + 40 };
      else if (ch === 'c') s.enemies.push({ type: 'crab', x: wx + 4, y: wy + 12, w: 32, h: 28, vx: -65, vy: 0, dir: -1, dead: false, t: c });
      else if (ch === 'g') s.enemies.push({ type: 'gull', x: wx, y: wy, baseX: wx, baseY: wy, w: 36, h: 26, vx: -95, vy: 0, dir: -1, dead: false, t: c * 0.7 });
      else if (ch === 'j') s.enemies.push({ type: 'jelly', x: wx + 5, y: WATER_Y + 6, baseY: wy - 70, w: 30, h: 34, vx: 0, vy: 0, dir: 1, state: 'wait', t: (c % 5) * 0.4, dead: false });
      else if (ch === 'h') s.movers.push({ x: wx, y: wy, ox: wx, oy: wy, w: 96, h: 18, dx: 180, dy: 0, sp: 1.5, t: 0, vx: 0, vy: 0 });
      else if (ch === 'v') s.movers.push({ x: wx, y: wy, ox: wx, oy: wy, w: 88, h: 18, dx: 0, dy: -165, sp: 1.6, t: 0, vx: 0, vy: 0 });
    }
  }
  s.enemySpawn = s.enemies.map((e) => ({ ...e }));
  s.itemBuckets = Array.from({ length: Math.ceil(s.worldW / BUCKET) + 1 }, () => [] as number[]);
  s.items.forEach((it, i) => s.itemBuckets[Math.floor(it.x / BUCKET)].push(i));
  placePlayer(s);
  s.P.inv = 0;
  return s;
}

function placePlayer(s: Sim) {
  const hp = s.P.maxHp;
  s.P = newPlayer();
  s.P.maxHp = hp; s.P.hp = hp;
  s.P.x = s.spawnX; s.P.y = s.spawnY; s.P.inv = 1;
}

/** Back to the last checkpoint. Collected fish and stars stay collected; enemies and crumbling blocks come back. */
export function respawn(s: Sim) {
  s.enemies = s.enemySpawn.map((e) => ({ ...e }));
  s.crumbles = s.crumbles.map((cr) => (cr.state === 0 ? cr : { ...cr, state: 0, t: 0 }));
  for (const cr of s.crumbles) setCell(s, cr.r, cr.c, 'x');
  placePlayer(s);
  s.events.push({ k: 'respawn', x: s.P.x, y: s.P.y });
}

/**
 * Cheap copy for look-ahead search. Tiles, items, checkpoints and anything at rest are shared and copied only when
 * they change. Far-off enemies are shared too, so step a clone for a fraction of a second at most before cloning again.
 */
export function cloneSim(s: Sim): Sim {
  const px = s.P.x;
  return {
    ...s,
    grid: s.grid.slice(), items: s.items.slice(), checks: s.checks.slice(),
    enemies: s.enemies.map((e) => (e.type !== 'jelly' && !e.dead && Math.abs(e.x - px) > W * 1.1 + 160 ? e : { ...e })),
    movers: s.movers.map((m) => ({ ...m })),
    crumbles: s.crumbles.map((c) => (c.state === 0 ? c : { ...c })), springs: s.springs.map((c) => (c.comp === 0 ? c : { ...c })),
    P: { ...s.P }, events: []
  };
}

function setCell(s: Sim, r: number, c: number, ch: string) {
  if (s.grid[r][c] === ch) return;
  const row = s.grid[r].slice();
  row[c] = ch;
  s.grid[r] = row;
}

export const isSolidAt = (s: Sim, r: number, c: number) => {
  if (r < 0) return false;
  if (r >= ROWS || c < 0 || c >= s.cols) return c < 0 || c >= s.cols;
  const ch = s.grid[r][c];
  return ch === '#' || ch === 'B' || ch === 'x';
};
const isOneWay = (s: Sim, r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < s.cols && s.grid[r][c] === '=';
const isSpike = (s: Sim, r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < s.cols && s.grid[r][c] === '^';

function addScore(s: Sim, pts: number) { s.score += pts; }

function kill(s: Sim, reason: string) {
  const P = s.P;
  if (P.dead) return;
  P.dead = true; P.deadT = DEAD_TIME; P.vy = -440; P.vx = 0; P.hp = 0;
  s.deaths++;
  s.events.push({ k: 'die', x: P.x + PW / 2, y: reason === 'water' ? WATER_Y : P.y + PH / 2, s: reason });
}

function hurt(s: Sim, reason: string) {
  const P = s.P;
  if (P.inv > 0 || P.dead) return;
  P.hp--; P.streak = 0; P.pouch = 0.4; s.hits++;
  if (P.hp <= 0) { kill(s, reason); return; }
  s.events.push({ k: 'hurt', x: P.x + PW / 2, y: P.y + 18, s: reason });
  P.inv = 1.5; P.hurtT = 0.25; P.cut = false;
  P.vy = -370; P.vx = -P.dir * 200; P.ground = false;
}

/** Advance one fixed step. `inp.jumpPressed` is consumed by the caller (set it for exactly one step per press). */
export function stepSim(s: Sim, inp: Input, dt: number = STEP) {
  if (s.cleared) return;
  const P = s.P;
  s.time += dt;

  for (const m of s.movers) {
    m.t += dt * m.sp;
    const nx = m.ox + Math.sin(m.t) * m.dx;
    const ny = m.oy + (1 - Math.cos(m.t)) * 0.5 * m.dy;
    m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt;
    m.x = nx; m.y = ny;
  }

  for (const cr of s.crumbles) {
    if (cr.state === 0) continue;
    if (cr.state === 1) {
      cr.t -= dt;
      if (cr.t <= 0) { cr.state = 2; cr.t = 3.2; setCell(s, cr.r, cr.c, '.'); s.events.push({ k: 'crumble', x: cr.x + 20, y: cr.y + 20 }); }
    } else if (cr.state === 2) {
      cr.t -= dt;
      if (cr.t <= 0 && !overlap(P.x, P.y, PW, PH, cr.x, cr.y, T, T)) { cr.state = 0; setCell(s, cr.r, cr.c, 'x'); }
    }
  }
  for (const sp of s.springs) if (sp.comp > 0) sp.comp = Math.max(0, sp.comp - dt * 3.5);

  if (P.dead) {
    P.vy += 1100 * dt; P.y += P.vy * dt; P.tilt += 7 * dt;
    P.deadT -= dt;
    if (P.deadT <= 0) respawn(s);
    return;
  }

  if (P.inv > 0) P.inv = Math.max(0, P.inv - dt);
  if (P.hurtT > 0) P.hurtT = Math.max(0, P.hurtT - dt);
  if (P.pouch > 0) P.pouch = Math.max(0, P.pouch - dt * 2.4);
  if (P.streakT > 0) { P.streakT -= dt; if (P.streakT <= 0) P.streak = 0; }
  P.sx = lerp(P.sx, 1, dt * 12); P.sy = lerp(P.sy, 1, dt * 12);

  const ride = P.riding >= 0 ? s.movers[P.riding] : null;
  if (ride) { P.x += ride.vx * dt; P.y += ride.vy * dt; }

  const inDir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (inDir !== 0 && P.hurtT <= 0) P.dir = inDir;

  P.turbo = inp.turbo && P.stamina > 0.08 && inDir !== 0 && P.hurtT <= 0;
  if (P.turbo) P.stamina = Math.max(0, P.stamina - dt * 0.55);
  const maxSpd = P.turbo ? 435 : 300;
  const accel = P.ground ? 1650 : 1050;
  const fric = P.ground ? 1350 : 260;

  if (P.hurtT <= 0) {
    if (inDir !== 0) {
      if (P.vx * inDir < 0) P.vx += inDir * accel * 1.65 * dt;
      else if (Math.abs(P.vx) <= maxSpd) P.vx = clamp(P.vx + inDir * accel * dt, -maxSpd, maxSpd);
      else P.vx -= Math.sign(P.vx) * Math.min(Math.abs(P.vx) - maxSpd, 700 * dt); // ease out of a sprint instead of snapping
    } else if (Math.abs(P.vx) <= fric * dt) P.vx = 0;
    else P.vx -= Math.sign(P.vx) * fric * dt;
  }

  if (P.ground) {
    P.coyote = 0.11; P.jumps = 0;
    if (!P.turbo) P.stamina = Math.min(MAXST, P.stamina + dt * 0.95);
  } else P.coyote = Math.max(0, P.coyote - dt);

  if (inp.jumpPressed) P.jbuf = 0.13;
  else P.jbuf = Math.max(0, P.jbuf - dt);

  if (P.jbuf > 0) {
    if (inp.down && P.ground) {
      const br = Math.floor((P.y + PH + 2) / T);
      const c0 = Math.floor((P.x + 4) / T), c1 = Math.floor((P.x + PW - 4) / T);
      if ((isOneWay(s, br, c0) || isOneWay(s, br, c1)) && !isSolidAt(s, br, c0) && !isSolidAt(s, br, c1)) { P.y += 12; P.ground = false; P.coyote = 0; P.jbuf = 0; }
    }
    if (P.jbuf > 0 && P.coyote > 0) {
      P.vy = -515; P.ground = false; P.coyote = 0; P.jbuf = 0; P.jumps = 1; P.riding = -1; P.cut = true;
      P.sx = 0.8; P.sy = 1.24;
      s.events.push({ k: 'jump', x: P.x + PW / 2, y: P.y + PH });
    } else if (P.jbuf > 0 && P.jumps < 2 && P.stamina >= 0.22) {
      P.vy = -455; P.jumps = 2; P.jbuf = 0; P.stamina = Math.max(0, P.stamina - 0.28); P.cut = true;
      P.sx = 1.22; P.sy = 0.82; P.flap = 1;
      s.events.push({ k: 'flap', x: P.x + PW / 2, y: P.y + PH - 10 });
    }
  }
  // Variable jump height: letting go early trims a hop, but never a spring launch, a stomp bounce or a knock-back.
  if (P.cut && !inp.jump && P.vy < -200) { P.vy *= 0.45; P.cut = false; }
  if (P.vy >= 0) P.cut = false;

  P.gliding = !P.ground && P.vy > 0 && inp.jump && P.stamina > 0;
  if (P.gliding) {
    P.stamina = Math.max(0, P.stamina - dt * 0.42);
    P.vy = Math.min(P.vy + 420 * dt, 125);
    P.flap += dt * 16;
  } else {
    P.vy = Math.min(P.vy + 1380 * dt, 780);
    if (P.flap > 0 && P.flap <= 1) P.flap = Math.max(0, P.flap - dt * 2.5); else if (P.flap > 1) P.flap = 0;
  }

  P.x += P.vx * dt;
  if (P.x < 0) { P.x = 0; P.vx = 0; }
  const rTop = Math.floor((P.y + 4) / T), rBot = Math.floor((P.y + PH - 4) / T);
  if (P.vx > 0 || (ride && ride.vx > 0)) {
    const cRight = Math.floor((P.x + PW) / T);
    for (let r = rTop; r <= rBot; r++) if (isSolidAt(s, r, cRight)) { P.x = cRight * T - PW; P.vx = Math.min(0, P.vx); break; }
  }
  if (P.vx < 0 || (ride && ride.vx < 0)) {
    const cLeft = Math.floor(P.x / T);
    for (let r = rTop; r <= rBot; r++) if (isSolidAt(s, r, cLeft)) { P.x = (cLeft + 1) * T; P.vx = Math.max(0, P.vx); break; }
  }

  const prevBottom = P.y + PH;
  const wasGround = P.ground;
  const fallV = P.vy;
  P.y += P.vy * dt;
  P.ground = false; P.riding = -1;

  const cL = Math.floor((P.x + 5) / T), cR = Math.floor((P.x + PW - 5) / T);
  if (P.vy >= 0) {
    const rB = Math.floor((P.y + PH) / T);
    for (let c = cL; c <= cR; c++) {
      if (isSolidAt(s, rB, c) || (isOneWay(s, rB, c) && prevBottom <= rB * T + 10 && !(inp.down && inp.jump))) {
        P.y = rB * T - PH; P.vy = 0; P.ground = true;
        if (s.grid[rB]?.[c] === 'x') for (let i = 0; i < s.crumbles.length; i++) { const cr = s.crumbles[i]; if (cr.r === rB && cr.c === c && cr.state === 0) s.crumbles[i] = { ...cr, state: 1, t: 0.42 }; }
      }
    }
    for (let i = 0; i < s.movers.length; i++) {
      const m = s.movers[i];
      if (P.x + PW - 4 > m.x && P.x + 4 < m.x + m.w && prevBottom <= m.y + 12 + Math.max(0, m.vy * dt) && P.y + PH >= m.y && P.y + PH <= m.y + m.h + 14) {
        P.y = m.y - PH; P.vy = 0; P.ground = true; P.riding = i;
        break;
      }
    }
    if (P.ground && !wasGround && fallV > 160) {
      P.sx = 1.18; P.sy = 0.84;
      s.events.push({ k: 'land', x: P.x + PW / 2, y: P.y + PH });
    }
  } else {
    const rT = Math.floor(P.y / T);
    for (let c = cL; c <= cR; c++) {
      if (isSolidAt(s, rT, c)) {
        P.y = (rT + 1) * T; P.vy = 0;
        if (s.grid[rT]?.[c] === 'B') {
          setCell(s, rT, c, '.'); addScore(s, 50);
          s.events.push({ k: 'crate', x: c * T + 20, y: rT * T + 20, n: 50 });
        }
        break;
      }
    }
  }

  P.wheel += P.vx * dt * 0.095;
  P.pedal += P.vx * dt * 0.055;
  const targetTilt = P.ground ? (P.turbo ? P.dir * 0.14 : 0) : clamp(P.vy * 0.0007 * P.dir, -0.38, 0.38);
  P.tilt = lerp(P.tilt, targetTilt, dt * 10);

  if (P.y + PH > WATER_Y + 14) { kill(s, 'water'); return; }
  // Urchins only sting inside their drawn body, not across the whole tile.
  const sr0 = Math.floor((P.y + 10) / T), sr1 = Math.floor((P.y + PH - 4) / T);
  const sc0 = Math.floor((P.x + 6) / T), sc1 = Math.floor((P.x + PW - 6) / T);
  for (let r = sr0; r <= sr1; r++) for (let c = sc0; c <= sc1; c++) {
    if (isSpike(s, r, c) && overlap(P.x + 4, P.y + 6, PW - 8, PH - 6, c * T + 6, r * T + 12, T - 12, T - 12)) hurt(s, 'spike');
  }
  if (P.dead) return;

  for (let i = 0; i < s.springs.length; i++) {
    let sp = s.springs[i];
    if (overlap(P.x, P.y, PW, PH, sp.x, sp.y, sp.w, sp.h) && P.vy >= -50) {
      sp = s.springs[i] = { ...sp };
      P.vy = -790; P.ground = false; P.coyote = 0; P.jumps = 1; P.stamina = MAXST; P.cut = false; P.riding = -1;
      P.sx = 0.72; P.sy = 1.35; sp.comp = 1;
      s.events.push({ k: 'spring', x: sp.x + 16, y: sp.y + 8 });
    }
  }

  for (let i = 0; i < s.checks.length; i++) {
    let ck = s.checks[i];
    if (!ck.active && overlap(P.x, P.y, PW, PH, ck.x, ck.y, ck.w, ck.h)) {
      ck = s.checks[i] = { ...ck, active: true }; s.spawnX = ck.x - 6; s.spawnY = ck.y + ck.h - PH;
      P.hp = P.maxHp; P.stamina = MAXST;
      s.events.push({ k: 'check', x: ck.x + 12, y: ck.y });
    }
  }

  const b0 = Math.max(0, Math.floor((P.x - PICKUP_R) / BUCKET)), b1 = Math.min(s.itemBuckets.length - 1, Math.floor((P.x + PW + PICKUP_R) / BUCKET));
  for (let b = b0; b <= b1; b++) for (const i of s.itemBuckets[b]) {
    const it = s.items[i];
    if (it.got) continue;
    const dx = (P.x + PW / 2) - it.x, dy = (P.y + PH / 2) - it.y;
    if (dx * dx + dy * dy < PICKUP_R * PICKUP_R) {
      s.items[i] = { ...it, got: true }; P.pouch = 1;
      if (it.type === 'fish') {
        s.fishGot++; P.streak++; P.streakT = 2.2;
        P.stamina = Math.min(MAXST, P.stamina + 0.22);
        const mult = Math.min(4, 1 + Math.floor(P.streak / 5));
        addScore(s, 100 * mult);
        s.events.push({ k: 'fish', x: it.x, y: it.y, n: 100 * mult, s: mult > 1 ? `x${mult}` : '' });
        if (s.fishGot % 25 === 0 && P.hp < P.maxHp) { P.hp++; s.events.push({ k: 'oneup', x: P.x + PW / 2, y: P.y - 16 }); }
      } else {
        s.starGot++; P.stamina = MAXST;
        addScore(s, 500);
        s.events.push({ k: 'star', x: it.x, y: it.y, n: 500 });
      }
    }
  }

  for (const e of s.enemies) {
    if (e.dead) { if (e.y < 700) { e.y += e.vy * dt; e.vy += 980 * dt; } continue; }
    if (Math.abs(e.x - P.x) > W * 1.1) continue;
    e.t += dt;
    if (e.type === 'crab') {
      e.x += e.vx * dt;
      const fc = Math.floor((e.x + (e.vx > 0 ? e.w + 2 : -2)) / T);
      const fr = Math.floor((e.y + e.h / 2) / T);
      const gr = Math.floor((e.y + e.h + 4) / T);
      if (isSolidAt(s, fr, fc) || isSpike(s, fr, fc) || (!isSolidAt(s, gr, fc) && !isOneWay(s, gr, fc))) { e.vx = -e.vx; e.dir = Math.sign(e.vx); }
    } else if (e.type === 'gull') {
      e.x += e.vx * dt;
      if (Math.abs(e.x - (e.baseX ?? e.x)) > 150) { e.vx = -e.vx; e.dir = Math.sign(e.vx); }
      e.y = (e.baseY ?? e.y) + Math.sin(e.t * 3.4) * 26;
    } else if (e.type === 'jelly') {
      if (e.state === 'wait') {
        e.y = WATER_Y + 6;
        if (e.t > 1.35) { e.state = 'jump'; e.vy = -590; s.events.push({ k: 'jelly', x: e.x + e.w / 2, y: WATER_Y }); }
      } else {
        e.y += e.vy * dt; e.vy += 680 * dt;
        if (e.y >= WATER_Y + 6 && e.vy > 0) { e.state = 'wait'; e.t = 0; }
      }
    }

    if (overlap(P.x + 4, P.y + 4, PW - 8, PH - 6, e.x + 2, e.y + 2, e.w - 4, e.h - 4)) {
      const stomp = P.vy > 40 && (P.y + PH - P.vy * dt) <= e.y + 20 && e.type !== 'jelly';
      if (stomp) {
        e.dead = true; e.vy = -220;
        P.vy = inp.jump ? -510 : -390; P.jumps = 1; P.cut = false; P.stamina = Math.min(MAXST, P.stamina + 0.35);
        P.sx = 1.2; P.sy = 0.8;
        addScore(s, 200);
        s.events.push({ k: 'stomp', x: e.x + e.w / 2, y: e.y + e.h / 2, n: 200 });
      } else hurt(s, e.type);
    }
  }
  if (P.dead) return;

  // Reaching the lighthouse counts at any height: a rider who glides over the top has still arrived.
  if (P.x + PW / 2 > s.goal.x - 36) {
    s.timeBonus = Math.max(0, Math.round((LEVELS[s.lv].par - s.time) * 20));
    addScore(s, 1000 + s.timeBonus);
    s.cleared = true;
    s.events.push({ k: 'clear', x: s.goal.x, y: s.goal.y - 60, n: 1000 + s.timeBonus });
  }
}

/** Medals for a finished stage: bit 0 beat the par time, bit 1 all three stars, bit 2 at least 90% of the fish. */
export function medalsFor(s: { lv: number; time: number; starGot: number; starTot: number; fishGot: number; fishTot: number }): number {
  return (s.time <= LEVELS[s.lv].par ? 1 : 0) | (s.starTot > 0 && s.starGot >= s.starTot ? 2 : 0) | (s.fishGot >= Math.ceil(s.fishTot * 0.9) ? 4 : 0);
}

export type StageBest = { time: number; fish: number; stars: number; medals: number };
/** Merge a finished run into the stored best for its stage. Medals accumulate; time, fish and stars keep their best. */
export function mergeBest(prev: StageBest | null | undefined, run: StageBest): StageBest {
  if (!prev) return { ...run };
  return { time: Math.min(prev.time, run.time), fish: Math.max(prev.fish, run.fish), stars: Math.max(prev.stars, run.stars), medals: prev.medals | run.medals };
}
