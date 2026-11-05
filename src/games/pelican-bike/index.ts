import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createPelicanAudio } from './audio';
import { buildRows, LEVELS, ROWS } from './levels';
import { drawBackground, drawEntities, drawHUD, drawOverlay, drawPelican, drawTile, drawWater } from './render';
import { H, MAXST, PH, PW, T, THEMES, W, WATER_Y } from './theme';
import type { Checkpoint, Crumble, Enemy, Goal, Item, Mover, Particle, Popup, Spring } from './types';

const ACCENT = '#ff9f1c';
const zh = () => /^zh\b/i.test(navigator.language || '');

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export const pelicanBike: GameModule = {
  meta: {
    slug: 'pelican-bike',
    title: 'Pelican Pedal',
    category: 'action',
    description: 'Ride along sunny coasts and starry piers as a breezy pelican on two wheels.',
    instructions: 'A/D or Arrows steer, Space/W/Up hops, double-hops and glides. Shift sprints.',
    accent: ACCENT,
    mechanic: 'Pedal, flap jump, glide and dash'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    const isZh = zh();
    const root = document.createElement('div');
    root.dataset.pelicanBike = '';
    root.style.cssText = 'position:relative;width:100%;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;-webkit-user-select:none;user-select:none;';

    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', isZh ? '鹈鹕骑行记' : 'Pelican Pedal');
    canvas.style.cssText = `display:block;width:min(100%,calc((100dvh - 120px)*16/9));aspect-ratio:16/9;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.45);outline:none;background:#0b1020;`;
    root.append(canvas);

    // Mobile on-screen buttons
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    let touchControls: HTMLDivElement | null = null;
    if (isTouchDevice) {
      touchControls = document.createElement('div');
      touchControls.style.cssText = 'position:absolute;inset:auto 0 14px 0;display:flex;justify-content:space-between;padding:0 16px;pointer-events:none;z-index:10;';
      touchControls.innerHTML = `
        <div style="display:flex;gap:12px;pointer-events:auto;">
          <button data-btn="left" style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);color:#fff;font-size:24px;touch-action:none;">◀</button>
          <button data-btn="right" style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);color:#fff;font-size:24px;touch-action:none;">▶</button>
        </div>
        <div style="display:flex;gap:12px;pointer-events:auto;">
          <button data-btn="turbo" style="width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid rgba(255,255,255,0.4);color:#ffe66d;font-size:20px;margin-top:8px;touch-action:none;">⚡</button>
          <button data-btn="jump" style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.5);color:#fff;font-size:28px;touch-action:none;">⤒</button>
        </div>
      `;
      root.append(touchControls);
    }

    host.replaceChildren(root);
    canvas.focus({ preventScroll: true });

    const ctx = canvas.getContext('2d');
    const audio = createPelicanAudio(() => services.sound.muted);

    let SC = 1;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
      const w = Math.max(320, rect.width || W);
      const h = Math.max(180, rect.height || H);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      SC = canvas.width / W;
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    resize();

    // Game state
    let state: 'title' | 'playing' | 'paused' | 'levelclear' | 'gameover' | 'victory' = 'title';
    let curLv = 0, score = 0, hiScore = services.storage.get<number>('hiscore', 0);
    let grid: string[][] = [], cols = 0, worldW = 0;
    let items: Item[] = [], enemies: Enemy[] = [], movers: Mover[] = [], crumbles: Crumble[] = [], springs: Spring[] = [], checks: Checkpoint[] = [], goal: Goal | null = null;
    let particles: Particle[] = [], popups: Popup[] = [];
    let spawnX = 80, spawnY = 300, lvTime = 0, fishGot = 0, fishTot = 0, starGot = 0, starTot = 0;
    let camX = 0, shakeT = 0, shakeM = 0, bannerT = 0, bannerStr = '';
    let gtime = 0;

    const P = {
      x: 80, y: 300, vx: 0, vy: 0, dir: 1,
      ground: false, coyote: 0, jbuf: 0, jumps: 0,
      stamina: MAXST, gliding: false, turbo: false,
      hp: 3, maxHp: 3, inv: 0, hurtT: 0, dead: false, deadT: 0,
      wheel: 0, pedal: 0, tilt: 0, pouch: 0, flap: 0, sx: 1, sy: 1,
      streak: 0, streakT: 0, riding: null as Mover | null
    };

    function shake(mag: number, dur: number) { shakeM = Math.max(shakeM, mag); shakeT = Math.max(shakeT, dur); }
    function addPopup(x: number, y: number, txt: string, col = '#fff', sz = 18) { popups.push({ x, y, vy: -55, txt, col, sz, t: 0, d: 0.9 }); }
    function emit(x: number, y: number, n: number, opt: any) {
      for (let i = 0; i < n; i++) {
        const a = (opt.ang ?? 0) + rand(-(opt.sp ?? Math.PI), opt.sp ?? Math.PI);
        const v = rand(opt.v0 ?? 40, opt.v1 ?? 160);
        particles.push({
          x: x + rand(-4, 4), y: y + rand(-4, 4),
          vx: Math.cos(a) * v + (opt.vx || 0), vy: Math.sin(a) * v + (opt.vy || 0),
          g: opt.g ?? 420, sz: rand(opt.s0 ?? 3, opt.s1 ?? 7),
          col: Array.isArray(opt.col) ? opt.col[i % opt.col.length] : (opt.col || '#fff'),
          t: 0, d: rand(opt.d0 ?? 0.3, opt.d1 ?? 0.65)
        });
      }
    }

    function resetPlayer() {
      P.x = spawnX; P.y = spawnY; P.vx = 0; P.vy = 0; P.dir = 1;
      P.ground = false; P.coyote = 0; P.jbuf = 0; P.jumps = 0;
      P.stamina = MAXST; P.gliding = false; P.turbo = false;
      P.hp = P.maxHp; P.inv = 1.0; P.hurtT = 0; P.dead = false; P.deadT = 0;
      P.tilt = 0; P.pouch = 0; P.sx = 1; P.sy = 1; P.streak = 0; P.streakT = 0; P.riding = null;
      camX = clamp(P.x - W * 0.32, 0, Math.max(0, worldW - W));
    }

    function loadLevel(idx: number, keepCheck: boolean) {
      curLv = idx;
      audio.setTheme(LEVELS[idx].theme);
      const rows = buildRows(idx, services.random);
      cols = rows[0].length; worldW = cols * T;
      grid = Array.from({ length: ROWS }, () => new Array(cols).fill('.'));
      items = []; enemies = []; movers = []; crumbles = []; springs = []; checks = [];
      particles = []; popups = [];
      if (!keepCheck) { fishGot = 0; fishTot = 0; starGot = 0; starTot = 0; lvTime = 0; }
      let defX = 80, defY = 300;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = rows[r][c], wx = c * T, wy = r * T;
          if (ch === '#' || ch === 'B' || ch === '=' || ch === '^') {
            grid[r][c] = ch;
          } else if (ch === 'x') {
            grid[r][c] = 'x';
            crumbles.push({ r, c, x: wx, y: wy, state: 0, t: 0 });
          } else if (ch === 'P') {
            defX = wx; defY = wy - PH;
          } else if (ch === 'o') {
            items.push({ type: 'fish', x: wx + 20, y: wy + 20, ph: (c + r) * 0.5, got: false });
            if (!keepCheck) fishTot++;
          } else if (ch === '*') {
            items.push({ type: 'star', x: wx + 20, y: wy + 20, ph: c * 0.3, got: false });
            if (!keepCheck) starTot++;
          } else if (ch === 'S') {
            springs.push({ x: wx + 4, y: wy + 16, w: 32, h: 24, comp: 0 });
          } else if (ch === 'C') {
            checks.push({ x: wx + 8, y: wy - 24, w: 24, h: 64, active: keepCheck && spawnX > wx - 20 });
          } else if (ch === 'F') {
            goal = { x: wx + 20, y: wy + 40 };
          } else if (ch === 'c') {
            enemies.push({ type: 'crab', x: wx + 4, y: wy + 12, w: 32, h: 28, vx: -65, vy: 0, dir: -1, dead: false, t: c });
          } else if (ch === 'g') {
            enemies.push({ type: 'gull', x: wx, y: wy, baseX: wx, baseY: wy, w: 36, h: 26, vx: -95, vy: 0, dir: -1, dead: false, t: c * 0.7 });
          } else if (ch === 'j') {
            enemies.push({ type: 'jelly', x: wx + 5, y: WATER_Y, baseY: wy - 70, w: 30, h: 34, vx: 0, vy: 0, dir: 1, state: 'wait', t: (c % 5) * 0.4, dead: false });
          } else if (ch === 'h') {
            movers.push({ x: wx, y: wy, ox: wx, oy: wy, w: 96, h: 18, dx: 180, dy: 0, sp: 1.5, t: 0, vx: 0, vy: 0 });
          } else if (ch === 'v') {
            movers.push({ x: wx, y: wy, ox: wx, oy: wy, w: 88, h: 18, dx: 0, dy: -165, sp: 1.6, t: 0, vx: 0, vy: 0 });
          }
        }
      }
      if (!keepCheck) { spawnX = defX; spawnY = defY; }
      resetPlayer();
      bannerStr = isZh ? LEVELS[idx].name : LEVELS[idx].nameEn;
      bannerT = 2.6;
    }

    const isSolid = (r: number, c: number) => {
      if (r < 0) return false;
      if (r >= ROWS || c < 0 || c >= cols) return c < 0 || c >= cols;
      const ch = grid[r][c];
      return ch === '#' || ch === 'B' || ch === 'x';
    };
    const isOneWay = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < cols && grid[r][c] === '=';
    const isSpike = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < cols && grid[r][c] === '^';

    function hurtPlayer(reason: string) {
      if (P.inv > 0 || P.dead) return;
      P.hp--; P.streak = 0; P.pouch = 0.4;
      shake(9, 0.28);
      emit(P.x + PW / 2, P.y + 18, 12, { col: ['#fff', '#f4d35e', '#ee6c4d'], s0: 4, s1: 8, v0: 70, v1: 210 });
      if (P.hp <= 0) {
        killPlayer(reason);
      } else {
        audio.hurt();
        P.inv = 1.5; P.hurtT = 0.25;
        P.vy = -370; P.vx = -P.dir * 200; P.ground = false;
      }
    }

    function killPlayer(reason: string) {
      if (P.dead) return;
      P.dead = true; P.deadT = 1.25; P.vy = -440; P.vx = 0;
      shake(12, 0.35);
      if (reason === 'water') {
        audio.splash();
        emit(P.x + PW / 2, WATER_Y, 26, { col: ['#9fe6ff', '#ffffff', '#3aa8dd'], ang: -Math.PI / 2, sp: 0.9, v0: 120, v1: 320, g: 520 });
      } else {
        audio.over();
        emit(P.x + PW / 2, P.y + PH / 2, 22, { col: ['#fff', '#ff6b6b', '#ffd166'], v0: 90, v1: 280 });
      }
    }

    function addScore(pts: number, x: number, y: number, label?: string | false) {
      score += pts;
      services.reportScore(score);
      if (score > hiScore) {
        hiScore = score;
        services.storage.set('hiscore', hiScore);
      }
      if (label !== false) addPopup(x, y, label || ('+' + pts), '#ffe66d', 17);
    }

    // Input state
    const keys = { left: false, right: false, jump: false, turbo: false, down: false };
    let jumpPressed = false;

    function handleActionKey() {
      if (state === 'title') {
        audio.click(); score = 0; loadLevel(0, false); state = 'playing';
      } else if (state === 'levelclear') {
        audio.click();
        if (curLv + 1 < LEVELS.length) { loadLevel(curLv + 1, false); state = 'playing'; }
        else { state = 'victory'; audio.win(); services.reportComplete(3); }
      } else if (state === 'gameover' || state === 'victory') {
        audio.click(); score = 0; loadLevel(0, false); state = 'playing';
      }
    }

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') keys.left = down;
      if (c === 'ArrowRight' || c === 'KeyD') keys.right = down;
      if (c === 'ArrowDown' || c === 'KeyS') keys.down = down;
      if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyX' || c === 'KeyJ') keys.turbo = down;
      if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW' || c === 'KeyZ' || c === 'KeyK') {
        if (down && !keys.jump) jumpPressed = true;
        keys.jump = down;
        e.preventDefault();
      }
      if (down) {
        if (c === 'KeyR' && state === 'playing') { audio.click(); loadLevel(curLv, true); }
        if (c === 'KeyP' && (state === 'playing' || state === 'paused')) {
          audio.click(); state = state === 'playing' ? 'paused' : 'playing';
        }
        if (c === 'Enter' || c === 'Space') handleActionKey();
      }
    };

    const keydownHandler = (e: KeyboardEvent) => onKey(e, true);
    const keyupHandler = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', keydownHandler);
    window.addEventListener('keyup', keyupHandler);

    // Touch controls binding
    if (touchControls) {
      const bindBtn = (name: string, prop: keyof typeof keys, isJmp = false) => {
        const b = touchControls!.querySelector(`[data-btn="${name}"]`) as HTMLButtonElement | null;
        if (!b) return;
        const set = (v: boolean, ev: Event) => {
          ev.preventDefault();
          if (state !== 'playing' && v) { handleActionKey(); return; }
          if (isJmp && v && !keys.jump) jumpPressed = true;
          keys[prop] = v;
          b.style.background = v ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
        };
        b.addEventListener('pointerdown', (e) => set(true, e));
        b.addEventListener('pointerup', (e) => set(false, e));
        b.addEventListener('pointercancel', (e) => set(false, e));
      };
      bindBtn('left', 'left');
      bindBtn('right', 'right');
      bindBtn('turbo', 'turbo');
      bindBtn('jump', 'jump', true);
    }

    const pointerHandler = () => {
      if (state !== 'playing') handleActionKey();
    };
    canvas.addEventListener('pointerdown', pointerHandler);

    function triggerCrumble(r: number, c: number) {
      for (const cr of crumbles) {
        if (cr.r === r && cr.c === c && cr.state === 0) { cr.state = 1; cr.t = 0.38; break; }
      }
    }

    function update(dt: number) {
      gtime += dt;
      audio.step(state);
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (bannerT > 0) bannerT = Math.max(0, bannerT - dt);

      if (state !== 'playing') { jumpPressed = false; return; }
      lvTime += dt;

      for (const m of movers) {
        m.t += dt * m.sp;
        const nx = m.ox + Math.sin(m.t) * m.dx;
        const ny = m.oy + (1 - Math.cos(m.t)) * 0.5 * m.dy;
        m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt;
        m.x = nx; m.y = ny;
      }

      for (const cr of crumbles) {
        if (cr.state === 1) {
          cr.t -= dt;
          if (cr.t <= 0) {
            cr.state = 2; cr.t = 3.2; grid[cr.r][cr.c] = '.';
            audio.crumble();
            emit(cr.x + 20, cr.y + 20, 12, { col: ['#c9935b', '#9e6b3b', '#e5bb7b'], v0: 40, v1: 150 });
          }
        } else if (cr.state === 2) {
          cr.t -= dt;
          if (cr.t <= 0 && !overlap(P.x, P.y, PW, PH, cr.x, cr.y, T, T)) {
            cr.state = 0; grid[cr.r][cr.c] = 'x';
          }
        }
      }

      for (const sp of springs) if (sp.comp > 0) sp.comp = Math.max(0, sp.comp - dt * 3.5);

      if (P.dead) {
        P.vy += 1100 * dt; P.y += P.vy * dt; P.tilt += 7 * dt;
        P.deadT -= dt;
        if (P.deadT <= 0) {
          loadLevel(curLv, true);
        }
        updateParticles(dt);
        jumpPressed = false;
        return;
      }

      if (P.inv > 0) P.inv = Math.max(0, P.inv - dt);
      if (P.hurtT > 0) P.hurtT = Math.max(0, P.hurtT - dt);
      if (P.pouch > 0) P.pouch = Math.max(0, P.pouch - dt * 2.4);
      if (P.streakT > 0) { P.streakT -= dt; if (P.streakT <= 0) P.streak = 0; }
      P.sx = lerp(P.sx, 1, dt * 12); P.sy = lerp(P.sy, 1, dt * 12);

      if (P.riding) { P.x += P.riding.vx * dt; P.y += P.riding.vy * dt; }

      const inDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (inDir !== 0 && P.hurtT <= 0) P.dir = inDir;

      P.turbo = keys.turbo && P.stamina > 0.08 && inDir !== 0 && P.hurtT <= 0;
      if (P.turbo) {
        P.stamina = Math.max(0, P.stamina - dt * 0.55);
        if (Math.random() < 0.55) emit(P.x + (P.dir > 0 ? 0 : PW), P.y + PH - 6, 1, { col: ['#ffd166', '#ff8c42', '#fff'], s0: 3, s1: 6, v0: 20, v1: 60, g: -40, d0: 0.18, d1: 0.32 });
      }
      const maxSpd = P.turbo ? 435 : 300;
      const accel = P.ground ? 1650 : 1050;
      const fric = P.ground ? 1350 : 260;

      if (P.hurtT <= 0) {
        if (inDir !== 0) {
          if (P.vx * inDir < 0) P.vx += inDir * accel * 1.65 * dt;
          else P.vx += inDir * accel * dt;
          P.vx = clamp(P.vx, -maxSpd, maxSpd);
        } else {
          if (Math.abs(P.vx) <= fric * dt) P.vx = 0;
          else P.vx -= Math.sign(P.vx) * fric * dt;
        }
      }

      if (P.ground) {
        P.coyote = 0.11; P.jumps = 0;
        if (!P.turbo) P.stamina = Math.min(MAXST, P.stamina + dt * 0.95);
      } else {
        P.coyote = Math.max(0, P.coyote - dt);
      }
      if (jumpPressed) { P.jbuf = 0.12; jumpPressed = false; }
      else P.jbuf = Math.max(0, P.jbuf - dt);

      if (P.jbuf > 0) {
        if (keys.down && P.ground) {
          const br = Math.floor((P.y + PH + 2) / T);
          const c0 = Math.floor((P.x + 4) / T), c1 = Math.floor((P.x + PW - 4) / T);
          if (isOneWay(br, c0) || isOneWay(br, c1)) { P.y += 6; P.ground = false; P.jbuf = 0; }
        }
        if (P.jbuf > 0 && P.coyote > 0) {
          P.vy = -515; P.ground = false; P.coyote = 0; P.jbuf = 0; P.jumps = 1; P.riding = null;
          P.sx = 0.8; P.sy = 1.24;
          audio.jump();
          emit(P.x + PW / 2, P.y + PH, 7, { col: ['#fff', '#f2d49b'], ang: -Math.PI / 2, sp: 1.1, v0: 40, v1: 110, g: 260, d0: 0.2, d1: 0.4 });
        } else if (P.jbuf > 0 && P.jumps < 2 && P.stamina >= 0.22) {
          P.vy = -455; P.jumps = 2; P.jbuf = 0; P.stamina = Math.max(0, P.stamina - 0.28);
          P.sx = 1.22; P.sy = 0.82; P.flap = 1;
          audio.jump(); audio.flap();
          emit(P.x + PW / 2, P.y + PH - 10, 9, { col: ['#fff', '#cde8ff'], ang: Math.PI / 2, sp: 0.9, v0: 60, v1: 150, g: 120, d0: 0.25, d1: 0.45 });
        }
      }
      if (!keys.jump && P.vy < -210) P.vy *= 0.58;

      P.gliding = !P.ground && P.vy > 0 && keys.jump && P.stamina > 0;
      if (P.gliding) {
        P.stamina = Math.max(0, P.stamina - dt * 0.42);
        P.vy = Math.min(P.vy + 420 * dt, 125);
        P.flap += dt * 16;
        if (Math.random() < 0.3) emit(P.x + PW / 2, P.y + 20, 1, { col: '#fff', s0: 2, s1: 4, v0: 10, v1: 35, g: 30, d0: 0.25, d1: 0.45 });
      } else {
        P.vy = Math.min(P.vy + 1380 * dt, 780);
      }

      P.x += P.vx * dt;
      if (P.x < 0) { P.x = 0; P.vx = 0; }
      const rTop = Math.floor((P.y + 4) / T), rBot = Math.floor((P.y + PH - 4) / T);
      if (P.vx > 0) {
        const cRight = Math.floor((P.x + PW) / T);
        for (let r = rTop; r <= rBot; r++) {
          if (isSolid(r, cRight)) { P.x = cRight * T - PW; P.vx = 0; break; }
        }
      } else if (P.vx < 0) {
        const cLeft = Math.floor(P.x / T);
        for (let r = rTop; r <= rBot; r++) {
          if (isSolid(r, cLeft)) { P.x = (cLeft + 1) * T; P.vx = 0; break; }
        }
      }

      const prevBottom = P.y + PH;
      const wasGround = P.ground;
      P.y += P.vy * dt;
      P.ground = false; P.riding = null;

      const cL = Math.floor((P.x + 5) / T), cR = Math.floor((P.x + PW - 5) / T);
      if (P.vy >= 0) {
        const rB = Math.floor((P.y + PH) / T);
        for (let c = cL; c <= cR; c++) {
          if (isSolid(rB, c) || (isOneWay(rB, c) && prevBottom <= rB * T + 10 && !keys.down)) {
            P.y = rB * T - PH; P.vy = 0; P.ground = true;
            if (grid[rB]?.[c] === 'x') triggerCrumble(rB, c);
          }
        }
        for (const m of movers) {
          if (P.x + PW - 4 > m.x && P.x + 4 < m.x + m.w && prevBottom <= m.y + 12 && P.y + PH >= m.y && P.y + PH <= m.y + m.h + 14) {
            P.y = m.y - PH; P.vy = 0; P.ground = true; P.riding = m;
            break;
          }
        }
        if (P.ground && !wasGround) {
          P.sx = 1.18; P.sy = 0.84;
          emit(P.x + PW / 2, P.y + PH, 5, { col: ['#fff', '#e5bb7b'], ang: -Math.PI / 2, sp: 1.2, v0: 25, v1: 80, g: 240, d0: 0.15, d1: 0.3 });
        }
      } else {
        const rT = Math.floor(P.y / T);
        for (let c = cL; c <= cR; c++) {
          if (isSolid(rT, c)) {
            P.y = (rT + 1) * T; P.vy = 0;
            if (grid[rT]?.[c] === 'B') {
              grid[rT][c] = '.'; audio.stomp(); addScore(50, c * T + 20, rT * T, '+50');
              emit(c * T + 20, rT * T + 20, 14, { col: ['#d99b52', '#a46830', '#ffe1a8'], v0: 60, v1: 200 });
            }
            break;
          }
        }
      }

      P.wheel += P.vx * dt * 0.095;
      P.pedal += P.vx * dt * 0.055;
      const targetTilt = P.ground ? (P.turbo ? P.dir * 0.14 : 0) : clamp(P.vy * 0.0007 * P.dir, -0.38, 0.38);
      P.tilt = lerp(P.tilt, targetTilt, dt * 10);

      if (P.y + PH > WATER_Y + 14) { killPlayer('water'); return; }
      const sr0 = Math.floor((P.y + 10) / T), sr1 = Math.floor((P.y + PH - 4) / T);
      const sc0 = Math.floor((P.x + 6) / T), sc1 = Math.floor((P.x + PW - 6) / T);
      for (let r = sr0; r <= sr1; r++) for (let c = sc0; c <= sc1; c++) if (isSpike(r, c)) hurtPlayer('spike');

      for (const sp of springs) {
        if (overlap(P.x, P.y, PW, PH, sp.x, sp.y, sp.w, sp.h) && P.vy >= -50) {
          P.vy = -790; P.ground = false; P.coyote = 0; P.jumps = 1; P.stamina = MAXST;
          P.sx = 0.72; P.sy = 1.35; sp.comp = 1;
          audio.spring(); shake(5, 0.15);
          emit(sp.x + 16, sp.y + 8, 12, { col: ['#ff6b6b', '#ffd166', '#fff'], ang: -Math.PI / 2, sp: 0.8, v0: 80, v1: 220 });
        }
      }

      for (const ck of checks) {
        if (!ck.active && overlap(P.x, P.y, PW, PH, ck.x, ck.y, ck.w, ck.h)) {
          ck.active = true; spawnX = ck.x - 6; spawnY = ck.y + ck.h - PH;
          P.hp = P.maxHp; P.stamina = MAXST;
          audio.check(); addPopup(ck.x + 12, ck.y - 10, isZh ? '存档点！生命回满' : 'CHECKPOINT! FULL HP', '#7ae582', 18);
          emit(ck.x + 12, ck.y + 10, 18, { col: ['#7ae582', '#ffd166', '#fff'], v0: 60, v1: 200 });
        }
      }

      for (const it of items) {
        if (it.got) continue;
        const dx = (P.x + PW / 2) - it.x, dy = (P.y + PH / 2) - it.y;
        if (dx * dx + dy * dy < 32 * 32) {
          it.got = true; P.pouch = 1;
          if (it.type === 'fish') {
            fishGot++; P.streak++; P.streakT = 2.2;
            P.stamina = Math.min(MAXST, P.stamina + 0.22);
            const mult = Math.min(4, 1 + Math.floor(P.streak / 5));
            const pts = 100 * mult;
            audio.fish();
            addScore(pts, it.x, it.y - 10, mult > 1 ? `+${pts} (${mult}x!)` : '+100');
            emit(it.x, it.y, 9, { col: ['#ff9f1c', '#ffbf69', '#ffffff'], v0: 50, v1: 150, d0: 0.2, d1: 0.45 });
            if (fishGot % 25 === 0 && P.hp < P.maxHp) {
              P.hp++; audio.oneup(); addPopup(P.x + PW / 2, P.y - 16, isZh ? '❤️ 生命 +1' : '❤️ HP +1', '#ff6b6b', 20);
            }
          } else {
            starGot++; P.stamina = MAXST;
            audio.star(); addScore(500, it.x, it.y - 12, '★ +500!');
            emit(it.x, it.y, 20, { col: ['#ffe66d', '#fff', '#ff9f1c'], v0: 80, v1: 240 });
          }
        }
      }

      for (const e of enemies) {
        if (e.dead) { e.y += e.vy * dt; e.vy += 980 * dt; continue; }
        if (Math.abs(e.x - P.x) > W * 1.1) continue;
        e.t += dt;
        if (e.type === 'crab') {
          e.x += e.vx * dt;
          const fc = Math.floor((e.x + (e.vx > 0 ? e.w + 2 : -2)) / T);
          const fr = Math.floor((e.y + e.h / 2) / T);
          const gr = Math.floor((e.y + e.h + 4) / T);
          if (isSolid(fr, fc) || isSpike(fr, fc) || (!isSolid(gr, fc) && !isOneWay(gr, fc))) {
            e.vx = -e.vx; e.dir = Math.sign(e.vx);
          }
        } else if (e.type === 'gull') {
          e.x += e.vx * dt;
          if (Math.abs(e.x - (e.baseX ?? e.x)) > 150) { e.vx = -e.vx; e.dir = Math.sign(e.vx); }
          e.y = (e.baseY ?? e.y) + Math.sin(e.t * 3.4) * 26;
        } else if (e.type === 'jelly') {
          if (e.state === 'wait') {
            e.y = WATER_Y + 6;
            if (e.t > 1.35) { e.state = 'jump'; e.vy = -590; audio.splash(); }
          } else {
            e.y += e.vy * dt; e.vy += 680 * dt;
            if (e.y >= WATER_Y + 6 && e.vy > 0) { e.state = 'wait'; e.t = 0; }
          }
        }

        if (overlap(P.x + 3, P.y + 3, PW - 6, PH - 6, e.x, e.y, e.w, e.h)) {
          const stomp = P.vy > 40 && (P.y + PH - P.vy * dt) <= e.y + 18 && e.type !== 'jelly';
          if (stomp) {
            e.dead = true; e.vy = -220;
            P.vy = keys.jump ? -510 : -390; P.jumps = 1; P.stamina = Math.min(MAXST, P.stamina + 0.35);
            P.sx = 1.2; P.sy = 0.8;
            audio.stomp(); shake(5, 0.14);
            addScore(200, e.x + e.w / 2, e.y, isZh ? '踩扁! +200' : 'STOMP! +200');
            emit(e.x + e.w / 2, e.y + e.h / 2, 14, { col: ['#ff6b6b', '#ffd166', '#fff'], v0: 70, v1: 200 });
          } else {
            hurtPlayer('enemy');
          }
        }
      }

      if (goal && Math.abs((P.x + PW / 2) - goal.x) < 42 && Math.abs((P.y + PH) - goal.y) < 110) {
        audio.win();
        const timeBonus = Math.max(0, Math.round((LEVELS[curLv].par - lvTime) * 15));
        addScore(1000 + timeBonus, goal.x, goal.y - 60, isZh ? `过关! +${1000 + timeBonus}` : `CLEAR! +${1000 + timeBonus}`);
        state = 'levelclear';
      }

      const look = P.dir * 85 + P.vx * 0.18;
      const targetCam = clamp(P.x - W * 0.36 + look, 0, Math.max(0, worldW - W));
      camX = lerp(camX, targetCam, 1 - Math.exp(-dt * 7.5));

      updateParticles(dt);
    }

    function updateParticles(dt: number) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += dt; if (p.t >= p.d) { particles.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.t += dt; if (p.t >= p.d) { popups.splice(i, 1); continue; }
        p.y += p.vy * dt; p.vy *= 0.94;
      }
    }

    function render() {
      if (!ctx) return;
      ctx.setTransform(SC, 0, 0, SC, 0, 0);
      const curTheme = LEVELS[curLv].theme;
      const th = THEMES[curTheme];
      drawBackground(ctx, curTheme, camX, gtime);

      ctx.save();
      const sx = shakeT > 0 ? (Math.random() - 0.5) * shakeM * 2 : 0;
      const sy = shakeT > 0 ? (Math.random() - 0.5) * shakeM * 2 : 0;
      ctx.translate(-Math.round(camX) + sx, sy);

      const c0 = Math.max(0, Math.floor(camX / T) - 1);
      const c1 = Math.min(cols - 1, Math.ceil((camX + W) / T) + 1);
      for (let r = 0; r < ROWS; r++) {
        for (let c = c0; c <= c1; c++) {
          if (grid[r]?.[c] && grid[r][c] !== '.' && grid[r][c] !== 'x') {
            drawTile(ctx, grid, r, c, c * T, r * T, th, gtime);
          }
        }
      }

      drawEntities(ctx, goal, checks, springs, movers, crumbles, items, enemies, camX, gtime, isZh);
      drawPelican(ctx, P, gtime);

      for (const p of particles) {
        ctx.globalAlpha = 1 - p.t / p.d;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * (1 - p.t / p.d * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const p of popups) {
        ctx.globalAlpha = 1 - p.t / p.d;
        ctx.font = `800 ${p.sz}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#141b2d';
        ctx.lineWidth = 3;
        ctx.strokeText(p.txt, p.x, p.y);
        ctx.fillStyle = p.col;
        ctx.fillText(p.txt, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      drawWater(ctx, th, camX, gtime);
      drawHUD(ctx, P, fishGot, fishTot, starGot, starTot, score, curLv, isZh ? LEVELS[curLv].name : LEVELS[curLv].nameEn, goal, state, bannerT, bannerStr, isZh);
      drawOverlay(ctx, state, isZh ? LEVELS[curLv].name : LEVELS[curLv].nameEn, fishGot, fishTot, starGot, starTot, lvTime, score, hiScore, gtime, isZh);
    }

    loadLevel(0, false);
    state = 'title';

    let raf = 0;
    let lastT = performance.now();
    function loop(now: number) {
      const dt = Math.min(0.033, (now - lastT) / 1000);
      lastT = now;
      if (state === 'title') {
        camX = (gtime * 45) % Math.max(1, worldW - W);
      }
      update(dt);
      render();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      pause() {
        if (state === 'playing') state = 'paused';
      },
      resume() {
        if (state === 'paused') state = 'playing';
      },
      restart() {
        score = 0;
        loadLevel(0, false);
        state = 'playing';
      },
      destroy() {
        cancelAnimationFrame(raf);
        ro?.disconnect();
        window.removeEventListener('keydown', keydownHandler);
        window.removeEventListener('keyup', keyupHandler);
        canvas.removeEventListener('pointerdown', pointerHandler);
        audio.destroy();
        host.replaceChildren();
      }
    };
  }
};

export default pelicanBike;
