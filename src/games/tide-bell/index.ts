import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { dailyKey, dailySeed, dailyShareText, playedToday, readDaily, recordDaily } from '../_shared/daily';
import { createAudio } from './audio';
import type { Generated } from './generate';
import { createI18n, defaultLang, isLang, type I18n, type Lang } from './i18n';
import { iconSvg } from './icons';
import { CHAPTERS, LEVELS, levelById, nextLevelId, type Icon, type LevelDef } from './levels';
import { createRenderer } from './render';
import { DIRS, DXY, initialState, neighbour, parseBoard, step, type Board, type Dir, type MoveEvent, type State } from './rules';
import { analyze, distanceOf, hintFrom, type Analysis } from './solver';
import { STYLES } from './styles';

/**
 * Tide Bell shell: stage, HUD, level menu, input and the frame loop. Rules live in rules.ts (pure), the hint and
 * stuck check in solver.ts, the picture in render.ts and the sound in audio.ts. Every move is applied to the sim at
 * once and the renderer catches up, so a buffered key or a fast swipe never waits for an animation.
 */
type Save = { v: 1; best: Record<string, number>; ghosts: string[]; last?: string; lang?: Lang };
const SAVE_KEY = 'save';
function loadSave(services: GameServices): Save {
  const raw = services.storage.get<Partial<Save> | null>(SAVE_KEY, null);
  const best: Record<string, number> = {};
  if (raw && typeof raw.best === 'object' && raw.best) for (const [k, v] of Object.entries(raw.best)) if (typeof v === 'number' && levelById(k)) best[k] = v;
  return { v: 1, best, ghosts: Array.isArray(raw?.ghosts) ? raw!.ghosts.filter(g => typeof g === 'string') : [], last: typeof raw?.last === 'string' && levelById(raw.last) ? raw.last : undefined, lang: isLang(raw?.lang) ? raw!.lang : undefined };
}

type Play = {
  level: LevelDef; board: Board; state: State; start: State;
  history: { state: State; moves: number }[]; moves: number;
  analysis: Analysis | null; won: boolean; stuckShown: boolean;
};

const KEY_DIR: Record<string, Dir> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string | boolean | undefined> = {}, html = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v === undefined || v === false) continue; if (k === 'class') el.className = String(v); else el.setAttribute(k, v === true ? '' : String(v)); }
  if (tag === 'button') el.setAttribute('type', 'button');
  if (html) el.innerHTML = html;
  return el;
};
export const unlockedIds = (best: Record<string, number>) => {
  const open = new Set<string>();
  LEVELS.forEach((l, i) => { if (i === 0 || best[LEVELS[i - 1].id] !== undefined || best[l.id] !== undefined) open.add(l.id); });
  return open;
};

type DailyCache = Generated & { key: string };
const THEME_IDEA: Record<string, { idea: LevelDef['idea']; icon: Icon }> = {
  driftwood: { idea: { en: "Today's cove: driftwood and the tide.", zh: '今天的海湾：浮木与潮汐。' }, icon: 'wood' },
  'three waters': { idea: { en: "Today's cove: three heights of sea.", zh: '今天的海湾：三级潮位。' }, icon: 'tides' },
  sandcastles: { idea: { en: "Today's cove: sandcastles in the way.", zh: '今天的海湾：挡路的沙堡。' }, icon: 'castle' },
  currents: { idea: { en: "Today's cove: currents carry the wood.", zh: '今天的海湾：洋流带着木头走。' }, icon: 'current' }
};
export function dailyDef(g: Generated, key: string): LevelDef {
  const t = THEME_IDEA[g.theme] ?? THEME_IDEA.driftwood;
  return { id: 'daily', name: { en: `Daily tide ${key.slice(5)}`, zh: `每日潮汐 ${key.slice(5)}` }, rows: g.rows, tide: g.tide, par: g.par, solution: g.solution, idea: t.idea, icon: t.icon, ablate: [], trap: '' };
}

export const tideBell: GameModule = {
  meta: {
    slug: 'tide-bell', title: 'Tide Bell', category: 'puzzle',
    description: 'Ring the bell and the sea obeys: the same log is a block at low tide and a bridge at high tide.',
    instructions: 'Walk to the flag. Step on a bell to flip the tide: sand is dry at low tide and water at high tide. Push driftwood into water to make a bridge; it drifts until it bumps something. Swipe or tap a tile to move. Keys: arrows or WASD move, Z undo, R reset, H hint, L levels.',
    accent: '#5ec8de', mechanic: 'Ring the tide to turn logs into bridges'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    let save = loadSave(services);
    let i18n: I18n = createI18n(save.lang ?? defaultLang());
    const reduced = () => services.isReducedMotion;
    const writeSave = () => { try { services.storage.set(SAVE_KEY, save); } catch { /* storage full or blocked: play on */ } };

    const root = h('div', { class: 'tb', tabindex: '0', role: 'application', 'aria-label': 'Tide Bell', 'data-tide-bell': '' });
    const style = h('style'); style.textContent = STYLES;
    // The canvas stays the first <canvas> in the stage: the arcade's gamepad bridge sends its keys there.
    const canvas = h('canvas', { class: 'tb-canvas', 'aria-hidden': 'true' });
    const top = h('div', { class: 'tb-top' });
    const title = h('div', { class: 'tb-title' });
    const counter = h('div', { class: 'tb-count', 'aria-live': 'polite' });
    top.append(title, counter);
    const lesson = h('div', { class: 'tb-lesson' });
    const banner = h('div', { class: 'tb-banner', role: 'status', hidden: true });
    const bar = h('div', { class: 'tb-bar' });
    const btn = (key: 'undo' | 'reset' | 'hint' | 'levels', glyph: string) => { const b = h('button', { class: `tb-btn tb-${key}`, 'data-act': key }); b.innerHTML = `<span aria-hidden="true">${glyph}</span><b></b>`; bar.append(b); return b; };
    const undoBtn = btn('undo', '↶'), resetBtn = btn('reset', '⟲'), hintBtn = btn('hint', '?'), levelsBtn = btn('levels', '☰');
    const card = h('div', { class: 'tb-card', hidden: true });
    root.append(style, canvas, top, lesson, banner, bar, card);
    host.replaceChildren(root);

    const audio = createAudio(services);
    const renderer = createRenderer(canvas, reduced);
    let play: Play | null = null;
    let destroyed = false, paused = false, raf = 0;
    let walkTimer: ReturnType<typeof setTimeout> | null = null;
    let analysisTimer: ReturnType<typeof setTimeout> | null = null;
    let cardTimer: ReturnType<typeof setTimeout> | null = null;
    let firstMoveAt: number | null = null; const mountedAt = performance.now();
    // ---------------------------------------------------------------- daily cove (drawn in a worker, cached per day)
    let dailyWorker: Worker | null = null, dailyWaiting = false, dailyTimer: ReturnType<typeof setTimeout> | null = null;
    const cachedDaily = (): DailyCache | null => { const c = services.storage.get<DailyCache | null>('daily-cove', null); return c && c.key === dailyKey() && Array.isArray(c.rows) ? c : null; };
    function drawDaily(then?: () => void) {
      if (cachedDaily()) { then?.(); return; }
      if (then) dailyWaiting = true;
      if (dailyWorker) return;
      const key = dailyKey(), seed = dailySeed('tide-bell', key);
      const done = (g: Generated | null) => {
        dailyWorker?.terminate(); dailyWorker = null;
        if (destroyed || !g) return;
        try { services.storage.set('daily-cove', { ...g, key }); } catch { /* ignore */ }
        if (dailyWaiting) { dailyWaiting = false; if (root.dataset.screen === 'menu') startDaily(); }
      };
      try {
        dailyWorker = new Worker(new URL('./daily-worker.ts', import.meta.url), { type: 'module' });
        dailyWorker.onmessage = (e: MessageEvent<Generated | null>) => done(e.data);
        dailyWorker.onerror = () => { dailyWorker = null; void import('./generate').then(m => done(m.dailyLevel(seed))); };
        dailyWorker.postMessage({ seed });
      } catch { void import('./generate').then(m => done(m.dailyLevel(seed))); }
    }
    function startDaily() {
      const c = cachedDaily();
      if (!c) { drawDaily(() => startDaily()); showMenu(); return; }
      startLevel(dailyDef(c, c.key));
    }

    const labels = () => {
      undoBtn.querySelector('b')!.textContent = i18n.t('undo'); resetBtn.querySelector('b')!.textContent = i18n.t('reset');
      hintBtn.querySelector('b')!.textContent = i18n.t('hint'); levelsBtn.querySelector('b')!.textContent = i18n.t('levels');
    };
    labels();

    // ---------------------------------------------------------------- sizing
    const layout = () => {
      if (destroyed) return;
      const immersive = host.classList.contains('is-immersive') || (typeof document !== 'undefined' && document.fullscreenElement === host);
      root.classList.toggle('is-immersive', immersive);
      const css = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
      const hw = host.clientWidth - pad(css.paddingLeft, css.paddingRight);
      const width = hw > 40 ? hw : 360;
      let height: number;
      if (immersive && host.clientHeight > 0) height = host.clientHeight - pad(css.paddingTop, css.paddingBottom);
      else if (width < 560) height = Math.min(Math.max(window.innerHeight - 170, 440), width * 1.6);
      else height = Math.min(Math.max(window.innerHeight - 220, 460), Math.min(680, width * 0.7));
      height = Math.floor(height);
      root.style.setProperty('--tb-h', `${height}px`);
      root.classList.toggle('compact', width < 460);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const t = top.offsetHeight + lesson.offsetHeight + 10, b = bar.offsetHeight + 10;
      renderer.resize(width, height, ratio, { top: t, bottom: b, left: 8, right: 8 });
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
    observer?.observe(host);
    window.addEventListener('resize', layout);

    // ---------------------------------------------------------------- level flow
    function hud() {
      if (!play) return;
      const lv = play.level, ch = CHAPTERS.find(c => c.levels.includes(lv));
      title.innerHTML = `<small>${ch ? `${i18n.t('chapter', { n: ch.id })} · ${lv.id}` : i18n.t('dailyTitle')}</small><strong></strong>`;
      title.querySelector('strong')!.textContent = lv.name[i18n.lang];
      const tideWord = play.board.maxTide === 2 ? (['tideNames0', 'tideNames1of3', 'tideNames2'] as const)[play.state.tide] : (['tideNames0', 'tideNames1'] as const)[play.state.tide];
      counter.innerHTML = `<span class="tb-tide tide-${play.state.tide}${play.board.maxTide === 2 ? ' three' : ''}" title="${i18n.t('tide')}: ${i18n.t(tideWord)}"><i></i><em>${i18n.t(tideWord)}</em></span><span>${i18n.t('moves', { n: play.moves })}</span><span class="tb-par">${i18n.t('par', { n: lv.par })}</span>`;
      undoBtn.disabled = !play.history.length;
    }
    function showLesson(lv: LevelDef) {
      lesson.innerHTML = `${iconSvg(lv.icon)}<span></span>`;
      lesson.querySelector('span')!.textContent = lv.idea[i18n.lang];
    }

    function startLevel(lv: LevelDef) {
      stopWalk(); closeCard(); hideBanner();
      const board = parseBoard(lv.rows, lv.tide);
      const start = initialState(board);
      play = { level: lv, board, state: start, start, history: [], moves: 0, analysis: null, won: false, stuckShown: false };
      if (lv.id !== 'daily') { save.last = lv.id; writeSave(); }
      showLesson(lv);
      layout();
      renderer.setLevel(board, start);
      if (lv.ghost && !save.ghosts.includes(lv.id)) renderer.setGhost(lv.ghost[1] * board.w + lv.ghost[0]);
      hud();
      // The full analysis (hint and stuck check) runs just after the first frame, off the input path.
      if (analysisTimer) clearTimeout(analysisTimer);
      const p = play;
      analysisTimer = setTimeout(() => { if (play === p) { p.analysis = analyze(board); checkStuck(); } }, 60);
      root.focus({ preventScroll: true });
    }

    function applyMove(dir: Dir, fromWalk = false): boolean {
      if (!play || play.won || paused) return false;
      if (!fromWalk) stopWalk();
      audio.unlock();
      if (firstMoveAt === null) { firstMoveAt = performance.now(); root.dataset.firstMoveMs = String(Math.round(firstMoveAt - mountedAt)); }
      const events: MoveEvent[] = [];
      const next = step(play.board, play.state, dir, undefined, events);
      const now = performance.now();
      if (!next) { renderer.bump(dir, now); audio.cue('bump'); return false; }
      play.history.push({ state: play.state, moves: play.moves });
      play.state = next; play.moves++;
      renderer.move(next, events, now, dir);
      for (const e of events) {
        if (e.type === 'walk') audio.cue(play.board.kind[e.to] === 1 || play.board.kind[e.to] === 2 ? 'sand' : 'step');
        else if (e.type === 'push') { audio.cue('push'); if (e.path.length > 2 || next.tide >= play.board.height[e.to]) setTimeout(() => audio.cue('splash'), 90); }
        else if (e.type === 'ring') setTimeout(() => audio.bell(e.to, e.from), reduced() ? 0 : 80);
        else if (e.type === 'wash') setTimeout(() => audio.cue('wash'), 200);
        else if (e.type === 'flow') setTimeout(() => audio.cue('flow'), 160);
      }
      hideBanner();
      if (events.some(e => e.type === 'win')) win();
      else { hud(); checkStuck(); }
      return true;
    }

    function checkStuck() {
      if (!play || play.won) return;
      const d = distanceOf(play.analysis, play.state);
      if (d === -1) { if (!play.stuckShown) audio.cue('stuck'); play.stuckShown = true; showBanner(i18n.t('stuck'), true); }
      else play.stuckShown = false;
    }

    function undo() {
      if (!play || !play.history.length) return;
      stopWalk(); closeCard();
      const prev = play.history.pop()!;
      play.state = prev.state; play.moves = prev.moves; play.won = false;
      renderer.snap(play.state, performance.now());
      audio.cue('undo'); hideBanner(); hud(); checkStuck();
    }
    function reset() {
      if (!play) return;
      stopWalk(); closeCard();
      if (play.moves === 0 && play.state === play.start) return;
      // Reset is a step in the history too, so an accidental reset is one undo away.
      play.history.push({ state: play.state, moves: play.moves });
      play.state = play.start; play.moves = 0; play.won = false;
      renderer.snap(play.state, performance.now());
      audio.cue('undo'); hideBanner(); hud();
    }
    function hint() {
      if (!play || play.won) return;
      audio.unlock();
      const hnt = hintFrom(play.board, play.state, play.analysis);
      if (!hnt.move) { showBanner(i18n.t('stuck'), true); audio.cue('stuck'); return; }
      renderer.showHint(play.state.pos, hnt.move, performance.now());
      showBanner(i18n.t('hintLeft', { n: hnt.left }), false);
      audio.cue('tap');
    }

    function win() {
      if (!play) return;
      play.won = true;
      const lv = play.level, moves = play.moves;
      if (lv.id === 'daily') {
        const rec = recordDaily(services.storage, Math.max(1, 100 - (moves - lv.par) * 5), 'cove');
        hud();
        const wait = Math.max(0, renderer.busyUntil - performance.now());
        setTimeout(() => audio.cue('win'), wait);
        if (cardTimer) clearTimeout(cardTimer);
        cardTimer = setTimeout(() => showWinCard(lv, moves, rec.streak), wait + (reduced() ? 150 : 520));
        return;
      }
      const prevBest = save.best[lv.id];
      if (prevBest === undefined || moves < prevBest) save.best[lv.id] = moves;
      if (!save.ghosts.includes(lv.id)) save.ghosts.push(lv.id);
      writeSave();
      hud();
      const stars = LEVELS.reduce((n, l) => n + (save.best[l.id] !== undefined ? 1 : 0) + (save.best[l.id] === l.par ? 1 : 0), 0);
      services.reportScore(stars);
      services.reportComplete(Object.keys(save.best).length / LEVELS.length);
      const wait = Math.max(0, renderer.busyUntil - performance.now());
      setTimeout(() => audio.cue('win'), wait);
      if (cardTimer) clearTimeout(cardTimer);
      cardTimer = setTimeout(() => showWinCard(lv, moves), wait + (reduced() ? 150 : 520));
    }

    // ---------------------------------------------------------------- cards & banners
    function hideBanner() { banner.hidden = true; banner.replaceChildren(); }
    function showBanner(text: string, withUndo: boolean) {
      banner.replaceChildren();
      const s = h('span'); s.textContent = text; banner.append(s);
      if (withUndo && play?.history.length) { const b = h('button', { class: 'tb-chip', 'data-act': 'undo' }); b.textContent = i18n.t('stuckUndo'); banner.append(b); }
      banner.hidden = false;
    }
    function closeCard() { if (cardTimer) { clearTimeout(cardTimer); cardTimer = null; } card.hidden = true; card.replaceChildren(); root.dataset.screen = 'play'; }
    function openCard(el: HTMLElement, name: string) {
      card.replaceChildren(el); card.hidden = false; root.dataset.screen = name;
      (card.querySelector<HTMLElement>('.primary, .tb-level.current, button:not(:disabled)') ?? root).focus({ preventScroll: true });
    }
    function showWinCard(lv: LevelDef, moves: number, streak?: number) {
      const next = lv.id === 'daily' ? null : nextLevelId(lv.id);
      const box = h('div', { class: 'tb-panel win' });
      const perfect = moves === lv.par;
      box.innerHTML = `<p class="tb-kicker">${lv.id} · <span></span></p><h2>${i18n.t('clear')}</h2><p class="tb-result">${perfect ? '★ ' + i18n.t('perfect', { n: moves }) : i18n.t('yours', { n: moves, par: lv.par })}</p>${perfect ? '' : `<p class="tb-sub">${i18n.t('tryShorter', { par: lv.par })}</p>`}`;
      box.querySelector('.tb-kicker span')!.textContent = lv.name[i18n.lang];
      const row = h('div', { class: 'tb-row' });
      const again = h('button', { class: 'tb-btn2', 'data-act': 'replay' }); again.textContent = i18n.t('replay');
      const menu = h('button', { class: 'tb-btn2', 'data-act': 'levels' }); menu.textContent = i18n.t('levels');
      row.append(again, menu);
      if (next) { const go = h('button', { class: 'tb-btn2 primary', 'data-act': 'next' }); go.textContent = `${i18n.t('next')} →`; row.append(go); }
      else if (lv.id === 'daily') {
        const done = h('p', { class: 'tb-sub' }); done.textContent = i18n.t('dailyDone', { n: streak ?? 1 }); box.append(done);
        const share = h('button', { class: 'tb-btn2 primary', 'data-act': 'share' }); share.textContent = i18n.t('share'); row.append(share);
        shareText = dailyShareText(i18n.t('title'), i18n.lang === 'zh' ? `${moves} 步（最短 ${lv.par}）` : `${moves} moves (shortest ${lv.par})`, streak ?? 1, dailyKey(), i18n.lang === 'zh');
      }
      else { const done = h('p', { class: 'tb-sub' }); done.textContent = i18n.t('allDone'); box.append(done); }
      box.append(row);
      openCard(box, 'win');
    }
    let shareText = '';
    function showMenu() {
      stopWalk();
      const open = unlockedIds(save.best);
      const box = h('div', { class: 'tb-panel menu' });
      const head = h('div', { class: 'tb-menuhead' });
      const solved = Object.keys(save.best).length;
      head.innerHTML = `<h2>${i18n.t('title')}</h2><p class="tb-sub">${i18n.t('solvedCount', { n: solved, total: LEVELS.length })}</p>`;
      const langBtn = h('button', { class: 'tb-chip', 'data-act': 'lang' }); langBtn.textContent = i18n.t('lang');
      const backBtn = h('button', { class: 'tb-chip', 'data-act': 'close' }); backBtn.textContent = i18n.t('back');
      const tools = h('div', { class: 'tb-tools' }); tools.append(langBtn, backBtn); head.append(tools);
      box.append(head);
      const rec = readDaily(services.storage, 'cove'), today = playedToday(services.storage, 'cove');
      const daily = h('button', { class: `tb-daily${today ? ' done' : ''}`, 'data-act': 'daily' });
      daily.innerHTML = `${iconSvg('flag')}<span><b></b><small></small></span>`;
      daily.querySelector('b')!.textContent = i18n.t('daily');
      daily.querySelector('small')!.textContent = dailyWaiting && !cachedDaily() ? i18n.t('drawing') : today ? i18n.t('dailyDone', { n: rec.streak }) : i18n.t('dailyNew');
      box.append(daily);
      for (const ch of CHAPTERS) {
        const sec = h('section', { class: 'tb-chapter' });
        const hh = h('h3'); hh.textContent = `${i18n.t('chapter', { n: ch.id })} · ${ch.name[i18n.lang]}`; sec.append(hh);
        const grid = h('div', { class: 'tb-grid' });
        for (const lv of ch.levels) {
          const best = save.best[lv.id], isOpen = open.has(lv.id);
          const b = h('button', { class: `tb-level${play?.level.id === lv.id ? ' current' : ''}${best !== undefined ? ' done' : ''}${best === lv.par ? ' perfect' : ''}`, 'data-act': 'level', 'data-id': lv.id, disabled: !isOpen, title: isOpen ? lv.name[i18n.lang] : i18n.t('locked') });
          b.innerHTML = `<b>${lv.id}</b><span></span><i>${best === undefined ? '' : best === lv.par ? '★' : '✓'}</i>`;
          b.querySelector('span')!.textContent = lv.name[i18n.lang];
          grid.append(b);
        }
        sec.append(grid); box.append(sec);
      }
      const keys = h('p', { class: 'tb-keys' }); keys.textContent = i18n.t('keys'); box.append(keys);
      openCard(box, 'menu');
    }

    card.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!el) return;
      audio.unlock(); audio.cue('tap');
      const act = el.dataset.act;
      if (act === 'next' && play) { const n = nextLevelId(play.level.id); if (n) startLevel(levelById(n)!); }
      else if (act === 'replay' && play) startLevel(play.level);
      else if (act === 'levels') showMenu();
      else if (act === 'close') { closeCard(); root.focus({ preventScroll: true }); }
      else if (act === 'daily') startDaily();
      else if (act === 'share') { void navigator.clipboard?.writeText(shareText).then(() => { el.textContent = i18n.t('copied'); }).catch(() => {}); }
      else if (act === 'level') { const lv = levelById(el.dataset.id ?? ''); if (lv) startLevel(lv); }
      else if (act === 'lang') { save.lang = i18n.lang === 'en' ? 'zh' : 'en'; writeSave(); i18n = createI18n(save.lang); labels(); if (play) showLesson(play.level); hud(); showMenu(); layout(); }
    });
    bar.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!el) return;
      const act = el.dataset.act;
      if (act === 'undo') undo(); else if (act === 'reset') reset(); else if (act === 'hint') hint(); else if (act === 'levels') { if (card.hidden) showMenu(); else closeCard(); }
    });
    banner.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-act=undo]')) undo(); });

    // ---------------------------------------------------------------- keyboard (and the gamepad bridge)
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = KEY_DIR[e.key];
      if (!card.hidden) {
        // Menus: arrows walk the buttons, Enter / Space press; Z and Backspace go back.
        const buttons = [...card.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (dir) {
          e.preventDefault();
          const cols = root.dataset.screen === 'menu' ? (root.classList.contains('compact') ? 2 : 3) : 1;
          const delta = dir === 'L' ? -1 : dir === 'R' ? 1 : dir === 'U' ? -cols : cols;
          const j = i < 0 ? 0 : Math.max(0, Math.min(buttons.length - 1, i + delta));
          buttons[j]?.focus({ preventScroll: true });
        } else if (e.key === 'Enter' || e.key === ' ') {
          // A real key on a focused button clicks it natively; the gamepad bridge's synthetic keys need a hand.
          if (e.isTrusted && document.activeElement && card.contains(document.activeElement)) return;
          e.preventDefault(); (i >= 0 ? buttons[i] : card.querySelector<HTMLButtonElement>('.primary') ?? buttons[0])?.click();
        } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); if (root.dataset.screen === 'win') undo(); else closeCard(); }
        else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); closeCard(); }
        return;
      }
      if (dir) { e.preventDefault(); applyMove(dir); return; }
      const k = e.key.toLowerCase();
      if (k === 'z' || e.key === 'Backspace' || k === 'u') { e.preventDefault(); undo(); }
      else if (k === 'r') { e.preventDefault(); reset(); }
      else if (k === 'h' || k === '?') { e.preventDefault(); hint(); }
      else if (k === 'l' || k === 'm') { e.preventDefault(); showMenu(); }
    };
    root.addEventListener('keydown', onKey);

    // ---------------------------------------------------------------- pointer: swipe, or tap a tile
    let down: { x: number; y: number; id: number } | null = null;
    const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => { const p = local(e); down = { ...p, id: e.pointerId }; audio.unlock(); root.focus({ preventScroll: true }); });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId || !play) { down = null; return; }
      const p = local(e), dx = p.x - down.x, dy = p.y - down.y; down = null;
      const swipe = Math.max(22, renderer.cell * 0.35);
      if (Math.hypot(dx, dy) >= swipe) { applyMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); return; }
      const tile = renderer.tileAt(p.x, p.y);
      if (tile < 0 || tile === play.state.pos) return;
      const adj = DIRS.find(d => neighbour(play!.board, play!.state.pos, d) === tile);
      if (adj) { applyMove(adj); return; }
      const path = walkPath(play.board, play.state, tile);
      if (path) startWalk(path); else renderer.bump(towards(play.board, play.state.pos, tile), performance.now());
    });
    canvas.addEventListener('pointercancel', () => { down = null; });

    function stopWalk() { if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; } }
    function startWalk(path: Dir[]) {
      stopWalk();
      let i = 0;
      const next = () => { walkTimer = null; if (i >= path.length || !applyMove(path[i++], true)) return; if (i < path.length) walkTimer = setTimeout(next, reduced() ? 40 : 95); };
      next();
    }

    // ---------------------------------------------------------------- loop & lifecycle
    const frame = (now: number) => { raf = 0; if (destroyed || paused) return; renderer.draw(now); raf = requestAnimationFrame(frame); };
    const startLoop = () => { if (!raf && !destroyed && !paused) raf = requestAnimationFrame(frame); };

    // Debug / test handle (the browser bot reads tile centres and state through it).
    (root as unknown as { __tb: unknown }).__tb = {
      get level() { return play?.level.id; }, get state() { return play?.state; }, get moves() { return play?.moves; }, get won() { return play?.won; },
      center: (x: number, y: number) => (play ? renderer.center(y * play.board.w + x) : null),
      /** Page coordinates of the tile one step from you in a direction (for touch bots). */
      tapPoint: (d: Dir) => {
        if (!play) return null;
        const r = canvas.getBoundingClientRect(), [dx, dy] = DXY[d];
        const p = renderer.center(play.state.pos);
        return { x: r.left + p.x + dx * renderer.cell, y: r.top + p.y + dy * renderer.cell };
      },
      get screen() { return root.dataset.screen; },
      playerCenter: () => renderer.playerScreen(performance.now()),
      start: (id: string) => { const lv = levelById(id); if (lv) startLevel(lv); },
      solution: () => play?.level.solution
    };

    const first = LEVELS.find(l => save.best[l.id] === undefined);
    startLevel(levelById(save.last ?? '') && save.best[save.last!] === undefined ? levelById(save.last!)! : first ?? LEVELS[0]);
    audio.ambience(true);
    startLoop();
    dailyTimer = setTimeout(() => { if (!cachedDaily() && typeof Worker !== 'undefined') drawDaily(); }, 2500);

    return {
      pause() { paused = true; stopWalk(); audio.pause(); if (raf) cancelAnimationFrame(raf); raf = 0; },
      resume() { paused = false; audio.resume(); startLoop(); },
      restart() { if (play) startLevel(play.level); },
      destroy() {
        destroyed = true; stopWalk();
        if (raf) cancelAnimationFrame(raf);
        [analysisTimer, cardTimer, dailyTimer].forEach(t => t && clearTimeout(t));
        dailyWorker?.terminate(); dailyWorker = null;
        observer?.disconnect(); window.removeEventListener('resize', layout);
        audio.dispose();
        host.replaceChildren();
      }
    };
  }
};

/** Shortest walk to a tile that only steps on dry ground (no pushes, no bells on the way); the last step may do anything. */
export function walkPath(b: Board, s: State, target: number): Dir[] | null {
  const prev = new Map<number, [number, Dir]>(); prev.set(s.pos, [-1, 'U']);
  const q = [s.pos];
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    for (const d of DIRS) {
      const t = neighbour(b, p, d); if (t < 0 || prev.has(t)) continue;
      const events: MoveEvent[] = [];
      const n = step(b, { ...s, pos: p }, d, undefined, events);
      if (!n) continue;
      if (t === target) {
        if (events.some(e => e.type === 'push')) return null; // a far tap never shoves wood: tap next to it instead
        const path: Dir[] = [d]; let c = p;
        while (c !== s.pos) { const [pp, dd] = prev.get(c)!; path.push(dd); c = pp; }
        return path.reverse();
      }
      if (events.length !== 1 || n.pos !== t || b.kind[t] === 5 || b.kind[t] === 6 || b.kind[t] === 7) continue; // only plain walking in between
      prev.set(t, [p, d]); q.push(t);
    }
  }
  return null;
}
function towards(b: Board, from: number, to: number): Dir {
  const dx = (to % b.w) - (from % b.w), dy = Math.floor(to / b.w) - Math.floor(from / b.w);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
}
export { DXY };
export default tideBell;
