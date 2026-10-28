import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFx, FX_LIMITS, type FxItem, type FxRecipe } from '../src/games/_shared/fx';
import * as blockDrop from '../src/games/block-drop/fx-recipes';
import * as breakout from '../src/games/breakout/fx-recipes';
import * as bubble from '../src/games/bubble/fx-recipes';

type Call = [string, ...unknown[]];
/** Records every 2D-context write and call; reads return the last written value like a real context. */
const recorder = () => {
  const calls: Call[] = [], state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, {
    get: (target, key) => typeof key === 'string' && key in target ? target[key] : (...args: unknown[]) => { calls.push([String(key), ...args]); },
    set: (target, key, value) => { target[key as string] = value; calls.push([`=${String(key)}`, value]); return true; }
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};
const clock = () => { let time = 1000; return { now: () => time, tick: (ms: number) => { time += ms; } }; };

/** The original arcade-kit fx (58626b7, arcade-kit.ts:29-37), kept verbatim as the legacy-appearance oracle. */
const originalKitFx = (kctx: CanvasRenderingContext2D, width: number, height: number, isReducedMotion: boolean) => {
  type Effect = { x: number; y: number; dx: number; dy: number; life: number; max: number; color: string; flash: boolean };
  let effects: Effect[] = [];
  return {
    burst(x: number, y: number, color: string, count = 7) { if (isReducedMotion) { effects.push({ x, y, dx: 0, dy: 0, life: 1, max: 1, color, flash: true }); return; } for (let index = 0; index < count; index++) { const angle = Math.PI * 2 * index / count; effects.push({ x, y, dx: Math.cos(angle) * (1.2 + (index % 3)), dy: Math.sin(angle) * (1.2 + (index % 2)), life: 18, max: 18, color, flash: false }); } },
    flash(color: string, life = 10) { effects.push({ x: width / 2, y: height / 2, dx: 0, dy: 0, life: isReducedMotion ? 1 : life, max: isReducedMotion ? 1 : life, color, flash: true }); },
    step() { effects = effects.filter(effect => { effect.life--; effect.x += effect.dx; effect.y += effect.dy; return effect.life > 0; }); },
    draw() { const alpha = kctx.globalAlpha; effects.forEach(effect => { kctx.globalAlpha = Math.max(.08, effect.life / effect.max) * .8; kctx.strokeStyle = effect.color; kctx.fillStyle = effect.color; if (effect.flash) { kctx.fillRect(0, 0, width, height); } else { kctx.fillRect(effect.x - 2, effect.y - 2, 4, 4); } }); kctx.globalAlpha = alpha; }
  };
};

const pilots: Record<string, Record<string, unknown>> = { 'block-drop': { ...blockDrop }, breakout: { ...breakout }, bubble: { ...bubble } };
const recipesOf = (module: Record<string, unknown>) => Object.values(module).filter((value): value is FxRecipe => typeof value === 'object' && value !== null && 'layers' in value && 'id' in value);
const allRecipes = Object.values(pilots).flatMap(recipesOf);
const live = (items: FxItem[]) => items.filter(item => !('age' in item) || item.age >= 0);

describe('shared fx: legacy burst/flash appearance', () => {
  it('issues exactly the original draw calls for burst and flash in normal play', () => {
    const before = recorder(), after = recorder(), old = originalKitFx(before.ctx, 360, 560, false), fx = createFx(after.ctx, 360, 560, { reducedMotion: false, now: () => 0 });
    for (const target of [old, fx]) { target.burst(120, 300, '#70f0c2'); target.burst(40, 80, '#f7f9ff', 4); target.flash('#8b7cff'); }
    for (let frame = 0; frame < 20; frame++) { old.step(); fx.step(); old.draw(); fx.draw(); if (frame === 4) { old.burst(10, 10, '#ff6b7a', 12); fx.burst(10, 10, '#ff6b7a', 12); } }
    const visible = (calls: Call[]) => calls.filter(([name]) => name !== '=lineWidth');
    expect(visible(after.calls)).toEqual(visible(before.calls));
    expect(before.calls.length).toBeGreaterThan(200);
  });
});

describe('shared fx: step-0 repairs', () => {
  it('lets an ending flash fade when the game stops calling step(), instead of freezing as a 72% wash', () => {
    const { ctx, calls } = recorder(), fx = createFx(ctx, 360, 560, { reducedMotion: false, now: () => 0 });
    fx.step(); fx.flash('#ff6b7a'); // death frame: flash pushed after the last step
    for (let frame = 0; frame < 12; frame++) fx.draw(); // game over: draw() only
    expect(fx.active()).toBe(false);
    const fills = calls.filter(([name]) => name === 'fillRect');
    expect(fills.length).toBe(10); // the death frame draws life 10 (already stepped), then 9..1, then gone
    calls.length = 0; fx.draw();
    expect(calls.filter(([name]) => name === 'fillRect')).toHaveLength(0);
  });

  it('does not double-advance when a game calls step() and draw() in the same frame', () => {
    const fx = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: () => 0 });
    fx.burst(100, 100, '#fff', 1); fx.step(); fx.draw();
    const [item] = fx.inspect();
    expect(item.kind === 'legacy' && item.life).toBe(17);
  });

  it('freezes everything while paused and resumes without a time jump', () => {
    const time = clock(), fx = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: time.now });
    fx.burst(50, 50, '#fff'); fx.emit(breakout.brickShatter, 100, 100, { colors: ['#70f0c2'], w: 36, h: 18 });
    time.tick(16); fx.step(); fx.draw();
    fx.setPaused(true); const frozen = JSON.stringify(fx.inspect());
    for (let i = 0; i < 30; i++) { time.tick(16); fx.step(); fx.draw(); }
    expect(JSON.stringify(fx.inspect())).toBe(frozen);
    time.tick(5000); fx.setPaused(false); fx.step();
    const shard = fx.inspect().find(item => item.kind === 'shard');
    expect(shard && 'age' in shard ? shard.age : -1).toBe(16); // resume starts a fresh dt, not the 5s gap
  });

  it('gives reduced-motion players a static local outline for burst instead of nothing', () => {
    const { ctx, calls } = recorder(), time = clock(), fx = createFx(ctx, 360, 560, { reducedMotion: true, now: time.now });
    fx.burst(80, 90, '#70f0c2');
    const [first] = fx.inspect();
    for (let frame = 0; frame < 6; frame++) { time.tick(16); fx.step(); fx.draw(); }
    expect(fx.inspect()).toEqual([{ ...first, age: 96 }]); // same place, same size: zero displacement
    expect(calls.filter(([name]) => name === 'arc').every(([, x, y]) => x === 80 && y === 90)).toBe(true);
    expect(calls.some(([name]) => name === 'fillRect')).toBe(false);
    for (let frame = 0; frame < 4; frame++) { time.tick(16); fx.step(); }
    expect(fx.active()).toBe(false); // ≤160ms
  });

  it('never paints a full-canvas fill under reduced motion; flash becomes a short edge outline', () => {
    const { ctx, calls } = recorder(), time = clock(), fx = createFx(ctx, 360, 560, { reducedMotion: true, now: time.now });
    fx.flash('#ff6b7a', 10); fx.burst(10, 10, '#fff');
    allRecipes.forEach(recipe => fx.emit(recipe, 100, 100, { colors: ['#70f0c2'], w: 40, h: 20 }));
    for (let t = 0; t <= 200; t += 16) { time.tick(16); fx.draw(); }
    expect(calls.some(([name]) => name === 'fillRect' || name === 'fill')).toBe(false);
    expect(calls.some(([name]) => name === 'strokeRect')).toBe(true);
    expect(fx.active()).toBe(false);
  });
});

describe('shared fx: recipe interpreter', () => {
  it('replays a recipe identically for the same emits and dt sequence, and differently on the next emit', () => {
    const run = () => { const time = clock(), fx = createFx(recorder().ctx, 600, 600, { reducedMotion: false, now: time.now }); fx.emit(blockDrop.lineClear, 300, 405, { colors: ['#59C9FF', '#FF8195'], w: 300, h: 30, scale: 2 }); const frames = [JSON.stringify(fx.inspect())]; for (const dt of [16, 17, 16, 33, 8]) { time.tick(dt); fx.step(); frames.push(JSON.stringify(fx.inspect())); } return { frames, fx, time }; };
    const a = run(), b = run();
    expect(a.frames).toEqual(b.frames);
    a.fx.clear(); a.fx.emit(breakout.brickShatter, 0, 0); b.fx.emit(breakout.brickShatter, 0, 0);
    const shards = (items: FxItem[]) => JSON.stringify(items.filter(item => item.kind === 'shard').slice(-3));
    expect(shards(a.fx.inspect())).not.toBe(shards(b.fx.inspect())); // emit #1 vs emit #2
    a.fx.clear(); a.fx.emit(breakout.brickShatter, 0, 0);
    const c = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: () => 0 }); c.emit(breakout.brickShatter, 0, 0);
    expect(JSON.stringify(a.fx.inspect())).toBe(JSON.stringify(c.inspect())); // clear() restarts the sequence
  });

  it('caps shards per emit and live items per canvas, evicting the oldest', () => {
    const fx = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: () => 0 });
    const greedy: FxRecipe = { id: 'test.greedy', layers: [{ kind: 'shards', count: [90, 90], speed: [1, 1], spread: 1, gravity: 0, drag: 0, size: [1, 1], shape: 'square', life: [99999, 99999], colors: ['#fff'] }], reduced: 'none' };
    fx.emit(greedy, 0, 0, { scale: 3 });
    expect(fx.inspect()).toHaveLength(FX_LIMITS.perEmit);
    expect(fx.inspect().every(item => item.kind === 'shard' && item.life === FX_LIMITS.maxLife)).toBe(true);
    for (let i = 0; i < 10; i++) fx.emit(greedy, i, 0);
    const items = fx.inspect();
    expect(items).toHaveLength(FX_LIMITS.live);
    expect(items[items.length - 1].x).toBe(9);
    expect(items.some(item => item.x === 0 && item.y === 0 && items.indexOf(item) < 8)).toBe(false);
  });

  it('caps each tick at 50ms so a stalled tab does not teleport particles', () => {
    const time = clock(), fx = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: time.now });
    fx.emit(bubble.pop, 100, 100, { colors: ['#ff6b7a'] });
    time.tick(4000); fx.step();
    expect(fx.inspect().every(item => !('age' in item) || item.age === FX_LIMITS.maxDt)).toBe(true);
  });

  it('keeps cores local: a box core can never cover the canvas', () => {
    const { ctx, calls } = recorder(), time = clock(), fx = createFx(ctx, 600, 600, { reducedMotion: false, now: time.now });
    fx.emit({ id: 'test.huge-core', layers: [{ kind: 'core', radius: 500, life: 100, color: '#fff' }], reduced: 'none' }, 300, 300, { w: 5000, h: 5000 });
    time.tick(16); fx.draw();
    const fill = calls.find(([name]) => name === 'fillRect')!;
    expect((fill[3] as number) * (fill[4] as number)).toBeLessThan(600 * 600 * .8);
  });

  it('holds delayed emits invisible and motionless until their delay elapses', () => {
    const { ctx, calls } = recorder(), time = clock(), fx = createFx(ctx, 360, 560, { reducedMotion: false, now: time.now });
    fx.emit(bubble.pop, 50, 60, { colors: ['#70f0c2'], delay: 100 });
    const start = JSON.stringify(fx.inspect().map(item => [item.x, item.y]));
    for (let i = 0; i < 5; i++) { time.tick(16); fx.draw(); }
    expect(calls.some(([name]) => name === 'fill' || name === 'stroke' || name === 'fillRect')).toBe(false);
    expect(JSON.stringify(fx.inspect().map(item => [item.x, item.y]))).toBe(start);
    for (let i = 0; i < 3; i++) { time.tick(16); fx.draw(); }
    expect(calls.some(([name]) => name === 'fill')).toBe(true);
    expect(live(fx.inspect()).length).toBeGreaterThan(0);
  });
});

describe('shared fx: gameplay randomness is untouched', () => {
  // Same generator as core/services.ts seededRandom, counting every draw.
  const counted = (seed: number) => { let state = seed >>> 0, calls = 0; const random = () => { calls++; state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }; return { random, calls: () => calls }; };

  it('emitting every pilot recipe neither calls services.random nor Math.random, and the gameplay sequence is unchanged', () => {
    const plain = counted(42), withFx = counted(42), sequence: number[] = [], interleaved: number[] = [];
    for (let i = 0; i < 40; i++) sequence.push(plain.random());
    const original = Math.random;
    Math.random = () => { throw new Error('fx must not use Math.random'); };
    try {
      const time = clock(), fx = createFx(recorder().ctx, 360, 560, { reducedMotion: false, now: time.now });
      for (let i = 0; i < 40; i++) {
        const before = withFx.calls();
        allRecipes.forEach(recipe => fx.emit(recipe, i, i, { colors: ['#70f0c2'], dir: i, scale: 1 + i % 3, w: i % 2 ? 36 : 0, h: i % 2 ? 18 : 0 }));
        fx.burst(i, i, '#fff'); time.tick(16); fx.step(); fx.draw();
        expect(withFx.calls()).toBe(before);
        interleaved.push(withFx.random());
      }
    } finally { Math.random = original; }
    expect(interleaved).toEqual(sequence);
    expect(withFx.calls()).toBe(40);
  });

  it('keeps services and random out of the shared fx and the pilot recipes at the source level', () => {
    for (const path of ['src/games/_shared/fx.ts', 'src/games/block-drop/fx-recipes.ts', 'src/games/breakout/fx-recipes.ts', 'src/games/bubble/fx-recipes.ts']) {
      const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, path).not.toMatch(/services|Math\.random|random\(/);
    }
  });
});

describe('pilot recipes', () => {
  it('are owned per game: unique ids namespaced by slug, and no two games share a look', () => {
    const ids = allRecipes.map(recipe => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    Object.entries(pilots).forEach(([slug, module]) => {
      const recipes = recipesOf(module);
      expect(recipes.length).toBeGreaterThanOrEqual(2);
      recipes.forEach(recipe => expect(recipe.id.startsWith(`${slug}.`), recipe.id).toBe(true));
    });
    const looks = allRecipes.map(recipe => JSON.stringify(recipe.layers));
    expect(new Set(looks).size).toBe(looks.length);
    const shapes = (slug: string) => new Set(recipesOf(pilots[slug]).flatMap(recipe => recipe.layers.flatMap(layer => layer.kind === 'shards' ? [layer.shape] : [])));
    expect([...shapes('breakout')]).toEqual(['square']);
    expect([...shapes('block-drop')]).toEqual(['square']);
    expect([...shapes('bubble')]).toEqual(['circle']);
  });

  it('only use colours already in their own game source or its shell', () => {
    const shell: Record<string, string> = { 'block-drop': 'src/games/_shared/game-ui.ts', breakout: 'src/games/arcade-kit.ts', bubble: 'src/games/arcade-kit.ts' };
    Object.entries(pilots).forEach(([slug, module]) => {
      const source = (readFileSync(`src/games/${slug}/index.ts`, 'utf8') + readFileSync(shell[slug], 'utf8')).toLowerCase();
      const recipeColors = recipesOf(module).flatMap(recipe => [...recipe.layers.flatMap(layer => layer.kind === 'shards' ? [...layer.colors] : [layer.color]), ...(recipe.reduced === 'none' ? [] : [recipe.reduced.color])]);
      const previewColors = (module.preview as ReadonlyArray<{ options: { colors?: readonly string[] } }>).flatMap(sample => sample.options.colors ?? []);
      [...recipeColors, ...previewColors].forEach(color => expect(source, `${slug} ${color}`).toContain(color.toLowerCase()));
    });
  });

  it('respect the reduced-motion rule: static outlines of at most 160ms', () => {
    allRecipes.forEach(recipe => { if (recipe.reduced !== 'none') expect(recipe.reduced.life, recipe.id).toBeLessThanOrEqual(FX_LIMITS.reducedLife); });
  });

  it('separate breakout hit from break, and grow block-drop feedback with lines cleared', () => {
    const count = (recipe: FxRecipe, scale = 1) => { const fx = createFx(recorder().ctx, 600, 600, { reducedMotion: false, now: () => 0 }); fx.emit(recipe, 0, 0, { scale }); return fx.inspect(); };
    const chip = count(breakout.brickChip), shatter = count(breakout.brickShatter);
    expect(shatter.filter(item => item.kind === 'shard').length).toBeGreaterThan(chip.filter(item => item.kind === 'shard').length * 2);
    expect(chip.some(item => item.kind === 'shard' && item.gravity > 0)).toBe(false);
    expect(shatter.some(item => item.kind === 'ring')).toBe(true);
    const one = count(blockDrop.lineClear, blockDrop.lineScale(1)), four = count(blockDrop.lineClear, blockDrop.lineScale(4));
    expect(four.length).toBeGreaterThan(one.length);
  });
});
