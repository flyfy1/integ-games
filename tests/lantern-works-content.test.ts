import { describe, expect, it, vi } from 'vitest';
import type { GameServices, GameStorage } from '../src/core/game-types';
import { catalog } from '../src/core/catalog';
import lanternWorks, { campaignNumber } from '../src/games/lantern-works';
import { CHAPTERS, LEVELS, NIGHT_LEVEL, levelById, nightTray } from '../src/games/lantern-works/data/levels';
import { matches, makeGood, mix } from '../src/games/lantern-works/goods';
import { EN, ZH } from '../src/games/lantern-works/i18n';
import { TIERS, makeable, nextOrder } from '../src/games/lantern-works/data/nightshift';
import { PARTS, PART_ORDER, dialOptions } from '../src/games/lantern-works/parts';
import { SAVE_KEY, defaultSave, isUnlocked, loadSave, migrate, recordWin, writeSave } from '../src/games/lantern-works/save';
import { parseScript, runScript } from '../src/games/lantern-works/script';
import { T, applyEdit, buildOf, createSim, loadBuild, mulberry32, run, starsOf, step, waitBeat, type Sim } from '../src/games/lantern-works/sim';
import type { LevelDef } from '../src/games/lantern-works/types';
import { SOLUTIONS } from './lantern-works-solutions';

const memory = (): GameStorage & { values: Map<string, unknown> } => {
  const values = new Map<string, unknown>();
  return { values, get: <T>(k: string, d: T) => (values.has(k) ? values.get(k) as T : d), set: (k, v) => { values.set(k, JSON.parse(JSON.stringify(v))); }, remove: k => { values.delete(k); } };
};
const services = (storage: GameStorage = memory()): GameServices => ({
  storage, sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: mulberry32(3), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});

/** The cells (kind@x,y) a solution builds before Run: the "layout" two solutions are compared by. */
const layoutOf = (lines: string[]) => new Set(parseScript(lines).filter(t => t.at === 0 && t.edit.op === 'place').map(t => t.edit.op === 'place' ? `${t.edit.kind}@${t.edit.x},${t.edit.y}` : ''));
const kindsUsed = (lines: string[]) => new Set(parseScript(lines).flatMap(t => (t.edit.op === 'place' ? [t.edit.kind] : [])));

describe('lantern works content: every level ships with replayed reference solutions', () => {
  it('has four chapters of five levels, each listed once', () => {
    expect(CHAPTERS).toHaveLength(4);
    expect(LEVELS).toHaveLength(20);
    expect(CHAPTERS.flatMap(c => c.levels)).toEqual(LEVELS.map(l => l.id));
    for (const c of CHAPTERS) expect(c.levels).toHaveLength(5);

  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      const sols = Object.entries(SOLUTIONS[level.id] ?? {});
      const results = sols.map(([name, lines]) => ({ name, lines, r: runScript(level, lines, 4000) }));

      it('every stored solution fills the order without errors or a spoiled run, using only the tray', () => {
        expect(sols.length).toBeGreaterThan(0);
        for (const { name, r } of results) {
          expect(r.errors, `${level.id} ${name}`).toEqual([]);
          expect(r.won, `${level.id} ${name} won`).toBe(true);
          expect(r.spoiled).toBe(false);
          for (const st of r.sim.stalls) for (const w of st.wants) expect(w.got).toBeGreaterThanOrEqual(w.n);
        }
      });

      it('the Tidy and Swift pars are each met by a stored solution, with only a small margin', () => {
        const bestParts = Math.min(...results.map(x => x.r.maxParts));
        const bestBeats = Math.min(...results.map(x => x.r.wonAt ?? Infinity));
        expect(bestParts).toBeLessThanOrEqual(level.parTidy);
        expect(bestBeats).toBeLessThanOrEqual(level.parSwift);
        expect(level.parTidy - bestParts).toBeLessThanOrEqual(2);
        expect(level.parSwift - bestBeats).toBeLessThanOrEqual(Math.max(4, Math.ceil(bestBeats * 0.12)));
        for (const { r } of results) expect(starsOf(r.sim).delivered).toBe(true);
      });

      it('a stored solution uses the part the level introduces (others may find another way)', () => {
        if (!level.introduces) return;
        expect(results.some(({ lines }) => kindsUsed(lines).has(level.introduces!))).toBe(true);
      });

      if (LEVELS.indexOf(level) >= LEVELS.findIndex(l => l.id === '1-5')) {
        it('has at least two solutions whose layouts differ (no lock with a single key)', () => {
          expect(sols.length).toBeGreaterThanOrEqual(2);
          let differing = false;
          for (let i = 0; i < sols.length; i++) for (let j = i + 1; j < sols.length; j++) {
            const a = layoutOf(sols[i][1]), b = layoutOf(sols[j][1]);
            const diff = [...a].filter(x => !b.has(x)).length + [...b].filter(x => !a.has(x)).length;
            if (diff >= 3) differing = true;
          }
          expect(differing).toBe(true);
        });
      }

      it('an empty board never fills the order', () => {
        const r = runScript(level, [], 1500);
        expect(r.won).toBe(false);
      });

      it('replays identically whatever order the parts are placed in', () => {
        const [, lines] = sols[0];
        const shuffled = [...lines.filter(l => !l.startsWith('@'))].reverse().concat(lines.filter(l => l.startsWith('@')));
        const a = runScript(level, lines, 4000), b = runScript(level, shuffled, 4000);
        expect(b.wonAt).toBe(a.wonAt);
        expect(b.maxParts).toBe(a.maxParts);
      });

      it('is well formed: rectangular grid, sources and stalls on the floor, bilingual text', () => {
        const w = level.grid[0].length;
        expect(level.grid.every(r => r.length === w)).toBe(true);
        expect(w).toBeLessThanOrEqual(10);
        expect(level.grid.length).toBeLessThanOrEqual(8);
        for (const p of [...level.sources, ...level.stalls]) expect(level.grid[p.y][p.x]).toBe('.');
        expect(level.name.en && level.name.zh && level.hint.en && level.hint.zh).toBeTruthy();
        for (const st of level.stalls) for (const want of st.wants) expect(() => matches(makeGood('paper'), want.good)).not.toThrow();
      });
    });
  }
});

describe('lantern works simulation rules', () => {
  const open = (grid: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
    id: 't', chapter: 1, index: 1, name: { en: 't', zh: 't' }, hint: { en: '', zh: '' }, grid, sources: [], stalls: [],
    tray: { belt: 99, folder: 9, vat: 9, joiner: 9, splitter: 9, mixer: 9, sorter: 9, bin: 9, bridge: 9, wick: 9, gate: 9, stamp: 9, bundler: 9 }, parTidy: 99, parSwift: 999, introduces: null, vatColors: ['red', 'blue'], ...extra
  });
  const runFor = (sim: Sim, beats: number) => { const ev = []; run(sim); for (let i = 0; i < beats; i++) ev.push(...step(sim)); return ev; };

  it('mixes dyes: primaries make secondaries, anything else turns muddy', () => {
    expect(mix('red', 'yellow')).toBe('orange');
    expect(mix('blue', 'yellow')).toBe('green');
    expect(mix('red', 'blue')).toBe('purple');
    expect(mix('orange', 'blue')).toBe('muddy');
    expect(mix('plain', 'red')).toBe('red');
  });

  it('a want only checks what it names', () => {
    const lantern = makeGood('lantern lotus red fu lit');
    expect(matches(lantern, 'lantern')).toBe(true);
    expect(matches(lantern, 'lantern red')).toBe(true);
    expect(matches(lantern, 'lantern red unlit')).toBe(false);
    expect(matches(lantern, 'lantern round')).toBe(false);
    expect(matches(makeGood('string red orange yellow'), 'string red orange yellow')).toBe(true);
    expect(matches(makeGood('string orange red yellow'), 'string red orange yellow')).toBe(false);
  });

  it('two belts merging into one zip their goods together in turn', () => {
    const level = open(['.....', '.....', '.....'], { sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 1 }, { x: 2, y: 0, dir: 1, goods: ['hoop'], every: 1 }], stalls: [{ x: 4, y: 1, wants: [{ good: 'paper', n: 50 }, { good: 'hoop', n: 50 }] }] });
    const r = runScript(level, ['belt 1,1 >>>'], 40);
    const st = r.sim.stalls[0];
    expect(Math.abs(st.wants[0].got - st.wants[1].got)).toBeLessThanOrEqual(1);
    expect(st.wants[0].got).toBeGreaterThan(10);
  });

  it('a splitter alternates, and uses its free side while the other is blocked', () => {
    const level = open(['.....', '.....', '.....'], { sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 1 }], stalls: [{ x: 2, y: 0, wants: [{ good: 'paper', n: 99 }] }] });
    const sim = createSim(level);
    applyEdit(sim, { op: 'place', kind: 'belt', x: 1, y: 1, dir: 0 });
    applyEdit(sim, { op: 'place', kind: 'splitter', x: 2, y: 1, dir: 0 });
    applyEdit(sim, { op: 'place', kind: 'belt', x: 2, y: 2, dir: 0 }); // leads to the floor: fills up and blocks
    runFor(sim, 30);
    expect(sim.stalls[0].got).toBeGreaterThan(20);
  });

  it('a joiner waits for both inputs and the belt behind a full slot backs up', () => {
    const level = open(['......', '......', '......'], { sources: [{ x: 0, y: 1, dir: 0, goods: ['shell round'], every: 1 }], stalls: [{ x: 5, y: 1, wants: [{ good: 'lantern', n: 1 }] }] });
    const r = runScript(level, ['belt 1,1 >>', 'joiner 3,1 >', 'belt 4,1 >'], 30);
    expect(r.won).toBe(false);
    expect(r.sim.slots[1 * 6 + 3].ins[0]?.kind).toBe('shell');
    expect(r.sim.slots[1 * 6 + 2].out?.still).toBeGreaterThan(5);
  });

  it('three wrong goods spoil the run; extras of a filled want are taken quietly', () => {
    const level = open(['....', '....'], { sources: [{ x: 0, y: 0, dir: 0, goods: ['paper'], every: 1 }], stalls: [{ x: 3, y: 0, wants: [{ good: 'hoop', n: 1 }] }] });
    const r = runScript(level, ['belt 1,0 >>'], 30);
    expect(r.spoiled).toBe(true);
    expect(r.sim.wrong).toBe(3);
    const ok = open(['....', '....'], { sources: [{ x: 0, y: 0, dir: 0, goods: ['paper'], every: 1 }], stalls: [{ x: 3, y: 0, wants: [{ good: 'paper', n: 2 }, { good: 'hoop', n: 1 }] }] });
    const r2 = runScript(ok, ['belt 1,0 >>'], 30);
    expect(r2.spoiled).toBe(false);
    expect(r2.sim.wrong).toBe(0);
  });

  it('a sorter turns matching goods aside and sends the rest straight on', () => {
    const level = open(['.....', '.....', '.....'], { sources: [{ x: 0, y: 1, dir: 0, goods: ['shell round', 'shell lotus'], every: 1 }], stalls: [{ x: 2, y: 0, wants: [{ good: 'shell lotus', n: 5 }] }] });
    const r = runScript(level, ['belt 1,1 >', 'sorter 2,1 > lotus', 'bin 3,1 >'], 40);
    expect(r.won).toBe(true);
    expect(r.sim.wrong).toBe(0);
  });

  it('a gate lets one good through every N beats', () => {
    const level = open(['......', '......'], { sources: [{ x: 0, y: 0, dir: 0, goods: ['paper'], every: 1 }], stalls: [{ x: 5, y: 0, wants: [{ good: 'paper', n: 99 }] }] });
    const r = runScript(level, ['belt 1,0 >', 'gate 2,0 > 3', 'belt 3,0 >>'], 61);
    expect(r.sim.stalls[0].got).toBeGreaterThanOrEqual(18);
    expect(r.sim.stalls[0].got).toBeLessThanOrEqual(21);
  });

  it('a bridge carries two lines across each other', () => {
    const level = open(['.....', '.....', '.....'], { sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 2, y: 0, dir: 1, goods: ['hoop'], every: 2 }], stalls: [{ x: 4, y: 1, wants: [{ good: 'paper', n: 4 }] }, { x: 2, y: 2, wants: [{ good: 'hoop', n: 4 }] }] });
    const r = runScript(level, ['belt 1,1 >', 'bridge 2,1 >', 'belt 3,1 >'], 40);
    expect(r.won).toBe(true);
  });

  it('editing while running keeps goods on re-laid belts and drops goods of removed parts', () => {
    const level = open(['......'], { sources: [{ x: 0, y: 0, dir: 0, goods: ['paper'], every: 1 }], stalls: [{ x: 5, y: 0, wants: [{ good: 'paper', n: 99 }] }] });
    const sim = createSim(level);
    for (let x = 1; x < 5; x++) applyEdit(sim, { op: 'place', kind: 'belt', x, y: 0, dir: 0 });
    runFor(sim, 3);
    const before = sim.slots[2].out;
    expect(before).toBeTruthy();
    applyEdit(sim, { op: 'place', kind: 'belt', x: 2, y: 0, dir: 0 });
    expect(sim.slots[2].out).toBe(before);
    const events: ReturnType<typeof step> = [];
    applyEdit(sim, { op: 'remove', x: 2, y: 0 }, events);
    expect(sim.slots[2].out).toBeNull();
    expect(events.some(e => e.type === 'lost')).toBe(true);
  });

  it('undo restores a build without wiping goods on unchanged cells', () => {
    const level = levelById('1-1')!;
    const sim = createSim(level);
    for (const t of parseScript(SOLUTIONS['1-1'].straight)) applyEdit(sim, t.edit);
    const snap = buildOf(sim);
    runFor(sim, 6);
    const riding = sim.slots.filter(s => s.out).length;
    applyEdit(sim, { op: 'place', kind: 'belt', x: 3, y: 3, dir: 0 });
    loadBuild(sim, snap);
    expect(buildOf(sim)).toEqual(snap);
    expect(sim.slots.filter(s => s.out).length).toBe(riding);
  });

  it('refuses parts beyond the tray and on pillars, sources and stalls', () => {
    const level = levelById('1-2')!;
    const sim = createSim(level);
    expect(applyEdit(sim, { op: 'place', kind: 'folder', x: 3, y: 2, dir: 0 })).toBe('blocked');
    expect(applyEdit(sim, { op: 'place', kind: 'folder', x: 0, y: 2, dir: 0 })).toBe('blocked');
    expect(applyEdit(sim, { op: 'place', kind: 'folder', x: 1, y: 1, dir: 0 })).toBeNull();
    expect(applyEdit(sim, { op: 'place', kind: 'folder', x: 1, y: 3, dir: 0 })).toBe('none-left');
    expect(applyEdit(sim, { op: 'place', kind: 'vat', x: 1, y: 3, dir: 0 })).toBe('not-in-tray');
    expect(sim.terrain[2 * sim.w + 3]).toBe(T.Pillar);
  });

  it('dial options exist for every part with a setting', () => {
    for (const kind of PART_ORDER) expect(PARTS[kind].name.zh.length).toBeGreaterThan(0);
    expect(dialOptions('folder', {})).toEqual(['round', 'square', 'lotus']);
    expect(dialOptions('vat', { vatColors: ['red'] })).toEqual(['fed', 'red']);
  });
});

describe('lantern works star choices', () => {
  // On these levels the fewest-parts build and the fastest build are different machines: one run cannot earn both.
  it.each(['3-2', '3-5', '4-1'])('%s: Tidy and Swift need different builds', (id) => {
    const level = levelById(id)!;
    const results = Object.values(SOLUTIONS[id]).map(lines => runScript(level, lines, 3000));
    for (const r of results) expect(r.won).toBe(true);
    expect(results.some(r => r.maxParts <= level.parTidy)).toBe(true);
    expect(results.some(r => (r.wonAt ?? Infinity) <= level.parSwift)).toBe(true);
    for (const r of results) expect(r.maxParts <= level.parTidy && (r.wonAt ?? Infinity) <= level.parSwift).toBe(false);
  });
});

describe('lantern works night shift', () => {
  it('can make every order the queue can ask for with the Night Shift tray and chutes', () => {
    const tray = NIGHT_LEVEL.tray, has = (k: keyof typeof tray) => (tray[k] ?? 0) > 0;
    const chutes = new Set(NIGHT_LEVEL.sources.flatMap((s) => s.goods));
    const primaries = new Set(NIGHT_LEVEL.vatColors ?? []);
    for (const good of TIERS.flat()) {
      const words = good.split(' ');
      expect(chutes.has('paper') && chutes.has('hoop') && has('folder') && has('joiner'), good).toBe(true);
      for (const w of words) {
        if (['red', 'yellow', 'blue'].includes(w)) expect(has('vat') && primaries.has(w as never), good).toBe(true);
        if (['orange', 'green', 'purple'].includes(w)) {
          expect(has('vat') && (has('mixer') || (tray.vat ?? 0) >= 2), good).toBe(true);
          expect([...primaries].some((a) => [...primaries].some((b) => mix(a as never, b as never) === w)), good).toBe(true);
        }
        if (w === 'lit') expect(has('wick') && chutes.has('candle'), good).toBe(true);
        if (w === 'fu') expect(has('stamp'), good).toBe(true);
        if (['round', 'square', 'lotus'].includes(w)) expect(has('folder'), good).toBe(true);
      }
    }
  });

  it('the same seed gives the same order queue (the Daily Order is shared)', () => {
    const a = createSim(NIGHT_LEVEL, 42), b = createSim(NIGHT_LEVEL, 42), c = createSim(NIGHT_LEVEL, 43);
    for (const s of [a, b, c]) { run(s); for (let i = 0; i < 200; i++) step(s); }
    expect(a.orders.map(o => o.good + o.n)).toEqual(b.orders.map(o => o.good + o.n));
    expect(JSON.stringify(a.orders)).not.toEqual(JSON.stringify(c.orders));
  });
  it('an idle shift ends after three missed orders', () => {
    const s = createSim(NIGHT_LEVEL, 9); run(s);
    let guard = 0;
    while (s.status === 'run' && guard++ < 3000) step(s);
    expect(s.status).toBe('over');
    expect(s.strikes).toBe(3);
    expect(s.score).toBe(0);
  });
  it('Night Shift offers only the parts of cleared chapters, and only orders those parts can make', () => {
    const ch1 = new Set(CHAPTERS[0].levels);
    const tray = nightTray(id => ch1.has(id));
    expect(Object.keys(tray).sort()).toEqual(['belt', 'folder', 'joiner', 'vat']);
    expect(Object.keys(nightTray(() => true)).sort()).toEqual(Object.keys(NIGHT_LEVEL.tray).sort());
    const s = createSim({ ...NIGHT_LEVEL, tray }, 11); run(s);
    const seen: string[] = [];
    for (let i = 0; i < 3000 && s.status === 'run'; i++) { for (const o of s.orders) if (!seen.includes(o.good)) seen.push(o.good); waitBeat(s); }
    expect(seen.length).toBeGreaterThan(2);
    for (const good of seen) expect(makeable(good, tray), good).toBe(true);
  });
  it('the Daily Order keeps every part, so its shared queue is unchanged by the tray filter', () => {
    for (const good of TIERS.flat()) expect(makeable(good, NIGHT_LEVEL.tray), good).toBe(true);
    const a = mulberry32(5), b = mulberry32(5);
    for (let i = 0; i < 40; i++) expect(nextOrder(a, i, i * 10, i, i % 2, NIGHT_LEVEL.tray)).toEqual(nextOrder(b, i, i * 10, i, i % 2));
  });
  it('pausing mid-shift does not stop the customers: waiting ages orders until they are missed', () => {
    const s = createSim(NIGHT_LEVEL, 9); run(s);
    while (!s.orders.length) step(s);
    const beat = s.beat, first = s.orders[0];
    for (let i = 0; i <= first.patience; i++) waitBeat(s);
    expect(s.beat).toBe(beat);
    expect(s.strikes).toBe(1);
    expect(s.orders).not.toContain(first);
    // Before the first Run, and in the campaign, waiting does nothing.
    const idle = createSim(NIGHT_LEVEL, 9);
    expect(waitBeat(idle)).toEqual([]);
    const camp = createSim(LEVELS[0], 1); run(camp);
    expect(waitBeat(camp)).toEqual([]);
  });
  it('a simple shell line scores on the first orders', () => {
    const r = runScript({ ...NIGHT_LEVEL }, ['folder 1,1 v round', 'belt 1,2 >>>>>>>>'], 400, 5);
    expect(r.sim.delivered).toBeGreaterThan(0);
  });
});

describe('lantern works save and shell', () => {
  it('round-trips and migrates junk safely', () => {
    const storage = memory();
    const save = loadSave(storage);
    expect(save).toEqual(defaultSave());
    save.levels['1-1'] = { stars: [true, true, false], bestParts: 6, bestBeats: 15, build: [{ kind: 'belt', x: 1, y: 1, dir: 0 }] };
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
    expect(storage.values.has(SAVE_KEY)).toBe(true);
    const junk = migrate({ levels: { '1-1': { stars: 'x', build: [{ kind: 'laser', x: 1, y: 1, dir: 0 }] } }, settings: { sfx: 9 }, speed: 3 });
    expect(junk.levels['1-1'].stars).toEqual([false, false, false]);
    expect(junk.levels['1-1'].build).toEqual([]);
    expect(junk.settings.sfx).toBe(1);
    expect(junk.speed).toBe(1);
  });
  it('unlocks levels in order and keeps the best records', () => {
    const save = defaultSave();
    expect(isUnlocked(save, '1-1')).toBe(true);
    expect(isUnlocked(save, '1-2')).toBe(false);
    expect(recordWin(save, '1-1', [true, false, true], 9, 15)).toEqual([true, false, true]);
    expect(recordWin(save, '1-1', [true, true, false], 6, 20)).toEqual([false, true, false]);
    expect(save.levels['1-1']).toMatchObject({ stars: [true, true, true], bestParts: 6, bestBeats: 15 });
    expect(isUnlocked(save, '1-2')).toBe(true);
  });
  it('has matching English and Chinese interface text', () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(EN).sort());
    for (const v of Object.values(ZH)) expect(v.length).toBeGreaterThan(0);
  });
  it('is in the catalog under Match & Build and numbers the campaign 1..20', () => {
    const row = catalog.find(g => g.slug === 'lantern-works');
    expect(row?.primaryCategory).toBe('match-build');
    expect(row?.traits).toEqual(['Factory', 'Levels']);
    expect(lanternWorks.meta.slug).toBe('lantern-works');
    expect(campaignNumber('1-1')).toBe(1);
    expect(campaignNumber(LEVELS[LEVELS.length - 1].id)).toBe(20);
  });
  it('mounts, opens a level, keeps the build on restart and cleans up', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const svc = services();
    const game = lanternWorks.mount(host, svc);
    const root = host.querySelector<HTMLElement>('[data-lantern-works]')!;
    expect(root).toBeTruthy();
    expect(host.querySelector('canvas')).toBe(root.querySelector('canvas'));
    const api = (root as unknown as { __lw: { openLevel(id: string): void; closeCard(): void; edit(e: unknown): boolean; run(): void; play: { sim: Sim } | null } }).__lw;
    api.openLevel('1-1');
    api.closeCard();
    expect(api.edit({ op: 'place', kind: 'belt', x: 1, y: 1, dir: 0 })).toBe(true);
    api.run();
    game.pause(); game.resume(); game.restart();
    expect(api.play?.sim.parts.filter(Boolean)).toHaveLength(1);
    expect(api.play?.sim.status).toBe('build');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(api.play?.sim.status).toBe('run');
    game.destroy();
    expect(host.querySelector('[data-lantern-works]')).toBeNull();
    host.remove();
  });
  it('a gated Night Shift keeps saved Daily parts it cannot place', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.append(host);
    const game = lanternWorks.mount(host, services());
    const root = host.querySelector<HTMLElement>('[data-lantern-works]')!;
    const api = (root as unknown as { __lw: { save: { levels: Record<string, unknown>; night: { build?: { kind: string; x: number; y: number }[] } }; openNight(mode: string): void; closeCard(): void; edit(e: unknown): boolean; play: { sim: Sim } | null } }).__lw;
    for (const id of CHAPTERS[0].levels) api.save.levels[id] = { stars: [true, false, false], bestParts: null, bestBeats: null };
    api.save.night.build = [{ kind: 'mixer', x: 5, y: 3, dir: 0 }, { kind: 'belt', x: 2, y: 2, dir: 0 }] as never;
    api.openNight('night');
    api.closeCard();
    expect(api.play!.sim.parts.flatMap(p => (p ? [p.kind] : []))).toEqual(['belt']);
    expect(api.edit({ op: 'place', kind: 'belt', x: 3, y: 2, dir: 0 })).toBe(true);
    vi.advanceTimersByTime(1000);
    const saved = (api.save.night as { build?: { kind: string }[] }).build ?? [];
    expect(saved.map(p => p.kind).sort()).toEqual(['belt', 'belt', 'mixer']);
    game.destroy(); host.remove();
    vi.useRealTimers();
  });
  it('every Night Shift part has a key, and its chip shows it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = lanternWorks.mount(host, services());
    const root = host.querySelector<HTMLElement>('[data-lantern-works]')!;
    const api = (root as unknown as { __lw: { unlockAll(): void; openNight(mode: string): void; closeCard(): void; play: { tool: string } | null } }).__lw;
    api.unlockAll();
    api.openNight('night');
    api.closeCard();
    const kinds = PART_ORDER.filter(k => NIGHT_LEVEL.tray[k] !== undefined);
    expect(kinds).toHaveLength(12);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
    const chips = [...root.querySelectorAll('.lw-tool i')].map(i => i.textContent);
    kinds.forEach((kind, i) => {
      if (kind !== 'belt') { root.dispatchEvent(new KeyboardEvent('keydown', { key: keys[i], bubbles: true })); expect(api.play?.tool, keys[i]).toBe(kind); }
      expect(chips[i]).toBe(keys[i]);
    });
    game.destroy(); host.remove();
  });
});
