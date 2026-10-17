import { vi } from 'vitest';

const gradient = { addColorStop: () => undefined };
const context = new Proxy({
  canvas: document.createElement('canvas'),
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  getImageData: () => ({ data: new Uint8ClampedArray() })
} as Record<string, unknown>, {
  get(target, property) { return typeof property === 'string' && property in target ? target[property] : () => undefined; },
  set: () => true
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => context });
Object.defineProperty(globalThis, 'requestAnimationFrame', { writable: true, value: vi.fn(() => 1) });
Object.defineProperty(globalThis, 'cancelAnimationFrame', { writable: true, value: vi.fn() });

// Node 26's native localStorage can be present but undefined without a backing file.
// Supply the browser Storage contract for unit tests in that environment only.
if (!globalThis.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size; },
    getItem: (key: string) => values.get(String(key)) ?? null,
    setItem: (key: string, value: string) => { values.set(String(key), String(value)); },
    removeItem: (key: string) => { values.delete(String(key)); },
    clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null
  } });
}
