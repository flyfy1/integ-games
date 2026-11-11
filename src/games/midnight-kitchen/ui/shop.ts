import { DEFENDERS, META_UPGRADES } from '../data';
import { spriteIcon } from '../render/sprites';
import { canBuy, respecValue, upgradeLevel, upgradePrice } from '../save';
import type { MetaUpgradeDef } from '../types';
import type { Screen, UiContext } from './context';
import { crumbs, h, head } from './dom';
import { metaEffect } from './stats';

function entry(ui: UiContext, upgrade: MetaUpgradeDef, refresh: (focus?: string) => void): HTMLElement {
  const { t, tr } = ui.i18n, save = ui.save;
  const level = upgradeLevel(save, upgrade), price = upgradePrice(save, upgrade), owned = !upgrade.defender || save.owned.includes(upgrade.defender);
  const icon = upgrade.defender ? spriteIcon('defender', upgrade.defender, 64, { tier: Math.min(2, level) }, !owned) : spriteIcon('character', 'pip', 64);
  const poor = price !== null && save.crumbs < price;
  return h('div', { class: `mk-entry${owned ? '' : ' unknown'}`, 'data-upgrade': upgrade.id }, icon,
    h('div', { class: 'mk-grow' },
      h('h4', null, owned ? `${upgrade.defender && DEFENDERS[upgrade.defender] ? `${tr(DEFENDERS[upgrade.defender].name)} · ` : ''}${tr(upgrade.name)}` : '???'),
      h('p', null, owned ? tr(upgrade.desc) : t('shop.locked')),
      owned ? h('div', { class: 'mk-effect' }, h('span', null, `${t('shop.now')}: ${metaEffect(ui.i18n, upgrade, level)}`),
        price !== null ? h('span', { class: 'arrow' }, '→') : null, price !== null ? h('span', { class: 'next' }, metaEffect(ui.i18n, upgrade, level + 1)) : null) : null,
      h('div', { class: 'mk-row', style: 'margin-top:8px' },
        h('span', { class: 'mk-pips', role: 'img', 'aria-label': t('shop.level', { n: level, max: upgrade.costs.length }) }, upgrade.costs.map((_, index) => h('i', { class: index < level ? 'on' : '' }))),
        h('span', { class: 'mk-grow' }),
        price === null ? h('span', { class: 'mk-chip good' }, `✓ ${t('shop.max')}`)
          : h('button', { class: `mk-btn small ${poor || !owned ? '' : 'primary'}`, 'data-action': 'buy', disabled: !canBuy(save, upgrade), 'aria-label': `${t('shop.buy', { n: price })}${poor ? ` (${t('shop.poor')})` : ''}`,
            onclick: () => { if (ui.buy(upgrade.id)) refresh(upgrade.id); } }, h('i', { class: 'mk-crumb', 'aria-hidden': 'true' }), ` ${price}`))));
}

/** Permanent upgrades bought with crumbs: what each does now and next, and a full refund to try another build. */
export const shopScreen: Screen = (ui, params) => {
  const { t } = ui.i18n, back = params.from ?? 'title';
  const refresh = (focus?: string) => {
    ui.go('shop', { ...params, panel: focus });
  };
  const section = (title: string, kitchen: boolean) => h('div', { class: 'mk-panel' }, h('h3', null, title),
    h('div', { class: 'mk-entries' }, META_UPGRADES.filter(upgrade => !upgrade.defender === kitchen).map(upgrade => entry(ui, upgrade, refresh))));
  const refundable = respecValue(ui.save, META_UPGRADES);
  let armed = false;
  const respec = h('button', { class: 'mk-btn small ghost', 'data-action': 'respec', disabled: refundable <= 0, onclick: () => {
    if (!armed) { armed = true; respec.textContent = t('shop.respecConfirm', { n: refundable }); respec.classList.add('danger'); respec.classList.remove('ghost'); return; }
    ui.respec(); refresh();
  } }, `↺ ${t('shop.respec')}`);
  const element = h('div', { class: 'mk-screen', 'data-screen': 'shop' }, head(ui, t('shop.title'), () => ui.go(back), crumbs(ui)),
    h('div', { class: 'mk-body' },
      h('div', { class: 'mk-shop-head' }, h('p', { class: 'mk-lead mk-grow' }, t('shop.sub')), respec),
      section(t('shop.kitchen'), true), section(t('shop.guard'), false)));
  // After a purchase the screen is rebuilt; put focus back on the row that was bought.
  if (params.panel) queueMicrotask(() => element.querySelector<HTMLElement>(`[data-upgrade="${params.panel}"] [data-action=buy]:not(:disabled)`)?.focus({ preventScroll: true }));
  return element;
};
