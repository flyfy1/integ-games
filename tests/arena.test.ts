import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, PASSIVE_IDS, WEAPON_IDS, xpNeed, type WeaponId } from '../src/games/arena/data';
import { cardRects, burstRect, xpBarRect, type Ui } from '../src/games/arena/render';
import { BOSS_TIME, MAX_ENEMIES, STEP, chooseUpgrade, createState, pickupRadius, rollChoices, spawnEnemy, step, threat, type Input, type State } from '../src/games/arena/sim';

const rng = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const idle: Input = { mx: 0, my: 0, burst: false };
const run = (s: State, seconds: number, input: Input | ((s: State) => Input) = idle, immortal = false) => {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
    if (s.phase === 'levelup') chooseUpgrade(s, 0);
    step(s, typeof input === 'function' ? input(s) : input);
    if (immortal) { s.hp = s.maxHp; if (s.phase === 'dead') s.phase = 'play'; }
  }
};
const digest = (s: State) => JSON.stringify([s.time.toFixed(3), s.px.toFixed(3), s.py.toFixed(3), s.hp.toFixed(2), s.level, s.xp, s.kills, s.score, s.enemies.length, s.gems.length, s.weapons, s.passives, s.enemies.slice(0, 20).map(e => [e.kind, e.x.toFixed(2), e.y.toFixed(2), e.hp])]);
const circle = (s: State): Input => ({ mx: Math.cos(s.time * 0.8), my: Math.sin(s.time * 0.8), burst: true });
const bare = (seed = 7) => { const s = createState(rng(seed)); s.weapons.bolt = 0; return s; };

describe('Pocket Survivor simulation', () => {
  it('replays identically from the same seed and inputs', () => {
    const a = createState(rng(42)), b = createState(rng(42)), c = createState(rng(43));
    run(a, 70, circle, true); run(b, 70, circle, true); run(c, 70, circle, true);
    expect(digest(a)).toBe(digest(b));
    expect(digest(a)).not.toBe(digest(c));
    expect(a.kills).toBeGreaterThan(20);
  });

  it('kills an idle player and then stops the clock', () => {
    const s = createState(rng(3));
    run(s, 120);
    expect(s.phase).toBe('dead');
    expect(s.hp).toBe(0);
    expect(s.killer).not.toBe('');
    expect(s.events.some(event => event.type === 'dead')).toBe(true);
    const time = s.time; step(s, idle);
    expect(s.time).toBe(time);
  });

  it('pauses on level-up, offers three distinct cards and applies the chosen one', () => {
    const s = createState(rng(5));
    s.xp = s.need + 2;
    step(s, idle);
    expect(s.phase).toBe('levelup');
    expect(s.level).toBe(2);
    expect(s.xp).toBe(2);
    expect(s.choices).toHaveLength(3);
    expect(new Set(s.choices.map(card => card.key)).size).toBe(3);
    const time = s.time; step(s, { mx: 1, my: 0, burst: false });
    expect(s.time).toBe(time);
    expect(s.px).toBe(0);
    expect(chooseUpgrade(s, 9)).toBe(false);
    const card = s.choices[0], before = card.kind === 'weapon' ? s.weapons[card.key as WeaponId] : -1;
    expect(chooseUpgrade(s, 0)).toBe(true);
    expect(s.phase).toBe('play');
    if (card.kind === 'weapon') expect(s.weapons[card.key as WeaponId]).toBe(before + 1);
    expect(chooseUpgrade(s, 0)).toBe(false);
  });

  it('always offers a weapon in the first picks and never offers a maxed upgrade', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createState(rng(seed)); s.level = 2;
      expect(rollChoices(s).some(card => card.kind === 'weapon'), `seed ${seed}`).toBe(true);
    }
    const s = createState(rng(9));
    WEAPON_IDS.forEach(id => { s.weapons[id] = MAX_LEVEL; }); PASSIVE_IDS.forEach(id => { s.passives[id] = MAX_LEVEL; });
    s.passives.might = MAX_LEVEL - 1; s.level = 30;
    const cards = rollChoices(s);
    expect(cards.map(card => card.key)).toEqual(['might', 'heal', 'bounty']);
    s.phase = 'levelup'; s.choices = cards; s.hp = 10; chooseUpgrade(s, 1);
    expect(s.hp).toBeGreaterThan(10);
  });

  it('gives brief invulnerability after a hit instead of draining HP every tick', () => {
    const s = bare();
    for (let index = 0; index < 4; index++) spawnEnemy(s, 'grub', index, 0);
    step(s, idle);
    const afterFirst = s.hp;
    expect(afterFirst).toBeLessThan(s.maxHp);
    expect(s.invuln).toBeGreaterThan(0.5);
    for (let tick = 0; tick < 20; tick++) { for (const enemy of s.enemies) { enemy.x = 0; enemy.y = 0; } step(s, idle); }
    expect(s.hp).toBe(afterFirst);
    expect(s.events.filter(event => event.type === 'hurt')).toHaveLength(1);
  });

  it('pulls gems inside the pickup radius and turns them into XP', () => {
    const s = bare();
    s.gems.push({ x: pickupRadius(s) - 5, y: 0, value: 3, kind: 'xp', pull: false, taken: false, speed: 0, age: 0 }, { x: 900, y: 0, value: 2, kind: 'xp', pull: false, taken: false, speed: 0, age: 0 });
    s.spawnAcc = -1000;
    run(s, 1.5);
    expect(s.xp).toBe(3);
    expect(s.gems).toHaveLength(1);
    s.gems.push({ x: 10, y: 0, value: 0, kind: 'magnet', pull: false, taken: false, speed: 0, age: 0 });
    run(s, 4);
    expect(s.xp + (s.level > 1 ? xpNeed(1) : 0)).toBe(5);
  });

  it.each(WEAPON_IDS.map(id => [id]))('%s damages enemies on its own at every level', (id) => {
    for (const level of [1, MAX_LEVEL]) {
      const s = bare(11); s.weapons[id] = level; s.spawnAcc = -1000; s.nextSwarm = s.nextElite = 1e9;
      const brute = spawnEnemy(s, 'brute', 62, 0); brute.speed = 0; brute.hp = brute.maxHp = 100000;
      run(s, 5, idle, true);
      expect(brute.hp, `${id} level ${level}`).toBeLessThan(brute.maxHp);
    }
  });

  it('blades block enemy shots and the burst wipes them', () => {
    const s = bare(); s.weapons.blades = MAX_LEVEL; s.spawnAcc = -1000;
    for (let index = 0; index < 24; index++) { const angle = index / 24 * Math.PI * 2; s.enemyShots.push({ x: Math.cos(angle) * 140, y: Math.sin(angle) * 140, vx: -Math.cos(angle) * 60, vy: -Math.sin(angle) * 60, r: 5, dmg: 5, life: 5, source: 'spitter' }); }
    run(s, 3);
    expect(s.hp).toBeGreaterThan(s.maxHp - 30);
    const t = bare(); t.spawnAcc = -1000; t.burst = t.burstNeed;
    t.enemyShots.push({ x: 60, y: 0, vx: 0, vy: 0, r: 5, dmg: 5, life: 5, source: 'spitter' });
    const grub = spawnEnemy(t, 'grub', 80, 0); grub.speed = 0;
    step(t, { mx: 0, my: 0, burst: true });
    expect(t.burst).toBe(0);
    expect(t.events.some(event => event.type === 'burst')).toBe(true);
    run(t, 0.5);
    expect(t.enemyShots).toHaveLength(0);
    expect(grub.hp).toBeLessThanOrEqual(0);
    const u = bare(); u.burst = u.burstNeed - 1; step(u, { mx: 0, my: 0, burst: true });
    expect(u.rings).toHaveLength(0);
  });

  it('brings the Warden on schedule and winning opens endless mode', () => {
    const s = createState(rng(21));
    s.time = BOSS_TIME - STEP * 2; s.nextSwarm = s.nextElite = 1e9;
    run(s, 0.2, idle, true);
    expect(s.boss?.kind).toBe('warden');
    expect(s.events.some(event => event.type === 'banner' && /WARDEN/.test(event.text))).toBe(true);
    const boss = s.boss!; boss.x = s.px + 60; boss.y = s.py; boss.hp = 1; s.hp = 30;
    run(s, 3, idle, true);
    expect(s.boss).toBeNull();
    expect(s.won).toBe(true);
    expect(s.bossesDown).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(250);
    expect(s.nextBoss).toBeGreaterThan(s.time);
    expect(s.events.some(event => event.type === 'bossdown')).toBe(true);
  });

  it('ramps the threat over time and schedules swarms and elites', () => {
    const s = createState(rng(2));
    const early = threat(s); s.time = 240; const late = threat(s);
    expect(late.rate).toBeGreaterThan(early.rate * 3);
    expect(late.hp).toBeGreaterThan(early.hp * 3);
    s.time = 0;
    run(s, 62, circle, true);
    const banners = s.events.filter(event => event.type === 'banner').map(event => event.type === 'banner' ? event.text : '');
    expect(banners).toContain('SWARM CLOSING IN');
    expect(banners).toContain('ELITE INCOMING');
    for (let level = 1; level < 60; level++) expect(xpNeed(level + 1)).toBeGreaterThan(xpNeed(level));
  });

  it('stays bounded and fast through a long crowded run', () => {
    const s = createState(rng(77)); let peak = 0;
    const started = performance.now();
    for (let tick = 0; tick < 420 / STEP; tick++) {
      if (s.phase === 'levelup') chooseUpgrade(s, tick % s.choices.length);
      step(s, circle(s)); s.hp = s.maxHp; if (s.phase === 'dead') s.phase = 'play';
      s.events.length = 0; peak = Math.max(peak, s.enemies.length);
    }
    const perStep = (performance.now() - started) / s.tick;
    expect(peak).toBeGreaterThan(150);
    expect(peak).toBeLessThanOrEqual(MAX_ENEMIES + 80);
    expect(s.gems.length).toBeLessThanOrEqual(260);
    expect(s.enemyShots.length).toBeLessThanOrEqual(160);
    expect([s.px, s.py, ...s.enemies.flatMap(enemy => [enemy.x, enemy.y, enemy.hp])].every(Number.isFinite)).toBe(true);
    expect(s.bossesDown + (s.boss ? 1 : 0)).toBeGreaterThan(0);
    expect(perStep).toBeLessThan(4);
  });
});

describe('Pocket Survivor layout', () => {
  const ui = (touch: boolean) => ({ touch } as Ui);
  it.each([[374, 524], [360, 420], [938, 590], [620, 326], [447, 550]])('keeps three tappable cards inside a %ix%i stage', (w, h) => {
    const view = { w, h, scale: 1 }, rects = cardRects(view, 3);
    expect(rects).toHaveLength(3);
    rects.forEach((rect, index) => {
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.w).toBeLessThanOrEqual(w);
      expect(rect.y).toBeGreaterThanOrEqual(40); expect(rect.y + rect.h).toBeLessThanOrEqual(h);
      expect(rect.h).toBeGreaterThanOrEqual(64); expect(rect.w).toBeGreaterThanOrEqual(160);
      if (index) { const prev = rects[index - 1]; expect(rect.x >= prev.x + prev.w || rect.y >= prev.y + prev.h).toBe(true); }
    });
    const pill = burstRect(view, ui(true));
    expect(pill.y + pill.h).toBeLessThanOrEqual(h); expect(pill.h).toBeGreaterThanOrEqual(30);
    const bar = xpBarRect(view, ui(true));
    expect(bar.w).toBeGreaterThan(120); expect(bar.x + bar.w).toBeLessThanOrEqual(w);
  });
});
