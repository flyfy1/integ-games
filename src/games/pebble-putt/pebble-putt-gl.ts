/**
 * Pebble Putt renderer: the only module that imports Three.js, so the arcade loads it (and the engine chunk) only
 * when this game opens. Everything is built from primitives and canvas-drawn textures: no models, images or fonts.
 * Plane coordinates (x, y) from the physics map to Three.js as (x, height, -y).
 */
import {
  AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry,
  CylinderGeometry, DirectionalLight, DodecahedronGeometry, DoubleSide, Fog, Group, HemisphereLight, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry, Points,
  PointsMaterial, Quaternion, Raycaster, RingGeometry, Scene, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3,
  WebGLRenderer, type Material
} from 'three';
import { BALL_R, CUP_R, fenceSegments, gateLift, gradient, height, type World } from './physics';
import type { Hole, Pt } from './types';

export type Palette = {
  skyTop: string; skyLow: string; fog: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number;
  sand: [number, number, number]; outer: [number, number, number]; board: string; stone: string; water: string; leaf: string; lantern: number;
};

export const PALETTES: Record<number, Palette> = {
  1: { skyTop: '#f2a65a', skyLow: '#ffe2b0', fog: '#f7d6a4', sun: '#ffc07a', sunI: 2.7, hemiSky: '#ffe2bd', hemiGround: '#8a6a48', hemiI: 0.95,
    sand: [238, 218, 178], outer: [134, 152, 88], board: '#8a5a33', stone: '#7d7468', water: '#3f8fa6', leaf: '#d9622b', lantern: 0 },
  2: { skyTop: '#c4506e', skyLow: '#ffb27a', fog: '#f0a37f', sun: '#ff9a62', sunI: 2.1, hemiSky: '#ffd0b0', hemiGround: '#7a5a48', hemiI: 1.05,
    sand: [230, 200, 160], outer: [120, 138, 84], board: '#6e3f26', stone: '#6f6a62', water: '#3a7f8f', leaf: '#c8322b', lantern: 0.35 },
  3: { skyTop: '#161d44', skyLow: '#4b4f8c', fog: '#363a6c', sun: '#a9bdff', sunI: 1.5, hemiSky: '#8a9cff', hemiGround: '#2a2c3e', hemiI: 0.95,
    sand: [198, 198, 214], outer: [64, 92, 82], board: '#4d3a30', stone: '#5f6270', water: '#2c4f7a', leaf: '#8e3550', lantern: 1 }
};

export type AimView = { x: number; y: number; angle: number; power: number; path: number[] | null };
export type FrameView = { world: World; time: number; dt: number; aim: AimView | null; active: number; reduced: boolean; colors: string[] };

const IDLE = -99; // a koi that is not leaping
const v3 = (x: number, y: number, h: number) => new Vector3(x, h, -y);

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx, w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise in [0, 1]. */
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** Throws when WebGL cannot start; the shell catches it and shows its plain fallback message. */
export function createGl(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  const gl = renderer.getContext();
  if (!gl || typeof gl.getParameter !== 'function') throw new Error('no webgl');
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.localClippingEnabled = true; // the ace ripples stay inside the boards
  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 200);
  const hemi = new HemisphereLight(0xffffff, 0x888888, 1);
  const sun = new DirectionalLight(0xffffff, 2);
  const ambient = new AmbientLight(0xffffff, 0.12);
  scene.add(hemi, sun, sun.target, ambient);

  // ------------------------------------------------------------------ shared assets
  const pebbleTex = canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = hash(i, 1) * w, y = hash(i, 2) * h, r = 0.6 + hash(i, 3) * 1.8; ctx.fillStyle = `rgba(60,55,50,${0.12 + hash(i, 4) * 0.25})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.bezierCurveTo(w * 0.3, h * 0.35, w * 0.6, h * 0.65, w, h * 0.5); ctx.stroke();
  });
  const blobTex = canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(40,24,10,0.55)'); g.addColorStop(0.6, 'rgba(40,24,10,0.25)'); g.addColorStop(1, 'rgba(40,24,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  });
  const dotTex = canvasTex(32, 32, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  });
  const glowTex = canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,210,140,0.9)'); g.addColorStop(0.4, 'rgba(255,170,90,0.35)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  });

  const ballGeo = new SphereGeometry(BALL_R, 24, 16);
  const blobGeo = new PlaneGeometry(BALL_R * 3.2, BALL_R * 3.2); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });

  // hole-specific objects live in this group and are rebuilt on every setHole
  let holeGroup = new Group();
  scene.add(holeGroup);
  let hole: Hole | null = null;
  let disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  type BallView = { mesh: Mesh; blob: Mesh; mat: MeshStandardMaterial; roll: number; q: Quaternion; sinkT: number; lastX: number; lastY: number };
  let balls: BallView[] = [];
  let gates: { pivot: Object3D; g: NonNullable<Hole['gates']>[number] }[] = [];
  let flag: Mesh | null = null;
  let koi: { mesh: Object3D; cx: number; cy: number; r: number; speed: number; phase: number; h: number; leap: number; lx: number; ly: number; dir: number }[] = [];
  let springs: { mesh: Object3D; x: number; y: number; pulse: number }[] = [];
  let grains: { pts: Points; pos: Float32Array; life: Float32Array; spots: Float32Array } | null = null;
  let waterMats: MeshPhongMaterial[] = [];
  let palette = PALETTES[1];
  /** The deer scarer (shishi-odoshi) behind the cup: it only clacks for an ace. */
  let shishi: { tube: Object3D; t: number } | null = null;
  /** Ace effects: rake-ring ripples from the cup, a flag spin, leaping koi and a slow push-in, all on the real clock. */
  const ace = { t: -1, push: -1, cx: 0, cy: 0, ch: 0, spin: -1 };
  const clip = [new Plane(), new Plane(), new Plane(), new Plane()];
  const RIPPLES = 4;
  // each ring is draped over the sand (its vertices follow the height field), so tilted holes and dunes keep it on the ground
  const RING_SEG = 72;
  const ringIndex: number[] = [];
  for (let k = 0; k < RING_SEG; k++) { const a = k * 2, b = ((k + 1) % RING_SEG) * 2; ringIndex.push(a, b, a + 1, b, b + 1, a + 1); }
  const ripples = Array.from({ length: RIPPLES * 2 }, (_, i) => {
    const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(new Float32Array(RING_SEG * 2 * 3), 3)); geo.setIndex(ringIndex);
    const mat = new MeshBasicMaterial({ color: i % 2 ? 0xfff6e0 : 0x3a2410, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clip, side: DoubleSide });
    const m = new Mesh(geo, mat); m.visible = false; m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
    return { m, mat, geo };
  });
  const drapeRing = (geo: BufferGeometry, cx: number, cy: number, r0: number, r1: number) => {
    const pos = geo.getAttribute('position') as BufferAttribute;
    for (let k = 0; k < RING_SEG; k++) {
      const a = k / RING_SEG * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      for (const [j, r] of [[0, r0], [1, r1]] as const) { const x = cx + c * r, y = cy + sn * r; pos.setXYZ(k * 2 + j, x, hAt(x, y) + 0.03, -y); }
    }
    pos.needsUpdate = true;
  };
  const splashGeo = new RingGeometry(0.75, 1, 40); splashGeo.rotateX(-Math.PI / 2);
  const splashes = Array.from({ length: 4 }, () => {
    const mat = new MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0, depthWrite: false });
    const m = new Mesh(splashGeo, mat); m.visible = false; scene.add(m);
    return { m, mat, t: -1 };
  });
  const splashAt = (x: number, y: number, h: number) => {
    const s = splashes.find(q => q.t < 0) ?? splashes[0];
    s.t = 0; s.m.position.set(x, h + 0.02, -y); s.m.visible = true;
  };

  // aim: dotted preview and a power arrow
  const DOTS = 80;
  const dotGeo = new BufferGeometry(); dotGeo.setAttribute('position', new BufferAttribute(new Float32Array(DOTS * 3), 3)); dotGeo.setDrawRange(0, 0);
  const dots = new Points(dotGeo, new PointsMaterial({ size: 0.13, map: dotTex, transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true }));
  scene.add(dots);
  const arrowShape = new Shape(); arrowShape.moveTo(0, -0.07); arrowShape.lineTo(0.8, -0.05); arrowShape.lineTo(0.8, -0.15); arrowShape.lineTo(1, 0); arrowShape.lineTo(0.8, 0.15); arrowShape.lineTo(0.8, 0.05); arrowShape.lineTo(0, 0.07);
  const arrowGeo = new ShapeGeometry(arrowShape); arrowGeo.rotateX(-Math.PI / 2);
  const arrowMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide });
  const arrow = new Mesh(arrowGeo, arrowMat); arrow.visible = false; scene.add(arrow);
  const ringGeo = new RingGeometry(BALL_R * 1.6, BALL_R * 1.9, 40); ringGeo.rotateX(-Math.PI / 2);
  const ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })); scene.add(ring);

  let width = 1, heightPx = 1, insetTop = 0, insetBottom = 0;
  const camPos = new Vector3(), camLook = new Vector3(), camFrom = new Vector3(), camLookFrom = new Vector3();
  let camT = 1;

  // ------------------------------------------------------------------ ground: displaced plane + raked-sand texture
  function buildGround(h: Hole, gardenId: number) {
    const [x0, y0, x1, y1] = h.bounds, M = 6;
    const gx0 = x0 - M, gx1 = x1 + M, gy0 = y0 - M, gy1 = y1 + M;
    const W = gx1 - gx0, H = gy1 - gy0;
    const segX = Math.round(W * 4), segY = Math.round(H * 4);
    const geo = track(new PlaneGeometry(W, H, segX, segY));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as BufferAttribute;
    const cx = (gx0 + gx1) / 2, cy = (gy0 + gy1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, y = -pos.getZ(i) + cy;
      const inside = x >= x0 - 0.05 && x <= x1 + 0.05 && y >= y0 - 0.05 && y <= y1 + 0.05;
      // outside the boards the garden floor gently undulates and falls away
      const hh = inside ? height(h.slopes, x, y) : height(h.slopes, Math.max(x0, Math.min(x1, x)), Math.max(y0, Math.min(y1, y))) * 0.6 - 0.12 + 0.18 * Math.sin(x * 0.7) * Math.sin(y * 0.6);
      pos.setXYZ(i, x, hh, -y);
    }
    geo.computeVertexNormals();
    // texture: about 70 px per unit inside, capped
    const ppu = Math.min(52, 1150 / Math.max(W, H));
    const box = (poly: readonly Pt[]) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [px, py] of poly) { a = Math.min(a, px); b = Math.max(b, px); c = Math.min(c, py); d = Math.max(d, py); } return { poly, a, b, c, d }; };
    const zoneBoxes = (h.zones ?? []).map(z => ({ ...box(z.poly), kind: z.kind })), waterBoxes = (h.water ?? []).map(box);
    const tw = Math.round(W * ppu), th = Math.round(H * ppu);
    const tex = track(canvasTex(tw, th, (ctx) => {
      const img = ctx.createImageData(tw, th), d = img.data;
      const [sr, sg, sb] = palette.sand, [or, og, ob] = palette.outer;
      // rake rings also run round the cup's bamboo edging, as they do round a stone
      const stones = [...(h.stones ?? []), ...(h.fence ? [{ x: h.cup[0], y: h.cup[1], r: h.fence.r + 0.05 }] : [])];
      const sp = 0.21;
      for (let j = 0; j < th; j++) {
        const y = gy1 - (j + 0.5) / ppu;
        for (let i = 0; i < tw; i++) {
          const x = gx0 + (i + 0.5) / ppu;
          const k = (j * tw + i) * 4;
          const n = hash(i, j);
          const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
          let r: number, g: number, b: number;
          if (!inside) {
            // moss with darker drifts, and a pale gravel strip hugging the boards
            const m = 0.78 + 0.3 * vnoise(x * 0.7, y * 0.7) + 0.12 * vnoise(x * 3.1, y * 3.1) + 0.08 * (n - 0.5);
            r = or * m; g = og * m; b = ob * m;
            const out = Math.max(x0 - x, x - x1, y0 - y, y - y1);
            if (out < 0.55) { const q = 0.7 + 0.22 * vnoise(x * 11, y * 11) + 0.1 * n; r = 182 * q; g = 174 * q; b = 162 * q; }
          } else {
            const hv = height(h.slopes, x, y);
            let phase = y / sp + hv * 9 / sp * 0.35 + 0.18 * Math.sin(x * 1.1 + y * 0.15);
            for (const s of stones) {
              if (Math.abs(x - s.x) > s.r + 0.95 || Math.abs(y - s.y) > s.r + 0.95) continue;
              const dd = Math.hypot(x - s.x, y - s.y);
              if (dd < s.r + 0.95) { phase = (dd - s.r) / sp; break; }
            }
            const st = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
            const groove = Math.pow(1 - st, 5);
            const shade = 0.95 + 0.05 * st - 0.13 * groove + 0.05 * (n - 0.5) + hv * 0.18;
            r = sr * shade; g = sg * shade; b = sb * shade;
            for (const z of zoneBoxes) if (x >= z.a && x <= z.b && y >= z.c && y <= z.d && pointIn(z.poly, x, y)) {
              const edge = polyEdge(z.poly, x, y);
              if (z.kind === 'gravel') {
                // rounded pebbles, one per jittered cell, with dark gaps between them and a firmer edge row
                const gx = x * 8.5, gy = y * 8.5, ci = Math.floor(gx), cj = Math.floor(gy);
                const ox = ci + 0.2 + hash(ci, cj) * 0.6, oy = cj + 0.2 + hash(cj, ci + 7) * 0.6;
                const dd = Math.hypot(gx - ox, gy - oy), tone = 0.72 + 0.4 * hash(ci + 3, cj - 5);
                const q = tone * (1 - 0.32 * Math.min(1, Math.max(0, (dd - 0.32) / 0.22))) * (0.92 + 0.08 * (gy - oy + 0.5)) + 0.04 * (n - 0.5);
                const rim = edge < 0.07 ? 0.72 : 1;
                r = 168 * q * rim; g = 159 * q * rim; b = 147 * q * rim;
              } else {
                // moss cushions: two scales of mottling, bright tufts, and a soft creeping edge into the sand
                const m = 0.7 + 0.32 * vnoise(x * 2.4, y * 2.4) + 0.16 * vnoise(x * 9, y * 9) + 0.08 * (n - 0.5);
                const tuft = hash(Math.floor(x * 22), Math.floor(y * 22)) > 0.93 ? 1.25 : 1;
                const mr = 70 * m * tuft, mg = 122 * m * tuft, mb = 64 * m * tuft;
                const k2 = Math.min(1, edge / (0.06 + 0.1 * vnoise(x * 5, y * 5)));
                r = r + (mr - r) * k2; g = g + (mg - g) * k2; b = b + (mb - b) * k2;
              }
              break;
            }
            // the edge just inside the boards is smoothed by the rake's turn
            const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
            if (edge < 0.18) { const e = 0.9 + edge * 0.5; r *= e; g *= e; b *= e; }
          }
          for (const w of waterBoxes) if (x >= w.a && x <= w.b && y >= w.c && y <= w.d && pointIn(w.poly, x, y)) { r = 40; g = 70; b = 80; break; }
          d[k] = Math.min(255, r); d[k + 1] = Math.min(255, g); d[k + 2] = Math.min(255, b); d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }));
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // uv: plane uvs already span the plane
    const mat = track(new MeshLambertMaterial({ map: tex }));
    const mesh = new Mesh(geo, mat);
    holeGroup.add(mesh);
    void gardenId;
  }

  /** Distance from a point inside a polygon to its nearest edge. */
  function polyEdge(poly: readonly Pt[], x: number, y: number) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / l; t = t < 0 ? 0 : t > 1 ? 1 : t;
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return best;
  }

  function pointIn(poly: readonly Pt[], x: number, y: number) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  const hAt = (x: number, y: number) => hole ? height(hole.slopes, x, y) : 0;

  function buildBoards(h: Hole) {
    const segs: [Pt, Pt][] = [];
    for (const line of h.walls) for (let i = 0; i + 1 < line.length; i++) segs.push([line[i], line[i + 1]]);
    if (!segs.length) return;
    const geo = track(new BoxGeometry(1, 1, 1));
    const mat = track(new MeshLambertMaterial({ color: palette.board }));
    const inst = new InstancedMesh(geo, mat, segs.length);
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), up = new Vector3(0, 1, 0), c = new Color();
    segs.forEach(([a, b], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const base = Math.min(hAt(a[0], a[1]), hAt(b[0], b[1]), hAt(mx, my));
      const top = Math.max(hAt(a[0], a[1]), hAt(b[0], b[1]), hAt(mx, my)) + 0.26;
      p.set(mx, (base - 0.15 + top) / 2, -my);
      q.setFromAxisAngle(up, Math.atan2(b[1] - a[1], b[0] - a[0]));
      s.set(len + 0.12, top - base + 0.15, 0.12);
      m.compose(p, q, s); inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.set(palette.board).offsetHSL(0, 0, (hash(i, 9) - 0.5) * 0.08));
    });
    holeGroup.add(inst);
    // board caps: a thin lighter strip on top reads as the wood's cut edge
    const capMat = track(new MeshLambertMaterial({ color: new Color(palette.board).offsetHSL(0.01, -0.05, 0.12) }));
    const caps = new InstancedMesh(geo, capMat, segs.length);
    segs.forEach(([a, b], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const top = Math.max(hAt(a[0], a[1]), hAt(b[0], b[1]), hAt(mx, my)) + 0.26;
      p.set(mx, top + 0.01, -my); q.setFromAxisAngle(up, Math.atan2(b[1] - a[1], b[0] - a[0])); s.set(len + 0.14, 0.03, 0.15);
      m.compose(p, q, s); caps.setMatrixAt(i, m);
    });
    holeGroup.add(caps);
  }

  /** The cup's low bamboo edging: a rail on short stakes, with two taller posts marking the mouth. */
  function buildFence(h: Hole) {
    const segs = fenceSegments(h);
    if (!segs.length) return;
    const rail = track(new MeshLambertMaterial({ color: '#b9b06a' })), stake = track(new MeshLambertMaterial({ color: '#8c7a45' }));
    const railGeo = track(new CylinderGeometry(0.055, 0.055, 1, 8)); railGeo.rotateZ(Math.PI / 2);
    const stakeGeo = track(new CylinderGeometry(0.035, 0.04, 1, 6));
    const rails = new InstancedMesh(railGeo, rail, segs.length), stakes = new InstancedMesh(stakeGeo, stake, segs.length + 1);
    const m = new Matrix4(), q = new Quaternion(), sc = new Vector3(), p = new Vector3(), up = new Vector3(0, 1, 0);
    segs.forEach(([a, b], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      p.set(mx, hAt(mx, my) + 0.13, -my); q.setFromAxisAngle(up, Math.atan2(b[1] - a[1], b[0] - a[0])); sc.set(len + 0.05, 1, 1);
      m.compose(p, q, sc); rails.setMatrixAt(i, m);
    });
    const ends = [segs[0][0], ...segs.map(s => s[1])];
    ends.forEach(([x, y], i) => {
      const mouth = i === 0 || i === ends.length - 1, hh = mouth ? 0.36 : 0.2;
      p.set(x, hAt(x, y) + hh / 2, -y); q.identity(); sc.set(mouth ? 1.5 : 1, hh, mouth ? 1.5 : 1);
      m.compose(p, q, sc); stakes.setMatrixAt(i, m);
    });
    holeGroup.add(rails, stakes);
  }

  function buildStones(h: Hole) {
    const list = h.stones ?? [];
    const rocks = list.filter(s => !s.spring), posts = list.filter(s => s.spring);
    const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3(), e = new Vector3(0, 1, 0);
    if (rocks.length) {
      const inst = new InstancedMesh(track(new DodecahedronGeometry(1, 1)), track(new MeshLambertMaterial({ color: palette.stone, flatShading: true })), rocks.length);
      rocks.forEach((st, i) => {
        p.set(st.x, hAt(st.x, st.y) + st.r * 0.18, -st.y); q.setFromAxisAngle(e, hash(i, 5) * 6.28); s.set(st.r * 1.02, st.r * 0.62, st.r * 1.02);
        m.compose(p, q, s); inst.setMatrixAt(i, m);
      });
      holeGroup.add(inst);
      if (palette.lantern > 0) { // moss caps in the later gardens
        const moss = new InstancedMesh(track(new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), track(new MeshLambertMaterial({ color: '#5f7d3a' })), rocks.length);
        rocks.forEach((st, i) => { p.set(st.x + st.r * 0.1, hAt(st.x, st.y) + st.r * 0.42, -st.y - st.r * 0.1); q.identity(); s.set(st.r * 0.62, st.r * 0.28, st.r * 0.55); m.compose(p, q, s); moss.setMatrixAt(i, m); });
        holeGroup.add(moss);
      }
    }
    for (const st of posts) {
      const g = new Group();
      const cyl = new Mesh(track(new CylinderGeometry(st.r * 0.75, st.r * 0.85, 0.55, 14)), track(new MeshLambertMaterial({ color: '#7fae3c' })));
      cyl.position.y = 0.27; g.add(cyl);
      const band = new Mesh(track(new TorusGeometry(st.r * 0.8, 0.03, 6, 18)), track(new MeshLambertMaterial({ color: '#c9a24a' })));
      band.rotation.x = Math.PI / 2; band.position.y = 0.4; g.add(band);
      const band2 = band.clone(); band2.position.y = 0.16; g.add(band2);
      g.position.set(st.x, hAt(st.x, st.y), -st.y);
      holeGroup.add(g);
      springs.push({ mesh: g, x: st.x, y: st.y, pulse: 0 });
    }
  }

  function buildWater(h: Hole) {
    waterMats = [];
    for (const poly of h.water ?? []) {
      const shape = new Shape(poly.map(([x, y]) => new Vector2(x, y)));
      const geo = track(new ShapeGeometry(shape)); geo.rotateX(-Math.PI / 2);
      let minH = Infinity, cx = 0, cy = 0;
      for (const [x, y] of poly) { minH = Math.min(minH, hAt(x, y)); cx += x / poly.length; cy += y / poly.length; }
      // depth: pale shallows along the edge darkening to a deep middle, with a few slow light streaks
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y] of poly) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      const ppu = 40, tw = Math.max(8, Math.round((bx1 - bx0) * ppu)), th = Math.max(8, Math.round((by1 - by0) * ppu));
      const wc = new Color(palette.water), wr = wc.r * 255, wg = wc.g * 255, wb = wc.b * 255;
      const tex = track(canvasTex(tw, th, (ctx) => {
        const img = ctx.createImageData(tw, th), d = img.data;
        for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
          const x = bx0 + (i + 0.5) / ppu, y = by1 - (j + 0.5) / ppu, k = (j * tw + i) * 4;
          const e = Math.min(1, polyEdge(poly, x, y) / 0.75), deep = e * e * (3 - 2 * e);
          const streak = 0.06 * Math.pow(Math.max(0, Math.sin(x * 2.1 + y * 0.9 + 1.7 * vnoise(x * 0.8, y * 0.8))), 12);
          const sh = 1.28 - 0.52 * deep + streak + 0.03 * (vnoise(x * 6, y * 6) - 0.5);
          d[k] = Math.min(255, wr * sh + 18 * (1 - deep)); d[k + 1] = Math.min(255, wg * sh + 22 * (1 - deep)); d[k + 2] = Math.min(255, wb * sh + 8 * (1 - deep)); d[k + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }));
      tex.repeat.set(1 / (bx1 - bx0), 1 / (by1 - by0)); tex.offset.set(-bx0 / (bx1 - bx0), -by0 / (by1 - by0));
      const mat = track(new MeshPhongMaterial({ map: tex, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.84, emissive: new Color(palette.water).multiplyScalar(0.18) }));
      waterMats.push(mat);
      const mesh = new Mesh(geo, mat); mesh.position.y = minH + 0.03; holeGroup.add(mesh);
      // a rim of small flat river stones where the pond meets the sand (none where a board already edges it)
      const rimPts: [number, number, number][] = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, ay] = poly[j], [qx, qy] = poly[i], len = Math.hypot(qx - ax, qy - ay), n = Math.max(1, Math.round(len / 0.19));
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, x = ax + (qx - ax) * f, y = ay + (qy - ay) * f;
          if (wallDist(h, x, y) < 0.14 || x <= h.bounds[0] + 0.05 || x >= h.bounds[2] - 0.05) continue;
          rimPts.push([x, y, hash(x * 7.1, y * 3.3)]);
        }
      }
      if (rimPts.length) {
        const rim = new InstancedMesh(rimGeoShared, track(new MeshLambertMaterial({ color: '#ffffff', flatShading: true })), rimPts.length);
        const m4 = new Matrix4(), q4 = new Quaternion(), s4 = new Vector3(), p4 = new Vector3(), up = new Vector3(0, 1, 0), c4 = new Color();
        rimPts.forEach(([x, y, r0], i) => {
          const sz = 0.085 + r0 * 0.05;
          p4.set(x, minH + 0.03, -y); q4.setFromAxisAngle(up, r0 * 6.28); s4.set(sz * 1.25, sz * 0.5, sz);
          m4.compose(p4, q4, s4); rim.setMatrixAt(i, m4);
          rim.setColorAt(i, c4.set(palette.stone).offsetHSL(0, -0.02, (r0 - 0.5) * 0.16 + 0.06));
        });
        holeGroup.add(rim);
      }
      // two lily pads where the pond is deep enough
      let pads = 0;
      for (let k = 0; k < 40 && pads < 2; k++) {
        const x = bx0 + hash(k, cx * 3 + 1) * (bx1 - bx0), y = by0 + hash(cy * 5 + 2, k) * (by1 - by0);
        if (!pointIn(poly, x, y) || polyEdge(poly, x, y) < 0.32 || Math.hypot(x - cx, y - cy) < 0.3) continue;
        const pad = new Mesh(padGeo, padMat); pad.position.set(x, minH + 0.045, -y); pad.rotation.y = hash(k, 3) * 6.28; pad.scale.setScalar(0.8 + hash(3, k) * 0.45);
        holeGroup.add(pad); pads++;
      }
      // koi: two slow fish circling near the middle
      let minR = Infinity;
      for (const [x, y] of poly) minR = Math.min(minR, Math.hypot(x - cx, y - cy));
      const fishMat = track(new MeshLambertMaterial({ color: '#ff7a2f', emissive: new Color('#5a1a00') }));
      const finMat = track(new MeshLambertMaterial({ color: '#fff4e8' }));
      for (let k = 0; k < 2; k++) {
        const fish = new Group();
        const body = new Mesh(track(new SphereGeometry(0.12, 10, 6)), k ? finMat : fishMat); body.scale.set(2.6, 0.5, 1); fish.add(body);
        const tail = new Mesh(track(new ConeGeometry(0.09, 0.2, 6)), k ? fishMat : finMat); tail.rotation.z = Math.PI / 2; tail.position.x = -0.36; tail.scale.set(1, 1, 0.3); fish.add(tail);
        holeGroup.add(fish);
        koi.push({ mesh: fish, cx, cy, r: Math.max(0.3, minR * (0.55 - k * 0.2)), speed: 0.35 + k * 0.12, phase: k * 2.4, h: minH - 0.012, leap: IDLE, lx: 0, ly: 0, dir: 0 });
      }
    }
  }

  const rimGeoShared = new DodecahedronGeometry(1, 0);
  const padGeo = new CircleGeometry(0.2, 18, 0.35, Math.PI * 2 - 0.5); padGeo.rotateX(-Math.PI / 2);
  const padMat = new MeshLambertMaterial({ color: '#4f8a3c', side: DoubleSide });
  function wallDist(h: Hole, x: number, y: number) {
    let best = Infinity;
    for (const line of h.walls) for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i], [bx, by] = line[i + 1], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / l; t = t < 0 ? 0 : t > 1 ? 1 : t;
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return best;
  }

  function buildGates(h: Hole) {
    const mat = track(new MeshLambertMaterial({ color: '#9bbf4a' }));
    const knot = track(new MeshLambertMaterial({ color: '#6d8a2e' }));
    for (const g of h.gates ?? []) {
      const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      const base = new Group();
      base.position.set(g.a[0], hAt(g.a[0], g.a[1]) + 0.2, -g.a[1]);
      base.rotation.y = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]);
      const pivot = new Group(); base.add(pivot);
      const pole = new Mesh(track(new CylinderGeometry(0.07, 0.07, len + 0.1, 10)), mat);
      pole.rotation.z = -Math.PI / 2; pole.position.x = len / 2; pivot.add(pole);
      for (let k = 1; k < 4; k++) { const n = new Mesh(track(new TorusGeometry(0.072, 0.018, 5, 10)), knot); n.rotation.y = Math.PI / 2; n.position.x = len * k / 4; pivot.add(n); }
      // the post the arm pivots on
      const post = new Mesh(track(new CylinderGeometry(0.09, 0.1, 0.6, 10)), knot); post.position.y = -0.05; base.add(post);
      holeGroup.add(base);
      gates.push({ pivot, g });
    }
  }

  function buildPipes(h: Hole) {
    const mat = track(new MeshLambertMaterial({ color: '#a8c45a' }));
    const dark = track(new MeshBasicMaterial({ color: '#1a1410' }));
    for (const p of h.pipes ?? []) {
      for (const [end, isOut] of [[p.a, false], [p.b, true]] as const) {
        const g = new Group(); g.position.set(end[0], hAt(end[0], end[1]), -end[1]);
        const ring = new Mesh(track(new TorusGeometry(0.3, 0.07, 8, 20)), mat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; g.add(ring);
        const hole = new Mesh(track(new CircleGeometry(0.29, 20)), dark); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.02; g.add(hole);
        if (isOut) { // a little bamboo arrow shows which way the pebble comes out
          const turn = new Group(); turn.rotation.y = p.out * Math.PI / 180;
          const tip = new Mesh(track(new ConeGeometry(0.1, 0.24, 8)), mat); tip.rotation.z = -Math.PI / 2; tip.position.set(0.48, 0.05, 0);
          turn.add(tip); g.add(turn);
        }
        holeGroup.add(g);
      }
    }
  }

  function buildCup(h: Hole) {
    const [x, y] = h.cup, base = hAt(x, y);
    const disc = new Mesh(track(new CircleGeometry(CUP_R, 28)), track(new MeshBasicMaterial({ color: '#120c08' })));
    disc.rotation.x = -Math.PI / 2; disc.position.set(x, base + 0.012, -y); holeGroup.add(disc);
    const lip = new Mesh(track(new RingGeometry(CUP_R, CUP_R + 0.05, 28)), track(new MeshLambertMaterial({ color: '#f4ead2' })));
    lip.rotation.x = -Math.PI / 2; lip.position.set(x, base + 0.014, -y); holeGroup.add(lip);
    const pole = new Mesh(track(new CylinderGeometry(0.018, 0.018, 1.3, 6)), track(new MeshLambertMaterial({ color: '#3a2a1c' })));
    pole.position.set(x, base + 0.65, -y); holeGroup.add(pole);
    const flagGeo = track(new PlaneGeometry(0.46, 0.3, 6, 1)); flagGeo.translate(0.23, 0, 0);
    flag = new Mesh(flagGeo, track(new MeshLambertMaterial({ color: '#d8453a', side: DoubleSide })));
    flag.position.set(x + 0.02, base + 1.15, -y); holeGroup.add(flag);
    // tee slab
    const [tx, ty] = h.tee;
    const slab = new Mesh(track(new CylinderGeometry(0.34, 0.38, 0.06, 18)), track(new MeshLambertMaterial({ color: '#b5ab98' })));
    slab.position.set(tx, hAt(tx, ty) - 0.01, -ty); holeGroup.add(slab);
  }

  function buildDecor(h: Hole) {
    const trunk = track(new MeshLambertMaterial({ color: '#5a3b26' }));
    const leaf = track(new MeshLambertMaterial({ color: palette.leaf, flatShading: true }));
    const pine = track(new MeshLambertMaterial({ color: '#3d5a34', flatShading: true }));
    const stone = track(new MeshLambertMaterial({ color: '#9c968a', flatShading: true }));
    const bamboo = track(new MeshLambertMaterial({ color: '#7da348' }));
    const glowMat = track(new MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: palette.lantern }));
    const lightMat = track(new MeshBasicMaterial({ color: palette.lantern > 0.5 ? '#ffd38a' : '#e8dcc0' }));
    const geo = {
      trunk: track(new CylinderGeometry(0.08, 0.12, 1.4, 6)), crown: track(new IcosahedronGeometry(0.7, 0)), cone: track(new ConeGeometry(0.8, 1.4, 7)),
      box: track(new BoxGeometry(1, 1, 1)), cyl: track(new CylinderGeometry(0.05, 0.05, 2.6, 6)), rock: track(new DodecahedronGeometry(0.5, 0)), glow: track(new PlaneGeometry(1.6, 1.6))
    };
    for (const [i, d] of (h.decor ?? []).entries()) {
      const s = d.s ?? 1, g = new Group();
      g.position.set(d.x, hAt(Math.max(h.bounds[0], Math.min(h.bounds[2], d.x)), Math.max(h.bounds[1], Math.min(h.bounds[3], d.y))) * 0.6 - 0.12, -d.y);
      g.scale.setScalar(s);
      if (d.kind === 'maple') {
        const t = new Mesh(geo.trunk, trunk); t.position.y = 0.7; g.add(t);
        for (let k = 0; k < 3; k++) { const c = new Mesh(geo.crown, leaf); c.position.set((hash(i, k) - 0.5) * 0.8, 1.5 + k * 0.25, (hash(k, i) - 0.5) * 0.8); c.scale.setScalar(0.8 + hash(i + k, 3) * 0.4); g.add(c); }
      } else if (d.kind === 'pine') {
        const t = new Mesh(geo.trunk, trunk); t.position.y = 0.5; g.add(t);
        for (let k = 0; k < 3; k++) { const c = new Mesh(geo.cone, pine); c.position.y = 1.1 + k * 0.5; c.scale.setScalar(1 - k * 0.25); g.add(c); }
      } else if (d.kind === 'bamboo') {
        for (let k = 0; k < 5; k++) { const c = new Mesh(geo.cyl, bamboo); c.position.set((hash(i, k) - 0.5) * 0.7, 1.3, (hash(k, i + 2) - 0.5) * 0.7); c.rotation.z = (hash(k, 7) - 0.5) * 0.15; g.add(c); }
      } else if (d.kind === 'rock') {
        const r = new Mesh(geo.rock, stone); r.scale.set(1.1, 0.6, 0.9); r.position.y = 0.15; g.add(r);
      } else {
        // stone lantern: base, post, light box, roof
        const parts: [number, number, number, number][] = [[0.5, 0.12, 0.5, 0.06], [0.2, 0.6, 0.2, 0.42], [0.46, 0.08, 0.46, 0.76]];
        for (const [sx, sy, sz, y] of parts) { const b = new Mesh(geo.box, stone); b.scale.set(sx, sy, sz); b.position.y = y; g.add(b); }
        const lightBox = new Mesh(geo.box, lightMat); lightBox.scale.set(0.3, 0.26, 0.3); lightBox.position.y = 0.93; g.add(lightBox);
        const roof = new Mesh(geo.cone, stone); roof.scale.set(0.5, 0.25, 0.5); roof.position.y = 1.2; roof.rotation.y = 0.4; g.add(roof);
        if (palette.lantern > 0) { const glow = new Mesh(geo.glow, glowMat); glow.position.y = 0.93; g.add(glow); glows.push(glow); }
      }
      // a long golden-hour shadow, cast away from the low sun
      const sh = new Mesh(shadowGeo, shadowMat);
      sh.position.set(0.75, 0.03, 0.45); sh.rotation.y = -0.55; sh.scale.set(d.kind === 'rock' ? 0.9 : 1.6, 1, d.kind === 'rock' ? 0.7 : 0.75);
      g.add(sh);
      holeGroup.add(g);
      decor.push({ g, x: d.x, y: d.y });
    }
  }
  function buildShishi(h: Hole) {
    // a shishi-odoshi stands just behind the back board, level with the cup: bamboo tube on two posts, a strike stone, a basin
    const [x0, , x1, y1] = h.bounds;
    const x = Math.max(x0 + 1.1, Math.min(x1 - 1.1, h.cup[0])), y = y1 + 0.85;
    const base = hAt(Math.max(x0, Math.min(x1, x)), y1) * 0.6 - 0.12;
    const g = new Group(); g.position.set(x, base, -y); g.scale.setScalar(1.3);
    const bam = track(new MeshLambertMaterial({ color: '#a9c45c' })), dark = track(new MeshLambertMaterial({ color: '#6d8a2e' }));
    const rockM = track(new MeshLambertMaterial({ color: palette.stone, flatShading: true }));
    const basin = new Mesh(track(new CylinderGeometry(0.26, 0.3, 0.16, 14)), rockM); basin.position.set(0.42, 0.08, 0); g.add(basin);
    const pool = new Mesh(track(new CircleGeometry(0.2, 14)), track(new MeshBasicMaterial({ color: palette.water }))); pool.rotation.x = -Math.PI / 2; pool.position.set(0.42, 0.165, 0); g.add(pool);
    const strikeStone = new Mesh(track(new DodecahedronGeometry(0.15, 0)), rockM); strikeStone.scale.set(1.1, 0.6, 1); strikeStone.position.set(-0.46, 0.06, 0); g.add(strikeStone);
    const postGeo = track(new CylinderGeometry(0.028, 0.032, 0.44, 6));
    for (const z of [-0.11, 0.11]) { const p = new Mesh(postGeo, dark); p.position.set(-0.04, 0.22, z); g.add(p); }
    const tube = new Group(); tube.position.set(-0.04, 0.36, 0);
    const body = new Mesh(track(new CylinderGeometry(0.068, 0.068, 0.92, 12)), bam); body.rotation.z = Math.PI / 2; body.position.x = 0.0; tube.add(body);
    const mouth = new Mesh(track(new CircleGeometry(0.06, 12)), track(new MeshBasicMaterial({ color: '#2a2a12' }))); mouth.rotation.y = Math.PI / 2; mouth.position.x = 0.461; tube.add(mouth);
    const knot = new Mesh(track(new TorusGeometry(0.069, 0.013, 5, 12)), dark); knot.rotation.y = Math.PI / 2; knot.position.x = -0.12; tube.add(knot);
    tube.rotation.z = 0.32;
    g.add(tube);
    // the feed pipe (kakei) that fills it
    const feedPost = new Mesh(postGeo, dark); feedPost.scale.y = 1.7; feedPost.position.set(0.9, 0.37, 0); g.add(feedPost);
    const feed = new Mesh(track(new CylinderGeometry(0.035, 0.035, 0.4, 8)), bam); feed.rotation.z = Math.PI / 2 + 0.25; feed.position.set(0.72, 0.68, 0); g.add(feed);
    const sh = new Mesh(shadowGeo, shadowMat); sh.position.set(0.5, 0.03, 0.3); sh.rotation.y = -0.55; sh.scale.set(0.8, 1, 0.5); g.add(sh);
    holeGroup.add(g);
    shishi = { tube, t: -1 };
  }

  let glows: Mesh[] = [];
  let decor: { g: Group; x: number; y: number }[] = [];
  const shadowGeo = new PlaneGeometry(2.2, 1.1); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.8 });

  function buildGrains(h: Hole) {
    // sand grains trickle downhill wherever the garden slopes, so the lean reads at a glance
    const spots: number[] = [];
    const [x0, y0, x1, y1] = h.bounds, g = { gx: 0, gy: 0 };
    for (let x = x0 + 0.2; x < x1; x += 0.25) for (let y = y0 + 0.2; y < y1; y += 0.25) {
      gradient(h.slopes, x, y, g);
      if (Math.hypot(g.gx, g.gy) > 0.04 && !(h.water ?? []).some(p => pointIn(p, x, y))) spots.push(x, y);
    }
    if (!spots.length) return;
    const N = Math.min(320, Math.max(60, spots.length));
    const pos = new Float32Array(N * 3), life = new Float32Array(N);
    const geo = track(new BufferGeometry()); geo.setAttribute('position', new BufferAttribute(pos, 3));
    const pts = new Points(geo, track(new PointsMaterial({ size: 0.06, map: dotTex, color: palette.lantern > 0.5 ? '#e6e8ff' : '#fff6e0', transparent: true, opacity: 0.75, depthWrite: false })));
    holeGroup.add(pts);
    const sp = new Float32Array(spots);
    grains = { pts, pos, life, spots: sp };
    for (let i = 0; i < N; i++) respawn(i, hash(i, 77) * 3);
  }
  function respawn(i: number, life = 2 + hash(i, performance.now() % 997) * 2) {
    if (!grains || !hole) return;
    const n = grains.spots.length / 2, k = Math.floor(hash(i * 13.7, performance.now() * 0.001 + i) * n) * 2;
    const x = grains.spots[k] + (hash(i, k) - 0.5) * 0.25, y = grains.spots[k + 1] + (hash(k, i) - 0.5) * 0.25;
    grains.pos[i * 3] = x; grains.pos[i * 3 + 1] = hAt(x, y) + 0.025; grains.pos[i * 3 + 2] = -y;
    grains.life[i] = life;
  }

  // ------------------------------------------------------------------ camera framing
  function frameCamera(immediate: boolean) {
    if (!hole) return;
    const [x0, y0, x1, y1] = hole.bounds;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = hAt(cx, cy);
    const aspect = width / Math.max(1, heightPx);
    const corners: Vector3[] = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) { corners.push(v3(x, y, hAt(x, y) - 0.05)); corners.push(v3(x, y, hAt(x, y) + 0.35)); }
    // usable screen band (between the HUD bars), in NDC
    const top = 1 - 2 * (insetTop / Math.max(1, heightPx)), bottom = -1 + 2 * (insetBottom / Math.max(1, heightPx));
    const tilt = 0.88; // radians above the horizon
    let best: { pos: Vector3; look: Vector3; scale: number } | null = null;
    const along = (y1 - y0) >= (x1 - x0);
    const azimuths = aspect > 1.15 && along ? [Math.PI / 2, -Math.PI / 2, 0] : [0];
    for (const az of azimuths) {
      // az = 0: camera stands behind the tee (low y) looking up the hole; ±π/2 looks across from the side
      const dir = new Vector3(Math.sin(az), 0, Math.cos(az)); // horizontal direction from target to camera (three space)
      const look = new Vector3(cx, cz, -cy);
      let lo = 2, hi = 80;
      for (let it = 0; it < 22; it++) {
        const dist = (lo + hi) / 2;
        const pos = look.clone().add(dir.clone().multiplyScalar(Math.cos(tilt) * dist)).add(new Vector3(0, Math.sin(tilt) * dist, 0));
        camera.position.copy(pos); camera.lookAt(look); camera.aspect = aspect; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        let fits = true, minY = Infinity, maxY = -Infinity;
        for (const c of corners) { const p = c.clone().project(camera); if (p.z > 1 || Math.abs(p.x) > 0.94 || p.y > top - 0.03 || p.y < bottom + 0.03) fits = false; minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
        if (fits) hi = dist; else lo = dist;
      }
      const dist = hi;
      // recentre vertically inside the usable band
      const pos = look.clone().add(dir.clone().multiplyScalar(Math.cos(tilt) * dist)).add(new Vector3(0, Math.sin(tilt) * dist, 0));
      camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld();
      let minY = Infinity, maxY = -Infinity;
      for (const c of corners) { const p = c.clone().project(camera); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      const shift = ((top + bottom) / 2 - (minY + maxY) / 2);
      // shift the look point along the screen's vertical (approximately along the hole axis on the ground)
      const fwd = dir.clone().multiplyScalar(-1);
      const look2 = look.clone().add(fwd.multiplyScalar(-shift * dist * 0.45));
      const pos2 = pos.clone().add(look2.clone().sub(look));
      const scale = 1 / dist;
      if (!best || scale > best.scale * 1.08) best = { pos: pos2, look: look2, scale };
    }
    if (!best) return;
    camFrom.copy(immediate ? best.pos : camera.position); camLookFrom.copy(immediate ? best.look : camLook);
    camPos.copy(best.pos); camLook.copy(best.look);
    camT = immediate ? 1 : 0;
    if (immediate) { camera.position.copy(camPos); camera.lookAt(camLook); }
    // decoration standing between the camera and the course would hide the play: leave it out of this view
    const camPlaneX = best.pos.x, camPlaneY = -best.pos.z;
    for (const d of decor) {
      const inFront = (camPlaneY < y0 && d.y < y0 - 0.2) || (camPlaneX > x1 && d.x > x1 + 0.2) || (camPlaneX < x0 && d.x < x0 - 0.2);
      d.g.visible = !inFront;
    }
  }

  // ------------------------------------------------------------------ public API
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  let lastLookFrom = new Vector3();

  function setHole(h: Hole, gardenId: number, players: number, colors: string[], rebuild = false) {
    if (!rebuild && h === hole && players === balls.length) {
      // a retry of the same hole: keep the baked garden, just reset the pebbles' look
      balls.forEach((b, i) => { b.sinkT = -1; b.lastX = NaN; b.lastY = NaN; b.q.identity(); b.mat.color.set(colors[i] ?? '#f4f1ea'); });
      resetAce();
      return;
    }
    resetAce();
    scene.remove(holeGroup);
    for (const d of disposables) d.dispose();
    disposables = []; gates = []; koi = []; springs = []; grains = null; glows = []; flag = null; decor = []; shishi = null;
    holeGroup = new Group(); scene.add(holeGroup);
    hole = h;
    palette = PALETTES[gardenId] ?? PALETTES[1];
    { const [bx0, by0, bx1, by1] = h.bounds, m = 0.07; clip[0].set(new Vector3(1, 0, 0), -(bx0 + m)); clip[1].set(new Vector3(-1, 0, 0), bx1 - m); clip[2].set(new Vector3(0, 0, -1), -(by0 + m)); clip[3].set(new Vector3(0, 0, 1), by1 - m); }
    const sky = track(canvasTex(4, 256, (ctx, w, hh) => { const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, palette.skyTop); g.addColorStop(0.75, palette.skyLow); g.addColorStop(1, palette.fog); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); }));
    scene.background = sky;
    scene.fog = new Fog(palette.fog, 18, 60);
    hemi.color.set(palette.hemiSky); hemi.groundColor.set(palette.hemiGround); hemi.intensity = palette.hemiI;
    sun.color.set(palette.sun); sun.intensity = palette.sunI;
    const [x0, y0, x1, y1] = h.bounds, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // golden hour: a low sun from the left and slightly ahead, so dunes throw readable light and shade
    sun.position.set(cx - 9, 6, -cy - 6); sun.target.position.set(cx, 0, -cy);
    buildGround(h, gardenId); buildBoards(h); buildStones(h); buildWater(h); buildGates(h); buildPipes(h); buildCup(h); buildFence(h); buildDecor(h); buildShishi(h); buildGrains(h);
    // pebbles
    for (const b of balls) { scene.remove(b.mesh); scene.remove(b.blob); b.mat.dispose(); }
    balls = [];
    for (let i = 0; i < players; i++) {
      const mat = new MeshStandardMaterial({ map: pebbleTex, color: colors[i] ?? '#f4f1ea', roughness: 0.45, metalness: 0.05 });
      const mesh = new Mesh(ballGeo, mat); const blob = new Mesh(blobGeo, blobMat);
      scene.add(mesh, blob);
      balls.push({ mesh, blob, mat, roll: 0, q: new Quaternion(), sinkT: -1, lastX: NaN, lastY: NaN });
    }
    frameCamera(false);
    lastLookFrom = camLook.clone();
  }

  function resize(w: number, hgt: number, ratio: number, insets: { top: number; bottom: number }) {
    width = Math.max(1, w); heightPx = Math.max(1, hgt); insetTop = insets.top; insetBottom = insets.bottom;
    renderer.setPixelRatio(Math.min(2, ratio));
    renderer.setSize(width, heightPx, false);
    camera.aspect = width / heightPx; camera.updateProjectionMatrix();
    frameCamera(true);
  }

  const tmpQ = new Quaternion(), axis = new Vector3();
  function frame(v: FrameView) {
    if (!hole) return;
    const w = v.world, t = v.time;
    // camera glide
    if (camT < 1) {
      camT = Math.min(1, camT + v.dt / (v.reduced ? 0.01 : 0.9));
      const e = camT < 0.5 ? 2 * camT * camT : 1 - Math.pow(-2 * camT + 2, 2) / 2;
      camera.position.lerpVectors(camFrom, camPos, e);
      const look = new Vector3().lerpVectors(camLookFrom, camLook, e);
      camera.lookAt(look);
    }
    // pebbles
    w.balls.forEach((b, i) => {
      const bv = balls[i]; if (!bv) return;
      const visible = b.onCourse;
      bv.mesh.visible = visible; bv.blob.visible = visible && !b.sunk;
      if (!visible) return;
      if (b.sunk) {
        if (bv.sinkT < 0) bv.sinkT = 0;
        bv.sinkT += v.dt;
        const k = Math.min(1, bv.sinkT / 0.28);
        bv.mesh.position.set(b.x, hAt(b.x, b.y) + BALL_R - k * BALL_R * 2.6, -b.y);
        bv.mesh.visible = k < 1;
        return;
      }
      bv.sinkT = -1;
      const hh = hAt(b.x, b.y);
      if (Number.isFinite(bv.lastX)) {
        const dx = b.x - bv.lastX, dy = b.y - bv.lastY, d = Math.hypot(dx, dy);
        if (d > 1e-5 && d < 2) { tmpQ.setFromAxisAngle(axis.set(-dy / d, 0, -dx / d), d / BALL_R); bv.q.premultiply(tmpQ); } // rolls about up × travel
      }
      bv.lastX = b.x; bv.lastY = b.y;
      bv.mesh.position.set(b.x, hh + BALL_R, -b.y);
      bv.mesh.quaternion.copy(bv.q);
      bv.blob.position.set(b.x + 0.06, hh + 0.01, -b.y + 0.04);
    });
    // aim
    const active = w.balls[v.active];
    ring.visible = !!active && active.onCourse && !active.sunk && !active.moving;
    if (ring.visible && active) { ring.position.set(active.x, hAt(active.x, active.y) + 0.02, -active.y); const s = 1 + 0.12 * Math.sin(t * 4); ring.scale.setScalar(v.aim ? 1 : s); (ring.material as MeshBasicMaterial).color.set(v.colors[v.active] ?? '#ffffff'); }
    if (v.aim) {
      const a = v.aim;
      arrow.visible = true;
      arrow.position.set(a.x, hAt(a.x, a.y) + 0.05, -a.y);
      arrow.rotation.set(0, a.angle * Math.PI / 180, 0);
      arrow.scale.set(0.35 + a.power * 1.6, 1, 0.9 + a.power * 0.6);
      arrowMat.color.setHSL(0.13 - a.power * 0.13, 0.9, 0.62 - a.power * 0.08);
      const pos = dotGeo.getAttribute('position') as BufferAttribute;
      let n = 0;
      if (a.path && a.path.length >= 4) {
        // resample the path every 0.26 units
        let acc = 0.13;
        for (let k = 2; k < a.path.length && n < DOTS; k += 2) {
          const px = a.path[k - 2], py = a.path[k - 1], qx = a.path[k], qy = a.path[k + 1];
          const seg = Math.hypot(qx - px, qy - py);
          let s0 = acc;
          while (s0 <= seg && n < DOTS) { const f = s0 / seg, x = px + (qx - px) * f, y = py + (qy - py) * f; pos.setXYZ(n++, x, hAt(x, y) + 0.06, -y); s0 += 0.26; }
          acc = s0 - seg;
        }
      }
      pos.needsUpdate = true; dotGeo.setDrawRange(0, n);
      dots.visible = n > 0;
    } else { arrow.visible = false; dots.visible = false; }
    // gates
    for (const gv of gates) gv.pivot.rotation.z = gateLift({ period: gv.g.period, open: gv.g.open, phase: gv.g.phase ?? 0 }, w.t) * 1.25;
    // flag
    if (flag) flag.rotation.y = v.reduced ? 0.3 : 0.3 + Math.sin(t * 1.3) * 0.25;
    for (const k of koi) {
      if (k.leap > IDLE) {
        k.leap += v.dt;
        if (k.leap >= 0 && k.lx === 0 && k.ly === 0) { // take off from where it swims, along its heading
          const a0 = t * k.speed + k.phase;
          k.lx = k.cx + Math.cos(a0) * k.r; k.ly = k.cy + Math.sin(a0) * k.r; k.dir = a0 + Math.PI; // over the middle of the pond
          splashAt(k.lx, k.ly, k.h);
        }
        if (k.leap >= 0) {
          const u = k.leap / 0.85;
          const span = Math.max(0.5, k.r * 1.7);
          if (u >= 1) { splashAt(k.lx + Math.cos(k.dir) * span, k.ly + Math.sin(k.dir) * span, k.h); k.leap = IDLE; k.lx = k.ly = 0; k.mesh.rotation.set(0, 0, 0); }
          else {
            const d = u * span, hgt = 0.95 * 4 * u * (1 - u);
            k.mesh.position.set(k.lx + Math.cos(k.dir) * d, k.h + hgt, -(k.ly + Math.sin(k.dir) * d));
            k.mesh.rotation.set(0, k.dir, 0);
            k.mesh.rotateZ(Math.atan2(0.95 * 4 * (1 - 2 * u), span)); // nose follows the arc
            continue;
          }
        } else continue;
      }
      const a = (v.reduced ? k.phase : t * k.speed + k.phase);
      k.mesh.position.set(k.cx + Math.cos(a) * k.r, k.h, -(k.cy + Math.sin(a) * k.r));
      k.mesh.rotation.y = a + Math.PI / 2; // nose along the circle it swims
    }
    for (const m of waterMats) m.emissiveIntensity = v.reduced ? 1 : 1 + Math.sin(t * 1.7) * 0.25;
    for (const s of springs) { s.pulse = Math.max(0, s.pulse - v.dt * 4); const k = 1 + Math.sin(s.pulse * 18) * s.pulse * 0.25; s.mesh.scale.set(k, 2 - k, k); }
    for (const gl of glows) { gl.quaternion.copy(camera.quaternion); }
    if (grains && !v.reduced) {
      const g = { gx: 0, gy: 0 };
      const n = grains.life.length;
      for (let i = 0; i < n; i++) {
        grains.life[i] -= v.dt;
        if (grains.life[i] <= 0) { respawn(i); continue; }
        const x = grains.pos[i * 3], y = -grains.pos[i * 3 + 2];
        gradient(hole.slopes, x, y, g);
        const m = Math.hypot(g.gx, g.gy);
        if (m < 0.02) { grains.life[i] = 0; continue; }
        const sp = 0.3 + m * 1.8;
        const nx = x - g.gx / m * sp * v.dt, ny = y - g.gy / m * sp * v.dt;
        grains.pos[i * 3] = nx; grains.pos[i * 3 + 1] = hAt(nx, ny) + 0.025; grains.pos[i * 3 + 2] = -ny;
      }
      (grains.pts.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
    aceFrame(v.dt, t);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------------ the ace moment
  function resetAce() {
    ace.t = -1; ace.push = -1; ace.spin = -1;
    for (const r of ripples) { r.m.visible = false; r.mat.opacity = 0; }
    for (const s of splashes) { s.t = -1; s.m.visible = false; }
    for (const k of koi) { k.leap = IDLE; k.lx = k.ly = 0; }
    if (shishi) { shishi.t = -1; shishi.tube.rotation.z = 0.32; }
    if (camT >= 1 && hole) { camera.position.copy(camPos); camera.lookAt(camLook); }
  }
  /** The last moment before an ace drops: the camera starts to lean in. */
  function acePrime() { if (ace.push < 0) ace.push = 0; }
  /** The pebble is in on stroke one: rake rings spread from the cup, the flag spins, koi leap, the deer scarer tips. */
  function aceBurst(reduced: boolean) {
    if (!hole) return;
    if (ace.push < 0 && !reduced) ace.push = 0;
    if (reduced) return;
    ace.t = 0; ace.spin = 0; ace.cx = hole.cup[0]; ace.cy = hole.cup[1]; ace.ch = hAt(hole.cup[0], hole.cup[1]);
    const [sr, sg, sb] = palette.sand;
    ripples.forEach((r, i) => r.mat.color.setRGB(...(i % 2 ? [0.55 + sr / 580, 0.55 + sg / 580, 0.55 + sb / 580] : [sr / 700, sg / 760, sb / 800]) as [number, number, number], SRGBColorSpace));
    koi.forEach((k, i) => { if (i < 3) k.leap = -0.25 - i * 0.3; });
    if (shishi) shishi.t = 0;
  }
  const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
  function aceFrame(dt: number, t: number) {
    // camera: lean in 8% toward the look point over 0.5 s, hold, and ease back over 0.6 s
    if (ace.push >= 0 && camT >= 1) {
      ace.push += dt;
      const p = ace.push, k = p < 0.5 ? Math.sin(p / 0.5 * Math.PI / 2) : p < 2.2 ? 1 : Math.max(0, 1 - (p - 2.2) / 0.6);
      const k2 = k < 1 && p >= 2.2 ? k * k * (3 - 2 * k) : k;
      camera.position.lerpVectors(camPos, camLook, 0.08 * k2); camera.lookAt(camLook);
      if (p > 2.8) { ace.push = -1; camera.position.copy(camPos); camera.lookAt(camLook); }
    }
    if (ace.t >= 0) {
      ace.t += dt;
      // four raked rings run out from the cup like the circles raked round a stone: a dark groove and a pale ridge each
      for (let i = 0; i < RIPPLES; i++) {
        const u = (ace.t - i * 0.2) / 1.7;
        const groove = ripples[i * 2], ridge = ripples[i * 2 + 1];
        if (u <= 0 || u >= 1) { groove.m.visible = ridge.m.visible = false; continue; }
        const r = 0.34 + easeOut(u) * 4.2, fade = Math.sin(Math.PI * Math.min(1, u * 1.6 + 0.0)) * (1 - u);
        groove.m.visible = ridge.m.visible = true;
        drapeRing(groove.geo, ace.cx, ace.cy, r * 0.93, r); drapeRing(ridge.geo, ace.cx, ace.cy, r + 0.075 - r * 0.07, r + 0.075);
        groove.mat.opacity = 0.32 * fade; ridge.mat.opacity = 0.55 * fade;
      }
      if (ace.t > 2.6) { ace.t = -1; for (const r of ripples) r.m.visible = false; }
    }
    if (flag && ace.spin >= 0) {
      ace.spin += dt;
      const u = Math.min(1, ace.spin / 0.6);
      flag.rotation.y += easeOut(u) * Math.PI * 2;
      if (u >= 1) ace.spin = -1;
    }
    if (shishi && shishi.t >= 0) {
      shishi.t += dt;
      const s = shishi.t, R = 0.32, DOWN = -0.52;
      let z = R;
      if (s < 0.3) { const u = s / 0.3; z = R + (DOWN - R) * u * u; }
      else if (s < 0.42) z = DOWN;
      else if (s < 0.62) { const u = (s - 0.42) / 0.2; z = DOWN + (R - DOWN) * u * u; }
      else if (s < 0.82) z = R - 0.07 * Math.sin(Math.PI * (s - 0.62) / 0.2);
      else shishi.t = -1;
      shishi.tube.rotation.z = z;
    }
    for (const s of splashes) {
      if (s.t < 0) continue;
      s.t += dt;
      const u = s.t / 0.7;
      if (u >= 1) { s.t = -1; s.m.visible = false; continue; }
      s.m.scale.setScalar(0.12 + easeOut(u) * 0.55); s.mat.opacity = 0.8 * (1 - u);
    }
    void t;
  }

  function pulseSpring(x: number, y: number) {
    let best = springs[0], bd = Infinity;
    for (const s of springs) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; } }
    if (best) best.pulse = 1;
  }

  /** Screen point (CSS px in the canvas) to plane coordinates at the given height. */
  function ground(px: number, py: number, atHeight = 0) {
    ndc.set(px / width * 2 - 1, -(py / heightPx) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    plane.constant = -atHeight;
    const p = raycaster.ray.intersectPlane(plane, hit);
    return p ? { x: p.x, y: -p.z } : null;
  }
  /** Plane coordinates to CSS px in the canvas (uses the camera's resting place, not mid-glide). */
  function project(x: number, y: number, lift = 0) {
    const p = v3(x, y, hAt(x, y) + lift).project(camera);
    return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * heightPx };
  }

  function dispose() {
    for (const d of disposables) d.dispose();
    for (const b of balls) b.mat.dispose();
    for (const r of ripples) { r.mat.dispose(); r.geo.dispose(); } for (const q of splashes) q.mat.dispose();
    for (const m of [rimGeoShared, padGeo, padMat, splashGeo, ballGeo, blobGeo, blobMat, shadowGeo, shadowMat, dotGeo, arrowGeo, arrowMat, ringGeo, pebbleTex, blobTex, dotTex, glowTex] as { dispose(): void }[]) m.dispose();
    (dots.material as Material).dispose(); (ring.material as Material).dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  const info = () => {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  };

  void lastLookFrom;
  return { setHole, resize, frame, ground, project, dispose, pulseSpring, acePrime, aceBurst, info, get settled() { return camT >= 1; } };
}
export type Gl = ReturnType<typeof createGl>;
