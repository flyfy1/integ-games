/**
 * Midnight Kitchen: shared types. Everything the simulation, the data tables, the renderer and the menus agree on
 * lives here. No DOM, no drawing. World units: x is measured in columns (0 = left edge of column 0, the cake is
 * just left of 0, enemies enter at `cols + 0.6`), lanes are integers 0..lanes-1, time is seconds.
 */
/*
 * ===================================================== PHASE 2 CONTRACT (CONTENT -> ART / AUDIO / UI)
 * Board gimmicks live on `Cell` (always present after createSim; read them, never write them):
 *   wet      > 0: wet tile (Sink). Burners cannot be placed there and make no Heat there; burning stops on it.
 *   hob      true: a stove hob. `hobLit` > 0 = lit (seconds left): ground enemies on it burn, non-heatproof
 *            defenders on it get singed. A Burner standing on a hob makes double Heat.
 *   grease   > 0: grease slick (seconds left; permanent ones are 1e9). Enemies slide faster. Fire turns it into
 *            `burning` (seconds left): a short grease fire that burns walkers and singes defenders.
 *   dark     true: part of a dark Pantry board. `lit` = light reaches it now (lamps, Burners, Toasters).
 *            Only lit cells can take a defender; enemies standing in an unlit cell cannot be targeted
 *            (`Enemy.hidden`). `snuff` > 0 = the Baron blew the light out here (seconds left). `lamp`: fixed lantern.
 *            Boards without darkness have `dark: false, lit: true` everywhere.
 *   frost    true: frosted fridge shelf. Enemies walk slower. A defender on frost that is not `warm` is chilled
 *            (`Defender.chilled`, acts at half rate). `warm` = within reach of a Burner / Rice Cooker.
 *   mold / slime: as before. Mold can now spread between cells (hazard event `moldSpread`); Salt shots clean it.
 * Telegraphs: `sim.warnings` lists everything about to land (drips, hob ignition, boss attacks) with the cells it
 *   will hit and the sim time it lands (`at`). Draw a marker on those cells until it lands.
 * New SimEvents: `warn` (a telegraph starts; `kind` + cells), `hazard` (it landed / a board state flipped:
 *   drip, hobOn, hobOff, flood, dry, lightsOut, lightsOn, moldSpread, coldSnap, sporeRain, splatter), `push`
 *   (Garlic shoved an enemy to `toLane`; Enemy.fromLane/hopAt are set for the slide), `flare` (grease caught fire),
 *   `cleanse` (Salt cleared mold), `chill` (a defender froze / thawed), `calm` (finale: the Bloom stops fighting and
 *   waits to be warmed: draw a warmth meter from `Enemy.warmth`), `remembered` (finale: the Bloom is warm
 *   again; the renderer should draw it as `stew` from then on, `Enemy.calm` / `Enemy.warmth` 0..1 show progress),
 *   `modifier` (Endless: a rotating board modifier starts, with its bilingual name), `polish` (Endless: a top-tier
 *   defender was polished again; `Defender.polish` counts it).
 * Attack kinds added: `stink` (Garlic: cloud in front, shoves enemies to a neighbouring lane) and `aura` (Rice
 *   Cooker: heals and warms everything within `radius`). `attack` events carry them like any other attack.
 * Boss attacks added: flood, dive, splatter, breath, lightsOut, sporeRain (see BossAttack). Each has a `warn`
 *   lead time and shows up in `sim.warnings` first; `bossAttack` fires when it lands.
 * Music / backdrop keys per chapter: 1 countertop, 2 sink, 3 stove, 4 pantry, 5 fridge; boss levels use music
 *   `boss`, the finale `finale`. `LevelDef.music` / `backdrop` carry them.
 * Cake scare: when a slice is eaten, other non-boss pests in that lane within `CAKE_SCARE` (sim.ts) are set back
 *   to that x, so a bunched string costs one slice at a time (no new event; their x simply jumps back).
 * Boss fairness (balance pass): a night's own boss gets milder with every slice the cake has lost (one pest fewer
 *   per summon, summons and throws slower; `mercyOf` in sim.ts) and pauses its untelegraphed attacks when a slice
 *   falls. A `toss` with `aim` shows up in `sim.warnings` (kind 'toss', one cell) before it lands, and lands on that
 *   cell; throws skip Burners while any other guard stands. Summoned and split-off pests share their wave's health
 *   multiplier (`Enemy.court`). A new boss phase opens with its timers at 80% of each period. No new events.
 * ===================================================== */

/** A bilingual player-facing string. Data rows carry these so content can be added without touching `i18n.ts`. */
export type Loc = { en: string; zh: string };

export type StatusKind = 'slow' | 'stun' | 'burn' | 'sticky';
/** slow/sticky: `power` is the speed factor (0.5 = half speed). burn: `power` is damage per second. stun: unused. */
export type StatusApply = { kind: StatusKind; duration: number; power?: number };

/** Free-form damage flavour. Enemies can be weak or resistant to a tag; effects and audio key off it too. */
export type DamageTag = string;

/** Multiplicative (and a few additive) modifiers layered on a defender by recipes and permanent upgrades. */
export type Mods = {
  damage: number; rate: number; range: number; splash: number; hp: number; regen: number; gen: number;
  /** Extra status effects added to every hit. */
  effects: StatusApply[];
  /** Additive extras from recipes (all optional so older literals stay valid). */
  pierce?: number; knockback?: number; uses?: number;
  /** Damage dealt back to whoever bites this defender. */
  thorns?: number;
  /** Lane fire / stink also reaches this many neighbouring lanes. */
  spread?: number;
};
export type ModPatch = Partial<Omit<Mods, 'effects'>> & { effects?: StatusApply[] };

// ---------------------------------------------------------------- defenders

export type AttackDef =
  /** Makes Heat. */
  | { kind: 'generate'; amount: number; interval: number; firstDelay?: number }
  /** Straight projectile down the lane; stopped by front shields. */
  | { kind: 'shoot'; damage: number; interval: number; speed: number; range?: number; tag: DamageTag; projectile: string; effects?: StatusApply[]; pierce?: number; count?: number; knockback?: number; hitsFlying?: boolean; /** Clears mold from the cells it crosses, and fires at mold ahead even with no enemy in sight (Salt). */ cleanse?: boolean }
  /** Arcing shot that lands on the nearest ground enemy and splashes; ignores front shields, cannot hit flyers. */
  | { kind: 'lob'; damage: number; interval: number; splash: number; flight: number; range?: number; tag: DamageTag; projectile: string; effects?: StatusApply[] }
  /** Instant short cone that pierces everything in range; `spread` 1 also reaches the two neighbouring lanes. */
  | { kind: 'cone'; damage: number; interval: number; range: number; spread: 0 | 1; tag: DamageTag; effects?: StatusApply[] }
  /** Hits every ground enemy within `range` columns in front. */
  | { kind: 'melee'; damage: number; interval: number; range: number; tag: DamageTag; effects?: StatusApply[] }
  /** Area pulse: fires when an enemy comes within `trigger`, hits everything within `radius`, then recharges. */
  | { kind: 'burst'; damage: number; interval: number; radius: number; trigger: number; tag: DamageTag; effects?: StatusApply[] }
  /** One-shot: after `fuse` seconds scorches the whole lane, leaves a burning zone, and is consumed. */
  | { kind: 'lanefire'; damage: number; fuse: number; zone: number; burn: { dps: number; duration: number }; tag: DamageTag }
  /** Ground trap: applies its effects to ground enemies standing on the cell; `uses` enemies before it is spent. */
  | { kind: 'trap'; damage: number; uses: number; tag: DamageTag; effects: StatusApply[] }
  /** Garlic: a stink cloud `range` columns in front; every ground enemy in it is shoved to a neighbouring lane. */
  | { kind: 'stink'; damage: number; interval: number; range: number; tag: DamageTag; effects?: StatusApply[] }
  /** Rice Cooker: every `interval`, heals each defender within `radius` cells by `heal` (itself included). */
  | { kind: 'aura'; heal: number; interval: number; radius: number; tag: DamageTag }
  | { kind: 'none' };

export type TierDef = {
  hp: number;
  attack: AttackDef;
  /** Heals `rate` hp/s once it has not been bitten for `delay` seconds (Dough re-rising). */
  regen?: { rate: number; delay: number };
  /** Heat to upgrade INTO this tier (ignored for tier 1). */
  upgradeCost?: number;
};

export type DefenderRole = 'generator' | 'shooter' | 'wall' | 'slow' | 'lobber' | 'oneshot' | 'stun' | 'melee' | 'cone' | 'trap' | 'support' | 'push';

export type DefenderDef = {
  id: string;
  name: Loc;
  /** One short sentence for cards, the Cookbook and the loadout picker. */
  desc: Loc;
  role: DefenderRole;
  cost: number;
  /** Seconds before the card can be played again. */
  cooldown: number;
  /** Fraction of the cooldown already elapsed when a level starts (1 = ready immediately). */
  startReady?: number;
  /** 1 entry for one-shots, 3 for upgradable defenders. */
  tiers: TierDef[];
  /** Enemies walk through it instead of stopping to bite (traps). */
  passable?: boolean;
  /** Radius (in cells) of warm light it casts on the counter; purely visual, read by the renderer. */
  light?: number;
  /** Gameplay light radius in dark Pantry levels (+0.5 per tier above the first). */
  glow?: number;
  /** Warmth radius on frost (+0.5 per tier above the first). */
  warm?: number;
  /** Not hurt by lit hobs or grease fires (appliances). */
  heatproof?: boolean;
};

export type Defender = {
  id: number; def: string; col: number; lane: number; tier: number;
  hp: number; maxHp: number;
  /** Seconds until the next attack / generation / fuse end. */
  cd: number;
  /** Seconds the defender cannot act (boss sugar cube, etc.). */
  stun: number;
  /** Total Heat sunk into it (drives the spatula refund). */
  spent: number;
  /** Trap charges left. */
  uses: number;
  mods: Mods;
  /** Ids of the recipes it currently takes part in. */
  recipes: string[];
  /** Sim timestamps for the renderer (attack swing, hurt flash, spawn pop). */
  bornAt: number; attackAt: number; hurtAt: number;
  /** On frost and not warm: acts at half rate. */
  chilled?: boolean;
  /** Endless only: extra levels bought past the top tier. */
  polish?: number;
};

// ---------------------------------------------------------------- enemies

export type BossAttack =
  | { kind: 'summon'; every: number; enemy: string; count: number }
  /** Jumps to another active lane. */
  | { kind: 'hop'; every: number }
  /**
   * Throws something at a random guard (Burners only when nothing else stands): damage plus a stun. With `aim`, the
   * target cell is chosen and shown in `sim.warnings` (kind 'toss') that many seconds early, like a `warn` lead;
   * whoever stands there when it lands is hit.
   */
  | { kind: 'toss'; every: number; damage: number; stun: number; aim?: number }
  /** Speeds up every other enemy for a while. */
  | { kind: 'rally'; every: number; boost: number; duration: number }
  /** Sink: floods its own lane (and `spread` lanes either side): wet for `duration`, Burners there sputter. */
  | { kind: 'flood'; every: number; warn: number; duration: number; spread: number }
  /** Ducks under the water for `duration` (cannot be hit) and comes up in another lane. */
  | { kind: 'dive'; every: number; duration: number }
  /** Throws grease onto `count` cells ahead of it (slicks last `duration`). */
  | { kind: 'splatter'; every: number; warn: number; count: number; duration: number }
  /** Breathes down its lane: hurts defenders within `reach` columns. `burn` lights grease; `chill` freezes (stuns) defenders that are not warm. */
  | { kind: 'breath'; every: number; warn: number; damage: number; reach: number; status: 'burn' | 'chill'; duration: number; lanes?: number }
  /** Blows out the light around a Burner: cells within `radius` go dark for `duration`. */
  | { kind: 'lightsOut'; every: number; warn: number; radius: number; duration: number }
  /** Mold lands on `count` cells. */
  | { kind: 'sporeRain'; every: number; warn: number; count: number; duration: number };

export type BossPhase = { /** Phase starts when hp fraction drops to or below this (first phase: 1). */ below: number; speed?: number; attacks: BossAttack[] };
export type BossDef = {
  phases: BossPhase[]; /** After biting the cake it is thrown back to this x. */ retreatTo: number;
  /**
   * Finale: at or below `below` health it stops fighting and cannot be hurt further. Warm defenders (Burners, Rice
   * Cookers) standing within reach of it fill its warmth; at `need` warmth-seconds it is remembered and the night is won.
   */
  remember?: { below: number; need: number };
};

export type EnemyDef = {
  id: string;
  name: Loc;
  desc: Loc;
  hp: number;
  /** Columns per second. */
  speed: number;
  /** Damage per bite and seconds between bites. */
  damage: number; biteInterval: number;
  /** Endless generator budget cost and score value. */
  threat: number;
  score: number;
  /** Visual scale and hit radius multiplier (1 = an ant). */
  size?: number;
  /** Flies over defenders straight to the cake; only `hitsFlying` attacks reach it. */
  flying?: boolean;
  /** Flat damage removed from every hit (burn and fire ignore it). */
  armor?: number;
  /** Front shield: soaks straight shots and melee until it breaks. Lobbed shots and fire go around it. */
  shield?: number;
  /** Leaves slime on the cells it crosses; other ground enemies move `boost`x faster on slime. */
  slime?: { duration: number; boost: number };
  /** Molds the cell it dies on for `duration` seconds. */
  moldOnDeath?: { duration: number };
  /** Tunnels under the first blocker it meets and comes up behind it. */
  burrow?: boolean;
  /** Grabs the first defender it meets (or `heat` Heat at the cake) and runs back with it. */
  thief?: { heat: number; grab: number };
  /** Damage multipliers by tag: > 1 weak, < 1 resistant. */
  weak?: Record<DamageTag, number>;
  immune?: StatusKind[];
  /** A single spawn entry releases this many (fruit-fly swarm). */
  swarm?: number;
  /** Flies toward the nearest Burner's lane and nibbles Burners instead of heading for the cake (Moth). */
  drawnToHeat?: boolean;
  /** Its armour does not count while it is burning (Grease Golem). */
  meltsInFire?: boolean;
  /** Bursts into these when it dies (Mold Brute -> spores). */
  split?: { enemy: string; count: number };
  /** Garlic and knockback do not move it. */
  steadfast?: boolean;
  boss?: BossDef;
};

export type EnemyState = 'walk' | 'bite' | 'burrowed' | 'grab' | 'flee';

export type Enemy = {
  id: number; def: string; lane: number; x: number;
  hp: number; maxHp: number; shield: number; maxShield: number;
  state: EnemyState;
  biteCd: number;
  slow: number; slowPower: number; stun: number; burn: number; burnDps: number; sticky: number; stickyPower: number;
  /** External speed boost (boss rally): seconds left and factor. */
  rally: number; rallyPower: number;
  burrowsLeft: number;
  /** Defender being carried by a thief, or stolen Heat. */
  carrying: Defender | null; loot: number;
  grabTimer: number;
  /** Defender id being grabbed, and the x a burrower surfaces at. */
  targetId: number; targetX: number;
  /** Left the board without dying (ate a slice, or escaped with loot). */
  gone: boolean;
  /** Boss bookkeeping. */
  phase: number; attackTimers: number[];
  /** Renderer hints. */
  bornAt: number; hurtAt: number; biteAt: number; wobble: number;
  /** Lane the enemy just hopped from, and when (boss hop animation, garlic push, moth drift). */
  fromLane: number; hopAt: number;
  /** In an unlit Pantry cell: cannot be targeted. */
  hidden?: boolean;
  /** Seconds left under water (boss dive): cannot be targeted. */
  submerged?: number;
  /** Last time garlic pushed it (a short immunity). */
  pushedAt?: number;
  /** Finale: the Bloom has stopped fighting; `warmth` 0..1 is how close it is to being remembered. */
  calm?: boolean; warmth?: number;
  /** Boss attacks being telegraphed: target cells per attack slot. */
  plans?: ([number, number][] | null)[];
  /** Health multiplier passed on to the pests it summons or splits into (its wave's, without the boss scale). */
  court?: number;
};

// ---------------------------------------------------------------- projectiles, zones, cells

export type Projectile = {
  id: number; kind: 'straight' | 'lob'; sprite: string; lane: number; x: number;
  damage: number; tag: DamageTag; effects: StatusApply[]; from: number;
  // straight
  speed: number; pierce: number; maxX: number; knockback: number; hitsFlying: boolean; hit: number[];
  // lob
  x0: number; x1: number; t: number; flight: number; splash: number;
  /** Salt: scrubs mold off the cells it crosses. */
  cleanse?: boolean;
};

export type Zone = { id: number; kind: 'fire'; lane: number; x0: number; x1: number; t: number; duration: number; dps: number; burn: { dps: number; duration: number }; tag: DamageTag; tick: number };

/** `mold` and `slime` are seconds remaining; `slimeBoost` is the speed factor while slimed. See the contract at the top. */
export type Cell = {
  blocked: boolean; mold: number; slime: number; slimeBoost: number;
  wet: number; hob: boolean; hobLit: number; grease: number; burning: number;
  dark: boolean; lit: boolean; lamp: boolean; snuff: number; frost: boolean; warm: boolean;
};

/** Cell lists in level data. */
export type CellList = [col: number, lane: number][];
/** Board gimmicks a level starts with. */
export type TerrainDef = { wet?: CellList; hobs?: CellList; grease?: CellList; frost?: CellList; mold?: CellList; dark?: boolean; lamps?: CellList };
/** Timed board events. Each one telegraphs (`warn` seconds) before it lands. */
export type HazardDef =
  /** A drip falls on the next cell of `cells` (in order): knocks walkers back `push` columns, stuns a defender there `stun` s, wets the cell. */
  | { kind: 'drip'; every: number; first?: number; warn: number; cells: CellList; push: number; stun: number }
  /** Every hob lights for `lit` seconds. */
  | { kind: 'hob'; every: number; first?: number; warn: number; lit: number }
  /** One mold cell spreads to a neighbour. */
  | { kind: 'moldSpread'; every: number; first?: number }
  /** Cold snap: every defender on frost that is not warm freezes (is stunned) for `stun` seconds. */
  | { kind: 'coldSnap'; every: number; first?: number; warn: number; stun: number };
export type WarnKind = HazardDef['kind'] | BossAttack['kind'];
/** Something about to land, for the renderer. */
export type Warning = { id: number; kind: WarnKind; cells: CellList; at: number; boss: boolean };

// ---------------------------------------------------------------- recipes

export type RecipeBonus = { target: string | 'all'; mods: ModPatch };
export type RecipeDef = {
  id: string;
  name: Loc;
  desc: Loc;
  /** Defender ids that must be orthogonally connected (2 = a pair, 3 = a chain or an L). */
  parts: string[];
  bonuses: RecipeBonus[];
  /** Once per level, when first formed. `feast`: heals and thaws every defender and refunds 100 Heat. */
  special?: 'restoreSlice' | 'feast' | { heat: number };
  /** Link colour for the renderer. */
  color: string;
  /** Level id where the game first hints at this recipe (a bark or tutorial line); its parts are owned by then. */
  hint?: string;
  /** Cryptic Cookbook hint shown before discovery. */
  clue?: Loc;
};
export type RecipeLink = { recipe: string; ids: number[] };

// ---------------------------------------------------------------- levels

/** `[time offset in the wave, enemy id, lane (index into active lanes) or '*' for a random one, count, gap seconds]` */
export type SpawnRow = [t: number, enemy: string, lane: number | '*', count?: number, gap?: number];
export type WaveDef = {
  /** Seconds after the previous wave started (the first wave: seconds after the level starts). */
  after: number;
  /** Big waves get a telegraph and a flag on the wave bar. */
  big?: boolean;
  spawns: SpawnRow[];
  /** Enemy hp multiplier (Endless scaling). */
  hpMul?: number;
  /** Endless: a board modifier that replaces the previous one when this wave starts. */
  modifier?: ModifierDef;
  /** Extra health multiplier for boss rows in this wave (Endless mini-bosses). */
  bossScale?: number;
};
/** Endless rotating modifier: extra terrain/hazards for a stretch of waves. */
export type ModifierDef = { id: string; name: Loc; desc: Loc; terrain?: TerrainDef; hazards?: HazardDef[]; enemySpeed?: number };

export type BonusGoal =
  | { kind: 'maxDefenders'; n: number }
  | { kind: 'noRemove' }
  | { kind: 'noDefenderLost' }
  | { kind: 'recipes'; n: number }
  | { kind: 'tier3'; n: number }
  | { kind: 'heatBank'; n: number }
  | { kind: 'timeUnder'; seconds: number };

/** A scripted one-liner. Fires once, the first time the trigger matches. `def` matches the event's def, kind, cause or recipe. */
export type BarkTrigger = { time: number } | { wave: number } | { on: SimEvent['type']; def?: string };
export type BarkDef = { when: BarkTrigger; speaker: string; line: Loc };

/** A non-blocking coach mark. Shown until `until` happens, then the next one shows. */
export type TutorialStep = {
  text: Loc;
  /** What to point at: a card, a cell, the Heat counter, or a placed defender. */
  focus?: { card: string } | { cell: [col: number, lane: number] } | { hud: 'heat' | 'waves' | 'cake' } | { defender: string };
  until: { on: SimEvent['type']; def?: string } | { time: number };
};

export type LevelDef = {
  id: string;
  chapter: number;
  /** 1-based position inside the chapter. */
  index: number;
  name: Loc;
  /** Line shown on the map and the loadout screen. */
  blurb: Loc;
  cols: number;
  lanes: number;
  /** Lanes in play (indices 0..lanes-1). Defaults to all. */
  activeLanes?: number[];
  blocked?: [col: number, lane: number][];
  startHeat: number;
  trickle?: { amount: number; interval: number };
  slices: number;
  /** Fixed hand for tutorial levels; otherwise the player's loadout (up to `slots`). */
  cards?: string[];
  slots: number;
  waves: WaveDef[];
  /** Endless: called for wave indices past `waves.length`. */
  waveGen?: (index: number, random: () => number) => WaveDef;
  bonus: BonusGoal;
  barks?: BarkDef[];
  tutorial?: TutorialStep[];
  /** Story scene ids played before the level and after a win. */
  intro?: string; outro?: string;
  /** Defender ids granted on the first win. */
  unlocks?: string[];
  /** Crumbs for the first clear. */
  reward: number;
  /** Things first met here, for the "new!" cards on the loadout screen. */
  introduces?: { defenders?: string[]; enemies?: string[] };
  boss?: string;
  /** Backdrop id (one per chapter). */
  backdrop: string;
  /** Music scene handed to the audio facade. */
  music?: string;
  /** Board gimmicks and timed hazards (chapters 2-5). */
  terrain?: TerrainDef;
  hazards?: HazardDef[];
  /** Endless: top-tier defenders can be polished for ever-rising Heat (the late-game Heat sink). */
  polish?: boolean;
};

export type ChapterDef = { id: number; name: Loc; blurb: Loc; levels: string[]; backdrop: string; /** Story scene shown before the chapter's first level (already folded into that level's intro). */ opener?: string };

// ---------------------------------------------------------------- permanent upgrades

export type MetaUpgradeDef = {
  id: string;
  name: Loc;
  desc: Loc;
  /** Defender it improves, or null for a kitchen-wide upgrade. */
  defender: string | null;
  /** Crumb cost per level; length = max level. */
  costs: number[];
  /** Applied once per level owned. */
  perLevel?: ModPatch;
  /** Kitchen-wide effects per level. */
  startHeat?: number; slices?: number; refund?: number;
  /** Heat granted the first time each recipe forms in a night, per level. */
  recipeHeat?: number;
};
/** What the sim needs to know about permanent progress. */
export type MetaState = { upgrades: Record<string, number> };

// ---------------------------------------------------------------- simulation

export type Content = {
  defenders: Record<string, DefenderDef>;
  enemies: Record<string, EnemyDef>;
  recipes: RecipeDef[];
  meta: MetaUpgradeDef[];
};

export type SimOptions = {
  random: () => number;
  /** Cards to bring. Ignored when the level fixes its hand. */
  loadout?: string[];
  meta?: MetaState;
  content?: Content;
};

export type CardState = { def: string; cooldown: number; total: number };

export type SimStats = {
  kills: number; placed: number; removed: number; upgrades: number; defendersLost: number; slicesLost: number;
  heatEarned: number; heatSpent: number; maxDefenders: number; tier3: number;
  recipes: string[]; enemiesSeen: string[]; defendersUsed: string[];
  /** Finale: the Bloom was remembered rather than destroyed. */
  remembered?: boolean;
};

export type SimStatus = 'playing' | 'won' | 'lost';

export type Sim = {
  level: LevelDef; content: Content; random: () => number;
  time: number; tick: number; status: SimStatus;
  heat: number; slices: number; maxSlices: number; score: number;
  cells: Cell[][];
  activeLanes: number[];
  cards: CardState[];
  defenders: Defender[]; enemies: Enemy[]; projectiles: Projectile[]; zones: Zone[];
  links: RecipeLink[];
  /** Index of the last wave that started (-1 before the first). */
  wave: number; waveTimer: number; totalWaves: number;
  /** The wave that starts when `waveTimer` runs out (null after the last one). */
  nextWave: WaveDef | null;
  /** Spawns scheduled by the current wave, for the wave bar. */
  waveSpawnTotal: number;
  /** Permanent-upgrade modifiers per defender id. */
  metaMods: Record<string, Mods>;
  /** `court`: health multiplier for whatever this pest summons or splits into (the wave's, without the boss scale). */
  pending: { at: number; enemy: string; lane: number; hpMul: number; court?: number }[];
  telegraphed: number;
  trickleTimer: number;
  refund: number;
  nextId: number;
  events: SimEvent[];
  stats: SimStats;
  firedBarks: boolean[];
  specialsUsed: string[];
  /** Telegraphs in flight (see the contract at the top). */
  warnings: Warning[];
  /** Per-hazard countdowns, parallel to the active hazard list. */
  hazards: { def: HazardDef; timer: number; warned: boolean; index: number; cells: CellList }[];
  /** Endless: the modifier in force. */
  modifier: ModifierDef | null;
  /** Board flags, so per-step work is skipped on plain counters. */
  board: { dark: boolean; frost: boolean };
  recipeHeat: number;
};

export type PlaceFail = 'unknown-card' | 'cooldown' | 'heat' | 'occupied' | 'blocked' | 'mold' | 'out-of-bounds' | 'over' | 'wet' | 'dark';
export type ActionResult = { ok: true } | { ok: false; reason: PlaceFail | 'empty' | 'max-tier' };

/** Everything that happens, in order. The renderer, the audio facade, the tutorial and the story barks subscribe. */
export type SimEvent =
  | { type: 'place'; id: number; def: string; col: number; lane: number }
  | { type: 'upgrade'; id: number; def: string; col: number; lane: number; tier: number }
  | { type: 'polish'; id: number; def: string; col: number; lane: number; polish: number }
  | { type: 'remove'; id: number; def: string; col: number; lane: number; refund: number }
  | { type: 'defenderDown'; id: number; def: string; col: number; lane: number; cause: 'eaten' | 'spent' | 'stolen' }
  | { type: 'defenderHurt'; id: number; def: string; col: number; lane: number; by: string }
  | { type: 'defenderStun'; id: number; col: number; lane: number; duration: number; cause?: 'toss' | 'drip' | 'chill' | 'snap' }
  | { type: 'heat'; amount: number; col: number; lane: number; source: 'burner' | 'trickle' | 'refund' | 'recipe' | 'recovered' }
  | { type: 'attack'; id: number; def: string; col: number; lane: number; attack: AttackDef['kind']; tag: DamageTag; radius?: number }
  | { type: 'hit'; enemy: number; def: string; x: number; lane: number; damage: number; tag: DamageTag; shield: boolean }
  | { type: 'splash'; x: number; lane: number; radius: number; tag: DamageTag }
  | { type: 'shieldBreak'; enemy: number; x: number; lane: number }
  | { type: 'status'; enemy: number; x: number; lane: number; kind: StatusKind }
  | { type: 'laneFire'; lane: number; duration: number }
  | { type: 'enemySpawn'; id: number; def: string; lane: number; boss: boolean }
  | { type: 'enemyDown'; id: number; def: string; x: number; lane: number; boss: boolean }
  | { type: 'mold'; col: number; lane: number }
  | { type: 'burrow'; enemy: number; x: number; lane: number }
  | { type: 'emerge'; enemy: number; x: number; lane: number }
  | { type: 'steal'; enemy: number; def: string | null; heat: number; col: number; lane: number }
  | { type: 'recovered'; def: string | null; heat: number; col: number; lane: number }
  | { type: 'slice'; left: number; lane: number; by: string }
  | { type: 'sliceRestored'; left: number }
  | { type: 'telegraph'; wave: number; seconds: number }
  | { type: 'waveStart'; wave: number; total: number; big: boolean }
  | { type: 'wavesDone' }
  | { type: 'recipe'; recipe: string; ids: number[]; cells: [number, number][]; first: boolean }
  | { type: 'bossPhase'; enemy: number; phase: number }
  | { type: 'bossAttack'; enemy: number; def?: string; kind: BossAttack['kind']; x: number; lane: number; toCol?: number; toLane?: number; cells?: CellList }
  | { type: 'cardReady'; def: string }
  | { type: 'bark'; speaker: string; line: Loc }
  | { type: 'warn'; kind: WarnKind; cells: CellList; seconds: number; boss: boolean }
  | { type: 'hazard'; kind: 'drip' | 'hobOn' | 'hobOff' | 'flood' | 'dry' | 'lightsOut' | 'lightsOn' | 'moldSpread' | 'coldSnap' | 'sporeRain' | 'splatter'; cells: CellList }
  | { type: 'push'; enemy: number; def: string; x: number; fromLane: number; toLane: number }
  | { type: 'flare'; col: number; lane: number }
  | { type: 'cleanse'; col: number; lane: number }
  | { type: 'chill'; id: number; def: string; col: number; lane: number; on: boolean }
  | { type: 'calm'; enemy: number; def: string; x: number; lane: number }
  | { type: 'remembered'; enemy: number; def: string; x: number; lane: number }
  | { type: 'modifier'; id: string; name: Loc; desc: Loc }
  | { type: 'win' }
  | { type: 'lose' };

export const DEFAULT_MODS = (): Mods => ({ damage: 1, rate: 1, range: 0, splash: 1, hp: 1, regen: 1, gen: 1, effects: [] });
