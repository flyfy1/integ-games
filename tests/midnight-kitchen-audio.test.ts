import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import { createAudio, type MusicScene } from '../src/games/midnight-kitchen/audio';
import { Conductor } from '../src/games/midnight-kitchen/audio/conductor';
import { Engine, SFX_BUDGET } from '../src/games/midnight-kitchen/audio/engine';
import { TRACKS, trackLength } from '../src/games/midnight-kitchen/audio/score';
import { SFX_NAMES } from '../src/games/midnight-kitchen/audio/sfx';
import type { SimEvent } from '../src/games/midnight-kitchen/types';

// ------------------------------------------------------------------ a small fake WebAudio

class FakeParam {
  value: number;
  calls: string[] = [];
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v: number) { this.calls.push('set'); this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.calls.push('lin'); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.calls.push('exp'); this.value = v; return this; }
  setTargetAtTime(v: number) { this.calls.push('target'); this.value = v; return this; }
  cancelScheduledValues() { this.calls.push('cancel'); return this; }
}
class FakeNode {
  connected = 0;
  constructor(readonly ctx: FakeContext) { ctx.nodes++; }
  connect<T>(target: T) { this.connected++; return target; }
  disconnect() { this.connected = 0; }
}
class FakeGain extends FakeNode { gain = new FakeParam(1); }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(350); Q = new FakeParam(1); }
class FakeCompressor extends FakeNode { threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam(); }
class FakeConvolver extends FakeNode { buffer: unknown = null; }
class FakeSource extends FakeNode {
  onended: ((ev: Event) => void) | null = null;
  startAt = -1; stopAt = Infinity; ended = false;
  frequency = new FakeParam(440); detune = new FakeParam(0); type = 'sine';
  buffer: unknown = null; loop = false; loopStart = 0; loopEnd = 0;
  constructor(ctx: FakeContext) { super(ctx); ctx.sources.push(this); }
  start(t = 0) { this.startAt = t; }
  stop(t = 0) { this.stopAt = Math.min(this.stopAt, t); }
}
class FakeBuffer {
  private data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) { this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length)); }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(i: number) { return this.data[i]; }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'running' | 'suspended' | 'closed' = 'running';
  nodes = 0;
  sources: FakeSource[] = [];
  destination = { connect() { /* sink */ } };
  calls: string[] = [];
  createGain() { return new FakeGain(this); }
  createBiquadFilter() { return new FakeFilter(this); }
  createDynamicsCompressor() { return new FakeCompressor(this); }
  createConvolver() { return new FakeConvolver(this); }
  createOscillator() { return new FakeSource(this); }
  createBufferSource() { return new FakeSource(this); }
  createBuffer(ch: number, length: number, rate: number) { return new FakeBuffer(ch, length, rate); }
  resume() { this.calls.push('resume'); if (this.state !== 'closed') this.state = 'running'; return Promise.resolve(); }
  suspend() { this.calls.push('suspend'); if (this.state !== 'closed') this.state = 'suspended'; return Promise.resolve(); }
  close() { this.calls.push('close'); this.state = 'closed'; return Promise.resolve(); }
  /** Move the audio clock and fire `onended` for every source that has stopped by then. */
  advance(seconds: number) {
    if (this.state === 'running') this.currentTime += seconds;
    for (const s of this.sources) if (!s.ended && s.stopAt <= this.currentTime) { s.ended = true; s.onended?.({} as Event); }
  }
  live() { return this.sources.filter(s => !s.ended).length; }
}

const asCtx = (fake: FakeContext) => fake as unknown as BaseAudioContext;
const services = (muted = false) => ({
  storage: { get: () => null, set: () => undefined, remove: () => undefined } as unknown as GameServices['storage'],
  sound: { muted, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
  random: () => 0.5, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});

const SCENES: MusicScene[] = ['menu', 'story', 'countertop', 'sink', 'stove', 'pantry', 'fridge', 'boss', 'finale', 'endless', 'victory', 'defeat'];

// Representative events, including ones added after the audio pass (they must never throw).
const EVENTS = [
  { type: 'place', id: 1, def: 'pepper', col: 1, lane: 1 },
  { type: 'upgrade', id: 1, def: 'pepper', col: 1, lane: 1, tier: 2 },
  { type: 'remove', id: 1, def: 'pepper', col: 1, lane: 1, refund: 10 },
  { type: 'heat', amount: 25, col: 0, lane: 0, source: 'burner' },
  { type: 'attack', id: 1, def: 'ice', col: 1, lane: 1, attack: 'shoot', tag: 'ice' },
  { type: 'attack', id: 2, def: 'newthing', col: 1, lane: 1, attack: 'aura', tag: 'warm' },
  { type: 'hit', enemy: 3, def: 'ant', x: 4, lane: 1, damage: 5, tag: 'egg', shield: false },
  { type: 'hit', enemy: 3, def: 'ant', x: 4, lane: 1, damage: 5, tag: 'pepper', shield: true },
  { type: 'splash', x: 3, lane: 2, radius: 1, tag: 'egg' },
  { type: 'shieldBreak', enemy: 3, x: 4, lane: 1 },
  { type: 'status', enemy: 3, x: 4, lane: 1, kind: 'slow' },
  { type: 'laneFire', lane: 1, duration: 3 },
  { type: 'enemySpawn', id: 9, def: 'queen', lane: 2, boss: true },
  { type: 'enemyDown', id: 3, def: 'roach', x: 4, lane: 1, boss: false },
  { type: 'defenderHurt', id: 1, def: 'dough', col: 1, lane: 1, by: 'ant' },
  { type: 'defenderDown', id: 1, def: 'dough', col: 1, lane: 1, cause: 'eaten' },
  { type: 'defenderStun', id: 1, col: 1, lane: 1, duration: 1 },
  { type: 'mold', col: 2, lane: 2 }, { type: 'burrow', enemy: 4, x: 5, lane: 0 }, { type: 'emerge', enemy: 4, x: 2, lane: 0 },
  { type: 'steal', enemy: 5, def: 'burner', heat: 0, col: 0, lane: 0 }, { type: 'recovered', def: 'burner', heat: 0, col: 0, lane: 0 },
  { type: 'slice', left: 2, lane: 0, by: 'ant' }, { type: 'sliceRestored', left: 3 },
  { type: 'telegraph', wave: 2, seconds: 3 }, { type: 'waveStart', wave: 2, total: 3, big: true }, { type: 'wavesDone' },
  { type: 'recipe', recipe: 'salsa', ids: [1, 2], cells: [[1, 1], [2, 1]], first: true },
  { type: 'recipe', recipe: 'never-heard-of-it', ids: [1, 2], cells: [[1, 1], [2, 1]], first: false },
  { type: 'bossPhase', enemy: 9, phase: 1 }, { type: 'bossAttack', enemy: 9, kind: 'flood', x: 5, lane: 2 },
  { type: 'cardReady', def: 'pepper' }, { type: 'bark', speaker: 'pip', line: { en: 'hi', zh: '嗨' } },
  { type: 'warn', kind: 'drip', cells: [], seconds: 1, boss: false }, { type: 'hazard', kind: 'flood', cells: [] },
  { type: 'push', enemy: 3, def: 'ant', x: 3, fromLane: 1, toLane: 2 }, { type: 'flare', col: 1, lane: 1 },
  { type: 'cleanse', col: 1, lane: 1 }, { type: 'chill', id: 1, def: 'pepper', col: 1, lane: 1, on: true },
  { type: 'remembered', enemy: 9, def: 'bloom', x: 3, lane: 2 }, { type: 'modifier', id: 'm', name: { en: 'x', zh: 'x' }, desc: { en: 'x', zh: 'x' } },
  { type: 'polish', id: 1, def: 'pepper', col: 1, lane: 1, polish: 1 },
  { type: 'someFutureEvent', foo: 1 },
  { type: 'win' }, { type: 'lose' }
] as unknown as SimEvent[];

describe('midnight kitchen audio without WebAudio', () => {
  it('falls back to the shared cues and never throws', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices);
    expect(audio.backend).toBe('shared');
    expect(() => {
      for (const name of SFX_NAMES) audio.sfx(name);
      for (const scene of SCENES) audio.music(scene);
      for (const event of EVENTS) audio.handle(event);
      audio.voice('pip'); audio.setVolumes({ music: 0.3, sfx: 0.7 }); audio.stats();
      audio.pause(); audio.resume(); audio.dispose(); audio.dispose();
    }).not.toThrow();
    expect(env.sound.play).toHaveBeenCalled();
    expect(audio.getVolumes()).toEqual({ music: 0.3, sfx: 0.7 });
  });

  it('falls back when the context cannot be created (blocked / broken WebAudio)', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices, { createContext: () => { throw new Error('blocked'); } });
    expect(() => { audio.music('menu'); audio.sfx('ui'); audio.handle({ type: 'win' }); }).not.toThrow();
    expect(audio.backend).toBe('shared');
    expect(env.sound.play).toHaveBeenCalledWith('success');
  });
});

describe('midnight kitchen audio engine', () => {
  it('implements every effect name with real nodes', () => {
    for (const name of SFX_NAMES) {
      const fake = new FakeContext(), engine = new Engine(asCtx(fake));
      const before = fake.sources.length;
      expect(engine.sfx(name, { def: 'pepper', tag: 'egg', voice: 'pip', index: 1, family: 'cool' }), name).toBe(true);
      expect(fake.sources.length - before, name).toBeGreaterThan(0);
    }
  });

  it('implements every music scene with a track that plays notes', () => {
    for (const scene of SCENES) {
      expect(TRACKS, scene).toHaveProperty(scene);
      const fake = new FakeContext(), engine = new Engine(asCtx(fake));
      engine.setIntensity(1);
      engine.setScene(scene);
      const before = fake.sources.length;
      engine.scheduleUntil(Math.min(4, trackLength(TRACKS[scene as keyof typeof TRACKS])));
      expect(fake.sources.length - before, scene).toBeGreaterThan(3);
    }
  });

  it('keeps effects inside the voice budget, but important stingers still get through', () => {
    const fake = new FakeContext(), engine = new Engine(asCtx(fake));
    const names = SFX_NAMES.filter(n => n !== 'slice');
    for (let i = 0; i < 400; i++) engine.sfx(names[i % names.length], { def: `d${i}`, tag: `t${i}`, voice: `v${i}` });
    expect(engine.stats().sfxInstances).toBeLessThanOrEqual(SFX_BUDGET);
    expect(engine.sfx('slice')).toBe(true);
    expect(engine.stats().sfxInstances).toBeLessThanOrEqual(SFX_BUDGET);
    expect(engine.stats().dropped).toBeGreaterThan(0);
  });

  it('rate-limits a repeated sound and caps its simultaneous copies', () => {
    const fake = new FakeContext(), engine = new Engine(asCtx(fake));
    expect(engine.sfx('hit', { tag: 'egg' })).toBe(true);
    expect(engine.sfx('hit', { tag: 'egg' })).toBe(false);
    fake.advance(0.08);
    expect(engine.sfx('hit', { tag: 'egg' })).toBe(true);
    // Different materials have their own gap but share the per-name cap (3).
    engine.sfx('hit', { tag: 'ice' }); engine.sfx('hit', { tag: 'fire' }); engine.sfx('hit', { tag: 'gas' });
    expect(engine.stats().sfxInstances).toBeLessThanOrEqual(4);
  });

  it('cross-fades scenes without stacking and ignores repeats of the same scene', () => {
    const fake = new FakeContext(), engine = new Engine(asCtx(fake));
    engine.setScene('menu');
    engine.setScene('menu');
    expect(engine.stats().tracks).toBe(1);
    engine.scheduleUntil(1);
    engine.setScene('countertop');
    expect(engine.stats().tracks).toBe(2);
    engine.setScene('boss'); engine.setScene('sink'); engine.setScene('pantry');
    expect(engine.stats().tracks).toBeLessThanOrEqual(2);
    for (let i = 0; i < 40; i++) { fake.advance(0.1); engine.scheduleUntil(fake.currentTime + 0.15); }
    expect(engine.stats().tracks).toBe(1);
    expect(engine.scene).toBe('pantry');
    engine.setScene('silence');
    for (let i = 0; i < 40; i++) { fake.advance(0.1); engine.scheduleUntil(fake.currentTime + 0.15); }
    expect(engine.stats().tracks).toBe(0);
  });

  it('disconnects finished voices so a long session stays bounded', () => {
    const fake = new FakeContext(), engine = new Engine(asCtx(fake));
    engine.setScene('boss');
    engine.setIntensity(1);
    let peak = 0;
    for (let i = 0; i < 1200; i++) { // two minutes at 10 Hz
      engine.sfx(SFX_NAMES[i % SFX_NAMES.length], { def: 'ant' });
      fake.advance(0.1); engine.scheduleUntil(fake.currentTime + 0.15);
      peak = Math.max(peak, fake.live());
    }
    expect(engine.stats().createdSources).toBeGreaterThan(2000);
    expect(peak).toBeLessThan(400);
    expect(engine.stats().liveSources).toBe(fake.live());
  });

  it('a stinger plays once and then retires', () => {
    const fake = new FakeContext(), engine = new Engine(asCtx(fake));
    engine.setScene('victory');
    for (let i = 0; i < 200; i++) { fake.advance(0.1); engine.scheduleUntil(fake.currentTime + 0.15); }
    expect(engine.stats().tracks).toBe(0);
    expect(fake.live()).toBe(0);
  });
});

describe('midnight kitchen audio facade with WebAudio', () => {
  let fake: FakeContext;
  beforeEach(() => { vi.useFakeTimers(); fake = new FakeContext(); });
  afterEach(() => { vi.useRealTimers(); });
  const run = (ms: number) => { for (let t = 0; t < ms; t += 25) { fake.advance(0.025); vi.advanceTimersByTime(25); } };

  it('synthesises instead of using the shared cues, starts lazily and plays the scene', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices, { createContext: () => asCtx(fake) });
    audio.music('menu');
    expect(fake.nodes).toBe(0); // nothing created before the first user-gesture sound
    audio.sfx('ui');
    expect(audio.backend).toBe('webaudio');
    run(1000);
    expect(audio.stats().tracks).toBe(1);
    expect(fake.sources.length).toBeGreaterThan(10);
    for (const event of EVENTS) audio.handle(event);
    expect(env.sound.play).not.toHaveBeenCalled();
    audio.dispose();
  });

  it('mute silences effects and stops music scheduling at once; unmute carries on', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices, { createContext: () => asCtx(fake) });
    audio.music('countertop'); audio.sfx('ui'); run(500);
    env.sound.muted = true;
    run(50);
    const count = fake.sources.length;
    audio.sfx('place'); audio.handle({ type: 'slice', left: 1, lane: 0, by: 'ant' });
    run(3000);
    expect(fake.sources.length).toBe(count);
    env.sound.muted = false;
    run(1000);
    expect(fake.sources.length).toBeGreaterThan(count);
    audio.dispose();
  });

  it('pause suspends and stops scheduling; resume continues from now without a catch-up burst', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices, { createContext: () => asCtx(fake) });
    audio.music('boss'); audio.sfx('ui'); run(2000);
    const perSecond = fake.sources.length / 2;
    audio.pause();
    expect(env.sound.stop).toHaveBeenCalled();
    expect(fake.calls).toContain('suspend');
    const count = fake.sources.length;
    audio.sfx('place'); vi.advanceTimersByTime(10000);
    expect(fake.sources.length).toBe(count);
    fake.state = 'running'; fake.currentTime += 30; // the clock moved on while we were away
    audio.resume();
    run(100);
    expect(fake.sources.length - count).toBeLessThan(perSecond); // only a lookahead's worth, not 30 s of notes
    audio.dispose();
  });

  it('dispose stops everything, closes the context and ignores later calls', () => {
    const env = services();
    const audio = createAudio(env as unknown as GameServices, { createContext: () => asCtx(fake) });
    audio.music('endless'); audio.sfx('ui'); run(500);
    audio.dispose();
    expect(fake.calls).toContain('close');
    expect(audio.scene).toBe('silence');
    const count = fake.sources.length;
    audio.sfx('ui'); audio.music('menu'); audio.handle({ type: 'win' }); run(1000);
    expect(fake.sources.length).toBe(count);
    expect(fake.sources.every(s => s.stopAt <= fake.currentTime + 0.1)).toBe(true);
  });

  it('volume settings clamp, apply and survive before the context exists', () => {
    const audio = createAudio(services() as unknown as GameServices, { createContext: () => asCtx(fake) });
    audio.setVolumes({ music: 2, sfx: -1 });
    expect(audio.getVolumes()).toEqual({ music: 1, sfx: 0 });
    audio.setVolumes({ music: 0.4 });
    audio.sfx('ui');
    expect(audio.getVolumes()).toEqual({ music: 0.4, sfx: 0 });
    audio.dispose();
  });
});

describe('midnight kitchen conductor', () => {
  it('is calm between waves, lifts for big waves and bosses, and climbs in endless', () => {
    const c = new Conductor();
    expect(c.intensity(0)).toBeLessThan(0.3);
    c.onEvent({ type: 'waveStart', wave: 1, total: 4, big: true }, 1);
    for (let i = 0; i < 10; i++) c.onEvent({ type: 'enemySpawn', id: i, def: 'ant', lane: 0, boss: false }, 1);
    expect(c.intensity(2)).toBeGreaterThan(0.75);
    for (let i = 0; i < 10; i++) c.onEvent({ type: 'enemyDown', id: i, def: 'ant', x: 1, lane: 0, boss: false }, 3);
    expect(c.intensity(10)).toBeLessThan(0.3);
    c.onEvent({ type: 'enemySpawn', id: 99, def: 'bloom', lane: 0, boss: true }, 11);
    expect(c.intensity(12)).toBeGreaterThanOrEqual(0.75);
    expect(c.mood()).toBe(0);
    c.onEvent({ type: 'bossPhase', enemy: 99, phase: 1 }, 13);
    expect(c.mood()).toBe(1);
    c.onEvent({ type: 'remembered', enemy: 99, def: 'bloom', x: 1, lane: 0 } as unknown as SimEvent, 14);
    expect(c.mood()).toBe(2);
    const e = new Conductor(); e.reset(true);
    e.onEvent({ type: 'waveStart', wave: 12, total: 0, big: false }, 0);
    const late = e.intensity(1);
    e.reset(true);
    e.onEvent({ type: 'waveStart', wave: 1, total: 0, big: false }, 0);
    expect(late).toBeGreaterThan(e.intensity(1));
  });
});
