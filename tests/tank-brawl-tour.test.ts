/**
 * Tank Brawl fun pass: Solo Tour, new twists, Freeze and Boomerang, the hat wardrobe and endless co-op bosses.
 * Everything here runs the pure sim at its fixed step with a seeded RNG, never the wall clock.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import game from '../src/games/tank-brawl-opus';
import { ARENAS, arenaById } from '../src/games/tank-brawl-opus/arenas';
import { botIntent, SKILLS, withStyle } from '../src/games/tank-brawl-opus/bot';
import { BOARD_SIZE, earnedHats, emptyCareer, recordCoopRun, recordTourStop, tourTotal, validCareer, WARDROBE } from '../src/games/tank-brawl-opus/career';
import { bossOf, createWorld, FREEZE_TIME, givePower, idle, isBossWave, makeTank, mirrored, spawnPoint, spawnWave, step, STEP, TWISTS, WAVES, waveSpec, type Intent, type Tank, type World } from '../src/games/tank-brawl-opus/sim';
import { FAST_ROUND, goalMet, TOUR, tourStars, tourUnlocked, type RoundStats } from '../src/games/tank-brawl-opus/tour';

const rng = (seed = 7) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const twist = (id: string) => TWISTS.find((item) => item.id === id)!;
function duel(twistId = 'classic') {
  const arena = ARENAS[0], world = createWorld(arena, twist(twistId), rng());
  world.tiles = world.tiles.map((row) => row.map(() => '.'));
  world.ducks = []; world.bigDuckTimer = 0;
  const [a, b] = [0, 1].map((seat) => { const [x, y] = spawnPoint(arena, seat); return makeTank(world, seat, seat, x, y, 3); });
  a.invuln = b.invuln = 0;
  return { world, a, b };
}
const run = (world: World, frames: number, intents = new Map<number, Intent>()) => { for (let i = 0; i < frames; i++) step(world, intents); };
const hold = (tank: Tank, intent: Partial<Intent>) => new Map([[tank.id, { ...idle(), ...intent }]]);
const round = (over: Partial<RoundStats>): RoundStats => ({ won: true, heroHp: 3, heroMax: 5, time: 40, botFell: false, grabbed: false, ...over });

describe('new power-ups', () => {
  it('Freeze locks the target in ice: it cannot drive or fire until it thaws', () => {
    const { world, a, b } = duel();
    a.x = 300; a.y = 300; b.x = 600; b.y = 300; b.invuln = 0;
    givePower(world, a, 'freeze');
    let frames = 0;
    run(world, 1, hold(a, { fire: true }));
    while (b.frozen <= 0 && frames++ < 120) run(world, 1);
    expect(b.frozen).toBeGreaterThan(FREEZE_TIME - 0.1);
    const x = b.x;
    run(world, 30, new Map([[b.id, { ...idle(), x: 1, fire: true }]]));
    expect(Math.abs(b.x - x)).toBeLessThan(6); // Only the leftover knockback slides it.
    expect(world.shells.filter((shell) => shell.owner === b.id)).toHaveLength(0);
    run(world, Math.ceil(FREEZE_TIME / STEP));
    expect(b.frozen).toBe(0);
    run(world, 30, new Map([[b.id, { ...idle(), x: 1 }]]));
    expect(b.x).toBeGreaterThan(x + 10);
  });

  it('a Boomerang curls back and is caught, and never hurts its thrower', () => {
    const { world, a, b } = duel();
    a.x = 300; a.y = 340; b.x = 1100; b.y = 120;
    givePower(world, a, 'boomerang');
    run(world, 1, hold(a, { fire: true }));
    expect(world.shells[0].kind).toBe('boomerang');
    let frames = 0, far = 0;
    while (world.shells.length && frames++ < 60 * 4) { run(world, 1); if (world.shells[0]) far = Math.max(far, Math.hypot(world.shells[0].x - a.x, world.shells[0].y - a.y)); }
    expect(far).toBeGreaterThan(150);
    expect(world.shells).toHaveLength(0);
    expect(frames).toBeLessThan(60 * 3); // Caught before its three-second life runs out.
    expect(a.hp).toBe(3);
  });
});

describe('new twists', () => {
  it('Moon Dash carries a dash much further than normal gravity', () => {
    const distance = (id: string) => {
      const { world, a } = duel(id);
      a.x = 200; a.y = 340; a.heading = 0;
      run(world, 1, hold(a, { x: 1, dash: true }));
      run(world, 50);
      return a.x - 200;
    };
    expect(distance('moon')).toBeGreaterThan(distance('classic') * 1.4);
  });

  it('Mirror Minutes flips steering part of every 12 seconds, and says so', () => {
    const { world, a } = duel('mirror');
    a.x = 640; a.y = 340;
    world.time = 6.9;
    run(world, 12);
    expect(mirrored(world)).toBe(true);
    expect(world.events.some((event) => event.type === 'mirror' && event.on)).toBe(true);
    const x = a.x;
    run(world, 30, hold(a, { x: 1 }));
    expect(a.x).toBeLessThan(x - 10);
    world.time = 11.95;
    run(world, 10);
    expect(mirrored(world)).toBe(false);
  });

  it('One Giant Duck sits mid-arena, blows when touched and comes back', () => {
    const arena = ARENAS[0], world = createWorld(arena, twist('bigduck'), rng());
    const [x, y] = spawnPoint(arena, 0), a = makeTank(world, 0, 0, x, y, 5); makeTank(world, 1, 1, ...spawnPoint(arena, 1), 5);
    run(world, 2);
    const duck = world.ducks.find((item) => item.big)!;
    expect(duck).toBeTruthy();
    expect(Math.abs(duck.x - 640)).toBeLessThan(120);
    run(world, 60);
    a.x = duck.x; a.y = duck.y; a.invuln = 0;
    run(world, 1);
    expect(world.ducks.some((item) => item.big)).toBe(false);
    expect(a.hp).toBeLessThan(5);
    run(world, Math.ceil(9.2 / STEP));
    expect(world.ducks.some((item) => item.big)).toBe(true);
  });

  it('Heart Thief hands a heart back to the shooter on a hit', () => {
    const { world, a, b } = duel('thief');
    a.x = 300; a.y = 300; b.x = 520; b.y = 300; a.hp = 1;
    run(world, 1, hold(a, { fire: true }));
    let frames = 0;
    while (b.hp === 3 && frames++ < 120) run(world, 1);
    expect(b.hp).toBe(2);
    expect(a.hp).toBe(2);
  });

  it('Fog of War hides a far tank from the bot, but not a near one', () => {
    const { world, a, b } = duel('fog');
    a.x = 200; a.y = 340; b.x = 1080; b.y = 340; b.turret = Math.PI; b.reload = 0; b.cooldown = 0;
    const skill = { ...SKILLS[2], reaction: 0 };
    let fired = false;
    for (let i = 0; i < 90; i++) { const intent = botIntent(world, b, skill); fired ||= intent.fire; step(world, new Map([[b.id, intent]])); a.x = 200; a.y = 340; }
    expect(fired).toBe(false);
    a.x = b.x - 160;
    for (let i = 0; i < 90 && !fired; i++) { const intent = botIntent(world, b, skill); fired ||= intent.fire; step(world, new Map([[b.id, intent]])); a.x = b.x - 160; a.y = b.y; }
    expect(fired).toBe(true);
  });
});

describe('ducks', () => {
  it('in versus, seat 2 still sets off its own power-up duck (only co-op enemies are spared)', () => {
    const { world, a, b } = duel();
    a.x = 200; a.y = 200; b.x = 900; b.y = 400;
    world.ducks.push({ id: 999, owner: b.id, team: b.team, x: b.x, y: b.y, age: 1 });
    run(world, 1);
    expect(world.ducks).toHaveLength(0);
    expect(b.hp).toBeLessThan(3);
  });
});

describe('bot personalities', () => {
  it('the Rammer closes in and dashes, the Camper stays home', () => {
    const settle = (style: 'rammer' | 'camper') => {
      const { world, a, b } = duel();
      a.x = 300; a.y = 340; b.x = 980; b.y = 340;
      let dashed = false;
      const skill = withStyle(SKILLS[1], style);
      for (let i = 0; i < 60 * 4; i++) { const intent = botIntent(world, b, skill); dashed ||= intent.dash; step(world, new Map([[b.id, intent]])); a.x = 300; a.y = 340; a.hp = 3; }
      return { gap: Math.hypot(b.x - a.x, b.y - a.y), home: Math.hypot(b.x - b.spawnX, b.y - b.spawnY), dashed };
    };
    const rammer = settle('rammer'), camper = settle('camper');
    expect(rammer.gap).toBeLessThan(camper.gap);
    expect(rammer.dashed).toBe(true);
    // The camper drifts a little from recoil and dodging, but stays far nearer home than the rammer.
    expect(camper.home).toBeLessThan(rammer.home / 2);
  });
});

describe('Solo Tour', () => {
  it('has 12 stops on real arenas and twists, every new arena and twist on it at least once', () => {
    expect(TOUR).toHaveLength(12);
    for (const stop of TOUR) {
      expect(arenaById(stop.arena).id).toBe(stop.arena);
      expect(TWISTS.some((item) => item.id === stop.twist)).toBe(true);
      expect(SKILLS[stop.skill]).toBeTruthy();
    }
    for (const id of ['bridges', 'mirrorhall', 'bumperrink', 'warehouse']) expect(TOUR.some((stop) => stop.arena === id), id).toBe(true);
    for (const id of ['moon', 'mirror', 'bigduck', 'fog', 'thief']) expect(TOUR.some((stop) => stop.twist === id), id).toBe(true);
    expect(new Set(TOUR.map((stop) => stop.style)).size).toBe(3);
  });

  it('scores stars: win, win without dropping a round, meet the goal in a won round', () => {
    const stop = { ...TOUR[0], goal: 'hearts' as const };
    expect(tourStars(stop, [round({ won: false }), round({}), round({})], true)).toEqual([true, false, false]);
    expect(tourStars(stop, [round({}), round({ heroHp: 5 })], true)).toEqual([true, true, true]);
    expect(tourStars(stop, [round({ heroHp: 5, won: false })], false)).toEqual([false, false, false]);
    expect(goalMet('fast', round({ time: FAST_ROUND - 1 }))).toBe(true);
    expect(goalMet('fast', round({ time: FAST_ROUND + 1 }))).toBe(false);
    expect(goalMet('pit', round({ botFell: true }))).toBe(true);
    expect(goalMet('power', round({ grabbed: true, won: false }))).toBe(false);
  });

  it('opens each stop once the one before it is won', () => {
    const stars = Array(12).fill(0);
    expect(tourUnlocked(stars, 0)).toBe(true);
    expect(tourUnlocked(stars, 1)).toBe(false);
    stars[0] = 1;
    expect(tourUnlocked(stars, 1)).toBe(true);
    expect(tourUnlocked(stars, 2)).toBe(false);
  });
});

describe('career: tour stars, best-wave board and wardrobe', () => {
  it('keeps the best stars per stop and rebuilds junk', () => {
    let career = recordTourStop(emptyCareer(), 0, 2).career;
    career = recordTourStop(career, 0, 1).career;
    expect(career.tour[0]).toBe(2);
    expect(recordTourStop(career, 0, 3).gained).toBe(1);
    const junk = validCareer({ tour: [9, -1, 'x', 2], board: [{ wave: 3, score: 50 }, null, { wave: 'a' }, { wave: 12, score: 900 }] });
    expect(junk.tour).toEqual([3, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(junk.board).toEqual([{ wave: 12, score: 900 }, { wave: 3, score: 50 }]);
  });

  it('keeps a five-run best-wave board, best wave first', () => {
    let career = emptyCareer(), place = -1;
    for (const [wave, score] of [[3, 100], [7, 300], [2, 90], [7, 350], [11, 800], [1, 10], [4, 200]]) ({ career, place } = recordCoopRun(career, wave, score));
    expect(career.board).toHaveLength(BOARD_SIZE);
    expect(career.board.map((entry) => entry.wave)).toEqual([11, 7, 7, 4, 3]);
    expect(place).toBe(3);
    expect(career.bestWave).toBe(11);
  });

  it('earns hats from what you did, and a fresh career owns only "no hat"', () => {
    expect(earnedHats(emptyCareer()).map((hat) => hat.id)).toEqual(['none']);
    const veteran = { ...emptyCareer(), matches: 5, botWins: [1, 1, 1, 1], bestWave: 12, tour: Array(12).fill(3) };
    expect(earnedHats(veteran)).toHaveLength(WARDROBE.length);
    expect(tourTotal(veteran)).toBe(36);
    expect(new Set(WARDROBE.map((hat) => hat.id)).size).toBe(WARDROBE.length);
  });
});

describe('co-op bosses', () => {
  it('puts a boss on every fifth wave, forever, and none in between', () => {
    expect(waveSpec(5).king).toBe(1);
    expect(waveSpec(WAVES).king).toBe(1);
    for (let wave = 1; wave <= 40; wave++) {
      const spec = waveSpec(wave), bosses = spec.king + spec.mother;
      expect(bosses > 0, `wave ${wave}`).toBe(isBossWave(wave));
      expect(bossOf(wave).length).toBe(bosses);
    }
    expect(waveSpec(15).mother).toBe(1);
  });

  it('spawns overtime waves solo and duo, and the Duck Mother lobs ducks that spare her own side', () => {
    for (const heroes of [1, 2]) for (let wave = 11; wave <= 25; wave++) {
      const arena = ARENAS[wave % ARENAS.length], world = createWorld(arena, TWISTS[0], rng(wave), false);
      for (let seat = 0; seat < heroes; seat++) makeTank(world, 0, seat, ...spawnPoint(arena, seat), 5);
      spawnWave(world, wave);
      expect(world.tanks.filter((tank) => tank.enemy).length, `wave ${wave}`).toBeGreaterThan(0);
    }
    const arena = ARENAS[0], world = createWorld(arena, TWISTS[0], rng(), false);
    const hero = makeTank(world, 0, 0, ...spawnPoint(arena, 0), 5);
    spawnWave(world, 15);
    const mother = world.tanks.find((tank) => tank.enemy === 'mother')!;
    expect(mother).toBeTruthy();
    hero.x = mother.x + 260; hero.y = mother.y; hero.invuln = 99;
    mother.turret = 0; mother.reload = 0; mother.cooldown = 0; mother.ammo = 2;
    world.tanks.filter((tank) => tank.enemy && tank !== mother).forEach((tank) => { tank.alive = false; });
    run(world, 1, hold(mother, { fire: true }));
    expect(world.ducks.length).toBe(1);
    world.ducks[0].x = mother.x; world.ducks[0].y = mother.y;
    run(world, 70);
    expect(world.ducks.length).toBe(1); // Sitting under its own mother: no bang.
    expect(mother.hp).toBe(mother.maxHp);
  });
});

describe('shell flow', () => {
  const drive = (values: Map<string, unknown>) => {
    let queued: FrameRequestCallback | undefined, now = 0;
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => { queued = callback; return 1; }) as typeof requestAnimationFrame;
    const services: GameServices = {
      storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
      sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: rng(5), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
    };
    const host = document.createElement('div');
    const controller = game.mount(host, services);
    type State = { screen: string; settings: { hat: string; stop: number; mode: string }; tourStop: number; tourRounds: RoundStats[]; career: { tour: number[]; matches: number }; twist: string };
    const state = () => (globalThis as unknown as { __tankBrawl: { state(): State } }).__tankBrawl.state();
    const frames = (count: number) => { for (let i = 0; i < count; i++) { now += 1000 / 60; queued!(now); } };
    const press = async (code: string) => { dispatchEvent(new KeyboardEvent('keydown', { code })); frames(1); await Promise.resolve(); dispatchEvent(new KeyboardEvent('keyup', { code })); frames(1); await Promise.resolve(); frames(1); };
    const until = (screen: string, limit = 60 * 400) => { let count = 0; while (state().screen !== screen && count++ < limit) frames(1); expect(state().screen).toBe(screen); };
    return { state, frames, press, until, finish() { controller.destroy(); globalThis.requestAnimationFrame = realRaf; } };
  };

  it('opens the tour map, plays stop 1 on its fixed twist, records it and goes back to the map', async () => {
    const values = new Map<string, unknown>([['settings', { mode: 'tour', players: 2, skill: 0, arena: 'shuffle', target: 3 }]]);
    const run = drive(values);
    await run.press('Space');
    expect(run.state().screen).toBe('tour');
    await run.press('ArrowRight'); // Stop 2 is still locked.
    expect(run.state().settings.stop).toBe(0);
    await run.press('Space');
    expect(run.state().tourStop).toBe(0);
    run.until('fight');
    expect(run.state().twist).toBe(TOUR[0].twist);
    run.until('over');
    expect(run.state().tourRounds.length).toBeGreaterThanOrEqual(2);
    expect((values.get('career') as { matches: number }).matches).toBe(1);
    run.frames(70);
    await run.press('KeyG');
    expect(run.state().screen).toBe('tour');
    await run.press('KeyG');
    expect(run.state().screen).toBe('menu');
    run.finish();
  });

  it('wears an earned hat from storage and drops one that was never earned', () => {
    const earned = drive(new Map<string, unknown>([['settings', { hat: 'cap' }], ['career', { matches: 3 }]]));
    expect(earned.state().settings.hat).toBe('cap');
    earned.finish();
    const cheeky = drive(new Map<string, unknown>([['settings', { hat: 'crown', stop: 7 }]]));
    expect(cheeky.state().settings.hat).toBe('none');
    expect(cheeky.state().settings.stop).toBe(0);
    cheeky.finish();
  });
});
