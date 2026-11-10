import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import {
  baseHp,
  computeNavField,
  createArenaState,
  createEnemyTank,
  damageTank,
  DASH_COOLDOWN,
  detonateExplosion,
  enemiesLeft,
  fireTankWeapon,
  lineOfFire,
  NAV_BLOCKED,
  stepArena,
  triggerTankDash,
  triggerTankSpecial,
  type ArenaState
} from '../src/games/tank-clash/engine';
import tankClash from '../src/games/tank-clash/index';
import { t } from '../src/games/tank-clash/i18n';
import { cellCenter, CHASSIS_ORDER, CHASSIS_SPECS, COLS, TILE } from '../src/games/tank-clash/maps';
import type { PlayerControlInput } from '../src/games/tank-clash/types';
import { firepower, teamOrder } from '../src/games/tank-clash/ui';

const idle: PlayerControlInput = { moveX: 0, moveY: 0, fire: false, fireJustPressed: false, specialJustPressed: false };
const rng = (seed: number) => () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const run = (state: ArenaState, seconds: number, random = rng(7), controls: [PlayerControlInput, PlayerControlInput] = [idle, idle]) => {
  for (let i = 0; i < seconds * 60 && state.outcome === 'none'; i++) stepArena(state, 1 / 60, controls, random);
};
const empty = () => ({ kind: 'empty' as const, hp: 0, maxHp: 0 });

function makeServices(stored: Record<string, unknown> = {}): GameServices {
  const store = new Map<string, unknown>(Object.entries(stored));
  const random = rng(0x2468ace0);
  return {
    storage: {
      get: <T>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
      set: (k, v) => void store.set(k, v),
      remove: (k) => void store.delete(k)
    },
    sound: { muted: false, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
    random,
    reportScore: vi.fn(),
    reportComplete: vi.fn(),
    isReducedMotion: false
  };
}

type Hook = {
  getState: () => ArenaState;
  getScreen: () => string;
  startBattle: () => void;
  action: (id: string) => void;
  step: (frames?: number) => void;
};
const hook = () => (globalThis as unknown as { __tankClash: Hook }).__tankClash;

describe('Tank Clash navigation and enemy AI', () => {
  it('routes through bricks at a price but never through steel, water or barrels', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 1 }); // Twin Bridges
    const field = computeNavField(state.grid, [[9, 12], [10, 12]]);
    expect(field[12 * COLS + 9]).toBe(0);
    expect(field[4 * COLS + 0]).toBe(NAV_BLOCKED); // river
    expect(field[4 * COLS + 9]).toBe(NAV_BLOCKED); // steel pier
    expect(field[0]).toBeLessThan(NAV_BLOCKED); // the top-left spawn can reach the Eagle over a bridge
    expect(field[4 * COLS + 4]).toBeLessThan(field[0]); // ...and the bridge is on the way down
    // Walking into the brick shell around the base costs more than open ground.
    const open = computeNavField(state.grid.map((row) => row.map((c) => (c.kind === 'brick' ? empty() : c))), [[9, 12]]);
    expect(field[0]).toBeGreaterThan(open[0]);
  });

  it('enemies reach and destroy an undefended Eagle on every stage instead of getting stuck', () => {
    for (let stage = 0; stage < 6; stage++) {
      const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: stage });
      run(state, 150, rng(11 + stage));
      expect(state.outcome, `stage ${stage + 1}`).toBe('coop-defeat');
      expect(['base', 'tanks']).toContain(state.defeatReason);
    }
  });

  it('never stalls: two AI defenders finish every stage one way or the other', () => {
    for (let stage = 0; stage < 6; stage++) {
      const state = createArenaState({ mode: 'coop', teamSetup: '1p-ai', stageIndex: stage });
      state.tanks[0].isAi = true;
      run(state, 300, rng(4444 + stage));
      expect(state.outcome, `stage ${stage + 1}`).not.toBe('none');
    }
  });

  it('treats a portal as the end of a firing lane (tanks used to face off across one forever)', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 3 }); // Warp Labyrinth
    expect(state.grid[9][2].kind).toBe('portal');
    const p1 = state.tanks[0];
    Object.assign(p1, cellCenter(5, 9));
    const enemy = createEnemyTank('e1', 'sniper', 0, 9);
    state.tanks.push(enemy);
    expect(lineOfFire(state, p1, 'left').kind).toBe('portal');
    state.grid[9][2] = empty();
    const hit = lineOfFire(state, p1, 'left');
    expect(hit.kind).toBe('tank');
    expect(hit.tank).toBe(enemy);
  });

  it('announces each arrival with a spawn marker and counts it as an enemy still to beat', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    const total = state.totalEnemies;
    expect(total).toBeGreaterThanOrEqual(12);
    run(state, 1.6);
    expect(state.spawnWarnings).toHaveLength(1);
    expect(state.tanks.filter((tk) => tk.team === 3)).toHaveLength(0);
    expect(enemiesLeft(state)).toBe(total);
    run(state, 1);
    expect(state.tanks.filter((tk) => tk.team === 3)).toHaveLength(1);
    expect(enemiesLeft(state)).toBe(total);
  });
});

describe('Tank Clash combat rules', () => {
  it('lets only the enemy hurt the Eagle: defenders cannot shoot or splash their own base', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '2p', p1Chassis: 'vanguard', p2Chassis: 'titan' });
    const [p1, p2] = state.tanks;
    // P1 fires straight into the Eagle from the left through an opened wall.
    state.grid[12][8] = empty();
    Object.assign(p1, cellCenter(7, 12));
    p1.dir = 'right';
    fireTankWeapon(state, p1);
    run(state, 0.4);
    expect(baseHp(state)).toBe(6);
    // Titan splash against the wall above the Eagle.
    Object.assign(p2, cellCenter(9, 9));
    p2.dir = 'down';
    fireTankWeapon(state, p2);
    run(state, 0.5);
    expect(baseHp(state)).toBe(6);
    expect(state.baseAlive).toBe(true);

    // An enemy shell does hurt, raises the alarm and flashes the HUD.
    const enemy = createEnemyTank('e1', 'striker', 7, 12);
    enemy.dir = 'right';
    enemy.reloadTimer = 0;
    enemy.freezeTimer = 0;
    state.tanks.push(enemy);
    p1.x = cellCenter(1, 1).x;
    p1.y = cellCenter(1, 1).y;
    fireTankWeapon(state, enemy);
    let alarm = false;
    for (let i = 0; i < 30; i++) {
      stepArena(state, 1 / 60, [idle, idle], rng(3));
      alarm ||= state.cues.includes('alarm');
    }
    expect(baseHp(state)).toBe(5);
    expect(alarm).toBe(true);
    expect(state.baseFlash).toBeGreaterThan(0);
  });

  it('one blast or volley damages the Eagle once, so a triple shot cannot melt it instantly', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    const mid = cellCenter(9.5, 11);
    detonateExplosion(state, mid.x, mid.y, TILE * 1.8, 2, 3, undefined, false, rng(1));
    expect(baseHp(state)).toBe(5);
    detonateExplosion(state, mid.x, mid.y, TILE * 1.8, 2, 3, undefined, false, rng(1));
    expect(baseHp(state)).toBe(5); // still inside the same half-second
    run(state, 0.6);
    detonateExplosion(state, mid.x, mid.y, TILE * 1.8, 2, 3, undefined, false, rng(1));
    expect(baseHp(state)).toBe(4);
  });

  it('dash is a real dodge: about two tiles, shell-proof while it lasts, then on cooldown', () => {
    const state = createArenaState({ mode: 'duel', teamSetup: '2p', stageIndex: 2 });
    const [p1, p2] = state.tanks;
    state.grid = state.grid.map((row) => row.map(() => empty()));
    p1.spawnProtected = 0;
    p1.shieldTimer = 0;
    Object.assign(p1, cellCenter(3, 3));
    p1.dir = 'right';
    const startX = p1.x;
    expect(triggerTankDash(state, p1)).toBe(true);
    const hp = p1.hp;
    damageTank(state, p1, 3, 2, 1, rng(1));
    expect(p1.hp).toBe(hp); // untouchable mid-dash
    for (let i = 0; i < 20; i++) stepArena(state, 1 / 60, [idle, idle], rng(1));
    expect(p1.x - startX).toBeGreaterThan(TILE * 1.8);
    expect(p1.x - startX).toBeLessThan(TILE * 3);
    expect(p1.dashCooldown).toBeGreaterThan(DASH_COOLDOWN - 0.5);
    expect(triggerTankDash(state, p1)).toBe(false);
    damageTank(state, p1, 3, 2, 1, rng(1));
    expect(p1.hp).toBe(hp - 3); // and vulnerable again afterwards
    expect(p2.alive).toBe(true);
  });

  it('the mine button drops a mine while you have one and dashes once you are out', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    const p1 = state.tanks[0];
    p1.mines = 1;
    triggerTankSpecial(state, p1);
    expect(state.mines).toHaveLength(1);
    expect(p1.dashTimer).toBe(0);
    triggerTankSpecial(state, p1);
    expect(state.mines).toHaveLength(1);
    expect(p1.dashTimer).toBeGreaterThan(0);
  });

  it('keeps the four tanks in the same firepower league and gives duels thicker armour', () => {
    const dps = CHASSIS_ORDER.map((id) => {
      const spec = CHASSIS_SPECS[id];
      return (spec.damage * spec.burstCount) / spec.reload;
    });
    expect(Math.max(...dps) / Math.min(...dps)).toBeLessThan(1.6);
    for (const id of CHASSIS_ORDER) expect(firepower(id)).toBeGreaterThanOrEqual(3);
    const duel = createArenaState({ mode: 'duel', teamSetup: '2p', p1Chassis: 'vanguard', p2Chassis: 'titan' });
    expect(duel.tanks[0].maxHp).toBe(CHASSIS_SPECS.vanguard.maxHp * 3);
    expect(duel.tanks[1].maxHp).toBe(CHASSIS_SPECS.titan.maxHp * 3);
  });

  it('rewards chained kills and an intact Eagle', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    state.enemiesRemainingToSpawn = [];
    const a = createEnemyTank('e1', 'scout', 3, 3);
    const b = createEnemyTank('e2', 'scout', 5, 3);
    a.spawnProtected = b.spawnProtected = 0;
    state.tanks.push(a, b);
    damageTank(state, a, 1, 1, 0, () => 0.99);
    expect(state.score).toBe(100);
    damageTank(state, b, 1, 1, 0, () => 0.99);
    expect(state.score).toBe(100 + 100 + 50); // second kill inside 3s: combo bonus
    expect(state.cues).toContain('combo');
    stepArena(state, 1 / 60, [idle, idle], rng(1));
    expect(state.outcome).toBe('stage-clear');
    expect(state.clearBonus).toBe(500 + 6 * 100);
    expect(state.stageKills).toBe(2);
  });

  it('gives bosses real health, a telegraphed special attack and tougher New Game+ laps', () => {
    const state = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 5 });
    state.enemiesRemainingToSpawn = [];
    state.grid = state.grid.map((row, r) => (r >= 11 ? row : row.map(() => empty()))); // keep the fort
    const boss = createEnemyTank('boss', 'boss-omega', 9, 5);
    state.tanks.push(boss);
    expect(boss.maxHp).toBeGreaterThanOrEqual(24);
    expect(createEnemyTank('b2', 'boss-omega', 9, 5, 2).maxHp).toBeGreaterThan(boss.maxHp);
    expect(createEnemyTank('s2', 'scout', 9, 5, 2).maxHp).toBe(3);
    let charged = false;
    let ring = 0;
    for (let i = 0; i < 60 * 6 && state.outcome === 'none'; i++) {
      stepArena(state, 1 / 60, [idle, idle], rng(5));
      charged ||= boss.bossCharging;
      // Ring shells fly at their own speed, so they are easy to tell from the main gun.
      ring = Math.max(ring, state.bullets.filter((b) => Math.abs(Math.hypot(b.vx, b.vy) - 250) < 1).length);
    }
    expect(charged).toBe(true);
    expect(ring).toBeGreaterThanOrEqual(6); // 8 fired; a couple may already have struck something
  });

  it('an AI rival beats an idle player and the match ends at five round wins', () => {
    const state = createArenaState({ mode: 'duel', teamSetup: '1p-ai', p1Wins: 0, p2Wins: 4 });
    run(state, 120, rng(21));
    expect(state.outcome).toBe('duel-victory');
    expect(state.roundWinner).toBe(1);
    expect(state.p2Wins).toBe(5);
  });
});

describe('Tank Clash shell: lobby, results and progression', () => {
  it('defaults a first-time visitor to one player with an AI ally and shows a DOM lobby', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const controller = tankClash.mount(host, makeServices());
    expect(hook().getScreen()).toBe('lobby');
    expect(hook().getState().teamSetup).toBe('1p-ai');
    const start = host.querySelector<HTMLElement>('[data-id="start-battle"]');
    expect(start?.textContent).toContain('START BATTLE');
    expect(host.querySelector('[data-id="team-1p-ai"]')?.classList.contains('is-on')).toBe(true);
    // Switching to a duel drops the solo option and keeps the choice legal.
    hook().action('team-1p-solo');
    hook().action('mode-duel');
    expect(hook().getState().mode).toBe('duel');
    expect(hook().getState().teamSetup).toBe('1p-ai');
    expect(host.querySelector('[data-id="team-1p-solo"]')).toBeNull();
    hook().action('lang');
    expect(host.querySelector<HTMLElement>('[data-id="start-battle"]')?.textContent).toContain('立即出击');
    host.querySelector<HTMLElement>('[data-id="start-battle"]')?.click();
    expect(hook().getScreen()).toBe('none');
    controller.destroy();
    host.remove();
  });

  it('respects a stored player-count choice', () => {
    const host = document.createElement('div');
    const controller = tankClash.mount(host, makeServices({ teamSetup: '2p', mode: 'coop' }));
    expect(hook().getState().teamSetup).toBe('2p');
    controller.destroy();
  });

  it('walks stage clear -> next stage -> final victory -> harder lap, carrying the score', () => {
    const host = document.createElement('div');
    const services = makeServices({ teamSetup: '1p-solo' });
    const controller = tankClash.mount(host, services);
    hook().startBattle();
    const clearStage = () => {
      const s = hook().getState();
      s.enemiesRemainingToSpawn = [];
      s.spawnWarnings = [];
      for (const tk of s.tanks) if (tk.team === 3) tk.alive = false;
      hook().step(2);
    };
    let score = 0;
    for (let stage = 0; stage < 6; stage++) {
      expect(hook().getState().stageIndex).toBe(stage);
      clearStage();
      const s = hook().getState();
      expect(s.outcome).toBe(stage === 5 ? 'coop-victory' : 'stage-clear');
      expect(s.score).toBe(score + 1100);
      score = s.score;
      expect(hook().getScreen()).toBe('none'); // the board stays visible for a beat first
      hook().step(80);
      expect(hook().getScreen()).toBe('results');
      expect(host.querySelector('.tc-title')?.textContent).toMatch(stage === 5 ? /VICTORY/ : /CLEARED/);
      hook().action('res-next');
      expect(hook().getScreen()).toBe('none');
    }
    const lap = hook().getState();
    expect(lap.stageIndex).toBe(0);
    expect(lap.loop).toBe(1);
    expect(lap.score).toBe(score);
    expect(services.reportComplete).toHaveBeenCalledWith(1);
    expect(services.reportScore).toHaveBeenLastCalledWith(score);
    controller.destroy();
  });

  it('explains a defeat and retries the same stage with the score from its start', () => {
    const host = document.createElement('div');
    const controller = tankClash.mount(host, makeServices({ teamSetup: '1p-solo' }));
    hook().startBattle();
    const s = hook().getState();
    s.score = 900;
    const enemy = createEnemyTank('e1', 'striker', 7, 12);
    enemy.dir = 'right';
    s.tanks.push(enemy);
    s.grid[12][8] = empty();
    s.grid[12][9].hp = 1;
    s.grid[12][10].hp = 1;
    enemy.reloadTimer = 0;
    fireTankWeapon(s, enemy);
    hook().step(40);
    expect(hook().getState().outcome).toBe('coop-defeat');
    expect(hook().getState().defeatReason).toBe('base');
    hook().step(60);
    expect(hook().getScreen()).toBe('results');
    expect(host.querySelector('.tc-overlay')?.textContent).toContain('destroyed your Eagle base');
    hook().action('res-next');
    expect(hook().getState().outcome).toBe('none');
    expect(hook().getState().stageIndex).toBe(0);
    expect(hook().getState().score).toBe(0);
    hook().action('res-lobby');
    controller.destroy();
  });

  it('hands an untouched second tank to the AI in 2-player mode', () => {
    const host = document.createElement('div');
    const controller = tankClash.mount(host, makeServices({ teamSetup: '2p' }));
    hook().startBattle();
    hook().step(60 * 5);
    expect(hook().getState().tanks[1].isAi).toBe(false);
    hook().step(60 * 2);
    expect(hook().getState().tanks[1].isAi).toBe(true);
    controller.destroy();
  });

  it('pausing freezes the battle', () => {
    const host = document.createElement('div');
    const controller = tankClash.mount(host, makeServices());
    hook().startBattle();
    hook().step(30);
    const before = hook().getState().roundTimer;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    hook().step(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
    expect(hook().getScreen()).toBe('pause');
    hook().step(30);
    expect(hook().getState().roundTimer).toBe(before);
    hook().action('pause-resume');
    hook().step(10);
    expect(hook().getState().roundTimer).toBeGreaterThan(before);
    controller.destroy();
  });
});

describe('Tank Clash text', () => {
  it('has every menu, HUD and result string in both languages with parameters filled in', () => {
    const keys = [
      'lobby.goal.coop', 'lobby.goal.duel', 'ctl.touch', 'ctl.1p', 'ctl.p1', 'ctl.p2', 'ctl.pad', 'res.reason.base',
      'res.reason.tanks', 'res.tip.base', 'res.tip.tanks', 'res.next', 'res.retry', 'hud.baseHit', 'fx.combo', 'boss.omega'
    ] as const;
    for (const key of keys) {
      const en = t('en', key, { n: 3 });
      const zh = t('zh', key, { n: 3 });
      expect(en.length).toBeGreaterThan(1);
      expect(zh.length).toBeGreaterThan(1);
      expect(zh).not.toBe(en);
      expect(en + zh).not.toMatch(/\{\w+\}/);
    }
    expect(t('zh', 'fx.combo', { n: 4 })).toContain('4');
    expect(teamOrder('duel')).toEqual(['1p-ai', '2p']);
  });
});
