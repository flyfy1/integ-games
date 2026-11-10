/** Everything visible: cached ground, tread decals, tanks with googly eyes, particles and the overlay screens. */
import { COLS, ROWS, TILE, WORLD_H, WORLD_W } from './arenas';
import { MAX_AMMO, type GameEvent, type Match, type PowerKind, type Tank, type World } from './sim';

export const WIDTH = 1280, HEIGHT = 720, OFFSET_X = (WIDTH - WORLD_W) / 2, OFFSET_Y = 86;
export const SEAT_COLORS = ['#4de8b0', '#ff7d8b'] as const;
const ENEMY_COLORS: Record<string, string> = { grunt: '#a2adbb', zippy: '#ffd84d', bouncer: '#b98cff', heavy: '#c8503f', king: '#ffb52e' };
export const POWER_ICONS: Record<PowerKind, string> = { triple: '🔱', mega: '💣', bee: '🐝', laser: '⚡', duck: '🦆', shield: '🛡️', giant: '🍄', swap: '🔀' };
const HATS = ['🎩', '🧢', '👒', '🎓', '🍌', '🦆', '🍄'];
const COMIC = ['POW!', 'BAM!', 'BONK!', 'WHAM!', 'OUCH!', 'KABLAM!'];
const FONT = 'ui-rounded,"SF Pro Rounded",system-ui,sans-serif';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; drag: number; gravity: number; text?: string; ring?: boolean };
export type MenuRow = { label: string; value: string; enabled: boolean };
export type Overlay =
  | { kind: 'none' }
  | { kind: 'menu'; title: string; subtitle: string; rows: MenuRow[]; cursor: number; start: string; record: string; legend: Array<[string, string, string]> }
  | { kind: 'card'; top: string; title: string; hint: string; progress: number; rolling: boolean; lines?: string[]; alert?: string }
  | { kind: 'count'; value: string }
  | { kind: 'result'; title: string; color: string; lines: string[]; prompt?: string; party: boolean }
  | { kind: 'paused'; title: string; hint: string };
export type Touch = { sticks: Array<{ x: number; y: number; dx: number; dy: number } | null>; buttons: Array<{ x: number; y: number; r: number; label: string; held: boolean }> };

export const menuRowBox = (index: number) => ({ x: 290, y: 132 + index * 64, w: 700, h: 56 });
export const START_BOX = { x: 440, y: 458, w: 400, h: 72 };

export const tankColor = (tank: Tank) => (tank.enemy ? ENEMY_COLORS[tank.enemy] : SEAT_COLORS[tank.seat] ?? '#fff');

export function createRenderer(ctx: CanvasRenderingContext2D, reduced: boolean, chinese = false) {
  const ground = document.createElement('canvas'), decals = document.createElement('canvas');
  ground.width = decals.width = WORLD_W; ground.height = decals.height = WORLD_H;
  const groundCtx = ground.getContext('2d')!, decalCtx = decals.getContext('2d')!;
  let particles: Particle[] = [], shake = 0, flash = 0, world: World | null = null, zoom = 0, zoomX = 0, zoomY = 0, clock = 0, smoke = 0;
  const treadMarks = new Map<number, number>(), bubbles = new Map<number, { text: string; life: number }>();

  function setWorld(next: World) {
    world = next; particles = []; shake = flash = zoom = 0; treadMarks.clear(); bubbles.clear();
    decalCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    const { arena } = next;
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      groundCtx.fillStyle = (row + col) % 2 ? arena.floor : arena.floorAlt;
      groundCtx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }

  const burst = (x: number, y: number, color: string, count: number, speed: number, size = 5) => {
    const amount = reduced ? Math.ceil(count / 3) : count;
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2, pace = speed * (0.3 + Math.random());
      particles.push({ x, y, vx: Math.cos(angle) * pace, vy: Math.sin(angle) * pace, life: 0.5, max: 0.3 + Math.random() * 0.5, size: size * (0.5 + Math.random()), color, drag: 0.92, gravity: 0 });
      particles[particles.length - 1].life = particles[particles.length - 1].max;
    }
  };
  const ring = (x: number, y: number, size: number, color: string) => particles.push({ x, y, vx: 0, vy: 0, life: 0.34, max: 0.34, size, color, drag: 1, gravity: 0, ring: true });
  const comic = (x: number, y: number, text: string, color = '#fff') => particles.push({ x, y: y - 20, vx: (Math.random() - 0.5) * 40, vy: -80, life: 0.8, max: 0.8, size: 34, color, drag: 0.95, gravity: 0, text });
  const scorch = (x: number, y: number, radius: number) => {
    const gradient = decalCtx.createRadialGradient(x, y, 2, x, y, radius);
    gradient.addColorStop(0, '#0000005c'); gradient.addColorStop(1, '#00000000');
    decalCtx.fillStyle = gradient; decalCtx.beginPath(); decalCtx.arc(x, y, radius, 0, Math.PI * 2); decalCtx.fill();
  };
  const addShake = (amount: number) => { if (!reduced) shake = Math.min(26, shake + amount); };

  function consume(events: readonly GameEvent[]) {
    for (const item of events) {
      switch (item.type) {
        case 'fire': if (item.kind !== 'duck' && item.kind !== 'laser') { burst(item.x, item.y, '#ffe9a8', 6, 180, 4); addShake(item.kind === 'mega' ? 6 : 1.4); } break;
        case 'bounce': burst(item.x, item.y, '#fff', 4, 120, 3); break;
        case 'crate': burst(item.x, item.y, world?.arena.crate ?? '#c98a4b', 16, 260, 7); addShake(3); break;
        case 'clash': burst(item.x, item.y, '#fff3a8', 12, 240, 4); ring(item.x, item.y, 30, '#fff'); break;
        case 'portal': burst(item.x, item.y, '#7cf9ff', 14, 200, 5); ring(item.x, item.y, 44, '#7cf9ff'); break;
        case 'bumper': ring(item.x, item.y, 54, '#ff7ac6'); burst(item.x, item.y, '#ffd1ec', 8, 240, 4); comic(item.x, item.y, 'BOING!', '#ffd1ec'); addShake(3); break;
        case 'reflect': ring(item.x, item.y, 34, '#8fe9ff'); comic(item.x, item.y, 'NOPE!', '#8fe9ff'); break;
        case 'dash': burst(item.x, item.y, '#ffffffaa', 10, 120, 7); break;
        case 'crash': burst(item.x, item.y, '#ffd34d', 12, 280, 5); comic(item.x, item.y, 'CLONK!', '#ffd34d'); addShake(7); break;
        case 'revive': ring(item.x, item.y, 70, '#70f0c2'); comic(item.x, item.y, 'BACK!', '#70f0c2'); break;
        case 'hit': burst(item.x, item.y, '#ffb347', 18, 300, 6); ring(item.x, item.y, 50, '#fff'); comic(item.x, item.y, item.by === item.tank ? (chinese ? '乌龙！' : 'OWN GOAL!') : COMIC[Math.floor(Math.random() * COMIC.length)], item.by === item.tank ? '#ff9d6e' : '#fff06e'); scorch(item.x, item.y, 28); addShake(10); break;
        case 'explode': burst(item.x, item.y, '#ff8a3d', 34, 420, 9); burst(item.x, item.y, '#fff0a8', 16, 240, 6); ring(item.x, item.y, item.radius * 1.4, '#ffe08a'); scorch(item.x, item.y, item.radius); addShake(16); if (!reduced) flash = Math.max(flash, 0.1); break;
        case 'pickup': ring(item.x, item.y, 50, '#fff06e'); comic(item.x, item.y, POWER_ICONS[item.kind], '#fff'); break;
        case 'fall': comic(item.x, item.y, 'AAAAH!', '#fff'); break;
        case 'ko': burst(item.x, item.y, '#ff5a3d', 60, 520, 11); burst(item.x, item.y, '#2b2b2b', 30, 260, 12); ring(item.x, item.y, 170, '#fff'); comic(item.x, item.y, 'K.O.!', '#ff5a5a'); scorch(item.x, item.y, 80); addShake(26); if (!reduced) { flash = 0.2; zoom = 1; zoomX = item.x; zoomY = item.y; } break;
        case 'honk': bubbles.set(item.tank, { text: Math.random() < 0.15 ? 'QUACK!' : 'HONK!', life: 0.6 }); break;
        case 'collapse': addShake(14); break;
      }
    }
  }

  function advance(dt: number, frozen = false) {
    clock += dt;
    shake *= Math.pow(0.0015, dt); if (shake < 0.2) shake = 0;
    flash = Math.max(0, flash - dt * 2.4);
    if (zoom > 0) zoom = Math.max(0, zoom - dt * 0.75);
    if (frozen) return;
    for (const particle of particles) {
      particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vx *= particle.drag; particle.vy = particle.vy * particle.drag + particle.gravity * dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    bubbles.forEach((bubble, id) => { bubble.life -= dt; if (bubble.life <= 0) bubbles.delete(id); });
    if (!world) return;
    smoke -= dt;
    const puff = smoke <= 0 && !reduced;
    if (puff) smoke = 0.09;
    for (const tank of world.tanks) {
      if (!tank.alive || tank.falling > 0) continue;
      // A tank on its last heart trails smoke, so both players can see who is one hit from out.
      if (puff && tank.seat >= 0 && tank.hp === 1 && tank.maxHp > 1 && !tank.downed) particles.push({ x: tank.x + (Math.random() - 0.5) * 14, y: tank.y - 8, vx: (Math.random() - 0.5) * 30, vy: -70 - Math.random() * 40, life: 0.7, max: 0.7, size: 7 + Math.random() * 6, color: Math.random() < 0.3 ? '#ff8a3d' : '#3a3f4dcc', drag: 0.97, gravity: 0 });
      const last = treadMarks.get(tank.id) ?? tank.mileage;
      if (tank.mileage - last < 9) { treadMarks.set(tank.id, last); continue; }
      treadMarks.set(tank.id, tank.mileage);
      decalCtx.save(); decalCtx.translate(tank.x, tank.y); decalCtx.rotate(tank.heading);
      decalCtx.fillStyle = world.tiles[0][0] === '~' ? '#5e87a533' : '#0000001f';
      const spread = 15 * tank.scale;
      decalCtx.fillRect(-3, -spread - 3, 6, 6); decalCtx.fillRect(-3, spread - 3, 6, 6);
      decalCtx.restore();
    }
  }

  function confetti() {
    if (reduced || particles.length > 260 || Math.random() > 0.5) return;
    const colors = ['#ff5a7a', '#ffd34d', '#4de8b0', '#59c9ff', '#b98cff'];
    particles.push({ x: Math.random() * WORLD_W, y: -20, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 120, life: 4, max: 4, size: 8, color: colors[Math.floor(Math.random() * 5)], drag: 1, gravity: 30 });
  }

  const label = (text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 800) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
  };
  const outlined = (text: string, x: number, y: number, size: number, color: string, line = '#10162a') => {
    ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size / 5; ctx.lineJoin = 'round'; ctx.strokeStyle = line; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  };
  const box = (x: number, y: number, w: number, h: number, radius: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); };

  function drawTiles(current: World) {
    const { arena } = current;
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const tile = current.tiles[row][col], x = col * TILE, y = row * TILE, mid = TILE / 2;
      const warned = current.warnRing >= 0 && Math.min(col, row, COLS - 1 - col, ROWS - 1 - row) === current.warnRing;
      if (tile === 'o') {
        ctx.fillStyle = arena.pit; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = arena.pitGlow; ctx.globalAlpha = 0.28 + Math.sin(clock * 3 + col * 0.8 + row) * 0.14; ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12); ctx.globalAlpha = 1;
      } else if (tile === '>' || tile === '<' || tile === '^' || tile === 'v') {
        ctx.fillStyle = '#39414c'; ctx.fillRect(x, y, TILE, TILE);
        const angle = { '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[tile], shift = (clock * 60) % 24;
        ctx.save(); ctx.translate(x + mid, y + mid); ctx.rotate(angle); ctx.beginPath(); ctx.rect(-mid, -mid, TILE, TILE); ctx.clip();
        ctx.strokeStyle = '#f5b83d'; ctx.lineWidth = 5;
        for (let offset = -36; offset < 36; offset += 24) { ctx.beginPath(); ctx.moveTo(offset + shift - 7, -11); ctx.lineTo(offset + shift + 4, 0); ctx.lineTo(offset + shift - 7, 11); ctx.stroke(); }
        ctx.restore();
      } else if (tile === 'P' || tile === 'p') {
        const hue = tile === 'P' ? '#ff9f40' : '#46b8ff';
        ctx.save(); ctx.translate(x + mid, y + mid); ctx.rotate(clock * 2.6);
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = hue; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 20 - i * 6, i, i + 4.4); ctx.stroke(); }
        ctx.restore();
      } else if (tile === '#') {
        ctx.fillStyle = arena.wall; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = arena.wallTop; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 12);
        ctx.fillStyle = '#ffffff33'; ctx.fillRect(x + 8, y + 7, TILE - 16, 5);
      } else if (tile === 'c') {
        const hurt = current.crateHp[row][col] < 2;
        ctx.fillStyle = '#00000044'; ctx.fillRect(x + 4, y + 8, TILE - 6, TILE - 6);
        ctx.fillStyle = arena.crate; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = '#00000040'; ctx.lineWidth = 3; ctx.strokeRect(x + 7, y + 7, TILE - 14, TILE - 14);
        ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + TILE - 7, y + TILE - 7);
        if (hurt) { ctx.moveTo(x + TILE - 12, y + 10); ctx.lineTo(x + 20, y + 26); ctx.lineTo(x + 12, y + TILE - 12); }
        ctx.stroke();
      } else if (tile === 'B') {
        ctx.fillStyle = '#00000050'; ctx.beginPath(); ctx.arc(x + mid, y + mid + 5, 21, 0, Math.PI * 2); ctx.fill();
        const pulse = 1 + Math.sin(clock * 6 + col) * 0.05;
        ctx.fillStyle = '#ff4fa3'; ctx.beginPath(); ctx.arc(x + mid, y + mid, 21 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(x + mid, y + mid, 12 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + mid - 4, y + mid - 4, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (warned && tile !== 'o' && Math.sin(clock * 12) > -0.2) { ctx.fillStyle = '#ff2d2d55'; ctx.fillRect(x, y, TILE, TILE); }
    }
  }

  function drawTank(current: World, tank: Tank, hats: number, crown: boolean) {
    const color = tankColor(tank);
    let scale = tank.scale;
    if (tank.falling > 0) scale *= Math.max(0.02, tank.falling / 0.7);
    ctx.save(); ctx.translate(tank.x, tank.y);
    if (tank.falling > 0) ctx.rotate(tank.falling * 14);
    ctx.scale(scale, scale);
    if (tank.invuln > 0 && !tank.falling && Math.floor(clock * 16) % 2 && !tank.downed) ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(1, 5, 24, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(tank.heading);
    if (tank.dash > 0 && !reduced) ctx.scale(1.25, 0.84);
    ctx.fillStyle = '#2a3144';
    box(-22, -23, 44, 11, 5); ctx.fill(); box(-22, 12, 44, 11, 5); ctx.fill();
    ctx.fillStyle = '#5b6685'; const roll = tank.mileage % 10;
    for (let x = -21 + roll; x < 21; x += 10) { ctx.fillRect(x, -22, 3, 9); ctx.fillRect(x, 13, 3, 9); }
    ctx.fillStyle = tank.flash > 0 ? '#ffffff' : tank.downed ? '#6e7486' : color; box(-20, -15, 40, 30, 9); ctx.fill();
    ctx.fillStyle = '#ffffff2e'; box(-16, -13, 32, 7, 4); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.rotate(tank.turret);
    const back = tank.recoil * 7;
    ctx.fillStyle = '#20263a'; box(4 - back, -5.5, 28, 11, 3); ctx.fill();
    ctx.fillStyle = '#343c56'; ctx.fillRect(27 - back, -7, 7, 14);
    if (tank.laserCharge > 0) {
      ctx.strokeStyle = '#6ef3ff'; ctx.lineWidth = 2 + (0.5 - tank.laserCharge) * 8; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(420, 0); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = tank.flash > 0 ? '#fff' : tank.downed ? '#868da0' : shade(color); ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawEyes(current, tank);
    ctx.globalAlpha = 1;
    if (tank.shield > 0) {
      ctx.strokeStyle = '#8fe9ff'; ctx.lineWidth = 3; ctx.globalAlpha = tank.shield < 1.5 && Math.floor(clock * 10) % 2 ? 0.3 : 0.9;
      ctx.beginPath(); ctx.arc(0, 0, 33, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#8fe9ff22'; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.font = `27px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    for (let i = 0; i < hats; i++) ctx.fillText(HATS[i % HATS.length], tank.x + Math.sin(clock * 3 + i) * i * 1.5, tank.y - 14 * scale - 12 - i * 17);
    if (crown) ctx.fillText('👑', tank.x, tank.y - 14 * scale - 12 - hats * 17);
    if (tank.enemy && tank.maxHp > 1) {
      ctx.fillStyle = '#0007'; ctx.fillRect(tank.x - 24, tank.y + 28 * scale, 48, 6);
      ctx.fillStyle = color; ctx.fillRect(tank.x - 24, tank.y + 28 * scale, 48 * tank.hp / tank.maxHp, 6);
    }
    if (tank.downed) {
      outlined(chinese ? '救命！' : 'HELP!', tank.x, tank.y - 42, 22, '#fff');
      ctx.strokeStyle = '#70f0c2'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(tank.x, tank.y, 34, -Math.PI / 2, -Math.PI / 2 + tank.revive / 1.4 * Math.PI * 2); ctx.stroke();
    }
    const bubble = bubbles.get(tank.id);
    if (bubble) {
      ctx.fillStyle = '#fff'; box(tank.x - 42, tank.y - 66, 84, 28, 12); ctx.fill();
      label(bubble.text, tank.x, tank.y - 52, 16, '#1b2340');
    }
  }

  function drawEyes(current: World, tank: Tank) {
    const foe = current.tanks.find((other) => other.alive && other.team !== tank.team);
    const look = foe ? Math.atan2(foe.y - tank.y, foe.x - tank.x) : tank.turret;
    const wobble = Math.min(1, Math.hypot(tank.vx, tank.vy) / 300) * Math.sin(clock * 30 + tank.id) * 1.2;
    const dizzy = tank.flash > 0 || tank.downed || tank.falling > 0;
    const side = [-6.5, 6.5];
    for (const offset of side) {
      const eyeX = offset, eyeY = -2;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(eyeX, eyeY, 6, 0, Math.PI * 2); ctx.fill();
      if (dizzy) {
        ctx.strokeStyle = '#141a2c'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(eyeX - 3, eyeY - 3); ctx.lineTo(eyeX + 3, eyeY + 3); ctx.moveTo(eyeX + 3, eyeY - 3); ctx.lineTo(eyeX - 3, eyeY + 3); ctx.stroke();
      } else {
        ctx.fillStyle = '#141a2c'; ctx.beginPath(); ctx.arc(eyeX + Math.cos(look) * 2.6 + wobble, eyeY + Math.sin(look) * 2.6, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawWorld(current: World, match: Match | null) {
    ctx.drawImage(ground, 0, 0); drawTiles(current); ctx.drawImage(decals, 0, 0);
    for (const pickup of current.pickups) {
      const lift = pickup.drop > 0 ? pickup.drop * 260 : Math.sin(pickup.age * 4) * 3;
      ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(pickup.x, pickup.y + 16, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffdf0'; box(pickup.x - 20, pickup.y - 20 - lift, 40, 40, 11); ctx.fill();
      ctx.strokeStyle = '#ffb52e'; ctx.lineWidth = 4; ctx.stroke();
      ctx.font = `25px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(POWER_ICONS[pickup.kind], pickup.x, pickup.y + 1 - lift);
      if (pickup.drop > 0) label('🪂', pickup.x, pickup.y - 44 - lift, 24, '#000');
    }
    for (const duck of current.ducks) {
      ctx.font = `26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
      ctx.fillText('🦆', duck.x, duck.y + Math.sin(duck.age * 8) * 2);
      if (duck.age > 0.9 && Math.floor(duck.age * 5) % 2) { ctx.strokeStyle = '#ff5a5a88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(duck.x, duck.y, 44, 0, Math.PI * 2); ctx.stroke(); }
    }
    const leader = match && match.wins[0] !== match.wins[1] ? (match.wins[0] > match.wins[1] ? 0 : 1) : -1;
    for (const tank of current.tanks) if (tank.alive) drawTank(current, tank, tank.seat >= 0 && match ? match.hats[tank.seat] : 0, leader >= 0 && tank.seat === leader);
    for (const shell of current.shells) drawShell(shell.kind, shell.x, shell.y, shell.vx, shell.vy, shell.team, shell.radius);
    for (const beam of current.beams) {
      for (const [width, color] of [[16, '#29e6ff66'], [8, '#7ef3ff'], [3, '#ffffff']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width * beam.life / 0.32 + 1; ctx.lineJoin = 'round'; ctx.beginPath();
        beam.points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
    for (const particle of particles) {
      const fade = particle.life / particle.max;
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      if (particle.text) { outlined(particle.text, particle.x, particle.y, particle.size * (1.2 - fade * 0.2 + (fade > 0.85 ? (fade - 0.85) * 3 : 0)), particle.color); }
      else if (particle.ring) { ctx.strokeStyle = particle.color; ctx.lineWidth = 6 * fade; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size * (1 - fade * fade) + 4, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = particle.color; ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size); }
    }
    ctx.globalAlpha = 1;
  }

  function drawShell(kind: string, x: number, y: number, vx: number, vy: number, team: number, radius: number) {
    const angle = Math.atan2(vy, vx);
    if (!reduced) {
      ctx.strokeStyle = team ? '#ff7d8b88' : '#4de8b088'; ctx.lineWidth = radius * 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(angle) * 26, y - Math.sin(angle) * 26); ctx.stroke(); ctx.lineCap = 'butt';
    }
    if (kind === 'bee') { ctx.font = `24px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText('🐝', x, y + Math.sin(clock * 30) * 2); return; }
    ctx.fillStyle = kind === 'mega' ? '#20263a' : '#fff6cf'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = kind === 'mega' ? '#ff9f40' : team ? '#ff5a6e' : '#25b98a'; ctx.lineWidth = 3; ctx.stroke();
  }

  function drawHud(current: World, match: Match | null, labels: { center: string; sub: string; names: string[] }) {
    current.tanks.filter((tank) => tank.seat >= 0).forEach((tank) => {
      const left = tank.seat === 0, x = left ? 26 : WIDTH - 26, sign = left ? 1 : -1, align: CanvasTextAlign = left ? 'left' : 'right';
      label(labels.names[tank.seat], x, 25, 27, SEAT_COLORS[tank.seat], align, 900);
      ctx.font = `${tank.maxHp > 5 ? 20 : 25}px ${FONT}`; ctx.textAlign = align; ctx.fillStyle = '#000';
      if (tank.hp === 1 && tank.maxHp > 1 && !reduced) ctx.globalAlpha = 0.6 + Math.sin(clock * 11) * 0.4;
      ctx.fillText(`${'❤️'.repeat(Math.max(0, tank.hp))}${'🖤'.repeat(Math.max(0, tank.maxHp - tank.hp))}`, x, 62);
      ctx.globalAlpha = 1;
      for (let i = 0; i < MAX_AMMO; i++) {
        ctx.fillStyle = i < tank.ammo ? '#ffe9a8' : '#ffffff25';
        ctx.beginPath(); ctx.roundRect(x + sign * (196 + i * 22) - 8, 12, 16, 27, 6); ctx.fill();
      }
      const ready = 1 - tank.dashCooldown / 2, bar = 60, barX = left ? x + 188 : x - 188 - bar;
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(barX, 52, bar, 9);
      ctx.fillStyle = ready >= 1 ? '#70f0c2' : '#7a8fb0'; ctx.fillRect(left ? barX : barX + bar * (1 - ready), 52, bar * ready, 9);
      if (tank.power) label(`${POWER_ICONS[tank.power]}×${tank.charges}`, x + sign * 304, 36, 30, '#fff', 'center');
      if (match?.mode === 'versus') {
        const pitch = Math.min(27, 112 / match.target);
        for (let i = 0; i < match.target; i++) label(i < match.wins[tank.seat] ? '★' : '☆', x + sign * (372 + i * pitch), 36, 27, i < match.wins[tank.seat] ? '#ffd34d' : '#ffffff55');
      }
    });
    label(labels.center, WIDTH / 2, 25, 27, '#f7f9ff', 'center', 900);
    label(labels.sub, WIDTH / 2, 61, 23, current.suddenDeath ? '#ff9a8a' : '#c3cbdd', 'center', 700);
  }

  function drawOverlay(overlay: Overlay) {
    if (overlay.kind === 'menu') {
      ctx.fillStyle = '#090d18c4'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      outlined(overlay.title, WIDTH / 2, 54, 66, '#ffd34d');
      label(overlay.subtitle, WIDTH / 2, 106, 23, '#d7ddec', 'center', 700);
      overlay.rows.forEach((row, index) => {
        const area = menuRowBox(index), active = index === overlay.cursor;
        ctx.globalAlpha = row.enabled ? 1 : 0.32;
        ctx.fillStyle = active ? '#ffffff26' : '#ffffff12'; box(area.x, area.y, area.w, area.h, 16); ctx.fill();
        if (active) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.stroke(); }
        label(row.label, area.x + 26, area.y + area.h / 2, 27, '#b9c2d6', 'left', 700);
        label(`◀  ${row.value}  ▶`, area.x + area.w - 26, area.y + area.h / 2, 28, '#fff', 'right', 800);
        ctx.globalAlpha = 1;
      });
      const active = overlay.cursor === overlay.rows.length, pulse = active && !reduced ? Math.sin(clock * 5) * 4 : 0;
      ctx.fillStyle = '#ffd34d'; box(START_BOX.x - pulse, START_BOX.y - pulse / 2, START_BOX.w + pulse * 2, START_BOX.h + pulse, 22); ctx.fill();
      if (active) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
      label(overlay.start, WIDTH / 2, START_BOX.y + START_BOX.h / 2 + 1, 36, '#1b2340', 'center', 900);
      label(overlay.record, WIDTH / 2, 562, 24, '#ffd98a', 'center', 800);
      const few = overlay.legend.length < 3, size = few ? 26 : 21, pitch = few ? 44 : 36, top = few ? 618 : 606;
      overlay.legend.forEach(([who, keys, color], index) => {
        label(who, 60, top + index * pitch, size, color, 'left', 900);
        label(keys, 60 + size * 5.6, top + index * pitch, size, '#e3e8f4', 'left', 600);
      });
    } else if (overlay.kind === 'card') {
      ctx.fillStyle = '#090d18a8'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const slide = reduced ? 0 : Math.max(0, 1 - overlay.progress * 5) ** 2 * -240;
      ctx.save(); ctx.translate(0, slide); ctx.rotate(-0.012);
      const extra = overlay.lines?.length ?? 0, lift = extra ? 22 + extra * 20 : 0;
      ctx.fillStyle = '#fff8e1'; box(200, 216 - lift, 880, 280 + lift * 2, 28); ctx.fill();
      ctx.strokeStyle = '#ffb52e'; ctx.lineWidth = 8; ctx.stroke();
      label(overlay.top, WIDTH / 2, 262 - lift, 28, '#8a6d2a', 'center', 800);
      if (overlay.alert) { ctx.fillStyle = '#d9382c'; box(WIDTH / 2 - 150, 176 - lift, 300, 46, 23); ctx.fill(); label(overlay.alert, WIDTH / 2, 200 - lift, 26, '#fff8e1', 'center', 900); }
      label(overlay.title, WIDTH / 2, 344 - lift, overlay.rolling ? 52 : 66, overlay.rolling ? '#b6a988' : '#d9382c', 'center', 900);
      if (!overlay.rolling) label(overlay.hint, WIDTH / 2, 426 - lift, 28, '#3b3f55', 'center', 700);
      overlay.lines?.forEach((line, index) => label(line, WIDTH / 2, 482 - lift + index * 42, 27, '#1f5d86', 'center', 800));
      ctx.restore();
    } else if (overlay.kind === 'count') {
      outlined(overlay.value, WIDTH / 2, HEIGHT / 2, 160, '#fff06e');
    } else if (overlay.kind === 'result') {
      ctx.fillStyle = '#090d18a0'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (overlay.party) confetti();
      const rise = Math.max(0, overlay.lines.length - 2) * 24;
      outlined(overlay.title, WIDTH / 2, 262 - rise, 78, overlay.color);
      overlay.lines.forEach((line, index) => label(line, WIDTH / 2, 356 - rise + index * 46, 30, index ? '#ffe9a8' : '#f7f9ff', 'center', 800));
      if (overlay.prompt) { ctx.fillStyle = '#090d18cc'; box(WIDTH / 2 - 420, 566, 840, 56, 28); ctx.fill(); label(overlay.prompt, WIDTH / 2, 595, 28, '#ffd34d', 'center', 800); }
    } else if (overlay.kind === 'paused') {
      ctx.fillStyle = '#090d18c4'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      outlined(overlay.title, WIDTH / 2, 310, 76, '#fff');
      label(overlay.hint, WIDTH / 2, 400, 28, '#d7ddec', 'center', 700);
    }
  }

  function drawTouch(touch: Touch) {
    touch.buttons.forEach((button) => {
      ctx.fillStyle = button.held ? '#ffffff55' : '#ffffff22'; ctx.beginPath(); ctx.arc(button.x, button.y, button.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 3; ctx.stroke();
      label(button.label, button.x, button.y, 26, '#fff', 'center', 900);
    });
    touch.sticks.forEach((stick) => {
      if (!stick) return;
      ctx.fillStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(stick.x, stick.y, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff66'; ctx.beginPath(); ctx.arc(stick.x + stick.dx * 50, stick.y + stick.dy * 50, 30, 0, Math.PI * 2); ctx.fill();
    });
  }

  function draw(current: World, match: Match | null, overlay: Overlay, hud: { center: string; sub: string; names: string[] } | null, touch: Touch | null) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10162a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (hud) drawHud(current, match, hud);
    ctx.save();
    ctx.translate(OFFSET_X + (shake ? (Math.random() - 0.5) * shake : 0), OFFSET_Y + (shake ? (Math.random() - 0.5) * shake : 0));
    ctx.beginPath(); ctx.rect(-6, -6, WORLD_W + 12, WORLD_H + 12); ctx.clip();
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 6; ctx.strokeRect(-3, -3, WORLD_W + 6, WORLD_H + 6);
    if (zoom > 0) {
      const amount = 1 + 0.4 * Math.min(1, zoom * 1.6);
      ctx.translate(zoomX, zoomY); ctx.scale(amount, amount); ctx.translate(-zoomX, -zoomY);
    }
    drawWorld(current, match);
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    if (touch) drawTouch(touch);
    drawOverlay(overlay);
  }

  return { setWorld, consume, advance, draw };
}

function shade(hex: string) {
  const value = parseInt(hex.slice(1), 16), part = (shift: number) => Math.round(((value >> shift) & 255) * 0.78);
  return `rgb(${part(16)},${part(8)},${part(0)})`;
}
