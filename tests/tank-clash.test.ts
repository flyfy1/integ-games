import { describe, expect, it, vi } from 'vitest';
import type { GameServices } from '../src/core/game-types';
import {
  computeSightPath,
  createArenaState,
  detonateExplosion,
  fireTankWeapon,
  spawnPowerUpAt,
  stepArena,
  triggerTankSpecial
} from '../src/games/tank-clash/engine';
import tankClash from '../src/games/tank-clash/index';
import { cellCenter, TILE } from '../src/games/tank-clash/maps';
import type { PlayerControlInput } from '../src/games/tank-clash/types';

const idleControl: PlayerControlInput = {
  moveX: 0,
  moveY: 0,
  fire: false,
  fireJustPressed: false,
  specialJustPressed: false
};

function makeServices(): GameServices {
  const store = new Map<string, unknown>();
  let seed = 0x2468ace0;
  return {
    storage: {
      get: <T>(k: string, fb: T) => (store.has(k) ? (store.get(k) as T) : fb),
      set: (k, v) => {
        store.set(k, v);
      },
      remove: (k) => {
        store.delete(k);
      }
    },
    sound: {
      muted: false,
      setMuted: vi.fn(),
      stop: vi.fn(),
      play: vi.fn()
    },
    random: () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 2 ** 32;
    },
    reportScore: vi.fn(),
    reportComplete: vi.fn(),
    isReducedMotion: false
  };
}

describe('Tank Clash engine & dual modes', () => {
  it('supports both Co-op Base Defense and Versus Duel modes with 4 distinct tank chassis', () => {
    const coop = createArenaState({
      mode: 'coop',
      teamSetup: '2p',
      p1Chassis: 'vanguard',
      p2Chassis: 'titan'
    });
    expect(coop.tanks).toHaveLength(2);
    expect(coop.tanks[0].chassis).toBe('vanguard');
    expect(coop.tanks[0].maxHp).toBe(5);
    expect(coop.tanks[0].lives).toBe(4);
    expect(coop.tanks[1].chassis).toBe('titan');
    expect(coop.tanks[1].maxHp).toBe(7);
    expect(coop.baseAlive).toBe(true);
    expect(coop.grid[12][9].kind).toBe('base');
    expect(coop.grid[12][9].hp).toBe(6);

    const duel = createArenaState({
      mode: 'duel',
      teamSetup: '2p',
      p1Chassis: 'phantom',
      p2Chassis: 'prism'
    });
    expect(duel.tanks).toHaveLength(2);
    expect(duel.tanks[0].team).toBe(1);
    expect(duel.tanks[1].team).toBe(2);
    expect(duel.tanks[1].chassis).toBe('prism');
    expect(computeSightPath(duel, duel.tanks[1]).length).toBeGreaterThanOrEqual(2);
  });

  it('destroys bullets on wall/border impact without unscientific bouncing and lets Titan/Prism break steel', () => {
    const state = createArenaState({
      mode: 'duel',
      teamSetup: '2p',
      p1Chassis: 'prism',
      p2Chassis: 'titan'
    });
    const p1 = state.tanks[0];
    p1.x = TILE * 1.5;
    p1.y = TILE * 2.5;
    p1.dir = 'left'; // Aim at left boundary
    fireTankWeapon(state, p1);
    expect(state.bullets).toHaveLength(1);
    expect(state.bullets[0].bouncesLeft).toBe(0);

    // Step until bullet hits left border and detonates instead of bouncing
    for (let i = 0; i < 15; i++) {
      stepArena(state, 0.02, [idleControl, idleControl], () => 0.5);
    }
    expect(state.bullets).toHaveLength(0);

    // Titan AP shell damages Steel wall
    const p2 = state.tanks[1];
    state.grid[6][16] = { kind: 'steel', hp: 2, maxHp: 4 };
    p2.x = cellCenter(17, 6).x;
    p2.y = cellCenter(17, 6).y;
    p2.dir = 'left';
    p2.reloadTimer = 0;
    fireTankWeapon(state, p2);
    for (let i = 0; i < 15; i++) {
      stepArena(state, 0.02, [idleControl, idleControl], () => 0.5);
    }
    expect(state.grid[6][16].kind).toBe('empty');
  });

  it('teleports tanks and bullets through paired Warp Portals and chain-detonates Barrels', () => {
    const state = createArenaState({
      mode: 'duel',
      teamSetup: '2p',
      stageIndex: 1 // Portal Crossfire map
    });
    const p1 = state.tanks[0];
    // Portal 1 is at (1, 0) linked to (18, 12)
    expect(state.grid[0][1].kind).toBe('portal');
    const partnerCol = state.grid[0][1].partnerCol!;
    const partnerRow = state.grid[0][1].partnerRow!;
    p1.x = cellCenter(1, 0).x - 8;
    p1.y = cellCenter(1, 0).y;
    stepArena(
      state,
      0.05,
      [{ ...idleControl, moveX: 1 }, idleControl],
      () => 0.5
    );
    expect(Math.hypot(p1.x - cellCenter(partnerCol, partnerRow).x, p1.y - cellCenter(partnerCol, partnerRow).y)).toBeLessThan(TILE);

    // Place two adjacent explosive barrels and detonate the first
    state.grid[5][5] = { kind: 'barrel', hp: 1, maxHp: 1 };
    state.grid[5][6] = { kind: 'barrel', hp: 1, maxHp: 1 };
    state.grid[5][7] = { kind: 'brick', hp: 2, maxHp: 2 };
    const c5 = cellCenter(5, 5);
    detonateExplosion(state, c5.x, c5.y, TILE * 1.5, 2, 1, 0, true, () => 0.5);
    expect(state.grid[5][5].kind).toBe('empty');
    expect(state.grid[5][6].kind).toBe('empty');
    expect(state.grid[5][7].kind).toBe('empty');
  });

  it('collects power-ups, fortifies the Eagle Base with Steel walls, and plants Proximity Mines', () => {
    const state = createArenaState({
      mode: 'coop',
      teamSetup: '2p'
    });
    const p1 = state.tanks[0];
    p1.hp = 1;
    spawnPowerUpAt(state, p1.x, p1.y, () => 0.5, 'repair');
    stepArena(state, 0.02, [idleControl, idleControl], () => 0.5);
    expect(p1.hp).toBe(4);
    expect(state.baseFortifyTimer).toBeGreaterThan(10);
    expect(state.grid[11][9].kind).toBe('steel');

    // Deploy a proximity mine
    const minesBefore = p1.mines;
    triggerTankSpecial(state, p1);
    expect(p1.mines).toBe(minesBefore - 1);
    expect(state.mines).toHaveLength(1);
  });

  it('mounts cleanly, starts battle on input, and cleans up on destroy', () => {
    const host = document.createElement('div');
    const services = makeServices();
    const controller = tankClash.mount(host, services);
    expect(host.querySelector('[data-tank-clash] canvas')).not.toBeNull();

    const hook = (globalThis as unknown as {
      __tankClash: {
        getState: () => ReturnType<typeof createArenaState>;
        startBattle: () => void;
        step: (frames?: number) => void;
      };
    }).__tankClash;
    expect(hook).toBeDefined();
    hook.startBattle();
    hook.step(30);
    expect(hook.getState().roundTimer).toBeGreaterThan(0);

    controller.pause();
    controller.resume();
    controller.restart();
    controller.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
