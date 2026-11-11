import { CONTENT } from './data';
import { cardOf, cellFree, createSim, defOf, enemyDef, mulberry32, place, remove, starFlags, step, STEP, upgrade, upgradeCost } from './sim';
import type { Content, Defender, DefenderDef, Enemy, LevelDef, MetaState, Sim } from './types';

/**
 * Headless autoplay bot: a plain heuristic player used to measure difficulty (win rate, slices lost, time) from
 * tests and scripts. It only uses the public commands, reads the same state a player can see, and thinks once every
 * `reaction` seconds, so a slower reaction models a newer player.
 *
 *   measureLevel(LEVELS['c1-3'], 20, { loadout: botLoadout(LEVELS['c1-3'], ownedAt('c1-3')) })
 *   runBot(ENDLESS_LEVEL, { seed: 7, maxTime: 900 }).wave
 *
 * It knows the chapter gimmicks the way a player who read the barks would: Burners on hobs and dry tiles, light
 * before building in the dark, Rice Cookers by chilled guards, Salt for slugs and mold, and warmth for the Bloom.
 */
export type BotOptions = {
  seed?: number;
  /** Seconds between decisions. 0.5 is a competent player, 1.5 a distracted one. */
  reaction?: number;
  /** Cards to bring; defaults to every defender the content table has (levels with a fixed hand ignore it). */
  loadout?: string[];
  meta?: MetaState;
  content?: Content;
  /** Give up after this many simulated seconds (Endless needs a cap). */
  maxTime?: number;
  /** Cap on Burners: 3 models a player who has not learned to invest in Heat yet. */
  maxGenerators?: number;
  /** Chance (0..1) that a decision is skipped, plus timing jitter: models hesitation and gives seeds real variety. */
  sloppy?: number;
  /** Whether the bot spends Heat on tier upgrades. */
  upgrades?: boolean;
  /** Whether it plans recipes on purpose (adjacency-aware placement). */
  recipes?: boolean;
  /** Whether it plays for the level's bonus star (see `botAct`). */
  bonus?: boolean;
};
export type BotResult = {
  won: boolean; lost: boolean; time: number; slicesLost: number; slicesLeft: number; kills: number; wave: number; score: number;
  heatLeft: number; defenders: number; stars: number; bonus: boolean; recipes: string[]; remembered: boolean; defendersLost: number;
};

type Candidate = { kind: 'place' | 'upgrade' | 'remove'; priority: number; cost: number; ready: boolean; act: () => void };
const RANGED = new Set(['shooter', 'slow', 'lobber', 'cone']);

/** Columns a role likes, nearest the cake first. */
const COLUMNS: Record<string, number[]> = {
  generator: [0, 1], shooter: [2, 3, 1, 4], slow: [3, 2, 4, 1], lobber: [3, 2, 4, 1], cone: [4, 3, 5], melee: [4, 5, 3], stun: [4, 3, 5], wall: [5, 6, 4],
  trap: [5, 4, 6], push: [6, 5, 7], support: [1, 2, 3]
};
const TOUGH = (sim: Sim, e: Enemy) => (enemyDef(sim, e).armor ?? 0) > 0 || enemyDef(sim, e).hp >= 400;

export function botCandidates(sim: Sim, maxGenerators = 99, recipes = true): Candidate[] {
  const out: Candidate[] = [];
  const hand = sim.cards.map(card => sim.content.defenders[card.def]);
  const has = (id: string) => hand.find(def => def.id === id);
  const ready = (def: DefenderDef) => (cardOf(sim, def.id)?.cooldown ?? 1) <= 0;
  const cheapest = (roles: string[], filter: (def: DefenderDef) => boolean = () => true) => hand.filter(def => roles.includes(def.role) && filter(def)).sort((a, b) => a.cost - b.cost)[0];
  const allRound = (def: DefenderDef) => def.id !== 'salt';
  /** Cells a card may use, skipping hobs for anything that would get singed. */
  const fits = (def: DefenderDef, col: number, lane: number) => cellFree(sim, col, lane, def.id) && (def.heatproof || !sim.cells[lane][col].hob);
  const freeCol = (def: DefenderDef, lane: number, cols: number[]) => cols.find(col => fits(def, col, lane));
  const put = (def: DefenderDef | undefined, lane: number, cols: number[], priority: number) => {
    if (!def) return false;
    const col = freeCol(def, lane, cols);
    if (col === undefined) return false;
    out.push({ kind: 'place', priority, cost: def.cost, ready: ready(def), act: () => { place(sim, def.id, col, lane); } });
    return true;
  };
  const inLane = (lane: number) => sim.defenders.filter(d => d.lane === lane);
  const hitsFlying = (d: Defender) => { const attack = defOf(sim, d).tiers[d.tier].attack; return (attack.kind === 'shoot' && attack.hitsFlying !== false) || attack.kind === 'cone'; };
  const cols = sim.level.cols;

  const generators = sim.defenders.filter(d => defOf(sim, d).role === 'generator');
  const targetGenerators = Math.min(maxGenerators, sim.activeLanes.length + 2, 3 + Math.floor(sim.time / 14));
  // Settled once the economy is built, or when it cannot grow (no dry, free spot) and Heat is piling up anyway.
  const genDef = cheapest(['generator']);
  const genRoom = !!genDef && sim.activeLanes.some(lane => [0, 1, 2].some(col => fits(genDef, col, lane)));
  const settled = generators.length >= targetGenerators - 1 || !genRoom || sim.heat > 400;
  let undefended = false;

  // ---- The finale: warm the Bloom once it stops fighting. Nothing matters more.
  const calm = sim.enemies.find(e => e.calm);
  if (calm) {
    const warmers = hand.filter(def => (def.warm ?? 0) > 0).sort((a, b) => (b.role === 'support' ? 1 : 0) - (a.role === 'support' ? 1 : 0));
    const spots: [number, number][] = [];
    for (const lane of sim.activeLanes) for (let col = 0; col < cols; col++) if (Math.hypot(col + 0.5 - calm.x, lane - calm.lane) <= 2.2) spots.push([col, lane]);
    spots.sort((a, b) => Math.hypot(a[0] + 0.5 - calm.x, a[1] - calm.lane) - Math.hypot(b[0] + 0.5 - calm.x, b[1] - calm.lane));
    for (const def of warmers) {
      const spot = spots.find(([col, lane]) => fits(def, col, lane));
      if (spot) out.push({ kind: 'place', priority: 300, cost: def.cost, ready: ready(def), act: () => { place(sim, def.id, spot[0], spot[1]); } });
    }
    // No room next to it: clear a non-warm guard out of the way.
    if (!spots.some(([col, lane]) => cellFree(sim, col, lane))) {
      const blocker = sim.defenders.find(d => !(defOf(sim, d).warm ?? 0) && Math.hypot(d.col + 0.5 - calm.x, d.lane - calm.lane) <= 1.6);
      if (blocker) out.push({ kind: 'remove', priority: 290, cost: 0, ready: true, act: () => { remove(sim, blocker.col, blocker.lane); } });
    }
  }

  for (const lane of sim.activeLanes) {
    const enemies = sim.enemies.filter(e => e.lane === lane && e.hp > 0 && e.state !== 'flee' && !e.calm);
    const mine = inLane(lane);
    const ranged = mine.filter(d => RANGED.has(defOf(sim, d).role));
    const minX = enemies.reduce((min, e) => Math.min(min, e.x), 99);
    const threat = enemies.reduce((sum, e) => sum + (e.hp + e.shield) / 100, 0);
    const urgency = enemies.length ? Math.max(0, cols + 1 - minX) : 0;
    const flying = enemies.some(e => enemyDef(sim, e).flying), shields = enemies.some(e => e.shield > 0);
    const tough = enemies.some(e => TOUGH(sim, e));
    const salty = enemies.some(e => (enemyDef(sim, e).weak?.salt ?? 1) > 1.5) || sim.cells[lane].some((c, col) => col >= 1 && c.mold > 0);
    const boss = enemies.some(e => !!enemyDef(sim, e).boss);
    const wants = !enemies.length ? (sim.time > 45 ? 1 : 0) : boss ? 5 : Math.min(3, 1 + (threat > 3.5 ? 1 : 0) + (threat > 8 ? 1 : 0));

    if (ranged.length < wants || (salty && has('salt') && !mine.some(d => d.def === 'salt') && ranged.length < (boss ? 5 : 3))) {
      let pick: DefenderDef | undefined;
      // Salt is a specialist (slugs and mold): an all-round answer is a real shooter, so it never stands in for one.
      if (salty && has('salt') && !mine.some(d => d.def === 'salt')) pick = has('salt');
      else if (flying && !mine.some(hitsFlying)) pick = cheapest(['shooter', 'slow'], allRound);
      else if (shields && !mine.some(d => defOf(sim, d).role === 'lobber')) pick = cheapest(['lobber']) ?? cheapest(['shooter'], allRound);
      else if (tough && !mine.some(d => defOf(sim, d).role === 'slow') && ranged.length > 0) pick = cheapest(['slow']) ?? cheapest(['shooter'], allRound);
      else if (enemies.length >= 3 && has('kettle') && !mine.some(d => d.def === 'kettle') && ranged.length > 0) pick = has('kettle');
      else if (tough && has('toaster') && ranged.length > 0 && !mine.some(d => d.def === 'toaster')) pick = has('toaster');
      pick ??= cheapest(['shooter'], allRound) ?? cheapest(['shooter', 'slow', 'lobber', 'cone']);
      // Guard a lane at the last responsible moment: until the enemy is past the far third, Burners come first.
      const pressing = enemies.length > 0 && (minX < 6.8 || flying);
      // An open lane takes whatever shooter can go down now rather than waiting, empty, to afford the specialist.
      if (pick && pressing && ranged.length === 0 && (pick.cost > sim.heat || !ready(pick))) pick = cheapest(['shooter'], def => allRound(def) && def.cost <= sim.heat && ready(def)) ?? pick;
      if (pick) {
        const base = enemies.length ? (ranged.length === 0 ? (pressing ? 112 : 86) : 78) + urgency * 3 + threat : 50;
        if (pressing && ranged.length === 0) undefended = true;
        let colsFor = COLUMNS[pick.role] ?? COLUMNS.shooter;
        // Cook on purpose: a Pepper Mill next to a Burner, an Ice Cube next to a Pepper Mill, a Kettle by the Ice.
        if (recipes) {
          const partner = pick.id === 'pepper' ? 'burner' : pick.id === 'ice' ? 'pepper' : pick.id === 'kettle' ? 'ice' : pick.id === 'egg' ? 'dough' : null;
          const near = partner ? mine.find(d => d.def === partner) : undefined;
          if (near) colsFor = [near.col + 1, near.col - 1, ...colsFor];
        }
        if (!put(pick, lane, colsFor, base - ranged.length * 12) && sim.board.dark) {
          // Nowhere lit to stand: light the lane first.
          const burner = cheapest(['generator']);
          if (generators.length < maxGenerators + 2) put(burner, lane, [1, 2, 0, 3], base - 2);
        }
      }
    }
    const ground = enemies.filter(e => !enemyDef(sim, e).flying);
    if (ground.length) {
      const wall = mine.find(d => defOf(sim, d).role === 'wall');
      const groundMin = ground.reduce((min, e) => Math.min(min, e.x), 99);
      if (!wall && groundMin > 4.3 && (threat > 1.5 || tough)) {
        const col = Math.max(4, Math.min(6, Math.floor(groundMin) - 1));
        put(cheapest(['wall']), lane, [col, col - 1, col + 1].filter(c => c >= 3 && c < cols), 84 + threat * 2);
      }
      if (wall && !mine.some(d => defOf(sim, d).role === 'melee') && threat > 3) put(cheapest(['melee']), lane, [wall.col - 1], 62 + threat);
      if (threat > 5 && !sim.defenders.some(d => defOf(sim, d).role === 'stun' && Math.abs(d.lane - lane) <= 1)) put(cheapest(['stun']), lane, wall ? [wall.col - 1, wall.col - 2] : COLUMNS.stun, 58 + threat);
      const burrowers = ground.some(e => enemyDef(sim, e).burrow && e.burrowsLeft > 0) || (threat > 4 && tough);
      if (burrowers && !mine.some(d => defOf(sim, d).role === 'trap')) put(cheapest(['trap']), lane, wall ? [wall.col - 1, wall.col - 2] : COLUMNS.trap, 66 + threat);
      // Garlic in a busy lane, as long as a neighbour is ready to take the overflow.
      const neighbourRanged = (other: number) => inLane(other).filter(d => RANGED.has(defOf(sim, d).role)).length;
      const neighbourReady = sim.activeLanes.some(other => Math.abs(other - lane) === 1 && neighbourRanged(other) >= Math.max(1, ranged.length));
      if (threat > 2.5 && neighbourReady && !mine.some(d => defOf(sim, d).role === 'push')) put(cheapest(['push']), lane, COLUMNS.push, 70 + threat);
    }
    const near = enemies.filter(e => e.x < 6.5).reduce((sum, e) => sum + (e.hp + e.shield) / 100, 0);
    if (enemies.length && (near > 5.5 || (minX < 2 && threat > 1.2))) {
      put(cheapest(['oneshot']), lane, Array.from({ length: cols }, (_, col) => col), 150 + near);
    }
    // Upgrades in lanes under pressure: strongest effect per Heat is usually the shooter already standing there.
    for (const d of mine) {
      const cost = upgradeCost(sim, d);
      if (cost === null || defOf(sim, d).role === 'generator' || !settled || sim.heat < cost + 50) continue;
      const bitten = sim.time - d.hurtAt < 1.5 && d.hp < d.maxHp * 0.5;
      const polishing = !defOf(sim, d).tiers[d.tier + 1];
      out.push({ kind: 'upgrade', priority: (polishing ? 12 : enemies.length ? 44 + threat * 2 : 20) + (bitten ? 30 : 0) - d.tier * 6, cost, ready: true, act: () => { upgrade(sim, d.col, d.lane); } });
    }
  }

  // ---- Frost: keep guards warm.
  if (sim.board.frost) {
    const cooker = has('ricecooker');
    const chilled = sim.defenders.filter(d => d.chilled);
    if (cooker && chilled.length >= 2) {
      // The spot that warms the most chilled guards.
      let best: [number, number] | null = null, bestCount = 1;
      for (const lane of sim.activeLanes) for (let col = 0; col < cols - 2; col++) {
        if (!fits(cooker, col, lane)) continue;
        const count = chilled.filter(d => Math.hypot(d.col - col, d.lane - lane) <= (cooker.warm ?? 1.5) + 0.01).length;
        if (count > bestCount || (count === bestCount && best && col < best[0])) { best = [col, lane]; bestCount = count; }
      }
      const spot = best;
      if (spot) out.push({ kind: 'place', priority: 70 + bestCount * 6, cost: cooker.cost, ready: ready(cooker), act: () => { place(sim, cooker.id, spot[0], spot[1]); } });
    }
  }

  if (generators.length < targetGenerators) {
    const def = cheapest(['generator']);
    // Hobs double a Burner's Heat; in the dark, Burners a little forward light where guards will stand.
    const hob = def && sim.activeLanes.flatMap(lane => Array.from({ length: cols }, (_, col) => [col, lane] as [number, number])).find(([col, lane]) => sim.cells[lane][col].hob && col <= 2 && fits(def, col, lane));
    if (def && hob) out.push({ kind: 'place', priority: undefended ? 89 : 97, cost: def.cost, ready: ready(def), act: () => { place(sim, def.id, hob[0], hob[1]); } });
    else {
      const prefer = sim.board.dark ? [1, 2, 0, 3] : sim.board.frost ? [1, 0, 2] : COLUMNS.generator;
      const lanes = [...sim.activeLanes].sort((a, b) => inLane(a).filter(d => defOf(sim, d).role === 'generator').length - inLane(b).filter(d => defOf(sim, d).role === 'generator').length);
      let placed = false;
      for (const lane of lanes) if (put(def, lane, prefer, undefended ? 88 : 96 - generators.length)) { placed = true; break; }
      // The back columns are full or wet: a Burner one step forward still beats a starved kitchen.
      if (!placed && generators.length < 6) for (const lane of lanes) if (put(def, lane, [2, 3], undefended ? 80 : 90 - generators.length)) break;
    }
  }
  if (sim.time > 70 || sim.board.dark) for (const d of generators) {
    const cost = upgradeCost(sim, d);
    if (cost !== null) out.push({ kind: 'upgrade', priority: (sim.board.dark ? 46 : 36) - d.tier * 4 - (d.polish ?? 0) * 10, cost, ready: true, act: () => { upgrade(sim, d.col, d.lane); } });
  }
  return out;
}

/**
 * One decision: do the best thing that is ready and affordable, or save up for it. Returns true when it acted.
 * `chase` plays for the level's bonus star where that changes the choices: under a guard cap it stops placing and
 * upgrades instead, and on a Heat-bank goal it keeps the bank once the last wave is out.
 */
export function botAct(sim: Sim, allowUpgrades = true, maxGenerators = 99, recipes = true, chase = false): boolean {
  const goal = sim.level.bonus;
  const capped = chase && goal.kind === 'maxDefenders' && sim.defenders.length >= goal.n;
  const reserve = chase && goal.kind === 'heatBank' && sim.wave >= sim.totalWaves - 1 ? goal.n : 0;
  const candidates = botCandidates(sim, chase && goal.kind === 'maxDefenders' ? Math.min(maxGenerators, Math.max(3, Math.floor(goal.n / 3))) : maxGenerators, recipes)
    .filter(c => c.ready).sort((a, b) => b.priority - a.priority);
  for (const candidate of candidates) {
    if (!allowUpgrades && candidate.kind === 'upgrade') continue;
    if (capped && candidate.kind === 'place') continue;
    // A real emergency (an open lane, a one-shot) may dip into the bank.
    const budget = candidate.priority >= 110 ? sim.heat : sim.heat - reserve;
    if (candidate.cost <= budget) { candidate.act(); return true; }
    // Save for anything important; only dip below it for trivial extras when rich.
    if (candidate.priority >= 40) return false;
  }
  return false;
}

/** What a sensible player would bring: the level's new cards first, then whatever answers its enemies and board. */
export function botLoadout(level: LevelDef, owned: string[], content: Content = CONTENT): string[] {
  if (level.cards) return [...level.cards];
  const foes = new Set(level.waves.flatMap(wave => wave.spawns.map(row => row[1])));
  const t = level.terrain ?? {};
  const want: string[] = [...(level.introduces?.defenders ?? []), 'burner', 'pepper'];
  const add = (...ids: string[]) => { for (const id of ids) want.push(id); };
  // Specific answers first, then the all-rounders.
  if (t.frost || level.boss === 'bloom') add('ricecooker');
  if (foes.has('slug') || foes.has('spore') || foes.has('brute') || t.mold) add('salt');
  if (foes.has('shieldant')) add('egg');
  if (foes.has('weevil')) add('honey');
  if (foes.has('moth')) add('toaster');
  if (level.boss === 'bloom') add('onion', 'kettle');
  add('dough');
  if (foes.has('roach') || foes.has('slug')) add('ice');
  add('chili');
  if (t.dark) add('whisk', 'onion', 'kettle');
  add('kettle', 'onion', 'egg', 'ice', 'whisk', 'toaster', 'garlic', 'honey', 'salt', 'ricecooker');
  const hand: string[] = [];
  for (const id of want) if (owned.includes(id) && content.defenders[id] && !hand.includes(id) && hand.length < level.slots) hand.push(id);
  return hand;
}

export function runBot(level: LevelDef, options: BotOptions = {}): BotResult {
  const content = options.content ?? CONTENT;
  const sim = createSim(level, {
    random: mulberry32(options.seed ?? 1), content, meta: options.meta,
    loadout: options.loadout ?? Object.keys(content.defenders)
  });
  const reaction = options.reaction ?? 0.6, maxTime = options.maxTime ?? 900;
  // The bot's own dice are separate from the sim's stream, so the same level seed can be played by different hands.
  const dice = mulberry32((options.seed ?? 1) * 7919 + 13), sloppy = options.sloppy ?? 0.08;
  let think = 1.5;
  while (sim.status === 'playing' && sim.time < maxTime) {
    step(sim);
    sim.events.length = 0;
    think -= STEP;
    if (think <= 0) { think = reaction * (0.6 + dice() * 0.8); if (dice() >= sloppy) botAct(sim, options.upgrades !== false, options.maxGenerators, options.recipes !== false, options.bonus === true); }
  }
  const stars = starFlags(sim);
  return {
    won: sim.status === 'won', lost: sim.status === 'lost', time: sim.time, slicesLost: sim.stats.slicesLost, slicesLeft: sim.slices, kills: sim.stats.kills,
    wave: sim.wave + 1, score: sim.score, heatLeft: sim.heat, defenders: sim.defenders.length,
    stars: Number(stars.win) + Number(stars.flawless) + Number(stars.bonus), bonus: stars.bonus, recipes: sim.stats.recipes,
    remembered: !!sim.stats.remembered, defendersLost: sim.stats.defendersLost
  };
}

export type LevelReport = { level: string; runs: number; winRate: number; flawlessRate: number; avgSlicesLost: number; avgTime: number; avgStars: number; bonusRate: number; results: BotResult[] };

/** Hands to measure a level with: an efficient player, an average one, one who has not learned Burners, and a star chaser. */
export const BOT_PROFILES: Record<'savvy' | 'casual' | 'naive' | 'planner', BotOptions> = {
  savvy: { reaction: 0.5, sloppy: 0.05 },
  /** A savvy player going for all three stars. */
  planner: { reaction: 0.5, sloppy: 0.05, bonus: true },
  casual: { reaction: 1, sloppy: 0.15, maxGenerators: 5, recipes: false },
  naive: { reaction: 1.5, sloppy: 0.25, maxGenerators: 3, upgrades: false, recipes: false }
};

/** Plays `runs` seeded games and summarises them. Seeds are `seed0, seed0 + 1, ...` so reports are reproducible. */
export function measureLevel(level: LevelDef, runs = 10, options: BotOptions = {}): LevelReport {
  const results: BotResult[] = [];
  for (let i = 0; i < runs; i++) results.push(runBot(level, { ...options, seed: (options.seed ?? 1) + i }));
  const mean = (pick: (r: BotResult) => number) => results.reduce((sum, r) => sum + pick(r), 0) / Math.max(1, runs);
  return {
    level: level.id, runs, winRate: mean(r => Number(r.won)), flawlessRate: mean(r => Number(r.won && r.slicesLost === 0)),
    avgSlicesLost: mean(r => r.slicesLost), avgTime: mean(r => r.time), avgStars: mean(r => r.stars), bonusRate: mean(r => Number(r.bonus)), results
  };
}
