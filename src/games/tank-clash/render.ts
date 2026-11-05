import { computeSightPath, DUEL_WIN_TARGET, type ArenaState } from './engine';
import { t, type Key, type Lang } from './i18n';
import {
  ARENA_H,
  ARENA_W,
  ARENA_X,
  ARENA_Y,
  CHASSIS_ORDER,
  CHASSIS_SPECS,
  COLS,
  HEIGHT,
  POWERUP_INFO,
  ROWS,
  TILE,
  WIDTH
} from './maps';
import type { ChassisId, GameMode, TeamSetup } from './types';

export interface LobbyHitbox {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

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

function drawArenaEntities(g: CanvasRenderingContext2D, state: ArenaState, time: number, lang: Lang): void {
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
      tank.isBoss ? 1.32 : 1
    );

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

    // Overhead HP bar & tag
    const barW = tank.isBoss ? 54 : 32;
    const barX = tank.x - barW / 2;
    const barY = tank.y - tank.radius - 11;
    g.fillStyle = '#090d18cc';
    g.fillRect(barX - 1, barY - 1, barW + 2, 5);
    g.fillStyle = tank.team === 3 ? '#f43f5e' : tank.playerIndex === 0 ? '#2dd4bf' : '#fb923c';
    g.fillRect(barX, barY, Math.max(0, (barW * tank.hp) / tank.maxHp), 3);

    if (tank.playerIndex !== undefined) {
      g.font = '800 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = tank.playerIndex === 0 ? '#5eead4' : '#fda4af';
      const label = tank.playerIndex === 0 ? '1P' : tank.isAi ? t(lang, 'hud.ai') : '2P';
      g.fillText(label, tank.x, barY - 6);
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
    g.font = '800 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = ft.color;
    g.fillText(ft.text, ft.x, ft.y);
    g.restore();
  }
}

function drawPlayerSidebar(
  g: CanvasRenderingContext2D,
  state: ArenaState,
  playerIndex: 0 | 1,
  x: number,
  y: number,
  w: number,
  h: number,
  lang: Lang
): void {
  const tank = state.tanks.find((t) => t.playerIndex === playerIndex);
  const accent = playerIndex === 0 ? '#2dd4bf' : '#fb7185';
  drawRoundedRect(g, x, y, w, h, 14, '#111a2ee6', `${accent}66`, 1.8);

  const cx = x + w / 2;
  g.font = '900 18px system-ui, "PingFang SC", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = accent;
  const title = playerIndex === 0 ? 'PLAYER 1' : tank?.isAi ? `P2 · ${t(lang, 'hud.ai')}` : 'PLAYER 2';
  g.fillText(title, cx, y + 28);

  if (!tank) {
    g.font = '700 13px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = '#94a3b8';
    g.fillText('SOLO MODE', cx, y + h / 2);
    return;
  }

  // Tank preview badge
  drawRoundedRect(g, x + 16, y + 46, w - 32, 74, 10, '#0b1120', '#1e293b', 1.2);
  drawTankModel(
    g,
    cx,
    y + 82,
    -Math.PI / 2,
    tank.chassis,
    playerIndex === 0 ? '#2dd4bf' : '#fb7185',
    playerIndex === 0 ? '#fde047' : '#fdba74',
    0,
    0,
    1.15
  );

  g.font = '800 15px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#f8fafc';
  g.fillText(t(lang, `chassis.${tank.chassis}` as Key), cx, y + 140);

  // Armor HP pips
  g.font = '700 12px system-ui, sans-serif';
  g.fillStyle = '#94a3b8';
  g.fillText(`HP ${tank.hp} / ${tank.maxHp}`, cx, y + 166);
  const pipW = Math.floor((w - 36) / tank.maxHp) - 4;
  for (let i = 0; i < tank.maxHp; i++) {
    const px = x + 18 + i * (pipW + 4);
    drawRoundedRect(
      g,
      px,
      y + 176,
      pipW,
      12,
      3,
      i < tank.hp ? accent : '#1e293b',
      '#0f172a',
      1
    );
  }

  // Active Weapon slot
  drawRoundedRect(g, x + 14, y + 206, w - 28, 56, 10, '#0b1120', '#1e293b', 1.2);
  if (tank.weapon) {
    const info = POWERUP_INFO[tank.weapon];
    g.font = '800 13px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = info.color;
    g.fillText(`${info.icon} ${info.badge}`, cx, y + 226);
    const ratio = Math.min(1, tank.weaponTimer / 12);
    drawRoundedRect(g, x + 24, y + 240, (w - 48) * ratio, 8, 4, info.color);
  } else {
    g.font = '700 12px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = '#64748b';
    g.fillText('STANDARD CANNON', cx, y + 235);
  }

  // Mines count
  g.font = '800 13px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#feca57';
  g.fillText(`${t(lang, 'hud.mines')}: ${'💣'.repeat(tank.mines) || '0'}`, cx, y + 288);

  // Lives or Round Wins
  if (state.mode === 'coop') {
    g.fillStyle = '#70f0c2';
    g.fillText(`${t(lang, 'hud.lives')}: ${'🛡️'.repeat(tank.lives) || '0'}`, cx, y + 322);
  } else {
    const wins = playerIndex === 0 ? state.p1Wins : state.p2Wins;
    g.fillStyle = '#ffd15c';
    g.fillText(
      `${t(lang, 'hud.wins')}: ${'★'.repeat(wins)}${'☆'.repeat(Math.max(0, DUEL_WIN_TARGET - wins))}`,
      cx,
      y + 322
    );
  }

  // Kills & Score
  g.fillStyle = '#cbd5e1';
  g.font = '700 13px system-ui, sans-serif';
  g.fillText(`KILLS: ${tank.kills}`, cx, y + 358);
  g.font = '900 18px system-ui, sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText(`${tank.score}`, cx, y + 386);

  // Key hint footer
  g.font = '600 11px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#94a3b8';
  if (playerIndex === 0) {
    g.fillText('WASD / Pad 1', cx, y + h - 42);
    g.fillText('Space/J · K/Q', cx, y + h - 24);
  } else {
    g.fillText('Arrows / Pad 2', cx, y + h - 42);
    g.fillText('Enter · RShift/.', cx, y + h - 24);
  }
}

function drawTopHud(g: CanvasRenderingContext2D, state: ArenaState, lang: Lang): void {
  drawRoundedRect(g, ARENA_X, 12, ARENA_W, 54, 12, '#111a2ee6', '#263554', 1.5);

  g.font = '900 20px system-ui, "PingFang SC", sans-serif';
  g.textAlign = 'left';
  g.fillStyle = '#f8fafc';
  const stageTitle =
    state.mode === 'coop'
      ? t(lang, `stage.coop.${state.stageIndex % 6}` as Key)
      : t(lang, `stage.duel.${state.stageIndex % 5}` as Key);
  g.fillText(stageTitle, ARENA_X + 20, 40);

  g.textAlign = 'center';
  if (state.mode === 'coop') {
    const enemiesLeft =
      state.enemiesRemainingToSpawn.length + state.tanks.filter((t) => t.alive && t.team === 3).length;
    g.font = '800 16px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = '#ff9f43';
    g.fillText(t(lang, 'hud.enemies', { n: enemiesLeft }), WIDTH / 2 + 40, 40);

    g.textAlign = 'right';
    const baseHp = state.grid[12]?.[9]?.hp ?? 0;
    const baseText = !state.baseAlive
      ? t(lang, 'hud.baseDestroyed')
      : state.baseFortifyTimer > 0
        ? t(lang, 'hud.baseFortified', { s: Math.ceil(state.baseFortifyTimer) })
        : t(lang, 'hud.baseOk', { hp: baseHp });
    g.fillStyle = !state.baseAlive ? '#ef4444' : state.baseFortifyTimer > 0 ? '#38bdf8' : '#70f0c2';
    g.fillText(`🦅 ${baseText}`, ARENA_X + ARENA_W - 20, 40);
  } else {
    g.font = '900 20px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = '#ffd15c';
    g.fillText(`P1  ${state.p1Wins}  :  ${state.p2Wins}  P2`, WIDTH / 2 + 40, 40);

    g.textAlign = 'right';
    g.font = '800 15px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = state.suddenDeath ? '#ff5252' : '#70f0c2';
    g.fillText(t(lang, 'hud.round', { n: state.roundNumber }), ARENA_X + ARENA_W - 20, 40);
  }
}

export function drawArenaScene(
  g: CanvasRenderingContext2D,
  state: ArenaState,
  time: number,
  lang: Lang
): void {
  g.fillStyle = '#070b14';
  g.fillRect(0, 0, WIDTH, HEIGHT);

  drawTopHud(g, state, lang);
  drawPlayerSidebar(g, state, 0, 14, ARENA_Y, 152, ARENA_H, lang);
  drawPlayerSidebar(g, state, 1, ARENA_X + ARENA_W + 14, ARENA_Y, 152, ARENA_H, lang);

  // Apply camera shake inside arena
  const shakeX = state.screenShake > 0 ? Math.sin(time * 60) * state.screenShake : 0;
  const shakeY = state.screenShake > 0 ? Math.cos(time * 52) * state.screenShake : 0;

  g.save();
  g.translate(ARENA_X + shakeX, ARENA_Y + shakeY);
  drawTileFloor(g, state, time);
  drawArenaEntities(g, state, time, lang);
  drawBushes(g, state, time);
  g.restore();

  // Banner overlay
  if (state.bannerKey && (state.bannerTimer > 0 || state.outcome !== 'none')) {
    const bw = 640;
    const bh = state.outcome !== 'none' ? 116 : 74;
    const bx = (WIDTH - bw) / 2;
    const by = ARENA_Y + (ARENA_H - bh) / 2;
    drawRoundedRect(g, bx, by, bw, bh, 16, '#090d18eb', '#ffd15c', 2.5);
    g.font = '900 28px system-ui, "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(t(lang, state.bannerKey as Key, { n: state.bannerParam }), WIDTH / 2, by + (state.outcome !== 'none' ? 42 : 37));
    if (state.outcome !== 'none') {
      g.font = '700 16px system-ui, "PingFang SC", sans-serif';
      g.fillStyle = '#70f0c2';
      g.fillText(t(lang, 'banner.pressContinue'), WIDTH / 2, by + 84);
    }
  }
}

export interface LobbyConfig {
  mode: GameMode;
  teamSetup: TeamSetup;
  stageIndex: number;
  p1Chassis: ChassisId;
  p2Chassis: ChassisId;
}

export function drawLobbyOverlay(
  g: CanvasRenderingContext2D,
  cfg: LobbyConfig,
  lang: Lang,
  cursorId: string,
  setConfig: (patch: Partial<LobbyConfig>) => void,
  startGame: () => void
): LobbyHitbox[] {
  const hitboxes: LobbyHitbox[] = [];
  g.fillStyle = '#070b14d9';
  g.fillRect(0, 0, WIDTH, HEIGHT);

  const panelW = 1040;
  const panelH = 610;
  const px = (WIDTH - panelW) / 2;
  const py = 54;
  drawRoundedRect(g, px, py, panelW, panelH, 20, '#0f172af5', '#38bdf888', 2.2);

  const drawFocusRing = (id: string, x: number, y: number, w: number, h: number, r: number) => {
    if (cursorId !== id) return;
    g.save();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3.5;
    g.shadowColor = '#ffd15c';
    g.shadowBlur = 12;
    g.beginPath();
    g.roundRect(x - 3, y - 3, w + 6, h + 6, r + 2);
    g.stroke();
    g.restore();
  };

  // Header
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 34px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#f8fafc';
  g.fillText(t(lang, 'title'), WIDTH / 2, py + 42);
  g.font = '600 16px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#94a3b8';
  g.fillText(t(lang, 'title.sub'), WIDTH / 2, py + 74);

  // Row 0: Game Mode cards (Co-op vs Versus Duel)
  const modes: GameMode[] = ['coop', 'duel'];
  modes.forEach((m, idx) => {
    const id = `mode-${m}`;
    const cw = 460;
    const ch = 78;
    const cx = px + 46 + idx * (cw + 28);
    const cy = py + 102;
    const active = cfg.mode === m;
    drawRoundedRect(
      g,
      cx,
      cy,
      cw,
      ch,
      14,
      active ? '#162c46' : '#111827',
      active ? '#2dd4bf' : '#334155',
      active ? 2.6 : 1.4
    );
    drawFocusRing(id, cx, cy, cw, ch, 14);
    g.textAlign = 'left';
    g.font = '900 20px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = active ? '#2dd4bf' : '#e2e8f0';
    g.fillText(`${m === 'coop' ? '🦅 ' : '⚔️ '}${t(lang, `mode.${m}` as Key)}`, cx + 20, cy + 28);
    g.font = '600 13px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = '#94a3b8';
    g.fillText(t(lang, `mode.${m}.desc` as Key), cx + 20, cy + 54);
    hitboxes.push({
      id,
      row: 0,
      col: idx,
      x: cx,
      y: cy,
      w: cw,
      h: ch,
      action: () => setConfig({ mode: m, stageIndex: 0, teamSetup: m === 'duel' && cfg.teamSetup === '1p-solo' ? '1p-ai' : cfg.teamSetup })
    });
  });

  // Row 1: Team Setup + Map Picker
  const setups: TeamSetup[] = cfg.mode === 'coop' ? ['2p', '1p-ai', '1p-solo'] : ['2p', '1p-ai'];
  setups.forEach((ts, idx) => {
    const id = `team-${ts}`;
    const bw = 200;
    const bh = 42;
    const bx = px + 46 + idx * (bw + 14);
    const by = py + 196;
    const active = cfg.teamSetup === ts;
    drawRoundedRect(
      g,
      bx,
      by,
      bw,
      bh,
      10,
      active ? '#1e3a5f' : '#111827',
      active ? '#fde047' : '#334155',
      active ? 2.2 : 1.2
    );
    drawFocusRing(id, bx, by, bw, bh, 10);
    g.textAlign = 'center';
    g.font = '800 14px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = active ? '#fde047' : '#cbd5e1';
    g.fillText(t(lang, `team.${ts}` as Key), bx + bw / 2, by + bh / 2);
    hitboxes.push({ id, row: 1, col: idx, x: bx, y: by, w: bw, h: bh, action: () => setConfig({ teamSetup: ts }) });
  });

  // Stage / Map selector button on right side of Row 1
  const mapCount = cfg.mode === 'coop' ? 6 : 5;
  const mapBx = px + panelW - 356;
  const mapBy = py + 196;
  const mapBw = 310;
  const mapBh = 42;
  drawRoundedRect(g, mapBx, mapBy, mapBw, mapBh, 10, '#111827', '#38bdf8', 1.6);
  drawFocusRing('cycle-map', mapBx, mapBy, mapBw, mapBh, 10);
  g.textAlign = 'center';
  g.font = '800 14px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#38bdf8';
  const stageName =
    cfg.mode === 'coop'
      ? t(lang, `stage.coop.${cfg.stageIndex % 6}` as Key)
      : t(lang, `stage.duel.${cfg.stageIndex % 5}` as Key);
  g.fillText(`🗺️ ${stageName} ▸`, mapBx + mapBw / 2, mapBy + mapBh / 2);
  hitboxes.push({
    id: 'cycle-map',
    row: 1,
    col: 3,
    x: mapBx,
    y: mapBy,
    w: mapBw,
    h: mapBh,
    action: () => setConfig({ stageIndex: (cfg.stageIndex + 1) % mapCount })
  });

  // Rows 2 & 3: P1 & P2 Tank Chassis Selection
  const drawChassisPicker = (playerIndex: 0 | 1, startX: number, selected: ChassisId) => {
    const sectionY = py + 254;
    g.textAlign = 'left';
    g.font = '800 15px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = playerIndex === 0 ? '#2dd4bf' : '#fb7185';
    g.fillText(t(lang, playerIndex === 0 ? 'lobby.p1' : 'lobby.p2'), startX, sectionY + 12);

    CHASSIS_ORDER.forEach((cid, i) => {
      const id = `p${playerIndex + 1}-chassis-${cid}`;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cw = 222;
      const ch = 92;
      const cx = startX + col * (cw + 16);
      const cy = sectionY + 28 + row * (ch + 12);
      const active = selected === cid;
      const accent = playerIndex === 0 ? '#2dd4bf' : '#fb7185';
      drawRoundedRect(
        g,
        cx,
        cy,
        cw,
        ch,
        12,
        active ? '#17253b' : '#0b1120',
        active ? accent : '#263554',
        active ? 2.4 : 1.2
      );
      drawFocusRing(id, cx, cy, cw, ch, 12);
      drawTankModel(
        g,
        cx + 36,
        cy + 46,
        0,
        cid,
        playerIndex === 0 ? '#2dd4bf' : '#fb7185',
        playerIndex === 0 ? '#fde047' : '#fdba74',
        0,
        0,
        0.95
      );
      g.textAlign = 'left';
      g.font = '800 16px system-ui, "PingFang SC", sans-serif';
      g.fillStyle = '#f8fafc';
      g.fillText(t(lang, `chassis.${cid}` as Key), cx + 70, cy + 32);
      g.font = '600 11.5px system-ui, "PingFang SC", sans-serif';
      g.fillStyle = '#94a3b8';
      g.fillText(t(lang, `chassis.${cid}.tag` as Key), cx + 70, cy + 56);
      const spec = CHASSIS_SPECS[cid];
      g.fillStyle = accent;
      g.fillText(`HP:${spec.maxHp}  SPD:${Math.round(spec.speed / 17)}`, cx + 70, cy + 76);

      hitboxes.push({
        id,
        row: 2 + row,
        col: playerIndex * 2 + col,
        x: cx,
        y: cy,
        w: cw,
        h: ch,
        action: () => setConfig(playerIndex === 0 ? { p1Chassis: cid } : { p2Chassis: cid })
      });
    });
  };

  drawChassisPicker(0, px + 46, cfg.p1Chassis);
  drawChassisPicker(1, px + 534, cfg.p2Chassis);

  // Controls & Gamepad navigation hints
  g.textAlign = 'center';
  g.font = '600 13px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#cbd5e1';
  g.fillText(`${t(lang, 'lobby.controls.p1')}   |   ${t(lang, 'lobby.controls.p2')}`, WIDTH / 2, py + 506);
  g.fillStyle = '#fde047';
  g.fillText(t(lang, 'lobby.gamepadHint'), WIDTH / 2, py + 528);

  // Row 4: Start Battle CTA button
  const startW = 460;
  const startH = 50;
  const startX = (WIDTH - startW) / 2;
  const startY = py + 546;
  drawRoundedRect(g, startX, startY, startW, startH, 14, '#70f0c2', '#ffffff', 2);
  drawFocusRing('start-battle', startX, startY, startW, startH, 14);
  g.font = '900 18px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#062019';
  g.fillText(t(lang, 'lobby.start'), WIDTH / 2, startY + startH / 2);
  hitboxes.push({ id: 'start-battle', row: 4, col: 0, x: startX, y: startY, w: startW, h: startH, action: startGame });

  return hitboxes;
}

export function drawPauseOverlay(
  g: CanvasRenderingContext2D,
  lang: Lang,
  pauseCursor: number,
  onResume: () => void,
  onRestart: () => void,
  onLobby: () => void
): LobbyHitbox[] {
  const hitboxes: LobbyHitbox[] = [];
  g.fillStyle = '#070b14cc';
  g.fillRect(0, 0, WIDTH, HEIGHT);

  const pw = 480;
  const ph = 300;
  const px = (WIDTH - pw) / 2;
  const py = (HEIGHT - ph) / 2;
  drawRoundedRect(g, px, py, pw, ph, 18, '#0f172af5', '#38bdf8', 2.4);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 28px system-ui, "PingFang SC", sans-serif';
  g.fillStyle = '#f8fafc';
  g.fillText(t(lang, 'pause.title'), WIDTH / 2, py + 48);

  const items: Array<{ id: string; label: string; action: () => void }> = [
    { id: 'pause-resume', label: t(lang, 'pause.resume'), action: onResume },
    { id: 'pause-restart', label: t(lang, 'pause.restart'), action: onRestart },
    { id: 'pause-lobby', label: t(lang, 'pause.lobby'), action: onLobby }
  ];

  items.forEach((item, idx) => {
    const bw = 380;
    const bh = 52;
    const bx = (WIDTH - bw) / 2;
    const by = py + 94 + idx * 64;
    const active = pauseCursor === idx;
    drawRoundedRect(
      g,
      bx,
      by,
      bw,
      bh,
      12,
      active ? '#162c46' : '#111827',
      active ? '#70f0c2' : '#334155',
      active ? 2.6 : 1.4
    );
    g.font = '800 17px system-ui, "PingFang SC", sans-serif';
    g.fillStyle = active ? '#70f0c2' : '#e2e8f0';
    g.fillText(item.label, WIDTH / 2, by + bh / 2);
    hitboxes.push({ id: item.id, row: idx, col: 0, x: bx, y: by, w: bw, h: bh, action: item.action });
  });

  return hitboxes;
}
