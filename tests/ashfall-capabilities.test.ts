import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';
let controller: GameController;
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); });
// Campaign v3 baseline includes intentional momentum/overdrive rewards. Gameplay and cosmetic RNG streams are seeded.
// Exercise exploration, checkpoint rescue, seals, both boss phases and their normal choices.
for (const level of [1, 2]) it(`locks the seeded campaign-v3 Level ${level} simulation`, () => {
  let seed = 779;
  vi.spyOn(Math, 'random').mockImplementation(() => ((seed = seed * 16807 % 2147483647) / 2147483647));
  history.replaceState({}, '', `/play/ashfall?ashfall-debug&ashfall-level=${level}`);
  const host = document.createElement('div'); document.body.append(host);
  controller = createAshfall(host, { random: Math.random, isReducedMotion: true, storage: { get: (_k: string, fallback: unknown) => fallback, set: vi.fn(), remove: vi.fn() } } as any);
  const d = (globalThis as any).__ashfall; d.start(); d.bot(true);
  const trace: unknown[] = [];
  const sample = () => trace.push(JSON.parse(JSON.stringify({ player: ['x', 'y', 'hp', 'ammo', 'vx', 'vy', 'dead'].map(k => d.player[k]), boss: ['x', 'state', 'phase', 'attack', 'armor', 'hp'].map(k => d.boss[k]), enemies: d.enemies.map((e: any) => [e.type, e.x, e.y, e.hp, e.dead, e.state]), totals: [d.g.score, d.g.kills, d.g.deaths, d.g.playT], flood: d.g.flood, upgrades: [...d.g.upgrades], conduits: d.g.conduits })));
  for (let i = 0; i < 12; i++) { d.step(120); sample(); }
  for (const x of [3410, 4100, 8000, 11250]) { d.warp(x); d.step(240); sample(); }
  d.player.dead = true; d.player.deadT = 3; d.step(30); sample();
  d.warp(11250); d.player.invuln = true; d.step(240);
  for (const phase of [1, 2]) { d.boss.phase = phase; for (let i = 0; i < 8; i++) { d.step(120); sample(); } }
  expect(createHash('sha256').update(JSON.stringify(trace)).digest('hex')).toMatchSnapshot();
});
