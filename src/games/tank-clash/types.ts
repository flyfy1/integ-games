export type GameMode = 'coop' | 'duel';
export type TeamSetup = '2p' | '1p-ai' | '1p-solo';
export type ChassisId = 'vanguard' | 'phantom' | 'titan' | 'prism';
export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileKind =
  | 'empty'
  | 'brick'
  | 'steel'
  | 'bush'
  | 'ice'
  | 'water'
  | 'portal'
  | 'barrel'
  | 'base';

export type PowerUpKind =
  | 'spread'
  | 'ricochet'
  | 'laser'
  | 'homing'
  | 'shield'
  | 'mine'
  | 'freeze'
  | 'repair';

export type EnemyArchetype = 'scout' | 'striker' | 'sniper' | 'juggernaut' | 'cargo' | 'boss-behemoth' | 'boss-omega';

export interface ChassisSpec {
  id: ChassisId;
  maxHp: number;
  speed: number;
  reload: number;
  bulletSpeed: number;
  baseBounces: number;
  pierceSteel: boolean;
  splashRadius: number;
  burstCount: number;
  /** Damage of one shell (before weapon power-ups). */
  damage: number;
  laserSight: boolean;
  colorPrimary: string;
  colorAccent: string;
}

export interface TileCell {
  kind: TileKind;
  hp: number;
  maxHp: number;
  portalId?: number;
  partnerCol?: number;
  partnerRow?: number;
}

export interface Tank {
  id: string;
  team: 1 | 2 | 3; // 1 = P1 (or Co-op allies), 2 = P2 (ally in Co-op, rival in Duel), 3 = Enemy Army in Co-op
  playerIndex?: 0 | 1; // 0 for P1, 1 for P2
  isAi: boolean;
  archetype?: EnemyArchetype;
  isBoss?: boolean;
  isCargo?: boolean;
  chassis: ChassisId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: Direction;
  turretAngle: number;
  radius: number;
  hp: number;
  maxHp: number;
  reloadTimer: number;
  recoil: number;
  shieldTimer: number;
  freezeTimer: number;
  portalCooldown: number;
  spawnProtected: number;
  weapon: PowerUpKind | null;
  weaponTimer: number;
  mines: number;
  dashCooldown: number;
  dashTimer: number;
  score: number;
  kills: number;
  alive: boolean;
  respawnTimer: number;
  lives: number;
  aiTimer: number;
  aiWantFire: boolean;
  aiTargetDir: Direction;
  /** What an enemy is currently trying to do. */
  aiGoal: 'base' | 'hunt' | 'wander';
  /** Seconds until the AI may pull the trigger after acquiring a target. */
  aiReact: number;
  /** Seconds left of a forced "get unstuck" detour in aiTargetDir. */
  aiWander: number;
  aiStuck: number;
  aiLastX: number;
  aiLastY: number;
  aiCol: number;
  aiRow: number;
  /** Boss special-attack countdown. */
  bossTimer: number;
  bossCharging: boolean;
  /** Seconds of white hit-flash left (render only). */
  hitFlash: number;
  treadPhase: number;
}

export interface Bullet {
  id: number;
  ownerId: string;
  team: 1 | 2 | 3;
  playerIndex?: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  bouncesLeft: number;
  pierceSteel: boolean;
  pierceTanks: boolean;
  homing: boolean;
  splashRadius: number;
  portalCooldown: number;
  color: string;
  life: number;
  trail: Array<{ x: number; y: number }>;
}

export interface LandMine {
  id: number;
  ownerId: string;
  team: 1 | 2 | 3;
  playerIndex?: 0 | 1;
  x: number;
  y: number;
  armTimer: number;
  life: number;
  radius: number;
}

export interface PowerUpItem {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  life: number;
  pulse: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  /** Literal text, or an i18n key when `key` is true. */
  text: string;
  key?: boolean;
  n?: number;
  color: string;
  life: number;
}

export interface SpawnWarning {
  col: number;
  timer: number;
  archetype: EnemyArchetype;
}

export interface PlayerControlInput {
  moveX: number;
  moveY: number;
  fire: boolean;
  fireJustPressed: boolean;
  specialJustPressed: boolean;
  dashJustPressed?: boolean;
}
