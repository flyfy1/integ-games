import type { GameServices, GameSound } from '../../core/game-types';
import type { SimEvent } from './types';
import { Conductor } from './audio/conductor';
import { Engine, type EngineStats, type Volumes } from './audio/engine';
import { TRACKS } from './audio/score';
import type { SfxName, SfxOptions } from './audio/sfx';
import { RECIPES } from './data/recipes';

/**
 * Audio facade. The rest of the game only ever says `audio.sfx(name)`, `audio.music(scene)` or hands a sim event to
 * `audio.handle(event)`; how that becomes sound is private to this file and `audio/`.
 *
 * Backends:
 * - `webaudio`: everything synthesised at runtime by `audio/engine.ts` (score, adaptive layers, kitchen sound
 *   design). The AudioContext is created lazily on the first effect (menu clicks call `sfx('ui')` inside the click
 *   handler, which unlocks audio on iOS too) and resumed whenever it is found suspended.
 * - `shared`: no WebAudio (jsdom, very old browsers, or the context failed to start): effects fall back to the
 *   arcade's shared cues (`services.sound.play`) and there is no music.
 * `services.sound.muted` is honoured on every call and polled every scheduler tick (~25 ms); pause suspends the
 * context and stops scheduling (no catch-up burst afterwards); dispose closes everything.
 */
export type { SfxName, SfxOptions } from './audio/sfx';
export type { Volumes } from './audio/engine';
export type MusicScene =
  | 'silence' | 'menu' | 'countertop' | 'boss' | 'endless' | 'victory' | 'defeat' | 'story'
  | 'sink' | 'stove' | 'pantry' | 'fridge' | 'finale';

export type AudioStats = EngineStats & { backend: Audio['backend']; state: string; intensity: number };

export type Audio = {
  sfx(name: SfxName, opts?: SfxOptions): void;
  /** Switch the background scene. Idempotent. Unknown scenes play silence. */
  music(scene: MusicScene | string): void;
  /** Play whatever a sim event should sound like (and let the music follow the fight). */
  handle(event: SimEvent): void;
  /** One typewriter blip in a character's voice (call per revealed character; it is rate-limited). */
  voice(speaker: string): void;
  /** Music / effects levels 0..1. Persisting them is the caller's job. */
  setVolumes(volumes: Partial<Volumes>): void;
  getVolumes(): Volumes;
  pause(): void;
  resume(): void;
  dispose(): void;
  readonly scene: string;
  readonly backend: 'webaudio' | 'shared';
  /** Debug counters (live sources, sfx voices, tracks...). */
  stats(): AudioStats;
};

export type AudioOptions = {
  /** Context factory (tests, offline renders). Defaults to the browser's AudioContext when there is one. */
  createContext?: () => BaseAudioContext;
  /** Scheduler period in ms (default 25) and lookahead in seconds (default 0.15). */
  tickMs?: number;
  lookahead?: number;
  volumes?: Partial<Volumes>;
};

type Cue = Parameters<GameSound['play']>[0];
/** Shared-cue fallback: `[cue or null for silent, minimum seconds between plays]`. */
const SHARED: Record<SfxName, [Cue | null, number]> = {
  ui: ['tap', 0.04], back: ['tap', 0.04], deny: ['fail', 0.25], select: ['tap', 0.04], place: ['move', 0.05], upgrade: ['upgrade', 0.1], remove: ['move', 0.1], heat: ['collect', 0.35], cardReady: [null, 0.4],
  shoot: ['shoot', 0.16], lob: ['jump', 0.25], melee: ['tap', 0.3], burst: ['clear', 0.3], steam: ['shoot', 0.3], laneFire: ['clear', 0.3], trap: ['tap', 0.3],
  hit: [null, 0.2], shieldHit: ['tap', 0.25], shieldBreak: ['merge', 0.2], splash: ['merge', 0.25], enemyDown: ['hit', 0.12], bossDown: ['success', 1],
  bite: ['hit', 0.45], defenderDown: ['fail', 0.3], stun: ['hit', 0.3], mold: ['fail', 0.5], burrow: ['move', 0.4], emerge: ['move', 0.4], steal: ['fail', 0.5], recovered: ['collect', 0.3],
  slice: ['fail', 0.2], sliceRestored: ['success', 0.5], telegraph: ['move', 1], waveStart: ['move', 0.5], finalWave: ['upgrade', 1], recipe: ['merge', 0.3], recipeNew: ['success', 0.5],
  bossPhase: ['clear', 0.5], bossAttack: ['jump', 0.4], win: ['success', 1], lose: ['fail', 1], star: ['collect', 0.1], buy: ['upgrade', 0.1], unlock: ['success', 0.3], dialogue: ['tap', 0.05], bark: ['tap', 0.5],
  bossArrive: ['clear', 1], wavesDone: [null, 1], status: [null, 0.5], blip: [null, 0.1], event: [null, 1],
  warn: [null, 1], hazard: [null, 0.5], push: [null, 0.5], flare: ['clear', 0.5], cleanse: [null, 0.5], chill: [null, 0.5], remembered: ['success', 2], modifier: ['upgrade', 1], polish: ['upgrade', 0.2]
};

/** Recipe "family" from its ingredients: the arpeggio it plays. */
const FAMILY = new Map<string, string>();
for (const r of RECIPES) {
  const parts: string[] = r.parts;
  FAMILY.set(r.id, parts.some(p => p === 'ice' || p === 'salt') ? 'cool'
    : parts.some(p => ['egg', 'dough', 'whisk', 'honey', 'ricecooker'].includes(p)) ? 'sweet'
      : parts.some(p => ['pepper', 'chili', 'onion', 'garlic'].includes(p)) ? 'spicy' : 'warm');
}
const familyOf = (id: string) => FAMILY.get(id) ?? ['warm', 'spicy', 'sweet', 'cool'][[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 4];

const ATTACK_SFX: Record<string, SfxName> = { shoot: 'shoot', lob: 'lob', melee: 'melee', burst: 'burst', cone: 'steam', lanefire: 'laneFire', trap: 'trap', stink: 'burst', aura: 'steam' };

/** Requested scene -> track. Unknown names degrade to silence (e.g. a chapter whose music is not written yet). */
function trackFor(scene: string): string {
  if (scene in TRACKS) return scene;
  const known = Object.keys(TRACKS).find(name => scene.startsWith(name));
  return known ?? 'silence';
}

function browserContext(): (() => BaseAudioContext) | null {
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return typeof Ctor === 'function' ? () => new Ctor({ latencyHint: 'interactive' }) : null;
}

const nowSeconds = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function createAudio(services: GameServices, options: AudioOptions = {}): Audio {
  const factory = options.createContext ?? browserContext();
  const tickMs = options.tickMs ?? 25, lookahead = options.lookahead ?? 0.15;
  let backend: Audio['backend'] = factory ? 'webaudio' : 'shared';
  let scene = 'silence', paused = false, disposed = false;
  let ctx: BaseAudioContext | null = null, engine: Engine | null = null, timer: ReturnType<typeof setInterval> | 0 = 0;
  const volumes: Volumes = { music: 1, sfx: 1, ...options.volumes };
  const conductor = new Conductor();
  const lastShared = new Map<SfxName, number>();
  let heatChain = 0, lastHeat = -9;

  const muted = () => !!services.sound.muted;
  const live = () => ctx?.state === 'running';

  const ensure = (): Engine | null => {
    if (disposed || backend !== 'webaudio' || !factory) return null;
    if (!engine) {
      try {
        ctx = factory();
        engine = new Engine(ctx, { volumes });
      } catch {
        ctx = null; engine = null; backend = 'shared';
        return null;
      }
      engine.setScene(trackFor(scene));
      startTimer();
    }
    if (ctx && ctx.state === 'suspended' && !paused && 'resume' in ctx) {
      (ctx as AudioContext).resume().then(() => engine?.resync(), () => { /* still locked; next gesture retries */ });
    }
    return engine;
  };

  const tick = () => {
    if (!engine || !ctx || disposed || paused) return;
    engine.setMuted(muted());
    if (engine.isMuted || !live()) return;
    engine.setIntensity(conductor.intensity(nowSeconds()));
    if (trackFor(scene) === 'finale') engine.setMood(conductor.mood());
    engine.scheduleUntil(ctx.currentTime + lookahead);
  };
  function startTimer() {
    if (timer || disposed || paused || !engine) return;
    timer = setInterval(tick, tickMs);
    tick();
  }
  const stopTimer = () => { if (timer) clearInterval(timer); timer = 0; };

  const shared = (name: SfxName) => {
    const [cue, gap] = SHARED[name] ?? SHARED.event, time = nowSeconds();
    if (!cue || volumes.sfx <= 0) return;
    if (time - (lastShared.get(name) ?? -9) < gap) return;
    lastShared.set(name, time);
    services.sound.play(cue);
  };

  const sfx = (name: SfxName, opts?: SfxOptions) => {
    if (paused || disposed || muted()) return;
    if (backend === 'shared') { shared(name); return; }
    const e = ensure();
    if (!e) { shared(name); return; }
    e.setMuted(false);
    if (live()) e.sfx(name, opts);
  };

  const heat = () => {
    const t = nowSeconds();
    heatChain = t - lastHeat < 1.2 ? Math.min(heatChain + 1, 9) : 0;
    lastHeat = t;
    sfx('heat', { index: heatChain });
  };

  const handle = (event: SimEvent) => {
    if (disposed) return;
    conductor.onEvent(event, nowSeconds());
    // Old shared-cue behaviour stays exactly as it was for the noisiest events.
    const e = event as SimEvent & Record<string, unknown>;
    switch (event.type) {
      case 'place': sfx('place', { def: event.def }); break;
      case 'upgrade': sfx('upgrade', { def: event.def, index: event.tier }); break;
      case 'remove': sfx('remove', { def: event.def }); break;
      case 'heat':
        if (event.source === 'burner' || (backend === 'webaudio' && (event.source === 'recipe' || event.source === 'recovered' || event.source === 'trickle'))) heat();
        break;
      case 'attack': {
        const name = ATTACK_SFX[event.attack];
        if (name) sfx(name, { def: event.def, tag: event.attack });
        break;
      }
      case 'hit': sfx(event.shield ? 'shieldHit' : 'hit', { tag: event.tag }); break;
      case 'splash': sfx('splash', { tag: event.tag }); break;
      case 'shieldBreak': sfx('shieldBreak'); break;
      case 'status': sfx('status', { tag: event.kind }); break;
      case 'laneFire': sfx('laneFire'); break;
      case 'enemySpawn': if (event.boss) sfx('bossArrive', { def: event.def }); break;
      case 'enemyDown': sfx(event.boss ? 'bossDown' : 'enemyDown', { def: event.def }); break;
      case 'defenderHurt': sfx('bite', { def: event.def }); break;
      case 'defenderDown': if (event.cause === 'eaten') sfx('defenderDown', { def: event.def }); break;
      case 'defenderStun': sfx('stun'); break;
      case 'mold': sfx('mold'); break;
      case 'burrow': sfx('burrow'); break;
      case 'emerge': sfx('emerge'); break;
      case 'steal': sfx('steal'); break;
      case 'recovered': sfx('recovered'); break;
      case 'slice': sfx('slice'); break;
      case 'sliceRestored': sfx('sliceRestored'); break;
      case 'telegraph': sfx('telegraph'); break;
      case 'waveStart': sfx(event.total > 0 && event.wave === event.total - 1 ? 'finalWave' : 'waveStart', { index: event.big ? 1 : 0 }); break;
      case 'wavesDone': sfx('wavesDone'); break;
      case 'recipe': sfx(event.first ? 'recipeNew' : 'recipe', { recipe: event.recipe, family: familyOf(event.recipe) }); break;
      case 'bossPhase': sfx('bossPhase', { index: event.phase }); break;
      case 'bossAttack': sfx('bossAttack', { tag: event.kind }); break;
      case 'cardReady': sfx('cardReady', { def: event.def }); break;
      case 'bark': sfx('bark', { voice: event.speaker }); break;
      case 'win': sfx('win'); break;
      case 'lose': sfx('lose'); break;
      default: {
        // Events added after this pass: the newer ones we know by name, anything else gets a soft generic tick.
        const type = String(e.type);
        if (type === 'warn') sfx('warn', { tag: String(e.kind), index: e.boss ? 1 : 0 });
        else if (type === 'hazard') sfx('hazard', { tag: String(e.kind) });
        else if (type === 'push') sfx('push');
        else if (type === 'flare') sfx('flare');
        else if (type === 'cleanse') sfx('cleanse');
        else if (type === 'chill') sfx('chill', { index: e.on ? 1 : 0 });
        else if (type === 'calm') sfx('wavesDone');
        else if (type === 'remembered') sfx('remembered');
        else if (type === 'modifier') sfx('modifier');
        else if (type === 'polish') sfx('polish');
        else sfx('event');
      }
    }
  };

  return {
    sfx, handle,
    voice(speaker) { sfx('blip', { voice: speaker }); },
    music(next) {
      if (disposed) return;
      const changed = trackFor(next) !== trackFor(scene);
      scene = next;
      if (!changed) return;
      conductor.reset(trackFor(next) === 'endless');
      if (engine && ctx) { engine.setScene(trackFor(next)); if (live() && !paused) tick(); }
    },
    setVolumes(v) {
      if (v.music !== undefined && Number.isFinite(v.music)) volumes.music = Math.max(0, Math.min(1, v.music));
      if (v.sfx !== undefined && Number.isFinite(v.sfx)) volumes.sfx = Math.max(0, Math.min(1, v.sfx));
      engine?.setVolumes(volumes);
    },
    getVolumes: () => ({ ...volumes }),
    pause() {
      if (disposed) return;
      paused = true;
      services.sound.stop();
      stopTimer();
      if (ctx && ctx.state === 'running' && 'suspend' in ctx) (ctx as AudioContext).suspend().catch(() => { /* closed */ });
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      if (ctx && engine) {
        engine.resync();
        if (ctx.state === 'suspended' && 'resume' in ctx) (ctx as AudioContext).resume().then(() => engine?.resync(), () => { /* locked */ });
        startTimer();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; scene = 'silence';
      services.sound.stop();
      stopTimer();
      engine?.stopAll();
      if (ctx && 'close' in ctx && ctx.state !== 'closed') (ctx as AudioContext).close().catch(() => { /* already closed */ });
      engine = null; ctx = null;
    },
    get scene() { return scene; },
    get backend() { return backend; },
    stats() {
      const base: EngineStats = engine?.stats() ?? { liveSources: 0, createdSources: 0, sfxInstances: 0, tracks: 0, scene: 'silence', dropped: 0 };
      return { ...base, backend, state: ctx?.state ?? 'none', intensity: engine?.getIntensity() ?? 0 };
    }
  };
}
