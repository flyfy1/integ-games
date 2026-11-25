import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAudio } from './audio';
import { GARDENS, HOLES, gardenOf, holeById } from './holes';
import { createI18n, defaultLang, PLAYER_COLORS, PLAYER_NAMES, type Key, type Lang } from './i18n';
import { BALL_R, DT, anyMoving, createWorld, height, simulateShot, step, strike, type SimEvent, type World } from './physics';
import { acesFound, isUnlocked, loadSave, recordHole, totalStars, writeSave, type Save, blankSave } from './save';
import { STYLES } from './styles';
import type { Hole } from './types';
import type { Gl } from './pebble-putt-gl';

/**
 * Pebble Putt shell: DOM menus and HUD, input, the fixed-step loop and the turn/score rules. The physics lives in
 * `physics.ts` (pure, shared with the bots), the 3D garden in `pebble-putt-gl.ts`, which is imported lazily so
 * Three.js only downloads when this game opens, and a plain message replaces the garden when WebGL is unavailable.
 */
type Mode = 'solo' | 'party';
type Party = { players: number; course: number[]; index: number; cards: number[][] };
type Play = {
  hole: Hole; mode: Mode; world: World;
  strokes: number[]; holed: boolean[]; out: boolean[]; turn: number; shooter: number;
  phase: 'aim' | 'rolling' | 'done';
  acc: number; fast: boolean; shots: number; doneAt: number;
  kbAim: { angle: number; power: number } | null;
  /** Solo stroke one that will sink: its sink time (shot clock), so the last moments can run in slow motion; else -1. */
  aceAt: number; ace: boolean;
};
type Drag = { id: number; sx: number; sy: number; x: number; y: number; angle: number; power: number; path: number[] | null };

const SHOT_CAP_OVER_PAR = 5;
/** The ace's slow motion: the last 0.4 s of the roll before the drop run at 0.3x. */
const ACE_SLOW_S = 0.4, ACE_SLOW = 0.3;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: (Node | string | null | undefined | false)[]) => {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'disabled' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (tag === 'button') el.setAttribute('type', 'button');
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** An ensō, the zen brush circle, drawn round the word on an ace card (one stroke, left a little open). */
const ENSO_SVG = '<svg viewBox="0 0 120 120"><path d="M80 18C60 6 28 12 16 40S20 100 56 107s58-14 54-50c-2-15-9-26-19-33" fill="none" stroke="#2b2118" stroke-width="9" stroke-linecap="round" pathLength="100" opacity=".8"/></svg>';
const HAND_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 6c2 0 3.5 1.5 3.5 3.5V22l1-.2V7.5c0-2 1.5-3.5 3.5-3.5S29.5 5.5 29.5 7.5V22l1 .1V10c0-2 1.5-3.5 3.5-3.5S37.5 8 37.5 10v19c0 8-5 14-12.5 14C18 43 14 39 11 33l-4.5-9c-1-2 0-4 2-4.5 1.6-.4 3 .4 3.8 1.8L14.5 26V9.5C14.5 7.5 16 6 18 6z" fill="#fff8ec" stroke="#2b2118" stroke-width="2.2" stroke-linejoin="round"/></svg>';

export const pebblePutt: GameModule = {
  meta: {
    slug: 'pebble-putt', title: 'Pebble Putt', category: 'puzzle',
    description: 'Flick a pebble across a raked sand garden at golden hour. Every hole has a par route and one hidden trick shot that sinks it in one.',
    instructions: 'Drag back from the pebble to aim and set power, then release to shoot; the rake lines show which way the sand slopes. Tap while it rolls to fast-forward. 2-4 players can pass one device. Keys: Left/Right aim (Shift for fine), Up/Down power, Space shoot, R retry.',
    accent: '#e9b45a', mechanic: 'Drag, bank and roll a pebble into the cup'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    let save: Save = loadSave(services.storage);
    let i18n = createI18n(save.lang ?? defaultLang());
    const t = (k: Key, v?: Record<string, string | number>) => i18n.t(k, v);
    const reducedNow = () => services.isReducedMotion || save.settings.reduced;

    const root = h('div', { class: `pp${reducedNow() ? ' reduced' : ''}`, tabindex: '0', role: 'application', 'aria-label': 'Pebble Putt', 'data-pebble-putt': '' });
    const style = h('style'); style.textContent = STYLES;
    const canvas = h('canvas', { class: 'pp-canvas', 'aria-hidden': 'true' });
    const loading = h('div', { class: 'pp-loading', text: t('hud.loading') });
    const toast = h('div', { class: 'pp-toast', role: 'status' }); toast.style.opacity = '0';
    root.append(style, canvas, loading, toast);
    host.replaceChildren(root);

    const audio = createAudio(services);
    audio.setVolume(save.settings.sfx);
    let gl: Gl | null = null, glFailed = false;
    let play: Play | null = null, party: Party | null = null;
    let drag: Drag | null = null;
    let screen: HTMLElement | null = null, screenName = '';
    let card: HTMLElement | null = null;
    let hud: { el: HTMLElement; update(): void } | null = null;
    let caption: HTMLElement | null = null, ghost: HTMLElement | null = null, turnBanner: HTMLElement | null = null;
    let destroyed = false, paused = false, raf = 0, last = 0, clock = 0, storageWarned = false, frameFailed = false;
    let toastTimer: ReturnType<typeof setTimeout> | null = null, konTimer: ReturnType<typeof setTimeout> | null = null;
    /** Times each hole was opened in solo this session (the ace card notices how long it took). */
    const tries: Record<number, number> = {};
    let width = 360, heightPx = 560;
    /** Render-resolution scale: drops (1 -> 0.7 -> 0.55) while the device cannot hold ~48 fps and each drop clearly helps. */
    let quality = 1, prevQuality = 1, slowFrames = 0, sampled = 0, lastShare = 1, justDropped = false, adapting = true, hiccup = false;
    /** Start a fresh measuring window (after a hole load, a resume, or a long gap). */
    const resetQualityWindow = () => { sampled = 0; slowFrames = 0; hiccup = false; };
    const frameTimes: number[] = [];

    const say = (text: string, ms = 1500) => {
      toast.textContent = text; toast.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms);
    };
    const persist = () => {
      if (!writeSave(services.storage, save) && !storageWarned) { storageWarned = true; const n = h('div', { class: 'pp-notice', role: 'status', text: t('common.storage') }); root.append(n); setTimeout(() => n.remove(), 6000); }
    };

    // ------------------------------------------------------------ sizing
    const layout = () => {
      if (destroyed) return;
      const immersive = host.classList.contains('is-immersive') || (typeof document !== 'undefined' && document.fullscreenElement === host);
      root.classList.toggle('is-immersive', immersive);
      const css = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
      const hw = host.clientWidth - pad(css.paddingLeft, css.paddingRight);
      width = hw > 40 ? hw : 360;
      if (immersive && host.clientHeight > 0) heightPx = host.clientHeight - pad(css.paddingTop, css.paddingBottom);
      else if (width < 560) heightPx = clamp(window.innerHeight - 150, 460, width * 1.75);
      else heightPx = clamp(window.innerHeight - 190, 460, Math.min(760, width * 0.66));
      heightPx = Math.floor(heightPx);
      root.style.setProperty('--pp-h', `${heightPx}px`);
      root.classList.toggle('compact', width < 420 || heightPx < 520);
      gl?.resize(width, heightPx, Math.min(2, window.devicePixelRatio || 1) * quality, { top: 58, bottom: play?.mode === 'party' ? 56 : 14 });
      placeGhost();
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
    observer?.observe(host);
    window.addEventListener('resize', layout);

    // ------------------------------------------------------------ WebGL (lazy)
    function showFallback(kind: 'webgl' | 'load' = 'webgl') {
      glFailed = true; loading.remove();
      const el = h('div', { class: 'pp-fallback', role: 'alert' }, h('h2', { text: t(kind === 'webgl' ? 'fallback.title' : 'fallback.loadTitle') }), h('p', { text: t(kind === 'webgl' ? 'fallback.body' : 'fallback.loadBody') }),
        h('button', { class: 'pp-btn primary', onclick: () => { location.reload(); } }, t('fallback.retry')));
      root.append(el);
    }
    const hasWebGl = () => {
      try {
        if (typeof WebGLRenderingContext === 'undefined') return false;
        const c = document.createElement('canvas');
        const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
        return !!ctx && (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext || ctx instanceof WebGLRenderingContext);
      } catch { return false; }
    };
    // A lost GL context (backgrounded phone, GPU reset) is restored by the browser: redraw the current hole then.
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => { if (gl && play) gl.setHole(play.hole, gardenOf(play.hole.id).id, play.world.balls.length, PLAYER_COLORS, true); });
    const glReady = (async () => {
      if (!hasWebGl()) { showFallback(); return; }
      let mod: typeof import('./pebble-putt-gl');
      try { mod = await import('./pebble-putt-gl'); }
      catch (err) { if (!destroyed) { console.error('[pebble-putt] 3D module failed to load', err); showFallback('load'); } return; }
      try {
        if (destroyed) return;
        gl = mod.createGl(canvas);
        loading.remove();
        layout();
        const cur = play as Play | null;
        if (cur) gl.setHole(cur.hole, gardenOf(cur.hole.id).id, cur.world.balls.length, PLAYER_COLORS);
      } catch (err) {
        if (destroyed) return;
        console.error('[pebble-putt] WebGL unavailable', err);
        gl = null; showFallback();
      }
    })();

    // ------------------------------------------------------------ screens
    const closeScreen = () => { screen?.remove(); screen = null; screenName = ''; };
    const closeCard = () => { card?.remove(); card = null; };
    const showScreen = (name: string, el: HTMLElement) => {
      closeScreen(); closeCard();
      screen = el; screenName = name; root.dataset.state = name;
      root.insertBefore(el, toast);
      (el.querySelector<HTMLElement>('.pp-btn.primary:not(:disabled), .pp-node.current, .pp-btn:not(:disabled)') ?? root).focus({ preventScroll: true });
    };
    const heroSvg = () => { const s = h('div', { class: 'pp-hero', 'aria-hidden': 'true' }); s.innerHTML = '<svg viewBox="0 0 120 70" width="120" height="70"><g fill="none" stroke="#c8a676" stroke-width="2"><path d="M4 50c20-6 40-6 56 0s36 6 56 0"/><path d="M4 58c20-6 40-6 56 0s36 6 56 0"/><path d="M4 42c20-6 40-6 56 0s36 6 56 0"/></g><ellipse cx="40" cy="40" rx="11" ry="9" fill="#f4f1ea" stroke="#7a6650" stroke-width="2"/><ellipse cx="92" cy="44" rx="10" ry="4" fill="#2b2118"/><path d="M92 44V8" stroke="#3a2a1c" stroke-width="2"/><path d="M92 9l16 5-16 5z" fill="#d8453a"/></svg>'; return s; };

    function nextHoleId() { return HOLES.find(x => isUnlocked(save, x.id) && !save.holes[x.id]?.stars[0])?.id ?? null; }

    function titleScreen() {
      leaveHole();
      const stars = totalStars(save), next = nextHoleId();
      const started = Object.keys(save.holes).length > 0;
      const el = h('div', { class: 'pp-screen' },
        heroSvg(), h('h1', { text: t('title.name') }), h('p', { text: t('title.tag') }),
        h('div', { class: 'pp-menu' },
          h('button', { class: 'pp-btn primary', 'data-action': 'play', onclick: () => { audio.unlock(); audio.ui(); if (next) openHole(next, 'solo'); else mapScreen(); } },
            next === null ? t('title.done') : started ? t('title.continue', { n: next }) : t('title.start')),
          h('button', { class: 'pp-btn', 'data-action': 'gardens', onclick: () => { audio.unlock(); audio.ui(); mapScreen(); } }, t('title.gardens'), h('small', { text: `${t('title.stars', { n: stars, total: HOLES.length * 3 })} · ${t('title.aces', { n: acesFound(save) })}` })),
          h('button', { class: 'pp-btn', 'data-action': 'party', onclick: () => { audio.unlock(); audio.ui(); partyScreen(); } }, t('title.party'), h('small', { text: '2–4 · ' + t('party.course') })),
          h('button', { class: 'pp-btn ghost', onclick: () => { audio.unlock(); audio.ui(); settingsScreen(); } }, t('title.settings')),
          h('button', { class: 'pp-btn ghost', onclick: () => setLang(i18n.lang === 'zh' ? 'en' : 'zh') }, i18n.lang === 'zh' ? 'English' : '中文')),
        matchMedia?.('(pointer: coarse)').matches ? null : h('p', { class: 'pp-keys', text: t('keys') })
      );
      showScreen('title', el);
    }

    function mapScreen() {
      leaveHole();
      const next = nextHoleId();
      const el = h('div', { class: 'pp-screen' },
        h('div', { class: 'pp-head' }, h('button', { class: 'pp-btn ghost', 'data-action': 'back', onclick: () => { audio.ui(); titleScreen(); } }, '‹ ', t('common.back')), h('h2', { text: t('map.title') }), h('span', { class: 'pp-pill', text: `★ ${totalStars(save)}/${HOLES.length * 3}` })),
        ...GARDENS.map(g => h('section', { class: 'pp-garden' }, h('h3', { text: i18n.tr(g.name) }), h('p', { text: i18n.tr(g.blurb) }),
          h('div', { class: 'pp-holes' }, ...g.holes.map(id => {
            const hole = holeById(id)!, rec = save.holes[id], open = isUnlocked(save, id);
            return h('button', { class: `pp-node${id === next ? ' current' : ''}`, disabled: !open, 'data-hole': String(id), title: open ? i18n.tr(hole.name) : t('map.locked'), 'aria-label': `${t('hud.hole', { n: id })} ${i18n.tr(hole.name)}`, onclick: () => { audio.ui(); openHole(id, 'solo'); } },
              h('b', { text: String(id) }), h('span', { class: 'st' }, ...[0, 1, 2].map(k => h('span', { class: rec?.stars[k] ? 'on' : '', text: '★' }))),
              h('small', { text: rec ? t('map.best', { n: rec.best }) : `${t('hud.par', { n: hole.par })}` }));
          }))))
      );
      showScreen('map', el);
    }

    function partyScreen() {
      leaveHole();
      const p = save.party;
      const seg = (items: { label: string; on: boolean; pick(): void; attr: string }[]) => h('div', { class: 'pp-seg' }, ...items.map(it => h('button', { class: `pp-btn${it.on ? ' on' : ''}`, 'aria-pressed': String(it.on), 'data-choice': it.attr, onclick: () => { it.pick(); persist(); audio.ui(); partyScreen(); } }, it.label)));
      const el = h('div', { class: 'pp-screen' },
        h('div', { class: 'pp-head' }, h('button', { class: 'pp-btn ghost', 'data-action': 'back', onclick: () => { audio.ui(); titleScreen(); } }, '‹ ', t('common.back')), h('h2', { text: t('party.title') })),
        h('p', { text: t('party.sub') }),
        h('strong', { text: t('party.players') }),
        seg([2, 3, 4].map(n => ({ label: String(n), on: p.players === n, attr: `players-${n}`, pick: () => { p.players = n; } }))),
        h('div', { class: 'pp-seg' }, ...Array.from({ length: p.players }, (_, i) => h('span', { class: 'pp-pill' }, h('span', { class: 'pp-chip', style: `background:${PLAYER_COLORS[i]}` }), i18n.tr(PLAYER_NAMES[i])))),
        h('strong', { text: t('party.course') }),
        seg([...GARDENS.map(g => ({ label: i18n.tr(g.name), on: p.course === g.id, attr: `course-${g.id}`, pick: () => { p.course = g.id; } })), { label: t('party.all'), on: p.course === 0, attr: 'course-0', pick: () => { p.course = 0; } }]),
        h('button', { class: 'pp-btn primary', 'data-action': 'party-start', onclick: () => { audio.unlock(); audio.ui(); startParty(); } }, t('party.start'))
      );
      showScreen('party', el);
    }

    function settingsScreen() {
      const s = save.settings;
      const toggle = (label: string, on: boolean, set: (v: boolean) => void) => h('div', { class: 'pp-set' }, h('span', { text: label }),
        h('button', { class: `pp-btn${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), onclick: () => { set(!on); persist(); settingsScreen(); } }, on ? t('common.on') : t('common.off')));
      const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s.sfx * 100)), 'aria-label': t('settings.sound') }) as HTMLInputElement;
      input.addEventListener('input', () => { s.sfx = Number(input.value) / 100; audio.setVolume(s.sfx); persist(); });
      input.addEventListener('change', () => { audio.unlock(); audio.hit('wall', 4); });
      const el = h('div', { class: 'pp-screen' },
        h('div', { class: 'pp-head' }, h('button', { class: 'pp-btn ghost', 'data-action': 'back', onclick: () => { audio.ui(); titleScreen(); } }, '‹ ', t('common.back')), h('h2', { text: t('settings.title') })),
        h('div', { class: 'pp-set' }, h('span', { text: t('settings.lang') }), h('button', { class: 'pp-btn', onclick: () => { setLang(i18n.lang === 'zh' ? 'en' : 'zh'); settingsScreen(); } }, i18n.lang === 'zh' ? '中文' : 'English')),
        h('div', { class: 'pp-set' }, h('span', { text: t('settings.sound') }), input),
        toggle(t('settings.reduced'), s.reduced, v => { s.reduced = v; root.classList.toggle('reduced', reducedNow()); }),
        toggle(t('settings.preview'), s.longPreview, v => { s.longPreview = v; }),
        h('div', { class: 'pp-set' }, h('span', { text: t('settings.reset') }), h('button', { class: 'pp-btn', onclick: () => {
          if (typeof confirm === 'function' && !confirm(t('settings.resetConfirm'))) return;
          const keep = { lang: save.lang, settings: save.settings, party: save.party };
          save = { ...blankSave(), ...keep }; persist(); say(t('settings.resetDone')); titleScreen();
        } }, t('settings.reset')))
      );
      showScreen('settings', el);
    }

    function setLang(lang: Lang) {
      save.lang = lang; i18n = createI18n(lang); persist();
      loading.textContent = t('hud.loading');
      if (play) { buildHud(); showCaption(); } else if (screenName === 'map') mapScreen(); else if (screenName === 'party') partyScreen(); else if (screenName !== 'settings') titleScreen();
    }

    // ------------------------------------------------------------ playing a hole
    function leaveHole() {
      play = null; drag = null;
      if (konTimer) { clearTimeout(konTimer); konTimer = null; }
      hud?.el.remove(); hud = null; caption?.remove(); caption = null; ghost?.remove(); ghost = null; turnBanner?.remove(); turnBanner = null;
      closeCard();
    }

    function openHole(id: number, mode: Mode) {
      const hole = holeById(id);
      if (!hole) return;
      closeScreen(); closeCard();
      leaveHoleUi();
      const players = mode === 'party' && party ? party.players : 1;
      const world = createWorld(hole, players, 0);
      if (players > 1) for (const b of world.balls) b.onCourse = false;
      play = { hole, mode, world, strokes: Array(players).fill(0), holed: Array(players).fill(false), out: Array(players).fill(false), turn: 0, shooter: 0, phase: 'aim', acc: 0, fast: false, shots: 0, doneAt: 0, kbAim: null, aceAt: -1, ace: false };
      if (konTimer) { clearTimeout(konTimer); konTimer = null; }
      if (mode === 'solo') tries[id] = (tries[id] ?? 0) + 1;
      teeUp(0);
      root.dataset.state = 'play'; root.dataset.hole = String(id);
      gl?.setHole(hole, gardenOf(id).id, players, PLAYER_COLORS); resetQualityWindow();
      buildHud(); showCaption(); layout();
      if (id === HOLES[0].id && mode === 'solo') showGhost();
      if (mode === 'party') showTurn();
      root.focus({ preventScroll: true });
    }
    function leaveHoleUi() { hud?.el.remove(); hud = null; caption?.remove(); caption = null; ghost?.remove(); ghost = null; turnBanner?.remove(); turnBanner = null; }

    function teeUp(i: number) {
      if (!play) return;
      const b = play.world.balls[i];
      if (b.onCourse) return;
      b.onCourse = true; b.sunk = false; b.moving = false; b.vx = b.vy = 0;
      let [x, y] = play.hole.tee;
      // a pebble already resting on the tee: tee up beside it
      for (let k = 0; k < 4 && play.world.balls.some((o, j) => j !== i && o.onCourse && !o.sunk && Math.hypot(o.x - x, o.y - y) < BALL_R * 2.2); k++) x += (k % 2 ? -1 : 1) * BALL_R * 2.4 * (k + 1);
      b.x = b.restX = x; b.y = b.restY = y;
    }

    function retryHole() {
      if (!play) return;
      if (play.mode === 'party') return; // a party hole is played once
      audio.ui(); openHole(play.hole.id, 'solo');
    }

    function buildHud() {
      hud?.el.remove();
      const holeLabel = h('span', { class: 'pp-grow' }), parLabel = h('small'), strokeLabel = h('span', { 'data-strokes': '' });
      const chip = h('span', { class: 'pp-chip' });
      const el = h('div', { class: 'pp-hud' },
        h('button', { class: 'pp-btn round', 'aria-label': t('hud.menu'), 'data-action': 'menu', onclick: () => { audio.ui(); if (play?.mode === 'party') partyScreen(); else mapScreen(); } }, '☰'),
        h('div', { class: 'pp-pill pp-grow' }, holeLabel, parLabel),
        h('div', { class: 'pp-pill' }, chip, strokeLabel),
        play?.mode === 'solo' ? h('button', { class: 'pp-btn round', 'aria-label': t('hud.retry'), title: `${t('hud.retry')} (R)`, 'data-action': 'retry', onclick: () => retryHole() }, '↺') : null);
      root.insertBefore(el, toast);
      hud = {
        el, update() {
          if (!play) return;
          holeLabel.textContent = root.classList.contains('compact') ? `${play.hole.id} · ${i18n.tr(play.hole.name)}` : `${t('hud.hole', { n: play.hole.id })} · ${i18n.tr(play.hole.name)}`;
          parLabel.textContent = t('hud.par', { n: play.hole.par });
          strokeLabel.textContent = t('hud.strokes', { n: play.strokes[play.turn] });
          chip.style.background = PLAYER_COLORS[play.turn];
          chip.style.display = play.mode === 'party' ? '' : 'none';
        }
      };
      hud.update();
    }

    function showCaption() {
      caption?.remove(); caption = null;
      if (!play) return;
      caption = h('div', { class: 'pp-caption', text: i18n.tr(play.hole.caption) });
      root.insertBefore(caption, toast);
    }
    function showGhost() {
      ghost?.remove();
      ghost = h('div', { class: 'pp-ghost', 'aria-hidden': 'true' });
      ghost.innerHTML = HAND_SVG;
      ghost.append(h('span', { text: t('ghost.drag') }));
      root.insertBefore(ghost, toast);
      placeGhost();
    }
    function placeGhost() {
      if (!ghost || !gl || !play) return;
      const b = play.world.balls[0];
      const p = gl.project(b.x, b.y, BALL_R);
      ghost.style.left = `${p.x}px`; ghost.style.top = `${p.y}px`;
    }
    function showTurn() {
      turnBanner?.remove(); turnBanner = null;
      if (!play || play.mode !== 'party') return;
      const i = play.turn;
      turnBanner = h('div', { class: 'pp-turn', role: 'status' }, h('span', { class: 'pp-chip', style: `background:${PLAYER_COLORS[i]}` }), t('hud.turn', { name: i18n.tr(PLAYER_NAMES[i]) }));
      root.insertBefore(turnBanner, toast);
    }

    // ------------------------------------------------------------ shooting
    const canAim = () => !!play && play.phase === 'aim' && !card && !screen && !!gl && !paused;
    const previewLimit = () => (play && (play.hole.id <= 6 || save.settings.longPreview) ? { bounces: 1, length: 5.5 } : { bounces: 0, length: 3.6 });

    function previewPath(x: number, y: number, angle: number, power: number): number[] | null {
      if (!play) return null;
      const lim = previewLimit();
      const r = simulateShot(play.hole, x, y, angle, power, play.world.t, { path: true, maxBounces: lim.bounces });
      const p = r.path ?? [];
      const out: number[] = [p[0], p[1]];
      let len = 0;
      for (let k = 2; k < p.length; k += 2) {
        const seg = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
        if (len + seg > lim.length) { const f = (lim.length - len) / seg; out.push(p[k - 2] + (p[k] - p[k - 2]) * f, p[k - 1] + (p[k + 1] - p[k - 1]) * f); break; }
        len += seg; out.push(p[k], p[k + 1]);
      }
      return out;
    }

    function shoot(angle: number, power: number) {
      if (!play || play.phase !== 'aim') return;
      const i = play.turn;
      teeUp(i);
      // the first solo stroke is simulated ahead (the same deterministic physics) so an ace can slow down before it drops
      const b0 = play.world.balls[i];
      play.aceAt = play.mode === 'solo' && play.strokes[i] === 0 ? (r => r.sunk ? r.t : -1)(simulateShot(play.hole, b0.x, b0.y, angle, power, play.world.t)) : -1;
      strike(play.world, i, angle, power);
      play.strokes[i]++; play.shooter = i; play.phase = 'rolling'; play.fast = false; play.shots++;
      audio.unlock(); audio.shoot(power);
      if (caption) { caption.style.opacity = '0'; const c = caption; setTimeout(() => c.remove(), 400); caption = null; }
      ghost?.remove(); ghost = null;
      turnBanner?.remove(); turnBanner = null;
      drag = null;
      hud?.update();
    }

    function aimFromDrag(d: Drag, px: number, py: number) {
      if (!play || !gl) return;
      const b = play.world.balls[play.turn];
      const bx = play.world.balls[play.turn].onCourse ? b.x : play.hole.tee[0], by = b.onCourse ? b.y : play.hole.tee[1];
      const s = gl.project(bx, by, 0);
      const dx = d.sx - px, dy = d.sy - py, len = Math.hypot(dx, dy);
      const g = gl.ground(s.x + dx, s.y + dy, height(play.hole.slopes, bx, by));
      d.x = px; d.y = py;
      d.power = clamp((len - 8) / (0.3 * Math.min(width, heightPx)), 0, 1);
      if (g && len > 4) d.angle = Math.atan2(g.y - by, g.x - bx) * 180 / Math.PI;
      d.path = d.power > 0.02 ? previewPath(bx, by, d.angle, d.power) : null;
      if (ghost) { const sp = ghost.querySelector('span'); if (sp) sp.textContent = t('ghost.release'); }
    }

    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (width / Math.max(1, r.width)), y: (e.clientY - r.top) * (heightPx / Math.max(1, r.height)) }; };
    canvas.addEventListener('pointerdown', (e) => {
      audio.unlock();
      if (play && play.phase === 'rolling') { play.fast = true; return; }
      if (!canAim() || drag) return;
      const p = local(e);
      drag = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, angle: play!.kbAim?.angle ?? 90, power: 0, path: null };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) { const p = local(e); aimFromDrag(drag, p.x, p.y); } });
    const endDrag = (e: PointerEvent, cancel: boolean) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!cancel) { const p = local(e); aimFromDrag(d, p.x, p.y); }
      if (!cancel && d.power >= 0.03 && play?.phase === 'aim') shoot(d.angle, d.power);
      else if (ghost) { const sp = ghost.querySelector('span'); if (sp) sp.textContent = t('ghost.drag'); }
    };
    canvas.addEventListener('pointerup', (e) => endDrag(e, false));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

    const onKey = (e: KeyboardEvent) => {
      if (destroyed) return;
      const k = e.key;
      if (card || screen) { if (k === 'Escape' && card) { closeCard(); } return; }
      if (!play) return;
      if (k === 'r' || k === 'R') { retryHole(); e.preventDefault(); return; }
      if (play.phase === 'rolling') { if (k === ' ' || k === 'Enter' || k === 'f' || k === 'F') { play.fast = true; e.preventDefault(); } return; }
      if (!canAim()) return;
      const b = play.world.balls[play.turn];
      const bx = b.onCourse ? b.x : play.hole.tee[0], by = b.onCourse ? b.y : play.hole.tee[1];
      const aim = play.kbAim ?? (play.kbAim = { angle: Math.round(Math.atan2(play.hole.cup[1] - by, play.hole.cup[0] - bx) * 180 / Math.PI), power: 0.5 });
      const fine = e.shiftKey ? 0.25 : 2;
      if (k === 'ArrowLeft') aim.angle += fine;
      else if (k === 'ArrowRight') aim.angle -= fine;
      else if (k === 'ArrowUp') aim.power = clamp(aim.power + (e.shiftKey ? 0.01 : 0.025), 0.02, 1);
      else if (k === 'ArrowDown') aim.power = clamp(aim.power - (e.shiftKey ? 0.01 : 0.025), 0.02, 1);
      else if (k === ' ' || k === 'Enter') { shoot(aim.angle, aim.power); play && (play.kbAim = null); e.preventDefault(); return; }
      else return;
      audio.unlock();
      e.preventDefault();
    };
    root.addEventListener('keydown', onKey);

    // ------------------------------------------------------------ rules: events, end of shot, end of hole
    function onEvents(events: SimEvent[]) {
      if (!play) return;
      for (const e of events) {
        if (e.kind === 'wall') audio.hit('wall', e.speed);
        else if (e.kind === 'gate-hit') audio.hit('gate', e.speed);
        else if (e.kind === 'stone') audio.hit('stone', e.speed);
        else if (e.kind === 'ball') audio.hit('ball', e.speed);
        else if (e.kind === 'spring') { audio.spring(e.speed); gl?.pulseSpring(e.x, e.y); }
        else if (e.kind === 'lip') audio.lip();
        else if (e.kind === 'pipe') audio.pipe();
        else if (e.kind === 'water') {
          audio.splash();
          if (e.ball === play.shooter) { play.strokes[e.ball]++; say(t('toast.water'), 1900); hud?.update(); }
        } else if (e.kind === 'cup') {
          const i = e.ball;
          play.holed[i] = true;
          const ace = play.mode === 'solo' && play.strokes[i] === 1;
          audio.cup(ace);
          if (ace) aceMoment();
          if (play.mode === 'party' && i !== play.shooter) say(t('toast.knocked', { name: i18n.tr(PLAYER_NAMES[i]) }));
        }
      }
    }

    /** Stroke one dropped: rake rings, the flag, the koi, and the deer scarer's "kon" once its tube swings back onto the stone. */
    function aceMoment() {
      if (!play) return;
      play.ace = true;
      const reduced = reducedNow();
      gl?.aceBurst(reduced);
      try { navigator.vibrate?.([18, 70, 30]); } catch { /* no haptics */ }
      if (konTimer) clearTimeout(konTimer);
      konTimer = setTimeout(() => { konTimer = null; if (!play?.ace || destroyed) return; audio.kon(); say(t('toast.kon'), 1700); }, reduced ? 250 : 620);
      services.track?.('ace', { hole: play.hole.id, tries: Math.min(9, tries[play.hole.id] ?? 1) });
    }

    let gateWasOpen: boolean[] = [];
    function gateSounds() {
      if (!play?.hole.gates) return;
      play.world.course.gates.forEach((g, k) => {
        const m = ((play!.world.t + g.phase) % g.period + g.period) % g.period;
        const open = m < g.open;
        if (gateWasOpen[k] && !open) audio.bamboo();
        gateWasOpen[k] = open;
      });
    }

    function endShot() {
      if (!play) return;
      play.phase = 'aim'; play.fast = false;
      const cap = play.hole.par + SHOT_CAP_OVER_PAR;
      for (let i = 0; i < play.strokes.length; i++) if (!play.holed[i] && play.strokes[i] >= cap && !play.out[i]) { play.out[i] = true; if (play.mode === 'solo' || i === play.shooter) say(t('toast.pickup')); }
      if (play.mode === 'solo') {
        if (play.holed[0] || play.out[0]) finishSolo();
        return;
      }
      // party: round robin over pebbles still in play
      const n = play.strokes.length;
      let next = -1;
      for (let k = 1; k <= n; k++) { const j = (play.shooter + k) % n; if (!play.holed[j] && !play.out[j]) { next = j; break; } }
      if (next < 0) { finishPartyHole(); return; }
      play.turn = next; play.kbAim = null;
      teeUp(next); // the next pebble appears on the tee (and can be knocked) as soon as it is that player's turn
      hud?.update(); showTurn();
    }

    function finishSolo() {
      if (!play) return;
      play.phase = 'done'; play.doneAt = clock;
      const { hole } = play, strokes = play.strokes[0], holed = play.holed[0];
      const fresh = recordHole(save, hole.id, hole.par, strokes, holed);
      persist();
      const garden = gardenOf(hole.id);
      const gardenDone = garden.holes.every(id => save.holes[id]?.stars[0]);
      if (holed && gardenDone && hole.id === garden.holes[garden.holes.length - 1]) services.reportComplete(garden.id / GARDENS.length);
      const diff = strokes - hole.par;
      const title = !holed ? t('result.pickup') : strokes === 1 ? t('result.ace') : diff <= -2 ? t('result.eagle') : diff === -1 ? t('result.birdie') : diff === 0 ? t('result.par') : diff === 1 ? t('result.bogey') : diff === 2 ? t('result.double') : t('result.over', { n: diff });
      audio.result(!holed ? 'over' : diff < 0 ? 'great' : diff === 0 ? 'par' : 'over');
      const rec = save.holes[hole.id];
      const stars = rec?.stars ?? [false, false, false];
      const nextId = hole.id < HOLES.length ? hole.id + 1 : null;
      const aced = holed && strokes === 1;
      const n = tries[hole.id] ?? 1;
      const showDelay = reducedNow() ? 250 : aced ? 1900 : 750;
      const remark = aced ? (n <= 1 ? t('result.aceFirst') : t('result.aceTries', { n })) : holed && diff >= 2 ? t('result.rake') : null;
      setTimeout(() => {
        if (!play || play.phase !== 'done' || destroyed) return;
        closeCard();
        const head = h('h2', { text: title });
        let enso: HTMLElement | null = null;
        if (aced) { enso = h('span', { class: 'pp-enso', 'aria-hidden': 'true' }); enso.innerHTML = ENSO_SVG; enso.append(h('span', { class: 'pp-seal', text: '一' })); }
        card = h('div', { class: `pp-card${aced ? ' ace' : ''}`, role: 'dialog', 'aria-label': title, 'data-result': aced ? 'ace' : diff <= 0 ? 'par' : 'over' },
          enso, head,
          remark ? h('p', { class: 'pp-remark', text: remark }) : null,
          h('p', { text: strokes === 1 ? t('result.stroke1', { par: hole.par }) : t('result.strokes', { n: strokes, par: hole.par }) }),
          h('div', { class: 'pp-stars' }, ...(['star.finish', 'star.par', 'star.ace'] as const).map((k, i) => h('div', { class: `${stars[i] ? 'on' : ''}${fresh[i] ? ' fresh' : ''}` }, h('b', { text: '★' }), t(k)))),
          !stars[2] ? h('p', { class: 'pp-tease', text: t('result.tease') }) : null,
          nextId && gardenOf(nextId).id !== garden.id && gardenDone ? h('p', { text: t('result.garden', { garden: i18n.tr(garden.name) }) }) : null,
          !nextId && holed ? h('p', { text: t('result.final') }) : null,
          h('div', { class: 'row' },
            nextId && isUnlocked(save, nextId) ? h('button', { class: 'pp-btn primary', 'data-action': 'next', onclick: () => { audio.ui(); openHole(nextId, 'solo'); } }, t('result.next')) : null,
            h('button', { class: `pp-btn${nextId && isUnlocked(save, nextId) ? '' : ' primary'}`, 'data-action': 'retry', onclick: () => retryHole() }, t('result.retry')),
            h('button', { class: 'pp-btn ghost', 'data-action': 'map', onclick: () => { audio.ui(); mapScreen(); } }, t('result.map'))));
        root.insertBefore(card, toast);
        card.querySelector<HTMLElement>('.pp-btn.primary')?.focus({ preventScroll: true });
      }, showDelay);
    }

    // ------------------------------------------------------------ pass & play
    function startParty() {
      const p = save.party;
      const course = p.course === 0 ? HOLES.map(x => x.id) : GARDENS.find(g => g.id === p.course)!.holes;
      party = { players: p.players, course, index: 0, cards: [] };
      openHole(course[0], 'party');
    }

    function finishPartyHole() {
      if (!play || !party) return;
      play.phase = 'done';
      party.cards[party.index] = play.strokes.slice();
      audio.result('par');
      const last = party.index >= party.course.length - 1;
      setTimeout(() => { if (play && play.phase === 'done' && !destroyed) scorecard(last); }, reducedNow() ? 200 : 700);
    }

    function scorecard(final: boolean) {
      if (!party) return;
      closeCard();
      const p = party, n = p.players;
      const totals = Array.from({ length: n }, (_, i) => p.cards.reduce((s, c) => s + (c?.[i] ?? 0), 0));
      const best = Math.min(...totals);
      const leaders = totals.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
      const rows = p.cards.map((c, k) => h('tr', null, h('td', { text: String(p.course[k]) }), ...c.map((s) => h('td', { text: String(s), class: s === Math.min(...c) ? 'lead' : '' })), h('td', { text: String(holeById(p.course[k])!.par) })));
      const table = h('table', { class: 'pp-table' },
        h('tr', null, h('th', { text: '#' }), ...Array.from({ length: n }, (_, i) => h('th', null, h('span', { class: 'pp-chip', style: `background:${PLAYER_COLORS[i]}` }))), h('th', { text: t('party.par') })),
        ...rows.slice(-6),
        h('tr', null, h('th', { text: t('party.total') }), ...totals.map((v, i) => h('th', { text: String(v), class: leaders.includes(i) ? 'lead' : '' })), h('th', { text: String(p.cards.reduce((s, _c, k) => s + holeById(p.course[k])!.par, 0)) })));
      const headline = final ? (leaders.length === 1 ? t('party.win', { name: i18n.tr(PLAYER_NAMES[leaders[0]]) }) : t('party.tie')) : t('party.card');
      card = h('div', { class: 'pp-card', role: 'dialog', 'aria-label': headline, 'data-scorecard': final ? 'final' : 'hole' },
        h('h2', { text: headline }), table,
        h('div', { class: 'row' }, final
          ? h('button', { class: 'pp-btn primary', 'data-action': 'party-again', onclick: () => { audio.ui(); startParty(); } }, t('party.again'))
          : h('button', { class: 'pp-btn primary', 'data-action': 'party-next', onclick: () => { audio.ui(); p.index++; openHole(p.course[p.index], 'party'); } }, t('party.next')),
        h('button', { class: 'pp-btn ghost', onclick: () => { audio.ui(); party = null; titleScreen(); } }, final ? t('party.done') : t('hud.menu'))));
      root.insertBefore(card, toast);
      card.querySelector<HTMLElement>('.pp-btn.primary')?.focus({ preventScroll: true });
      if (final) audio.result('great');
    }

    // ------------------------------------------------------------ frame loop
    const MAX_STEPS = 120 * 4 / 10; // at most 0.4 s of sim per frame (4× fast-forward at 10 fps)
    const events: SimEvent[] = [];
    const workMs: number[] = [];
    const frame = (now: number) => {
      raf = 0;
      if (destroyed || paused) return;
      const t0 = performance.now();
      const rawDt = (now - last) / 1000;
      const dt = Math.min(0.1, Math.max(0, rawDt));
      last = now; clock += dt;
      if (frameTimes.length > 240) frameTimes.shift();
      frameTimes.push(dt);
      // Adaptive resolution: only while a hole is on screen; a window with a long gap (hole load, tab resume) is discarded.
      // After each step down the next window must be clearly better, otherwise the drop is undone and adapting stops
      // (a 30 Hz display, e.g. a phone in low-power mode, is "slow" at any resolution).
      if (adapting && gl && play && !screen && dt > 0) {
        if (rawDt > 0.25) hiccup = true;
        sampled++; if (dt > 1 / 48) slowFrames++;
        if (sampled >= 90) {
          const share = slowFrames / sampled;
          if (!hiccup) {
            if (justDropped && share > lastShare - 0.1) { quality = prevQuality; adapting = false; layout(); }
            else if (share > 1 / 3 && quality > 0.56) { prevQuality = quality; quality = Math.max(0.55, quality - 0.3); lastShare = share; justDropped = true; layout(); }
            else justDropped = false;
          }
          resetQualityWindow();
        }
      }
      if (play) {
        let speed = play.fast ? 4 : 1;
        if (play.aceAt > 0 && !play.fast && play.phase === 'rolling' && !reducedNow() && play.world.shotT > play.aceAt - ACE_SLOW_S) { speed = ACE_SLOW; gl?.acePrime(); }
        play.acc += dt * speed;
        let n = 0;
        while (play.acc >= DT && n < MAX_STEPS) {
          events.length = 0;
          step(play.world, events);
          if (events.length) onEvents(events);
          play.acc -= DT; n++;
        }
        if (n >= MAX_STEPS) play.acc = 0;
        gateSounds();
        if (play.phase === 'rolling' && !anyMoving(play.world)) endShot();
        let fastest = 0;
        for (const b of play.world.balls) if (b.moving) fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
        audio.roll(fastest);
      } else audio.roll(0);
      if (gl && play) {
        let aim: { x: number; y: number; angle: number; power: number; path: number[] | null } | null = null;
        const b = play.world.balls[play.turn];
        const bx = b.onCourse ? b.x : play.hole.tee[0], by = b.onCourse ? b.y : play.hole.tee[1];
        if (drag && drag.power > 0.02) aim = { x: bx, y: by, angle: drag.angle, power: drag.power, path: drag.path };
        else if (play.kbAim && play.phase === 'aim') aim = { x: bx, y: by, angle: play.kbAim.angle, power: play.kbAim.power, path: previewPath(bx, by, play.kbAim.angle, play.kbAim.power) };
        try { gl.frame({ world: play.world, time: clock, dt, aim, active: play.turn, reduced: reducedNow(), colors: PLAYER_COLORS }); }
        catch (err) { if (!frameFailed) { frameFailed = true; console.error('[pebble-putt] frame failed', err); } }
        if (ghost) placeGhost();
      }
      if (workMs.length > 240) workMs.shift();
      workMs.push(performance.now() - t0);
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => { if (!raf && !destroyed && !paused) { last = typeof performance !== 'undefined' ? performance.now() : 0; raf = requestAnimationFrame(frame); } };

    Object.defineProperty(root, '__pp', { configurable: true, value: {
      get play() { return play; }, get save() { return save; }, get screen() { return screenName; }, get card() { return !!card; }, get gl() { return gl; }, get glFailed() { return glFailed; }, glReady,
      openHole, shoot, titleScreen, mapScreen, partyScreen, startParty, closeCard, holes: HOLES.map(x => x.id),
      get quality() { return quality; },
      fps(n = 120) {
        const s = frameTimes.slice(-n), w = workMs.slice(-n), avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
        const sorted = [...w].sort((a, b) => a - b);
        return { fps: avg > 0 ? 1 / avg : 0, worstFrameMs: Math.max(...s, 0) * 1000, workMsAvg: w.reduce((a, b) => a + b, 0) / Math.max(1, w.length), workMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, frames: s.length };
      },
      project: (x: number, y: number) => gl?.project(x, y) ?? null,
      /** The pointer path without the pointer: drag from (sx, sy) to (px, py) in canvas px, and what that shot would do. */
      dragAim(sx: number, sy: number, px: number, py: number) {
        const d: Drag = { id: -1, sx, sy, x: sx, y: sy, angle: 90, power: 0, path: null };
        aimFromDrag(d, px, py);
        const b = play?.world.balls[play.turn];
        const r = play && b ? simulateShot(play.hole, b.onCourse ? b.x : play.hole.tee[0], b.onCourse ? b.y : play.hole.tee[1], d.angle, d.power, play.world.t) : null;
        return { angle: d.angle, power: d.power, sunk: !!r?.sunk };
      },
      unlockAll() { for (const x of HOLES) save.holes[x.id] ??= { best: x.par + 1, stars: [true, false, false] }; persist(); }
    } });

    // First visit: straight onto hole 1 (first shot well within ten seconds); returning players see the title.
    if (Object.keys(save.holes).length === 0) openHole(HOLES[0].id, 'solo'); else titleScreen();
    layout();
    startLoop();

    return {
      pause() { if (destroyed || paused) return; paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } audio.pause(); },
      resume() { if (destroyed || !paused) return; paused = false; audio.resume(); startLoop(); },
      restart() {
        if (destroyed) return;
        if (paused) { paused = false; audio.resume(); startLoop(); }
        if (play?.mode === 'solo') openHole(play.hole.id, 'solo');
        else if (play?.mode === 'party') startParty();
        else titleScreen();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (toastTimer) clearTimeout(toastTimer);
        if (konTimer) clearTimeout(konTimer);
        observer?.disconnect();
        window.removeEventListener('resize', layout);
        root.removeEventListener('keydown', onKey);
        audio.dispose();
        try { gl?.dispose(); } catch { /* context already gone */ }
        gl = null; play = null;
        root.remove();
      }
    };
  }
};

export default pebblePutt;
