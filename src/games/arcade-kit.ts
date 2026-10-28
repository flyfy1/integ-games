import type { GameServices } from '../core/game-types';
import { attachKeyboardMobileControls } from './_shared/mobile-controls';
import { createFx, type EmitOptions, type FxRecipe } from './_shared/fx';
/** Small canvas helpers shared by the second arcade batch. */
export type Kit = {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number;
  point(e: PointerEvent): { x: number; y: number }; keys: Set<string>;
  on(type: string, fn: EventListenerOrEventListenerObject): void; clear(): void;
  score(value: number): void; setPaused(value: boolean): void; dispose(): void;
  fx: { burst(x: number, y: number, color: string, count?: number): void; flash(color: string, life?: number): void; emit(recipe: FxRecipe, x: number, y: number, options?: EmitOptions): void; step(): void; draw(): void; clear(): void };
};

export function makeKit(host: HTMLElement, services: GameServices, slug: string, width = 360, height = 560): Kit {
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.width = width * Math.min(2, devicePixelRatio || 1); canvas.height = height * Math.min(2, devicePixelRatio || 1);
  canvas.style.cssText = 'display:block;width:min(100%,420px);height:auto;aspect-ratio:' + width + '/' + height + ';margin:auto;border-radius:16px;background:#090d18;touch-action:none;outline:none';
  canvas.tabIndex = 0; host.append(canvas);
  const ctx = canvas.getContext('2d')!; ctx.scale(canvas.width / width, canvas.height / height);
  const keys = new Set<string>(); const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  let paused = false;
  const on = (type: string, fn: EventListenerOrEventListenerObject) => {
    const guarded: EventListener = event => { if (paused) return; if (typeof fn === 'function') fn(event); else fn.handleEvent(event); };
    canvas.addEventListener(type, guarded, { passive: false }); listeners.push([canvas, type, guarded]);
  };
  const key = (down: boolean): EventListener => e => { const event = e as KeyboardEvent; if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','w','a','s','d','W','A','S','D','Escape'].includes(event.key)) event.preventDefault(); down ? keys.add(event.key) : keys.delete(event.key); };
  on('keydown', key(true)); on('keyup', key(false)); on('pointerdown', () => canvas.focus());
  const bestKey = slug + '-best';
  const score = (value: number) => { const old = services.storage.get(bestKey, 0); if (value > old) services.storage.set(bestKey, value); services.reportScore(value); };
  const fx = createFx(ctx, width, height, { reducedMotion: services.isReducedMotion });
  const mobile = attachKeyboardMobileControls(host, slug, canvas);
  return { canvas, ctx, width, height, keys, on, score, fx, setPaused(value) {
    if (value) {
      mobile?.clear();
      for (const key of keys) canvas.dispatchEvent(new KeyboardEvent('keyup', { key }));
      canvas.dispatchEvent(new Event('pointercancel')); keys.clear(); services.sound.stop();
    }
    paused = value; fx.setPaused(value);
  }, point: e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)*width/r.width, y: (e.clientY-r.top)*height/r.height }; }, clear: () => ctx.clearRect(0,0,width,height), dispose: () => { services.sound.stop(); fx.clear(); mobile?.destroy(); listeners.forEach(([t,n,f]) => t.removeEventListener(n,f)); canvas.remove(); } };
}


export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 16, color = '#f7f9ff', align: CanvasTextAlign = 'center') { ctx.fillStyle=color; ctx.font=`700 ${size}px system-ui`; ctx.textAlign=align; ctx.fillText(value,x,y); }
export function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
