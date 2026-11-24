import { describe, expect, it } from 'vitest';
import {
  baseHp,
  buildWaveList,
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
import { cellCenter, TILE } from '../src/games/tank-clash/maps';
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
