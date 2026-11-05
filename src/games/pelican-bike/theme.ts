export const W = 960, H = 520, T = 40, ROWS = 13, PW = 34, PH = 54, MAXST = 1.25, WATER_Y = 474;

export type Theme = {
  sky: string[];
  sun: string;
  sunGlow: string;
  sunPos: [number, number, number];
  cloud: string;
  cloudShade: string;
  far: string;
  far2: string;
  sea: [string, string];
  seaHi: string;
  dune: string;
  dune2: string;
  trunk: string;
  leaf: string;
  leaf2: string;
  dirt: string;
  dirt2: string;
  dirtDark: string;
  grass: string;
  grassDark: string;
  water: string;
  waterHi: string;
  night: boolean;
  sil: boolean;
};

export const THEMES: Theme[] = [
  { sky: ['#4fb3ee', '#9fd8f6', '#ffe9c9'], sun: '#fff6c9', sunGlow: 'rgba(255,240,180,0.55)', sunPos: [770, 105, 46],
    cloud: 'rgba(255,255,255,0.95)', cloudShade: 'rgba(196,224,242,0.95)', far: '#86bcd9', far2: '#a7d0e6',
    sea: ['#3aa8dd', '#1f7fbf'], seaHi: 'rgba(255,255,255,0.55)', dune: '#f2d49b', dune2: '#e3bd7d',
    trunk: '#8a5a3b', leaf: '#3e9b4f', leaf2: '#2f7f3e', dirt: '#e5bb7b', dirt2: '#d8aa68', dirtDark: '#c08f50',
    grass: '#73cc45', grassDark: '#3f9a2c', water: '#2a8ed0', waterHi: '#9fe6ff', night: false, sil: false },
  { sky: ['#2b1a4f', '#7d3a74', '#e06f5e', '#ffc46b'], sun: '#ffdc8a', sunGlow: 'rgba(255,170,90,0.6)', sunPos: [480, 300, 72],
    cloud: 'rgba(255,175,160,0.9)', cloudShade: 'rgba(170,80,120,0.85)', far: '#6a2f62', far2: '#8a4170',
    sea: ['#b0527a', '#4a2252'], seaHi: 'rgba(255,215,150,0.65)', dune: '#3f1f45', dune2: '#4d2650',
    trunk: '#24112b', leaf: '#24112b', leaf2: '#1d0d23', dirt: '#b56a4f', dirt2: '#a65f46', dirtDark: '#874634',
    grass: '#e8bb4a', grassDark: '#b0812c', water: '#6d2f63', waterHi: '#ffb37a', night: false, sil: true },
  { sky: ['#040716', '#0d1838', '#22396b'], sun: '#fdf3d0', sunGlow: 'rgba(200,220,255,0.35)', sunPos: [780, 92, 34],
    cloud: 'rgba(70,90,140,0.55)', cloudShade: 'rgba(30,45,90,0.55)', far: '#14224a', far2: '#1a2c5c',
    sea: ['#173063', '#081536'], seaHi: 'rgba(255,250,210,0.6)', dune: '#0b1430', dune2: '#0e1938',
    trunk: '#060b1f', leaf: '#060b1f', leaf2: '#060b1f', dirt: '#4b5175', dirt2: '#444a6c', dirtDark: '#353a5a',
    grass: '#41a08a', grassDark: '#2b7466', water: '#10295a', waterHi: '#9fc4ff', night: true, sil: true }
];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const STARS: { x: number; y: number; s: number; sp: number; ph: number }[] = [];
{
  const r = mulberry32(5);
  for (let i = 0; i < 110; i++) STARS.push({ x: r() * W, y: r() * 300, s: r() * 1.6 + 0.4, sp: r() * 2 + 0.5, ph: r() * 6 });
}

export const CLOUDS: { x: number; y: number; s: number; p: number }[] = [];
{
  const r = mulberry32(9);
  for (let i = 0; i < 9; i++) CLOUDS.push({ x: r() * 1600, y: 40 + r() * 170, s: 0.6 + r() * 0.8, p: 0.05 + r() * 0.12 });
}
