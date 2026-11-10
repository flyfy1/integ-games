import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import game from '../src/games/tank-brawl-opus';
import { ARENAS, COLS, ROWS, TILE, WORLD_W } from '../src/games/tank-brawl-opus/arenas';
import { botIntent, enemySkill, findPath, SKILLS } from '../src/games/tank-brawl-opus/bot';
import { botLevels, emptyCareer, matchBonus, medalRow, recordCoopRun, recordSoloMatch, roundScore, validCareer } from '../src/games/tank-brawl-opus/career';
import { arenaForRound, createMatch, createWorld, damage, givePower, heartsAfterWave, idle, makeTank, pickTwist, POWERS, recordRound, spawnPoint, spawnWave, step, suddenDeathAt, TWISTS, WAVES, waveSpec, type Intent, type Tank, type World } from '../src/games/tank-brawl-opus/sim';

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

  it('hands an untouched second seat to an easy bot until its owner shows up', async () => {
    const run = drive({ mode: 'versus', players: 2, skill: 1, arena: 'garden', target: 3 });
    const auto = () => (run.state() as unknown as { autoBot: boolean[] }).autoBot;
    await run.press('Space');
    run.until('fight');
    run.frames(60 * 5);
    expect(auto()).toEqual([false, false]); // Nobody is at the cabinet: no bot plays with itself.
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' })); run.frames(20); await Promise.resolve();
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' })); run.frames(30);
    expect(auto()).toEqual([false, true]);
    await run.press('ArrowLeft');
    expect(auto()).toEqual([false, false]);
    run.finish();
  });

  it('opens a first visit on the couch default with an easy bot, and keeps the Boss locked', () => {
    const fresh = drive(undefined as unknown as object);
    expect(fresh.state().settings).toMatchObject({ mode: 'versus', players: 2, skill: 0 });
    fresh.finish();
    const sneaky = drive({ mode: 'versus', players: 1, skill: 3, arena: 'garden', target: 3 });
    expect(sneaky.state().settings).toMatchObject({ skill: 2 });
    sneaky.finish();
  });
});

describe('added rules', () => {
  it('names the shooter on a hit, so a rebound reads as an own goal', () => {
    const { world, a, b } = duel();
    clearMap(world);
    a.x = 300; a.y = 300; b.x = 500; b.y = 300; a.turret = 0;
    const seen: Array<{ tank: number; by: number }> = [];
    for (let i = 0; i < 40; i++) { step(world, i === 0 ? hold(a, { fire: true }) : new Map()); world.events.forEach((event) => { if (event.type === 'hit') seen.push({ tank: event.tank, by: event.by }); }); world.events.length = 0; }
    expect(seen).toEqual([{ tank: b.id, by: a.id }]);
    world.events.length = 0;
    world.shells.push({ id: 999, kind: 'shell', owner: b.id, team: b.team, x: b.x - 40, y: b.y, vx: 300, vy: 0, radius: 7, damage: 1, bounces: 0, age: 1, life: 7, portalCooldown: 0 });
    b.invuln = 0;
    run(world, 10);
    const own = world.events.find((event) => event.type === 'hit');
    expect(own && own.type === 'hit' && own.by === own.tank).toBe(true);
  });

  it('deals every fancy twist once before any of them returns', () => {
    const match = createMatch('versus', 7, ARENAS, rng());
    const random = rng(9);
    match.twists.push(pickTwist(match, random));
    const fancy = TWISTS.length - 1;
    for (let cycle = 0; cycle < 3; cycle++) {
      const dealt = new Set<string>();
      for (let i = 0; i < fancy; i++) { match.round++; const twist = pickTwist(match, random); expect(twist).not.toBe(match.twists[match.twists.length - 1]); match.twists.push(twist); dealt.add(twist.id); }
      expect(dealt.size).toBe(fancy);
      expect(dealt.has('classic')).toBe(false);
    }
  });

  it('starts the crumble early on Crumbling Floor and keeps it late everywhere else', () => {
    const crumble = TWISTS.find((twist) => twist.id === 'crumble')!;
    expect(suddenDeathAt(crumble)).toBeLessThan(20);
    expect(suddenDeathAt(TWISTS[0])).toBe(50);
    const world = createWorld(ARENAS[0], crumble, rng());
    [0, 1].forEach((seat) => { const [x, y] = spawnPoint(ARENAS[0], seat); makeTank(world, seat, seat, x, y, 5); });
    run(world, 60 * 13);
    expect(world.suddenDeath).toBe(true);
    expect(TWISTS.find((twist) => twist.id === 'glass')!.hp).toBe(2);
  });

  it('crumbles the whole floor in the end, so two tanks that never fight still finish the round', () => {
    const { world } = duel();
    run(world, 60 * 100);
    expect(world.tiles.every((row) => row.every((tile) => tile === 'o'))).toBe(true);
    expect(world.finished).toBe(true);
  });

  it('thins the waves for a lone hero and shrinks the King', () => {
    const total = (wave: number, heroes: number) => Object.values(waveSpec(wave, heroes)).reduce((sum, count) => sum + count, 0);
    for (let wave = 1; wave <= WAVES; wave++) {
      expect(total(wave, 1)).toBeGreaterThan(0);
      expect(total(wave, 1)).toBeLessThanOrEqual(total(wave, 2));
      expect(waveSpec(wave, 1).king).toBe(waveSpec(wave, 2).king);
    }
    expect(total(1, 1)).toBeLessThan(total(1, 2));
    const kingOf = (heroes: number) => {
      const world = createWorld(ARENAS[0], TWISTS[0], rng(), false);
      for (let seat = 0; seat < heroes; seat++) { const [x, y] = spawnPoint(ARENAS[0], seat); makeTank(world, 0, seat, x, y, 5); }
      spawnWave(world, 5);
      return world.tanks.find((tank) => tank.enemy === 'king')!;
    };
    expect(kingOf(1).maxHp).toBeLessThan(kingOf(2).maxHp);
    const solo = { hp: 1, downed: false } as Tank;
    expect(heartsAfterWave(solo, 1)).toBe(3);
    expect(heartsAfterWave(solo, 2)).toBe(2);
    expect(heartsAfterWave({ hp: 5, downed: false } as Tank, 1)).toBe(5);
  });

  it('lets wave enemies be hit again quickly while heroes keep their mercy window', () => {
    const world = createWorld(ARENAS[0], TWISTS[0], rng(), false);
    const [x, y] = spawnPoint(ARENAS[0], 0), hero = makeTank(world, 0, 0, x, y, 5);
    spawnWave(world, 5);
    const king = world.tanks.find((tank) => tank.enemy === 'king')!;
    hero.invuln = king.invuln = 0;
    damage(world, king, 1, king.x, king.y, 0, 0); damage(world, hero, 1, hero.x, hero.y, 0, 0);
    expect(king.invuln).toBeLessThan(0.5);
    expect(hero.invuln).toBeGreaterThan(1);
  });

  it('gives the bot ladder four rungs with a tougher top', () => {
    expect(SKILLS).toHaveLength(4);
    for (let level = 1; level < SKILLS.length; level++) { expect(SKILLS[level].aim).toBeLessThan(SKILLS[level - 1].aim); expect(SKILLS[level].reaction).toBeLessThan(SKILLS[level - 1].reaction); }
    expect(enemySkill('grunt').reaction).toBeGreaterThan(enemySkill('king').reaction);
  });
});

describe('career', () => {
  it('rebuilds whatever storage hands back', () => {
    expect(validCareer(null)).toEqual(emptyCareer());
    expect(validCareer({ botWins: [2, 'x', -1], streak: 3, bestStreak: 1, soloBest: 12.9, bestWave: NaN })).toEqual({ ...emptyCareer(), botWins: [2, 0, 0, 0], streak: 3, bestStreak: 3, soloBest: 12 });
  });

  it('keeps the Boss locked until Hard falls', () => {
    let career = emptyCareer();
    expect(botLevels(career)).toBe(3);
    career = recordSoloMatch(career, 0, true, 500).career;
    expect(botLevels(career)).toBe(3);
    expect(medalRow(career)).toBe('🥉 · · ·');
    const hard = recordSoloMatch(career, 2, true, 900);
    expect(hard.unlockedBoss).toBe(true);
    expect(hard.firstWin).toBe(true);
    expect(botLevels(hard.career)).toBe(4);
    expect(recordSoloMatch(hard.career, 2, true, 100).unlockedBoss).toBe(false);
  });

  it('tracks streaks, bests and co-op records', () => {
    let result = recordSoloMatch(emptyCareer(), 1, true, 700);
    expect(result).toMatchObject({ firstWin: true, newBest: true, newStreak: false });
    result = recordSoloMatch(result.career, 1, true, 400);
    expect(result).toMatchObject({ firstWin: false, newBest: false, newStreak: true });
    expect(result.career).toMatchObject({ streak: 2, bestStreak: 2, soloBest: 700, matches: 2, botWins: [0, 2, 0, 0] });
    result = recordSoloMatch(result.career, 1, false, 100);
    expect(result.career).toMatchObject({ streak: 0, bestStreak: 2, matches: 3 });
    const run = recordCoopRun(result.career, 4, 260);
    expect(run.newBest).toBe(true);
    expect(run.career).toMatchObject({ bestWave: 4, bestScore: 260 });
    expect(recordCoopRun(run.career, 2, 120).newBest).toBe(false);
  });

  it('pays more for harder bots, healthier wins and clean sweeps', () => {
    expect(roundScore(2, 5)).toBeGreaterThan(roundScore(1, 5));
    expect(roundScore(1, 5)).toBeGreaterThan(roundScore(1, 1));
    expect(matchBonus(1, 0)).toBeGreaterThan(matchBonus(1, 2));
  });
});
