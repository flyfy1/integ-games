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
  createArenaState,
  stepArena,
  type ArenaState,
  type SoundCue
} from './engine';
import { defaultLang, isLang, t, type Key, type Lang } from './i18n';
import { CHASSIS_ORDER, HEIGHT, WIDTH } from './maps';
import {
  drawArenaScene,
  drawLobbyOverlay,
  drawPauseOverlay,
  type LobbyConfig,
  type LobbyHitbox
} from './render';
import type { ChassisId, GameMode, PlayerControlInput, TeamSetup } from './types';

const ACCENT = '#36d6ff';
const MAX_HEIGHT = 960; // Up to 4:3 full-screen aspect without shrinking the arena.

/**
 * Dedicated 2-player keyboard layout so P1 (WASD + Space/J + K/Q) and
 * P2 (Arrows + Enter/Numpad0/Slash + RightShift/Period) can play simultaneously on one keyboard without key conflicts.
 */
export const TANK_CLASH_KEYBOARD: readonly KeyboardMap[] = [
  {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    buttons: [
      ['Space', 'KeyJ'], // south: Fire
      'KeyL', // east
      ['KeyK', 'KeyF'], // west: Mine / Dash
      'KeyU', // north
      'KeyQ', // l1: prev chassis
      'KeyE', // r1: next chassis
      'KeyZ',
      'KeyC',
      'Digit1',
      'Digit2'
    ]
  },
  {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    buttons: [
      ['Enter', 'NumpadEnter', 'Numpad0', 'Slash'], // south: Fire
      'Quote', // east
      ['ShiftRight', 'Period', 'NumpadDecimal'], // west: Mine / Dash
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
  let lobbyConfig: LobbyConfig = {
    mode: services.storage.get<GameMode>('mode', 'coop'),
    teamSetup: services.storage.get<TeamSetup>('teamSetup', '2p'),
    stageIndex: 0,
    p1Chassis: services.storage.get<ChassisId>('p1Chassis', 'vanguard'),
    p2Chassis: services.storage.get<ChassisId>('p2Chassis', 'titan')
  };

  let inLobby = true;
  let paused = false;
  let gamePaused = false;
  let pauseCursor = 0;
  let lobbyCursorId = 'start-battle';
  let time = 0;
  let bestScore = services.storage.get<number>('best', 0);
  let state: ArenaState = createArenaState(lobbyConfig);
  let hitboxes: LobbyHitbox[] = [];
  let pauseHitboxes: LobbyHitbox[] = [];

  const root = document.createElement('div');
  root.dataset.tankClash = '';
  root.style.cssText =
    'width:100%;max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:8px;color:#F7F9FF;font-family:system-ui,sans-serif;position:relative';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Tank Clash');
  canvas.style.cssText = `display:block;width:min(100%,calc((100dvh - 96px)*16/9));aspect-ratio:16/9;margin:0 auto;border-radius:16px;background:#070b14;border:1px solid ${ACCENT}55;touch-action:none;outline:none`;

  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;font-size:13px;min-height:40px';
  const live = document.createElement('p');
  live.setAttribute('role', 'status');
  live.style.cssText = 'margin:0;padding:0 6px;color:#A8B1C5';

  root.append(canvas, bar);
  host.replaceChildren(root);
  canvas.focus({ preventScroll: true });
  const g = canvas.getContext('2d')!;
  const rootStyle = root.style.cssText;
  const canvasStyle = canvas.style.cssText;
  const barStyle = bar.style.cssText;
  let headroom = 0;
  let fullscreen = false;
  let barLeft = 0;

  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive'));
    const nextHeight = full
      ? Math.round(Math.min(MAX_HEIGHT, Math.max(HEIGHT, (WIDTH * innerHeight) / Math.max(1, innerWidth))))
      : HEIGHT;
    if (full !== fullscreen) {
      fullscreen = full;
      root.style.cssText = full
        ? `${rootStyle};position:fixed;inset:0;max-width:none;align-items:center;justify-content:center;background:#070b14`
        : rootStyle;
      bar.style.cssText = full
        ? `${barStyle};position:absolute;top:8px;left:0;right:0;z-index:2;transition:opacity .2s`
        : barStyle;
      if (!full) {
        canvas.style.cssText = canvasStyle;
        bar.style.opacity = '1';
        bar.style.pointerEvents = 'auto';
      }
    }
    if (full) {
      canvas.style.cssText = `${canvasStyle};width:min(100vw,calc(100dvh*${WIDTH}/${nextHeight}));aspect-ratio:${WIDTH}/${nextHeight};border:0;border-radius:0`;
      bar.style.opacity = barLeft > 0 ? '1' : '0';
      bar.style.pointerEvents = barLeft > 0 ? 'auto' : 'none';
    } else if (canvas.height !== HEIGHT) {
      canvas.style.cssText = canvasStyle;
    }
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    headroom = nextHeight - HEIGHT;
  }

  // Mobile virtual stick & buttons for Player 1
  const mobileHeld = { up: false, down: false, left: false, right: false, fire: false, mine: false };
  const mobileControls = createMobileControls(root, {
    shape: 'stick-action',
    labels: ['Fire', 'Mine'],
    pause: true,
    onChange(action, held) {
      if (action in mobileHeld) {
        mobileHeld[action as keyof typeof mobileHeld] = held;
      }
      if (held && inLobby && (action === 'fire' || action === 'mine')) {
        startBattle();
      }
    }
  });

  const virtualPad = (player: number): VirtualPad | undefined => {
    if (player !== 0) return undefined;
    return {
      x: (mobileHeld.right ? 1 : 0) - (mobileHeld.left ? 1 : 0),
      y: (mobileHeld.down ? 1 : 0) - (mobileHeld.up ? 1 : 0),
      hx: 0,
      hy: 0,
      rx: 0,
      ry: 0,
      buttons: [mobileHeld.fire, false, mobileHeld.mine]
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
      case 'mine':
        services.sound.play('tap');
        synth.tone(360, 0.08, 'triangle', 0.09, 0, 520);
        break;
      case 'freeze':
        services.sound.play('collect');
        synth.chime(1046, 0.15, 0);
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

  function updateLobbyConfig(patch: Partial<LobbyConfig>) {
    lobbyConfig = { ...lobbyConfig, ...patch };
    savePreferences();
    state = createArenaState(lobbyConfig);
    renderBar();
    render();
  }

  function startBattle() {
    synth.unlock();
    inLobby = false;
    gamePaused = false;
    state = createArenaState(lobbyConfig);
    renderBar();
    render();
  }

  function advanceAfterOutcome() {
    if (state.outcome === 'stage-clear') {
      const nextStage = (state.stageIndex + 1) % 6;
      lobbyConfig.stageIndex = nextStage;
      state = createArenaState({
        ...lobbyConfig,
        stageIndex: nextStage,
        carryScore: state.score
      });
      services.reportComplete((nextStage) / 6);
    } else if (state.outcome === 'coop-victory') {
      services.reportComplete(1);
      const nextStage = (state.stageIndex + 1) % 6;
      lobbyConfig.stageIndex = nextStage;
      state = createArenaState({
        ...lobbyConfig,
        stageIndex: nextStage,
        carryScore: state.score
      });
    } else if (state.outcome === 'coop-defeat') {
      state = createArenaState({
        ...lobbyConfig,
        carryScore: 0
      });
    } else if (state.outcome === 'round-over') {
      const nextMap = (state.stageIndex + 1) % 5;
      lobbyConfig.stageIndex = nextMap;
      state = createArenaState({
        ...lobbyConfig,
        stageIndex: nextMap,
        roundNumber: state.roundNumber + 1,
        p1Wins: state.p1Wins,
        p2Wins: state.p2Wins,
        carryScore: state.score
      });
    } else if (state.outcome === 'duel-victory') {
      services.reportComplete(1);
      state = createArenaState({
        ...lobbyConfig,
        roundNumber: 1,
        p1Wins: 0,
        p2Wins: 0,
        carryScore: 0
      });
    }
    renderBar();
  }

  function refreshStatus() {
    const padStatus = input.status();
    const count = (padStatus.connected ? 2 : 0) + padStatus.standard;
    live.textContent = count > 0 ? tr('pad.ready', { n: count }) : tr('pad.none');
    const connectBtn = bar.querySelector<HTMLElement>('[data-tc=connect]');
    if (connectBtn) connectBtn.hidden = padStatus.connected || !padStatus.hidAvailable;
  }

  function btnHtml(action: string, label: string, extraAttr = '') {
    return `<button type="button" class="secondary-button" data-tc="${action}" ${extraAttr} style="min-height:38px;padding:0 12px">${label}</button>`;
  }

  function renderBar() {
    const modeLabel = tr(lobbyConfig.mode === 'coop' ? 'mode.coop' : 'mode.duel');
    const teamLabel = tr(`team.${lobbyConfig.teamSetup}` as Key);
    const parts = [
      btnHtml('connect', tr('btn.connect')),
      btnHtml('mode', tr('btn.mode', { m: modeLabel })),
      btnHtml('team', tr('btn.team', { t: teamLabel })),
      btnHtml('map', tr('btn.map', { n: lobbyConfig.stageIndex + 1 })),
      btnHtml('lobby', tr('btn.lobby')),
      btnHtml('lang', lang === 'zh' ? 'EN' : '中文')
    ];
    bar.innerHTML = parts.join('');
    bar.append(live);
    refreshStatus();
  }

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
      } else if (action === 'mode') {
        const nextMode: GameMode = lobbyConfig.mode === 'coop' ? 'duel' : 'coop';
        const nextTeam: TeamSetup =
          nextMode === 'duel' && lobbyConfig.teamSetup === '1p-solo' ? '2p' : lobbyConfig.teamSetup;
        updateLobbyConfig({ mode: nextMode, teamSetup: nextTeam, stageIndex: 0 });
      } else if (action === 'team') {
        const order: TeamSetup[] = lobbyConfig.mode === 'coop' ? ['2p', '1p-ai', '1p-solo'] : ['2p', '1p-ai'];
        const nextTeam = order[(order.indexOf(lobbyConfig.teamSetup) + 1) % order.length];
        updateLobbyConfig({ teamSetup: nextTeam });
      } else if (action === 'map') {
        const maxMaps = lobbyConfig.mode === 'coop' ? 6 : 5;
        updateLobbyConfig({ stageIndex: (lobbyConfig.stageIndex + 1) % maxMaps });
      } else if (action === 'lobby') {
        inLobby = !inLobby;
        render();
      } else if (action === 'lang') {
        lang = lang === 'zh' ? 'en' : 'zh';
        services.storage.set('lang', lang);
        renderBar();
        render();
      }
      canvas.focus({ preventScroll: true });
    },
    { signal }
  );

  root.addEventListener('pointermove', () => { barLeft = 3; }, { signal });

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      synth.unlock();
      barLeft = 3;
      canvas.focus({ preventScroll: true });
      const box = canvas.getBoundingClientRect();
      const x = ((event.clientX - box.left) * WIDTH) / box.width;
      const y = ((event.clientY - box.top) * canvas.height) / box.height - Math.round(headroom / 2);

      if (inLobby) {
        const hit = hitboxes.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
        if (hit) {
          lobbyCursorId = hit.id;
          services.sound.play('tap');
          hit.action();
        }
        return;
      }

      if (gamePaused) {
        const hit = pauseHitboxes.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
        if (hit) {
          services.sound.play('tap');
          hit.action();
        }
        return;
      }

      if (state.outcome !== 'none' && state.outcomeTimer <= 1.4) {
        advanceAfterOutcome();
      }
    },
    { signal }
  );

  function moveLobbyCursor(dir: 'up' | 'down' | 'left' | 'right') {
    if (!hitboxes.length) return;
    const current = hitboxes.find((h) => h.id === lobbyCursorId) ?? hitboxes[hitboxes.length - 1];
    const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const candidates = hitboxes.filter((h) =>
      dr !== 0 ? Math.sign(h.row - current.row) === dr : h.row === current.row && Math.sign(h.col - current.col) === dc
    );
    const next = candidates.sort(
      (a, b) =>
        Math.abs(a.row - current.row) * 10 +
        Math.abs(a.col - current.col) -
        (Math.abs(b.row - current.row) * 10 + Math.abs(b.col - current.col))
    )[0];
    if (next) {
      lobbyCursorId = next.id;
      synth.tone(440, 0.04, 'triangle', 0.05);
      render();
    }
  }

  function toControlInput(pad: ReturnType<typeof input.read>[number]): PlayerControlInput {
    return {
      moveX: pad.x,
      moveY: pad.y,
      fire: Boolean(pad.buttons[BUTTON_INDEX.south] || pad.buttons[BUTTON_INDEX.r1] || pad.buttons[BUTTON_INDEX.r2]),
      fireJustPressed: Boolean(
        pad.justPressed[BUTTON_INDEX.south] || pad.justPressed[BUTTON_INDEX.r1] || pad.justPressed[BUTTON_INDEX.r2]
      ),
      specialJustPressed: Boolean(
        pad.justPressed[BUTTON_INDEX.west] || pad.justPressed[BUTTON_INDEX.east] || pad.justPressed[BUTTON_INDEX.l1]
      )
    };
  }

  function update(dt: number) {
    time += dt;
    barLeft = Math.max(0, barLeft - dt);
    const pads = input.read();
    const anyJust = (btn: keyof typeof BUTTON_INDEX) =>
      Boolean(pads[0].justPressed[BUTTON_INDEX[btn]] || pads[1].justPressed[BUTTON_INDEX[btn]]);
    const anyDir = pads[0].dirPressed ?? pads[1].dirPressed;

    if (inLobby) {
      if (anyDir) {
        moveLobbyCursor(anyDir);
      }
      // L1 / R1 cycles tank chassis for P1 / P2
      if (pads[0].justPressed[BUTTON_INDEX.l1]) {
        updateLobbyConfig({ p1Chassis: cycleChassis(lobbyConfig.p1Chassis, -1) });
      }
      if (pads[0].justPressed[BUTTON_INDEX.r1]) {
        updateLobbyConfig({ p1Chassis: cycleChassis(lobbyConfig.p1Chassis, 1) });
      }
      if (pads[1].justPressed[BUTTON_INDEX.l1]) {
        updateLobbyConfig({ p2Chassis: cycleChassis(lobbyConfig.p2Chassis, -1) });
      }
      if (pads[1].justPressed[BUTTON_INDEX.r1]) {
        updateLobbyConfig({ p2Chassis: cycleChassis(lobbyConfig.p2Chassis, 1) });
      }
      // West (X) toggles game mode (Co-op <-> Duel)
      if (anyJust('west')) {
        const nextMode: GameMode = lobbyConfig.mode === 'coop' ? 'duel' : 'coop';
        const nextTeam: TeamSetup =
          nextMode === 'duel' && lobbyConfig.teamSetup === '1p-solo' ? '2p' : lobbyConfig.teamSetup;
        updateLobbyConfig({ mode: nextMode, teamSetup: nextTeam, stageIndex: 0 });
      }
      // North (Y) cycles player count setup
      if (anyJust('north')) {
        const order: TeamSetup[] = lobbyConfig.mode === 'coop' ? ['2p', '1p-ai', '1p-solo'] : ['2p', '1p-ai'];
        const nextTeam = order[(order.indexOf(lobbyConfig.teamSetup) + 1) % order.length];
        updateLobbyConfig({ teamSetup: nextTeam });
      }
      // L2 / R2 cycles map
      if (anyJust('l2') || anyJust('r2')) {
        const maxMaps = lobbyConfig.mode === 'coop' ? 6 : 5;
        const delta = anyJust('r2') ? 1 : -1;
        updateLobbyConfig({ stageIndex: (lobbyConfig.stageIndex + delta + maxMaps) % maxMaps });
      }
      // Select toggles language
      if (anyJust('select')) {
        lang = lang === 'zh' ? 'en' : 'zh';
        services.storage.set('lang', lang);
        renderBar();
        render();
      }
      // Start immediately launches battle; South (A / Space / Enter) activates focused Lobby item
      if (anyJust('start')) {
        startBattle();
      } else if (anyJust('south')) {
        const focused = hitboxes.find((h) => h.id === lobbyCursorId);
        if (focused) {
          services.sound.play('tap');
          focused.action();
        } else {
          startBattle();
        }
      }
      return;
    }

    // In-game Pause menu controlled by Gamepad
    if (gamePaused) {
      if (anyDir === 'up' || anyDir === 'down') {
        pauseCursor = (pauseCursor + (anyDir === 'down' ? 1 : 2)) % 3;
        synth.tone(440, 0.04, 'triangle', 0.05);
      }
      if (anyJust('start')) {
        gamePaused = false;
      } else if (anyJust('west')) {
        gamePaused = false;
        state = createArenaState(lobbyConfig);
      } else if (anyJust('east') || anyJust('select')) {
        gamePaused = false;
        inLobby = true;
      } else if (anyJust('south')) {
        pauseHitboxes[pauseCursor]?.action();
      }
      return;
    }

    if (anyJust('start')) {
      gamePaused = true;
      pauseCursor = 0;
      return;
    }
    if (anyJust('select')) {
      inLobby = true;
      return;
    }

    const p1Control = toControlInput(pads[0]);
    const p2Control = toControlInput(pads[1]);

    // In 1-player setups (1p-ai or 1p-solo), let P1 also use Arrow keys / Enter (Pad 2 slot) for convenience!
    const effectiveP1: PlayerControlInput =
      state.teamSetup === '2p'
        ? p1Control
        : {
            moveX: Math.abs(p1Control.moveX) >= Math.abs(p2Control.moveX) ? p1Control.moveX : p2Control.moveX,
            moveY: Math.abs(p1Control.moveY) >= Math.abs(p2Control.moveY) ? p1Control.moveY : p2Control.moveY,
            fire: p1Control.fire || p2Control.fire,
            fireJustPressed: p1Control.fireJustPressed || p2Control.fireJustPressed,
            specialJustPressed: p1Control.specialJustPressed || p2Control.specialJustPressed
          };

    if (state.outcome !== 'none') {
      stepArena(state, dt, [effectiveP1, p2Control], services.random);
      if (anyJust('east') || anyJust('select')) {
        inLobby = true;
        return;
      }
      if (
        state.outcomeTimer <= 0 ||
        (state.outcomeTimer <= 1.6 &&
          (effectiveP1.fireJustPressed || p2Control.fireJustPressed || anyJust('south') || anyJust('start')))
      ) {
        advanceAfterOutcome();
      }
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
    const offsetY = Math.round(headroom / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#070b14';
    g.fillRect(0, 0, WIDTH, canvas.height);
    g.setTransform(1, 0, 0, 1, 0, offsetY);
    drawArenaScene(g, state, time, lang);
    if (inLobby) {
      hitboxes = drawLobbyOverlay(g, lobbyConfig, lang, lobbyCursorId, updateLobbyConfig, startBattle);
      pauseHitboxes = [];
    } else if (gamePaused) {
      hitboxes = [];
      pauseHitboxes = drawPauseOverlay(
        g,
        lang,
        pauseCursor,
        () => {
          gamePaused = false;
        },
        () => {
          gamePaused = false;
          state = createArenaState(lobbyConfig);
        },
        () => {
          gamePaused = false;
          inLobby = true;
        }
      );
    } else {
      hitboxes = [];
      pauseHitboxes = [];
    }
  }

  // Expose debug / playtest hook
  (globalThis as unknown as { __tankClash?: unknown }).__tankClash = {
    getState: () => state,
    startBattle,
    setConfig: updateLobbyConfig,
    step: (frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) update(dt);
      render();
    }
  };

  renderBar();
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
      canvas.focus({ preventScroll: true });
    },
    restart() {
      paused = false;
      mobileControls.clear();
      state = createArenaState(lobbyConfig);
      render();
    },
    destroy() {
      stop();
      listeners.abort();
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
      'Two-player tank warfare with Co-op Eagle Base defense, 5-win Versus Ricochet Arenas, four distinct tank chassis, warp portals, and chain-reaction barrels.',
    instructions:
      'Pick Co-op Defense (guard the Eagle Base across 6 stages & Bosses) or Versus Duel (first to 5 wins), and choose 2P, 1P+AI, or Solo. Choose from 4 tank classes (Vanguard, Phantom, Titan, Prism). P1: WASD move, Space/J fire, K/F mine & dash, Q/E switch tank. P2: Arrows move, Enter/0 fire, Right Shift/. mine & dash, N/M switch tank. Supports two gamepads and touch controls.',
    accent: ACCENT,
    mechanic: 'Co-op base defense & 2P ricochet tank duels'
  },
  mount
};

export default game;
