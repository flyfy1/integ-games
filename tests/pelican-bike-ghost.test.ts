import { describe, expect, it } from 'vitest';
import { decode, encode, ghostKey, newRecorder, poseAt, record, stageHash } from '../src/games/pelican-bike/ghost';
import { createSim, noInput, STEP, stepSim } from '../src/games/pelican-bike/sim';

describe('pelican-bike ghost', () => {
  it('records a real ride and plays it back close to where the rider actually was', () => {
    const s = createSim(0);
    const rec = newRecorder();
    const inp = { ...noInput(), right: true };
    const truth: { t: number; x: number; y: number }[] = [];
    for (let i = 0; i < 8 / STEP; i++) {
      inp.jump = i % 90 < 30; inp.jumpPressed = i % 90 === 0;
      stepSim(s, inp, STEP);
      record(rec, s.time, s.P);
      if (i % 37 === 0) truth.push({ t: s.time, x: s.P.x, y: s.P.y });
    }
    rec.splits.push(3.25);
    const g = encode(rec, stageHash(0, false), s.time);
    const json = JSON.parse(JSON.stringify(g));
    expect(json.d.length).toBeLessThan(2000); // 8 s of riding stays small in storage
    const tr = decode(json, stageHash(0, false))!;
    expect(tr).not.toBeNull();
    expect(tr.sp).toEqual([3.25]);
    for (const p of truth) {
      const pose = poseAt(tr, p.t);
      expect(Math.abs(pose.x - p.x)).toBeLessThan(36);
      expect(Math.abs(pose.y - p.y)).toBeLessThan(40);
    }
    // After its ride ends the ghost waits at its last spot.
    expect(poseAt(tr, 999).x).toBe(tr.xs[tr.xs.length - 1]);
  });

  it('drops a ghost recorded on other tiles, in the other mode, or damaged', () => {
    const rec = newRecorder();
    record(rec, 0.35, { x: 10, y: 20, dir: 1, gliding: false, dead: false, ground: true });
    const g = encode(rec, stageHash(2, false), 30);
    expect(decode(g, stageHash(2, false))).not.toBeNull();
    expect(decode(g, stageHash(2, true))).toBeNull();
    expect(decode(g, stageHash(3, false))).toBeNull();
    for (const bad of [null, 'x', 7, { v: 1 }, { ...g, d: '1,2' }, { ...g, d: 'a,b,c' }, { ...g, v: 2 }]) expect(decode(bad, stageHash(2, false))).toBeNull();
    expect(ghostKey(4, false)).not.toBe(ghostKey(4, true));
  });

  it('snaps across a respawn instead of sliding through the level', () => {
    const rec = newRecorder();
    record(rec, 0, { x: 3000, y: 300, dir: 1, gliding: false, dead: true, ground: false });
    record(rec, 0.1, { x: 1200, y: 380, dir: 1, gliding: false, dead: false, ground: true });
    const tr = decode(encode(rec, 'h', 1), 'h')!;
    expect(poseAt(tr, 0.05).x).toBe(3000);
    expect(poseAt(tr, 0.05).dead).toBe(true);
    expect(poseAt(tr, 0.1).x).toBe(1200);
  });
});
