// Painted canvas assets for the floodworks, archive and storm crown. No external images.
import { buildArt, makeCanvas, rng, LAYER_W, tintedGlow } from './art.js';
import { ZONES } from './level2.js';

const paint = (w, h, fn) => { const cv = makeCanvas(w, h); fn(cv.getContext('2d')); return cv; };
function scenery(zone, depth, R) {
  return paint(LAYER_W, 540, (c) => {
    const [dark, mid, light] = ZONES[zone].palette;
    const spacing = depth === 0 ? 160 : depth === 1 ? 310 : 680;
    c.fillStyle = depth === 0 ? mid : dark;
    for (let x = -80; x < LAYER_W + 160; x += spacing) {
      const h = 140 + R() * 180, base = 440 + depth * 20;
      if (zone === 0) {
        // Roman flood arches, with real openings into the layer behind.
        c.fillRect(x, base - h, 28 + depth * 8, h);
        c.strokeStyle = c.fillStyle; c.lineWidth = 22;
        c.beginPath(); c.arc(x + spacing / 2, base - h + 80, spacing / 2 - 14, Math.PI, 0); c.stroke();
        c.fillRect(x, base - h - 12, spacing, 16);
        c.strokeStyle = light; c.lineWidth = 1; c.globalAlpha = 0.18;
        c.beginPath(); c.moveTo(x + 5, base - h); c.lineTo(x + 5, base); c.stroke(); c.globalAlpha = 1;
      } else if (zone === 1) {
        // Vaulted glass ribs and distant stacks.
        c.fillRect(x, base - h, 18, h);
        c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + spacing / 2, base - h - 100); c.lineTo(x + spacing, base - h); c.lineTo(x + spacing / 2, base - h - 80); c.fill();
        c.globalAlpha = 0.24; c.fillStyle = light;
        for (let y = base - h + 20; y < base - 12; y += 38) c.fillRect(x + 35, y, spacing - 65, 4);
        c.globalAlpha = 1; c.fillStyle = depth === 0 ? mid : dark;
      } else {
        // Needle towers, suspended cables and luminous insulators.
        c.beginPath(); c.moveTo(x, base); c.lineTo(x + 35, base - h); c.lineTo(x + 48, base - h - 85); c.lineTo(x + 62, base - h); c.lineTo(x + 98, base); c.fill();
        c.strokeStyle = mid; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 48, base - h); c.quadraticCurveTo(x + spacing / 2, base - h + 110, x + spacing + 48, base - h + 20); c.stroke();
        c.globalAlpha = 0.65; c.fillStyle = light; c.fillRect(x + 39, base - h + 5, 18, 4); c.globalAlpha = 1; c.fillStyle = depth === 0 ? mid : dark;
      }
    }
  });
}
export function buildStormArt(seed = 23) {
  const art = buildArt(seed), R = rng(seed);
  art.skies = ZONES.map((z, i) => paint(960, 540, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, z.palette[0]); g.addColorStop(0.72, z.palette[1]); g.addColorStop(1, z.palette[0]); c.fillStyle = g; c.fillRect(0, 0, 960, 540);
    c.strokeStyle = z.palette[2]; c.lineWidth = 1; c.globalAlpha = 0.12;
    for (let n = 0; n < 95; n++) { const x = R() * 960, y = R() * 400; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (i === 2 ? -15 : 80), y + (i === 2 ? 40 : 0)); c.stroke(); }
    c.globalAlpha = 0.18; c.fillStyle = z.palette[2]; c.beginPath(); c.arc(680, 150, i === 2 ? 64 : 28, 0, 7); c.fill();
  }));
  art.layers = ZONES.map((z, i) => ({ far: scenery(i, 0, R), mid: scenery(i, 1, R), near: scenery(i, 2, R), fg: makeCanvas(LAYER_W, 540) }));
  art.ground = ZONES.map((z) => paint(256, 256, (c) => {
    c.fillStyle = z.palette[0]; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = z.palette[1]; c.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); for (let x = (y % 64 ? 0 : -32); x < 256; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); } }
    c.globalAlpha = 0.12; c.fillStyle = z.palette[2]; for (let n = 0; n < 500; n++) c.fillRect(R() * 256, R() * 256, 1 + R() * 8, 1);
  }));
  art.lips = ZONES.map((z) => paint(512, 44, (c) => { c.fillStyle = z.palette[1]; c.fillRect(0, 20, 512, 7); c.fillStyle = z.palette[2]; c.fillRect(0, 19, 512, 2); c.globalAlpha = 0.35; for (let x = 0; x < 512; x += 32) c.fillRect(x, 23, 20, 2); }));
  art.violetGlow = tintedGlow(art.glow, '#c39aff');
  art.fog = ZONES.map((z) => tintedGlow(art.fog[0], z.palette[2]));
  const prop = (w, h, fn) => paint(w, h, fn);
  art.props.sluice = prop(150, 230, (c) => { c.fillStyle = '#142b2d'; c.fillRect(12, 0, 18, 230); c.fillRect(120, 0, 18, 230); c.fillRect(12, 15, 126, 16); c.strokeStyle = '#488779'; c.lineWidth = 3; for (let x = 38; x < 120; x += 16) { c.beginPath(); c.moveTo(x, 38); c.lineTo(x, 230); c.stroke(); } c.strokeRect(5, 4, 140, 12); });
  art.props.reed = prop(90, 100, (c) => { c.strokeStyle = '#497e69'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(45, 100); c.quadraticCurveTo(i * 7, 60, i * 7 + 5, R() * 40); c.stroke(); } });
  art.props.obelisk = prop(82, 190, (c) => { c.fillStyle = '#3b304e'; c.beginPath(); c.moveTo(8, 190); c.lineTo(20, 40); c.lineTo(41, 0); c.lineTo(65, 40); c.lineTo(76, 190); c.fill(); c.strokeStyle = '#c69edc'; c.lineWidth = 2; c.beginPath(); c.moveTo(41, 14); c.lineTo(41, 175); c.moveTo(25, 65); c.lineTo(55, 100); c.lineTo(25, 135); c.stroke(); });
  art.props.shelf = prop(160, 190, (c) => { c.fillStyle = '#201b30'; c.fillRect(0, 0, 160, 190); for (let y = 20; y < 185; y += 40) { c.fillStyle = '#6b557d'; c.fillRect(0, y + 28, 160, 4); for (let x = 10; x < 150; x += 13) { c.fillStyle = R() < 0.5 ? '#524462' : '#79708a'; c.fillRect(x, y + R() * 8, 7, 24); } } });
  art.props.coil = prop(100, 170, (c) => { c.fillStyle = '#263c51'; c.fillRect(38, 0, 24, 170); for (let y = 15; y < 120; y += 20) { c.fillStyle = '#7696aa'; c.fillRect(15, y, 70, 10); c.fillStyle = '#b4eaff'; c.fillRect(22, y, 56, 2); } c.fillStyle = '#243849'; c.fillRect(10, 154, 80, 16); });
  art.props.spire = prop(100, 300, (c) => { c.fillStyle = '#203346'; c.beginPath(); c.moveTo(10, 300); c.lineTo(45, 40); c.lineTo(50, 0); c.lineTo(55, 40); c.lineTo(90, 300); c.fill(); c.strokeStyle = '#8fb5c8'; c.lineWidth = 2; c.beginPath(); c.moveTo(50, 45); c.lineTo(50, 280); c.stroke(); });
  return art;
}
