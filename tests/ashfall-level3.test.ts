import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';
type State = Record<string, any>;
let controller: GameController;
function boot() {
  history.replaceState({}, '', '/play/ashfall?ashfall-debug&ashfall-level=3');
  const host = document.createElement('div'); document.body.append(host);
  controller = createAshfall(host, { random: () => 0.5, isReducedMotion: true, storage: { get: (_k: string, f: unknown) => f, set: vi.fn(), remove: vi.fn() } } as any);
  const d = (globalThis as any).__ashfall; d.start(); return d;
}
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); });
function arena(d: State, attack: string, phase = 1) {
  d.warp(12200); d.step(240); d.enemies.forEach((e: State) => e.dead = true);
  Object.assign(d.player, { x: 12300, y: 450, vx: 0, vy: 0, hp: 100, iframe: 0, grounded: true, invuln: false });
  Object.assign(d.boss, { x: 12770, state: 'idle', cd: 0, next: attack, phase });
  d.step();
}
describe('Level III scoped content and attacks', () => {
  it('preserves the 13000px map, encounter counts and raised-ground placement', () => {
    const d = boot(), l = d.level;
    expect(l.ZONES.map((z: State) => z.chapter)).toEqual(['VII', 'VIII', 'IX']);
    expect(l.WORLD_END).toBe(13000); expect(l.ARENA).toEqual({ left: 12000, right: 13000, trigger: 12180 });
    expect(l.ENEMIES).toHaveLength(31); expect(l.AMBUSHES.reduce((n: number, a: State) => n + a.wave.length, 0)).toBe(13);
    expect(l.PITS).toHaveLength(7); expect(l.CHECKPOINTS).toHaveLength(5); expect(l.MEDKITS).toHaveLength(8);
    expect(d.enemies.find((e: State) => e.home === 5800).y).toBe(342);
    for (const e of d.enemies) expect(e.maxHp).toBe(({ husk: 39, hound: 28, brute: 138, drone: 30 } as State)[e.type]);
    expect(d.g.flood).toBeUndefined(); expect(d.boss.armor).toBe(460); expect(d.boss.hp).toBe(560);
  });
  it('uses scaled HP for every sealed wave, contains drones, and restores maxHp on respawn', () => {
    const d = boot();
    for (const a of d.level.AMBUSHES) {
      d.warp(a.x); d.step(); expect(d.g.ambush).not.toBeNull();
      const wave = d.enemies.filter((e: State) => e.ambush && !e.dead);
      expect(wave).toHaveLength(a.wave.length);
      for (const e of wave) expect(e.hp).toBe(({ husk: 39, hound: 28, brute: 138, drone: 30 } as State)[e.type]);
      d.player.invuln = true; const drone = wave.find((e: State) => e.type === 'drone');
      Object.assign(drone, { x: a.r - 10, state: 'chase', cd: 100 }); d.player.x = a.r - 15; d.step(100);
      expect(drone.x).toBeLessThanOrEqual(a.r - 60);
      d.enemies.forEach((e: State) => e.dead = true); d.step(70); expect(d.g.ambush).toBeNull();
    }
    controller.restart(); const e = d.enemies[0]; e.hp = 1;
    d.player.dead = true; d.player.deadT = 3; d.step(); expect(e.hp).toBe(e.maxHp);
  });
  it('crosses every pit by ordinary held jumps, landing on the intermediate ledges', () => {
    const d = boot(); d.enemies.forEach((e: State) => e.dead = true); d.g.ambushDone = new Set([0, 1, 2]);
    for (const pit of d.level.PITS) {
      d.warp(pit.x - 30); Object.assign(d.player, { vx: 300, vy: 0, grounded: true, hp: 100, atk: null });
      d.press('right'); d.press('jump'); let landed = false;
      for (let n = 0; n < 50; n++) { d.step(); if (n > 5 && d.player.grounded) { landed = true; break; } }
      d.press('jump', false);
      expect(landed, `landing for ${pit.x}`).toBe(true);
      if (pit.w > 250) {
        expect(d.player.x).toBeGreaterThan(pit.x); expect(d.player.x).toBeLessThan(pit.x + pit.w);
        d.press('jump'); d.step(42); d.press('jump', false);
      }
      expect(d.player.x, `crossing ${pit.x}`).toBeGreaterThanOrEqual(pit.x + pit.w); expect(d.player.hp).toBe(100);
      d.press('right', false);
    }
  });
  it('rescues descent falls and respawns safely at every checkpoint', () => {
    const d = boot(); d.enemies.forEach((e: State) => e.dead = true);
    Object.assign(d.player, { y: 700, hp: 100, grounded: false }); d.step(); expect(d.player.hp).toBe(70); expect(d.player.y).toBe(450);
    for (let i = 0; i < d.level.CHECKPOINTS.length; i++) {
      d.g.cpIdx = i; Object.assign(d.player, { dead: true, deadT: 3 }); d.step();
      expect(d.player.x).toBe(d.level.CHECKPOINTS[i]); expect(d.player.y).toBe(450); expect(d.player.hp).toBe(100);
    }
  });
  it.each([1, 2])('warns and staggers alternating pillar waves in phase %i', phase => {
    const d = boot(); arena(d, 'pillars', phase);
    expect([...new Set(d.g.pillars.map((p: State) => p.wave))]).toEqual(phase === 1 ? [0, 1] : [0, 1, 2]);
    const pl = d.g.pillars[0]; expect(pl.warn).toBe(phase === 1 ? 0.9 : 0.75); expect(pl.dur).toBe(0.34);
    d.player.x = pl.x;
    while (pl.t < pl.warn - 0.02) d.step(); expect(d.player.hp).toBe(100);
    d.step(2); expect(d.player.hp).toBe(86);
    expect(d.g.conduits).toHaveLength(0);
  });
  it('lets ordinary movement evade a pillar warning', () => {
    const d = boot(); arena(d, 'pillars'); const pl = d.g.pillars[0]; d.player.x = pl.x;
    while (pl.t < 0) d.step(); d.press('right'); d.step(24); d.press('right', false);
    d.step(42); expect(d.player.hp).toBe(100); expect(d.player.x).toBeGreaterThan(pl.x + 60);
  });
  it('locks the hook, captures for eight damage, pulls and telegraphs a slam', () => {
    const d = boot(); arena(d, 'hook'); const dir = d.boss.hookDir;
    d.player.x -= 40; d.step(20); expect(d.boss.hookDir).toBe(dir);
    for (let i = 0; i < 120 && !d.player.hooked; i++) d.step();
    expect(d.player.hooked).toBe(true); expect(d.player.hp).toBe(92);
    const x = d.player.x; d.step(15); expect(d.player.x).toBeGreaterThan(x);
    for (let i = 0; i < 180 && d.boss.attack !== 'slam'; i++) d.step();
    expect(d.player.hooked).toBe(false); expect(d.boss.attack).toBe('slam'); expect(d.boss.state).toBe('windup');
  });
  it.each(['jump', 'roll'])('evades hook flight with actual %s input', action => {
    const d = boot(); arena(d, 'hook');
    while (!d.g.hooks.length) d.step();
    while (Math.abs(d.g.hooks[0].x - d.player.x) > 135) d.step();
    d.press(action); d.step(action === 'jump' ? 30 : 20); d.press(action, false);
    expect(d.player.hp).toBe(100); expect(d.player.hooked).toBe(false);
  });
  it('explains both new patterns in a readable DOM cue without changing timing', () => {
    const d = boot(); arena(d, 'pillars'); d.render();
    const cue = document.querySelector('.ashfall-pattern')!;
    expect(cue.textContent).toBe('PILLARS · step aside, then switch lanes');
    d.g.pillars = []; Object.assign(d.boss, { state: 'idle', cd: 0, next: 'hook' }); d.step(); d.render();
    expect(cue.textContent).toBe('CHAIN HOOK · jump or roll');
    d.g.hooks = []; d.boss.state = 'idle'; d.boss.cd = 100; d.render(); expect(cue.textContent).toContain('Build heat');
    expect((cue as HTMLElement).hidden).toBe(false);
  });
  it('clears pillars, capture and scheduled boss events on death and phase-two respawn', () => {
    const d = boot(); arena(d, 'pillars', 2);
    d.g.hooks.push({ state: 'pull' }); d.player.hooked = true;
    Object.assign(d.player, { dead: true, deadT: 3 }); d.step();
    expect(d.g.pillars).toHaveLength(0); expect(d.g.hooks).toHaveLength(0); expect(d.player.hooked).toBe(false);
    expect(d.boss.events).toHaveLength(0); expect(d.boss.phase).toBe(2); expect(d.boss.state).toBe('dormant');
  });
});
