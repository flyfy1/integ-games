import {
  ARENA_H,
  ARENA_W,
  BASE_CELLS,
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
  | 'lose';

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

function buildWaveList(stageIndex: number): EnemyArchetype[] {
  const s = stageIndex % 6;
  switch (s) {
    case 0:
      return ['scout', 'scout', 'striker', 'cargo', 'scout', 'striker', 'sniper', 'cargo', 'striker', 'juggernaut'];
    case 1:
      return ['scout', 'striker', 'sniper', 'cargo', 'striker', 'sniper', 'juggernaut', 'cargo', 'sniper', 'juggernaut', 'striker', 'juggernaut'];
    case 2:
      return ['striker', 'sniper', 'cargo', 'juggernaut', 'sniper', 'cargo', 'juggernaut', 'boss-behemoth'];
    case 3:
      return ['sniper', 'striker', 'cargo', 'sniper', 'juggernaut', 'striker', 'cargo', 'sniper', 'juggernaut', 'juggernaut', 'sniper', 'juggernaut'];
    case 4:
      return ['striker', 'juggernaut', 'cargo', 'sniper', 'juggernaut', 'sniper', 'cargo', 'juggernaut', 'sniper', 'juggernaut', 'cargo', 'juggernaut'];
    default:
      return ['sniper', 'juggernaut', 'cargo', 'sniper', 'juggernaut', 'cargo', 'boss-behemoth', 'boss-omega'];
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
    hp: spec.maxHp,
    maxHp: spec.maxHp,
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
    treadPhase: 0
  };
}

export function createEnemyTank(
  id: string,
  archetype: EnemyArchetype,
  col: number,
  row: number
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
  const hpMap: Record<EnemyArchetype, number> = {
    scout: 1,
    striker: 1,
    sniper: 1,
    juggernaut: 2,
    cargo: 2,
    'boss-behemoth': 8,
    'boss-omega': 10
  };
  const hp = hpMap[archetype];
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
    shieldTimer: 0.8,
    freezeTimer: 0,
    portalCooldown: 0,
    spawnProtected: 0.8,
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
    aiTimer: 0.25,
    aiWantFire: false,
    aiTargetDir: 'down',
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
    spawnTimer: 0.6,
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
    bannerTimer: 2.2,
    score: opts.carryScore ?? 0,
    cues: []
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
  random: () => number
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
        damageBase(state, 1);
      }
    }
  }

  for (const tank of state.tanks) {
    if (!tank.alive) continue;
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

function damageBase(state: ArenaState, dmg: number): void {
  if (!state.baseAlive) return;
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
    addFloatingText(state, victim.x, victim.y - 18, 'SHIELD!', '#48dbfb');
    return;
  }

  victim.hp -= damage;
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

  if (victim.isCargo || victim.isBoss || (victim.team === 3 && random() < 0.45)) {
    spawnPowerUpAt(state, victim.x, victim.y, random);
  }

  if (attackerPlayerIndex !== undefined) {
    const scorer = state.tanks.find((t) => t.playerIndex === attackerPlayerIndex);
    const pts = victim.isBoss ? 1000 : victim.team === 3 ? 200 : 300;
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
  if (tank.team === 3) {
    reload = tank.isBoss ? 1.35 : 1.75;
  } else if (tank.isAi && state.mode === 'duel') {
    reload *= 1.35;
  }
  tank.reloadTimer = reload;
  tank.recoil = 7;

  const bounces = 0; // Realistic shells: explode on wall impact instead of bouncing
  const pierceSteel = (tank.team !== 3 && spec.pierceSteel) || weapon === 'laser';
  const pierceTanks = weapon === 'laser';
  const homing = weapon === 'homing';
  const baseSpeed = tank.team === 3 ? spec.bulletSpeed * 0.68 : spec.bulletSpeed;
  const speed = baseSpeed * (weapon === 'laser' ? 1.45 : weapon === 'ricochet' ? 1.3 : 1);
  const damage = tank.team === 3 ? 1 : weapon === 'laser' || spec.id === 'titan' ? 2 : 1;
  const color =
    weapon === 'laser'
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
      radius: weapon === 'laser' ? 5 : tank.chassis === 'titan' ? 6 : 4.5,
      damage,
      bouncesLeft: bounces,
      pierceSteel,
      pierceTanks,
      homing,
      splashRadius: spec.splashRadius,
      portalCooldown: 0,
      color,
      life: 3.4,
      trail: [{ x: bx, y: by }]
    });
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
    addFloatingText(state, tank.x, tank.y - 16, 'MINE SET', '#feca57');
    acted = true;
  }
  if (tank.dashCooldown <= 0) {
    tank.dashTimer = 0.16;
    tank.dashCooldown = 2.0;
    const { dx, dy } = dirVector(tank.dir);
    tank.vx = dx * 340;
    tank.vy = dy * 340;
    addParticles(state, tank.x, tank.y, CHASSIS_SPECS[tank.chassis].colorPrimary, 6, 90, 0.25, 3);
    if (!acted) state.cues.push('portal');
  }
}

function moveTankWithSlide(state: ArenaState, tank: Tank, moveX: number, moveY: number, dt: number): void {
  const spec = CHASSIS_SPECS[tank.chassis];
  const under = tileAtPixel(state.grid, tank.x, tank.y).cell;
  const onIce = under?.kind === 'ice' && tank.chassis !== 'phantom';
  const inBush = under?.kind === 'bush';

  let maxSpeed = spec.speed;
  if (inBush && tank.chassis === 'phantom') maxSpeed *= 1.22;
  if (tank.weapon === 'ricochet') maxSpeed *= 1.25; // Rapid Overdrive speed boost
  if (tank.dashTimer > 0) maxSpeed *= 1.85;
  if (tank.team === 3) maxSpeed *= tank.isBoss ? 0.52 : 0.56;
  else if (tank.isAi && state.mode === 'duel') maxSpeed *= 0.82;

  let dir: Direction | null = null;
  if (Math.abs(moveX) > 0.2 || Math.abs(moveY) > 0.2) {
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

  if (onIce) {
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
        other.freezeTimer = state.mode === 'duel' ? 3.5 : 6.0;
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
  addFloatingText(state, tank.x, tank.y - 20, item.kind.toUpperCase(), '#70f0c2');
}

function computeAiControls(state: ArenaState, tank: Tank, dt: number, random: () => number): PlayerControlInput {
  tank.aiTimer -= dt;
  const hostiles = state.tanks.filter((other) => other.alive && other.team !== tank.team);
  let targetX = ARENA_W / 2;
  let targetY = ARENA_H / 2;

  // Pick priority target
  if (state.mode === 'coop' && tank.team === 3) {
    // Enemy AI targets either nearest visible player or the Eagle base
    const visiblePlayers = hostiles.filter((p) => {
      const inBush = tileAtPixel(state.grid, p.x, p.y).cell?.kind === 'bush';
      return !inBush || Math.hypot(p.x - tank.x, p.y - tank.y) < TILE * 2.6;
    });
    const baseCenter = cellCenter(9.5, 12);
    if (visiblePlayers.length > 0 && (random() < 0.7 || tank.y < ARENA_H * 0.55)) {
      const nearest = visiblePlayers.sort(
        (a, b) => Math.hypot(a.x - tank.x, a.y - tank.y) - Math.hypot(b.x - tank.x, b.y - tank.y)
      )[0];
      targetX = nearest.x;
      targetY = nearest.y;
    } else {
      targetX = baseCenter.x;
      targetY = baseCenter.y;
    }
  } else {
    // Allied AI Wingman or Duel AI Rival
    const nearestPower = state.powerUps.sort(
      (a, b) => Math.hypot(a.x - tank.x, a.y - tank.y) - Math.hypot(b.x - tank.x, b.y - tank.y)
    )[0];
    if (nearestPower && Math.hypot(nearestPower.x - tank.x, nearestPower.y - tank.y) < TILE * 4.2) {
      targetX = nearestPower.x;
      targetY = nearestPower.y;
    } else if (hostiles.length > 0) {
      const nearest = hostiles.sort(
        (a, b) => Math.hypot(a.x - tank.x, a.y - tank.y) - Math.hypot(b.x - tank.x, b.y - tank.y)
      )[0];
      targetX = nearest.x;
      targetY = nearest.y;
    }
  }

  const dx = targetX - tank.x;
  const dy = targetY - tank.y;
  const alignedX = Math.abs(dx) < TILE * 0.65;
  const alignedY = Math.abs(dy) < TILE * 0.65;

  if (tank.aiTimer <= 0) {
    tank.aiTimer = tank.team === 3 ? 0.55 + random() * 0.55 : 0.28 + random() * 0.32;
    if (alignedX) {
      tank.aiTargetDir = dy > 0 ? 'down' : 'up';
    } else if (alignedY) {
      tank.aiTargetDir = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dx) > Math.abs(dy)) {
      tank.aiTargetDir = dx > 0 ? 'right' : 'left';
    } else {
      tank.aiTargetDir = dy > 0 ? 'down' : 'up';
    }
    const stepCheck = dirVector(tank.aiTargetDir);
    if (!canTankStandAt(state, tank, tank.x + stepCheck.dx * 20, tank.y + stepCheck.dy * 20)) {
      const dirs: Direction[] = ['up', 'down', 'left', 'right'];
      tank.aiTargetDir = dirs[Math.floor(random() * dirs.length)];
    }
  }

  const shouldFire =
    tank.team === 3
      ? (alignedX || alignedY ? random() < 0.28 : random() < 0.05)
      : alignedX || alignedY || random() < 0.35;
  const shouldSpecial = tank.mines > 0 && hostiles.some((h) => Math.hypot(h.x - tank.x, h.y - tank.y) < TILE * 2.5) && random() < 0.04;
  const vec = dirVector(tank.aiTargetDir);

  return {
    moveX: vec.dx,
    moveY: vec.dy,
    fire: shouldFire,
    fireJustPressed: shouldFire,
    specialJustPressed: shouldSpecial
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
        damageBase(state, b.damage);
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
          detonateExplosion(state, b.x, b.y, b.splashRadius, 1, b.team, b.playerIndex, b.pierceSteel, random);
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

  // Co-op Enemy Spawning
  if (state.mode === 'coop' && state.enemiesRemainingToSpawn.length > 0) {
    const activeEnemies = state.tanks.filter((t) => t.alive && t.team === 3).length;
    const maxConcurrent = state.stageIndex < 2 ? 2 : 3;
    if (activeEnemies < maxConcurrent) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const spawnCols = [0, 9, 19];
        const col = spawnCols[state.nextEntityId % spawnCols.length];
        const nextType = state.enemiesRemainingToSpawn.shift()!;
        const enemy = createEnemyTank(`e${state.nextEntityId++}`, nextType, col, 0);
        state.tanks.push(enemy);
        state.spawnTimer = 2.6;
        addShockwave(state, enemy.x, enemy.y, 38, '#ff6b81');
        if (enemy.isBoss) {
          state.bannerKey = 'banner.bossIncoming';
          state.bannerTimer = 2.8;
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

    if (input.specialJustPressed) {
      triggerTankSpecial(state, tank);
    }
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
      state.outcomeTimer = 2.4;
      state.bannerKey = 'banner.gameOver';
      state.bannerTimer = 99;
      return;
    }
    const enemiesLeft =
      state.enemiesRemainingToSpawn.length + state.tanks.filter((t) => t.alive && t.team === 3).length;
    if (enemiesLeft === 0) {
      state.cues.push('win');
      state.score += 500;
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
