/**
 * Pocket Survivor simulation. Deterministic and DOM-free: the only randomness is the injected `rng`, and time only
 * advances through `step`, one fixed tick at a time, so a seed plus an input log always replays the same run.
 */
import { BLADES, BOLT, ENEMIES, LANCE, MAX_LEVEL, METEOR, PASSIVE_CARDS, PASSIVE_IDS, PULSE, WEAPON_CARDS, WEAPON_IDS, xpNeed, type EnemyKind, type PassiveId, type WeaponId } from './data';

export const STEP = 1 / 60;
/** The Warden arrives at this run time; beating it wins the run and opens endless mode. */
export const BOSS_TIME = 300;
export const SPAWN_RADIUS = 430;
export const PLAYER_R = 9;
export const MAX_ENEMIES = 280;
const MAX_GEMS = 220, CELL = 56, INVULN = 0.7, CRIT = 0.08;

export type Rng = () => number;
export type Input = { mx: number; my: number; burst: boolean };
export type Enemy = {
  id: number; kind: EnemyKind; elite: boolean; x: number; y: number; kx: number; ky: number; hp: number; maxHp: number; r: number; speed: number; dmg: number; mass: number;
  flash: number; bladeCd: number; slow: number; ring: number; t: number; cd: number; mode: number; dx: number; dy: number; face: number; atk: number;
};
export type Gem = { x: number; y: number; value: number; kind: 'xp' | 'heart' | 'magnet'; pull: boolean; taken: boolean; speed: number; age: number };
export type Shot = { x: number; y: number; vx: number; vy: number; dmg: number; pierce: number; life: number; target: Enemy | null; hit: number[]; blast: boolean };
export type EnemyShot = { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; source: EnemyKind };
export type Ring = { id: number; r: number; maxR: number; dmg: number; knock: number; slow: boolean; burst: boolean };
export type Zone = { x: number; y: number; r: number; t: number; max: number; dmg: number };
export type Beam = { x: number; y: number; angle: number; length: number; width: number; life: number };
export type Card = { key: WeaponId | PassiveId | 'heal' | 'bounty'; kind: 'weapon' | 'passive' | 'bonus'; name: string; tag: string; desc: string; color: string; evolve: boolean };
export type SimEvent =
  | { type: 'dmg'; x: number; y: number; amount: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; r: number; kind: EnemyKind; elite: boolean }
  | { type: 'hurt'; amount: number }
  | { type: 'gem'; kind: Gem['kind']; value: number }
  | { type: 'levelup' } | { type: 'burst' } | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'banner'; text: string; tone: 'warn' | 'good' }
  | { type: 'bossdown'; x: number; y: number } | { type: 'dead' };

export type State = {
  rng: Rng; phase: 'play' | 'levelup' | 'dead'; time: number; tick: number; nextId: number;
  px: number; py: number; faceX: number; faceY: number; moving: boolean; hp: number; maxHp: number; invuln: number;
  level: number; xp: number; need: number; kills: number; score: number; burst: number; burstNeed: number;
  weapons: Record<WeaponId, number>; passives: Record<PassiveId, number>;
  boltCd: number; pulseCd: number; lanceCd: number; meteorCd: number; bladeAngle: number;
  enemies: Enemy[]; gems: Gem[]; shots: Shot[]; enemyShots: EnemyShot[]; rings: Ring[]; zones: Zone[]; beams: Beam[];
  spawnAcc: number; nextSwarm: number; nextElite: number; nextBoss: number; eliteCount: number; bossesDown: number; boss: Enemy | null; won: boolean; wonAt: number; killer: string;
  choices: Card[]; events: SimEvent[]; grid: Map<number, Enemy[]>;
};

export function createState(rng: Rng): State {
  return {
    rng, phase: 'play', time: 0, tick: 0, nextId: 1,
    px: 0, py: 0, faceX: 1, faceY: 0, moving: false, hp: 120, maxHp: 120, invuln: 0,
    level: 1, xp: 0, need: xpNeed(1), kills: 0, score: 0, burst: 0, burstNeed: 25,
    weapons: { bolt: 1, blades: 0, pulse: 0, lance: 0, meteor: 0 }, passives: { might: 0, haste: 0, vitality: 0, magnet: 0, quick: 0, regen: 0 },
    boltCd: 0.5, pulseCd: 1, lanceCd: 1, meteorCd: 1, bladeAngle: 0,
    enemies: [], gems: [], shots: [], enemyShots: [], rings: [], zones: [], beams: [],
    spawnAcc: 0, nextSwarm: 50, nextElite: 60, nextBoss: BOSS_TIME, eliteCount: 0, bossesDown: 0, boss: null, won: false, wonAt: 0, killer: '',
    choices: [], events: [], grid: new Map()
  };
}

// ---- derived stats ----------------------------------------------------------------------------------------------------
export const might = (s: State) => 1 + 0.15 * s.passives.might;
export const moveSpeed = (s: State) => 150 * (1 + 0.08 * s.passives.haste);
export const pickupRadius = (s: State) => 78 * (1 + 0.35 * s.passives.magnet);
export const cooldownScale = (s: State) => 1 - 0.08 * s.passives.quick;
/** Threat curve. Exported so tests and the HUD can read the same numbers the director uses. */
export function threat(s: State) {
  const minutes = s.time / 60, endless = s.won ? (s.time - s.wonAt) / 60 : 0;
  return {
    hp: (1 + minutes * 0.5 + minutes * minutes * 0.42) * Math.pow(1.5, endless),
    dmg: 1 + minutes * 0.16 + endless * 0.35,
    speed: 1 + Math.min(0.36, minutes * 0.045) + endless * 0.14,
    rate: (1.4 + s.time * 0.052 + endless * 4) * (s.boss ? 0.6 : 1)
  };
}

// ---- spatial grid -----------------------------------------------------------------------------------------------------
const cellKey = (cx: number, cy: number) => ((cx + 4096) << 13) | (cy + 4096);
function rebuildGrid(s: State) {
  s.grid.forEach(list => { list.length = 0; });
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    const key = cellKey(Math.floor(enemy.x / CELL), Math.floor(enemy.y / CELL));
    let list = s.grid.get(key);
    if (!list) { list = []; s.grid.set(key, list); }
    list.push(enemy);
  }
  if (s.grid.size > 1500) s.grid.clear();
}
/** Calls `visit` for every live enemy whose cell overlaps the circle; the caller still does the exact distance test. */
function near(s: State, x: number, y: number, radius: number, visit: (enemy: Enemy) => void) {
  const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL), y0 = Math.floor((y - radius) / CELL), y1 = Math.floor((y + radius) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const list = s.grid.get(cellKey(cx, cy));
    if (list) for (let index = 0; index < list.length; index++) if (list[index].hp > 0) visit(list[index]);
  }
}

// ---- spawning ---------------------------------------------------------------------------------------------------------
export function spawnEnemy(s: State, kind: EnemyKind, x: number, y: number, elite = false): Enemy {
  const def = ENEMIES[kind], scale = threat(s);
  const boss = kind === 'warden';
  const hp = Math.round(def.hp * (boss ? 1 + s.bossesDown * 1.5 : scale.hp * (elite ? 9 : 1)));
  const enemy: Enemy = {
    id: s.nextId++, kind, elite, x, y, kx: 0, ky: 0, hp, maxHp: hp, r: def.r * (elite ? 1.55 : 1), speed: def.speed * (boss ? 1 : scale.speed) * (elite ? 0.9 : 1),
    dmg: def.dmg * (boss ? 1 + s.bossesDown * 0.3 : scale.dmg) * (elite ? 1.4 : 1), mass: def.mass * (elite ? 5 : 1),
    flash: 0, bladeCd: 0, slow: 0, ring: 0, t: 0, cd: 1.2 + s.rng() * 1.5, mode: 0, dx: 0, dy: 0, face: 0, atk: 0
  };
  s.enemies.push(enemy);
  return enemy;
}
function spawnAtRing(s: State, kind: EnemyKind, angle: number, elite = false, radius = SPAWN_RADIUS) {
  return spawnEnemy(s, kind, s.px + Math.cos(angle) * radius, s.py + Math.sin(angle) * radius, elite);
}
function pickKind(s: State): EnemyKind {
  const t = s.time;
  const weights: [EnemyKind, number][] = [
    ['grub', 10], ['skitter', t > 25 ? 3 + t / 70 : 0], ['spitter', t > 70 ? 1.6 + t / 140 : 0], ['brute', t > 110 ? 1.2 + t / 110 : 0], ['charger', t > 150 ? 1.6 + t / 130 : 0]
  ];
  let roll = s.rng() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [kind, weight] of weights) { roll -= weight; if (roll < 0) return kind; }
  return 'grub';
}
const ELITE_ORDER: readonly EnemyKind[] = ['brute', 'spitter', 'charger', 'grub'];
function director(s: State) {
  const scale = threat(s);
  s.spawnAcc += scale.rate * STEP;
  while (s.spawnAcc >= 1) {
    if (s.enemies.length >= MAX_ENEMIES) { s.spawnAcc = Math.min(s.spawnAcc, 2); break; }
    s.spawnAcc--;
    const kind = pickKind(s), angle = s.rng() * Math.PI * 2;
    if (kind === 'skitter') { for (let index = 0; index < 4; index++) spawnAtRing(s, kind, angle + (index - 1.5) * 0.07, false, SPAWN_RADIUS + (index % 2) * 18); s.spawnAcc -= 1.5; }
    else spawnAtRing(s, kind, angle);
  }
  if (s.time >= s.nextSwarm) {
    s.nextSwarm += s.won ? 40 : 60;
    const count = Math.min(44, 10 + Math.floor(s.time / 60) * 7), offset = s.rng() * Math.PI * 2;
    for (let index = 0; index < count; index++) spawnAtRing(s, 'skitter', offset + index / count * Math.PI * 2, false, SPAWN_RADIUS - 30);
    s.events.push({ type: 'banner', text: 'SWARM CLOSING IN', tone: 'warn' });
  }
  if (s.time >= s.nextElite) {
    s.nextElite += s.won ? 35 : 60;
    spawnAtRing(s, ELITE_ORDER[s.eliteCount++ % ELITE_ORDER.length], s.rng() * Math.PI * 2, true, SPAWN_RADIUS - 40);
    s.events.push({ type: 'banner', text: 'ELITE INCOMING', tone: 'warn' });
  }
  if (s.time >= s.nextBoss && !s.boss) {
    s.nextBoss = Infinity;
    s.boss = spawnAtRing(s, 'warden', s.rng() * Math.PI * 2, false, SPAWN_RADIUS - 60);
    s.boss.cd = 3;
    s.events.push({ type: 'banner', text: s.bossesDown ? 'ANOTHER WARDEN RISES' : 'THE WARDEN AWAKENS', tone: 'warn' });
  }
}

// ---- damage -----------------------------------------------------------------------------------------------------------
function dropGem(s: State, x: number, y: number, value: number, kind: Gem['kind'] = 'xp') {
  if (kind === 'xp' && s.gems.length >= MAX_GEMS) { const merged = s.gems[s.tick % s.gems.length]; if (merged.kind === 'xp') { merged.value += value; return; } }
  s.gems.push({ x, y, value, kind, pull: false, taken: false, speed: 0, age: 0 });
}
function kill(s: State, enemy: Enemy) {
  const def = ENEMIES[enemy.kind];
  s.kills++; s.burst = Math.min(s.burstNeed, s.burst + (enemy.elite ? 5 : 1));
  s.events.push({ type: 'kill', x: enemy.x, y: enemy.y, r: enemy.r, kind: enemy.kind, elite: enemy.elite });
  if (enemy.kind === 'warden') {
    s.boss = null; s.bossesDown++; s.score += def.score * s.bossesDown; s.nextBoss = s.time + 150;
    s.enemyShots.length = 0; s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.5);
    for (let index = 0; index < 24; index++) dropGem(s, enemy.x + Math.cos(index * 0.9) * (20 + index * 2.5), enemy.y + Math.sin(index * 0.9) * (20 + index * 2.5), 6);
    dropGem(s, enemy.x, enemy.y, 0, 'magnet');
    s.events.push({ type: 'bossdown', x: enemy.x, y: enemy.y });
    if (!s.won) { s.won = true; s.wonAt = s.time; s.nextSwarm = s.time + 20; s.nextElite = s.time + 30; }
    s.events.push({ type: 'banner', text: s.bossesDown === 1 ? 'WARDEN DOWN - ENDLESS MODE' : 'WARDEN DOWN', tone: 'good' });
    return;
  }
  s.score += def.score * (enemy.elite ? 12 : 1);
  dropGem(s, enemy.x, enemy.y, def.xp * (enemy.elite ? 10 : 1));
  if (enemy.elite) { dropGem(s, enemy.x + 14, enemy.y, 0, 'heart'); dropGem(s, enemy.x - 14, enemy.y, 0, 'magnet'); }
  else { const roll = s.rng(); if (roll < 0.012) dropGem(s, enemy.x, enemy.y, 0, 'heart'); else if (roll < 0.016) dropGem(s, enemy.x, enemy.y, 0, 'magnet'); }
}
/** Applies weapon damage with crit, hit flash and knockback away from (fromX, fromY). */
function hit(s: State, enemy: Enemy, base: number, fromX: number, fromY: number, knock: number) {
  if (enemy.hp <= 0) return;
  const crit = s.rng() < CRIT, amount = Math.max(1, Math.round(base * might(s) * (crit ? 2 : 1)));
  enemy.hp -= amount; enemy.flash = 0.12;
  if (knock) { const dx = enemy.x - fromX, dy = enemy.y - fromY, d = Math.hypot(dx, dy) || 1; enemy.kx += dx / d * knock / enemy.mass; enemy.ky += dy / d * knock / enemy.mass; }
  s.events.push({ type: 'dmg', x: enemy.x, y: enemy.y - enemy.r, amount, crit });
  if (enemy.hp <= 0) kill(s, enemy);
}
function hurtPlayer(s: State, amount: number, source: string) {
  if (s.invuln > 0 || s.phase !== 'play') return;
  const dealt = Math.max(1, Math.round(amount));
  s.hp -= dealt; s.invuln = INVULN; s.killer = source;
  s.events.push({ type: 'hurt', amount: dealt });
  if (s.hp <= 0) { s.hp = 0; s.phase = 'dead'; s.events.push({ type: 'dead' }); }
}
function fireEnemyShot(s: State, source: EnemyKind, x: number, y: number, angle: number, speed: number, dmg: number, r = 5) {
  if (s.enemyShots.length < 160) s.enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, life: 4.5, source });
}

// ---- enemies ----------------------------------------------------------------------------------------------------------
function updateEnemies(s: State) {
  const dt = STEP, decay = Math.exp(-7 * dt);
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.t += dt; e.cd -= dt; if (e.flash > 0) e.flash -= dt; if (e.bladeCd > 0) e.bladeCd -= dt; if (e.slow > 0) e.slow -= dt;
    let dx = s.px - e.x, dy = s.py - e.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (d > 760 && e.kind !== 'warden') { const angle = s.rng() * Math.PI * 2; e.x = s.px + Math.cos(angle) * SPAWN_RADIUS; e.y = s.py + Math.sin(angle) * SPAWN_RADIUS; continue; }
    const speed = e.speed * (e.slow > 0 ? 0.5 : 1);
    let vx = dx * speed, vy = dy * speed;
    if (e.kind === 'skitter') { const wobble = Math.sin(e.t * 7 + e.id) * 0.55; vx = (dx * Math.cos(wobble) - dy * Math.sin(wobble)) * speed; vy = (dx * Math.sin(wobble) + dy * Math.cos(wobble)) * speed; }
    else if (e.kind === 'spitter') {
      const side = e.id % 2 ? 1 : -1;
      if (d < 105) { vx = -dx * speed * 0.8; vy = -dy * speed * 0.8; } else if (d < 150) { vx = -dy * side * speed * 0.6; vy = dx * side * speed * 0.6; }
      if (e.cd <= 0 && d < 300) { e.cd = e.elite ? 1.3 : 2.6; const base = Math.atan2(dy, dx); for (const spread of e.elite ? [-0.25, 0, 0.25] : [0]) fireEnemyShot(s, e.kind, e.x, e.y, base + spread, 125, e.dmg); }
    } else if (e.kind === 'charger' || e.kind === 'warden') {
      const boss = e.kind === 'warden';
      if (e.mode === 1) { vx = vy = 0; if (e.t >= (boss ? 0.8 : 0.55)) { e.mode = 2; e.t = 0; } }
      else if (e.mode === 2) { vx = e.dx * (boss ? 300 : 320); vy = e.dy * (boss ? 300 : 320); if (e.t >= (boss ? 0.7 : 0.45)) { e.mode = 0; e.cd = boss ? 2.2 : 2.4; } }
      else if (!boss && e.cd <= 0 && d < 175) { e.mode = 1; e.t = 0; e.dx = dx; e.dy = dy; }
      else if (boss && e.cd <= 0) {
        const pattern = e.atk++ % 3;
        if (pattern === 0) { const n = 12 + Math.min(8, s.bossesDown * 4), spin = e.atk * 0.37; for (let index = 0; index < n; index++) fireEnemyShot(s, e.kind, e.x, e.y, spin + index / n * Math.PI * 2, 110, e.dmg * 0.5, 6); e.cd = 2.6; }
        else if (pattern === 1) { for (let index = 0; index < 6; index++) if (s.enemies.length < MAX_ENEMIES) spawnEnemy(s, 'skitter', e.x + Math.cos(index * 1.05) * (e.r + 14), e.y + Math.sin(index * 1.05) * (e.r + 14)); e.cd = 2.6; }
        else { e.mode = 1; e.t = 0; e.dx = dx; e.dy = dy; }
      }
    }
    if (e.mode !== 1) e.face = Math.atan2(e.mode === 2 ? e.dy : dy, e.mode === 2 ? e.dx : dx);
    e.kx *= decay; e.ky *= decay;
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    if (d < e.r + PLAYER_R) { hurtPlayer(s, e.dmg, e.kind); if (e.kind !== 'warden') { e.kx -= dx * 90 / e.mass; e.ky -= dy * 90 / e.mass; } }
  }
}
/** Soft push so the swarm reads as a crowd instead of one stacked dot. */
function separate(s: State) {
  for (const a of s.enemies) {
    if (a.hp <= 0) continue;
    near(s, a.x, a.y, a.r + 18, b => {
      if (b.id <= a.id) return;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      const d = Math.sqrt(d2), push = (min - d) * 0.5, share = b.mass / (a.mass + b.mass);
      a.x -= dx / d * push * share; a.y -= dy / d * push * share; b.x += dx / d * push * (1 - share); b.y += dy / d * push * (1 - share);
    });
  }
}

// ---- weapons ----------------------------------------------------------------------------------------------------------
function nearestEnemies(s: State, count: number, range: number): Enemy[] {
  const found: { enemy: Enemy; d: number }[] = [];
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    const d = Math.hypot(enemy.x - s.px, enemy.y - s.py) - enemy.r;
    if (d > range) continue;
    found.push({ enemy, d });
  }
  found.sort((a, b) => a.d - b.d || a.enemy.id - b.enemy.id);
  return found.slice(0, count).map(item => item.enemy);
}
function lanceHits(s: State, angle: number, width: number, apply?: (enemy: Enemy) => void): number {
  const ax = Math.cos(angle), ay = Math.sin(angle); let count = 0;
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    const rx = enemy.x - s.px, ry = enemy.y - s.py, along = rx * ax + ry * ay;
    if (along < -enemy.r || along > LANCE.length + enemy.r || Math.abs(rx * ay - ry * ax) > width / 2 + enemy.r) continue;
    count++; apply?.(enemy);
  }
  return count;
}
function updateWeapons(s: State) {
  const dt = STEP, quick = cooldownScale(s), w = s.weapons;
  if (w.bolt) {
    s.boltCd -= dt;
    if (s.boltCd <= 0) {
      const targets = nearestEnemies(s, BOLT.count[w.bolt], BOLT.range);
      if (!targets.length) s.boltCd = 0.12;
      else {
        s.boltCd = BOLT.cd[w.bolt] * quick;
        for (let index = 0; index < BOLT.count[w.bolt]; index++) {
          const target = targets[index % targets.length], angle = Math.atan2(target.y - s.py, target.x - s.px) + (index >= targets.length ? (index - 1) * 0.22 : 0);
          s.shots.push({ x: s.px, y: s.py, vx: Math.cos(angle) * BOLT.speed, vy: Math.sin(angle) * BOLT.speed, dmg: BOLT.dmg[w.bolt], pierce: BOLT.pierce[w.bolt], life: 1.1, target, hit: [], blast: w.bolt >= MAX_LEVEL });
        }
      }
    }
  }
  if (w.blades) {
    s.bladeAngle += BLADES.spin[w.blades] * dt;
    const count = BLADES.count[w.blades], radius = BLADES.radius[w.blades];
    for (let index = 0; index < count; index++) {
      const angle = s.bladeAngle + index / count * Math.PI * 2, bx = s.px + Math.cos(angle) * radius, by = s.py + Math.sin(angle) * radius;
      near(s, bx, by, 30, enemy => { if (enemy.bladeCd <= 0 && Math.hypot(enemy.x - bx, enemy.y - by) < enemy.r + 10) { enemy.bladeCd = BLADES.rehit; hit(s, enemy, BLADES.dmg[w.blades], s.px, s.py, 110); } });
      for (const shot of s.enemyShots) if (Math.hypot(shot.x - bx, shot.y - by) < shot.r + 10) shot.life = 0;
    }
  }
  if (w.pulse) {
    s.pulseCd -= dt;
    if (s.pulseCd <= 0) { s.pulseCd = PULSE.cd[w.pulse] * quick; s.rings.push({ id: s.nextId++, r: 8, maxR: PULSE.radius[w.pulse], dmg: PULSE.dmg[w.pulse], knock: PULSE.knock, slow: w.pulse >= MAX_LEVEL, burst: false }); }
  }
  if (w.lance) {
    s.lanceCd -= dt;
    if (s.lanceCd <= 0) {
      const width = LANCE.width[w.lance], offsets = LANCE.angles[w.lance];
      let best = -1, bestAngle = 0;
      for (let index = 0; index < 16; index++) { const angle = index / 16 * Math.PI * 2; let total = 0; for (const offset of offsets) total += lanceHits(s, angle + offset, width); if (total > best) { best = total; bestAngle = angle; } }
      if (best <= 0) s.lanceCd = 0.15;
      else {
        s.lanceCd = LANCE.cd[w.lance] * quick;
        for (const offset of offsets) {
          const angle = bestAngle + offset;
          lanceHits(s, angle, width, enemy => hit(s, enemy, LANCE.dmg[w.lance], s.px - Math.cos(angle) * 40, s.py - Math.sin(angle) * 40, 90));
          s.beams.push({ x: s.px, y: s.py, angle, length: LANCE.length, width, life: 0.24 });
        }
      }
    }
  }
  if (w.meteor) {
    s.meteorCd -= dt;
    if (s.meteorCd <= 0) {
      const candidates = nearestEnemies(s, 40, METEOR.range);
      if (!candidates.length) s.meteorCd = 0.2;
      else {
        s.meteorCd = METEOR.cd[w.meteor] * quick;
        for (let index = 0; index < METEOR.count[w.meteor]; index++) { const target = candidates[Math.floor(s.rng() * candidates.length)]; s.zones.push({ x: target.x, y: target.y, r: METEOR.radius[w.meteor], t: METEOR.delay, max: METEOR.delay, dmg: METEOR.dmg[w.meteor] }); }
      }
    }
  }
}
function blast(s: State, x: number, y: number, radius: number, dmg: number, knock: number, skip?: Enemy) {
  near(s, x, y, radius + 40, enemy => { if (enemy !== skip && Math.hypot(enemy.x - x, enemy.y - y) < radius + enemy.r) hit(s, enemy, dmg, x, y, knock); });
}
function updateProjectiles(s: State) {
  const dt = STEP;
  for (const shot of s.shots) {
    shot.life -= dt;
    if (shot.target && shot.target.hp > 0 && !shot.hit.length) { const dx = shot.target.x - shot.x, dy = shot.target.y - shot.y, d = Math.hypot(dx, dy) || 1; shot.vx = dx / d * BOLT.speed; shot.vy = dy / d * BOLT.speed; }
    shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    near(s, shot.x, shot.y, 30, enemy => {
      if (shot.life <= 0 || shot.hit.includes(enemy.id) || Math.hypot(enemy.x - shot.x, enemy.y - shot.y) > enemy.r + 5) return;
      shot.hit.push(enemy.id);
      hit(s, enemy, shot.dmg, shot.x - shot.vx * 0.05, shot.y - shot.vy * 0.05, 70);
      if (shot.blast) { blast(s, shot.x, shot.y, BOLT.blast, shot.dmg * 0.5, 60, enemy); s.events.push({ type: 'boom', x: shot.x, y: shot.y, r: BOLT.blast }); }
      if (shot.pierce-- <= 0) shot.life = 0;
    });
  }
  for (const ring of s.rings) {
    ring.r += ring.maxR / PULSE.grow * dt;
    const reach = Math.min(ring.r, ring.maxR);
    near(s, s.px, s.py, reach + 40, enemy => {
      if (enemy.ring === ring.id || Math.hypot(enemy.x - s.px, enemy.y - s.py) > reach + enemy.r) return;
      enemy.ring = ring.id; if (ring.slow) enemy.slow = 1.6;
      hit(s, enemy, ring.dmg, s.px, s.py, ring.knock);
    });
    if (ring.burst) for (const shot of s.enemyShots) if (Math.hypot(shot.x - s.px, shot.y - s.py) < reach) shot.life = 0;
  }
  for (const zone of s.zones) {
    zone.t -= dt;
    if (zone.t <= 0) { blast(s, zone.x, zone.y, zone.r, zone.dmg, 150); s.events.push({ type: 'boom', x: zone.x, y: zone.y, r: zone.r }); }
  }
  for (const beam of s.beams) beam.life -= dt;
  for (const shot of s.enemyShots) {
    shot.life -= dt; shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    if (shot.life > 0 && Math.hypot(shot.x - s.px, shot.y - s.py) < shot.r + PLAYER_R - 2) { shot.life = 0; hurtPlayer(s, shot.dmg, shot.source); }
  }
}
function updateGems(s: State) {
  const dt = STEP, reach = pickupRadius(s);
  for (const gem of s.gems) {
    gem.age += dt;
    const dx = s.px - gem.x, dy = s.py - gem.y, d = Math.hypot(dx, dy) || 1;
    if (!gem.pull && d < reach) gem.pull = true;
    if (!gem.pull) continue;
    gem.speed = Math.min(620, gem.speed + 1100 * dt);
    const travel = Math.max(gem.speed, moveSpeed(s) * 1.3) * dt;
    if (d <= travel + 12) {
      gem.taken = true;
      if (gem.kind === 'heart') s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.25);
      else if (gem.kind === 'magnet') { for (const other of s.gems) other.pull = true; }
      else s.xp += gem.value;
      s.events.push({ type: 'gem', kind: gem.kind, value: gem.value });
    } else { gem.x += dx / d * travel; gem.y += dy / d * travel; }
  }
}

// ---- upgrades ---------------------------------------------------------------------------------------------------------
const weaponCard = (id: WeaponId, level: number): Card => {
  const info = WEAPON_CARDS[id], next = level + 1;
  return { key: id, kind: 'weapon', name: info.name, tag: level === 0 ? 'NEW WEAPON' : next >= MAX_LEVEL ? 'EVOLVE' : `LV ${level} > ${next}`, desc: info.levels[level], color: info.color, evolve: next >= MAX_LEVEL };
};
const passiveCard = (id: PassiveId, level: number): Card => {
  const info = PASSIVE_CARDS[id];
  return { key: id, kind: 'passive', name: info.name, tag: level === 0 ? 'NEW' : `LV ${level} > ${level + 1}`, desc: info.each, color: info.color, evolve: false };
};
const BONUS: readonly Card[] = [
  { key: 'heal', kind: 'bonus', name: 'Second Wind', tag: 'BONUS', desc: 'Restore 40% of your HP', color: '#ff8fab', evolve: false },
  { key: 'bounty', kind: 'bonus', name: 'Bounty', tag: 'BONUS', desc: '+60 score', color: '#ffd166', evolve: false }
];
export function rollChoices(s: State): Card[] {
  const pool: { card: Card; weight: number }[] = [];
  for (const id of WEAPON_IDS) { const level = s.weapons[id]; if (level < MAX_LEVEL) pool.push({ card: weaponCard(id, level), weight: level ? 3 : 2.2 }); }
  for (const id of PASSIVE_IDS) { const level = s.passives[id]; if (level < MAX_LEVEL) pool.push({ card: passiveCard(id, level), weight: level ? 2.4 : 2 }); }
  const picked: Card[] = [];
  while (picked.length < 3 && pool.length) {
    let roll = s.rng() * pool.reduce((sum, item) => sum + item.weight, 0), index = 0;
    for (; index < pool.length - 1; index++) { roll -= pool[index].weight; if (roll < 0) break; }
    picked.push(pool.splice(index, 1)[0].card);
  }
  // The first few picks always include a weapon, so every run finds a second attack early.
  if (s.level <= 4 && !picked.some(card => card.kind === 'weapon')) { const weapon = pool.find(item => item.card.kind === 'weapon'); if (weapon) picked[picked.length - 1] = weapon.card; }
  for (const bonus of BONUS) if (picked.length < 3) picked.push(bonus);
  return picked;
}
export function chooseUpgrade(s: State, index: number): boolean {
  if (s.phase !== 'levelup') return false;
  const card = s.choices[index];
  if (!card) return false;
  if (card.kind === 'weapon') {
    const id = card.key as WeaponId;
    if (s.weapons[id] === 0) { if (id === 'pulse') s.pulseCd = 0.2; if (id === 'lance') s.lanceCd = 0.2; if (id === 'meteor') s.meteorCd = 0.2; }
    s.weapons[id] = Math.min(MAX_LEVEL, s.weapons[id] + 1);
  } else if (card.kind === 'passive') {
    const id = card.key as PassiveId;
    s.passives[id] = Math.min(MAX_LEVEL, s.passives[id] + 1);
    if (id === 'vitality') { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); }
  } else if (card.key === 'heal') s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.4);
  else s.score += 60;
  s.choices = []; s.phase = 'play'; s.invuln = Math.max(s.invuln, 0.6);
  return true;
}
/** Space / Attack: spend a full charge on a big shockwave that also wipes enemy shots. */
function releaseBurst(s: State) {
  s.burst = 0; s.burstNeed = Math.min(60, s.burstNeed + 5); s.invuln = Math.max(s.invuln, 0.5);
  s.rings.push({ id: s.nextId++, r: 10, maxR: 190, dmg: 45 + s.level * 3, knock: 520, slow: true, burst: true });
  s.events.push({ type: 'burst' });
}

// ---- tick -------------------------------------------------------------------------------------------------------------
const compact = <T>(list: T[], alive: (item: T) => boolean) => { let write = 0; for (let read = 0; read < list.length; read++) if (alive(list[read])) list[write++] = list[read]; list.length = write; };

export function step(s: State, input: Input): void {
  if (s.phase !== 'play') return;
  const dt = STEP;
  s.time += dt; s.tick++;
  const length = Math.hypot(input.mx, input.my), scale = length > 1 ? 1 / length : 1, speed = moveSpeed(s);
  s.moving = length > 0.05;
  if (s.moving) { s.px += input.mx * scale * speed * dt; s.py += input.my * scale * speed * dt; s.faceX = input.mx / length; s.faceY = input.my / length; }
  if (s.invuln > 0) s.invuln -= dt;
  if (s.passives.regen) s.hp = Math.min(s.maxHp, s.hp + s.passives.regen * 0.5 * dt);
  if (input.burst && s.burst >= s.burstNeed) releaseBurst(s);
  director(s);
  updateEnemies(s);
  rebuildGrid(s);
  separate(s);
  updateWeapons(s);
  updateProjectiles(s);
  updateGems(s);
  compact(s.enemies, enemy => enemy.hp > 0);
  compact(s.shots, shot => shot.life > 0);
  compact(s.enemyShots, shot => shot.life > 0);
  compact(s.rings, ring => ring.r < ring.maxR);
  compact(s.zones, zone => zone.t > 0);
  compact(s.beams, beam => beam.life > 0);
  compact(s.gems, gem => !gem.taken);
  if (s.boss && s.boss.hp <= 0) s.boss = null;
  if (s.phase === 'play' && s.xp >= s.need) {
    s.xp -= s.need; s.level++; s.need = xpNeed(s.level);
    s.choices = rollChoices(s); s.phase = 'levelup';
    s.events.push({ type: 'levelup' });
  }
}
