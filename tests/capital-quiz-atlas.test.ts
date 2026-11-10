import { describe, expect, it } from 'vitest';
import game from '../src/games/capital-quiz';
import { COUNTRIES, SHAPE_COUNTRIES } from '../src/games/capital-quiz/data';
import { EN, ZH } from '../src/games/capital-quiz/i18n';
import { MODES, PLAYS, ROUND_LENGTH, ROUND_PLAN, WEIGHTS, answerOf, atlasTotal, buildMixRound, buildRound, cleanAtlas, emptyAtlas, isPlay, poolFor, weigher } from '../src/games/capital-quiz/logic';
import type { GameServices } from '../src/core/game-types';

const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
function mount(values = new Map<string, unknown>(), seed = 7) {
  const services: GameServices = {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
    random: seeded(seed), reportScore: () => undefined, reportComplete: () => undefined, isReducedMotion: true
  };
  const host = document.createElement('div'); document.body.append(host);
  return { host, values, controller: game.mount(host, services) };
}
type Saved = { round: Array<{ country: string; options: string[]; kind?: 'capital' | 'flag' | 'shape' }>; index: number; mode: string };
/** Answer the question on screen right or wrong by looking the answer up in the save. */
function answer(host: HTMLElement, values: Map<string, unknown>, right: boolean) {
  const save = values.get('save') as Saved, q = save.round[save.index], kind = save.mode === 'mix' ? q.kind! : (save.mode as 'capital' | 'flag' | 'shape');
  const entry = COUNTRIES.find((c) => c.country === q.country)!, at = q.options.indexOf(answerOf(entry, kind));
  host.querySelectorAll<HTMLButtonElement>('.cq-option')[right ? at : (at + 1) % 4].click();
  return { entry, kind };
}
const next = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-next-btn]')!.click();

describe('Geo Quiz mixed round', () => {
  it('mixes all three kinds along the usual ramp with ten different countries', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const round = buildMixRound(seeded(seed));
      expect(round).toHaveLength(ROUND_LENGTH);
      expect(new Set(round.map((q) => q.entry.country)).size).toBe(ROUND_LENGTH);
      for (const mode of MODES) expect(round.filter((q) => q.kind === mode).length, mode).toBeGreaterThanOrEqual(3);
      round.forEach((q, i) => {
        expect(q.entry.difficulty).toBe(ROUND_PLAN[i]);
        expect(q.options[q.answerIndex]).toBe(answerOf(q.entry, q.kind!));
        expect(new Set(q.options).size).toBe(4);
        if (q.kind === 'shape') expect(SHAPE_COUNTRIES).toContain(q.entry);
      });
    }
    expect(PLAYS).toEqual([...MODES, 'mix']);
    expect(isPlay('mix')).toBe(true);
    expect(isPlay('nope')).toBe(false);
  });

  it('names the mixed round in both languages', () => {
    for (const dict of [EN, ZH]) for (const key of ['mode.mix.name', 'mode.mix.blurb', 'mode.mix.again', 'mode.mix.short'] as const) expect(dict[key].length).toBeGreaterThan(0);
  });

  it('plays a mixed round from the menu, survives a reload mid-round and keeps its own best', () => {
    const first = mount();
    expect(first.host.querySelectorAll('[data-mode]')).toHaveLength(4);
    first.host.querySelector<HTMLButtonElement>('[data-mode="mix"]')!.click();
    const kinds = new Set<string>();
    for (let i = 0; i < 4; i++) { kinds.add(answer(first.host, first.values, true).kind); next(first.host); }
    first.controller.destroy(); first.host.remove();
    const second = mount(first.values);
    expect(second.host.querySelector('[data-q]')!.textContent).toBe(`5/${ROUND_LENGTH}`);
    for (let i = 4; i < ROUND_LENGTH; i++) { kinds.add(answer(second.host, second.values, true).kind); next(second.host); }
    expect(kinds.size).toBe(3);
    expect(second.host.querySelector('.cq-result')).not.toBeNull();
    expect(second.values.get('capital-quiz-best-mix')).toBeGreaterThan(1000);
    expect(second.values.get('capital-quiz-best')).toBeUndefined();
    second.controller.destroy(); second.host.remove();
  });
});

describe('Geo Quiz atlas', () => {
  it('drops unknown, duplicate and malformed entries from a stored atlas', () => {
    expect(cleanAtlas(null)).toEqual(emptyAtlas());
    expect(cleanAtlas({ capital: ['FR', 'FR', 'ZZ', 7], flag: 'x', shape: ['JP', 'LU'] })).toEqual({ capital: ['FR'], flag: [], shape: SHAPE_COUNTRIES.some((c) => c.iso === 'LU') ? ['JP', 'LU'] : ['JP'] });
    expect(atlasTotal('capital')).toBe(COUNTRIES.length);
    expect(atlasTotal('shape')).toBe(SHAPE_COUNTRIES.length);
  });

  it('asks missed countries again sooner and known ones less often', () => {
    const easy = COUNTRIES.filter((c) => c.difficulty === 1), missedIso = easy[0].iso, known = { ...emptyAtlas(), capital: easy.slice(1).map((c) => c.iso) };
    const weigh = weigher(known, { ...emptyAtlas(), capital: [missedIso] });
    expect(weigh(easy[0], 'capital')).toBe(WEIGHTS.review);
    expect(weigh(easy[1], 'capital')).toBe(WEIGHTS.known);
    expect(weigh(easy[1], 'flag')).toBe(WEIGHTS.fresh);
    let withWeights = 0, without = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (buildRound(seeded(seed), COUNTRIES, 'capital', COUNTRIES, weigh).some((q) => q.entry.iso === missedIso)) withWeights++;
      if (buildRound(seeded(seed), COUNTRIES, 'capital').some((q) => q.entry.iso === missedIso)) without++;
    }
    expect(withWeights).toBeGreaterThan(without * 2);
    // Weighted rounds still follow the plan with unique countries.
    const round = buildRound(seeded(3), poolFor('shape'), 'shape', COUNTRIES, weigh);
    expect(new Set(round.map((q) => q.entry.country)).size).toBe(ROUND_LENGTH);
  });

  it('collects right answers, queues misses for a second chance and shows both', () => {
    const { host, values, controller } = mount();
    expect(host.querySelector('.cq-atlas small')!.textContent).toBe(`Atlas 0/${COUNTRIES.length}`);
    host.querySelector<HTMLButtonElement>('[data-mode="capital"]')!.click();
    const hit = answer(host, values, true).entry;
    expect(host.querySelector('.cq-tag.is-new')!.textContent).toBe(`🌍 New · atlas 1/${COUNTRIES.length}`);
    host.querySelector<HTMLButtonElement>('[data-lang="zh"]')!.click();
    expect(host.querySelector('.cq-tag.is-new')!.textContent).toBe(`🌍 新收录 · 图鉴 1/${COUNTRIES.length}`);
    host.querySelector<HTMLButtonElement>('[data-lang="en"]')!.click();
    next(host);
    const miss = answer(host, values, false).entry;
    expect(host.querySelector('.cq-tag')).toBeNull();
    expect(values.get('atlas')).toMatchObject({ capital: [hit.iso] });
    expect(values.get('review')).toMatchObject({ capital: [miss.iso] });
    next(host);
    for (let i = 2; i < ROUND_LENGTH; i++) { answer(host, values, true); next(host); }
    const rows = [...host.querySelectorAll('.cq-break div')].map((d) => d.textContent);
    expect(rows.at(-1)).toContain(`+${ROUND_LENGTH - 1}`);
    expect(host.querySelector('.cq-recap small')!.textContent).toBe(EN['result.recapNote']);
    host.querySelector<HTMLButtonElement>('[data-menu]')!.click();
    expect(host.querySelector('.cq-atlas small')!.textContent).toBe(`Atlas ${ROUND_LENGTH - 1}/${COUNTRIES.length}`);
    controller.destroy(); host.remove();
  });

  it('flags a returning miss as a second chance and clears it once answered right', () => {
    // Every easy capital but one is already known, and that one was missed: it must open the round.
    const easy = COUNTRIES.filter((c) => c.difficulty === 1), target = easy[5];
    const values = new Map<string, unknown>([['atlas', { ...emptyAtlas(), capital: [] }], ['review', { ...emptyAtlas(), capital: [target.iso] }]]);
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      const game1 = mount(new Map(values), seed);
      game1.host.querySelector<HTMLButtonElement>('[data-mode="capital"]')!.click();
      for (let i = 0; i < 3 && !seen; i++) {
        const save = game1.values.get('save') as Saved;
        if (save.round[save.index].country === target.country) {
          seen = true;
          expect(game1.host.querySelector('.cq-tag')!.textContent).toBe(EN['atlas.retry']);
          answer(game1.host, game1.values, true);
          expect(game1.values.get('review')).toMatchObject({ capital: [] });
          expect(game1.host.querySelector('.cq-tag.is-new')).not.toBeNull();
        } else { answer(game1.host, game1.values, true); next(game1.host); }
      }
      game1.controller.destroy(); game1.host.remove();
    }
    expect(seen).toBe(true);
  });
});
