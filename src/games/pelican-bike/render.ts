import { THEMES, STARS, CLOUDS, W, H, WATER_Y, T, PW, PH, MAXST } from './theme';
import { LEVELS } from './levels';
import type { StageBest } from './sim';
import type { Theme } from './theme';
import type { Item, Enemy, Mover, Crumble, Spring, Checkpoint, Goal } from './types';

/** Visible world width in world pixels. Set by each instance right before it draws a frame. */
let VW = W;
export function setView(vw: number) { VW = vw; }

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  stroke?: string,
  weight: number | string = 800
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, shade: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = shade;
  circle(ctx, -28, 6, 18); ctx.fill();
  circle(ctx, 0, 8, 22); ctx.fill();
  circle(ctx, 28, 6, 17); ctx.fill();
  ctx.fillStyle = col;
  circle(ctx, -26, 2, 18); ctx.fill();
  circle(ctx, -4, -6, 24); ctx.fill();
  circle(ctx, 22, 0, 19); ctx.fill();
  ctx.restore();
}

function drawHills(ctx: CanvasRenderingContext2D, camX: number, par: number, baseY: number, amp: number, step: number, col: string, seed: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, WATER_Y);
  const off = camX * par;
  for (let x = -step; x <= VW + step; x += 24) {
    const wx = x + off;
    const h = Math.sin(wx / step + seed) * amp * 0.6 + Math.cos(wx / (step * 0.55) + seed * 3) * amp * 0.4;
    ctx.lineTo(x, baseY - Math.max(0, h));
  }
  ctx.lineTo(VW, WATER_Y);
  ctx.closePath();
  ctx.fill();
}

function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, lean: number, gtime: number, th: Theme) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  const sway = Math.sin(gtime * 1.8 + x * 0.02) * 0.06 + lean;
  const tx = Math.sin(sway) * 58, ty = -74;
  ctx.strokeStyle = th.trunk;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(tx * 0.4, ty * 0.5, tx, ty);
  ctx.stroke();
  ctx.translate(tx, ty);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9 + sway * 0.6;
    ctx.strokeStyle = i % 2 ? th.leaf : th.leaf2;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * 22, Math.sin(a) * 18 - 10, Math.cos(a) * 42, Math.sin(a) * 32 + 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDunes(ctx: CanvasRenderingContext2D, camX: number, par: number, baseY: number, amp: number, col: string, gtime: number, th: Theme) {
  const off = camX * par;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, WATER_Y);
  for (let x = 0; x <= VW; x += 20) {
    const wx = x + off;
    const y = baseY - (Math.sin(wx * 0.0045) * 0.5 + 0.5) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VW, WATER_Y);
  ctx.closePath();
  ctx.fill();

  const span = 260, first = Math.floor(off / span) * span;
  for (let wx = first - span; wx < off + VW + span; wx += span) {
    const h = hash(Math.floor(wx / span), 17);
    if (h < 0.32) continue;
    const x = wx - off + (h - 0.5) * 90;
    const y = baseY - (Math.sin(wx * 0.0045) * 0.5 + 0.5) * amp + 8;
    drawPalm(ctx, x, y, 0.75 + h * 0.35, (h - 0.5) * 0.35, gtime, th);
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D, curTheme: number, camX: number, gtime: number) {
  const th = THEMES[curTheme];
  const g = ctx.createLinearGradient(0, 0, 0, WATER_Y);
  th.sky.forEach((c, i) => g.addColorStop(i / (th.sky.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, WATER_Y);

  if (th.night || curTheme === 1) {
    const maxY = th.night ? 310 : 140;
    for (const s of STARS) {
      if (s.y > maxY) continue;
      const a = 0.35 + 0.65 * Math.sin(gtime * s.sp + s.ph);
      ctx.fillStyle = `rgba(255,255,240,${a * (th.night ? 1 : 0.45)})`;
      ctx.fillRect(s.x * VW / W, s.y, s.s, s.s);
    }
  }

  const sx = th.sunPos[0] * VW / W, sy = th.sunPos[1], sr = th.sunPos[2];
  const sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.6);
  sg.addColorStop(0, th.sunGlow);
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  circle(ctx, sx, sy, sr * 2.6); ctx.fill();
  ctx.fillStyle = th.sun;
  circle(ctx, sx, sy, sr); ctx.fill();
  if (th.night) {
    ctx.fillStyle = th.sky[1];
    circle(ctx, sx - 12, sy - 8, sr * 0.82); ctx.fill();
  }

  for (const cl of CLOUDS) {
    const cx = ((cl.x - camX * cl.p - gtime * 12 * cl.p) % (VW + 260) + VW + 260) % (VW + 260) - 130;
    drawCloud(ctx, cx, cl.y, cl.s, th.cloud, th.cloudShade);
  }

  drawHills(ctx, camX, 0.14, 355, 75, 290, th.far, 1);
  drawHills(ctx, camX, 0.24, 382, 55, 210, th.far2, 2);

  const seaY = 408;
  const sg2 = ctx.createLinearGradient(0, seaY, 0, WATER_Y);
  sg2.addColorStop(0, th.sea[0]);
  sg2.addColorStop(1, th.sea[1]);
  ctx.fillStyle = sg2;
  ctx.fillRect(0, seaY, VW, WATER_Y - seaY);
  ctx.fillStyle = th.seaHi;
  for (let i = 0; i < 24; i++) {
    const wy = seaY + 6 + (i * 2.6);
    const wx = ((sx + Math.sin(gtime * 2 + i * 0.9) * (18 + i * 2.2)));
    const ww = (sr * 1.1) * (1 - i / 32) + Math.sin(gtime * 3 + i) * 8;
    ctx.fillRect(wx - ww / 2, wy, ww, 2);
  }

  for (let i = 0; i < 3; i++) {
    const bx = ((i * 390 + 180 - camX * 0.28 - gtime * 8) % (VW + 200) + VW + 200) % (VW + 200) - 100;
    const by = seaY + 8 + Math.sin(gtime * 2 + i) * 2;
    ctx.fillStyle = th.sil ? th.trunk : '#fff';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 12, by - 22); ctx.lineTo(bx + 14, by); ctx.fill();
    ctx.fillStyle = th.sil ? th.trunk : '#8a4f2b';
    ctx.fillRect(bx - 4, by, 22, 4);
  }

  drawDunes(ctx, camX, 0.42, 442, 34, th.dune, gtime, th);
}

export function drawTile(ctx: CanvasRenderingContext2D, grid: string[][], r: number, c: number, x: number, y: number, th: Theme, gtime: number) {
  const ch = grid[r][c];
  if (ch === '#') {
    const top = r === 0 || grid[r - 1][c] !== '#';
    ctx.fillStyle = (r + c) % 2 ? th.dirt : th.dirt2;
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = th.dirtDark;
    if ((r * 7 + c * 13) % 5 === 0) ctx.fillRect(x + 8, y + 18, 7, 5);
    if ((r * 3 + c * 11) % 4 === 0) ctx.fillRect(x + 24, y + 26, 6, 6);
    if (top) {
      ctx.fillStyle = th.grassDark; ctx.fillRect(x, y, T, 11);
      ctx.fillStyle = th.grass; ctx.fillRect(x, y, T, 7);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { ctx.arc(x + 5 + i * 10, y + 7, 4, 0, Math.PI); }
      ctx.fill();
    }
  } else if (ch === 'B') {
    ctx.fillStyle = '#c98847'; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
    ctx.strokeStyle = '#7c4c21'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + T - 4, y + T - 4);
    ctx.moveTo(x + T - 4, y + 4); ctx.lineTo(x + 4, y + T - 4);
    ctx.stroke();
  } else if (ch === '=') {
    ctx.fillStyle = '#7c4c21'; ctx.fillRect(x, y + 5, T, 9);
    ctx.fillStyle = '#d49a5a'; ctx.fillRect(x, y, T, 8);
    ctx.fillStyle = '#5a3515'; ctx.fillRect(x + 5, y + 2, 3, 4); ctx.fillRect(x + T - 8, y + 2, 3, 4);
  } else if (ch === '^') {
    const cx = x + 20, cy = y + 28;
    ctx.strokeStyle = th.night || th.sil ? '#b98be6' : '#3b1c54'; ctx.lineWidth = 2.6;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const len = 17 + Math.sin(gtime * 5 + i + c) * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c2a7d'; circle(ctx, cx, cy, 11); ctx.fill();
    if (th.night || th.sil) { ctx.strokeStyle = '#e2c8ff'; ctx.lineWidth = 1.5; circle(ctx, cx, cy, 11); ctx.stroke(); }
    ctx.fillStyle = '#fff'; circle(ctx, cx - 4, cy - 3, 2.5); ctx.fill(); circle(ctx, cx + 4, cy - 3, 2.5); ctx.fill();
    ctx.fillStyle = '#111'; circle(ctx, cx - 4, cy - 3, 1.3); ctx.fill(); circle(ctx, cx + 4, cy - 3, 1.3); ctx.fill();
  }
}

export function drawPelican(ctx: CanvasRenderingContext2D, P: any, gtime: number) {
  ctx.save();
  if (P.inv > 0 && !P.dead && Math.floor(P.inv * 16) % 2 === 1) ctx.globalAlpha = 0.35; // mercy blink: faded, never invisible
  ctx.translate(P.x + PW / 2, P.y + PH);
  ctx.scale(P.dir * P.sx, P.sy);
  ctx.rotate(P.tilt * P.dir);

  const drawWheel = (wx: number, wy: number) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(P.wheel * P.dir);
    ctx.strokeStyle = '#1f2430'; ctx.lineWidth = 4.5; circle(ctx, 0, 0, 10.5); ctx.stroke();
    ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1.6; circle(ctx, 0, 0, 7.5); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -7.5, Math.sin(a) * -7.5);
      ctx.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#e63946'; circle(ctx, 0, 0, 2.5); ctx.fill();
    ctx.restore();
  };
  drawWheel(-14, -11);
  drawWheel(15, -11);

  ctx.strokeStyle = '#e63946'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-14, -11); ctx.lineTo(-2, -11); ctx.lineTo(-7, -25); ctx.closePath();
  ctx.moveTo(-7, -25); ctx.lineTo(10, -25); ctx.lineTo(-2, -11);
  ctx.moveTo(15, -11); ctx.lineTo(9, -31); ctx.lineTo(13, -33);
  ctx.stroke();

  ctx.fillStyle = '#3d2b1f'; rrect(ctx, -12, -28, 10, 4, 2); ctx.fill();
  ctx.fillStyle = '#ffd166'; circle(ctx, 14, -27, 2.5); ctx.fill();

  const pa = P.pedal * P.dir;
  const fx1 = -2 + Math.cos(pa + Math.PI) * 5.5, fy1 = -11 + Math.sin(pa + Math.PI) * 5.5;
  ctx.strokeStyle = '#e07a22'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(-7, -17); ctx.lineTo(fx1, fy1); ctx.stroke();

  ctx.fillStyle = '#f8f9fa';
  ellipse(ctx, -5, -30, 12, 9.5, -0.15); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-15, -31); ctx.lineTo(-22, -36); ctx.lineTo(-19, -27); ctx.closePath(); ctx.fill();

  const fx2 = -2 + Math.cos(pa) * 5.5, fy2 = -11 + Math.sin(pa) * 5.5;
  ctx.strokeStyle = '#f48c06'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-3, -24); ctx.lineTo(-1, -17); ctx.lineTo(fx2, fy2); ctx.stroke();
  ctx.fillStyle = '#f48c06';
  ctx.beginPath(); ctx.moveTo(fx2 - 2, fy2); ctx.lineTo(fx2 + 6, fy2 - 1); ctx.lineTo(fx2 + 4, fy2 + 3); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = '#f8f9fa'; ctx.lineWidth = 8.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(1, -34); ctx.quadraticCurveTo(0, -43, 5, -48); ctx.stroke();
  ctx.fillStyle = '#f8f9fa'; circle(ctx, 6, -50, 7.2); ctx.fill();

  const pouchBulge = 7.5 + P.pouch * 6.5 + Math.sin(gtime * 8) * 0.4;
  ctx.fillStyle = '#ff9f1c';
  ctx.beginPath(); ctx.moveTo(9, -50);
  ctx.quadraticCurveTo(18, -48 + pouchBulge, 28, -48);
  ctx.lineTo(9, -48); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath(); ctx.moveTo(9, -53); ctx.lineTo(30, -50); ctx.lineTo(29, -47); ctx.lineTo(9, -49); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e85d04'; circle(ctx, 29.5, -48.5, 1.6); ctx.fill();

  ctx.fillStyle = '#fff'; circle(ctx, 8, -52, 2.7); ctx.fill();
  ctx.fillStyle = '#1d3557'; circle(ctx, 8.8, -52, 1.5); ctx.fill();
  ctx.fillStyle = '#fff'; circle(ctx, 9.2, -52.5, 0.5); ctx.fill();
  ctx.fillStyle = '#1d3557';
  ctx.beginPath(); ctx.arc(5, -55, 6, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e63946'; circle(ctx, 5, -61, 1.8); ctx.fill();

  const sw = Math.sin(gtime * 14) * 3 + Math.min(14, Math.abs(P.vx) * 0.04);
  ctx.strokeStyle = '#e63946'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(2, -41); ctx.quadraticCurveTo(-8 - sw * 0.5, -42, -15 - sw, -38 + Math.cos(gtime * 16) * 2.5); ctx.stroke();

  ctx.fillStyle = '#e9ecef'; ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1.4;
  if (P.gliding || P.flap > 0.05) {
    const wy = Math.sin(P.flap * 5) * 9;
    ctx.beginPath(); ctx.moveTo(-2, -33);
    ctx.quadraticCurveTo(-12, -52 - wy, -24, -44 - wy);
    ctx.quadraticCurveTo(-12, -30, -2, -29); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-2, -33); ctx.quadraticCurveTo(6, -34, 11, -32);
    ctx.quadraticCurveTo(4, -27, -4, -29); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}

export function drawEntities(
  ctx: CanvasRenderingContext2D,
  goal: Goal | null,
  checks: Checkpoint[],
  springs: Spring[],
  movers: Mover[],
  crumbles: Crumble[],
  items: Item[],
  enemies: Enemy[],
  camX: number,
  gtime: number,
  isZh: boolean
) {
  if (goal) {
    const gx = goal.x, gy = goal.y;
    ctx.save();
    const beamA = Math.sin(gtime * 2.2) * 0.35;
    const bg = ctx.createLinearGradient(gx, gy - 150, gx + 220, gy - 150);
    bg.addColorStop(0, 'rgba(255,245,160,0.55)');
    bg.addColorStop(1, 'rgba(255,245,160,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(gx, gy - 148);
    ctx.lineTo(gx + 220, gy - 195 + beamA * 60);
    ctx.lineTo(gx + 220, gy - 105 + beamA * 60);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#e63946' : '#f8f9fa';
      const w0 = 42 - i * 4, w1 = 38 - i * 4, y0 = gy - i * 26, y1 = y0 - 26;
      ctx.beginPath();
      ctx.moveTo(gx - w0 / 2, y0);
      ctx.lineTo(gx + w0 / 2, y0);
      ctx.lineTo(gx + w1 / 2, y1);
      ctx.lineTo(gx - w1 / 2, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#1d3557'; ctx.fillRect(gx - 14, gy - 142, 28, 12);
    ctx.fillStyle = '#ffe66d'; ctx.fillRect(gx - 9, gy - 156, 18, 14);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.moveTo(gx - 13, gy - 156); ctx.lineTo(gx + 13, gy - 156); ctx.lineTo(gx, gy - 172); ctx.closePath(); ctx.fill();
    drawText(ctx, isZh ? '终点' : 'GOAL', gx, gy - 184, 14, '#ffe66d', 'center', '#1d3557');
    ctx.restore();
  }

  for (const ck of checks) {
    ctx.fillStyle = '#e9ecef'; ctx.fillRect(ck.x + 10, ck.y, 4, ck.h);
    const col = ck.active ? '#2ec4b6' : '#ff9f1c';
    const wave = Math.sin(gtime * 6 + ck.x) * 4;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ck.x + 14, ck.y + 4);
    ctx.lineTo(ck.x + 42, ck.y + 11 + wave);
    ctx.lineTo(ck.x + 14, ck.y + 20);
    ctx.closePath();
    ctx.fill();
  }

  for (const sp of springs) {
    const h = 14 - sp.comp * 7;
    ctx.fillStyle = '#adb5bd'; ctx.fillRect(sp.x + 12, sp.y + 24 - h, 8, h);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(sp.x + 16, sp.y + 24 - h, 16, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sp.x + 16, sp.y + 24 - h, 7, Math.PI, 0); ctx.fill();
  }

  for (const m of movers) {
    ctx.fillStyle = '#8a5a3b'; rrect(ctx, m.x, m.y, m.w, m.h, 5); ctx.fill();
    ctx.fillStyle = '#d49a5a'; rrect(ctx, m.x + 2, m.y + 2, m.w - 4, 8, 3); ctx.fill();
    ctx.fillStyle = '#e63946'; circle(ctx, m.x + 14, m.y + 12, 4); ctx.fill(); circle(ctx, m.x + m.w - 14, m.y + 12, 4); ctx.fill();
  }

  for (const cr of crumbles) {
    if (cr.state === 2) continue;
    const ox = cr.state === 1 ? Math.sin(gtime * 65) * 3 : 0;
    ctx.fillStyle = '#b07d4f'; ctx.fillRect(cr.x + ox, cr.y, T, T);
    ctx.fillStyle = '#d8a472'; ctx.fillRect(cr.x + ox + 2, cr.y + 2, T - 4, 10);
    ctx.strokeStyle = '#5c3c1e'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cr.x + ox + 8, cr.y + 6);
    ctx.lineTo(cr.x + ox + 20, cr.y + 22);
    ctx.lineTo(cr.x + ox + 14, cr.y + 34);
    ctx.stroke();
  }

  for (const it of items) {
    if (it.got) continue;
    if (it.x < camX - 40 || it.x > camX + VW + 40) continue;
    const bob = Math.sin(gtime * 4 + it.ph) * 4;
    ctx.save();
    ctx.translate(it.x, it.y + bob);
    if (it.type === 'fish') {
      ctx.fillStyle = '#ff9f1c';
      ellipse(ctx, 0, 0, 9, 5.5, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-14, -5); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe66d'; ellipse(ctx, 1, 1, 5, 2.5, 0); ctx.fill();
      ctx.fillStyle = '#1d3557'; circle(ctx, 4.5, -1.2, 1.3); ctx.fill();
    } else {
      ctx.rotate(Math.sin(gtime * 3 + it.ph) * 0.2);
      ctx.fillStyle = '#ffe66d'; ctx.strokeStyle = '#f48c06'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 14 : 6.5, a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  for (const e of enemies) {
    if (e.x < camX - 60 || e.x > camX + VW + 60) continue;
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    if (e.dead) ctx.scale(1, -1);
    if (e.type === 'crab') {
      const leg = Math.sin(gtime * 14 + e.t) * 3;
      ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 2.5;
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(s * 8, 2); ctx.lineTo(s * (15 + i * 2), 10 + (i % 2 ? leg : -leg)); ctx.stroke();
        }
      }
      ctx.fillStyle = '#e63946'; ellipse(ctx, 0, 2, 13, 9, 0); ctx.fill();
      ctx.fillStyle = '#ff6b6b'; circle(ctx, -11, -7, 5); ctx.fill(); circle(ctx, 11, -7, 5); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, -5, -6, 3.2); ctx.fill(); circle(ctx, 5, -6, 3.2); ctx.fill();
      ctx.fillStyle = '#111'; circle(ctx, -5 + e.dir, -6, 1.5); ctx.fill(); circle(ctx, 5 + e.dir, -6, 1.5); ctx.fill();
    } else if (e.type === 'gull') {
      ctx.scale(-e.dir, 1);
      const wf = Math.sin(gtime * 11 + e.t) * 9;
      ctx.fillStyle = '#f8f9fa'; ellipse(ctx, 0, 2, 13, 7, 0); ctx.fill();
      ctx.fillStyle = '#457b9d';
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-8, -14 - wf, -16, -6 - wf); ctx.lineTo(4, 2); ctx.fill();
      ctx.fillStyle = '#ffb703';
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(20, 2); ctx.lineTo(11, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; circle(ctx, 8, -1, 1.6); ctx.fill();
    } else if (e.type === 'jelly') {
      if (e.state === 'wait' && e.t > 0.55) {
        // Ripples warn that a jellyfish is about to leap from this spot.
        const k = Math.min(1, (e.t - 0.55) / 0.8);
        ctx.strokeStyle = `rgba(255,170,215,${0.35 + k * 0.6})`; ctx.lineWidth = 2.5;
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(0, WATER_Y - 5 - (e.y + e.h / 2), 8 + k * 16 + i * 9, 3 + k * 2 + i * 2, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = `rgba(255,255,255,${0.5 + k * 0.4})`;
        for (let i = 0; i < 3; i++) { const by = WATER_Y - (e.y + e.h / 2) - 6 - ((gtime * 60 + i * 9) % 22) * k; circle(ctx, (i - 1) * 7, by, 2.2); ctx.fill(); }
      }
      ctx.strokeStyle = '#ff99c8'; ctx.lineWidth = 2.2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 4, 4);
        ctx.quadraticCurveTo(i * 5 + Math.sin(gtime * 8 + i) * 4, 12, i * 4, 19); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,133,200,0.88)';
      ctx.beginPath(); ctx.arc(0, 4, 13, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, -5, -2, 2.5); ctx.fill(); circle(ctx, 5, -2, 2.5); ctx.fill();
    }
    ctx.restore();
  }
}

export function drawWater(ctx: CanvasRenderingContext2D, th: Theme, camX: number, gtime: number) {
  ctx.save();
  ctx.fillStyle = th.water; ctx.globalAlpha = 0.84;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= VW + 16; x += 16) {
    const wx = x + camX;
    const wy = WATER_Y + Math.sin(wx * 0.035 + gtime * 3.5) * 4 + Math.cos(wx * 0.018 - gtime * 2.2) * 3;
    ctx.lineTo(x, wy);
  }
  ctx.lineTo(VW, H); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = th.waterHi; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let x = 0; x <= VW + 16; x += 16) {
    const wx = x + camX;
    const wy = WATER_Y + Math.sin(wx * 0.035 + gtime * 3.5) * 4 + Math.cos(wx * 0.018 - gtime * 2.2) * 3;
    if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- HUD and menus: drawn in UI space (CSS-pixel sized), independent of the world zoom ---------- */

export type UiResult = { medals: number; newBest: boolean; timeBonus: number };
export type Ui = {
  uw: number; uh: number; padL: number; touch: boolean; isZh: boolean; gtime: number;
  state: 'title' | 'playing' | 'paused' | 'levelclear' | 'victory';
  P: { hp: number; maxHp: number; stamina: number; turbo: boolean; streak: number };
  lv: number; progress: number; time: number; deaths: number; bannerT: number;
  fishGot: number; fishTot: number; starGot: number; starTot: number; score: number; hiScore: number;
  sel: number; unlocked: number; bests: (StageBest | null)[]; result: UiResult | null;
};
export type Hit = { x: number; y: number; w: number; h: number; act: string };

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60), sec = t - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.42);
  ctx.bezierCurveTo(x - s * 0.62, y - s * 0.05, x - s * 0.4, y - s * 0.5, x, y - s * 0.2);
  ctx.bezierCurveTo(x + s * 0.4, y - s * 0.5, x + s * 0.62, y - s * 0.05, x, y + s * 0.42);
  ctx.fill();
}

function fishIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, col = '#ff9f1c') {
  ctx.fillStyle = col;
  ellipse(ctx, x, y, 9 * s, 5.5 * s, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x - 14 * s, y - 5 * s); ctx.lineTo(x - 14 * s, y + 5 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d3557'; circle(ctx, x + 4.5 * s, y - 1.2 * s, 1.3 * s); ctx.fill();
}

function starIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean, onCol = '#ffe66d') {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.46, a = (i * Math.PI) / 5 - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = on ? onCol : 'rgba(255,255,255,0.16)'; ctx.fill();
  ctx.strokeStyle = on ? '#f48c06' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
}

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, r * 0.22); ctx.lineCap = 'round';
  circle(ctx, x, y, r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y); ctx.lineTo(x + r * 0.42, y + r * 0.2); ctx.stroke();
}

/** One of the three stage medals: 0 par time, 1 all stars, 2 fish haul. */
function medal(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, on: boolean) {
  ctx.fillStyle = on ? '#ffd166' : 'rgba(255,255,255,0.08)'; circle(ctx, x, y, r); ctx.fill();
  ctx.strokeStyle = on ? '#f48c06' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1.5, r * 0.14); circle(ctx, x, y, r); ctx.stroke();
  const ink = on ? '#3b2a05' : 'rgba(255,255,255,0.55)';
  if (kind === 0) clockIcon(ctx, x, y, r * 0.52, ink);
  else if (kind === 1) { ctx.save(); starIcon(ctx, x, y, r * 0.62, true, ink); ctx.restore(); }
  else fishIcon(ctx, x + r * 0.12, y, r / 17, ink);
}

function wrapLines(ctx: CanvasRenderingContext2D, str: string, size: number, maxW: number, weight: number | string = 600): string[] {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const words = (/[\u4e00-\u9fff]/.test(str) ? str.match(/[^，。·！、：]+[，。·！、：]?\s*/g) : str.match(/\S+\s*/g)) ?? [str];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && ctx.measureText(cur + w).width > maxW) { lines.push(cur.trim()); cur = w; } else cur += w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function button(ctx: CanvasRenderingContext2D, hits: Hit[], act: string, label: string, cx: number, cy: number, w: number, h: number, primary: boolean, pulse = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(pulse, pulse);
  ctx.fillStyle = primary ? '#ff9f1c' : 'rgba(255,255,255,0.14)'; rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
  if (!primary) { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.stroke(); }
  let size = 17;
  ctx.font = `800 ${size}px ${FONT}`;
  while (size > 14 && ctx.measureText(label).width > w - 20) { size--; ctx.font = `800 ${size}px ${FONT}`; }
  drawText(ctx, label, 0, 1, size, primary ? '#141b2d' : '#ffffff', 'center');
  ctx.restore();
  hits.push({ x: cx - w / 2, y: cy - h / 2, w, h, act });
}

export function drawHUD(ctx: CanvasRenderingContext2D, u: Ui) {
  const { uw, isZh } = u;
  const compact = uw < 600;
  // Left: hearts and sprint energy
  const lx = 8 + u.padL;
  ctx.fillStyle = 'rgba(13,24,48,0.6)'; rrect(ctx, lx, 8, 92, 46, 10); ctx.fill();
  for (let i = 0; i < u.P.maxHp; i++) heart(ctx, lx + 18 + i * 27, 22, 20, i < u.P.hp ? '#ff595e' : 'rgba(255,255,255,0.25)');
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; rrect(ctx, lx + 8, 38, 76, 9, 4.5); ctx.fill();
  const st = Math.min(1, Math.max(0, u.P.stamina / MAXST));
  ctx.fillStyle = u.P.turbo ? '#ff9f1c' : st < 0.2 ? '#ff6b6b' : '#4cc9f0';
  if (st > 0.04) { rrect(ctx, lx + 8, 38, 76 * st, 9, 4.5); ctx.fill(); }

  // Right: fish, stars, time, score
  const rw = 158, rx = uw - rw - 8;
  ctx.fillStyle = 'rgba(13,24,48,0.6)'; rrect(ctx, rx, 8, rw, 46, 10); ctx.fill();
  fishIcon(ctx, rx + 24, 21, 0.9);
  drawText(ctx, `${u.fishGot}/${u.fishTot}`, rx + 38, 22, 15, '#ffd9a0', 'left');
  for (let i = 0; i < u.starTot; i++) starIcon(ctx, rx + rw - 14 - (u.starTot - 1 - i) * 19, 21, 8, i < u.starGot);
  drawText(ctx, fmtTime(u.time), rx + 10, 42, 15, u.time > LEVELS[u.lv].par ? '#cfd8e6' : '#9ff0a8', 'left');
  drawText(ctx, String(u.score), rx + rw - 8, 42, 15, '#ffffff', 'right');

  // Middle: progress to the lighthouse
  const bx0 = compact ? lx + 100 : Math.max(lx + 110, uw / 2 - 150), bx1 = compact ? rx - 14 : uw / 2 + 150, by = compact ? 14 : 16;
  if (bx1 - bx0 > 50) {
    ctx.fillStyle = 'rgba(13,24,48,0.6)'; rrect(ctx, bx0, by, bx1 - bx0, 10, 5); ctx.fill();
    const px = bx0 + 2 + (bx1 - bx0 - 4) * Math.min(1, Math.max(0, u.progress));
    ctx.fillStyle = '#7ae582'; rrect(ctx, bx0 + 2, by + 2, Math.max(6, px - bx0 - 2), 6, 3); ctx.fill();
    ctx.fillStyle = '#ffffff'; circle(ctx, px, by + 5, 6); ctx.fill();
    ctx.fillStyle = '#e63946'; circle(ctx, px, by + 5, 3.2); ctx.fill();
    // lighthouse marker
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(bx1 - 4, by - 5, 6, 15);
    ctx.fillStyle = '#e63946'; ctx.fillRect(bx1 - 4, by, 6, 4);
    ctx.fillStyle = '#ffe66d'; ctx.fillRect(bx1 - 5, by - 9, 8, 5);
    const name = isZh ? LEVELS[u.lv].name : LEVELS[u.lv].nameEn;
    ctx.font = `800 14px ${FONT}`;
    if (ctx.measureText(name).width < bx1 - bx0 + 20) drawText(ctx, name, (bx0 + bx1) / 2, by + 26, 14, 'rgba(255,255,255,0.95)', 'center', '#141b2d');
  }

  if (u.P.streak >= 5 && u.state === 'playing') {
    const mult = Math.min(4, 1 + Math.floor(u.P.streak / 5));
    drawText(ctx, isZh ? `连吃 ×${mult}` : `STREAK ×${mult}`, lx + 4, 70, 15, '#ffe66d', 'left', '#141b2d');
  }

  if (u.bannerT > 0 && u.state === 'playing') {
    const a = Math.min(1, u.bannerT * 1.6);
    ctx.save(); ctx.globalAlpha = a;
    const name = isZh ? LEVELS[u.lv].name : LEVELS[u.lv].nameEn;
    drawText(ctx, name, uw / 2, 92, compact ? 24 : 32, '#fff', 'center', '#141b2d');
    const hint = isZh ? `三颗金星 · 标准用时 ${fmtTime(LEVELS[u.lv].par)}` : `3 stars to find · par ${fmtTime(LEVELS[u.lv].par)}`;
    drawText(ctx, hint, uw / 2, compact ? 120 : 126, compact ? 14 : 16, '#ffe66d', 'center', '#141b2d');
    ctx.restore();
  }
}

function medalRow(ctx: CanvasRenderingContext2D, medals: number, cx: number, y: number, r: number, gap: number) {
  for (let i = 0; i < 3; i++) medal(ctx, i, cx + (i - 1) * gap, y, r, (medals & (1 << i)) !== 0);
}

export function drawOverlay(ctx: CanvasRenderingContext2D, u: Ui): Hit[] {
  const hits: Hit[] = [];
  if (u.state === 'playing') return hits;
  const { uw, uh, isZh } = u;
  const compact = uw < 600;
  ctx.fillStyle = 'rgba(8,14,30,0.6)'; ctx.fillRect(0, 0, uw, uh);
  const pw = Math.min(560, uw - 12), ph = Math.min(400, uh - 12), px = (uw - pw) / 2, py = (uh - ph) / 2, cx = uw / 2;
  ctx.fillStyle = 'rgba(20,34,66,0.94)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
  rrect(ctx, px, py, pw, ph, 16); ctx.fill(); ctx.stroke();
  const pulse = 1 + Math.sin(u.gtime * 5) * 0.03;
  const levelName = isZh ? LEVELS[u.lv].name : LEVELS[u.lv].nameEn;

  if (u.state === 'title') {
    let y = py + (compact ? 26 : 38);
    drawText(ctx, isZh ? '鹈鹕骑行记' : 'Pelican Pedal', cx, y, compact ? 26 : 38, '#ffe66d', 'center', '#141b2d');
    y += compact ? 24 : 34;
    drawText(ctx, isZh ? '吃小鱼 · 找金星 · 冲向灯塔' : 'Catch fish · find stars · reach the lighthouse', cx, y, compact ? 14 : 16, '#9fe6ff', 'center');
    // Stage select
    y += compact ? 16 : 22;
    const n = LEVELS.length, gap = 6, cw = (pw - 24 - gap * (n - 1)) / n, ch = compact ? 78 : 92;
    for (let i = 0; i < n; i++) {
      const x = px + 12 + i * (cw + gap), locked = i > u.unlocked, sel = i === u.sel, best = u.bests[i];
      ctx.fillStyle = sel ? 'rgba(255,159,28,0.28)' : 'rgba(255,255,255,0.07)'; rrect(ctx, x, y, cw, ch, 10); ctx.fill();
      ctx.strokeStyle = sel ? '#ff9f1c' : 'rgba(255,255,255,0.2)'; ctx.lineWidth = sel ? 3 : 1.5; rrect(ctx, x, y, cw, ch, 10); ctx.stroke();
      if (locked) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; rrect(ctx, x + cw / 2 - 10, y + ch / 2 - 4, 20, 16, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2 - 5, 7, Math.PI, 0); ctx.stroke();
      } else {
        drawText(ctx, String(i + 1), x + cw / 2, y + (compact ? 17 : 20), compact ? 22 : 26, '#ffffff', 'center', '#141b2d');
        medalRow(ctx, best?.medals ?? 0, x + cw / 2, y + (compact ? 42 : 50), compact ? 9 : 11, compact ? 22 : 27);
        drawText(ctx, best ? fmtTime(best.time) : '—', x + cw / 2, y + ch - 13, 14, best ? '#9ff0a8' : 'rgba(255,255,255,0.6)', 'center');
        hits.push({ x, y, w: cw, h: ch, act: `stage:${i}` });
      }
    }
    y += ch + (compact ? 16 : 20);
    const sname = isZh ? LEVELS[u.sel].name : LEVELS[u.sel].nameEn;
    drawText(ctx, `${sname} · ${isZh ? '标准' : 'par'} ${fmtTime(LEVELS[u.sel].par)}`, cx, y, compact ? 14 : 16, '#ffffff', 'center');
    y += compact ? 18 : 24;
    const tip = u.touch
      ? (isZh ? '◀ ▶ 骑行 · ⤒ 跳跃，空中再按二段跳，按住滑翔 · ⚡ 冲刺' : '◀ ▶ ride · ⤒ hop, tap again to flap, hold to glide · ⚡ sprint')
      : (isZh ? '方向键/A D 骑行 · 空格跳跃，空中再按二段跳，按住滑翔 · Shift 冲刺 · ◀ ▶ 选关' : 'Arrows/A D ride · Space hops, press again to flap, hold to glide · Shift sprints · ◀ ▶ pick a stage');
    const btnY = py + ph - (compact ? 28 : 36);
    const lines = wrapLines(ctx, tip, 14, pw - 28);
    const room = Math.floor((btnY - 26 - y) / 18) + 1;
    lines.slice(0, Math.max(0, room)).forEach((t, i) => drawText(ctx, t, cx, y + i * 18, 14, 'rgba(255,255,255,0.85)', 'center', undefined, 600));
    if (u.hiScore > 0 && !compact) drawText(ctx, isZh ? `最高分 ${u.hiScore}` : `High score ${u.hiScore}`, px + pw - 16, py + 20, 14, '#7ae582', 'right');
    button(ctx, hits, 'start', u.touch ? (isZh ? '点击出发 ▶' : 'Tap to ride ▶') : (isZh ? '按 Enter / 空格出发 ▶' : 'Enter / Space to ride ▶'), cx, btnY, Math.min(280, pw - 40), 40, true, pulse);
  } else if (u.state === 'paused') {
    drawText(ctx, isZh ? '游戏暂停' : 'PAUSED', cx, py + ph * 0.3, 34, '#ffe66d', 'center', '#141b2d');
    drawText(ctx, u.touch ? (isZh ? '点击继续骑行' : 'Tap to keep riding') : (isZh ? '按 P 继续骑行' : 'Press P to keep riding'), cx, py + ph * 0.52, 17, '#fff', 'center');
    if (!u.touch) drawText(ctx, isZh ? '按 R 回到最近存档点' : 'Press R to retry from the checkpoint', cx, py + ph * 0.66, 15, '#9fe6ff', 'center');
    hits.push({ x: px, y: py, w: pw, h: ph, act: 'resume' });
  } else if (u.state === 'levelclear') {
    const res = u.result ?? { medals: 0, newBest: false, timeBonus: 0 };
    let y = py + (compact ? 26 : 34);
    drawText(ctx, isZh ? `${levelName} 通过！` : `${levelName} clear!`, cx, y, compact ? 20 : 28, '#7ae582', 'center', '#141b2d');
    // Three medals with what each one asks for
    const mr = compact ? 22 : 28, mgap = Math.min(150, (pw - 30) / 3);
    y += compact ? 46 : 60;
    medalRow(ctx, res.medals, cx, y, mr, mgap);
    const pct = u.fishTot ? Math.floor((u.fishGot / u.fishTot) * 100) : 100;
    const labels = [
      [fmtTime(u.time), `${isZh ? '标准' : 'par'} ${fmtTime(LEVELS[u.lv].par)}`],
      [`${u.starGot}/${u.starTot}`, isZh ? '全部金星' : 'all stars'],
      [`${pct}%`, isZh ? '小鱼 90%' : '90% of fish']
    ];
    labels.forEach((l, i) => {
      const on = (res.medals & (1 << i)) !== 0;
      drawText(ctx, l[0], cx + (i - 1) * mgap, y + mr + 14, 16, on ? '#ffe66d' : '#ffffff', 'center');
      drawText(ctx, l[1], cx + (i - 1) * mgap, y + mr + 33, 14, 'rgba(255,255,255,0.75)', 'center', undefined, 600);
    });
    y += mr + (compact ? 58 : 66);
    const bits = [
      res.newBest ? (isZh ? '新纪录！' : 'New best!') : '',
      res.timeBonus > 0 ? (isZh ? `时间奖励 +${res.timeBonus}` : `Time bonus +${res.timeBonus}`) : '',
      u.deaths === 0 ? (isZh ? '零失误' : 'No falls') : (isZh ? `失误 ${u.deaths} 次` : `Falls ${u.deaths}`),
      isZh ? `总分 ${u.score}` : `Score ${u.score}`
    ].filter(Boolean).join('  ·  ');
    wrapLines(ctx, bits, 15, pw - 24, 800).slice(0, 2).forEach((t, i) => drawText(ctx, t, cx, y + i * 20, 15, res.newBest ? '#9ff0a8' : '#ffffff', 'center'));
    // What to chase next time
    const best = u.bests[u.lv];
    const need = Math.ceil(u.fishTot * 0.9) - u.fishGot;
    const hint = res.medals === 7 ? (isZh ? '完美骑行，三枚奖章全拿！' : 'Perfect ride: all three medals!')
      : !(res.medals & 2) ? (isZh ? `还有 ${u.starTot - u.starGot} 颗金星藏在高处或险处` : `${u.starTot - u.starGot} more ${u.starTot - u.starGot === 1 ? 'star is' : 'stars are'} hiding up high or over a gap`)
      : !(res.medals & 4) ? (isZh ? `再多吃 ${need} 条小鱼就能拿到鱼奖章` : `${need} more fish earns the fish medal`)
      : (isZh ? '多用冲刺和滑翔，挑战标准用时' : 'Sprint and glide more to beat the par time');
    const hy = y + (compact ? 30 : 42);
    if (hy < py + ph - (compact ? 60 : 74)) {
      drawText(ctx, hint, cx, hy, 14, '#9fe6ff', 'center', undefined, 600);
      if (best && !compact) drawText(ctx, `${isZh ? '最佳用时' : 'Best time'} ${fmtTime(best.time)}`, cx, hy + 22, 14, 'rgba(255,255,255,0.7)', 'center', undefined, 600);
    }
    const btnY = py + ph - (compact ? 28 : 36), bw = Math.min(180, (pw - 36) / 2);
    button(ctx, hits, 'retry', u.touch ? (isZh ? '再骑一次' : 'Ride again') : (isZh ? 'R 再骑一次' : 'R · ride again'), cx - bw / 2 - 6, btnY, bw, 40, false);
    const last = u.lv + 1 >= LEVELS.length;
    button(ctx, hits, 'next', last ? (isZh ? '完成 ▶' : 'Finish ▶') : (u.touch ? (isZh ? '下一关 ▶' : 'Next stage ▶') : (isZh ? 'Enter 下一关 ▶' : 'Enter · next ▶')), cx + bw / 2 + 6, btnY, bw, 40, true, pulse);
  } else if (u.state === 'victory') {
    let y = py + (compact ? 30 : 40);
    drawText(ctx, isZh ? '通关！海岸传奇骑手' : 'Coastal legend!', cx, y, compact ? 24 : 32, '#ffe66d', 'center', '#141b2d');
    y += compact ? 30 : 40;
    wrapLines(ctx, isZh ? '鹈鹕船长带着满满一喉囊的鲜鱼骑到了灯塔！' : 'Captain Pelican reached the last lighthouse with a pouch full of fresh fish!', 15, pw - 32).slice(0, 2)
      .forEach((t, i) => drawText(ctx, t, cx, y + i * 20, 15, '#ffffff', 'center', undefined, 600));
    y += compact ? 52 : 60;
    let got = 0;
    const n = LEVELS.length, gap = Math.min(120, (pw - 24) / n);
    for (let i = 0; i < n; i++) {
      const m = u.bests[i]?.medals ?? 0;
      for (let b = 0; b < 3; b++) if (m & (1 << b)) got++;
      const x = cx + (i - (n - 1) / 2) * gap;
      drawText(ctx, String(i + 1), x, y - 22, 15, 'rgba(255,255,255,0.8)', 'center');
      medalRow(ctx, m, x, y, compact ? 9 : 12, compact ? 21 : 28);
    }
    y += compact ? 34 : 44;
    drawText(ctx, isZh ? `奖章 ${got}/${n * 3}  ·  总分 ${u.score}  ·  最高 ${u.hiScore}` : `Medals ${got}/${n * 3}  ·  Score ${u.score}  ·  Best ${u.hiScore}`, cx, y, compact ? 14 : 17, '#7ae582', 'center');
    y += 24;
    if (got < n * 3) drawText(ctx, isZh ? '回到选关，把奖章集齐吧！' : 'Go back and collect every medal!', cx, y, 14, '#9fe6ff', 'center', undefined, 600);
    button(ctx, hits, 'menu', u.touch ? (isZh ? '回到选关 ▶' : 'Stage select ▶') : (isZh ? 'Enter 回到选关 ▶' : 'Enter · stage select ▶'), cx, py + ph - (compact ? 28 : 36), Math.min(280, pw - 40), 40, true, pulse);
  }
  return hits;
}
