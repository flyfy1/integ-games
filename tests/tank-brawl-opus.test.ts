import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import game from '../src/games/tank-brawl-opus';
import { ARENAS, COLS, ROWS, TILE, WORLD_W } from '../src/games/tank-brawl-opus/arenas';
import { botIntent, findPath, SKILLS } from '../src/games/tank-brawl-opus/bot';
import { arenaForRound, createMatch, createWorld, damage, givePower, idle, makeTank, pickTwist, POWERS, recordRound, spawnPoint, spawnWave, step, TWISTS, WAVES, waveSpec, type Intent, type Tank, type World } from '../src/games/tank-brawl-opus/sim';

const rng = (seed = 7) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const noCrates = () => 0.99;

function duel(arenaIndex = 0, random = rng()) {
  const arena = ARENAS[arenaIndex], world = createWorld(arena, TWISTS[0], random);
  const tanks = [0, 1].map((seat) => { const [x, y] = spawnPoint(arena, seat); return makeTank(world, seat, seat, x, y, 3); });
  tanks.forEach((tank) => { tank.invuln = 0; });
  return { world, a: tanks[0], b: tanks[1] };
}
const run = (world: World, frames: number, intents = new Map<number, Intent>()) => { for (let i = 0; i < frames; i++) step(world, intents); };
const hold = (tank: Tank, intent: Partial<Intent>) => new Map([[tank.id, { ...idle(), ...intent }]]);
/** Turns a map into open floor so a test only exercises what it places itself. */
const clearMap = (world: World) => { world.tiles = world.tiles.map((row) => row.map(() => '.')); };

describe('arenas', () => {
  it.each(ARENAS.map((arena) => [arena.id, arena] as const))('%s is complete and fair', (_id, arena) => {
    expect(arena.rows).toHaveLength(ROWS);
    arena.rows.forEach((row) => expect(row).toHaveLength(COLS));
    const world = createWorld(arena, TWISTS[0], rng());
    const [ax, ay] = spawnPoint(arena, 0), [bx, by] = spawnPoint(arena, 1);
    expect(ax + bx).toBe(WORLD_W);
    expect(ay).toBe(by);
    expect(findPath(world, Math.floor(ax / TILE), Math.floor(ay / TILE), Math.floor(bx / TILE), Math.floor(by / TILE)).length).toBeGreaterThan(0);
  });
});

describe('shells', () => {
  it('fires, spends ammo, recoils and reloads', () => {
    const { world, a } = duel();
    clearMap(world);
    run(world, 1, hold(a, { fire: true }));
    expect(a.ammo).toBe(2);
    expect(world.shells).toHaveLength(1);
    expect(a.vx).toBeLessThan(0);
    run(world, 60);
    expect(a.ammo).toBe(3);
  });

  it('refuses to fire on an empty magazine', () => {
    const { world, a } = duel();
    clearMap(world); a.ammo = 0; a.reload = 99;
    run(world, 1, hold(a, { fire: true }));
    expect(world.shells).toHaveLength(0);
  });

  it('bounces off steel a limited number of times', () => {
    const { world, a, b } = duel();
    clearMap(world); world.tanks = [a, b]; b.y = 100; a.y = 500; a.x = 200; b.x = 1000;
    run(world, 1, hold(a, { fire: true }));
    const shell = world.shells[0];
    expect(shell.bounces).toBe(2);
    let frames = 0;
    while (world.shells.length && frames++ < 400) step(world, new Map());
    expect(world.shells).toHaveLength(0);
    expect(frames).toBeGreaterThan(90);
  });

  it('hits the enemy, knocks them back and hurts your own tank on a rebound', () => {
    const { world, a, b } = duel();
    clearMap(world); a.x = 200; a.y = 300; b.x = 400; b.y = 300;
    run(world, 1, hold(a, { fire: true }));
    run(world, 30);
    expect(b.hp).toBe(2);
    expect(b.x).toBeGreaterThan(400);

    const self = duel();
    clearMap(self.world); self.a.x = 60; self.a.y = 300; self.a.turret = Math.PI; self.b.x = 1000;
    run(self.world, 1, hold(self.a, { fire: true, ax: -1 }));
    run(self.world, 60);
    expect(self.a.hp).toBe(2);
  });

  it('breaks a crate in two ordinary shots', () => {
    const { world, a, b } = duel(0, noCrates);
    clearMap(world); b.x = 1000; b.y = 500; a.x = 100; a.y = 72;
    world.tiles[1][5] = 'c'; world.crateHp[1][5] = 2;
    run(world, 1, hold(a, { fire: true }));
    run(world, 40);
    expect(world.tiles[1][5]).toBe('c');
    run(world, 1, hold(a, { fire: true }));
    run(world, 40);
    expect(world.tiles[1][5]).toBe('.');
  });
});

describe('tanks', () => {
  it('never tunnels through steel however hard it is pushed', () => {
    const { world, a, b } = duel();
    clearMap(world); b.x = 1000; world.tiles.forEach((row) => { row[10] = '#'; }); a.x = 400; a.y = 300; a.vx = 3000;
    run(world, 120, hold(a, { x: 1 }));
    expect(a.x).toBeLessThan(480);
  });

  it('falls into a pit, loses a heart and reappears on solid ground', () => {
    const { world, a, b } = duel();
    clearMap(world); b.x = 1000; world.tiles[6][6] = 'o'; a.x = 6.5 * TILE; a.y = 6.5 * TILE;
    run(world, 1);
    expect(a.falling).toBeGreaterThan(0);
    run(world, 60);
    expect(a.hp).toBe(2);
    expect(world.tiles[Math.floor(a.y / TILE)][Math.floor(a.x / TILE)]).toBe('.');
  });

  it('jumps a one-tile pit with a dash', () => {
    const { world, a, b } = duel();
    clearMap(world); b.x = 1000; world.tiles.forEach((row) => { row[6] = 'o'; }); a.x = 5.4 * TILE; a.y = 300;
    run(world, 30, hold(a, { x: 1, dash: true }));
    expect(a.falling).toBe(0);
    expect(a.x).toBeGreaterThan(7 * TILE);
  });

  it('ramming shoves the other tank hard without hurting it', () => {
    const { world, a, b } = duel();
    clearMap(world); a.x = 300; a.y = 300; b.x = 370; b.y = 300;
    run(world, 12, hold(a, { x: 1, dash: true }));
    expect(b.hp).toBe(3);
    expect(b.x).toBeGreaterThan(430);
  });

  it('gives every power a real effect', () => {
    for (const kind of POWERS) {
      const { world, a, b } = duel();
      clearMap(world); a.x = 300; a.y = 300; b.x = 700; b.y = 300;
      givePower(world, a, kind);
      run(world, 1, hold(a, { fire: true }));
      run(world, 40, hold(a, { fire: true }));
      const changed = world.shells.length > 0 || world.ducks.length > 0 || world.beams.length > 0 || a.shield > 0 || a.giant > 0 || a.x > 600 || b.hp < 3;
      expect(changed, kind).toBe(true);
    }
  });
});

describe('rounds', () => {
  it('ends with the survivor as winner', () => {
    const { world, a, b } = duel();
    clearMap(world);
    damage(world, b, 3, b.x, b.y, 0, 0, true);
    run(world, 1);
    expect(world.finished).toBe(true);
    expect(world.winner).toBe(a.seat);
  });

  it('crumbles the map in sudden death so stalemates cannot last', () => {
    const { world, a, b } = duel();
    a.x = b.x = 640; a.y = 250; b.y = 380;
    run(world, 60 * 62);
    expect(world.suddenDeath).toBe(true);
    expect(world.collapseRing).toBeGreaterThan(0);
    expect(world.tiles[0].every((tile) => tile === 'o')).toBe(true);
  });

  it('scores a match, stacks a hat on each loser and stops at the target', () => {
    const match = createMatch('versus', 2, ARENAS, rng());
    expect(recordRound(match, 0)).toBe(-1);
    expect(match.hats).toEqual([0, 1]);
    expect(recordRound(match, -1)).toBe(-1);
    expect(match.wins).toEqual([1, 0]);
    expect(recordRound(match, 0)).toBe(0);
  });

  it('opens plain, then never repeats a twist twice running', () => {
    const match = createMatch('versus', 3, ARENAS, rng());
    const random = rng(3);
    expect(pickTwist(match, random).id).toBe('classic');
    for (let i = 0; i < 40; i++) {
      match.round = i + 1;
      const twist = pickTwist(match, random);
      expect(twist).not.toBe(match.twists[match.twists.length - 1]);
      match.twists.push(twist);
    }
    expect(arenaForRound(match)).toBeDefined();
  });
});

describe('co-op', () => {
  const team = () => {
    const arena = ARENAS[0], world = createWorld(arena, TWISTS[0], rng(), false);
    const heroes = [0, 1].map((seat) => { const [x, y] = spawnPoint(arena, seat); return makeTank(world, 0, seat, x, y, 4); });
    heroes.forEach((tank) => { tank.invuln = 0; });
    return { world, heroes };
  };

  it('has an enemy in every wave and kings on the boss waves', () => {
    for (let wave = 1; wave <= WAVES; wave++) expect(Object.values(waveSpec(wave)).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
    expect(waveSpec(5).king).toBe(1);
    expect(waveSpec(WAVES).king).toBe(1);
  });

  it('spawns a wave on walkable ground, away from the players', () => {
    const { world, heroes } = team();
    spawnWave(world, 6);
    world.tanks.filter((tank) => tank.enemy).forEach((enemy) => {
      expect(world.tiles[Math.floor(enemy.y / TILE)][Math.floor(enemy.x / TILE)]).toBe('.');
      heroes.forEach((hero) => expect(Math.hypot(hero.x - enemy.x, hero.y - enemy.y)).toBeGreaterThan(150));
    });
  });

  it('never lets partners hurt each other', () => {
    const { world, heroes: [a, b] } = team();
    clearMap(world); spawnWave(world, 1); world.tanks.filter((tank) => tank.enemy).forEach((enemy) => { enemy.x = 1100; enemy.y = 580; });
    a.x = 200; a.y = 300; b.x = 400; b.y = 300;
    run(world, 1, hold(a, { fire: true }));
    run(world, 30);
    expect(b.hp).toBe(4);
    expect(b.x).toBeGreaterThan(400);
  });

  it('revives a downed partner, and only loses when both are down', () => {
    const { world, heroes: [a, b] } = team();
    clearMap(world); spawnWave(world, 1); world.tanks.filter((tank) => tank.enemy).forEach((enemy) => { enemy.x = 1100; enemy.y = 580; enemy.hp = 99; enemy.speed = 0; });
    a.x = 300; a.y = 300; b.x = 350; b.y = 300;
    damage(world, a, 4, a.x, a.y, 0, 0, true);
    expect(a.downed).toBe(true);
    run(world, 100);
    expect(a.downed).toBe(false);
    expect(a.hp).toBe(2);
    expect(world.finished).toBe(false);
    damage(world, a, 4, a.x, a.y, 0, 0, true);
    damage(world, b, 4, b.x, b.y, 0, 0, true);
    run(world, 1);
    expect(world.finished).toBe(true);
    expect(world.winner).toBe(1);
  });
});

describe('bots', () => {
  it.each(ARENAS.map((arena, index) => [arena.id, index] as const))('finish a 60 second-plus fight on %s without getting stuck or breaking', (_id, index) => {
    const random = rng(index + 11), { world, a, b } = duel(index, random);
    let frames = 0;
    const start = a.x;
    let moved = 0;
    while (!world.finished && frames++ < 60 * 110) {
      step(world, new Map([[a.id, botIntent(world, a, SKILLS[2])], [b.id, botIntent(world, b, SKILLS[1])]]));
      world.events.length = 0;
      moved = Math.max(moved, Math.abs(a.x - start));
      expect(Number.isFinite(a.x + a.y + b.x + b.y)).toBe(true);
    }
    expect(moved).toBeGreaterThan(TILE);
    expect(world.finished).toBe(true);
  });
});

describe('whole game flow', () => {
  type State = { screen: string; settings: { mode: string }; match: { wins: number[]; hats: number[]; wave: number } | null };
  const drive = (settings: object) => {
    let queued: FrameRequestCallback | undefined, now = 0;
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => { queued = callback; return 1; }) as typeof requestAnimationFrame;
    const values = new Map<string, unknown>([['settings', settings]]);
    const reportScore = vi.fn(), reportComplete = vi.fn();
    const services: GameServices = {
      storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
      sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: rng(5), reportScore, reportComplete, isReducedMotion: true
    };
    const host = document.createElement('div');
    const controller = game.mount(host, services);
    const state = () => (globalThis as unknown as { __tankBrawl: { state(): State } }).__tankBrawl.state();
    const frames = (count: number) => { for (let i = 0; i < count; i++) { now += 1000 / 60; const callback = queued!; callback(now); } };
    // The input kit forgets a tap in a microtask, so each frame around a key needs a real await.
    const press = async (code: string) => { dispatchEvent(new KeyboardEvent('keydown', { code })); frames(1); await Promise.resolve(); dispatchEvent(new KeyboardEvent('keyup', { code })); frames(1); await Promise.resolve(); frames(1); };
    const until = (screen: string, limit = 60 * 300) => { let count = 0; while (state().screen !== screen && count++ < limit) frames(1); expect(state().screen).toBe(screen); };
    return { controller, state, frames, press, until, reportScore, reportComplete, finish() { controller.destroy(); globalThis.requestAnimationFrame = realRaf; } };
  };

  it('plays a 1P versus match to the end, stacks hats and offers a rematch', async () => {
    const run = drive({ mode: 'versus', players: 1, skill: 2, arena: 'garden', target: 3 });
    expect(run.state().screen).toBe('menu');
    await run.press('Space');
    run.until('fight');
    run.until('over');
    const finished = run.state().match!;
    expect(Math.max(...finished.wins)).toBe(3);
    expect(finished.hats[0] + finished.hats[1]).toBeGreaterThanOrEqual(3);
    expect(run.reportComplete).toHaveBeenCalledTimes(1);
    run.frames(70);
    await run.press('Space');
    expect(run.state().screen).toBe('card');
    expect(run.state().match!.wins).toEqual([0, 0]);
    run.controller.pause(); run.frames(30); run.controller.resume();
    run.controller.restart();
    expect(run.state().screen).toBe('card');
    run.finish();
  });

  it('loses solo co-op to the waves, reports a partial run and returns to the menu', async () => {
    const run = drive({ mode: 'coop', players: 1, skill: 1, arena: 'shuffle', target: 3 });
    await run.press('Space');
    run.until('over', 60 * 600);
    expect(run.reportComplete).toHaveBeenCalledTimes(1);
    expect(run.reportComplete.mock.calls[0][0]).toBeLessThan(1);
    run.frames(70);
    await run.press('KeyG');
    expect(run.state().screen).toBe('menu');
    expect(run.state().match).toBeNull();
    run.finish();
  });

  it('pauses on a controller Start and quits to the menu on Select', async () => {
    const run = drive({ mode: 'versus', players: 2, skill: 1, arena: 'garden', target: 3 });
    await run.press('Space');
    run.until('fight');
    await run.press('KeyP');
    await run.press('KeyT');
    expect(run.state().screen).toBe('menu');
    run.finish();
  });
});
