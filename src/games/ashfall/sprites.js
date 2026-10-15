// Ashfall sprites: procedurally posed characters. Combat-relevant geometry (shoulder,
// blade length, muzzle) is exported so hit detection and drawing use the same numbers.

export const ARM = 16;
export const BLADE = 52;
export const MUZZLE = { x: 50, y: -43 };

function limb(c, x1, y1, x2, y2, w, color) { c.strokeStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function leg(c, hx, hy, th, kn, w, color, len1 = 15, len2 = 16) {
  const kx = hx + Math.sin(th) * len1, ky = hy + Math.cos(th) * len1;
  const fx = kx + Math.sin(th - kn) * len2, fy = ky + Math.cos(th - kn) * len2;
  limb(c, hx, hy, kx, ky, w, color); limb(c, kx, ky, fx, fy, w * 0.85, color);
  limb(c, fx - 1, fy, fx + 6, fy, w * 0.7, color);
}
function glint(c, glow, x, y, size, alpha) {
  if (alpha <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha;
  c.drawImage(glow, x - size, y - size, size * 2, size * 2);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x - size * 1.4, y); c.lineTo(x, y - 1.2); c.lineTo(x + size * 1.4, y); c.lineTo(x, y + 1.2); c.fill();
  c.beginPath(); c.moveTo(x, y - size); c.lineTo(x + 1, y); c.lineTo(x, y + size); c.lineTo(x - 1, y); c.fill();
  c.restore();
}

// ---------------- player ----------------
export function playerPose(p, time) {
  const pose = { lean: 0.05, hipY: -30, bob: 0, legs: [[0.12, 0.08], [-0.1, 0.06]], gunArm: null };
  const s = p.anim;
  if (s === 'run') {
    const ph = p.runPhase;
    pose.lean = 0.2; pose.bob = -Math.abs(Math.sin(ph)) * 3;
    pose.legs = [[Math.sin(ph) * 0.85, 0.2 + Math.max(0, Math.sin(ph - 1.3)) * 1.25], [Math.sin(ph + Math.PI) * 0.85, 0.2 + Math.max(0, Math.sin(ph + Math.PI - 1.3)) * 1.25]];
  } else if (s === 'jump') { pose.lean = 0.12; pose.legs = [[-0.7, 1.2], [0.35, 0.45]]; }
  else if (s === 'fall') { pose.lean = 0.05; pose.legs = [[0.25, 0.7], [-0.35, 0.35]]; }
  else if (s === 'idle') { pose.bob = Math.sin(time * 2.2) * 0.8; }
  else if (s === 'land') { pose.hipY = -24; pose.lean = 0.25; pose.legs = [[0.6, 1.3], [-0.5, 1.1]]; }
  else if (s === 'hurt') { pose.lean = -0.35; pose.legs = [[0.35, 0.4], [-0.25, 0.2]]; }
  if (p.atk) {
    const { step, phase, k } = p.atk;
    const stance = step === 2 ? [[0.75, 0.9], [-0.6, 0.15]] : [[0.5, 0.45], [-0.45, 0.15]];
    if (phase === 'windup') { pose.lean = step === 2 ? -0.18 * k : -0.08 * k; pose.hipY = -30 + (step === 2 ? 6 : 2) * k; pose.legs = [[0.25 * k, 0.3 + 0.4 * k], [-0.3 * k, 0.15]]; }
    else if (phase === 'active') { pose.lean = 0.32; pose.hipY = step === 2 ? -23 : -27; pose.legs = stance; }
    else { pose.lean = 0.32 * (1 - k) + 0.05; pose.hipY = (step === 2 ? -23 : -27) * (1 - k) - 30 * k; pose.legs = stance; }
  }
  if (p.shootT < 0.32) { pose.gunArm = Math.max(-0.5, -0.55 * Math.max(0, 1 - p.shootT / 0.12)); if (!p.atk && p.grounded) pose.lean = -0.08 * Math.max(0, 1 - p.shootT / 0.2); }
  return pose;
}

// Blade geometry in the player's local (facing-right) space; hit detection uses this too.
export function bladeLocal(p, time) {
  const pose = playerPose(p, time), hipY = pose.hipY + pose.bob;
  const sh = { x: Math.sin(pose.lean) * 20 + 2, y: hipY - Math.cos(pose.lean) * 20 + 4 }, a = p.bladeAngle;
  const hand = { x: sh.x + Math.cos(a) * ARM, y: sh.y + Math.sin(a) * ARM };
  return { sh, hand, tip: { x: hand.x + Math.cos(a) * BLADE, y: hand.y + Math.sin(a) * BLADE } };
}

export function drawPlayer(c, p, art, time) {
  const flashing = false;
  const body = flashing ? '#f4e8dc' : '#15171b', cloak = flashing ? '#f4e8dc' : '#1d2026', trim = flashing ? '#fff' : '#2c2f36';
  c.save(); c.translate(p.x, p.y); c.lineCap = 'round'; c.lineJoin = 'round';
  if (p.iframe > 0 && !p.rolling && Math.floor(time * 30) % 2 === 0) c.globalAlpha = 0.45;
  if (p.anim === 'dead') { c.globalAlpha *= Math.max(0, 1 - p.deadT * 0.4); }
  // Scarf (world-space chain, drawn behind the body).
  if (p.scarf) {
    for (let i = 1; i < p.scarf.length; i++) {
      const a = p.scarf[i - 1], b = p.scarf[i];
      c.strokeStyle = flashing ? '#fff' : i % 2 ? '#8e2b22' : '#7a241d'; c.lineWidth = 5 - i * 0.55;
      c.beginPath(); c.moveTo(a.x - p.x, a.y - p.y); c.lineTo(b.x - p.x, b.y - p.y); c.stroke();
    }
    c.strokeStyle = 'rgba(255,170,120,0.3)'; c.lineWidth = 1; c.beginPath(); p.scarf.forEach((pt, i) => (i ? c.lineTo(pt.x - p.x, pt.y - p.y - 1.5) : c.moveTo(pt.x - p.x, pt.y - p.y - 1.5))); c.stroke();
  }
  c.scale(p.face, 1);
  if (p.squash !== 1) { c.scale(2 - p.squash, p.squash); }
  if (p.rolling) {
    const a = p.rollK * Math.PI * 2;
    c.translate(0, -17); c.rotate(a);
    c.fillStyle = cloak; c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill();
    c.fillStyle = body; c.beginPath(); c.arc(4, -4, 8, 0, 7); c.fill();
    c.strokeStyle = trim; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 16, -0.4, 1.4); c.stroke();
    c.strokeStyle = 'rgba(230,160,100,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 16.5, -2, -1.2); c.stroke();
    c.restore(); return;
  }
  if (p.anim === 'dead') { c.translate(0, -6); c.rotate(-1.35 * Math.min(1, p.deadT * 2.2)); c.translate(0, 6); }
  const pose = playerPose(p, time);
  const hipY = pose.hipY + pose.bob, lean = pose.lean;
  const neck = { x: Math.sin(lean) * 20, y: hipY - Math.cos(lean) * 20 };
  // back leg
  leg(c, -1, hipY, pose.legs[1][0], pose.legs[1][1], 6.2, flashing ? '#ddd' : '#0e1013');
  // coat tail
  const sway = Math.sin(time * 6 + p.runPhase) * 0.15 + (p.vx * p.face) * -0.0012;
  c.fillStyle = cloak; c.beginPath(); c.moveTo(neck.x - 6, neck.y + 2); c.lineTo(neck.x + 7, neck.y + 2);
  c.lineTo(5 + Math.sin(sway) * 6, hipY + 8); c.lineTo(-14 + sway * 30, hipY + 17 - Math.abs(sway) * 10); c.lineTo(-9, hipY + 2); c.closePath(); c.fill();
  // shotgun on back when not in use
  if (pose.gunArm === null) {
    c.strokeStyle = flashing ? '#fff' : '#2a2420'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(neck.x - 10, neck.y - 2); c.lineTo(-2, hipY + 4); c.stroke();
    c.strokeStyle = '#4a3a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(-2, hipY + 4); c.lineTo(2, hipY + 10); c.stroke();
  }
  // torso
  c.fillStyle = body; c.beginPath(); c.moveTo(-6, hipY + 1); c.lineTo(6, hipY + 1); c.lineTo(neck.x + 8, neck.y + 3); c.lineTo(neck.x - 7, neck.y + 1); c.closePath(); c.fill();
  c.strokeStyle = trim; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-6, hipY - 1); c.lineTo(7, hipY - 1); c.stroke();
  // front leg
  leg(c, 1, hipY, pose.legs[0][0], pose.legs[0][1], 6.8, flashing ? '#eee' : '#121418');
  // head + hood
  const hx = neck.x + Math.sin(lean) * 7, hy = neck.y - 8;
  c.fillStyle = cloak; c.beginPath(); c.moveTo(hx - 9, hy + 6); c.quadraticCurveTo(hx - 10, hy - 11, hx + 1, hy - 11); c.quadraticCurveTo(hx + 10, hy - 9, hx + 8, hy + 3); c.lineTo(hx + 3, hy + 8); c.closePath(); c.fill();
  c.fillStyle = '#07080a'; c.beginPath(); c.ellipse(hx + 4, hy - 1, 4, 5, 0.2, 0, 7); c.fill();
  c.fillStyle = flashing ? '#fff' : '#ffb766'; c.fillRect(hx + 4, hy - 2, 3, 1.4);
  // rim light on the hood and back
  c.strokeStyle = 'rgba(232,164,98,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx - 9, hy + 5); c.quadraticCurveTo(hx - 10, hy - 11, hx + 1, hy - 11); c.stroke();
  // gun arm
  const sx2 = neck.x - 3, sy2 = neck.y + 4;
  if (pose.gunArm !== null) {
    const ga = pose.gunArm, hx2 = sx2 + Math.cos(ga) * 17 + 4, hy2 = sy2 + Math.sin(ga) * 17;
    limb(c, sx2, sy2, hx2, hy2, 5, flashing ? '#eee' : '#121418');
    c.save(); c.translate(hx2, hy2); c.rotate(ga);
    c.fillStyle = '#3e3026'; c.beginPath(); c.moveTo(-14, -2); c.lineTo(0, -3); c.lineTo(2, 4); c.lineTo(-13, 7); c.fill();
    c.fillStyle = '#25272c'; c.fillRect(0, -4, 30, 4.5); c.fillStyle = '#1a1b1f'; c.fillRect(4, 0.5, 16, 3);
    c.fillStyle = 'rgba(255,190,130,0.5)'; c.fillRect(0, -4, 30, 1);
    c.restore();
  } else {
    const swing = p.anim === 'run' ? Math.sin(p.runPhase + Math.PI) * 0.7 : 0.15;
    const ex = sx2 + Math.sin(swing) * 12, ey = sy2 + Math.cos(swing) * 12;
    limb(c, sx2, sy2, ex, ey, 4.6, flashing ? '#ddd' : '#0f1114'); limb(c, ex, ey, ex + Math.sin(swing + 0.5) * 10, ey + Math.cos(swing + 0.5) * 10, 4, flashing ? '#ddd' : '#0f1114');
  }
  // blade arm (angle is shared with hit detection)
  const a = p.bladeAngle, bg = bladeLocal(p, time);
  const hx3 = bg.hand.x, hy3 = bg.hand.y, tx = bg.tip.x, ty = bg.tip.y;
  limb(c, bg.sh.x, bg.sh.y, hx3, hy3, 5.4, flashing ? '#fff' : '#16181c');
  c.strokeStyle = '#2a2420'; c.lineWidth = 4; c.beginPath(); c.moveTo(hx3 - Math.cos(a) * 6, hy3 - Math.sin(a) * 6); c.lineTo(hx3 + Math.cos(a) * 4, hy3 + Math.sin(a) * 4); c.stroke();
  const nx = -Math.sin(a), ny = Math.cos(a);
  c.fillStyle = p.atk && p.atk.phase === 'active' ? '#f6fbff' : '#aab4ba';
  c.beginPath(); c.moveTo(hx3 + Math.cos(a) * 4 + nx * 2, hy3 + Math.sin(a) * 4 + ny * 2); c.lineTo(tx, ty); c.lineTo(hx3 + Math.cos(a) * 4 - nx * 2.2, hy3 + Math.sin(a) * 4 - ny * 2.2); c.fill();
  c.strokeStyle = '#3a2a22'; c.lineWidth = 3; c.beginPath(); c.moveTo(hx3 + Math.cos(a) * 4 + nx * 4, hy3 + Math.sin(a) * 4 + ny * 4); c.lineTo(hx3 + Math.cos(a) * 4 - nx * 4, hy3 + Math.sin(a) * 4 - ny * 4); c.stroke();
  if (p.charged > 0) glint(c, art.warmGlow, tx, ty, 6, p.charged);
  c.restore();
}

// ---------------- enemies ----------------
export function drawEnemy(c, e, art, time) {
  c.save(); c.translate(e.x, e.y);
  if (e.dead) c.globalAlpha = Math.max(0, 1 - e.deadT * 1.6);
  const flash = false;
  c.scale(e.face, 1); c.lineCap = 'round'; c.lineJoin = 'round';
  const k = e.state === 'windup' ? Math.min(1, e.t / e.windup) : 0;
  if (e.state === 'windup' && e.type !== 'drone') c.translate((Math.random() - 0.5) * 2 * k, 0);
  ({ husk: husk, hound: hound, brute: brute, drone: drone })[e.type](c, e, art, time, flash, k);
  c.restore();
}

function eyeGlow(c, art, x, y, angry, size = 7) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = angry ? 0.9 : 0.4;
  c.drawImage(angry ? art.redGlow : art.coolGlow, x - size, y - size, size * 2, size * 2); c.restore();
  c.fillStyle = angry ? '#ffd0b8' : '#cfe8e0'; c.fillRect(x - 1.5, y - 1, 3, 2);
}

function husk(c, e, art, time, flash, k) {
  const skin = flash ? '#f4e8dc' : '#22272a', dark = flash ? '#ddd' : '#111416';
  const ph = e.walkPhase, st = e.state;
  let lean = 0.55, armA = 0.6, armB = 0.9, hip = -30;
  if (st === 'windup') { lean = 0.35 - 0.3 * k; armA = -2.3 * k + 0.6 * (1 - k); armB = -2.0 * k + 0.9 * (1 - k); }
  else if (st === 'active') { lean = 0.85; armA = 1.1; armB = 0.8; }
  else if (st === 'recover') { lean = 0.8; armA = 1.3; armB = 1.2; hip = -27; }
  else if (st === 'hurt') { lean = -0.1; armA = -0.6; armB = 0.2; }
  const legsW = st === 'chase' || st === 'patrol' ? 0.6 : 0.15;
  leg(c, -2, hip, Math.sin(ph + Math.PI) * legsW, 0.3, 6, dark, 16, 15);
  const nx = Math.sin(lean) * 24, ny = hip - Math.cos(lean) * 24;
  c.fillStyle = skin; c.beginPath(); c.moveTo(-7, hip + 2); c.lineTo(6, hip + 2); c.quadraticCurveTo(nx + 12, ny + 4, nx + 6, ny - 3); c.lineTo(nx - 8, ny - 1); c.closePath(); c.fill();
  // ribs/spine strokes
  c.strokeStyle = flash ? '#fff' : '#3a3f3a'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-3 + i * 2 + nx * (0.3 + i * 0.15), hip - 6 - i * 5); c.lineTo(4 + nx * (0.3 + i * 0.15), hip - 4 - i * 5); c.stroke(); }
  leg(c, 2, hip, Math.sin(ph) * legsW, 0.35, 6.4, skin, 16, 15);
  const hx = nx + 6, hy = ny - 4;
  c.fillStyle = skin; c.beginPath(); c.ellipse(hx, hy, 7, 8, 0.4, 0, 7); c.fill();
  c.fillStyle = dark; c.beginPath(); c.moveTo(hx + 2, hy + 4); c.lineTo(hx + 8, hy + 6); c.lineTo(hx + 3, hy + 8); c.fill();
  eyeGlow(c, art, hx + 4, hy - 1, st === 'windup' || st === 'active', st === 'windup' ? 6 + k * 8 : 5);
  // arms with claws
  const sx = nx - 1, sy = ny + 3;
  [[armB, dark, 5], [armA, skin, 5.5]].forEach(([a, col, w]) => {
    const ex = sx + Math.cos(a) * 17, ey = sy + Math.sin(a) * 17, wx = ex + Math.cos(a + 0.4) * 17, wy = ey + Math.sin(a + 0.4) * 17;
    limb(c, sx, sy, ex, ey, w, col); limb(c, ex, ey, wx, wy, w * 0.8, col);
    c.strokeStyle = flash ? '#fff' : '#9a9a8a'; c.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + Math.cos(a + 0.4 + i * 0.35) * 8, wy + Math.sin(a + 0.4 + i * 0.35) * 8); c.stroke(); }
  });
  c.strokeStyle = 'rgba(200,140,90,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-7, hip + 2); c.quadraticCurveTo(nx - 10, ny + 6, nx - 8, ny - 1); c.stroke();
  if (st === 'windup') glint(c, art.redGlow, hx + 5, hy - 3, 5 + 6 * k, e.t < 0.18 ? 1 - e.t / 0.18 : 0);
}

function hound(c, e, art, time, flash, k) {
  const skin = flash ? '#f4e8dc' : '#1d2122', dark = flash ? '#ddd' : '#0e1112';
  const st = e.state, ph = e.walkPhase;
  let crouch = 0, stretch = 0;
  if (st === 'windup') crouch = 7 * k; if (st === 'active') stretch = 1; if (st === 'recover') crouch = 3;
  const by = -24 + crouch, run = st === 'chase' ? 0.8 : 0.2;
  const legs = [[-18, ph], [-12, ph + 1], [14, ph + Math.PI], [20, ph + Math.PI + 1]];
  legs.forEach(([lx, lp], i) => { const a = stretch ? (i < 2 ? -0.9 : 0.9) : Math.sin(lp) * run; leg(c, lx, by + 4, a, i < 2 ? -0.6 : 0.5, i % 2 ? 4.5 : 4, i % 2 ? skin : dark, 11, by < -20 ? 11 : 9); });
  c.fillStyle = skin; c.beginPath(); c.ellipse(0, by, 26 + stretch * 6, 10, -0.05, 0, 7); c.fill();
  // spines
  c.strokeStyle = flash ? '#fff' : '#2c3230'; c.lineWidth = 2; for (let i = -3; i < 4; i++) { c.beginPath(); c.moveTo(i * 6, by - 8); c.lineTo(i * 6 - 4, by - 16 - (i === 0 ? 4 : 0)); c.stroke(); }
  // tail
  limb(c, -24, by - 2, -36, by - 8 + Math.sin(time * 9) * 3, 3, skin);
  // head
  const hx = 30 + stretch * 6, hy = by - 4;
  c.fillStyle = skin; c.beginPath(); c.moveTo(hx - 10, hy - 7); c.lineTo(hx + 14, hy - 2); c.lineTo(hx + 12, hy + 2); c.lineTo(hx - 8, hy + 7); c.fill();
  c.fillStyle = dark; c.beginPath(); c.moveTo(hx - 2, hy + 3); c.lineTo(hx + 12, hy + 3 + (st === 'active' || st === 'windup' ? 5 : 1)); c.lineTo(hx - 4, hy + 8); c.fill();
  eyeGlow(c, art, hx + 4, hy - 3, st === 'windup' || st === 'active', st === 'windup' ? 5 + 7 * k : 4);
  c.strokeStyle = 'rgba(200,140,90,0.35)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, by, 26, 10, -0.05, 3.5, 5.6); c.stroke();
  if (st === 'windup') glint(c, art.redGlow, hx + 5, hy - 4, 4 + 6 * k, e.t < 0.18 ? 1 - e.t / 0.18 : 0);
}

function brute(c, e, art, time, flash, k) {
  const skin = flash ? '#f4e8dc' : '#1e2120', metal = flash ? '#fff' : '#2c2a28', dark = flash ? '#ddd' : '#0f1110';
  const st = e.state, ph = e.walkPhase;
  let armA = 0.9, lift = 0;
  if (st === 'windup') { armA = 0.9 - 3.2 * k; lift = 6 * k; } else if (st === 'active') { armA = 1.25; } else if (st === 'recover') { armA = 1.35; lift = -6; }
  const hip = -44 + (st === 'recover' ? 6 : 0);
  leg(c, -8, hip, Math.sin(ph + Math.PI) * 0.35, 0.3, 11, dark, 22, 22);
  leg(c, 8, hip, Math.sin(ph) * 0.35, 0.3, 12, skin, 22, 22);
  c.fillStyle = skin; c.beginPath(); c.moveTo(-22, hip + 4); c.lineTo(22, hip + 4); c.quadraticCurveTo(38, hip - 46 - lift, 14, hip - 62 - lift); c.lineTo(-24, hip - 56 - lift); c.closePath(); c.fill();
  // scrap armour plates
  c.fillStyle = metal; c.beginPath(); c.moveTo(-20, hip - 50 - lift); c.lineTo(10, hip - 60 - lift); c.lineTo(20, hip - 34 - lift); c.lineTo(-14, hip - 26 - lift); c.fill();
  c.fillStyle = flash ? '#fff' : '#5a3a2a'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-12 + i * 8, hip - 44 - lift + i * 2, 1.6, 0, 7); c.fill(); }
  const hx = 18, hy = hip - 62 - lift;
  c.fillStyle = skin; c.beginPath(); c.arc(hx, hy + 4, 9, 0, 7); c.fill();
  eyeGlow(c, art, hx + 5, hy + 2, st === 'windup' || st === 'active', st === 'windup' ? 7 + 9 * k : 6);
  const sx = 12, sy = hip - 48 - lift;
  [[armA + 0.25, dark, 10], [armA, skin, 12]].forEach(([a, col, w], i) => {
    const ex = sx - i * 4 + Math.cos(a) * 26, ey = sy + Math.sin(a) * 26, fx = ex + Math.cos(a + 0.3) * 24, fy = ey + Math.sin(a + 0.3) * 24;
    limb(c, sx - i * 4, sy, ex, ey, w, col); limb(c, ex, ey, fx, fy, w * 0.9, col);
    c.fillStyle = i ? metal : dark; c.beginPath(); c.arc(fx, fy, i ? 11 : 9, 0, 7); c.fill();
  });
  c.strokeStyle = 'rgba(220,140,80,0.4)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-22, hip + 2); c.lineTo(-24, hip - 56 - lift); c.stroke();
  if (st === 'windup') glint(c, art.redGlow, hx + 6, hy, 6 + 8 * k, e.t < 0.2 ? 1 - e.t / 0.2 : 0);
}

function drone(c, e, art, time, flash, k) {
  const body = flash ? '#f4e8dc' : '#1c1a1a', metal = flash ? '#fff' : '#2e2a28';
  const bob = Math.sin(time * 3 + e.seed) * 3;
  c.translate(0, -e.hover + bob);
  c.strokeStyle = metal; c.lineWidth = 3; c.beginPath(); c.moveTo(-26, -8); c.lineTo(26, -8); c.stroke();
  [-26, 26].forEach((x) => { c.fillStyle = 'rgba(160,160,160,0.25)'; c.beginPath(); c.ellipse(x, -11, 14 * Math.abs(Math.sin(time * 40 + x)), 2.5, 0, 0, 7); c.fill(); c.fillStyle = metal; c.fillRect(x - 2, -12, 4, 6); });
  c.fillStyle = body; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
  c.fillStyle = metal; c.fillRect(-15, -3, 30, 5);
  c.strokeStyle = metal; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-6, 13); c.lineTo(-9, 26); c.moveTo(6, 13); c.lineTo(9, 26); c.stroke();
  const angry = e.state === 'windup' || e.state === 'active';
  c.fillStyle = '#0a0808'; c.beginPath(); c.arc(7, 2, 7, 0, 7); c.fill();
  eyeGlow(c, art, 8, 2, angry, angry ? 8 + k * 12 : 6);
  c.strokeStyle = 'rgba(255,150,90,0.4)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 15, 3.6, 5.4); c.stroke();
  if (e.state === 'windup') glint(c, art.redGlow, 8, 2, 6 + 8 * k, e.t < 0.2 ? 1 - e.t / 0.2 : 0);
}

// ---------------- boss ----------------
export function drawBoss(c, b, art, time) {
  c.save(); c.translate(b.x + b.shakeX, b.y); c.scale(b.face, 1); c.lineCap = 'round'; c.lineJoin = 'round';
  if (b.state === 'dying') c.globalAlpha = Math.max(0, 1 - Math.max(0, b.t - 2.4) * 1.2);
  const flash = false;
  const metal = flash ? '#f6ece2' : '#2c2624', dark = flash ? '#ddd' : '#171211', plateC = flash ? '#fff' : '#4a423b';
  const k = b.state === 'windup' ? Math.min(1, b.t / b.windup) : 0;
  let crouch = 0, hammer = -0.3, cannon = b.cannonAngle, ext = 0;
  const charging = b.attack === 'charge' && b.state === 'active';
  if (b.attack === 'slam') {
    // The arm telescopes out; at impact the head centre sits exactly on (x + 72, floor), where the hit is checked.
    if (b.state === 'windup') { hammer = -0.3 - 2.3 * k; ext = 0.6 * k; }
    else if (b.state === 'active' || b.state === 'recover') { const r = b.state === 'active' ? 0 : Math.min(1, b.t / (b.recover || 1)); hammer = 1.45; ext = 1 - Math.max(0, r - 0.5) * 2; crouch = 70 * (r < 0.5 ? 1 : 1 - (r - 0.5) * 2); }
  }
  if (b.attack === 'charge' && b.state === 'windup') crouch = 18 * k;
  if (charging) { crouch = 16; hammer = 0.05; ext = 0.35; c.rotate(0.08); }
  if (b.state === 'stunned' || b.state === 'stagger') { crouch = 22; hammer = 1.2; }
  if (b.state === 'transform') crouch = 24 * Math.min(1, b.t * 2) * (b.t < 2 ? 1 : Math.max(0, 1 - (b.t - 2) * 2));
  if (b.state === 'dying') crouch = Math.min(70, b.t * 30);
  const hip = -112 + crouch, ph = b.walkPhase;
  // legs (reverse-jointed)
  [[-34, ph + Math.PI, dark], [30, ph, metal]].forEach(([lx, lp, col]) => {
    const lift = b.state === 'walk' || charging ? Math.max(0, Math.sin(lp)) * (charging ? 22 : 14) : 0;
    const kx = lx + 26, ky = hip + 46 - lift * 0.5, ax = lx - 8, ay = -24 - lift;
    limb(c, lx, hip, kx, ky, 18, col); limb(c, kx, ky, ax, ay, 14, col); limb(c, ax, ay, lx + 6, -2 - lift * 0.3, 11, col);
    c.fillStyle = col; c.beginPath(); c.moveTo(lx - 18, -lift * 0.3); c.lineTo(lx + 30, -lift * 0.3); c.lineTo(lx + 22, -12 - lift * 0.3); c.lineTo(lx - 10, -12 - lift * 0.3); c.fill();
    c.fillStyle = flash ? '#fff' : '#ff7a32'; c.globalAlpha *= 0.6; c.beginPath(); c.arc(kx, ky, 3.5, 0, 7); c.fill(); c.globalAlpha /= 0.6;
  });
  // pelvis block joining legs and torso
  c.fillStyle = dark; c.beginPath(); c.moveTo(-52, hip + 10); c.lineTo(48, hip + 10); c.lineTo(60, hip - 36); c.lineTo(-64, hip - 36); c.closePath(); c.fill();
  c.fillStyle = metal; c.fillRect(-40, hip - 14, 80, 10);
  // cannon arm (behind body)
  const csx = -40, csy = hip - 70;
  c.save(); c.translate(csx, csy); c.rotate(cannon);
  c.fillStyle = dark; c.fillRect(-6, -12, 84, 24); c.fillStyle = metal; c.fillRect(54, -15, 34, 30);
  c.fillStyle = '#060505'; c.beginPath(); c.arc(88, 0, 9, 0, 7); c.fill();
  if (b.attack === 'barrage' && b.state === 'windup') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.5 * k; c.drawImage(art.redGlow, 88 - 20 - k * 10, -20 - k * 10, 40 + k * 20, 40 + k * 20); }
  c.restore();
  // torso frame
  const ty = hip - 30;
  c.fillStyle = dark; c.beginPath(); c.moveTo(-70, ty); c.lineTo(66, ty); c.lineTo(82, ty - 92); c.lineTo(20, ty - 128); c.lineTo(-60, ty - 116); c.lineTo(-82, ty - 60); c.closePath(); c.fill();
  // inner machinery + core
  const coreX = 4, coreY = ty - 62;
  const exposed = b.phase === 2 || b.state === 'transform' || b.state === 'dying';
  c.strokeStyle = flash ? '#fff' : '#2a1a14'; c.lineWidth = 5;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-60 + i * 30, ty - 4); c.quadraticCurveTo(-40 + i * 25, ty - 70, coreX, coreY); c.stroke(); }
  const pulse = 0.65 + Math.sin(time * (exposed ? 9 : 3)) * 0.2;
  c.save(); c.globalCompositeOperation = 'lighter';
  const cs = exposed ? 70 : 36; c.globalAlpha = exposed ? pulse : 0.35 * pulse;
  c.drawImage(art.warmGlow, coreX - cs, coreY - cs, cs * 2, cs * 2); c.restore();
  c.fillStyle = exposed ? (flash ? '#fff' : '#ffd38a') : '#5a2a14'; c.beginPath(); c.arc(coreX, coreY, exposed ? 17 : 12, 0, 7); c.fill();
  if (exposed) { c.fillStyle = '#fff6dc'; c.beginPath(); c.arc(coreX, coreY, 8 * pulse, 0, 7); c.fill(); }
  // armour plates (each one breaks off at its own threshold)
  b.plates.forEach((pl) => {
    if (pl.gone) return;
    c.fillStyle = plateC; c.beginPath(); pl.poly.forEach(([x, y], i) => (i ? c.lineTo(x, ty + y) : c.moveTo(x, ty + y))); c.closePath(); c.fill();
    c.strokeStyle = flash ? '#fff' : '#100c0b'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = flash ? '#fff' : 'rgba(255,190,130,0.45)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(pl.poly[0][0], ty + pl.poly[0][1]); c.lineTo(pl.poly[1][0], ty + pl.poly[1][1]); c.stroke();
    c.fillStyle = flash ? '#fff' : '#6a4a34'; pl.rivets.forEach(([x, y]) => { c.beginPath(); c.arc(x, ty + y, 2, 0, 7); c.fill(); });
    if (pl.crack > 0) { c.strokeStyle = `rgba(255,140,60,${0.4 + pl.crack * 0.5})`; c.lineWidth = 1.6; c.beginPath(); pl.crackLine.forEach(([x, y], i) => (i ? c.lineTo(x, ty + y) : c.moveTo(x, ty + y))); c.stroke(); }
  });
  // rim light from the furnaces
  c.strokeStyle = flash ? '#fff' : 'rgba(255,140,70,0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-82, ty - 60); c.lineTo(-60, ty - 116); c.lineTo(20, ty - 128); c.stroke();
  // head + eye
  const hx = 58, hy = ty - 108;
  c.fillStyle = metal; c.beginPath(); c.moveTo(hx - 26, hy + 18); c.lineTo(hx - 18, hy - 14); c.lineTo(hx + 22, hy - 10); c.lineTo(hx + 30, hy + 12); c.lineTo(hx + 8, hy + 24); c.closePath(); c.fill();
  const eyeHot = b.state === 'windup' || b.phase === 2;
  c.save(); c.globalCompositeOperation = 'lighter'; const es = 16 + (b.attack === 'beam' && b.state === 'windup' ? 40 * k : 0) + (eyeHot ? 8 : 0);
  c.globalAlpha = b.state === 'dormant' ? b.wake : 0.95; c.drawImage(art.redGlow, hx + 14 - es, hy + 2 - es, es * 2, es * 2); c.restore();
  c.fillStyle = b.state === 'dormant' && b.wake < 0.2 ? '#2a1010' : '#ffe0d0'; c.fillRect(hx + 8, hy, 14, 4);
  // hammer arm (in front)
  const hsx = 52, hsy = ty - 84;
  c.save(); c.translate(hsx, hsy); c.rotate(hammer);
  const L = 70 + 64 * ext;
  c.fillStyle = dark; c.fillRect(50, -9, L - 50, 18); c.fillStyle = flash ? '#fff' : 'rgba(255,170,100,0.35)'; c.fillRect(50, -9, L - 50, 2);
  c.fillStyle = metal; c.fillRect(-10, -14, 70, 28); c.fillStyle = dark; c.beginPath(); c.arc(0, 0, 18, 0, 7); c.fill();
  c.fillStyle = plateC; c.fillRect(L, -38, 46, 76); c.fillStyle = dark; c.fillRect(L + 4, -34, 8, 68);
  if (b.attack === 'slam' && b.state === 'windup') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = k; c.drawImage(art.warmGlow, L + 23 - 50, -50, 100, 100); }
  c.restore();
  c.restore();
}
