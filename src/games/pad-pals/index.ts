import type { GameModule, GameServices } from '../../core/game-types';
import { BUTTON_INDEX, createInput, createSound, startLoop, type ButtonName, type PadState } from '../_shared/gamepad-kit';
import { defaultLang, isLang, t, type Key, type Lang, type SpokenKey } from './i18n';
import { ALL_LEVELS, bestStars, DIFFICULTIES, DIFFICULTY_ICONS, emptyProgress, isOpen, isProgress, levelStars, LEVELS, maxScore, PARTY_LEVEL, recordResult, starsFor, totalScore, type Difficulty, type Level, type Progress } from './levels';
import { createMini, type Frame, type Mini, type MiniEnv } from './minis';
import { createVoice } from './voice';
import { createTouchPad, drawPad, HEIGHT, PLAY_HEIGHT, WIDTH, type GlyphSet, type Highlight } from './pad-view';

const ACCENT = '#ffb547';
const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
const CALIBRATION: readonly ButtonName[] = ['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start'];
const MAX_HEIGHT = 960; // 4:3. Anything taller would shrink the pad too much to use.
const ROW_Y = [130, 222, 314, 406], COLUMN_X = [310, 520, 730, 940];

type Screen = 'title' | 'map' | 'ready' | 'play' | 'result' | 'lab' | 'calibrate';
type MapItem = { kind: 'difficulty'; difficulty: Difficulty } | { kind: 'lab' } | { kind: 'level'; level: Level };
type MapCell = { item: MapItem; row: number; column: number; x: number; y: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; icon: string };

const MAP_CELLS: MapCell[] = [
  ...DIFFICULTIES.map((difficulty, column) => ({ item: { kind: 'difficulty', difficulty } as MapItem, row: 0, column, x: COLUMN_X[column], y: 44 })),
  { item: { kind: 'lab' }, row: 0, column: 3, x: COLUMN_X[3], y: 44 },
  ...LEVELS.map((level) => {
    const column = LEVELS.filter((other) => other.world === level.world).indexOf(level);
    return { item: { kind: 'level', level } as MapItem, row: level.world + 1, column, x: COLUMN_X[column], y: ROW_Y[level.world] };
  }),
  { item: { kind: 'level', level: PARTY_LEVEL }, row: 1, column: 3, x: COLUMN_X[3], y: ROW_Y[0] }
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
  let headroom = 0, fullscreen = false, barLeft = 0;
  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive'));
    const nextHeight = full ? Math.round(Math.min(MAX_HEIGHT, Math.max(HEIGHT, WIDTH * innerHeight / Math.max(1, innerWidth)))) : HEIGHT;
    if (full !== fullscreen) {
      fullscreen = full;
      root.style.cssText = full ? `${rootStyle};position:fixed;inset:0;max-width:none;align-items:center;justify-content:center;background:#1a2036` : rootStyle;
      bar.style.cssText = full ? `${barStyle};position:absolute;top:8px;left:0;right:0;z-index:2;transition:opacity .2s` : barStyle;
    }
    if (full) {
      canvas.style.cssText = `${canvasStyle};width:min(100vw,calc(100dvh*${WIDTH}/${nextHeight}));aspect-ratio:${WIDTH}/${nextHeight};border:0;border-radius:0`;
      bar.style.opacity = barLeft > 0 ? '1' : '0';
      bar.style.pointerEvents = barLeft > 0 ? 'auto' : 'none';
    } else if (canvas.height !== HEIGHT) canvas.style.cssText = canvasStyle;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    headroom = nextHeight - HEIGHT;
  }

  const touch = createTouchPad();
  const sound = createSound(() => services.sound.muted);
  const input = createInput({ virtual: (player) => (player === 0 ? touch.read() : undefined), onChange: handlePadEvent });
  Object.entries(storedMaps).forEach(([kind, map]) => input.setButtonMap(kind, map));

  let screen: Screen = 'title', paused = false, time = 0, readyLeft = 0, banner = '', bannerLeft = 0, idle = 0;
  let cursor = MAP_CELLS.find((cell) => cell.item.kind === 'level')!;
  let level: Level = LEVELS[0], mini: Mini | undefined, resultStars = 0, resultWinner: number | undefined;
  let glyphs: GlyphSet = 'keys', players = 1, statusLine = '', statusClock = 0;
  let sparks: Spark[] = [];
  let calibrateStep = 0, calibrateMap: number[] = [], calibrateKind = '';
  let lastPad: PadState = { x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [], justPressed: [], dirPressed: null, btn: false, pressed: false };

  const voice = createVoice();
  const say = (key: SpokenKey) => { if (!services.sound.muted) voice.say(lang, key); };
  const quiet = voice.stop;
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
  function go(next: Screen) { screen = next; idle = 0; renderBar(); }
  function begin(next: Level) {
    level = next; mini = createMini(next, env()); readyLeft = services.isReducedMotion ? 0.8 : 1.6;
    go('ready');
    say(`hint.${next.id}` as SpokenKey);
  }
  function finishLevel() {
    if (!mini) return;
    resultStars = starsFor(mini.misses, mini.goal); resultWinner = mini.winner;
    progress = recordResult(progress, level, difficulty, resultStars);
    save();
    services.sound.play('success');
    [0, 1, 2].forEach((i) => sound.chime(SCALE[i * 2 + 3], 0.14, i * 0.14));
    say(resultWinner !== undefined && players > 1 ? (resultWinner === 0 ? 'result.p1' : 'result.p2') : resultStars === 3 ? 'result.great' : resultStars === 2 ? 'result.good' : 'result.ok');
    go('result');
  }
  function nextLevel() {
    const index = LEVELS.indexOf(level);
    if (index >= 0 && index + 1 < LEVELS.length) begin(LEVELS[index + 1]); else go('map');
  }
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
    return { x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * canvas.height / box.height - headroom };
  };
  root.addEventListener('pointermove', () => { barLeft = 3; }, { signal });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault(); sound.unlock(); barLeft = 3; canvas.focus({ preventScroll: true });
    const { x, y } = toWorld(event);
    if (touch.down(event.pointerId, x, y)) { canvas.setPointerCapture?.(event.pointerId); return; }
    if (screen === 'title') go('map');
    else if (screen === 'map') { const cell = MAP_CELLS.find((item) => Math.abs(item.x - x) < 100 && Math.abs(item.y - y) < 42); if (cell) { cursor = cell; activate(cell); } }
  }, { signal });
  canvas.addEventListener('pointermove', (event) => { const { x, y } = toWorld(event); touch.move(event.pointerId, x, y); }, { signal });
  ['pointerup', 'pointercancel'].forEach((type) => canvas.addEventListener(type, (event) => touch.up((event as PointerEvent).pointerId), { signal }));
  addEventListener('keydown', () => sound.unlock(), { signal });

  function activate(cell: MapCell) {
    const { item } = cell;
    if (item.kind === 'difficulty') { difficulty = item.difficulty; save(); sound.chime(SCALE[difficulty * 2 + 2]); say(`diff.${difficulty}`); }
    else if (item.kind === 'lab') go('lab');
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
    idle = lastPad.btn || lastPad.x || lastPad.y || lastPad.rx || lastPad.ry ? 0 : idle + dt;
    if (idle > 8) { idle = 0; say(`hint.${level.id}` as SpokenKey); }
    if (just('start')) { quiet(); mini = undefined; go('map'); return; }
    mini.update(dt, frame);
    if (mini.done) finishLevel();
  }
  function updateResult() {
    if (just('south')) nextLevel();
    if (just('west')) begin(level);
    if (just('east')) go('map');
  }
  function updateLab() {
    if (just('start')) { go('map'); return; }
    const pads = input.read();
    pads.forEach((pad, player) => pad.justPressed.forEach((down, i) => {
      if (!down) return;
      sound.chime(SCALE[(i + player * 3) % SCALE.length], 0.14);
      spark(180 + services.random() * 920, 80 + services.random() * 320, ['🎉', '⭐', '🌈', '🎈', '🍭', '🦄'][i % 6], 6);
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
    if (statusClock <= 0) { statusClock = 0.5; refreshStatus(); }
    if (screen === 'calibrate') { lastPad = input.readMerged(); updateCalibration(); }
    else {
      lastPad = input.readMerged();
      const frame: Frame = { any: lastPad, pads: screen === 'lab' ? [] : input.read() };
      if (screen === 'title' && (lastPad.pressed || lastPad.dirPressed)) go('map');
      else if (screen === 'map') updateMap();
      else if (screen === 'ready') { readyLeft -= dt; if (readyLeft <= 0) go('play'); }
      else if (screen === 'play') updatePlay(dt, frame);
      else if (screen === 'result') updateResult();
      else if (screen === 'lab') updateLab();
    }
    sparks.forEach((item) => { item.x += item.vx * dt; item.y += item.vy * dt; item.life -= dt; });
    sparks = sparks.filter((item) => item.life > 0);
  }

  function write(text: string, x: number, y: number, size: number, color = '#ffffff', align: CanvasTextAlign = 'center') {
    g.font = `800 ${size}px system-ui, "PingFang SC", sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
    g.fillText(text, x, y);
  }
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
    const earned = ALL_LEVELS.reduce((sum, item) => sum + DIFFICULTIES.reduce<number>((inner, d) => inner + bestStars(progress, item.id, d), 0), 0);
    write(`⭐ ${earned}`, 120, 44, 30);
    for (let row = 0; row < 4; row++) write(tr(`world.${row}` as Key), 200, ROW_Y[row], 24, '#ffe9a8', 'right');
    write(tr('world.4'), COLUMN_X[3] + 116, ROW_Y[0], 24, '#ffe9a8', 'left');
    MAP_CELLS.forEach((cell) => {
      const { item, x, y } = cell, active = cell === cursor;
      if (item.kind === 'difficulty') {
        card(x, y, active);
        if (difficulty === item.difficulty) { g.fillStyle = '#ffc93c66'; g.beginPath(); g.roundRect(x - 100, y - 40, 200, 80, 20); g.fill(); }
        icon(DIFFICULTY_ICONS[item.difficulty], x - 46, y, 40); write(tr(`diff.${item.difficulty}` as Key), x + 22, y, 24);
      } else if (item.kind === 'lab') {
        card(x, y, active); icon('🎪', x - 66, y, 40); write(tr('map.lab'), x + 24, y, 22);
      } else {
        const open = isOpen(progress, item.level), stars = levelStars(progress, item.level.id);
        card(x, y, active, !open);
        icon(open ? item.level.icon : '🔒', x - 68, y, 44);
        write(tr(`level.${item.level.id}` as Key), x + 24, y - 13, 19, open ? '#ffffff' : '#ffffff77');
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
    const headline = resultWinner !== undefined && players > 1 ? tr(resultWinner === 0 ? 'result.p1' : 'result.p2') : tr(resultStars === 3 ? 'result.great' : resultStars === 2 ? 'result.good' : 'result.ok');
    write(headline, 640, 90, 60);
    [0, 1, 2].forEach((i) => { const on = i < resultStars; g.globalAlpha = on ? 1 : 0.25; icon('⭐', 460 + i * 180, 230 + (on ? 8 * Math.sin(time * 4 + i) : 0), on ? 130 : 96); g.globalAlpha = 1; });
    write(tr('result.misses', { n: mini?.misses ?? 0 }), 640, 335, 24, '#d9def5');
    write(tr('result.next'), 300, 420, 26, '#7ff0ad');
    write(tr('result.again'), 640, 420, 26, '#8fc2ff');
    write(tr('result.map'), 980, 420, 26, '#ff9aa5');
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
  }
  function highlights(): Highlight[] {
    if (screen === 'calibrate') return [CALIBRATION[calibrateStep]];
    if (screen === 'play' || screen === 'ready') return mini?.highlights() ?? [];
    if (screen === 'title') return ['south', 'east', 'west', 'north'];
    if (screen === 'map') return ['dpad', 'south'];
    if (screen === 'result') return ['south', 'west', 'east'];
    if (screen === 'lab') return ['start'];
    return [];
  }
  function render() {
    fitScreen();
    g.setTransform(1, 0, 0, 1, 0, headroom);
    g.fillStyle = '#1a2036'; g.fillRect(0, 0, WIDTH, HEIGHT);
    ({ title: drawTitle, map: drawMap, ready: drawReady, play: drawPlay, result: drawResult, lab: drawLab, calibrate: drawCalibration })[screen]();
    sparks.forEach((item) => { g.globalAlpha = Math.min(1, item.life * 2); icon(item.icon, item.x, item.y, 44); g.globalAlpha = 1; });
    if (bannerLeft > 0) {
      g.fillStyle = '#10162ce6'; g.fillRect(0, 196, WIDTH, 84);
      write(banner, 640, 238, 32);
    }
    drawPad(g, lastPad, highlights(), time, glyphs);
    if (headroom) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, 0, headroom, WIDTH, 1, 0, 0, WIDTH, headroom); } // The sky simply continues upward.
  }

  renderBar();
  void input.reconnect();
  const stop = startLoop((dt) => { if (paused) return; update(dt); render(); });
  render();

  return {
    pause() { paused = true; touch.clear(); quiet(); },
    resume() { paused = false; canvas.focus({ preventScroll: true }); },
    restart() { paused = false; if (screen === 'play' || screen === 'ready' || screen === 'result') begin(level); else go('map'); },
    destroy() { stop(); quiet(); listeners.abort(); input.destroy(); sound.destroy(); host.replaceChildren(); }
  };
}

export const game: GameModule = {
  meta: {
    slug: 'pad-pals', title: 'Pad Pals', category: 'arcade',
    description: 'Thirteen playful levels that teach a child every button, stick and trigger on a real game controller.',
    instructions: 'Plug in a controller and press any button; a Twin USB 2-in-1 receiver needs the Connect button in Chrome or Edge. The glowing part of the on-screen pad shows what to press. Keyboard: WASD or arrows move, TFGH right stick, I J K L buttons, Q E shoulders, Z C triggers. You can also tap the on-screen pad. Nobody loses: mistakes only cost stars. Three difficulties, plus a two-player Tug of War.',
    accent: ACCENT, mechanic: 'Learn every button, level by level'
  },
  mount
};
export default game;
