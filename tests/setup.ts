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
