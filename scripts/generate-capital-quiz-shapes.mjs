// Dev-time generator for src/games/capital-quiz/shapes.ts. Not used at runtime.
// Usage: node scripts/generate-capital-quiz-shapes.mjs <countries-50m.json> <out.ts>
// Input: world-atlas@2 countries-50m TopoJSON (Natural Earth, public domain), downloaded separately.
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
const topo = JSON.parse(readFileSync(src, 'utf8'));
const SIZE = 200, PAD = 6, TOL = 0.9;

// [iso, atlas name, difficulty (1 easy .. 3 hard), optional window {lon:[min,max], lat:[min,max]} on polygon centroids]
const PICK = [
  ['IT', 'Italy', 1], ['JP', 'Japan', 1], ['GB', 'United Kingdom', 1, { lon: [-9, 2], lat: [49, 61] }], ['AU', 'Australia', 1, { lon: [112, 155], lat: [-45, -9] }],
  ['NZ', 'New Zealand', 1, { lon: [165, 180], lat: [-48, -34] }], ['US', 'United States of America', 1, { lon: [-125, -66], lat: [24, 50] }],
  ['CA', 'Canada', 1], ['MX', 'Mexico', 1], ['BR', 'Brazil', 1], ['AR', 'Argentina', 1, { lon: [-74, -53], lat: [-56, -21] }],
  ['CL', 'Chile', 2, { lon: [-76, -66], lat: [-56, -17] }], ['IN', 'India', 1], ['CN', 'China', 1, { lon: [73, 135], lat: [18, 54] }],
  ['MN', 'Mongolia', 2], ['KZ', 'Kazakhstan', 2], ['SA', 'Saudi Arabia', 2], ['IR', 'Iran', 2], ['TR', 'Turkey', 2],
  ['EG', 'Egypt', 1], ['LY', 'Libya', 2], ['DZ', 'Algeria', 2], ['NG', 'Nigeria', 2], ['ET', 'Ethiopia', 2], ['SO', 'Somalia', 2],
  ['AO', 'Angola', 3], ['NA', 'Namibia', 3], ['CD', 'Dem. Rep. Congo', 3], ['MG', 'Madagascar', 1], ['TD', 'Chad', 3], ['ML', 'Mali', 3],
  ['MR', 'Mauritania', 3], ['SD', 'Sudan', 3], ['MZ', 'Mozambique', 3],
  ['NO', 'Norway', 1, { lon: [4, 32], lat: [57, 72] }], ['SE', 'Sweden', 2], ['FI', 'Finland', 2], ['IS', 'Iceland', 1], ['DK', 'Denmark', 3, { lon: [8, 13], lat: [54, 58] }],
  ['FR', 'France', 1, { lon: [-6, 10], lat: [41, 52] }], ['ES', 'Spain', 1, { lon: [-10, 5], lat: [35, 44] }], ['PT', 'Portugal', 2, { lon: [-10, -6], lat: [36, 43] }],
  ['DE', 'Germany', 2], ['PL', 'Poland', 2], ['GR', 'Greece', 2], ['UA', 'Ukraine', 2], ['HR', 'Croatia', 3], ['CH', 'Switzerland', 3],
  ['CU', 'Cuba', 1], ['JM', 'Jamaica', 3], ['PE', 'Peru', 2], ['CO', 'Colombia', 2], ['VE', 'Venezuela', 3],
  ['KR', 'South Korea', 2], ['KP', 'North Korea', 3], ['PH', 'Philippines', 2], ['VN', 'Vietnam', 2], ['TH', 'Thailand', 2],
  ['PK', 'Pakistan', 2], ['AF', 'Afghanistan', 3], ['NP', 'Nepal', 2], ['BT', 'Bhutan', 3],
];

const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]); });
const ring = (idx) => idx.flatMap((i) => (i >= 0 ? arcs[i] : [...arcs[~i]].reverse()).slice(0));
const geoms = new Map(topo.objects.countries.geometries.map((g) => [g.properties.name, g]));

const area = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const centroid = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const d = len ? Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(x - a[0], y - a[1]);
    if (d > max) { max = d; idx = i; }
  }
  return max > tol ? [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)] : [a, b];
}

const rows = [];
for (const [iso, name, diff, win] of PICK) {
  const g = geoms.get(name);
  if (!g) throw new Error(`missing ${name}`);
  const polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs).map((p) => ring(p[0]));
  let rings = polys.filter((r) => { if (!win) return true; const [cx, cy] = centroid(r); return cx >= win.lon[0] && cx <= win.lon[1] && cy >= win.lat[0] && cy <= win.lat[1]; });
  const big = Math.max(...rings.map(area));
  rings = rings.filter((r) => area(r) >= big * 0.004);
  const lat0 = rings.flatMap((r) => r.map((p) => p[1])).reduce((s, v, _, all) => s + v / all.length, 0);
  const k = Math.cos((lat0 * Math.PI) / 180);
  let proj = rings.map((r) => r.map(([lon, lat]) => [lon * k, -lat]));
  const all = proj.flat();
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const s = (SIZE - 2 * PAD) / Math.max(x1 - x0, y1 - y0);
  const ox = (SIZE - (x1 - x0) * s) / 2, oy = (SIZE - (y1 - y0) * s) / 2;
  const fit = proj.map((r) => r.map(([x, y]) => [(x - x0) * s + ox, (y - y0) * s + oy]));
  const d = fit.map((r) => {
    const open = r.slice(0, -1);
    let pts = dp(open, TOL).map(([x, y]) => [Math.round(x), Math.round(y)]);
    pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    return pts.length >= 3 ? `M${pts.map((p) => p.join(' ')).join(' ')}Z` : '';
  }).join('');
  rows.push(`  ['${iso}', ${diff}, '${d}'],`);
}

writeFileSync(out, `/**
 * Country silhouettes for Geo Quiz (capital-quiz) outline mode. GENERATED by scripts/generate-capital-quiz-shapes.mjs
 * from Natural Earth (public domain, via world-atlas 50m); simplified, per-country fitted into a 200x200 box.
 * Rows: [ISO 3166-1 alpha-2, outline difficulty (1 = instantly recognisable .. 3 = hard), SVG path].
 */
export const SHAPE_VIEWBOX = 200;
export const SHAPE_ROWS: ReadonlyArray<readonly [string, 1 | 2 | 3, string]> = [
${rows.join('\n')}
];
`);
console.log(`${rows.length} shapes, ${(readFileSync(out).length / 1024).toFixed(1)} KB`);
