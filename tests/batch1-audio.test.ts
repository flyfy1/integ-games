import { afterEach, expect, it, vi } from 'vitest';
import { createShellServices } from '../src/core/services';
// @ts-expect-error Ashfall's private JavaScript provider has no public TypeScript API.
import { createAudio } from '../src/games/ashfall/audio.js';

const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
function node() {
  return { gain: param(), frequency: param(), Q: param(), detune: param(), threshold: param(), ratio: param(), attack: param(), release: param(),
    connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
}
class AudioMock {
  static instance: AudioMock;
  state = 'running'; currentTime = 1; sampleRate = 16; destination = {}; sources: ReturnType<typeof node>[] = [];
  resume = vi.fn(() => Promise.resolve()); suspend = vi.fn(() => Promise.resolve()); close = vi.fn(() => Promise.resolve());
  constructor() { AudioMock.instance = this; }
  createGain = node; createDynamicsCompressor = node; createBiquadFilter = node; createWaveShaper = node;
  createBuffer = () => ({ getChannelData: () => new Float32Array(32) });
  createBufferSource = () => { const source = node(); this.sources.push(source); return source; };
  createOscillator = this.createBufferSource;
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

it('ordinary Sound stops and disconnects every active source, including before context resume finishes', () => {
  vi.stubGlobal('AudioContext', class extends AudioMock { state = 'suspended'; resume = vi.fn(() => new Promise<void>(() => {})); });
  const shell = createShellServices(), sound = shell.createGameServices('mines', { score() {}, complete() {} }).sound;
  sound.play('success'); const sources = [...AudioMock.instance.sources];
  expect(sources).toHaveLength(1); shell.stopActiveSound();
  sources.forEach(source => { expect(source.stop).toHaveBeenLastCalledWith(); expect(source.disconnect).toHaveBeenCalled(); });
  shell.setMuted(true); sound.play('tap'); expect(AudioMock.instance.sources).toHaveLength(1);
});

it('Ashfall cancels future SFX, ambience and the scheduler; resume builds fresh scene audio without replaying old SFX', async () => {
  vi.useFakeTimers(); vi.stubGlobal('AudioContext', AudioMock);
  const audio = createAudio(); audio.unlock(); await flush();
  const ctx = AudioMock.instance; expect(ctx.sources).toHaveLength(3); expect(vi.getTimerCount()).toBe(1);
  audio.play('clear'); const old = [...ctx.sources]; expect(old).toHaveLength(7);
  expect(old.some(source => source.start.mock.calls.some(call => Number(call[0]) > ctx.currentTime))).toBe(true);
  audio.suspend(); expect(vi.getTimerCount()).toBe(0);
  old.forEach(source => { expect(source.stop).toHaveBeenLastCalledWith(); expect(source.disconnect).toHaveBeenCalled(); });
  audio.play('clear'); audio.unlock(); await flush(); expect(ctx.sources).toHaveLength(old.length);
  audio.setMode('foundry'); audio.resume(); await flush();
  expect(ctx.sources).toHaveLength(old.length + 3); expect(vi.getTimerCount()).toBe(1);
  old.forEach(source => expect(source.start).toHaveBeenCalledOnce());
  audio.destroy(); expect(vi.getTimerCount()).toBe(0); expect(ctx.close).toHaveBeenCalledOnce();
});

it.each(['suspend', 'destroy'])('a delayed Ashfall resume cannot recreate sources after %s', async (action) => {
  vi.useFakeTimers(); vi.stubGlobal('AudioContext', AudioMock);
  const audio = createAudio(); audio.unlock(); await flush(); audio.suspend();
  const ctx = AudioMock.instance; let resolve!: () => void;
  ctx.resume.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  audio.resume(); const count = ctx.sources.length; audio[action](); resolve(); await flush();
  expect(ctx.sources).toHaveLength(count); expect(vi.getTimerCount()).toBe(0); audio.destroy();
});
