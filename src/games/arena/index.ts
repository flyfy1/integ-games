import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit } from '../arcade-kit';
import { burstRect, cardRects, createRenderer, xpBarRect, type Ui, type View } from './render';
import { chooseUpgrade, createState, step, STEP, type Input, type SimEvent, type State } from './sim';

/**
 * Pocket Survivor shell: owns the canvas size, input, audio cues and the fixed-step loop. The rules live in `sim.ts`
 * and the drawing in `render.ts`.
 */
const BEST_KEY = 'arena-best';
type Stick = { id: number; x: number; y: number; dx: number; dy: number };

export const arena: GameModule = { meta: { slug: 'arena', title: 'Pocket Survivor', category: 'action', description: 'Outlast a growing swarm, evolve five auto-weapons and take down the Warden at 5:00.', instructions: 'Move with WASD, arrows, drag, or the virtual stick. Attacks are automatic; pick an upgrade each level. Space or Attack fires your Burst when it is charged.', accent: '#70f0c2', mechanic: 'Move, auto-attack, choose upgrades' }, mount(host: HTMLElement, services: GameServices): GameController {
  const k = makeKit(host, services, 'arena');
  const canvas = k.canvas, ctx = k.ctx, renderer = createRenderer(services.isReducedMotion);
  const touch = !!host.querySelector('.mobile-controls'), seat = host.hasAttribute('data-versus-seat');
  // Shell buttons (Restart, Pause) take keyboard focus; hand it back so WASD keeps working.
  const focus = () => { if (!seat) canvas.focus({ preventScroll: true }); };
  const knob = host.querySelector<HTMLElement>('.mobile-stick span');
  const view: View = { w: 360, h: 560, scale: 1 };
  let dpr = 1, raf = 0, last = 0, acc = 0, paused = false;
  let state: State = createState(services.random);
  let stick: Stick | null = null, burstQueued = false, selected = 0, lock = 0, clock = 0, best = 0, newBest = false, reported = 0, reportTimer = 0;
  let attackCueCooldown = 0, hurtCueCooldown = 0, collectCueCooldown = 0, barFlash = false;

  // ---- stage sizing: fill the stage on phones and desktop instead of a fixed 360x560 box ----
  const layout = () => {
    const style = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
    const fill = host.classList.contains('is-immersive') || document.fullscreenElement === host;
    const controls = host.querySelector<HTMLElement>('.mobile-controls');
    let controlsHeight = 0;
    if (controls) { const css = getComputedStyle(controls); if (css.display !== 'none' && css.position !== 'absolute') controlsHeight = controls.offsetHeight; }
    const hostWidth = host.clientWidth - pad(style.paddingLeft, style.paddingRight);
    let width = hostWidth > 40 ? hostWidth : 360;
    let height = fill && host.clientHeight > 0 ? host.clientHeight - pad(style.paddingTop, style.paddingBottom) - controlsHeight : clamp(window.innerHeight - (seat ? 270 : 230), 320, 660);
    height = Math.floor(clamp(height, 240, width * 1.75)); width = Math.floor(Math.min(width, height * 1.9, 1500));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (view.w !== width || view.h !== height || canvas.width !== Math.round(width * dpr)) {
      view.w = width; view.h = height; view.scale = clamp(Math.min(width, height) / 380, 0.75, 2.4);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.style.aspectRatio = 'auto'; canvas.style.maxWidth = '100%';
    }
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
  observer?.observe(host);
  window.addEventListener('resize', layout);

  const reset = () => {
    paused = false; k.setPaused(false);
    state = createState(services.random); renderer.reset(); k.fx.clear();
    stick = null; burstQueued = false; selected = touch ? -1 : 0; lock = 0; acc = 0; clock = 0; newBest = false; reported = 0; reportTimer = 0;
    attackCueCooldown = 0; hurtCueCooldown = 0; collectCueCooldown = 0; barFlash = false;
    best = services.storage.get(BEST_KEY, 0);
    focus();
  };
  const report = () => { if (state.score !== reported) { reported = state.score; k.score(state.score); } };
  const choose = (index: number) => {
    if (state.phase !== 'levelup' || lock > 0) return;
    const card = state.choices[index], rect = cardRects(view, state.choices.length)[index];
    if (!card || !chooseUpgrade(state, index)) return;
    k.fx.clear(); barFlash = false;
    if (!services.isReducedMotion) k.fx.burst(rect.x + rect.w / 2, rect.y + rect.h / 2, card.color, 14);
    renderer.banner(card.evolve ? `${card.name.toUpperCase()} EVOLVED` : card.name.toUpperCase(), 'good', 1.6);
    services.reportComplete(state.level); services.sound.play('merge');
    selected = touch ? -1 : 0;
  };

  // ---- audio and juice: every cue is rate-limited so a full screen of kills never turns into noise ----
  const onEvent = (event: SimEvent) => {
    renderer.onEvent(event, state);
    switch (event.type) {
      case 'kill': if (event.elite) services.sound.play('clear'); else if (attackCueCooldown <= 0) { services.sound.play('tap'); attackCueCooldown = 0.13; } break;
      case 'hurt': if (hurtCueCooldown <= 0) { services.sound.play('hit'); hurtCueCooldown = 0.25; } if (!services.isReducedMotion) navigator.vibrate?.(25); break;
      case 'gem': if (event.kind !== 'xp') services.sound.play('jump'); else if (collectCueCooldown <= 0) { services.sound.play('collect'); collectCueCooldown = 0.16; } break;
      case 'levelup': selected = touch ? -1 : 0; lock = 0.4; stick = null; k.fx.clear(); k.fx.flash('#b9a8ff', 16); barFlash = true; services.sound.play('upgrade'); break;
      case 'burst': services.sound.play('clear'); break;
      case 'banner': if (event.tone === 'warn') services.sound.play('move'); break;
      case 'bossdown': services.sound.play('success'); report(); break;
      case 'dead': lock = 0.7; stick = null; newBest = state.score > best; report(); services.sound.play('fail'); break;
    }
  };

  const ui = (): Ui => ({
    best, newBest, selected, locked: lock > 0, touch, paused, clock, stick,
    hint: state.time < 7 ? (touch ? 'Drag to move - attacks are automatic' : 'WASD or arrows to move - attacks are automatic') : '',
    burstLabel: touch ? 'TAP - BURST READY' : 'SPACE - BURST READY', retryLabel: touch ? 'Tap to play again' : 'Space or Enter - play again'
  });

  // ---- input ----
  const held = (...names: string[]) => names.some(name => k.keys.has(name));
  const readInput = (): Input => {
    let mx = 0, my = 0;
    if (held('ArrowLeft', 'a', 'A')) mx--; if (held('ArrowRight', 'd', 'D')) mx++; if (held('ArrowUp', 'w', 'W')) my--; if (held('ArrowDown', 's', 'S')) my++;
    // The shared on-screen stick only sends four arrow keys; its knob offset gives smooth 360-degree movement.
    const match = knob ? /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(knob.style.transform) : null;
    if (match) { const reach = ((knob!.parentElement?.offsetWidth ?? 110) || 110) * 0.34, x = Number(match[1]) / reach, y = Number(match[2]) / reach; if (Math.hypot(x, y) > 0.2) { mx = x; my = y; } }
    if (stick) { mx = stick.dx; my = stick.dy; }
    const burst = burstQueued; burstQueued = false;
    return { mx, my, burst };
  };
  const point = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * view.w / (rect.width || view.w), y: (event.clientY - rect.top) * view.h / (rect.height || view.h) }; };
  const cardAt = (x: number, y: number) => cardRects(view, state.choices.length).findIndex(rect => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
  k.on('pointerdown', raw => {
    const event = raw as PointerEvent, at = point(event);
    if (state.phase === 'dead') { if (lock <= 0) reset(); return; }
    if (state.phase === 'levelup') { const index = cardAt(at.x, at.y); if (index >= 0) choose(index); return; }
    const pill = burstRect(view, ui());
    if (state.burst >= state.burstNeed && at.x >= pill.x - 8 && at.x <= pill.x + pill.w + 8 && at.y >= pill.y - 8 && at.y <= pill.y + pill.h + 8) { burstQueued = true; return; }
    stick = { id: event.pointerId, x: at.x, y: at.y, dx: 0, dy: 0 };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
  });
  k.on('pointermove', raw => {
    const event = raw as PointerEvent, at = point(event);
    if (state.phase === 'levelup' && event.pointerType === 'mouse') { const index = cardAt(at.x, at.y); if (index >= 0) selected = index; return; }
    if (!stick || stick.id !== event.pointerId) return;
    const dx = (at.x - stick.x) / 44, dy = (at.y - stick.y) / 44, length = Math.hypot(dx, dy);
    stick.dx = length > 1 ? dx / length : dx; stick.dy = length > 1 ? dy / length : dy;
    if (length < 0.15) { stick.dx = 0; stick.dy = 0; }
  });
  k.on('pointerup', raw => { if (stick && (raw as PointerEvent).pointerId === stick.id) stick = null; });
  k.on('pointercancel', raw => { const id = (raw as PointerEvent).pointerId; if (id === undefined || id === stick?.id) stick = null; });
  k.on('keydown', raw => {
    const event = raw as KeyboardEvent, key = event.key;
    if (state.phase === 'dead') { if (lock <= 0 && (key === ' ' || key === 'Enter' || key === 'r' || key === 'R')) reset(); return; }
    if (state.phase === 'levelup') {
      if (key >= '1' && key <= '3') { choose(Number(key) - 1); return; }
      if (event.repeat) return;
      const count = state.choices.length, current = selected < 0 ? 0 : selected;
      if (['ArrowLeft', 'ArrowUp', 'a', 'A', 'w', 'W'].includes(key)) selected = selected < 0 ? 0 : (current + count - 1) % count;
      else if (['ArrowRight', 'ArrowDown', 'd', 'D', 's', 'S'].includes(key)) selected = selected < 0 ? 0 : (current + 1) % count;
      else if ((key === 'Enter' || key === ' ') && selected >= 0) choose(selected);
      return;
    }
    if (key === ' ' && !event.repeat) burstQueued = true;
  });

  const draw = (dt: number) => {
    const current = ui();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderer.draw(ctx, state, view, current, dt);
    // Kit effects: the level-up flash is clipped to the XP bar (never the whole canvas); pick sparkles are free.
    ctx.save();
    if (barFlash) { const bar = xpBarRect(view, current); ctx.beginPath(); ctx.rect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4); ctx.clip(); ctx.scale(view.w / k.width, view.h / k.height); }
    k.fx.draw();
    ctx.restore();
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0; last = now;
    if (!paused) {
      clock += dt; lock = Math.max(0, lock - dt); attackCueCooldown -= dt; hurtCueCooldown -= dt; collectCueCooldown -= dt;
      if (state.phase === 'play') {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5 && state.phase === 'play') {
          step(state, readInput()); acc -= STEP; steps++;
          if (state.events.length) { const events = state.events; state.events = []; events.forEach(onEvent); }
        }
        if (steps === 5 || state.phase !== 'play') acc = 0;
        reportTimer += dt; if (reportTimer >= 0.5) { reportTimer = 0; report(); }
      }
      k.fx.step();
    }
    draw(paused ? 0 : dt);
  };

  layout(); reset();
  // Dev-only hook so a run can be fast-forwarded for screenshots; stripped from production builds.
  if (import.meta.env.DEV) (canvas as HTMLCanvasElement & { arenaDebug?: unknown }).arenaDebug = {
    get state() { return state; },
    advance(seconds: number, immortal = true, stopAtLevelUp = false) {
      for (let tick = 0; tick < seconds / STEP && state.phase !== 'dead'; tick++) {
        if (state.phase === 'levelup') { if (stopAtLevelUp) { onEvent({ type: 'levelup' }); return; } chooseUpgrade(state, 0); continue; }
        step(state, { mx: Math.cos(state.time * 0.7), my: Math.sin(state.time * 0.7), burst: true }); if (immortal) state.hp = state.maxHp; state.events = [];
      }
    }
  };
  frame(performance.now());
  return {
    pause: () => { paused = true; k.setPaused(true); stick = null; burstQueued = false; },
    resume: () => { paused = false; k.setPaused(false); last = 0; focus(); },
    restart: reset,
    destroy: () => { cancelAnimationFrame(raf); observer?.disconnect(); window.removeEventListener('resize', layout); k.dispose(); }
  };
} };
export default arena;
