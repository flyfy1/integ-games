/** Six mirrored arenas. Only the left half is written, so neither seat ever gets the better side. */
export const COLS = 24, ROWS = 13, TILE = 48;
export const WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;

/**
 * . floor   # steel (shells bounce)   c crate (breaks)   o pit (tanks fall, shells fly over)
 * B bumper  ~ ice   > < ^ v conveyors   P/p linked portals   1/2 player spawns
 */
export type Tile = '.' | '#' | 'c' | 'o' | 'B' | '~' | '>' | '<' | '^' | 'v' | 'P' | 'p';

export type Arena = {
  id: string;
  name: readonly [string, string];
  tagline: readonly [string, string];
  floor: string; floorAlt: string; wall: string; wallTop: string; crate: string; pit: string; pitGlow: string;
  rows: readonly string[];
};

const FLIP: Record<string, string> = { '>': '<', '<': '>', '1': '2', P: 'p', p: 'P' };
const mirror = (half: readonly string[]) => half.map((row) => row + [...row].reverse().map((char) => FLIP[char] ?? char).join(''));

export const ARENAS: readonly Arena[] = [
  {
    id: 'garden', name: ['Backyard Hedges', '后院树篱'], tagline: ['Everything breaks. Hide while it lasts.', '什么都能打碎，趁还在赶紧躲'],
    floor: '#7cc66b', floorAlt: '#71bb61', wall: '#5b6b7c', wallTop: '#8195a8', crate: '#c98a4b', pit: '#2c4a33', pitGlow: '#3f6b49',
    rows: mirror([
      '............',
      '.1...cc.....',
      '.....cc...cc',
      '..cc......cc',
      '..cc...##...',
      '.......##...',
      '.ccc........',
      '.......##...',
      '..cc...##...',
      '..cc......cc',
      '.....cc...cc',
      '.....cc.....',
      '............'
    ])
  },
  {
    id: 'rink', name: ['Skid Rink', '打滑冰场'], tagline: ['Brakes are a rumour here.', '刹车？不存在的'],
    floor: '#d5eefb', floorAlt: '#c6e6f7', wall: '#6d8fb3', wallTop: '#a5c6e4', crate: '#8fc5ea', pit: '#1c3a5e', pitGlow: '#2f6ea6',
    rows: mirror([
      '~~~~~~~~~~~~',
      '~1~~~~~~~~~~',
      '~~~~#~~~~~~~',
      '~~~~#~~~~cc~',
      '~~~~~~~~~cc~',
      '~~cc~~~~oo~~',
      '~~cc~~~~oo~~',
      '~~cc~~~~oo~~',
      '~~~~~~~~~cc~',
      '~~~~#~~~~cc~',
      '~~~~#~~~~~~~',
      '~~~~~~~~~~~~',
      '~~~~~~~~~~~~'
    ])
  },
  {
    id: 'pinball', name: ['Pinball Park', '弹珠乐园'], tagline: ['Bumpers fling tanks and shells alike.', '弹簧柱连坦克一起弹飞'],
    floor: '#5a3f9e', floorAlt: '#523993', wall: '#2c2159', wallTop: '#ff7ac6', crate: '#ffb347', pit: '#1a1238', pitGlow: '#7b4dff',
    rows: mirror([
      '............',
      '.1......B...',
      '....B.......',
      '.........B..',
      '..##........',
      '......B...B.',
      '..cc........',
      '......B...B.',
      '..##........',
      '.........B..',
      '....B.......',
      '........B...',
      '............'
    ])
  },
  {
    id: 'factory', name: ['Conveyor Factory', '传送带工厂'], tagline: ['The floor has its own plans.', '地板自己有想法'],
    floor: '#59636f', floorAlt: '#515a65', wall: '#2f353d', wallTop: '#f5b83d', crate: '#b37744', pit: '#17191d', pitGlow: '#ff6b35',
    rows: mirror([
      '............',
      '.1..........',
      '..>>>>>>>>>>',
      '..^.....#...',
      '..^..cc.#.cc',
      '..^..cc...cc',
      '..^.....oo..',
      '..^..cc...cc',
      '..^..cc.#.cc',
      '..^.....#...',
      '..<<<<<<<<<<',
      '............',
      '............'
    ])
  },
  {
    id: 'lab', name: ['Portal Lab', '传送门实验室'], tagline: ['Shoot here, get hit from over there.', '这边开炮，那边中弹'],
    floor: '#1f4e5a', floorAlt: '#1b4651', wall: '#123039', wallTop: '#55e6c1', crate: '#3f9c8f', pit: '#071a20', pitGlow: '#1ed6ff',
    rows: mirror([
      'P...........',
      '.1....##....',
      '......##..cc',
      '..##......cc',
      '..##..cc....',
      '......cc..##',
      '.p........##',
      '......cc..##',
      '..##..cc....',
      '..##......cc',
      '......##..cc',
      '......##....',
      '............'
    ])
  },
  {
    id: 'volcano', name: ['Lava Stepping Stones', '岩浆跳石'], tagline: ['Dash jumps the gaps. Knock them in!', '冲刺能飞跃缺口，把对手撞下去！'],
    floor: '#6b4a3f', floorAlt: '#624338', wall: '#3a2a26', wallTop: '#a87c63', crate: '#a1623b', pit: '#d9400f', pitGlow: '#ffb02e',
    rows: mirror([
      '............',
      '.1..........',
      '.....oo.....',
      '..c..oo..c..',
      '.....oo.....',
      '.ooo....oooo',
      '.ooo..#.oooo',
      '.ooo....oooo',
      '.....oo.....',
      '..c..oo..c..',
      '.....oo.....',
      '............',
      '............'
    ])
  }
];

export const arenaById = (id: string) => ARENAS.find((arena) => arena.id === id) ?? ARENAS[0];
