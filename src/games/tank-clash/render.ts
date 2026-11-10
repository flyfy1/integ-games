import { baseHp, computeSightPath, DASH_COOLDOWN, DUEL_WIN_TARGET, enemiesLeft, type ArenaState } from './engine';
import { t, type Key, type Lang } from './i18n';
import {
  ARENA_H,
  ARENA_W,
  ARENA_X,
  ARENA_Y,
  CHASSIS_SPECS,
  COLS,
  HEIGHT,
  POWERUP_INFO,
  ROWS,
  TILE,
  WIDTH
} from './maps';
import type { ChassisId, GameMode, Tank, TeamSetup } from './types';

/**
 * Two HUD arrangements share one arena renderer:
 *  - `wide`    1280x720, player panels left and right of the board (desktop / big landscape screens);
 *  - `compact` the board spans the full width with big-type strips above and below (phones).
 * `ui` scales in-arena labels so they stay legible when the whole canvas is shrunk onto a phone.
 */
export interface HudLayout {
  kind: 'wide' | 'compact';
  width: number;
  height: number;
  arenaX: number;
  arenaY: number;
  ui: number;
}

export const WIDE_LAYOUT: HudLayout = { kind: 'wide', width: WIDTH, height: HEIGHT, arenaX: ARENA_X, arenaY: ARENA_Y, ui: 1.25 };
const COMPACT_TOP = 104;
const COMPACT_BOTTOM = 104;
export const COMPACT_LAYOUT: HudLayout = {
  kind: 'compact',
  width: ARENA_W + 16,
  height: COMPACT_TOP + ARENA_H + 8 + COMPACT_BOTTOM + 6,
  arenaX: 8,
  arenaY: COMPACT_TOP,
  ui: 2.1
};

export interface SceneOptions {
  layout: HudLayout;
  reducedMotion: boolean;
  best: number;
  /** One-line control reminder shown under the board in the wide layout. */
  hint: string;
}

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

function drawRoundedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 1.5
): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lineWidth;
    g.stroke();
  }
}

export function drawTankModel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  chassis: ChassisId,
  bodyColor: string,
  accentColor: string,
  recoil = 0,
  treadPhase = 0,
  scale = 1
): void {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.rotate(angle);

  // Caterpillar treads
  g.fillStyle = '#1b2234';
  g.strokeStyle = '#0b101d';
  g.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    const ty = side * 12 - 4;
    g.beginPath();
    g.roundRect(-16, ty, 32, 8, 3);
    g.fill();
    g.stroke();
    // Tread cleats
    g.fillStyle = '#475569';
    const offset = Math.floor(treadPhase) % 6;
    for (let tx = -13 + offset; tx <= 12; tx += 6) {
      g.fillRect(tx, ty + 1, 2.5, 6);
    }
    g.fillStyle = '#1b2234';
  }

  // Main hull
  const hullW = chassis === 'titan' ? 30 : chassis === 'phantom' ? 28 : 28;
  const hullH = chassis === 'titan' ? 24 : chassis === 'phantom' ? 18 : 21;
  drawRoundedRect(g, -hullW / 2, -hullH / 2, hullW, hullH, 5, bodyColor, '#090d18', 2);

  // Armor bevel highlight
  drawRoundedRect(g, -hullW / 2 + 3, -hullH / 2 + 3, hullW - 6, hullH - 6, 3, '#0f172a55', accentColor, 1.2);

  // Turret & Barrel(s) with recoil
  const rx = -recoil;
  g.fillStyle = accentColor;
  g.strokeStyle = '#090d18';
  g.lineWidth = 1.6;

  if (chassis === 'phantom') {
    // Twin rapid barrels
    for (const by of [-4.5, 2.0]) {
      g.beginPath();
      g.roundRect(4 + rx, by, 17, 3.2, 1.5);
      g.fill();
      g.stroke();
    }
  } else if (chassis === 'titan') {
    // Heavy siege mortar barrel
    g.beginPath();
    g.roundRect(2 + rx, -4.5, 19, 9, 2.5);
    g.fill();
    g.stroke();
    g.fillStyle = bodyColor;
    g.fillRect(16 + rx, -5.5, 5, 11);
  } else if (chassis === 'prism') {
    // Crystal rail barrel
    g.beginPath();
    g.roundRect(3 + rx, -2.5, 20, 5, 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(21 + rx, 0, 2.6, 0, Math.PI * 2);
    g.fill();
  } else {
    // Classic Vanguard cannon
    g.beginPath();
    g.roundRect(3 + rx, -3, 18, 6, 2);
    g.fill();
    g.stroke();
  }

  // Turret dome
  g.beginPath();
  g.arc(rx * 0.4, 0, chassis === 'titan' ? 9 : 7.5, 0, Math.PI * 2);
  g.fillStyle = accentColor;
  g.fill();
  g.stroke();

  g.restore();
}

function drawTileFloor(g: CanvasRenderingContext2D, state: ArenaState, time: number): void {
  // Base arena floor
  drawRoundedRect(g, 0, 0, ARENA_W, ARENA_H, 8, '#0c1322', '#263554', 2);

  // Subtle tactical grid
  g.strokeStyle = '#16213a';
  g.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    g.beginPath();
    g.moveTo(c * TILE, 0);
    g.lineTo(c * TILE, ARENA_H);
    g.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    g.beginPath();
    g.moveTo(0, r * TILE);
    g.lineTo(ARENA_W, r * TILE);
    g.stroke();
  }

  // Pass 1: Floor & Solid tiles (Water, Ice, Portal, Brick, Steel, Barrel, Base)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];
      if (cell.kind === 'empty' || cell.kind === 'bush') continue;
      const x = c * TILE;
      const y = r * TILE;

      if (cell.kind === 'water') {
        g.fillStyle = '#09386b';
        g.fillRect(x, y, TILE, TILE);
        g.strokeStyle = '#38bdf866';
        g.lineWidth = 2;
        const wave = Math.sin(time * 3 + c * 0.8 + r) * 3;
        for (const wy of [12, 24, 36]) {
          g.beginPath();
          g.moveTo(x + 6, y + wy + wave);
          g.lineTo(x + TILE - 6, y + wy - wave);
          g.stroke();
        }
      } else if (cell.kind === 'ice') {
        g.fillStyle = '#67e8f92e';
        g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        g.strokeStyle = '#a5f3fc66';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x + 8, y + TILE - 10);
        g.lineTo(x + TILE - 10, y + 8);
        g.moveTo(x + 18, y + TILE - 8);
        g.lineTo(x + TILE - 8, y + 18);
        g.stroke();
      } else if (cell.kind === 'portal') {
        const cx = x + TILE / 2;
        const cy = y + TILE / 2;
        const isBlue = cell.portalId === 1;
        const ringColor = isBlue ? '#38bdf8' : '#fb923c';
        g.save();
        g.translate(cx, cy);
        g.rotate(time * (isBlue ? 2.5 : -2.5));
        g.strokeStyle = ringColor;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 17, 0, Math.PI * 1.4);
        g.stroke();
        g.beginPath();
        g.arc(0, 0, 11, Math.PI * 0.5, Math.PI * 1.9);
        g.stroke();
        g.fillStyle = isBlue ? '#0284c788' : '#ea580c88';
        g.beginPath();
        g.arc(0, 0, 8, 0, Math.PI * 2);
        g.fill();
        g.restore();
      } else if (cell.kind === 'brick') {
        drawRoundedRect(g, x + 2, y + 2, TILE - 4, TILE - 4, 4, '#b85435', '#6e2c18', 1.5);
        g.fillStyle = '#d97757';
        g.fillRect(x + 5, y + 5, TILE / 2 - 6, TILE / 2 - 6);
        g.fillRect(x + TILE / 2 + 1, y + 5, TILE / 2 - 6, TILE / 2 - 6);
        g.fillRect(x + 5, y + TILE / 2 + 1, TILE - 10, TILE / 2 - 6);
        if (cell.hp < cell.maxHp) {
          g.strokeStyle = '#1e100a';
          g.lineWidth = 2.2;
          g.beginPath();
          g.moveTo(x + 8, y + 8);
          g.lineTo(x + 24, y + 22);
          g.lineTo(x + 16, y + 38);
          g.moveTo(x + 24, y + 22);
          g.lineTo(x + 38, y + 30);
          g.stroke();
        }
      } else if (cell.kind === 'steel') {
        drawRoundedRect(g, x + 2, y + 2, TILE - 4, TILE - 4, 5, '#64748b', '#cbd5e1', 1.5);
        drawRoundedRect(g, x + 8, y + 8, TILE - 16, TILE - 16, 3, '#94a3b8', '#334155', 1.2);
        g.fillStyle = '#e2e8f0';
        for (const [rx, ry] of [
          [6, 6],
          [TILE - 8, 6],
          [6, TILE - 8],
          [TILE - 8, TILE - 8]
        ]) {
          g.fillRect(x + rx, y + ry, 2.5, 2.5);
        }
        if (cell.hp < cell.maxHp) {
          g.strokeStyle = '#0f172a';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x + 10, y + 12);
          g.lineTo(x + TILE - 10, y + TILE - 12);
          g.stroke();
        }
      } else if (cell.kind === 'barrel') {
        const cx = x + TILE / 2;
        const cy = y + TILE / 2;
        drawRoundedRect(g, x + 7, y + 5, TILE - 14, TILE - 10, 8, '#dc2626', '#fca5a5', 1.5);
        g.fillStyle = '#fbbf24';
        g.fillRect(x + 9, cy - 5, TILE - 18, 10);
        g.fillStyle = '#111827';
        g.font = '900 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('TNT', cx, cy + 0.5);
      } else if (cell.kind === 'base') {
        // Only draw the unified 2-tile Eagle Core once on col 9
        if (c === 9) {
          const bx = x + 3;
          const by = y + 3;
          const bw = TILE * 2 - 6;
          const bh = TILE - 6;
          drawRoundedRect(
            g,
            bx,
            by,
            bw,
            bh,
            8,
            state.baseAlive ? '#1e293b' : '#3f1d28',
            state.baseAlive ? '#fbbf24' : '#ef4444',
            2.2
          );
          g.font = '26px system-ui, "Apple Color Emoji", sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(state.baseAlive ? '🦅' : '💥', x + TILE, y + TILE / 2 + 1);
        }
      }
    }
  }
}

function drawBushes(g: CanvasRenderingContext2D, state: ArenaState, time: number): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.grid[r][c].kind !== 'bush') continue;
      const x = c * TILE;
      const y = r * TILE;
      const sway = Math.sin(time * 2.5 + c + r) * 1.4;
      g.save();
      g.globalAlpha = 0.86;
      g.fillStyle = '#15803d';
      for (const [ox, oy, rad] of [
        [13, 14, 11],
        [33, 14, 11],
        [14, 32, 11],
        [32, 32, 11],
        [23, 23, 13]
      ]) {
        g.beginPath();
        g.arc(x + ox + sway, y + oy, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#4ade80';
      for (const [ox, oy, rad] of [
        [15, 13, 6],
        [31, 15, 6],
        [23, 22, 7],
        [16, 30, 6],
        [30, 30, 6]
      ]) {
        g.beginPath();
        g.arc(x + ox + sway, y + oy, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }
}

function drawArenaEntities(g: CanvasRenderingContext2D, state: ArenaState, time: number, lang: Lang, ui: number): void {
  // Enemy drop-in markers
  for (const warn of state.spawnWarnings) {
    const cx = (warn.col + 0.5) * TILE;
    const cy = TILE / 2;
    const boss = warn.archetype === 'boss-behemoth' || warn.archetype === 'boss-omega';
    const pulse = 0.5 + 0.5 * Math.sin(time * 18);
    g.save();
    g.translate(cx, cy);
    g.rotate(time * 3);
    g.strokeStyle = boss ? '#c084fc' : '#ff6b81';
    g.globalAlpha = 0.45 + pulse * 0.55;
    g.lineWidth = 3.5;
    const rad = (boss ? 22 : 16) * (0.7 + pulse * 0.3);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const rr = i % 2 === 0 ? rad : rad * 0.45;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.stroke();
    g.restore();
  }

  // Landmines
  for (const mine of state.mines) {
    const blink = Math.sin(time * 10) > 0;
    g.save();
    g.translate(mine.x, mine.y);
    g.fillStyle = '#1f2937';
    g.strokeStyle = mine.team === 1 ? '#36d6ff' : '#ff6b6b';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = blink ? '#ef4444' : '#fbbf24';
    g.beginPath();
    g.arc(0, 0, 3.8, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // PowerUp crates
  for (const item of state.powerUps) {
    const info = POWERUP_INFO[item.kind];
    const scale = 1 + Math.sin(item.pulse) * 0.08;
    g.save();
    g.translate(item.x, item.y);
    g.scale(scale, scale);
    drawRoundedRect(g, -16, -16, 32, 32, 8, '#0f172ae6', info.color, 2.2);
    g.font = '18px system-ui, "Apple Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(info.icon, 0, -2);
    g.font = '900 9px system-ui, sans-serif';
    g.fillStyle = info.color;
    g.fillText(info.badge, 0, 11);
    g.restore();
  }

  // Laser sight paths for Rail Sniper (prism) or Laser tanks
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const spec = CHASSIS_SPECS[tank.chassis];
    if (tank.team !== 3 && (spec.laserSight || tank.weapon === 'laser')) {
      const pts = computeSightPath(state, tank);
      if (pts.length >= 2) {
        g.save();
        g.strokeStyle = tank.playerIndex === 0 ? '#36d6ff88' : '#ff9f4388';
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
        g.restore();
      }
    }
  }

  // Tanks
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const spec = CHASSIS_SPECS[tank.chassis];
    let bodyColor = spec.colorPrimary;
    let accentColor = spec.colorAccent;
    if (tank.playerIndex === 0) {
      bodyColor = '#2dd4bf';
      accentColor = '#fde047';
    } else if (tank.playerIndex === 1) {
      bodyColor = '#fb7185';
      accentColor = '#fdba74';
    } else if (tank.isCargo) {
      bodyColor = Math.sin(time * 10) > 0 ? '#f43f5e' : '#f59e0b';
      accentColor = '#fef08a';
    } else if (tank.isBoss) {
      bodyColor = '#9333ea';
      accentColor = '#f43f5e';
    } else {
      bodyColor = '#64748b';
      accentColor = '#f87171';
    }

    if (tank.hitFlash > 0) {
      bodyColor = '#ffffff';
      accentColor = '#ffffff';
    }
    if (tank.team === 3 && tank.spawnProtected > 0) {
      // Fresh arrivals are briefly shielded so the drop zones cannot be camped.
      g.save();
      g.strokeStyle = '#fda4af';
      g.globalAlpha = 0.4 + 0.4 * Math.sin(time * 20);
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(tank.x, tank.y, tank.radius + 5, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    // Respawn / dash protection blinks so it is obvious the tank cannot be hurt yet.
    const ghost = tank.spawnProtected > 0 && tank.playerIndex !== undefined && Math.sin(time * 26) > 0.2;
    if (ghost) g.globalAlpha = 0.55;
    if (tank.isBoss && tank.bossCharging) {
      g.save();
      g.strokeStyle = '#ff4d8d';
      g.lineWidth = 4;
      g.globalAlpha = 0.5 + 0.5 * Math.sin(time * 30);
      g.beginPath();
      g.arc(tank.x, tank.y, tank.radius + 12, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    drawTankModel(
      g,
      tank.x,
      tank.y,
      tank.turretAngle,
      tank.chassis,
      bodyColor,
      accentColor,
      tank.recoil,
      tank.treadPhase,
      tank.isBoss ? 1.5 : 1
    );
    g.globalAlpha = 1;

    // Shield bubble
    if (tank.shieldTimer > 0) {
      g.save();
      g.strokeStyle = '#38bdf8';
      g.fillStyle = '#38bdf822';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(tank.x, tank.y, tank.radius + 6 + Math.sin(time * 8) * 1.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }

    // Freeze overlay
    if (tank.freezeTimer > 0) {
      drawRoundedRect(g, tank.x - 18, tank.y - 18, 36, 36, 6, '#67e8f955', '#22d3ee', 2);
    }

    // Overhead HP bar & tag (one-hit enemies need no bar)
    const barW = tank.isBoss ? 54 : 34;
    const barH = ui > 1.5 ? 6 : 4;
    const barX = tank.x - barW / 2;
    const barY = tank.y - tank.radius - 9 - barH;
    if (tank.maxHp > 1 && !tank.isBoss) {
      g.fillStyle = '#090d18cc';
      g.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      g.fillStyle = tank.team === 3 ? '#f43f5e' : tank.playerIndex === 0 ? '#2dd4bf' : '#fb923c';
      g.fillRect(barX, barY, Math.max(0, (barW * tank.hp) / tank.maxHp), barH);
    }

    if (tank.playerIndex !== undefined) {
      const label = tank.playerIndex === 0 ? '1P' : tank.isAi ? t(lang, 'hud.ai') : '2P';
      const size = Math.round(11 * ui);
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.lineWidth = 4;
      g.strokeStyle = '#070b14';
      g.strokeText(label, tank.x, barY - 5);
      g.fillStyle = tank.playerIndex === 0 ? '#5eead4' : '#fda4af';
      g.fillText(label, tank.x, barY - 5);
    }
  }

  // Bullets
  for (const b of state.bullets) {
    if (b.trail.length > 1) {
      g.save();
      g.strokeStyle = b.color;
      g.globalAlpha = 0.45;
      g.lineWidth = b.radius * 1.1;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) g.lineTo(b.trail[i].x, b.trail[i].y);
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#ffffff';
    g.strokeStyle = b.color;
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // Shockwaves
  for (const sw of state.shockwaves) {
    g.save();
    g.globalAlpha = Math.max(0, sw.life / sw.maxLife);
    g.strokeStyle = sw.color;
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // Particles
  for (const p of state.particles) {
    g.save();
    g.globalAlpha = Math.max(0, p.life / p.maxLife);
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Floating combat texts
  for (const ft of state.floatingTexts) {
    g.save();
    g.globalAlpha = Math.min(1, ft.life * 1.4);
    g.font = `900 ${Math.round(13 * ui)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const text = ft.key ? t(lang, ft.text as Key, { n: ft.n ?? 0 }) : ft.text;
    const fx = Math.max(60, Math.min(ARENA_W - 60, ft.x));
    const fy = Math.max(16 * ui, ft.y);
    g.lineWidth = 4;
    g.strokeStyle = '#070b14';
    g.strokeText(text, fx, fy);
    g.fillStyle = ft.color;
    g.fillText(text, fx, fy);
    g.restore();
  }
}

function label(
  g: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  weight = 800,
  maxWidth?: number
): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  if (maxWidth) g.fillText(str, x, y, maxWidth);
  else g.fillText(str, x, y);
}

function playerAccent(playerIndex: 0 | 1): string {
  return playerIndex === 0 ? '#2dd4bf' : '#fb7185';
}

function playerTitle(tank: Tank | undefined, playerIndex: 0 | 1, lang: Lang): string {
  if (playerIndex === 0) return '1P';
  return tank?.isAi ? t(lang, 'hud.ai') : '2P';
}

function drawPips(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  max: number,
  color: string
): void {
  if (max > 10) {
    // Too many segments to read at a glance: show one solid bar instead.
    drawRoundedRect(g, x, y, w, h, Math.min(5, h / 2), '#1e293b', '#0b1120', 1);
    if (value > 0) drawRoundedRect(g, x, y, Math.max(h, (w * value) / max), h, Math.min(5, h / 2), color);
    return;
  }
  const gap = 4;
  const pipW = (w - gap * (max - 1)) / max;
  for (let i = 0; i < max; i++) {
    drawRoundedRect(g, x + i * (pipW + gap), y, pipW, h, Math.min(4, pipW / 2), i < value ? color : '#1e293b', '#0b1120', 1);
  }
}

function hpColor(tank: Tank, accent: string, time: number): string {
  if (tank.hp <= Math.max(1, Math.ceil(tank.maxHp * 0.25))) return Math.sin(time * 10) > 0 ? '#ef4444' : '#fca5a5';
  return accent;
}

function drawDashMeter(g: CanvasRenderingContext2D, tank: Tank, x: number, y: number, w: number, h: number): void {
  const ready = tank.dashCooldown <= 0;
  const ratio = ready ? 1 : 1 - Math.min(1, tank.dashCooldown / DASH_COOLDOWN);
  drawRoundedRect(g, x, y, w, h, h / 2, '#0b1120', '#263554', 1);
  if (ratio > 0.04) drawRoundedRect(g, x, y, w * ratio, h, h / 2, ready ? '#a78bfa' : '#4c3f8a');
}

function drawPlayerSidebar(
  g: CanvasRenderingContext2D,
  state: ArenaState,
  playerIndex: 0 | 1,
  x: number,
  y: number,
  w: number,
  h: number,
  lang: Lang,
  time: number,
  best: number
): void {
  const tank = state.tanks.find((tk) => tk.playerIndex === playerIndex);
  const accent = playerAccent(playerIndex);
  drawRoundedRect(g, x, y, w, h, 14, '#111a2ee6', `${accent}66`, 1.8);
  const cx = x + w / 2;
  const inner = w - 24;

  if (!tank) {
    // Solo run: use the spare panel for the scoreboard.
    label(g, t(lang, 'hud.solo'), cx, y + 34, 22, '#94a3b8', 'center', 900, inner);
    label(g, t(lang, 'hud.score'), cx, y + 96, 19, '#94a3b8', 'center', 700, inner);
    label(g, `${state.score}`, cx, y + 128, 30, '#ffffff', 'center', 900, inner);
    label(g, t(lang, 'hud.best'), cx, y + 186, 19, '#94a3b8', 'center', 700, inner);
    label(g, `${Math.max(best, state.score)}`, cx, y + 216, 26, '#ffd15c', 'center', 900, inner);
    label(g, t(lang, 'hud.kills'), cx, y + 274, 19, '#94a3b8', 'center', 700, inner);
    label(g, `${state.stageKills} / ${state.totalEnemies}`, cx, y + 304, 26, '#ff9f43', 'center', 900, inner);
    return;
  }

  label(g, playerTitle(tank, playerIndex, lang), cx, y + 30, 26, accent, 'center', 900, inner);
  drawRoundedRect(g, x + 14, y + 52, w - 28, 66, 10, '#0b1120', '#1e293b', 1.2);
  drawTankModel(g, cx, y + 85, -Math.PI / 2, tank.chassis, accent, playerIndex === 0 ? '#fde047' : '#fdba74', 0, 0, 1.2);
  label(g, t(lang, `chassis.${tank.chassis}` as Key), cx, y + 138, 20, '#f8fafc', 'center', 800, inner);

  // Armour
  const alive = tank.alive ? tank.hp : 0;
  drawPips(g, x + 14, y + 158, w - 28, 16, alive, tank.maxHp, hpColor(tank, accent, time));
  label(g, `HP ${alive}/${tank.maxHp}`, cx, y + 192, 19, '#cbd5e1', 'center', 700, inner);

  // Lives or round wins
  if (state.mode === 'coop') {
    label(g, `${t(lang, 'hud.lives')} × ${tank.lives}`, cx, y + 228, 20, tank.lives === 0 ? '#f87171' : '#70f0c2', 'center', 800, inner);
  } else {
    const wins = playerIndex === 0 ? state.p1Wins : state.p2Wins;
    label(g, `${'★'.repeat(wins)}${'☆'.repeat(Math.max(0, DUEL_WIN_TARGET - wins))}`, cx, y + 228, 22, '#ffd15c', 'center', 800, inner);
  }

  label(g, `${t(lang, 'hud.mines')} × ${tank.mines}`, cx, y + 262, 20, '#feca57', 'center', 800, inner);

  label(g, t(lang, 'hud.dash'), cx, y + 298, 19, tank.dashCooldown <= 0 ? '#c4b5fd' : '#64748b', 'center', 800, inner);
  drawDashMeter(g, tank, x + 18, y + 314, w - 36, 12);

  // Active weapon
  drawRoundedRect(g, x + 12, y + 344, w - 24, 64, 10, '#0b1120', '#1e293b', 1.2);
  if (tank.weapon) {
    const info = POWERUP_INFO[tank.weapon];
    label(g, `${info.icon} ${info.badge}`, cx, y + 366, 20, info.color, 'center', 900, inner - 8);
    const ratio = Math.max(0, Math.min(1, tank.weaponTimer / 12));
    drawRoundedRect(g, x + 22, y + 388, (w - 44) * ratio, 9, 4, info.color);
  } else {
    label(g, t(lang, 'hud.cannon'), cx, y + 376, 19, '#64748b', 'center', 700, inner - 8);
  }

  label(g, t(lang, 'hud.score'), cx, y + h - 112, 19, '#94a3b8', 'center', 700, inner);
  label(g, `${tank.score}`, cx, y + h - 82, 28, '#ffffff', 'center', 900, inner);
  label(g, `${t(lang, 'hud.kills')} ${tank.kills}`, cx, y + h - 40, 19, '#cbd5e1', 'center', 700, inner);
}

function stageTitle(state: ArenaState, lang: Lang): string {
  return state.mode === 'coop'
    ? t(lang, `stage.coop.${state.stageIndex % 6}` as Key)
    : t(lang, `stage.duel.${state.stageIndex % 5}` as Key);
}

function baseStatus(state: ArenaState, lang: Lang, time: number): { text: string; color: string } {
  if (!state.baseAlive) return { text: t(lang, 'hud.baseDestroyed'), color: '#ef4444' };
  if (state.baseFlash > 0) return { text: t(lang, 'hud.baseHit'), color: Math.sin(time * 24) > 0 ? '#ff4757' : '#ffd15c' };
  if (state.baseFortifyTimer > 0) {
    return { text: t(lang, 'hud.baseFortified', { s: Math.ceil(state.baseFortifyTimer) }), color: '#38bdf8' };
  }
  const hp = baseHp(state);
  return { text: t(lang, 'hud.baseOk', { hp }), color: hp <= 2 ? '#f87171' : '#70f0c2' };
}

function drawWideHud(g: CanvasRenderingContext2D, state: ArenaState, lang: Lang, time: number, opts: SceneOptions): void {
  drawRoundedRect(g, ARENA_X, 10, ARENA_W, 58, 12, '#111a2ee6', '#263554', 1.5);
  const loopTag = state.loop > 0 ? `  ★${state.loop}` : '';
  label(g, stageTitle(state, lang) + loopTag, ARENA_X + 18, 40, 23, '#f8fafc', 'left', 900, 360);

  if (state.mode === 'coop') {
    label(g, t(lang, 'hud.enemies', { n: enemiesLeft(state) }), WIDTH / 2 + 60, 40, 21, '#ff9f43', 'center', 800, 220);
    const base = baseStatus(state, lang, time);
    label(g, `🦅 ${base.text}`, ARENA_X + ARENA_W - 18, 40, 21, base.color, 'right', 800, 290);
  } else {
    label(g, `1P  ${state.p1Wins} : ${state.p2Wins}  ${state.teamSetup === '1p-ai' ? t(lang, 'hud.ai') : '2P'}`, WIDTH / 2 + 60, 40, 24, '#ffd15c', 'center', 900, 240);
    label(g, t(lang, 'hud.round', { n: state.roundNumber }), ARENA_X + ARENA_W - 18, 40, 20, state.suddenDeath ? '#ff5252' : '#70f0c2', 'right', 800, 290);
  }

  drawPlayerSidebar(g, state, 0, 14, ARENA_Y, 152, ARENA_H, lang, time, opts.best);
  drawPlayerSidebar(g, state, 1, ARENA_X + ARENA_W + 14, ARENA_Y, 152, ARENA_H, lang, time, opts.best);
  if (opts.hint) label(g, opts.hint, WIDTH / 2, ARENA_Y + ARENA_H + 23, 19, '#a8b1c5', 'center', 600, WIDTH - 40);
}

function drawCompactPlayer(
  g: CanvasRenderingContext2D,
  state: ArenaState,
  tank: Tank,
  x: number,
  y: number,
  w: number,
  lang: Lang,
  time: number
): void {
  const playerIndex = tank.playerIndex ?? 0;
  const accent = playerAccent(playerIndex);
  drawRoundedRect(g, x, y, w, COMPACT_BOTTOM - 4, 14, '#111a2ee6', `${accent}88`, 2);
  const row1 = y + 30;
  const row2 = y + 73;
  label(g, playerTitle(tank, playerIndex, lang), x + 14, row1, 34, accent, 'left', 900, 78);
  const alive = tank.alive ? tank.hp : 0;
  const tail = state.mode === 'coop' ? `♥×${tank.lives}` : `★${playerIndex === 0 ? state.p1Wins : state.p2Wins}`;
  drawPips(g, x + 98, row1 - 13, w - 98 - 122, 26, alive, tank.maxHp, hpColor(tank, accent, time));
  label(g, tail, x + w - 14, row1, 34, state.mode === 'coop' ? (tank.lives === 0 ? '#f87171' : '#70f0c2') : '#ffd15c', 'right', 900, 104);

  label(g, `💣${tank.mines}`, x + 14, row2, 32, '#feca57', 'left', 800, 84);
  drawDashMeter(g, tank, x + 104, row2 - 9, 96, 18);
  if (tank.weapon) {
    const info = POWERUP_INFO[tank.weapon];
    const ratio = Math.max(0, Math.min(1, tank.weaponTimer / 12));
    label(g, `${info.icon}${info.badge}`, x + 214, row2, 30, info.color, 'left', 900, w - 214 - 100);
    drawRoundedRect(g, x + w - 92, row2 - 7, 78 * ratio, 14, 7, info.color);
  } else {
    label(g, `${tank.score}`, x + w - 14, row2, 32, '#ffffff', 'right', 900, w - 230);
  }
}

function drawCompactHud(g: CanvasRenderingContext2D, state: ArenaState, lang: Lang, time: number, opts: SceneOptions): void {
  const W = opts.layout.width;
  const row1 = 28;
  const row2 = 76;
  label(g, stageTitle(state, lang) + (state.loop > 0 ? ` ★${state.loop}` : ''), 12, row1, 34, '#f8fafc', 'left', 900, W - 250);
  label(g, `${state.score}`, W - 12, row1, 36, '#ffd15c', 'right', 900, 220);
  if (state.mode === 'coop') {
    label(g, t(lang, 'hud.enemies', { n: enemiesLeft(state) }), 12, row2, 34, '#ff9f43', 'left', 800, 380);
    const base = baseStatus(state, lang, time);
    label(g, `🦅 ${base.text}`, W - 12, row2, 34, base.color, 'right', 800, W - 420);
  } else {
    label(g, `1P ${state.p1Wins} : ${state.p2Wins} ${state.teamSetup === '1p-ai' ? t(lang, 'hud.ai') : '2P'}`, 12, row2, 36, '#ffd15c', 'left', 900, 360);
    label(g, t(lang, 'hud.round', { n: state.roundNumber }), W - 12, row2, 32, state.suddenDeath ? '#ff5252' : '#70f0c2', 'right', 800, W - 400);
  }

  const y = opts.layout.arenaY + ARENA_H + 8;
  const players = state.tanks.filter((tk) => tk.playerIndex !== undefined);
  if (players.length === 1) {
    drawCompactPlayer(g, state, players[0], 8, y, W - 16, lang, time);
  } else {
    const half = (W - 24) / 2;
    players.forEach((tk, i) => drawCompactPlayer(g, state, tk, 8 + i * (half + 8), y, half, lang, time));
  }
}

function drawArenaOverlays(g: CanvasRenderingContext2D, state: ArenaState, time: number, lang: Lang, ui: number): void {
  // Eagle armour pips right on the base, so the thing you defend shows its own health.
  if (state.mode === 'coop' && state.baseAlive) {
    const hp = baseHp(state);
    const bx = 9 * TILE + 8;
    const by = 12 * TILE + TILE - 11;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i < hp ? (hp <= 2 ? '#f87171' : '#fbbf24') : '#334155';
      g.fillRect(bx + i * 13, by, 10, 5);
    }
    const danger = state.baseFlash > 0 || hp <= 2;
    if (danger) {
      const pulse = state.baseFlash > 0 ? 0.5 + 0.5 * Math.sin(time * 26) : 0.35 + 0.35 * Math.sin(time * 6);
      g.save();
      g.strokeStyle = '#ff4757';
      g.globalAlpha = pulse;
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(8 * TILE - 4, 11 * TILE - 4, TILE * 4 + 8, TILE * 2 + 6, 10);
      g.stroke();
      g.restore();
    }
  }
  // "Base under fire" frame around the board (a border, never a full-screen flash).
  if (state.baseFlash > 0) {
    g.save();
    g.strokeStyle = '#ff4757';
    g.globalAlpha = Math.min(1, state.baseFlash);
    g.lineWidth = 6;
    g.beginPath();
    g.roundRect(3, 3, ARENA_W - 6, ARENA_H - 6, 8);
    g.stroke();
    g.restore();
  }

  // Boss health bar
  const boss = state.tanks.find((tk) => tk.alive && tk.isBoss);
  if (boss) {
    const bw = 440;
    const bx = (ARENA_W - bw) / 2;
    const by = Math.round(14 * ui) + 8;
    drawRoundedRect(g, bx - 4, by - 4, bw + 8, 22, 8, '#090d18dd', '#c084fc', 2);
    drawRoundedRect(g, bx, by, Math.max(4, (bw * boss.hp) / boss.maxHp), 14, 5, boss.hp <= boss.maxHp / 2 ? '#f43f5e' : '#c084fc');
    g.font = `900 ${Math.round(12 * ui)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineWidth = 4;
    g.strokeStyle = '#070b14';
    const name = t(lang, boss.archetype === 'boss-omega' ? 'boss.omega' : 'boss.behemoth');
    g.strokeText(name, ARENA_W / 2, by - 9);
    g.fillStyle = '#f5d0fe';
    g.fillText(name, ARENA_W / 2, by - 9);
  }

  // "That one is you" marker for the first seconds of a round.
  if (state.outcome === 'none' && state.roundTimer < 3.2) {
    for (const tank of state.tanks) {
      if (!tank.alive || tank.playerIndex === undefined || tank.isAi) continue;
      const bob = Math.sin(time * 8) * 4;
      const ty = tank.y - tank.radius - 20 * ui - 6 + bob;
      const accent = playerAccent(tank.playerIndex);
      g.save();
      g.globalAlpha = Math.min(1, (3.2 - state.roundTimer) * 2);
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(tank.x - 9 * ui, ty);
      g.lineTo(tank.x + 9 * ui, ty);
      g.lineTo(tank.x, ty + 11 * ui);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}

export function drawArenaScene(
  g: CanvasRenderingContext2D,
  state: ArenaState,
  time: number,
  lang: Lang,
  opts: SceneOptions
): void {
  const layout = opts.layout;
  g.fillStyle = '#070b14';
  g.fillRect(0, 0, layout.width, layout.height);

  if (layout.kind === 'wide') drawWideHud(g, state, lang, time, opts);
  else drawCompactHud(g, state, lang, time, opts);

  // Camera shake stays inside the arena and is skipped entirely for reduced motion.
  const shake = opts.reducedMotion ? 0 : Math.min(8, state.screenShake);
  const shakeX = shake > 0 ? Math.sin(time * 60) * shake : 0;
  const shakeY = shake > 0 ? Math.cos(time * 52) * shake : 0;

  g.save();
  g.translate(layout.arenaX + shakeX, layout.arenaY + shakeY);
  drawTileFloor(g, state, time);
  drawArenaEntities(g, state, time, lang, layout.ui);
  drawBushes(g, state, time);
  drawArenaOverlays(g, state, time, lang, layout.ui);
  g.restore();

  // Transient announcements (stage start, boss warning, overdrive). Results use the DOM panel instead.
  if (state.bannerKey && state.bannerTimer > 0 && state.outcome === 'none') {
    const size = Math.round(24 * layout.ui);
    const text = t(lang, state.bannerKey as Key, { n: state.bannerParam });
    g.font = `900 ${size}px ${FONT}`;
    const bw = Math.min(layout.width - 24, Math.max(360, g.measureText(text).width + 64));
    const bh = size * 2.2;
    const bx = (layout.width - bw) / 2;
    const by = layout.arenaY + ARENA_H * 0.3 - bh / 2;
    g.save();
    g.globalAlpha = Math.min(1, state.bannerTimer * 3);
    const warn = state.bannerKey === 'banner.bossIncoming';
    drawRoundedRect(g, bx, by, bw, bh, 16, '#090d18eb', warn ? '#ff4d8d' : '#ffd15c', 3);
    label(g, text, layout.width / 2, by + bh / 2, size, '#ffffff', 'center', 900, bw - 28);
    g.restore();
  }
}

export interface LobbyConfig {
  mode: GameMode;
  teamSetup: TeamSetup;
  stageIndex: number;
  p1Chassis: ChassisId;
  p2Chassis: ChassisId;
}
