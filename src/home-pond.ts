import { PALETTE, drawFrog, drawGrudge, type Face } from './games/shove-pond/frog-art';

/**
 * The home hero: Shove Pond's joke in five seconds, on a loop. Green hops into orange, orange goes into the pond
 * (+1 for green), climbs back with duckweed on its head and glares; green whistles. Same frogs as the game
 * (`frog-art.ts`). Pauses off screen and in a hidden tab; reduced motion gets one still frame.
 */
const LOOP = 5.6;
const TILT = 0.86;
const GREEN = PALETTE[0], ORANGE = PALETTE[1], PURPLE = PALETTE[2];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const smooth = (p: number) => p * p * (3 - 2 * p);
const outCubic = (p: number) => 1 - (1 - p) ** 3;
const inCubic = (p: number) => p ** 3;
const outBack = (p: number, k = 1.6) => 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2;

type Drop = { x: number; y: number; vx: number; vy: number; r: number; c: string };

export function mountHomePond(link: HTMLElement): () => void {
  const canvas = link.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return () => undefined;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, cell = 60, ox = 0, oy = 0, raf = 0, visible = true, t0 = performance.now();
  let drops: Drop[] = [];

  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Three pads by two, plus one cell of open water on the right for orange to land in.
    cell = Math.min(W / 4.4, H / (2 * TILT + 0.9), 90);
    ox = (W - cell * 3.7) / 2;
    oy = (H - cell * 2 * TILT) / 2 + cell * 0.12;
  };
  const sx = (x: number) => ox + (x + 0.5) * cell;
  const sy = (y: number) => oy + (y + 0.5) * cell * TILT;

  function pad(x: number, y: number) {
    const cx = sx(x), cy = sy(y), rx = cell * 0.46, ry = rx * TILT, rot = ((x * 7 + y * 13) % 8) * 0.7;
    ctx!.fillStyle = 'rgba(0, 20, 26, 0.45)'; ctx!.beginPath(); ctx!.ellipse(cx, cy + cell * 0.07, rx, ry, 0, 0, Math.PI * 2); ctx!.fill();
    ctx!.fillStyle = '#3fae5a'; ctx!.beginPath(); ctx!.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx!.fill();
    ctx!.fillStyle = '#5ccc72'; ctx!.beginPath(); ctx!.ellipse(cx - rx * 0.08, cy - ry * 0.1, rx * 0.78, ry * 0.72, 0, 0, Math.PI * 2); ctx!.fill();
    ctx!.fillStyle = '#0c3442'; ctx!.beginPath(); ctx!.moveTo(cx, cy); ctx!.ellipse(cx, cy, rx + 1, ry + 1, 0, rot, rot + 0.42); ctx!.closePath(); ctx!.fill();
  }

  function frog(pal: typeof GREEN, x: number, y: number, z: number, squash: number, face: Face, lookX: number, lookY: number, alpha = 1, extra?: { grudge?: boolean }) {
    const s = cell * 0.5, c = ctx!;
    c.save();
    c.globalAlpha = alpha;
    const px = sx(x), py = sy(y);
    const shrink = clamp(1 - z / (cell * 3), 0.25, 1);
    c.fillStyle = 'rgba(0, 0, 0, 0.28)'; c.beginPath(); c.ellipse(px, py + s * 0.18, s * 0.5 * shrink, s * 0.24 * shrink, 0, 0, Math.PI * 2); c.fill();
    c.translate(px, py - z);
    c.scale(1 + squash * 0.22, 1 - squash * 0.22);
    drawFrog(c, s, pal, { face, lookX, lookY, pattern: pal === ORANGE ? 1 : pal === PURPLE ? 2 : 0, drip: reduced ? -1 : ((performance.now() / 500) % 1) });
    if (extra?.grudge) drawGrudge(c, s * 0.42, -s * 0.58, s);
    c.restore();
  }

  function splash(x: number, y: number) {
    if (reduced) return;
    drops = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2, v = cell * (1.1 + (i % 3) * 0.45);
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - cell * 2.1, r: cell * 0.05 + (i % 3), c: i % 2 ? '#d7f6ff' : '#8fd8f0' };
    });
  }

  let lastT = -1, splashed = false;
  function draw(t: number, dt: number) {
    const c = ctx!;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d3b4c'); g.addColorStop(1, '#0a2733');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(160, 230, 255, 0.07)'; c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = ((i * 71 + t * 9) % (H + 30)) - 15;
      c.beginPath(); for (let x = 0; x <= W; x += 16) c.lineTo(x, y + Math.sin(x / 40 + t + i) * 3); c.stroke();
    }
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) pad(x, y);

    // Loop restarts: the splash may fire again.
    if (t < lastT) splashed = false;
    lastT = t;
    // Frogs fade out and back in across the loop seam.
    const seam = t < 0.3 ? smooth(seg(t, 0, 0.3)) : t > LOOP - 0.35 ? 1 - seg(t, LOOP - 0.35, LOOP) : 1;

    // Purple, bottom left: a spectator who turns to stare at green after the splash.
    const stare = t > 1.8 && t < 4.4;
    frog(PURPLE, 0, 1, 0, 0, t > 1.25 && t < 1.8 ? 'shock' : 'idle', stare ? 0.05 : 0, stare ? -0.04 : 0.03, seam);

    // Green: crouch, hop into orange, smug, then whistles innocently.
    let gx = 1, gz = 0, gsq = 0;
    if (t < 0.5) gsq = 0.6 * outCubic(seg(t, 0, 0.5));
    else if (t < 0.76) { const p = seg(t, 0.5, 0.76); gx = 1 + 0.55 * smooth(p); gz = Math.sin(Math.PI * p * 0.85) * cell * 0.36; gsq = -0.3; }
    else if (t < 0.88) { gx = 1.55; gz = cell * 0.05; gsq = 0.5; }
    else if (t < 1.1) { const p = seg(t, 0.88, 1.1); gx = 1.55 + 0.45 * smooth(p); gsq = 0.5 * (1 - p); }
    else gx = 2;
    let gface: Face = 'idle', glx = 0.05, gly = 0;
    if (t > 1.25 && t < 2.6) { gface = 'smug'; glx = -0.03; }
    else if (t > 3.4) { glx = 0.06; gly = -0.04; } // looks away
    frog(GREEN, gx, 0, gz, gsq, gface, glx, gly, seam);
    if (t > 3.5 && t < LOOP - 0.4) {
      // Whistling: a note drifts up from green.
      const p = ((t - 3.5) % 0.9) / 0.9;
      c.save(); c.globalAlpha = (1 - p) * seam; c.fillStyle = '#d7f6ff';
      c.font = `700 ${Math.round(cell * 0.32)}px system-ui, sans-serif`; c.textAlign = 'center';
      c.fillText('♪', sx(gx) + cell * 0.36 + p * cell * 0.15, sy(0) - cell * 0.42 - p * cell * 0.35); c.restore();
    }

    // Orange: looks away, gets shoved (shock), falls in; drops back on green's old pad and glares.
    if (t < 1.25) {
      let ox2 = 2, oz = 0, alpha = 1;
      if (t > 0.88) { const p = seg(t, 0.88, 1.25); ox2 = 2 + 0.8 * outCubic(Math.min(1, p * 1.4)); oz = -inCubic(p) * cell * 0.3; alpha = 1 - inCubic(p); }
      frog(ORANGE, ox2, 0, oz, 0, t > 0.76 ? 'shock' : 'idle', t > 0.76 ? 0 : 0.05, t > 0.76 ? 0 : -0.03, alpha * seam);
    } else if (t > 2.6) {
      const p = seg(t, 2.6, 3.05);
      const oz = (1 - outBack(p)) * cell * 2.2;
      const glare = t > 3.05;
      frog(ORANGE, 1, 0, Math.max(-cell * 0.05, oz), p > 0.9 && t < 3.15 ? 0.5 : 0, 'sulk', glare ? 0.06 : 0, 0, seam, { grudge: t > 3.4 });
    }
    if (t >= 1.25 && !splashed) { splashed = true; splash(sx(3), sy(0)); }

    // Rings, droplets and the +1.
    if (t > 1.25 && t < 2.4) {
      for (const [d, m] of [[0, 0.95], [0.14, 1.25]] as const) {
        const p = seg(t, 1.25 + d, 2.05 + d);
        if (p <= 0 || p >= 1) continue;
        c.strokeStyle = `rgba(215, 246, 255, ${0.8 * (1 - p)})`; c.lineWidth = 2;
        c.beginPath(); c.ellipse(sx(3), sy(0), cell * m * p, cell * m * p * TILT * 0.7, 0, 0, Math.PI * 2); c.stroke();
      }
      const k = seg(t, 1.25, 2.35), pop = 1 + 0.4 * Math.sin(Math.PI * seg(t, 1.25, 1.51));
      c.save(); c.globalAlpha = 1 - k * k; c.fillStyle = GREEN.body; c.strokeStyle = '#06141a'; c.lineWidth = 4;
      c.font = `900 ${Math.round(cell * 0.46 * pop)}px system-ui, sans-serif`; c.textAlign = 'center';
      const px = Math.min(sx(3), W - cell * 0.4), py = Math.max(cell * 0.42, sy(0) - cell * 0.45 - k * cell * 0.5);
      c.strokeText('+1', px, py); c.fillText('+1', px, py); c.restore();
    }
    for (const q of drops) { q.vy += cell * 9 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    drops = drops.filter(q => q.y < H + 10 && t < 2.2);
    for (const q of drops) { c.fillStyle = q.c; c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.fill(); }
  }

  let last = 0;
  function frame(now: number) {
    raf = 0;
    if (!visible || document.hidden || !link.isConnected) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    draw(((now - t0) / 1000) % LOOP, dt);
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf && !reduced && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => { if (document.hidden) stop(); else start(); };
  const onResize = () => { size(); if (reduced) draw(1.9, 0); };

  size();
  if (reduced) draw(1.9, 0); // the still frame: orange in the water, green smug, purple staring
  else { draw(0, 0); t0 = performance.now(); }
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); }) : null;
  io?.observe(link);
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize);
  start();
  return () => { stop(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', onResize); };
}
