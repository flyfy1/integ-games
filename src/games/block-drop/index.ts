import type { GameModule, GameServices } from '../../core/game-types';
import { best } from '../_shared/game-ui';
import { dailyKey, dailyRandom, dailyShareText, readDaily, recordDaily } from '../_shared/daily';
import { attachKeyboardMobileControls } from '../_shared/mobile-controls';
import { createGame, finishClear, garbageLeft, ghostY, gravityMs, holdPiece, isGrounded, lockPiece, rotate, shift, zenRelief, HIDDEN, type Game, type LockResult } from './logic';
import { COUNT_IN_MS, DIG_PUZZLES, MODE_BLURBS, MODE_NAMES, SPRINT_LINES, ULTRA_MS, digRandom, digStars, twoStarLimit, type ModeId } from './modes';
import { ACCENT, FLASH_MS, LEVEL_MS, LOCK_MS, POPUP_MS, THUD_MS, TRAIL_MS, createRenderer, newEffects, type ModeCard } from './render';

const BEST_KEY = 'block-drop-best';
/** Held-key timing: one step at once, a short wait, then a fast slide. */
const DAS_MS = 150, ARR_MS = 34, SOFT_MS = 38;
/** A resting piece locks after this long; moving it resets the timer a limited number of times. */
const LOCK_DELAY_MS = 500, MAX_LOCK_RESETS = 15;
const CLEAR_MS = 300, CLEAR_MS_REDUCED = 150;
/** Space is the hard-drop key, so a player mashing it at the end must not skip the result panel. */
const RETRY_GUARD_MS = 300, RETRY_GUARD_SPACE_MS = 1100;

const zh = () => /^zh\b/i.test(globalThis.navigator?.language || '');
const tr = (en: string, cn: string) => (zh() ? cn : en);
const css = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => Object.assign(element.style, styles);
type Cue = Parameters<GameServices['sound']['play']>[0];
const MODES: readonly ModeId[] = ['marathon', 'sprint', 'ultra', 'zen', 'daily', 'dig'];
const timedMode = (mode: ModeId) => mode === 'sprint' || mode === 'ultra' || mode === 'daily';
/** m:ss.t for Sprint times, m:ss for the two-minute clock. */
const clockText = (ms: number, tenths = true) => {
  const total = Math.max(0, ms), m = Math.floor(total / 60000), sec = Math.floor((total % 60000) / 1000), t = Math.floor((total % 1000) / 100);
  return `${m}:${String(sec).padStart(2, '0')}${tenths ? `.${t}` : ''}`;
};
const signed = (value: number, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}`;
type SprintRecord = { best: number | null; marks: number[] };
type TraceRecord = { best: number; trace: number[] };
type DailyTrace = { key: string; best: number; trace: number[] };

/** A soft rising blip per combo step. Its own tiny audio graph so the shared cue set stays untouched; honours mute. */
function createComboTone(sound: GameServices['sound']) {
  let context: AudioContext | undefined;
  return (step: number) => {
    if (sound.muted || typeof AudioContext === 'undefined') return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      const now = context.currentTime, osc = context.createOscillator(), gain = context.createGain();
      // Two semitones per step, from A5, capped so long chains stay pleasant.
      osc.type = 'triangle'; osc.frequency.value = 880 * 2 ** (Math.min(step, 12) * 2 / 12);
      gain.gain.setValueAtTime(0.045, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain).connect(context.destination); osc.start(now); osc.stop(now + 0.17);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch { /* audio is optional */ }
  };
}

export const game: GameModule = {
  meta: { slug: 'block-drop', title: 'Block Drop', category: 'arcade', description: 'Build glowing rows before the well fills.', instructions: 'Arrows move and turn, Space drops, C holds. On touch: drag to move, tap to turn, flick down to drop.', accent: '#8B7CFF', mechanic: 'Rotate, drop, clear' },
  mount(host, services) {
    const reduced = services.isReducedMotion;
    const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;

    // --- DOM: one canvas, a hint line, the game-over panel and (on touch) the shared on-screen buttons. ---
    const root = document.createElement('div');
    root.tabIndex = 0; root.setAttribute('aria-label', 'Block Drop');
    // Not positioned on purpose: the shared pause button anchors to the stage corner, clear of the side panels.
    css(root, { width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#F7F9FF', fontFamily: 'system-ui, sans-serif', outline: 'none', userSelect: 'none', touchAction: 'none' });
    root.style.setProperty('-webkit-user-select', 'none'); root.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    const board = document.createElement('div');
    css(board, { position: 'relative', lineHeight: '0' });
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'application');
    css(canvas, { display: 'block', touchAction: 'none' });
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', tr('Game over', '游戏结束')); panel.hidden = true;
    css(panel, { position: 'absolute', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', lineHeight: '1.25', textAlign: 'center', padding: '14px 10px', boxSizing: 'border-box', background: 'rgba(9,12,28,.9)', borderRadius: '6px' });
    const hintLine = document.createElement('div');
    css(hintLine, { color: '#A8B1C5', fontSize: '14px', lineHeight: '1.4', textAlign: 'center', padding: '8px 6px 0', maxWidth: '640px' });
    const status = document.createElement('div');
    status.setAttribute('aria-live', 'polite');
    css(status, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' });
    // Mode bar: which mode is running and the way into the mode menu. Hidden in split-screen seats (always Marathon).
    const bar = document.createElement('div');
    css(bar, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: coarse ? '0 60px 6px' : '0 0 6px', minHeight: '40px', boxSizing: 'border-box', flexWrap: 'wrap', lineHeight: '1.2' });
    const modeButton = document.createElement('button');
    modeButton.type = 'button'; modeButton.dataset.modeBar = '';
    css(modeButton, { minHeight: '40px', padding: '0 14px', border: '1px solid #3A3F78', borderRadius: '12px', background: '#151B36', color: '#F7F9FF', font: '800 15px system-ui,sans-serif', cursor: 'pointer', touchAction: 'manipulation' });
    const modeInfo = document.createElement('span');
    css(modeInfo, { color: '#A8B1C5', fontSize: '14px', fontWeight: '700' });
    bar.append(modeButton, modeInfo);
    board.append(canvas, panel, status); root.append(bar, board, hintLine); host.replaceChildren(root);
    root.focus({ preventScroll: true });

    const renderer = createRenderer(canvas);
    const abort = new AbortController(), signal = abort.signal;

    // --- State. ---
    let state!: Game; // Dealt in restart(), so the random source is consumed once per run.
    let fx = newEffects();
    let stopped = false, paused = false, raf = 0, last = 0;
    let carry = 0, lockTimer = 0, lockResets = 0, lowest = 0, clearTimer = 0, softCarry = 0;
    let shownScore = 0, overAt = 0, clock = 0, hintAlpha = 1, bestAtStart = 0;
    const held = { left: false, right: false, down: false };
    let slideDir = 0, slideTime = 0, slideNext = DAS_MS;
    let cues: Array<{ at: number; kind: Cue }> = [];
    const comboTone = createComboTone(services.sound);
    // Modes. Split-screen seats always play Marathon and never read or write the solo mode settings.
    const store = services.storage;
    let mode: ModeId = 'marathon', digIndex = 0, dayKey = dailyKey();
    let runClock = 0, countIn = 0, finishedWith: '' | 'topout' | 'time' | 'cleared' | 'budget' = '';
    /** Score once per second this run (Ultra, Daily) and the time each line was reached (Sprint), for the pace marker. */
    let trace: number[] = [], marks: number[] = [];
    let splitNote: { text: string; color: string; until: number } | null = null;
    let menu: '' | 'modes' | 'dig' = '';
    /** Highlighted button in the menu or result panel, for keyboard and controller use (focus stays on the game). */
    let sel = 0, newRecord = false;
    const cue = (kind: Cue, delay = 0) => { if (delay <= 0) services.sound.play(kind); else cues.push({ at: clock + delay, kind }); };

    const labels = { hold: tr('HOLD', '暂存'), next: tr('NEXT', '下一个'), score: tr('SCORE', '得分'), level: tr('LEVEL', '等级'), lines: tr('LINES', '消行'), best: tr('BEST', '最高'), levelUp: tr('LEVEL', '等级'), faster: tr('Speed up!', '加速！') };
    // Split-screen seats have their own keys (shown in the versus lobby), so the single-player hints stay out.
    const versus = !!host.closest?.('[data-versus-seat]');
    if (versus) bar.style.display = 'none';
    else {
      const saved = store.get<string>('mode', 'marathon');
      mode = (MODES as readonly string[]).includes(saved) ? saved as ModeId : 'marathon';
      digIndex = Math.min(DIG_PUZZLES.length - 1, Math.max(0, Math.floor(store.get<number>('dig-index', 0)) || 0));
    }
    const hint = versus ? [] : coarse
      ? [tr('Drag ← → to move', '左右拖动：移动'), tr('Tap to turn', '轻点：旋转'), tr('Drag ↓ soft · flick ↓ drop', '下拖：加速 · 下滑：落到底'), tr('Flick ↑ to hold', '上滑：暂存')]
      : [tr('← → move   ↑ turn', '← → 移动   ↑ 旋转'), tr('↓ soft drop', '↓ 加速下落'), tr('Space hard drop', '空格 直接落下'), tr('C hold', 'C 暂存')];
    hintLine.textContent = coarse || versus ? '' : tr('← → move · ↑ or X turn · Z turn back · ↓ soft drop · Space hard drop · C hold · R restart · M modes', '← → 移动 · ↑ 或 X 旋转 · Z 反向旋转 · ↓ 加速 · 空格 直接落下 · C 暂存 · R 重新开始 · M 模式');

    // --- Touch buttons: the shared profile's keys, laid out for two thumbs, plus Hold. ---
    const mobile = attachKeyboardMobileControls(root, 'block-drop', root);
    const pad = root.querySelector<HTMLElement>('.mobile-controls');
    if (pad) {
      const face: Record<string, [area: string, text: string, size: string]> = { Left: ['left', '←', '26px'], Right: ['right', '→', '26px'], Down: ['down', '↓', '26px'], Rotate: ['rotate', `↻ ${tr('Turn', '旋转')}`, '18px'], Drop: ['drop', tr('Drop', '落下'), '16px'] };
      pad.querySelectorAll<HTMLButtonElement>('.mobile-control').forEach((button) => {
        const spec = face[button.getAttribute('aria-label') ?? ''];
        if (!spec) { button.style.display = 'none'; return; } // "Up" repeats Rotate.
        button.textContent = spec[1]; css(button, { gridArea: spec[0], minHeight: '54px', minWidth: '0', fontSize: spec[2], padding: '0' });
      });
      const holdButton = document.createElement('button');
      holdButton.type = 'button'; holdButton.className = 'mobile-control'; holdButton.textContent = tr('Hold', '暂存'); holdButton.setAttribute('aria-label', tr('Hold', '暂存'));
      css(holdButton, { gridArea: 'hold', minHeight: '54px', minWidth: '0', fontSize: '16px', padding: '0' });
      holdButton.addEventListener('pointerdown', (event) => { event.preventDefault(); root.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); }, { signal });
      pad.append(holdButton);
    }

    // --- Layout: size the canvas to the space the stage really has. ---
    const padGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr 10px 1fr 1fr', gridTemplateAreas: '"left right . hold drop" "down down . rotate rotate"', gap: '8px', width: '100%', maxWidth: '460px', padding: '10px 4px max(4px, env(safe-area-inset-bottom))', boxSizing: 'border-box' } as const;
    function fit() {
      const immersive = host.classList.contains('is-immersive') || !!host.closest?.('.is-immersive');
      const viewW = globalThis.innerWidth || 800, viewH = globalThis.innerHeight || 800;
      // A phone on its side has no room under the well, so the buttons move to either side of it.
      const sideways = !!pad && viewW > viewH && viewH < 560;
      if (pad) {
        css(bar, sideways ? { gridRow: '1', gridColumn: '1 / 3', alignSelf: 'start' } : { gridRow: '', gridColumn: '', alignSelf: '' });
        if (sideways) { css(pad, { display: 'contents' }); css(root, { display: 'grid', gridTemplateColumns: '1fr 1fr auto 1fr 1fr', gridTemplateRows: '1fr auto auto', gridTemplateAreas: '". . board . ." "left right board hold drop" "down down board rotate rotate"', gap: '8px', alignItems: 'stretch' }); board.style.gridArea = 'board'; }
        else { css(pad, padGrid); css(root, { display: 'flex', gridTemplateColumns: '', gridTemplateRows: '', gridTemplateAreas: '', gap: '', alignItems: 'center' }); board.style.gridArea = ''; }
      }
      const width = Math.max(240, (root.clientWidth || host.clientWidth || 600) - (sideways ? 300 : 0));
      const chrome = (sideways ? 0 : (pad?.offsetHeight ?? 0) + hintLine.offsetHeight + 4) + bar.offsetHeight;
      const style = globalThis.getComputedStyle?.(host);
      const inner = host.clientHeight - (parseFloat(style?.paddingTop ?? '0') || 0) - (parseFloat(style?.paddingBottom ?? '0') || 0);
      const top = (root.getBoundingClientRect?.().top ?? 0) + (globalThis.scrollY || 0);
      const height = immersive && inner > 0 ? inner - chrome : Math.min(760, Math.max(340, viewH - top - chrome - 12));
      const layout = renderer.resize(width, Math.max(240, height));
      css(panel, { left: `${layout.well.x}px`, top: `${layout.well.y}px`, width: `${layout.well.w}px`, height: `${layout.well.h}px` });
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { fit(); draw(); });
    observer?.observe(host);
    globalThis.addEventListener?.('resize', () => { fit(); draw(); }, { signal });

    const bestScore = () => services.storage.get<number>(BEST_KEY, 0);
    const name = (m: ModeId) => tr(...MODE_NAMES[m]);
    const sprintRecord = () => store.get<SprintRecord>('sprint', { best: null, marks: [] });
    const ultraRecord = () => store.get<TraceRecord>('ultra', { best: 0, trace: [] });
    const dailyTrace = (): DailyTrace => { const r = store.get<DailyTrace | null>('daily-trace', null); return r && r.key === dayKey ? r : { key: dayKey, best: 0, trace: [] }; };
    const digStarList = () => { const list = store.get<number[]>('dig-stars', []); return DIG_PUZZLES.map((_, i) => Math.max(0, Math.min(3, Number(list[i]) || 0))); };
    /** Puzzles open three at a time: each one earned (any star) opens the next. */
    const digOpen = (i: number, stars = digStarList()) => i < 3 || stars[i - 1] > 0 || stars[i] > 0;
    const traceFor = () => (mode === 'daily' ? dailyTrace() : ultraRecord());

    /** What the mode card, stat column and phone strip show for the current mode. */
    function modeView(): { stats?: Array<[string, string]>; headline?: [string, string]; card: ModeCard | null } {
      if (versus || mode === 'marathon') return { card: null };
      const left = ULTRA_MS - runClock;
      if (mode === 'sprint') {
        const rec = sprintRecord(), pbLines = rec.best ? rec.marks.filter((t) => t <= runClock).length : null;
        const card: ModeCard = { title: name('sprint'), big: clockText(runClock), fill: state.lines / SPRINT_LINES, mark: pbLines === null ? null : pbLines / SPRINT_LINES };
        if (splitNote && runClock < splitNote.until) { card.note = splitNote.text; card.noteColor = splitNote.color; }
        else if (pbLines !== null && runClock > 3000) { const d = state.lines - pbLines; card.note = d === 0 ? tr('On PB pace', '与纪录持平') : tr(`${d > 0 ? '+' : '−'}${Math.abs(d)} lines vs PB`, `比纪录${d > 0 ? '快' : '慢'} ${Math.abs(d)} 行`); card.noteColor = d >= 0 ? '#8EF0D0' : '#FF9AA8'; }
        return { card, headline: [tr('TIME', '用时'), clockText(runClock)], stats: [[labels.score, String(shownScore)], [labels.lines, `${Math.min(state.lines, SPRINT_LINES)}/${SPRINT_LINES}`], [labels.best, rec.best ? clockText(rec.best) : '—']] };
      }
      if (mode === 'ultra' || mode === 'daily') {
        const rec = traceFor(), second = Math.floor(runClock / 1000), pb = rec.trace.length ? rec.trace[Math.min(second, rec.trace.length - 1)] : null;
        const scale = Math.max(rec.best, state.score, 1);
        const card: ModeCard = { title: mode === 'daily' ? `${name('daily')} ${dayKey.slice(5)}` : name('ultra'), big: clockText(countIn > 0 ? ULTRA_MS : left, false), fill: state.score / scale, mark: pb === null ? null : pb / scale };
        if (pb !== null && runClock > 3000) { const d = state.score - pb; card.note = tr(`${d >= 0 ? '+' : '−'}${Math.abs(d)} vs best`, `比最佳${d >= 0 ? '多' : '少'} ${Math.abs(d)}`); card.noteColor = d >= 0 ? '#8EF0D0' : '#FF9AA8'; }
        if (left < 10_000 && countIn <= 0) { card.note = tr('Last seconds!', '最后几秒！'); card.noteColor = '#FFCF57'; }
        return { card, stats: [[labels.level, String(state.level)], [labels.lines, String(state.lines)], [labels.best, String(Math.max(rec.best, state.score))]] };
      }
      if (mode === 'zen') return { card: { title: name('zen'), big: String(state.lines), note: tr('lines · no game over', '行 · 不会结束') }, stats: [[labels.lines, String(state.lines)], [tr('PIECES', '方块'), String(state.pieces)]] };
      const p = DIG_PUZZLES[digIndex], used = state.pieces, piecesLeft = Math.max(0, p.budget - used);
      const possible = used <= p.par ? 3 : used <= twoStarLimit(p) ? 2 : 1;
      return {
        card: { title: tr('Pieces left', '剩余方块'), big: `${piecesLeft}`, fill: 1 - piecesLeft / p.budget, note: `★★★ ≤ ${p.par}`, stars: possible },
        headline: [tr('GARBAGE', '垃圾格'), String(garbageLeft(state))],
        stats: [[tr('PIECES', '方块'), `${used}/${p.budget}`], [tr('BEST', '最佳'), '★'.repeat(digStarList()[digIndex]) || '—']]
      };
    }
    const countText = () => (countIn <= 0 ? '' : countIn > COUNT_IN_MS * 2 / 3 ? '3' : countIn > COUNT_IN_MS / 3 ? '2' : '1');
    function draw() {
      const extra = modeView();
      renderer.draw({
        game: state, ghost: ghostY(state), fx, reduced, shownScore, best: bestScore(), hint: hintAlpha > 0 && !stopped && countIn <= 0 && !menu ? hint : [], hintAlpha,
        lockProgress: state.active && isGrounded(state) ? Math.min(1, lockTimer / LOCK_DELAY_MS) : 0, labels,
        ...extra, countIn: menu ? '' : countText()
      });
    }
    function refreshBar() {
      if (versus) return;
      modeButton.textContent = `☰ ${mode === 'dig' ? `${tr('Dig', '挖掘')} ${digIndex + 1} · ${tr(...DIG_PUZZLES[digIndex].name)}` : name(mode)}`;
      modeButton.setAttribute('aria-label', tr(`Mode: ${modeButton.textContent.slice(2)}. Choose a mode (M)`, `模式：${modeButton.textContent.slice(2)}。选择模式（M）`));
      if (mode === 'daily') { const d = readDaily(store); modeInfo.textContent = d.streak ? tr(`Streak ${d.streak}`, `连续 ${d.streak} 天`) : coarse ? '' : tr('Same pieces for everyone today', '今天所有人方块相同'); }
      else if (mode === 'dig') modeInfo.textContent = `★ ${digStarList().reduce((a, b) => a + b, 0)}/${DIG_PUZZLES.length * 3}`;
      else modeInfo.textContent = coarse ? '' : tr('M · modes', 'M · 模式');
    }

    // --- Panels: the result card at the end of a run, and the mode menu. Both live in the same overlay over the well. ---
    const btn = (attr: string, label: string, primary = false, disabled = false) => `<button type="button" ${attr}${disabled ? ' disabled' : ''} style="min-height:46px;min-width:120px;padding:0 16px;border:${primary ? '0' : '1px solid #3A3F78'};border-radius:13px;background:${primary ? ACCENT : '#151B36'};color:${primary ? '#0B0D1E' : '#F7F9FF'};font:800 16px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;opacity:${disabled ? '.4' : '1'}">${label}</button>`;
    const stat = (label: string, value: string | number) => `<div style="min-width:0"><div style="font-size:13px;font-weight:800;letter-spacing:.06em;color:#A8B1C5">${label}</div><div style="font-size:19px;font-weight:800">${value}</div></div>`;
    const panelButtons = () => [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    /** Outlines the highlighted button; keyboard and controller users move it with the arrows and press Space or Enter. */
    const mark = () => panelButtons().forEach((b, i) => { b.style.outline = i === sel ? '3px solid #FFCF57' : 'none'; b.style.outlineOffset = '2px'; });
    const openPanel = (html: string, label: string, first = 0) => {
      panel.innerHTML = html; panel.setAttribute('aria-label', label);
      panel.hidden = false; panel.style.display = 'flex';
      panel.style.overflowY = 'auto'; panel.style.justifyContent = panel.scrollHeight > panel.clientHeight + 4 ? 'flex-start' : 'center';
      sel = first; mark();
    };
    const closePanel = () => { panel.hidden = true; panel.style.display = 'none'; panel.innerHTML = ''; };
    let shareLine = '';

    function showPanel() {
      const record = mode === 'marathon' && state.score > bestAtStart && state.score > 0;
      const actions: string[] = [btn('data-retry', mode === 'dig' ? tr('Retry', '重试') : tr('Play again', '再来一局'), true)];
      let head = '', sub = '', big = String(state.score), extra = '', grid = '';
      if (finishedWith === 'topout') { head = tr('WELL FULL', '堆到顶了'); sub = tr('The stack reached the top.', '方块堆到了顶端。'); }
      if (mode === 'marathon' || versus) {
        grid = stat(labels.lines, state.lines) + stat(labels.level, state.level) + stat(labels.best, Math.max(bestAtStart, state.score));
        if (record) extra = `<div style="font-size:15px;font-weight:800;color:#FFCF57">★ ${tr('New best!', '新纪录！')}</div>`;
      } else if (mode === 'sprint') {
        const rec = sprintRecord();
        if (finishedWith === 'cleared') {
          head = tr('40 LINES!', '四十行完成！'); sub = tr('Sprint finished.', '竞速完成。'); big = clockText(runClock);
          if (newRecord) extra = `<div style="font-size:15px;font-weight:800;color:#FFCF57">★ ${tr('New best time!', '新纪录！')}</div>`;
          const splits = [10, 20, 30, 40].map((n) => marks[n - 1]).filter((t) => t !== undefined);
          extra += `<div style="font-size:14px;color:#C9D1E6">${tr('Splits', '分段')} ${splits.map((t) => clockText(t)).join(' · ')}</div>`;
        } else big = `${state.lines}/${SPRINT_LINES}`;
        grid = stat(labels.score, state.score) + stat(tr('PIECES', '方块'), state.pieces) + stat(labels.best, rec.best ? clockText(rec.best) : '—');
      } else if (mode === 'ultra' || mode === 'daily') {
        if (finishedWith === 'time') { head = tr("TIME'S UP", '时间到'); sub = mode === 'daily' ? tr(`Daily ${dayKey}`, `每日挑战 ${dayKey}`) : tr('Two minutes done.', '两分钟结束。'); }
        const rec = traceFor();
        if (newRecord) extra = `<div style="font-size:15px;font-weight:800;color:#FFCF57">★ ${tr('New best!', '新纪录！')}</div>`;
        grid = stat(labels.lines, state.lines) + stat(labels.level, state.level) + stat(labels.best, Math.max(rec.best, state.score));
        if (mode === 'daily') {
          const d = readDaily(store);
          shareLine = dailyShareText('Block Drop', state.score, d.streak, dayKey, zh());
          extra += `<div style="font-size:14px;color:#C9D1E6">${tr(`Streak ${d.streak} · played ${d.played}`, `连续 ${d.streak} 天 · 共 ${d.played} 次`)}</div>`;
          actions.push(btn('data-share', tr('Copy result', '复制成绩')));
        }
      } else if (mode === 'dig') {
        const p = DIG_PUZZLES[digIndex], stars = finishedWith === 'cleared' ? digStars(p, state.pieces) : 0;
        head = finishedWith === 'cleared' ? tr('DUG OUT!', '挖通了！') : finishedWith === 'budget' ? tr('OUT OF PIECES', '方块用完了') : head;
        sub = `${tr('Dig', '挖掘')} ${digIndex + 1} · ${tr(...p.name)}`;
        big = finishedWith === 'cleared' ? `<span style="color:#FFCF57">${'★'.repeat(stars)}</span><span style="color:#3A3F78">${'★'.repeat(3 - stars)}</span>` : `${garbageLeft(state)}`;
        if (finishedWith !== 'cleared') extra = `<div style="font-size:14px;color:#C9D1E6">${tr('garbage cells left', '剩余垃圾格')}</div>`;
        grid = stat(tr('PIECES', '方块'), state.pieces) + stat('★★★', `≤ ${p.par}`) + stat('★★', `≤ ${twoStarLimit(p)}`);
        if (finishedWith === 'cleared' && digIndex + 1 < DIG_PUZZLES.length) actions.unshift(btn('data-next', tr('Next puzzle', '下一关'), true));
      }
      actions.push(btn('data-modes', tr('Modes', '模式')));
      openPanel(`<div style="font-size:15px;font-weight:800;letter-spacing:.08em;color:${finishedWith === 'topout' || finishedWith === 'budget' ? '#FF8195' : '#8EF0D0'}">${head}</div>`
        + (sub ? `<div style="font-size:14px;color:#C9D1E6">${sub}</div>` : '')
        + `<div style="font-size:44px;font-weight:900;line-height:1.05">${big}</div>` + extra
        + `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%;max-width:260px">${grid}</div>`
        + `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px">${actions.join('')}</div>`
        + (coarse ? '' : `<div style="font-size:14px;color:#A8B1C5">${tr('Space, Enter or R · arrows choose', '空格、回车或 R · 方向键选择')}</div>`), tr('Game over', '游戏结束'));
      status.textContent = tr(`Run over. Score ${state.score}, ${state.lines} lines, level ${state.level}.`, `本局结束。得分 ${state.score}，消 ${state.lines} 行，等级 ${state.level}。`);
    }

    function showModes() {
      menu = 'modes'; releaseInput();
      const sprint = sprintRecord(), ultra = ultraRecord(), daily = readDaily(store), stars = digStarList().reduce((a, b) => a + b, 0);
      const detail: Record<ModeId, string> = {
        marathon: bestScore() ? tr(`Best ${bestScore()}`, `最高 ${bestScore()}`) : '',
        sprint: sprint.best ? tr(`Best ${clockText(sprint.best)}`, `最佳 ${clockText(sprint.best)}`) : '',
        ultra: ultra.best ? tr(`Best ${ultra.best}`, `最高 ${ultra.best}`) : '',
        zen: '',
        daily: daily.lastKey === dailyKey() ? tr(`Played today · ${daily.scores[dailyKey()] ?? 0} · streak ${daily.streak}`, `今日已玩 · ${daily.scores[dailyKey()] ?? 0} · 连续 ${daily.streak} 天`) : daily.streak ? tr(`New today · streak ${daily.streak}`, `今日新题 · 连续 ${daily.streak} 天`) : tr('New today', '今日新题'),
        dig: `★ ${stars}/${DIG_PUZZLES.length * 3}`
      };
      const item = (m: ModeId) => `<button type="button" data-mode="${m}" style="display:block;width:100%;text-align:left;padding:8px 12px;border:1px solid ${m === mode ? ACCENT : '#3A3F78'};border-radius:12px;background:${m === mode ? '#231F4F' : '#151B36'};color:#F7F9FF;font:700 13px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;line-height:1.3"><span style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">${name(m)}</b><span style="color:#FFCF57">${detail[m]}</span></span>${renderer.layout.compact ? '' : `<span style="color:#A8B1C5">${tr(...MODE_BLURBS[m])}</span>`}</button>`;
      openPanel(`<div style="font-size:15px;font-weight:800;letter-spacing:.08em;color:#C9C2FF">${tr('CHOOSE A MODE', '选择模式')}</div><div style="display:grid;gap:6px;width:100%;max-width:320px">${MODES.map(item).join('')}</div>${btn('data-close', tr('Back', '返回'))}`, tr('Modes', '模式'), Math.max(0, MODES.indexOf(mode)));
    }

    function showDig() {
      menu = 'dig'; releaseInput();
      const stars = digStarList();
      const cell = (p: (typeof DIG_PUZZLES)[number], i: number) => {
        const open = digOpen(i, stars);
        return `<button type="button" data-dig="${i}"${open ? '' : ' disabled'} title="${tr(...p.name)}" style="min-height:48px;padding:2px 0;border:1px solid ${i === digIndex ? ACCENT : '#3A3F78'};border-radius:10px;background:${open ? '#151B36' : '#0E1326'};color:${open ? '#F7F9FF' : '#5E6788'};font:800 15px system-ui,sans-serif;cursor:${open ? 'pointer' : 'default'};touch-action:manipulation;line-height:1.1">${open ? i + 1 : '🔒'}<br><span style="font-size:11px;color:#FFCF57">${'★'.repeat(stars[i])}<span style="color:#3A3F78">${'★'.repeat(3 - stars[i])}</span></span></button>`;
      };
      const first = Math.max(0, DIG_PUZZLES.findIndex((_, i) => digOpen(i, stars) && stars[i] < 3));
      openPanel(`<div style="font-size:15px;font-weight:800;letter-spacing:.08em;color:#C9C2FF">${tr('DIG PUZZLES', '挖掘关')} · ★ ${stars.reduce((a, b) => a + b, 0)}/${DIG_PUZZLES.length * 3}</div><div style="font-size:13px;color:#A8B1C5;max-width:280px">${tr('Clear every grey block. Fewer pieces, more stars.', '挖光所有灰色方块。用的方块越少，星越多。')}</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;max-width:300px">${DIG_PUZZLES.map(cell).join('')}</div>${btn('data-close', tr('Back', '返回'))}`, tr('Dig puzzles', '挖掘关'), first);
    }

    /** Leaves the menu: back to the result card if the run had ended, otherwise straight back into play. */
    const leaveMenu = () => { menu = ''; if (stopped) showPanel(); else { closePanel(); last = performance.now(); } root.focus({ preventScroll: true }); };
    const startMode = (next: ModeId, puzzle = digIndex) => {
      mode = next; digIndex = puzzle; menu = '';
      if (!versus) { store.set('mode', mode); store.set('dig-index', digIndex); }
      services.sound.play('tap'); restart();
    };
    panel.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('button');
      if (!target || target.hasAttribute('disabled')) return;
      if (target.hasAttribute('data-mode')) { const m = target.dataset.mode as ModeId; if (m === 'dig') showDig(); else startMode(m); }
      else if (target.hasAttribute('data-dig')) startMode('dig', Number(target.dataset.dig));
      else if (target.hasAttribute('data-close')) { if (menu === 'dig') showModes(); else leaveMenu(); }
      else if (target.hasAttribute('data-modes')) showModes();
      else if (target.hasAttribute('data-share')) { void globalThis.navigator?.clipboard?.writeText(shareLine).then(() => { target.textContent = tr('Copied!', '已复制！'); }, () => { target.textContent = shareLine; }); }
      else if (clock - overAt > 250) {
        if (target.hasAttribute('data-next')) startMode('dig', digIndex + 1);
        else if (target.hasAttribute('data-retry')) restart();
      }
      root.focus({ preventScroll: true });
    }, { signal });
    modeButton.addEventListener('click', () => { if (paused) return; if (menu) leaveMenu(); else showModes(); }, { signal });

    // --- Actions. ---
    /** A successful slide or turn buys the resting piece more time, up to a limit so it cannot stall forever. */
    const nudged = () => { if (lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; } };
    /** Ends the run for any reason and records it where that mode keeps its bests. Only Marathon reaches the shared leaderboard. */
    const finish = (reason: 'topout' | 'time' | 'cleared' | 'budget') => {
      if (stopped) return;
      finishedWith = reason; newRecord = false;
      if (reason === 'topout' || reason === 'budget') { stopped = true; services.sound.play('fail'); }
      else { stopped = true; services.sound.play('success'); cue('upgrade', 140); }
      overAt = clock; cues = cues.filter((c) => c.kind === 'upgrade'); held.left = held.right = held.down = false; slideDir = 0;
      if (versus || mode === 'marathon') { best(services, BEST_KEY, state.score); services.reportScore(state.score); }
      else if (mode === 'sprint' && reason === 'cleared') {
        const rec = sprintRecord();
        if (rec.best === null || runClock < rec.best) { store.set<SprintRecord>('sprint', { best: Math.round(runClock), marks: marks.map(Math.round) }); newRecord = true; }
      } else if (mode === 'ultra' || mode === 'daily') {
        trace.push(state.score);
        const rec = traceFor();
        if (state.score > rec.best || !rec.trace.length) { newRecord = state.score > rec.best; store.set(mode === 'daily' ? 'daily-trace' : 'ultra', { ...(mode === 'daily' ? { key: dayKey } : {}), best: Math.max(rec.best, state.score), trace }); }
        if (mode === 'daily') recordDaily(store, state.score, '', dayKey);
      } else if (mode === 'dig' && reason === 'cleared') {
        const list = digStarList(), stars = digStars(DIG_PUZZLES[digIndex], state.pieces);
        if (stars > list[digIndex]) { list[digIndex] = stars; store.set('dig-stars', list); newRecord = true; }
        services.reportComplete((digIndex + 1) / DIG_PUZZLES.length);
      }
      refreshBar(); showPanel();
    };
    const endRun = () => {
      if (!state.over || stopped) return;
      if (mode === 'zen' && !versus) {
        // Zen never ends: the well empties and the stack starts again.
        zenRelief(state); fresh(); services.sound.play('upgrade');
        fx.popups = [{ title: tr('FRESH WELL', '清空重来'), sub: tr('Zen keeps going', '禅模式继续'), row: HIDDEN + 8, t: 0, color: '#8EF0D0' }];
        return;
      }
      finish('topout');
    };
    /** Mode goals checked after every settled piece and finished clear. */
    const checkGoals = () => {
      if (stopped || versus) return;
      if (mode === 'sprint' && state.lines >= SPRINT_LINES && !state.clearing.length) finish('cleared');
      else if (mode === 'dig' && !state.clearing.length) {
        if (garbageLeft(state) === 0) finish('cleared');
        else if (state.pieces >= DIG_PUZZLES[digIndex].budget) finish('budget');
      }
    };
    const move = (dx: number, dy: number, audible = true) => {
      if (stopped || paused || countIn > 0 || menu || !state.active) return false;
      if (!shift(state, dx, dy)) return false;
      if (dx) { nudged(); if (audible) services.sound.play('move'); }
      if (dy && state.active.y > lowest) { lowest = state.active.y; lockResets = 0; lockTimer = 0; }
      return true;
    };
    const turn = (dir: 1 | -1 = 1) => {
      if (paused || stopped || countIn > 0 || menu || !state.active) return;
      if (rotate(state, dir)) { nudged(); services.sound.play('tap'); }
    };
    const fresh = () => { carry = 0; softCarry = 0; lockTimer = 0; lockResets = 0; lowest = state.active?.y ?? 0; };
    const popup = (result: LockResult) => {
      const count = result.rows.length;
      if (!count && !result.spin) return;
      const names = [tr('T-SPIN', 'T 旋'), tr('SINGLE', '单行'), tr('DOUBLE', '双行'), tr('TRIPLE', '三行'), tr('QUAD!', '四行！')];
      let title = result.spin ? (count ? `${names[0]} ${names[count]}` : names[0]) : names[count];
      // Named call-outs: back-to-back leads the title, a perfect clear replaces it, combos count up underneath.
      if (result.backToBack) title = `${tr('B2B', '连续')} ${title}`;
      if (result.perfect) title = tr('PERFECT CLEAR!', '全清！');
      const extras = [result.backToBack ? tr('Back-to-back ×1.5', '连续大消 ×1.5') : '', result.combo > 0 ? tr(`${result.combo + 1} combo`, `${result.combo + 1} 连击`) : ''].filter(Boolean);
      const color = result.perfect ? '#FFE08A' : result.backToBack ? '#FFB86B' : count === 4 ? '#FFCF57' : result.spin ? '#D9B8FF' : count >= 2 ? '#8EF0D0' : '#F7F9FF';
      const row = count ? result.rows[Math.floor(count / 2)] : Math.max(...result.cells.map(([, y]) => y));
      fx.popups = []; // One call-out at a time keeps the well readable during quick chains.
      fx.popups.push({ title, sub: [`+${result.gained}`, ...extras].join(' · '), row: Math.max(row, HIDDEN + 3), t: 0, color });
    };
    /** Fixes the piece in place, scores it and starts the row-clear animation when rows are full. */
    const settle = (dropped = 0) => {
      const before = state.active;
      const result = lockPiece(state);
      if (!result || !before) return;
      fx.locks.push({ cells: result.cells, t: 0 });
      if (dropped > 1) { fx.trails.push({ cells: result.cells, from: Math.min(dropped, 8), type: result.type, t: 0 }); fx.thud = THUD_MS; }
      const count = result.rows.length;
      services.sound.play('hit');
      if (count) {
        fx.clear = { rows: result.rows, t: 0, dur: reduced ? CLEAR_MS_REDUCED : CLEAR_MS }; clearTimer = 0;
        // Bigger clears climb further up the cue ladder.
        cue('clear', 40); if (count >= 2) cue('collect', 110); if (count >= 3 || result.spin) cue('upgrade', 180); if (count === 4 || result.perfect) cue('success', 260);
        if (versus || mode === 'marathon') services.reportScore(state.score);
        // Sprint: note when each line was reached (for the pace marker) and call out a split every ten lines.
        if (mode === 'sprint') {
          const before = marks.length;
          while (marks.length < Math.min(SPRINT_LINES, state.lines)) marks.push(runClock);
          const split = [10, 20, 30].find((n) => before < n && marks.length >= n);
          if (split) {
            const rec = sprintRecord(), pb = rec.best ? rec.marks[split - 1] : undefined, d = pb === undefined ? null : (runClock - pb) / 1000;
            splitNote = { text: `${split}: ${clockText(runClock)}${d === null ? '' : ` ${signed(d)}`}`, color: d === null ? '#F7F9FF' : d <= 0 ? '#8EF0D0' : '#FF9AA8', until: runClock + 3000 };
            cue('collect', 200);
          }
        }
        if (result.combo > 0) comboTone(result.combo);
        if (result.perfect) fx.flash = reduced ? FLASH_MS / 2 : FLASH_MS;
        if (coarse) globalThis.navigator?.vibrate?.(count === 4 ? [12, 30, 24] : 12);
      } else if (result.spin) cue('collect', 60);
      popup(result);
      if (result.levelUp && (versus || mode !== 'zen')) { fx.levelUp = LEVEL_MS; cue('upgrade', count === 4 ? 380 : 300); cue('success', count === 4 ? 470 : 390); }
      canvas.setAttribute('aria-label', tr(`Block Drop. Score ${state.score}, level ${state.level}, ${state.lines} lines.`, `方块下落。得分 ${state.score}，等级 ${state.level}，消 ${state.lines} 行。`));
      fresh(); endRun(); checkGoals();
    };
    const drop = () => {
      if (paused || stopped || countIn > 0 || menu || !state.active) return;
      services.sound.play('tap');
      let rows = 0;
      while (move(0, 1, false)) rows++;
      state.score += rows * 2;
      settle(rows);
    };
    const hold = () => {
      if (paused || stopped || countIn > 0 || menu || !state.active) return;
      if (holdPiece(state)) { services.sound.play('collect'); fresh(); endRun(); } else services.sound.play('hit');
    };
    const releaseInput = () => { held.left = held.right = held.down = false; slideDir = 0; gesture = null; };
    const restart = () => {
      mobile?.clear(); services.sound.stop(); releaseInput();
      paused = false; stopped = false; cues = []; fx = newEffects(); shownScore = 0; hintAlpha = 1; clearTimer = 0;
      bestAtStart = bestScore();
      menu = ''; finishedWith = ''; runClock = 0; trace = []; marks = []; splitNote = null; newRecord = false;
      if (versus || mode === 'marathon' || mode === 'sprint' || mode === 'ultra' || mode === 'zen') state = createGame(services.random);
      else if (mode === 'daily') { dayKey = dailyKey(); state = createGame(dailyRandom('block-drop', dayKey)); }
      else state = createGame(digRandom(digIndex), { garbage: DIG_PUZZLES[digIndex].rows });
      countIn = !versus && timedMode(mode) ? COUNT_IN_MS : 0;
      fresh(); refreshBar(); fit();
      closePanel(); status.textContent = '';
      last = performance.now(); draw();
      // The shell's Restart and Resume buttons take focus; take it back so the keyboard keeps working.
      root.focus({ preventScroll: true });
    };

    // --- Frame loop: gravity, held keys, lock delay, effects. ---
    const loop = (time: number) => {
      const dt = Math.min(100, Math.max(0, time - last)); last = time;
      raf = requestAnimationFrame(loop);
      if (paused || menu) { if (menu) draw(); return; }
      clock += dt;
      for (let i = cues.length - 1; i >= 0; i--) if (cues[i].at <= clock) { services.sound.play(cues[i].kind); cues.splice(i, 1); }
      if (!stopped && countIn > 0) {
        countIn -= dt;
        if (countIn <= 0) { services.sound.play('success'); fx.popups = [{ title: tr('GO!', '开始！'), sub: '', row: HIDDEN + 7, t: 0, color: '#8EF0D0' }]; }
        else if (Math.ceil(countIn / (COUNT_IN_MS / 3)) !== Math.ceil((countIn + dt) / (COUNT_IN_MS / 3))) services.sound.play('tap');
      } else if (!stopped) {
        runClock += dt;
        if (mode === 'ultra' || mode === 'daily') {
          while (trace.length < Math.floor(runClock / 1000)) trace.push(state.score);
          if (runClock >= ULTRA_MS) { runClock = ULTRA_MS; finish('time'); }
        }
      }
      if (!stopped && countIn <= 0) {
        if (fx.clear) {
          clearTimer += dt; fx.clear.t = clearTimer;
          if (clearTimer >= fx.clear.dur) { fx.clear = null; finishClear(state); fresh(); endRun(); checkGoals(); }
        } else if (state.active) {
          if (slideDir) { slideTime += dt; while (slideTime >= slideNext) { slideNext += ARR_MS; if (!move(slideDir, 0)) break; } }
          const interval = gravityMs(mode === 'zen' && !versus ? 1 : state.level);
          if (held.down) {
            softCarry += dt;
            const every = Math.min(SOFT_MS, interval);
            while (softCarry >= every) { softCarry -= every; if (move(0, 1, false)) { state.score += 1; carry = 0; } else { softCarry = 0; break; } }
          }
          carry += dt;
          while (carry >= interval) { carry -= interval; if (!move(0, 1, false)) { carry = 0; break; } }
          if (isGrounded(state)) { lockTimer += dt; if (lockTimer >= LOCK_DELAY_MS) settle(); } else lockTimer = 0;
        }
      }
      // Effects and the score counter keep running after the run ends so the last lock still lands visibly.
      fx.locks = fx.locks.filter((item) => (item.t += dt) < LOCK_MS);
      fx.trails = fx.trails.filter((item) => (item.t += dt) < TRAIL_MS);
      fx.popups = fx.popups.filter((item) => (item.t += dt) < POPUP_MS);
      fx.levelUp = Math.max(0, fx.levelUp - dt); fx.thud = Math.max(0, fx.thud - dt); fx.flash = Math.max(0, fx.flash - dt);
      if (state.pieces > 0) hintAlpha = Math.max(0, hintAlpha - dt / 400);
      shownScore = state.score - shownScore < 2 ? state.score : Math.min(state.score, Math.ceil(shownScore + (state.score - shownScore) * Math.min(1, dt / 110)));
      draw();
    };

    // --- Keyboard (also what the on-screen buttons and the gamepad bridge send). ---
    const GAME_KEYS = new Set(['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'r', 'x', 'z', 'c', 'shift', 'enter', 'a', 'd', 's', 'w', 'm']);
    /** Arrow keys walk the highlighted button (a row of four in the puzzle grid); Space or Enter presses it. */
    const navigate = (key: string) => {
      const buttons = panelButtons(), n = buttons.length;
      if (!n) return;
      const step = menu === 'dig' ? 4 : 1;
      if (key === 'arrowleft' || key === 'a') sel = (sel - 1 + n) % n;
      else if (key === 'arrowright' || key === 'd') sel = (sel + 1) % n;
      else if (key === 'arrowup' || key === 'w') sel = sel - step >= 0 ? sel - step : (sel - 1 + n) % n;
      else if (key === 'arrowdown' || key === 's') sel = sel + step < n ? sel + step : (sel + 1) % n;
      else return;
      mark(); buttons[sel]?.scrollIntoView?.({ block: 'nearest' }); services.sound.play('move');
    };
    const pressSelected = () => { panelButtons()[sel]?.click(); };
    const slide = (dir: number) => { slideDir = dir; slideTime = 0; slideNext = DAS_MS; move(dir, 0); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (paused || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' && menu) { event.preventDefault(); if (menu === 'dig') showModes(); else leaveMenu(); return; }
      if (!GAME_KEYS.has(key)) return;
      if (key !== 'enter' || stopped) event.preventDefault();
      // Held keys are timed here, so the same feel reaches keyboard, touch buttons and controllers alike.
      if (event.repeat) return;
      if (menu) {
        if (key === 'm') { if (menu === 'dig') showModes(); else leaveMenu(); }
        else if (key === ' ' || key === 'enter') pressSelected();
        else if (key === 'r') leaveMenu();
        else navigate(key);
        return;
      }
      if (key === 'm') { if (!versus) showModes(); return; }
      if (key === 'r') { restart(); return; }
      if (stopped) {
        if ((key === 'enter' && clock - overAt > RETRY_GUARD_MS) || (key === ' ' && clock - overAt > RETRY_GUARD_SPACE_MS)) { if (panelButtons().length) pressSelected(); else restart(); }
        else navigate(key);
        return;
      }
      if (key === 'arrowleft' || key === 'a') { held.left = true; slide(-1); }
      else if (key === 'arrowright' || key === 'd') { held.right = true; slide(1); }
      else if (key === 'arrowdown' || key === 's') {
        // A fresh press on a piece that is already resting confirms it at once.
        if (state.active && !fx.clear && isGrounded(state)) settle();
        else { held.down = true; softCarry = 0; if (move(0, 1, false)) { state.score += 1; carry = 0; } }
      }
      else if (key === 'arrowup' || key === 'x' || key === 'w') turn(1);
      else if (key === 'z') turn(-1);
      else if (key === ' ') drop();
      else if (key === 'c' || key === 'shift') hold();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') { held.left = false; if (slideDir < 0) { slideDir = 0; if (held.right && !paused) slide(1); } }
      if (key === 'arrowright' || key === 'd') { held.right = false; if (slideDir > 0) { slideDir = 0; if (held.left && !paused) slide(-1); } }
      if (key === 'arrowdown' || key === 's') held.down = false;
    };
    root.addEventListener('keydown', onKeyDown, { signal });
    root.addEventListener('keyup', onKeyUp, { signal });
    // Clicking a shell button (Full screen, Share…) leaves focus there and the keyboard dead. An arrow key, or Space
    // away from a button, pressed anywhere else on the page comes back to the game. Split-screen seats get their keys
    // from the versus wrapper instead.
    if (!versus && typeof document !== 'undefined') {
      const stray = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null, key = event.key;
        if (paused || !target?.closest || root.contains(target) || !root.isConnected) return false;
        if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open], .pad-panel')) return false;
        if (key === ' ') return !target.closest('button, a, summary, [role="button"]');
        return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowDown' || key === 'ArrowUp';
      };
      document.addEventListener('keydown', (event) => { if (stray(event)) { root.focus({ preventScroll: true }); onKeyDown(event); } }, { signal });
      document.addEventListener('keyup', (event) => { if (!root.contains(event.target as Node)) onKeyUp(event); }, { signal });
    }
    root.addEventListener('blur', releaseInput, { signal });

    // --- Touch and mouse on the board: drag to slide, tap to turn, drag down to speed up, flick down to drop, flick up to hold. ---
    type Gesture = { id: number; x: number; y: number; ax: number; ay: number; at: number; axis: '' | 'h' | 'v'; moved: boolean; lastY: number; lastAt: number; speed: number };
    let gesture: Gesture | null = null;
    canvas.addEventListener('pointerdown', (event) => {
      root.focus({ preventScroll: true });
      if (paused || stopped || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, ax: event.clientX, ay: event.clientY, at: event.timeStamp, axis: '', moved: false, lastY: event.clientY, lastAt: event.timeStamp, speed: 0 };
      canvas.setPointerCapture?.(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId || paused || stopped) return;
      const step = Math.max(16, renderer.layout.cell * 0.92), dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) g.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      const elapsed = event.timeStamp - g.lastAt;
      if (elapsed > 0) { g.speed = g.speed * 0.5 + ((event.clientY - g.lastY) / elapsed) * 0.5; g.lastY = event.clientY; g.lastAt = event.timeStamp; }
      if (g.axis === 'h') {
        while (Math.abs(event.clientX - g.ax) >= step) { const dir = event.clientX > g.ax ? 1 : -1; g.ax += dir * step; g.moved = true; move(dir, 0); }
      } else if (g.axis === 'v') {
        while (event.clientY - g.ay >= step) { g.ay += step; g.moved = true; if (move(0, 1, false)) { state.score += 1; carry = 0; } }
      }
    }, { signal });
    const endGesture = (event: PointerEvent, cancelled: boolean) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      gesture = null;
      if (cancelled || paused || stopped) return;
      const dy = event.clientY - g.y, time = event.timeStamp - g.at;
      if (!g.axis) { if (time < 400) turn(1); return; }
      if (g.axis !== 'v') return;
      // A quick downward flick is a hard drop; a slow drag has already stepped the piece down.
      if (dy > 36 && (g.speed > 0.55 || (time < 260 && dy > 48))) drop();
      else if (dy < -36 && time < 500) hold();
    };
    canvas.addEventListener('pointerup', (event) => endGesture(event, false), { signal });
    canvas.addEventListener('pointercancel', (event) => endGesture(event, true), { signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });

    fit(); restart(); last = performance.now(); raf = requestAnimationFrame(loop);
    return {
      pause: () => { paused = true; releaseInput(); mobile?.clear(); services.sound.stop(); },
      resume: () => { paused = false; last = performance.now(); root.focus({ preventScroll: true }); },
      restart,
      destroy: () => { cancelAnimationFrame(raf); observer?.disconnect(); abort.abort(); cues = []; services.sound.stop(); mobile?.destroy(); root.remove(); }
    };
  },
};
export default game;
