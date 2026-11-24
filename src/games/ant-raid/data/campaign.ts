import type { Loc } from '../types';

export type ChapterDef = { id: number; name: Loc; place: Loc; levels: string[]; palette: { grass: string; grass2: string; accent: string } };
export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: { en: 'The Backyard Blanket', zh: '后院野餐垫' }, place: { en: 'A gingham blanket on a summer lawn', zh: '夏日草坪上的格子野餐垫' }, levels: ['1-1', '1-2', '1-3', '1-4', '1-5'], palette: { grass: '#8fcf5f', grass2: '#7cbf4e', accent: '#e8574a' } },
  { id: 2, name: { en: 'The Sandbox', zh: '沙坑游乐场' }, place: { en: 'Sprinklers, chalk and a sandpit', zh: '洒水器、粉笔线和沙坑' }, levels: ['2-1', '2-2', '2-3', '2-4', '2-5'], palette: { grass: '#9ad06a', grass2: '#86c058', accent: '#f2b33d' } },
  { id: 3, name: { en: 'The Pond Bank', zh: '池塘边' }, place: { en: 'Reeds, lily pads and a kingfisher', zh: '芦苇、睡莲和翠鸟' }, levels: ['3-1', '3-2', '3-3', '3-4', '3-5'], palette: { grass: '#7cc46a', grass2: '#69b05a', accent: '#3fa3d9' } },
  { id: 4, name: { en: 'Campsite After Dark', zh: '夜营地' }, place: { en: 'Lanterns, marshmallows and a rival colony', zh: '灯笼、棉花糖和敌对蚁群' }, levels: ['4-1', '4-2', '4-3', '4-4', '4-5'], palette: { grass: '#5c8f55', grass2: '#4f7f4a', accent: '#ff8a3d' } }
];
