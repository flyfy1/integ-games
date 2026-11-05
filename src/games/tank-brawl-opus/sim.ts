/** The whole game minus pixels and speakers: fixed 60 Hz steps, injected randomness, events for the presentation layer. */
import { COLS, ROWS, TILE, WORLD_H, WORLD_W, type Arena, type Tile } from './arenas';

export const STEP = 1 / 60;
export const TANK_RADIUS = 20;
export const MAX_AMMO = 3;
const RELOAD = 0.75, FIRE_COOLDOWN = 0.26, DASH_TIME = 0.24, DASH_COOLDOWN = 2, DASH_SPEED = 560, BASE_SPEED = 190;
const ARM_TIME = 0.22, INVULN = 1.1, SUDDEN_DEATH_AT = 50, COLLAPSE_EVERY = 5, REVIVE_TIME = 1.4;

export type Intent = { x: number; y: number; ax: number; ay: number; fire: boolean; dash: boolean; honk: boolean };
export const idle = (): Intent => ({ x: 0, y: 0, ax: 0, ay: 0, fire: false, dash: false, honk: false });

export type PowerKind = 'triple' | 'mega' | 'bee' | 'laser' | 'duck' | 'shield' | 'giant' | 'swap';
export const POWERS: readonly PowerKind[] = ['triple', 'mega', 'bee', 'laser', 'duck', 'shield', 'giant', 'swap'];
const CHARGES: Partial<Record<PowerKind, number>> = { triple: 3, mega: 2, bee: 2, laser: 1, duck: 3 };

export type EnemyKind = 'grunt' | 'zippy' | 'bouncer' | 'heavy' | 'king';
export type Tank = {
  id: number; team: number; seat: number; enemy?: EnemyKind;
  x: number; y: number; vx: number; vy: number;
  heading: number; turret: number; scale: number; speed: number;
  hp: number; maxHp: number; ammo: number; reload: number; cooldown: number;
  dash: number; dashCooldown: number; dashX: number; dashY: number; rammed: boolean;
  invuln: number; shield: number; giant: number; flash: number; recoil: number; honk: number;
  power: PowerKind | null; charges: number; laserCharge: number;
  falling: number; downed: boolean; revive: number; alive: boolean; portalCooldown: number;
  spawnX: number; spawnY: number; mileage: number;
};

export type ShellKind = 'shell' | 'mega' | 'bee';
export type Shell = { id: number; kind: ShellKind; owner: number; team: number; x: number; y: number; vx: number; vy: number; radius: number; damage: number; bounces: number; age: number; life: number; portalCooldown: number };
export type Duck = { id: number; owner: number; team: number; x: number; y: number; age: number };
export type Pickup = { id: number; kind: PowerKind; x: number; y: number; drop: number; age: number };
export type Beam = { points: Array<[number, number]>; life: number; team: number };

export type GameEvent =
  | { type: 'fire'; x: number; y: number; angle: number; kind: ShellKind | 'duck' | 'laser' }
  | { type: 'bounce' | 'crate' | 'clash' | 'portal' | 'dash' | 'bumper' | 'reflect' | 'crash' | 'revive'; x: number; y: number }
  | { type: 'hit'; x: number; y: number; tank: number; left: number }
  | { type: 'explode'; x: number; y: number; radius: number }
  | { type: 'pickup'; x: number; y: number; kind: PowerKind; tank: number }
  | { type: 'fall'; x: number; y: number; tank: number }
  | { type: 'ko'; x: number; y: number; tank: number }
  | { type: 'honk'; x: number; y: number; tank: number }
  | { type: 'collapse'; ring: number }
  | { type: 'empty'; tank: number };

export type Twist = { id: string; name: readonly [string, string]; hint: readonly [string, string]; bounces: number; speed: number; scale: number; crateEvery: number; knock: number; ammoReload: number };
export const TWISTS: readonly Twist[] = [
  { id: 'classic', name: ['Plain Brawl', '普通乱斗'], hint: ['No tricks. Just tanks.', '没有花招，只有坦克'], bounces: 2, speed: 1, scale: 1, crateEvery: 6, knock: 1, ammoReload: 1 },
  { id: 'rubber', name: ['Rubber Shells', '橡皮炮弹'], hint: ['Shells bounce six times. Watch your back!', '炮弹能弹六次，小心背后！'], bounces: 6, speed: 1, scale: 1, crateEvery: 6, knock: 1, ammoReload: 1 },
  { id: 'turbo', name: ['Turbo Treads', '涡轮履带'], hint: ['Everybody is far too fast.', '所有坦克都快过头了'], bounces: 2, speed: 1.5, scale: 1, crateEvery: 6, knock: 1, ammoReload: 0.7 },
  { id: 'crates', name: ['Crate Rain', '空投暴雨'], hint: ['Power-ups fall every two seconds.', '每两秒掉一个道具'], bounces: 2, speed: 1, scale: 1, crateEvery: 2, knock: 1, ammoReload: 1 },
  { id: 'fat', name: ['Chonky Tanks', '胖胖坦克'], hint: ['Big tanks, big targets, tiny gaps.', '车身变大，缝隙变小'], bounces: 2, speed: 0.9, scale: 1.35, crateEvery: 6, knock: 1.2, ammoReload: 1 },
  { id: 'pow', name: ['Super Knockback', '超级击退'], hint: ['One shell sends you flying.', '一炮把你轰上天'], bounces: 2, speed: 1, scale: 1, crateEvery: 6, knock: 2.4, ammoReload: 1 }
];

export type World = {
  arena: Arena; twist: Twist; tiles: Tile[][]; crateHp: number[][];
  tanks: Tank[]; shells: Shell[]; ducks: Duck[]; pickups: Pickup[]; beams: Beam[]; events: GameEvent[];
  time: number; crateTimer: number; collapseRing: number; collapseTimer: number; warnRing: number;
  friendlyFire: boolean; suddenDeath: boolean; finished: boolean; winner: number; nextId: number; random: () => number;
};

const key = (col: number, row: number) => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? null : `${col},${row}`);
const tileAt = (world: World, col: number, row: number): Tile => (key(col, row) === null ? '#' : world.tiles[row][col]);
const worldTile = (world: World, x: number, y: number) => tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE));
export const isSolid = (tile: Tile) => tile === '#' || tile === 'c' || tile === 'B';
export const isPit = (tile: Tile) => tile === 'o';
const center = (index: number) => (index + 0.5) * TILE;

export function makeTank(world: World, team: number, seat: number, x: number, y: number, hp: number, enemy?: EnemyKind): Tank {
  const facing = x < WORLD_W / 2 ? 0 : Math.PI;
  const tank: Tank = {
    id: world.nextId++, team, seat, enemy, x, y, vx: 0, vy: 0, heading: facing, turret: facing, scale: world.twist.scale, speed: BASE_SPEED * world.twist.speed,
    hp, maxHp: hp, ammo: MAX_AMMO, reload: 0, cooldown: 0, dash: 0, dashCooldown: 0, dashX: 0, dashY: 0, rammed: false,
    invuln: 1.2, shield: 0, giant: 0, flash: 0, recoil: 0, honk: 0, power: null, charges: 0, laserCharge: 0,
    falling: 0, downed: false, revive: 0, alive: true, portalCooldown: 0, spawnX: x, spawnY: y, mileage: 0
  };
  world.tanks.push(tank);
  return tank;
}

export function createWorld(arena: Arena, twist: Twist, random: () => number, friendlyFire = true): World {
  const tiles: Tile[][] = [], crateHp: number[][] = [];
  arena.rows.forEach((row) => {
    tiles.push([...row].map((char) => ('12'.includes(char) ? floorUnder(row) : char) as Tile));
    crateHp.push([...row].map((char) => (char === 'c' ? 2 : 0)));
  });
  return {
    arena, twist, tiles, crateHp, tanks: [], shells: [], ducks: [], pickups: [], beams: [], events: [],
    time: 0, crateTimer: 3, collapseRing: 0, collapseTimer: SUDDEN_DEATH_AT, warnRing: -1,
    friendlyFire, suddenDeath: false, finished: false, winner: -1, nextId: 1, random
  };
}
const floorUnder = (row: string): Tile => (row.includes('~') ? '~' : '.');

export function spawnPoint(arena: Arena, seat: number): [number, number] {
  const mark = String(seat + 1);
  for (let row = 0; row < ROWS; row++) {
    const col = arena.rows[row].indexOf(mark);
    if (col >= 0) return [center(col), center(row)];
  }
  return [center(seat ? COLS - 2 : 1), center(1)];
}

const free = (tile: Tile) => !isSolid(tile) && !isPit(tile) && tile !== 'P' && tile !== 'p';

export function step(world: World, intents: Map<number, Intent>) {
  world.time += STEP;
  for (const tank of world.tanks) if (tank.alive) stepTank(world, tank, intents.get(tank.id) ?? idle());
  resolveTankContacts(world);
  stepShells(world);
  stepDucks(world);
  stepPickups(world);
  stepBeams(world);
  stepRevives(world);
  stepCollapse(world);
  world.tanks = world.tanks.filter((tank) => tank.alive || tank.team === 0 || tank.seat >= 0);
  checkFinish(world);
}

function stepTank(world: World, tank: Tank, intent: Intent) {
  for (const field of ['reload', 'cooldown', 'dashCooldown', 'invuln', 'flash', 'portalCooldown', 'shield', 'giant', 'honk'] as const) tank[field] = Math.max(0, tank[field] - STEP);
  tank.recoil = Math.max(0, tank.recoil - STEP * 6);
  tank.scale += ((tank.giant > 0 ? 1.7 : baseScale(world, tank)) - tank.scale) * 0.14;
  if (tank.downed) { tank.vx = tank.vy = 0; return; }
  if (tank.falling > 0) {
    tank.falling -= STEP;
    if (tank.falling <= 0) respawnAfterFall(world, tank);
    return;
  }
  if (tank.ammo < MAX_AMMO && tank.reload <= 0) {
    tank.ammo++;
    tank.reload = RELOAD * world.twist.ammoReload;
  }
  const tile = worldTile(world, tank.x, tank.y);
  const ice = tile === '~';
  const stick = Math.min(1, Math.hypot(intent.x, intent.y));
  const charging = tank.laserCharge > 0;
  if (intent.dash && tank.dashCooldown <= 0 && !charging) startDash(world, tank, intent);
  if (tank.dash > 0) {
    tank.dash -= STEP;
    tank.vx = tank.dashX * DASH_SPEED; tank.vy = tank.dashY * DASH_SPEED;
    if (tank.dash <= 0 && isPit(worldTile(world, tank.x, tank.y))) startFall(world, tank);
  } else {
    const limit = tank.speed * (tank.giant > 0 ? 0.85 : 1) * (charging ? 0.25 : 1);
    const grip = (ice ? 1.6 : 11) * STEP;
    tank.vx += (intent.x * limit - tank.vx) * grip;
    tank.vy += (intent.y * limit - tank.vy) * grip;
    if (stick > 0.1) tank.heading = turnToward(tank.heading, Math.atan2(intent.y, intent.x), 13 * STEP);
  }
  applyConveyor(tank, tile);
  moveTank(world, tank);
  const distance = Math.hypot(tank.vx, tank.vy) * STEP;
  tank.mileage += distance;
  if (tank.portalCooldown <= 0) {
    const onTile = worldTile(world, tank.x, tank.y);
    if (onTile === 'P' || onTile === 'p') teleportTank(world, tank, onTile);
  }
  if (tank.dash <= 0 && tank.falling <= 0 && isPit(worldTile(world, tank.x, tank.y))) startFall(world, tank);
  const aiming = Math.hypot(intent.ax, intent.ay) > 0.3;
  const aim = aiming ? Math.atan2(intent.ay, intent.ax) : stick > 0.1 ? Math.atan2(intent.y, intent.x) : tank.turret;
  tank.turret = turnToward(tank.turret, aim, (aiming ? 16 : 11) * STEP);
  if (charging) {
    tank.laserCharge -= STEP;
    if (tank.laserCharge <= 0) fireLaser(world, tank);
  } else if (intent.fire) tryFire(world, tank);
  if (intent.honk && tank.honk <= 0) { tank.honk = 0.45; world.events.push({ type: 'honk', x: tank.x, y: tank.y, tank: tank.id }); }
}

const baseScale = (world: World, tank: Tank) => (tank.enemy === 'king' ? 2 : tank.enemy === 'heavy' ? 1.4 : tank.enemy === 'zippy' ? 0.8 : world.twist.scale);

function startDash(world: World, tank: Tank, intent: Intent) {
  const moving = Math.hypot(intent.x, intent.y) > 0.2;
  const angle = moving ? Math.atan2(intent.y, intent.x) : tank.heading;
  tank.heading = angle;
  tank.dashX = Math.cos(angle); tank.dashY = Math.sin(angle);
  tank.dash = DASH_TIME; tank.dashCooldown = DASH_COOLDOWN; tank.rammed = false;
  tank.invuln = Math.max(tank.invuln, DASH_TIME * 0.7);
  world.events.push({ type: 'dash', x: tank.x, y: tank.y });
}

function applyConveyor(tank: Tank, tile: Tile) {
  const push = 95 * STEP;
  if (tile === '>') tank.x += push; else if (tile === '<') tank.x -= push; else if (tile === '^') tank.y -= push; else if (tile === 'v') tank.y += push;
}

/** A tank's footprint is a circle; push it out of any solid tile it overlaps, axis by nearest corner. */
function moveTank(world: World, tank: Tank) {
  const radius = TANK_RADIUS * tank.scale;
  tank.x += tank.vx * STEP; tank.y += tank.vy * STEP;
  const fromCol = Math.floor((tank.x - radius) / TILE), toCol = Math.floor((tank.x + radius) / TILE);
  const fromRow = Math.floor((tank.y - radius) / TILE), toRow = Math.floor((tank.y + radius) / TILE);
  for (let row = fromRow; row <= toRow; row++) {
    for (let col = fromCol; col <= toCol; col++) {
      const tile = tileAt(world, col, row);
      if (!isSolid(tile)) continue;
      if (tile === 'B') { bounceOffBumper(world, tank, col, row, radius); continue; }
      if (tile === 'c' && tank.giant > 0) { breakCrate(world, col, row); continue; }
      const nearestX = Math.max(col * TILE, Math.min(tank.x, (col + 1) * TILE));
      const nearestY = Math.max(row * TILE, Math.min(tank.y, (row + 1) * TILE));
      let dx = tank.x - nearestX, dy = tank.y - nearestY;
      let distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      if (distance === 0) { dx = tank.x - center(col); dy = tank.y - center(row); distance = Math.hypot(dx, dy) || 1; }
      tank.x += dx / distance * (radius - distance); tank.y += dy / distance * (radius - distance);
      const normalX = dx / distance, normalY = dy / distance, into = tank.vx * normalX + tank.vy * normalY;
      if (into < 0) { const rebound = worldTile(world, tank.x, tank.y) === '~' ? 1.5 : 1; tank.vx -= rebound * into * normalX; tank.vy -= rebound * into * normalY; }
      if (tank.dash > 0 && tile === 'c') breakCrate(world, col, row);
    }
  }
  tank.x = Math.max(radius, Math.min(WORLD_W - radius, tank.x));
  tank.y = Math.max(radius, Math.min(WORLD_H - radius, tank.y));
}

function bounceOffBumper(world: World, tank: Tank, col: number, row: number, radius: number) {
  const dx = tank.x - center(col), dy = tank.y - center(row), distance = Math.hypot(dx, dy) || 1, reach = radius + 20;
  if (distance >= reach) return;
  tank.x = center(col) + dx / distance * reach; tank.y = center(row) + dy / distance * reach;
  tank.vx = dx / distance * 560; tank.vy = dy / distance * 560;
  tank.dash = 0;
  world.events.push({ type: 'bumper', x: center(col) + dx / distance * 20, y: center(row) + dy / distance * 20 });
}

function teleportTank(world: World, tank: Tank, tile: Tile) {
  const exit = portalExit(world, tile, tank.x, tank.y);
  if (!exit) return;
  world.events.push({ type: 'portal', x: tank.x, y: tank.y });
  tank.x = exit[0]; tank.y = exit[1]; tank.portalCooldown = 1.2;
  world.events.push({ type: 'portal', x: tank.x, y: tank.y });
}

/** Each portal pairs with its diagonal partner; a mirrored map has two of each, one per side. */
function portalExit(world: World, tile: Tile, x: number, y: number): [number, number] | null {
  const want: Tile = tile === 'P' ? 'p' : 'P';
  const onLeft = x < WORLD_W / 2;
  let found: [number, number] | null = null, best = -1;
  world.tiles.forEach((row, rowIndex) => row.forEach((other, colIndex) => {
    if (other !== want) return;
    const distance = Math.hypot(center(colIndex) - x, center(rowIndex) - y) + (center(colIndex) < WORLD_W / 2 === onLeft ? 0 : 2000);
    if (distance > best) { best = distance; found = [center(colIndex), center(rowIndex)]; }
  }));
  return found;
}

function startFall(world: World, tank: Tank) {
  if (tank.falling > 0) return;
  tank.falling = 0.7; tank.vx = tank.vy = 0; tank.dash = 0; tank.laserCharge = 0;
  world.events.push({ type: 'fall', x: tank.x, y: tank.y, tank: tank.id });
}

function respawnAfterFall(world: World, tank: Tank) {
  tank.falling = 0;
  const [x, y] = safeSpot(world, tank.spawnX, tank.spawnY);
  tank.x = x; tank.y = y; // Before the damage: a tank downed over a pit could never be revived.
  damage(world, tank, 1, x, y, 0, 0, true);
  tank.invuln = 1.6;
}

/** Closest walkable tile to a point. The map shrinks in sudden death, so a saved spawn can be gone. */
export function safeSpot(world: World, x: number, y: number): [number, number] {
  let best: [number, number] = [x, y], distance = Infinity;
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    if (!free(world.tiles[row][col])) continue;
    const away = Math.hypot(center(col) - x, center(row) - y);
    if (away < distance) { distance = away; best = [center(col), center(row)]; }
  }
  return best;
}

export const muzzle = (tank: Tank): [number, number] => [tank.x + Math.cos(tank.turret) * 30 * tank.scale, tank.y + Math.sin(tank.turret) * 30 * tank.scale];

/** A nudge of up to ten degrees toward a visible enemy, so eight-way keyboards can still land direct shots. */
function assistedAngle(world: World, tank: Tank) {
  if (tank.seat < 0) return tank.turret;
  let angle = tank.turret, smallest = 0.18;
  for (const other of world.tanks) {
    if (!isTargetable(tank, other)) continue;
    const toward = Math.atan2(other.y - tank.y, other.x - tank.x), gap = Math.abs(angleGap(tank.turret, toward));
    if (gap < smallest && lineOfSight(world, tank.x, tank.y, other.x, other.y)) { smallest = gap; angle = toward; }
  }
  return angle;
}
const isTargetable = (tank: Tank, other: Tank) => other.alive && other.team !== tank.team && !other.downed && other.falling <= 0;

function tryFire(world: World, tank: Tank) {
  if (tank.cooldown > 0) return;
  if (tank.power === 'duck') { dropDuck(world, tank); return; }
  if (tank.power === 'laser') { tank.laserCharge = 0.5; tank.cooldown = 0.8; world.events.push({ type: 'fire', x: tank.x, y: tank.y, angle: tank.turret, kind: 'laser' }); return; }
  if (tank.ammo <= 0) { tank.cooldown = 0.2; world.events.push({ type: 'empty', tank: tank.id }); return; }
  tank.ammo--;
  if (tank.reload <= 0) tank.reload = RELOAD * world.twist.ammoReload;
  tank.cooldown = tank.enemy ? 0.5 : FIRE_COOLDOWN;
  tank.recoil = 1;
  const angle = assistedAngle(world, tank);
  const [x, y] = muzzle(tank);
  const kick = tank.power === 'mega' ? 150 : 70;
  tank.vx -= Math.cos(angle) * kick; tank.vy -= Math.sin(angle) * kick;
  let kind: ShellKind = 'shell';
  if (tank.power === 'triple') { launch(world, tank, 'shell', x, y, angle - 0.22); launch(world, tank, 'shell', x, y, angle + 0.22); }
  if (tank.power === 'mega' || tank.enemy === 'heavy') kind = 'mega';
  if (tank.power === 'bee') kind = 'bee';
  launch(world, tank, kind, x, y, angle);
  if (tank.enemy === 'king') { launch(world, tank, 'shell', x, y, angle - 0.35); launch(world, tank, 'shell', x, y, angle + 0.35); }
  world.events.push({ type: 'fire', x, y, angle, kind });
  spendCharge(tank);
}

function spendCharge(tank: Tank) {
  if (tank.power && --tank.charges <= 0) tank.power = null;
}

function launch(world: World, tank: Tank, kind: ShellKind, x: number, y: number, angle: number) {
  const speed = kind === 'mega' ? 300 : kind === 'bee' ? 250 : tank.enemy === 'zippy' || tank.enemy === 'grunt' ? 290 : 430;
  const bounces = kind === 'bee' ? 0 : kind === 'mega' ? 1 : tank.enemy === 'bouncer' ? 4 : tank.enemy ? 1 : world.twist.bounces;
  world.shells.push({
    id: world.nextId++, kind, owner: tank.id, team: tank.team, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    radius: kind === 'mega' ? 15 : 7, damage: kind === 'mega' ? 2 : 1, bounces, age: 0, life: kind === 'bee' ? 5 : 7, portalCooldown: 0
  });
}

function dropDuck(world: World, tank: Tank) {
  const x = tank.x - Math.cos(tank.heading) * 42, y = tank.y - Math.sin(tank.heading) * 42;
  world.ducks.push({ id: world.nextId++, owner: tank.id, team: tank.team, x, y, age: 0 });
  tank.cooldown = 0.5;
  world.events.push({ type: 'fire', x, y, angle: 0, kind: 'duck' });
  spendCharge(tank);
}

function fireLaser(world: World, tank: Tank) {
  const [startX, startY] = muzzle(tank);
  const points: Array<[number, number]> = [[startX, startY]];
  let x = startX, y = startY, dirX = Math.cos(tank.turret), dirY = Math.sin(tank.turret), reflections = 0, travelled = 0;
  const hit = new Set<number>();
  while (reflections <= 3 && travelled < 2600) {
    const nextX = x + dirX * 6, nextY = y + dirY * 6;
    travelled += 6;
    const col = Math.floor(nextX / TILE), row = Math.floor(nextY / TILE), tile = tileAt(world, col, row);
    if (tile === 'c') breakCrate(world, col, row);
    else if (tile === '#' || tile === 'B') {
      if (Math.floor(x / TILE) !== col) dirX = -dirX;
      if (Math.floor(y / TILE) !== row) dirY = -dirY;
      points.push([x, y]); reflections++;
      continue;
    }
    x = nextX; y = nextY;
    for (const other of world.tanks) {
      if (!other.alive || other.downed || other.falling > 0 || hit.has(other.id)) continue;
      if (other.id === tank.id && reflections === 0) continue;
      if (other.team === tank.team && (!world.friendlyFire)) continue;
      if (Math.hypot(other.x - x, other.y - y) < TANK_RADIUS * other.scale + 5) {
        hit.add(other.id);
        damage(world, other, 2, x, y, dirX * 420, dirY * 420);
      }
    }
  }
  points.push([x, y]);
  world.beams.push({ points, life: 0.32, team: tank.team });
  spendCharge(tank);
}

function stepShells(world: World) {
  for (const shell of world.shells) {
    shell.age += STEP;
    shell.portalCooldown = Math.max(0, shell.portalCooldown - STEP);
    if (shell.kind === 'bee') steerBee(world, shell);
    moveShell(world, shell);
    if (shell.age >= shell.life) shell.life = -1;
    if (shell.life < 0) continue;
    for (const tank of world.tanks) {
      if (!tank.alive || tank.downed || tank.falling > 0) continue;
      if (tank.id === shell.owner && shell.age < ARM_TIME) continue;
      if (Math.hypot(tank.x - shell.x, tank.y - shell.y) > TANK_RADIUS * tank.scale + shell.radius) continue;
      hitTank(world, shell, tank);
      break;
    }
  }
  clashShells(world);
  world.shells = world.shells.filter((shell) => shell.life >= 0);
}

function steerBee(world: World, shell: Shell) {
  let target: Tank | undefined, nearest = Infinity;
  for (const tank of world.tanks) {
    if (!tank.alive || tank.team === shell.team || tank.downed || tank.falling > 0) continue;
    const distance = Math.hypot(tank.x - shell.x, tank.y - shell.y);
    if (distance < nearest) { nearest = distance; target = tank; }
  }
  if (!target) return;
  const speed = Math.hypot(shell.vx, shell.vy) + 60 * STEP;
  const angle = turnToward(Math.atan2(shell.vy, shell.vx), Math.atan2(target.y - shell.y, target.x - shell.x), 2.8 * STEP);
  shell.vx = Math.cos(angle) * speed; shell.vy = Math.sin(angle) * speed;
}

function moveShell(world: World, shell: Shell) {
  const nextX = shell.x + shell.vx * STEP, nextY = shell.y + shell.vy * STEP;
  const col = Math.floor(nextX / TILE), row = Math.floor(nextY / TILE);
  const here = Math.floor(shell.x / TILE), hereRow = Math.floor(shell.y / TILE);
  const blockedX = isSolid(tileAt(world, col, hereRow)), blockedY = isSolid(tileAt(world, here, row));
  const blockedBoth = !blockedX && !blockedY && isSolid(tileAt(world, col, row));
  if (blockedX || blockedY || blockedBoth) {
    const tileCol = blockedX || blockedBoth ? col : here, tileRow = blockedY && !blockedX ? row : blockedBoth ? row : hereRow;
    const tile = tileAt(world, tileCol, tileRow);
    if (tile === 'c') {
      damageCrate(world, tileCol, tileRow, shell.kind === 'mega' ? 2 : 1);
      if (shell.kind === 'mega' && tileAt(world, tileCol, tileRow) !== 'c') { shell.x = nextX; shell.y = nextY; return; }
      if (shell.kind === 'bee') explode(world, shell.x, shell.y, 70, shell.owner);
      shell.life = -1;
      return;
    }
    if (shell.kind === 'bee') { explode(world, shell.x, shell.y, 70, shell.owner); shell.life = -1; return; }
    if (tile === 'B') {
      const dx = shell.x - center(tileCol), dy = shell.y - center(tileRow), distance = Math.hypot(dx, dy) || 1;
      const speed = Math.min(620, Math.hypot(shell.vx, shell.vy) * 1.2);
      shell.vx = dx / distance * speed; shell.vy = dy / distance * speed;
      world.events.push({ type: 'bumper', x: shell.x, y: shell.y });
      return;
    }
    if (shell.bounces <= 0) {
      if (shell.kind === 'mega') explode(world, shell.x, shell.y, 90, shell.owner);
      else world.events.push({ type: 'bounce', x: shell.x, y: shell.y });
      shell.life = -1;
      return;
    }
    shell.bounces--;
    if (blockedX || blockedBoth) shell.vx = -shell.vx;
    if (blockedY || blockedBoth) shell.vy = -shell.vy;
    world.events.push({ type: 'bounce', x: shell.x, y: shell.y });
    return;
  }
  shell.x = nextX; shell.y = nextY;
  const tile = worldTile(world, shell.x, shell.y);
  if ((tile === 'P' || tile === 'p') && shell.portalCooldown <= 0) {
    const exit = portalExit(world, tile, shell.x, shell.y);
    if (exit) { world.events.push({ type: 'portal', x: shell.x, y: shell.y }); shell.x = exit[0]; shell.y = exit[1]; shell.portalCooldown = 0.5; world.events.push({ type: 'portal', x: shell.x, y: shell.y }); }
  }
}

function hitTank(world: World, shell: Shell, tank: Tank) {
  if (tank.shield > 0) {
    const speed = Math.hypot(shell.vx, shell.vy), dx = shell.x - tank.x, dy = shell.y - tank.y, distance = Math.hypot(dx, dy) || 1;
    shell.vx = dx / distance * speed; shell.vy = dy / distance * speed;
    shell.team = tank.team; shell.owner = tank.id; shell.age = 0;
    world.events.push({ type: 'reflect', x: shell.x, y: shell.y });
    return;
  }
  shell.life = -1;
  if (shell.kind === 'bee' || shell.kind === 'mega') { explode(world, shell.x, shell.y, shell.kind === 'mega' ? 90 : 70, shell.owner, tank.id); }
  const power = shell.kind === 'mega' ? 620 : 380;
  const length = Math.hypot(shell.vx, shell.vy) || 1;
  if (tank.team === shell.team && !world.friendlyFire) { tank.vx += shell.vx / length * power * 0.6; tank.vy += shell.vy / length * power * 0.6; world.events.push({ type: 'bounce', x: shell.x, y: shell.y }); return; }
  damage(world, tank, shell.damage, shell.x, shell.y, shell.vx / length * power, shell.vy / length * power);
}

function clashShells(world: World) {
  for (let i = 0; i < world.shells.length; i++) {
    const a = world.shells[i];
    if (a.life < 0) continue;
    for (let j = i + 1; j < world.shells.length; j++) {
      const b = world.shells[j];
      if (b.life < 0 || a.team === b.team || Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius) continue;
      world.events.push({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      if (a.kind !== 'mega') a.life = -1;
      if (b.kind !== 'mega') b.life = -1;
      if (a.life < 0) break;
    }
  }
}

export function damage(world: World, tank: Tank, amount: number, x: number, y: number, pushX: number, pushY: number, ignoreGuard = false) {
  if (!ignoreGuard && (tank.invuln > 0 || tank.shield > 0)) { tank.vx += pushX * 0.3; tank.vy += pushY * 0.3; return; }
  tank.hp -= amount;
  tank.flash = 0.2; tank.invuln = INVULN;
  tank.vx += pushX * world.twist.knock; tank.vy += pushY * world.twist.knock;
  world.events.push({ type: 'hit', x, y, tank: tank.id, left: Math.max(0, tank.hp) });
  if (tank.hp > 0) return;
  tank.hp = 0; tank.laserCharge = 0;
  world.events.push({ type: 'ko', x: tank.x, y: tank.y, tank: tank.id });
  if (tank.team === 0 && !world.friendlyFire) { tank.downed = true; tank.revive = 0; tank.vx = tank.vy = 0; } else { tank.alive = false; }
  dropPower(world, tank);
}

function dropPower(world: World, tank: Tank) {
  if (!tank.power) return;
  spawnPickup(world, tank.power, tank.x, tank.y, 0);
  tank.power = null; tank.charges = 0;
}

function explode(world: World, x: number, y: number, radius: number, owner: number, spare = -1) {
  world.events.push({ type: 'explode', x, y, radius });
  const fromCol = Math.floor((x - radius) / TILE), toCol = Math.floor((x + radius) / TILE), fromRow = Math.floor((y - radius) / TILE), toRow = Math.floor((y + radius) / TILE);
  for (let row = fromRow; row <= toRow; row++) for (let col = fromCol; col <= toCol; col++) {
    if (tileAt(world, col, row) === 'c' && Math.hypot(center(col) - x, center(row) - y) < radius + 24) breakCrate(world, col, row);
  }
  const team = world.tanks.find((tank) => tank.id === owner)?.team;
  for (const tank of world.tanks) {
    if (!tank.alive || tank.downed || tank.falling > 0 || tank.id === spare) continue;
    const dx = tank.x - x, dy = tank.y - y, distance = Math.hypot(dx, dy) || 1;
    if (distance > radius + TANK_RADIUS * tank.scale) continue;
    const pushX = dx / distance * 460, pushY = dy / distance * 460;
    if (tank.team === team && !world.friendlyFire) { tank.vx += pushX * 0.6; tank.vy += pushY * 0.6; continue; }
    damage(world, tank, 1, tank.x, tank.y, pushX, pushY);
  }
}

function damageCrate(world: World, col: number, row: number, amount: number) {
  world.crateHp[row][col] -= amount;
  if (world.crateHp[row][col] <= 0) breakCrate(world, col, row);
  else world.events.push({ type: 'bounce', x: center(col), y: center(row) });
}

function breakCrate(world: World, col: number, row: number) {
  world.tiles[row][col] = world.arena.rows[row].includes('~') ? '~' : '.';
  world.crateHp[row][col] = 0;
  world.events.push({ type: 'crate', x: center(col), y: center(row) });
  if (world.random() < 0.3) spawnPickup(world, randomPower(world), center(col), center(row), 0);
}

const randomPower = (world: World) => POWERS[Math.floor(world.random() * POWERS.length) % POWERS.length];

export function spawnPickup(world: World, kind: PowerKind, x: number, y: number, drop: number) {
  world.pickups.push({ id: world.nextId++, kind, x, y, drop, age: 0 });
}

function stepDucks(world: World) {
  for (const duck of world.ducks) {
    duck.age += STEP;
    if (duck.age < 0.9) continue;
    const trigger = world.tanks.some((tank) => tank.alive && !tank.downed && tank.falling <= 0 && Math.hypot(tank.x - duck.x, tank.y - duck.y) < 44 * tank.scale);
    const shot = world.shells.find((shell) => Math.hypot(shell.x - duck.x, shell.y - duck.y) < 18);
    if (shot) shot.life = -1;
    if (trigger || shot || duck.age > 14) { duck.age = -1; explode(world, duck.x, duck.y, 92, duck.owner); }
  }
  world.ducks = world.ducks.filter((duck) => duck.age >= 0);
}

function stepPickups(world: World) {
  world.crateTimer -= STEP;
  if (world.crateTimer <= 0) {
    world.crateTimer = world.twist.crateEvery;
    if (world.pickups.length < 4) dropCrate(world);
  }
  for (const pickup of world.pickups) {
    pickup.age += STEP;
    if (pickup.drop > 0) { pickup.drop -= STEP; continue; }
    if (isPit(worldTile(world, pickup.x, pickup.y))) { pickup.age = -1; continue; }
    const taker = world.tanks.find((tank) => tank.alive && !tank.downed && !tank.enemy && tank.falling <= 0 && Math.hypot(tank.x - pickup.x, tank.y - pickup.y) < 30 * tank.scale + 12);
    if (!taker) continue;
    pickup.age = -1;
    givePower(world, taker, pickup.kind);
    world.events.push({ type: 'pickup', x: pickup.x, y: pickup.y, kind: pickup.kind, tank: taker.id });
  }
  world.pickups = world.pickups.filter((pickup) => pickup.age >= 0);
}

function dropCrate(world: World) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const col = Math.floor(world.random() * COLS), row = Math.floor(world.random() * ROWS);
    if (!free(world.tiles[row][col])) continue;
    if (world.tanks.some((tank) => Math.hypot(tank.x - center(col), tank.y - center(row)) < 90)) continue;
    spawnPickup(world, randomPower(world), center(col), center(row), 0.8);
    return;
  }
}

export function givePower(world: World, tank: Tank, kind: PowerKind) {
  if (kind === 'shield') { tank.shield = 6; return; }
  if (kind === 'giant') { tank.giant = 7; return; }
  if (kind === 'swap') { swapPlaces(world, tank); return; }
  tank.power = kind; tank.charges = CHARGES[kind] ?? 1;
}

function swapPlaces(world: World, tank: Tank) {
  const foes = world.tanks.filter((other) => isTargetable(tank, other));
  const other = foes[Math.floor(world.random() * foes.length)];
  if (!other) return;
  world.events.push({ type: 'portal', x: tank.x, y: tank.y }, { type: 'portal', x: other.x, y: other.y });
  [tank.x, other.x] = [other.x, tank.x];
  [tank.y, other.y] = [other.y, tank.y];
  tank.invuln = other.invuln = 0.6;
}

function stepBeams(world: World) {
  for (const beam of world.beams) beam.life -= STEP;
  world.beams = world.beams.filter((beam) => beam.life > 0);
}

/** Tanks shove each other by overlap and trade momentum, a dash lands a heavy ram, and a giant squashes for real. */
function resolveTankContacts(world: World) {
  for (let i = 0; i < world.tanks.length; i++) {
    const a = world.tanks[i];
    if (!a.alive || a.downed || a.falling > 0) continue;
    for (let j = i + 1; j < world.tanks.length; j++) {
      const b = world.tanks[j];
      if (!b.alive || b.downed || b.falling > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1, reach = TANK_RADIUS * (a.scale + b.scale);
      if (distance >= reach) continue;
      const nx = dx / distance, ny = dy / distance, overlap = (reach - distance) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) { a.vx -= closing * nx * 0.8; a.vy -= closing * ny * 0.8; b.vx += closing * nx * 0.8; b.vy += closing * ny * 0.8; }
      ram(world, a, b, nx, ny); ram(world, b, a, -nx, -ny);
      if (closing > 120) world.events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
}

function ram(world: World, attacker: Tank, target: Tank, nx: number, ny: number) {
  if (attacker.dash > 0 && !attacker.rammed) {
    attacker.rammed = true;
    target.vx += nx * 640 * world.twist.knock; target.vy += ny * 640 * world.twist.knock;
    attacker.dash = 0;
  }
  if (attacker.giant > 0 && target.giant <= 0 && attacker.team !== target.team) damage(world, target, 1, target.x, target.y, nx * 520, ny * 520);
}

function stepRevives(world: World) {
  for (const tank of world.tanks) {
    if (!tank.downed || !tank.alive) continue;
    const helper = world.tanks.some((other) => other !== tank && other.team === tank.team && other.alive && !other.downed && Math.hypot(other.x - tank.x, other.y - tank.y) < 74);
    tank.revive = helper ? tank.revive + STEP : Math.max(0, tank.revive - STEP / 2);
    if (tank.revive < REVIVE_TIME) continue;
    tank.downed = false; tank.hp = 2; tank.invuln = 2; tank.revive = 0;
    world.events.push({ type: 'revive', x: tank.x, y: tank.y });
  }
}

/** Sudden death keeps every round short: the map crumbles inward, one warned ring at a time. */
function stepCollapse(world: World) {
  if (world.friendlyFire === false) return;
  world.collapseTimer -= STEP;
  if (world.collapseTimer > 0) return;
  if (!world.suddenDeath) { world.suddenDeath = true; world.warnRing = 0; world.collapseTimer = COLLAPSE_EVERY; return; }
  if (world.collapseRing >= 5) return;
  const ring = world.collapseRing;
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    if (Math.min(col, row, COLS - 1 - col, ROWS - 1 - row) === ring) { world.tiles[row][col] = 'o'; world.crateHp[row][col] = 0; }
  }
  world.collapseRing++; world.warnRing = world.collapseRing < 5 ? world.collapseRing : -1; world.collapseTimer = COLLAPSE_EVERY;
  world.events.push({ type: 'collapse', ring });
}

function checkFinish(world: World) {
  if (world.finished) return;
  const standing = (team: number) => world.tanks.some((tank) => tank.team === team && tank.alive && !tank.downed);
  if (!world.friendlyFire) {
    if (!standing(0)) { world.finished = true; world.winner = 1; } else if (!standing(1)) { world.finished = true; world.winner = 0; }
    return;
  }
  const alive = world.tanks.filter((tank) => tank.alive);
  if (alive.length <= 1) { world.finished = true; world.winner = alive[0]?.seat ?? -1; }
}

export function angleGap(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function turnToward(from: number, to: number, amount: number) {
  const gap = angleGap(from, to);
  return from + Math.max(-amount, Math.min(amount, gap));
}

export function lineOfSight(world: World, fromX: number, fromY: number, toX: number, toY: number) {
  const length = Math.hypot(toX - fromX, toY - fromY), steps = Math.ceil(length / 10);
  for (let i = 1; i < steps; i++) {
    const tile = worldTile(world, fromX + (toX - fromX) * i / steps, fromY + (toY - fromY) * i / steps);
    if (isSolid(tile)) return false;
  }
  return true;
}

/** Follows a shell's path, bounces included, and returns the first tank it reaches. Bots use this to avoid suicide. */
export function traceShot(world: World, x: number, y: number, angle: number, bounces: number, ignore: number): Tank | null {
  let dirX = Math.cos(angle), dirY = Math.sin(angle), left = bounces;
  for (let i = 0; i < 240; i++) {
    const nextX = x + dirX * 9, nextY = y + dirY * 9;
    const tile = worldTile(world, nextX, nextY);
    if (tile === 'c' || tile === 'B') return null;
    if (tile === '#') {
      if (left-- <= 0) return null;
      if (isSolid(tileAt(world, Math.floor(nextX / TILE), Math.floor(y / TILE)))) dirX = -dirX;
      if (isSolid(tileAt(world, Math.floor(x / TILE), Math.floor(nextY / TILE)))) dirY = -dirY;
      continue;
    }
    x = nextX; y = nextY;
    for (const tank of world.tanks) {
      if (!tank.alive || tank.downed || tank.falling > 0 || (tank.id === ignore && i < 10)) continue;
      if (Math.hypot(tank.x - x, tank.y - y) < TANK_RADIUS * tank.scale + 6) return tank;
    }
  }
  return null;
}

export type Mode = 'versus' | 'coop';
export type Match = { mode: Mode; target: number; wins: [number, number]; hats: [number, number]; round: number; wave: number; kills: number; order: Arena[]; twists: Twist[]; hp: [number, number] };
export const WAVES = 10;

export function createMatch(mode: Mode, target: number, arenas: readonly Arena[], random: () => number): Match {
  return { mode, target, wins: [0, 0], hats: [0, 0], round: 0, wave: 1, kills: 0, order: shuffle([...arenas], random), twists: [], hp: [5, 5] };
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export const arenaForRound = (match: Match) => match.order[match.round % match.order.length];

/** Never repeats the previous twist, and the very first round stays plain so new players learn the basics. */
export function pickTwist(match: Match, random: () => number): Twist {
  if (match.round === 0 || match.mode === 'coop') return TWISTS[0];
  const last = match.twists[match.twists.length - 1];
  const pool = TWISTS.filter((twist) => twist !== last);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Records a versus round. Each loss earns one more silly hat. Returns the match winner, if there is one now. */
export function recordRound(match: Match, winner: number): number {
  match.round++;
  if (winner !== 0 && winner !== 1) return -1;
  match.wins[winner]++;
  match.hats[winner ? 0 : 1]++;
  return match.wins[winner] >= match.target ? winner : -1;
}

export type WaveSpec = { grunt: number; zippy: number; bouncer: number; heavy: number; king: number };
export function waveSpec(wave: number): WaveSpec {
  if (wave === 5) return { grunt: 2, zippy: 0, bouncer: 0, heavy: 0, king: 1 };
  if (wave === WAVES) return { grunt: 0, zippy: 2, bouncer: 2, heavy: 1, king: 1 };
  return { grunt: Math.max(1, 3 - Math.floor(wave / 3)), zippy: wave >= 2 ? Math.min(2, Math.ceil(wave / 3)) : 0, bouncer: wave >= 3 ? Math.min(2, Math.floor(wave / 3)) : 0, heavy: wave >= 6 ? Math.floor(wave / 4) : 0, king: 0 };
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number }> = {
  grunt: { hp: 1, speed: 0.55 }, zippy: { hp: 1, speed: 1.05 }, bouncer: { hp: 2, speed: 0.7 }, heavy: { hp: 4, speed: 0.5 }, king: { hp: 16, speed: 0.55 }
};

/** Enemies land as far from the players as the map allows, so a wave never appears on someone's nose. */
export function spawnWave(world: World, wave: number) {
  const spec = waveSpec(wave);
  const kinds = (Object.keys(spec) as Array<keyof WaveSpec>).flatMap((kind) => Array.from({ length: spec[kind] }, () => kind));
  const heroes = world.tanks.filter((tank) => tank.team === 0);
  const spots: Array<[number, number]> = [];
  for (let row = 1; row < ROWS - 1; row++) for (let col = 1; col < COLS - 1; col++) if (free(world.tiles[row][col])) spots.push([center(col), center(row)]);
  const away = (spot: [number, number]) => Math.min(...heroes.map((hero) => Math.hypot(hero.x - spot[0], hero.y - spot[1])));
  spots.sort((a, b) => away(b) - away(a));
  kinds.forEach((kind, index) => {
    const [x, y] = spots[Math.min(index * 11, spots.length - 1)];
    const stats = ENEMY_STATS[kind];
    const tank = makeTank(world, 1, -1, x, y, stats.hp, kind);
    tank.speed = BASE_SPEED * stats.speed;
    tank.ammo = kind === 'grunt' ? 1 : 2;
    tank.scale = baseScale(world, tank);
  });
}

export function waveScore(match: Match) { return match.kills * 10 + (match.wave - 1) * 50; }
