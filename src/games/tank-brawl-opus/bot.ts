/** A bot only produces the same Intent a player's controller would, so it can never cheat the rules. */
import { COLS, ROWS, TILE } from './arenas';
import { angleGap, idle, isPit, isSolid, lineOfSight, muzzle, traceShot, type Intent, type Tank, type World } from './sim';

export type BotSkill = { aim: number; reaction: number; dodge: number; bounceShots: boolean };
export const SKILLS: readonly BotSkill[] = [
  { aim: 0.34, reaction: 1.3, dodge: 0.15, bounceShots: false },
  { aim: 0.2, reaction: 0.85, dodge: 0.5, bounceShots: false },
  { aim: 0.1, reaction: 0.5, dodge: 0.9, bounceShots: true }
];
export const ENEMY_SKILL: BotSkill = { aim: 0.26, reaction: 0.8, dodge: 0.1, bounceShots: false };

type Memory = { path: Array<[number, number]>; think: number; aimError: number; ready: number; dodge: [number, number] | null; dodgeLeft: number };
const memories = new WeakMap<Tank, Memory>();

const memoryOf = (tank: Tank) => {
  let memory = memories.get(tank);
  if (!memory) { memory = { path: [], think: 0, aimError: 0, ready: 0.6, dodge: null, dodgeLeft: 0 }; memories.set(tank, memory); }
  return memory;
};

/** Breadth-first over tiles: 24×13 is tiny, and thinking only a few times a second keeps it cheap. */
export function findPath(world: World, fromCol: number, fromRow: number, toCol: number, toRow: number): Array<[number, number]> {
  const index = (col: number, row: number) => row * COLS + col;
  const previous = new Map<number, number>([[index(fromCol, fromRow), -1]]);
  const queue: Array<[number, number]> = [[fromCol, fromRow]];
  for (let head = 0; head < queue.length; head++) {
    const [col, row] = queue[head];
    if (col === toCol && row === toRow) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextCol = col + dx, nextRow = row + dy;
      if (nextCol < 0 || nextRow < 0 || nextCol >= COLS || nextRow >= ROWS || previous.has(index(nextCol, nextRow))) continue;
      const tile = world.tiles[nextRow][nextCol];
      if (isSolid(tile) && tile !== 'c' || isPit(tile)) continue;
      previous.set(index(nextCol, nextRow), index(col, row));
      queue.push([nextCol, nextRow]);
    }
  }
  const path: Array<[number, number]> = [];
  let cursor = previous.has(index(toCol, toRow)) ? index(toCol, toRow) : -1;
  while (cursor >= 0 && cursor !== index(fromCol, fromRow)) {
    path.unshift([cursor % COLS, Math.floor(cursor / COLS)]);
    cursor = previous.get(cursor) ?? -1;
  }
  return path;
}

function threat(world: World, tank: Tank): [number, number] | null {
  for (const shell of world.shells) {
    if (shell.owner === tank.id && shell.age < 0.5) continue;
    if (shell.team === tank.team && !world.friendlyFire) continue;
    const dx = tank.x - shell.x, dy = tank.y - shell.y, distance = Math.hypot(dx, dy);
    if (distance > 170) continue;
    const speed = Math.hypot(shell.vx, shell.vy) || 1, along = (dx * shell.vx + dy * shell.vy) / speed;
    if (along <= 0) continue;
    const miss = Math.abs(dx * shell.vy - dy * shell.vx) / speed;
    if (miss > 34 * tank.scale) continue;
    const side = dx * shell.vy - dy * shell.vx >= 0 ? 1 : -1;
    return [shell.vy / speed * side, -shell.vx / speed * side];
  }
  return null;
}

export function botIntent(world: World, tank: Tank, skill: BotSkill): Intent {
  const intent = idle(), memory = memoryOf(tank);
  if (tank.downed || tank.falling > 0) return intent;
  let target: Tank | undefined, nearest = Infinity;
  for (const other of world.tanks) {
    if (!other.alive || other.downed || other.team === tank.team || other.falling > 0) continue;
    const distance = Math.hypot(other.x - tank.x, other.y - tank.y);
    if (distance < nearest) { nearest = distance; target = other; }
  }
  if (!target) return intent;
  memory.think -= 1 / 60; memory.ready -= 1 / 60; memory.dodgeLeft -= 1 / 60;
  const col = Math.floor(tank.x / TILE), row = Math.floor(tank.y / TILE);
  if (memory.think <= 0) {
    memory.think = 0.35;
    const prize = tank.enemy ? undefined : world.pickups.find((pickup) => pickup.drop <= 0 && Math.hypot(pickup.x - tank.x, pickup.y - tank.y) < nearest);
    memory.path = findPath(world, col, row, Math.floor((prize ?? target).x / TILE), Math.floor((prize ?? target).y / TILE));
    memory.aimError = (world.random() - 0.5) * 2 * skill.aim;
    if (memory.dodgeLeft <= 0 && world.random() < skill.dodge) {
      const away = threat(world, tank);
      if (away) { memory.dodge = away; memory.dodgeLeft = 0.4; intent.dash = world.random() < skill.dodge / 2; }
    }
  }
  while (memory.path.length && memory.path[0][0] === col && memory.path[0][1] === row) memory.path.shift();
  const sees = lineOfSight(world, tank.x, tank.y, target.x, target.y);
  const toward = Math.atan2(target.y - tank.y, target.x - tank.x) + memory.aimError;
  const next = memory.path[0];
  let moveX = 0, moveY = 0;
  if (next) {
    const dx = (next[0] + 0.5) * TILE - tank.x, dy = (next[1] + 0.5) * TILE - tank.y, length = Math.hypot(dx, dy) || 1;
    moveX = dx / length; moveY = dy / length;
  }
  if (sees && nearest < 220) { moveX = -moveX * 0.5 + Math.sin(world.time * 1.3 + tank.id) * 0.6; moveY = -moveY * 0.5 + Math.cos(world.time * 1.1 + tank.id) * 0.6; }
  if (memory.dodgeLeft > 0 && memory.dodge) { moveX = memory.dodge[0]; moveY = memory.dodge[1]; }
  [moveX, moveY] = avoidPits(world, tank, moveX, moveY);
  intent.x = moveX; intent.y = moveY;
  const blocked = next && world.tiles[next[1]][next[0]] === 'c';
  const aim = blocked && !sees ? Math.atan2((next[1] + 0.5) * TILE - tank.y, (next[0] + 0.5) * TILE - tank.x) : toward;
  intent.ax = Math.cos(aim); intent.ay = Math.sin(aim);
  if (memory.ready > 0) return intent;
  const aligned = Math.abs(angleGap(tank.turret, aim)) < 0.14;
  const [x, y] = muzzle(tank);
  const line = traceShot(world, x, y, tank.turret, skill.bounceShots ? 2 : 1, tank.id);
  const safe = !line || line.team !== tank.team;
  const wouldHit = line?.team !== undefined && line.team !== tank.team;
  if (safe && ((aligned && (sees || blocked)) || (skill.bounceShots && wouldHit))) {
    intent.fire = true;
    memory.ready = skill.reaction * (0.6 + world.random() * 0.8);
  }
  return intent;
}

/** Look one tile ahead and steer around pits, because a bot that dives into lava unprompted is not a good opponent. */
function avoidPits(world: World, tank: Tank, x: number, y: number): [number, number] {
  const ahead = (dx: number, dy: number) => {
    const col = Math.floor((tank.x + dx * 40) / TILE), row = Math.floor((tank.y + dy * 40) / TILE);
    return col >= 0 && row >= 0 && col < COLS && row < ROWS && isPit(world.tiles[row][col]);
  };
  if (!ahead(x, y)) return [x, y];
  if (!ahead(-y, x)) return [-y, x];
  if (!ahead(y, -x)) return [y, -x];
  return [-x, -y];
}
