import { drawAnt, drawFood, drawNest, drawSpider, drawToad, INK } from '../render/sprites';
import type { Loc } from '../types';
import type { RuleId } from './types';

/**
 * One card per rule: a picture and at most 12 words. A card opens the first time its level does, a tap dismisses
 * it, and the Rules button brings back every card met so far. No timed tips anywhere.
 */
export type RuleCard = { id: RuleId; title: Loc; text: Loc; draw(ctx: CanvasRenderingContext2D, w: number, h: number): void };

type C = CanvasRenderingContext2D;
const trail = (ctx: C, pts: [number, number][], width = 8) => {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,214,120,.75)'; ctx.lineWidth = width;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 12));
    for (let k = 0; k < n; k++) { ctx.beginPath(); ctx.arc(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
};
const lawn = (ctx: C, w: number, h: number) => {
  ctx.fillStyle = '#5c9a43'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,200,.08)';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse((i * 53) % w, (i * 37) % h, 30, 14, i, 0, Math.PI * 2); ctx.fill(); }
};
export const pill = (ctx: C, text: string, x: number, y: number, size: number, bg = 'rgba(43,29,20,.88)', fg = '#fff6e3') => {
  ctx.save();
  ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 0.9, hh = size * 1.45;
  ctx.fillStyle = bg; ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); else ctx.rect(x - w / 2, y - hh / 2, w, hh);
  ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + size * 0.05);
  ctx.restore();
};
const ants = (ctx: C, xs: number[], y: number, dir = 0, load = 0) => { for (const x of xs) drawAnt(ctx, x, y, 16, dir, 'worker', x, { load }); };

export const RULES: Record<RuleId, RuleCard> = {
  trail: {
    id: 'trail', title: { en: 'Draw a trail', zh: '画路线' },
    text: { en: 'Drag from the anthill to food. Each ant brings one crumb.', zh: '从蚁穴拖到食物。每只蚂蚁搬回一粒。' },
    draw(ctx, w, h) { lawn(ctx, w, h); trail(ctx, [[34, h / 2], [w - 40, h / 2]]); drawNest(ctx, 34, h / 2, 18, 0, 0); drawFood(ctx, 'cookie', w - 40, h / 2, 17, 1, 0); ants(ctx, [80, 110], h / 2 - 9); ants(ctx, [140, 170], h / 2 + 9, Math.PI, 1); }
  },
  scent: {
    id: 'scent', title: { en: 'Scent', zh: '气味' },
    text: { en: 'Each trail cell costs 1 Scent. Count before you draw.', zh: '每格路线花 1 点气味。先数格子再画。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h);
      for (let i = 0; i < 6; i++) { const x = 30 + i * 34; ctx.fillStyle = i < 4 ? 'rgba(255,214,120,.8)' : 'rgba(255,255,255,.2)'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, h / 2, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, h / 2 + 1); }
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 3; ctx.setLineDash([4, 3]); ctx.strokeRect(30 + 4 * 34 - 13, h / 2 - 13, 26, 26); ctx.setLineDash([]);
    }
  },
  fork: {
    id: 'fork', title: { en: 'Forks', zh: '分叉' },
    text: { en: 'Start a drag on any trail cell to branch it.', zh: '从路线上任意一格开始拖，就能分叉。' },
    draw(ctx, w, h) { lawn(ctx, w, h); trail(ctx, [[30, h / 2], [w / 2, h / 2], [w / 2, 22], [w - 40, 22]]); trail(ctx, [[w / 2, h / 2], [w / 2, h - 22], [w - 40, h - 22]]); drawNest(ctx, 30, h / 2, 16, 0, 0); drawFood(ctx, 'cookie', w - 40, 22, 14, 1, 0); drawFood(ctx, 'bread', w - 40, h - 22, 14, 1, 0); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2); ctx.stroke(); }
  },
  order: {
    id: 'order', title: { en: 'Who goes where', zh: '谁去哪里' },
    text: { en: 'Ants leave in order. Each takes the nearest food by trail.', zh: '蚂蚁按顺序出发，各去沿路线最近的食物。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); trail(ctx, [[30, h / 2], [w - 40, h / 2]]); trail(ctx, [[90, h / 2], [90, 22], [w - 40, 22]]);
      drawNest(ctx, 30, h / 2, 16, 0, 0); drawFood(ctx, 'cookie', 100, 22, 13, 1, 0); drawFood(ctx, 'bread', w - 40, h / 2, 13, 1, 0);
      pill(ctx, '1 2', 100, 46, 12); pill(ctx, '3 4', w - 40, h / 2 + 26, 12);
      ants(ctx, [44, 60], h / 2 - 16);
    }
  },
  spider: {
    id: 'spider', title: { en: 'Spider', zh: '蜘蛛' },
    text: { en: 'A spider eats the first 2 ants in its ring, then sleeps.', zh: '蜘蛛吃掉最先进圈的 2 只蚂蚁，然后吃饱了。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h);
      ctx.fillStyle = 'rgba(150,40,100,.22)'; ctx.strokeStyle = 'rgba(120,20,70,.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.rect(w / 2 - 42, h / 2 - 42, 84, 84); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      drawSpider(ctx, w / 2, h / 2, 18, 0, 0, false);
      for (let i = 0; i < 2; i++) { ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2 - 8 + i * 16, h / 2 - 30, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ants(ctx, [28, 52], h / 2 - 4); ctx.strokeStyle = '#e8574a'; ctx.lineWidth = 3;
      for (const x of [w / 2 - 34, w / 2 - 20]) { ctx.beginPath(); ctx.moveTo(x - 5, h / 2 + 20); ctx.lineTo(x + 5, h / 2 + 30); ctx.moveTo(x + 5, h / 2 + 20); ctx.lineTo(x - 5, h / 2 + 30); ctx.stroke(); }
    }
  },
  big: {
    id: 'big', title: { en: 'Big food', zh: '大件食物' },
    text: { en: 'Big food moves once enough ants hold it together.', zh: '大件食物要够数的蚂蚁一起抬才会动。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); drawFood(ctx, 'strawberry', w / 2, h / 2, 26, 1, 0);
      for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2; drawAnt(ctx, w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 30, 15, a + Math.PI, 'worker', i); }
      pill(ctx, '4/4', w / 2, h - 12, 12, 'rgba(30,90,30,.9)');
    }
  },
  bridge: {
    id: 'bridge', title: { en: 'Living bridge', zh: '蚂蚁桥' },
    text: { en: 'Crossing water: the first 3 ants out become a bridge.', zh: '过水时，最先出发的 3 只蚂蚁变成桥。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); ctx.fillStyle = '#4aa6d8'; ctx.fillRect(w / 2 - 22, 0, 44, h);
      trail(ctx, [[30, h / 2], [w - 34, h / 2]]); drawNest(ctx, 30, h / 2, 16, 0, 0); drawFood(ctx, 'cookie', w - 34, h / 2, 14, 1, 0);
      for (let k = -1; k <= 1; k++) drawAnt(ctx, w / 2, h / 2 + k * 11, 16, Math.PI / 2, 'worker', k);
      pill(ctx, '1-3', w / 2, 16, 11);
    }
  },
  digger: {
    id: 'digger', title: { en: 'Digger', zh: '掘土蚁' },
    text: { en: 'Put the Digger on your trail by chalk: it digs 2 cells.', zh: '把掘土蚁放在挨着粉笔线的路线上：向前挖 2 格。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); ctx.fillStyle = 'rgba(250,250,244,.85)'; ctx.fillRect(w / 2 - 30, 0, 60, h);
      ctx.fillStyle = 'rgba(90,60,30,.7)'; ctx.fillRect(w / 2 - 30, h / 2 - 12, 60, 24);
      trail(ctx, [[30, h / 2], [w / 2 - 34, h / 2]]); drawNest(ctx, 30, h / 2, 14, 0, 0);
      drawAnt(ctx, w / 2 - 40, h / 2, 20, 0, 'digger', 0);
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w / 2 - 22, h / 2); ctx.lineTo(w / 2 + 24, h / 2); ctx.lineTo(w / 2 + 14, h / 2 - 8); ctx.moveTo(w / 2 + 24, h / 2); ctx.lineTo(w / 2 + 14, h / 2 + 8); ctx.stroke();
    }
  },
  porter: {
    id: 'porter', title: { en: 'Big ants', zh: '大力蚁' },
    text: { en: 'A big ant counts as two: two crumbs, or two lifting.', zh: '大力蚁一只顶两只：搬两粒，或出两份力。' },
    draw(ctx, w, h) { lawn(ctx, w, h); drawAnt(ctx, w / 2 - 40, h / 2, 30, 0, 'porter', 0, { load: 1 }); pill(ctx, '= 2', w / 2 + 10, h / 2, 14); ants(ctx, [w / 2 + 50, w / 2 + 75], h / 2); }
  },
  holes: {
    id: 'holes', title: { en: 'Twin holes', zh: '双子洞' },
    text: { en: 'Trail into one hole comes out of its twin. Free.', zh: '路线钻进一个洞，从另一个洞出来。不花气味。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h);
      for (const x of [60, w - 60]) { ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.ellipse(x, h / 2, 18, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#d6a46a'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(80, h / 2 - 10); ctx.quadraticCurveTo(w / 2, 4, w - 80, h / 2 - 10); ctx.stroke(); ctx.setLineDash([]);
      pill(ctx, '0', w / 2, 22, 12);
    }
  },
  toad: {
    id: 'toad', title: { en: 'Sleepy toad', zh: '瞌睡蟾蜍' },
    text: { en: 'The toad sleeps through 3 ants, then eats every one after.', zh: '蟾蜍睡过前 3 只蚂蚁，之后进来的全被吃掉。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); ctx.fillStyle = 'rgba(255,200,60,.2)'; ctx.fillRect(w / 2 - 42, h / 2 - 42, 84, 84);
      drawToad(ctx, w / 2, h / 2, 26, 0, Math.PI / 2, true, 0); pill(ctx, 'z z z  3', w / 2, 14, 11);
    }
  },
  tape: {
    id: 'tape', title: { en: 'Sticky tape', zh: '粘胶带' },
    text: { en: 'The first ant to step on tape sticks. Others walk over it.', zh: '第一只踩上胶带的蚂蚁会被粘住，后面的踩着它过去。' },
    draw(ctx, w, h) {
      lawn(ctx, w, h); ctx.fillStyle = 'rgba(255,214,60,.85)'; ctx.fillRect(w / 2 - 20, h / 2 - 20, 40, 40);
      trail(ctx, [[30, h / 2], [w - 30, h / 2]]); drawAnt(ctx, w / 2, h / 2, 18, 0, 'worker', 0, { stuck: true }); ants(ctx, [w / 2 + 40, w / 2 + 64], h / 2 - 8);
    }
  }
};
export const ruleCard = (id: RuleId) => RULES[id];
/** Words in a rule text, the 12-word check in the tests. */
export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
