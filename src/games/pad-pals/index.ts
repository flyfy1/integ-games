import type { GameModule, GameServices } from '../../core/game-types';
import { BUTTON_INDEX, createInput, createSound, startLoop, type ButtonName, type PadState } from '../_shared/gamepad-kit';
import { defaultLang, isLang, t, type Key, type Lang, type SpokenKey } from './i18n';
import { bestStars, DIFFICULTIES, DIFFICULTY_ICONS, emptyProgress, isMastered, isOpen, isProgress, levelStars, LEVELS, masteredCount, maxScore, PARTY_LEVEL, recordResult, starCount, STARS_PER_STICKER, starsFor, starsToNextSticker, stickerCount, STICKERS, totalScore, type Difficulty, type Level, type Progress } from './levels';
import { createMini, type Frame, type Mini, type MiniEnv } from './minis';
import { createVoice } from './voice';
import { createTouchPad, drawChip, drawPad, HEIGHT, hitsMenu, PLAY_HEIGHT, WIDTH, type Demo, type GlyphSet, type Highlight } from './pad-view';

const ACCENT = '#ffb547';
const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
const CALIBRATION: readonly ButtonName[] = ['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start'];
const MAX_HEIGHT = 960; // 4:3. Anything taller would shrink the pad too much to use.
const ROW_Y = [130, 222, 314, 406], COLUMN_X = [310, 520, 730, 940];

/** Seconds without any input before a helping hand shows what to do. Tiger players are left to work it out. */
const DEMO_AFTER = [2.5, 6, Infinity];
const CONFETTI = ['#ffd96b', '#7ff0ad', '#8fc2ff', '#ff9aa5', '#c9a8ff', '#ffffff'];
const LAB_TOYS = ['🎉', '⭐', '🌈', '🎈', '🍭', '🦄'];
type ResultAction = 'next' | 'again' | 'map';
const RESULT_BUTTONS: ReadonlyArray<{ action: ResultAction; button: ButtonName; icon: string; key: Key }> = [
  { action: 'next', button: 'south', icon: '▶️', key: 'result.next' },
  { action: 'again', button: 'west', icon: '🔁', key: 'result.again' },
  { action: 'map', button: 'east', icon: '🗺️', key: 'result.map' }
];
const RESULT_Y = 430;

type Screen = 'title' | 'map' | 'ready' | 'play' | 'result' | 'lab' | 'calibrate' | 'album' | 'master';
type MapItem = { kind: 'difficulty'; difficulty: Difficulty } | { kind: 'lab' } | { kind: 'album' } | { kind: 'level'; level: Level };
type MapCell = { item: MapItem; row: number; column: number; x: number; y: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; icon: string };
type Confetto = { x: number; y: number; vx: number; vy: number; spin: number; color: string; life: number };

const MAP_CELLS: MapCell[] = [
  ...DIFFICULTIES.map((difficulty, column) => ({ item: { kind: 'difficulty', difficulty } as MapItem, row: 0, column, x: COLUMN_X[column], y: 44 })),
  { item: { kind: 'lab' }, row: 0, column: 3, x: COLUMN_X[3], y: 44 },
  ...LEVELS.map((level) => {
    const column = LEVELS.filter((other) => other.world === level.world).indexOf(level);
    return { item: { kind: 'level', level } as MapItem, row: level.world + 1, column, x: COLUMN_X[column], y: ROW_Y[level.world] };
  }),
  { item: { kind: 'level', level: PARTY_LEVEL }, row: 1, column: 3, x: COLUMN_X[3], y: ROW_Y[0] },
  { item: { kind: 'album' }, row: 2, column: 3, x: COLUMN_X[3], y: ROW_Y[1] }
];

function mount(host: HTMLElement, services: GameServices) {
  const stored = services.storage.get<unknown>('lang', null);
  const storedProgress = services.storage.get<unknown>('progress', null);
  const storedMaps = services.storage.get<Record<string, number[]>>('button-maps', {});
  let lang: Lang = isLang(stored) ? stored : defaultLang();
  let progress: Progress = isProgress(storedProgress) ? storedProgress : emptyProgress();
  let difficulty = (DIFFICULTIES as readonly number[]).includes(services.storage.get('difficulty', 0)) ? services.storage.get<Difficulty>('difficulty', 0) : 0;
  const tr = (key: Key, params?: Record<string, string | number>) => t(lang, key, params);

  const root = document.createElement('div');
  root.dataset.padPals = '';
  root.style.cssText = 'width:100%;max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:8px;color:#F7F9FF;font-family:system-ui,sans-serif';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT; canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Pad Pals');
  canvas.style.cssText = `display:block;width:min(100%,calc((100dvh - 96px)*16/9));aspect-ratio:16/9;margin:0 auto;border-radius:16px;background:#12192A;border:1px solid ${ACCENT}55;touch-action:none;outline:none`;
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;font-size:14px;min-height:40px';
  const live = document.createElement('p');
  live.setAttribute('role', 'status');
  live.style.cssText = 'margin:0;padding:0 6px;color:#A8B1C5';
  root.append(canvas, bar);
  host.replaceChildren(root);
  canvas.focus({ preventScroll: true });
  const g = canvas.getContext('2d')!;
  const rootStyle = root.style.cssText, canvasStyle = canvas.style.cssText, barStyle = bar.style.cssText;
  /** Rows added above the scene on screens taller than 16:9, so full screen has no bars there. */
  let headroom = 0, fullscreen = false, rotated = false, barLeft = 0, layout = '';
  const coarse = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive'));
    // A phone held upright would show a pad too small to touch. The picture turns instead, and the child turns the phone like a controller.
    const turn = full && coarse() && innerHeight > innerWidth * 1.2;
    const viewWidth = turn ? innerHeight : innerWidth, viewHeight = turn ? innerWidth : innerHeight;
    const nextHeight = full ? Math.round(Math.min(MAX_HEIGHT, Math.max(HEIGHT, WIDTH * viewHeight / Math.max(1, viewWidth)))) : HEIGHT;
    const key = `${full}|${turn}|${viewWidth}|${viewHeight}|${nextHeight}`;
    if (key !== layout) {
      layout = key; fullscreen = full; rotated = turn;
      const fill = 'max-width:none;align-items:center;justify-content:center;background:#1a2036';
      root.style.cssText = !full ? rootStyle : turn ? `${rootStyle};position:fixed;left:0;top:0;width:${viewWidth}px;height:${viewHeight}px;${fill};transform-origin:0 0;transform:translateX(${innerWidth}px) rotate(90deg)` : `${rootStyle};position:fixed;inset:0;${fill}`;
      bar.style.cssText = full ? `${barStyle};position:absolute;top:8px;left:0;right:0;z-index:2;transition:opacity .2s` : barStyle;
      const width = turn ? `${Math.min(viewWidth, viewHeight * WIDTH / nextHeight)}px` : `min(100vw,calc(100dvh*${WIDTH}/${nextHeight}))`;
      canvas.style.cssText = full ? `${canvasStyle};width:${width};aspect-ratio:${WIDTH}/${nextHeight};border:0;border-radius:0` : canvasStyle;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      headroom = nextHeight - HEIGHT;
    }
    if (full) {
      bar.style.opacity = barLeft > 0 ? '1' : '0';
      bar.style.pointerEvents = barLeft > 0 ? 'auto' : 'none';
    }
  }

  const touch = createTouchPad();
  const sound = createSound(() => services.sound.muted);
  const input = createInput({ virtual: (player) => (player === 0 ? touch.read() : undefined), onChange: handlePadEvent });
  Object.entries(storedMaps).forEach(([kind, map]) => input.setButtonMap(kind, map));

  let screen: Screen = 'title', paused = false, time = 0, readyLeft = 0, banner = '', bannerLeft = 0, idle = 0;
  let cursor = MAP_CELLS.find((cell) => cell.item.kind === 'level')!;
  let level: Level = LEVELS[0], mini: Mini | undefined, resultStars = 0, resultWinner: number | undefined;
  let glyphs: GlyphSet = 'keys', players = 1, statusLine = '', statusClock = 0;
  let sparks: Spark[] = [], confetti: Confetto[] = [];
  /** Time since the last input in a level, and everything the result screen reveals step by step. */
  let still = 0, resultAge = 0, starsShown = 0, resultBest = false, resultVersus = false, resultMisses = 0, newStickers: string[] = [], stickersShown = false;
  let pendingMaster: Difficulty | null = null, masterTier: Difficulty = 0, masterAge = 0, rain = 0;
  let calibrateStep = 0, calibrateMap: number[] = [], calibrateKind = '';
  let lastPad: PadState = { x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [], justPressed: [], dirPressed: null, btn: false, pressed: false };

  const voice = createVoice();
  const say = (key: SpokenKey) => { if (!services.sound.muted) voice.say(lang, key); };
  const quiet = voice.stop;
  function party(count: number, x = WIDTH / 2, y = 150) {
    if (services.isReducedMotion) return;
    for (let i = 0; i < count; i++) {
      const angle = services.random() * Math.PI * 2, speed = 180 + services.random() * 420;
      confetti.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 260, spin: services.random() * 6, color: CONFETTI[i % CONFETTI.length], life: 1.6 + services.random() });
    }
  }
  function spark(x: number, y: number, icon: string, count: number) {
    if (services.isReducedMotion) count = 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count;
      sparks.push({ x, y, vx: count > 1 ? Math.cos(angle) * 260 : 0, vy: count > 1 ? Math.sin(angle) * 260 : -60, life: 0.7, icon });
    }
  }
  const env = (): MiniEnv => ({
    difficulty, random: services.random, players, glyphs: () => glyphs,
    good(x, y, note = 0) { sound.chime(SCALE[note % SCALE.length], 0.15); spark(x, y, '✨', 8); },
    bad(x, y) { sound.tone(240, 0.16, 'triangle', 0.1, 0, 150); spark(x, y, '💨', 1); },
    tick(note = 0) { sound.tone(SCALE[note % SCALE.length] / 2, 0.08, 'triangle', 0.06); },
    note(note) { sound.chime(SCALE[note % SCALE.length], 0.22); },
    say
  });

  function save() {
    services.storage.set('progress', progress);
    services.storage.set('difficulty', difficulty);
    const score = totalScore(progress);
    services.reportScore(score);
    services.reportComplete(score / maxScore);
  }
  const cellOf = (target: Level) => MAP_CELLS.find((cell) => cell.item.kind === 'level' && cell.item.level === target);
  function go(next: Screen) {
    // Coming back to the map, the cursor waits on the newest level that has no stars yet: one press carries on the journey.
    if (next === 'map' && (screen === 'title' || screen === 'result' || screen === 'master')) {
      const frontier = LEVELS[Math.max(0, Math.min(Math.floor(progress.open) || 0, LEVELS.length - 1))];
      cursor = (levelStars(progress, frontier.id) === 0 ? cellOf(frontier) : screen === 'title' ? undefined : cellOf(level)) ?? cursor;
    }
    screen = next; idle = 0; renderBar();
  }
  function begin(next: Level) {
    level = next; mini = createMini(next, env()); readyLeft = services.isReducedMotion ? 0.8 : 1.6; still = 0; confetti = [];
    go('ready');
    say(`hint.${next.id}` as SpokenKey);
  }
  function finishLevel() {
    if (!mini) return;
    const before = progress, hadBest = bestStars(progress, level.id, difficulty);
    resultStars = starsFor(mini.misses, mini.goal); resultWinner = mini.winner; resultVersus = Boolean(mini.versus); resultMisses = mini.misses;
    progress = recordResult(progress, level, difficulty, resultStars);
    save();
    resultBest = hadBest > 0 && resultStars > hadBest;
    newStickers = STICKERS.slice(stickerCount(before), stickerCount(progress));
    pendingMaster = !isMastered(before, difficulty) && isMastered(progress, difficulty) ? difficulty : null;
    resultAge = 0; starsShown = 0; stickersShown = false;
    services.sound.play('success');
    say(resultWinner !== undefined && resultVersus ? (resultWinner === 0 ? 'result.p1' : 'result.p2') : resultStars === 3 ? 'result.great' : resultStars === 2 ? 'result.good' : 'result.ok');
    go('result');
  }
  function nextLevel() {
    const index = LEVELS.indexOf(level);
    if (index >= 0 && index + 1 < LEVELS.length) begin(LEVELS[index + 1]); else go('map');
  }
  /** Every level of a difficulty cleared earns the big party before anything else happens. */
  function leaveResult(action: ResultAction) {
    if (resultAge < resultLock()) return;
    quiet(); confetti = [];
    if (pendingMaster !== null) {
      masterTier = pendingMaster; pendingMaster = null; masterAge = 0; rain = 0;
      services.sound.play('upgrade');
      [0, 2, 4, 5, 7, 9].forEach((note, i) => sound.chime(SCALE[note], 0.16, i * 0.13));
      party(70);
      go('master');
    } else if (action === 'next') nextLevel();
    else if (action === 'again') begin(level);
    else go('map');
  }
  /** A child who is still mashing the button from the level must not skip their own stars. */
  const resultLock = () => 0.5 + resultStars * 0.4;
  const resultButtons = () => RESULT_BUTTONS.filter((item) => item.action !== 'next' || LEVELS.includes(level)).map((item, i, all) => ({ ...item, x: WIDTH / 2 + (i - (all.length - 1) / 2) * 310 }));
  function skipLevel() { progress = recordResult(progress, level, difficulty, 0); save(); nextLevel(); }

  function startCalibration() {
    calibrateStep = 0; calibrateKind = ''; calibrateMap = Array.from({ length: 12 }, (_, i) => i);
    input.rawPress();
    go('calibrate');
    say(`calib.press.${CALIBRATION[0]}` as SpokenKey);
  }
  function advanceCalibration() {
    calibrateStep++;
    if (calibrateStep >= CALIBRATION.length) {
      if (calibrateKind) {
        input.setButtonMap(calibrateKind, calibrateMap);
        services.storage.set('button-maps', { ...services.storage.get<Record<string, number[]>>('button-maps', {}), [calibrateKind]: calibrateMap });
      }
      banner = tr('calib.done'); bannerLeft = 2; say('calib.done');
      go('map');
    } else say(`calib.press.${CALIBRATION[calibrateStep]}` as SpokenKey);
  }

  function handlePadEvent(event: 'connected' | 'seen' | 'disconnected') {
    if (event === 'disconnected') {
      banner = tr('pad.lost'); bannerLeft = 5;
      if (screen === 'play' || screen === 'ready') { mini = undefined; go('title'); }
    }
    refreshStatus();
  }
  function refreshStatus() {
    const state = input.status();
    players = state.players[1].seen || state.standard > 1 ? 2 : 1;
    const anyPad = state.connected || state.standard > 0;
    if (state.connected || state.ids.some((id) => /054c|sony|dualsense|dualshock|wireless controller/i.test(id))) glyphs = 'ps';
    else if (anyPad || globalThis.matchMedia?.('(pointer: coarse)').matches) glyphs = 'xbox';
    else glyphs = 'keys';
    const line = state.unclaimedProfile ? tr('pad.needConnect') : !anyPad ? tr('pad.none') : state.players.map((pad, i) => tr(pad.seen ? 'pad.on' : 'pad.wait', { n: i + 1 })).slice(0, state.connected ? 2 : Math.max(1, state.standard)).join(' · ');
    if (line !== statusLine) { statusLine = line; live.textContent = line; }
    const connect = bar.querySelector<HTMLElement>('[data-pad-connect]');
    if (connect) connect.hidden = state.connected || !state.hidAvailable;
  }
  function button(action: string, label: string) {
    return `<button type="button" class="secondary-button" data-pad="${action}" style="min-height:40px;padding:0 12px">${label}</button>`;
  }
  function renderBar() {
    const parts: string[] = [button('connect', tr('btn.connect')).replace('data-pad=', 'data-pad-connect data-pad=')];
    if (screen === 'play' || screen === 'ready') parts.push(button('map', tr('btn.map')), button('skip', tr('btn.skip')));
    if (screen === 'lab') parts.push(button('map', tr('btn.map')));
    if (screen === 'map') parts.push(button('setup', tr('btn.setup')));
    if (screen === 'calibrate') parts.push(button('skip-button', tr('btn.skipButton')), button('map', tr('btn.cancel')));
    parts.push(button('lang', lang === 'zh' ? 'EN' : '中文'));
    bar.innerHTML = parts.join('');
    bar.append(live);
    refreshStatus();
  }

  const listeners = new AbortController();
  const signal = listeners.signal;
  bar.addEventListener('click', async (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-pad]')?.dataset.pad;
    if (!action) return;
    sound.unlock();
    if (action === 'connect') {
      const result = await input.connect();
      if (!result.ok && !/no device/i.test(result.error ?? '')) { banner = tr('pad.fail', { error: result.error ?? '' }); bannerLeft = 5; }
      refreshStatus();
    }
    if (action === 'map') { quiet(); mini = undefined; go('map'); }
    if (action === 'skip') skipLevel();
    if (action === 'setup') startCalibration();
    if (action === 'skip-button') advanceCalibration();
    if (action === 'lang') { lang = lang === 'zh' ? 'en' : 'zh'; services.storage.set('lang', lang); renderBar(); }
    canvas.focus({ preventScroll: true });
  }, { signal });

  const toWorld = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    // Turned a quarter: the scene's left-to-right runs down the screen and its top is the screen's right edge.
    const across = rotated ? (event.clientY - box.top) / box.height : (event.clientX - box.left) / box.width;
    const down = rotated ? (box.right - event.clientX) / box.width : (event.clientY - box.top) / box.height;
    return { x: across * WIDTH, y: down * canvas.height - headroom };
  };
  // Only a mouse reveals the full-screen buttons by moving: a finger would cover the top of the level with them on every tap.
  root.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') barLeft = 3; }, { signal });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault(); sound.unlock(); canvas.focus({ preventScroll: true });
    if (event.pointerType === 'mouse') barLeft = 3;
    const { x, y } = toWorld(event);
    if (fullscreen && hitsMenu(x, y)) { barLeft = barLeft > 0 && event.pointerType !== 'mouse' ? 0 : 6; return; }
    if (touch.down(event.pointerId, x, y)) { canvas.setPointerCapture?.(event.pointerId); return; }
    if (y > PLAY_HEIGHT) return;
    if (screen === 'title') go('map');
    else if (screen === 'map') { const cell = MAP_CELLS.find((item) => Math.abs(item.x - x) < 100 && Math.abs(item.y - y) < 42); if (cell) { cursor = cell; activate(cell); } }
    else if (screen === 'result') { const hit = resultButtons().find((item) => Math.abs(item.x - x) < 150 && Math.abs(RESULT_Y - y) < 44); if (hit) leaveResult(hit.action); }
    else if (screen === 'album' || (screen === 'master' && masterAge > 1.2)) go('map');
    else if (screen === 'lab') toy(x, y, Math.floor(services.random() * 12));
  }, { signal });
  canvas.addEventListener('pointermove', (event) => { const { x, y } = toWorld(event); touch.move(event.pointerId, x, y); }, { signal });
  ['pointerup', 'pointercancel'].forEach((type) => canvas.addEventListener(type, (event) => touch.up((event as PointerEvent).pointerId), { signal }));
  addEventListener('keydown', () => sound.unlock(), { signal });

  function activate(cell: MapCell) {
    const { item } = cell;
    if (item.kind === 'difficulty') { difficulty = item.difficulty; save(); sound.chime(SCALE[difficulty * 2 + 2]); say(`diff.${difficulty}`); }
    else if (item.kind === 'lab') go('lab');
    else if (item.kind === 'album') { sound.chime(SCALE[4]); go('album'); }
    else if (isOpen(progress, item.level)) begin(item.level);
    else { sound.tone(200, 0.15, 'triangle', 0.1); banner = tr('locked'); bannerLeft = 2; say('locked'); }
  }
  function moveCursor(dx: number, dy: number) {
    const options = MAP_CELLS.filter((cell) => (dy ? Math.sign(cell.row - cursor.row) === dy : cell.row === cursor.row && Math.sign(cell.column - cursor.column) === dx));
    const best = options.sort((a, b) => Math.abs(a.row - cursor.row) * 10 + Math.abs(a.column - cursor.column) - (Math.abs(b.row - cursor.row) * 10 + Math.abs(b.column - cursor.column)))[0];
    if (best) { cursor = best; sound.tone(440, 0.05, 'triangle', 0.05); }
  }

  const just = (name: ButtonName) => lastPad.justPressed[BUTTON_INDEX[name]];
  function updateMap() {
    const direction = lastPad.dirPressed;
    if (direction) moveCursor(direction === 'left' ? -1 : direction === 'right' ? 1 : 0, direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
    if (just('south')) activate(cursor);
    if (just('l1') || just('r1')) { difficulty = ((difficulty + (just('r1') ? 1 : 2)) % 3) as Difficulty; save(); sound.chime(SCALE[difficulty * 2 + 2]); say(`diff.${difficulty}`); }
  }
  function updatePlay(dt: number, frame: Frame) {
    if (!mini) return;
    const busy = Boolean(lastPad.btn || lastPad.x || lastPad.y || lastPad.rx || lastPad.ry);
    idle = busy ? 0 : idle + dt; still = busy ? 0 : still + dt;
    if (idle > 8) { idle = 0; say(`hint.${level.id}` as SpokenKey); }
    if (just('start')) { quiet(); mini = undefined; go('map'); return; }
    mini.update(dt, frame);
    if (mini.done) finishLevel();
  }
  function updateResult(dt: number) {
    resultAge += dt;
    while (starsShown < resultStars && resultAge > 0.35 + starsShown * 0.4) {
      sound.chime(SCALE[starsShown * 2 + 3], 0.16); spark(470 + starsShown * 170, 180, '✨', 8);
      starsShown++;
      if (starsShown === 3) party(46);
    }
    if (!stickersShown && newStickers.length && resultAge > resultLock() + 0.15) {
      stickersShown = true;
      services.sound.play('collect');
      [5, 7, 9].forEach((note, i) => sound.chime(SCALE[note], 0.14, i * 0.1));
      spark(WIDTH / 2, 318, '✨', 10); party(30, WIDTH / 2, 318);
    }
    if (just('south')) leaveResult('next');
    else if (just('west')) leaveResult('again');
    else if (just('east')) leaveResult('map');
  }
  function updateMaster(dt: number) {
    masterAge += dt; rain -= dt;
    if (rain <= 0) { rain = 0.5; party(14, 140 + services.random() * 1000, 40); }
    if (masterAge > 1.2 && lastPad.pressed) { confetti = []; go('map'); }
  }
  /** One toy pops out of the playground: a sticker the child has earned, once there are some. */
  function toy(x: number, y: number, seed: number) {
    const toys = [...LAB_TOYS, ...STICKERS.slice(0, stickerCount(progress))];
    sound.chime(SCALE[seed % SCALE.length], 0.14);
    spark(x, y, toys[Math.floor(services.random() * toys.length)], 6);
  }
  function updateLab() {
    if (just('start')) { go('map'); return; }
    const pads = input.read();
    pads.forEach((pad, player) => pad.justPressed.forEach((down, i) => {
      if (down) toy(180 + services.random() * 920, 80 + services.random() * 320, i + player * 3);
    }));
  }
  function updateCalibration() {
    const press = input.rawPress();
    if (!press) return;
    if (calibrateKind && press.kind !== calibrateKind) return;
    calibrateKind = press.kind;
    const target = BUTTON_INDEX[CALIBRATION[calibrateStep]], taken = calibrateMap.indexOf(target);
    if (taken >= 0 && taken !== press.index) calibrateMap[taken] = calibrateMap[press.index]; // Keep the map one-to-one.
    calibrateMap[press.index] = target;
    sound.chime(SCALE[calibrateStep]);
    advanceCalibration();
  }

  function update(dt: number) {
    time += dt;
    barLeft = Math.max(0, barLeft - dt);
    bannerLeft = Math.max(0, bannerLeft - dt);
    statusClock -= dt;
    if (services.sound.muted) quiet(); // Muting half way through a sentence stops the sentence too.
    if (statusClock <= 0) { statusClock = 0.5; refreshStatus(); }
    if (screen === 'calibrate') { lastPad = input.readMerged(); updateCalibration(); }
    else {
      lastPad = input.readMerged();
      const frame: Frame = { any: lastPad, pads: screen === 'lab' ? [] : input.read() };
      if (screen === 'title' && (lastPad.pressed || lastPad.dirPressed)) go('map');
      else if (screen === 'map') updateMap();
      else if (screen === 'ready') { readyLeft -= dt; if (readyLeft <= 0) go('play'); }
      else if (screen === 'play') updatePlay(dt, frame);
      else if (screen === 'result') updateResult(dt);
      else if (screen === 'master') updateMaster(dt);
      else if (screen === 'album' && (lastPad.pressed)) go('map');
      else if (screen === 'lab') updateLab();
    }
    sparks.forEach((item) => { item.x += item.vx * dt; item.y += item.vy * dt; item.life -= dt; });
    sparks = sparks.filter((item) => item.life > 0);
    confetti.forEach((item) => { item.vy += 620 * dt; item.x += item.vx * dt; item.y += item.vy * dt; item.spin += 9 * dt; item.life -= dt; });
    confetti = confetti.filter((item) => item.life > 0 && item.y < PLAY_HEIGHT + 20);
  }

  function write(text: string, x: number, y: number, size: number, color = '#ffffff', align: CanvasTextAlign = 'center', maxWidth?: number) {
    g.font = `800 ${size}px system-ui, "PingFang SC", sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
    g.fillText(text, x, y, maxWidth);
  }
  const hop = (phase = 0, height = 18) => (services.isReducedMotion ? 0 : Math.abs(Math.sin(time * 6 + phase)) * height);
  const icon = (value: string, x: number, y: number, size: number) => { g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(value, x, y); };
  function backdrop(top = '#26305e', bottom = '#4b3f8f') {
    const gradient = g.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
    gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
    g.fillStyle = gradient; g.fillRect(0, 0, WIDTH, PLAY_HEIGHT);
  }
  function card(x: number, y: number, active: boolean, disabled = false) {
    g.fillStyle = disabled ? '#ffffff14' : '#ffffff2b';
    g.beginPath(); g.roundRect(x - 100, y - 40, 200, 80, 20); g.fill();
    if (active) { g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.globalAlpha = 0.6 + 0.4 * Math.sin(time * 7); g.stroke(); g.globalAlpha = 1; }
  }
  function drawTitle() {
    backdrop();
    icon('🐻', 400, 150 + 8 * Math.sin(time * 3), 120); icon('🎮', 640, 150, 120); icon('🐰', 880, 150 - 8 * Math.sin(time * 3), 120);
    write(tr('title'), 640, 280, 72);
    write(tr('title.sub'), 640, 345, 30, '#d9def5');
    g.globalAlpha = 0.65 + 0.35 * Math.sin(time * 4); write(tr('title.press'), 640, 405, 34, '#ffd96b'); g.globalAlpha = 1;
    write(tr('title.keys'), 640, 455, 22, '#b9c1e0');
  }
  function drawMap() {
    backdrop('#274b7a', '#3b7f8f');
    const trophies = masteredCount(progress);
    write(`⭐ ${starCount(progress)}${trophies ? `  🏆 ${trophies}` : ''}`, 112, 44, trophies ? 25 : 30);
    for (let row = 0; row < 4; row++) write(tr(`world.${row}` as Key), 200, ROW_Y[row], 24, '#ffe9a8', 'right');
    write(tr('world.4'), COLUMN_X[3] + 116, ROW_Y[0], 24, '#ffe9a8', 'left');
    MAP_CELLS.forEach((cell) => {
      const { item, x, y } = cell, active = cell === cursor;
      if (item.kind === 'difficulty') {
        card(x, y, active);
        if (difficulty === item.difficulty) { g.fillStyle = '#ffc93c66'; g.beginPath(); g.roundRect(x - 100, y - 40, 200, 80, 20); g.fill(); }
        icon(DIFFICULTY_ICONS[item.difficulty], x - 46, y, 40); write(tr(`diff.${item.difficulty}` as Key), x + 22, y, 24);
      } else if (item.kind === 'lab') {
        card(x, y, active); icon('🎪', x - 66, y, 40); write(tr('map.lab'), x + 24, y, 22, '#ffffff', 'center', 130);
      } else if (item.kind === 'album') {
        card(x, y, active); icon('📒', x - 68, y, 44);
        write(tr('map.album'), x + 24, y - 13, 19, '#ffffff', 'center', 130);
        write(`${stickerCount(progress)} / ${STICKERS.length}`, x + 24, y + 16, 20, '#ffd96b');
      } else {
        const open = isOpen(progress, item.level), stars = levelStars(progress, item.level.id);
        card(x, y, active, !open);
        icon(open ? item.level.icon : '🔒', x - 68, y, 44);
        write(tr(`level.${item.level.id}` as Key), x + 24, y - 13, 19, open ? '#ffffff' : '#ffffff77', 'center', 130);
        write('★'.repeat(stars) + '☆'.repeat(3 - stars), x + 24, y + 16, 20, '#ffd96b');
      }
    });
    write(tr('map.help'), 640, 470, 18, '#e4ecf7');
  }
  function drawPlay() {
    if (!mini) return;
    mini.draw(g, time);
    g.fillStyle = '#10162c99';
    const hint = tr(mini.caption?.() ?? (`hint.${level.id}` as Key));
    g.font = '700 22px system-ui, "PingFang SC", sans-serif';
    const width = g.measureText(hint).width + 40;
    g.beginPath(); g.roundRect(640 - width / 2, 450, width, 36, 18); g.fill();
    write(hint, 640, 468, 22);
    g.fillStyle = '#10162c99'; g.beginPath(); g.roundRect(1110, 12, 150, 44, 22); g.fill();
    write(`${Math.min(mini.progress(), mini.goal)} / ${mini.goal}`, 1185, 34, 24);
    write(DIFFICULTY_ICONS[difficulty], 60, 40, 34);
  }
  function drawReady() {
    drawPlay();
    g.fillStyle = '#10162ccc'; g.fillRect(0, 0, WIDTH, PLAY_HEIGHT);
    icon(level.icon, 640, 120, 110);
    write(tr(`level.${level.id}` as Key), 640, 240, 56);
    write(tr(`hint.${level.id}` as Key), 640, 310, 30, '#ffe9a8');
    write(tr('ready'), 640, 390, 26, '#d9def5');
  }
  function drawResult() {
    backdrop('#3b2f7f', '#7b4fb0');
    const headline = resultWinner !== undefined && resultVersus ? tr(resultWinner === 0 ? 'result.p1' : 'result.p2') : tr(resultStars === 3 ? 'result.great' : resultStars === 2 ? 'result.good' : 'result.ok');
    write(headline, 640, 58, 54);
    if (resultBest) write(tr('result.best'), 640, 104, 24, '#ffd96b');
    icon(resultVersus && resultWinner === 1 ? '🐰' : '🐻', 200, 200 - hop(0, 26), 130);
    icon(resultVersus && resultWinner === 1 ? '🐻' : '🐰', 1080, 200 - hop(1.2, 26), 130);
    [0, 1, 2].forEach((i) => {
      const on = i < starsShown, pop = on && !services.isReducedMotion ? Math.max(0, 1 - (resultAge - 0.35 - i * 0.4) / 0.25) : 0;
      g.globalAlpha = on ? 1 : 0.22;
      icon('⭐', 470 + i * 170, 185 + (on && !services.isReducedMotion ? 6 * Math.sin(time * 4 + i) : 0), on ? 118 * (1 + pop * 0.5) : 92);
      g.globalAlpha = 1;
    });
    if (resultMisses > 0 && !resultVersus) write(tr('result.misses', { n: resultMisses }), 640, 266, 20, '#d9def5');
    if (stickersShown) {
      newStickers.forEach((sticker, i) => icon(sticker, 640 + (i - (newStickers.length - 1) / 2) * 96, 322 - hop(i, 14), 76));
      write(tr('result.sticker'), 640, 376, 24, '#ffd96b');
    } else if (starsToNextSticker(progress) > 0 || newStickers.length) {
      // Three small stars fill up towards the wrapped present: no reading needed to see that stars buy something.
      const have = newStickers.length ? STARS_PER_STICKER : STARS_PER_STICKER - starsToNextSticker(progress);
      write(tr('result.toSticker'), 560, 322, 22, '#d9def5', 'right');
      for (let i = 0; i < STARS_PER_STICKER; i++) { g.globalAlpha = i < have ? 1 : 0.25; icon('⭐', 596 + i * 44, 322, 32); g.globalAlpha = 1; }
      icon('🎁', 596 + STARS_PER_STICKER * 44 + 16, 320, 44);
    } else write(tr('album.full'), 640, 322, 22, '#ffd96b');
    const locked = resultAge < resultLock();
    resultButtons().forEach(({ x, button, icon: picture, key }) => {
      g.globalAlpha = locked ? 0.35 : 1;
      g.fillStyle = '#ffffff2b'; g.beginPath(); g.roundRect(x - 140, RESULT_Y - 34, 280, 68, 22); g.fill();
      drawChip(g, button, x - 100, RESULT_Y, 24, glyphs);
      icon(picture, x - 48, RESULT_Y, 34); write(tr(key), x + 44, RESULT_Y, 24, '#ffffff', 'center', 150);
      g.globalAlpha = 1;
    });
  }
  function drawMaster() {
    backdrop('#f08a3c', '#e2557f');
    icon('🏆', 640, 138 - hop(0, 22), 170); icon(DIFFICULTY_ICONS[masterTier], 760, 200, 72);
    icon('🐻', 300, 210 - hop(0.8, 30), 130); icon('🐰', 980, 210 - hop(2, 30), 130);
    write(tr('master.title'), 640, 292, 62);
    write(tr('master.sub', { name: tr(`diff.${masterTier}` as Key) }), 640, 352, 28, '#fff3c4');
    if (masterAge > 1.2) { g.globalAlpha = 0.65 + 0.35 * Math.sin(time * 4); write(tr('master.go'), 640, 430, 26); g.globalAlpha = 1; }
  }
  function drawAlbum() {
    backdrop('#2f3f8f', '#5a4fb0');
    const have = stickerCount(progress), missing = starsToNextSticker(progress);
    write(`📒 ${tr('album.title')}   ${have} / ${STICKERS.length}`, 640, 42, 38);
    write(missing ? tr('album.next', { n: missing }) : tr('album.full'), 640, 88, 22, '#ffe9a8');
    STICKERS.forEach((sticker, i) => {
      const x = 220 + (i % 8) * 120, y = 160 + Math.floor(i / 8) * 96;
      g.fillStyle = i < have ? '#ffffff2b' : '#ffffff14'; g.beginPath(); g.arc(x, y, 42, 0, Math.PI * 2); g.fill();
      if (i < have) icon(sticker, x, y + 2 - (i === have - 1 ? hop(0, 8) : 0), 58); else write('?', x, y + 2, 34, '#ffffff55');
    });
    DIFFICULTIES.forEach((d) => {
      g.globalAlpha = isMastered(progress, d) ? 1 : 0.25;
      icon('🏆', 300 + d * 110, 446, 44); icon(DIFFICULTY_ICONS[d], 334 + d * 110, 456, 26);
      g.globalAlpha = 1;
    });
    write(tr('album.back'), 900, 448, 20, '#d9def5');
  }
  function drawLab() {
    backdrop('#ffb46b', '#ff7fa8');
    write(tr('lab.title'), 640, 60, 46);
    write(tr('lab.hint'), 640, 450, 24);
    icon('🐻', 420 + lastPad.x * 200, 250 + lastPad.y * 140, 110);
    icon('🐰', 860 + lastPad.rx * 200, 250 + lastPad.ry * 140, 110);
  }
  function drawCalibration() {
    backdrop('#203a5e', '#31577f');
    write(tr('calib.title'), 640, 90, 46);
    write(tr('calib.press', { name: tr(`name.${CALIBRATION[calibrateStep]}`) }), 640, 220, 48, '#ffd96b');
    write(`${calibrateStep + 1} / ${CALIBRATION.length}`, 640, 300, 28);
    if (!calibrateKind) write(tr('calib.nopad'), 640, 380, 22, '#d9def5');
  }
  /** While a level is being introduced nothing has appeared yet, so the first thing it will ask for glows. */
  const readyButton = (): ButtonName => level.buttons?.[0] ?? 'south';
  function highlights(): Highlight[] {
    if (screen === 'calibrate') return [CALIBRATION[calibrateStep]];
    if (screen === 'ready') { const lit = mini?.highlights() ?? []; return lit.length || level.kind === 'simon' ? lit : [readyButton()]; }
    if (screen === 'play') return mini?.highlights() ?? [];
    if (screen === 'title') return ['south', 'east', 'west', 'north'];
    if (screen === 'map') return ['dpad', 'south'];
    if (screen === 'result') return resultAge < resultLock() ? [] : resultButtons().map((item) => item.button);
    if (screen === 'lab') return ['start'];
    if (screen === 'album' || screen === 'master') return ['south'];
    return [];
  }
  /** The level's own bot knows the next right move, so the helping hand simply shows it. It only ever points at something that glows. */
  function demo(): Demo | undefined {
    if (screen === 'title') return { press: ['south'] };
    if (!mini || (screen !== 'ready' && screen !== 'play')) return undefined;
    if (screen === 'play' && still < DEMO_AFTER[difficulty]) return undefined;
    const move = mini.bot(), press = [...(move.hold ?? []), ...(move.press ? [move.press] : [])];
    if (screen === 'ready' && !press.length && !move.x && !move.y && !move.rx && !move.ry) return { press: [readyButton()] };
    return { press, hold: Boolean(move.hold?.length), x: move.x, y: move.y, rx: move.rx, ry: move.ry };
  }
  function render() {
    fitScreen();
    g.setTransform(1, 0, 0, 1, 0, headroom);
    g.fillStyle = '#1a2036'; g.fillRect(0, 0, WIDTH, HEIGHT);
    ({ title: drawTitle, map: drawMap, ready: drawReady, play: drawPlay, result: drawResult, lab: drawLab, calibrate: drawCalibration, album: drawAlbum, master: drawMaster })[screen]();
    confetti.forEach((item) => {
      if (item.y < 8) return; // The top row is what full screen stretches upward.
      g.save(); g.translate(item.x, item.y); g.rotate(item.spin); g.globalAlpha = Math.min(1, item.life * 2);
      g.fillStyle = item.color; g.fillRect(-7, -4, 14, 8); g.restore();
    });
    g.globalAlpha = 1;
    sparks.forEach((item) => { g.globalAlpha = Math.min(1, item.life * 2); icon(item.icon, item.x, item.y, 44); g.globalAlpha = 1; });
    if (bannerLeft > 0) {
      g.fillStyle = '#10162ce6'; g.fillRect(0, 196, WIDTH, 84);
      write(banner, 640, 238, 32);
    }
    g.fillStyle = '#1a2036'; g.fillRect(0, PLAY_HEIGHT, WIDTH, HEIGHT - PLAY_HEIGHT); // Confetti falls behind the pad, not over it.
    drawPad(g, lastPad, highlights(), time, glyphs, { demo: demo(), menu: fullscreen });
    if (headroom) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, 0, headroom, WIDTH, 1, 0, 0, WIDTH, headroom); } // The sky simply continues upward.
  }

  renderBar();
  void input.reconnect();
  const stop = startLoop((dt) => { if (paused) return; update(dt); render(); });
  render();

  return {
    pause() { paused = true; touch.clear(); quiet(); },
    // Keys pressed on the pause screen (Space on its Resume button, say) must not count as a press in the level.
    resume() { paused = false; input.read(); lastPad = input.readMerged(); canvas.focus({ preventScroll: true }); },
    restart() { paused = false; if (screen === 'play' || screen === 'ready' || screen === 'result') begin(level); else go('map'); },
    destroy() { stop(); quiet(); listeners.abort(); input.destroy(); sound.destroy(); host.replaceChildren(); }
  };
}

export const game: GameModule = {
  meta: {
    slug: 'pad-pals', title: 'Pad Pals', category: 'arcade',
    description: 'Thirteen playful levels that teach a child every button, stick and trigger on a real game controller.',
    instructions: 'Plug in a controller and press any button; a Twin USB 2-in-1 receiver needs the Connect button in Chrome or Edge. The glowing part of the on-screen pad and a helping hand show what to press. Keyboard: WASD or arrows move, TFGH right stick, I J K L buttons, Q E shoulders, Z C triggers. You can also tap the on-screen pad; on a phone, play in full screen and hold it sideways. Nobody loses: mistakes only cost stars, and every three stars earn a sticker. Three difficulties, plus a two-player Tug of War (second player: a second controller, or the arrow keys).',
    accent: ACCENT, mechanic: 'Learn every button, level by level'
  },
  mount
};
export default game;
