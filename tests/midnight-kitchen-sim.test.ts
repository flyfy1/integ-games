import { describe, expect, it } from 'vitest';
import { DEFENDERS, ENEMIES, LEVELS } from '../src/games/midnight-kitchen/data';
import {
  CAKE_X, STEP, canPlace, cellFree, createSim, defenderAt, drainEvents, enemySpeed, mulberry32, place, refundFor, remove, run, spawnEnemy,
  starFlags, step, upgrade, upgradeCost, waveProgress
} from '../src/games/midnight-kitchen/sim';
import type { LevelDef, Sim, SimEvent, WaveDef } from '../src/games/midnight-kitchen/types';

const ALL = Object.keys(DEFENDERS);

/** A quiet 9x5 counter: lots of Heat, every card, and a single wave that never arrives unless a test asks for one. */
function sandbox(patch: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test', chapter: 0, index: 1, name: { en: 'Test', zh: '测试' }, blurb: { en: '', zh: '' },
    cols: 9, lanes: 5, startHeat: 5000, slices: 3, cards: ALL, slots: 6,
    waves: [{ after: 99999, spawns: [] }], bonus: { kind: 'noRemove' }, reward: 0, backdrop: 'countertop', ...patch
  };
}
const make = (patch: Partial<LevelDef> = {}, seed = 7): Sim => {
  const sim = createSim(sandbox(patch), { random: mulberry32(seed) });
  for (const card of sim.cards) card.cooldown = 0;
  return sim;
};
/** Place ignoring the card cooldown, which most behaviour tests do not care about. */
const put = (sim: Sim, def: string, col: number, lane: number) => {
  const card = sim.cards.find(item => item.def === def);
  if (card) card.cooldown = 0;
  const result = place(sim, def, col, lane);
  expect(result, `place ${def} at ${col},${lane}`).toEqual({ ok: true });
  return defenderAt(sim, col, lane)!;
};
const collect = (sim: Sim, seconds: number): SimEvent[] => {
  const events: SimEvent[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && sim.status === 'playing'; i++) { step(sim); events.push(...drainEvents(sim)); }
  return events;
};
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) => events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);

describe('midnight kitchen sim: determinism', () => {
  const script = (seed: number) => {
    const sim = createSim(LEVELS['c1-3'], { random: mulberry32(seed), loadout: ['burner', 'pepper', 'dough', 'egg'] });
    const log: string[] = [];
    const plan: [number, string, number, number][] = [[1, 'burner', 0, 2], [8, 'pepper', 2, 2], [20, 'burner', 0, 1], [30, 'pepper', 2, 1], [45, 'dough', 5, 2], [60, 'egg', 3, 3]];
    for (let second = 0; second < 150 && sim.status === 'playing'; second++) {
      for (const [at, def, col, lane] of plan) if (at === second) place(sim, def, col, lane);
      run(sim, 1);
      for (const event of drainEvents(sim)) log.push(event.type === 'hit' ? `hit${event.enemy}:${event.damage}` : event.type);
    }
    return { log: log.join(','), heat: sim.heat, time: sim.time, enemies: sim.enemies.map(e => [e.id, e.def, e.lane, e.x, e.hp]), status: sim.status };
  };

  it('replays identically from the same seed and inputs', () => {
    expect(script(42)).toEqual(script(42));
  });
  it('uses the injected random source (a different seed changes lane picks)', () => {
    expect(script(42).log).not.toEqual(script(43).log);
  });
  it('never touches Math.random', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random used by the sim'); };
    try { expect(() => script(5)).not.toThrow(); } finally { Math.random = original; }
  });
});

describe('midnight kitchen sim: economy and cards', () => {
  it('charges the card cost and starts its cooldown', () => {
    const sim = make({ startHeat: 150 });
    expect(place(sim, 'pepper', 2, 2)).toEqual({ ok: true });
    expect(sim.heat).toBe(50);
    expect(canPlace(sim, 'pepper', 3, 2)).toEqual({ ok: false, reason: 'cooldown' });
    expect(canPlace(sim, 'egg', 3, 2)).toEqual({ ok: false, reason: 'heat' });
    run(sim, DEFENDERS.pepper.cooldown + 0.1);
    sim.heat = 100;
    expect(canPlace(sim, 'pepper', 3, 2)).toEqual({ ok: true });
  });

  it('burners make Heat on their interval and the level trickle adds more', () => {
    const quiet = make({ startHeat: 50 });
    put(quiet, 'burner', 0, 0);
    expect(quiet.heat).toBe(0);
    run(quiet, 6.1);
    expect(quiet.heat).toBe(25);
    run(quiet, 12);
    expect(quiet.heat).toBe(50);

    const trickle = make({ startHeat: 0, trickle: { amount: 10, interval: 4 } });
    run(trickle, 12.1);
    expect(trickle.heat).toBe(30);
  });

  it('upgrades cost Heat, raise the tier and stop at tier 3', () => {
    const sim = make({ startHeat: 1000 });
    const pepper = put(sim, 'pepper', 2, 2);
    const first = upgradeCost(sim, pepper)!;
    expect(first).toBeGreaterThan(0);
    expect(upgrade(sim, 2, 2)).toEqual({ ok: true });
    expect(sim.heat).toBe(1000 - 100 - first);
    expect(pepper.tier).toBe(1);
    expect(upgrade(sim, 2, 2)).toEqual({ ok: true });
    expect(pepper.tier).toBe(2);
    expect(sim.stats.tier3).toBe(1);
    expect(upgradeCost(sim, pepper)).toBeNull();
    expect(upgrade(sim, 2, 2)).toEqual({ ok: false, reason: 'max-tier' });
    expect(upgrade(sim, 5, 0)).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses an upgrade the player cannot afford', () => {
    const sim = make({ startHeat: 100 });
    put(sim, 'pepper', 2, 2);
    expect(upgrade(sim, 2, 2)).toEqual({ ok: false, reason: 'heat' });
  });

  it('the spatula removes a defender and refunds part of what was spent', () => {
    const sim = make({ startHeat: 1000 });
    const pepper = put(sim, 'pepper', 2, 2);
    upgrade(sim, 2, 2);
    const refund = refundFor(sim, pepper);
    expect(refund).toBeGreaterThan(0);
    expect(refund).toBeLessThan(pepper.spent);
    const before = sim.heat;
    expect(remove(sim, 2, 2)).toEqual({ ok: true });
    expect(sim.heat).toBe(before + refund);
    expect(defenderAt(sim, 2, 2)).toBeUndefined();
    expect(remove(sim, 2, 2)).toEqual({ ok: false, reason: 'empty' });
    expect(sim.stats.removed).toBe(1);
  });

  it('permanent upgrades change the starting Heat and slices', () => {
    const base = createSim(sandbox({ startHeat: 100 }), { random: mulberry32(1) });
    const boosted = createSim(sandbox({ startHeat: 100 }), { random: mulberry32(1), meta: { upgrades: { 'pilot-light': 2, 'thick-frosting': 1 } } });
    expect(boosted.heat).toBeGreaterThan(base.heat);
    expect(boosted.slices).toBeGreaterThan(base.slices);
  });
});

describe('midnight kitchen sim: placement rules', () => {
  it('rejects occupied, blocked, off-board, inactive-lane and unknown placements', () => {
    const sim = make({ blocked: [[4, 2]], activeLanes: [1, 2, 3] });
    put(sim, 'burner', 0, 2);
    expect(canPlace(sim, 'pepper', 0, 2)).toEqual({ ok: false, reason: 'occupied' });
    expect(canPlace(sim, 'pepper', 4, 2)).toEqual({ ok: false, reason: 'blocked' });
    expect(canPlace(sim, 'pepper', 3, 0)).toEqual({ ok: false, reason: 'blocked' });
    expect(canPlace(sim, 'pepper', 9, 2)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(canPlace(sim, 'pepper', -1, 2)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(canPlace(sim, 'pepper', 1.5, 2)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(canPlace(sim, 'nonsense', 1, 2)).toEqual({ ok: false, reason: 'unknown-card' });
  });

  it('only deals the level hand, capped at the slot count', () => {
    const fixed = createSim(LEVELS['c1-1'], { random: mulberry32(1), loadout: ['egg', 'chili'] });
    expect(fixed.cards.map(card => card.def)).toEqual(LEVELS['c1-1'].cards);
    const free = createSim(sandbox({ cards: undefined, slots: 3 }), { random: mulberry32(1), loadout: ['burner', 'burner', 'pepper', 'nope', 'egg', 'ice'] });
    expect(free.cards.map(card => card.def)).toEqual(['burner', 'pepper', 'egg']);
  });

  it('does nothing once the night is over', () => {
    const sim = make();
    sim.slices = 0; step(sim);
    expect(sim.status).toBe('lost');
    expect(canPlace(sim, 'pepper', 1, 1)).toEqual({ ok: false, reason: 'over' });
  });
});

describe('midnight kitchen sim: defenders', () => {
  it('pepper mill shoots straight down its own lane only', () => {
    const sim = make();
    put(sim, 'pepper', 1, 2);
    const same = spawnEnemy(sim, 'ant', 2, 7)!, other = spawnEnemy(sim, 'ant', 1, 7)!;
    run(sim, 6);
    expect(same.hp).toBeLessThan(same.maxHp);
    expect(other.hp).toBe(other.maxHp);
  });

  it('does not waste shots on an empty lane', () => {
    const sim = make();
    put(sim, 'pepper', 1, 2);
    expect(of(collect(sim, 5), 'attack')).toHaveLength(0);
  });

  it('a front shield soaks straight shots, lobbed eggs go over it', () => {
    const straight = make();
    put(straight, 'pepper', 1, 2);
    const a = spawnEnemy(straight, 'shieldant', 2, 7)!;
    const events = collect(straight, 5);
    expect(a.shield).toBeLessThan(a.maxShield);
    expect(a.hp).toBe(a.maxHp);
    expect(of(events, 'hit').every(hit => hit.shield)).toBe(true);

    const lobbed = make();
    put(lobbed, 'egg', 1, 2);
    const b = spawnEnemy(lobbed, 'shieldant', 2, 7)!;
    run(lobbed, 5);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.shield).toBe(b.maxShield);
  });

  it('a broken shield reports it and stops protecting', () => {
    const sim = make();
    put(sim, 'pepper', 0, 2); put(sim, 'pepper', 1, 2); put(sim, 'pepper', 2, 2);
    const ant = spawnEnemy(sim, 'shieldant', 2, 8.5)!;
    const events = collect(sim, 14);
    expect(of(events, 'shieldBreak')).toHaveLength(1);
    expect(ant.shield).toBe(0);
    expect(ant.hp).toBeLessThan(ant.maxHp);
  });

  it('egg splash hurts neighbours of the target', () => {
    const sim = make();
    put(sim, 'egg', 1, 2);
    const a = spawnEnemy(sim, 'slug', 2, 6)!, b = spawnEnemy(sim, 'slug', 2, 6.4)!;
    const events = collect(sim, 4);
    expect(of(events, 'splash').length).toBeGreaterThan(0);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('ice slows what it hits', () => {
    const sim = make();
    put(sim, 'ice', 1, 2);
    const slug = spawnEnemy(sim, 'slug', 2, 6)!;
    const free = enemySpeed(sim, slug);
    const events = collect(sim, 4);
    expect(of(events, 'status').some(event => event.kind === 'slow')).toBe(true);
    expect(slug.slow).toBeGreaterThan(0);
    expect(enemySpeed(sim, slug)).toBeLessThan(free * 0.7);
  });

  it('tier 3 ice pierces into a second enemy', () => {
    const sim = make();
    put(sim, 'ice', 1, 2); upgrade(sim, 1, 2); upgrade(sim, 1, 2);
    const front = spawnEnemy(sim, 'slug', 2, 5)!, back = spawnEnemy(sim, 'slug', 2, 7)!;
    run(sim, 4);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(back.hp).toBeLessThan(back.maxHp);
  });

  it('dough blocks walkers and rises back when left alone', () => {
    const sim = make();
    const dough = put(sim, 'dough', 4, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 5.5)!;
    run(sim, 8);
    expect(ant.state).toBe('bite');
    expect(ant.x).toBeGreaterThan(4.3);
    expect(dough.hp).toBeLessThan(dough.maxHp);
    ant.hp = 0; run(sim, 0.1);
    const hurt = dough.hp;
    run(sim, 10);
    expect(dough.hp).toBeGreaterThan(hurt);
  });

  it('an eaten defender is removed and counted', () => {
    const sim = make();
    put(sim, 'burner', 4, 2);
    spawnEnemy(sim, 'slug', 2, 5.2);
    const events = collect(sim, 12);
    expect(defenderAt(sim, 4, 2)).toBeUndefined();
    expect(of(events, 'defenderDown')[0]).toMatchObject({ def: 'burner', cause: 'eaten' });
    expect(sim.stats.defendersLost).toBe(1);
  });

  it('chili is a one-shot that scorches its whole lane and nothing else', () => {
    const sim = make();
    const near = spawnEnemy(sim, 'ant', 2, 3)!, far = spawnEnemy(sim, 'ant', 2, 8.5)!, tough = spawnEnemy(sim, 'slug', 2, 6)!, other = spawnEnemy(sim, 'ant', 3, 5)!;
    put(sim, 'chili', 1, 2);
    const events = collect(sim, 1.2);
    expect(of(events, 'laneFire')).toHaveLength(1);
    expect(near.hp).toBe(0); expect(far.hp).toBe(0);
    expect(tough.hp).toBeLessThan(tough.maxHp); expect(tough.hp).toBeGreaterThan(0);
    expect(other.hp).toBe(other.maxHp);
    expect(defenderAt(sim, 1, 2)).toBeUndefined();
    expect(of(events, 'defenderDown')[0]).toMatchObject({ cause: 'spent' });
    expect(sim.stats.defendersLost).toBe(0);
    const after = tough.hp;
    run(sim, 1.5);
    expect(tough.hp).toBeLessThan(after);
  });

  it('onion waits for company, stuns an area across lanes, then recharges', () => {
    const sim = make();
    put(sim, 'onion', 4, 2);
    expect(of(collect(sim, 3), 'attack')).toHaveLength(0);
    const a = spawnEnemy(sim, 'ant', 2, 5.2)!, b = spawnEnemy(sim, 'ant', 1, 5)!, c = spawnEnemy(sim, 'ant', 0, 8.5)!;
    const events = collect(sim, 0.5);
    expect(of(events, 'attack')).toHaveLength(1);
    expect(a.stun).toBeGreaterThan(0); expect(b.stun).toBeGreaterThan(0);
    expect(c.stun).toBe(0);
    expect(of(collect(sim, 5), 'attack')).toHaveLength(0);
  });

  it('whisk hits every ground enemy in reach at once, and nothing beyond', () => {
    const sim = make();
    put(sim, 'whisk', 3, 2);
    const a = spawnEnemy(sim, 'slug', 2, 4.4)!, b = spawnEnemy(sim, 'slug', 2, 4.9)!, far = spawnEnemy(sim, 'slug', 2, 8.5)!;
    run(sim, 1.2);
    expect(a.hp).toBeLessThan(a.maxHp); expect(b.hp).toBeLessThan(b.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('kettle steam goes through everyone in range; tier 3 reaches the neighbouring lanes', () => {
    const sim = make();
    put(sim, 'kettle', 3, 2);
    const a = spawnEnemy(sim, 'slug', 2, 4.5)!, b = spawnEnemy(sim, 'slug', 2, 5.5)!, side = spawnEnemy(sim, 'slug', 1, 5)!;
    run(sim, 2.5);
    expect(a.hp).toBeLessThan(a.maxHp); expect(b.hp).toBeLessThan(b.maxHp);
    expect(side.hp).toBe(side.maxHp);
    upgrade(sim, 3, 2); upgrade(sim, 3, 2);
    run(sim, 2.5);
    expect(side.hp).toBeLessThan(side.maxHp);
  });

  it('honey is walked over, sticks ground enemies and runs out of uses', () => {
    const sim = make();
    const honey = put(sim, 'honey', 4, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 5.1)!;
    const free = enemySpeed(sim, ant);
    run(sim, 2.5);
    expect(ant.state).toBe('walk');
    expect(ant.sticky).toBeGreaterThan(0);
    expect(enemySpeed(sim, ant)).toBeLessThan(free * 0.5);
    expect(honey.uses).toBeLessThan(5);
    for (let i = 0; i < 6; i++) spawnEnemy(sim, 'ant', 2, 4.6 + i * 0.05);
    const events = collect(sim, 2);
    expect(defenderAt(sim, 4, 2)).toBeUndefined();
    expect(of(events, 'defenderDown').some(event => event.cause === 'spent')).toBe(true);
  });
});

describe('midnight kitchen sim: enemies', () => {
  const walk = (def: string, seconds: number) => { const sim = make(); const e = spawnEnemy(sim, def, 2, 8)!; run(sim, seconds); return 8 - e.x; };

  it('walkers advance at their data speed', () => {
    expect(walk('ant', 5)).toBeCloseTo(ENEMIES.ant.speed * 5, 1);
    expect(walk('roach', 5)).toBeGreaterThan(walk('ant', 5) * 1.5);
    expect(walk('slug', 5)).toBeLessThan(walk('ant', 5));
  });

  it('an enemy that reaches the cake eats one slice and leaves', () => {
    const sim = make();
    spawnEnemy(sim, 'ant', 2, CAKE_X + 0.1);
    const events = collect(sim, 1);
    expect(sim.slices).toBe(2);
    expect(sim.enemies).toHaveLength(0);
    expect(of(events, 'slice')[0]).toMatchObject({ left: 2, lane: 2, by: 'ant' });
    expect(sim.stats.kills).toBe(0);
  });

  it('fruit flies fly over walls and cannot be lobbed at or whisked', () => {
    const sim = make();
    put(sim, 'dough', 4, 2); put(sim, 'egg', 1, 2); put(sim, 'whisk', 2, 2);
    const fly = spawnEnemy(sim, 'fruitfly', 2, 5.5)!;
    run(sim, 6);
    expect(fly.x).toBeLessThan(4);
    expect(fly.hp).toBe(fly.maxHp);
  });

  it('fruit flies can be shot', () => {
    const sim = make();
    put(sim, 'pepper', 1, 2);
    const fly = spawnEnemy(sim, 'fruitfly', 2, 7)!;
    run(sim, 3);
    expect(fly.hp).toBeLessThan(fly.maxHp);
  });

  it('cockroach armour shaves every hit', () => {
    const sim = make();
    put(sim, 'pepper', 1, 2);
    spawnEnemy(sim, 'roach', 2, 6);
    const hit = of(collect(sim, 3), 'hit')[0];
    expect(hit.damage).toBe(20 - ENEMIES.roach.armor!);
  });

  it('slug slime speeds up whoever follows', () => {
    const sim = make();
    const slug = spawnEnemy(sim, 'slug', 2, 6.5)!;
    run(sim, 3);
    expect(sim.cells[2][6].slime).toBeGreaterThan(0);
    const ant = spawnEnemy(sim, 'ant', 2, 6.6)!;
    expect(enemySpeed(sim, ant)).toBeCloseTo(ENEMIES.ant.speed * ENEMIES.slug.slime!.boost, 3);
    expect(enemySpeed(sim, slug)).toBeCloseTo(ENEMIES.slug.speed, 3);
  });

  it('a mold spore leaves a mold cell that blocks placement, then clears', () => {
    const sim = make();
    const spore = spawnEnemy(sim, 'spore', 2, 5.5)!;
    spore.hp = 0;
    const events = collect(sim, 0.1);
    expect(of(events, 'mold')[0]).toMatchObject({ col: 5, lane: 2 });
    expect(canPlace(sim, 'pepper', 5, 2)).toEqual({ ok: false, reason: 'mold' });
    run(sim, ENEMIES.spore.moldOnDeath!.duration + 0.5);
    expect(canPlace(sim, 'pepper', 5, 2)).toEqual({ ok: true });
  });

  it('a weevil burrows under the first defender it meets and surfaces behind it', () => {
    const sim = make();
    const dough = put(sim, 'dough', 5, 2);
    const weevil = spawnEnemy(sim, 'weevil', 2, 6.5)!;
    const events = collect(sim, 9);
    expect(of(events, 'burrow')).toHaveLength(1);
    expect(of(events, 'emerge')).toHaveLength(1);
    expect(weevil.x).toBeLessThan(5);
    expect(dough.hp).toBe(dough.maxHp);
  });

  it('a burrowed weevil cannot be shot', () => {
    const sim = make();
    put(sim, 'dough', 5, 2); put(sim, 'pepper', 0, 2);
    const weevil = spawnEnemy(sim, 'weevil', 2, 6.02)!;
    run(sim, 0.2);
    expect(weevil.state).toBe('burrowed');
    const hp = weevil.hp;
    run(sim, 1.5);
    expect(weevil.state).toBe('burrowed');
    expect(weevil.hp).toBe(hp);
  });

  it('a mouse steals a defender; stopping it gives the defender back', () => {
    const sim = make();
    const pepper = put(sim, 'pepper', 5, 2);
    const mouse = spawnEnemy(sim, 'mouse', 2, 6.2)!;
    const events = collect(sim, 2.5);
    expect(of(events, 'steal')[0]).toMatchObject({ def: 'pepper' });
    expect(defenderAt(sim, 5, 2)).toBeUndefined();
    expect(mouse.state).toBe('flee');
    mouse.hp = 0;
    const after = collect(sim, 0.1);
    expect(of(after, 'recovered')[0]).toMatchObject({ def: 'pepper' });
    expect(defenderAt(sim, 5, 2)).toBe(pepper);
    expect(sim.stats.defendersLost).toBe(0);
  });

  it('a mouse that escapes keeps what it took', () => {
    const sim = make();
    put(sim, 'pepper', 7, 2);
    spawnEnemy(sim, 'mouse', 2, 8.2);
    const events = collect(sim, 8);
    expect(of(events, 'defenderDown')[0]).toMatchObject({ def: 'pepper', cause: 'stolen' });
    expect(sim.stats.defendersLost).toBe(1);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.slices).toBe(3);
  });

  it('a mouse with nothing to grab steals Heat from the cake end instead of a slice', () => {
    const sim = make({ startHeat: 200 });
    const mouse = spawnEnemy(sim, 'mouse', 2, 0.2)!;
    const events = collect(sim, 1.5);
    expect(of(events, 'steal')[0]).toMatchObject({ def: null, heat: 75 });
    expect(sim.heat).toBe(125);
    expect(sim.slices).toBe(3);
    mouse.hp = 0; run(sim, 0.1);
    expect(sim.heat).toBe(200);
  });
});

describe('midnight kitchen sim: recipes', () => {
  it('forms when the parts are orthogonally adjacent and breaks when one leaves', () => {
    const sim = make();
    put(sim, 'burner', 1, 2);
    put(sim, 'pepper', 2, 3);
    expect(sim.links).toHaveLength(0);
    const pepper = put(sim, 'pepper', 2, 2);
    const events = drainEvents(sim);
    expect(of(events, 'recipe')[0]).toMatchObject({ recipe: 'toasted-pepper', first: true });
    expect(pepper.recipes).toContain('toasted-pepper');
    expect(sim.stats.recipes).toEqual(['toasted-pepper']);
    remove(sim, 1, 2);
    expect(pepper.recipes).toEqual([]);
    expect(sim.links).toHaveLength(0);
  });

  it('Toasted Pepper sets enemies alight', () => {
    const sim = make();
    put(sim, 'burner', 1, 2); put(sim, 'pepper', 2, 2);
    const slug = spawnEnemy(sim, 'slug', 2, 6)!;
    const events = collect(sim, 3);
    expect(of(events, 'status').some(event => event.kind === 'burn')).toBe(true);
    expect(slug.burn).toBeGreaterThan(0);
  });

  it('Fresh Bread makes dough tougher; the bonus goes away with the burner', () => {
    const sim = make();
    const dough = put(sim, 'dough', 3, 2);
    const plain = dough.maxHp;
    put(sim, 'burner', 3, 1);
    expect(dough.maxHp).toBeCloseTo(plain * 1.5, 5);
    remove(sim, 3, 1);
    expect(dough.maxHp).toBeCloseTo(plain, 5);
    expect(dough.hp).toBeLessThanOrEqual(dough.maxHp);
  });

  it('Cracked Pepper Ice makes the pepper mill fire faster', () => {
    const shots = (withIce: boolean) => {
      const sim = make();
      put(sim, 'pepper', 2, 2);
      if (withIce) put(sim, 'ice', 2, 1);
      spawnEnemy(sim, 'slug', 2, 8);
      return of(collect(sim, 20), 'attack').filter(event => event.def === 'pepper').length;
    };
    expect(shots(true)).toBeGreaterThan(shots(false));
  });

  it('Birthday Sponge needs all three connected and bakes back one slice once per night', () => {
    const sim = make();
    sim.slices = 1; sim.stats.slicesLost = 2;
    put(sim, 'egg', 1, 1); put(sim, 'dough', 2, 1);
    expect(sim.stats.recipes).not.toContain('birthday-sponge');
    put(sim, 'burner', 2, 2);
    const events = drainEvents(sim);
    expect(sim.stats.recipes).toContain('birthday-sponge');
    expect(of(events, 'sliceRestored')).toHaveLength(1);
    expect(sim.slices).toBe(2);
    remove(sim, 2, 2); put(sim, 'burner', 2, 2);
    expect(sim.slices).toBe(2);
  });
});

describe('midnight kitchen sim: waves, win and lose', () => {
  const waves: WaveDef[] = [
    { after: 10, spawns: [[0, 'ant', 2], [2, 'ant', 1, 2, 1.5]] },
    { after: 20, spawns: [[0, 'roach', '*', 2, 1]], big: true }
  ];

  it('telegraphs big waves, and spawns each scripted row at its time and lane', () => {
    const sim = make({ waves });
    const seen: [number, string][] = [];
    const spawns: [number, string, number][] = [];
    for (let i = 0; i < 60 * 34; i++) {
      step(sim);
      for (const event of drainEvents(sim)) {
        if (event.type === 'telegraph' || event.type === 'waveStart') seen.push([Math.round(sim.time), `${event.type}${event.wave}`]);
        if (event.type === 'enemySpawn') spawns.push([Math.round(sim.time * 2) / 2, event.def, event.lane]);
      }
    }
    expect(seen).toEqual([[10, 'waveStart0'], [25, 'telegraph1'], [30, 'waveStart1']]);
    expect(spawns.slice(0, 3)).toEqual([[10, 'ant', 2], [12, 'ant', 1], [13.5, 'ant', 1]]);
    expect(spawns.slice(3).map(row => row[1])).toEqual(['roach', 'roach']);
    for (const [, , lane] of spawns.slice(3)) expect(sim.activeLanes).toContain(lane);
  });

  it("'*' rows only ever pick active lanes", () => {
    const sim = make({ activeLanes: [1, 3], waves: [{ after: 1, spawns: [[0, 'ant', '*', 30, 0.1]] }] });
    const lanes = new Set(of(collect(sim, 6), 'enemySpawn').map(event => event.lane));
    expect([...lanes].sort()).toEqual([1, 3]);
  });

  it('wave progress climbs from 0 to 1', () => {
    const sim = make({ waves });
    expect(waveProgress(sim)).toBe(0);
    run(sim, 20);
    const mid = waveProgress(sim);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    run(sim, 14);
    expect(waveProgress(sim)).toBeCloseTo(1, 5);
  });

  it('wins when the last wave is cleared, with star flags', () => {
    const sim = make({ waves: [{ after: 1, spawns: [[0, 'ant', 2]] }], bonus: { kind: 'heatBank', n: 100 } });
    put(sim, 'pepper', 1, 2); put(sim, 'pepper', 2, 2);
    const events = collect(sim, 30);
    expect(sim.status).toBe('won');
    expect(of(events, 'win')).toHaveLength(1);
    expect(starFlags(sim)).toEqual({ win: true, flawless: true, bonus: true });
    const time = sim.time;
    run(sim, 5);
    expect(sim.time).toBe(time);
  });

  it('loses when the last slice is eaten, with no stars', () => {
    const sim = make({ slices: 2, waves: [{ after: 1, spawns: [[0, 'ant', 2, 3, 1]] }] });
    const events = collect(sim, 90);
    expect(sim.status).toBe('lost');
    expect(of(events, 'lose')).toHaveLength(1);
    expect(starFlags(sim)).toEqual({ win: false, flawless: false, bonus: false });
  });

  it('losing a slice costs the flawless star but not the win', () => {
    const sim = make({ waves: [{ after: 1, spawns: [[0, 'ant', 2]] }] });
    run(sim, 60);
    expect(sim.status).toBe('won');
    expect(starFlags(sim)).toMatchObject({ win: true, flawless: false });
  });

  it('fires story barks on time, wave and event triggers, once each', () => {
    const sim = make({
      waves: [{ after: 2, spawns: [[0, 'ant', 2]] }],
      barks: [
        { when: { time: 1 }, speaker: 'pip', line: { en: 'time', zh: 't' } },
        { when: { wave: 0 }, speaker: 'pip', line: { en: 'wave', zh: 'w' } },
        { when: { on: 'place', def: 'pepper' }, speaker: 'pip', line: { en: 'placed', zh: 'p' } }
      ]
    });
    put(sim, 'burner', 0, 0); put(sim, 'pepper', 1, 2); put(sim, 'pepper', 2, 2);
    const lines = of(collect(sim, 4), 'bark').map(event => event.line.en);
    expect(lines.sort()).toEqual(['placed', 'time', 'wave']);
  });
});

describe('midnight kitchen sim: boss', () => {
  const bossLevel = (): Partial<LevelDef> => ({ boss: 'queen', waves: [{ after: 1, spawns: [[0, 'queen', 2]] }] });

  it('summons workers and throws sugar cubes that stun a defender', () => {
    const sim = make(bossLevel());
    put(sim, 'pepper', 1, 2); put(sim, 'pepper', 2, 1);
    const events = collect(sim, 22);
    const kinds = new Set(of(events, 'bossAttack').map(event => event.kind));
    expect(kinds.has('summon')).toBe(true);
    expect(kinds.has('toss')).toBe(true);
    expect(of(events, 'defenderStun').length).toBeGreaterThan(0);
    expect(sim.enemies.some(e => e.def === 'ant')).toBe(true);
  });

  it('changes phase as her health drops, and hops lanes from phase two', () => {
    const sim = make(bossLevel());
    run(sim, 2);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    queen.hp = queen.maxHp * 0.6;
    const events = collect(sim, 14);
    expect(of(events, 'bossPhase')[0]).toMatchObject({ phase: 1 });
    expect(of(events, 'bossAttack').some(event => event.kind === 'hop')).toBe(true);
    queen.hp = queen.maxHp * 0.2;
    expect(of(collect(sim, 1), 'bossPhase')[0]).toMatchObject({ phase: 2 });
  });

  it('is immune to stun, takes a slice and retreats instead of leaving', () => {
    const sim = make(bossLevel());
    run(sim, 2);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    put(sim, 'onion', 7, 2);
    run(sim, 3);
    expect(queen.stun).toBe(0);
    queen.x = CAKE_X + 0.05;
    run(sim, 1.5);
    expect(sim.slices).toBe(2);
    expect(sim.enemies).toContain(queen);
    expect(queen.x).toBeGreaterThan(5);
  });

  it('her death scatters the colony and wins the night', () => {
    const sim = make(bossLevel());
    run(sim, 12);
    expect(sim.enemies.length).toBeGreaterThan(1);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    queen.hp = 0;
    const events = collect(sim, 0.1);
    expect(of(events, 'enemyDown').some(event => event.boss)).toBe(true);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.status).toBe('won');
  });
});

// ====================================================================== phase 2: board gimmicks, new roster, bosses


describe('midnight kitchen sim: sink (wet tiles, drips)', () => {
  it('a Burner refuses a wet tile; other cards do not', () => {
    const sim = make({ terrain: { wet: [[0, 2]] } });
    expect(canPlace(sim, 'burner', 0, 2)).toEqual({ ok: false, reason: 'wet' });
    expect(cellFree(sim, 0, 2, 'burner')).toBe(false);
    expect(cellFree(sim, 0, 2)).toBe(true);
    expect(canPlace(sim, 'pepper', 0, 2)).toEqual({ ok: true });
  });

  it('a Burner standing on a tile that gets wet sputters until it dries', () => {
    const sim = make();
    put(sim, 'burner', 0, 2);
    sim.cells[2][0].wet = 30;
    const wet = of(collect(sim, 25), 'heat').filter(e => e.source === 'burner');
    expect(wet).toHaveLength(0);
    const events = collect(sim, 20);
    expect(of(events, 'hazard').some(e => e.kind === 'dry')).toBe(true);
    expect(of(events, 'heat').filter(e => e.source === 'burner').length).toBeGreaterThan(0);
  });

  it('fire does not stick to a pest on a wet tile', () => {
    const sim = make({ terrain: { wet: [[5, 2]] } });
    put(sim, 'burner', 0, 2); put(sim, 'pepper', 1, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 5.5)!;
    run(sim, 2);
    expect(ant.burn).toBe(0);
  });

  it('a drip telegraphs its cell, then washes pests back, stuns the guard under it and wets the cell', () => {
    const sim = make({ hazards: [{ kind: 'drip', every: 5, first: 3, warn: 2, cells: [[4, 2]], push: 1.5, stun: 3 }] });
    const guard = put(sim, 'pepper', 4, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 4.6)!; ant.stun = 99;
    const warned = collect(sim, 1.5);
    expect(of(warned, 'warn')[0]).toMatchObject({ kind: 'drip', cells: [[4, 2]], boss: false });
    expect(sim.warnings).toHaveLength(1);
    const x = ant.x;
    const landed = collect(sim, 1.6);
    expect(of(landed, 'hazard').some(e => e.kind === 'drip')).toBe(true);
    expect(sim.warnings).toHaveLength(0);
    expect(ant.x).toBeCloseTo(x + 1.5, 1);
    expect(guard.stun).toBeGreaterThan(2);
    expect(sim.cells[2][4].wet).toBeGreaterThan(0);
  });
});

describe('midnight kitchen sim: stove (hobs, grease)', () => {
  it('a Burner on a hob makes double Heat', () => {
    const plain = make(), hob = make({ terrain: { hobs: [[1, 2]] } });
    put(plain, 'burner', 1, 2); put(hob, 'burner', 1, 2);
    const heat = (sim: Sim) => of(collect(sim, 7), 'heat').filter(e => e.source === 'burner').reduce((sum, e) => sum + e.amount, 0);
    expect(heat(hob)).toBe(heat(plain) * 2);
  });

  it('a lit hob burns pests on it and singes guards, but not heat-proof ones', () => {
    const sim = make({ terrain: { hobs: [[5, 2], [3, 1]] }, hazards: [{ kind: 'hob', every: 30, first: 2, warn: 1, lit: 5 }] });
    const pepper = put(sim, 'pepper', 3, 1);
    const burner = put(sim, 'burner', 5, 2);
    // Swap: the burner moves off, an ant waits on the hob, the pepper stays on its hob.
    remove(sim, 5, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 5.5)!; ant.stun = 99;
    const events = collect(sim, 1.2);
    expect(of(events, 'warn')[0]).toMatchObject({ kind: 'hob' });
    collect(sim, 2);
    expect(sim.cells[2][5].hobLit).toBeGreaterThan(0);
    expect(ant.burn).toBeGreaterThan(0);
    expect(pepper.hp).toBeLessThan(pepper.maxHp);
    const kettle = put(sim, 'kettle', 5, 2);
    run(sim, 1);
    expect(kettle.hp).toBe(kettle.maxHp);
    expect(burner).toBeTruthy();
  });

  it('grease speeds pests up, and a burning pest sets the slick alight', () => {
    const sim = make({ terrain: { grease: [[5, 2]] } });
    const ant = spawnEnemy(sim, 'ant', 2, 5.5)!;
    expect(enemySpeed(sim, ant)).toBeCloseTo(ENEMIES.ant.speed * 1.35, 3);
    ant.burn = 3; ant.burnDps = 1;
    const events = collect(sim, 0.1);
    expect(of(events, 'flare')[0]).toMatchObject({ col: 5, lane: 2 });
    expect(sim.cells[2][5].grease).toBe(0);
    expect(sim.cells[2][5].burning).toBeGreaterThan(0);
  });

  it('a Chili lights every slick in its lane', () => {
    const sim = make({ terrain: { grease: [[3, 2], [7, 2], [7, 1]] } });
    put(sim, 'chili', 0, 2);
    const events = collect(sim, 1.2);
    expect(of(events, 'flare').map(e => [e.col, e.lane])).toEqual([[3, 2], [7, 2]]);
    expect(sim.cells[1][7].grease).toBeGreaterThan(0);
  });
});

describe('midnight kitchen sim: pantry (darkness)', () => {
  it('only lit cells take a guard; Burners and lamps make light, growing with tier', () => {
    const sim = make({ terrain: { dark: true, lamps: [[0, 0]] } });
    expect(canPlace(sim, 'pepper', 5, 2)).toEqual({ ok: false, reason: 'dark' });
    expect(sim.cells[0][1].lit).toBe(true);
    expect(sim.cells[2][0].lit).toBe(false);
    sim.cells[2][3].lit = true; // pretend a lamp, to stand the first Burner
    put(sim, 'burner', 3, 2);
    expect(sim.cells[2][5].lit).toBe(true);
    expect(sim.cells[2][6].lit).toBe(false);
    upgrade(sim, 3, 2);
    expect(sim.cells[2][5].lit).toBe(true);
    expect(sim.cells[2][3 + 2].lit && sim.cells[4][3].lit).toBe(true);
  });

  it('shots cannot aim into the dark, close-range guards still can, and a burning pest gives itself away', () => {
    const sim = make({ terrain: { dark: true, lamps: [[0, 2], [2, 2]] } });
    put(sim, 'pepper', 0, 2); put(sim, 'whisk', 2, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 6)!; ant.stun = 99;
    run(sim, 2);
    expect(ant.hidden).toBe(true);
    expect(ant.hp).toBe(ant.maxHp);
    ant.burn = 30; ant.burnDps = 0;
    run(sim, 1.5);
    expect(ant.hidden).toBe(false);
    expect(ant.hp).toBeLessThan(ant.maxHp);
    const close = spawnEnemy(sim, 'ant', 2, 3.3)!; close.stun = 99;
    sim.cells[2][3].lit = false;
    run(sim, 1);
    expect(close.hp).toBeLessThan(close.maxHp);
  });
});

describe('midnight kitchen sim: fridge (frost, cold snaps, spreading mold)', () => {
  it('a guard on frost is chilled to a slower rate unless something warm stands near; pests slow down on frost', () => {
    const sim = make({ terrain: { frost: [[4, 2], [4, 0]] } });
    const cold = put(sim, 'pepper', 4, 2);
    expect(cold.chilled).toBe(true);
    const ant = spawnEnemy(sim, 'ant', 0, 4.5)!;
    expect(enemySpeed(sim, ant)).toBeCloseTo(ENEMIES.ant.speed * 0.8, 3);
    const events = drainEvents(sim);
    expect(of(events, 'chill')[0]).toMatchObject({ on: true });
    put(sim, 'ricecooker', 3, 2);
    expect(cold.chilled).toBe(false);
    expect(sim.cells[2][4].warm).toBe(true);
  });

  it('a chilled guard fires more slowly', () => {
    const shots = (frost: boolean) => {
      const sim = make(frost ? { terrain: { frost: [[1, 2]] } } : {});
      put(sim, 'pepper', 1, 2);
      const tank = spawnEnemy(sim, 'slug', 2, 8)!; tank.stun = 99; tank.hp = tank.maxHp = 99999;
      return of(collect(sim, 12), 'attack').length;
    };
    expect(shots(true)).toBeLessThan(shots(false) * 0.75);
  });

  it('a cold snap freezes only the guards that are not warm', () => {
    const sim = make({ terrain: { frost: [[2, 1], [6, 3]] }, hazards: [{ kind: 'coldSnap', every: 30, first: 2, warn: 1, stun: 4 }] });
    const warm = put(sim, 'pepper', 2, 1); put(sim, 'burner', 1, 1);
    const cold = put(sim, 'pepper', 6, 3);
    const events = collect(sim, 2.2);
    expect(of(events, 'warn')[0]).toMatchObject({ kind: 'coldSnap' });
    expect(of(events, 'defenderStun').map(e => e.id)).toEqual([cold.id]);
    expect(warm.stun).toBe(0);
  });

  it('mold spreads to a neighbouring cell on its timer', () => {
    const sim = make({ terrain: { mold: [[5, 2]] }, hazards: [{ kind: 'moldSpread', every: 3, first: 1 }] });
    const events = collect(sim, 1.2);
    const spread = of(events, 'hazard').filter(e => e.kind === 'moldSpread');
    expect(spread).toHaveLength(1);
    const [[col, lane]] = spread[0].cells;
    expect(Math.abs(col - 5) + Math.abs(lane - 2)).toBe(1);
    expect(sim.cells[lane][col].mold).toBeGreaterThan(0);
  });

  it('Salt fires at mold even with no pest in sight and scrubs the cells it crosses', () => {
    const sim = make({ terrain: { mold: [[4, 2], [6, 2]] } });
    put(sim, 'salt', 1, 2);
    const events = collect(sim, 2);
    expect(of(events, 'cleanse').map(e => e.col).sort()).toEqual([4, 6]);
    expect(sim.cells[2][4].mold).toBe(0);
    expect(canPlace(sim, 'pepper', 6, 2)).toEqual({ ok: true });
  });

  it('Salt melts slugs', () => {
    const sim = make();
    put(sim, 'salt', 1, 2);
    spawnEnemy(sim, 'slug', 2, 6);
    const hit = of(collect(sim, 2), 'hit')[0];
    expect(hit.damage).toBe(14 * 3);
  });
});

describe('midnight kitchen sim: new defenders', () => {
  it('Garlic shoves pests into the better-guarded neighbouring lane, not bosses', () => {
    const sim = make();
    put(sim, 'garlic', 5, 2); put(sim, 'pepper', 1, 3); put(sim, 'pepper', 2, 3);
    const ant = spawnEnemy(sim, 'ant', 2, 6.5)!;
    const events = collect(sim, 2);
    expect(of(events, 'push')[0]).toMatchObject({ enemy: ant.id, fromLane: 2, toLane: 3 });
    expect(ant.lane).toBe(3);
    expect(ant.fromLane).toBe(2);
    const queen = spawnEnemy(sim, 'queen', 2, 6.5)!;
    collect(sim, 6);
    expect(queen.lane).toBe(2);
  });

  it('the Toaster pops two slices that knock pests back', () => {
    const sim = make();
    put(sim, 'toaster', 1, 2);
    const ant = spawnEnemy(sim, 'ant', 2, 5)!; ant.hp = ant.maxHp = 9999; ant.stun = 99;
    const events = collect(sim, 2.5);
    expect(of(events, 'hit').filter(e => e.enemy === ant.id)).toHaveLength(2);
    expect(ant.x).toBeGreaterThan(5.9);
  });

  it('the Rice Cooker heals guards around it', () => {
    const sim = make();
    const dough = put(sim, 'dough', 3, 2); put(sim, 'ricecooker', 2, 2);
    const far = put(sim, 'dough', 6, 2);
    dough.hp = 100; dough.hurtAt = sim.time; far.hp = 100; far.hurtAt = sim.time;
    run(sim, 2.5);
    expect(dough.hp).toBeGreaterThan(100 + 15);
    expect(far.hp).toBeLessThan(120);
  });
});

describe('midnight kitchen sim: new pests', () => {
  it('a moth drifts to the nearest Burner\'s lane, ignores walls and nibbles the Burner', () => {
    const sim = make();
    const burner = put(sim, 'burner', 1, 4); put(sim, 'dough', 5, 3);
    const moth = spawnEnemy(sim, 'moth', 2, 7)!;
    const events = collect(sim, 30);
    expect(moth.lane).toBe(4);
    expect(of(events, 'defenderHurt').some(e => e.id === burner.id && e.by === 'moth')).toBe(true);
    expect(moth.x).toBeLessThan(7);
  });

  it('a Mold Brute bursts into spores when it falls', () => {
    const sim = make();
    const brute = spawnEnemy(sim, 'brute', 2, 6)!;
    brute.hp = 0;
    const events = collect(sim, 0.1);
    expect(of(events, 'enemySpawn').filter(e => e.def === 'spore')).toHaveLength(2);
  });

  it('the Grease Golem\'s armour does not count while it burns', () => {
    const sim = make();
    put(sim, 'pepper', 1, 2);
    const golem = spawnEnemy(sim, 'greasegolem', 2, 5)!;
    const cold = of(collect(sim, 2), 'hit').find(e => e.enemy === golem.id)!;
    expect(cold.damage).toBe(20 - ENEMIES.greasegolem.armor!);
    golem.burn = 30; golem.burnDps = 0;
    const hot = of(collect(sim, 2), 'hit').find(e => e.enemy === golem.id)!;
    expect(hot.damage).toBe(20);
  });
});

describe('midnight kitchen sim: chapter bosses', () => {
  const bossSim = (boss: string, patch: Partial<LevelDef> = {}) => {
    const sim = make({ boss, ...patch });
    const e = spawnEnemy(sim, boss, 2, 7)!;
    return { sim, e };
  };

  it('the Drain King telegraphs a flood, then wets his lane; Burners there stop making Heat', () => {
    const { sim, e } = bossSim('drainking');
    put(sim, 'burner', 0, 2);
    e.attackTimers = [99, 3.2];
    const warned = collect(sim, 0.5);
    const warn = of(warned, 'warn')[0];
    expect(warn).toMatchObject({ kind: 'flood', boss: true });
    expect(warn.cells.every(([, lane]) => lane === 2)).toBe(true);
    const landed = collect(sim, 3);
    expect(of(landed, 'bossAttack').some(a => a.kind === 'flood')).toBe(true);
    expect(sim.cells[2][0].wet).toBeGreaterThan(0);
    expect(sim.cells[1][0].wet).toBe(0);
  });

  it('the Drain King dives: nothing can hit him until he surfaces in another lane', () => {
    const { sim, e } = bossSim('drainking');
    e.hp = e.maxHp * 0.6; e.stun = 0;
    run(sim, 0.05);
    expect(e.phase).toBe(1);
    e.attackTimers = [0.01, 99, 99];
    const events = collect(sim, 0.1);
    expect(of(events, 'bossAttack').some(a => a.kind === 'dive')).toBe(true);
    expect(e.lane).not.toBe(2);
    put(sim, 'pepper', 0, e.lane);
    const hp = e.hp;
    run(sim, 1);
    expect(e.hp).toBe(hp);
    run(sim, 3);
    expect(e.hp).toBeLessThan(hp);
  });

  it('the Grease Golem splatters grease ahead of itself and breathes fire that lights it', () => {
    const { sim, e } = bossSim('greasegolem');
    e.attackTimers = [2.1, 99];
    const events = collect(sim, 2.5);
    const warn = of(events, 'warn')[0];
    expect(warn.kind).toBe('splatter');
    expect(warn.cells).toHaveLength(3);
    for (const [col, lane] of warn.cells) { expect(sim.cells[lane][col].grease).toBeGreaterThan(0); expect(col).toBeLessThan(7); }
    e.hp = e.maxHp * 0.6; run(sim, 0.05);
    const target = put(sim, 'pepper', 5, 2);
    e.x = 6.5; e.attackTimers = [2.3, 99, 99];
    sim.cells[2][4].grease = 20;
    const breath = collect(sim, 2.5);
    expect(of(breath, 'warn')[0]).toMatchObject({ kind: 'breath' });
    expect(of(breath, 'flare').some(f => f.col === 4)).toBe(true);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('the Pantry Baron blows out the light around a Burner for a while', () => {
    const { sim, e } = bossSim('baron', { terrain: { dark: true, lamps: [[0, 0]] } });
    sim.cells[2][1].lit = true;
    put(sim, 'burner', 1, 2);
    expect(sim.cells[2][2].lit).toBe(true);
    e.hp = e.maxHp * 0.6; run(sim, 0.05);
    e.attackTimers = [2.6, 99, 99];
    const events = collect(sim, 3);
    expect(of(events, 'warn')[0]).toMatchObject({ kind: 'lightsOut' });
    expect(of(events, 'hazard').some(h => h.kind === 'lightsOut')).toBe(true);
    expect(sim.cells[2][2].lit).toBe(false);
    expect(canPlace(sim, 'pepper', 2, 2)).toEqual({ ok: false, reason: 'dark' });
    const back = collect(sim, 10);
    expect(of(back, 'hazard').some(h => h.kind === 'lightsOn')).toBe(true);
    expect(sim.cells[2][2].lit).toBe(true);
  });

  it('the Bloom rains mold where it warned and breathes a chill that freezes only cold guards', () => {
    const { sim, e } = bossSim('bloom');
    const cold = put(sim, 'pepper', 5, 2);
    e.attackTimers = [2.6, 99, 99];
    const rain = collect(sim, 3);
    const warn = of(rain, 'warn')[0];
    expect(warn.kind).toBe('sporeRain');
    for (const [col, lane] of warn.cells) expect(sim.cells[lane][col].mold).toBeGreaterThan(0);
    e.attackTimers = [99, 99, 2.6];
    const breath = collect(sim, 3);
    expect(of(breath, 'defenderStun').some(s => s.id === cold.id && s.cause === 'chill')).toBe(true);
  });

  it('finale: the Bloom stops fighting at low health, cannot be hurt, and is remembered by warm guards', () => {
    const { sim, e } = bossSim('bloom');
    sim.nextWave = null; sim.wave = 0; sim.pending = [];
    put(sim, 'pepper', 1, 2);
    e.hp = e.maxHp * 0.14;
    const calm = collect(sim, 0.5);
    expect(of(calm, 'calm')).toHaveLength(1);
    expect(e.calm).toBe(true);
    const hp = e.hp;
    run(sim, 3);
    expect(e.hp).toBe(hp);
    expect(sim.status).toBe('playing');
    const col = Math.floor(e.x) - 1;
    put(sim, 'burner', col, 2); put(sim, 'ricecooker', col + 1, 1);
    const ending = collect(sim, 10);
    expect(of(ending, 'remembered')).toHaveLength(1);
    expect(sim.stats.remembered).toBe(true);
    expect(sim.status).toBe('won');
    expect(sim.stats.slicesLost).toBe(0);
  });

  it('outside the finale (Endless) the Bloom is just a fight', () => {
    const sim = make();
    const e = spawnEnemy(sim, 'bloom', 2, 7)!;
    e.hp = e.maxHp * 0.1;
    run(sim, 0.5);
    expect(e.calm).toBe(false);
  });
});

describe('midnight kitchen sim: phase 2 recipes', () => {
  it('Iced Tea: the Kettle steam slows, Ice chips pierce', () => {
    const sim = make();
    const kettle = put(sim, 'kettle', 2, 2), ice = put(sim, 'ice', 2, 3);
    expect(kettle.recipes).toContain('iced-tea');
    expect(kettle.mods.effects.some(f => f.kind === 'slow')).toBe(true);
    expect(ice.mods.pierce).toBe(1);
  });

  it('Steamed Buns: whoever bites the dough gets scalded', () => {
    const sim = make();
    put(sim, 'kettle', 4, 3); const dough = put(sim, 'dough', 4, 2);
    expect(dough.mods.thorns).toBeGreaterThan(0);
    const ant = spawnEnemy(sim, 'ant', 2, 4.9)!;
    run(sim, 3);
    expect(ant.hp).toBeLessThan(ant.maxHp);
  });

  it('Honey Garlic Glaze: the jar holds more, and grows back if the glaze breaks and re-forms', () => {
    const sim = make();
    const honey = put(sim, 'honey', 5, 2);
    const before = honey.uses;
    put(sim, 'garlic', 5, 3);
    expect(honey.uses).toBe(before + 4);
    remove(sim, 5, 3);
    expect(honey.uses).toBe(before);
  });

  it('Chili Oil: the Chili\'s fire spills into the neighbouring lanes', () => {
    const sim = make();
    put(sim, 'garlic', 1, 2); put(sim, 'chili', 0, 2);
    const events = collect(sim, 1.2);
    expect(of(events, 'laneFire').map(e => e.lane).sort()).toEqual([1, 2, 3]);
  });

  it('Sunday Stew: once a night, everyone is healed, thawed and fed 100 Heat', () => {
    const sim = make();
    const hurt = put(sim, 'dough', 6, 0); hurt.hp = 50; hurt.stun = 5;
    put(sim, 'ricecooker', 2, 2); put(sim, 'onion', 3, 2);
    const heat = sim.heat;
    put(sim, 'kettle', 2, 3);
    expect(sim.links.some(l => l.recipe === 'sunday-stew')).toBe(true);
    expect(hurt.hp).toBe(hurt.maxHp);
    expect(hurt.stun).toBe(0);
    expect(sim.heat).toBe(heat - 150 + 100);
  });
});

describe('midnight kitchen sim: endless extras', () => {
  it('polishing past the top tier is an Endless-only Heat sink that keeps making a guard stronger', () => {
    const campaign = make();
    const top = put(campaign, 'pepper', 1, 2); upgrade(campaign, 1, 2); upgrade(campaign, 1, 2);
    expect(upgradeCost(campaign, top)).toBeNull();
    const sim = make({ polish: true });
    const d = put(sim, 'pepper', 1, 2); upgrade(sim, 1, 2); upgrade(sim, 1, 2);
    const first = upgradeCost(sim, d)!;
    expect(first).toBeGreaterThan(0);
    const damage = d.mods.damage, score = sim.score;
    const events: SimEvent[] = [];
    expect(upgrade(sim, 1, 2)).toEqual({ ok: true });
    events.push(...drainEvents(sim));
    expect(d.tier).toBe(2);
    expect(d.polish).toBe(1);
    expect(d.mods.damage).toBeGreaterThan(damage);
    expect(sim.score).toBeGreaterThan(score);
    expect(of(events, 'polish')[0]).toMatchObject({ polish: 1 });
    expect(upgradeCost(sim, d)!).toBeGreaterThan(first);
  });

  it('a wave can swap the board modifier, announcing it with a bark', () => {
    const sim = make({
      waves: [{ after: 1, spawns: [] }, { after: 1, spawns: [], modifier: { id: 'deep-freeze', name: { en: 'Deep Freeze', zh: '深度冷冻' }, desc: { en: 'Brr.', zh: '冷。' }, terrain: { frost: [[3, 2]] } } }, { after: 99, spawns: [] }]
    });
    const events = collect(sim, 2.5);
    expect(of(events, 'modifier')[0]).toMatchObject({ id: 'deep-freeze' });
    expect(of(events, 'bark').some(b => b.line.en.includes('Deep Freeze'))).toBe(true);
    expect(sim.cells[2][3].frost).toBe(true);
    expect(sim.board.frost).toBe(true);
  });

  it('an Endless mini-boss attacks at half pace and its health follows bossScale', () => {
    const sim = make({ waves: [{ after: 0.1, spawns: [[0, 'queen', 2]], hpMul: 2, bossScale: 0.25 }, { after: 999, spawns: [] }] });
    run(sim, 0.3);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    expect(queen.maxHp).toBe(Math.round(ENEMIES.queen.hp * 0.5));
    const t0 = queen.attackTimers[0];
    run(sim, 1);
    expect(t0 - queen.attackTimers[0]).toBeCloseTo(0.5, 1);
  });
});

describe('midnight kitchen sim: boss fairness (mercy, aimed throws, court health)', () => {
  const queenNight = (wave: Partial<WaveDef> = {}): Partial<LevelDef> => ({ boss: 'queen', waves: [{ after: 0.1, spawns: [[0, 'queen', 2]], ...wave }, { after: 9999, spawns: [] }] });
  /** Pests called by each summon, in order. */
  const courtSizes = (events: SimEvent[]) => {
    const sizes: number[] = [];
    let open = false;
    for (const event of events) {
      if (event.type === 'bossAttack' && event.kind === 'summon') { sizes.push(0); open = true; }
      else if (open && event.type === 'enemySpawn') sizes[sizes.length - 1]++;
      else open = false;
    }
    return sizes;
  };
  const loseSliceNow = (sim: Sim) => { spawnEnemy(sim, 'ant', 0, CAKE_X + 0.02); run(sim, 0.2); };

  it('every lost slice shrinks the boss\'s court, slows its throws and buys a breather', () => {
    const sim = make(queenNight());
    const before = courtSizes(collect(sim, 12));
    expect(before[0]).toBe(2);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    loseSliceNow(sim);
    expect(sim.slices).toBe(2);
    const summon = ENEMIES.queen.boss!.phases[0].attacks.findIndex(a => a.kind === 'summon');
    // The breather: the next summon is at least a full period away.
    expect(queen.attackTimers[summon]).toBeGreaterThanOrEqual(ENEMIES.queen.boss!.phases[0].attacks[summon].every - 0.3);
    const after = courtSizes(collect(sim, 30));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(n => n === 1)).toBe(true);
    // ...and slower: fewer calls in the same 30 s than the full pace would make.
    expect(after.length).toBeLessThan(3);
  });

  it('no mercy outside the boss\'s own night (an Endless mini-boss keeps its full court)', () => {
    const sim = make({ waves: [{ after: 0.1, spawns: [[0, 'queen', 2]] }, { after: 9999, spawns: [] }] });
    run(sim, 1);
    loseSliceNow(sim);
    const sizes = courtSizes(collect(sim, 30));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every(n => n === 2)).toBe(true);
  });

  it('a sugar cube is aimed in plain sight first, lands on that cell, and spares the Burners while a guard stands', () => {
    const sim = make(queenNight());
    put(sim, 'burner', 0, 0); put(sim, 'burner', 0, 4);
    const guard = put(sim, 'dough', 3, 1);
    const events = collect(sim, 16);
    const warned = of(events, 'warn').filter(w => w.kind === 'toss');
    const thrown = of(events, 'bossAttack').filter(a => a.kind === 'toss');
    expect(warned.length).toBeGreaterThan(0);
    expect(thrown.length).toBeGreaterThan(0);
    expect(warned[0].cells).toEqual([[3, 1]]);
    expect(warned[0].seconds).toBeGreaterThan(1);
    expect(thrown[0]).toMatchObject({ toCol: 3, toLane: 1 });
    expect(of(events, 'defenderStun').every(s => s.id === guard.id)).toBe(true);
  });

  it('an aimed cube hits nobody if the guard has moved off the marked cell', () => {
    const sim = make(queenNight());
    put(sim, 'dough', 3, 1);
    let warned = false;
    for (let i = 0; i < 16 / STEP && !warned; i++) { step(sim); warned = drainEvents(sim).some(e => e.type === 'warn' && e.kind === 'toss'); }
    expect(warned).toBe(true);
    remove(sim, 3, 1);
    put(sim, 'dough', 4, 1);
    const events = collect(sim, 3);
    expect(of(events, 'bossAttack').some(a => a.kind === 'toss')).toBe(true);
    expect(of(events, 'defenderStun')).toHaveLength(0);
  });

  it('the court shares the night\'s health multiplier, not the boss\'s own scale', () => {
    const sim = make(queenNight({ hpMul: 0.5, bossScale: 0.4 }));
    run(sim, 10);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    expect(queen.maxHp).toBe(Math.round(ENEMIES.queen.hp * 0.2));
    const ants = sim.enemies.filter(e => e.def === 'ant');
    expect(ants.length).toBeGreaterThan(0);
    for (const ant of ants) expect(ant.maxHp).toBe(Math.round(ENEMIES.ant.hp * 0.5));
  });

  it('a new phase opens with a beat to read it, not an instant volley', () => {
    const sim = make(queenNight());
    run(sim, 1);
    const queen = sim.enemies.find(e => e.def === 'queen')!;
    queen.hp = queen.maxHp * 0.6;
    step(sim);
    const attacks = ENEMIES.queen.boss!.phases[1].attacks;
    attacks.forEach((attack, i) => expect(queen.attackTimers[i]).toBeGreaterThan(attack.every * 0.75));
  });
});

describe('midnight kitchen sim: cake scare', () => {
  it('a falling slice scatters the pests bunched behind the eater, so they cost one slice at a time', () => {
    const sim = make();
    const a = spawnEnemy(sim, 'ant', 2, -0.3)!, b = spawnEnemy(sim, 'ant', 2, 0.2)!, c = spawnEnemy(sim, 'ant', 2, 0.6)!;
    const events = collect(sim, 0.4);
    expect(of(events, 'slice')).toHaveLength(1);
    expect(a.gone).toBe(true);
    expect(b.x).toBeGreaterThanOrEqual(1.1);
    expect(c.x).toBeGreaterThanOrEqual(1.1);
  });
});
