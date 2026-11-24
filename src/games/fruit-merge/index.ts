import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { makeKit } from '../arcade-kit';
import { dailyKey, dailyRandom, dailyShareText, readDaily, recordDaily } from '../_shared/daily';
import { tr } from '../_shared/gamepad-panel';
import { FRUITS } from './fruits';
import { HELPER_CAP, JAR_PUZZLES, JAR_SKINS, MISSION_POOL, goalMet, jarStars, puzzleBudget, twoStarDrops, type FruitMode, type JarGoal, type Mission } from './modes';
import { H, W, createRenderer, type Effects, type View } from './render';
import { BOUNDS, MAX_DROP_TIER, RADII, STEP, TIER_COUNT, TOP_TIER, clampAim, createWorld, dropFruit, isSettled, popSmallest, prefill, shake, step, type SimEvent, type World } from './sim';

export { canMergeFruitTier } from './sim';

const BEST_KEY = 'fruit-merge-best', DISCOVERED_KEY = 'fruit-merge-discovered';
/** Sizes the canvas to the stage: as large as the width and the visible height allow, on phones and desktop. `--fo-bar` is the mode bar's height. */
const CANVAS_CSS = `.fo-canvas{width:max(230px,min(100%,440px,calc((100vh - 268px - var(--fo-bar,0px))*${W / H})));width:max(230px,min(100%,440px,calc((100dvh - 268px - var(--fo-bar,0px))*${W / H})))}`
  + `.is-immersive .fo-canvas,.game-stage:fullscreen .fo-canvas{width:max(230px,min(100%,620px,calc((100vh - 100px - var(--fo-bar,0px))*${W / H})));width:max(230px,min(100%,620px,calc((100dvh - 100px - var(--fo-bar,0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))*${W / H})))}`
  + `.versus .fo-canvas{width:max(160px,min(100%,440px,calc((100vh - 330px)*${W / H})));width:max(160px,min(100%,440px,calc((100dvh - 330px)*${W / H})))}`
  + `.fo-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 8px;margin:0 auto 6px;max-width:min(100%,820px);box-sizing:border-box;font:700 13px system-ui,sans-serif;color:#d6cef2;line-height:1.2}`
  + `.fo-bar button{min-height:38px;padding:0 10px;border:1px solid #5a3f86;border-radius:12px;background:#24163f;color:#fff;font:800 14px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}`
  + `.fo-bar button:disabled{opacity:.4;cursor:default}.fo-bar .fo-chip{padding:4px 8px;border-radius:9px;background:#2a1848;white-space:nowrap;font-size:12px}.fo-bar .fo-chip.is-done{background:#2f5a3a;color:#d8ffd8}`
  + `.fo-wrap{position:relative;width:fit-content;max-width:100%;margin:0 auto}`
  + `.fo-panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 12px;box-sizing:border-box;background:rgba(20,8,40,.8);border-radius:16px;color:#fff;font-family:system-ui,sans-serif;text-align:center;overflow-y:auto}`
  + `.fo-panel button{min-height:44px;padding:0 14px;border:1px solid #5a3f86;border-radius:12px;background:#24163f;color:#fff;font:800 15px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}`
  + `.fo-panel button.is-primary{background:#ff8f70;border-color:#ff8f70;color:#2a1024}.fo-panel button:disabled{opacity:.35;cursor:default}.fo-panel button.is-sel{outline:3px solid #ffd84a;outline-offset:2px}`;
const NO_RANDOM = () => 0.5;

export function goalText(goal: JarGoal): string {
  if (goal.kind === 'make') return tr(`Make a ${FRUITS[goal.tier].en}`, `合成${FRUITS[goal.tier].zh}`);
  if (goal.kind === 'chain') return tr(`Chain ×${goal.n}`, `连击 ×${goal.n}`);
  return tr(`Score ${goal.points}`, `得分 ${goal.points}`);
}
function missionText(m: Mission): string {
  if (m.kind === 'chain') return tr(`Chain ×${m.target}`, `连击 ×${m.target}`);
  if (m.kind === 'make') return tr(`Make ${FRUITS[m.tier!].en}`, `合成${FRUITS[m.tier!].zh}`);
  if (m.kind === 'count') return tr(`${m.target} × ${FRUITS[m.tier!].en}`, `${m.target} 个${FRUITS[m.tier!].zh}`);
  if (m.kind === 'merges') return tr(`${m.target} merges`, `合成 ${m.target} 次`);
  return tr(`${m.target} points`, `${m.target} 分`);
}

export const fruitMerge: GameModule = {
  meta: { slug: 'fruit-merge', title: 'Fruit Orbit', category: 'puzzle', description: 'Drop orbiting fruit and grow them into stellar giants.', instructions: 'Drag to aim and release to drop; arrows and Space work too. Match two alike to grow them.', accent: '#ff8f70', mechanic: 'Drop and merge fruit tiers' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'fruit-merge', W, H);
    const style = document.createElement('style'); style.textContent = CANVAS_CSS; host.prepend(style);
    k.canvas.classList.add('fo-canvas'); k.canvas.style.width = ''; k.canvas.style.background = '#150f33';
    const reduced = services.isReducedMotion, touch = Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
    const draw = createRenderer(k.ctx, k.canvas.width / W);
    const store = services.storage;
    // Split-screen seats always play the classic jar: no menu, no missions, no helpers.
    const versus = Boolean(host.closest?.('[data-versus-seat]'));

    // --- DOM: a mode bar above the jar, and an overlay for menus and puzzle results. ---
    const bar = document.createElement('div'); bar.className = 'fo-bar';
    const wrap = document.createElement('div'); wrap.className = 'fo-wrap';
    const panel = document.createElement('div'); panel.className = 'fo-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog');
    k.canvas.replaceWith(wrap); wrap.append(k.canvas, panel); wrap.before(bar);
    if (versus) bar.hidden = true;
    // On touch the stage puts its close and pause buttons in the top corners; keep the bar between them.
    else if (touch) bar.style.padding = '0 58px';
    const syncBar = () => host.style.setProperty('--fo-bar', `${versus ? 0 : bar.offsetHeight + 6}px`);

    let mode: FruitMode = 'classic', puzzleIndex = 0, dayKey = dailyKey();
    if (!versus) {
      const saved = store.get<string>('mode', 'classic');
      mode = saved === 'daily' || saved === 'puzzle' ? saved : 'classic';
      puzzleIndex = Math.min(JAR_PUZZLES.length - 1, Math.max(0, Math.floor(store.get<number>('puzzle-index', 0)) || 0));
    }
    let raf = 0, last = 0, acc = 0, paused = false;
    let world: World = createWorld(NO_RANDOM);
    let dropRandom: () => number = services.random;
    let heldX = W / 2, aimPointer: number | undefined, dropBuffer = 0, holdTime = 0, warnTick = 0;
    let bestAtStart = store.get<number>(BEST_KEY, 0), discovered = store.get<number>(DISCOVERED_KEY, MAX_DROP_TIER);
    let time = 0, lostFor = 0, hint = true, sparkSeed = 1;
    const fx: Effects = { sparks: [], rings: [], popups: [], flash: null };
    const stripPulse: number[] = Array.from({ length: TIER_COUNT }, () => 9);
    // Cosmetic scatter only; gameplay randomness always comes from services.random (or the daily / puzzle source).
    const scatter = () => { sparkSeed = (1664525 * sparkSeed + 1013904223) >>> 0; return sparkSeed / 2 ** 32; };
    /** Only the classic jar (and split-screen seats, which are always classic) touch the best score and the leaderboard. */
    const scoring = () => versus || mode === 'classic';
    const discovering = () => !versus && (mode === 'classic' || mode === 'daily');

    // Missions (classic only): three at a time from a rotating pool; each pays a capped helper item.
    type Slot = { mission: Mission; base: number; done: boolean };
    let slots: Slot[] = [], helpers = { shake: 0, pop: 0 };
    const made: number[] = Array(TIER_COUNT).fill(0);
    const statFor = (m: Mission) => m.kind === 'chain' ? world.bestChain : m.kind === 'make' ? (made.slice(m.tier!).some(Boolean) ? 1 : 0) : m.kind === 'count' ? made[m.tier!] : m.kind === 'merges' ? world.merges : world.score;
    const progress = (s: Slot) => (s.mission.kind === 'chain' || s.mission.kind === 'make' ? statFor(s.mission) : statFor(s.mission) - s.base);
    let cursor = 0;
    const nextMission = (): Slot => { const mission = MISSION_POOL[cursor % MISSION_POOL.length]; cursor++; store.set('mission-cursor', cursor % MISSION_POOL.length); return { mission, base: mission.kind === 'chain' || mission.kind === 'make' ? 0 : statFor(mission), done: false }; };
    const missionsOn = () => !versus && mode === 'classic';

    const skinId = () => { const id = store.get<string>('skin', JAR_SKINS[0].id); const skin = JAR_SKINS.find((s) => s.id === id); return skin && discovered >= skin.unlock ? skin : JAR_SKINS[0]; };
    let skin = skinId();
    const puzzleStars = () => { const list = store.get<number[]>('puzzle-stars', []); return JAR_PUZZLES.map((_, i) => Math.max(0, Math.min(3, Number(list[i]) || 0))); };
    const puzzleOpen = (i: number, stars = puzzleStars()) => i < 3 || stars[i - 1] > 0 || stars[i] > 0;
    let result: '' | 'won' | 'lost' = '', resultAt = 0, shareLine = '';
    let menu: '' | 'modes' | 'puzzles' = '', sel = 0;
    let todayBest: number | undefined;

    const reset = () => {
      paused = false; k.setPaused(false);
      menu = ''; result = ''; closePanel();
      if (!versus) { store.set('mode', mode); store.set('puzzle-index', puzzleIndex); }
      if (mode === 'daily' && !versus) { dayKey = dailyKey(); dropRandom = dailyRandom('fruit-merge', dayKey); world = createWorld(dropRandom); }
      else if (mode === 'puzzle' && !versus) { const p = JAR_PUZZLES[puzzleIndex]; dropRandom = NO_RANDOM; world = createWorld(NO_RANDOM, p.drops); prefill(world, p.fill); }
      else { dropRandom = services.random; world = createWorld(services.random); }
      bestAtStart = store.get<number>(BEST_KEY, 0);
      heldX = W / 2; aimPointer = undefined; dropBuffer = 0; holdTime = 0; warnTick = 0; lostFor = 0; acc = 0; hint = mode === 'classic';
      fx.sparks.length = fx.rings.length = fx.popups.length = 0; fx.flash = null;
      made.fill(0); helpers = { shake: 0, pop: 0 };
      cursor = store.get<number>('mission-cursor', 0);
      slots = missionsOn() ? [nextMission(), nextMission(), nextMission()] : [];
      skin = skinId();
      todayBest = mode === 'daily' ? readDaily(store).scores[dayKey] : undefined;
      refreshBar();
    };

    const burst = (x: number, y: number, tier: number, count: number, power: number) => {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const angle = scatter() * Math.PI * 2, speed = power * (0.45 + scatter() * 0.75), life = 0.35 + scatter() * 0.3;
        fx.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - power * 0.25, life, max: life, color: i % 3 ? FRUITS[tier].color : FRUITS[tier].light, size: 2.2 + scatter() * 2.4 });
      }
    };
    const popup = (x: number, y: number, text: string, color: string, size: number, life = 0.9) => { fx.popups.push({ x, y, text, color, size, life, max: life }); };
    /** One centred banner at a time, so a fast cascade reads as a single climbing counter. */
    const banner = (text: string, color: string, size: number, life = 1.2) => { fx.popups = fx.popups.filter(p => !p.banner); fx.popups.push({ x: W / 2, y: BOUNDS.lineY + 104, text, color, size, life, max: life, banner: true }); };

    /** One cue per merge, climbing in pitch as a chain builds. */
    const mergeCue = (chain: number, milestone: boolean) => {
      if (milestone) services.sound.play('upgrade');
      else if (chain <= 1) services.sound.play('merge');
      else if (chain === 2) services.sound.play('collect');
      else if (chain === 3) services.sound.play('clear');
      else if (chain === 4) services.sound.play('upgrade');
      else services.sound.play('success');
    };
    const cueTimers: number[] = [];
    const later = (ms: number, fn: () => void) => { cueTimers.push(globalThis.setTimeout(fn, ms) as unknown as number); };

    /** Moon Melon and up get a jar-wide flash and a bigger burst; the Sun Melon gets a full finale with falling sparks. */
    const celebrate = (x: number, y: number, tier: number) => {
      const fruit = FRUITS[tier];
      fx.flash = { color: tier === TOP_TIER ? '#ffe27a' : fruit.light, life: tier === TOP_TIER ? 1.6 : 0.8, max: tier === TOP_TIER ? 1.6 : 0.8 };
      for (let i = 0; i < 3; i++) fx.rings.push({ x, y, from: RADII[tier] * 0.5, to: RADII[tier] + 40 + i * 30, life: 0.6 + i * 0.2, max: 0.6 + i * 0.2, color: i % 2 ? '#ffffff' : fruit.light });
      burst(x, y, tier, 40, 260);
      banner(tr(`${fruit.en}!`, `${fruit.zh}！`), fruit.light, tier === TOP_TIER ? 34 : 28, 2.2);
      services.sound.play('success'); later(160, () => services.sound.play('upgrade')); later(320, () => services.sound.play('success'));
      if (tier === TOP_TIER) {
        popup(W / 2, BOUNDS.lineY + 150, tr('The biggest fruit there is', '最大的水果诞生了'), '#ffffff', 16, 2.6);
        if (!reduced) for (let i = 0; i < 70; i++) { const life = 1.4 + scatter() * 1.2; fx.sparks.push({ x: 20 + scatter() * (W - 40), y: -10 - scatter() * 120, vx: (scatter() - 0.5) * 60, vy: 40 + scatter() * 80, life, max: life, color: ['#ffe27a', '#37b85a', '#ffffff', '#ff8f70'][i % 4], size: 2.5 + scatter() * 2.5 }); }
        later(520, () => services.sound.play('success'));
      }
      if (touch) globalThis.navigator?.vibrate?.(tier === TOP_TIER ? [20, 40, 20, 40, 60] : [16, 30, 24]);
    };

    const missionCheck = () => {
      if (!missionsOn()) return;
      let changed = false;
      slots.forEach((slot, i) => {
        if (slot.done || progress(slot) < slot.mission.target) return;
        slot.done = true; changed = true;
        const kind = slot.mission.reward;
        helpers[kind] = Math.min(HELPER_CAP, helpers[kind] + 1);
        banner(tr(`Mission done! +${kind === 'shake' ? 'Shake' : 'Pop'}`, `任务完成！+${kind === 'shake' ? '摇一摇' : '戳破最小'}`), '#8ef0d0', 20, 1.6);
        services.sound.play('collect');
        // A finished mission makes room for the next one after a short beat, so the tick is visible first.
        later(1400, () => { if (slots[i] === slot && missionsOn()) { slots[i] = nextMission(); refreshBar(); } });
      });
      if (changed) refreshBar();
    };

    const handle = (event: SimEvent) => {
      if (event.type === 'merge') {
        const { x, y, tier, chain } = event, r = RADII[tier];
        fx.rings.push({ x, y, from: r * 0.6, to: r + 22, life: 0.4, max: 0.4, color: FRUITS[tier].light });
        burst(x, y, tier, Math.min(18, 7 + tier * 2), 90 + tier * 14);
        popup(x, y - r * 0.4, `+${event.points}`, '#ffffff', Math.min(26, 16 + tier * 1.2));
        if (chain >= 2) banner(`${tr('CHAIN', '连击')} ×${chain}`, '#ffd84a', Math.min(30, 20 + chain * 2));
        stripPulse[tier] = 0;
        made[tier]++;
        const milestone = event.newBiggest && tier > MAX_DROP_TIER;
        if (tier >= 8) celebrate(x, y, tier);
        else if (milestone) popup(W / 2, BOUNDS.lineY + 140, tr(`${FRUITS[tier].en}!`, `${FRUITS[tier].zh}！`), FRUITS[tier].light, 22, 1.5);
        if (milestone && scoring()) services.reportComplete(tier);
        if (discovering() && tier > discovered) {
          discovered = tier; store.set(DISCOVERED_KEY, discovered);
          const unlocked = JAR_SKINS.find((s) => s.unlock === tier);
          if (unlocked) later(900, () => banner(tr(`New jar: ${unlocked.name[0]}!`, `新罐子：${unlocked.name[1]}！`), '#ffd84a', 20, 2));
        }
        mergeCue(chain, milestone);
        if (scoring()) k.score(world.score);
        missionCheck();
      } else if (event.type === 'land') {
        if (event.speed > 260) { services.sound.play('tap'); burst(event.x, event.y + RADII[event.tier] * 0.7, event.tier, 4, 55); }
      } else {
        lostFor = 0; aimPointer = undefined; dropBuffer = 0;
        services.sound.play('fail');
        if (scoring()) k.score(world.score);
        if (mode === 'daily' && !versus) { const rec = recordDaily(store, world.score, '', dayKey); todayBest = rec.scores[dayKey]; shareLine = dailyShareText('Fruit Orbit', world.score, rec.streak, dayKey, /^zh\b/i.test(globalThis.navigator?.language || '')); refreshBar(); }
        if (mode === 'puzzle' && !versus) finishPuzzle(false);
      }
    };

    const dropped = () => { hint = false; dropBuffer = 0; heldX = clampAim(heldX, world.current); services.sound.play('move'); refreshBar(); };
    /** Drops now, or remembers the press for a moment so a tap just before the next fruit is ready still counts. */
    const requestDrop = () => { if (menu || result) return; if (dropFruit(world, heldX, dropRandom)) dropped(); else if (world.current >= 0) dropBuffer = 0.35; };
    const retry = () => { if (lostFor > 0.8 && !result) { reset(); services.sound.play('tap'); } };
    const aimAt = (x: number) => { heldX = clampAim(x, world.current); };

    // --- Helpers (classic). ---
    const useShake = () => {
      if (!missionsOn() || helpers.shake <= 0 || world.over || paused || menu) return;
      helpers.shake--; shake(world); services.sound.play('jump'); banner(tr('Shake!', '摇一摇！'), '#aab6ff', 24, 0.9); refreshBar();
    };
    const usePop = () => {
      if (!missionsOn() || helpers.pop <= 0 || world.over || paused || menu) return;
      const gone = popSmallest(world);
      if (!gone) return;
      helpers.pop--; services.sound.play('clear'); burst(gone.x, gone.y, gone.tier, 14, 140);
      fx.rings.push({ x: gone.x, y: gone.y, from: gone.r, to: gone.r + 26, life: 0.4, max: 0.4, color: '#ffffff' });
      refreshBar();
    };

    // --- Mode bar. ---
    function refreshBar() {
      if (versus) return;
      const parts: string[] = [];
      const label = mode === 'classic' ? tr('Classic', '经典') : mode === 'daily' ? `${tr('Daily', '每日一罐')} ${dayKey.slice(5)}` : `${tr('Jar', '罐子')} ${puzzleIndex + 1} · ${tr(...JAR_PUZZLES[puzzleIndex].name)}`;
      parts.push(`<button type="button" data-fo="menu" aria-label="${tr('Mode', '模式')}: ${label}">☰ ${label}</button>`);
      if (mode === 'classic') {
        parts.push(`<button type="button" data-fo="shake" ${helpers.shake ? '' : 'disabled'} title="${tr('Shake the jar (Q)', '摇一摇（Q）')}">${tr('Shake', '摇一摇')} ${helpers.shake}</button>`);
        parts.push(`<button type="button" data-fo="pop" ${helpers.pop ? '' : 'disabled'} title="${tr('Pop the smallest fruit (E)', '戳破最小的水果（E）')}">${tr('Pop', '戳破')} ${helpers.pop}</button>`);
        if (touch) parts.push('<span style="flex-basis:100%;height:0"></span>');
        for (const slot of slots) parts.push(`<span class="fo-chip${slot.done ? ' is-done' : ''}">${slot.done ? '✓ ' : ''}${missionText(slot.mission)}${slot.done || slot.mission.kind === 'make' ? '' : ` ${Math.min(progress(slot), slot.mission.target)}/${slot.mission.target}`} ${touch ? '' : `<b style="color:#ffd84a"> +${slot.mission.reward === 'shake' ? tr('Shake', '摇') : tr('Pop', '戳')}</b>`}</span>`);
      } else if (mode === 'daily') {
        const d = readDaily(store);
        parts.push(`<span class="fo-chip">${tr(`Streak ${d.streak}`, `连续 ${d.streak} 天`)}</span>`);
        if (world.over && shareLine) parts.push(`<button type="button" data-fo="share">${tr('Copy result', '复制成绩')}</button>`);
      } else {
        const p = JAR_PUZZLES[puzzleIndex], left = Math.max(0, puzzleBudget(p) - world.drops);
        parts.push(`<span class="fo-chip">🎯 ${goalText(p.goal)}</span><span class="fo-chip">${tr(`${left} drops left`, `剩 ${left} 次`)} · ★★★ ≤ ${p.par}</span>`);
      }
      bar.innerHTML = parts.join('');
      syncBar();
    }

    // --- Overlay panel: mode menu, puzzle picker, puzzle result. ---
    const panelButtons = () => [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const mark = () => panelButtons().forEach((b, i) => b.classList.toggle('is-sel', i === sel));
    const openPanel = (html: string, first = 0) => { panel.innerHTML = html; panel.hidden = false; sel = first; mark(); };
    function closePanel() { panel.hidden = true; panel.innerHTML = ''; }
    const showModes = () => {
      menu = 'modes'; aimPointer = undefined;
      const best = store.get<number>(BEST_KEY, 0), daily = readDaily(store), stars = puzzleStars().reduce((a, b) => a + b, 0);
      const item = (id: FruitMode, title: string, blurb: string, detail: string) => `<button type="button" data-mode="${id}" style="display:block;width:100%;max-width:300px;text-align:left;padding:8px 12px;${id === mode ? 'border-color:#ff8f70;' : ''}"><span style="display:flex;justify-content:space-between;gap:8px"><b>${title}</b><span style="color:#ffd84a;font-size:13px">${detail}</span></span><span style="display:block;color:#c4bce6;font:600 13px system-ui,sans-serif">${blurb}</span></button>`;
      const skins = JAR_SKINS.map((s) => { const open = discovered >= s.unlock; return `<button type="button" data-skin="${s.id}" ${open ? '' : 'disabled'} title="${open ? tr(...s.name) : tr(`Make a ${FRUITS[s.unlock].en} to unlock`, `合成${FRUITS[s.unlock].zh}解锁`)}" style="min-width:0;padding:0 8px;font-size:13px;background:linear-gradient(${s.sky.join(',')});${s.id === skin.id ? 'border-color:#ffd84a;' : ''}">${open ? tr(...s.name) : '🔒'}</button>`; }).join('');
      openPanel(`<div style="font-weight:800;letter-spacing:.08em;color:#ffb39f">${tr('CHOOSE A JAR', '选择玩法')}</div>`
        + item('classic', tr('Classic', '经典'), tr('Endless jar with missions and helpers.', '无尽模式，带任务和道具。'), best ? tr(`Best ${best}`, `最高 ${best}`) : '')
        + item('daily', tr('Daily jar', '每日一罐'), tr('Same drop order for everyone today.', '今天所有人掉落顺序相同。'), daily.lastKey === dailyKey() ? tr(`Played · ${daily.scores[dailyKey()] ?? 0}`, `已玩 · ${daily.scores[dailyKey()] ?? 0}`) : tr('New today', '今日新题'))
        + item('puzzle', tr('Jar puzzles', '罐子谜题'), tr('20 set jars, a goal and a drop limit.', '20 个预设罐子，有目标和次数限制。'), `★ ${stars}/${JAR_PUZZLES.length * 3}`)
        + `<div style="font-size:12px;color:#c4bce6;margin-top:4px">${tr('Jar skin · unlocked by new fruit', '罐子外观 · 合成新水果解锁')}</div><div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:320px">${skins}</div>`
        + `<button type="button" data-fo-close>${tr('Back', '返回')}</button>`, mode === 'classic' ? 0 : mode === 'daily' ? 1 : 2);
    };
    const showPuzzles = () => {
      menu = 'puzzles';
      const stars = puzzleStars();
      const cells = JAR_PUZZLES.map((p, i) => { const open = puzzleOpen(i, stars); return `<button type="button" data-puzzle="${i}" ${open ? '' : 'disabled'} title="${tr(...p.name)}" style="min-width:0;padding:2px 0;line-height:1.1;${i === puzzleIndex ? 'border-color:#ff8f70;' : ''}">${open ? i + 1 : '🔒'}<br><span style="font-size:11px;color:#ffd84a">${'★'.repeat(stars[i])}<span style="color:#5a3f86">${'★'.repeat(3 - stars[i])}</span></span></button>`; }).join('');
      const first = Math.max(0, JAR_PUZZLES.findIndex((_, i) => puzzleOpen(i, stars) && stars[i] < 3));
      openPanel(`<div style="font-weight:800;letter-spacing:.08em;color:#ffb39f">${tr('JAR PUZZLES', '罐子谜题')} · ★ ${stars.reduce((a, b) => a + b, 0)}/${JAR_PUZZLES.length * 3}</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;max-width:280px">${cells}</div><button type="button" data-fo-close>${tr('Back', '返回')}</button>`, first);
    };
    function finishPuzzle(won: boolean) {
      if (result) return;
      const p = JAR_PUZZLES[puzzleIndex], stars = won ? jarStars(p, world.drops) : 0;
      result = won ? 'won' : 'lost'; resultAt = time;
      if (won) {
        const list = puzzleStars();
        if (stars > list[puzzleIndex]) { list[puzzleIndex] = stars; store.set('puzzle-stars', list); }
        services.sound.play('success'); later(150, () => services.sound.play('upgrade'));
      } else services.sound.play('fail');
      const actions = [won && puzzleIndex + 1 < JAR_PUZZLES.length ? `<button type="button" class="is-primary" data-fo-next>${tr('Next jar', '下一个')}</button>` : '', `<button type="button" ${won && puzzleIndex + 1 < JAR_PUZZLES.length ? '' : 'class="is-primary"'} data-fo-retry>${tr('Retry', '重试')}</button>`, `<button type="button" data-fo-puzzles>${tr('All jars', '全部谜题')}</button>`].filter(Boolean).join('');
      // A win waits long enough for the celebration (and the Sun Melon finale) to play out before the card covers it.
      later(won ? (JAR_PUZZLES[puzzleIndex].goal.kind === 'make' && (JAR_PUZZLES[puzzleIndex].goal as { tier: number }).tier >= 8 ? 2600 : 1100) : 400, () => {
        if (result !== (won ? 'won' : 'lost')) return;
        openPanel(`<div style="font-weight:800;letter-spacing:.08em;color:${won ? '#8ef0d0' : '#ff9aa8'}">${won ? tr('GOAL MET!', '目标达成！') : world.over ? tr('JAR OVERFLOW', '罐子满了') : tr('OUT OF DROPS', '次数用完了')}</div>`
          + `<div style="color:#d6cef2">${tr('Jar', '罐子')} ${puzzleIndex + 1} · ${tr(...p.name)} · ${goalText(p.goal)}</div>`
          + `<div style="font-size:40px;line-height:1"><span style="color:#ffd84a">${'★'.repeat(stars)}</span><span style="color:#5a3f86">${'★'.repeat(3 - stars)}</span></div>`
          + `<div style="color:#c4bce6">${tr(`${world.drops} drop${world.drops === 1 ? '' : 's'} · ★★★ ≤ ${p.par} · ★★ ≤ ${twoStarDrops(p)}`, `用了 ${world.drops} 次 · ★★★ ≤ ${p.par} · ★★ ≤ ${twoStarDrops(p)}`)}</div>`
          + `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${actions}</div>`);
      });
    }
    const startMode = (next: FruitMode, index = puzzleIndex) => { mode = next; puzzleIndex = index; services.sound.play('tap'); reset(); k.canvas.focus({ preventScroll: true }); };
    const leaveMenu = () => { menu = ''; closePanel(); if (result) { const r = result; result = ''; finishPuzzle(r === 'won'); } k.canvas.focus({ preventScroll: true }); };
    const onPanelClick = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target || target.disabled || paused) return;
      if (target.dataset.mode) { const m = target.dataset.mode as FruitMode; if (m === 'puzzle') showPuzzles(); else startMode(m); }
      else if (target.dataset.puzzle) startMode('puzzle', Number(target.dataset.puzzle));
      else if (target.dataset.skin) { store.set('skin', target.dataset.skin); skin = skinId(); services.sound.play('tap'); showModes(); }
      else if (target.hasAttribute('data-fo-close')) { if (menu === 'puzzles') showModes(); else leaveMenu(); }
      else if (target.hasAttribute('data-fo-next')) startMode('puzzle', puzzleIndex + 1);
      else if (target.hasAttribute('data-fo-retry')) startMode('puzzle', puzzleIndex);
      else if (target.hasAttribute('data-fo-puzzles')) showPuzzles();
    };
    panel.addEventListener('click', onPanelClick);
    const onBarClick = (event: Event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-fo]')?.dataset.fo;
      if (!action || paused) return;
      if (action === 'menu') { if (menu) leaveMenu(); else showModes(); }
      else if (action === 'shake') useShake();
      else if (action === 'pop') usePop();
      else if (action === 'share') void globalThis.navigator?.clipboard?.writeText(shareLine).then(() => { const b = bar.querySelector('[data-fo=share]'); if (b) b.textContent = tr('Copied!', '已复制！'); }, () => undefined);
      k.canvas.focus({ preventScroll: true });
    };
    bar.addEventListener('click', onBarClick);
    const navigate = (key: string) => {
      const buttons = panelButtons(), n = buttons.length;
      if (!n) return;
      const stepBy = menu === 'puzzles' ? 4 : 1;
      if (key === 'ArrowLeft' || key === 'a') sel = (sel - 1 + n) % n;
      else if (key === 'ArrowRight' || key === 'd') sel = (sel + 1) % n;
      else if (key === 'ArrowUp' || key === 'w') sel = sel - stepBy >= 0 ? sel - stepBy : (sel - 1 + n) % n;
      else if (key === 'ArrowDown' || key === 's') sel = sel + stepBy < n ? sel + stepBy : (sel + 1) % n;
      else return;
      mark(); services.sound.play('move');
    };

    k.on('pointerdown', event => {
      const e = event as PointerEvent;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (menu || result) return;
      if (world.over) { retry(); return; }
      aimPointer = e.pointerId; aimAt(k.point(e).x);
      try { k.canvas.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    });
    k.on('pointermove', event => { const e = event as PointerEvent; if (!world.over && !menu && (e.pointerType === 'mouse' || e.pointerId === aimPointer)) aimAt(k.point(e).x); });
    k.on('pointerup', event => { const e = event as PointerEvent; if (e.pointerId !== aimPointer) return; aimPointer = undefined; if (world.over || menu) return; aimAt(k.point(e).x); requestDrop(); });
    k.on('pointercancel', () => { aimPointer = undefined; });
    k.on('keydown', event => {
      const e = event as KeyboardEvent, key = e.key;
      if (menu || (result && !panel.hidden)) {
        if (e.repeat) return;
        if (key === ' ' || key === 'Enter') { e.preventDefault(); if (!result || time - resultAt > 1) panelButtons()[sel]?.click(); }
        else if (key === 'Escape' || key === 'm' || key === 'M') { if (menu === 'puzzles') showModes(); else if (menu) leaveMenu(); else showModes(); }
        else if ((key === 'r' || key === 'R') && result) startMode('puzzle', puzzleIndex);
        else navigate(key);
        return;
      }
      if ((key === 'm' || key === 'M') && !versus && !e.repeat) { showModes(); return; }
      if ((key === 'q' || key === 'Q') && !e.repeat) { useShake(); return; }
      if ((key === 'e' || key === 'E') && !e.repeat) { usePop(); return; }
      if (key === ' ' || key === 'Enter') { e.preventDefault(); if (e.repeat) return; if (world.over) retry(); else requestDrop(); }
      else if (world.over) { if (key === 'r' || key === 'R') retry(); }
      else if ((key === 'r' || key === 'R') && mode === 'puzzle' && !versus && !e.repeat) startMode('puzzle', puzzleIndex);
      else if (!e.repeat && (key === 'ArrowLeft' || key === 'a' || key === 'A')) aimAt(heldX - 5);
      else if (!e.repeat && (key === 'ArrowRight' || key === 'd' || key === 'D')) aimAt(heldX + 5);
    });

    let judged = false;
    const update = () => {
      time += STEP;
      for (let i = 0; i < TIER_COUNT; i++) stripPulse[i] += STEP;
      for (const s of fx.sparks) { s.life -= STEP; s.x += s.vx * STEP; s.y += s.vy * STEP; s.vy += 420 * STEP; }
      for (const ring of fx.rings) ring.life -= STEP;
      for (const p of fx.popups) p.life -= STEP;
      if (fx.flash) { fx.flash.life -= STEP; if (fx.flash.life <= 0) fx.flash = null; }
      fx.sparks = fx.sparks.filter(s => s.life > 0); fx.rings = fx.rings.filter(ring => ring.life > 0); fx.popups = fx.popups.filter(p => p.life > 0);
      if (world.over) { lostFor += STEP; return; }
      if (menu) return;
      // A tap nudges (handled on keydown); holding glides and speeds up for long crossings.
      const direction = (k.keys.has('ArrowRight') || k.keys.has('d') || k.keys.has('D') ? 1 : 0) - (k.keys.has('ArrowLeft') || k.keys.has('a') || k.keys.has('A') ? 1 : 0);
      if (direction && !result) { holdTime += STEP; if (holdTime > 0.16) aimAt(heldX + direction * Math.min(380, 150 + (holdTime - 0.16) * 520) * STEP); } else holdTime = 0;
      heldX = clampAim(heldX, world.current);
      if (dropBuffer > 0) { dropBuffer -= STEP; if (!result && dropFruit(world, heldX, dropRandom)) dropped(); }
      step(world);
      if (world.events.length) { const events = world.events; world.events = []; events.forEach(handle); }
      if (world.overflowing && !world.over) { warnTick -= STEP; if (warnTick <= 0) { services.sound.play('hit'); warnTick = 0.7; } } else warnTick = 0.3;
      // Jar puzzles: the goal is checked continuously; running out of drops is judged once the jar has settled.
      if (mode === 'puzzle' && !versus && !result && !world.over) {
        const p = JAR_PUZZLES[puzzleIndex];
        if (goalMet(p.goal, world)) finishPuzzle(true);
        else if (world.current < 0 && world.cooldown <= 0 && isSettled(world)) { if (judged) finishPuzzle(false); judged = true; }
        else judged = false;
      }
    };

    const view = (): View => ({ world, fx, heldX, best: Math.max(bestAtStart, world.score), newBest: scoring() && world.score > bestAtStart && world.score > 0, discovered, stripPulse, time, lostFor, paused, hint, reduced, touch, t: tr, skin, hideOverCard: mode === 'puzzle' && !versus, subline: sublineText() });
    function sublineText(): string | undefined {
      if (versus || mode === 'classic') return undefined;
      if (mode === 'puzzle') return `🎯 ${goalText(JAR_PUZZLES[puzzleIndex].goal)}`;
      const today = todayBest;
      return today === undefined ? tr('DAILY', '每日') : `${tr('TODAY', '今日最佳')} ${Math.max(today, world.score).toLocaleString('en-US')}`;
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!paused) { acc += dt; while (acc >= STEP) { update(); acc -= STEP; } }
      draw(view());
    };
    reset();
    draw(view());
    last = typeof performance === 'undefined' ? 0 : performance.now();
    raf = requestAnimationFrame(frame);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncBar);
    observer?.observe(bar);

    k.canvas.focus({ preventScroll: true });
    return {
      pause: () => { paused = true; aimPointer = undefined; dropBuffer = 0; k.setPaused(true); },
      resume: () => { paused = false; acc = 0; k.setPaused(false); k.canvas.focus({ preventScroll: true }); },
      restart: () => { reset(); k.canvas.focus({ preventScroll: true }); },
      destroy: () => { cancelAnimationFrame(raf); cueTimers.forEach((t) => globalThis.clearTimeout(t)); observer?.disconnect(); panel.removeEventListener('click', onPanelClick); bar.removeEventListener('click', onBarClick); bar.remove(); wrap.remove(); style.remove(); k.dispose(); }
    };
  }
};
export default fruitMerge;
