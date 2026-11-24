/**
 * Tank Clash co-op balance playtest (bot-tuned, not human-measured).
 *
 *   npx vite-node scripts/tank-clash-balance.ts            # every stage, every difficulty
 *   N=20 DIFF=normal TEAMS=1p-solo FROM=6 TO=12 PERKS=4 npx vite-node scripts/tank-clash-balance.ts
 *
 * Player 1 is driven by the wingman brain at full human speed and reload (a "proxy human");
 * the AI ally, when present, keeps its handicaps. PERKS=n hands the run n random field upgrades
 * (default: one per stage already cleared, capped at 6, roughly what a continuous run has). Prints win rate, base armour left and time.
 */
import { baseHp, COOP_STAGE_COUNT, createArenaState, PERK_IDS, PERK_MAX, playtestControls, stepArena, type PerkSet } from '../src/games/tank-clash/engine';
import type { Difficulty, PlayerControlInput, TeamSetup } from '../src/games/tank-clash/types';

const idle: PlayerControlInput = { moveX: 0, moveY: 0, fire: false, fireJustPressed: false, specialJustPressed: false };
const rng = (seed: number) => () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const env = (k: string, d: string) => process.env[k] ?? d;
const N = Number(env('N', '12'));
const FROM = Number(env('FROM', '0'));
const TO = Number(env('TO', String(COOP_STAGE_COUNT)));
const PERKS = process.env.PERKS === undefined ? -1 : Number(process.env.PERKS);
const diffs = env('DIFF', 'easy,normal,hard').split(',') as Difficulty[];
const teams = env('TEAMS', '1p-solo,1p-ai').split(',') as TeamSetup[];

function randomPerks(n: number, random: () => number): PerkSet {
  const perks: PerkSet = {};
  for (let i = 0; i < n; i++) {
    const open = PERK_IDS.filter((id) => (perks[id] ?? 0) < PERK_MAX[id]);
    const id = open[Math.floor(random() * open.length)];
    perks[id] = (perks[id] ?? 0) + 1;
  }
  return perks;
}

export function playStage(stageIndex: number, teamSetup: TeamSetup, difficulty: Difficulty, seed: number, perkCount = 0) {
  const random = rng(seed);
  const s = createArenaState({ mode: 'coop', teamSetup, stageIndex, difficulty, perks: randomPerks(perkCount, random) });
  const p1 = s.tanks[0];
  for (let i = 0; i < 60 * 400 && s.outcome === 'none'; i++) {
    const c = p1.alive ? playtestControls(s, p1, 1 / 60, random) : idle;
    stepArena(s, 1 / 60, [c, idle], random);
  }
  return s;
}

for (const difficulty of diffs) {
  for (const team of teams) {
    const cells: string[] = [];
    for (let st = FROM; st < TO; st++) {
      let wins = 0;
      let base = 0;
      let time = 0;
      for (let k = 0; k < N; k++) {
        const s = playStage(st, team, difficulty, 1000 + k * 7 + st * 131, PERKS >= 0 ? PERKS : Math.min(st, 6));
        if (s.outcome === 'stage-clear' || s.outcome === 'coop-victory') {
          wins++;
          base += baseHp(s);
          time += s.roundTimer;
        }
      }
      cells.push(`S${st + 1} ${String(Math.round((100 * wins) / N)).padStart(3)}%${wins ? ` b${(base / wins).toFixed(1)} ${Math.round(time / wins)}s` : ''}`);
    }
    console.log(`${difficulty.padEnd(6)} ${team.padEnd(7)} ${cells.join(' | ')}`);
  }
}
