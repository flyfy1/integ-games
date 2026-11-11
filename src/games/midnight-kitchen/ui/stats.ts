import type { I18n, Key } from '../i18n';
import type { AttackDef, DefenderDef, MetaUpgradeDef, Mods } from '../types';

/**
 * Human-readable stat lines for defenders (card tooltips, the upgrade popover's before -> after, the Cookbook) and
 * effect lines for permanent upgrades. Derived from the data rows, so new defenders describe themselves.
 */
export type StatLine = { key: string; label: string; value: string; raw: number };

const round = (value: number) => (Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10);
const per = (value: number) => `${round(value)}s`;

/** Stats for one tier, optionally with live modifiers (recipes, permanent upgrades). */
export function tierStats(i18n: I18n, def: DefenderDef, tier: number, mods?: Partial<Mods>): StatLine[] {
  const { t } = i18n, row = def.tiers[Math.max(0, Math.min(def.tiers.length - 1, tier))];
  if (!row) return [];
  const m = { damage: 1, rate: 1, range: 0, splash: 1, hp: 1, gen: 1, ...mods };
  const out: StatLine[] = [];
  const line = (key: Key, value: string, raw: number) => out.push({ key, label: t(key), value, raw });
  const attack: AttackDef = row.attack;
  const interval = 'interval' in attack ? attack.interval / Math.max(0.01, m.rate) : 0;
  switch (attack.kind) {
    case 'generate': line('stat.heat', t('stat.heatEvery', { n: round(attack.amount * m.gen), s: per(interval) }), attack.amount * m.gen / Math.max(0.01, interval)); break;
    case 'shoot': line('stat.damage', `${round(attack.damage * m.damage * (attack.count ?? 1))}`, attack.damage * m.damage * (attack.count ?? 1)); line('stat.rate', t('stat.every', { s: per(interval) }), 1 / Math.max(0.01, interval)); if (attack.pierce) line('stat.pierce', `${attack.pierce + 1}`, attack.pierce); break;
    case 'lob': line('stat.damage', `${round(attack.damage * m.damage)}`, attack.damage * m.damage); line('stat.rate', t('stat.every', { s: per(interval) }), 1 / Math.max(0.01, interval)); line('stat.splash', `${round(attack.splash * m.splash)}`, attack.splash * m.splash); break;
    case 'cone': case 'melee': line('stat.damage', `${round(attack.damage * m.damage)}`, attack.damage * m.damage); line('stat.rate', t('stat.every', { s: per(interval) }), 1 / Math.max(0.01, interval)); line('stat.range', t('stat.cells', { n: round(attack.range + m.range) }), attack.range + m.range); break;
    case 'burst': line('stat.damage', `${round(attack.damage * m.damage)}`, attack.damage * m.damage); line('stat.rate', t('stat.every', { s: per(interval) }), 1 / Math.max(0.01, interval)); line('stat.range', t('stat.cells', { n: round(attack.radius + m.range) }), attack.radius + m.range); break;
    case 'lanefire': line('stat.damage', `${round(attack.damage * m.damage)}`, attack.damage * m.damage); line('stat.fuse', per(attack.fuse), attack.fuse); break;
    case 'trap': line('stat.damage', `${round(attack.damage * m.damage)}`, attack.damage * m.damage); line('stat.uses', `${attack.uses}`, attack.uses); break;
    default: break;
  }
  if (attack.kind !== 'lanefire') line('stat.hp', `${Math.round(row.hp * m.hp)}`, row.hp * m.hp);
  return out;
}

/** Pairs current and next-tier lines that differ, for the upgrade popover. */
export function upgradeDiff(i18n: I18n, def: DefenderDef, tier: number, mods?: Partial<Mods>): { label: string; now: string; next: string; up: boolean }[] {
  if (tier + 1 >= def.tiers.length) return [];
  const now = tierStats(i18n, def, tier, mods), next = tierStats(i18n, def, tier + 1, mods);
  return next.map(line => { const before = now.find(item => item.key === line.key); return { label: line.label, now: before?.value ?? '-', next: line.value, up: !before || line.raw > before.raw }; })
    .filter(row => row.now !== row.next);
}

/** What a permanent upgrade does at `level` levels owned (0 = nothing yet). */
export function metaEffect(i18n: I18n, upgrade: MetaUpgradeDef, level: number): string {
  const { t } = i18n, parts: string[] = [];
  if (level <= 0) return t('shop.none');
  const pct = (mul: number) => `+${Math.round((Math.pow(mul, level) - 1) * 100)}%`;
  const patch = upgrade.perLevel ?? {};
  if (patch.damage) parts.push(t('shop.fx.damage', { v: pct(patch.damage) }));
  if (patch.rate) parts.push(t('shop.fx.rate', { v: pct(patch.rate) }));
  if (patch.hp) parts.push(t('shop.fx.hp', { v: pct(patch.hp) }));
  if (patch.gen) parts.push(t('shop.fx.gen', { v: pct(patch.gen) }));
  if (patch.regen) parts.push(t('shop.fx.regen', { v: pct(patch.regen) }));
  if (patch.splash) parts.push(t('shop.fx.splash', { v: pct(patch.splash) }));
  if (patch.range) parts.push(t('shop.fx.range', { v: `+${round(patch.range * level)}` }));
  if (patch.uses) parts.push(t('shop.fx.uses', { v: `+${patch.uses * level}` }));
  if (patch.pierce) parts.push(t('shop.fx.pierce', { v: `+${patch.pierce * level}` }));
  if (patch.knockback) parts.push(t('shop.fx.knockback', { v: `+${round(patch.knockback * level)}` }));
  if (patch.thorns) parts.push(t('shop.fx.thorns', { v: `+${round(patch.thorns * level)}` }));
  if (patch.spread) parts.push(t('shop.fx.spread', { v: `+${patch.spread * level}` }));
  if (upgrade.startHeat) parts.push(t('shop.fx.startHeat', { v: `+${upgrade.startHeat * level}` }));
  if (upgrade.slices) parts.push(t('shop.fx.slices', { v: `+${upgrade.slices * level}` }));
  if (upgrade.recipeHeat) parts.push(t('shop.fx.recipeHeat', { v: `+${upgrade.recipeHeat * level}` }));
  if (upgrade.refund) parts.push(t('shop.fx.refund', { v: `+${Math.round(upgrade.refund * level * 100)}%` }));
  return parts.join(' · ') || t('shop.none');
}
