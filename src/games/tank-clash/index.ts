import type { GameModule, GameServices } from '../../core/game-types';
import {
  BUTTON_INDEX,
  createInput,
  createSound,
  startLoop,
  type KeyboardMap,
  type VirtualPad
} from '../_shared/gamepad-kit';
import { createMobileControls } from '../_shared/mobile-controls';
import {
  baseHp,
  createArenaState,
  stepArena,
  type ArenaState,
  type SoundCue
} from './engine';
import { defaultLang, isLang, t, type Key, type Lang } from './i18n';
import { CHASSIS_ORDER } from './maps';
import { COMPACT_LAYOUT, drawArenaScene, WIDE_LAYOUT, type HudLayout, type LobbyConfig } from './render';
import type { ChassisId, GameMode, PlayerControlInput, TeamSetup } from './types';
import { createUi, teamOrder, type ResultsView } from './ui';

const ACCENT = '#36d6ff';
const COOP_STAGES = 6;
const DUEL_ARENAS = 5;

/**
 * Dedicated 2-player keyboard layout so both can play on one keyboard without key conflicts:
 * P1 WASD + Space/J fire + K/F mine + L/G dash; P2 Arrows + Enter/Numpad0/Slash fire + RightShift/Period mine + Comma/Quote dash.
 * With a single human both sets drive Player 1. P (or Digit2 / pad Start) opens the pause menu.
 */
export const TANK_CLASH_KEYBOARD: readonly KeyboardMap[] = [
  {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    buttons: [
      ['Space', 'KeyJ'], // south: Fire
      ['KeyL', 'KeyG'], // east: Dash
      ['KeyK', 'KeyF'], // west: Mine
      'KeyU', // north
      'KeyQ', // l1: prev chassis
      'KeyE', // r1: next chassis
      'KeyZ',
      'KeyC',
      'Digit1',
      ['Digit2', 'KeyP'] // start: Pause menu
    ]
  },
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    buttons: [
      ['Enter', 'NumpadEnter', 'Numpad0', 'Slash'], // south: Fire
      ['Quote', 'Comma'], // east: Dash
      ['ShiftRight', 'Period', 'NumpadDecimal'], // west: Mine
      'Semicolon', // north
      'KeyN', // l1: prev chassis
      'KeyM', // r1: next chassis
      'BracketLeft',
      'BracketRight',
      'Digit9',
      'Digit0'
    ]
  }
];

function cycleChassis(current: ChassisId, delta: number): ChassisId {
  const idx = CHASSIS_ORDER.indexOf(current);
  return CHASSIS_ORDER[(idx + delta + CHASSIS_ORDER.length) % CHASSIS_ORDER.length];
}

function mount(host: HTMLElement, services: GameServices) {
  const storedLang = services.storage.get<unknown>('lang', null);
  let lang: Lang = isLang(storedLang) ? storedLang : defaultLang();
  const tr = (key: Key, params?: Record<string, string | number>) => t(lang, key, params);

  const storedMaps = services.storage.get<Record<string, number[]>>('button-maps', {});
  const storedMode = services.storage.get<GameMode>('mode', 'coop');
  const storedTeam = services.storage.get<TeamSetup | null>('teamSetup', null);
  const initialMode: GameMode = storedMode === 'duel' ? 'duel' : 'coop';
  let lobbyConfig: LobbyConfig = {
    mode: initialMode,
    // A lone visitor is the common case, so the default gives them an AI partner rather than an idle second tank.
    teamSetup: storedTeam && teamOrder(initialMode).includes(storedTeam) ? storedTeam : '1p-ai',
    stageIndex: 0,
    p1Chassis: services.storage.get<ChassisId>('p1Chassis', 'vanguard'),
    p2Chassis: services.storage.get<ChassisId>('p2Chassis', 'titan')
  };
  if (!CHASSIS_ORDER.includes(lobbyConfig.p1Chassis)) lobbyConfig.p1Chassis = 'vanguard';
  if (!CHASSIS_ORDER.includes(lobbyConfig.p2Chassis)) lobbyConfig.p2Chassis = 'titan';

  let inLobby = true;
  let paused = false;
  let gamePaused = false;
  let time = 0;
  let bestScore = services.storage.get<number>('best', 0);
  let bestAtStart = bestScore;
  let loop = 0;
  let stageStartScore = 0;
  let battleClock = 0;
  let p2Seen = false;
  let outcomeAge = 0;
  let resultsOpen = false;
  let autoAdvance = 0;
  let state: ArenaState = createArenaState(lobbyConfig);

  const root = document.createElement('div');
  root.dataset.tankClash = '';
  const rootStyle =
    'width:100%;max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:8px;color:#F7F9FF;font-family:system-ui,sans-serif;position:relative';
  root.style.cssText = rootStyle;

  const canvas = document.createElement('canvas');
  canvas.width = WIDE_LAYOUT.width;
  canvas.height = WIDE_LAYOUT.height;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Tank Clash');
  const canvasBase = 'display:block;margin:0 auto;background:#070b14;touch-action:none;outline:none;flex:0 0 auto';

  const bar = document.createElement('div');
  const barStyle =
    'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;font-size:14.5px;min-height:44px';
  bar.style.cssText = barStyle;
  const live = document.createElement('p');
  live.setAttribute('role', 'status');
  live.style.cssText = 'margin:0;padding:0 6px;color:#A8B1C5';

  root.append(canvas, bar);
  host.replaceChildren(root);
  canvas.focus({ preventScroll: true });
  const g = canvas.getContext('2d')!;
  let layout: HudLayout = WIDE_LAYOUT;
  let layoutKey = '';

  // Touch controls for Player 1: stick + Fire / Mine / Dash.
  const mobileHeld = { up: false, down: false, left: false, right: false, fire: false, mine: false, dash: false };
  const mobileTapped = { fire: false, mine: false, dash: false };
  const mobileControls = createMobileControls(root, {
    shape: 'stick-action',
    labels: ['Fire', 'Mine', 'Dash'],
    pause: true,
    onChange(action, held) {
      if (action in mobileHeld) {
        mobileHeld[action as keyof typeof mobileHeld] = held;
        // Latch the press so a tap shorter than one frame still fires / mines / dashes.
        if (held && action in mobileTapped) mobileTapped[action as keyof typeof mobileTapped] = true;
      }
    }
  });
  const touchPad = root.querySelector<HTMLElement>('.mobile-controls');
  const touch = Boolean(touchPad);

  function labelTouchButtons() {
    const buttons = root.querySelectorAll<HTMLElement>('.mobile-control');
    (['fire', 'mine', 'dash'] as const).forEach((action, i) => {
      const el = buttons[i];
      if (!el) return;
      el.dataset.tcAct = action;
      el.textContent = tr(`ctl.${action}` as Key);
      el.setAttribute('aria-label', tr(`ctl.${action}` as Key));
    });
  }

  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive'));
    const vw = typeof innerWidth === 'number' ? innerWidth : 1280;
    const vh = typeof innerHeight === 'number' ? innerHeight : 720;
    const hostW = full ? vw : root.clientWidth || 1080;
    const portrait = vh > vw;
    // Phones get the big-type layout; so does any stage too narrow for the side panels to stay readable.
    const compact = full ? portrait || vh < 560 || vw < 760 : hostW < 700;
    const next = compact ? COMPACT_LAYOUT : WIDE_LAYOUT;
    const key = `${full}|${next.kind}|${portrait}|${touch}`;
    if (key === layoutKey) return;
    layoutKey = key;
    layout = next;
    canvas.width = next.width;
    canvas.height = next.height;
    const ratio = `${next.width}/${next.height}`;
    if (full) {
      // Portrait: board at the top (clear of the corner buttons), thumbs at the bottom.
      const reserve = portrait ? (touch ? 216 : 64) : 0;
      root.style.cssText = `${rootStyle};position:fixed;z-index:0;inset:0;max-width:none;align-items:center;justify-content:${portrait ? 'flex-start' : 'center'};background:#070b14;box-sizing:border-box;padding-top:${portrait ? 58 : 0}px;gap:0`;
      canvas.style.cssText = `${canvasBase};width:min(100vw,calc((100dvh - ${reserve}px)*${ratio}));aspect-ratio:${ratio};border:0;border-radius:0`;
      bar.style.display = 'none';
      if (touchPad) touchPad.style.marginTop = portrait ? 'auto' : '';
    } else {
      root.style.cssText = rootStyle;
      canvas.style.cssText = `${canvasBase};width:min(100%,calc((100dvh - 96px)*${ratio}));aspect-ratio:${ratio};border-radius:16px;border:1px solid ${ACCENT}55`;
      bar.style.cssText = barStyle;
      if (touchPad) touchPad.style.marginTop = '';
    }
  }

  const virtualPad = (player: number): VirtualPad | undefined => {
    if (player !== 0) return undefined;
    return {
      x: (mobileHeld.right ? 1 : 0) - (mobileHeld.left ? 1 : 0),
      y: (mobileHeld.down ? 1 : 0) - (mobileHeld.up ? 1 : 0),
      hx: 0,
      hy: 0,
      rx: 0,
      ry: 0,
      buttons: [mobileHeld.fire || mobileTapped.fire, mobileHeld.dash || mobileTapped.dash, mobileHeld.mine || mobileTapped.mine]
    };
  };

  const synth = createSound(() => services.sound.muted);
  const input = createInput({
    players: 2,
    keyboard: TANK_CLASH_KEYBOARD,
    virtual: virtualPad,
    onChange: () => refreshStatus()
  });
  Object.entries(storedMaps).forEach(([kind, map]) => input.setButtonMap(kind, map));

  let lastAlarm = -9;
  function playCue(cue: SoundCue) {
    switch (cue) {
      case 'shoot':
        services.sound.play('shoot');
        synth.tone(280, 0.07, 'square', 0.09, 0, 140);
        break;
      case 'laser':
        services.sound.play('shoot');
        synth.tone(720, 0.11, 'sawtooth', 0.11, 0, 220);
        break;
      case 'bounce':
        synth.tone(540, 0.05, 'triangle', 0.08, 0, 760);
        break;
      case 'hit':
        services.sound.play('hit');
        synth.tone(190, 0.09, 'sawtooth', 0.12, 0, 95);
        break;
      case 'explode':
        services.sound.play('clear');
        synth.tone(120, 0.24, 'sawtooth', 0.16, 0, 48);
        break;
      case 'powerup':
        services.sound.play('upgrade');
        synth.chime(587, 0.14, 0);
        synth.chime(880, 0.14, 0.07);
        break;
      case 'portal':
        services.sound.play('move');
        synth.tone(420, 0.12, 'sine', 0.1, 0, 840);
        break;
      case 'dash':
        services.sound.play('move');
        synth.tone(300, 0.14, 'triangle', 0.1, 0, 900);
        break;
      case 'mine':
        services.sound.play('tap');
        synth.tone(360, 0.08, 'triangle', 0.09, 0, 520);
        break;
      case 'freeze':
        services.sound.play('collect');
        synth.chime(1046, 0.15, 0);
        break;
      case 'combo':
        services.sound.play('collect');
        synth.chime(784, 0.1, 0);
        synth.chime(1175, 0.12, 0.06);
        break;
      case 'alarm':
        // Two-tone klaxon, rate-limited so a burst of hits does not turn into noise.
        if (time - lastAlarm > 0.5) {
          lastAlarm = time;
          services.sound.play('fail');
          synth.tone(660, 0.12, 'square', 0.12, 0, 660);
          synth.tone(440, 0.16, 'square', 0.12, 0.13, 440);
        }
        break;
      case 'warn':
        synth.tone(180, 0.3, 'sawtooth', 0.12, 0, 260);
        break;
      case 'win':
        services.sound.play('success');
        [523, 659, 784, 1046].forEach((f, i) => synth.chime(f, 0.14, i * 0.09));
        break;
      case 'lose':
        services.sound.play('fail');
        synth.tone(220, 0.32, 'sawtooth', 0.14, 0, 90);
        break;
    }
  }

  function savePreferences() {
    services.storage.set('mode', lobbyConfig.mode);
    services.storage.set('teamSetup', lobbyConfig.teamSetup);
    services.storage.set('p1Chassis', lobbyConfig.p1Chassis);
    services.storage.set('p2Chassis', lobbyConfig.p2Chassis);
  }

  function padStatusText(): string {
    const padStatus = input.status();
    const count = (padStatus.connected ? 2 : 0) + padStatus.standard;
    return count > 0 ? tr('pad.ready', { n: count }) : touch ? '' : tr('pad.none');
  }

  function showLobby() {
    inLobby = true;
    gamePaused = false;
    resultsOpen = false;
    const padStatus = input.status();
    ui.showLobby({
      cfg: lobbyConfig,
      lang,
      best: bestScore,
      touch,
      canConnectPad: !padStatus.connected && padStatus.hidAvailable,
      padStatus: padStatusText()
    });
    renderBar();
  }

  function updateLobbyConfig(patch: Partial<LobbyConfig>) {
    lobbyConfig = { ...lobbyConfig, ...patch };
    if (!teamOrder(lobbyConfig.mode).includes(lobbyConfig.teamSetup)) lobbyConfig.teamSetup = '1p-ai';
    savePreferences();
    state = createArenaState(lobbyConfig);
    if (inLobby) showLobby();
    render();
  }

  function beginStage(opts: Parameters<typeof createArenaState>[0]) {
    state = createArenaState(opts);
    stageStartScore = state.score;
    outcomeAge = 0;
    resultsOpen = false;
    gamePaused = false;
    autoAdvance = 0;
    if (!inLobby) ui.hide();
  }

  function startBattle() {
    synth.unlock();
    inLobby = false;
    loop = 0;
    battleClock = 0;
    p2Seen = false;
    bestAtStart = bestScore;
    beginStage({ ...lobbyConfig, loop });
    renderBar();
    canvas.focus({ preventScroll: true });
    render();
  }

  function restartStage() {
    beginStage({
      ...lobbyConfig,
      stageIndex: state.stageIndex,
      loop,
      carryScore: state.mode === 'coop' ? stageStartScore : 0,
      roundNumber: 1,
      p1Wins: 0,
      p2Wins: 0
    });
  }

  function advanceAfterOutcome() {
    if (state.outcome === 'none') return;
    if (state.outcome === 'stage-clear') {
      const nextStage = (state.stageIndex + 1) % COOP_STAGES;
      lobbyConfig.stageIndex = nextStage;
      services.reportComplete(nextStage / COOP_STAGES);
      beginStage({ ...lobbyConfig, stageIndex: nextStage, loop, carryScore: state.score });
    } else if (state.outcome === 'coop-victory') {
      // New Game+: back to stage 1 with tougher, faster enemies and the score kept.
      loop += 1;
      lobbyConfig.stageIndex = 0;
      beginStage({ ...lobbyConfig, stageIndex: 0, loop, carryScore: state.score });
    } else if (state.outcome === 'coop-defeat') {
      beginStage({ ...lobbyConfig, stageIndex: state.stageIndex, loop, carryScore: stageStartScore });
    } else if (state.outcome === 'round-over') {
      const nextMap = (state.stageIndex + 1) % DUEL_ARENAS;
      lobbyConfig.stageIndex = nextMap;
      beginStage({
        ...lobbyConfig,
        stageIndex: nextMap,
        roundNumber: state.roundNumber + 1,
        p1Wins: state.p1Wins,
        p2Wins: state.p2Wins,
        carryScore: state.score
      });
    } else if (state.outcome === 'duel-victory') {
      beginStage({ ...lobbyConfig, roundNumber: 1, p1Wins: 0, p2Wins: 0, carryScore: 0 });
    }
    renderBar();
  }

  function clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function openResults() {
    resultsOpen = true;
    const s = state;
    const lobbyBtn = { id: 'res-lobby', label: tr('res.lobby') };
    const newBest = s.score > bestAtStart && s.score > 0;
    const scoreRows: Array<[string, string]> = [
      [tr('res.score'), String(s.score)],
      [tr('res.best'), String(Math.max(bestScore, s.score))]
    ];
    let view: ResultsView;
    if (s.outcome === 'stage-clear' || s.outcome === 'coop-victory') {
      const victory = s.outcome === 'coop-victory';
      if (victory) services.reportComplete(1);
      view = {
        tone: 'win',
        title: tr(victory ? 'banner.victory' : 'banner.stageClear', { n: s.stageIndex + 1 }),
        subtitle: victory ? tr('res.victory.sub') : undefined,
        badge: newBest ? tr('res.newBest') : undefined,
        rows: [
          [tr('res.kills'), `${s.stageKills} / ${s.totalEnemies}`],
          [tr('res.base'), `${baseHp(s)} / 6`],
          [tr('res.time'), clock(s.roundTimer)],
          [tr('res.bonus'), `+${s.clearBonus}`],
          ...scoreRows
        ],
        primary: { id: 'res-next', label: victory ? tr('res.loop', { n: loop + 1 }) : tr('res.next') },
        secondary: lobbyBtn,
        footnote: touch ? undefined : tr('res.keys')
      };
    } else if (s.outcome === 'coop-defeat') {
      const reason = s.defeatReason === 'tanks' ? 'tanks' : 'base';
      view = {
        tone: 'lose',
        title: tr('banner.gameOver'),
        subtitle: `${tr(`stage.coop.${s.stageIndex % COOP_STAGES}` as Key)} — ${tr(`res.reason.${reason}` as Key)}`,
        badge: newBest ? tr('res.newBest') : undefined,
        rows: [[tr('res.kills'), `${s.stageKills} / ${s.totalEnemies}`], ...scoreRows],
        tip: tr(`res.tip.${reason}` as Key),
        primary: { id: 'res-next', label: tr('res.retry') },
        secondary: lobbyBtn,
        footnote: touch ? undefined : tr('res.keys')
      };
    } else {
      const vsAi = s.tanks.some((tk) => tk.playerIndex === 1 && tk.isAi);
      const match = s.outcome === 'duel-victory';
      if (match) services.reportComplete(1);
      const title =
        s.roundWinner === -1
          ? tr('banner.drawRound')
          : vsAi
            ? tr(s.roundWinner === 0 ? (match ? 'banner.youMatch' : 'banner.youRound') : match ? 'banner.aiMatch' : 'banner.aiRound')
            : tr(s.roundWinner === 0 ? (match ? 'banner.p1Match' : 'banner.p1Round') : match ? 'banner.p2Match' : 'banner.p2Round');
      autoAdvance = match ? 0 : 3.5;
      view = {
        tone: s.roundWinner === -1 || !vsAi ? 'neutral' : s.roundWinner === 0 ? 'win' : 'lose',
        title,
        subtitle: tr('res.duelScore', { a: s.p1Wins, b: s.p2Wins, name: vsAi ? tr('hud.ai') : '2P' }),
        rows: match ? scoreRows : [],
        primary: { id: 'res-next', label: tr(match ? 'res.rematch' : 'res.nextRound') },
        secondary: lobbyBtn,
        footnote: match ? (touch ? undefined : tr('res.keys')) : tr('res.auto', { n: Math.ceil(autoAdvance) })
      };
    }
    ui.showResults(view);
  }

  function refreshStatus() {
    live.textContent = padStatusText();
    const padStatus = input.status();
    const connectBtn = bar.querySelector<HTMLElement>('[data-tc=connect]');
    if (connectBtn) connectBtn.hidden = padStatus.connected || !padStatus.hidAvailable;
  }

  function btnHtml(action: string, label: string) {
    return `<button type="button" class="secondary-button" data-tc="${action}" style="min-height:44px;padding:0 14px;font-size:15px">${label}</button>`;
  }

  function renderBar() {
    bar.innerHTML = [
      btnHtml('lobby', `☰ ${tr('btn.menu')}`),
      inLobby ? '' : btnHtml('pause', `Ⅱ ${tr('btn.pause')} (P)`),
      btnHtml('connect', tr('btn.connect')),
      btnHtml('lang', lang === 'zh' ? 'EN' : '中文')
    ].join('');
    bar.append(live);
    refreshStatus();
    labelTouchButtons();
  }

  function toggleLang() {
    lang = lang === 'zh' ? 'en' : 'zh';
    services.storage.set('lang', lang);
    renderBar();
    if (inLobby) showLobby();
    else if (gamePaused) ui.showPause(lang);
    else if (resultsOpen) openResults();
    render();
  }

  function openPause() {
    if (inLobby || state.outcome !== 'none') return;
    gamePaused = true;
    mobileControls.clear();
    ui.showPause(lang);
  }

  function closePause() {
    gamePaused = false;
    ui.hide();
  }

  function cycleTeam() {
    const order = teamOrder(lobbyConfig.mode);
    updateLobbyConfig({ teamSetup: order[(order.indexOf(lobbyConfig.teamSetup) + 1) % order.length] });
  }

  function setMode(mode: GameMode) {
    if (mode !== lobbyConfig.mode) updateLobbyConfig({ mode, stageIndex: 0 });
  }

  function cycleStage(delta: number) {
    const count = lobbyConfig.mode === 'coop' ? COOP_STAGES : DUEL_ARENAS;
    updateLobbyConfig({ stageIndex: (lobbyConfig.stageIndex + delta + count) % count });
  }

  function onUiAction(id: string) {
    synth.unlock();
    services.sound.play('tap');
    if (id === 'start-battle') startBattle();
    else if (id === 'lang') toggleLang();
    else if (id === 'connect') void input.connect().then(() => (inLobby ? showLobby() : refreshStatus()));
    else if (id === 'stage-prev') cycleStage(-1);
    else if (id === 'stage-next') cycleStage(1);
    else if (id.startsWith('team-')) updateLobbyConfig({ teamSetup: id.slice(5) as TeamSetup });
    else if (id.startsWith('mode-')) setMode(id.slice(5) as GameMode);
    else if (id.startsWith('p1-chassis-')) updateLobbyConfig({ p1Chassis: id.slice(11) as ChassisId });
    else if (id.startsWith('p2-chassis-')) updateLobbyConfig({ p2Chassis: id.slice(11) as ChassisId });
    else if (id === 'pause-resume') closePause();
    else if (id === 'pause-restart') restartStage();
    else if (id === 'pause-lobby' || id === 'res-lobby') showLobby();
    else if (id === 'res-next') advanceAfterOutcome();
    canvas.focus({ preventScroll: true });
    render();
  }

  const ui = createUi(root, onUiAction);
  const listeners = new AbortController();
  const signal = listeners.signal;

  bar.addEventListener(
    'click',
    async (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-tc]')?.dataset.tc;
      if (!action) return;
      synth.unlock();
      if (action === 'connect') {
        await input.connect();
        refreshStatus();
      } else if (action === 'lobby') {
        showLobby();
      } else if (action === 'pause') {
        if (gamePaused) closePause();
        else openPause();
      } else if (action === 'lang') {
        toggleLang();
      }
      canvas.focus({ preventScroll: true });
      render();
    },
    { signal }
  );

  canvas.addEventListener(
    'pointerdown',
    () => {
      synth.unlock();
      canvas.focus({ preventScroll: true });
    },
    { signal }
  );

  function toControlInput(pad: ReturnType<typeof input.read>[number]): PlayerControlInput {
    return {
      moveX: pad.x,
      moveY: pad.y,
      fire: Boolean(pad.buttons[BUTTON_INDEX.south] || pad.buttons[BUTTON_INDEX.r1] || pad.buttons[BUTTON_INDEX.r2]),
      fireJustPressed: Boolean(
        pad.justPressed[BUTTON_INDEX.south] || pad.justPressed[BUTTON_INDEX.r1] || pad.justPressed[BUTTON_INDEX.r2]
      ),
      specialJustPressed: Boolean(pad.justPressed[BUTTON_INDEX.west] || pad.justPressed[BUTTON_INDEX.l1]),
      dashJustPressed: Boolean(pad.justPressed[BUTTON_INDEX.east] || pad.justPressed[BUTTON_INDEX.l2])
    };
  }

  const isActive = (c: PlayerControlInput) =>
    Math.abs(c.moveX) > 0.2 || Math.abs(c.moveY) > 0.2 || c.fire || c.specialJustPressed || Boolean(c.dashJustPressed);

  function update(dt: number) {
    time += dt;
    const pads = input.read();
    mobileTapped.fire = mobileTapped.mine = mobileTapped.dash = false;
    const anyJust = (btn: keyof typeof BUTTON_INDEX) =>
      Boolean(pads[0].justPressed[BUTTON_INDEX[btn]] || pads[1].justPressed[BUTTON_INDEX[btn]]);
    const anyDir = pads[0].dirPressed ?? pads[1].dirPressed;

    if (inLobby) {
      if (anyDir && ui.moveCursor(anyDir)) synth.tone(440, 0.04, 'triangle', 0.05);
      // Gamepad shortcuts: L1 / R1 cycle each player's tank, X mode, Y players, L2 / R2 stage, Select language.
      if (pads[0].justPressed[BUTTON_INDEX.l1]) updateLobbyConfig({ p1Chassis: cycleChassis(lobbyConfig.p1Chassis, -1) });
      if (pads[0].justPressed[BUTTON_INDEX.r1]) updateLobbyConfig({ p1Chassis: cycleChassis(lobbyConfig.p1Chassis, 1) });
      if (pads[1].justPressed[BUTTON_INDEX.l1]) updateLobbyConfig({ p2Chassis: cycleChassis(lobbyConfig.p2Chassis, -1) });
      if (pads[1].justPressed[BUTTON_INDEX.r1]) updateLobbyConfig({ p2Chassis: cycleChassis(lobbyConfig.p2Chassis, 1) });
      if (anyJust('west')) setMode(lobbyConfig.mode === 'coop' ? 'duel' : 'coop');
      if (anyJust('north')) cycleTeam();
      if (anyJust('l2')) cycleStage(-1);
      if (anyJust('r2')) cycleStage(1);
      if (anyJust('select')) toggleLang();
      if (anyJust('start')) startBattle();
      else if (anyJust('south')) ui.activate();
      return;
    }

    if (gamePaused) {
      if (anyDir && ui.moveCursor(anyDir)) synth.tone(440, 0.04, 'triangle', 0.05);
      if (anyJust('start')) closePause();
      else if (anyJust('south')) ui.activate();
      else if (anyJust('select')) showLobby();
      return;
    }

    if (state.outcome === 'none') {
      if (anyJust('start')) {
        openPause();
        return;
      }
      if (anyJust('select')) {
        showLobby();
        return;
      }
    }

    const p1Control = toControlInput(pads[0]);
    const p2Control = toControlInput(pads[1]);
    battleClock += dt;

    // With one human (AI partner or solo) both key sets drive Player 1, so Arrows + Enter just work.
    const effectiveP1: PlayerControlInput =
      state.teamSetup === '2p'
        ? p1Control
        : {
            moveX: Math.abs(p1Control.moveX) >= Math.abs(p2Control.moveX) ? p1Control.moveX : p2Control.moveX,
            moveY: Math.abs(p1Control.moveY) >= Math.abs(p2Control.moveY) ? p1Control.moveY : p2Control.moveY,
            fire: p1Control.fire || p2Control.fire,
            fireJustPressed: p1Control.fireJustPressed || p2Control.fireJustPressed,
            specialJustPressed: p1Control.specialJustPressed || p2Control.specialJustPressed,
            dashJustPressed: p1Control.dashJustPressed || p2Control.dashJustPressed
          };

    // "2 players" picked but nobody is on the second set of controls: the AI keeps that tank
    // useful until a real Player 2 touches a key, then hands it straight back.
    if (state.teamSetup === '2p') {
      if (isActive(p2Control)) p2Seen = true;
      const p2 = state.tanks.find((tk) => tk.playerIndex === 1);
      if (p2) p2.isAi = !p2Seen && battleClock > 6;
    }

    if (state.outcome !== 'none') {
      stepArena(state, dt, [effectiveP1, p2Control], services.random);
      outcomeAge += dt;
      if (!resultsOpen) {
        if (outcomeAge >= 1.1) openResults();
        return;
      }
      if (anyDir && ui.moveCursor(anyDir)) synth.tone(440, 0.04, 'triangle', 0.05);
      if (autoAdvance > 0) {
        autoAdvance -= dt;
        ui.setFootnote(tr('res.auto', { n: Math.max(1, Math.ceil(autoAdvance)) }));
        if (autoAdvance <= 0) {
          advanceAfterOutcome();
          return;
        }
      }
      // A short guard so the shot that ended the stage does not also dismiss the results.
      if (outcomeAge < 1.7) return;
      if (anyJust('east') || anyJust('select')) showLobby();
      else if (anyJust('south') || anyJust('start')) ui.activate();
      return;
    }

    stepArena(state, dt, [effectiveP1, p2Control], services.random);

    for (const cue of state.cues) {
      playCue(cue);
    }

    if (state.score > bestScore) {
      bestScore = state.score;
      services.storage.set('best', bestScore);
      services.reportScore(bestScore);
    }
  }

  function render() {
    fitScreen();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p2Human = state.teamSetup === '2p' && !state.tanks.some((tk) => tk.playerIndex === 1 && tk.isAi);
    drawArenaScene(g, state, time, lang, {
      layout,
      reducedMotion: services.isReducedMotion,
      best: bestScore,
      hint: touch ? '' : p2Human ? `${tr('ctl.p1')}    |    ${tr('ctl.p2')}` : tr('ctl.1p')
    });
  }

  // Debug / playtest hook
  (globalThis as unknown as { __tankClash?: unknown }).__tankClash = {
    getState: () => state,
    getScreen: () => ui.screen,
    getLayout: () => layout.kind,
    startBattle,
    setConfig: updateLobbyConfig,
    action: onUiAction,
    step: (frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) update(dt);
      render();
    }
  };

  renderBar();
  showLobby();
  void input.reconnect();
  const stop = startLoop((dt) => {
    if (paused) return;
    update(dt);
    render();
  });
  render();

  return {
    pause() {
      paused = true;
      mobileControls.clear();
    },
    resume() {
      paused = false;
      input.read(); // drop key presses that happened while the shell overlay was up
      mobileTapped.fire = mobileTapped.mine = mobileTapped.dash = false;
      canvas.focus({ preventScroll: true });
    },
    restart() {
      paused = false;
      mobileControls.clear();
      if (inLobby) state = createArenaState(lobbyConfig);
      else restartStage();
      render();
    },
    destroy() {
      stop();
      listeners.abort();
      ui.destroy();
      mobileControls.destroy();
      input.destroy();
      synth.destroy();
      delete (globalThis as unknown as { __tankClash?: unknown }).__tankClash;
      host.replaceChildren();
    }
  };
}

export const game: GameModule = {
  meta: {
    slug: 'tank-clash',
    title: 'Tank Clash',
    category: 'action',
    description:
      'Tank warfare for one or two: Co-op Eagle Base defense with an AI ally, 5-win Versus duels, four distinct tank chassis, warp portals, and chain-reaction barrels.',
    instructions:
      'Pick Co-op Defense (guard the Eagle Base across 6 stages and 2 bosses, then harder laps) or Versus Duel (first to 5 rounds), with 1 player + AI ally, solo, or 2 players. Four tank classes. P1: WASD move, Space/J fire, K/F mine, L/G dash, P pause. P2: Arrows move, Enter/0 fire, Right Shift/. mine, comma or apostrophe dash. With one player both key sets drive your tank. Supports two gamepads (A fire, X mine, B dash) and touch (stick, FIRE, MINE, DASH).',
    accent: ACCENT,
    mechanic: 'Co-op base defense & tank duels'
  },
  mount
};

export default game;
