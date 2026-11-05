import type { ChassisId, ChassisSpec, PowerUpKind, TileCell, TileKind } from './types';

export const WIDTH = 1280;
export const HEIGHT = 720;
export const COLS = 20;
export const ROWS = 13;
export const TILE = 46;
export const ARENA_W = COLS * TILE; // 920
export const ARENA_H = ROWS * TILE; // 598
export const ARENA_X = Math.floor((WIDTH - ARENA_W) / 2); // 180
export const ARENA_Y = 78;

export const CHASSIS_ORDER: readonly ChassisId[] = ['vanguard', 'phantom', 'titan', 'prism'];

export const CHASSIS_SPECS: Record<ChassisId, ChassisSpec> = {
  vanguard: {
    id: 'vanguard',
    maxHp: 5,
    speed: 185,
    reload: 0.34,
    bulletSpeed: 460,
    baseBounces: 0,
    pierceSteel: false,
    splashRadius: 0,
    burstCount: 1,
    laserSight: false,
    colorPrimary: '#36d6ff',
    colorAccent: '#ffd15c'
  },
  phantom: {
    id: 'phantom',
    maxHp: 4,
    speed: 240,
    reload: 0.24,
    bulletSpeed: 500,
    baseBounces: 0,
    pierceSteel: false,
    splashRadius: 0,
    burstCount: 2,
    laserSight: false,
    colorPrimary: '#4ef5b8',
    colorAccent: '#b48eff'
  },
  titan: {
    id: 'titan',
    maxHp: 7,
    speed: 155,
    reload: 0.48,
    bulletSpeed: 420,
    baseBounces: 0,
    pierceSteel: true,
    splashRadius: 48,
    burstCount: 1,
    laserSight: false,
    colorPrimary: '#ff6e59',
    colorAccent: '#ffcb6b'
  },
  prism: {
    id: 'prism',
    maxHp: 5,
    speed: 192,
    reload: 0.36,
    bulletSpeed: 580,
    baseBounces: 0,
    pierceSteel: true,
    splashRadius: 0,
    burstCount: 1,
    laserSight: true,
    colorPrimary: '#e879f9',
    colorAccent: '#5eead4'
  }
};

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'spread',
  'ricochet',
  'laser',
  'homing',
  'shield',
  'mine',
  'freeze',
  'repair'
];

export const POWERUP_INFO: Record<PowerUpKind, { icon: string; color: string; badge: string }> = {
  spread: { icon: '🔱', color: '#ff9f43', badge: '3X' },
  ricochet: { icon: '🔥', color: '#54a0ff', badge: 'RAPID' },
  laser: { icon: '⚡', color: '#ff5252', badge: 'LASER' },
  homing: { icon: '🚀', color: '#ff6bcb', badge: 'MSL' },
  shield: { icon: '🛡️', color: '#48dbfb', badge: 'SHD' },
  mine: { icon: '💣', color: '#feca57', badge: 'MINE' },
  freeze: { icon: '❄️', color: '#70f0c2', badge: 'EMP' },
  repair: { icon: '🔧', color: '#1dd1a1', badge: 'FIX' }
};

/**
 * Legend for 20x13 map blueprints:
 * `.` = empty
 * `#` = brick wall (destructible, 2 HP)
 * `@` = steel wall (indestructible unless AP/Laser/Barrel)
 * `%` = stealth bush (camouflages tanks)
 * `~` = water (blocks tanks, passes bullets)
 * `=` = slippery ice (drift inertia)
 * `!` = explosive barrel (chain reaction)
 * `1` = portal pair 1 (Blue)
 * `2` = portal pair 2 (Orange)
 */
export const COOP_MAPS: readonly string[][] = [
  // Stage 1: Brick Outpost
  [
    '....#..........#....',
    '.##.#.###..###.#.##.',
    '.##...# !..! #...##.',
    '....%%........%%....',
    '###.%%.##@@##.%%.###',
    '..#....#....#....#..',
    '..!.@#........#@.!..',
    '..#..###.##.###..#..',
    '###......##......###',
    '....%%.#....#.%%....',
    '.##.%%.#....#.%%.##.',
    '.#................#.',
    '........####........'
  ],
  // Stage 2: Twin Bridges
  [
    '....#....@@....#....',
    '.1..#.%......%.#..1.',
    '.##...########...##.',
    '....!..........!....',
    '~~~~..~~~@@~~~..~~~~',
    '~~~~..~~~@@~~~..~~~~',
    '....%%........%%....',
    '.##.%%.#!..!#.%%.##.',
    '..#....######....#..',
    '..@...#......#...@..',
    '.##..............##.',
    '.......#....#.......',
    '........####........'
  ],
  // Stage 3: Frost Citadel (Boss Stage)
  [
    '....=..........=....',
    '.@@.=.###..###.=.@@.',
    '.======.!..!.======.',
    '..===.========.===..',
    '#.===.%%....%%.===.#',
    '#.....%%.@@.%%.....#',
    '..!.@...====...@.!..',
    '..#....======....#..',
    '###.##.======.##.###',
    '....==........==....',
    '.##.====....====.##.',
    '.......#....#.......',
    '........####........'
  ],
  // Stage 4: Warp Labyrinth
  [
    '....@.1......2.@....',
    '.##.#..##..##..#.##.',
    '..!...%......%...!..',
    '###.@.#.####.#.@.###',
    '....#....@@....#....',
    '.~~...########...~~.',
    '.~~.!..........!.~~.',
    '....%%.##@@##.%%....',
    '###.%%.#....#.%%.###',
    '..2..............1..',
    '.##.###......###.##.',
    '.......#....#.......',
    '........####........'
  ],
  // Stage 5: Powder Keg Valley
  [
    '....!..........!....',
    '.##.#.!#.@@.#!.#.##.',
    '..!....#....#....!..',
    '###.%%.!.##.!.%%.###',
    '....%%...@@...%%....',
    '~~~...!.#..#.!...~~~',
    '~~~.@..........@.~~~',
    '....#.!..!!..!.#....',
    '.##.#.###..###.#.##.',
    '..!..===....===..!..',
    '.#...===....===...#.',
    '.......#....#.......',
    '........####........'
  ],
  // Stage 6: Omega Showdown (Final Boss Stage)
  [
    '....@..........@....',
    '.1..#.!..@@..!.#..2.',
    '.##...%%....%%...##.',
    '....=.%%....%%.=....',
    '@@..====.@@.====..@@',
    '....=...#..#...=....',
    '..!.#.!......!.#.!..',
    '~~~~..###@@###..~~~~',
    '....#..........#....',
    '.2..%.##....##.%.1..',
    '.##...#......#...##.',
    '.......#....#.......',
    '........####........'
  ]
];

export const DUEL_MAPS: readonly string[][] = [
  // Arena 1: Ricochet Temple (Angled Steel & Explosive Center)
  [
    '....#....@@....#....',
    '.@...%........%...@.',
    '...#..@.!..!.@..#...',
    '.#....#......#....#.',
    '...%%...####...%%...',
    '...%%.@.!..!.@.%%...',
    '.....@........@.....',
    '...%%.@.!..!.@.%%...',
    '...%%...####...%%...',
    '.#....#......#....#.',
    '...#..@.!..!.@..#...',
    '.@...%........%...@.',
    '....#....@@....#....'
  ],
  // Arena 2: Portal Crossfire
  [
    '.1....#..@@..#....2.',
    '...##....!!....##...',
    '....#.%%....%%.#....',
    '.#....%%.##.%%....#.',
    '...~.....@@.....~...',
    '...~.#.!....!.#.~...',
    '.....@........@.....',
    '...~.#.!....!.#.~...',
    '...~.....@@.....~...',
    '.#....%%.##.%%....#.',
    '....#.%%....%%.#....',
    '...##....!!....##...',
    '.2....#..@@..#....1.'
  ],
  // Arena 3: Frozen Lake
  [
    '....===..@@..===....',
    '.#..============..#.',
    '...===.!....!.===...',
    '.@.===.======.===.@.',
    '...===.%%==%%.===...',
    '.....=.%%@@%%.=.....',
    '...!....====....!...',
    '.....=.%%@@%%.=.....',
    '...===.%%==%%.===...',
    '.@.===.======.===.@.',
    '...===.!....!.===...',
    '.#..============..#.',
    '....===..@@..===....'
  ],
  // Arena 4: River Siege
  [
    '....#.1..~~..2.#....',
    '...##...~~~~...##...',
    '....!...~~~~...!....',
    '.@..%%........%%..@.',
    '....%%.#~~~~#.%%....',
    '....#..#~~~~#..#....',
    '.......!....!.......',
    '....#..#~~~~#..#....',
    '....%%.#~~~~#.%%....',
    '.@..%%........%%..@.',
    '....!...~~~~...!....',
    '...##...~~~~...##...',
    '....#.2..~~..1.#....'
  ],
  // Arena 5: Chaos Factory
  [
    '....!.#..@@..#.!....',
    '.1.#..!.#..#.!..#.2.',
    '...#.##.!..!.##.#...',
    '.#...!..%%%%..!...#.',
    '...#.@..%%%%..@.#...',
    '...!...#....#...!...',
    '....@@..!..!...@@...',
    '...!...#....#...!...',
    '...#.@..%%%%..@.#...',
    '.#...!..%%%%..!...#.',
    '...#.##.!..!.##.#...',
    '.2.#..!.#..#.!..#.1.',
    '....!.#..@@..#.!....'
  ]
];

export const BASE_COL = 9; // Eagle base occupies (9, 12) and (10, 12) or center at col 9/10, row 12
export const BASE_CELLS: ReadonlyArray< readonly [number, number] > = [
  [9, 12],
  [10, 12]
];
export const BASE_WALL_CELLS: ReadonlyArray< readonly [number, number] > = [
  [8, 12],
  [8, 11],
  [9, 11],
  [10, 11],
  [11, 11],
  [11, 12]
];

function charToTile(ch: string): TileCell {
  switch (ch) {
    case '#':
      return { kind: 'brick', hp: 2, maxHp: 2 };
    case '@':
      return { kind: 'steel', hp: 4, maxHp: 4 };
    case '%':
      return { kind: 'bush', hp: 1, maxHp: 1 };
    case '~':
      return { kind: 'water', hp: 1, maxHp: 1 };
    case '=':
      return { kind: 'ice', hp: 1, maxHp: 1 };
    case '!':
      return { kind: 'barrel', hp: 1, maxHp: 1 };
    case '1':
      return { kind: 'portal', hp: 1, maxHp: 1, portalId: 1 };
    case '2':
      return { kind: 'portal', hp: 1, maxHp: 1, portalId: 2 };
    default:
      return { kind: 'empty', hp: 0, maxHp: 0 };
  }
}

export function buildGrid(mode: 'coop' | 'duel', mapIndex: number): TileCell[][] {
  const templates = mode === 'coop' ? COOP_MAPS : DUEL_MAPS;
  const rows = templates[((mapIndex % templates.length) + templates.length) % templates.length];
  const grid: TileCell[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (__, c) => charToTile(rows[r]?.[c] ?? '.'))
  );

  if (mode === 'coop') {
    for (const [c, r] of BASE_WALL_CELLS) {
      grid[r][c] = { kind: 'brick', hp: 2, maxHp: 2 };
    }
    for (const [c, r] of BASE_CELLS) {
      grid[r][c] = { kind: 'base', hp: 6, maxHp: 6 };
    }
    // Ensure spawn cells for P1 (6, 12) and P2 (13, 12) and enemy spawns (0,0), (9,0), (19,0) are clear
    const clearCoords: Array<[number, number]> = [
      [6, 12], [7, 12], [12, 12], [13, 12],
      [0, 0], [1, 0], [9, 0], [10, 0], [18, 0], [19, 0]
    ];
    for (const [c, r] of clearCoords) {
      grid[r][c] = { kind: 'empty', hp: 0, maxHp: 0 };
    }
  } else {
    // Ensure Duel spawn zones on left (col 1, row 6) and right (col 18, row 6) are clear
    const clearDuel: Array<[number, number]> = [
      [1, 5], [1, 6], [1, 7], [2, 6],
      [18, 5], [18, 6], [18, 7], [17, 6]
    ];
    for (const [c, r] of clearDuel) {
      if (grid[r][c].kind === 'brick' || grid[r][c].kind === 'steel' || grid[r][c].kind === 'water' || grid[r][c].kind === 'barrel') {
        grid[r][c] = { kind: 'empty', hp: 0, maxHp: 0 };
      }
    }
  }

  // Link portal pairs
  for (const pid of [1, 2]) {
    const portals: Array<[number, number]> = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c].kind === 'portal' && grid[r][c].portalId === pid) {
          portals.push([c, r]);
        }
      }
    }
    if (portals.length === 2) {
      const [[c1, r1], [c2, r2]] = portals;
      grid[r1][c1].partnerCol = c2;
      grid[r1][c1].partnerRow = r2;
      grid[r2][c2].partnerCol = c1;
      grid[r2][c2].partnerRow = r1;
    }
  }

  return grid;
}

export function setBaseFortress(grid: TileCell[][], kind: Extract<TileKind, 'brick' | 'steel'>): void {
  const hp = kind === 'steel' ? 4 : 2;
  for (const [c, r] of BASE_WALL_CELLS) {
    if (grid[r]?.[c]) {
      grid[r][c] = { kind, hp, maxHp: hp };
    }
  }
}

export function cellCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: (col + 0.5) * TILE,
    y: (row + 0.5) * TILE
  };
}
