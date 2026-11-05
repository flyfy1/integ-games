import type { GameModule, GameServices } from '../../core/game-types';
import { createMobileControls } from '../_shared/mobile-controls';
import { createInput, startLoop, type KeyboardMap, type PadState, type VirtualPad } from '../_shared/gamepad-kit';
import { ARENAS, arenaById } from './arenas';
import { createTankAudio } from './audio';
import { botIntent, ENEMY_SKILL, SKILLS } from './bot';
import { createRenderer, HEIGHT, menuRowBox, SEAT_COLORS, START_BOX, WIDTH, type MenuRow, type Overlay, type Touch } from './render';
import { arenaForRound, createMatch, createWorld, idle, makeTank, pickTwist, recordRound, spawnPoint, spawnWave, step, STEP, TWISTS, WAVES, waveScore, type Intent, type Match, type Mode, type Tank, type Twist, type World } from './sim';

const ACCENT = '#ffd34d';
const VERSUS_HP = 5, COOP_HP = 5, FIRE = 0, DASH = 1, HONK = 2, L1 = 4, R1 = 5, L2 = 6, R2 = 7, SELECT = 8, START = 9;
const KEYS: KeyboardMap[] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', buttons: [['KeyF', 'Space'], 'KeyG', 'KeyR', [], [], [], [], [], 'KeyT', 'KeyP'] },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', buttons: [['KeyK', 'Enter'], 'KeyL', 'Semicolon', [], [], [], [], [], 'Quote', 'KeyO'] }
];
const zh = () => /^zh\b/i.test(navigator.language || '');

type Screen = 'menu' | 'card' | 'count' | 'fight' | 'ko' | 'result' | 'over';
type Settings = { mode: Mode; players: 1 | 2; skill: number; arena: string; target: number };
const DEFAULTS: Settings = { mode: 'versus', players: 2, skill: 1, arena: 'shuffle', target: 3 };

function validSettings(raw: Partial<Settings> | null): Settings {
  const merged = { ...DEFAULTS, ...raw };
  return {
    mode: merged.mode === 'coop' ? 'coop' : 'versus', players: merged.players === 1 ? 1 : 2,
    skill: SKILLS[merged.skill] ? merged.skill : 1,
    arena: merged.arena === 'shuffle' || ARENAS.some((arena) => arena.id === merged.arena) ? merged.arena : 'shuffle',
    target: [3, 5, 7].includes(merged.target) ? merged.target : 3
  };
}

function mount(host: HTMLElement, services: GameServices) {
  const lang = zh() ? 1 : 0;
  const tr = (en: string, cn: string) => (lang ? cn : en);
  let settings = validSettings(services.storage.get<Partial<Settings> | null>('settings', null));

  const root = document.createElement('div');
  root.dataset.tankBrawl = '';
  const rootStyle = 'width:100%;max-width:1120px;margin:0 auto;color:#F7F9FF;font-family:system-ui,sans-serif';
  root.style.cssText = rootStyle;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT; canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', tr('Tank Brawl. WASD and F for player one, arrows and K for player two.', '坦克大乱斗。玩家一用 WASD 和 F，玩家二用方向键和 K。'));
  const canvasStyle = `display:block;width:min(100%,calc((100dvh - 96px)*16/9));aspect-ratio:16/9;margin:0 auto;border-radius:16px;background:#10162a;border:1px solid ${ACCENT}55;touch-action:none;outline:none`;
  canvas.style.cssText = canvasStyle;
  root.append(canvas); host.replaceChildren(root); canvas.focus({ preventScroll: true });

  const context = canvas.getContext('2d');
  const renderer = context ? createRenderer(context, services.isReducedMotion) : null;
  const audio = createTankAudio(() => services.sound.muted);
  const listeners = new AbortController();
  const signal = listeners.signal;

  const shellControls = createMobileControls(root, { shape: 'single-action', labels: [], pause: true, onChange: () => undefined });

  const fingers = new Map<number, { seat: number; kind: 'stick' | 'fire' | 'dash'; x: number; y: number; dx: number; dy: number }>();
  let touched = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const seatButtons = (seat: number) => {
    if (settings.players === 1) return { fire: { x: 1185, y: 625 }, dash: { x: 1060, y: 655 } };
    return seat === 0 ? { fire: { x: 330, y: 650 }, dash: { x: 210, y: 665 } } : { fire: { x: WIDTH - 330, y: 650 }, dash: { x: WIDTH - 210, y: 665 } };
  };
  const virtual = (player: number): VirtualPad | undefined => {
    let x = 0, y = 0, fire = false, dash = false;
    for (const finger of fingers.values()) {
      if (finger.seat !== player) continue;
      if (finger.kind === 'stick') { x = finger.dx; y = finger.dy; } else if (finger.kind === 'fire') fire = true; else dash = true;
    }
    return { x, y, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [fire, dash] };
  };
  const input = createInput({ keyboard: KEYS, virtual, exclusiveKeyboard: true });

  let screen: Screen = 'menu', timer = 0, paused = false, userPaused = false, accumulator = 0, hitStop = 0, cursor = 5, rollNext = 0;
  let match: Match | null = null, world: World = demoWorld(), rolledTwist: Twist = TWISTS[0], heroes: Tank[] = [], lastCount = 0, overHold = 0;
  let overlayResult: Overlay = { kind: 'none' };
  renderer?.setWorld(world);

  function demoWorld() {
    const arena = ARENAS[Math.floor(services.random() * ARENAS.length)];
    const next = createWorld(arena, TWISTS[0], services.random);
    for (const seat of [0, 1]) { const [x, y] = spawnPoint(arena, seat); makeTank(next, seat, seat, x, y, VERSUS_HP); }
    return next;
  }

  const saveSettings = () => services.storage.set('settings', settings);
  const arenaChoices = ['shuffle', ...ARENAS.map((arena) => arena.id)];
  function menuRows(): MenuRow[] {
    const solo = settings.players === 1, versus = settings.mode === 'versus';
    return [
      { label: tr('Mode', '模式'), value: versus ? tr('⚔️ Versus', '⚔️ 对战') : tr('🤝 Co-op Waves', '🤝 合作闯关'), enabled: true },
      { label: tr('Players', '玩家'), value: solo ? tr('1 Player', '单人') : tr('2 Players', '双人'), enabled: true },
      { label: tr('Bot', '电脑'), value: [tr('Easy', '简单'), tr('Normal', '普通'), tr('Hard', '困难')][settings.skill], enabled: solo && versus },
      { label: tr('Arena', '场地'), value: settings.arena === 'shuffle' ? tr('🎲 Shuffle', '🎲 随机轮换') : arenaById(settings.arena).name[lang], enabled: true },
      { label: tr('First to', '先赢'), value: tr(`${settings.target} rounds`, `${settings.target} 局`), enabled: versus }
    ];
  }
  function changeRow(row: number, direction: number) {
    const cycle = <T,>(items: readonly T[], value: T) => items[(items.indexOf(value) + direction + items.length) % items.length];
    if (row === 0) settings.mode = settings.mode === 'versus' ? 'coop' : 'versus';
    else if (row === 1) settings.players = settings.players === 1 ? 2 : 1;
    else if (row === 2) settings.skill = cycle([0, 1, 2], settings.skill);
    else if (row === 3) settings.arena = cycle(arenaChoices, settings.arena);
    else settings.target = cycle([3, 5, 7], settings.target);
    audio.move(); saveSettings();
  }
  function moveCursor(direction: number) {
    const rows = menuRows();
    do { cursor = (cursor + direction + rows.length + 1) % (rows.length + 1); } while (cursor < rows.length && !rows[cursor].enabled);
    audio.move();
  }

  function startMatch() {
    const arenas = settings.arena === 'shuffle' ? ARENAS : [arenaById(settings.arena)];
    match = createMatch(settings.mode, settings.target, arenas, services.random);
    services.reportScore(0);
    audio.pick();
    startRound();
  }

  function startRound() {
    if (!match) return;
    const coop = match.mode === 'coop', arena = arenaForRound(match);
    rolledTwist = pickTwist(match, services.random);
    match.twists.push(rolledTwist);
    world = createWorld(arena, rolledTwist, services.random, !coop);
    heroes = [];
    const seats = coop && settings.players === 1 ? [0] : [0, 1];
    for (const seat of seats) {
      const [x, y] = spawnPoint(arena, seat);
      const hp = coop ? COOP_HP : VERSUS_HP;
      const tank = makeTank(world, coop ? 0 : seat, seat, x, y, hp);
      if (coop && match.hp[seat] > 0) tank.hp = match.hp[seat];
      heroes.push(tank);
    }
    if (coop) spawnWave(world, match.wave);
    renderer?.setWorld(world);
    fingers.clear();
    screen = 'card'; timer = 0; rollNext = 0;
  }

  const overPrompt = (again: string) => (touched ? tr(`Tap left: ${again}  ·  Tap right: menu`, `点左边：${again} · 点右边：回菜单`) : tr(`Fire: ${again}  ·  Dash: menu`, `开火：${again} · 冲刺：回菜单`));
  const seatName = (seat: number) => (settings.players === 1 && seat === 1 ? tr('BOT', '电脑') : `P${seat + 1}`);

  function finishRound() {
    if (!match) return;
    timer = 0;
    if (match.mode === 'coop') return finishWave();
    const winner = world.winner, champion = recordRound(match, winner);
    services.reportScore(match.wins[0] * 100);
    const score = `P1  ${match.wins[0]} : ${match.wins[1]}  ${seatName(1)}`;
    if (champion >= 0) {
      const humanLost = settings.players === 1 && champion === 1;
      humanLost ? audio.sad() : audio.fanfare();
      services.reportComplete(1);
      overlayResult = { kind: 'result', title: tr(`${seatName(champion)} WINS!`, `${seatName(champion)} 胜利！`), color: SEAT_COLORS[champion], lines: [score, tr(`Hats of shame: ${match.hats[champion ? 0 : 1]} 🎩`, `败者帽子：${match.hats[champion ? 0 : 1]} 顶 🎩`)], prompt: overPrompt(tr('rematch', '再来一局')), party: !humanLost };
      screen = 'over'; overHold = 0.9;
      return;
    }
    audio.tick();
    const loser = winner === 0 ? 1 : 0;
    overlayResult = { kind: 'result', title: winner < 0 ? tr('DRAW!', '平局！') : tr(`${seatName(winner)} TAKES IT`, `${seatName(winner)} 拿下这局`), color: winner < 0 ? '#fff' : SEAT_COLORS[winner], lines: winner < 0 ? [score] : [score, tr(`${seatName(loser)} must wear another hat 🎩`, `${seatName(loser)} 再戴一顶帽子 🎩`)], party: false };
    screen = 'result';
  }

  function finishWave() {
    if (!match) return;
    const cleared = world.winner === 0;
    if (cleared) {
      heroes.forEach((tank) => { match!.hp[tank.seat] = Math.min(COOP_HP, Math.max(tank.downed ? 2 : tank.hp, 1) + 1); });
      match.wave++; match.round++;
    }
    const score = waveScore(match);
    services.reportScore(score);
    if (!cleared || match.wave > WAVES) {
      const won = cleared;
      won ? audio.fanfare() : audio.sad();
      services.reportComplete(won ? 1 : (match.wave - 1) / WAVES);
      overlayResult = { kind: 'result', title: won ? tr('ALL WAVES CLEARED!', '全部通关！') : tr('TANKS DOWN', '全军覆没'), color: won ? '#ffd34d' : '#ff7d8b', lines: [tr(`Reached wave ${Math.min(match.wave, WAVES)} of ${WAVES}`, `到达第 ${Math.min(match.wave, WAVES)} / ${WAVES} 波`), tr(`Score ${score}`, `得分 ${score}`)], prompt: overPrompt(tr('try again', '再试一次')), party: won };
      screen = 'over'; overHold = 0.9;
      return;
    }
    audio.tick();
    overlayResult = { kind: 'result', title: tr(`WAVE ${match.wave - 1} CLEAR!`, `第 ${match.wave - 1} 波完成！`), color: '#70f0c2', lines: [tr(`Score ${score}  ·  +1 ❤️`, `得分 ${score} · +1 ❤️`)], party: false };
    screen = 'result';
  }

  function backToMenu() {
    match = null; world = demoWorld(); heroes = []; renderer?.setWorld(world);
    screen = 'menu'; fingers.clear(); userPaused = false;
  }

  function padIntent(pad: PadState): Intent {
    const down = pad.buttons;
    return { x: pad.x, y: pad.y, ax: pad.rx, ay: pad.ry, fire: down[FIRE] || down[R1] || down[R2], dash: down[DASH] || down[L1] || down[L2], honk: down[HONK] || down[3] };
  }

  function stepWorld(pads: PadState[] | null, merged: PadState) {
    const intents = new Map<number, Intent>();
    for (const tank of world.tanks) {
      if (!tank.alive) continue;
      if (screen === 'menu') intents.set(tank.id, botIntent(world, tank, SKILLS[1]));
      else if (tank.enemy) intents.set(tank.id, botIntent(world, tank, ENEMY_SKILL));
      else if (settings.players === 1) intents.set(tank.id, tank.seat === 0 ? padIntent(merged) : botIntent(world, tank, SKILLS[settings.skill]));
      else intents.set(tank.id, pads ? padIntent(pads[tank.seat]) : idle());
    }
    step(world, intents);
    if (screen === 'menu') { world.events.length = 0; return; }
    for (const event of world.events) {
      audio.event(event);
      if (event.type === 'ko' && match?.mode === 'coop' && !heroes.some((tank) => tank.id === event.tank)) match.kills++;
      if (event.type === 'hit' && !services.isReducedMotion) hitStop = Math.max(hitStop, 0.05);
      if (event.type === 'ko' && !services.isReducedMotion) hitStop = 0.14;
    }
    renderer?.consume(world.events);
    world.events.length = 0;
  }

  function update(dt: number, pads: PadState[] | null, merged: PadState) {
    timer += dt;
    if (screen === 'menu') {
      accumulator += dt;
      while (accumulator >= STEP) { accumulator -= STEP; stepWorld(null, merged); }
      if (world.finished && timer > 1) { timer = 0; const next = demoWorld(); world = next; renderer?.setWorld(next); } else if (!world.finished) timer = 0;
      return;
    }
    if (screen === 'card') {
      const rolling = match?.mode === 'versus' && match.round > 0;
      const length = rolling ? 2.6 : 1.8;
      if (rolling && timer < 1.1 && timer >= rollNext) { rollNext = timer + 0.09; audio.roll(); }
      if (timer >= length) { screen = 'count'; timer = 0; lastCount = 0; }
      return;
    }
    if (screen === 'count') {
      const beat = Math.floor(timer / 0.55) + 1;
      if (beat !== lastCount) { lastCount = beat; if (beat <= 3) audio.tick(); }
      if (timer >= 1.65) { screen = 'fight'; timer = 0; accumulator = 0; audio.go(); }
      return;
    }
    if (screen === 'fight' || screen === 'ko') {
      const slow = screen === 'ko' && timer < 1 && !services.isReducedMotion ? 0.28 : 1;
      if (hitStop > 0) { hitStop -= dt; return; }
      accumulator += dt * slow;
      while (accumulator >= STEP) { accumulator -= STEP; stepWorld(pads, merged); }
      if (screen === 'fight' && world.finished) { screen = 'ko'; timer = 0; } else if (screen === 'ko' && timer >= 1.7) finishRound();
      return;
    }
    if (screen === 'result') {
      if (timer >= 2.2) { startRound(); }
      return;
    }
    overHold -= dt;
  }

  function handleMenu(merged: PadState) {
    const direction = merged.dirPressed;
    if (direction === 'up') moveCursor(-1); else if (direction === 'down') moveCursor(1);
    else if ((direction === 'left' || direction === 'right') && cursor < 5) changeRow(cursor, direction === 'left' ? -1 : 1);
    if (merged.justPressed[FIRE] || merged.justPressed[START]) {
      if (cursor === 5) startMatch(); else changeRow(cursor, 1);
    }
  }

  function overlay(): Overlay {
    if (userPaused) return { kind: 'paused', title: tr('PAUSED', '已暂停'), hint: tr('Start: resume  ·  Select: quit to menu', 'Start：继续 · Select：回菜单') };
    if (screen === 'menu') return {
      kind: 'menu', title: tr('TANK BRAWL', '坦克大乱斗'), subtitle: tr('Bouncing shells, knockback chaos, and a new hat for every loss.', '弹射炮弹、击退混战，输一局多戴一顶帽子'), rows: menuRows(), cursor, start: tr('▶  START', '▶  开战'),
      legend: [
        [tr('P1', '玩家1'), tr('WASD move · F or Space fire · G dash · R honk', 'WASD 移动 · F 或空格 开火 · G 冲刺 · R 喇叭'), SEAT_COLORS[0]],
        [tr('P2', '玩家2'), tr('Arrows move · K or Enter fire · L dash · ; honk', '方向键 移动 · K 或回车 开火 · L 冲刺 · ; 喇叭'), SEAT_COLORS[1]],
        [tr('Pads', '手柄'), tr('Stick move · ✕/A fire · ○/B dash · right stick aims · Start pause', '摇杆移动 · ✕/A 开火 · ○/B 冲刺 · 右摇杆瞄准 · Start 暂停'), '#ffd34d']
      ]
    };
    if (screen === 'card' && match) {
      const rolling = match.mode === 'versus' && match.round > 0;
      const spinning = rolling && timer < 1.1;
      const shown = spinning ? TWISTS[Math.floor(timer * 11) % TWISTS.length] : world.twist;
      if (match.mode === 'coop') return { kind: 'card', top: world.arena.name[lang], title: tr(`WAVE ${match.wave}`, `第 ${match.wave} 波`) + (match.wave === 5 || match.wave === WAVES ? ' 👑' : ''), hint: match.wave === 5 || match.wave === WAVES ? tr('The King Tank arrives!', '坦克大王驾到！') : world.arena.tagline[lang], progress: timer / 1.8, rolling: false };
      return { kind: 'card', top: tr(`Round ${match.round + 1} · ${world.arena.name[0]}`, `第 ${match.round + 1} 局 · ${world.arena.name[1]}`), title: rolling ? shown.name[lang] : tr('Fight!', '开打！'), hint: rolling ? shown.hint[lang] : world.arena.tagline[lang], progress: timer / 2.4, rolling: spinning };
    }
    if (screen === 'count') { const beat = 3 - Math.floor(timer / 0.55); return { kind: 'count', value: beat > 0 ? String(beat) : tr('GO!', '开炮！') }; }
    if (screen === 'fight' && timer < 0.6) return { kind: 'count', value: tr('GO!', '开炮！') };
    if (screen === 'result' || screen === 'over') return overlayResult;
    return { kind: 'none' };
  }

  function hudLabels() {
    if (screen === 'menu' || !match) return null;
    const names = settings.players === 1 ? [tr('P1', '玩家1'), tr('BOT', '电脑')] : [tr('P1', '玩家1'), tr('P2', '玩家2')];
    if (match.mode === 'coop') return { center: tr(`WAVE ${Math.min(match.wave, WAVES)}/${WAVES}`, `第 ${Math.min(match.wave, WAVES)}/${WAVES} 波`), sub: tr(`Enemies ${world.tanks.filter((tank) => tank.enemy && tank.alive).length} · Score ${waveScore(match)}`, `敌人 ${world.tanks.filter((tank) => tank.enemy && tank.alive).length} · 得分 ${waveScore(match)}`), names };
    const left = Math.ceil(Math.max(0, 50 - world.time));
    return { center: world.twist.name[lang], sub: world.suddenDeath ? tr('SUDDEN DEATH: the floor is crumbling!', '决战时刻：地面正在崩塌！') : tr(`Sudden death in ${left}s`, `${left} 秒后地面崩塌`), names };
  }

  function touchLayer(): Touch | null {
    if (!touched || (screen !== 'fight' && screen !== 'count' && screen !== 'ko')) return null;
    const seats = settings.players === 1 ? [0] : [0, 1];
    const held = (seat: number, kind: 'fire' | 'dash') => [...fingers.values()].some((finger) => finger.seat === seat && finger.kind === kind);
    return {
      sticks: seats.map((seat) => { const finger = [...fingers.values()].find((item) => item.seat === seat && item.kind === 'stick'); return finger ? { x: finger.x, y: finger.y, dx: finger.dx, dy: finger.dy } : null; }),
      buttons: seats.flatMap((seat) => {
        const spot = seatButtons(seat);
        return [{ ...spot.fire, r: 52, label: tr('FIRE', '开火'), held: held(seat, 'fire') }, { ...spot.dash, r: 44, label: tr('DASH', '冲刺'), held: held(seat, 'dash') }];
      })
    };
  }

  const point = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * HEIGHT / box.height };
  };
  const inside = (x: number, y: number, area: { x: number; y: number; w: number; h: number }) => x >= area.x && y >= area.y && x <= area.x + area.w && y <= area.y + area.h;

  function menuTap(x: number, y: number) {
    if (inside(x, y, START_BOX)) { cursor = 5; startMatch(); return; }
    const rows = menuRows();
    rows.forEach((row, index) => {
      const area = menuRowBox(index);
      if (!row.enabled || !inside(x, y, area)) return;
      cursor = index; changeRow(index, x < area.x + area.w * 0.6 ? -1 : 1);
    });
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault(); canvas.focus({ preventScroll: true }); audio.unlock();
    if (event.pointerType === 'touch') touched = true;
    const { x, y } = point(event);
    if (userPaused) { userPaused = false; return; }
    if (screen === 'menu') { menuTap(x, y); return; }
    if (screen === 'over') { if (overHold > 0) return; if (touched && x >= WIDTH / 2) backToMenu(); else startMatch(); return; }
    if (!touched || screen === 'result' || screen === 'card') return;
    const seat = settings.players === 1 ? 0 : x < WIDTH / 2 ? 0 : 1;
    const spot = seatButtons(seat);
    const kind = Math.hypot(x - spot.fire.x, y - spot.fire.y) < 62 ? 'fire' : Math.hypot(x - spot.dash.x, y - spot.dash.y) < 54 ? 'dash' : 'stick';
    fingers.set(event.pointerId, { seat, kind, x, y, dx: 0, dy: 0 });
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* The finger already lifted; pointerup cleans up. */ }
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    const finger = fingers.get(event.pointerId);
    if (!finger || finger.kind !== 'stick') return;
    const { x, y } = point(event), dx = (x - finger.x) / 60, dy = (y - finger.y) / 60, length = Math.hypot(dx, dy);
    finger.dx = length > 1 ? dx / length : length < 0.15 ? 0 : dx; finger.dy = length > 1 ? dy / length : length < 0.15 ? 0 : dy;
  }, { signal });
  const release = (event: PointerEvent) => { fingers.delete(event.pointerId); };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });
  addEventListener('keydown', () => audio.unlock(), { signal, capture: true });

  let fullscreen = false;
  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive'));
    if (full === fullscreen) return;
    fullscreen = full;
    root.style.cssText = full ? `${rootStyle};position:fixed;inset:0;max-width:none;display:flex;align-items:center;justify-content:center;background:#10162a` : rootStyle;
    canvas.style.cssText = full ? `${canvasStyle};width:min(100vw,calc(100dvh*16/9));border:0;border-radius:0` : canvasStyle;
  }

  function frame(dt: number) {
    if (paused) return;
    fitScreen();
    const pads = settings.players === 2 && screen !== 'menu' ? input.read() : null;
    const merged = input.readMerged();
    if (merged.justPressed[START] && screen !== 'menu') userPaused = !userPaused;
    else if (userPaused && merged.justPressed[SELECT]) backToMenu();
    if (!userPaused) {
      if (screen === 'menu') handleMenu(merged);
      else if (screen === 'over' && overHold <= 0) {
        if (merged.justPressed[FIRE]) startMatch(); else if (merged.justPressed[DASH]) backToMenu();
      }
      update(dt, pads, merged);
      renderer?.advance(dt, hitStop > 0);
    }
    renderer?.draw(world, match, overlay(), hudLabels(), touchLayer());
  }

  void input.reconnect();
  const stop = startLoop(frame);
  const debug = { state: () => ({ screen, settings, match, tanks: world.tanks.map(({ x, y, hp, seat }) => ({ x, y, hp, seat })), shells: world.shells.length }) };
  (globalThis as { __tankBrawl?: typeof debug }).__tankBrawl = debug;

  return {
    pause() { paused = true; fingers.clear(); },
    resume() { paused = false; },
    restart() { paused = false; userPaused = false; if (match) startMatch(); else backToMenu(); },
    destroy() {
      stop(); listeners.abort(); shellControls.destroy(); input.destroy(); audio.destroy();
      delete (globalThis as { __tankBrawl?: typeof debug }).__tankBrawl;
      host.replaceChildren();
    }
  };
}

const game: GameModule = {
  meta: {
    slug: 'tank-brawl-opus', title: 'Tank Brawl', category: 'action',
    description: 'A silly couch tank brawl: bouncing shells, knockback into lava, power-up ducks, a new twist every round, and one more hat for every loss.',
    instructions: 'Versus or co-op, two players or one against a bot. P1: WASD, F or Space fires, G dashes. P2: arrows, K or Enter fires, L dashes. Controllers and touch work too. Dash jumps pits and rams tanks; your own shells bounce back and hurt.',
    accent: '#ffd34d', mechanic: 'Bounce shells, ram, grab power-ups'
  },
  mount
};

export default game;
