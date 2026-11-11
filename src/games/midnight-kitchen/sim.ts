import { CONTENT } from './data';
import {
  DEFAULT_MODS,
  type ActionResult, type AttackDef, type BonusGoal, type BossAttack, type Cell, type CellList, type Content, type Defender, type DefenderDef, type Enemy, type EnemyDef,
  type HazardDef, type LevelDef, type MetaState, type ModPatch, type Mods, type Projectile, type RecipeLink, type Sim, type SimEvent, type SimOptions,
  type StatusApply, type TerrainDef, type TierDef, type WaveDef, type WarnKind
} from './types';

/**
 * Midnight Kitchen rules. Headless and deterministic: no DOM, no timers, no Math.random. Drive it with the three
 * commands (`place`, `upgrade`, `remove`) and `step`; read state directly and drain `sim.events` to react.
 * The same code runs in the browser, in unit tests and under the balancing bot (`bot.ts`).
 *
 * Board gimmicks (chapters 2-5) are plain cell fields set from `level.terrain` and changed by `level.hazards` and boss
 * attacks; see the contract block at the top of `types.ts`.
 */
export const STEP = 1 / 60;
/** Enemies enter this far right of the last column. */
export const SPAWN_OFFSET = 0.6;
/** An enemy this far left of column 0 has reached the cake. */
export const CAKE_X = -0.35;
/** When a slice is eaten, other pests in that lane closer than this are scattered back to it. */
export const CAKE_SCARE = 3;
export const TELEGRAPH_SECONDS = 5;
const EARLY_ADVANCE = 3;
const MOLD_DPS = 5;
const BASE_REFUND = 0.5;
/** Seconds that mean "for the whole night" on a cell timer. */
export const PERMANENT = 1e9;
export const LAMP_RADIUS = 1.6;
const HOB_BURN = { kind: 'burn' as const, duration: 1.2, power: 14 };
const HOB_SINGE_DPS = 7;
const FIRE_SINGE_DPS = 10;
const GREASE_FIRE = 5;
const GREASE_SPEED = 1.35;
const FROST_SPEED = 0.8;
const PUSH_IMMUNITY = 3;
const MOLD_SPREAD_SECONDS = 24;
/** A chilled guard (on frost, not warm) acts at this fraction of its rate. */
export const CHILL_RATE = 0.6;
/** Boss attack timers when a new phase starts, as a fraction of each attack's period. */
const PHASE_OPENING = 0.8;
/** Boss mercy (see `mercyOf`): slices counted, extra period per slice for the attacks in `MERCIFUL`, breather length. */
const MERCY_MAX = 2;
const MERCY_PACE = 0.35;
const MERCIFUL = new Set<BossAttack['kind']>(['summon', 'toss']);
const BREATHER = 1;

/** Small seeded generator for tests, the bot and daily seeds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function applyPatch(mods: Mods, patch: ModPatch, times = 1): void {
  for (let i = 0; i < times; i++) {
    mods.damage *= patch.damage ?? 1; mods.rate *= patch.rate ?? 1; mods.splash *= patch.splash ?? 1; mods.hp *= patch.hp ?? 1;
    mods.regen *= patch.regen ?? 1; mods.gen *= patch.gen ?? 1; mods.range += patch.range ?? 0;
    if (patch.pierce) mods.pierce = (mods.pierce ?? 0) + patch.pierce;
    if (patch.knockback) mods.knockback = (mods.knockback ?? 0) + patch.knockback;
    if (patch.uses) mods.uses = (mods.uses ?? 0) + patch.uses;
    if (patch.thorns) mods.thorns = (mods.thorns ?? 0) + patch.thorns;
    if (patch.spread) mods.spread = (mods.spread ?? 0) + patch.spread;
    if (patch.effects) mods.effects.push(...patch.effects);
  }
}
const cloneMods = (mods: Mods): Mods => ({ ...mods, effects: [...mods.effects] });

/** Folds the permanent upgrades a player owns into per-defender modifiers and kitchen-wide bonuses. */
export function metaBonuses(content: Content, meta: MetaState | undefined): { mods: Record<string, Mods>; startHeat: number; slices: number; refund: number; recipeHeat: number } {
  const mods: Record<string, Mods> = {};
  let startHeat = 0, slices = 0, refund = 0, recipeHeat = 0;
  for (const id of Object.keys(content.defenders)) mods[id] = DEFAULT_MODS();
  for (const upgrade of content.meta) {
    const level = Math.max(0, Math.min(upgrade.costs.length, Math.floor(meta?.upgrades[upgrade.id] ?? 0)));
    if (!level) continue;
    if (upgrade.defender && upgrade.perLevel && mods[upgrade.defender]) applyPatch(mods[upgrade.defender], upgrade.perLevel, level);
    if (!upgrade.defender && upgrade.perLevel) for (const id of Object.keys(mods)) applyPatch(mods[id], upgrade.perLevel, level);
    startHeat += (upgrade.startHeat ?? 0) * level; slices += (upgrade.slices ?? 0) * level; refund += (upgrade.refund ?? 0) * level; recipeHeat += (upgrade.recipeHeat ?? 0) * level;
  }
  return { mods, startHeat, slices, refund, recipeHeat };
}

function waveAt(sim: Sim, index: number): WaveDef | null {
  if (index < sim.level.waves.length) return sim.level.waves[index];
  return sim.level.waveGen ? sim.level.waveGen(index, sim.random) : null;
}

// ---------------------------------------------------------------- terrain

const freshCell = (blocked: boolean): Cell => ({
  blocked, mold: 0, slime: 0, slimeBoost: 1, wet: 0, hob: false, hobLit: 0, grease: 0, burning: 0, dark: false, lit: true, lamp: false, snuff: 0, frost: false, warm: false
});

/** Clears every lasting gimmick (keeps short-lived mold, slime and fires) so a new terrain can be laid down. */
function resetTerrain(sim: Sim): void {
  for (const row of sim.cells) for (const cell of row) {
    if (cell.wet >= PERMANENT / 2) cell.wet = 0;
    if (cell.grease >= PERMANENT / 2) cell.grease = 0;
    cell.hob = false; cell.hobLit = 0; cell.dark = false; cell.lit = true; cell.lamp = false; cell.frost = false; cell.warm = false;
  }
}

function applyTerrain(sim: Sim, terrain: TerrainDef | undefined): void {
  if (!terrain) return;
  const each = (list: CellList | undefined, fn: (cell: Cell) => void) => { for (const [col, lane] of list ?? []) { const cell = sim.cells[lane]?.[col]; if (cell && !cell.blocked) fn(cell); } };
  each(terrain.wet, cell => { cell.wet = PERMANENT; });
  each(terrain.hobs, cell => { cell.hob = true; });
  each(terrain.grease, cell => { cell.grease = PERMANENT; });
  each(terrain.frost, cell => { cell.frost = true; });
  each(terrain.mold, cell => { cell.mold = PERMANENT; });
  each(terrain.lamps, cell => { cell.lamp = true; });
  if (terrain.dark) for (const row of sim.cells) for (const cell of row) cell.dark = true;
}

function refreshBoard(sim: Sim): void {
  let dark = false, frost = false;
  for (const row of sim.cells) for (const cell of row) { if (cell.dark) dark = true; if (cell.frost) frost = true; }
  sim.board = { dark, frost };
  computeLight(sim); computeWarmth(sim);
}

/** Radius a defender lights (dark boards) or warms (frost), growing with its tier. */
const reachOf = (base: number | undefined, d: Defender) => (base ? base + d.tier * 0.5 : 0);

/** Which dark cells light reaches right now: lamps and glowing defenders, minus whatever the Baron snuffed. */
export function computeLight(sim: Sim): void {
  const { lanes, cols } = sim.level;
  if (!sim.board.dark) { for (const row of sim.cells) for (const cell of row) cell.lit = true; return; }
  const sources: [number, number, number][] = [];
  for (let lane = 0; lane < lanes; lane++) for (let col = 0; col < cols; col++) { const cell = sim.cells[lane][col]; if (cell.lamp && cell.snuff <= 0) sources.push([col, lane, LAMP_RADIUS]); }
  for (const d of sim.defenders) { const r = reachOf(defOf(sim, d).glow, d); if (r > 0 && sim.cells[d.lane][d.col].snuff <= 0) sources.push([d.col, d.lane, r]); }
  for (let lane = 0; lane < lanes; lane++) for (let col = 0; col < cols; col++) {
    const cell = sim.cells[lane][col];
    cell.lit = !cell.dark || (cell.snuff <= 0 && sources.some(([c, l, r]) => Math.hypot(c - col, l - lane) <= r + 0.01));
  }
}

/** Which cells are warm (frost boards), and which defenders are chilled because of it. */
export function computeWarmth(sim: Sim): void {
  if (!sim.board.frost) return;
  const { lanes, cols } = sim.level;
  const sources: [number, number, number][] = [];
  for (const d of sim.defenders) { const r = reachOf(defOf(sim, d).warm, d); if (r > 0) sources.push([d.col, d.lane, r]); }
  for (let lane = 0; lane < lanes; lane++) for (let col = 0; col < cols; col++) sim.cells[lane][col].warm = sources.some(([c, l, r]) => Math.hypot(c - col, l - lane) <= r + 0.01);
  for (const d of sim.defenders) {
    const cell = sim.cells[d.lane][d.col], chilled = cell.frost && !cell.warm;
    if (!!d.chilled !== chilled) { d.chilled = chilled; emit(sim, { type: 'chill', id: d.id, def: d.def, col: d.col, lane: d.lane, on: chilled }); }
  }
}

function setHazards(sim: Sim, list: HazardDef[]): void {
  sim.hazards = list.map(def => ({ def, timer: def.first ?? def.every, warned: false, index: 0, cells: [] }));
}

export function createSim(level: LevelDef, options: SimOptions): Sim {
  const content = options.content ?? CONTENT;
  const bonus = metaBonuses(content, options.meta);
  const activeLanes = level.activeLanes ?? Array.from({ length: level.lanes }, (_, lane) => lane);
  const cells: Cell[][] = Array.from({ length: level.lanes }, (_, lane) => Array.from({ length: level.cols }, () => freshCell(!activeLanes.includes(lane))));
  for (const [col, lane] of level.blocked ?? []) if (cells[lane]?.[col]) cells[lane][col].blocked = true;
  const hand = (level.cards ?? options.loadout ?? []).filter((id, index, all) => content.defenders[id] && all.indexOf(id) === index).slice(0, level.cards ? 99 : level.slots);
  const slices = level.slices + bonus.slices;
  const sim: Sim = {
    level, content, random: options.random, time: 0, tick: 0, status: 'playing',
    heat: level.startHeat + bonus.startHeat, slices, maxSlices: slices, score: 0,
    cells, activeLanes,
    cards: hand.map(id => { const def = content.defenders[id]; return { def: id, total: def.cooldown, cooldown: def.cooldown * (1 - (def.startReady ?? 1)) }; }),
    defenders: [], enemies: [], projectiles: [], zones: [], links: [],
    wave: -1, waveTimer: 0, totalWaves: level.waveGen ? Infinity : level.waves.length, nextWave: null, waveSpawnTotal: 0,
    pending: [], telegraphed: -1, trickleTimer: level.trickle?.interval ?? 0, refund: Math.min(1, BASE_REFUND + bonus.refund), nextId: 1,
    events: [], metaMods: bonus.mods,
    stats: { kills: 0, placed: 0, removed: 0, upgrades: 0, defendersLost: 0, slicesLost: 0, heatEarned: 0, heatSpent: 0, maxDefenders: 0, tier3: 0, recipes: [], enemiesSeen: [], defendersUsed: [] },
    firedBarks: (level.barks ?? []).map(() => false), specialsUsed: [],
    warnings: [], hazards: [], modifier: null, board: { dark: false, frost: false }, recipeHeat: bonus.recipeHeat
  };
  applyTerrain(sim, level.terrain);
  setHazards(sim, level.hazards ?? []);
  refreshBoard(sim);
  sim.nextWave = waveAt(sim, 0);
  sim.waveTimer = sim.nextWave?.after ?? 0;
  return sim;
}

// ---------------------------------------------------------------- events and barks

function emit(sim: Sim, event: SimEvent): void {
  sim.events.push(event);
  const barks = sim.level.barks;
  if (!barks || event.type === 'bark') return;
  for (let i = 0; i < barks.length; i++) {
    if (sim.firedBarks[i]) continue;
    const when = barks[i].when;
    let hit = false;
    if ('on' in when) {
      // `def` narrows the trigger: it matches the event's def, kind, cause or recipe id.
      const tagged = event as { def?: string | null; kind?: string; cause?: string; recipe?: string };
      hit = when.on === event.type && (when.def === undefined || tagged.def === when.def || tagged.kind === when.def || tagged.cause === when.def || tagged.recipe === when.def);
    } else if ('wave' in when) hit = event.type === 'waveStart' && event.wave === when.wave;
    if (hit) { sim.firedBarks[i] = true; sim.events.push({ type: 'bark', speaker: barks[i].speaker, line: barks[i].line }); }
  }
}

/** Hands the caller every event since the last drain. */
export function drainEvents(sim: Sim): SimEvent[] { const events = sim.events; sim.events = []; return events; }

// ---------------------------------------------------------------- queries

export const defOf = (sim: Sim, defender: Defender): DefenderDef => sim.content.defenders[defender.def];
export const tierOf = (sim: Sim, defender: Defender): TierDef => defOf(sim, defender).tiers[defender.tier];
export const enemyDef = (sim: Sim, enemy: Enemy): EnemyDef => sim.content.enemies[enemy.def];
export const defenderAt = (sim: Sim, col: number, lane: number): Defender | undefined => sim.defenders.find(d => d.col === col && d.lane === lane);
export const cardOf = (sim: Sim, def: string) => sim.cards.find(card => card.def === def);
export const inBoard = (sim: Sim, col: number, lane: number): boolean => Number.isInteger(col) && Number.isInteger(lane) && lane >= 0 && lane < sim.level.lanes && col >= 0 && col < sim.level.cols;
/** The cell an enemy stands on (the last column while it is still off the right edge), or undefined past the cake. */
export function cellUnder(sim: Sim, e: Enemy): Cell | undefined {
  const col = Math.min(sim.level.cols - 1, Math.floor(e.x));
  return col >= 0 ? sim.cells[e.lane]?.[col] : undefined;
}

/** Why the cell itself refuses this card (ignores Heat and cooldown), or null when it would take it. */
function cellRefusal(sim: Sim, def: string | undefined, col: number, lane: number): Extract<ActionResult, { ok: false }>['reason'] | null {
  if (!inBoard(sim, col, lane)) return 'out-of-bounds';
  const cell = sim.cells[lane][col];
  if (cell.blocked) return 'blocked';
  if (defenderAt(sim, col, lane)) return 'occupied';
  if (cell.mold > 0) return 'mold';
  if (cell.dark && !cell.lit) return 'dark';
  if (def && cell.wet > 0 && sim.content.defenders[def]?.role === 'generator') return 'wet';
  return null;
}

/** Why a card cannot go on a cell right now, or `{ ok: true }`. Also used for the placement preview. */
export function canPlace(sim: Sim, def: string, col: number, lane: number): ActionResult {
  if (sim.status !== 'playing') return { ok: false, reason: 'over' };
  const card = cardOf(sim, def), data = sim.content.defenders[def];
  if (!card || !data) return { ok: false, reason: 'unknown-card' };
  const refusal = cellRefusal(sim, def, col, lane);
  if (refusal) return { ok: false, reason: refusal };
  if (card.cooldown > 0) return { ok: false, reason: 'cooldown' };
  if (sim.heat < data.cost) return { ok: false, reason: 'heat' };
  return { ok: true };
}
/**
 * True when the cell itself could take a defender (ignores Heat and cooldown): drives the green/red preview. Pass the
 * card id to include card-specific rules (a Burner refuses wet tiles).
 */
export function cellFree(sim: Sim, col: number, lane: number, def?: string): boolean {
  return cellRefusal(sim, def, col, lane) === null;
}

/** Heat to raise this defender one tier (or polish it in Endless), or null at max tier / for one-shots. */
export function upgradeCost(sim: Sim, defender: Defender): number | null {
  const tiers = defOf(sim, defender).tiers, next = tiers[defender.tier + 1];
  if (next) return next.upgradeCost ?? 0;
  if (!sim.level.polish || tiers.length < 3) return null;
  return Math.round(((tiers[tiers.length - 1].upgradeCost ?? 100) + 50) * (1 + 0.6 * ((defender.polish ?? 0) + 1)) / 5) * 5;
}
export function refundFor(sim: Sim, defender: Defender): number { return Math.floor(defender.spent * sim.refund / 5) * 5; }

/** Wave bar position 0..1 (campaign), or the fraction of the current wave spawned (Endless). */
export function waveProgress(sim: Sim): number {
  const done = sim.waveSpawnTotal > 0 ? 1 - sim.pending.length / sim.waveSpawnTotal : 0;
  if (!Number.isFinite(sim.totalWaves)) return done;
  if (sim.wave < 0) return 0;
  const last = sim.wave >= sim.totalWaves - 1;
  const toNext = sim.nextWave ? 1 - Math.max(0, Math.min(1, sim.waveTimer / Math.max(0.001, sim.nextWave.after))) : 0;
  return Math.min(1, (sim.wave + (last ? done : toNext)) / sim.totalWaves);
}

export function bonusMet(sim: Sim, goal: BonusGoal = sim.level.bonus): boolean {
  const s = sim.stats;
  switch (goal.kind) {
    case 'maxDefenders': return s.maxDefenders <= goal.n;
    case 'noRemove': return s.removed === 0;
    case 'noDefenderLost': return s.defendersLost === 0;
    case 'recipes': return s.recipes.length >= goal.n;
    case 'tier3': return s.tier3 >= goal.n;
    case 'heatBank': return sim.heat >= goal.n;
    case 'timeUnder': return sim.time <= goal.seconds;
  }
}
/** The three star conditions: win, no slice lost, bonus goal. */
export function starFlags(sim: Sim): { win: boolean; flawless: boolean; bonus: boolean } {
  const win = sim.status === 'won';
  return { win, flawless: win && sim.stats.slicesLost === 0, bonus: win && bonusMet(sim) };
}

// ---------------------------------------------------------------- recipes

const linkKey = (link: RecipeLink) => `${link.recipe}:${link.ids.join(',')}`;

function refreshRecipes(sim: Sim): void {
  const before = new Set(sim.links.map(linkKey));
  const at = new Map<number, Defender>();
  for (const d of sim.defenders) at.set(d.lane * 100 + d.col, d);
  const neighbours = (d: Defender, def: string): Defender[] => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dc, dl]) => at.get((d.lane + dl) * 100 + d.col + dc)).filter((n): n is Defender => !!n && n.def === def);
  const links: RecipeLink[] = [], seen = new Set<string>();
  const add = (recipe: string, members: Defender[]) => {
    const link = { recipe, ids: members.map(m => m.id).sort((a, b) => a - b) }, key = linkKey(link);
    if (new Set(link.ids).size === link.ids.length && !seen.has(key)) { seen.add(key); links.push(link); }
  };
  for (const recipe of sim.content.recipes) {
    const [a, b, c] = recipe.parts;
    if (recipe.parts.length === 2) {
      for (const d of sim.defenders) if (d.def === a) for (const n of neighbours(d, b)) add(recipe.id, [d, n]);
    } else if (recipe.parts.length === 3) {
      // Any of the three may be the middle of the chain.
      for (const [mid, x, y] of [[a, b, c], [b, a, c], [c, a, b]]) {
        for (const d of sim.defenders) if (d.def === mid) for (const n1 of neighbours(d, x)) for (const n2 of neighbours(d, y)) add(recipe.id, [d, n1, n2]);
      }
    }
  }
  sim.links = links;
  const oldUses = new Map(sim.defenders.map(d => [d.id, d.mods.uses ?? 0]));
  for (const d of sim.defenders) {
    d.mods = cloneMods(sim.metaMods[d.def] ?? DEFAULT_MODS()); d.recipes = [];
    if (d.polish) applyPatch(d.mods, { damage: 1.25, hp: 1.2, gen: 1.25, rate: 1.04, regen: 1.2 }, d.polish);
  }
  const byId = new Map(sim.defenders.map(d => [d.id, d]));
  for (const link of links) {
    const recipe = sim.content.recipes.find(r => r.id === link.recipe)!;
    for (const id of link.ids) {
      const d = byId.get(id)!;
      if (d.recipes.includes(recipe.id)) continue;
      d.recipes.push(recipe.id);
      for (const bonus of recipe.bonuses) if (bonus.target === 'all' || bonus.target === d.def) applyPatch(d.mods, bonus.mods);
    }
  }
  for (const d of sim.defenders) {
    const max = Math.round(tierOf(sim, d).hp * d.mods.hp);
    if (max !== d.maxHp) { d.hp = Math.max(1, d.hp * max / d.maxHp); d.maxHp = max; }
    const delta = (d.mods.uses ?? 0) - (oldUses.get(d.id) ?? 0);
    if (delta && tierOf(sim, d).attack.kind === 'trap') d.uses = Math.max(1, d.uses + delta);
  }
  for (const link of links) {
    if (before.has(linkKey(link))) continue;
    const first = !sim.stats.recipes.includes(link.recipe);
    if (first) sim.stats.recipes.push(link.recipe);
    emit(sim, { type: 'recipe', recipe: link.recipe, ids: link.ids, cells: link.ids.map(id => { const d = byId.get(id)!; return [d.col, d.lane] as [number, number]; }), first });
    const recipe = sim.content.recipes.find(r => r.id === link.recipe)!, special = recipe.special, d = byId.get(link.ids[0])!;
    if (first && sim.recipeHeat > 0) gainHeat(sim, sim.recipeHeat, 'recipe', d.col, d.lane);
    if (special && typeof special === 'object' && !sim.specialsUsed.includes(link.recipe)) {
      sim.specialsUsed.push(link.recipe);
      gainHeat(sim, special.heat, 'recipe', d.col, d.lane);
    }
    if (special === 'feast' && !sim.specialsUsed.includes(link.recipe)) {
      sim.specialsUsed.push(link.recipe);
      for (const other of sim.defenders) { other.hp = other.maxHp; other.stun = 0; }
      gainHeat(sim, 100, 'recipe', d.col, d.lane);
    }
  }
  trySpecials(sim);
}

/** Recipes with a once-per-level effect that waits for its moment (Birthday Sponge bakes back a lost slice). */
function trySpecials(sim: Sim): void {
  for (const link of sim.links) {
    const recipe = sim.content.recipes.find(r => r.id === link.recipe)!;
    if (recipe.special === 'restoreSlice' && !sim.specialsUsed.includes(recipe.id) && sim.slices < sim.maxSlices && sim.slices > 0) {
      sim.specialsUsed.push(recipe.id);
      sim.slices++;
      emit(sim, { type: 'sliceRestored', left: sim.slices });
    }
  }
}

/** Defenders came or went: recipes, light and warmth all depend on who stands where. */
function boardChanged(sim: Sim): void {
  refreshRecipes(sim);
  computeLight(sim);
  computeWarmth(sim);
}

// ---------------------------------------------------------------- commands

function gainHeat(sim: Sim, amount: number, source: Extract<SimEvent, { type: 'heat' }>['source'], col = -1, lane = -1): void {
  if (amount <= 0) return;
  sim.heat += amount;
  if (source !== 'refund' && source !== 'recovered') sim.stats.heatEarned += amount;
  emit(sim, { type: 'heat', amount, col, lane, source });
}

function initialCd(attack: AttackDef): number {
  switch (attack.kind) {
    case 'generate': return attack.firstDelay ?? attack.interval;
    case 'lanefire': return attack.fuse;
    case 'burst': return 0.6;
    case 'aura': return 1;
    case 'none': case 'trap': return 0;
    default: return 0.5;
  }
}

export function place(sim: Sim, def: string, col: number, lane: number): ActionResult {
  const check = canPlace(sim, def, col, lane);
  if (!check.ok) return check;
  const data = sim.content.defenders[def], card = cardOf(sim, def)!, tier = data.tiers[0];
  sim.heat -= data.cost; sim.stats.heatSpent += data.cost; card.cooldown = card.total;
  const mods = cloneMods(sim.metaMods[def] ?? DEFAULT_MODS());
  const maxHp = Math.round(tier.hp * mods.hp);
  const defender: Defender = {
    id: sim.nextId++, def, col, lane, tier: 0, hp: maxHp, maxHp, cd: initialCd(tier.attack), stun: 0, spent: data.cost,
    uses: tier.attack.kind === 'trap' ? tier.attack.uses + (mods.uses ?? 0) : 0, mods, recipes: [], bornAt: sim.time, attackAt: -9, hurtAt: -9, chilled: false, polish: 0
  };
  sim.defenders.push(defender);
  sim.stats.placed++;
  if (!sim.stats.defendersUsed.includes(def)) sim.stats.defendersUsed.push(def);
  sim.stats.maxDefenders = Math.max(sim.stats.maxDefenders, sim.defenders.length);
  emit(sim, { type: 'place', id: defender.id, def, col, lane });
  boardChanged(sim);
  return { ok: true };
}

export function upgrade(sim: Sim, col: number, lane: number): ActionResult {
  if (sim.status !== 'playing') return { ok: false, reason: 'over' };
  const d = defenderAt(sim, col, lane);
  if (!d) return { ok: false, reason: 'empty' };
  const cost = upgradeCost(sim, d);
  if (cost === null) return { ok: false, reason: 'max-tier' };
  if (sim.heat < cost) return { ok: false, reason: 'heat' };
  sim.heat -= cost; sim.stats.heatSpent += cost; d.spent += cost;
  if (!defOf(sim, d).tiers[d.tier + 1]) {
    // Endless polish: past the top tier, Heat turns into raw strength and score.
    d.polish = (d.polish ?? 0) + 1;
    sim.score += Math.round(cost / 5);
    refreshRecipes(sim);
    d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.35);
    sim.stats.upgrades++;
    emit(sim, { type: 'polish', id: d.id, def: d.def, col, lane, polish: d.polish });
    return { ok: true };
  }
  const frac = d.hp / d.maxHp;
  d.tier++;
  const tier = tierOf(sim, d);
  d.maxHp = Math.round(tier.hp * d.mods.hp);
  // An upgrade also patches the defender up a little: it should feel like a rescue, not just a stat line.
  d.hp = Math.min(d.maxHp, d.maxHp * Math.min(1, frac + 0.35));
  if (tier.attack.kind === 'trap') d.uses = tier.attack.uses + (d.mods.uses ?? 0);
  sim.stats.upgrades++;
  if (d.tier === 2) sim.stats.tier3++;
  emit(sim, { type: 'upgrade', id: d.id, def: d.def, col, lane, tier: d.tier });
  computeLight(sim); computeWarmth(sim);
  return { ok: true };
}

export function remove(sim: Sim, col: number, lane: number): ActionResult {
  if (sim.status !== 'playing') return { ok: false, reason: 'over' };
  const d = defenderAt(sim, col, lane);
  if (!d) return { ok: false, reason: 'empty' };
  const refund = refundFor(sim, d);
  sim.defenders = sim.defenders.filter(other => other !== d);
  sim.stats.removed++;
  emit(sim, { type: 'remove', id: d.id, def: d.def, col, lane, refund });
  gainHeat(sim, refund, 'refund', col, lane);
  boardChanged(sim);
  return { ok: true };
}

// ---------------------------------------------------------------- damage and status

function applyStatus(sim: Sim, e: Enemy, status: StatusApply): void {
  const def = enemyDef(sim, e);
  if (def.immune?.includes(status.kind)) return;
  if (status.kind === 'burn' && !def.flying && (cellUnder(sim, e)?.wet ?? 0) > 0) return;
  let fresh = false;
  switch (status.kind) {
    case 'slow': fresh = e.slow <= 0; e.slow = Math.max(e.slow, status.duration); e.slowPower = fresh ? status.power ?? 0.5 : Math.min(e.slowPower, status.power ?? 0.5); break;
    case 'stun': fresh = e.stun <= 0; e.stun = Math.max(e.stun, status.duration); break;
    case 'burn': fresh = e.burn <= 0; e.burn = Math.max(e.burn, status.duration); e.burnDps = fresh ? status.power ?? 5 : Math.max(e.burnDps, status.power ?? 5); break;
    case 'sticky': if (def.flying) return; fresh = e.sticky <= 0; e.sticky = Math.max(e.sticky, status.duration); e.stickyPower = fresh ? status.power ?? 0.2 : Math.min(e.stickyPower, status.power ?? 0.2); break;
  }
  if (fresh) emit(sim, { type: 'status', enemy: e.id, x: e.x, lane: e.lane, kind: status.kind });
}

type HurtOptions = { aroundShield?: boolean; ignoreArmor?: boolean; effects?: StatusApply[]; quiet?: boolean };
/** Returns true when the hit reached the body (not soaked by a shield). */
function hurtEnemy(sim: Sim, e: Enemy, raw: number, tag: string, options: HurtOptions = {}): boolean {
  if (e.hp <= 0 || e.gone) return false;
  const def = enemyDef(sim, e);
  e.hurtAt = sim.time;
  if (e.calm) return false;
  let damage = raw * (def.weak?.[tag] ?? 1);
  if (e.shield > 0 && !options.aroundShield) {
    e.shield -= damage;
    if (!options.quiet) emit(sim, { type: 'hit', enemy: e.id, def: e.def, x: e.x, lane: e.lane, damage, tag, shield: true });
    if (e.shield <= 0) { e.shield = 0; emit(sim, { type: 'shieldBreak', enemy: e.id, x: e.x, lane: e.lane }); }
    return false;
  }
  if (!options.ignoreArmor && def.armor && !(def.meltsInFire && e.burn > 0)) damage = Math.max(1, damage - def.armor);
  e.hp -= damage;
  if (!options.quiet) emit(sim, { type: 'hit', enemy: e.id, def: e.def, x: e.x, lane: e.lane, damage, tag, shield: false });
  if (e.hp > 0 && options.effects) for (const status of options.effects) applyStatus(sim, e, status);
  return true;
}

function loseDefender(sim: Sim, d: Defender, cause: 'eaten' | 'spent' | 'stolen'): void {
  if (!sim.defenders.includes(d)) return;
  sim.defenders = sim.defenders.filter(other => other !== d);
  if (cause !== 'spent') sim.stats.defendersLost++;
  emit(sim, { type: 'defenderDown', id: d.id, def: d.def, col: d.col, lane: d.lane, cause });
  boardChanged(sim);
}

function hurtDefender(sim: Sim, d: Defender, damage: number, by: string): void {
  d.hp -= damage; d.hurtAt = sim.time;
  emit(sim, { type: 'defenderHurt', id: d.id, def: d.def, col: d.col, lane: d.lane, by });
  if (d.hp <= 0) loseDefender(sim, d, 'eaten');
}

function stunDefender(sim: Sim, d: Defender, seconds: number, cause: 'toss' | 'drip' | 'chill' | 'snap'): void {
  d.stun = Math.max(d.stun, seconds);
  emit(sim, { type: 'defenderStun', id: d.id, col: d.col, lane: d.lane, duration: seconds, cause });
}

function loseSlice(sim: Sim, lane: number, by: string): void {
  sim.slices = Math.max(0, sim.slices - 1); sim.stats.slicesLost++;
  emit(sim, { type: 'slice', left: sim.slices, lane, by });
  bossBreather(sim);
  trySpecials(sim);
}

/** Fire reached a grease slick: it flares into a short grease fire. */
function ignite(sim: Sim, col: number, lane: number): void {
  const cell = sim.cells[lane]?.[col];
  if (!cell || cell.grease <= 0 || cell.wet > 0) return;
  cell.grease = 0; cell.burning = GREASE_FIRE;
  emit(sim, { type: 'flare', col, lane });
}

// ---------------------------------------------------------------- spawning and waves

/** `court`: the health multiplier a boss passes on to the pests it summons (the wave's, without its own boss scale). */
export function spawnEnemy(sim: Sim, def: string, lane: number, x = sim.level.cols + SPAWN_OFFSET, hpMul = 1, court = hpMul): Enemy | null {
  const data = sim.content.enemies[def];
  if (!data) return null;
  const hp = Math.round(data.hp * hpMul), shield = Math.round((data.shield ?? 0) * hpMul);
  const enemy: Enemy = {
    id: sim.nextId++, def, lane, x, hp, maxHp: hp, shield, maxShield: shield, state: 'walk', biteCd: data.biteInterval * 0.5,
    slow: 0, slowPower: 1, stun: 0, burn: 0, burnDps: 0, sticky: 0, stickyPower: 1, rally: 0, rallyPower: 1,
    burrowsLeft: data.burrow ? 1 : 0, carrying: null, loot: 0, grabTimer: 0, targetId: 0, targetX: 0, gone: false,
    phase: 0, attackTimers: data.boss ? data.boss.phases[0].attacks.map(a => a.every * 0.6) : [],
    bornAt: sim.time, hurtAt: -9, biteAt: -9, wobble: sim.random(), fromLane: lane, hopAt: -9,
    hidden: false, submerged: 0, pushedAt: -99, calm: false, warmth: 0, plans: data.boss ? data.boss.phases[0].attacks.map(() => null) : [],
    court
  };
  sim.enemies.push(enemy);
  if (!sim.stats.enemiesSeen.includes(def)) sim.stats.enemiesSeen.push(def);
  emit(sim, { type: 'enemySpawn', id: enemy.id, def, lane, boss: !!data.boss });
  return enemy;
}

const randomLane = (sim: Sim): number => sim.activeLanes[Math.floor(sim.random() * sim.activeLanes.length) % sim.activeLanes.length];
const pick = <T>(sim: Sim, list: T[]): T => list[Math.floor(sim.random() * list.length) % list.length];

function startWave(sim: Sim): void {
  const wave = sim.nextWave!;
  sim.wave++;
  if (wave.modifier) {
    sim.modifier = wave.modifier;
    resetTerrain(sim);
    applyTerrain(sim, sim.level.terrain);
    applyTerrain(sim, wave.modifier.terrain);
    setHazards(sim, [...(sim.level.hazards ?? []), ...(wave.modifier.hazards ?? [])]);
    sim.warnings = sim.warnings.filter(w => w.boss);
    refreshBoard(sim);
    emit(sim, { type: 'modifier', id: wave.modifier.id, name: wave.modifier.name, desc: wave.modifier.desc });
    // Announced like a story bark, so the HUD needs nothing new to show it.
    sim.events.push({ type: 'bark', speaker: 'ladle', line: { en: `${wave.modifier.name.en}! ${wave.modifier.desc.en}`, zh: `${wave.modifier.name.zh}！${wave.modifier.desc.zh}` } });
  }
  let total = 0;
  for (const [t, enemy, lane, count = 1, gap = 1] of wave.spawns) {
    const copies = count * (sim.content.enemies[enemy]?.swarm ?? 1);
    for (let i = 0; i < copies; i++) {
      const target = lane === '*' ? randomLane(sim) : sim.activeLanes[Math.max(0, Math.min(sim.activeLanes.length - 1, lane))];
      const hpMul = (wave.hpMul ?? 1) * (sim.content.enemies[enemy]?.boss ? wave.bossScale ?? 1 : 1);
      sim.pending.push({ at: sim.time + t + i * gap, enemy, lane: target, hpMul, court: wave.hpMul ?? 1 });
      total++;
    }
  }
  sim.pending.sort((a, b) => a.at - b.at);
  sim.waveSpawnTotal = total;
  if (!Number.isFinite(sim.totalWaves) && sim.wave > 0) sim.score += 50 + sim.wave * 10;
  emit(sim, { type: 'waveStart', wave: sim.wave, total: sim.totalWaves, big: !!wave.big });
  sim.nextWave = sim.wave + 1 < sim.totalWaves ? waveAt(sim, sim.wave + 1) : null;
  sim.waveTimer = sim.nextWave?.after ?? 0;
  if (!sim.nextWave) emit(sim, { type: 'wavesDone' });
}

function stepWaves(sim: Sim, dt: number): void {
  if (sim.nextWave) {
    sim.waveTimer -= dt;
    if (sim.wave >= 0 && sim.pending.length === 0 && !sim.enemies.some(e => e.hp > 0) && sim.waveTimer > EARLY_ADVANCE) sim.waveTimer = EARLY_ADVANCE;
    if (sim.nextWave.big && sim.telegraphed < sim.wave + 1 && sim.waveTimer <= TELEGRAPH_SECONDS) {
      sim.telegraphed = sim.wave + 1;
      emit(sim, { type: 'telegraph', wave: sim.wave + 1, seconds: Math.max(0, sim.waveTimer) });
    }
    if (sim.waveTimer <= 0) startWave(sim);
  }
  while (sim.pending.length && sim.pending[0].at <= sim.time) {
    const next = sim.pending.shift()!;
    spawnEnemy(sim, next.enemy, next.lane, sim.level.cols + SPAWN_OFFSET, next.hpMul, next.court);
  }
}

// ---------------------------------------------------------------- hazards

function warn(sim: Sim, kind: WarnKind, cells: CellList, seconds: number, boss: boolean): number {
  const id = sim.nextId++;
  sim.warnings.push({ id, kind, cells, at: sim.time + seconds, boss });
  emit(sim, { type: 'warn', kind, cells, seconds, boss });
  return id;
}
const unwarn = (sim: Sim, kind: WarnKind, boss: boolean) => { const index = sim.warnings.findIndex(w => w.kind === kind && w.boss === boss); if (index >= 0) sim.warnings.splice(index, 1); };
const allCells = (sim: Sim, test: (cell: Cell) => boolean): CellList => {
  const out: CellList = [];
  for (let lane = 0; lane < sim.level.lanes; lane++) for (let col = 0; col < sim.level.cols; col++) if (test(sim.cells[lane][col])) out.push([col, lane]);
  return out;
};
const enemiesOnCell = (sim: Sim, col: number, lane: number) => sim.enemies.filter(e => e.lane === lane && e.hp > 0 && !e.gone && e.state !== 'burrowed' && e.x >= col - 0.1 && e.x < col + 1.1);

function hazardCells(sim: Sim, h: Sim['hazards'][number]): CellList {
  switch (h.def.kind) {
    case 'drip': { const cells = h.def.cells.filter(([c, l]) => sim.cells[l]?.[c] && !sim.cells[l][c].blocked); return cells.length ? [cells[h.index % cells.length]] : []; }
    case 'hob': return allCells(sim, cell => cell.hob);
    case 'coldSnap': return allCells(sim, cell => cell.frost);
    case 'moldSpread': return [];
  }
}

function landHazard(sim: Sim, h: Sim['hazards'][number]): void {
  const def = h.def, cells = h.cells.length ? h.cells : hazardCells(sim, h);
  switch (def.kind) {
    case 'drip': {
      h.index++;
      for (const [col, lane] of cells) {
        const cell = sim.cells[lane][col];
        cell.wet = Math.max(cell.wet, 6);
        for (const e of enemiesOnCell(sim, col, lane)) if (!enemyDef(sim, e).flying && !enemyDef(sim, e).steadfast) { e.x = Math.min(sim.level.cols + SPAWN_OFFSET, e.x + def.push); e.burn = 0; e.state = 'walk'; }
        const d = defenderAt(sim, col, lane);
        if (d) stunDefender(sim, d, def.stun, 'drip');
      }
      emit(sim, { type: 'hazard', kind: 'drip', cells });
      break;
    }
    case 'hob':
      for (const [col, lane] of cells) { sim.cells[lane][col].hobLit = def.lit; ignite(sim, col, lane); }
      emit(sim, { type: 'hazard', kind: 'hobOn', cells });
      break;
    case 'coldSnap': {
      const hit: CellList = [];
      for (const d of sim.defenders) { const cell = sim.cells[d.lane][d.col]; if (cell.frost && !cell.warm) { stunDefender(sim, d, def.stun, 'snap'); hit.push([d.col, d.lane]); } }
      emit(sim, { type: 'hazard', kind: 'coldSnap', cells: hit });
      break;
    }
    case 'moldSpread': {
      const molded = allCells(sim, cell => cell.mold > 0 && !cell.blocked);
      if (!molded.length) break;
      const [col, lane] = pick(sim, molded);
      const options = ([[col - 1, lane], [col + 1, lane], [col, lane - 1], [col, lane + 1]] as [number, number][])
        .filter(([c, l]) => sim.cells[l]?.[c] && !sim.cells[l][c].blocked && sim.cells[l][c].mold <= 0);
      if (!options.length) break;
      const [c, l] = pick(sim, options);
      sim.cells[l][c].mold = MOLD_SPREAD_SECONDS;
      emit(sim, { type: 'mold', col: c, lane: l });
      emit(sim, { type: 'hazard', kind: 'moldSpread', cells: [[c, l]] });
      break;
    }
  }
}

function stepHazards(sim: Sim, dt: number): void {
  for (const h of sim.hazards) {
    h.timer -= dt;
    const lead = 'warn' in h.def ? h.def.warn : 0;
    if (lead > 0 && !h.warned && h.timer <= lead) {
      h.warned = true; h.cells = hazardCells(sim, h);
      if (h.cells.length) warn(sim, h.def.kind, h.cells, Math.max(0, h.timer), false);
    }
    if (h.timer > 0) continue;
    if (h.warned) unwarn(sim, h.def.kind, false);
    landHazard(sim, h);
    h.timer += h.def.every; h.warned = false; h.cells = [];
  }
}

// ---------------------------------------------------------------- defenders

const targetable = (e: Enemy) => e.hp > 0 && !e.gone && e.state !== 'burrowed' && !(e.submerged && e.submerged > 0);
/** Shots and lobs also need to see their target: nothing in an unlit Pantry cell. */
const visible = (e: Enemy) => targetable(e) && !e.hidden;

function pushTarget(sim: Sim, e: Enemy): number | null {
  const options = [e.lane - 1, e.lane + 1].filter(lane => sim.activeLanes.includes(lane));
  if (!options.length) return null;
  // Garlic shoves toward the better-guarded neighbour, so planning which lanes flank it matters.
  const score = (lane: number) => sim.defenders.filter(d => d.lane === lane && d.col < e.x && tierOf(sim, d).attack.kind !== 'generate' && tierOf(sim, d).attack.kind !== 'none').length * 2
    - sim.enemies.filter(other => other.lane === lane && other.hp > 0).length * 0.5 - (lane === 0 || lane === sim.level.lanes - 1 ? 0.1 : 0);
  return options.reduce((best, lane) => (score(lane) > score(best) ? lane : best), options[0]);
}

function stepDefender(sim: Sim, d: Defender, dt: number): void {
  const data = defOf(sim, d), tier = tierOf(sim, d), attack = tier.attack, cell = sim.cells[d.lane][d.col], cols = sim.level.cols;
  let rate = d.mods.rate;
  if (cell.mold > 0) { rate *= 0.5; d.hp -= MOLD_DPS * dt; if (d.hp <= 0) { loseDefender(sim, d, 'eaten'); return; } }
  if (!data.heatproof && (cell.hobLit > 0 || cell.burning > 0)) {
    d.hp -= (cell.burning > 0 ? FIRE_SINGE_DPS : HOB_SINGE_DPS) * dt; d.hurtAt = sim.time;
    if (d.hp <= 0) { loseDefender(sim, d, 'eaten'); return; }
  }
  if (d.chilled) rate *= CHILL_RATE;
  if (tier.regen && d.hp < d.maxHp && sim.time - d.hurtAt >= tier.regen.delay && cell.mold <= 0) d.hp = Math.min(d.maxHp, d.hp + tier.regen.rate * d.mods.regen * dt);
  if (d.stun > 0) { d.stun -= dt; return; }
  if (attack.kind === 'none') return;
  // A Burner on a wet tile only sputters; on a hob it roars.
  if (attack.kind === 'generate' && cell.wet > 0) return;
  d.cd -= dt * (attack.kind === 'lanefire' ? 1 : rate);
  const centre = d.col + 0.5;
  const fire = (kind: AttackDef['kind'], tag: string, radius?: number) => { d.attackAt = sim.time; emit(sim, { type: 'attack', id: d.id, def: d.def, col: d.col, lane: d.lane, attack: kind, tag, radius }); };
  const effects = (own?: StatusApply[]) => [...(own ?? []), ...d.mods.effects];
  switch (attack.kind) {
    case 'generate':
      if (d.cd <= 0) { d.cd += attack.interval; d.attackAt = sim.time; gainHeat(sim, Math.round(attack.amount * d.mods.gen * (cell.hob ? 2 : 1)), 'burner', d.col, d.lane); }
      break;
    case 'shoot': {
      if (d.cd > 0) break;
      const reach = Math.min(cols + 0.3, attack.range === undefined ? Infinity : centre + attack.range + d.mods.range);
      const flyers = attack.hitsFlying !== false;
      const prey = sim.enemies.some(e => e.lane === d.lane && visible(e) && e.x >= d.col + 0.2 && e.x <= reach && (flyers || !enemyDef(sim, e).flying));
      const mold = attack.cleanse && sim.cells[d.lane].some((c, col) => col > d.col && col + 0.5 <= reach && c.mold > 0);
      if (!prey && !mold) { d.cd = 0; break; }
      d.cd = attack.interval;
      for (let i = 0; i < (attack.count ?? 1); i++) {
        sim.projectiles.push({
          id: sim.nextId++, kind: 'straight', sprite: attack.projectile, lane: d.lane, x: d.col + 0.75 - i * 0.4, damage: attack.damage * d.mods.damage, tag: attack.tag,
          effects: effects(attack.effects), from: d.id, speed: attack.speed, pierce: (attack.pierce ?? 0) + (d.mods.pierce ?? 0), maxX: reach + 0.4,
          knockback: (attack.knockback ?? 0) + (d.mods.knockback ?? 0), hitsFlying: flyers, hit: [],
          x0: 0, x1: 0, t: 0, flight: 0, splash: 0, cleanse: attack.cleanse
        });
      }
      fire('shoot', attack.tag);
      break;
    }
    case 'lob': {
      if (d.cd > 0) break;
      const reach = Math.min(cols + 0.2, attack.range === undefined ? Infinity : centre + attack.range + d.mods.range);
      let target: Enemy | undefined;
      for (const e of sim.enemies) if (e.lane === d.lane && visible(e) && !enemyDef(sim, e).flying && e.x >= d.col + 0.2 && e.x <= reach && (!target || e.x < target.x)) target = e;
      if (!target) { d.cd = 0; break; }
      d.cd = attack.interval;
      const lead = target.state === 'walk' ? enemySpeed(sim, target) * attack.flight : 0;
      sim.projectiles.push({
        id: sim.nextId++, kind: 'lob', sprite: attack.projectile, lane: d.lane, x: centre, damage: attack.damage * d.mods.damage, tag: attack.tag, effects: effects(attack.effects), from: d.id,
        speed: 0, pierce: 0, maxX: 0, knockback: 0, hitsFlying: false, hit: [], x0: centre, x1: Math.max(d.col + 0.9, target.x - lead), t: 0, flight: attack.flight, splash: attack.splash * d.mods.splash
      });
      fire('lob', attack.tag);
      break;
    }
    case 'cone': {
      if (d.cd > 0) break;
      const range = attack.range + d.mods.range;
      const inCone = (e: Enemy) => targetable(e) && Math.abs(e.lane - d.lane) <= attack.spread && e.x >= d.col + 0.2 && e.x <= centre + range - Math.abs(e.lane - d.lane) * 0.8;
      const targets = sim.enemies.filter(inCone);
      if (!targets.length) { d.cd = 0; break; }
      d.cd = attack.interval;
      fire('cone', attack.tag, range);
      for (const e of targets) hurtEnemy(sim, e, attack.damage * d.mods.damage, attack.tag, { aroundShield: true, effects: effects(attack.effects) });
      break;
    }
    case 'melee': {
      if (d.cd > 0) break;
      const range = attack.range + d.mods.range;
      const targets = sim.enemies.filter(e => e.lane === d.lane && targetable(e) && !enemyDef(sim, e).flying && e.x >= d.col - 0.2 && e.x <= centre + range);
      if (!targets.length) { d.cd = 0; break; }
      d.cd = attack.interval;
      fire('melee', attack.tag, range);
      for (const e of targets) hurtEnemy(sim, e, attack.damage * d.mods.damage, attack.tag, { effects: effects(attack.effects) });
      break;
    }
    case 'burst': {
      if (d.cd > 0) break;
      const distance = (e: Enemy) => Math.hypot(e.x - centre, e.lane - d.lane);
      if (!sim.enemies.some(e => targetable(e) && distance(e) <= attack.trigger)) { d.cd = 0; break; }
      d.cd = attack.interval;
      const radius = attack.radius + d.mods.range;
      fire('burst', attack.tag, radius);
      for (const e of sim.enemies) if (targetable(e) && distance(e) <= radius) hurtEnemy(sim, e, attack.damage * d.mods.damage, attack.tag, { aroundShield: true, ignoreArmor: true, effects: effects(attack.effects) });
      break;
    }
    case 'lanefire': {
      if (d.cd > 0) break;
      fire('lanefire', attack.tag);
      const spread = d.mods.spread ?? 0;
      const lanes = sim.activeLanes.filter(lane => Math.abs(lane - d.lane) <= spread);
      for (const lane of lanes) {
        const power = lane === d.lane ? 1 : 0.6;
        emit(sim, { type: 'laneFire', lane, duration: attack.zone });
        for (const e of sim.enemies) if (e.lane === lane && targetable(e) && e.x <= cols + SPAWN_OFFSET) hurtEnemy(sim, e, attack.damage * d.mods.damage * power, attack.tag, { aroundShield: true, ignoreArmor: true, effects: [{ kind: 'burn', duration: attack.burn.duration, power: attack.burn.dps }] });
        sim.zones.push({ id: sim.nextId++, kind: 'fire', lane, x0: -0.3, x1: cols + SPAWN_OFFSET, t: attack.zone, duration: attack.zone, dps: attack.burn.dps * d.mods.damage * power, burn: attack.burn, tag: attack.tag, tick: 0 });
        for (let col = 0; col < cols; col++) ignite(sim, col, lane);
      }
      loseDefender(sim, d, 'spent');
      break;
    }
    case 'trap': {
      for (const e of sim.enemies) {
        if (d.uses <= 0) break;
        if (e.lane !== d.lane || !targetable(e) || enemyDef(sim, e).flying || Math.abs(e.x - centre) > 0.5 || e.sticky > 0) continue;
        const before = e.sticky;
        if (attack.damage) hurtEnemy(sim, e, attack.damage * d.mods.damage, attack.tag, { aroundShield: true });
        for (const status of effects(attack.effects)) applyStatus(sim, e, status);
        if (e.sticky > before || attack.damage) { d.uses--; fire('trap', attack.tag); }
      }
      if (d.uses <= 0) loseDefender(sim, d, 'spent');
      break;
    }
    case 'stink': {
      if (d.cd > 0) break;
      const range = attack.range + d.mods.range;
      const targets = sim.enemies.filter(e => e.lane === d.lane && targetable(e) && !enemyDef(sim, e).flying && e.x >= d.col - 0.2 && e.x <= centre + range);
      if (!targets.length) { d.cd = 0; break; }
      d.cd = attack.interval;
      fire('stink', attack.tag, range);
      for (const e of targets) {
        hurtEnemy(sim, e, attack.damage * d.mods.damage, attack.tag, { aroundShield: true, effects: effects(attack.effects) });
        if (enemyDef(sim, e).steadfast || enemyDef(sim, e).boss || sim.time - (e.pushedAt ?? -99) < PUSH_IMMUNITY || e.state === 'grab' || e.state === 'flee') continue;
        const to = pushTarget(sim, e);
        if (to === null) continue;
        e.fromLane = e.lane; e.lane = to; e.hopAt = sim.time; e.pushedAt = sim.time; e.state = 'walk';
        emit(sim, { type: 'push', enemy: e.id, def: e.def, x: e.x, fromLane: e.fromLane, toLane: to });
      }
      break;
    }
    case 'aura': {
      if (d.cd > 0) break;
      d.cd = attack.interval;
      const radius = attack.radius + d.tier * 0.5 + d.mods.range;
      let healed = false;
      for (const other of sim.defenders) {
        if (other.hp >= other.maxHp || Math.hypot(other.col - d.col, other.lane - d.lane) > radius + 0.01) continue;
        other.hp = Math.min(other.maxHp, other.hp + attack.heal * d.mods.damage); healed = true;
      }
      if (healed) fire('aura', attack.tag, radius);
      break;
    }
  }
}

// ---------------------------------------------------------------- projectiles and zones

function stepProjectiles(sim: Sim, dt: number): void {
  const keep: Projectile[] = [];
  for (const p of sim.projectiles) {
    if (p.kind === 'straight') {
      const from = p.x;
      p.x += p.speed * dt;
      if (p.cleanse) {
        for (let col = Math.max(0, Math.floor(from)); col <= Math.min(sim.level.cols - 1, Math.floor(p.x)); col++) {
          const cell = sim.cells[p.lane][col];
          if (cell.mold > 0) { cell.mold = 0; emit(sim, { type: 'cleanse', col, lane: p.lane }); }
        }
      }
      let alive = true;
      for (;;) {
        let target: Enemy | undefined;
        for (const e of sim.enemies) {
          if (e.lane !== p.lane || !visible(e) || p.hit.includes(e.id)) continue;
          const def = enemyDef(sim, e);
          if (def.flying && !p.hitsFlying) continue;
          const reach = 0.3 * (def.size ?? 1);
          if (e.x - reach <= p.x && e.x + reach >= from && (!target || e.x < target.x)) target = e;
        }
        if (!target) break;
        const body = hurtEnemy(sim, target, p.damage, p.tag, { effects: p.effects });
        const def = enemyDef(sim, target);
        if (body && p.knockback && !def.boss && !def.steadfast) target.x = Math.min(sim.level.cols + SPAWN_OFFSET, target.x + p.knockback);
        p.hit.push(target.id);
        if (p.pierce > 0) p.pierce--; else { alive = false; break; }
      }
      if (alive && p.x <= p.maxX) keep.push(p);
    } else {
      p.t += dt;
      const k = Math.min(1, p.t / p.flight);
      p.x = p.x0 + (p.x1 - p.x0) * k;
      if (k < 1) { keep.push(p); continue; }
      emit(sim, { type: 'splash', x: p.x1, lane: p.lane, radius: p.splash, tag: p.tag });
      for (const e of sim.enemies) {
        if (!targetable(e) || enemyDef(sim, e).flying) continue;
        const distance = Math.hypot(e.x - p.x1, e.lane - p.lane);
        if (distance <= p.splash) hurtEnemy(sim, e, p.damage * (e.lane === p.lane ? 1 : 0.6), p.tag, { aroundShield: true, effects: p.effects });
      }
    }
  }
  sim.projectiles = keep;
}

function stepZones(sim: Sim, dt: number): void {
  for (const zone of sim.zones) {
    zone.t -= dt; zone.tick -= dt;
    if (zone.tick > 0) continue;
    zone.tick += 0.25;
    for (const e of sim.enemies) {
      if (e.lane !== zone.lane || !targetable(e) || e.x < zone.x0 || e.x > zone.x1) continue;
      if (!enemyDef(sim, e).flying && (cellUnder(sim, e)?.wet ?? 0) > 0) continue;
      hurtEnemy(sim, e, zone.dps * 0.25, zone.tag, { aroundShield: true, ignoreArmor: true, quiet: true, effects: [{ kind: 'burn', duration: zone.burn.duration, power: zone.burn.dps }] });
    }
  }
  sim.zones = sim.zones.filter(zone => zone.t > 0);
}

// ---------------------------------------------------------------- enemies

/** Current walking speed in columns per second, with every modifier applied. */
export function enemySpeed(sim: Sim, e: Enemy): number {
  const def = enemyDef(sim, e);
  let speed = def.speed;
  if (def.boss) speed *= def.boss.phases[e.phase].speed ?? 1;
  if (e.slow > 0) speed *= e.slowPower;
  if (e.sticky > 0) speed *= e.stickyPower;
  if (e.rally > 0) speed *= e.rallyPower;
  if (sim.modifier?.enemySpeed) speed *= sim.modifier.enemySpeed;
  if (!def.flying) {
    const cell = cellUnder(sim, e);
    if (cell) {
      if (!def.slime && cell.slime > 0) speed *= cell.slimeBoost;
      if (cell.grease > 0) speed *= GREASE_SPEED;
      if (cell.frost) speed *= FROST_SPEED;
    }
  }
  return speed;
}

/** Thrown at the guards holding the line, not at the Burners by the cake (unless nothing else stands). */
function tossTarget(sim: Sim): [number, number] | null {
  if (!sim.defenders.length) return null;
  const guards = sim.defenders.filter(d => defOf(sim, d).role !== 'generator');
  const target = pick(sim, guards.length ? guards : sim.defenders);
  return [target.col, target.lane];
}

function bossTargets(sim: Sim, e: Enemy, attack: BossAttack): CellList {
  const { cols } = sim.level, here = Math.max(0, Math.min(cols - 1, Math.floor(e.x)));
  const open = (col: number, lane: number) => !!sim.cells[lane]?.[col] && !sim.cells[lane][col].blocked;
  switch (attack.kind) {
    case 'flood': {
      const out: CellList = [];
      for (const lane of sim.activeLanes) if (Math.abs(lane - e.lane) <= attack.spread) for (let col = 0; col < cols; col++) if (open(col, lane)) out.push([col, lane]);
      return out;
    }
    case 'splatter': {
      const pool: CellList = [];
      for (const lane of sim.activeLanes) if (Math.abs(lane - e.lane) <= 1) for (let col = Math.max(0, here - 4); col <= here - 1; col++) if (open(col, lane) && sim.cells[lane][col].grease <= 0) pool.push([col, lane]);
      const out: CellList = [];
      while (pool.length && out.length < attack.count) out.push(pool.splice(Math.floor(sim.random() * pool.length) % pool.length, 1)[0]);
      return out;
    }
    case 'breath': {
      const out: CellList = [], spread = attack.lanes ?? 0;
      for (const lane of sim.activeLanes) if (Math.abs(lane - e.lane) <= spread) for (let col = Math.max(0, here - attack.reach); col <= here; col++) if (open(col, lane)) out.push([col, lane]);
      return out;
    }
    case 'lightsOut': {
      const glowing = sim.defenders.filter(d => (defOf(sim, d).glow ?? 0) > 0);
      const centre = glowing.length ? glowing.reduce((best, d) => (Math.abs(d.lane - e.lane) * 3 - d.col < Math.abs(best.lane - e.lane) * 3 - best.col ? d : best)) : { col: Math.max(0, here - 2), lane: e.lane };
      const out: CellList = [];
      for (let lane = 0; lane < sim.level.lanes; lane++) for (let col = 0; col < cols; col++) if (open(col, lane) && Math.hypot(col - centre.col, lane - centre.lane) <= attack.radius + 0.01) out.push([col, lane]);
      return out;
    }
    case 'toss': { const target = tossTarget(sim); return target ? [target] : []; }
    case 'sporeRain': {
      // Spores land on the front line (guards from column 2 on, which Salt behind them can scrub), not the Burners by the cake.
      const guarded = sim.defenders.filter(d => d.col >= 2 && d.col < here && sim.cells[d.lane][d.col].mold <= 0).map(d => [d.col, d.lane] as [number, number]);
      const empty: CellList = [];
      for (const lane of sim.activeLanes) for (let col = 2; col < Math.max(3, here); col++) if (open(col, lane) && !defenderAt(sim, col, lane) && sim.cells[lane][col].mold <= 0) empty.push([col, lane]);
      const out: CellList = [];
      for (let i = 0; i < attack.count; i++) {
        const from = i % 2 === 0 && guarded.length ? guarded : empty.length ? empty : guarded;
        if (!from.length) break;
        out.push(from.splice(Math.floor(sim.random() * from.length) % from.length, 1)[0]);
      }
      return out;
    }
    default: return [];
  }
}

function landBossAttack(sim: Sim, e: Enemy, attack: BossAttack, cells: CellList): void {
  const event = (extra: Partial<Extract<SimEvent, { type: 'bossAttack' }>> = {}) => emit(sim, { type: 'bossAttack', enemy: e.id, def: e.def, kind: attack.kind, x: e.x, lane: e.lane, ...extra });
  switch (attack.kind) {
    case 'summon': {
      // Her court is as hardy as the rest of tonight's crowd, and smaller once the cake has started to go.
      const count = Math.max(1, attack.count - mercyOf(sim, e));
      event();
      for (let n = 0; n < count; n++) spawnEnemy(sim, attack.enemy, randomLane(sim), sim.level.cols + SPAWN_OFFSET, e.court ?? 1);
      break;
    }
    case 'hop': {
      const options = sim.activeLanes.filter(lane => Math.abs(lane - e.lane) === 1);
      if (!options.length) break;
      const to = pick(sim, options);
      e.fromLane = e.lane; e.hopAt = sim.time; e.lane = to; e.state = 'walk';
      emit(sim, { type: 'bossAttack', enemy: e.id, def: e.def, kind: 'hop', x: e.x, lane: e.fromLane, toLane: to });
      break;
    }
    case 'toss': {
      // A telegraphed throw lands on the cell it marked (and hits whoever stands there now); an unmarked one picks now.
      const planned = attack.aim ? cells[0] : undefined;
      if (planned) {
        const target = defenderAt(sim, planned[0], planned[1]);
        event({ toCol: planned[0], toLane: planned[1] });
        if (target) { stunDefender(sim, target, attack.stun, 'toss'); hurtDefender(sim, target, attack.damage, e.def); }
        break;
      }
      const choice = tossTarget(sim);
      if (!choice) break;
      const target = defenderAt(sim, choice[0], choice[1])!;
      event({ toCol: target.col, toLane: target.lane });
      stunDefender(sim, target, attack.stun, 'toss');
      hurtDefender(sim, target, attack.damage, e.def);
      break;
    }
    case 'rally':
      event();
      for (const other of sim.enemies) if (other !== e && other.hp > 0) { other.rally = attack.duration; other.rallyPower = attack.boost; }
      break;
    case 'flood':
      for (const [col, lane] of cells) { const cell = sim.cells[lane][col]; cell.wet = Math.max(cell.wet, attack.duration); cell.burning = 0; }
      event({ cells });
      emit(sim, { type: 'hazard', kind: 'flood', cells });
      break;
    case 'dive': {
      const options = sim.activeLanes.filter(lane => lane !== e.lane);
      const to = options.length ? pick(sim, options) : e.lane;
      e.submerged = attack.duration; e.fromLane = e.lane; e.lane = to; e.hopAt = sim.time + attack.duration; e.state = 'walk';
      event({ toLane: to });
      emit(sim, { type: 'burrow', enemy: e.id, x: e.x, lane: e.fromLane });
      break;
    }
    case 'splatter':
      for (const [col, lane] of cells) sim.cells[lane][col].grease = Math.max(sim.cells[lane][col].grease, attack.duration);
      event({ cells });
      emit(sim, { type: 'hazard', kind: 'splatter', cells });
      break;
    case 'breath':
      event({ cells });
      for (const [col, lane] of cells) {
        if (attack.status === 'burn') ignite(sim, col, lane);
        const d = defenderAt(sim, col, lane);
        if (!d) continue;
        if (attack.status === 'chill') { if (!sim.cells[lane][col].warm) stunDefender(sim, d, attack.duration, 'chill'); }
        else if (!defOf(sim, d).heatproof) hurtDefender(sim, d, attack.damage, e.def);
        if (attack.status === 'chill' && sim.defenders.includes(d)) hurtDefender(sim, d, attack.damage * (sim.cells[lane][col].warm ? 0.3 : 1), e.def);
      }
      break;
    case 'lightsOut':
      for (const [col, lane] of cells) sim.cells[lane][col].snuff = attack.duration;
      event({ cells });
      emit(sim, { type: 'hazard', kind: 'lightsOut', cells });
      computeLight(sim);
      break;
    case 'sporeRain':
      for (const [col, lane] of cells) { sim.cells[lane][col].mold = Math.max(sim.cells[lane][col].mold, attack.duration); emit(sim, { type: 'mold', col, lane }); }
      event({ cells });
      emit(sim, { type: 'hazard', kind: 'sporeRain', cells });
      break;
  }
}

/**
 * Mercy for a struggling kitchen: each slice the cake has lost (up to `MERCY_MAX`) makes this night's own boss call
 * one pest fewer per summon and summon / throw `MERCY_PACE` slower, and every lost slice buys a breather (see
 * `bossBreather`). A player who never loses a slice never sees it; Endless mini-bosses are not affected.
 */
function mercyOf(sim: Sim, e: Enemy): number {
  return sim.level.boss === e.def ? Math.min(MERCY_MAX, sim.stats.slicesLost) : 0;
}

/** The cake lost a slice: the boss stops to gloat. Its untelegraphed attacks wait at least `BREATHER` of their period. */
function bossBreather(sim: Sim): void {
  for (const e of sim.enemies) {
    const boss = enemyDef(sim, e).boss;
    if (!boss || sim.level.boss !== e.def || e.calm) continue;
    boss.phases[e.phase].attacks.forEach((attack, i) => { if (!e.plans?.[i]) e.attackTimers[i] = Math.max(e.attackTimers[i], attack.every * BREATHER); });
  }
}

function stepBoss(sim: Sim, e: Enemy, def: EnemyDef, dt: number): void {
  const boss = def.boss!;
  while (e.phase + 1 < boss.phases.length && e.hp / e.maxHp <= boss.phases[e.phase + 1].below) {
    e.phase++;
    // A new phase opens with a beat to read it, not an instant volley.
    e.attackTimers = boss.phases[e.phase].attacks.map(a => a.every * PHASE_OPENING);
    e.plans = boss.phases[e.phase].attacks.map(() => null);
    sim.warnings = sim.warnings.filter(w => !w.boss);
    emit(sim, { type: 'bossPhase', enemy: e.id, phase: e.phase });
  }
  const attacks = boss.phases[e.phase].attacks;
  // A boss that is not this level's own (an Endless mini-boss) attacks at half pace.
  const pace = sim.level.boss === e.def ? 1 : 0.5;
  for (let i = 0; i < attacks.length; i++) {
    e.attackTimers[i] -= dt * pace;
    const attack = attacks[i], lead = 'warn' in attack ? attack.warn : attack.kind === 'toss' ? attack.aim ?? 0 : 0;
    if (lead > 0 && !e.plans![i] && e.attackTimers[i] <= lead) {
      const cells = bossTargets(sim, e, attack);
      e.plans![i] = cells;
      warn(sim, attack.kind, cells, Math.max(0, e.attackTimers[i]), true);
    }
    if (e.attackTimers[i] > 0) continue;
    e.attackTimers[i] += attack.every * (MERCIFUL.has(attack.kind) ? 1 + MERCY_PACE * mercyOf(sim, e) : 1);
    const cells = e.plans![i] ?? bossTargets(sim, e, attack);
    if (e.plans![i]) unwarn(sim, attack.kind, true);
    e.plans![i] = null;
    landBossAttack(sim, e, attack, cells);
  }
}

/** Finale: the Bloom stops fighting. Warm guards nearby fill its warmth until it remembers what it was. */
function stepCalm(sim: Sim, e: Enemy, def: EnemyDef, dt: number): void {
  const need = def.boss!.remember!.need;
  let warmth = 0;
  for (const d of sim.defenders) {
    const data = defOf(sim, d), r = reachOf(data.warm, d);
    if (r > 0 && d.stun <= 0 && Math.hypot(d.col + 0.5 - e.x, d.lane - e.lane) <= r + 0.75) warmth += data.role === 'support' ? 2 : 1;
  }
  e.warmth = Math.min(1, (e.warmth ?? 0) + warmth * dt / need);
  if (e.warmth < 1) return;
  sim.stats.remembered = true;
  sim.score += def.score * 2;
  emit(sim, { type: 'remembered', enemy: e.id, def: e.def, x: e.x, lane: e.lane });
  // Nobody is hungry any more: the rest of the night goes home.
  sim.pending = []; sim.nextWave = null; sim.warnings = [];
  for (const other of sim.enemies) other.gone = true;
}

function stepEnemy(sim: Sim, e: Enemy, dt: number): void {
  const def = enemyDef(sim, e), cols = sim.level.cols;
  if (e.slow > 0) e.slow -= dt;
  if (e.sticky > 0) e.sticky -= dt;
  if (e.rally > 0) e.rally -= dt;
  if (e.submerged && e.submerged > 0) {
    e.submerged -= dt;
    if (e.submerged <= 0) { e.submerged = 0; emit(sim, { type: 'emerge', enemy: e.id, x: e.x, lane: e.lane }); }
  }
  const cell = def.flying ? undefined : cellUnder(sim, e);
  if (cell) {
    if (cell.wet > 0) e.burn = 0;
    if (cell.hobLit > 0 || cell.burning > 0) applyStatus(sim, e, HOB_BURN);
    if (e.burn > 0 && cell.grease > 0) ignite(sim, Math.min(cols - 1, Math.floor(e.x)), e.lane);
  }
  if (e.burn > 0) { e.burn -= dt; e.hp -= e.burnDps * dt; if (e.hp <= 0) { if (e.calm) e.hp = 1; else return; } }
  if (e.stun > 0) { e.stun -= dt; return; }
  // Only the finale's own Bloom can be remembered; anywhere else (Endless) it is just a fight.
  const remember = sim.level.boss === e.def ? def.boss?.remember : undefined;
  if (remember && !e.calm && e.hp / e.maxHp <= remember.below) {
    e.calm = true; e.warmth = 0; e.hp = Math.max(1, e.hp); e.burn = 0; e.slow = 0; e.sticky = 0; e.state = 'walk';
    sim.pending = []; sim.warnings = sim.warnings.filter(w => !w.boss);
    const col = Math.floor(e.x);
    for (let lane = 0; lane < sim.level.lanes; lane++) for (let c = 0; c < cols; c++) if (Math.hypot(c - col, lane - e.lane) <= 2.3 && sim.cells[lane][c].mold > 0) { sim.cells[lane][c].mold = 0; emit(sim, { type: 'cleanse', col: c, lane }); }
    emit(sim, { type: 'bossPhase', enemy: e.id, phase: def.boss!.phases.length });
    emit(sim, { type: 'calm', enemy: e.id, def: e.def, x: e.x, lane: e.lane });
  }
  if (e.calm) {
    // It drifts in a little way so the guards can reach it, then waits.
    if (e.x > cols - 2.5) e.x -= def.speed * dt;
    stepCalm(sim, e, def, dt);
    return;
  }
  if (def.boss) stepBoss(sim, e, def, dt);
  const speed = enemySpeed(sim, e);

  if (e.state === 'flee') {
    e.x += speed * 1.15 * dt;
    if (e.x > cols + SPAWN_OFFSET + 0.2) {
      e.gone = true;
      if (e.carrying) { sim.stats.defendersLost++; emit(sim, { type: 'defenderDown', id: e.carrying.id, def: e.carrying.def, col: e.carrying.col, lane: e.carrying.lane, cause: 'stolen' }); e.carrying = null; }
    }
    return;
  }
  if (e.state === 'burrowed') {
    e.x -= speed * dt;
    if (e.x <= e.targetX) { e.state = 'walk'; emit(sim, { type: 'emerge', enemy: e.id, x: e.x, lane: e.lane }); }
    return;
  }
  if (e.state === 'grab') {
    const target = sim.defenders.find(d => d.id === e.targetId);
    if (!target) { e.state = 'walk'; return; }
    e.grabTimer -= dt;
    if (e.grabTimer <= 0) {
      sim.defenders = sim.defenders.filter(d => d !== target);
      e.carrying = target; e.state = 'flee';
      emit(sim, { type: 'steal', enemy: e.id, def: target.def, heat: 0, col: target.col, lane: target.lane });
      boardChanged(sim);
    }
    return;
  }

  let blocker: Defender | undefined;
  if (def.drawnToHeat) {
    // Moths drift toward the nearest Burner ahead of them, a lane at a time, and nibble it.
    const burners = sim.defenders.filter(d => defOf(sim, d).role === 'generator' && d.col + 0.3 <= e.x);
    if (burners.length) {
      const target = burners.reduce((best, d) => (Math.abs(d.lane - e.lane) * 2 - d.col * 0.3 < Math.abs(best.lane - e.lane) * 2 - best.col * 0.3 ? d : best));
      if (target.lane !== e.lane && sim.time - e.hopAt > 1.2) { e.fromLane = e.lane; e.lane += Math.sign(target.lane - e.lane); e.hopAt = sim.time; }
      if (target.lane === e.lane && e.x <= target.col + 1.05) blocker = target;
    }
  } else if (!def.flying) {
    for (const d of sim.defenders) {
      if (d.lane !== e.lane || defOf(sim, d).passable) continue;
      if (e.x >= d.col + 0.35 && e.x <= d.col + 1.05 && (!blocker || d.col > blocker.col)) blocker = d;
    }
  }
  if (blocker) {
    if (def.burrow && e.burrowsLeft > 0) {
      e.burrowsLeft--; e.state = 'burrowed'; e.targetX = blocker.col - 0.15;
      emit(sim, { type: 'burrow', enemy: e.id, x: e.x, lane: e.lane });
      return;
    }
    if (def.thief && !e.carrying && e.loot === 0) { e.state = 'grab'; e.targetId = blocker.id; e.grabTimer = def.thief.grab; return; }
    e.state = 'bite';
    e.biteCd -= dt;
    if (e.biteCd <= 0) {
      e.biteCd += def.biteInterval; e.biteAt = sim.time;
      const thorns = blocker.mods.thorns ?? 0;
      hurtDefender(sim, blocker, def.damage, e.def);
      if (thorns > 0) hurtEnemy(sim, e, thorns, 'steam', { aroundShield: true, quiet: true });
    }
    return;
  }
  e.state = 'walk';
  e.x -= speed * dt;
  if (def.slime) {
    const slimed = sim.cells[e.lane]?.[Math.floor(e.x)];
    if (slimed) { slimed.slime = def.slime.duration; slimed.slimeBoost = def.slime.boost; }
  }
  if (e.x > CAKE_X) return;
  if (def.thief) {
    e.loot = Math.min(sim.heat, def.thief.heat); sim.heat -= e.loot; e.state = 'flee';
    emit(sim, { type: 'steal', enemy: e.id, def: null, heat: e.loot, col: 0, lane: e.lane });
    if (e.loot === 0) e.loot = -1;
    return;
  }
  loseSlice(sim, e.lane, e.def);
  // The falling slice scatters the crowd behind the eater, so one bunched-up string costs one slice, not three at once.
  for (const other of sim.enemies) if (other !== e && !other.gone && other.lane === e.lane && other.x < CAKE_SCARE && !enemyDef(sim, other).boss) other.x = Math.max(other.x, CAKE_SCARE);
  if (def.boss) { e.x = def.boss.retreatTo; return; }
  e.gone = true;
}

function onEnemyDown(sim: Sim, e: Enemy): void {
  const def = enemyDef(sim, e);
  sim.stats.kills++; sim.score += def.score;
  emit(sim, { type: 'enemyDown', id: e.id, def: e.def, x: e.x, lane: e.lane, boss: !!def.boss });
  const col = Math.floor(e.x);
  if (def.moldOnDeath && inBoard(sim, col, e.lane) && !sim.cells[e.lane][col].blocked) {
    sim.cells[e.lane][col].mold = def.moldOnDeath.duration;
    emit(sim, { type: 'mold', col, lane: e.lane });
  }
  if (def.split && !(def.boss && sim.level.boss === e.def)) for (let i = 0; i < def.split.count; i++) {
    const lanes = sim.activeLanes.filter(lane => Math.abs(lane - e.lane) <= 1);
    const lane = def.split.count > 1 && i > 0 ? lanes[i % lanes.length] : e.lane;
    spawnEnemy(sim, def.split.enemy, lane, Math.max(0.2, e.x + 0.35 * i), e.court ?? 1);
  }
  if (e.carrying) {
    const d = e.carrying; e.carrying = null;
    if (cellFree(sim, d.col, d.lane) || (inBoard(sim, d.col, d.lane) && !sim.cells[d.lane][d.col].blocked && !defenderAt(sim, d.col, d.lane))) {
      sim.defenders.push(d);
      emit(sim, { type: 'recovered', def: d.def, heat: 0, col: d.col, lane: d.lane });
      boardChanged(sim);
    } else { sim.stats.defendersLost++; emit(sim, { type: 'defenderDown', id: d.id, def: d.def, col: d.col, lane: d.lane, cause: 'stolen' }); }
  }
  if (e.loot > 0) { emit(sim, { type: 'recovered', def: null, heat: e.loot, col: Math.max(0, col), lane: e.lane }); gainHeat(sim, e.loot, 'recovered', Math.max(0, col), e.lane); e.loot = 0; }
  // The colony scatters when its boss falls.
  if (def.boss && sim.level.boss === e.def) {
    sim.pending = []; sim.warnings = [];
    for (const other of sim.enemies) if (other !== e && other.hp > 0 && !other.gone) { other.hp = 0; other.gone = true; onEnemyDown(sim, other); }
  }
}

// ---------------------------------------------------------------- step

function stepCells(sim: Sim, dt: number): void {
  let lightDirty = false;
  for (let lane = 0; lane < sim.cells.length; lane++) {
    const row = sim.cells[lane];
    for (let col = 0; col < row.length; col++) {
      const cell = row[col];
      if (cell.mold > 0 && cell.mold < PERMANENT / 2) cell.mold = Math.max(0, cell.mold - dt);
      if (cell.slime > 0) cell.slime = Math.max(0, cell.slime - dt);
      if (cell.wet > 0 && cell.wet < PERMANENT / 2) { cell.wet -= dt; if (cell.wet <= 0) { cell.wet = 0; emit(sim, { type: 'hazard', kind: 'dry', cells: [[col, lane]] }); } }
      if (cell.grease > 0 && cell.grease < PERMANENT / 2) cell.grease = Math.max(0, cell.grease - dt);
      if (cell.burning > 0) cell.burning = Math.max(0, cell.burning - dt);
      if (cell.hobLit > 0) { cell.hobLit -= dt; if (cell.hobLit <= 0) { cell.hobLit = 0; emit(sim, { type: 'hazard', kind: 'hobOff', cells: [[col, lane]] }); } }
      if (cell.snuff > 0) { cell.snuff -= dt; if (cell.snuff <= 0) { cell.snuff = 0; lightDirty = true; } }
    }
  }
  if (lightDirty) { computeLight(sim); emit(sim, { type: 'hazard', kind: 'lightsOn', cells: [] }); }
}

export function step(sim: Sim, dt: number = STEP): void {
  if (sim.status !== 'playing') return;
  sim.time += dt; sim.tick++;

  const trickle = sim.level.trickle;
  if (trickle) { sim.trickleTimer -= dt; if (sim.trickleTimer <= 0) { sim.trickleTimer += trickle.interval; gainHeat(sim, trickle.amount, 'trickle'); } }
  const barks = sim.level.barks;
  if (barks) for (let i = 0; i < barks.length; i++) {
    const when = barks[i].when;
    if (!sim.firedBarks[i] && 'time' in when && sim.time >= when.time) { sim.firedBarks[i] = true; sim.events.push({ type: 'bark', speaker: barks[i].speaker, line: barks[i].line }); }
  }

  stepWaves(sim, dt);
  stepHazards(sim, dt);
  if (sim.board.dark) for (const e of sim.enemies) { const cell = cellUnder(sim, e); e.hidden = !!cell && cell.dark && !cell.lit && e.burn <= 0; }
  for (const card of sim.cards) if (card.cooldown > 0) { card.cooldown -= dt; if (card.cooldown <= 0) { card.cooldown = 0; emit(sim, { type: 'cardReady', def: card.def }); } }
  for (const d of [...sim.defenders]) if (sim.defenders.includes(d)) stepDefender(sim, d, dt);
  stepProjectiles(sim, dt);
  stepZones(sim, dt);
  for (const e of [...sim.enemies]) if (e.hp > 0 && !e.gone) stepEnemy(sim, e, dt);
  stepCells(sim, dt);

  for (const e of [...sim.enemies]) if (e.hp <= 0 && !e.gone) { if (e.calm) { e.hp = 1; continue; } e.gone = true; e.hp = 0; onEnemyDown(sim, e); }
  sim.enemies = sim.enemies.filter(e => !e.gone);

  if (sim.slices <= 0) { sim.status = 'lost'; emit(sim, { type: 'lose' }); return; }
  if (!sim.nextWave && sim.wave >= 0 && sim.pending.length === 0 && sim.enemies.length === 0) { sim.status = 'won'; emit(sim, { type: 'win' }); }
}

/** Convenience for tests and the bot: advance by `seconds` of simulated time. */
export function run(sim: Sim, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && sim.status === 'playing'; i++) step(sim);
}
