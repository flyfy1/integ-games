import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';

// The opt-in debug interface exposes the live simulation, not a second game implementation.
type State = Record<string, any>;
type Debug = { g: State; player: State; boss: State; enemies: State[]; level: State; start(): void; step(n?: number): void; warp(x: number): void; press(key: string, down?: boolean): void };
let controller: GameController | undefined;
const complete = vi.fn(), reportScore = vi.fn();
function boot(level = '2') {
  history.replaceState({}, '', `/play/ashfall?ashfall-debug&ashfall-level=${level}`);
  const host = document.createElement('div'); document.body.append(host);
  let seed = 1234;
  controller = createAshfall(host, {
    random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    storage: { get: (_key, fallback) => fallback, set: vi.fn(), remove: vi.fn() },
    sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
    isReducedMotion: true, reportComplete: complete, reportScore
  });
  const d = (globalThis as unknown as { __ashfall: Debug }).__ashfall;
  d.start(); return d;
}
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); history.replaceState({}, '', '/'); vi.clearAllMocks(); });
function arena(d: Debug) {
  d.warp(11250); d.step(240);
  d.enemies.forEach((e) => { e.dead = true; });
}
function finishBoss(d: Debug) {
  arena(d);
  Object.assign(d.boss, { phase: 2, armor: 0, hp: 1, state: 'idle', cd: 100 });
  Object.assign(d.player, { x: d.boss.x - 160, y: 450, face: 1, ammo: 4, shootCd: 0, invuln: true });
  d.press('shoot'); d.step(340);
}

describe('Ashfall second descent', () => {
  it('retains the default Level 1 world and boss balance for invalid selectors', () => {
    const d = boot('unknown');
    expect(d.g.level).toBe(1);
    expect(d.level.ZONES.map((z: State) => z.id)).toEqual(['woods', 'quarter', 'foundry']);
    expect(d.boss.armor).toBe(400); expect(d.boss.hp).toBe(480);
    expect(d.level.CHECKPOINTS).toEqual([60, 3960, 7960, 10900]);
    expect(d.level.ENEMIES).toHaveLength(27);
  });

  it('has reachable checkpoints, ground enemies, ambushes and traversable pits', () => {
    const d = boot(), data = d.level, solids = data.buildSolids();
    expect(data.ZONES).toHaveLength(3); expect(data.WORLD_END).toBe(12000);
    const groundAt = (x: number) => solids.some((s: State) => !s.oneway && x >= s.x && x <= s.x + s.w);
    for (const x of data.CHECKPOINTS) expect(groundAt(x)).toBe(true);
    for (const [type, x] of data.ENEMIES) if (type !== 'drone') expect(groundAt(x)).toBe(true);
    expect(data.AMBUSHES.length).toBeGreaterThanOrEqual(2);
    for (const a of data.AMBUSHES) {
      for (let x = a.l; x <= a.r; x += 10) expect(groundAt(x)).toBe(true);
      for (const [, x] of a.wave) expect(x > a.l && x < a.r).toBe(true);
    }
    for (const pit of data.PITS) {
      expect(pit.w).toBeLessThanOrEqual(170);
      expect(groundAt(pit.x + pit.w / 2)).toBe(false);
      expect(groundAt(pit.x - 1) && groundAt(pit.x + pit.w + 1)).toBe(true);
    }
  });

  it('continues after the Warden, carries run totals, and reports completion only at the finale', () => {
    const d = boot('1'); d.g.score = 123; d.g.kills = 4; d.g.deaths = 2;
    finishBoss(d);
    expect(d.g.mode).toBe('interlude'); expect(complete).not.toHaveBeenCalled();
    const score = d.g.score, time = d.g.playT;
    d.step(330);
    expect(d.g.level).toBe(2); expect(d.g.mode).toBe('play');
    expect(d.g.score).toBe(score); expect(d.g.kills).toBe(4); expect(d.g.deaths).toBe(2);
    expect(d.g.playT).toBeGreaterThanOrEqual(time);
    expect(d.player.hp).toBe(100); expect(d.g.cpIdx).toBe(0); expect(d.g.ambushDone.size).toBe(0);
    finishBoss(d);
    expect(d.g.mode).toBe('victory'); expect(complete).toHaveBeenCalledTimes(1);
    expect(reportScore).toHaveBeenCalledTimes(1);
    d.step(300); expect(complete).toHaveBeenCalledTimes(1);
    controller!.restart(); expect(d.g.level).toBe(1); expect(d.g.score).toBe(0);
  });

  it('awards checkpoint upgrades once and preserves them through respawn', () => {
    const d = boot(); d.warp(3960); d.g.cpIdx = 1;
    d.press('right'); d.step(12); d.press('right', false);
    expect(d.g.upgrades.has('edge')).toBe(true); expect(d.g.cpIdx).toBe(2);
    Object.assign(d.player, { dead: true, deadT: 3, hp: 0 }); d.step();
    expect(d.player.hp).toBe(100); expect(d.player.x).toBe(3970); expect(d.player.safe).toEqual({ x: 3970, y: 450 }); expect(d.g.upgrades.has('edge')).toBe(true);
    expect(d.g.upgrades.size).toBe(1);
    controller!.restart(); expect(d.g.upgrades.size).toBe(0); expect(d.g.level).toBe(2);
  });

  it('seals ambushes, resets a failed wave, and releases completed gates', () => {
    const d = boot(); d.warp(3410); d.step();
    expect(d.g.ambush).not.toBeNull(); expect(d.enemies.filter((e) => e.ambush && !e.dead)).toHaveLength(3);
    d.g.cpIdx = 1; Object.assign(d.player, { dead: true, deadT: 3, hp: 0 }); d.step();
    expect(d.g.ambush).toBeNull(); expect(d.player.x).toBe(2830);
    expect(d.g.ambushDone.size).toBe(0);
    d.warp(3410); d.step(); d.enemies.forEach((e) => { e.dead = true; }); d.step(70);
    expect(d.g.ambush).toBeNull(); expect(d.g.ambushDone.has(0)).toBe(true);
  });

  it('locks lightning warnings, damages columns and leaves safe gaps', () => {
    const d = boot(); arena(d);
    Object.assign(d.boss, { state: 'idle', cd: 0, next: 'conduit' }); d.step();
    expect(d.boss.attack).toBe('conduit');
    const locked = [...d.boss.conduitXs];
    const x = locked.find((v) => v > 11100 && v < 11400)!;
    Object.assign(d.player, { x: x + 90, hp: 100, iframe: 0 });
    d.step(80); expect(d.boss.conduitXs).toEqual(locked); expect(d.player.hp).toBe(100);
    while (d.boss.state === 'windup') d.step();
    expect(d.g.conduits.length).toBeGreaterThan(0); expect(d.player.hp).toBe(100);
    d.player.x = x; d.step(); expect(d.player.hp).toBe(83);
    // Death clears all pending columns before the checkpoint can become playable.
    Object.assign(d.player, { dead: true, deadT: 3 }); d.g.hitstop = 0; d.step();
    expect(d.g.conduits).toHaveLength(0); expect(d.boss.state).toBe('dormant');
  });

  it('keeps retreating drones reachable inside Level 2 seals', () => {
    const d = boot(); d.warp(3410); d.step();
    const a = d.g.ambush, drone = d.enemies.find((e) => e.ambush && e.type === 'drone')!;
    d.enemies.forEach((e) => { if (e !== drone) e.dead = true; });
    d.player.invuln = true; d.player.x = a.r - 15;
    Object.assign(drone, { x: a.r - 10, state: 'chase', cd: 100 });
    d.step(180);
    expect(drone.x).toBeGreaterThanOrEqual(a.l + 60); expect(drone.x).toBeLessThanOrEqual(a.r - 60);
    expect(drone.hp).toBe(26); expect(d.g.ambush).toBe(a);
  });

  it('leaves time to shift between the second-phase lightning pulses', () => {
    const d = boot(); arena(d);
    Object.assign(d.boss, { phase: 2, state: 'idle', cd: 0, next: 'conduit' }); d.step();
    const x = d.boss.conduitXs.find((v: number) => v > 11100 && v < 11400)!;
    d.player.x = x + 90;
    for (let n = 0; n < 120 && d.boss.state === 'windup'; n++) d.step();
    expect(d.boss.state).toBe('recover'); expect(d.player.hp).toBe(100);
    const second = d.g.conduits.filter((c: State) => c.t < 0);
    expect(second.length).toBeGreaterThan(0);
    expect(new Set(second.map((c: State) => c.x)).size).toBe(second.length);
    d.step(25); // first pulse expires before the second pulse's warning ends
    expect(d.player.hp).toBe(100); d.player.x = x;
    d.step(75); expect(d.player.hp).toBe(100); expect(d.g.conduits).toHaveLength(0);
  });

  it('crosses each Level 2 pit using ordinary held-jump input', () => {
    const d = boot(); d.enemies.forEach((e) => { e.dead = true; });
    for (const pit of d.level.PITS) {
      d.warp(pit.x - 45); Object.assign(d.player, { vx: 300, vy: 0, grounded: true, hp: 100 });
      d.press('right'); d.press('jump'); d.step(48);
      d.press('jump', false); d.press('right', false);
      expect(d.player.x).toBeGreaterThan(pit.x + pit.w);
      expect(d.player.hp).toBe(100);
    }
  });

  it('pauses simulation and supports the touch control path in Level 2', () => {
    const media = vi.spyOn(globalThis, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    try {
      const d = boot(); expect(document.querySelector('.ashfall-touch.on')).not.toBeNull();
      controller!.pause(); const t = d.g.time; d.step(60); expect(d.g.time).toBe(t);
      controller!.resume();
      document.querySelector('[aria-label="jump"]')!.dispatchEvent(new Event('pointerdown'));
      d.step(5); expect(d.player.y).toBeLessThan(450);
      document.querySelector('[aria-label="jump"]')!.dispatchEvent(new Event('pointerup'));
    } finally { media.mockRestore(); }
  });
});
