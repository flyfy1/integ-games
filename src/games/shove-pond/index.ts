import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAudio } from './audio';
import { botPlan, type BotLevel } from './bot';
import { FROG_NAMES, createI18n, defaultLang, isLang, type Key, type Lang } from './i18n';
import { LESSONS, PUZZLES, buildScenario, scenarioPlans, scenarioWon, type Scenario } from './levels';
import { createOnline, type OnlineLink } from './net';
import { PALETTE, createRenderer, type Emote, type Look } from './render';
import {
  BRACE, DOWN, LEFT, RIGHT, SIT, UP, createMatch, crownOf, moveOrder, normalizePlan, planFromString, resolveRound, stateHash, type Plan, type RoundResult, type State
} from './sim';
import { STYLES } from './styles';

/**
 * Shove Pond shell: stage, sizing, frame loop, HUD, menus and input. Rules are in `sim.ts` (pure), bots in
 * `bot.ts`, scenarios in `levels.ts`, drawing in `render.ts`, online rooms in `net.ts` over the shared relay kit.
 */
type Save = { v: 1; lang?: Lang; school: number; puzzles: string[]; ladder: number; name?: string; matches: number; wins: number; best: number };
type SeatKind = 'me' | 'bot' | 'pass' | 'remote';
type SeatCfg = { kind: SeatKind; level: BotLevel; name: string };
type MatchMode = 'quick' | 'ladder' | 'pass' | 'online';
type ScenarioScene = { kind: 'scenario'; list: 'lesson' | 'puzzle'; index: number; sc: Scenario; state: State; fails: number; hint: boolean };
type MatchScene = {
  kind: 'match'; mode: MatchMode; state: State; seats: SeatCfg[]; me: number; ladder?: number; dealt: number[];
  /** Pass and play: seats still to plan this round, and the drafts already locked in. */
  passQueue: number[]; passDrafts: (Plan | null)[]; passing: number;
  online?: OnlineLink;
};
type Scene = ScenarioScene | MatchScene;
type Phase = 'idle' | 'plan' | 'reveal' | 'card';

const SAVE_KEY = 'save';
const ARROWS = ['↑', '→', '↓', '←'];
const PLAN_SECONDS = 8, FIRST_SECONDS = 15;
const LADDER_LEVELS: BotLevel[] = [1, 2, 3];

function loadSave(services: GameServices): Save {
  const raw = services.storage.get<Partial<Save> | null>(SAVE_KEY, null);
  return {
    v: 1, lang: isLang(raw?.lang) ? raw.lang : undefined,
    school: Math.max(0, Math.min(5, Number(raw?.school) || 0)),
    puzzles: Array.isArray(raw?.puzzles) ? raw.puzzles.filter((p): p is string => typeof p === 'string') : [],
    ladder: Math.max(0, Math.min(3, Number(raw?.ladder) || 0)),
    name: typeof raw?.name === 'string' ? raw.name.slice(0, 14) : undefined,
    matches: Number(raw?.matches) || 0, wins: Number(raw?.wins) || 0, best: Number(raw?.best) || 0
  };
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: (Node | string | null | undefined | false)[]) => {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'disabled' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (tag === 'button') el.setAttribute('type', 'button');
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const shovePond: GameModule = {
  meta: {
    slug: 'shove-pond', title: 'Shove Pond', category: 'arcade',
    description: 'Everyone secretly draws three hops, then all the frogs jump at once and shove each other off the lily pads.',
    instructions: 'Swipe three times (or tap the arrows) to plan three hops, or use Brace once to stand firm; then tap Ready. All frogs jump together: hop into a frog to shove the whole line, and push frogs into the water to score. The crowned leader is worth double. Keys: arrows or WASD hop, Space brace, Backspace undo, Enter ready.',
    accent: '#5fd068', mechanic: 'Plan three hops, shove frogs into the pond'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    let save = loadSave(services);
    let i18n = createI18n(save.lang ?? defaultLang());
    const t = (k: Key, v?: Record<string, string | number>) => i18n.t(k, v);
    const persist = () => services.storage.set(SAVE_KEY, save);
    const reduced = () => services.isReducedMotion;

    const root = h('div', { class: `sp${reduced() ? ' reduced' : ''}`, tabindex: '0', role: 'application', 'aria-label': 'Shove Pond', 'data-shove-pond': '' });
    const style = h('style'); style.textContent = STYLES;
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const top = h('div', { class: 'sp-top' });
    const bottom = h('div', { class: 'sp-bottom' });
    const toast = h('div', { class: 'sp-toast', role: 'status' }); toast.style.opacity = '0';
    const status = h('div', { class: 'sp-status', role: 'status' });
    root.append(style, canvas, top, bottom, status, toast);
    host.replaceChildren(root);

    const audio = createAudio(services);
    const renderer = createRenderer(canvas, audio, reduced);
    let scene: Scene | null = null;
    let phase: Phase = 'idle';
    let draft: number[] = [];
    let ready = false;
    let deadline = 0;          // renderer clock seconds; 0 = no timer
    let lastTick = -1;
    let panel: HTMLElement | null = null;
    let emotes: Emote[] = [];
    let destroyed = false, paused = false, raf = 0, last = 0;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    let readySeats = new Set<number>();
    let resumeFromMenu: (() => void) | null = null;
    let awaySeats = new Set<number>();
    let pendingPlans: Plan[] | null = null;
    const online = createOnline({
      t, name: () => myName(),
      onState: () => { refreshHud(); },
      onStart: (state, seats, me) => startOnlineMatch(state, seats, me),
      onSeats: (seats) => {
        if (scene?.kind !== 'match' || scene.mode !== 'online') return;
        const ms = scene;
        seats.forEach((x, i) => { if (ms.seats[i]) ms.seats[i] = { ...ms.seats[i], kind: x.kind, name: x.name }; });
        refreshHud();
      },
      onOpen: (secondsLeft) => { if (scene?.kind === 'match' && scene.mode === 'online' && phase !== 'reveal') beginPlanning(secondsLeft); },
      onReveal: (plans) => { if (scene?.kind === 'match' && scene.mode === 'online') queueReveal(plans); },
      onReady: (seats) => { readySeats = seats; refreshHud(); },
      onPresence: (away) => { awaySeats = away; refreshHud(); },
      onEmote: (seat, e) => showEmote(seat, e),
      onGone: () => { if (scene?.kind === 'match' && scene.mode === 'online') fallBackToBots(); },
      onLobby: () => renderLobby(),
      isBusy: () => phase === 'reveal',
      currentState: () => (scene?.kind === 'match' ? scene.state : null)
    });

    /** A player without a chosen name gets a random pond name once (so two guests are not both "Lily"). */
    function myName(): string {
      if (!save.name) { save.name = `${FROG_NAMES[Math.floor(services.random() * FROG_NAMES.length)][i18n.lang]}${Math.floor(services.random() * 90 + 10)}`; persist(); }
      return save.name;
    }
    const say = (text: string, ms = 1400) => {
      toast.textContent = text; toast.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms);
    };

    // ---------------------------------------------------------------- sizing
    let hudTop = 60, hudBottom = 160;
    const layout = () => {
      if (destroyed) return;
      const immersive = host.classList.contains('is-immersive') || (typeof document !== 'undefined' && document.fullscreenElement === host);
      root.classList.toggle('is-immersive', immersive);
      const width = host.clientWidth > 40 ? host.clientWidth : 360;
      let height: number;
      if (immersive && host.clientHeight > 0) height = host.clientHeight;
      else if (width < 560) height = clamp(window.innerHeight - 140, 520, width * 1.9);
      else height = clamp(window.innerHeight - 190, 520, 760);
      height = Math.floor(height);
      root.style.setProperty('--sp-h', `${height}px`);
      root.classList.toggle('compact', width < 380 || height < 600);
      root.classList.toggle('wide', width >= 640);
      hudTop = top.offsetHeight + 8; hudBottom = bottom.offsetHeight + 8;
      renderer.resize(width, height, Math.min(2, window.devicePixelRatio || 1), hudTop, hudBottom);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
    ro?.observe(host);
    window.addEventListener('resize', layout);

    // ---------------------------------------------------------------- views
    const looksFor = (): Look[] => {
      if (!scene) return [];
      if (scene.kind === 'scenario') return scene.state.frogs.map((_, i) => ({ name: i === 0 ? t('room.you') : '', pattern: i % 3, tag: i === 0 }));
      return scene.seats.map((s, i) => ({ name: s.name, pattern: i % 3, tag: true }));
    };
    const viewState = (): State | null => scene?.state ?? null;
    const mySeat = () => (!scene ? -1 : scene.kind === 'scenario' ? 0 : scene.mode === 'pass' ? scene.passing : scene.me);
    const ghostPlans = (): (Plan | null)[] | null => {
      if (scene?.kind !== 'scenario' || !scene.sc.ghosts) return null;
      return scenarioPlans(scene.sc, []).map((p, i) => (i === 0 ? null : p));
    };
    const handDir = (): number => {
      if (scene?.kind !== 'scenario' || phase !== 'plan' || ready) return -1;
      const showAlways = scene.list === 'lesson' && scene.index < 2;
      if (!showAlways && !scene.hint) return -1;
      const sol = planFromString(scene.sc.solution);
      if (!sol) return -1;
      if (draft.some((a, i) => a !== sol[i])) return -1;
      if (scene.list === 'puzzle' && draft.length >= 1) return -1; // a puzzle hint shows the first hop only
      const next = sol[draft.length];
      return next !== undefined && next < 4 ? next : -1;
    };
    const nextIsBrace = () => {
      if (scene?.kind !== 'scenario' || phase !== 'plan') return false;
      const showAlways = scene.list === 'lesson' && scene.index < 2;
      if (!showAlways && !scene.hint) return false;
      const sol = planFromString(scene.sc.solution);
      if (scene.list === 'puzzle' && draft.length >= 1) return false;
      return !!sol && draft.every((a, i) => a === sol[i]) && sol[draft.length] === BRACE;
    };

    // ---------------------------------------------------------------- HUD
    let timerBar: HTMLElement | null = null, timerBox: HTMLElement | null = null, readyBtn: HTMLButtonElement | null = null, braceBtn: HTMLButtonElement | null = null;
    let slotEls: HTMLButtonElement[] = [];
    function refreshHud() {
      // Phase and round are mirrored on the root for playtest scripts.
      root.dataset.phase = phase;
      root.dataset.hash = scene?.kind === 'match' ? String(stateHash(scene.state)) : '';
      root.dataset.scene = !scene ? '' : scene.kind === 'scenario' ? `${scene.list}-${scene.index + 1}` : `${scene.mode}-r${scene.state.round}${scene.state.over ? '-over' : ''}`;
      top.replaceChildren(); bottom.replaceChildren();
      timerBar = null; timerBox = null; readyBtn = null; braceBtn = null; slotEls = [];
      if (!scene) { layout(); return; }
      // The menu sits on the right: the arcade's own exit button floats at the top left in full screen.
      const row = h('div', { class: 'sp-row' },
        h('div', { class: 'sp-title' }, titleText(), h('div', { class: 'sp-sub', text: subText() })),
        h('button', { class: 'sp-menu-btn', onclick: () => openMenu(), 'aria-label': t('hud.menu') }, `☰ ${t('hud.menu')}`));
      top.append(row);
      if (online.code && !online.inMatch && scene.kind === 'scenario') top.append(lobbyCard());
      if (scene.kind === 'match') {
        const chips = h('div', { class: 'sp-scores' });
        const ms = scene;
        const crown = crownOf(ms.state);
        const order = moveOrder(ms.state);
        order.forEach((seat) => {
          const f = ms.state.frogs[seat];
          const away = awaySeats.has(seat);
          const chip = h('div', { class: `sp-chip${seat === mySeat() ? ' me' : ''}${readySeats.has(seat) ? ' ready' : ''}${away ? ' away' : ''}`, title: ms.seats[seat].name },
            h('i', { style: `background:${PALETTE[seat % 6].body}` }), `${crown === seat ? '👑' : ''}${f.score}`);
          chips.append(chip);
        });
        top.append(chips);
      } else {
        top.append(h('div', { class: 'sp-cap' }, h('b', { text: scene.list === 'lesson' ? '🐸' : '💦' }), scene.list === 'lesson' ? i18n.tr(scene.sc.caption) : t('puzzle.goal')));
      }
      if (phase === 'plan' || phase === 'reveal') buildTray();
      layout();
    }
    function titleText(): string {
      if (!scene) return t('title.name');
      if (scene.kind === 'scenario') return scene.list === 'lesson' ? t('lesson.n', { n: scene.index + 1 }) : t('puzzle.n', { n: scene.index + 1 });
      if (scene.mode === 'ladder') return t('ladder.step', { n: (scene.ladder ?? 0) + 1, name: t(`ladder.${(scene.ladder ?? 0) + 1}` as Key) });
      if (scene.mode === 'online') return online.code ? t('room.title', { code: online.code }) : t('menu.online');
      return t('title.name');
    }
    function subText(): string {
      if (!scene) return '';
      if (scene.kind === 'scenario') return scene.list === 'puzzle' ? i18n.tr(scene.sc.caption) : '';
      const r = scene.state.round;
      return r > 8 ? t('hud.sudden', { n: r }) : t('hud.to', { n: r });
    }
    function buildTray() {
      const planning = phase === 'plan' && !(scene?.kind === 'match' && scene.mode === 'online' && !online.playing);
      timerBox = h('div', { class: 'sp-timer' }); timerBar = h('i'); timerBox.append(timerBar);
      if (!deadline) timerBox.style.visibility = 'hidden';
      const slots = h('div', { class: 'sp-slots' });
      for (let i = 0; i < 3; i++) {
        const a = draft[i];
        const b = h('button', { class: `sp-slot${a !== undefined ? ' full' : ''}`, 'aria-label': `Step ${i + 1}`, onclick: () => { if (a !== undefined) clearStep(i); } },
          h('small', { text: String(i + 1) }), a === undefined ? '' : a === BRACE ? '🛡' : ARROWS[a]) as HTMLButtonElement;
        slotEls.push(b); slots.append(b);
      }
      const pad = h('div', { class: 'sp-pad' },
        h('button', { class: 'u', 'aria-label': 'Up', onclick: () => addStep(UP) }, '▲'),
        h('button', { class: 'l', 'aria-label': 'Left', onclick: () => addStep(LEFT) }, '◀'),
        h('button', { class: 'd', 'aria-label': 'Down', onclick: () => addStep(DOWN) }, '▼'),
        h('button', { class: 'r', 'aria-label': 'Right', onclick: () => addStep(RIGHT) }, '▶'));
      braceBtn = h('button', { class: `sp-act brace${nextIsBrace() ? ' sp-hint' : ''}`, onclick: () => addStep(BRACE), disabled: !planning || draft.includes(BRACE) || draft.length >= 3 }, `🛡 ${t('hud.brace')}`) as HTMLButtonElement;
      const full = draft.length >= 3;
      readyBtn = h('button', { class: `sp-act ready${ready ? ' done' : ''}${full && !ready && scene?.kind === 'scenario' && (scene.list === 'lesson' && (scene.index < 2 || scene.hint)) ? ' sp-hint' : ''}`, onclick: () => pressReady(), disabled: !planning }, ready ? t('hud.readyDone') : t('hud.ready')) as HTMLButtonElement;
      const acts = h('div', { class: 'sp-acts' }, braceBtn, readyBtn);
      bottom.append(timerBox, slots, h('div', { class: 'sp-controls' }, pad, acts));
      if (scene?.kind === 'match' && scene.mode !== 'pass') {
        const em = h('div', { class: 'sp-emotes' });
        for (let i = 0; i < 4; i++) em.append(h('button', { 'aria-label': `Emote ${i + 1}`, onclick: () => sendEmote(i) }, t(`emote.${i}` as Key)));
        bottom.append(em);
      }
      if (scene?.kind === 'scenario' && scene.fails >= (scene.list === 'puzzle' ? 2 : 1) && !scene.hint) {
        bottom.prepend(h('div', { class: 'sp-slots sp-hintrow' }, h('button', { class: 'sp-small', onclick: () => { if (scene?.kind === 'scenario') { scene.hint = true; draft = []; refreshHud(); } } }, `💡 ${t('hud.hint')}`)));
      }
    }

    // ---------------------------------------------------------------- planning input
    function canEdit() {
      if (phase !== 'plan' || panel) return false;
      if (scene?.kind === 'match' && scene.mode === 'online' && !online.playing) return false;
      return true;
    }
    function addStep(a: number) {
      audio.unlock();
      if (!canEdit()) return;
      if (draft.length >= 3) { flashSlots(); return; }
      if (a === BRACE && draft.includes(BRACE)) { say(t('hud.braceUsed')); return; }
      draft.push(a);
      audio.tap();
      if (ready) onDraftChanged();
      refreshHud();
    }
    function clearStep(i: number) {
      if (!canEdit()) return;
      draft.splice(i, 1);
      if (ready) onDraftChanged();
      refreshHud();
    }
    function undo() { if (draft.length) clearStep(draft.length - 1); }
    function flashSlots() { slotEls.forEach(s => s.animate?.([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 160 })); }
    function onDraftChanged() {
      if (scene?.kind === 'match' && scene.mode === 'online') online.seal(normalizePlan(draft));
    }

    function pressReady() {
      audio.unlock();
      if (!canEdit() || !scene) return;
      if (scene.kind === 'scenario') { resolveScenario(); return; }
      if (scene.mode === 'online') {
        ready = true; online.seal(normalizePlan(draft)); refreshHud(); return;
      }
      if (scene.mode === 'pass') { lockPassPlan(); return; }
      ready = true;
      resolveLocalRound();
    }

    // ---------------------------------------------------------------- scenarios
    function startScenario(list: 'lesson' | 'puzzle', index: number) {
      closePanel(); online.leave(); removeLobby();
      const sc = (list === 'lesson' ? LESSONS : PUZZLES)[index];
      scene = { kind: 'scenario', list, index, sc, state: buildScenario(sc), fails: 0, hint: false };
      beginPlanning(0);
    }
    function resolveScenario() {
      if (scene?.kind !== 'scenario') return;
      const sc = scene.sc;
      const before = scene.state;
      const result = resolveRound(before, scenarioPlans(sc, normalizePlan(draft)));
      ready = true;
      play(before, result, () => {
        if (scene?.kind !== 'scenario' || scene.sc !== sc) return;
        if (scenarioWon(sc, result)) scenarioWin(); else scenarioFail(result);
      });
    }
    function scenarioWin() {
      if (scene?.kind !== 'scenario') return;
      audio.win();
      const { list, index } = scene;
      if (list === 'lesson') {
        save.school = Math.max(save.school, index + 1); persist();
        if (index + 1 < LESSONS.length) {
          say(t('lesson.done'), 900);
          phase = 'card';
          advanceTimer = setTimeout(() => startScenario('lesson', index + 1), 900);
          return;
        }
        showCard(t('lesson.graduate'), '', [
          { label: t('menu.play'), sub: t('menu.playSub'), primary: true, fn: () => startLocalMatch('quick') },
          { label: t('menu.puzzles'), sub: t('menu.puzzlesSub', { n: save.puzzles.length }), fn: () => openPuzzles() },
          { label: t('end.menu'), fn: () => openMenu() }
        ]);
        return;
      }
      if (!save.puzzles.includes(scene.sc.id)) { save.puzzles.push(scene.sc.id); persist(); services.reportComplete(save.puzzles.length / PUZZLES.length); }
      const allDone = save.puzzles.length >= PUZZLES.length;
      const nextIdx = PUZZLES.findIndex((p, i) => i > index && !save.puzzles.includes(p.id));
      const next = nextIdx >= 0 ? nextIdx : index + 1 < PUZZLES.length ? index + 1 : -1;
      showCard(`💦 ${t('puzzle.solved')}`, allDone ? t('puzzle.all') : i18n.tr(scene.sc.caption), [
        ...(next >= 0 ? [{ label: t('puzzle.next'), primary: true, fn: () => startScenario('puzzle', next) }] : []),
        { label: t('menu.puzzles'), fn: () => openPuzzles() },
        { label: t('end.menu'), fn: () => openMenu() }
      ]);
    }
    function scenarioFail(result: RoundResult) {
      if (scene?.kind !== 'scenario') return;
      audio.lose();
      scene.fails += 1;
      const sc = scene.sc;
      let msg: string;
      if (result.splashed.includes(0)) msg = t('lesson.fail.wet');
      else if (sc.kind === 'puzzle') msg = t('puzzle.fail', { n: result.events.filter(e => e.k === 'splash' && e.by === 0).length });
      else msg = sc.goal.type === 'fly' ? t('lesson.fail.fly') : sc.goal.type === 'points' ? t('lesson.fail.points') : t('lesson.fail.splash');
      say(msg, 1500);
      // Retry instantly with the same plan still drawn, so one tap fixes it.
      scene.state = buildScenario(sc);
      if (scene.list === 'lesson' && scene.index >= 2) scene.hint = true;
      if (scene.hint) draft = [];
      beginPlanning(0, true);
    }

    // ---------------------------------------------------------------- matches
    function namesFor(mode: MatchMode, humans: number): SeatCfg[] {
      const level: BotLevel = mode === 'ladder' ? LADDER_LEVELS[Math.min(2, save.ladder)] : 2;
      const seats: SeatCfg[] = [];
      for (let i = 0; i < 4; i++) {
        if (mode === 'pass' && i < humans) seats.push({ kind: 'pass', level, name: `${FROG_NAMES[i][i18n.lang]}` });
        else if (i === 0 && mode !== 'pass') seats.push({ kind: 'me', level, name: t('room.you') });
        else seats.push({ kind: 'bot', level, name: `${FROG_NAMES[i][i18n.lang]} 🤖` });
      }
      return seats;
    }
    function startLocalMatch(mode: 'quick' | 'ladder' | 'pass', humans = 2) {
      closePanel(); online.leave(); removeLobby();
      const seed = (Math.floor(services.random() * 2 ** 31) ^ Date.now()) >>> 0;
      const seats = namesFor(mode, humans);
      scene = { kind: 'match', mode, state: createMatch(seed, 4), seats, me: 0, ladder: mode === 'ladder' ? Math.min(2, save.ladder) : undefined, dealt: [0, 0, 0, 0], passQueue: [], passDrafts: [], passing: 0 };
      readySeats = new Set(); awaySeats = new Set();
      startRound();
    }
    function startRound() {
      if (scene?.kind !== 'match') return;
      if (scene.mode === 'pass') {
        scene.passQueue = scene.seats.map((s, i) => (s.kind === 'pass' && !scene!.state.frogs[i].wet ? i : -1)).filter(i => i >= 0);
        scene.passDrafts = scene.seats.map(() => null);
        nextPassPlayer();
        return;
      }
      beginPlanning(scene.state.round === 1 ? FIRST_SECONDS : PLAN_SECONDS);
    }
    /** One short cue when the rim starts to wobble (rounds 3 and 5). */
    let cuedRound = '';
    function roundCue() {
      if (scene?.kind !== 'match' || !scene.state.pads.includes(2) || (scene.state.round !== 3 && scene.state.round !== 5)) return;
      const key = `${scene.state.seed}:${scene.state.round}`; // once per round, not once per pass-and-play player
      if (key !== cuedRound) { cuedRound = key; say(`🌊 ${t('hud.sink')}`, 1300); }
    }
    function beginPlanning(seconds: number, keepDraft = false) {
      phase = 'plan'; ready = false;
      if (!keepDraft) draft = [];
      deadline = seconds > 0 ? renderer.clock + seconds : 0;
      lastTick = -1;
      readySeats = new Set();
      roundCue();
      refreshHud();
      root.focus({ preventScroll: true });
    }
    function botPlansFor(s: MatchScene): (Plan | null)[] {
      return s.seats.map((seat, i) => (seat.kind === 'bot' ? botPlan(s.state, i, seat.level) : null));
    }
    function resolveLocalRound() {
      if (scene?.kind !== 'match') return;
      const s = scene;
      const plans = botPlansFor(s);
      if (s.mode === 'pass') s.passDrafts.forEach((p, i) => { if (p) plans[i] = p; });
      else plans[s.me] = normalizePlan(draft);
      runRound(plans.map(p => p ?? [SIT, SIT, SIT]));
    }
    function runRound(plans: Plan[]) {
      if (scene?.kind !== 'match') return;
      const s = scene;
      const before = s.state;
      const result = resolveRound(before, plans);
      for (const e of result.events) if (e.k === 'splash' && e.by >= 0) s.dealt[e.by] = (s.dealt[e.by] ?? 0) + 1;
      s.state = result.state;
      deadline = 0;
      play(before, result, () => {
        if (scene !== s) return;
        botEmotes(s, result);
        if (s.state.over) endMatch(); else if (s.mode === 'online') online.roundDone(); else startRound();
      });
    }
    function play(before: State, result: RoundResult, done: () => void) {
      phase = 'reveal';
      refreshHud();
      renderer.play(before, result, () => { phase = 'idle'; done(); });
    }
    function botEmotes(s: MatchScene, r: RoundResult) {
      for (const e of r.events) if (e.k === 'splash') {
        if (e.by >= 0 && s.seats[e.by]?.kind === 'bot' && (e.s + r.state.round) % 3 === 0) showEmote(e.by, 0);
        if (s.seats[e.s]?.kind === 'bot' && (e.s + r.state.round) % 4 === 1) showEmote(e.s, 1);
      }
    }
    function endMatch() {
      if (scene?.kind !== 'match') return;
      const s = scene;
      const st = s.state;
      const won = st.winners.includes(s.me) && s.mode !== 'pass';
      phase = 'card';
      if (s.mode !== 'pass') {
        save.matches += 1; if (won) save.wins += 1;
        const mine = st.frogs[s.me]?.score ?? 0;
        save.best = Math.max(save.best, mine);
        services.reportScore(mine * 10 + (won ? 50 : 0));
      }
      let title: string;
      if (st.winners.length > 1) title = t('end.shared');
      else if (st.winners[0] === s.me && s.mode !== 'pass') title = `🏆 ${t('end.you')}`;
      else title = t('end.win', { name: s.seats[st.winners[0]].name });
      if (won) audio.win(); else audio.lose();
      const board = h('div', { class: 'sp-board' });
      [...st.frogs.keys()].sort((a, b) => st.frogs[b].score - st.frogs[a].score).forEach(i => board.append(h('div', null,
        h('i', { style: `background:${PALETTE[i % 6].body}` }), h('span', { text: `${st.winners.includes(i) ? '👑 ' : ''}${s.seats[i].name}` }), t('end.points', { n: st.frogs[i].score }))));
      const buttons: CardButton[] = [];
      if (s.mode === 'ladder') {
        const step = s.ladder ?? 0;
        if (won && step + 1 > save.ladder) { save.ladder = Math.min(3, step + 1); }
        if (won && step < 2) buttons.push({ label: t('ladder.next'), primary: true, fn: () => startLocalMatch('ladder') });
        else buttons.push({ label: t('end.rematch'), primary: true, fn: () => startLocalMatch('ladder') });
        title = won ? `🏆 ${t('ladder.won')}` : t('ladder.lost');
      } else if (s.mode === 'online') {
        buttons.push({ label: t('end.rematch'), primary: true, fn: () => { closePanel(); online.rematch(); } });
      } else {
        const humans = s.seats.filter(x => x.kind === 'pass').length;
        buttons.push({ label: t('end.rematch'), primary: true, fn: () => startLocalMatch(s.mode === 'pass' ? 'pass' : 'quick', humans) });
      }
      buttons.push({ label: t('end.menu'), fn: () => openMenu() });
      persist();
      showCard(title, t('end.splashes', { n: s.dealt[s.me] ?? 0 }), buttons, board);
    }

    // ---------------------------------------------------------------- pass and play
    function nextPassPlayer() {
      if (scene?.kind !== 'match') return;
      const s = scene;
      const seat = s.passQueue.shift();
      if (seat === undefined) { resolveLocalRound(); return; }
      s.passing = seat;
      phase = 'card';
      draft = []; deadline = 0;
      refreshHud(); // clear the last player's plan from the tray before the phone changes hands
      const name = s.seats[seat].name;
      const sw = h('i', { style: `display:inline-block;width:18px;height:18px;border-radius:50%;background:${PALETTE[seat % 6].body};vertical-align:-3px;margin-right:6px` });
      showCard(t('pass.handTo'), t('pass.hidden'), [{ label: t('pass.imReady', { name }), primary: true, fn: () => { closePanel(); beginPlanning(s.state.round === 1 ? FIRST_SECONDS : PLAN_SECONDS); } }], h('h2', null, sw, name));
    }
    function lockPassPlan() {
      if (scene?.kind !== 'match') return;
      scene.passDrafts[scene.passing] = normalizePlan(draft);
      draft = [];
      nextPassPlayer();
    }

    // ---------------------------------------------------------------- online
    function startOnlineMatch(state: State, seats: { name: string; kind: 'me' | 'remote' | 'bot' }[], me: number) {
      closePanel(); removeLobby();
      scene = { kind: 'match', mode: 'online', state, seats: seats.map(s => ({ kind: s.kind, level: 2, name: s.name })), me, dealt: state.frogs.map(() => 0), passQueue: [], passDrafts: [], passing: me, online: online };
      readySeats = new Set();
      phase = 'idle'; draft = [];
      refreshHud();
    }
    function queueReveal(plans: Plan[]) {
      if (phase === 'reveal') { pendingPlans = plans; return; }
      runRound(plans);
    }
    function fallBackToBots() {
      if (scene?.kind !== 'match') return;
      say(t('room.gone'), 2600);
      const s = scene;
      s.mode = 'quick';
      s.seats = s.seats.map((x, i) => (i === s.me ? { ...x, kind: 'me' } : { ...x, kind: 'bot', level: 2 }));
      s.online = undefined;
      if (phase === 'plan') { deadline = deadline || renderer.clock + PLAN_SECONDS; refreshHud(); }
      else if (phase === 'idle' && !s.state.over) startRound();
    }
    function showEmote(seat: number, e: number) {
      if (!scene || scene.kind !== 'match') return;
      const text = t(`emote.${e % 4}` as Key);
      emotes = emotes.filter(x => renderer.clock - x.t0 < 2 && x.seat !== seat);
      emotes.push({ seat, text, t0: renderer.clock });
      audio.croak(seat);
    }
    function sendEmote(e: number) {
      audio.unlock();
      if (scene?.kind !== 'match' || scene.me < 0) return;
      showEmote(scene.me, e);
      if (scene.mode === 'online') online.emote(e);
    }
    function removeLobby() { /* the room card is part of the top HUD and goes with the next refresh */ }
    function renderLobby() {
      if (!online.code || online.inMatch) { refreshHud(); return; }
      if (!scene || scene.kind !== 'scenario') startPractice(); else refreshHud();
    }
    /** The room card sits in the top HUD, so the practice pond is laid out below it. */
    function lobbyCard(): HTMLElement {
      const link = online.shareUrl();
      const roster = h('div', { class: 'sp-scores' });
      const host = online.hostSeat;
      online.roster().forEach(p => roster.append(h('div', { class: `sp-chip${p.seat === online.seat ? ' me' : ''}${p.online ? '' : ' away'}` },
        h('i', { style: `background:${PALETTE[p.seat % 6].body}` }), `${p.name}${p.seat === online.seat ? ` (${t('room.you')})` : ''}${p.seat === host ? ` · ${t('room.host')}` : ''}`)));
      const card = h('div', { class: 'sp-lobby' },
        h('div', { class: 'sp-row' },
          h('div', { class: 'sp-title' }, t('room.title', { code: online.code }), h('div', { class: 'sp-sub', text: online.isHost ? t('room.players', { n: online.roster().length }) : `${t('room.wait')} · ${t('room.practice')}` })),
          h('button', { class: 'sp-small', onclick: () => void shareLink(link) }, `🔗 ${t('room.share')}`),
          online.isHost ? h('button', { class: 'sp-small primary', onclick: () => online.start() }, `▶ ${t('room.start')}`) : null),
        roster);
      return card;
    }
    function startPractice() {
      closePanel();
      const i = save.school < LESSONS.length ? save.school : (Math.floor(services.random() * PUZZLES.length));
      const list = save.school < LESSONS.length ? 'lesson' : 'puzzle';
      const sc = (list === 'lesson' ? LESSONS : PUZZLES)[i];
      scene = { kind: 'scenario', list, index: i, sc, state: buildScenario(sc), fails: 0, hint: false };
      beginPlanning(0);
    }
    async function shareLink(link: string) {
      try {
        if (navigator.share) { await navigator.share({ title: 'Shove Pond', url: link }); return; }
      } catch { /* fall back to copy */ }
      try { await navigator.clipboard.writeText(link); say(t('room.copied')); } catch { say(link, 3000); }
    }

    // ---------------------------------------------------------------- panels
    type CardButton = { label: string; sub?: string; primary?: boolean; disabled?: boolean; fn: () => void };
    function closePanel() { panel?.remove(); panel = null; resumeFromMenu = null; if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; } }
    function showCard(title: string, text: string, buttons: CardButton[], extra?: HTMLElement) {
      closePanel();
      phase = 'card'; root.dataset.phase = phase; deadline = 0;
      const card = h('div', { class: 'sp-card' }, h('h2', { text: title }), text ? h('p', { text }) : null, extra ?? null);
      for (const b of buttons) card.append(h('button', { class: `sp-btn${b.primary ? ' primary' : ''}`, disabled: b.disabled, onclick: () => { audio.unlock(); b.fn(); } }, b.label, b.sub ? h('small', { text: b.sub }) : null));
      panel = h('div', { class: 'sp-panel' }, card);
      root.append(panel);
      (card.querySelector('button.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    }
    function openMenu(fresh = false) {
      const prior = panel ? resumeFromMenu : null; // re-opened from inside the menu (language, relay check)
      const resumable = !fresh && !!scene && !(scene.kind === 'match' && scene.state.over) && (phase === 'plan' || phase === 'idle' || phase === 'reveal');
      const left = deadline ? deadline - renderer.clock : 0;
      const resume = resumable ? () => {
        closePanel();
        phase = renderer.busy() ? 'reveal' : 'plan';
        // Local timers wait while the menu is open; online rounds keep the room's clock.
        if (left > 0 && !(scene?.kind === 'match' && scene.mode === 'online')) deadline = renderer.clock + Math.max(left, 3);
        refreshHud();
      } : prior;
      phase = 'card';
      const relay = online.relayState();
      const relayText = relay === 'checking' ? t('menu.checking') : relay === 'down' ? t('menu.offline') : t('menu.onlineSub');
      showCard(t('title.name'), t('title.tag'), [
        ...(resume ? [{ label: `▶ ${t('menu.resume')}`, primary: true, fn: resume }] : []),
        { label: t('menu.play'), sub: t('menu.playSub'), primary: !resumable && save.school >= LESSONS.length, fn: () => startLocalMatch('quick') },
        { label: t('menu.school'), sub: `${t('menu.schoolSub')} · ${save.school}/5`, primary: !resumable && save.school < LESSONS.length, fn: () => startScenario('lesson', save.school < LESSONS.length ? save.school : 0) },
        { label: t('menu.puzzles'), sub: t('menu.puzzlesSub', { n: save.puzzles.length }), fn: () => openPuzzles() },
        { label: t('menu.ladder'), sub: save.ladder >= 3 ? t('menu.ladderDone') : t('menu.ladderSub', { n: save.ladder + 1 }), fn: () => startLocalMatch('ladder') },
        { label: t('menu.pass'), sub: t('menu.passSub'), fn: () => openPass() },
        { label: t('menu.online'), sub: relayText, disabled: relay !== 'up', fn: () => openOnline() },
        { label: t('menu.lang'), fn: () => { save.lang = i18n.lang === 'zh' ? 'en' : 'zh'; i18n = createI18n(save.lang); persist(); openMenu(); refreshHudOnly(); } }
      ]);
      resumeFromMenu = resume;
      if (relay === 'checking') void online.checkRelay().then(() => { if (panel && phase === 'card' && !scene?.kind) openMenu(); else if (panel?.textContent?.includes(t('menu.checking'))) openMenu(); });
    }
    function refreshHudOnly() { const p = panel; panel = null; refreshHud(); panel = p; }
    function openPuzzles() {
      phase = 'card';
      const grid = h('div', { class: 'sp-grid' });
      PUZZLES.forEach((p, i) => {
        const done = save.puzzles.includes(p.id);
        const locked = i > 0 && !save.puzzles.includes(PUZZLES[i - 1].id) && !done && i > save.puzzles.length;
        grid.append(h('button', { class: done ? 'done' : '', disabled: locked, 'aria-label': `Puzzle ${i + 1}`, onclick: () => startScenario('puzzle', i) }, done ? '✓' : String(i + 1)));
      });
      const keep = resumeFromMenu; // a submenu keeps the paused match resumable
      showCard(t('menu.puzzles'), `${t('puzzle.goal')} · ${t('puzzle.ghost')}`, [{ label: t('menu.back'), fn: () => openMenu() }], grid);
      resumeFromMenu = keep;
    }
    function openPass() {
      phase = 'card';
      const row = h('div', { class: 'sp-inline' });
      for (const n of [2, 3, 4]) row.append(h('button', { class: `sp-small${n === 2 ? ' primary' : ''}`, onclick: () => startLocalMatch('pass', n) }, `${n} 🐸`));
      const keep = resumeFromMenu; // a submenu keeps the paused match resumable
      showCard(t('pass.title'), `${t('pass.players')} · ${t('pass.bots')}`, [{ label: t('menu.back'), fn: () => openMenu() }], row);
      resumeFromMenu = keep;
    }
    function openOnline(error?: string) {
      phase = 'card';
      const name = h('input', { class: 'name', value: myName(), maxlength: '14', 'aria-label': t('menu.name') }) as HTMLInputElement;
      const code = h('input', { maxlength: '4', placeholder: 'ABCD', 'aria-label': t('menu.code'), autocapitalize: 'characters' }) as HTMLInputElement;
      const saveName = () => { save.name = name.value.trim().slice(0, 14) || undefined; persist(); };
      const extra = h('div', { class: 'sp-board' },
        h('div', { class: 'sp-inline' }, name),
        h('button', { class: 'sp-small primary', onclick: () => { saveName(); void online.create().then(ok => { if (!ok) openOnline(t('room.error')); else closePanel(); }); } }, `＋ ${t('menu.create')}`),
        h('div', { class: 'sp-inline' }, code, h('button', { class: 'sp-small', onclick: () => { saveName(); void joinCode(code.value); } }, t('menu.go'))),
        error ? h('p', { text: error }) : null);
      const keep = resumeFromMenu; // a submenu keeps the paused match resumable
      showCard(t('menu.online'), t('menu.onlineSub'), [{ label: t('menu.back'), fn: () => openMenu() }], extra);
      resumeFromMenu = keep;
    }
    async function joinCode(raw: string) {
      const code = raw.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) { say(t('room.missing')); return; }
      say(t('room.joining'), 1200);
      const res = await online.join(code);
      if (res === 'ok') { closePanel(); return; }
      if (!scene) startPractice();
      openOnline(res === 'full' ? t('room.full') : res === 'missing' ? t('room.missing') : t('room.error'));
    }

    // ---------------------------------------------------------------- input
    let swipe: { x: number; y: number; id: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { audio.unlock(); swipe = { x: e.clientX, y: e.clientY, id: e.pointerId }; root.focus({ preventScroll: true }); });
    canvas.addEventListener('pointerup', (e) => {
      if (!swipe || swipe.id !== e.pointerId) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 22) { addStep(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP)); return; }
      // A tap next to where my plan ends hops there.
      const st = viewState(), me = mySeat();
      if (!st || me < 0 || !st.frogs[me]) return;
      const rect = canvas.getBoundingClientRect();
      const c = renderer.cellAt(e.clientX - rect.left, e.clientY - rect.top);
      if (!c) return;
      let x = st.frogs[me].x, y = st.frogs[me].y;
      for (const a of draft) if (a < 4) { x += [0, 1, 0, -1][a]; y += [-1, 0, 1, 0][a]; }
      const d = [[0, -1], [1, 0], [0, 1], [-1, 0]].findIndex(([ddx, ddy]) => x + ddx === c[0] && y + ddy === c[1]);
      if (d >= 0) addStep(d);
    });
    canvas.addEventListener('pointercancel', () => { swipe = null; });
    const onKey = (e: KeyboardEvent) => {
      if (destroyed || paused) return;
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'INPUT') return;
      const k = e.key;
      const dir = ({ ArrowUp: UP, ArrowRight: RIGHT, ArrowDown: DOWN, ArrowLeft: LEFT, w: UP, d: RIGHT, s: DOWN, a: LEFT, W: UP, D: RIGHT, S: DOWN, A: LEFT } as Record<string, number>)[k];
      if (panel) { panelKey(e); return; }
      if (dir !== undefined) { e.preventDefault(); addStep(dir); }
      else if (k === ' ') { e.preventDefault(); addStep(BRACE); }
      else if (k === 'Backspace') { e.preventDefault(); undo(); }
      else if (k >= '1' && k <= '4') { e.preventDefault(); sendEmote(Number(k) - 1); }
      else if (k === 'Enter') { e.preventDefault(); if (phase === 'reveal' && scene?.kind === 'scenario') renderer.skip(); else pressReady(); }
      else if (k === 'Escape') { e.preventDefault(); if (panel) closePanelToPlay(); else openMenu(); }
    };
    /** Cards are driven by keys too (the controller bridge sends synthetic keys, which never click a button). */
    function panelKey(e: KeyboardEvent) {
      if (!panel) return;
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      if (!buttons.length) return;
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 's' || e.key === 'd') { e.preventDefault(); buttons[(at + 1 + buttons.length) % buttons.length].focus(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'w' || e.key === 'a') { e.preventDefault(); buttons[(at - 1 + buttons.length) % buttons.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (at >= 0 ? buttons[at] : (panel.querySelector<HTMLButtonElement>('button.primary') ?? buttons[0])).click(); }
      else if (e.key === 'Escape') { e.preventDefault(); closePanelToPlay(); }
    }
    function closePanelToPlay() { if (panel && resumeFromMenu) resumeFromMenu(); }
    root.addEventListener('keydown', onKey);

    // ---------------------------------------------------------------- frame loop
    function frame(now: number) {
      if (destroyed) return;
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (paused) return;
      const st = viewState();
      if (!st) return;
      if (phase === 'plan' && deadline) {
        const left = deadline - renderer.clock;
        if (timerBar && timerBox) {
          const total = scene?.kind === 'match' && scene.state.round === 1 ? FIRST_SECONDS : PLAN_SECONDS;
          timerBar.style.transform = `scaleX(${clamp(left / total, 0, 1)})`;
          timerBox.classList.toggle('urgent', left < 3);
        }
        const whole = Math.ceil(left);
        if (whole <= 3 && whole > 0 && whole !== lastTick) { lastTick = whole; audio.tick(whole <= 1); }
        if (left <= 0) timeUp();
        else if (left < 0.6 && scene?.kind === 'match' && scene.mode === 'online' && !ready && draft.length) { ready = true; online.seal(normalizePlan(draft)); refreshHud(); }
      }
      if (pendingPlans && phase !== 'reveal') { const p = pendingPlans; pendingPlans = null; runRound(p); }
      const me = mySeat();
      const showMe = phase === 'plan' && !(scene?.kind === 'match' && scene.mode === 'online' && !online.playing);
      renderer.draw({
        state: st, looks: looksFor(), me: showMe ? me : -1, draft, ghosts: ghostPlans(),
        order: moveOrder(st), crown: crownOf(st), away: st.frogs.map((_, i) => awaySeats.has(i)), emotes, hand: handDir(), dim: !!panel && phase === 'card'
      }, dt);
    }
    function timeUp() {
      if (!scene || scene.kind !== 'match') { deadline = 0; return; }
      deadline = 0;
      if (scene.mode === 'online') { if (!ready) { ready = true; online.seal(draft.length ? normalizePlan(draft) : null); } refreshHud(); return; }
      if (scene.mode === 'pass') { lockPassPlan(); return; }
      ready = true;
      resolveLocalRound();
    }

    // ---------------------------------------------------------------- art / playtest handle
    /** Stages a lively mid-match moment (used by scripts/capture-game-art.mjs): a crowned leader, a wobbling rim,
     *  my three-hop plan aimed into a line of frogs, and an emote. */
    (root as unknown as { __sp: unknown }).__sp = {
      stage() {
        closePanel(); online.leave();
        startLocalMatch('quick');
        if (scene?.kind !== 'match') return;
        const st = scene.state;
        st.round = 4;
        st.pads = st.pads.map((_, i) => { const x = i % 7, y = Math.floor(i / 7); return Math.min(x, y, 6 - x, 6 - y) === 0 ? 0 : Math.min(x, y, 6 - x, 6 - y) === 1 ? 2 : 1; });
        const place: [number, number, number][] = [[2, 3, 2], [4, 3, 4], [5, 3, 1], [3, 5, 3]];
        place.forEach(([x, y, score], i) => { st.frogs[i] = { x, y, score, wet: false }; });
        beginPlanning(PLAN_SECONDS);
        draft = [RIGHT, RIGHT, UP];
        showEmote(1, 1);
        refreshHud();
        root.classList.add('sp-art');
        layout();
      },
      /** Close-up for the icon: me, the crowned leader and the frog behind it. */
      clip() { return renderer.cellRect(2.6, 2.1, 3.0, 2.2); }
    };

    // ---------------------------------------------------------------- boot
    const roomParam = (() => { try { return new URLSearchParams(location.search).get('room'); } catch { return null; } })();
    if (roomParam && /^[A-Za-z]{4}$/.test(roomParam)) {
      startPractice();
      say(t('room.joining'), 1500);
      void online.join(roomParam.toUpperCase()).then(res => { if (res === 'ok') toast.style.opacity = '0'; else { say(res === 'full' ? t('room.full') : res === 'missing' ? t('room.missing') : t('room.error'), 2600); } });
    } else if (save.school < LESSONS.length) startScenario('lesson', save.school);
    else { startPractice(); openMenu(true); }
    void online.checkRelay();
    layout();
    raf = requestAnimationFrame(frame);

    return {
      pause() { paused = true; audio.pause(); },
      resume() { paused = false; last = 0; audio.resume(); },
      restart() {
        if (scene?.kind === 'scenario') startScenario(scene.list, scene.index);
        else if (scene?.kind === 'match' && scene.mode !== 'online') startLocalMatch(scene.mode === 'pass' ? 'pass' : scene.mode === 'ladder' ? 'ladder' : 'quick', scene.seats.filter(s => s.kind === 'pass').length || 2);
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(raf);
        if (toastTimer) clearTimeout(toastTimer);
        if (advanceTimer) clearTimeout(advanceTimer);
        ro?.disconnect();
        window.removeEventListener('resize', layout);
        root.removeEventListener('keydown', onKey);
        online.leave();
        audio.dispose();
        host.replaceChildren();
      }
    };
  }
};

export default shovePond;
