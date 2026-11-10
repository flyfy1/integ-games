import {
  ARENA_H,
  ARENA_W,
  BASE_CELLS,
  BASE_WALL_CELLS,
  buildGrid,
  cellCenter,
  CHASSIS_SPECS,
  COLS,
  POWERUP_KINDS,
  ROWS,
  setBaseFortress,
  TILE
} from './maps';
import type {
  Bullet,
  ChassisId,
  Direction,
  EnemyArchetype,
  FloatingText,
  GameMode,
  LandMine,
  Particle,
  PlayerControlInput,
  PowerUpItem,
  PowerUpKind,
  Shockwave,
  SpawnWarning,
  Tank,
  TeamSetup,
  TileCell
} from './types';

export const DUEL_WIN_TARGET = 5;

export type SoundCue =
  | 'shoot'
  | 'laser'
  | 'bounce'
  | 'hit'
  | 'explode'
  | 'powerup'
  | 'portal'
  | 'mine'
  | 'freeze'
  | 'win'
  | 'lose'
  | 'alarm'
  | 'dash'
  | 'combo'
  | 'warn';

export type DefeatReason = 'base' | 'tanks' | null;

interface NavCache {
  base: Int16Array | null;
  baseStamp: number;
  fields: Record<string, { stamp: number; col: number; row: number; field: Int16Array }>;
}

export interface ArenaState {
  mode: GameMode;
  teamSetup: TeamSetup;
  stageIndex: number; // 0..5 for coop, 0..4 for duel
  roundNumber: number;
  p1Wins: number;
  p2Wins: number;
  p1Chassis: ChassisId;
  p2Chassis: ChassisId;
  grid: TileCell[][];
  tanks: Tank[];
  bullets: Bullet[];
  mines: LandMine[];
  powerUps: PowerUpItem[];
  particles: Particle[];
  shockwaves: Shockwave[];
  floatingTexts: FloatingText[];
  nextEntityId: number;
  enemiesRemainingToSpawn: EnemyArchetype[];
  spawnTimer: number;
  powerUpSpawnTimer: number;
  baseAlive: boolean;
  baseFortifyTimer: number;
  roundTimer: number;
  suddenDeath: boolean;
  outcome: 'none' | 'stage-clear' | 'coop-victory' | 'coop-defeat' | 'round-over' | 'duel-victory';
  roundWinner: 0 | 1 | -1 | null; // 0 = P1, 1 = P2, -1 = draw
  outcomeTimer: number;
  screenShake: number;
  bannerKey: string | null;
  bannerParam: number;
  bannerTimer: number;
  score: number;
  cues: SoundCue[];
  /** New Game+ counter: every finished campaign makes the next lap tougher. */
  loop: number;
  /** Seconds of "base under fire" HUD flash left. */
  baseFlash: number;
  defeatReason: DefeatReason;
  stageKills: number;
  totalEnemies: number;
  clearBonus: number;
  spawnWarnings: SpawnWarning[];
  spawnCount: number;
  comboCount: number;
  comboTimer: number;
  nav: NavCache;
}

export const ENEMY_STATS: Record<
  EnemyArchetype,
  { hp: number; speed: number; reload: number; bullet: number; points: number }
> = {
  scout: { hp: 1, speed: 165, reload: 1.5, bullet: 320, points: 100 },
  striker: { hp: 3, speed: 112, reload: 1.15, bullet: 340, points: 200 },
  sniper: { hp: 2, speed: 95, reload: 1.7, bullet: 560, points: 300 },
  juggernaut: { hp: 6, speed: 78, reload: 1.4, bullet: 300, points: 400 },
  cargo: { hp: 3, speed: 135, reload: 2.2, bullet: 300, points: 200 },
  'boss-behemoth': { hp: 22, speed: 74, reload: 1.15, bullet: 330, points: 2000 },
  'boss-omega': { hp: 26, speed: 84, reload: 1.0, bullet: 380, points: 3000 }
};

export function enemiesLeft(state: ArenaState): number {
  return (
    state.enemiesRemainingToSpawn.length +
    state.spawnWarnings.length +
    state.tanks.filter((t) => t.alive && t.team === 3).length
  );
}

export function baseHp(state: ArenaState): number {
  return state.grid[BASE_CELLS[0][1]]?.[BASE_CELLS[0][0]]?.hp ?? 0;
}

export function dirVector(dir: Direction): { dx: number; dy: number; angle: number } {
  switch (dir) {
    case 'up':
      return { dx: 0, dy: -1, angle: -Math.PI / 2 };
    case 'down':
      return { dx: 0, dy: 1, angle: Math.PI / 2 };
    case 'left':
      return { dx: -1, dy: 0, angle: Math.PI };
    case 'right':
      return { dx: 1, dy: 0, angle: 0 };
  }
}

/** Repeats a mix of archetypes until the wave is `count` strong. */
function mix(pattern: readonly EnemyArchetype[], count: number): EnemyArchetype[] {
  return Array.from({ length: count }, (_, i) => pattern[i % pattern.length]);
}

/** Inserts `boss` so that `after` regular tanks arrive before it. */
function withBoss(wave: EnemyArchetype[], after: number, boss: EnemyArchetype): EnemyArchetype[] {
  return [...wave.slice(0, after), boss, ...wave.slice(after)];
}

export function buildWaveList(stageIndex: number): EnemyArchetype[] {
  const s = stageIndex % 6;
  switch (s) {
    case 0:
      // A gentle opening: two slow strikers first, heavies only at the very end.
      return [...mix(['striker', 'striker', 'scout', 'cargo', 'scout', 'striker', 'sniper', 'scout'], 15), 'juggernaut'];
    case 1:
      return mix(['scout', 'striker', 'striker', 'cargo', 'sniper', 'scout', 'juggernaut', 'striker', 'sniper'], 20);
    case 2:
      return withBoss(mix(['striker', 'scout', 'sniper', 'cargo', 'juggernaut', 'striker', 'sniper', 'scout'], 18), 10, 'boss-behemoth');
    case 3:
      return mix(['sniper', 'striker', 'scout', 'cargo', 'sniper', 'juggernaut', 'striker', 'scout', 'juggernaut'], 24);
    case 4:
      return mix(['striker', 'juggernaut', 'scout', 'cargo', 'sniper', 'juggernaut', 'striker', 'sniper'], 26);
    default:
      return withBoss(
        withBoss(mix(['sniper', 'juggernaut', 'scout', 'cargo', 'striker', 'sniper', 'juggernaut', 'striker'], 22), 8, 'boss-behemoth'),
        18,
        'boss-omega'
      );
  }
}

export function createPlayerTank(
  playerIndex: 0 | 1,
  chassis: ChassisId,
  mode: GameMode,
  isAi: boolean,
  carryScore = 0
): Tank {
  const spec = CHASSIS_SPECS[chassis];
  // Duels get thicker armour so a round is a fight, not a two-second trade.
  const maxHp = mode === 'duel' ? spec.maxHp * 3 : spec.maxHp;
  const col = mode === 'coop' ? (playerIndex === 0 ? 6 : 13) : playerIndex === 0 ? 1 : 18;
  const row = mode === 'coop' ? 12 : 6;
  const pos = cellCenter(col, row);
  const dir: Direction = mode === 'coop' ? 'up' : playerIndex === 0 ? 'right' : 'left';
  return {
    id: `p${playerIndex + 1}`,
    team: mode === 'coop' ? 1 : playerIndex === 0 ? 1 : 2,
    playerIndex,
    isAi,
    chassis,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    dir,
    turretAngle: dirVector(dir).angle,
    radius: 17,
    hp: maxHp,
    maxHp,
    reloadTimer: 0,
    recoil: 0,
    shieldTimer: 3.0,
    freezeTimer: 0,
    portalCooldown: 0,
    spawnProtected: 3.0,
    weapon: null,
    weaponTimer: 0,
    mines: 3,
    dashCooldown: 0,
    dashTimer: 0,
    score: carryScore,
    kills: 0,
    alive: true,
    respawnTimer: 0,
    lives: mode === 'coop' ? 4 : 0,
    aiTimer: 0.2,
    aiWantFire: false,
    aiTargetDir: dir,
    aiGoal: 'hunt',
    aiReact: 0,
    aiWander: 0,
    aiStuck: 0,
    aiLastX: pos.x,
    aiLastY: pos.y,
    aiCol: col,
    aiRow: row,
    bossTimer: 0,
    bossCharging: false,
    hitFlash: 0,
    treadPhase: 0
  };
}

export function createEnemyTank(
  id: string,
  archetype: EnemyArchetype,
  col: number,
  row: number,
  loop = 0
): Tank {
  const pos = cellCenter(col, row);
  const isBoss = archetype === 'boss-behemoth' || archetype === 'boss-omega';
  const isCargo = archetype === 'cargo';
  const chassisMap: Record<EnemyArchetype, ChassisId> = {
    scout: 'phantom',
    striker: 'vanguard',
    sniper: 'prism',
    juggernaut: 'titan',
    cargo: 'vanguard',
    'boss-behemoth': 'titan',
    'boss-omega': 'prism'
  };
  const chassis = chassisMap[archetype];
  const hp = Math.round(ENEMY_STATS[archetype].hp * (isBoss ? 1 + loop * 0.25 : 1)) + (isBoss ? 0 : Math.min(3, loop));
  return {
    id,
    team: 3,
    isAi: true,
    archetype,
    isBoss,
    isCargo,
    chassis,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    dir: 'down',
    turretAngle: Math.PI / 2,
    radius: isBoss ? 22 : 17,
    hp,
    maxHp: hp,
    reloadTimer: 1.2,
    recoil: 0,
    shieldTimer: 0,
    freezeTimer: 0,
    portalCooldown: 0,
    spawnProtected: 1.0,
    weapon: archetype === 'boss-omega' ? 'spread' : null,
    weaponTimer: isBoss ? 999 : 0,
    mines: 0,
    dashCooldown: 0,
    dashTimer: 0,
    score: 0,
    kills: 0,
    alive: true,
    respawnTimer: 0,
    lives: 0,
    aiTimer: 0,
    aiWantFire: false,
    aiTargetDir: 'down',
    aiGoal: 'base',
    aiReact: 0,
    aiWander: 0,
    aiStuck: 0,
    aiLastX: pos.x,
    aiLastY: pos.y,
    aiCol: col,
    aiRow: row,
    bossTimer: 4.5,
    bossCharging: false,
    hitFlash: 0,
    treadPhase: 0
  };
}

export interface CreateArenaOptions {
  mode: GameMode;
  teamSetup: TeamSetup;
  stageIndex?: number;
  roundNumber?: number;
  p1Wins?: number;
  p2Wins?: number;
  p1Chassis?: ChassisId;
  p2Chassis?: ChassisId;
  carryScore?: number;
  loop?: number;
}

export function createArenaState(opts: CreateArenaOptions): ArenaState {
  const mode = opts.mode;
  const teamSetup = opts.teamSetup;
  const stageIndex = opts.stageIndex ?? 0;
  const roundNumber = opts.roundNumber ?? 1;
  const p1Chassis = opts.p1Chassis ?? 'vanguard';
  const p2Chassis = opts.p2Chassis ?? (mode === 'duel' ? 'prism' : 'titan');
  const grid = buildGrid(mode, stageIndex);

  const tanks: Tank[] = [
    createPlayerTank(0, p1Chassis, mode, false, opts.carryScore ?? 0)
  ];
  if (mode === 'duel' || teamSetup !== '1p-solo') {
    const p2IsAi = teamSetup === '1p-ai';
    tanks.push(createPlayerTank(1, p2Chassis, mode, p2IsAi, 0));
  }

  const enemiesRemainingToSpawn = mode === 'coop' ? buildWaveList(stageIndex) : [];

  return {
    mode,
    teamSetup,
    stageIndex,
    roundNumber,
    p1Wins: opts.p1Wins ?? 0,
    p2Wins: opts.p2Wins ?? 0,
    p1Chassis,
    p2Chassis,
    grid,
    tanks,
    bullets: [],
    mines: [],
    powerUps: [],
    particles: [],
    shockwaves: [],
    floatingTexts: [],
    nextEntityId: 1,
    enemiesRemainingToSpawn,
    spawnTimer: 1.4,
    powerUpSpawnTimer: mode === 'duel' ? 5.5 : 8.5,
    baseAlive: true,
    baseFortifyTimer: 0,
    roundTimer: 0,
    suddenDeath: false,
    outcome: 'none',
    roundWinner: null,
    outcomeTimer: 0,
    screenShake: 0,
    bannerKey: mode === 'coop' ? 'banner.stageStart' : 'banner.roundStart',
    bannerParam: mode === 'coop' ? stageIndex + 1 : roundNumber,
    bannerTimer: 2.4,
    score: opts.carryScore ?? 0,
    cues: [],
    loop: opts.loop ?? 0,
    baseFlash: 0,
    defeatReason: null,
    stageKills: 0,
    totalEnemies: enemiesRemainingToSpawn.length,
    clearBonus: 0,
    spawnWarnings: [],
    spawnCount: 0,
    comboCount: 0,
    comboTimer: 0,
    nav: { base: null, baseStamp: -1, fields: {} }
  };
}

export function tileAtPixel(grid: TileCell[][], x: number, y: number): { col: number; row: number; cell: TileCell | null } {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return { col, row, cell: null };
  }
  return { col, row, cell: grid[row][col] };
}

export function isTileSolidForTank(kind: TileCell['kind']): boolean {
  return kind === 'brick' || kind === 'steel' || kind === 'water' || kind === 'barrel' || kind === 'base';
}

export function isTileSolidForBullet(kind: TileCell['kind']): boolean {
  return kind === 'brick' || kind === 'steel' || kind === 'barrel' || kind === 'base';
}

function circleIntersectsTile(x: number, y: number, r: number, col: number, row: number): boolean {
  const left = col * TILE;
  const right = left + TILE;
  const top = row * TILE;
  const bottom = top + TILE;
  const closestX = Math.max(left, Math.min(x, right));
  const closestY = Math.max(top, Math.min(y, bottom));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < r * r;
}

function canTankStandAt(state: ArenaState, tank: Tank, nx: number, ny: number): boolean {
  const r = tank.radius - 1;
  if (nx - r < 0 || nx + r > ARENA_W || ny - r < 0 || ny + r > ARENA_H) {
    return false;
  }
  const minCol = Math.max(0, Math.floor((nx - r) / TILE));
  const maxCol = Math.min(COLS - 1, Math.floor((nx + r) / TILE));
  const minRow = Math.max(0, Math.floor((ny - r) / TILE));
  const maxRow = Math.min(ROWS - 1, Math.floor((ny + r) / TILE));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = state.grid[row][col];
      if (isTileSolidForTank(cell.kind) && circleIntersectsTile(nx, ny, r, col, row)) {
        return false;
      }
    }
  }
  for (const other of state.tanks) {
    if (!other.alive || other.id === tank.id) continue;
    const dist = Math.hypot(nx - other.x, ny - other.y);
    const minDist = tank.radius + other.radius - 3;
    if (dist < minDist && dist < Math.hypot(tank.x - other.x, tank.y - other.y)) {
      return false;
    }
  }
  return true;
}

function addParticles(
  state: ArenaState,
  x: number,
  y: number,
  color: string,
  count: number,
  speed = 150,
  life = 0.45,
  size = 4
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (i % 2) * 0.25;
    const v = speed * (0.55 + ((i * 37) % 10) * 0.06);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      size,
      color,
      life,
      maxLife: life
    });
  }
}

function addFloatingText(state: ArenaState, x: number, y: number, text: string, color: string): void {
  state.floatingTexts.push({ x, y, text, color, life: 1.15 });
}

/** Floating text whose wording comes from the i18n table (`text` is the key). */
function addFloatingKey(state: ArenaState, x: number, y: number, key: string, color: string, n?: number): void {
  state.floatingTexts.push({ x, y, text: key, key: true, n, color, life: 1.3 });
}

function addShockwave(state: ArenaState, x: number, y: number, maxRadius: number, color: string): void {
  state.shockwaves.push({
    x,
    y,
    radius: 6,
    maxRadius,
    color,
    life: 0.35,
    maxLife: 0.35
  });
}

export function spawnPowerUpAt(state: ArenaState, x: number, y: number, random: () => number, forcedKind?: PowerUpKind): void {
  const pool = state.mode === 'duel'
    ? POWERUP_KINDS.filter((k) => k !== 'repair' || state.tanks.some((t) => t.hp < t.maxHp))
    : POWERUP_KINDS;
  const kind = forcedKind ?? pool[Math.floor(random() * pool.length) % pool.length];
  state.powerUps.push({
    id: state.nextEntityId++,
    kind,
    x,
    y,
    life: 16,
    pulse: 0
  });
}

export function detonateExplosion(
  state: ArenaState,
  cx: number,
  cy: number,
  blastRadius: number,
  damage: number,
  attackerTeam: 1 | 2 | 3,
  attackerPlayerIndex: 0 | 1 | undefined,
  breakSteel: boolean,
  random: () => number,
  excludeId?: string
): void {
  state.cues.push('explode');
  state.screenShake = Math.max(state.screenShake, 9);
  addShockwave(state, cx, cy, blastRadius, '#ff9f43');
  addParticles(state, cx, cy, '#ff6b6b', 16, 220, 0.55, 5);
  addParticles(state, cx, cy, '#feca57', 10, 140, 0.4, 4);

  const minCol = Math.max(0, Math.floor((cx - blastRadius) / TILE));
  const maxCol = Math.min(COLS - 1, Math.floor((cx + blastRadius) / TILE));
  const minRow = Math.max(0, Math.floor((cy - blastRadius) / TILE));
  const maxRow = Math.min(ROWS - 1, Math.floor((cy + blastRadius) / TILE));

  const chainBarrels: Array<[number, number]> = [];
  let baseHit = false;
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const center = cellCenter(c, r);
      if (Math.hypot(center.x - cx, center.y - cy) > blastRadius + TILE * 0.35) continue;
      const cell = state.grid[r][c];
      if (cell.kind === 'brick') {
        state.grid[r][c] = { kind: 'empty', hp: 0, maxHp: 0 };
        addParticles(state, center.x, center.y, '#d97757', 6, 110, 0.35, 3);
      } else if (cell.kind === 'steel' && breakSteel) {
        cell.hp -= 2;
        if (cell.hp <= 0) {
          state.grid[r][c] = { kind: 'empty', hp: 0, maxHp: 0 };
          addParticles(state, center.x, center.y, '#cbd5e1', 8, 130, 0.4, 4);
        }
      } else if (cell.kind === 'barrel') {
        state.grid[r][c] = { kind: 'empty', hp: 0, maxHp: 0 };
        chainBarrels.push([center.x, center.y]);
      } else if (cell.kind === 'base') {
        baseHit = true;
      }
    }
  }
  // One blast hurts the Eagle once, and the defenders' own blasts never do.
  if (baseHit && !(state.mode === 'coop' && attackerTeam === 1)) damageBase(state, 1);

  for (const tank of state.tanks) {
    if (!tank.alive || tank.id === excludeId) continue;
    const dist = Math.hypot(tank.x - cx, tank.y - cy);
    if (dist <= blastRadius + tank.radius * 0.6) {
      // In Co-op, player explosions don't friendly-fire allies unless it's an enemy barrel hit
      if (state.mode === 'coop' && attackerTeam === 1 && tank.team === 1) continue;
      damageTank(state, tank, damage, attackerTeam, attackerPlayerIndex, random);
    }
  }

  for (const [bx, by] of chainBarrels) {
    detonateExplosion(state, bx, by, TILE * 1.85, 2, attackerTeam, attackerPlayerIndex, true, random);
  }
}

const BASE_FLASH = 1.1;
const BASE_GRACE = 0.4;

function damageBase(state: ArenaState, dmg: number): void {
  if (!state.baseAlive) return;
  // A volley (triple shot, chained barrels) counts as one hit: the Eagle shrugs off follow-ups for a moment.
  if (state.baseFlash > BASE_FLASH - BASE_GRACE) return;
  state.baseFlash = BASE_FLASH;
  state.cues.push('alarm');
  const mid = cellCenter(9.5, 12);
  addFloatingKey(state, mid.x, mid.y - 26, 'fx.baseHit', '#ff6b81', dmg);
  addParticles(state, mid.x, mid.y, '#fbbf24', 10, 150, 0.4, 4);
  for (const [c, r] of BASE_CELLS) {
    const cell = state.grid[r][c];
    if (cell.kind === 'base') {
      cell.hp = Math.max(0, cell.hp - dmg);
      if (cell.hp <= 0) {
        state.baseAlive = false;
      }
    }
  }
  if (!state.baseAlive) {
    const center = cellCenter(9.5, 12);
    addShockwave(state, center.x, center.y, 110, '#ff4757');
    addParticles(state, center.x, center.y, '#ff6b81', 24, 240, 0.7, 6);
    state.cues.push('lose');
    state.outcome = 'coop-defeat';
    state.defeatReason = 'base';
    state.screenShake = Math.max(state.screenShake, 12);
    state.outcomeTimer = 2.6;
    state.bannerKey = 'banner.gameOver';
    state.bannerTimer = 99;
  }
}

export function damageTank(
  state: ArenaState,
  victim: Tank,
  damage: number,
  _attackerTeam: 1 | 2 | 3,
  attackerPlayerIndex: 0 | 1 | undefined,
  random: () => number
): void {
  if (!victim.alive || victim.spawnProtected > 0) return;
  if (victim.shieldTimer > 0) {
    victim.shieldTimer = Math.max(0, victim.shieldTimer - 3.2);
    state.cues.push('bounce');
    addParticles(state, victim.x, victim.y, '#48dbfb', 8, 120, 0.3, 3);
    addFloatingKey(state, victim.x, victim.y - 18, 'fx.shield', '#48dbfb');
    return;
  }

  victim.hp -= damage;
  victim.hitFlash = 0.14;
  if (victim.playerIndex !== undefined && !victim.isAi) state.screenShake = Math.max(state.screenShake, 4);
  state.cues.push('hit');
  addParticles(state, victim.x, victim.y, CHASSIS_SPECS[victim.chassis].colorPrimary, 8, 130, 0.35, 3);

  // Cargo tank drops a powerup on hit or death!
  if (victim.isCargo && victim.hp > 0) {
    spawnPowerUpAt(state, victim.x, victim.y, random);
    victim.isCargo = false;
  }

  if (victim.hp > 0) return;

  // Tank destroyed!
  victim.alive = false;
  victim.hp = 0;
  state.cues.push('explode');
  state.screenShake = Math.max(state.screenShake, victim.isBoss ? 12 : 6);
  addShockwave(state, victim.x, victim.y, victim.isBoss ? 92 : 52, CHASSIS_SPECS[victim.chassis].colorAccent);
  addParticles(state, victim.x, victim.y, CHASSIS_SPECS[victim.chassis].colorPrimary, victim.isBoss ? 24 : 14, 200, 0.55, 5);
  addParticles(state, victim.x, victim.y, '#ffd15c', 10, 150, 0.45, 4);

  if (victim.isCargo || victim.isBoss || (victim.team === 3 && random() < 0.22)) {
    spawnPowerUpAt(state, victim.x, victim.y, random);
  }
  if (victim.team === 3) state.stageKills += 1;

  if (attackerPlayerIndex !== undefined && victim.playerIndex !== attackerPlayerIndex) {
    const scorer = state.tanks.find((t) => t.playerIndex === attackerPlayerIndex);
    let pts = victim.team === 3 && victim.archetype ? ENEMY_STATS[victim.archetype].points : 300;
    if (victim.team === 3) {
      // Chain kills inside three seconds for a growing bonus.
      state.comboCount = state.comboTimer > 0 ? state.comboCount + 1 : 1;
      state.comboTimer = 3;
      if (state.comboCount >= 2) {
        const bonus = Math.min(500, 50 * (state.comboCount - 1));
        pts += bonus;
        state.cues.push('combo');
        addFloatingKey(state, victim.x, victim.y - 34, 'fx.combo', '#ff9f43', state.comboCount);
      }
    }
    if (scorer) {
      scorer.kills += 1;
      scorer.score += pts;
    }
    state.score += pts;
    addFloatingText(state, victim.x, victim.y - 14, `+${pts}`, '#ffd15c');
  }

  if (state.mode === 'coop' && victim.team === 1) {
    if (victim.lives > 0) {
      victim.lives -= 1;
      victim.respawnTimer = 1.4;
    }
  }
}

export function fireTankWeapon(state: ArenaState, tank: Tank): void {
  if (!tank.alive || tank.reloadTimer > 0 || tank.freezeTimer > 0) return;
  const spec = CHASSIS_SPECS[tank.chassis];
  const weapon = tank.weapon;
  const { angle } = dirVector(tank.dir);
  tank.turretAngle = angle;

  let reload = spec.reload;
  if (weapon === 'ricochet') reload *= 0.48; // Rapid Overdrive
  if (weapon === 'laser') reload *= 0.8;
  if (weapon === 'spread') reload *= 0.88;
  const stats = tank.team === 3 && tank.archetype ? ENEMY_STATS[tank.archetype] : null;
  if (stats) {
    reload = stats.reload * Math.pow(0.9, Math.min(4, state.loop));
    if (tank.isBoss && tank.hp <= tank.maxHp / 2) reload *= 0.75;
  } else if (tank.isAi) {
    // The wingman supports, it does not steal the show; the duel rival is a touch slower than a human.
    reload *= state.mode === 'duel' ? 1.45 : 2.3;
  }
  tank.reloadTimer = reload;
  tank.recoil = 7;

  const bounces = 0; // Realistic shells: explode on wall impact instead of bouncing
  const pierceSteel = (tank.team !== 3 && spec.pierceSteel) || weapon === 'laser';
  const pierceTanks = weapon === 'laser';
  const homing = weapon === 'homing';
  const baseSpeed = stats ? stats.bullet : spec.bulletSpeed;
  const speed = baseSpeed * (weapon === 'laser' ? 1.45 : weapon === 'ricochet' ? 1.3 : 1);
  const damage = tank.team === 3 ? 1 : weapon === 'laser' ? Math.max(2, spec.damage) : spec.damage;
  const color =
    tank.team === 3
      ? tank.isBoss
        ? '#ff4d8d'
        : '#ff5a6e'
      : weapon === 'laser'
      ? '#ff5252'
      : weapon === 'homing'
        ? '#ff6bcb'
        : weapon === 'ricochet'
          ? '#54a0ff'
          : weapon === 'spread'
            ? '#ff9f43'
            : spec.colorAccent;

  const angles =
    weapon === 'spread' || tank.archetype === 'boss-omega'
      ? [angle - 0.22, angle, angle + 0.22]
      : spec.burstCount === 2
        ? [angle - 0.06, angle + 0.06]
        : [angle];

  state.cues.push(weapon === 'laser' ? 'laser' : 'shoot');

  for (const a of angles) {
    pushBullet(state, tank, a, speed, {
      radius: weapon === 'laser' ? 5 : tank.chassis === 'titan' ? 6 : 4.5,
      damage,
      bounces,
      pierceSteel,
      pierceTanks,
      homing,
      splashRadius: tank.team === 3 && !tank.isBoss && tank.archetype !== 'juggernaut' ? 0 : spec.splashRadius,
      color
    });
  }
  // Muzzle flash
  const mx = tank.x + Math.cos(angle) * (tank.radius + 8);
  const my = tank.y + Math.sin(angle) * (tank.radius + 8);
  addParticles(state, mx, my, '#fff7d6', 4, 70, 0.12, 3.5);
}

function pushBullet(
  state: ArenaState,
  tank: Tank,
  a: number,
  speed: number,
  o: {
    radius: number;
    damage: number;
    bounces: number;
    pierceSteel: boolean;
    pierceTanks: boolean;
    homing: boolean;
    splashRadius: number;
    color: string;
  }
): void {
  const bx = tank.x + Math.cos(a) * (tank.radius + 6);
  const by = tank.y + Math.sin(a) * (tank.radius + 6);
  state.bullets.push({
    id: state.nextEntityId++,
    ownerId: tank.id,
    team: tank.team,
    playerIndex: tank.playerIndex,
    x: bx,
    y: by,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    radius: o.radius,
    damage: o.damage,
    bouncesLeft: o.bounces,
    pierceSteel: o.pierceSteel,
    pierceTanks: o.pierceTanks,
    homing: o.homing,
    splashRadius: o.splashRadius,
    portalCooldown: 0,
    color: o.color,
    life: 3.4,
    trail: [{ x: bx, y: by }]
  });
}

/** Boss specials: the Behemoth lobs aimed shells, the Omega fires a ring. Telegraphed 0.7s ahead. */
function updateBossSpecial(state: ArenaState, tank: Tank, dt: number): void {
  tank.bossTimer -= dt;
  if (!tank.bossCharging && tank.bossTimer <= 0.7) {
    tank.bossCharging = true;
    state.cues.push('warn');
    addShockwave(state, tank.x, tank.y, 64, '#ff4d8d');
  }
  if (tank.bossTimer > 0) return;
  const enraged = tank.hp <= tank.maxHp / 2;
  tank.bossCharging = false;
  tank.bossTimer = enraged ? 3.4 : 5.0;
  tank.recoil = 9;
  state.cues.push('shoot');
  const opts = {
    radius: 6,
    damage: 1,
    bounces: 0,
    pierceSteel: false,
    pierceTanks: false,
    homing: false,
    splashRadius: 0,
    color: '#ff4d8d'
  };
  if (tank.archetype === 'boss-omega') {
    const count = enraged ? 12 : 8;
    for (let i = 0; i < count; i++) pushBullet(state, tank, (Math.PI * 2 * i) / count + (enraged ? 0.26 : 0), 250, opts);
  } else {
    const targets = state.tanks.filter((t) => t.alive && t.team !== 3);
    if (targets.length === 0) return;
    const target = targets.sort(
      (a, b) => Math.hypot(a.x - tank.x, a.y - tank.y) - Math.hypot(b.x - tank.x, b.y - tank.y)
    )[0];
    const aim = Math.atan2(target.y - tank.y, target.x - tank.x);
    for (const off of enraged ? [-0.3, -0.1, 0.1, 0.3] : [-0.16, 0, 0.16]) pushBullet(state, tank, aim + off, 290, opts);
  }
}

export function triggerTankSpecial(state: ArenaState, tank: Tank): void {
  if (!tank.alive || tank.freezeTimer > 0) return;
  let acted = false;
  if (tank.mines > 0) {
    tank.mines -= 1;
    state.mines.push({
      id: state.nextEntityId++,
      ownerId: tank.id,
      team: tank.team,
      playerIndex: tank.playerIndex,
      x: tank.x,
      y: tank.y,
      armTimer: 0.55,
      life: 24,
      radius: 13
    });
    state.cues.push('mine');
    addFloatingKey(state, tank.x, tank.y - 16, 'fx.mine', '#feca57');
    acted = true;
  }
  // Out of mines: the same button still gets you out of trouble.
  if (!acted) triggerTankDash(state, tank);
}

export const DASH_COOLDOWN = 2.4;
const DASH_TIME = 0.2;
const DASH_SPEED = 560;

/** A short burst forward that shrugs off shells: the dodge button. */
export function triggerTankDash(state: ArenaState, tank: Tank): boolean {
  if (!tank.alive || tank.freezeTimer > 0 || tank.dashCooldown > 0) return false;
  tank.dashTimer = DASH_TIME;
  tank.dashCooldown = DASH_COOLDOWN;
  tank.spawnProtected = Math.max(tank.spawnProtected, DASH_TIME + 0.06);
  addParticles(state, tank.x, tank.y, CHASSIS_SPECS[tank.chassis].colorPrimary, 8, 110, 0.3, 3.5);
  state.cues.push('dash');
  return true;
}

function moveTankWithSlide(state: ArenaState, tank: Tank, moveX: number, moveY: number, dt: number): void {
  const spec = CHASSIS_SPECS[tank.chassis];
  const under = tileAtPixel(state.grid, tank.x, tank.y).cell;
  const onIce = under?.kind === 'ice' && tank.chassis !== 'phantom' && tank.team !== 3;
  const inBush = under?.kind === 'bush';

  let maxSpeed = spec.speed;
  if (inBush && tank.chassis === 'phantom') maxSpeed *= 1.22;
  if (tank.weapon === 'ricochet') maxSpeed *= 1.25; // Rapid Overdrive speed boost
  if (tank.team === 3 && tank.archetype) {
    maxSpeed = ENEMY_STATS[tank.archetype].speed * (1 + 0.07 * Math.min(4, state.loop));
  } else if (tank.isAi) maxSpeed *= state.mode === 'duel' ? 0.86 : 0.82;
  const dashing = tank.dashTimer > 0;
  if (dashing) maxSpeed = DASH_SPEED;

  let dir: Direction | null = null;
  if (dashing) {
    dir = tank.dir;
    if (Math.floor(tank.dashTimer * 60) % 2 === 0) {
      addParticles(state, tank.x, tank.y, CHASSIS_SPECS[tank.chassis].colorPrimary, 2, 40, 0.22, 3);
    }
  } else if (Math.abs(moveX) > 0.2 || Math.abs(moveY) > 0.2) {
    if (Math.abs(moveX) >= Math.abs(moveY)) {
      dir = moveX > 0 ? 'right' : 'left';
    } else {
      dir = moveY > 0 ? 'down' : 'up';
    }
    tank.dir = dir;
    tank.turretAngle = dirVector(dir).angle;
  }

  const targetVx = dir ? dirVector(dir).dx * maxSpeed : 0;
  const targetVy = dir ? dirVector(dir).dy * maxSpeed : 0;

  if (onIce && !dashing) {
    const blend = Math.min(1, dt * 3.2);
    tank.vx += (targetVx * 1.12 - tank.vx) * blend;
    tank.vy += (targetVy * 1.12 - tank.vy) * blend;
  } else {
    tank.vx = targetVx;
    tank.vy = targetVy;
  }

  const dx = tank.vx * dt;
  const dy = tank.vy * dt;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

  tank.treadPhase = (tank.treadPhase + Math.hypot(dx, dy) * 0.25) % 100;

  // Try horizontal step + corner assist
  if (Math.abs(dx) > 0) {
    if (canTankStandAt(state, tank, tank.x + dx, tank.y)) {
      tank.x += dx;
    } else {
      // Corner slide toward nearest row lane center
      const idealY = (Math.floor(tank.y / TILE) + 0.5) * TILE;
      const diffY = idealY - tank.y;
      if (Math.abs(diffY) > 1 && Math.abs(diffY) <= 18) {
        const slideStep = Math.sign(diffY) * Math.min(Math.abs(diffY), maxSpeed * dt * 0.9);
        if (canTankStandAt(state, tank, tank.x + dx * 0.5, tank.y + slideStep)) {
          tank.y += slideStep;
          tank.x += dx * 0.5;
        }
      }
      if (onIce) tank.vx *= -0.3;
    }
  }

  // Try vertical step + corner assist
  if (Math.abs(dy) > 0) {
    if (canTankStandAt(state, tank, tank.x, tank.y + dy)) {
      tank.y += dy;
    } else {
      const idealX = (Math.floor(tank.x / TILE) + 0.5) * TILE;
      const diffX = idealX - tank.x;
      if (Math.abs(diffX) > 1 && Math.abs(diffX) <= 18) {
        const slideStep = Math.sign(diffX) * Math.min(Math.abs(diffX), maxSpeed * dt * 0.9);
        if (canTankStandAt(state, tank, tank.x + slideStep, tank.y + dy * 0.5)) {
          tank.x += slideStep;
          tank.y += dy * 0.5;
        }
      }
      if (onIce) tank.vy *= -0.3;
    }
  }

  // Check Portal teleport
  if (tank.portalCooldown <= 0) {
    const currentTile = tileAtPixel(state.grid, tank.x, tank.y).cell;
    if (currentTile?.kind === 'portal' && currentTile.partnerCol !== undefined && currentTile.partnerRow !== undefined) {
      const dest = cellCenter(currentTile.partnerCol, currentTile.partnerRow);
      tank.x = dest.x;
      tank.y = dest.y;
      tank.portalCooldown = 1.35;
      state.cues.push('portal');
      addShockwave(state, dest.x, dest.y, 40, '#36d6ff');
      addParticles(state, dest.x, dest.y, '#36d6ff', 10, 140, 0.35, 4);
    }
  }
}

function collectPowerUp(state: ArenaState, tank: Tank, item: PowerUpItem): void {
  state.cues.push('powerup');
  addShockwave(state, item.x, item.y, 44, '#ffd15c');
  addParticles(state, item.x, item.y, '#ffd15c', 10, 130, 0.4, 4);

  switch (item.kind) {
    case 'shield':
      tank.shieldTimer = 9.0;
      break;
    case 'mine':
      tank.mines = Math.min(6, tank.mines + 3);
      break;
    case 'freeze':
      state.cues.push('freeze');
      for (const other of state.tanks) {
        if (!other.alive || other.team === tank.team) continue;
        other.freezeTimer = state.mode === 'duel' ? 3.5 : other.isBoss ? 2.5 : 6.0;
        addParticles(state, other.x, other.y, '#70f0c2', 10, 110, 0.45, 4);
      }
      break;
    case 'repair':
      tank.hp = Math.min(tank.maxHp, tank.hp + 3);
      if (state.mode === 'coop') {
        setBaseFortress(state.grid, 'steel');
        state.baseFortifyTimer = 18.0;
        for (const [c, r] of BASE_CELLS) {
          if (state.grid[r][c].kind === 'base') state.grid[r][c].hp = 6;
        }
      }
      break;
    default:
      tank.weapon = item.kind;
      tank.weaponTimer = 12.0;
      break;
  }

  if (tank.playerIndex !== undefined) {
    tank.score += 100;
    state.score += 100;
  }
  addFloatingKey(state, tank.x, tank.y - 22, `power.${item.kind}`, '#70f0c2');
}

// ---------------------------------------------------------------------------------------------
// Navigation & AI
// ---------------------------------------------------------------------------------------------

export const NAV_BLOCKED = 9999;
const DIRS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const BASE_WALL_KEYS = new Set(BASE_WALL_CELLS.map(([c, r]) => r * COLS + c));

function navEnterCost(kind: TileCell['kind'], cellIndex: number, avoidBaseWalls: boolean): number {
  switch (kind) {
    case 'empty':
    case 'bush':
    case 'ice':
    case 'base':
      return 1;
    case 'portal':
      return 6;
    case 'brick':
      // Bricks can be shot open, which takes a while. Defenders never dig through their own fort.
      return avoidBaseWalls && BASE_WALL_KEYS.has(cellIndex) ? NAV_BLOCKED : 4;
    default:
      return NAV_BLOCKED;
  }
}

/**
 * Cost-to-target for every cell (Dijkstra over the 20x13 grid). Bricks are passable at a price,
 * so tanks route *through* walls they can shoot down instead of bumping around them forever.
 */
export function computeNavField(
  grid: TileCell[][],
  targets: ReadonlyArray<readonly [number, number]>,
  avoidBaseWalls = false
): Int16Array {
  const n = COLS * ROWS;
  const dist = new Int16Array(n).fill(NAV_BLOCKED);
  const done = new Uint8Array(n);
  for (const [c, r] of targets) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) dist[r * COLS + c] = 0;
  }
  for (;;) {
    let u = -1;
    let best = NAV_BLOCKED;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u < 0) break;
    done[u] = 1;
    const uc = u % COLS;
    const ur = (u - uc) / COLS;
    // Moving from a neighbour into `u` costs whatever `u` costs to enter.
    const enter = best === 0 ? 1 : navEnterCost(grid[ur][uc].kind, u, avoidBaseWalls);
    if (enter >= NAV_BLOCKED) continue;
    const nd = best + enter;
    if (uc > 0 && nd < dist[u - 1]) dist[u - 1] = nd;
    if (uc < COLS - 1 && nd < dist[u + 1]) dist[u + 1] = nd;
    if (ur > 0 && nd < dist[u - COLS]) dist[u - COLS] = nd;
    if (ur < ROWS - 1 && nd < dist[u + COLS]) dist[u + COLS] = nd;
  }
  // Cells a tank can never stand in are not part of any route.
  for (let i = 0; i < n; i++) {
    if (dist[i] === 0) continue;
    const c = i % COLS;
    const kind = grid[(i - c) / COLS][c].kind;
    if (kind === 'steel' || kind === 'water' || kind === 'barrel') dist[i] = NAV_BLOCKED;
  }
  return dist;
}

function cellOfTank(tank: Tank): [number, number] {
  return [
    Math.max(0, Math.min(COLS - 1, Math.floor(tank.x / TILE))),
    Math.max(0, Math.min(ROWS - 1, Math.floor(tank.y / TILE)))
  ];
}

function baseField(state: ArenaState): Int16Array {
  const nav = state.nav;
  if (!nav.base || state.roundTimer - nav.baseStamp > 0.5 || state.roundTimer < nav.baseStamp) {
    nav.base = computeNavField(state.grid, BASE_CELLS);
    nav.baseStamp = state.roundTimer;
  }
  return nav.base;
}

function fieldTo(state: ArenaState, key: string, col: number, row: number, avoidBaseWalls: boolean): Int16Array {
  const nav = state.nav;
  const hit = nav.fields[key];
  if (hit && hit.col === col && hit.row === row && state.roundTimer - hit.stamp <= 0.45 && state.roundTimer >= hit.stamp) {
    return hit.field;
  }
  const field = computeNavField(state.grid, [[col, row]], avoidBaseWalls);
  nav.fields[key] = { stamp: state.roundTimer, col, row, field };
  return field;
}

export interface LineHit {
  kind: 'tank' | 'brick' | 'steel' | 'base' | 'barrel' | 'portal' | 'edge';
  tank?: Tank;
  dist: number;
  col: number;
  row: number;
}

/** What a shell fired by `tank` in direction `dir` would strike first (teammates are ignored). */
export function lineOfFire(state: ArenaState, tank: Tank, dir: Direction): LineHit {
  const { dx, dy } = dirVector(dir);
  const step = 6;
  for (let d = tank.radius; d < ARENA_W; d += step) {
    const x = tank.x + dx * d;
    const y = tank.y + dy * d;
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    if (x < 0 || x >= ARENA_W || y < 0 || y >= ARENA_H) return { kind: 'edge', dist: d, col, row };
    const kind = state.grid[row][col].kind;
    // A portal swallows the shell and spits it out elsewhere, so the lane ends there.
    if (kind === 'brick' || kind === 'steel' || kind === 'base' || kind === 'barrel' || kind === 'portal') {
      return { kind, dist: d, col, row };
    }
    for (const other of state.tanks) {
      if (!other.alive || other.id === tank.id || other.team === tank.team) continue;
      if (Math.hypot(other.x - x, other.y - y) < other.radius) return { kind: 'tank', tank: other, dist: d, col, row };
    }
  }
  return { kind: 'edge', dist: ARENA_W, col: -1, row: -1 };
}

function isHidden(state: ArenaState, target: Tank, viewer: Tank): boolean {
  if (tileAtPixel(state.grid, target.x, target.y).cell?.kind !== 'bush') return false;
  return Math.hypot(target.x - viewer.x, target.y - viewer.y) > TILE * 2.6;
}

/** Nearest visible hostile sitting in one of the tank's four firing lanes with nothing in the way. */
function findEngagement(state: ArenaState, tank: Tank, hostiles: Tank[]): { dir: Direction; target: Tank; dist: number } | null {
  const lane = TILE * 0.38;
  let best: { dir: Direction; target: Tank; dist: number } | null = null;
  for (const h of hostiles) {
    const dx = h.x - tank.x;
    const dy = h.y - tank.y;
    let dir: Direction;
    if (Math.abs(dx) < lane) dir = dy > 0 ? 'down' : 'up';
    else if (Math.abs(dy) < lane) dir = dx > 0 ? 'right' : 'left';
    else continue;
    const hit = lineOfFire(state, tank, dir);
    if (hit.kind !== 'tank' || hit.tank !== h) continue;
    if (!best || hit.dist < best.dist) best = { dir, target: h, dist: hit.dist };
  }
  return best;
}

/** Next step down the cost field: a direction, and what kind of tile is in the way (if any). */
function navStep(
  state: ArenaState,
  tank: Tank,
  field: Int16Array
): { dir: Direction | null; blocker: TileCell['kind'] | null; arrived: boolean } {
  const [c, r] = cellOfTank(tank);
  const here = field[r * COLS + c];
  if (here === 0) return { dir: null, blocker: null, arrived: true };
  let bestDir: Direction | null = null;
  let bestVal = here >= NAV_BLOCKED ? NAV_BLOCKED : here;
  let bc = c;
  let br = r;
  for (const d of DIRS) {
    const v = dirVector(d);
    const nc = c + v.dx;
    const nr = r + v.dy;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    const val = field[nr * COLS + nc];
    // Prefer to keep rolling the way we already face when two routes tie.
    if (val < bestVal || (val === bestVal && bestDir !== null && d === tank.dir && val < here)) {
      bestVal = val;
      bestDir = d;
      bc = nc;
      br = nr;
    }
  }
  if (!bestDir) return { dir: null, blocker: null, arrived: false };
  const kind = state.grid[br][bc].kind;
  const blocker = kind === 'brick' || kind === 'base' ? kind : null;
  // Square up to the lane before turning down it.
  const centre = cellCenter(c, r);
  if (bestDir === 'left' || bestDir === 'right') {
    const off = centre.y - tank.y;
    if (Math.abs(off) > 3) return { dir: off > 0 ? 'down' : 'up', blocker: null, arrived: false };
  } else {
    const off = centre.x - tank.x;
    if (Math.abs(off) > 3) return { dir: off > 0 ? 'right' : 'left', blocker: null, arrived: false };
  }
  return { dir: bestDir, blocker, arrived: false };
}

function nearestBy<T extends { x: number; y: number }>(items: T[], x: number, y: number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - x, it.y - y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

const GUARD_POSTS: ReadonlyArray<readonly [number, number]> = [
  [13, 10],
  [12, 10],
  [14, 11],
  [13, 12]
];

function computeAiControls(state: ArenaState, tank: Tank, dt: number, random: () => number): PlayerControlInput {
  tank.aiTimer -= dt;
  tank.aiReact = Math.max(0, tank.aiReact - dt);
  if (tank.aiWander > 0) tank.aiWander = Math.max(0, tank.aiWander - dt);

  const isEnemy = tank.team === 3;
  const isDuel = state.mode === 'duel';
  const hostiles = state.tanks.filter((o) => o.alive && o.team !== tank.team);
  const visible = hostiles.filter((h) => !isHidden(state, h, tank));
  const [col, row] = cellOfTank(tank);

  // --- 1. Choose where to go ---------------------------------------------------------------
  let field: Int16Array | null = null;
  if (isEnemy) {
    if (tank.aiTimer <= 0) {
      tank.aiTimer = 3 + random() * 3;
      const roll = random();
      switch (tank.archetype) {
        case 'scout':
          tank.aiGoal = roll < 0.75 ? 'base' : 'hunt';
          break;
        case 'striker':
          tank.aiGoal = roll < 0.6 ? 'hunt' : 'base';
          break;
        case 'sniper':
          tank.aiGoal = roll < 0.8 ? 'hunt' : 'base';
          break;
        case 'cargo':
          tank.aiGoal = roll < 0.7 ? 'wander' : 'base';
          tank.aiCol = 1 + Math.floor(random() * (COLS - 2));
          tank.aiRow = 1 + Math.floor(random() * (ROWS - 4));
          break;
        default:
          tank.aiGoal = roll < 0.65 ? 'base' : 'hunt';
      }
    }
    const prey = tank.aiGoal === 'hunt' ? nearestBy(visible, tank.x, tank.y) : undefined;
    if (prey) {
      const [pc, pr] = cellOfTank(prey);
      field = fieldTo(state, `t:${prey.id}`, pc, pr, false);
    } else if (tank.aiGoal === 'wander') {
      field = fieldTo(state, `w:${tank.id}`, tank.aiCol, tank.aiRow, false);
      if (field[row * COLS + col] === 0 || field[row * COLS + col] >= NAV_BLOCKED) tank.aiTimer = 0;
    } else {
      field = baseField(state);
    }
  } else {
    const crate = nearestBy(state.powerUps, tank.x, tank.y);
    const crateNear = crate && Math.hypot(crate.x - tank.x, crate.y - tank.y) < TILE * 4.5 ? crate : undefined;
    if (isDuel) {
      const foe = hostiles[0];
      if (crateNear) {
        field = fieldTo(state, `c:${tank.id}`, Math.floor(crateNear.x / TILE), Math.floor(crateNear.y / TILE), false);
      } else if (foe) {
        const [fc, fr] = cellOfTank(foe);
        field = fieldTo(state, `t:${foe.id}`, fc, fr, false);
      }
    } else {
      // Wingman: intercept whichever enemy is closest (by road) to the Eagle, otherwise hold the gate.
      const bf = baseField(state);
      let threat: Tank | undefined;
      let threatCost = 15;
      for (const h of hostiles) {
        const [hc, hr] = cellOfTank(h);
        const cost = bf[hr * COLS + hc];
        if (cost < threatCost) {
          threatCost = cost;
          threat = h;
        }
      }
      if (threat) {
        const [tc, trow] = cellOfTank(threat);
        field = fieldTo(state, `a:${threat.id}`, tc, trow, true);
      } else if (crateNear) {
        field = fieldTo(state, `c:${tank.id}`, Math.floor(crateNear.x / TILE), Math.floor(crateNear.y / TILE), true);
      } else {
        const post = GUARD_POSTS.find(([c, r]) => !isTileSolidForTank(state.grid[r][c].kind)) ?? GUARD_POSTS[0];
        field = fieldTo(state, 'guard', post[0], post[1], true);
      }
    }
  }

  // --- 2. Movement ---------------------------------------------------------------------------
  const step = field ? navStep(state, tank, field) : { dir: null, blocker: null, arrived: false };
  let moveDir: Direction | null = step.dir;
  let fire = false;

  // --- 3. Shooting ---------------------------------------------------------------------------
  const engagement = findEngagement(state, tank, visible);
  if (engagement) {
    if (!tank.aiWantFire) {
      // Fresh target: a human-ish beat before the first shot.
      const trailing = isDuel && tank.playerIndex === 1 && state.p2Wins - state.p1Wins >= 2 ? 0.25 : 0;
      tank.aiReact = isEnemy ? 0.2 + random() * 0.35 : isDuel ? 0.4 + trailing + random() * 0.45 : 0.5 + random() * 0.5;
    }
    tank.aiWantFire = true;
    const holdRange = isEnemy ? (tank.archetype === 'sniper' ? ARENA_W : TILE * 1.6) : TILE * 3.6;
    tank.dir = engagement.dir;
    tank.turretAngle = dirVector(engagement.dir).angle;
    moveDir = engagement.dist < holdRange ? null : engagement.dir;
    fire = tank.aiReact <= 0;
    if (isDuel && fire && tank.reloadTimer <= 0 && tank.aiWander <= 0 && random() < 0.5) {
      // Shoot and scoot: after a shot the rival often breaks out of the lane instead of trading blows.
      const side: Direction[] = engagement.dir === 'up' || engagement.dir === 'down' ? ['left', 'right'] : ['up', 'down'];
      const open = side.filter((d) => {
        const v = dirVector(d);
        return canTankStandAt(state, tank, tank.x + v.dx * 24, tank.y + v.dy * 24);
      });
      if (open.length > 0) {
        tank.aiTargetDir = open[Math.floor(random() * open.length) % open.length];
        tank.aiWander = -(0.3 + random() * 0.5); // negative = armed; starts once this shot has left the barrel
      }
    }
  } else {
    tank.aiWantFire = false;
    const ahead = lineOfFire(state, tank, tank.dir);
    if (isEnemy) {
      if (ahead.kind === 'base') fire = random() < dt * 4;
      else if (ahead.kind === 'brick' && step.blocker === 'brick' && step.dir === tank.dir && ahead.dist < TILE * 1.4) fire = true;
      else if (ahead.kind === 'barrel' && ahead.dist > TILE * 2.8) fire = random() < dt * 0.8;
      else fire = random() < dt * 0.35;
    } else {
      const wallAhead = ahead.kind === 'brick' && !BASE_WALL_KEYS.has(ahead.row * COLS + ahead.col);
      if (wallAhead && step.blocker === 'brick' && step.dir === tank.dir && ahead.dist < TILE * 1.4) fire = true;
      else if (ahead.kind === 'barrel' && ahead.dist > TILE * 2.8) {
        // Pop a barrel when someone hostile is standing next to it.
        const b = cellCenter(ahead.col, ahead.row);
        fire = hostiles.some((h) => Math.hypot(h.x - b.x, h.y - b.y) < TILE * 1.9);
      }
    }
  }

  // --- 4. Get unstuck ------------------------------------------------------------------------
  if (tank.aiWander < 0 && tank.reloadTimer > 0) tank.aiWander = -tank.aiWander;
  if (tank.aiWander > 0) {
    if (isDuel) {
      moveDir = tank.aiTargetDir;
      fire = false;
    } else moveDir = engagement ? moveDir : tank.aiTargetDir;
  } else if (moveDir && !(step.blocker && fire)) {
    tank.aiStuck += dt;
    if (tank.aiStuck >= 0.6) {
      const moved = Math.hypot(tank.x - tank.aiLastX, tank.y - tank.aiLastY);
      tank.aiStuck = 0;
      tank.aiLastX = tank.x;
      tank.aiLastY = tank.y;
      if (moved < 5) {
        const free = DIRS.filter((d) => {
          const v = dirVector(d);
          return canTankStandAt(state, tank, tank.x + v.dx * 14, tank.y + v.dy * 14);
        });
        if (free.length > 0) {
          tank.aiTargetDir = free[Math.floor(random() * free.length) % free.length];
          tank.aiWander = 0.35 + random() * 0.45;
          moveDir = tank.aiTargetDir;
        }
      }
    }
  } else {
    tank.aiStuck = 0;
    tank.aiLastX = tank.x;
    tank.aiLastY = tank.y;
  }

  // --- 5. Tricks -----------------------------------------------------------------------------
  let dash = false;
  let special = false;
  if (!isEnemy) {
    special = tank.mines > 0 && hostiles.some((h) => Math.hypot(h.x - tank.x, h.y - tank.y) < TILE * 2.2) && random() < dt * 1.2;
    if (isDuel && tank.dashCooldown <= 0) {
      // Sidestep a shell that is about to land.
      const incoming = state.bullets.some((b) => {
        if (b.team === tank.team) return false;
        const rx = tank.x - b.x;
        const ry = tank.y - b.y;
        const closing = rx * b.vx + ry * b.vy;
        if (closing <= 0) return false;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const along = closing / speed;
        const off = Math.abs(rx * b.vy - ry * b.vx) / speed;
        return along < 170 && off < tank.radius + 6;
      });
      if (incoming) {
        if (random() < 0.55) {
          const side: Direction[] = tank.dir === 'up' || tank.dir === 'down' ? ['left', 'right'] : ['up', 'down'];
          const open = side.filter((d) => {
            const v = dirVector(d);
            return canTankStandAt(state, tank, tank.x + v.dx * 30, tank.y + v.dy * 30);
          });
          if (open.length > 0) {
            tank.dir = open[Math.floor(random() * open.length) % open.length];
            tank.turretAngle = dirVector(tank.dir).angle;
            dash = true;
            moveDir = tank.dir;
          }
        }
        if (!dash) tank.dashCooldown = 0.9; // missed the read; do not re-roll every frame
      }
    }
  }

  const vec = moveDir ? dirVector(moveDir) : { dx: 0, dy: 0 };
  return {
    moveX: vec.dx,
    moveY: vec.dy,
    fire,
    fireJustPressed: fire,
    specialJustPressed: special,
    dashJustPressed: dash
  };
}

function updateBullets(state: ArenaState, dt: number, random: () => number): void {
  // Bullet vs Bullet cancellation
  for (let i = 0; i < state.bullets.length; i++) {
    const a = state.bullets[i];
    if (a.life <= 0) continue;
    for (let j = i + 1; j < state.bullets.length; j++) {
      const b = state.bullets[j];
      if (b.life <= 0 || a.team === b.team) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + 3) {
        if (!a.pierceTanks) a.life = 0;
        if (!b.pierceTanks) b.life = 0;
        addParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 6, 110, 0.25, 3);
        state.cues.push('bounce');
      }
    }
  }

  for (const b of state.bullets) {
    if (b.life <= 0) continue;
    b.life -= dt;
    b.portalCooldown = Math.max(0, b.portalCooldown - dt);

    // Homing steering
    if (b.homing) {
      const targets = state.tanks.filter((t) => t.alive && t.team !== b.team);
      if (targets.length > 0) {
        const nearest = targets.sort(
          (t1, t2) => Math.hypot(t1.x - b.x, t1.y - b.y) - Math.hypot(t2.x - b.x, t2.y - b.y)
        )[0];
        const desired = Math.atan2(nearest.y - b.y, nearest.x - b.x);
        const current = Math.atan2(b.vy, b.vx);
        let diff = desired - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const speed = Math.hypot(b.vx, b.vy);
        const nextAngle = current + Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.6);
        b.vx = Math.cos(nextAngle) * speed;
        b.vy = Math.sin(nextAngle) * speed;
      }
    }

    const prevX = b.x;
    const prevY = b.y;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;

    // Check Arena Boundary bounce
    if (nx - b.radius < 0 || nx + b.radius > ARENA_W) {
      if (b.bouncesLeft > 0) {
        b.bouncesLeft -= 1;
        b.vx = -b.vx;
        b.x = Math.max(b.radius, Math.min(ARENA_W - b.radius, nx));
        state.cues.push('bounce');
        addParticles(state, b.x, b.y, b.color, 5, 90, 0.22, 2.5);
        continue;
      } else {
        b.life = 0;
        addParticles(state, Math.max(0, Math.min(ARENA_W, nx)), ny, b.color, 5, 80, 0.22, 2.5);
        continue;
      }
    }
    if (ny - b.radius < 0 || ny + b.radius > ARENA_H) {
      if (b.bouncesLeft > 0) {
        b.bouncesLeft -= 1;
        b.vy = -b.vy;
        b.y = Math.max(b.radius, Math.min(ARENA_H - b.radius, ny));
        state.cues.push('bounce');
        addParticles(state, b.x, b.y, b.color, 5, 90, 0.22, 2.5);
        continue;
      } else {
        b.life = 0;
        addParticles(state, nx, Math.max(0, Math.min(ARENA_H, ny)), b.color, 5, 80, 0.22, 2.5);
        continue;
      }
    }

    b.x = nx;
    b.y = ny;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 7) b.trail.shift();

    // Check tile interaction
    const { col, row, cell } = tileAtPixel(state.grid, b.x, b.y);
    if (cell) {
      if (cell.kind === 'portal' && b.portalCooldown <= 0 && cell.partnerCol !== undefined && cell.partnerRow !== undefined) {
        const dest = cellCenter(cell.partnerCol, cell.partnerRow);
        b.x = dest.x;
        b.y = dest.y;
        b.portalCooldown = 0.28;
        b.trail = [{ x: b.x, y: b.y }];
        state.cues.push('portal');
        continue;
      }

      if (cell.kind === 'barrel') {
        state.grid[row][col] = { kind: 'empty', hp: 0, maxHp: 0 };
        const center = cellCenter(col, row);
        detonateExplosion(state, center.x, center.y, TILE * 1.85, 2, b.team, b.playerIndex, true, random);
        b.life = 0;
        continue;
      }

      if (cell.kind === 'base') {
        // Defenders' shells splash harmlessly off their own Eagle.
        if (state.mode === 'coop' && b.team === 1) addParticles(state, b.x, b.y, '#fbbf24', 5, 80, 0.22, 2.5);
        else damageBase(state, 1);
        b.life = 0;
        continue;
      }

      if (cell.kind === 'brick' || cell.kind === 'steel') {
        const center = cellCenter(col, row);
        if (cell.kind === 'brick') {
          cell.hp -= b.damage;
          addParticles(state, b.x, b.y, '#d97757', 6, 100, 0.3, 3);
          if (cell.hp <= 0) {
            state.grid[row][col] = { kind: 'empty', hp: 0, maxHp: 0 };
          }
          if (b.splashRadius > 0) {
            detonateExplosion(state, b.x, b.y, b.splashRadius, 1, b.team, b.playerIndex, b.pierceSteel, random);
          }
          if (b.bouncesLeft > 0 && cell.hp > 0) {
            b.bouncesLeft -= 1;
            const prevCol = Math.floor(prevX / TILE);
            if (prevCol !== col) b.vx = -b.vx;
            else b.vy = -b.vy;
            b.x = prevX;
            b.y = prevY;
            state.cues.push('bounce');
          } else if (!b.pierceTanks) {
            b.life = 0;
          }
          continue;
        }

        if (cell.kind === 'steel') {
          if (b.pierceSteel) {
            cell.hp -= b.damage;
            addParticles(state, center.x, center.y, '#cbd5e1', 7, 110, 0.3, 3);
            if (cell.hp <= 0) {
              state.grid[row][col] = { kind: 'empty', hp: 0, maxHp: 0 };
            }
            if (!b.pierceTanks) b.life = 0;
          } else if (b.bouncesLeft > 0) {
            b.bouncesLeft -= 1;
            const prevCol = Math.floor(prevX / TILE);
            if (prevCol !== col) b.vx = -b.vx;
            else b.vy = -b.vy;
            b.x = prevX;
            b.y = prevY;
            state.cues.push('bounce');
            addParticles(state, b.x, b.y, '#94a3b8', 5, 90, 0.22, 2.5);
          } else {
            b.life = 0;
            state.cues.push('bounce');
            addParticles(state, b.x, b.y, '#94a3b8', 5, 90, 0.22, 2.5);
          }
          continue;
        }
      }
    }

    // Check Mine hits
    for (const mine of state.mines) {
      if (mine.life <= 0 || mine.team === b.team) continue;
      if (Math.hypot(mine.x - b.x, mine.y - b.y) <= mine.radius + b.radius + 4) {
        mine.life = 0;
        b.life = 0;
        detonateExplosion(state, mine.x, mine.y, TILE * 1.5, 2, b.team, b.playerIndex, false, random);
        break;
      }
    }
    if (b.life <= 0) continue;

    // Check Tank hits
    for (const tank of state.tanks) {
      if (!tank.alive || tank.id === b.ownerId || tank.team === b.team) continue;
      if (Math.hypot(tank.x - b.x, tank.y - b.y) <= tank.radius + b.radius) {
        damageTank(state, tank, b.damage, b.team, b.playerIndex, random);
        if (b.splashRadius > 0) {
          // The splash is for everything *around* the target; the direct hit already paid in full.
          detonateExplosion(state, b.x, b.y, b.splashRadius, 1, b.team, b.playerIndex, b.pierceSteel, random, tank.id);
        }
        if (!b.pierceTanks) {
          b.life = 0;
          break;
        }
      }
    }
  }

  state.bullets = state.bullets.filter((b) => b.life > 0);
}

export function computeSightPath(state: ArenaState, tank: Tank): Array<{ x: number; y: number }> {
  const { dx, dy } = dirVector(tank.dir);
  let x = tank.x + dx * (tank.radius + 4);
  let y = tank.y + dy * (tank.radius + 4);
  const points: Array<{ x: number; y: number }> = [{ x, y }];
  const step = 6;

  for (let i = 0; i < 140; i++) {
    const nx = x + dx * step;
    const ny = y + dy * step;
    if (nx < 4 || nx > ARENA_W - 4 || ny < 4 || ny > ARENA_H - 4) {
      points.push({
        x: Math.max(4, Math.min(ARENA_W - 4, nx)),
        y: Math.max(4, Math.min(ARENA_H - 4, ny))
      });
      break;
    }
    const col = Math.floor(nx / TILE);
    const row = Math.floor(ny / TILE);
    const cell = state.grid[row]?.[col];
    if (cell && isTileSolidForBullet(cell.kind)) {
      points.push({ x: nx, y: ny });
      break;
    }
    x = nx;
    y = ny;
  }
  points.push({ x, y });
  return points;
}

export function stepArena(
  state: ArenaState,
  dt: number,
  controls: readonly [PlayerControlInput, PlayerControlInput],
  random: () => number
): void {
  state.cues = [];
  state.screenShake = Math.max(0, state.screenShake - dt * 26);
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  state.baseFlash = Math.max(0, state.baseFlash - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  for (const tank of state.tanks) tank.hitFlash = Math.max(0, tank.hitFlash - dt);

  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  for (const sw of state.shockwaves) {
    sw.life -= dt;
    const t = 1 - Math.max(0, sw.life) / sw.maxLife;
    sw.radius = 6 + (sw.maxRadius - 6) * t;
  }
  state.shockwaves = state.shockwaves.filter((sw) => sw.life > 0);

  for (const ft of state.floatingTexts) {
    ft.y -= 28 * dt;
    ft.life -= dt;
  }
  state.floatingTexts = state.floatingTexts.filter((ft) => ft.life > 0);

  if (state.outcome !== 'none') {
    state.outcomeTimer = Math.max(0, state.outcomeTimer - dt);
    return;
  }

  state.roundTimer += dt;

  // Duel Sudden Death Overdrive at 38s
  if (state.mode === 'duel' && !state.suddenDeath && state.roundTimer >= 38) {
    state.suddenDeath = true;
    state.bannerKey = 'banner.suddenDeath';
    state.bannerTimer = 2.5;
  }

  // Co-op Base Steel Fortification countdown
  if (state.baseFortifyTimer > 0) {
    state.baseFortifyTimer -= dt;
    if (state.baseFortifyTimer <= 0) {
      setBaseFortress(state.grid, 'brick');
    }
  }

  // Co-op Enemy Spawning: a flashing marker warns of each arrival before the tank drops in.
  if (state.mode === 'coop') {
    for (const warn of state.spawnWarnings) warn.timer -= dt;
    for (let i = state.spawnWarnings.length - 1; i >= 0; i--) {
      const warn = state.spawnWarnings[i];
      if (warn.timer > 0) continue;
      const pos = cellCenter(warn.col, 0);
      if (state.tanks.some((t) => t.alive && t.team === 3 && Math.hypot(t.x - pos.x, t.y - pos.y) < TILE * 0.85)) {
        warn.timer = 0.15; // someone is parked on the pad; try again in a moment
        continue;
      }
      state.spawnWarnings.splice(i, 1);
      const enemy = createEnemyTank(`e${state.nextEntityId++}`, warn.archetype, warn.col, 0, state.loop);
      state.tanks.push(enemy);
      addShockwave(state, enemy.x, enemy.y, 38, '#ff6b81');
    }
    if (state.enemiesRemainingToSpawn.length > 0) {
      const activeEnemies = state.tanks.filter((t) => t.alive && t.team === 3).length + state.spawnWarnings.length;
      const defenders = state.tanks.filter((t) => t.team === 1).length;
      const maxConcurrent = Math.min(7, (state.stageIndex < 1 ? 4 : state.stageIndex < 3 ? 5 : 6) + (defenders > 1 ? 1 : 0) + Math.min(1, state.loop));
      if (activeEnemies < maxConcurrent) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const spawnCols = [0, 19, 9];
          let col = -1;
          for (let k = 0; k < spawnCols.length; k++) {
            const candidate = spawnCols[(state.spawnCount + k) % spawnCols.length];
            if (!state.spawnWarnings.some((w) => w.col === candidate)) {
              col = candidate;
              break;
            }
          }
          if (col < 0) {
            state.spawnTimer = 0.3;
          } else {
            state.spawnCount += 1;
            const nextType = state.enemiesRemainingToSpawn.shift()!;
            state.spawnWarnings.push({ col, timer: 0.9, archetype: nextType });
            state.spawnTimer = Math.max(1.0, 1.9 - state.stageIndex * 0.15 - (defenders > 1 ? 0.2 : 0));
            if (nextType === 'boss-behemoth' || nextType === 'boss-omega') {
              state.bannerKey = 'banner.bossIncoming';
              state.bannerTimer = 2.8;
              state.cues.push('warn');
            }
          }
        }
      }
    }
  }

  // Periodic Airdrop PowerUp
  state.powerUpSpawnTimer -= dt * (state.suddenDeath ? 2.2 : 1);
  if (state.powerUpSpawnTimer <= 0 && state.powerUps.length < 3) {
    state.powerUpSpawnTimer = state.mode === 'duel' ? 8.5 : 12.0;
    for (let attempt = 0; attempt < 15; attempt++) {
      const c = 2 + Math.floor(random() * (COLS - 4));
      const r = 2 + Math.floor(random() * (ROWS - 4));
      if (state.grid[r][c].kind === 'empty' || state.grid[r][c].kind === 'bush' || state.grid[r][c].kind === 'ice') {
        const pos = cellCenter(c, r);
        spawnPowerUpAt(state, pos.x, pos.y, random);
        break;
      }
    }
  }

  // Update PowerUps
  for (const item of state.powerUps) {
    item.life -= dt;
    item.pulse += dt * 5;
  }
  state.powerUps = state.powerUps.filter((item) => item.life > 0);

  // Update Tanks
  for (const tank of state.tanks) {
    if (!tank.alive) {
      if (tank.respawnTimer > 0) {
        tank.respawnTimer -= dt;
        if (tank.respawnTimer <= 0 && tank.playerIndex !== undefined) {
          const fresh = createPlayerTank(tank.playerIndex, tank.chassis, state.mode, tank.isAi, tank.score);
          tank.x = fresh.x;
          tank.y = fresh.y;
          tank.dir = fresh.dir;
          tank.turretAngle = fresh.turretAngle;
          tank.weapon = null;
          tank.weaponTimer = 0;
          tank.dashTimer = 0;
          tank.hp = fresh.maxHp;
          tank.alive = true;
          tank.spawnProtected = 2.5;
          tank.shieldTimer = 2.5;
          tank.mines = Math.max(tank.mines, 1);
          addShockwave(state, tank.x, tank.y, 44, '#36d6ff');
        }
      }
      continue;
    }

    tank.reloadTimer = Math.max(0, tank.reloadTimer - dt);
    tank.recoil = Math.max(0, tank.recoil - dt * 28);
    tank.shieldTimer = Math.max(0, tank.shieldTimer - dt);
    tank.freezeTimer = Math.max(0, tank.freezeTimer - dt);
    tank.portalCooldown = Math.max(0, tank.portalCooldown - dt);
    tank.spawnProtected = Math.max(0, tank.spawnProtected - dt);
    tank.dashCooldown = Math.max(0, tank.dashCooldown - dt);
    tank.dashTimer = Math.max(0, tank.dashTimer - dt);
    if (tank.weaponTimer > 0) {
      tank.weaponTimer -= dt;
      if (tank.weaponTimer <= 0 && !tank.isBoss) {
        tank.weapon = null;
      }
    }

    if (tank.freezeTimer > 0) continue;

    const input = tank.isAi
      ? computeAiControls(state, tank, dt, random)
      : controls[tank.playerIndex ?? 0];

    moveTankWithSlide(state, tank, input.moveX, input.moveY, dt);

    if (input.dashJustPressed) {
      triggerTankDash(state, tank);
    }
    if (input.specialJustPressed) {
      triggerTankSpecial(state, tank);
    }
    if (tank.isBoss) updateBossSpecial(state, tank, dt);
    if (input.fire || input.fireJustPressed) {
      fireTankWeapon(state, tank);
    }

    // Power-up pickup (Players and Duel AI can pick up power-ups)
    if (tank.team !== 3) {
      for (let i = state.powerUps.length - 1; i >= 0; i--) {
        const item = state.powerUps[i];
        if (Math.hypot(tank.x - item.x, tank.y - item.y) <= tank.radius + 16) {
          collectPowerUp(state, tank, item);
          state.powerUps.splice(i, 1);
        }
      }
    }
  }

  // Update Mines
  for (const mine of state.mines) {
    mine.armTimer = Math.max(0, mine.armTimer - dt);
    mine.life -= dt;
    if (mine.armTimer <= 0 && mine.life > 0) {
      for (const tank of state.tanks) {
        if (!tank.alive || tank.team === mine.team) continue;
        if (Math.hypot(tank.x - mine.x, tank.y - mine.y) <= tank.radius + mine.radius + 10) {
          mine.life = 0;
          detonateExplosion(state, mine.x, mine.y, TILE * 1.65, 2, mine.team, mine.playerIndex, false, random);
          break;
        }
      }
    }
  }
  state.mines = state.mines.filter((m) => m.life > 0);

  // Update Bullets
  updateBullets(state, dt, random);

  // Check Win / Loss conditions
  if (state.mode === 'coop') {
    const playersAliveOrRespawning = state.tanks.some(
      (t) => t.team === 1 && (t.alive || t.respawnTimer > 0 || t.lives > 0)
    );
    if (!playersAliveOrRespawning) {
      state.cues.push('lose');
      state.outcome = 'coop-defeat';
      state.defeatReason = 'tanks';
      state.outcomeTimer = 2.4;
      state.bannerKey = 'banner.gameOver';
      state.bannerTimer = 99;
      return;
    }
    if (state.outcome === 'none' && enemiesLeft(state) === 0) {
      state.cues.push('win');
      // Clear bonus rewards an intact Eagle.
      state.clearBonus = 500 + baseHp(state) * 100;
      state.score += state.clearBonus;
      if (state.stageIndex >= 5) {
        state.outcome = 'coop-victory';
        state.bannerKey = 'banner.victory';
      } else {
        state.outcome = 'stage-clear';
        state.bannerKey = 'banner.stageClear';
      }
      state.bannerParam = state.stageIndex + 1;
      state.bannerTimer = 99;
      state.outcomeTimer = 2.0;
    }
  } else {
    const p1 = state.tanks.find((t) => t.playerIndex === 0);
    const p2 = state.tanks.find((t) => t.playerIndex === 1);
    if (p1 && p2 && (!p1.alive || !p2.alive)) {
      if (!p1.alive && !p2.alive) {
        state.roundWinner = -1;
        state.bannerKey = 'banner.drawRound';
      } else if (p1.alive) {
        state.roundWinner = 0;
        state.p1Wins += 1;
        state.score += 400;
        state.bannerKey = state.p1Wins >= DUEL_WIN_TARGET ? 'banner.p1Match' : 'banner.p1Round';
      } else {
        state.roundWinner = 1;
        state.p2Wins += 1;
        state.bannerKey = state.p2Wins >= DUEL_WIN_TARGET ? 'banner.p2Match' : 'banner.p2Round';
      }
      state.cues.push('win');
      state.outcome =
        state.p1Wins >= DUEL_WIN_TARGET || state.p2Wins >= DUEL_WIN_TARGET ? 'duel-victory' : 'round-over';
      state.outcomeTimer = 1.8;
      state.bannerTimer = 99;
    }
  }
}
