import type { GameModule, GameServices } from '../../core/game-types';
import { createMobileControls } from '../_shared/mobile-controls';
import { createInput, startLoop, type KeyboardMap, type PadState, type VirtualPad } from '../_shared/gamepad-kit';
import { ARENAS, arenaById } from './arenas';
import { createTankAudio } from './audio';
import { botIntent, enemySkill, SKILLS, withStyle, type BotSkill } from './bot';
import { BOSS, botLevels, earnedHats, hatById, matchBonus, MEDALS, medalRow, recordCoopRun, recordSoloMatch, recordTourStop, roundScore, tourTotal, validCareer, WARDROBE, type Career } from './career';
import { createRenderer, HEIGHT, menuRowBox, SEAT_COLORS, START_BOX, TOUR_BACK_BOX, TOUR_GO_BOX, TOUR_NODE_R, tourNodeCenter, WIDTH, type MenuRow, type Overlay, type Touch } from './render';
import { arenaForRound, bossOf, COOP_HP, createMatch, createWorld, heartsAfterWave, idle, isBossWave, makeTank, pickTwist, recordRound, spawnPoint, spawnWave, step, STEP, suddenDeathAt, TWISTS, WAVES, waveScore, type Intent, type Match, type Mode, type Tank, type Twist, type World } from './sim';
import { BOT_BLURB, BOT_NAMES, GOAL_TEXT, TOUR, TOUR_TARGET, tourStars, tourUnlocked, type RoundStats } from './tour';

const ACCENT = '#ffd34d';
const VERSUS_HP = 5, FIRE = 0, DASH = 1, HONK = 2, L1 = 4, R1 = 5, L2 = 6, R2 = 7, SELECT = 8, START = 9;
const KEYS: KeyboardMap[] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', buttons: [['KeyF', 'Space'], 'KeyG', 'KeyR', [], [], [], [], [], 'KeyT', 'KeyP'] },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', buttons: [['KeyK', 'Enter'], 'KeyL', 'Semicolon', [], [], [], [], [], 'Quote', 'KeyO'] }
];
const zh = () => /^zh\b/i.test(navigator.language || '');

type Screen = 'menu' | 'tour' | 'card' | 'count' | 'fight' | 'ko' | 'result' | 'over';
type MenuMode = Mode | 'tour';
type Settings = { mode: MenuMode; players: 1 | 2; skill: number; arena: string; target: number; hat: string; stop: number };
const DEFAULTS: Settings = { mode: 'versus', players: 2, skill: 0, arena: 'shuffle', target: 3, hat: 'none', stop: 0 };
const MODES: readonly MenuMode[] = ['versus', 'coop', 'tour'];
/** Menu rows: mode, players, bot, arena, first to, hat. START sits right after them. */
const ROWS = 6;
const coarsePointer = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** A first visit on a phone is almost always one person, so it opens on the bot; a keyboard keeps the couch default. */
function validSettings(raw: Partial<Settings> | null): Settings {
  const merged = { ...DEFAULTS, players: coarsePointer() ? 1 : 2, ...raw };
  return {
    mode: MODES.includes(merged.mode) ? merged.mode : 'versus', players: merged.players === 1 ? 1 : 2,
    skill: SKILLS[merged.skill] ? merged.skill : 1,
    arena: merged.arena === 'shuffle' || ARENAS.some((arena) => arena.id === merged.arena) ? merged.arena : 'shuffle',
    target: [3, 5, 7].includes(merged.target) ? merged.target : 3,
    hat: typeof merged.hat === 'string' && WARDROBE.some((hat) => hat.id === merged.hat) ? merged.hat : 'none',
    stop: Number.isInteger(merged.stop) && merged.stop >= 0 && merged.stop < TOUR.length ? merged.stop : 0
  };
}

function mount(host: HTMLElement, services: GameServices) {
  const lang = zh() ? 1 : 0;
  const tr = (en: string, cn: string) => (lang ? cn : en);
  let settings = validSettings(services.storage.get<Partial<Settings> | null>('settings', null));
  let career = validCareer(services.storage.get<unknown>('career', null));
  if (settings.skill >= botLevels(career)) settings.skill = botLevels(career) - 1;
  if (!earnedHats(career).some((hat) => hat.id === settings.hat)) settings.hat = 'none';
  if (!tourUnlocked(career.tour, settings.stop)) settings.stop = 0;

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
  const renderer = context ? createRenderer(context, services.isReducedMotion, lang === 1) : null;
  const audio = createTankAudio(() => services.sound.muted);
  const listeners = new AbortController();
  const signal = listeners.signal;

  const shellControls = createMobileControls(root, { shape: 'single-action', labels: [], pause: true, onChange: () => undefined });

  const fingers = new Map<number, { seat: number; kind: 'stick' | 'fire' | 'dash'; x: number; y: number; dx: number; dy: number }>();
  let touched = coarsePointer();
  const FIRE_R = 66, DASH_R = 54;
  const seatButtons = (seat: number) => {
    if (settings.players === 1) return { fire: { x: 1178, y: 606 }, dash: { x: 1030, y: 648 } };
    return seat === 0 ? { fire: { x: 330, y: 632 }, dash: { x: 190, y: 652 } } : { fire: { x: WIDTH - 330, y: 632 }, dash: { x: WIDTH - 190, y: 652 } };
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

  let screen: Screen = 'menu', timer = 0, paused = false, userPaused = false, accumulator = 0, hitStop = 0, cursor = ROWS, rollNext = 0;
  /** The tour stop being played (-1 outside the tour), what each of its rounds looked like, and the live round. */
  let tourStop = -1, tourRounds: RoundStats[] = [], roundStat: RoundStats = blankRound(), coopCleared = false;
  let match: Match | null = null, world: World = demoWorld(), rolledTwist: Twist = TWISTS[0], heroes: Tank[] = [], lastCount = 0, overHold = 0;
  let overlayResult: Overlay = { kind: 'none' };
  /** Solo-versus score for the leaderboard, and who has actually touched their controls this match. */
  let soloScore = 0, seatSeen = [false, false], autoBot = [false, false], takeoverNote = 0, skipCard = false, rotated = false, taught = false;
  renderer?.setWorld(world);

  function blankRound(): RoundStats { return { won: false, heroHp: 0, heroMax: 0, time: 0, botFell: false, grabbed: false }; }
  /** One person at the controls: the solo setting, or any tour stop. */
  const oneSeat = () => settings.players === 1 || tourStop >= 0;
  const botLevel = () => (tourStop >= 0 ? TOUR[tourStop].skill : settings.skill);
  const botSkill = (): BotSkill => (tourStop >= 0 ? withStyle(SKILLS[TOUR[tourStop].skill], TOUR[tourStop].style) : SKILLS[settings.skill]);
  const twistById = (id: string) => TWISTS.find((twist) => twist.id === id) ?? TWISTS[0];
  const wearing = () => { renderer?.setWardrobe([hatById(settings.hat).icon, '']); };
  wearing();
  /** Lines for any hats this career change just earned. */
  function newHats(before: Career) {
    const had = new Set(earnedHats(before).map((hat) => hat.id));
    return earnedHats(career).filter((hat) => !had.has(hat.id)).map((hat) => tr(`New hat: ${hat.icon} ${hat.name[0]}! Wear it from the menu`, `新帽子：${hat.icon} ${hat.name[1]}！去菜单戴上`));
  }

  function demoWorld() {
    const arena = ARENAS[Math.floor(services.random() * ARENAS.length)];
    const next = createWorld(arena, TWISTS[0], services.random);
    for (const seat of [0, 1]) { const [x, y] = spawnPoint(arena, seat); makeTank(next, seat, seat, x, y, VERSUS_HP); }
    return next;
  }

  const saveSettings = () => services.storage.set('settings', settings);
  const arenaChoices = ['shuffle', ...ARENAS.map((arena) => arena.id)];
  function menuRows(): MenuRow[] {
    const tour = settings.mode === 'tour', solo = settings.players === 1 || tour, versus = settings.mode === 'versus';
    const hat = hatById(settings.hat), owned = earnedHats(career).length - 1;
    const modeName = versus ? tr('⚔️ Versus', '⚔️ 对战') : tour ? tr('🗺️ Solo Tour', '🗺️ 单人巡回赛') : tr('🤝 Co-op Waves', '🤝 合作闯关');
    return [
      { label: tr('Mode', '模式'), value: modeName, enabled: true },
      { label: tr('Players', '玩家'), value: solo ? tr('1 Player', '单人') : tr('2 Players', '双人'), enabled: !tour },
      { label: tr('Bot', '电脑'), value: `${career.botWins[settings.skill] > 0 ? `${MEDALS[settings.skill]} ` : ''}${skillName(settings.skill)}`, enabled: solo && versus },
      { label: tr('Arena', '场地'), value: tour ? tr('set by the stop', '由站点决定') : settings.arena === 'shuffle' ? tr('🎲 Shuffle', '🎲 随机轮换') : arenaById(settings.arena).name[lang], enabled: !tour },
      { label: tr('First to', '先赢'), value: tour ? tr(`${TOUR_TARGET} rounds`, `${TOUR_TARGET} 局`) : tr(`${settings.target} rounds`, `${settings.target} 局`), enabled: versus },
      { label: tr(`Hat  ${owned}/${WARDROBE.length - 1}`, `帽子  ${owned}/${WARDROBE.length - 1}`), value: `${hat.icon} ${hat.name[lang]}`.trim(), enabled: true }
    ];
  }
  const skillName = (skill: number) => [tr('Easy', '简单'), tr('Normal', '普通'), tr('Hard', '困难'), tr('Boss', '魔王')][skill];
  function recordLine() {
    if (settings.mode === 'tour') return tr(`🗺️ 12 stops, 3 stars each  ·  ${tourTotal(career)} / 36 ★  ·  stars earn hats`, `🗺️ 12 站，每站 3 颗星 · ${tourTotal(career)} / 36 ★ · 星星换帽子`);
    if (settings.mode === 'coop') return career.bestWave > 0 ? tr(`🏆 Best: ${career.bestWave} waves cleared · score ${career.bestScore}  ·  a boss every 5th wave, no end after ${WAVES}`, `🏆 最佳：清完 ${career.bestWave} 波 · ${career.bestScore} 分 · 每 5 波一个首领，${WAVES} 波后无尽`) : tr(`Survive ${WAVES} waves, then keep going. A boss every 5th wave 👑`, `撑过 ${WAVES} 波后继续闯，每 5 波一个首领 👑`);
    if (settings.players === 2) return tr('Loser of every round wears one more hat 🎩', '每输一局多戴一顶帽子 🎩');
    const locked = botLevels(career) <= 3;
    const ladder = tr(`Bot ladder  ${medalRow(career)}`, `电脑段位  ${medalRow(career)}`);
    if (career.matches === 0) return tr(`${ladder}   ·   beat each bot to climb`, `${ladder}   ·   逐个击败电脑来升级`);
    return `${ladder}   ·   ${tr(`streak ${career.streak} (best ${career.bestStreak})`, `连胜 ${career.streak}（最高 ${career.bestStreak}）`)}   ·   ${locked ? tr('beat Hard to unlock the Boss', '击败困难解锁魔王') : tr(`best ${career.soloBest}`, `最高 ${career.soloBest} 分`)}`;
  }
  function changeRow(row: number, direction: number) {
    const cycle = <T,>(items: readonly T[], value: T) => items[(items.indexOf(value) + direction + items.length) % items.length];
    if (row === 0) settings.mode = cycle(MODES, settings.mode);
    else if (row === 1) settings.players = settings.players === 1 ? 2 : 1;
    else if (row === 2) settings.skill = cycle(Array.from({ length: botLevels(career) }, (_, level) => level), settings.skill);
    else if (row === 3) settings.arena = cycle(arenaChoices, settings.arena);
    else if (row === 4) settings.target = cycle([3, 5, 7], settings.target);
    else { settings.hat = cycle(earnedHats(career).map((hat) => hat.id), settings.hat); wearing(); }
    audio.move(); saveSettings();
  }
  function moveCursor(direction: number) {
    const rows = menuRows();
    do { cursor = (cursor + direction + rows.length + 1) % (rows.length + 1); } while (cursor < rows.length && !rows[cursor].enabled);
    audio.move();
  }

  /** START on the menu: the tour opens its map, the other modes go straight in. */
  function startFromMenu() {
    if (settings.mode === 'tour') { screen = 'tour'; audio.pick(); return; }
    startMatch();
  }

  function startMatch() {
    if (screen === 'tour' || tourStop >= 0) tourStop = settings.stop; else tourStop = -1;
    const stop = tourStop >= 0 ? TOUR[tourStop] : null;
    const arenas = stop ? [arenaById(stop.arena)] : settings.arena === 'shuffle' ? ARENAS : [arenaById(settings.arena)];
    match = createMatch(stop ? 'versus' : settings.mode === 'coop' ? 'coop' : 'versus', stop ? TOUR_TARGET : settings.target, arenas, services.random);
    soloScore = 0; seatSeen = [false, false]; autoBot = [false, false]; takeoverNote = 0; tourRounds = []; coopCleared = false;
    renderer?.setFogSeats(oneSeat() ? [0] : [0, 1]);
    services.reportScore(0);
    audio.pick();
    startRound();
  }

  function startRound() {
    if (!match) return;
    const coop = match.mode === 'coop', arena = arenaForRound(match);
    rolledTwist = tourStop >= 0 ? twistById(TOUR[tourStop].twist) : pickTwist(match, services.random);
    match.twists.push(rolledTwist);
    world = createWorld(arena, rolledTwist, services.random, !coop);
    heroes = [];
    const seats = coop && oneSeat() ? [0] : [0, 1];
    for (const seat of seats) {
      const [x, y] = spawnPoint(arena, seat);
      const boss = !coop && oneSeat() && seat === 1 && botLevel() === BOSS;
      const hp = coop ? COOP_HP : (rolledTwist.hp ?? VERSUS_HP) + (boss ? 2 : 0);
      const tank = makeTank(world, coop ? 0 : seat, seat, x, y, hp);
      if (coop && match.hp[seat] > 0) tank.hp = match.hp[seat];
      heroes.push(tank);
    }
    if (coop) spawnWave(world, match.wave);
    roundStat = { ...blankRound(), heroMax: heroes[0]?.maxHp ?? 0 };
    renderer?.setWorld(world);
    fingers.clear();
    screen = 'card'; timer = 0; rollNext = 0; skipCard = false;
  }

  const overPrompt = (again: string) => (touched ? tr(`Tap left: ${again}  ·  Tap right: menu`, `点左边：${again} · 点右边：回菜单`) : tr(`Fire: ${again}  ·  Dash: menu`, `开火：${again} · 冲刺：回菜单`));
  const seatName = (seat: number) => (oneSeat() && seat === 1 ? (tourStop >= 0 ? BOT_NAMES[TOUR[tourStop].style][lang].toUpperCase() : tr('BOT', '电脑')) : `P${seat + 1}`);

  const soloVersus = () => settings.players === 1 && match?.mode === 'versus' && tourStop < 0;
  const saveCareer = () => services.storage.set('career', career);

  function finishRound() {
    if (!match) return;
    timer = 0;
    if (match.mode === 'coop') return finishWave();
    const winner = world.winner, champion = recordRound(match, winner), solo = soloVersus(), level = settings.skill;
    if (tourStop >= 0) {
      tourRounds.push({ ...roundStat, won: winner === 0, heroHp: Math.max(0, heroes[0]?.hp ?? 0), time: world.time });
      if (champion >= 0) return finishTourStop(champion === 0);
    }
    if (solo && winner === 0) soloScore += roundScore(level, heroes[0]?.hp ?? 0);
    if (solo && champion === 0) soloScore += matchBonus(level, match.wins[1]);
    services.reportScore(solo ? soloScore : match.wins[0] * 100);
    const score = `P1  ${match.wins[0]} : ${match.wins[1]}  ${seatName(1)}`;
    if (champion >= 0) {
      const humanLost = solo && champion === 1;
      humanLost ? audio.sad() : audio.fanfare();
      services.reportComplete(1);
      const hats = tr(`Hats of shame: ${match.hats[champion ? 0 : 1]} 🎩`, `败者帽子：${match.hats[champion ? 0 : 1]} 顶 🎩`);
      let lines = [score, hats], again = tr('rematch', '再来一局');
      if (solo) {
        const result = recordSoloMatch(career, level, !humanLost, soloScore);
        career = result.career; saveCareer();
        const points = result.newBest ? tr(`Score ${soloScore} · NEW BEST! 🎉`, `得分 ${soloScore} · 新纪录！🎉`) : tr(`Score ${soloScore} · best ${career.soloBest}`, `得分 ${soloScore} · 最高 ${career.soloBest}`);
        const next = level + 1 < botLevels(career) ? level + 1 : -1;
        if (humanLost) lines = [score, points, level > 0 ? tr(`${hats} · streak over`, `${hats} · 连胜中断`) : hats];
        else if (result.firstWin) {
          lines = [score, points, tr(`${MEDALS[level]} ${skillName(level)} bot beaten!`, `${MEDALS[level]} 击败了${skillName(level)}电脑！`) + (result.unlockedBoss ? tr(' Boss unlocked 👑', ' 魔王已解锁 👑') : '')];
          if (next >= 0) { settings.skill = next; saveSettings(); again = tr(`fight ${skillName(next)} bot`, `挑战${skillName(next)}电脑`); }
        } else lines = [score, points, tr(`Win streak ${career.streak} 🔥 (best ${career.bestStreak})`, `连胜 ${career.streak} 🔥（最高 ${career.bestStreak}）`)];
      }
      overlayResult = { kind: 'result', title: tr(`${seatName(champion)} WINS!`, `${seatName(champion)} 胜利！`), color: SEAT_COLORS[champion], lines, prompt: overPrompt(again), party: !humanLost };
      screen = 'over'; overHold = 0.9;
      return;
    }
    audio.tick();
    const loser = winner === 0 ? 1 : 0;
    overlayResult = { kind: 'result', title: winner < 0 ? tr('DRAW!', '平局！') : tr(`${seatName(winner)} TAKES IT`, `${seatName(winner)} 拿下这局`), color: winner < 0 ? '#fff' : SEAT_COLORS[winner], lines: winner < 0 ? [score] : [score, tr(`${seatName(loser)} must wear another hat 🎩`, `${seatName(loser)} 再戴一顶帽子 🎩`)], party: false };
    screen = 'result';
  }

  function finishTourStop(won: boolean) {
    if (!match) return;
    const stopIndex = tourStop, stop = TOUR[stopIndex], stars = tourStars(stop, tourRounds, won), count = stars.filter(Boolean).length;
    const before = career, result = recordTourStop(career, stopIndex, count);
    career = result.career; saveCareer();
    services.reportScore(tourTotal(career) * 100);
    services.reportComplete(1);
    won ? audio.fanfare() : audio.sad();
    const starRow = stars.map((got) => (got ? '★' : '☆')).join(' ');
    const lines = [`P1  ${match.wins[0]} : ${match.wins[1]}  ${seatName(1)}`,
      `${starRow}   ${tr('win', '获胜')} · ${tr('no round lost', '不丢一局')} · ${GOAL_TEXT[stop.goal][lang]}`,
      ...newHats(before)];
    if (won && result.gained > 0) lines.splice(2, 0, tr(`+${result.gained} ★  ·  tour total ${tourTotal(career)} / 36`, `+${result.gained} ★ · 总计 ${tourTotal(career)} / 36`));
    let again = tr('try again', '再试一次');
    if (won && stopIndex + 1 < TOUR.length) { settings.stop = stopIndex + 1; saveSettings(); again = tr(`stop ${stopIndex + 2}`, `第 ${stopIndex + 2} 站`); }
    else if (won) again = tr('play it again', '再玩一次');
    overlayResult = { kind: 'result', title: won ? tr(`STOP ${stopIndex + 1} WON!`, `第 ${stopIndex + 1} 站胜利！`) : tr(`${seatName(1)} WINS`, `${seatName(1)} 获胜`), color: won ? '#ffd34d' : '#ff7d8b', lines: lines.slice(0, 4), prompt: overPrompt(again).replace(tr('menu', '回菜单'), tr('tour map', '巡回地图')), party: won };
    screen = 'over'; overHold = 0.9;
  }

  function finishWave() {
    if (!match) return;
    const cleared = world.winner === 0;
    let healed = 0;
    if (cleared) {
      heroes.forEach((tank) => { const hearts = heartsAfterWave(tank, heroes.length); healed = Math.max(healed, hearts - Math.max(tank.hp, 0)); match!.hp[tank.seat] = hearts; });
      match.wave++; match.round++;
    }
    const score = waveScore(match);
    services.reportScore(score);
    if (!cleared) {
      // The run only ends when the heroes fall: after wave 10 it keeps going for the best-wave board.
      const waves = match.wave - 1;
      audio.sad();
      if (!coopCleared) services.reportComplete(waves / WAVES);
      const before = career, run = recordCoopRun(career, waves, score);
      career = run.career; saveCareer();
      const points = run.newBest ? tr(`Score ${score} · NEW BEST! 🎉`, `得分 ${score} · 新纪录！🎉`) : tr(`Score ${score} · best ${career.bestScore}`, `得分 ${score} · 最高 ${career.bestScore}`);
      const board = career.board.slice(0, 3).map((entry, index) => `${index === run.place ? '▶ ' : ''}${index + 1}. ${tr(`wave ${entry.wave}`, `${entry.wave} 波`)} · ${entry.score}`).join('    ');
      overlayResult = { kind: 'result', title: coopCleared ? tr(`OVERTIME OVER AT WAVE ${match.wave}`, `加时止步第 ${match.wave} 波`) : tr('TANKS DOWN', '全军覆没'), color: coopCleared ? '#ffd34d' : '#ff7d8b', lines: [tr(`Waves cleared: ${waves}`, `清完 ${waves} 波`) + (run.place === 0 && waves > 0 ? tr(' · BEST WAVE! 🏆', ' · 最佳纪录！🏆') : ''), points, board, ...newHats(before)].filter(Boolean).slice(0, 4), prompt: overPrompt(tr('try again', '再试一次')), party: coopCleared };
      screen = 'over'; overHold = 0.9;
      return;
    }
    audio.tick();
    const done = match.wave - 1;
    let title = tr(`WAVE ${done} CLEAR!`, `第 ${done} 波完成！`), color = '#70f0c2';
    if (done === WAVES && !coopCleared) {
      coopCleared = true; services.reportComplete(1); audio.fanfare();
      title = tr(`ALL ${WAVES} WAVES CLEARED!`, `${WAVES} 波全部通关！`); color = '#ffd34d';
    }
    const extra = done === WAVES ? tr('Overtime: how far can you go?', '加时赛：看你能走多远？') : isBossWave(done) ? tr('Boss down! 👑', '首领倒下！👑') : '';
    overlayResult = { kind: 'result', title, color, lines: [tr(`Score ${score}`, `得分 ${score}`) + (healed > 0 ? ` · +${healed} ❤️` : ''), extra].filter(Boolean), party: done === WAVES };
    screen = 'result';
  }

  function backToMenu() {
    const toMap = tourStop >= 0;
    match = null; world = demoWorld(); heroes = []; renderer?.setWorld(world); tourStop = -1;
    screen = toMap ? 'tour' : 'menu'; fingers.clear(); userPaused = false;
  }

  function padIntent(pad: PadState): Intent {
    const down = pad.buttons;
    return { x: pad.x, y: pad.y, ax: pad.rx, ay: pad.ry, fire: down[FIRE] || down[R1] || down[R2], dash: down[DASH] || down[L1] || down[L2], honk: down[HONK] || down[3] };
  }

  /**
   * Two-player is the default, so a lone visitor would otherwise fight a parked tank. A seat nobody has touched
   * four seconds into a round, while the other one is busy, gets an easy bot until its owner presses something.
   */
  function seatIntent(tank: Tank, pads: PadState[] | null): Intent {
    const seat = tank.seat, mine = pads ? padIntent(pads[seat]) : idle();
    if (mine.x || mine.y || mine.fire || mine.dash || mine.honk) { seatSeen[seat] = true; autoBot[seat] = false; return mine; }
    if (!autoBot[seat] && !seatSeen[seat] && seatSeen[seat ? 0 : 1] && world.time > 4 && screen === 'fight') { autoBot[seat] = true; takeoverNote = 5; }
    return autoBot[seat] ? botIntent(world, tank, SKILLS[0]) : mine;
  }

  function stepWorld(pads: PadState[] | null, merged: PadState) {
    const intents = new Map<number, Intent>();
    for (const tank of world.tanks) {
      if (!tank.alive) continue;
      if (screen === 'menu' || screen === 'tour') intents.set(tank.id, botIntent(world, tank, SKILLS[1]));
      else if (tank.enemy) intents.set(tank.id, botIntent(world, tank, enemySkill(tank.enemy)));
      else if (oneSeat()) intents.set(tank.id, tank.seat === 0 ? padIntent(merged) : botIntent(world, tank, botSkill()));
      else intents.set(tank.id, seatIntent(tank, pads));
    }
    step(world, intents);
    if (screen === 'menu' || screen === 'tour') { world.events.length = 0; return; }
    const hero = heroes[0], bot = heroes[1];
    for (const event of world.events) {
      audio.event(event);
      if (event.type === 'fall' && bot && event.tank === bot.id) roundStat.botFell = true;
      if (event.type === 'pickup' && hero && event.tank === hero.id) roundStat.grabbed = true;
      if (event.type === 'ko' && match?.mode === 'coop' && !heroes.some((tank) => tank.id === event.tank)) match.kills++;
      if (event.type === 'hit' && !services.isReducedMotion) hitStop = Math.max(hitStop, 0.05);
      if (event.type === 'ko' && !services.isReducedMotion) hitStop = 0.14;
    }
    renderer?.consume(world.events);
    world.events.length = 0;
  }

  function update(dt: number, pads: PadState[] | null, merged: PadState) {
    timer += dt;
    if (screen === 'menu' || screen === 'tour') {
      accumulator += dt;
      while (accumulator >= STEP) { accumulator -= STEP; stepWorld(null, merged); }
      if (world.finished && timer > 1) { timer = 0; const next = demoWorld(); world = next; renderer?.setWorld(next); } else if (!world.finished) timer = 0;
      return;
    }
    if (screen === 'card') {
      const rolling = match?.mode === 'versus' && match.round > 0;
      const length = rolling ? 2.6 : teaching() ? 3.2 : 1.8;
      if (timer > 0.5 && (skipCard || merged.justPressed[FIRE])) timer = Math.max(timer, length);
      skipCard = false;
      if (rolling && timer < 1.1 && timer >= rollNext) { rollNext = timer + 0.09; audio.roll(); }
      if (timer >= length) { if (match?.round === 0) taught = true; screen = 'count'; timer = 0; lastCount = 0; }
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
      takeoverNote = Math.max(0, takeoverNote - dt);
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
    else if ((direction === 'left' || direction === 'right') && cursor < ROWS) changeRow(cursor, direction === 'left' ? -1 : 1);
    if (merged.justPressed[FIRE] || merged.justPressed[START]) {
      if (cursor === ROWS) startFromMenu(); else changeRow(cursor, 1);
    }
  }

  /** The tour map: arrows walk the stops, Fire plays, Dash goes back. */
  function handleTour(merged: PadState) {
    const direction = merged.dirPressed, step = direction === 'left' || direction === 'up' ? -1 : direction === 'right' || direction === 'down' ? 1 : 0;
    if (step) {
      const next = settings.stop + step;
      if (next >= 0 && next < TOUR.length && tourUnlocked(career.tour, next)) { settings.stop = next; saveSettings(); audio.move(); }
    }
    if (merged.justPressed[FIRE] || merged.justPressed[START]) startMatch();
    else if (merged.justPressed[DASH] || merged.justPressed[SELECT]) { screen = 'menu'; audio.move(); }
  }

  function tourOverlay(): Overlay {
    const stop = TOUR[settings.stop], arena = arenaById(stop.arena), twist = twistById(stop.twist), got = career.tour[settings.stop];
    return {
      kind: 'tour', title: tr('SOLO TOUR', '单人巡回赛'), subtitle: tr(`${tourTotal(career)} / 36 ★  ·  win a stop to open the next`, `${tourTotal(career)} / 36 ★ · 赢下一站解锁下一站`),
      cursor: settings.stop, back: tr('◀ Menu', '◀ 菜单'), go: tr('▶ PLAY', '▶ 出发'),
      nodes: TOUR.map((item, index) => ({ number: String(index + 1), name: arenaById(item.arena).name[lang], stars: career.tour[index], locked: !tourUnlocked(career.tour, index), icon: item.skill >= BOSS ? '😈' : item.style === 'camper' ? '⛺' : item.style === 'rammer' ? '🐏' : '🏓' })),
      info: [
        tr(`Stop ${settings.stop + 1}: ${arena.name[0]} · ${twist.name[0]}`, `第 ${settings.stop + 1} 站：${arena.name[1]} · ${twist.name[1]}`),
        tr(`vs ${BOT_NAMES[stop.style][0]} (${skillName(stop.skill)}), who ${BOT_BLURB[stop.style][0]}`, `对手：${BOT_NAMES[stop.style][1]}（${skillName(stop.skill)}），${BOT_BLURB[stop.style][1]}`),
        `${'★'.repeat(got)}${'☆'.repeat(3 - got)}  ${tr('Win', '获胜')} · ${tr('2-0', '2:0 完胜')} · ${GOAL_TEXT[stop.goal][lang]}`
      ]
    };
  }

  function overlay(): Overlay {
    if (userPaused) return { kind: 'paused', title: tr('PAUSED', '已暂停'), hint: touched ? tr('Tap to resume', '点一下继续') : tr('P or Start: resume  ·  T or Select: quit to menu', 'P 或 Start：继续 · T 或 Select：回菜单') };
    if (screen === 'tour') return tourOverlay();
    if (screen === 'menu') return {
      kind: 'menu', title: tr('TANK BRAWL', '坦克大乱斗'), subtitle: tr('Bouncing shells, knockback chaos, and a new hat for every loss.', '弹射炮弹、击退混战，输一局多戴一顶帽子'), rows: menuRows(), cursor, start: tr('▶  START', '▶  开战'), record: recordLine(),
      legend: touched ? [
        [tr('Drive', '移动'), settings.players === 2 ? tr('Drag anywhere on your half of the screen', '在自己那半边屏幕上拖动') : tr('Drag anywhere on the screen', '在屏幕任意位置拖动'), SEAT_COLORS[0]],
        [tr('Fight', '战斗'), tr('FIRE shoots · DASH jumps pits and rams', '开火射击 · 冲刺能飞跃坑洞、撞飞对手'), SEAT_COLORS[1]]
      ] : [
        [tr('P1', '玩家1'), tr('WASD move · F or Space fire · G dash · R honk', 'WASD 移动 · F 或空格 开火 · G 冲刺 · R 喇叭'), SEAT_COLORS[0]],
        [tr('P2', '玩家2'), tr('Arrows move · K or Enter fire · L dash · ; honk', '方向键 移动 · K 或回车 开火 · L 冲刺 · ; 喇叭'), SEAT_COLORS[1]],
        [tr('Pads', '手柄'), tr('Stick move · ✕/A fire · ○/B dash · right stick aims · Start pause', '摇杆移动 · ✕/A 开火 · ○/B 冲刺 · 右摇杆瞄准 · Start 暂停'), '#ffd34d']
      ]
    };
    if (screen === 'card' && match) {
      const rolling = match.mode === 'versus' && match.round > 0;
      const spinning = rolling && timer < 1.1;
      const shown = spinning ? TWISTS[Math.floor(timer * 11) % TWISTS.length] : world.twist;
      const lines = teaching() ? controlLines() : undefined;
      if (match.mode === 'coop') {
        const bosses = bossOf(match.wave), mother = bosses.includes('mother'), kings = bosses.filter((boss) => boss === 'king').length;
        const hint = mother && kings ? tr('The King AND the Duck Mother!', '坦克大王和鸭妈妈一起来了！') : mother ? tr('The Duck Mother arrives! Her ducks only blow up on you.', '鸭妈妈驾到！她下的鸭子只炸你') : kings > 1 ? tr('Two King Tanks!', '两个坦克大王！') : kings ? tr('The King Tank arrives!', '坦克大王驾到！') : match.wave > WAVES ? tr('Overtime. Every wave is a new record.', '加时赛，每一波都是新纪录') : world.arena.tagline[lang];
        return { kind: 'card', top: world.arena.name[lang], title: tr(`WAVE ${match.wave}`, `第 ${match.wave} 波`) + (bosses.length ? (mother ? ' 🦆' : ' 👑') : ''), hint, progress: timer / 1.8, rolling: false, lines };
      }
      if (tourStop >= 0) {
        const stop = TOUR[tourStop];
        return { kind: 'card', top: tr(`Tour stop ${tourStop + 1} · Round ${match.round + 1} · ${world.arena.name[0]}`, `巡回赛第 ${tourStop + 1} 站 · 第 ${match.round + 1} 局 · ${world.arena.name[1]}`), title: world.twist.name[lang], hint: tr(`vs ${BOT_NAMES[stop.style][0]}  ·  ★ ${GOAL_TEXT[stop.goal][0]}`, `对手 ${BOT_NAMES[stop.style][1]} · ★ ${GOAL_TEXT[stop.goal][1]}`), progress: timer / 2.4, rolling: false, lines, alert: Math.max(...match.wins) === match.target - 1 && match.round > 0 ? tr('MATCH POINT', '赛点') : undefined };
      }
      const point = Math.max(...match.wins) === match.target - 1 && match.round > 0;
      return { kind: 'card', top: tr(`Round ${match.round + 1} · ${world.arena.name[0]}`, `第 ${match.round + 1} 局 · ${world.arena.name[1]}`), title: rolling ? shown.name[lang] : tr('Fight!', '开打！'), hint: rolling ? shown.hint[lang] : world.arena.tagline[lang], progress: timer / 2.4, rolling: spinning, lines, alert: point ? tr('MATCH POINT', '赛点') : undefined };
    }
    if (screen === 'count') { const beat = 3 - Math.floor(timer / 0.55); return { kind: 'count', value: beat > 0 ? String(beat) : tr('GO!', '开炮！') }; }
    if (screen === 'fight' && timer < 0.6) return { kind: 'count', value: tr('GO!', '开炮！') };
    if (screen === 'result' || screen === 'over') return overlayResult;
    return { kind: 'none' };
  }

  /** Shown on the first card of a match, which is the moment a new player actually needs them. */
  const teaching = () => match?.round === 0 && !taught;
  function controlLines() {
    if (touched) return [tr('Drag to drive  ·  FIRE to shoot  ·  DASH to leap pits', '拖动行驶 · 开火射击 · 冲刺飞跃坑洞'), tr('Shells bounce — your own can hit you!', '炮弹会反弹，小心打到自己！')];
    if (oneSeat()) return [tr('Move WASD  ·  Fire F or Space  ·  Dash G', '移动 WASD · 开火 F 或空格 · 冲刺 G'), tr('Shells bounce — your own can hit you!', '炮弹会反弹，小心打到自己！')];
    return [tr('P1  WASD move · F fire · G dash', '玩家1  WASD 移动 · F 开火 · G 冲刺'), tr('P2  Arrows move · K fire · L dash', '玩家2  方向键 移动 · K 开火 · L 冲刺')];
  }

  function hudLabels() {
    if (screen === 'menu' || !match) return null;
    const names = oneSeat() ? [tr('P1', '玩家1'), seatName(1)] : [autoBot[0] ? tr('BOT', '电脑') : tr('P1', '玩家1'), autoBot[1] ? tr('BOT', '电脑') : tr('P2', '玩家2')];
    if (takeoverNote > 0 && (autoBot[0] || autoBot[1])) { const who = autoBot[0] ? 'P1' : 'P2'; return { center: tr(`A bot is driving ${who}`, `电脑正在代打 ${who}`), sub: tr(`Press any ${who} control to take over`, `按任意 ${who} 按键即可接管`), names }; }
    if (match.mode === 'coop') return { center: match.wave > WAVES ? tr(`WAVE ${match.wave} · OVERTIME`, `第 ${match.wave} 波 · 加时`) : tr(`WAVE ${match.wave}/${WAVES}`, `第 ${match.wave}/${WAVES} 波`), sub: tr(`Enemies ${world.tanks.filter((tank) => tank.enemy && tank.alive).length} · Score ${waveScore(match)}`, `敌人 ${world.tanks.filter((tank) => tank.enemy && tank.alive).length} · 得分 ${waveScore(match)}`), names };
    const left = Math.ceil(Math.max(0, suddenDeathAt(world.twist) - world.time));
    if (tourStop >= 0 && !world.suddenDeath) {
      const goal = TOUR[tourStop].goal, clock = goal === 'fast' ? Math.max(0, Math.ceil(20 - world.time)) : -1;
      const sub = goal === 'fast' ? (clock > 0 ? tr(`★ Win in ${clock}s`, `★ ${clock} 秒内获胜`) : tr('★ Too slow this round', '★ 这局超时了'))
        : goal === 'hearts' ? (heroes[0] && heroes[0].hp >= heroes[0].maxHp ? tr('★ No hearts lost yet', '★ 还没丢心') : tr('★ Hearts lost this round', '★ 这局已丢心'))
        : goal === 'pit' ? (roundStat.botFell ? tr('★ Bot in the pit! Now win', '★ 电脑落坑了！拿下这局') : tr('★ Knock the bot into a pit', '★ 把电脑撞进坑'))
        : roundStat.grabbed ? tr('★ Power grabbed! Now win', '★ 吃到道具了！拿下这局') : tr('★ Grab a power-up, then win', '★ 吃个道具再赢');
      return { center: world.twist.name[lang], sub: `${sub}  ·  ${tr(`floor crumbles in ${left}s`, `${left} 秒后崩塌`)}`, names };
    }
    return { center: world.twist.name[lang], sub: world.suddenDeath ? tr('SUDDEN DEATH: the floor is crumbling!', '决战时刻：地面正在崩塌！') : tr(`Floor crumbles in ${left}s`, `${left} 秒后地面崩塌`), names };
  }

  function touchLayer(): Touch | null {
    if (!touched || (screen !== 'fight' && screen !== 'count' && screen !== 'ko')) return null;
    const seats = oneSeat() ? [0] : [0, 1];
    const held = (seat: number, kind: 'fire' | 'dash') => [...fingers.values()].some((finger) => finger.seat === seat && finger.kind === kind);
    return {
      sticks: seats.map((seat) => { const finger = [...fingers.values()].find((item) => item.seat === seat && item.kind === 'stick'); return finger ? { x: finger.x, y: finger.y, dx: finger.dx, dy: finger.dy } : null; }),
      buttons: seats.flatMap((seat) => {
        const spot = seatButtons(seat);
        return [{ ...spot.fire, r: FIRE_R, label: tr('FIRE', '开火'), held: held(seat, 'fire') }, { ...spot.dash, r: DASH_R, label: tr('DASH', '冲刺'), held: held(seat, 'dash') }];
      })
    };
  }

  const point = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    // Turned a quarter clockwise, the canvas's x runs down the screen and its y runs right to left.
    if (rotated) return { x: (event.clientY - box.top) * WIDTH / box.height, y: (box.right - event.clientX) * HEIGHT / box.width };
    return { x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * HEIGHT / box.height };
  };
  const inside = (x: number, y: number, area: { x: number; y: number; w: number; h: number }) => x >= area.x && y >= area.y && x <= area.x + area.w && y <= area.y + area.h;

  function tourTap(x: number, y: number) {
    if (inside(x, y, TOUR_BACK_BOX)) { screen = 'menu'; audio.move(); return; }
    if (inside(x, y, TOUR_GO_BOX)) { if (tourUnlocked(career.tour, settings.stop)) startMatch(); return; }
    TOUR.forEach((_, index) => {
      const spot = tourNodeCenter(index);
      if (Math.hypot(x - spot.x, y - spot.y) > TOUR_NODE_R + 8 || !tourUnlocked(career.tour, index)) return;
      if (settings.stop === index) startMatch(); else { settings.stop = index; saveSettings(); audio.move(); }
    });
  }

  function menuTap(x: number, y: number) {
    if (inside(x, y, START_BOX)) { cursor = ROWS; startFromMenu(); return; }
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
    if (screen === 'tour') { tourTap(x, y); return; }
    if (screen === 'over') { if (overHold > 0) return; if (touched && x >= WIDTH / 2) backToMenu(); else startMatch(); return; }
    if (screen === 'card') { skipCard = true; return; }
    if (!touched || screen === 'result') return;
    const seat = oneSeat() ? 0 : x < WIDTH / 2 ? 0 : 1;
    const spot = seatButtons(seat);
    const kind = Math.hypot(x - spot.fire.x, y - spot.fire.y) < FIRE_R + 12 ? 'fire' : Math.hypot(x - spot.dash.x, y - spot.dash.y) < DASH_R + 12 ? 'dash' : 'stick';
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

  /**
   * Full screen on a phone held upright (iOS cannot lock landscape) would squeeze the arena into a 390px strip,
   * so the canvas is turned a quarter instead and the player turns the phone. The top edge keeps clear of the
   * shell's close and pause buttons.
   */
  let layout = '';
  function fitScreen() {
    const full = Boolean(root.closest('.is-immersive')), wide = innerWidth, tall = innerHeight;
    const turn = full && touched && tall > wide * 1.15;
    const next = `${full}|${turn}|${wide}x${tall}`;
    if (next === layout) return;
    layout = next; rotated = turn; canvas.dataset.rotated = turn ? '1' : '0';
    root.style.cssText = full ? `${rootStyle};position:fixed;inset:0;max-width:none;display:flex;align-items:center;justify-content:center;background:#10162a` : rootStyle;
    if (turn) canvas.style.cssText = `${canvasStyle};position:absolute;left:50%;top:calc(50% + 28px);width:${Math.floor(Math.min(tall - 64, wide * 16 / 9))}px;max-width:none;border:0;border-radius:0;transform:translate(-50%,-50%) rotate(90deg)`;
    else canvas.style.cssText = full ? `${canvasStyle};width:min(100vw,calc(100dvh*16/9));border:0;border-radius:0` : canvasStyle;
  }

  function frame(dt: number) {
    if (paused) return;
    fitScreen();
    const pads = !oneSeat() && screen !== 'menu' && screen !== 'tour' ? input.read() : null;
    const merged = input.readMerged();
    if (merged.justPressed[START] && screen !== 'menu' && screen !== 'tour') userPaused = !userPaused;
    else if (userPaused && merged.justPressed[SELECT]) backToMenu();
    if (!userPaused) {
      if (screen === 'menu') handleMenu(merged);
      else if (screen === 'tour') handleTour(merged);
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
  const debug = { state: () => ({ screen, settings, match, career, tourStop, tourRounds, coopCleared, frozen: world.tanks.some((tank) => tank.frozen > 0), soloScore, autoBot, rotated, twist: world.twist.id, time: world.time, tanks: world.tanks.map(({ x, y, hp, seat, team }) => ({ x, y, hp, seat, team })), shells: world.shells.length }) };
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
    instructions: 'Versus, co-op waves (a boss every fifth wave, endless after ten) or a 12-stop Solo Tour with three stars per stop; stars and wins earn hats for your wardrobe. Two players or one against a bot ladder (beat Hard to unlock the Boss). P1: WASD, F or Space fires, G dashes. P2: arrows, K or Enter fires, L dashes. Controllers and touch work too; on a phone, turn it sideways. Dash jumps pits and rams tanks; your own shells bounce back and hurt.',
    accent: '#ffd34d', mechanic: 'Bounce shells, ram, grab power-ups'
  },
  mount
};

export default game;
