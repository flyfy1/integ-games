import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@integ-life/ui/static';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('shared family bar host integration', () => {
  it('keeps host controls and listeners through mounting and locale changes', () => {
    const bar = document.createElement('integ-family-bar');
    bar.setAttribute('product', 'games');
    bar.innerHTML = '<div data-il-actions><button>Mute sound</button></div>';
    const mute = bar.querySelector('button')!;
    const onMute = vi.fn();
    mute.addEventListener('click', onMute);
    document.body.append(bar);
    expect(bar.querySelector('[data-il-actions] button')).toBe(mute);
    bar.setAttribute('locale', 'zh-CN');
    mute.click();
    expect(onMute).toHaveBeenCalledOnce();
    expect(bar.querySelector('[data-il-switch]')?.getAttribute('aria-label')).toBe('切换产品');
    const links = [...bar.querySelectorAll('.il-product-list a')];
    expect(links).toHaveLength(12);
    expect(links.every(link => link.querySelector('img')?.getAttribute('src')?.startsWith('data:image/svg+xml,'))).toBe(true);
    expect(links.find(link => link.getAttribute('aria-current'))?.getAttribute('href')).toBe('https://games.integ.life/');
    expect(links.every(link => (link.querySelector('small')?.textContent?.length || 0) > 6)).toBe(true);
  });

  it('keeps a chosen theme across route remounts while respecting the game default', () => {
    const bar = document.createElement('integ-family-bar');
    bar.setAttribute('default-theme', 'dark');
    document.body.append(bar);
    expect(document.documentElement.dataset.integTheme).toBe('dark');
    const theme = bar.querySelector('select')!;
    theme.value = 'light';
    theme.dispatchEvent(new Event('change'));
    bar.remove();
    document.body.append(bar);
    expect(document.documentElement.dataset.integTheme).toBe('light');
    expect(bar.querySelector('select')?.value).toBe('light');
  });
});
