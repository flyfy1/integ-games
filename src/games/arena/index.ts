import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { seededRandom } from '../../core/services';
import { dailyKey, dailySeed, dailyShareText, playedToday, readDaily, recordDaily } from '../_shared/daily';
import { clamp, makeKit } from '../arcade-kit';
import { BASE_PASSIVES, BASE_WEAPONS, GENERAL_IDS, PASSIVE_IDS, STAGES, WEAPON_IDS, type GeneralId, type StageId, type WeaponId } from './data';
import { backRect, ENTRIES, campLayout, collectionLayout, drawCamp, drawCollection, drawTalents, hitIndex, inside, talentRows, tiles, type DailyInfo } from './menu';
import { PROFILE_KEY, STAGE_CHAIN, TALENT_IDS, bankRun, buyTalent, liveTotals, newFeats, readProfile, talentBonus, type Feat, type Profile } from './meta';
import { burstRect, cardRects, createRenderer, resultButtons, xpBarRect, type Ui, type View } from './render';
import { chooseUpgrade, closeChest, createState, runJade, step, STEP, type Input, type RunConfig, type SimEvent, type State } from './sim';
import { generalName, itemName, stageName, tr } from './text';

/**
 * Pocket Survivor shell: owns the canvas size, input, the camp screens, audio cues and the fixed-step loop. The rules
 * live in `sim.ts`, the meta track in `meta.ts`, run drawing in `render.ts` and the camp screens in `menu.ts`.
 */
const BEST_KEY = 'arena-best';
const SLUG = 'arena';
type Stick = { id: number; x: number; y: number; dx: number; dy: number };
type Screen = 'camp' | 'talents' | 'collection' | 'run';
type Loadout = { stage: StageId; general: GeneralId; daily: boolean };

/** Today's Daily: one stage and general for everyone, picked from the date seed. */
export function dailyLoadout(key = dailyKey()): { stage: StageId; general: GeneralId; seed: number } {
  const seed = dailySeed(SLUG, key);
  return { stage: STAGE_CHAIN[seed % STAGE_CHAIN.length], general: GENERAL_IDS[(seed >>> 5) % GENERAL_IDS.length], seed };
}
/** Run configuration for a loadout. The Daily ignores talents and unlocks, and deals cards from its own stream. */
export function runConfig(loadout: Loadout, profile: Profile | null, key = dailyKey()): { rng: () => number; config: RunConfig } | { config: RunConfig } {
  if (loadout.daily) {
    const daily = dailyLoadout(key);
    return { rng: seededRandom(daily.seed), config: { stage: daily.stage, general: daily.general, weapons: WEAPON_IDS, passives: PASSIVE_IDS, cardRng: seededRandom(daily.seed ^ 0x5bd1e995) } };
  }
  if (!profile) return { config: { stage: 'march', general: 'spear', weapons: BASE_WEAPONS, passives: BASE_PASSIVES } };
  return { config: { stage: loadout.stage, general: loadout.general, bonus: talentBonus(profile), weapons: profile.weapons, passives: profile.passives } };
}

export const arena: GameModule = { meta: { slug: 'arena', title: 'Pocket Survivor', category: 'action', description: 'Lead a lone spear general through four battlegrounds, evolve five weapons and defeat the Warlord at 5:00.', instructions: 'Move with WASD, arrows, drag, or the virtual stick. Attacks are automatic; pick an upgrade each level. Space or Attack fires your Burst when it is charged.', accent: '#70f0c2', mechanic: 'Move, auto-attack, choose upgrades' }, mount(host: HTMLElement, services: GameServices): GameController {
  const k = makeKit(host, services, 'arena');
  const canvas = k.canvas, ctx = k.ctx, renderer = createRenderer(services.isReducedMotion), reduced = services.isReducedMotion;
  const touch = !!host.querySelector('.mobile-controls'), seat = host.hasAttribute('data-versus-seat');
  // Shell buttons (Restart, Pause) take keyboard focus; hand it back so WASD keeps working.
  const focus = () => { if (!seat) canvas.focus({ preventScroll: true }); };
  const knob = host.querySelector<HTMLElement>('.mobile-stick span');
  const view: View = { w: 360, h: 560, scale: 1 };
  let dpr = 1, raf = 0, last = 0, acc = 0, paused = false;
  // Two versus seats share one storage, so a seat never reads or writes the meta profile.
  const profile: Profile | null = seat ? null : readProfile(services.storage.get(PROFILE_KEY, null));
  const save = () => { if (profile) services.storage.set(PROFILE_KEY, profile); };
  let screen: Screen = seat ? 'run' : 'camp';
  let loadout: Loadout = { stage: profile?.last.stage ?? 'march', general: profile?.last.general ?? 'spear', daily: false };
  let stageSel = Math.max(0, ENTRIES.indexOf(loadout.stage)), talentSel = 0, tileSel = 0, campFlash = 0;
  let state: State = createState(services.random, runConfig(loadout, profile).config);
  let stick: Stick | null = null, burstQueued = false, selected = 0, lock = 0, clock = 0, best = 0, newBest = false, reported = 0, reportTimer = 0;
  let attackCueCooldown = 0, hurtCueCooldown = 0, collectCueCooldown = 0, barFlash = false;
  let chestAge: number | undefined, chestCues = 0, evolveAge = 9, evolveKey = '', slowmo = 0, featTimer = 0;
  let announced = new Set<string>(), result: Ui['result'], shareText = '';

  // ---- stage sizing: fill the stage on phones and desktop instead of a fixed 360x560 box ----
  const layout = () => {
    const style = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
    const fill = host.classList.contains('is-immersive') || document.fullscreenElement === host;
    const controls = host.querySelector<HTMLElement>('.mobile-controls');
    let controlsHeight = 0;
    if (controls) { const css = getComputedStyle(controls); if (css.display !== 'none' && css.position !== 'absolute') controlsHeight = controls.offsetHeight; }
    const hostWidth = host.clientWidth - pad(style.paddingLeft, style.paddingRight);
    let width = hostWidth > 40 ? hostWidth : 360;
    let height = fill && host.clientHeight > 0 ? host.clientHeight - pad(style.paddingTop, style.paddingBottom) - controlsHeight : clamp(window.innerHeight - (seat ? 270 : 230), 320, 660);
    height = Math.floor(clamp(height, 240, width * 1.75)); width = Math.floor(Math.min(width, height * 1.9, 1500));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (view.w !== width || view.h !== height || canvas.width !== Math.round(width * dpr)) {
      view.w = width; view.h = height; view.scale = clamp(Math.min(width, height) / 380, 0.75, 2.4);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.style.aspectRatio = 'auto'; canvas.style.maxWidth = '100%';
    }
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
  observer?.observe(host);
  window.addEventListener('resize', layout);

  const dailyInfo = (): DailyInfo => {
    const today = dailyLoadout(), record = readDaily(services.storage), key = dailyKey();
    return { stage: today.stage, general: today.general, streak: record.streak, best: record.scores[key] ?? null, played: playedToday(services.storage) };
  };
  /** Starts a run with the given loadout (also used by the shell's Restart button). */
  const startRun = (next: Loadout) => {
    loadout = next;
    const made = runConfig(next, profile);
    state = createState('rng' in made ? made.rng : services.random, made.config);
    if (profile && !next.daily) { profile.last = { stage: next.stage, general: next.general }; save(); }
    screen = 'run'; resetRun();
  };
  const resetRun = () => {
    paused = false; k.setPaused(false);
    renderer.reset(); k.fx.clear();
    stick = null; burstQueued = false; selected = touch ? -1 : 0; lock = 0; acc = 0; clock = 0; newBest = false; reported = 0; reportTimer = 0;
    attackCueCooldown = 0; hurtCueCooldown = 0; collectCueCooldown = 0; barFlash = false;
    chestAge = undefined; chestCues = 0; evolveAge = 9; evolveKey = ''; slowmo = 0; featTimer = 0; announced = new Set(); result = undefined; shareText = '';
    best = services.storage.get(BEST_KEY, 0);
    if (loadout.daily) renderer.banner(tr('DAILY BATTLE', '每日战役'), 'good', 2.4);
    focus();
  };
  const toCamp = () => { screen = 'camp'; stick = null; paused = false; k.setPaused(false); k.fx.clear(); stageSel = loadout.daily ? ENTRIES.indexOf('daily') : Math.max(0, ENTRIES.indexOf(loadout.stage)); focus(); };
  const reset = () => { if (screen === 'run') startRun(loadout); else focus(); };
  const report = () => { if (state.score !== reported) { reported = state.score; k.score(state.score); } };
  const choose = (index: number) => {
    if (state.phase !== 'levelup' || lock > 0 || state.chest) return;
    const card = state.choices[index], rect = cardRects(view, state.choices.length)[index];
    if (!card || !chooseUpgrade(state, index)) return;
    k.fx.clear(); barFlash = false;
    if (!reduced) k.fx.burst(rect.x + rect.w / 2, rect.y + rect.h / 2, card.color, 14);
    if (!card.evolve) renderer.banner(itemName(card.key).toUpperCase(), 'good', 1.6);
    services.reportComplete(state.level); services.sound.play('merge');
    selected = touch ? -1 : 0;
    drain();
  };
  const unlockName = (feat: Feat) => feat.unlock.kind === 'general' ? generalName(feat.unlock.id) : itemName(feat.unlock.id);
  /** Banks the finished run into the profile and the Daily record, and builds the extra result lines. */
  const finishRun = () => {
    const lines: { text: string; color?: string }[] = [];
    if (profile) {
      const jade = runJade(state), banked = bankRun(profile, state, jade, loadout.daily);
      save();
      lines.push({ text: tr(`+${jade} jade (${profile.jade} banked)`, `+${jade} 玉石（共 ${profile.jade}）`) });
      for (const feat of banked.unlocked) lines.push({ text: tr(`Unlocked: ${unlockName(feat)}!`, `解锁：${unlockName(feat)}！`), color: '#b3262b' });
      for (const stage of banked.stagesOpened) lines.push({ text: tr(`New battleground: ${stageName(stage)}`, `新战场：${stageName(stage)}`), color: '#b3262b' });
    }
    if (loadout.daily) {
      const record = recordDaily(services.storage, state.score);
      lines.push({ text: tr(`Daily streak ${record.streak} · today's best ${record.scores[dailyKey()]}`, `每日连续 ${record.streak} 天 · 今日最佳 ${record.scores[dailyKey()]}`), color: '#2f5f8a' });
      shareText = dailyShareText('Pocket Survivor', state.score, record.streak, dailyKey(), /^zh\b/i.test(navigator.language || ''));
    }
    result = { lines: lines.slice(0, 4), camp: !seat, share: loadout.daily } as Ui['result'];
  };

  // ---- audio and juice: every cue is rate-limited so a full screen of kills never turns into noise ----
  const onEvent = (event: SimEvent) => {
    renderer.onEvent(event, state);
    switch (event.type) {
      case 'kill': if (event.elite || event.boss) services.sound.play('clear'); else if (attackCueCooldown <= 0) { services.sound.play('tap'); attackCueCooldown = 0.13; } break;
      case 'hurt': if (hurtCueCooldown <= 0) { services.sound.play('hit'); hurtCueCooldown = 0.25; } if (!reduced) navigator.vibrate?.(25); break;
      case 'gem': if (event.kind === 'chest') break; if (event.kind !== 'xp') services.sound.play('jump'); else if (collectCueCooldown <= 0) { services.sound.play('collect'); collectCueCooldown = 0.16; } break;
      case 'levelup': selected = touch ? -1 : 0; lock = 0.4; stick = null; k.fx.clear(); k.fx.flash('#b9a8ff', 16); barFlash = true; services.sound.play('upgrade'); break;
      case 'burst': services.sound.play('clear'); break;
      case 'banner': if (event.tone === 'warn') services.sound.play('move'); break;
      case 'chest': chestAge = 0; chestCues = 0; stick = null; services.sound.play('jump'); break;
      case 'evolve': evolveAge = 0; evolveKey = event.key; slowmo = reduced ? 0 : 0.9; services.sound.play('success'); if (!reduced) navigator.vibrate?.([40, 30, 60]); break;
      case 'revive': services.sound.play('success'); break;
      case 'middown': services.sound.play('success'); report(); break;
      case 'bossdown': services.sound.play('success'); report(); break;
      case 'dead': lock = 0.7; stick = null; newBest = state.score > best; report(); services.sound.play('fail'); finishRun(); break;
    }
  };
  const drain = () => { if (state.events.length) { const events = state.events; state.events = []; events.forEach(onEvent); } };

  const ui = (): Ui => ({
    best, newBest, selected, locked: lock > 0, touch, paused, clock, stick,
    hint: state.time < 7 ? (touch ? tr('Drag to move - attacks are automatic', '拖动移动 - 自动攻击') : tr('WASD or arrows to move - attacks are automatic', 'WASD 或方向键移动 - 自动攻击')) : '',
    burstLabel: touch ? tr('TAP - BURST READY', '点击 - 爆发就绪') : tr('SPACE - BURST READY', '空格 - 爆发就绪'), retryLabel: touch ? tr('Play again', '再来一局') : tr('Again (Space)', '再来 (空格)'),
    result, chestAge, evolveAge, evolveKey
  });
  const chestDone = () => chestAge !== undefined && (reduced || chestAge > 0.9 + (state.chest?.items.length ?? 1) * 0.35);
  const dismissChest = () => { if (!chestDone()) return; closeChest(state); chestAge = undefined; focus(); };

  // ---- camp actions ----
  const startEntry = (index: number) => {
    const entry = ENTRIES[index]; if (!entry || !profile) return;
    stageSel = index;
    if (entry === 'daily') { startRun({ stage: dailyLoadout().stage, general: dailyLoadout().general, daily: true }); return; }
    if (!profile.stages.includes(entry)) { campFlash = 0.5; services.sound.play('fail'); return; }
    services.sound.play('upgrade');
    startRun({ stage: entry, general: profile.generals.includes(loadout.general) ? loadout.general : 'spear', daily: false });
  };
  const cycleGeneral = (dir: number) => {
    if (!profile) return;
    const open = GENERAL_IDS.filter(id => profile.generals.includes(id)), index = open.indexOf(loadout.general);
    loadout = { ...loadout, general: open[(index + dir + open.length) % open.length] ?? 'spear' }; services.sound.play('tap');
  };
  const pickGeneral = (id: GeneralId) => { if (profile?.generals.includes(id)) { loadout = { ...loadout, general: id }; services.sound.play('tap'); } else services.sound.play('fail'); };
  const buy = (index: number) => { if (!profile) return; talentSel = index; if (buyTalent(profile, TALENT_IDS[index])) { save(); services.sound.play('upgrade'); } else services.sound.play('fail'); };
  const share = () => { if (!shareText) return; navigator.clipboard?.writeText(shareText).then(() => renderer.banner(tr('Result copied', '战绩已复制'), 'good', 1.6), () => undefined); };

  // ---- input ----
  const held = (...names: string[]) => names.some(name => k.keys.has(name));
  const readInput = (): Input => {
    let mx = 0, my = 0;
    if (held('ArrowLeft', 'a', 'A')) mx--; if (held('ArrowRight', 'd', 'D')) mx++; if (held('ArrowUp', 'w', 'W')) my--; if (held('ArrowDown', 's', 'S')) my++;
    // The shared on-screen stick only sends four arrow keys; its knob offset gives smooth 360-degree movement.
    const match = knob ? /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(knob.style.transform) : null;
    if (match) { const reach = ((knob!.parentElement?.offsetWidth ?? 110) || 110) * 0.34, x = Number(match[1]) / reach, y = Number(match[2]) / reach; if (Math.hypot(x, y) > 0.2) { mx = x; my = y; } }
    if (stick) { mx = stick.dx; my = stick.dy; }
    const burst = burstQueued; burstQueued = false;
    return { mx, my, burst };
  };
  const point = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * view.w / (rect.width || view.w), y: (event.clientY - rect.top) * view.h / (rect.height || view.h) }; };
  const cardAt = (x: number, y: number) => cardRects(view, state.choices.length).findIndex(rect => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);
  const menuTap = (x: number, y: number) => {
    if (!profile) return;
    if (screen === 'camp') {
      const L0 = campLayout(view), g = hitIndex(L0.generals, x, y), st = hitIndex(L0.stages, x, y);
      if (g >= 0) pickGeneral(GENERAL_IDS[g]);
      else if (st >= 0) startEntry(st);
      else if (inside(L0.talents, x, y)) { screen = 'talents'; services.sound.play('tap'); }
      else if (inside(L0.collection, x, y)) { screen = 'collection'; services.sound.play('tap'); }
      return;
    }
    if (inside(backRect(touch), x, y)) { screen = 'camp'; services.sound.play('tap'); return; }
    if (screen === 'talents') { const index = hitIndex(talentRows(view), x, y); if (index >= 0) buy(index); }
    else { const index = hitIndex(collectionLayout(view, tiles(profile).length).tiles, x, y); if (index >= 0) { tileSel = index; services.sound.play('tap'); } }
  };
  k.on('pointerdown', raw => {
    const event = raw as PointerEvent, at = point(event);
    if (screen !== 'run') { menuTap(at.x, at.y); return; }
    if (state.phase === 'dead') {
      if (lock > 0) return;
      const buttons = resultButtons(view, { result });
      if (inside(buttons.camp, at.x, at.y)) toCamp(); else if (buttons.share && inside(buttons.share, at.x, at.y)) share(); else startRun(loadout);
      return;
    }
    if (state.chest) { dismissChest(); return; }
    if (state.phase === 'levelup') { const index = cardAt(at.x, at.y); if (index >= 0) choose(index); return; }
    const pill = burstRect(view, ui());
    if (state.burst >= state.burstNeed && at.x >= pill.x - 8 && at.x <= pill.x + pill.w + 8 && at.y >= pill.y - 8 && at.y <= pill.y + pill.h + 8) { burstQueued = true; return; }
    stick = { id: event.pointerId, x: at.x, y: at.y, dx: 0, dy: 0 };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
  });
  k.on('pointermove', raw => {
    const event = raw as PointerEvent, at = point(event);
    if (screen !== 'run') return;
    if (state.phase === 'levelup' && event.pointerType === 'mouse') { const index = cardAt(at.x, at.y); if (index >= 0) selected = index; return; }
    if (!stick || stick.id !== event.pointerId) return;
    const dx = (at.x - stick.x) / 44, dy = (at.y - stick.y) / 44, length = Math.hypot(dx, dy);
    stick.dx = length > 1 ? dx / length : dx; stick.dy = length > 1 ? dy / length : dy;
    if (length < 0.15) { stick.dx = 0; stick.dy = 0; }
  });
  k.on('pointerup', raw => { if (stick && (raw as PointerEvent).pointerId === stick.id) stick = null; });
  k.on('pointercancel', raw => { const id = (raw as PointerEvent).pointerId; if (id === undefined || id === stick?.id) stick = null; });
  const UP = ['ArrowUp', 'w', 'W'], DOWN = ['ArrowDown', 's', 'S'], LEFT = ['ArrowLeft', 'a', 'A'], RIGHT = ['ArrowRight', 'd', 'D'], OK = ['Enter', ' '], BACKS = ['Escape', 'Backspace', 'm', 'M'];
  const menuKey = (event: KeyboardEvent) => {
    const key = event.key; if (!profile) return;
    if (screen === 'camp') {
      if (key >= '1' && key <= String(ENTRIES.length)) { startEntry(Number(key) - 1); return; }
      if (event.repeat) return;
      if (UP.includes(key)) stageSel = (stageSel + ENTRIES.length - 1) % ENTRIES.length;
      else if (DOWN.includes(key)) stageSel = (stageSel + 1) % ENTRIES.length;
      else if (LEFT.includes(key)) cycleGeneral(-1);
      else if (RIGHT.includes(key)) cycleGeneral(1);
      else if (OK.includes(key)) startEntry(stageSel);
      else if (key === 't' || key === 'T') screen = 'talents';
      else if (key === 'c' || key === 'C') screen = 'collection';
      return;
    }
    if (BACKS.includes(key)) { screen = 'camp'; return; }
    if (event.repeat) return;
    if (screen === 'talents') {
      if (UP.includes(key) || LEFT.includes(key)) talentSel = (talentSel + TALENT_IDS.length - 1) % TALENT_IDS.length;
      else if (DOWN.includes(key) || RIGHT.includes(key)) talentSel = (talentSel + 1) % TALENT_IDS.length;
      else if (OK.includes(key)) buy(talentSel);
    } else {
      const count = tiles(profile).length, grid = collectionLayout(view, count).tiles, cols = Math.max(1, grid.filter(r => r.y === grid[0].y).length);
      if (LEFT.includes(key)) tileSel = (tileSel + count - 1) % count;
      else if (RIGHT.includes(key)) tileSel = (tileSel + 1) % count;
      else if (UP.includes(key)) tileSel = Math.max(0, tileSel - cols);
      else if (DOWN.includes(key)) tileSel = Math.min(count - 1, tileSel + cols);
      else if (OK.includes(key)) screen = 'camp';
    }
  };
  k.on('keydown', raw => {
    const event = raw as KeyboardEvent, key = event.key;
    if (screen !== 'run') { menuKey(event); return; }
    if (state.phase === 'dead') {
      if (lock > 0) return;
      if (key === ' ' || key === 'Enter' || key === 'r' || key === 'R') startRun(loadout);
      else if (result?.camp && BACKS.includes(key)) toCamp();
      else if ((key === 's' || key === 'S') && shareText) share();
      return;
    }
    if (state.chest) { if (OK.includes(key) || (key >= '1' && key <= '3')) dismissChest(); return; }
    if (state.phase === 'levelup') {
      if (key >= '1' && key <= '3') { choose(Number(key) - 1); return; }
      if (event.repeat) return;
      const count = state.choices.length, current = selected < 0 ? 0 : selected;
      if (['ArrowLeft', 'ArrowUp', 'a', 'A', 'w', 'W'].includes(key)) selected = selected < 0 ? 0 : (current + count - 1) % count;
      else if (['ArrowRight', 'ArrowDown', 'd', 'D', 's', 'S'].includes(key)) selected = selected < 0 ? 0 : (current + 1) % count;
      else if ((key === 'Enter' || key === ' ') && selected >= 0) choose(selected);
      return;
    }
    if (key === ' ' && !event.repeat) burstQueued = true;
  });

  const draw = (dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (screen !== 'run' && profile) {
      const entry = ENTRIES[stageSel], scene = entry === 'daily' ? STAGES[dailyLoadout().stage].scene ?? 0 : STAGES[entry].scene ?? Math.floor(clock / 6) % 4;
      renderer.backdrop(ctx, view, scene, entry === 'daily' ? dailyLoadout().general : loadout.general, clock);
      if (screen === 'camp') drawCamp(ctx, view, { profile, stageSel, general: loadout.general, daily: dailyInfo(), clock, touch, reduced, flash: campFlash });
      else if (screen === 'talents') drawTalents(ctx, view, profile, talentSel, touch);
      else drawCollection(ctx, view, profile, profile.totals, tileSel, clock, reduced, touch);
      return;
    }
    const current = ui();
    renderer.draw(ctx, state, view, current, dt);
    // Kit effects: the level-up flash is clipped to the XP bar (never the whole canvas); pick sparkles are free.
    ctx.save();
    if (barFlash) { const bar = xpBarRect(view, current); ctx.beginPath(); ctx.rect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4); ctx.clip(); ctx.scale(view.w / k.width, view.h / k.height); }
    k.fx.draw();
    ctx.restore();
  };
  /** Live feat check, once a second: an unlock earned mid-run gets its own banner right away. */
  const checkFeats = () => {
    if (!profile || loadout.daily) return;
    for (const feat of newFeats(profile, liveTotals(profile, state))) {
      if (announced.has(feat.id)) continue;
      announced.add(feat.id); renderer.banner(tr(`UNLOCKED: ${unlockName(feat)}`, `解锁：${unlockName(feat)}`).toUpperCase(), 'good', 3); services.sound.play('success');
    }
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 0; last = now;
    if (!paused) {
      clock += dt; lock = Math.max(0, lock - dt); attackCueCooldown -= dt; hurtCueCooldown -= dt; collectCueCooldown -= dt; campFlash = Math.max(0, campFlash - dt);
      evolveAge += dt;
      if (screen === 'run' && state.chest && chestAge !== undefined) {
        chestAge += dt;
        // a cue as the lid bursts, then one per prize as it pops out
        const count = state.chest.items.length, due = chestAge < 0.55 ? 0 : 1 + Math.min(count, Math.floor((chestAge - 0.8) / 0.35) + 1);
        while (chestCues < due) { services.sound.play(chestCues === 0 ? 'success' : state.chest.items[chestCues - 1]?.evolve ? 'upgrade' : 'collect'); chestCues++; }
      } else if (screen === 'run' && state.phase === 'play') {
        // an evolution briefly slows time so the nova and banner land
        const scale = slowmo > 0 ? 0.3 : 1; slowmo = Math.max(0, slowmo - dt);
        acc += dt * scale;
        let steps = 0;
        while (acc >= STEP && steps < 5 && state.phase === 'play' && !state.chest) { step(state, readInput()); acc -= STEP; steps++; drain(); }
        if (steps === 5 || state.phase !== 'play' || state.chest) acc = 0;
        reportTimer += dt; if (reportTimer >= 0.5) { reportTimer = 0; report(); }
        featTimer += dt; if (featTimer >= 1) { featTimer = 0; checkFeats(); }
      }
      k.fx.step();
    }
    draw(paused ? 0 : dt);
  };

  layout();
  if (seat) startRun(loadout); else resetRun();
  // Dev-only hook so a run can be fast-forwarded for screenshots; stripped from production builds.
  if (import.meta.env.DEV) (canvas as HTMLCanvasElement & { arenaDebug?: unknown }).arenaDebug = {
    get state() { return state; },
    get profile() { return profile; },
    get screen() { return screen; },
    start(entry: number) { startEntry(entry); },
    camp() { toCamp(); },
    advance(seconds: number, immortal = true, stopAtLevelUp = false) {
      for (let tick = 0; tick < seconds / STEP && state.phase !== 'dead'; tick++) {
        if (state.chest) { closeChest(state); chestAge = undefined; }
        if (state.phase === 'levelup') { if (stopAtLevelUp) { onEvent({ type: 'levelup' }); return; } chooseUpgrade(state, 0); continue; }
        step(state, { mx: Math.cos(state.time * 0.7), my: Math.sin(state.time * 0.7), burst: true }); if (immortal) state.hp = state.maxHp;
        const keep = state.events.filter(event => event.type === 'chest' || event.type === 'evolve' || event.type === 'dead'); state.events = [];
        if (keep.length && tick > seconds / STEP - 2) keep.forEach(onEvent);
      }
    },
    give(id: WeaponId, level: number) { state.weapons[id] = level; },
    event(event: SimEvent) { onEvent(event); }
  };
  frame(performance.now());
  return {
    pause: () => { paused = true; k.setPaused(true); stick = null; burstQueued = false; },
    resume: () => { paused = false; k.setPaused(false); last = 0; focus(); },
    restart: reset,
    destroy: () => { cancelAnimationFrame(raf); observer?.disconnect(); window.removeEventListener('resize', layout); k.dispose(); }
  };
} };
export default arena;
