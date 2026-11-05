import { THEMES, STARS, CLOUDS, W, H, WATER_Y, T, PW, PH, MAXST } from './theme';
import type { Theme } from './theme';
import type { Item, Enemy, Mover, Crumble, Spring, Checkpoint, Goal } from './types';

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
  for (let x = -step; x <= W + step; x += 24) {
    const wx = x + off;
    const h = Math.sin(wx / step + seed) * amp * 0.6 + Math.cos(wx / (step * 0.55) + seed * 3) * amp * 0.4;
    ctx.lineTo(x, baseY - Math.max(0, h));
  }
  ctx.lineTo(W, WATER_Y);
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
  for (let x = 0; x <= W; x += 20) {
    const wx = x + off;
    const y = baseY - (Math.sin(wx * 0.0045) * 0.5 + 0.5) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, WATER_Y);
  ctx.closePath();
  ctx.fill();

  const span = 260, first = Math.floor(off / span) * span;
  for (let wx = first - span; wx < off + W + span; wx += span) {
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
  ctx.fillRect(0, 0, W, WATER_Y);

  if (th.night || curTheme === 1) {
    const maxY = th.night ? 310 : 140;
    for (const s of STARS) {
      if (s.y > maxY) continue;
      const a = 0.35 + 0.65 * Math.sin(gtime * s.sp + s.ph);
      ctx.fillStyle = `rgba(255,255,240,${a * (th.night ? 1 : 0.45)})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
  }

  const [sx, sy, sr] = th.sunPos;
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
    const cx = ((cl.x - camX * cl.p - gtime * 12 * cl.p) % (W + 260) + W + 260) % (W + 260) - 130;
    drawCloud(ctx, cx, cl.y, cl.s, th.cloud, th.cloudShade);
  }

  drawHills(ctx, camX, 0.14, 355, 75, 290, th.far, 1);
  drawHills(ctx, camX, 0.24, 382, 55, 210, th.far2, 2);

  const seaY = 408;
  const sg2 = ctx.createLinearGradient(0, seaY, 0, WATER_Y);
  sg2.addColorStop(0, th.sea[0]);
  sg2.addColorStop(1, th.sea[1]);
  ctx.fillStyle = sg2;
  ctx.fillRect(0, seaY, W, WATER_Y - seaY);
  ctx.fillStyle = th.seaHi;
  for (let i = 0; i < 24; i++) {
    const wy = seaY + 6 + (i * 2.6);
    const wx = ((sx + Math.sin(gtime * 2 + i * 0.9) * (18 + i * 2.2)));
    const ww = (sr * 1.1) * (1 - i / 32) + Math.sin(gtime * 3 + i) * 8;
    ctx.fillRect(wx - ww / 2, wy, ww, 2);
  }

  for (let i = 0; i < 3; i++) {
    const bx = ((i * 390 + 180 - camX * 0.28 - gtime * 8) % (W + 200) + W + 200) % (W + 200) - 100;
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
    ctx.strokeStyle = '#3b1c54'; ctx.lineWidth = 2.6;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const len = 17 + Math.sin(gtime * 5 + i + c) * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = '#5c2a7d'; circle(ctx, cx, cy, 11); ctx.fill();
    ctx.fillStyle = '#fff'; circle(ctx, cx - 4, cy - 3, 2.5); ctx.fill(); circle(ctx, cx + 4, cy - 3, 2.5); ctx.fill();
    ctx.fillStyle = '#111'; circle(ctx, cx - 4, cy - 3, 1.3); ctx.fill(); circle(ctx, cx + 4, cy - 3, 1.3); ctx.fill();
  }
}

export function drawPelican(ctx: CanvasRenderingContext2D, P: any, gtime: number) {
  if (P.inv > 0 && Math.floor(P.inv * 16) % 2 === 1) return;
  ctx.save();
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
    if (it.x < camX - 40 || it.x > camX + W + 40) continue;
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
    if (e.x < camX - 60 || e.x > camX + W + 60) continue;
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
  for (let x = 0; x <= W; x += 16) {
    const wx = x + camX;
    const wy = WATER_Y + Math.sin(wx * 0.035 + gtime * 3.5) * 4 + Math.cos(wx * 0.018 - gtime * 2.2) * 3;
    ctx.lineTo(x, wy);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = th.waterHi; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 16) {
    const wx = x + camX;
    const wy = WATER_Y + Math.sin(wx * 0.035 + gtime * 3.5) * 4 + Math.cos(wx * 0.018 - gtime * 2.2) * 3;
    if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  P: any,
  fishGot: number,
  fishTot: number,
  starGot: number,
  starTot: number,
  score: number,
  _curLv: number,
  levelName: string,
  goal: Goal | null,
  _state: string,
  bannerT: number,
  bannerStr: string,
  isZh: boolean
) {
  ctx.fillStyle = 'rgba(13,24,48,0.55)'; rrect(ctx, 14, 12, 270, 66, 12); ctx.fill();
  for (let i = 0; i < P.maxHp; i++) {
    drawText(ctx, '❤', 28 + i * 26, 31, 20, i < P.hp ? '#ff595e' : 'rgba(255,255,255,0.22)', 'left', '#141b2d');
  }
  drawText(ctx, '⚡', 114, 31, 16, '#ffe66d', 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; rrect(ctx, 134, 23, 136, 14, 7); ctx.fill();
  const stRatio = Math.min(1, Math.max(0, P.stamina / MAXST));
  ctx.fillStyle = P.turbo ? '#ff9f1c' : '#4cc9f0';
  if (stRatio > 0) { rrect(ctx, 136, 25, 132 * stRatio, 10, 5); ctx.fill(); }

  drawText(ctx, `🐟 ${fishGot}/${fishTot}`, 28, 59, 16, '#ffbf69', 'left', '#141b2d');
  drawText(ctx, `★ ${starGot}/${starTot}`, 132, 59, 16, '#ffe66d', 'left', '#141b2d');
  drawText(ctx, isZh ? `得分 ${score}` : `SCORE ${score}`, 206, 59, 15, '#ffffff', 'left', '#141b2d');

  const pw = 250, px = (W - pw) / 2, py = 20;
  ctx.fillStyle = 'rgba(13,24,48,0.5)'; rrect(ctx, px, py, pw, 12, 6); ctx.fill();
  const prog = goal ? Math.min(1, Math.max(0, P.x / goal.x)) : 0;
  ctx.fillStyle = '#7ae582'; rrect(ctx, px + 2, py + 2, (pw - 4) * prog, 8, 4); ctx.fill();
  drawText(ctx, '🚴', px + (pw - 4) * prog, py + 5, 16, '#fff', 'center');
  drawText(ctx, '🚨', px + pw + 8, py + 5, 15, '#fff', 'center');
  drawText(ctx, levelName, W / 2, py + 28, 13, 'rgba(255,255,255,0.9)', 'center', '#141b2d');

  if (bannerT > 0) {
    const a = Math.min(1, bannerT * 1.5);
    ctx.save(); ctx.globalAlpha = a;
    drawText(ctx, bannerStr, W / 2, 135, 34, '#fff', 'center', '#141b2d');
    drawText(ctx, isZh ? '吃鱼蓄力 · 展翅滑翔 · 冲向灯塔！' : 'Catch fish · Glide with wings · Reach the lighthouse!', W / 2, 172, 16, '#ffe66d', 'center', '#141b2d');
    ctx.restore();
  }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: string,
  levelName: string,
  fishGot: number,
  fishTot: number,
  starGot: number,
  starTot: number,
  lvTime: number,
  score: number,
  hiScore: number,
  gtime: number,
  isZh: boolean
) {
  if (state === 'playing') return;
  ctx.fillStyle = 'rgba(8,14,30,0.62)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(20,34,66,0.92)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
  rrect(ctx, W / 2 - 270, 74, 540, 372, 20); ctx.fill(); ctx.stroke();

  if (state === 'title') {
    drawText(ctx, '🦩 鹈鹕骑行记', W / 2, 132, 42, '#ffe66d', 'center', '#141b2d');
    drawText(ctx, 'PELICAN PEDAL · COASTAL ADVENTURE', W / 2, 174, 16, '#9fe6ff', 'center', '#141b2d');
    const tips = isZh ? [
      '◀ ▶ / A D ：蹬车前进与转向',
      'Space / W / ▲ ：跳跃、二段振翅跳、长按空中滑翔',
      'Shift / J / X ：冲刺加速（消耗羽毛体力，吃小鱼可恢复）',
      '踩扁螃蟹与海鸥，躲开紫色海胆与跃起水母，抵达灯塔！'
    ] : [
      '◀ ▶ / A D : Pedal forward and turn',
      'Space / W / ▲ : Jump, double flap, hold to glide',
      'Shift / J / X : Turbo sprint (costs stamina, eating fish restores)',
      'Stomp crabs & gulls, dodge spikes & jellyfish, reach the goal!'
    ];
    tips.forEach((t, i) => drawText(ctx, t, W / 2, 224 + i * 30, 15, '#ffffff', 'center', '#101828', 600));
    if (hiScore > 0) drawText(ctx, isZh ? `🏆 最高纪录：${hiScore}` : `🏆 High Score: ${hiScore}`, W / 2, 356, 17, '#7ae582', 'center', '#101828');
    const pulse = 1 + Math.sin(gtime * 5) * 0.04;
    ctx.save(); ctx.translate(W / 2, 404); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ff9f1c'; rrect(ctx, -120, -22, 240, 44, 22); ctx.fill();
    drawText(ctx, isZh ? '按 Enter / 空格 / 点击开始' : 'Press Enter / Space to start', 0, 1, 18, '#141b2d', 'center');
    ctx.restore();
  } else if (state === 'paused') {
    drawText(ctx, isZh ? '游戏暂停' : 'PAUSED', W / 2, 170, 36, '#ffe66d', 'center', '#141b2d');
    drawText(ctx, isZh ? '按 P / Esc 或点击继续骑行' : 'Press P / Esc to resume', W / 2, 245, 18, '#fff', 'center');
    drawText(ctx, isZh ? '按 R 键可回到最近存档点' : 'Press R to retry from checkpoint', W / 2, 285, 16, '#9fe6ff', 'center');
  } else if (state === 'levelclear') {
    drawText(ctx, isZh ? `🎉 ${levelName} 通过！` : `🎉 ${levelName} Clear!`, W / 2, 145, 32, '#7ae582', 'center', '#141b2d');
    drawText(ctx, `🐟 ${isZh ? '小鱼收集' : 'Fish'}: ${fishGot} / ${fishTot}`, W / 2, 215, 20, '#ffbf69', 'center');
    drawText(ctx, `★ ${isZh ? '隐藏金星' : 'Stars'}: ${starGot} / ${starTot}`, W / 2, 252, 20, '#ffe66d', 'center');
    drawText(ctx, isZh ? `⏱ 用时：${lvTime.toFixed(1)} 秒   当前总分：${score}` : `⏱ Time: ${lvTime.toFixed(1)}s   Score: ${score}`, W / 2, 290, 18, '#ffffff', 'center');
    drawText(ctx, isZh ? '按 Enter / 空格 / 点击进入下一关 ▶' : 'Press Enter / Space for Next Stage ▶', W / 2, 375, 20, '#9fe6ff', 'center', '#141b2d');
  } else if (state === 'victory') {
    drawText(ctx, isZh ? '🏆 恭喜通关 · 海岸传奇骑手！' : '🏆 VICTORY · COASTAL LEGEND!', W / 2, 145, 32, '#ffe66d', 'center', '#141b2d');
    drawText(ctx, isZh ? `最终总分：${score}   历史最高：${hiScore}` : `Final Score: ${score}   High Score: ${hiScore}`, W / 2, 225, 22, '#7ae582', 'center');
    drawText(ctx, isZh ? '鹈鹕船长带着满满一喉囊的鲜鱼凯旋啦！' : 'Captain Pelican returns with a pouch full of fresh fish!', W / 2, 275, 17, '#ffffff', 'center');
    drawText(ctx, isZh ? '按 Enter / 空格 / 点击再来一局' : 'Press Enter / Space to Play Again', W / 2, 370, 20, '#ff9f1c', 'center', '#141b2d');
  }
}
