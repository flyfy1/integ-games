import { describe, expect, it } from 'vitest';
import game from '../src/games/capital-quiz';
import { COUNTRIES, SHAPE_COUNTRIES } from '../src/games/capital-quiz/data';
import { EN, ZH, LANGS, capitalName, countryName, regionName, t } from '../src/games/capital-quiz/i18n';
import { NAMES_ZH, REGION_ZH } from '../src/games/capital-quiz/names-zh';
import type { GameServices } from '../src/core/game-types';

const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const HAN = /\p{Script=Han}/u;

function services(values = new Map<string, unknown>()): GameServices {
  return {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
    random: seeded(7), reportScore: () => undefined, reportComplete: () => undefined, isReducedMotion: true
  };
}

describe('Geo Quiz bilingual data', () => {
  it('has a Chinese country and capital name for every one of the countries, and no extras', () => {
    expect(COUNTRIES).toHaveLength(155); // the brief said 156; the actual bank has 155
    expect(Object.keys(NAMES_ZH).sort()).toEqual(COUNTRIES.map((c) => c.iso).sort());
    for (const c of COUNTRIES) {
      expect(countryName(c, 'en')).toBe(c.country);
      expect(capitalName(c, 'en')).toBe(c.capital);
      expect(countryName(c, 'zh'), c.iso).toMatch(HAN);
      expect(capitalName(c, 'zh'), c.iso).toMatch(HAN);
    }
  });

  it('keeps names unique per language and does not swap country with capital', () => {
    for (const lang of LANGS) {
      expect(new Set(COUNTRIES.map((c) => countryName(c, lang))).size, `${lang} countries`).toBe(COUNTRIES.length);
      expect(new Set(COUNTRIES.map((c) => capitalName(c, lang))).size, `${lang} capitals`).toBe(COUNTRIES.length);
    }
    // Country and capital may only share a Chinese name where they already share an English one (Singapore, Djibouti).
    for (const c of COUNTRIES) if (countryName(c, 'zh') === capitalName(c, 'zh')) expect(c.country, c.iso).toBe(c.capital);
    const spot: Record<string, [string, string]> = { FR: ['法国', '巴黎'], JP: ['日本', '东京'], KR: ['韩国', '首尔'], CN: ['中国', '北京'], US: ['美国', '华盛顿'], AU: ['澳大利亚', '堪培拉'] };
    for (const [iso, [country, capital]] of Object.entries(spot)) expect(NAMES_ZH[iso]).toEqual([country, capital]);
  });

  it('translates every region used by the bank', () => {
    for (const r of new Set(COUNTRIES.map((c) => c.region))) {
      expect(REGION_ZH[r]).toMatch(HAN);
      expect(regionName(r, 'en')).toBe(r);
      expect(regionName(r, 'zh')).toBe(REGION_ZH[r]);
    }
    expect(Object.keys(REGION_ZH)).toHaveLength(6);
  });

  it('has the same UI keys in both languages with matching placeholders and no empty text', () => {
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(EN).sort());
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(EN) as Array<keyof typeof EN>) {
      expect(EN[key].length, key).toBeGreaterThan(0);
      expect(ZH[key].length, key).toBeGreaterThan(0);
      expect(holes(ZH[key]), key).toBe(holes(EN[key]));
    }
    expect(t('zh', 'fb.correct', { n: 150 })).toBe('答对了！+150');
  });
});

describe('Geo Quiz language switching', () => {
  const mount = (values = new Map<string, unknown>()) => {
    const host = document.createElement('div');
    document.body.append(host);
    const controller = game.mount(host, services(values));
    return { host, controller, values };
  };
  const pressLang = (host: HTMLElement, lang: string) => host.querySelector<HTMLButtonElement>(`[data-lang="${lang}"]`)!.click();

  it('defaults from the browser language, persists the choice and exposes a toggle on every screen', () => {
    const { host, controller, values } = mount();
    expect(host.querySelector('h2')?.textContent).toBe('Geo Quiz');
    expect(host.querySelector('.cq-mode strong')?.textContent).toBe('Guess the capital');
    pressLang(host, 'zh');
    expect(values.get('lang')).toBe('zh');
    expect(host.querySelector('.cq-mode strong')?.textContent).toBe('猜首都');
    expect(host.querySelector('[data-lang="zh"]')?.getAttribute('aria-pressed')).toBe('true');
    controller.destroy();
    const again = mount(values);
    expect(again.host.querySelector('.cq-mode strong')?.textContent).toBe('猜首都');
    again.controller.destroy();
  });

  it('keeps the round, score and streak when switching mid-question and after answering', () => {
    const { host, controller } = mount();
    host.querySelector<HTMLButtonElement>('[data-mode="capital"]')!.click();
    const opts = () => [...host.querySelectorAll('.cq-option')].map((b) => b.textContent!);
    const enOptions = opts(), enTitle = host.querySelector('.cq-card h2')!.textContent;
    pressLang(host, 'zh');
    expect(opts().every((o) => HAN.test(o))).toBe(true);
    expect(host.querySelector('.cq-card h2')!.textContent).not.toBe(enTitle);
    expect(host.querySelector('.cq-chip')!.textContent).toMatch(HAN);
    const entry = COUNTRIES.find((c) => c.country === enTitle)!;
    expect(opts()).toContain(capitalName(entry, 'zh'));
    expect(opts()).toHaveLength(enOptions.length);

    // Answer correctly, then switch: score and feedback survive in the new language.
    const right = opts().indexOf(capitalName(entry, 'zh'));
    host.querySelectorAll<HTMLButtonElement>('.cq-option')[right].click();
    expect(host.querySelector('[data-score]')!.textContent).toBe('100');
    pressLang(host, 'en');
    expect(host.querySelector('[data-score]')!.textContent).toBe('100');
    expect(host.querySelector('.cq-feedback')!.textContent).toContain('Correct! +100');
    expect(host.querySelector('.cq-option.is-right')!.textContent).toBe(entry.capital);
    expect(host.querySelector('[data-next-btn]')).not.toBeNull();
    controller.destroy();
  });

  it('plays a full flag round in Chinese, then localises the result screen and recap', () => {
    const values = new Map<string, unknown>([['lang', 'zh']]);
    const { host, controller } = mount(values);
    host.querySelector<HTMLButtonElement>('[data-mode="flag"]')!.click();
    expect(host.querySelector('[data-prompt]')!.textContent).toBe('这是哪个国家的国旗？');
    for (let i = 0; i < 10; i++) {
      const buttons = host.querySelectorAll<HTMLButtonElement>('.cq-option');
      expect([...buttons].every((b) => HAN.test(b.textContent!))).toBe(true);
      buttons[0].click(); // mostly wrong on purpose so the recap fills
      host.querySelector<HTMLButtonElement>('[data-next-btn]')!.click();
    }
    expect(host.querySelector('.cq-result')).not.toBeNull();
    expect(host.querySelector('.cq-recap p')!.textContent).toBe('值得记住');
    const missedZh = [...host.querySelectorAll('.cq-missed li')].map((l) => l.textContent!);
    expect(missedZh.length).toBeGreaterThan(0);
    pressLang(host, 'en');
    expect(host.querySelector('.cq-recap p')!.textContent).toBe('Worth remembering');
    const missedEn = [...host.querySelectorAll('.cq-missed li')].map((l) => l.textContent!);
    expect(missedEn).toHaveLength(missedZh.length);
    expect(missedEn.every((m) => !HAN.test(m))).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-again]')!.click();
    expect(host.querySelector('.cq-option')).not.toBeNull();
    controller.destroy();
  });

  it('shows Chinese country options for the outline mode', () => {
    const { host, controller } = mount(new Map<string, unknown>([['lang', 'zh']]));
    host.querySelector<HTMLButtonElement>('[data-mode="shape"]')!.click();
    const names = new Set(SHAPE_COUNTRIES.map((c) => countryName(c, 'zh')));
    for (const b of host.querySelectorAll('.cq-option')) expect(names.has(b.textContent!) || COUNTRIES.some((c) => countryName(c, 'zh') === b.textContent)).toBe(true);
    expect(host.querySelector('svg.cq-shape')).not.toBeNull();
    controller.destroy();
  });
});
