import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { makeKit } from '../arcade-kit';
import { tr } from '../_shared/gamepad-panel';
import { FRUITS } from './fruits';
import { H, W, createRenderer, type Effects, type View } from './render';
import { BOUNDS, MAX_DROP_TIER, RADII, STEP, TIER_COUNT, clampAim, createWorld, dropFruit, step, type SimEvent, type World } from './sim';

export { canMergeFruitTier } from './sim';

const BEST_KEY = 'fruit-merge-best', DISCOVERED_KEY = 'fruit-merge-discovered';
/** Sizes the canvas to the stage: as large as the width and the visible height allow, on phones and desktop. */
const CANVAS_CSS = `.fo-canvas{width:max(230px,min(100%,440px,calc((100vh - 268px)*${W / H})));width:max(230px,min(100%,440px,calc((100dvh - 268px)*${W / H})))}`
  + `.is-immersive .fo-canvas,.game-stage:fullscreen .fo-canvas{width:max(230px,min(100%,620px,calc((100vh - 100px)*${W / H})));width:max(230px,min(100%,620px,calc((100dvh - 100px - env(safe-area-inset-top) - env(safe-area-inset-bottom))*${W / H})))}`
  + `.versus .fo-canvas{width:max(160px,min(100%,440px,calc((100vh - 330px)*${W / H})));width:max(160px,min(100%,440px,calc((100dvh - 330px)*${W / H})))}`;

export const fruitMerge: GameModule = {
  meta: { slug: 'fruit-merge', title: 'Fruit Orbit', category: 'puzzle', description: 'Drop orbiting fruit and grow them into stellar giants.', instructions: 'Drag to aim and release to drop; arrows and Space work too. Match two alike to grow them.', accent: '#ff8f70', mechanic: 'Drop and merge fruit tiers' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'fruit-merge', W, H);
    const style = document.createElement('style'); style.textContent = CANVAS_CSS; host.prepend(style);
    k.canvas.classList.add('fo-canvas'); k.canvas.style.width = ''; k.canvas.style.background = '#150f33';
    const reduced = services.isReducedMotion, touch = Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
    const draw = createRenderer(k.ctx, k.canvas.width / W);

    let raf = 0, last = 0, acc = 0, paused = false;
    let world: World = createWorld(services.random);
    let heldX = W / 2, aimPointer: number | undefined, dropBuffer = 0, holdTime = 0, warnTick = 0;
    let bestAtStart = services.storage.get<number>(BEST_KEY, 0), discovered = services.storage.get<number>(DISCOVERED_KEY, MAX_DROP_TIER);
    let time = 0, lostFor = 0, hint = true, sparkSeed = 1;
    const fx: Effects = { sparks: [], rings: [], popups: [] };
    const stripPulse: number[] = Array.from({ length: TIER_COUNT }, () => 9);
    // Cosmetic scatter only; gameplay randomness always comes from services.random.
    const scatter = () => { sparkSeed = (1664525 * sparkSeed + 1013904223) >>> 0; return sparkSeed / 2 ** 32; };

    const reset = () => {
      paused = false; k.setPaused(false);
      world = createWorld(services.random);
      bestAtStart = services.storage.get<number>(BEST_KEY, 0);
      heldX = W / 2; aimPointer = undefined; dropBuffer = 0; holdTime = 0; warnTick = 0; lostFor = 0; acc = 0; hint = true;
      fx.sparks.length = fx.rings.length = fx.popups.length = 0;
    };

    const burst = (x: number, y: number, tier: number, count: number, power: number) => {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const angle = scatter() * Math.PI * 2, speed = power * (0.45 + scatter() * 0.75), life = 0.35 + scatter() * 0.3;
        fx.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - power * 0.25, life, max: life, color: i % 3 ? FRUITS[tier].color : FRUITS[tier].light, size: 2.2 + scatter() * 2.4 });
      }
    };
    const popup = (x: number, y: number, text: string, color: string, size: number, life = 0.9) => { fx.popups.push({ x, y, text, color, size, life, max: life }); };
    /** One centred banner at a time, so a fast cascade reads as a single climbing counter. */
    const banner = (text: string, color: string, size: number) => { fx.popups = fx.popups.filter(p => !p.banner); fx.popups.push({ x: W / 2, y: BOUNDS.lineY + 104, text, color, size, life: 1.2, max: 1.2, banner: true }); };

    /** One cue per merge, climbing in pitch as a chain builds. */
    const mergeCue = (chain: number, milestone: boolean) => {
      if (milestone) services.sound.play('upgrade');
      else if (chain <= 1) services.sound.play('merge');
      else if (chain === 2) services.sound.play('collect');
      else if (chain === 3) services.sound.play('clear');
      else if (chain === 4) services.sound.play('upgrade');
      else services.sound.play('success');
    };

    const handle = (event: SimEvent) => {
      if (event.type === 'merge') {
        const { x, y, tier, chain } = event, r = RADII[tier];
        fx.rings.push({ x, y, from: r * 0.6, to: r + 22, life: 0.4, max: 0.4, color: FRUITS[tier].light });
        burst(x, y, tier, Math.min(18, 7 + tier * 2), 90 + tier * 14);
        popup(x, y - r * 0.4, `+${event.points}`, '#ffffff', Math.min(26, 16 + tier * 1.2));
        if (chain >= 2) banner(`${tr('CHAIN', '连击')} ×${chain}`, '#ffd84a', Math.min(30, 20 + chain * 2));
        stripPulse[tier] = 0;
        const milestone = event.newBiggest && tier > MAX_DROP_TIER;
        if (milestone) {
          popup(W / 2, BOUNDS.lineY + 140, tr(`${FRUITS[tier].en}!`, `${FRUITS[tier].zh}！`), FRUITS[tier].light, 22, 1.5);
          services.reportComplete(tier);
        }
        if (tier > discovered) { discovered = tier; services.storage.set(DISCOVERED_KEY, discovered); }
        mergeCue(chain, milestone);
        k.score(world.score);
      } else if (event.type === 'land') {
        if (event.speed > 260) { services.sound.play('tap'); burst(event.x, event.y + RADII[event.tier] * 0.7, event.tier, 4, 55); }
      } else {
        lostFor = 0; aimPointer = undefined; dropBuffer = 0;
        services.sound.play('fail');
        k.score(world.score);
      }
    };

    const dropped = () => { hint = false; dropBuffer = 0; heldX = clampAim(heldX, world.current); services.sound.play('move'); };
    /** Drops now, or remembers the press for a moment so a tap just before the next fruit is ready still counts. */
    const requestDrop = () => { if (dropFruit(world, heldX, services.random)) dropped(); else dropBuffer = 0.35; };
    const retry = () => { if (lostFor > 0.8) { reset(); services.sound.play('tap'); } };
    const aimAt = (x: number) => { heldX = clampAim(x, world.current); };

    k.on('pointerdown', event => {
      const e = event as PointerEvent;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (world.over) { retry(); return; }
      aimPointer = e.pointerId; aimAt(k.point(e).x);
      try { k.canvas.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    });
    k.on('pointermove', event => { const e = event as PointerEvent; if (!world.over && (e.pointerType === 'mouse' || e.pointerId === aimPointer)) aimAt(k.point(e).x); });
    k.on('pointerup', event => { const e = event as PointerEvent; if (e.pointerId !== aimPointer) return; aimPointer = undefined; if (world.over) return; aimAt(k.point(e).x); requestDrop(); });
    k.on('pointercancel', () => { aimPointer = undefined; });
    k.on('keydown', event => {
      const e = event as KeyboardEvent, key = e.key;
      if (key === ' ' || key === 'Enter') { e.preventDefault(); if (e.repeat) return; if (world.over) retry(); else requestDrop(); }
      else if (world.over) { if (key === 'r' || key === 'R') retry(); }
      else if (!e.repeat && (key === 'ArrowLeft' || key === 'a' || key === 'A')) aimAt(heldX - 5);
      else if (!e.repeat && (key === 'ArrowRight' || key === 'd' || key === 'D')) aimAt(heldX + 5);
    });

    const update = () => {
      time += STEP;
      for (let i = 0; i < TIER_COUNT; i++) stripPulse[i] += STEP;
      for (const s of fx.sparks) { s.life -= STEP; s.x += s.vx * STEP; s.y += s.vy * STEP; s.vy += 420 * STEP; }
      for (const ring of fx.rings) ring.life -= STEP;
      for (const p of fx.popups) p.life -= STEP;
      fx.sparks = fx.sparks.filter(s => s.life > 0); fx.rings = fx.rings.filter(ring => ring.life > 0); fx.popups = fx.popups.filter(p => p.life > 0);
      if (world.over) { lostFor += STEP; return; }
      // A tap nudges (handled on keydown); holding glides and speeds up for long crossings.
      const direction = (k.keys.has('ArrowRight') || k.keys.has('d') || k.keys.has('D') ? 1 : 0) - (k.keys.has('ArrowLeft') || k.keys.has('a') || k.keys.has('A') ? 1 : 0);
      if (direction) { holdTime += STEP; if (holdTime > 0.16) aimAt(heldX + direction * Math.min(380, 150 + (holdTime - 0.16) * 520) * STEP); } else holdTime = 0;
      heldX = clampAim(heldX, world.current);
      if (dropBuffer > 0) { dropBuffer -= STEP; if (dropFruit(world, heldX, services.random)) dropped(); }
      step(world);
      if (world.events.length) { const events = world.events; world.events = []; events.forEach(handle); }
      if (world.overflowing && !world.over) { warnTick -= STEP; if (warnTick <= 0) { services.sound.play('hit'); warnTick = 0.7; } } else warnTick = 0.3;
    };

    const view = (): View => ({ world, fx, heldX, best: Math.max(bestAtStart, world.score), newBest: world.score > bestAtStart && world.score > 0, discovered, stripPulse, time, lostFor, paused, hint, reduced, touch, t: tr });
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!paused) { acc += dt; while (acc >= STEP) { update(); acc -= STEP; } }
      draw(view());
    };
    draw(view());
    last = typeof performance === 'undefined' ? 0 : performance.now();
    raf = requestAnimationFrame(frame);

    k.canvas.focus({ preventScroll: true });
    return {
      pause: () => { paused = true; aimPointer = undefined; dropBuffer = 0; k.setPaused(true); },
      resume: () => { paused = false; acc = 0; k.setPaused(false); k.canvas.focus({ preventScroll: true }); },
      restart: () => { reset(); k.canvas.focus({ preventScroll: true }); },
      destroy: () => { cancelAnimationFrame(raf); style.remove(); k.dispose(); }
    };
  }
};
export default fruitMerge;
