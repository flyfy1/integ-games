/**
 * Tank Brawl Solo Tour balance playtest (bot-tuned, not human-measured).
 *
 *   npx vite-node scripts/tank-brawl-tour-balance.ts               # every stop, 40 matches each
 *   N=100 FROM=12 TO=12 HERO=3 npx vite-node scripts/tank-brawl-tour-balance.ts
 *   HERO=2 HSTYLE=bouncer npx vite-node scripts/tank-brawl-tour-balance.ts   # a kiting proxy instead of a plain one
 *
 * Seat 1 is the stop's own bot (style, skill and Boss hearts exactly as the game sets them up).
 * Seat 0 is a "proxy human": the bot brain at skill HERO (default 3, the sharpest aim and dodging)
 * with no personality, which is roughly a good player who just shoots and moves. Both bots are
 * unmirrored in Mirror Minutes. Prints the match win rate, the round win rate and how often
 * each star goal was met in a won round.
 */
import { arenaById } from '../src/games/tank-brawl-opus/arenas';
import { botIntent, SKILLS, withStyle, type BotStyle } from '../src/games/tank-brawl-opus/bot';
import { createWorld, makeTank, mirrored, spawnPoint, step, TWISTS, type Intent } from '../src/games/tank-brawl-opus/sim';
import { goalMet, TOUR, TOUR_TARGET, tourHearts, type RoundStats } from '../src/games/tank-brawl-opus/tour';

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const N = Number(env('N', '40')), FROM = Number(env('FROM', '1')), TO = Number(env('TO', String(TOUR.length))), HERO = Number(env('HERO', '3')), HSTYLE = process.env.HSTYLE as BotStyle | undefined;
const rng = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const unmirror = (world: Parameters<typeof mirrored>[0], intent: Intent): Intent => (mirrored(world) ? { ...intent, x: -intent.x, ax: -intent.ax } : intent);

function playRound(stopIndex: number, seed: number): RoundStats {
  const stop = TOUR[stopIndex], arena = arenaById(stop.arena), twist = TWISTS.find((item) => item.id === stop.twist)!;
  const world = createWorld(arena, twist, rng(seed), true);
  const [heroHp, botHp] = tourHearts(stop, twist);
  const hero = makeTank(world, 0, 0, ...spawnPoint(arena, 0), heroHp);
  const bot = makeTank(world, 1, 1, ...spawnPoint(arena, 1), botHp);
  const heroSkill = HSTYLE ? withStyle(SKILLS[HERO], HSTYLE) : SKILLS[HERO], botSkill = withStyle(SKILLS[stop.skill], stop.style);
  const stat: RoundStats = { won: false, heroHp: 0, heroMax: hero.maxHp, time: 0, botFell: false, grabbed: false };
  for (let frame = 0; frame < 60 * 180 && !world.finished; frame++) {
    step(world, new Map([[hero.id, unmirror(world, botIntent(world, hero, heroSkill))], [bot.id, unmirror(world, botIntent(world, bot, botSkill))]]));
    for (const event of world.events) {
      if (event.type === 'fall' && event.tank === bot.id && event.by === hero.id) stat.botFell = true;
      if (event.type === 'pickup' && event.tank === hero.id) stat.grabbed = true;
    }
    world.events.length = 0;
  }
  return { ...stat, won: world.winner === 0, heroHp: Math.max(0, hero.hp), time: world.time };
}

console.log(`proxy human = SKILLS[${HERO}]${HSTYLE ? ` as ${HSTYLE}` : ''}, ${N} matches per stop, first to ${TOUR_TARGET}`);
for (let index = FROM - 1; index < TO; index++) {
  const stop = TOUR[index];
  let matches = 0, rounds = 0, roundsWon = 0, goals = 0;
  for (let m = 0; m < N; m++) {
    const wins = [0, 0];
    let goal = false;
    for (let r = 0; wins[0] < TOUR_TARGET && wins[1] < TOUR_TARGET && r < 9; r++) {
      const round = playRound(index, 1000 * index + 17 * m + r + 1);
      rounds++;
      if (round.won) { wins[0]++; roundsWon++; } else wins[1]++;
      goal ||= goalMet(stop.goal, round);
    }
    if (wins[0] >= TOUR_TARGET) { matches++; if (goal) goals++; }
  }
  console.log(`stop ${String(index + 1).padStart(2)} ${stop.arena.padEnd(10)} ${stop.twist.padEnd(8)} ${stop.style.padEnd(7)} skill ${stop.skill}  match ${(100 * matches / N).toFixed(0).padStart(3)}%  rounds ${(100 * roundsWon / rounds).toFixed(0).padStart(3)}%  goal(${stop.goal}) in ${goals}/${matches} wins`);
}
