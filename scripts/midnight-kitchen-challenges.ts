/**
 * Midnight Kitchen Chef's Challenge proof (bot-measured, not human-measured).
 *
 *   npx vite-node scripts/midnight-kitchen-challenges.ts            # every night, 8 seeds
 *   N=20 ONLY=c3-5,c4-3 npx vite-node scripts/midnight-kitchen-challenges.ts
 *
 * Plays each night's challenge exactly as the game builds it (`challengeLevel`: smaller hand, no upgrades,
 * Standard, no Granny, no shop upgrades) with the savvy and casual autoplay bots and the loadout screen's own
 * suggested hand. Prints the win rate next to the unrestricted night for comparison.
 */
import { BOT_PROFILES, botLoadout, measureLevel } from '../src/games/midnight-kitchen/bot';
import { challengeLevel, challengeOf, LEVEL_LIST, nextLevelId, ownedAt } from '../src/games/midnight-kitchen/data';

const N = Number(process.env.N ?? 8), only = process.env.ONLY?.split(',');
const pct = (rate: number) => `${(rate * 100).toFixed(0)}%`.padStart(4);
for (const night of LEVEL_LIST) {
  if (only && !only.includes(night.id)) continue;
  const level = challengeLevel(night);
  if (!level) { console.log(night.id, 'no challenge'); continue; }
  // What a player owns on a replay: everything up to and including this night's unlocks.
  const owned = [...new Set([...ownedAt(nextLevelId(night.id) ?? night.id), ...(night.unlocks ?? [])])];
  const hand = botLoadout(level, owned), rule = challengeOf(night.id)!;
  const savvy = measureLevel(level, N, { ...BOT_PROFILES.savvy, loadout: hand });
  const casual = measureLevel(level, N, { ...BOT_PROFILES.casual, loadout: hand });
  const plain = measureLevel(night, N, { ...BOT_PROFILES.casual, loadout: botLoadout(night, owned) });
  console.log(`${night.id.padEnd(5)} ${(rule.slots && !night.cards ? `${rule.slots} cards` : 'fixed hand').padEnd(10)} ${rule.noUpgrades ? 'no upgrades' : '           '}  savvy ${pct(savvy.winRate)}  casual ${pct(casual.winRate)}  (night itself, casual ${pct(plain.winRate)})  hand ${hand.join(',')}`);
}
