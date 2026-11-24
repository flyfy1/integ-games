import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import tankClash, { loadCampaign, stageUnlocked, type CampaignSave } from '../src/games/tank-clash/index';
import {
  baseHp,
  buildWaveList,
  computeNavField,
  COOP_STAGE_COUNT,
  DUEL_ARENA_COUNT,
  NAV_BLOCKED,
  coopTuning,
  createArenaState,
  createEnemyTank,
  damageTank,
  detonateExplosion,
  isBossArchetype,
  scaleWave,
  stepArena,
  type ArenaState
} from '../src/games/tank-clash/engine';
import { t } from '../src/games/tank-clash/i18n';
import type { Key } from '../src/games/tank-clash/i18n';
import { BOSS_STAGES, buildGrid, cellCenter, COLS, COOP_MAPS, DUEL_MAPS, ROWS, STAGE_TIPS, TILE } from '../src/games/tank-clash/maps';
import type { PlayerControlInput } from '../src/games/tank-clash/types';

const idle: PlayerControlInput = { moveX: 0, moveY: 0, fire: false, fireJustPressed: false, specialJustPressed: false };
const rng = (seed: number) => () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const run = (state: ArenaState, seconds: number, random = rng(7)) => {
  for (let i = 0; i < seconds * 60 && state.outcome === 'none'; i++) stepArena(state, 1 / 60, [idle, idle], random);
};

describe('Tank Clash difficulty and solo scaling', () => {
  it('Normal with a partner keeps the original numbers', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '1p-ai' });
    expect(s.difficulty).toBe('normal');
    expect(s.baseMaxHp).toBe(6);
    expect(baseHp(s)).toBe(6);
    expect(s.tanks.map((t) => t.lives)).toEqual([4, 4]);
    expect(s.totalEnemies).toBe(buildWaveList(0).length);
    expect(coopTuning('normal', 2)).toMatchObject({ waveScale: 1, concurrency: 0, spawnGap: 0, enemyReload: 1, enemySpeed: 1 });
  });

  it('a lone defender faces a smaller, slower army and gets a spare life', () => {
    for (let stage = 0; stage < 6; stage++) {
      const duo = createArenaState({ mode: 'coop', teamSetup: '2p', stageIndex: stage });
      const solo = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: stage });
      expect(solo.totalEnemies, `stage ${stage + 1}`).toBeLessThan(duo.totalEnemies);
      expect(solo.enemiesRemainingToSpawn.filter(isBossArchetype)).toEqual(duo.enemiesRemainingToSpawn.filter(isBossArchetype));
    }
    const solo = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    expect(solo.tanks[0].lives).toBe(5);
    expect(solo.tuning.concurrency).toBeLessThan(0);
    expect(solo.tuning.spawnGap).toBeGreaterThan(0);
  });

  it('Easy and Hard move every lever the right way', () => {
    const easy = createArenaState({ mode: 'coop', teamSetup: '1p-ai', difficulty: 'easy', stageIndex: 4 });
    const normal = createArenaState({ mode: 'coop', teamSetup: '1p-ai', difficulty: 'normal', stageIndex: 4 });
    const hard = createArenaState({ mode: 'coop', teamSetup: '1p-ai', difficulty: 'hard', stageIndex: 4 });
    expect(easy.totalEnemies).toBeLessThan(normal.totalEnemies);
    expect(hard.totalEnemies).toBeGreaterThan(normal.totalEnemies);
    expect(easy.baseMaxHp).toBe(8);
    expect(baseHp(easy)).toBe(8);
    expect(easy.tanks[0].lives).toBeGreaterThan(normal.tanks[0].lives);
    expect(hard.tanks[0].lives).toBeLessThan(normal.tanks[0].lives);
    expect(easy.tuning.enemyReload).toBeGreaterThan(1);
    expect(hard.tuning.enemyReload).toBeLessThan(1);
    // An unknown stored value falls back to Normal.
    expect(createArenaState({ mode: 'coop', teamSetup: '2p', difficulty: 'nightmare' as never }).difficulty).toBe('normal');
  });

  it('scales a wave evenly and never drops a boss', () => {
    const wave = buildWaveList(5);
    const bosses = wave.filter(isBossArchetype);
    expect(bosses.length).toBe(2);
    for (const scale of [0.5, 0.75, 1.2]) {
      const out = scaleWave(wave, scale);
      expect(out.filter(isBossArchetype)).toEqual(bosses);
      expect(out.length - bosses.length).toBe(Math.round((wave.length - bosses.length) * scale));
    }
  });

  it('a clear bonus keeps its 500..1100 scale whatever the Eagle armour', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '1p-ai', difficulty: 'easy' });
    s.enemiesRemainingToSpawn = [];
    run(s, 0.1);
    expect(s.outcome).toBe('stage-clear');
    expect(s.clearBonus).toBe(1100);
  });
});

describe('Tank Clash boss fights', () => {
  it('bosses take turns: the second waits until the first is destroyed, which pays a bounty', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '2p', stageIndex: 5 });
    s.enemiesRemainingToSpawn = ['boss-behemoth', 'boss-omega'];
    s.spawnTimer = 0;
    run(s, 6);
    const bosses = () => s.tanks.filter((t) => t.alive && t.isBoss);
    expect(bosses()).toHaveLength(1);
    expect(s.enemiesRemainingToSpawn).toEqual(['boss-omega']);
    expect(s.checkpointWave).toEqual(['boss-behemoth', 'boss-omega']);
    const lives = s.tanks[0].lives;
    const boss = bosses()[0];
    boss.spawnProtected = 0;
    boss.shieldTimer = 0;
    damageTank(s, boss, 999, 1, 0, rng(2));
    expect(s.tanks[0].lives).toBe(lives + 1);
    expect(s.powerUps.some((p) => p.kind === 'repair')).toBe(true);
    run(s, 6);
    expect(bosses().map((b) => b.archetype)).toEqual(['boss-omega']);
  });

  it('marks the Eagle as touched even if a repair later restores it', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '1p-solo' });
    expect(s.baseUntouched).toBe(true);
    const mid = cellCenter(9.5, 11);
    detonateExplosion(s, mid.x, mid.y, TILE * 1.8, 2, 3, undefined, false, rng(1));
    expect(s.baseUntouched).toBe(false);
    expect(createEnemyTank('x', 'scout', 1, 1).isBoss).toBe(false);
  });
});

describe('Tank Clash campaign content', () => {
  it('has 12 well-formed co-op stages with 4 bosses and 7 versus arenas', () => {
    expect(COOP_STAGE_COUNT).toBe(12);
    expect(DUEL_ARENA_COUNT).toBe(7);
    for (const map of [...COOP_MAPS, ...DUEL_MAPS]) {
      expect(map).toHaveLength(ROWS);
      for (const row of map) expect(row).toHaveLength(COLS);
    }
    const bossStages = Array.from({ length: COOP_STAGE_COUNT }, (_, i) => i).filter((i) => buildWaveList(i).some(isBossArchetype));
    expect(bossStages).toEqual([...BOSS_STAGES]);
    const bosses = new Set(bossStages.flatMap((i) => buildWaveList(i).filter(isBossArchetype)));
    expect(bosses).toEqual(new Set(['boss-behemoth', 'boss-omega', 'boss-warden', 'boss-dreadnought']));
    for (const mode of ['coop', 'duel'] as const) {
      const count = mode === 'coop' ? COOP_STAGE_COUNT : DUEL_ARENA_COUNT;
      for (let i = 0; i < count; i++) {
        const grid = buildGrid(mode, i);
        // Every portal has a partner.
        for (const row of grid) for (const cell of row) if (cell.kind === 'portal') expect(cell.partnerCol).toBeDefined();
        if (mode === 'coop') {
          // All three drop zones and both player spawns can drive to the Eagle.
          const field = computeNavField(grid, [[9, 12], [10, 12]]);
          for (const [c, r] of [[0, 0], [9, 0], [19, 0], [6, 12], [13, 12]]) expect(field[r * COLS + c], `stage ${i + 1} ${c},${r}`).toBeLessThan(NAV_BLOCKED);
        } else {
          const field = computeNavField(grid, [[18, 6]]);
          expect(field[6 * COLS + 1], `arena ${i + 1}`).toBeLessThan(NAV_BLOCKED);
        }
      }
    }
  });

  it('names every stage, arena, boss and briefing in both languages', () => {
    const keys: string[] = [];
    for (let i = 0; i < COOP_STAGE_COUNT; i++) keys.push(`stage.coop.${i}`);
    for (let i = 0; i < DUEL_ARENA_COUNT; i++) keys.push(`stage.duel.${i}`);
    keys.push('boss.warden', 'boss.dreadnought', ...Object.values(STAGE_TIPS));
    for (const key of keys) {
      const en = t('en', key as Key);
      const zh = t('zh', key as Key);
      expect(en, key).toBeTruthy();
      expect(zh, key).toBeTruthy();
      expect(zh, key).not.toBe(en);
    }
  });

  it('one-way gates let a tank through along the arrow only, while shells fly both ways', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 7 }); // One-Way Locks
    s.enemiesRemainingToSpawn = ['scout'];
    s.spawnTimer = 999; // keep the stage running with nobody on the field
    const gate = s.grid[3][2];
    expect(gate.kind).toBe('gate');
    expect(gate.gateDir).toBe('down');
    const p1 = s.tanks[0];
    p1.spawnProtected = 0;
    // Below the gate, driving up: refused.
    Object.assign(p1, cellCenter(2, 4));
    const up: PlayerControlInput = { ...idle, moveY: -1 };
    for (let i = 0; i < 60; i++) stepArena(s, 1 / 60, [up, idle], rng(1));
    expect(p1.y).toBeGreaterThan(3.9 * TILE);
    // Above the gate, driving down: straight through.
    Object.assign(p1, cellCenter(2, 2));
    const down: PlayerControlInput = { ...idle, moveY: 1 };
    for (let i = 0; i < 50; i++) stepArena(s, 1 / 60, [down, idle], rng(1));
    expect(s.outcome).toBe('none');
    expect(p1.y).toBeGreaterThan(4 * TILE);
    // Routes respect the arrow: the cell above the gate is reachable from below only the long way round.
    const field = computeNavField(s.grid, [[2, 2]]);
    const viaGate = computeNavField(s.grid.map((row) => row.map((c) => (c.kind === 'gate' ? { ...c, gateDir: 'up' as const } : c))), [[2, 2]]);
    expect(field[4 * COLS + 2]).toBeGreaterThan(viaGate[4 * COLS + 2]);
  });

  it('fog of war hides distant tanks from the AI', () => {
    const fog = createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 6 });
    expect(fog.fog).toBe(true);
    expect(createArenaState({ mode: 'coop', teamSetup: '1p-solo', stageIndex: 5 }).fog).toBe(false);
    expect(createArenaState({ mode: 'duel', teamSetup: '2p', stageIndex: 6 }).fog).toBe(false);
  });

  it('the Warden calls a limited number of scout escorts', () => {
    const s = createArenaState({ mode: 'coop', teamSetup: '2p', stageIndex: 8 });
    s.enemiesRemainingToSpawn = [];
    s.grid = s.grid.map((row, r) => (r >= 11 ? row : row.map(() => ({ kind: 'empty' as const, hp: 0, maxHp: 0 }))));
    const boss = createEnemyTank('w', 'boss-warden', 9, 4);
    s.tanks.push(boss);
    const total = s.totalEnemies;
    for (const tk of s.tanks) if (tk.team === 1) tk.spawnProtected = 999;
    run(s, 40, rng(9));
    expect(boss.bossSummons).toBeGreaterThan(0);
    expect(boss.bossSummons).toBeLessThanOrEqual(6);
    expect(s.totalEnemies).toBe(total + (boss.bossSummons ?? 0));
  });
});

type Hook = {
  getState: () => ArenaState;
  getScreen: () => string;
  getCampaign: () => CampaignSave;
  getRunPerks: () => Record<string, number>;
  startBattle: () => void;
  setConfig: (patch: Record<string, unknown>) => void;
  action: (id: string) => void;
  step: (frames?: number) => void;
};
const hook = () => (globalThis as unknown as { __tankClash: Hook }).__tankClash;

function makeServices(stored: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(stored));
  return {
    store,
    services: {
      storage: {
        get: <T>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
        set: (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
        remove: (k: string) => void store.delete(k)
      },
      sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
      random: rng(0x1234),
      reportScore: vi.fn(),
      reportComplete: vi.fn(),
      isReducedMotion: true
    } satisfies GameServices
  };
}

function clearCurrentStage(fast = true) {
  const s = hook().getState();
  s.enemiesRemainingToSpawn = [];
  s.spawnWarnings = [];
  if (!fast) s.roundTimer = 9999;
  for (const tk of s.tanks) if (tk.team === 3) tk.alive = false;
  hook().step(2);
  hook().step(80);
}

describe('Tank Clash campaign shell: stars, upgrades, unlocks and Continue', () => {
  it('awards stars, offers three upgrades and carries the picked one into the next stage', () => {
    const host = document.createElement('div');
    const { services, store } = makeServices({ teamSetup: '1p-solo' });
    const controller = tankClash.mount(host, services);
    hook().startBattle();
    clearCurrentStage();
    expect(hook().getScreen()).toBe('results');
    expect(host.querySelectorAll('.tc-star.is-got')).toHaveLength(3);
    const perkButtons = [...host.querySelectorAll<HTMLElement>('[data-id^="perk-"]')];
    expect(perkButtons).toHaveLength(3);
    expect(perkButtons[0].classList.contains('is-on')).toBe(true);
    const chosen = perkButtons[2].dataset.id!.slice(5);
    hook().action(`perk-${chosen}`);
    expect(host.querySelector(`[data-id="perk-${chosen}"]`)?.classList.contains('is-on')).toBe(true);
    hook().action('res-next');
    expect(hook().getState().stageIndex).toBe(1);
    expect(hook().getRunPerks()).toEqual({ [chosen]: 1 });
    expect(hook().getState().perks).toEqual({ [chosen]: 1 });
    expect((store.get('campaign') as CampaignSave).stars[0]).toBe(3);
    // Over par and with the Eagle hit: only the clear star, and the best is kept.
    const s = hook().getState();
    s.baseUntouched = false;
    clearCurrentStage(false);
    expect(host.querySelectorAll('.tc-star.is-got')).toHaveLength(1);
    expect(hook().getCampaign().stars.slice(0, 2)).toEqual([3, 1]);
    controller.destroy();
  });

  it('upgrades change the tank: armour, mines, lives and a steel-walled Eagle', () => {
    const plain = createArenaState({ mode: 'coop', teamSetup: '1p-ai' });
    const built = createArenaState({ mode: 'coop', teamSetup: '1p-ai', perks: { armour: 2, mines: 1, life: 1, bulwark: 1 } });
    expect(built.tanks[0].maxHp).toBe(plain.tanks[0].maxHp + 2);
    expect(built.tanks[0].mines).toBe(plain.tanks[0].mines + 2);
    expect(built.tanks[1].lives).toBe(plain.tanks[1].lives + 1);
    expect(built.grid[11][9].kind).toBe('steel');
    expect(built.baseFortifyTimer).toBeGreaterThan(0);
    // Duels ignore run upgrades.
    expect(createArenaState({ mode: 'duel', teamSetup: '2p', perks: { armour: 3 } }).perks).toEqual({});
  });

  it('keeps stages 1-6 open and opens 7-12 one clear at a time', () => {
    const fresh = loadCampaign(null);
    for (let i = 0; i < 6; i++) expect(stageUnlocked(fresh, i)).toBe(true);
    expect(stageUnlocked(fresh, 6)).toBe(false);
    fresh.stars[5] = 1;
    expect(stageUnlocked(fresh, 6)).toBe(true);
    expect(stageUnlocked(fresh, 7)).toBe(false);
    // Junk in storage never breaks the lobby.
    const junk = loadCampaign({ stars: ['x', 9, -2], crowns: 'no', resume: { stageIndex: 99 } });
    expect(junk.stars.slice(0, 3)).toEqual([0, 3, 0]);
    expect(junk.resume).toBeNull();

    const host = document.createElement('div');
    const { services } = makeServices();
    const controller = tankClash.mount(host, services);
    hook().setConfig({ stageIndex: 5 });
    hook().action('stage-next');
    expect(hook().getState().stageIndex).toBe(0); // stage 7 is still locked
    expect(host.querySelector('.tc-overlay')?.textContent).toContain('Stage 7 opens when you clear stage 6');
    controller.destroy();
  });

  it('a boss stage defeat offers a retry from the boss, and Continue resumes there with the run', () => {
    const host = document.createElement('div');
    const { services, store } = makeServices({ teamSetup: '1p-solo' });
    let controller = tankClash.mount(host, services);
    hook().setConfig({ stageIndex: 2, difficulty: 'hard' });
    hook().startBattle();
    const s = hook().getState();
    s.enemiesRemainingToSpawn = ['boss-behemoth', 'scout'];
    s.spawnTimer = 0;
    s.score = 1234;
    hook().step(60 * 3);
    expect(hook().getState().checkpointWave).toEqual(['boss-behemoth', 'scout']);
    const saved = (store.get('campaign') as CampaignSave).resume;
    expect(saved?.checkpoint?.wave).toEqual(['boss-behemoth', 'scout']);
    expect(saved?.difficulty).toBe('hard');
    // Lose: the Eagle falls.
    for (const [c, r] of [[9, 12], [10, 12]]) hook().getState().grid[r][c].hp = 1;
    const mid = cellCenter(9.5, 11);
    detonateExplosion(hook().getState(), mid.x, mid.y, TILE * 1.8, 2, 3, undefined, false, rng(1));
    hook().step(90);
    expect(hook().getScreen()).toBe('results');
    expect(host.querySelector('[data-id="res-checkpoint"]')).not.toBeNull();
    expect(host.querySelector('[data-id="res-next"]')).not.toBeNull();
    hook().action('res-checkpoint');
    const retry = hook().getState();
    expect(retry.outcome).toBe('none');
    expect(retry.enemiesRemainingToSpawn).toEqual(['boss-behemoth', 'scout']);
    expect(retry.score).toBe(1234);
    controller.destroy();

    // A new visit: Continue puts you straight back at the boss on Hard.
    controller = tankClash.mount(host, services);
    const cont = host.querySelector<HTMLElement>('[data-id="continue"]');
    expect(cont?.textContent).toContain('stage 3 boss');
    hook().action('continue');
    expect(hook().getScreen()).toBe('none');
    expect(hook().getState().stageIndex).toBe(2);
    expect(hook().getState().difficulty).toBe('hard');
    expect(hook().getState().enemiesRemainingToSpawn[0]).toBe('boss-behemoth');
    controller.destroy();
  });
});

describe('Tank Clash versus rematch', () => {
  it('a rematch swaps the starting sides, and rounds inside a match keep them', () => {
    const host = document.createElement('div');
    const { services } = makeServices({ mode: 'duel', teamSetup: '2p' });
    const controller = tankClash.mount(host, services);
    hook().startBattle();
    const [p1, p2] = hook().getState().tanks;
    expect(p1.x).toBeLessThan(p2.x);
    const s = hook().getState();
    s.p1Wins = 4;
    s.tanks[1].alive = false;
    hook().step(2);
    expect(hook().getState().outcome).toBe('duel-victory');
    hook().step(120);
    expect(host.querySelector('[data-id="res-next"]')?.textContent).toContain('swap sides');
    hook().action('res-next');
    const swapped = hook().getState();
    expect(swapped.swapSides).toBe(true);
    expect(swapped.p1Wins).toBe(0);
    expect(swapped.tanks[0].x).toBeGreaterThan(swapped.tanks[1].x);
    expect(swapped.tanks[0].dir).toBe('left');
    // Next round of the same match: still swapped.
    swapped.tanks[1].alive = false;
    hook().step(2);
    expect(hook().getState().outcome).toBe('round-over');
    hook().step(120);
    hook().action('res-next');
    expect(hook().getState().swapSides).toBe(true);
    expect(hook().getState().tanks[0].x).toBeGreaterThan(hook().getState().tanks[1].x);
    controller.destroy();
  });
});
