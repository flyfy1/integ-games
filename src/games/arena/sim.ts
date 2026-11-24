/**
 * Pocket Survivor simulation. Deterministic and DOM-free: the only randomness is the injected `rng` (plus an optional
 * separate card stream), and time only advances through `step`, one fixed tick at a time, so a seed plus an input log
 * always replays the same run.
 */
import {
  BLADES, BOLT, BOSS_NAMES, CROSSBOW, ENEMIES, FIREPOT, GENERALS, LANCE, MAX_LEVEL, METEOR, PARTNER, PASSIVE_CARDS, PASSIVE_IDS, PASSIVE_SLOTS, PRE_EVOLVE, PULSE,
  STAGES, WEAPON_CARDS, WEAPON_IDS, WEAPON_SLOTS, WHIRL, partnerOf, xpNeed,
  type BossVariant, type EnemyKind, type GeneralId, type PassiveId, type StageId, type WeaponId
} from './data';

export const STEP = 1 / 60;
/** The final boss arrives at this run time; beating it wins the run and opens endless mode. */
export const BOSS_TIME = 300;
/** Every stage sends a named mid-boss at this time; it always drops a big treasure chest. */
export const MID_TIME = 150;
export const SPAWN_RADIUS = 430;
export const PLAYER_R = 9;
export const MAX_ENEMIES = 280;
const MAX_GEMS = 220, CELL = 56, INVULN = 0.7, CRIT = 0.08;

export type Rng = () => number;
export type Input = { mx: number; my: number; burst: boolean };
/** `boss`: 0 regular, 1 mid-boss, 2 final boss. */
export type Enemy = {
  id: number; kind: EnemyKind; elite: boolean; boss: 0 | 1 | 2; variant: BossVariant; x: number; y: number; kx: number; ky: number; hp: number; maxHp: number; r: number; speed: number; dmg: number; mass: number;
  flash: number; bladeCd: number; windCd: number; slow: number; ring: number; t: number; cd: number; special: number; mode: number; dx: number; dy: number; face: number; atk: number;
};
export type Gem = { x: number; y: number; value: number; kind: 'xp' | 'heart' | 'magnet' | 'chest'; pull: boolean; taken: boolean; speed: number; age: number };
/** `xbow` shots fly straight from the crossbow; the others are homing spears. */
export type Shot = { x: number; y: number; vx: number; vy: number; dmg: number; pierce: number; life: number; target: Enemy | null; hit: number[]; blast: boolean; xbow: boolean };
export type EnemyShot = { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; source: EnemyKind };
export type Ring = { id: number; r: number; maxR: number; dmg: number; knock: number; slow: boolean; burst: boolean };
export type Zone = { x: number; y: number; r: number; t: number; max: number; dmg: number };
export type Beam = { x: number; y: number; angle: number; length: number; width: number; life: number };
/** A lobbed pot: it flies for `t` seconds from (sx, sy), then burns for `burn` seconds. Hostile ones hurt the player. */
export type Fire = { x: number; y: number; sx: number; sy: number; r: number; t: number; flight: number; burn: number; max: number; dmg: number; tick: number; hostile: boolean; big: boolean };
export type Wind = { id: number; x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; dmg: number; big: boolean };
export type CardKey = WeaponId | PassiveId | 'heal' | 'bounty';
export type Card = {
  key: CardKey; kind: 'weapon' | 'passive' | 'bonus'; name: string; tag: string; desc: string; color: string; evolve: boolean;
  /** Level the card raises the item to (0 for bonus cards). */
  level: number;
  /** The paired item, shown on the card, and whether it is already owned. */
  partner: WeaponId | PassiveId | null; partnerOwned: boolean;
};
export type Chest = { items: Card[]; jade: number; big: boolean };
export type SimEvent =
  | { type: 'dmg'; x: number; y: number; amount: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; r: number; kind: EnemyKind; elite: boolean; boss: 0 | 1 | 2 }
  | { type: 'hurt'; amount: number }
  | { type: 'gem'; kind: Gem['kind']; value: number }
  | { type: 'levelup' } | { type: 'burst' } | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'banner'; text: string; tone: 'warn' | 'good' }
  | { type: 'evolve'; key: WeaponId } | { type: 'chest'; big: boolean } | { type: 'revive' }
  | { type: 'middown'; x: number; y: number }
  | { type: 'bossdown'; x: number; y: number } | { type: 'dead' };

/** Permanent bonuses from talents (all optional; zero by default). */
export type Bonus = { hp: number; dmg: number; speed: number; pickup: number; xp: number; jade: number; revive: number };
export type RunConfig = {
  stage?: StageId; general?: GeneralId; bonus?: Partial<Bonus>;
  /** Unlocked arsenal; defaults to everything. */
  weapons?: readonly WeaponId[]; passives?: readonly PassiveId[];
  /** Separate stream for upgrade cards and chests (the Daily uses one so offers match between players). */
  cardRng?: Rng;
};

export type State = {
  rng: Rng; cardRng: Rng; phase: 'play' | 'levelup' | 'dead'; time: number; tick: number; nextId: number;
  stage: StageId; general: GeneralId; bonus: Bonus; pool: { weapons: readonly WeaponId[]; passives: readonly PassiveId[] };
  px: number; py: number; faceX: number; faceY: number; moving: boolean; hp: number; maxHp: number; invuln: number;
  level: number; xp: number; need: number; kills: number; score: number; burst: number; burstNeed: number;
  weapons: Record<WeaponId, number>; passives: Record<PassiveId, number>;
  boltCd: number; pulseCd: number; lanceCd: number; meteorCd: number; xbowCd: number; potCd: number; windCd: number; bladeAngle: number;
  enemies: Enemy[]; gems: Gem[]; shots: Shot[]; enemyShots: EnemyShot[]; rings: Ring[]; zones: Zone[]; beams: Beam[]; fires: Fire[]; winds: Wind[];
  spawnAcc: number; nextSwarm: number; nextElite: number; nextBoss: number; nextMid: number; eliteCount: number; bossesDown: number;
  boss: Enemy | null; mid: Enemy | null; midDown: boolean; won: boolean; wonAt: number; killer: string; revives: number;
  /** Run record for the meta track: jade earned, officers felled, chests, evolutions, foes met. */
  jade: number; elites: number; chests: number; evolved: WeaponId[]; seen: Record<string, true>; bladesEver: boolean;
  choices: Card[]; chest: Chest | null; events: SimEvent[]; grid: Map<number, Enemy[]>;
};

const NO_BONUS: Bonus = { hp: 0, dmg: 0, speed: 0, pickup: 0, xp: 0, jade: 0, revive: 0 };

export function createState(rng: Rng, config: RunConfig = {}): State {
  const stage = config.stage ?? 'march', general = config.general ?? 'spear', bonus = { ...NO_BONUS, ...config.bonus }, hero = GENERALS[general];
  const weapons = Object.fromEntries(WEAPON_IDS.map(id => [id, 0])) as Record<WeaponId, number>;
  const passives = Object.fromEntries(PASSIVE_IDS.map(id => [id, 0])) as Record<PassiveId, number>;
  weapons[hero.weapon] = 1;
  const hp = hero.hp + bonus.hp;
  return {
    rng, cardRng: config.cardRng ?? rng, phase: 'play', time: 0, tick: 0, nextId: 1,
    stage, general, bonus, pool: { weapons: config.weapons ?? WEAPON_IDS, passives: config.passives ?? PASSIVE_IDS },
    px: 0, py: 0, faceX: 1, faceY: 0, moving: false, hp, maxHp: hp, invuln: 0,
    level: 1, xp: 0, need: xpNeed(1), kills: 0, score: 0, burst: 0, burstNeed: 25,
    weapons, passives,
    boltCd: 0.5, pulseCd: 1, lanceCd: 1, meteorCd: 1, xbowCd: 0.4, potCd: 1, windCd: 1, bladeAngle: 0,
    enemies: [], gems: [], shots: [], enemyShots: [], rings: [], zones: [], beams: [], fires: [], winds: [],
    spawnAcc: 0, nextSwarm: 50, nextElite: 60, nextBoss: BOSS_TIME, nextMid: MID_TIME, eliteCount: 0, bossesDown: 0,
    boss: null, mid: null, midDown: false, won: false, wonAt: 0, killer: '', revives: bonus.revive,
    jade: 0, elites: 0, chests: 0, evolved: [], seen: {}, bladesEver: hero.weapon === 'blades',
    choices: [], chest: null, events: [], grid: new Map()
  };
}

// ---- derived stats ----------------------------------------------------------------------------------------------------
export const might = (s: State) => (1 + 0.15 * s.passives.might) * (1 + s.bonus.dmg);
export const moveSpeed = (s: State) => 150 * (1 + 0.08 * s.passives.haste + GENERALS[s.general].speed + s.bonus.speed);
export const pickupRadius = (s: State) => 78 * (1 + 0.35 * s.passives.magnet + s.bonus.pickup);
export const cooldownScale = (s: State) => 1 - 0.08 * s.passives.quick;
export const critChance = (s: State) => CRIT + 0.04 * s.passives.fortune;
export const damageTaken = (s: State) => (1 - 0.07 * s.passives.armor) * (1 - GENERALS[s.general].armor);
export const xpGain = (s: State) => 1 + GENERALS[s.general].xp + s.bonus.xp;
/** Jade banked at the end of the run: officer, boss and chest rewards plus one per 30 seconds survived. */
export const runJade = (s: State) => Math.floor((s.jade + s.time / 30) * (1 + s.bonus.jade + 0.08 * s.passives.fortune));
/** Threat curve. Exported so tests and the HUD can read the same numbers the director uses. */
export function threat(s: State) {
  const minutes = s.time / 60, endless = s.won ? (s.time - s.wonAt) / 60 : 0, stage = STAGES[s.stage];
  return {
    hp: (1 + minutes * 0.5 + minutes * minutes * 0.42) * Math.pow(1.5, endless) * stage.hp,
    dmg: 1 + minutes * 0.16 + endless * 0.35,
    speed: 1 + Math.min(0.36, minutes * 0.045) + endless * 0.14,
    rate: (1.4 + s.time * 0.052 + endless * 4) * (s.boss ? 0.6 : s.mid ? 0.75 : 1) * stage.rate
  };
}
export const owned = (s: State) => ({ weapons: WEAPON_IDS.filter(id => s.weapons[id] > 0).length, passives: PASSIVE_IDS.filter(id => s.passives[id] > 0).length });
/** A weapon one step from its evolution evolves only while its partner passive is owned. */
export const canEvolve = (s: State, id: WeaponId) => s.weapons[id] === PRE_EVOLVE && s.passives[PARTNER[id]] > 0;

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
export function spawnEnemy(s: State, kind: EnemyKind, x: number, y: number, elite = false, boss: 0 | 1 | 2 = kind === 'warden' ? 2 : 0): Enemy {
  const def = ENEMIES[kind], scale = threat(s), stage = STAGES[s.stage], variant = stage.boss;
  let hp: number, r = def.r * (elite ? 1.55 : 1), speed = def.speed * scale.speed * (elite ? 0.9 : 1), dmg = def.dmg * scale.dmg * (elite ? 1.4 : 1), mass = def.mass * (elite ? 5 : 1);
  if (boss === 2) { hp = def.hp * BOSS_NAMES[variant].hp * (1 + s.bossesDown * 1.5); speed = def.speed * (variant === 'king' ? 1.25 : 1); dmg = def.dmg * (1 + s.bossesDown * 0.3); }
  else if (boss === 1) { hp = 2000 * stage.hp; r = Math.max(26, def.r * 2.5); speed = kind === 'spitter' ? 70 : 104; dmg = Math.max(14, def.dmg * 1.6); mass = 40; }
  else hp = def.hp * scale.hp * (elite ? 9 : 1);
  hp = Math.round(hp);
  const enemy: Enemy = {
    id: s.nextId++, kind, elite, boss, variant, x, y, kx: 0, ky: 0, hp, maxHp: hp, r, speed, dmg, mass,
    flash: 0, bladeCd: 0, windCd: 0, slow: 0, ring: 0, t: 0, cd: 1.2 + s.rng() * 1.5, special: 4, mode: 0, dx: 0, dy: 0, face: 0, atk: 0
  };
  s.enemies.push(enemy);
  s.seen[boss === 2 ? `boss:${variant}` : boss === 1 ? `mid:${kind}` : kind] = true;
  return enemy;
}
function spawnAtRing(s: State, kind: EnemyKind, angle: number, elite = false, radius = SPAWN_RADIUS, boss: 0 | 1 | 2 = kind === 'warden' ? 2 : 0) {
  return spawnEnemy(s, kind, s.px + Math.cos(angle) * radius, s.py + Math.sin(angle) * radius, elite, boss);
}
function pickKind(s: State): EnemyKind {
  const t = s.time, mix = STAGES[s.stage].mix;
  let total = 0;
  for (const [, start, base, perMinute] of mix) if (t >= start) total += base + perMinute * t / 60;
  let roll = s.rng() * total;
  for (const [kind, start, base, perMinute] of mix) { if (t < start) continue; roll -= base + perMinute * t / 60; if (roll < 0) return kind; }
  return 'grub';
}
function director(s: State) {
  const scale = threat(s), stage = STAGES[s.stage];
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
    spawnAtRing(s, stage.elites[s.eliteCount++ % stage.elites.length], s.rng() * Math.PI * 2, true, SPAWN_RADIUS - 40);
    s.events.push({ type: 'banner', text: 'ELITE INCOMING', tone: 'warn' });
  }
  if (s.time >= s.nextMid && !s.mid) {
    s.nextMid = Infinity;
    s.mid = spawnAtRing(s, stage.mid.kind, s.rng() * Math.PI * 2, true, SPAWN_RADIUS - 60, 1);
    s.mid.cd = 2; s.mid.special = 3;
    s.events.push({ type: 'banner', text: 'MID BOSS', tone: 'warn' });
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
function scatterXp(s: State, x: number, y: number, count: number, value: number) {
  for (let index = 0; index < count; index++) dropGem(s, x + Math.cos(index * 0.9) * (20 + index * 2.5), y + Math.sin(index * 0.9) * (20 + index * 2.5), value);
}
function kill(s: State, enemy: Enemy) {
  const def = ENEMIES[enemy.kind];
  s.kills++; s.burst = Math.min(s.burstNeed, s.burst + (enemy.elite ? 5 : 1));
  s.events.push({ type: 'kill', x: enemy.x, y: enemy.y, r: enemy.r, kind: enemy.kind, elite: enemy.elite, boss: enemy.boss });
  if (enemy.boss === 2) {
    s.boss = null; s.bossesDown++; s.score += def.score * s.bossesDown; s.nextBoss = s.time + 150; s.jade += s.bossesDown === 1 ? 20 : 6;
    s.enemyShots.length = 0; s.fires = s.fires.filter(fire => !fire.hostile); s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.5);
    scatterXp(s, enemy.x, enemy.y, 24, 6);
    dropGem(s, enemy.x, enemy.y, 0, 'magnet'); dropGem(s, enemy.x, enemy.y + 26, 3, 'chest');
    s.events.push({ type: 'bossdown', x: enemy.x, y: enemy.y });
    if (!s.won) { s.won = true; s.wonAt = s.time; s.nextSwarm = s.time + 20; s.nextElite = s.time + 30; }
    s.events.push({ type: 'banner', text: s.bossesDown === 1 ? 'WARDEN DOWN - ENDLESS MODE' : 'WARDEN DOWN', tone: 'good' });
    return;
  }
  if (enemy.boss === 1) {
    s.mid = null; s.midDown = true; s.score += 120; s.jade += 8; s.elites++;
    scatterXp(s, enemy.x, enemy.y, 14, 6);
    dropGem(s, enemy.x, enemy.y, 3, 'chest');
    s.events.push({ type: 'middown', x: enemy.x, y: enemy.y }, { type: 'banner', text: 'MID BOSS DOWN', tone: 'good' });
    return;
  }
  s.score += def.score * (enemy.elite ? 12 : 1);
  dropGem(s, enemy.x, enemy.y, def.xp * (enemy.elite ? 10 : 1));
  if (enemy.elite) { s.elites++; s.jade += 2; dropGem(s, enemy.x + 14, enemy.y, 0, 'heart'); dropGem(s, enemy.x - 16, enemy.y + 4, 1, 'chest'); }
  else { s.jade += 0.008; const roll = s.rng(); if (roll < 0.012) dropGem(s, enemy.x, enemy.y, 0, 'heart'); else if (roll < 0.016) dropGem(s, enemy.x, enemy.y, 0, 'magnet'); }
}
/** Applies weapon damage with crit, hit flash and knockback away from (fromX, fromY). */
function hit(s: State, enemy: Enemy, base: number, fromX: number, fromY: number, knock: number) {
  if (enemy.hp <= 0) return;
  const crit = s.rng() < critChance(s), amount = Math.max(1, Math.round(base * might(s) * (crit ? 2 : 1)));
  enemy.hp -= amount; enemy.flash = 0.12;
  if (knock) { const dx = enemy.x - fromX, dy = enemy.y - fromY, d = Math.hypot(dx, dy) || 1; enemy.kx += dx / d * knock / enemy.mass; enemy.ky += dy / d * knock / enemy.mass; }
  s.events.push({ type: 'dmg', x: enemy.x, y: enemy.y - enemy.r, amount, crit });
  if (enemy.hp <= 0) kill(s, enemy);
}
function hurtPlayer(s: State, amount: number, source: string) {
  if (s.invuln > 0 || s.phase !== 'play') return;
  const dealt = Math.max(1, Math.round(amount * damageTaken(s)));
  s.hp -= dealt; s.invuln = INVULN; s.killer = source;
  s.events.push({ type: 'hurt', amount: dealt });
  if (s.hp <= 0) {
    if (s.revives > 0) {
      s.revives--; s.hp = Math.round(s.maxHp * 0.5); s.invuln = 2.2; s.enemyShots.length = 0;
      s.rings.push({ id: s.nextId++, r: 10, maxR: 240, dmg: 80, knock: 700, slow: true, burst: true });
      s.events.push({ type: 'revive' }, { type: 'banner', text: 'SECOND LIFE', tone: 'good' });
      return;
    }
    s.hp = 0; s.phase = 'dead'; s.events.push({ type: 'dead' });
  }
}
function fireEnemyShot(s: State, source: EnemyKind, x: number, y: number, angle: number, speed: number, dmg: number, r = 5) {
  if (s.enemyShots.length < 160) s.enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, dmg, life: 4.5, source });
}
function summon(s: State, e: Enemy, kind: EnemyKind, count: number) {
  for (let index = 0; index < count; index++) if (s.enemies.length < MAX_ENEMIES) { const a = index / count * Math.PI * 2 + e.atk; spawnEnemy(s, kind, e.x + Math.cos(a) * (e.r + 14), e.y + Math.sin(a) * (e.r + 14)); }
}
function ringShots(s: State, e: Enemy, count: number, speed: number, dmg: number, spin: number) {
  for (let index = 0; index < count; index++) fireEnemyShot(s, e.kind, e.x, e.y, spin + index / count * Math.PI * 2, speed, dmg, 6);
}
/** The Siege Marshal's oil pots: a telegraphed circle near the player that burns for a few seconds. */
function hostilePot(s: State, e: Enemy, x: number, y: number) {
  s.fires.push({ x, y, sx: e.x, sy: e.y - e.r, r: 46, t: 1.1, flight: 1.1, burn: 2.6, max: 2.6, dmg: e.dmg * 0.5, tick: 0, hostile: true, big: false });
}

// ---- enemies ----------------------------------------------------------------------------------------------------------
/** Final boss attack sets, one per variant. Each returns the cooldown before the next attack. */
function bossAttack(s: State, e: Enemy, dx: number, dy: number) {
  const pattern = e.atk++ % 3, extra = Math.min(8, s.bossesDown * 4), aim = Math.atan2(dy, dx);
  const charge = () => { e.mode = 1; e.t = 0; e.dx = dx; e.dy = dy; };
  switch (e.variant) {
    case 'king':
      if (pattern === 0) charge();
      else if (pattern === 1) { summon(s, e, 'skitter', 8); e.cd = 2.2; }
      else { ringShots(s, e, 10 + extra, 120, e.dmg * 0.45, e.atk * 0.4); e.cd = 1.6; e.atk += 0; }
      return;
    case 'admiral':
      if (pattern === 0) { for (let index = -4; index <= 4; index++) fireEnemyShot(s, e.kind, e.x, e.y, aim + index * 0.13, 150, e.dmg * 0.45, 6); e.cd = 2.2; }
      else if (pattern === 1) { ringShots(s, e, 16 + extra, 105, e.dmg * 0.45, e.atk * 0.3); e.cd = 2.4; }
      else { summon(s, e, 'spitter', 4); e.cd = 2.6; }
      return;
    case 'marshal':
      if (pattern === 0) { hostilePot(s, e, s.px, s.py); for (let index = 0; index < 4; index++) { const a = index / 4 * Math.PI * 2 + e.atk; hostilePot(s, e, s.px + Math.cos(a) * 95, s.py + Math.sin(a) * 95); } e.cd = 2.6; }
      else if (pattern === 1) charge();
      else { summon(s, e, 'brute', 2); ringShots(s, e, 12 + extra, 100, e.dmg * 0.45, e.atk * 0.5); e.cd = 2.6; }
      return;
    default:
      if (pattern === 0) { ringShots(s, e, 12 + extra, 110, e.dmg * 0.5, e.atk * 0.37); e.cd = 2.6; }
      else if (pattern === 1) { for (let index = 0; index < 6; index++) if (s.enemies.length < MAX_ENEMIES) spawnEnemy(s, 'skitter', e.x + Math.cos(index * 1.05) * (e.r + 14), e.y + Math.sin(index * 1.05) * (e.r + 14)); e.cd = 2.6; }
      else charge();
  }
}
/** Mid-boss specials, layered on top of the base kind's movement. */
function midSpecial(s: State, e: Enemy, dx: number, dy: number) {
  e.special = 5;
  const aim = Math.atan2(dy, dx);
  if (e.kind === 'skitter') summon(s, e, 'skitter', 6);
  else if (e.kind === 'spitter') { for (let index = -3; index <= 3; index++) fireEnemyShot(s, e.kind, e.x, e.y, aim + index * 0.16, 140, e.dmg * 0.6, 6); }
  else if (e.kind === 'brute') ringShots(s, e, 14, 115, e.dmg * 0.4, e.t);
  else { ringShots(s, e, 10, 110, e.dmg * 0.4, e.t); e.special = 6; }
}
function updateEnemies(s: State) {
  const dt = STEP, decay = Math.exp(-7 * dt);
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.t += dt; e.cd -= dt; if (e.flash > 0) e.flash -= dt; if (e.bladeCd > 0) e.bladeCd -= dt; if (e.windCd > 0) e.windCd -= dt; if (e.slow > 0) e.slow -= dt;
    let dx = s.px - e.x, dy = s.py - e.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (d > 760 && !e.boss) { const angle = s.rng() * Math.PI * 2; e.x = s.px + Math.cos(angle) * SPAWN_RADIUS; e.y = s.py + Math.sin(angle) * SPAWN_RADIUS; continue; }
    if (e.boss === 1) { e.special -= dt; if (e.special <= 0 && d < 420) midSpecial(s, e, dx, dy); }
    const speed = e.speed * (e.slow > 0 ? (e.boss ? 0.8 : 0.5) : 1);
    let vx = dx * speed, vy = dy * speed;
    if (e.kind === 'skitter') { const wobble = Math.sin(e.t * 7 + e.id) * (e.boss ? 0.3 : 0.55); vx = (dx * Math.cos(wobble) - dy * Math.sin(wobble)) * speed; vy = (dx * Math.sin(wobble) + dy * Math.cos(wobble)) * speed; }
    else if (e.kind === 'spitter') {
      const side = e.id % 2 ? 1 : -1, keep = e.boss ? 1.5 : 1;
      if (d < 105 * keep) { vx = -dx * speed * 0.8; vy = -dy * speed * 0.8; } else if (d < 150 * keep) { vx = -dy * side * speed * 0.6; vy = dx * side * speed * 0.6; }
      if (e.cd <= 0 && d < 300) { e.cd = e.elite ? 1.3 : 2.6; const base = Math.atan2(dy, dx); for (const spread of e.elite ? [-0.25, 0, 0.25] : [0]) fireEnemyShot(s, e.kind, e.x, e.y, base + spread, 125, e.dmg * (e.boss ? 0.5 : 1)); }
    } else if (e.kind === 'charger' || e.kind === 'warden') {
      const boss = e.kind === 'warden', big = boss || e.boss === 1;
      if (e.mode === 1) { vx = vy = 0; if (e.t >= (big ? 0.8 : 0.55)) { e.mode = 2; e.t = 0; } }
      else if (e.mode === 2) { const rush = e.variant === 'king' && boss ? 380 : big ? 300 : 320; vx = e.dx * rush; vy = e.dy * rush; if (e.t >= (big ? 0.7 : 0.45)) { e.mode = 0; e.cd = boss ? 2.2 : 2.4; } }
      else if (!boss && e.cd <= 0 && d < (e.boss ? 260 : 175)) { e.mode = 1; e.t = 0; e.dx = dx; e.dy = dy; }
      else if (boss && e.cd <= 0) bossAttack(s, e, dx, dy);
    }
    if (e.mode !== 1) e.face = Math.atan2(e.mode === 2 ? e.dy : dy, e.mode === 2 ? e.dx : dx);
    e.kx *= decay; e.ky *= decay;
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    if (d < e.r + PLAYER_R) { hurtPlayer(s, e.dmg, e.boss === 1 ? `mid:${e.kind}` : e.boss === 2 ? `boss:${e.variant}` : e.kind); if (!e.boss) { e.kx -= dx * 90 / e.mass; e.ky -= dy * 90 / e.mass; } }
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
          s.shots.push({ x: s.px, y: s.py, vx: Math.cos(angle) * BOLT.speed, vy: Math.sin(angle) * BOLT.speed, dmg: BOLT.dmg[w.bolt], pierce: BOLT.pierce[w.bolt], life: 1.1, target, hit: [], blast: w.bolt >= MAX_LEVEL, xbow: false });
        }
      }
    }
  }
  if (w.crossbow) {
    s.xbowCd -= dt;
    if (s.xbowCd <= 0) {
      s.xbowCd = CROSSBOW.cd[w.crossbow] * quick;
      const count = CROSSBOW.count[w.crossbow], spread = CROSSBOW.spread[w.crossbow], base = Math.atan2(s.faceY, s.faceX);
      for (let index = 0; index < count; index++) {
        const angle = base + (index - (count - 1) / 2) * spread;
        s.shots.push({ x: s.px, y: s.py, vx: Math.cos(angle) * CROSSBOW.speed, vy: Math.sin(angle) * CROSSBOW.speed, dmg: CROSSBOW.dmg[w.crossbow], pierce: CROSSBOW.pierce[w.crossbow], life: CROSSBOW.life, target: null, hit: [], blast: false, xbow: true });
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
  if (w.firepot) {
    s.potCd -= dt;
    if (s.potCd <= 0) {
      const candidates = nearestEnemies(s, 30, FIREPOT.range);
      if (!candidates.length) s.potCd = 0.25;
      else {
        s.potCd = FIREPOT.cd[w.firepot] * quick;
        const level = w.firepot, big = level >= MAX_LEVEL;
        for (let index = 0; index < FIREPOT.count[level]; index++) {
          const target = candidates[Math.floor(s.rng() * candidates.length)];
          s.fires.push({ x: target.x, y: target.y, sx: s.px, sy: s.py - 10, r: FIREPOT.radius[level], t: FIREPOT.flight, flight: FIREPOT.flight, burn: FIREPOT.burn[level], max: FIREPOT.burn[level], dmg: FIREPOT.dmg[level], tick: 0, hostile: false, big });
        }
      }
    }
  }
  if (w.whirl) {
    s.windCd -= dt;
    if (s.windCd <= 0) {
      s.windCd = WHIRL.cd[w.whirl] * quick;
      const level = w.whirl, count = WHIRL.count[level], target = nearestEnemies(s, 1, 260)[0], base = target ? Math.atan2(target.y - s.py, target.x - s.px) : Math.atan2(s.faceY, s.faceX);
      for (let index = 0; index < count; index++) {
        const angle = base + index / count * Math.PI * 2;
        s.winds.push({ id: s.nextId++, x: s.px + Math.cos(angle) * 24, y: s.py + Math.sin(angle) * 24, vx: Math.cos(angle) * WHIRL.speed, vy: Math.sin(angle) * WHIRL.speed, r: WHIRL.radius[level], life: WHIRL.life[level], max: WHIRL.life[level], dmg: WHIRL.dmg[level], big: level >= MAX_LEVEL });
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
      hit(s, enemy, shot.dmg, shot.x - shot.vx * 0.05, shot.y - shot.vy * 0.05, shot.xbow ? 40 : 70);
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
  for (const fire of s.fires) {
    if (fire.t > 0) { fire.t -= dt; if (fire.t <= 0 && !fire.hostile) s.events.push({ type: 'boom', x: fire.x, y: fire.y, r: fire.r * 0.7 }); continue; }
    fire.burn -= dt; fire.tick -= dt;
    if (fire.tick > 0) continue;
    fire.tick = FIREPOT.tick;
    if (fire.hostile) { if (Math.hypot(s.px - fire.x, s.py - fire.y) < fire.r + PLAYER_R - 4) hurtPlayer(s, fire.dmg, 'boss:marshal'); }
    else near(s, fire.x, fire.y, fire.r + 30, enemy => { if (Math.hypot(enemy.x - fire.x, enemy.y - fire.y) < fire.r + enemy.r * 0.5) { if (fire.big) enemy.slow = Math.max(enemy.slow, 0.5); hit(s, enemy, fire.dmg, fire.x, fire.y, 0); } });
  }
  for (const wind of s.winds) {
    wind.life -= dt; wind.x += wind.vx * dt; wind.y += wind.vy * dt;
    const pull = WHIRL.pull * (wind.big ? 1.4 : 1) * dt, grab = wind.r * 1.7;
    near(s, wind.x, wind.y, grab + 20, enemy => {
      const dx = wind.x - enemy.x, dy = wind.y - enemy.y, d = Math.hypot(dx, dy) || 1;
      if (d > grab + enemy.r) return;
      if (enemy.boss !== 2) { const shift = Math.min(d, pull / Math.max(1, enemy.mass * 0.5)); enemy.x += dx / d * shift; enemy.y += dy / d * shift; }
      if (d < wind.r + enemy.r && enemy.windCd <= 0) { enemy.windCd = WHIRL.rehit; hit(s, enemy, wind.dmg, wind.x, wind.y, 0); }
    });
    if (wind.big) for (const gem of s.gems) if (!gem.pull && Math.hypot(gem.x - wind.x, gem.y - wind.y) < wind.r * 2) gem.pull = true;
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
    if (!gem.pull && d < (gem.kind === 'chest' ? Math.min(reach, 40) : reach)) gem.pull = true;
    if (!gem.pull) continue;
    gem.speed = Math.min(620, gem.speed + 1100 * dt);
    const travel = Math.max(gem.speed, moveSpeed(s) * 1.3) * dt;
    if (d <= travel + 12) {
      gem.taken = true;
      if (gem.kind === 'heart') s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.25);
      else if (gem.kind === 'magnet') { for (const other of s.gems) if (other.kind !== 'chest') other.pull = true; }
      else if (gem.kind === 'chest') openChest(s, gem.value >= 3);
      else s.xp += gem.value * xpGain(s);
      s.events.push({ type: 'gem', kind: gem.kind, value: gem.value });
    } else { gem.x += dx / d * travel; gem.y += dy / d * travel; }
  }
}

// ---- upgrades ---------------------------------------------------------------------------------------------------------
function weaponCard(s: State, id: WeaponId, level: number): Card {
  const info = WEAPON_CARDS[id], next = level + 1, partner = PARTNER[id];
  return { key: id, kind: 'weapon', name: next >= MAX_LEVEL ? info.evolved ?? info.name : info.name, tag: level === 0 ? 'NEW WEAPON' : next >= MAX_LEVEL ? 'EVOLVE' : `LV ${level} > ${next}`, desc: info.levels[level], color: info.color, evolve: next >= MAX_LEVEL, level: next, partner, partnerOwned: s.passives[partner] > 0 };
}
function passiveCard(s: State, id: PassiveId, level: number): Card {
  const info = PASSIVE_CARDS[id], partner = partnerOf(id) ?? null;
  return { key: id, kind: 'passive', name: info.name, tag: level === 0 ? 'NEW' : `LV ${level} > ${level + 1}`, desc: info.each, color: info.color, evolve: false, level: level + 1, partner, partnerOwned: !!partner && s.weapons[partner] > 0 };
}
const BONUS: readonly Card[] = [
  { key: 'heal', kind: 'bonus', name: 'Second Wind', tag: 'BONUS', desc: 'Restore 40% of your HP', color: '#ff8fab', evolve: false, level: 0, partner: null, partnerOwned: false },
  { key: 'bounty', kind: 'bonus', name: 'Bounty', tag: 'BONUS', desc: '+60 score', color: '#ffd166', evolve: false, level: 0, partner: null, partnerOwned: false }
];
/** Every upgrade the build could take right now, with its offer weight. Slots and the evolution pairing are enforced here. */
function upgradePool(s: State): { card: Card; weight: number }[] {
  const pool: { card: Card; weight: number }[] = [], slots = owned(s);
  for (const id of s.pool.weapons) {
    const level = s.weapons[id];
    if (level >= MAX_LEVEL) continue;
    if (level === 0 && slots.weapons >= WEAPON_SLOTS) continue;
    if (level === PRE_EVOLVE && !canEvolve(s, id)) continue;
    pool.push({ card: weaponCard(s, id, level), weight: level === PRE_EVOLVE ? 6 : level ? 3 : 2.2 });
  }
  for (const id of s.pool.passives) {
    const level = s.passives[id];
    if (level >= MAX_LEVEL) continue;
    if (level === 0 && slots.passives >= PASSIVE_SLOTS) continue;
    // A passive that would unlock an evolution for a weapon already waiting at the gate is offered more often.
    const partner = partnerOf(id), waiting = level === 0 && !!partner && s.weapons[partner] >= PRE_EVOLVE - 1;
    pool.push({ card: passiveCard(s, id, level), weight: waiting ? 3.4 : level ? 2.4 : 2 });
  }
  return pool;
}
function weighted<T>(rng: Rng, pool: { card: T; weight: number }[]): T {
  let roll = rng() * pool.reduce((sum, item) => sum + item.weight, 0), index = 0;
  for (; index < pool.length - 1; index++) { roll -= pool[index].weight; if (roll < 0) break; }
  return pool.splice(index, 1)[0].card;
}
export function rollChoices(s: State): Card[] {
  const pool = upgradePool(s), picked: Card[] = [];
  while (picked.length < 3 && pool.length) picked.push(weighted(s.cardRng, pool));
  // The first few picks always include a weapon, so every run finds a second attack early.
  if (s.level <= 4 && !picked.some(card => card.kind === 'weapon')) { const weapon = pool.find(item => item.card.kind === 'weapon'); if (weapon) picked[picked.length - 1] = weapon.card; }
  for (const bonus of BONUS) if (picked.length < 3) picked.push(bonus);
  return picked;
}
/** Applies one upgrade card to the build. Evolutions fire a free shockwave and an `evolve` event for the big moment. */
function applyCard(s: State, card: Card) {
  if (card.kind === 'weapon') {
    const id = card.key as WeaponId;
    if (s.weapons[id] === 0) { if (id === 'pulse') s.pulseCd = 0.2; if (id === 'lance') s.lanceCd = 0.2; if (id === 'meteor') s.meteorCd = 0.2; if (id === 'firepot') s.potCd = 0.2; if (id === 'whirl') s.windCd = 0.2; if (id === 'crossbow') s.xbowCd = 0.1; }
    s.weapons[id] = Math.min(MAX_LEVEL, s.weapons[id] + 1);
    if (id === 'blades') s.bladesEver = true;
    if (s.weapons[id] === MAX_LEVEL && !s.evolved.includes(id)) {
      s.evolved.push(id); s.score += 50;
      s.rings.push({ id: s.nextId++, r: 10, maxR: 230, dmg: 60 + s.level * 3, knock: 600, slow: true, burst: true });
      s.events.push({ type: 'evolve', key: id });
    }
  } else if (card.kind === 'passive') {
    const id = card.key as PassiveId;
    s.passives[id] = Math.min(MAX_LEVEL, s.passives[id] + 1);
    if (id === 'vitality') { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); }
  } else if (card.key === 'heal') s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.4);
  else s.score += 60;
}
export function chooseUpgrade(s: State, index: number): boolean {
  if (s.phase !== 'levelup') return false;
  const card = s.choices[index];
  if (!card) return false;
  applyCard(s, card);
  s.choices = []; s.phase = 'play'; s.invuln = Math.max(s.invuln, 0.6);
  return true;
}
/**
 * Treasure chest: evolutions that are ready come first, then upgrades to items already owned, then a heal or bounty.
 * Big chests (mid-boss, final boss) hold three items; small ones hold one, sometimes three.
 */
export function openChest(s: State, big: boolean) {
  const lucky = !big && s.cardRng() < 0.1 + 0.04 * s.passives.fortune, count = big || lucky ? 3 : 1, items: Card[] = [];
  for (let index = 0; index < count; index++) {
    const ready = s.pool.weapons.filter(id => canEvolve(s, id));
    let card: Card | undefined;
    if (ready.length) card = weaponCard(s, ready[Math.floor(s.cardRng() * ready.length)], PRE_EVOLVE);
    else {
      const pool = upgradePool(s).filter(item => item.card.level > 1);
      card = pool.length ? weighted(s.cardRng, pool) : undefined;
    }
    card ??= BONUS[s.hp < s.maxHp * 0.7 ? 0 : 1];
    applyCard(s, card); items.push(card);
  }
  const jade = big ? 4 : 1;
  s.jade += jade; s.chests++;
  // The sim never pauses for a chest: the shell holds the clock while it plays the reveal, then calls `closeChest`.
  if (s.chest) { s.chest.items.push(...items); s.chest.jade += jade; s.chest.big ||= big; } else s.chest = { items, jade, big };
  s.events.push({ type: 'chest', big });
}
export function closeChest(s: State): boolean {
  if (!s.chest) return false;
  s.chest = null; s.invuln = Math.max(s.invuln, 0.8);
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
  compact(s.fires, fire => fire.t > 0 || fire.burn > 0);
  compact(s.winds, wind => wind.life > 0);
  compact(s.gems, gem => !gem.taken);
  if (s.boss && s.boss.hp <= 0) s.boss = null;
  if (s.mid && s.mid.hp <= 0) s.mid = null;
  if (s.phase === 'play' && s.xp >= s.need) {
    s.xp -= s.need; s.level++; s.need = xpNeed(s.level);
    s.choices = rollChoices(s); s.phase = 'levelup';
    s.events.push({ type: 'levelup' });
  }
}
