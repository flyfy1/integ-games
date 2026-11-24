import { describe, expect, it } from 'vitest';
import { BOSS_VARIANTS, GENERALS, GENERAL_IDS, MAX_LEVEL, PARTNER, PASSIVE_SLOTS, PRE_EVOLVE, STAGES, STAGE_IDS, WEAPON_IDS, WEAPON_SLOTS, type StageId } from '../src/games/arena/data';
import { FEATS, STAGE_CHAIN, TALENTS, bankRun, buyTalent, freshProfile, liveTotals, readProfile, talentBonus, talentCost } from '../src/games/arena/meta';
import { ENTRIES, campLayout, collectionLayout, talentRows, tiles } from '../src/games/arena/menu';
import { resultButtons, type View } from '../src/games/arena/render';
import { BOSS_TIME, MID_TIME, STEP, chooseUpgrade, closeChest, createState, openChest, rollChoices, runJade, spawnEnemy, step, type Input, type State } from '../src/games/arena/sim';
import { dailyLoadout, runConfig } from '../src/games/arena';

const rng = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const idle: Input = { mx: 0, my: 0, burst: false };
const quiet = (s: State) => { s.spawnAcc = -1e9; s.nextSwarm = s.nextElite = s.nextMid = s.nextBoss = 1e9; return s; };
const run = (s: State, seconds: number, input: Input | ((s: State) => Input) = idle, immortal = false) => {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) {
    if (s.phase === 'levelup') chooseUpgrade(s, 0);
    if (s.chest) closeChest(s);
    step(s, typeof input === 'function' ? input(s) : input);
    if (immortal) { s.hp = s.maxHp; if (s.phase === 'dead') s.phase = 'play'; }
  }
};
/** A modest kiting bot: samples 16 headings and steps away from the crowd, toward loot and toward bosses when healthy. */
const kite = (s: State): Input => {
  let best = { mx: 0, my: 0 }, bestCost = Infinity;
  for (let i = 0; i <= 16; i++) {
    const a = i / 16 * Math.PI * 2, mx = i === 16 ? 0 : Math.cos(a), my = i === 16 ? 0 : Math.sin(a);
    let cost = 0;
    for (const look of [0.25, 0.6]) {
      const x = s.px + mx * 150 * look, y = s.py + my * 150 * look;
      for (const e of s.enemies) { const d = Math.hypot(x - e.x, y - e.y) - e.r; if (d < 140) cost += (e.boss ? 5 : e.elite ? 2 : 1) / Math.max(6, d) ** 1.5; }
      for (const b of s.enemyShots) { const d = Math.hypot(x - b.x - b.vx * look, y - b.y - b.vy * look); if (d < 50) cost += 3 / Math.max(4, d) ** 1.5; }
      for (const f of s.fires) if (f.hostile && Math.hypot(x - f.x, y - f.y) < f.r + 14) cost += 1;
    }
    const gem = s.gems.find(g => Math.hypot(g.x - s.px, g.y - s.py) < 300); if (gem) cost += Math.hypot(s.px + mx * 40 - gem.x, s.py + my * 40 - gem.y) * 0.0002;
    const foe = s.mid ?? s.boss; if (foe && s.hp > s.maxHp * 0.4) { const d = Math.hypot(s.px + mx * 60 - foe.x, s.py + my * 60 - foe.y); if (d > 170) cost += (d - 170) * 0.0004; }
    if (cost < bestCost) { bestCost = cost; best = { mx, my }; }
  }
  return { ...best, burst: s.hp < s.maxHp * 0.6 };
};

describe('Pocket Survivor paired evolutions and build slots', () => {
  it('holds a weapon at the evolution gate until its partner passive is owned', () => {
    for (const id of WEAPON_IDS) {
      const s = createState(rng(3)); s.weapons.bolt = 0; s.weapons[id] = PRE_EVOLVE; s.level = 20;
      for (let roll = 0; roll < 30; roll++) expect(rollChoices(s).some(card => card.key === id), `${id} offered without partner`).toBe(false);
      s.passives[PARTNER[id]] = 1;
      let offered = false;
      for (let roll = 0; roll < 30 && !offered; roll++) { const card = rollChoices(s).find(item => item.key === id); if (card) { offered = true; expect(card.evolve).toBe(true); expect(card.partner).toBe(PARTNER[id]); expect(card.partnerOwned).toBe(true); } }
      expect(offered, `${id} evolution offered`).toBe(true);
    }
  });

  it('shows the pairing on both cards', () => {
    const s = createState(rng(4)); s.level = 10;
    const cards = Array.from({ length: 40 }, () => rollChoices(s)).flat().filter(card => card.kind !== 'bonus');
    for (const card of cards) expect(card.partner, card.key).toBeTruthy();
  });

  it('caps the build at four weapons and four passives', () => {
    const s = createState(rng(5)); s.level = 12;
    WEAPON_IDS.slice(0, WEAPON_SLOTS).forEach(id => { s.weapons[id] = 1; });
    (['might', 'haste', 'vitality', 'magnet'] as const).slice(0, PASSIVE_SLOTS).forEach(id => { s.passives[id] = 1; });
    for (let roll = 0; roll < 60; roll++) for (const card of rollChoices(s)) if (card.kind !== 'bonus') expect(card.level, card.key).toBeGreaterThan(1);
  });

  it('evolution fires an event and a free shockwave; a chest grants a ready evolution first', () => {
    const s = quiet(createState(rng(6)));
    s.weapons.lance = PRE_EVOLVE; s.passives.might = 1;
    openChest(s, false);
    expect(s.weapons.lance).toBe(MAX_LEVEL);
    expect(s.evolved).toContain('lance');
    expect(s.events.some(event => event.type === 'evolve' && event.key === 'lance')).toBe(true);
    expect(s.rings.some(ring => ring.burst)).toBe(true);
    expect(s.chest?.items[0].evolve).toBe(true);
    expect(s.phase).toBe('play');
    expect(closeChest(s)).toBe(true);
    expect(s.chest).toBeNull();
    const big = quiet(createState(rng(7))); big.weapons.blades = 2; big.passives.armor = 1; openChest(big, true);
    expect(big.chest?.items).toHaveLength(3);
  });

  it('picks up a chest dropped by an officer and opens it', () => {
    const s = quiet(createState(rng(8)));
    const officer = spawnEnemy(s, 'brute', 40, 0, true); officer.hp = 1; officer.speed = 0;
    run(s, 0.5);
    let opened = false;
    for (let tick = 0; tick < 240 && !opened; tick++) { if (s.phase === 'levelup') chooseUpgrade(s, 0); step(s, { mx: s.gems.find(gem => gem.kind === 'chest') ? Math.sign((s.gems.find(gem => gem.kind === 'chest')!.x) - s.px) : 0, my: 0, burst: false }); if (s.chest) opened = true; }
    expect(opened).toBe(true);
    expect(s.chests).toBe(1);
    expect(s.elites).toBe(1);
  });
});

describe('Pocket Survivor stages, bosses and generals', () => {
  it('sends a named mid-boss at 2:30 that drops a big chest but does not end the stage', () => {
    for (const stage of STAGE_IDS) {
      const s = createState(rng(9), { stage }); s.time = MID_TIME - STEP; s.nextSwarm = s.nextElite = 1e9;
      run(s, 0.1, idle, true);
      expect(s.mid?.boss, stage).toBe(1);
      expect(s.mid?.kind).toBe(STAGES[stage].mid.kind);
      s.mid!.hp = 1; s.mid!.x = s.px + 50; s.mid!.y = s.py;
      run(s, 2, idle, true);
      expect(s.midDown, stage).toBe(true);
      expect(s.won).toBe(false);
      expect(s.gems.some(gem => gem.kind === 'chest' && gem.value >= 3) || s.chests > 0).toBe(true);
    }
  });

  it('ends each battleground with its own final boss, and every attack set runs', () => {
    const seen = new Set<string>();
    for (const stage of STAGE_IDS) {
      const s = createState(rng(10), { stage }); s.time = BOSS_TIME - STEP; s.nextSwarm = s.nextElite = s.nextMid = 1e9;
      run(s, 0.1, idle, true);
      expect(s.boss?.variant, stage).toBe(STAGES[stage].boss);
      seen.add(s.boss!.variant);
      s.boss!.x = s.px + 120; s.boss!.hp = s.boss!.maxHp = 1e9;
      run(s, 20, (st) => ({ mx: Math.cos(st.time), my: Math.sin(st.time), burst: false }), true);
      expect(s.boss!.atk, stage).toBeGreaterThanOrEqual(3);
      if (STAGES[stage].boss === 'marshal') expect(s.events.length + s.fires.length).toBeGreaterThan(0);
    }
    expect([...seen].sort()).toEqual([...BOSS_VARIANTS].sort());
  });

  it('the Siege Marshal lobs pots that burn a general who stands in them', () => {
    const s = createState(rng(11), { stage: 'camp' }); quiet(s); s.weapons.bolt = 0;
    const boss = spawnEnemy(s, 'warden', 300, 0); boss.speed = 0; boss.cd = 0; boss.atk = 0; s.boss = boss;
    run(s, 2.2);
    expect(s.fires.some(fire => fire.hostile) || s.hp < s.maxHp).toBe(true);
    expect(s.hp).toBeLessThan(s.maxHp);
  });

  it('keeps each battleground to its own enemy mix early on', () => {
    const kinds = (stage: StageId) => { const s = createState(rng(12), { stage }); s.nextSwarm = s.nextElite = 1e9; run(s, 100, (st) => ({ mx: Math.cos(st.time), my: Math.sin(st.time), burst: true }), true); return new Set(Object.keys(s.seen)); };
    expect(kinds('bamboo').has('charger')).toBe(false);
    expect(kinds('river').has('spitter')).toBe(true);
    expect(kinds('camp').has('brute')).toBe(true);
    expect(kinds('fortress').has('charger')).toBe(true);
  });

  it('starts each general with a distinct weapon and trait', () => {
    const weapons = new Set<string>();
    for (const id of GENERAL_IDS) {
      const s = createState(rng(13), { general: id });
      const owned = WEAPON_IDS.filter(weapon => s.weapons[weapon] > 0);
      expect(owned).toEqual([GENERALS[id].weapon]);
      weapons.add(owned[0]);
      expect(s.maxHp).toBe(GENERALS[id].hp);
    }
    expect(weapons.size).toBe(3);
  });

  it('applies talents and revives once with Second Life', () => {
    const s = quiet(createState(rng(14), { bonus: { hp: 50, revive: 1 } }));
    expect(s.maxHp).toBe(GENERALS.spear.hp + 50);
    s.hp = 1; const grub = spawnEnemy(s, 'grub', 0, 0); grub.speed = 0;
    run(s, 0.1);
    expect(s.phase).toBe('play'); expect(s.hp).toBeGreaterThan(s.maxHp * 0.4); expect(s.revives).toBe(0);
  });

  it('keeps the gentlest battleground winnable for a simple kiting bot', () => {
    let mids = 0, survived = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = createState(rng(seed * 7919), { stage: 'bamboo' });
      for (let tick = 0; tick < 240 / STEP && s.phase !== 'dead'; tick++) {
        if (s.phase === 'levelup') { const score = (card: (typeof s.choices)[number]) => (card.evolve ? 100 : 0) + (card.kind === 'weapon' ? 10 : 0) + (card.partnerOwned ? 20 : 0) + (card.kind === 'passive' && card.partner ? 8 : 0) + card.level; const index = s.choices.reduce((bestIndex, card, i) => score(card) > score(s.choices[bestIndex]) ? i : bestIndex, 0); chooseUpgrade(s, index); continue; }
        if (s.chest) closeChest(s);
        step(s, kite(s)); s.events.length = 0;
      }
      if (s.midDown) mids++; if (s.phase !== 'dead') survived++;
    }
    expect(survived).toBeGreaterThanOrEqual(3);
    expect(mids).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe('Pocket Survivor Daily', () => {
  it('gives everyone the same stage, general and card offers for a date', () => {
    const a = dailyLoadout('2026-11-24'), b = dailyLoadout('2026-11-24'), c = dailyLoadout('2026-11-25');
    expect(a).toEqual(b);
    expect(STAGE_CHAIN).toContain(a.stage);
    expect([a.stage, a.general, a.seed]).not.toEqual([c.stage, c.general, c.seed]);
    const play = () => {
      const made = runConfig({ stage: 'bamboo', general: 'spear', daily: true }, freshProfile(), '2026-11-24');
      const s = createState('rng' in made ? made.rng : rng(1), made.config);
      run(s, 40, (st) => ({ mx: Math.cos(st.time * 0.7), my: Math.sin(st.time * 0.7), burst: true }), true);
      return JSON.stringify([s.stage, s.general, s.level, s.kills, s.weapons, s.passives]);
    };
    expect(play()).toBe(play());
    const made = runConfig({ stage: 'bamboo', general: 'spear', daily: true }, null, '2026-11-24');
    expect(made.config.bonus).toBeUndefined();
    expect(made.config.weapons).toEqual(WEAPON_IDS);
  });
});

describe('Pocket Survivor meta track', () => {
  it('reads garbage as a fresh profile and validates fields', () => {
    expect(readProfile(null)).toEqual(freshProfile());
    expect(readProfile('nope')).toEqual(freshProfile());
    const p = readProfile({ jade: -5, talents: { vigor: 99, power: 'x' }, weapons: ['crossbow', 'laser'], stages: ['river', 'moon'], last: { stage: 'camp', general: 'blades' } });
    expect(p.jade).toBe(0);
    expect(p.talents.vigor).toBe(TALENTS.vigor.max);
    expect(p.talents.power).toBe(0);
    expect(p.weapons).toContain('crossbow'); expect(p.weapons).not.toContain('laser'); expect(p.weapons).toContain('bolt');
    expect(p.stages).toEqual(expect.arrayContaining(['bamboo', 'march', 'river'])); expect(p.stages).not.toContain('moon');
    expect(p.last).toEqual({ stage: 'camp', general: 'blades' });
    expect(readProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('prices talents per rank and caps them', () => {
    const p = freshProfile(); p.jade = 1000;
    expect(talentCost('vigor', 0)).toBe(15); expect(talentCost('vigor', 2)).toBe(45);
    for (let i = 0; i < 10; i++) buyTalent(p, 'revive');
    expect(p.talents.revive).toBe(1); expect(p.jade).toBe(800);
    expect(buyTalent({ ...freshProfile(), jade: 1 }, 'power')).toBe(false);
    expect(talentBonus(p).revive).toBe(1);
  });

  it('banks jade, unlocks feats and opens the next battleground after its mid-boss', () => {
    const p = freshProfile(), s = createState(rng(15), { stage: 'bamboo' });
    s.time = 200; s.score = 500; s.kills = 1600; s.elites = 9; s.chests = 6; s.level = 16; s.midDown = true; s.evolved = ['bolt']; s.seen = { grub: true, 'mid:skitter': true };
    const result = bankRun(p, s, runJade(s));
    expect(result.jade).toBeGreaterThan(0); expect(p.jade).toBe(result.jade);
    expect(result.unlocked.map(feat => feat.id).sort()).toEqual(['chests', 'evolve', 'kills', 'level', 'noblades', 'officers']);
    expect(p.weapons).toEqual(expect.arrayContaining(['crossbow', 'firepot', 'whirl']));
    expect(p.passives).toEqual(expect.arrayContaining(['armor', 'fortune']));
    expect(p.generals).toContain('blades'); expect(p.generals).not.toContain('strategist');
    expect(result.stagesOpened).toEqual(['river']);
    expect(p.best.bamboo).toBe(s.score); expect(p.seen).toContain('mid:skitter');
    // feats announce once
    expect(bankRun(p, createState(rng(16)), 0).unlocked).toHaveLength(0);
    const daily = freshProfile(), d = createState(rng(17), { stage: 'camp' }); d.score = 999; d.midDown = true;
    bankRun(daily, d, 3, true);
    expect(daily.best.camp).toBeUndefined(); expect(daily.stages).not.toContain('fortress'); expect(daily.jade).toBe(3);
  });

  it('tracks the no-blades feat as best time without ever owning blades', () => {
    const p = freshProfile(), s = createState(rng(18)); s.time = 170;
    expect(liveTotals(p, s).noBladesTime).toBe(170);
    s.weapons.blades = 1; s.bladesEver = true;
    expect(liveTotals(p, s).noBladesTime).toBe(0);
    expect(FEATS.every(feat => feat.goal > 0)).toBe(true);
  });
});

describe('Pocket Survivor camp layout', () => {
  const sizes: [number, number][] = [[374, 524], [360, 420], [938, 590], [620, 326], [447, 550], [390, 664], [1100, 660]];
  const within = (r: { x: number; y: number; w: number; h: number }, v: View) => r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w && r.y + r.h <= v.h;
  const apart = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
  it.each(sizes)('fits the camp, talents, collection and result buttons in %ix%i', (w, h) => {
    const view = { w, h, scale: 1 }, camp = campLayout(view);
    const all = [...camp.generals, ...camp.stages, camp.talents, camp.collection];
    expect(camp.stages).toHaveLength(ENTRIES.length);
    for (const r of all) { expect(within(r, view), JSON.stringify(r)).toBe(true); expect(r.h).toBeGreaterThanOrEqual(30); }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(apart(all[i], all[j]), `${i} vs ${j}`).toBe(true);
    for (const r of talentRows(view)) { expect(within(r, view)).toBe(true); expect(r.h).toBeGreaterThanOrEqual(34); }
    const grid = collectionLayout(view, tiles(freshProfile()).length);
    for (const r of grid.tiles) { expect(within(r, view)).toBe(true); expect(r.w).toBeGreaterThanOrEqual(26); expect(apart(r, grid.detail)).toBe(true); }
    const buttons = resultButtons(view, { result: { lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], camp: true, share: true } });
    for (const r of [buttons.again, buttons.camp, buttons.share!]) expect(within(r, view)).toBe(true);
    expect(apart(buttons.again, buttons.camp) && apart(buttons.camp, buttons.share!)).toBe(true);
  });
});
