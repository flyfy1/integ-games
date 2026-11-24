/**
 * Pocket Survivor camp screens, drawn on the canvas in the same parchment style as the run: the camp (stage and
 * general select plus the Daily), talents and the collection. Every layout is a pure function of the stage size so
 * drawing and hit-testing share the same rectangles, and every screen is reachable by touch, keys and gamepad.
 */
import { C, drawHero, drawIcon, E, HERO_LOOKS, INK, L, R, type Ctx } from './art';
import { BOSS_NAMES, GENERAL_IDS, GENERALS, PARTNER, PASSIVE_CARDS, PASSIVE_IDS, STAGES, WEAPON_CARDS, WEAPON_IDS, type GeneralId, type StageId, type WeaponId } from './data';
import { FEATS, STAGE_CHAIN, TALENT_IDS, TALENTS, talentCost, type Profile, type Totals } from './meta';
import { BROWN, TEXT, font, label, outlined, scroll, wrap, type Rect, type View } from './render';
import { foeName, generalName, generalTrait, itemName, stageName, tr } from './text';

/** Camp list order. `daily` is the seeded Daily run. Keys 1-6 start these directly. */
export type Entry = StageId | 'daily';
export const ENTRIES: readonly Entry[] = ['bamboo', 'river', 'camp', 'fortress', 'march', 'daily'];
export type DailyInfo = { stage: StageId; general: GeneralId; streak: number; best: number | null; played: boolean };

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const hitIndex = (rects: readonly Rect[], x: number, y: number) => rects.findIndex(r => inside(r, x, y));
export { inside };

// ---- camp ---------------------------------------------------------------------------------------------------------------
export type CampLayout = { title: Rect; generals: Rect[]; stages: Rect[]; talents: Rect; collection: Rect; wide: boolean };
/** Portrait and desktop: one centred column. Short landscape phones: generals and buttons on the left, stages on the right. */
export function campLayout(view: View): CampLayout {
  const { w, h } = view, gap = 8;
  if (h < 460 && w >= 560) {
    const left = 12, lw = Math.min(260, w * 0.38), rx = left + lw + 16, rw = Math.min(460, w - rx - 12), top = 52;
    const gh = Math.min(64, (h - top - 56 - gap * 2) / 3);
    const generals = [0, 1, 2].map(i => ({ x: left, y: top + i * (gh + gap), w: lw, h: gh }));
    const bh = 38, by = h - bh - 10, half = (lw - gap) / 2;
    const rowH = Math.min(58, (h - top - 10 - gap * 5) / 6);
    const stages = ENTRIES.map((_, i) => ({ x: rx, y: top + i * (rowH + gap), w: rw, h: rowH }));
    return { title: { x: 0, y: 0, w, h: 44 }, generals, stages, talents: { x: left, y: by, w: half, h: bh }, collection: { x: left + half + gap, y: by, w: half, h: bh }, wide: true };
  }
  const cw = Math.min(w - 24, 540), x = (w - cw) / 2, top = 62;
  const gh = Math.max(58, Math.min(96, h * 0.15)), gw = (cw - gap * 2) / 3;
  const generals = [0, 1, 2].map(i => ({ x: x + i * (gw + gap), y: top, w: gw, h: gh }));
  const bh = 40, by = h - bh - 12, half = (cw - gap) / 2;
  const listTop = top + gh + 22, rowH = Math.max(30, Math.min(64, (by - 10 - listTop - gap * 5) / 6));
  const stages = ENTRIES.map((_, i) => ({ x, y: listTop + i * (rowH + gap), w: cw, h: rowH }));
  return { title: { x: 0, y: 0, w, h: 54 }, generals, stages, talents: { x, y: by, w: half, h: bh }, collection: { x: x + half + gap, y: by, w: half, h: bh }, wide: false };
}

/** How a locked stage is opened, for the row text. */
export function stageLock(id: StageId): string {
  const index = STAGE_CHAIN.indexOf(id), prev = STAGE_CHAIN[index - 1];
  if (!prev) return '';
  const mid = STAGES[prev].mid;
  return tr(`Defeat the ${mid.name} in ${STAGES[prev].name}`, `在${STAGES[prev].zh}击败${mid.zh}`);
}
const featFor = (unlock: { kind: string; id: string }) => FEATS.find(feat => feat.unlock.kind === unlock.kind && feat.unlock.id === unlock.id);

function button(c: Ctx, r: Rect, text: string, fill: string, lit = false, icon = '') {
  R(c, r.x, r.y, r.w, r.h, Math.min(14, r.h / 2)); c.fillStyle = fill; c.fill(); c.strokeStyle = lit ? C.gold : INK; c.lineWidth = lit ? 3 : 2; c.stroke();
  c.font = font(15, 900); const tw = c.measureText(text).width, size = tw > r.w - (icon ? 44 : 16) ? 12 : 15;
  c.font = font(size, 900); const width = c.measureText(text).width + (icon ? 24 : 0), x0 = r.x + (r.w - width) / 2;
  if (icon) drawIcon(c, icon, x0 + 9, r.y + r.h / 2, 8.5, C.cream);
  label(c, text, x0 + (icon ? 24 : 0), r.y + r.h / 2 + 0.5, size, C.cream, 'left', 900);
}
function jadeBadge(c: Ctx, x: number, y: number, jade: number) {
  c.font = font(16, 900); const text = String(jade), tw = c.measureText(text).width;
  R(c, x - tw - 40, y - 15, tw + 40, 30, 15); c.fillStyle = 'rgba(20,60,50,0.92)'; c.fill(); c.strokeStyle = C.jade; c.lineWidth = 2; c.stroke();
  drawIcon(c, 'jade', x - tw - 22, y, 8, C.jade); label(c, text, x - 10, y + 0.5, 16, '#bff4e0', 'right', 900);
}
/** The back button sits right of the shell's close button on touch layouts. */
export const backRect = (touch: boolean): Rect => ({ x: touch ? 64 : 10, y: 10, w: 86, h: 34 });
function backButton(c: Ctx, touch: boolean) { button(c, backRect(touch), tr('< Camp', '< 营地'), C.wood); }
function lockGlyph(c: Ctx, x: number, y: number, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.arc(0, -4, 4.4, Math.PI, 0); c.strokeStyle = INK; c.lineWidth = 3.4; c.stroke(); c.strokeStyle = '#c9c3b4'; c.lineWidth = 1.8; c.stroke();
  R(c, -6, -4, 12, 9.6, 2); c.fillStyle = '#8a7a5a'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); E(c, 0, 0.4, 1.3, 1.3); c.fillStyle = INK; c.fill();
  c.restore();
}

export type CampModel = { profile: Profile; stageSel: number; general: GeneralId; daily: DailyInfo; clock: number; touch: boolean; reduced: boolean; flash: number };
export function drawCamp(c: Ctx, view: View, m: CampModel) {
  const { w } = view, L0 = campLayout(view), p = m.profile;
  // title band
  c.fillStyle = 'rgba(52,26,18,0.9)'; c.fillRect(0, 0, w, L0.title.h); c.fillStyle = C.goldDark; c.fillRect(0, L0.title.h, w, 2);
  // touch layouts keep clear of the shell's round corner buttons
  const pad = m.touch ? 62 : 14;
  outlined(c, tr('POCKET SURVIVOR', '口袋幸存者'), pad, L0.title.h / 2 + 1, w < 400 ? 17 : 22, C.gold, 'left', INK, 900);
  jadeBadge(c, w - pad + (m.touch ? 4 : 2), L0.title.h / 2, p.jade);
  // generals
  GENERAL_IDS.forEach((id, index) => {
    const r = L0.generals[index], open = p.generals.includes(id), chosen = m.general === id;
    scroll(c, r.x, r.y, r.w, r.h, false, chosen);
    const portrait = Math.min(r.h - 8, 54), hx = L0.wide ? r.x + 30 : r.x + r.w / 2, hy = L0.wide ? r.y + r.h - 6 : r.y + portrait + 2;
    c.save(); if (!open) c.globalAlpha = 0.35;
    c.translate(hx, hy); const k = portrait / 44; c.scale(k, k); drawHero(c, m.clock + index, false, m.reduced, 0, HERO_LOOKS[id]); c.restore();
    if (!open) lockGlyph(c, hx + 12, hy - portrait * 0.5, 1.2);
    const name = open ? generalName(id) : '???';
    if (L0.wide) {
      label(c, name, r.x + 60, r.y + r.h * 0.34, 14, TEXT, 'left', 900);
      c.font = font(12, 700); const line = open ? generalTrait(id) : tr('Locked', '未解锁');
      label(c, wrap(c, line, r.w - 70)[0] ?? '', r.x + 60, r.y + r.h * 0.68, 12, open ? BROWN : '#9a6a3a', 'left', 700);
      if (open) drawIcon(c, GENERALS[id].weapon, r.x + r.w - 16, r.y + 16, 8, WEAPON_CARDS[GENERALS[id].weapon].color);
    } else if (r.h - portrait > 26 || r.h >= 80) {
      c.font = font(13, 900); const size = c.measureText(name).width > r.w - 8 ? 11 : 13;
      label(c, name, r.x + r.w / 2, Math.min(r.y + r.h - 10, hy + 12), size, TEXT, 'center', 900);
    }
    if (open && !L0.wide) drawIcon(c, GENERALS[id].weapon, r.x + 16, r.y + 16, 8, WEAPON_CARDS[GENERALS[id].weapon].color);
  });
  // chosen general's trait (portrait layout only; landscape shows it in the row)
  if (!L0.wide) { const g = L0.generals[0], text = `${generalName(m.general)} · ${generalTrait(m.general)}`; c.font = font(12, 800); outlined(c, wrap(c, text, w - 20)[0], w / 2, g.y + g.h + 11, 12, C.cream, 'center', INK, 800); }
  // stages
  ENTRIES.forEach((entry, index) => {
    const r = L0.stages[index], selected = index === m.stageSel, tight = r.h < 44;
    if (entry === 'daily') {
      const d = m.daily;
      R(c, r.x, r.y, r.w, r.h, 9); c.fillStyle = selected ? '#2f6f9a' : '#244e6e'; c.fill(); c.strokeStyle = selected ? C.gold : INK; c.lineWidth = selected ? 3 : 2; c.stroke();
      drawIcon(c, 'bounty', r.x + 22, r.y + r.h / 2, Math.min(11, r.h * 0.28), C.gold);
      const title = tr('Daily Battle', '每日战役') + (d.played ? ' ✓' : '');
      const sub = `${stageName(d.stage)} · ${generalName(d.general)} · ${tr('streak', '连续')} ${d.streak}` + (d.best !== null ? ` · ${tr('best', '最佳')} ${d.best}` : '');
      if (tight) { c.font = font(13, 900); label(c, title, r.x + 42, r.y + r.h / 2 + 0.5, 14, C.cream, 'left', 900); c.font = font(11, 700); const t = wrap(c, sub, r.w - 60 - c.measureText(title).width)[0] ?? ''; label(c, t, r.x + r.w - 10, r.y + r.h / 2 + 0.5, 11, '#cfe6f6', 'right', 700); }
      else { label(c, title, r.x + 42, r.y + r.h * 0.34, 15, C.cream, 'left', 900); c.font = font(12, 700); label(c, wrap(c, sub, r.w - 54)[0] ?? '', r.x + 42, r.y + r.h * 0.7, 12, '#cfe6f6', 'left', 700); }
      if (!tight) label(c, String(index + 1), r.x + r.w - 12, r.y + 12, 11, '#9fc4dc', 'right', 900);
      return;
    }
    const open = p.stages.includes(entry), def = STAGES[entry], cleared = p.cleared.includes(entry), best = p.best[entry];
    R(c, r.x, r.y, r.w, r.h, 9); c.fillStyle = !open ? 'rgba(70,50,40,0.85)' : selected ? '#fff6dc' : C.parchment; c.fill(); c.strokeStyle = selected ? C.gold : INK; c.lineWidth = selected ? 3 : 2; c.stroke();
    if (selected && open) { R(c, r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5, 11); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke(); }
    const icon = entry === 'march' ? 'helm' : cleared ? 'helm' : 'swords';
    if (open) drawIcon(c, icon, r.x + 22, r.y + r.h / 2, Math.min(10, r.h * 0.26), cleared ? C.red : BROWN); else lockGlyph(c, r.x + 22, r.y + r.h / 2 + 2, Math.min(1.2, r.h / 36));
    const name = stageName(entry) + (cleared ? ' ✓' : '');
    const sub = open ? (entry === 'march' ? tr('All four battlegrounds in one run · The Warlord', '一局走遍四处战场 · 霸王') : `${tr('Boss', '首领')}: ${tr(BOSS_NAMES[def.boss].name, BOSS_NAMES[def.boss].zh)}`) : stageLock(entry);
    const textColor = open ? TEXT : '#e6d2aa', subColor = open ? BROWN : '#d9b98a';
    if (tight) {
      label(c, name, r.x + 42, r.y + r.h / 2 + 0.5, 14, textColor, 'left', 900);
      c.font = font(14, 900); const nameW = c.measureText(name).width; c.font = font(11, 700);
      const right = open && best ? `${tr('best', '最佳')} ${best}` : wrap(c, sub, r.w - 60 - nameW)[0] ?? '';
      label(c, right, r.x + r.w - 10, r.y + r.h / 2 + 0.5, 11, subColor, 'right', 700);
    } else {
      label(c, name, r.x + 42, r.y + r.h * 0.34, 15, textColor, 'left', 900);
      c.font = font(12, 700); label(c, wrap(c, sub, r.w - 54 - (best ? 80 : 0))[0] ?? '', r.x + 42, r.y + r.h * 0.7, 12, subColor, 'left', 700);
      if (open && best) label(c, `${tr('best', '最佳')} ${best}`, r.x + r.w - 12, r.y + r.h * 0.7, 12, '#b3262b', 'right', 800);
    }
    if (!tight) label(c, String(index + 1), r.x + r.w - 12, r.y + 12, 11, open ? '#b39a76' : '#9a8060', 'right', 900);
  });
  button(c, L0.talents, tr('Talents', '天赋') + (m.touch ? '' : ' (T)'), C.jadeDark, false, 'might');
  button(c, L0.collection, tr('Collection', '图鉴') + (m.touch ? '' : ' (C)'), C.brown, false, 'chest');
  if (!m.touch && w >= 640) outlined(c, tr('Arrows choose · Enter or 1-6 to march', '方向键选择 · 回车或 1-6 出征'), w / 2, L0.title.h / 2 + 1, 12, '#f6e6bf', 'center', INK, 700);
  if (m.flash > 0) { const r = L0.stages[m.stageSel]; c.globalAlpha = Math.min(1, m.flash * 3); R(c, r.x, r.y, r.w, r.h, 9); c.strokeStyle = '#ff3b30'; c.lineWidth = 4; c.stroke(); c.globalAlpha = 1; }
}

// ---- talents ------------------------------------------------------------------------------------------------------------
export function talentRows(view: View): Rect[] {
  const { w, h } = view, top = 56, gap = 6;
  // short landscape stages split the seven talents over two columns
  if ((h - top - 10 - gap * 6) / 7 < 40 && w >= 560) {
    const cw = Math.min((w - 30) / 2, 420), x0 = (w - cw * 2 - 10) / 2, rowH = Math.min(62, (h - top - 10 - gap * 3) / 4);
    return TALENT_IDS.map((_, i) => ({ x: x0 + (i < 4 ? 0 : cw + 10), y: top + (i % 4) * (rowH + gap), w: cw, h: rowH }));
  }
  const cw = Math.min(w - 20, 560), x = (w - cw) / 2, rowH = Math.max(34, Math.min(62, (h - top - 10 - gap * 6) / 7));
  return TALENT_IDS.map((_, i) => ({ x, y: top + i * (rowH + gap), w: cw, h: rowH }));
}
export function drawTalents(c: Ctx, view: View, p: Profile, sel: number, touch: boolean) {
  const { w } = view;
  c.fillStyle = 'rgba(34,16,18,0.78)'; c.fillRect(0, 0, w, view.h);
  backButton(c, touch); jadeBadge(c, w - (touch ? 58 : 12), 27, p.jade);
  if (w > 420) outlined(c, tr('TALENTS', '天赋'), w / 2, 27, 20, C.gold, 'center', INK, 900);
  talentRows(view).forEach((r, index) => {
    const id = TALENT_IDS[index], def = TALENTS[id], rank = p.talents[id], maxed = rank >= def.max, cost = talentCost(id, rank), afford = !maxed && p.jade >= cost, selected = index === sel;
    scroll(c, r.x, r.y, r.w, r.h, false, selected);
    const iconR = Math.min(16, r.h / 2 - 4); E(c, r.x + 24, r.y + r.h / 2, iconR, iconR); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = def.color; c.lineWidth = 2.4; c.stroke(); drawIcon(c, def.icon, r.x + 24, r.y + r.h / 2, iconR * 0.6, def.color);
    const bw = Math.min(110, r.w * 0.3), bx = r.x + r.w - bw - 8, tx = r.x + 48, room = bx - tx - 8, tight = r.h < 46;
    label(c, tr(def.name, def.zh), tx, r.y + (tight ? r.h * 0.32 : r.h * 0.3), 15, TEXT, 'left', 900);
    c.font = font(12, 700); label(c, wrap(c, tr(def.each, def.zhEach), room)[0] ?? '', tx, r.y + r.h * (tight ? 0.74 : 0.62), 12, BROWN, 'left', 700);
    if (!tight) for (let i = 0; i < def.max; i++) { R(c, tx + i * 13, r.y + r.h - 12, 10, 5, 2); c.fillStyle = i < rank ? C.red : '#c9b48a'; c.fill(); }
    else { c.font = font(15, 900); const nw = c.measureText(tr(def.name, def.zh)).width; label(c, `${rank}/${def.max}`, tx + nw + 8, r.y + r.h * 0.32, 12, C.red, 'left', 900); }
    const br = { x: bx, y: r.y + 5, w: bw, h: r.h - 10 };
    R(c, br.x, br.y, br.w, br.h, Math.min(12, br.h / 2)); c.fillStyle = maxed ? C.goldDark : afford ? C.jadeDark : '#8a7a6a'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    if (maxed) label(c, tr('MAX', '已满'), br.x + br.w / 2, br.y + br.h / 2 + 0.5, 14, C.cream, 'center', 900);
    else { drawIcon(c, 'jade', br.x + br.w / 2 - 16, br.y + br.h / 2, 6.5, C.jade); label(c, String(cost), br.x + br.w / 2 - 6, br.y + br.h / 2 + 0.5, 14, C.cream, 'left', 900); }
  });
  if (!touch) { const last = talentRows(view)[6]; if (last.y + last.h + 18 < view.h) outlined(c, tr('Enter buys · Esc returns', '回车购买 · Esc 返回'), w / 2, last.y + last.h + 14, 12, C.cream, 'center', INK, 700); }
}

// ---- collection ---------------------------------------------------------------------------------------------------------
export type Tile = { key: string; kind: 'weapon' | 'passive' | 'general' | 'foe'; known: boolean; gold: boolean };
const FOE_KEYS = ['grub', 'skitter', 'spitter', 'brute', 'charger', 'mid:skitter', 'mid:spitter', 'mid:brute', 'mid:charger', 'boss:king', 'boss:admiral', 'boss:marshal', 'boss:warlord'];
export function tiles(p: Profile): Tile[] {
  return [
    ...WEAPON_IDS.map(id => ({ key: id, kind: 'weapon' as const, known: p.weapons.includes(id), gold: p.evolved.includes(id) })),
    ...PASSIVE_IDS.map(id => ({ key: id, kind: 'passive' as const, known: p.passives.includes(id), gold: false })),
    ...GENERAL_IDS.map(id => ({ key: id, kind: 'general' as const, known: p.generals.includes(id), gold: false })),
    ...FOE_KEYS.map(key => ({ key, kind: 'foe' as const, known: p.seen.includes(key) || (key === 'boss:warlord' && p.seen.includes('warden')), gold: key.startsWith('boss:') }))
  ];
}
export type CollectionLayout = { tiles: Rect[]; detail: Rect };
export function collectionLayout(view: View, count: number): CollectionLayout {
  const { w, h } = view, top = 54, side = w >= 620 && h < 520;
  const detail = side ? { x: w - Math.min(300, w * 0.38) - 10, y: top, w: Math.min(300, w * 0.38), h: h - top - 10 } : { x: 10, y: h - Math.min(120, h * 0.24) - 8, w: w - 20, h: Math.min(120, h * 0.24) };
  const areaW = side ? detail.x - 20 : w - 20, areaH = (side ? h - 10 : detail.y - 8) - top, x0 = 10;
  let size = 10;
  for (let s = 72; s >= 26; s -= 2) { const cols = Math.floor((areaW + 4) / (s + 4)), rows = Math.ceil(count / Math.max(1, cols)); if (cols > 0 && rows * (s + 4) - 4 <= areaH) { size = s; break; } }
  const cols = Math.max(1, Math.floor((areaW + 4) / (size + 4))), used = cols * (size + 4) - 4, left = x0 + (areaW - used) / 2;
  return { tiles: Array.from({ length: count }, (_, i) => ({ x: left + (i % cols) * (size + 4), y: top + Math.floor(i / cols) * (size + 4), w: size, h: size })), detail };
}
function tileTitle(t: Tile): string {
  if (!t.known) return '???';
  if (t.kind === 'general') return generalName(t.key as GeneralId);
  if (t.kind === 'foe') return foeName(t.key);
  return itemName(t.key);
}
function tileDetail(t: Tile, totals: Totals): string {
  if (t.kind === 'weapon' || t.kind === 'passive' || t.kind === 'general') {
    const unlock = { kind: t.kind, id: t.key } as { kind: 'weapon'; id: WeaponId };
    if (!t.known) { const feat = featFor(unlock); if (feat) { const now = Math.min(feat.goal, Math.floor(feat.progress(totals))); return `${tr('Unlock', '解锁')}: ${tr(feat.text, feat.zh)} (${feat.goal >= 60 && feat.id === 'noblades' ? `${Math.floor(now / 60)}:${String(now % 60).padStart(2, '0')}` : now}/${feat.id === 'noblades' ? '3:00' : feat.goal})`; } return ''; }
    if (t.kind === 'general') return generalTrait(t.key as GeneralId);
    if (t.kind === 'weapon') { const info = WEAPON_CARDS[t.key as WeaponId], partner = PARTNER[t.key as WeaponId]; return `${tr(info.levels[0], info.zhLevels[0])}${tr('. ', '。')}${tr('Evolves with', '进化需要')} ${itemName(partner)} → ${itemName(t.key, true)}${t.gold ? ' ✓' : ''}`; }
    const info = PASSIVE_CARDS[t.key as keyof typeof PASSIVE_CARDS], weapon = WEAPON_IDS.find(id => PARTNER[id] === t.key);
    return `${tr(info.each, info.zhEach)}${tr('.', '。')}` + (weapon ? `${tr(' Evolves ', '可进化')}${itemName(weapon)}${tr('.', '。')}` : '');
  }
  if (!t.known) return tr('Not met yet', '尚未遭遇');
  if (t.key.startsWith('boss:')) { const variant = t.key.slice(5) as keyof typeof BOSS_NAMES, stage = Object.values(STAGES).find(def => def.boss === variant && def.scene !== null); return stage ? tr(`Final boss of ${stage.name} at 5:00`, `${stage.zh}的最终首领（5:00 登场）`) : ''; }
  if (t.key.startsWith('mid:')) return tr('Officer at 2:30 - drops a great treasure chest', '2:30 登场的敌将，掉落大宝箱');
  return tr('Rank-and-file foe', '普通敌兵');
}
const ENEMY_ICON: Record<string, string> = { grub: 'swords', skitter: 'swords', spitter: 'meteor', brute: 'might', charger: 'haste' };
export function drawCollection(c: Ctx, view: View, p: Profile, totals: Totals, sel: number, clock: number, reduced: boolean, touch = false) {
  const { w } = view, list = tiles(p), layout = collectionLayout(view, list.length);
  c.fillStyle = 'rgba(34,16,18,0.8)'; c.fillRect(0, 0, w, view.h);
  backButton(c, touch);
  const found = list.filter(t => t.known).length;
  outlined(c, `${tr('COLLECTION', '图鉴')} ${found}/${list.length}`, Math.max(w / 2 + (touch ? 40 : 0), 190 + (touch ? 50 : 0)), 27, w < 380 ? 15 : 19, C.gold, 'center', INK, 900);
  list.forEach((t, index) => {
    const r = layout.tiles[index], selected = index === sel, frame = t.kind === 'weapon' ? '#4aa8e0' : t.kind === 'passive' ? C.jade : t.kind === 'general' ? C.gold : C.red;
    R(c, r.x, r.y, r.w, r.h, 7); c.fillStyle = t.known ? (t.gold && t.kind === 'weapon' ? '#fff0b8' : C.parchment) : 'rgba(70,50,40,0.9)'; c.fill(); c.strokeStyle = selected ? C.gold : frame; c.lineWidth = selected ? 3.4 : 2; c.stroke();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = r.w * 0.3;
    if (!t.known) { label(c, '?', cx, cy + 1, r.w * 0.4, '#c9b48a', 'center', 900); return; }
    if (t.kind === 'general') { c.save(); c.translate(cx, r.y + r.h - 3); const k = r.h / 46; c.scale(k, k); drawHero(c, clock, false, reduced, 0, HERO_LOOKS[t.key]); c.restore(); }
    else if (t.kind === 'foe') { const kind = t.key.includes(':') ? t.key.split(':')[1] : t.key; drawIcon(c, t.key.startsWith('boss:') ? 'helm' : ENEMY_ICON[kind] ?? 'swords', cx, cy, s, C.red); if (t.key.startsWith('mid:')) { L(c, [cx - s, cy - s - 2, cx, cy - s * 1.6, cx + s, cy - s - 2]); c.fillStyle = C.gold; c.fill(); } }
    else drawIcon(c, t.key, cx, cy, s, t.kind === 'weapon' ? WEAPON_CARDS[t.key as WeaponId].color : PASSIVE_CARDS[t.key as keyof typeof PASSIVE_CARDS].color);
    if (t.gold && t.kind === 'weapon') { E(c, r.x + r.w - 7, r.y + 7, 5, 5); c.fillStyle = C.gold; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); }
  });
  const d = layout.detail, t = list[Math.max(0, Math.min(list.length - 1, sel))];
  scroll(c, d.x, d.y, d.w, d.h, false, false);
  const title = tileTitle(t) + (t.kind === 'weapon' && t.gold ? `  →  ${itemName(t.key, true)}` : '');
  label(c, title, d.x + 14, d.y + 18, 15, TEXT, 'left', 900);
  c.font = font(13, 600); const lines = wrap(c, tileDetail(t, totals), d.w - 28), room = Math.max(1, Math.floor((d.h - 36) / 17));
  lines.slice(0, room).forEach((line, row) => label(c, line, d.x + 14, d.y + 40 + row * 17, 13, BROWN, 'left', 600));
}
