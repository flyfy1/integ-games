import { t, type Key, type Lang } from './i18n';
import { CHASSIS_ORDER, CHASSIS_SPECS } from './maps';
import { drawTankModel, type LobbyConfig } from './render';
import type { ChassisId, GameMode, TeamSetup } from './types';

/**
 * DOM menus for Tank Clash: lobby, pause and results.
 *
 * They used to be painted inside the 1280px canvas, which shrank every label to ~4px on a phone.
 * Real elements stay legible at any size, wrap, scroll and are reachable by touch, mouse, keyboard
 * and gamepad (the game moves a focus cursor over `items`, see `moveCursor`).
 */
export interface UiItem {
  id: string;
  row: number;
  col: number;
}

export type UiScreen = 'none' | 'lobby' | 'pause' | 'results';

export interface LobbyView {
  cfg: LobbyConfig;
  lang: Lang;
  best: number;
  touch: boolean;
  canConnectPad: boolean;
  padStatus: string;
}

export interface ResultsView {
  tone: 'win' | 'lose' | 'neutral';
  title: string;
  subtitle?: string;
  rows: Array<[string, string]>;
  badge?: string;
  tip?: string;
  primary: { id: string; label: string };
  secondary: { id: string; label: string };
  footnote?: string;
}

const STYLE = `
[data-tank-clash]{isolation:isolate}
[data-tank-clash] .tc-overlay{position:absolute;inset:0;z-index:6;display:flex;overflow:auto;-webkit-overflow-scrolling:touch;background:#070b14f2;padding:12px;box-sizing:border-box;border-radius:inherit}
[data-tank-clash] .tc-overlay[hidden]{display:none}
[data-tank-clash] .tc-overlay.is-dim{background:#070b14b8}
[data-tank-clash] .tc-overlay.is-full{padding-top:62px}
[data-tank-clash] .tc-panel{width:min(100%,900px);margin:auto;background:#0f172a;border:1px solid #38bdf866;border-radius:18px;padding:14px 16px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.35;color:#f7f9ff}
[data-tank-clash] .tc-panel.is-narrow{width:min(100%,460px)}
[data-tank-clash] .tc-head{display:flex;align-items:center;gap:10px;justify-content:space-between}
[data-tank-clash] .tc-title{font-size:26px;font-weight:900;margin:0;letter-spacing:.02em}
[data-tank-clash] .tc-sub{color:#a8b1c5;margin:0;font-size:15px}
[data-tank-clash] .tc-center{text-align:center}
[data-tank-clash] .tc-cols{display:grid;gap:12px;grid-template-columns:1fr}
[data-tank-clash] .tc-col{display:flex;flex-direction:column;gap:12px;min-width:0}
[data-tank-clash] .tc-h{font-size:14px;font-weight:800;color:#a8b1c5;margin:0 0 6px;letter-spacing:.04em;text-transform:uppercase}
[data-tank-clash] .tc-row{display:grid;gap:8px}
[data-tank-clash] .tc-seg{grid-template-columns:repeat(auto-fit,minmax(104px,1fr))}
[data-tank-clash] .tc-tanks{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
[data-tank-clash] .tc-stage{grid-template-columns:48px 1fr 48px;align-items:center}
[data-tank-clash] .tc-btn{min-height:46px;padding:8px 12px;border-radius:12px;border:1.5px solid #334155;background:#111827;color:#e2e8f0;font:800 15px/1.25 system-ui,"PingFang SC",sans-serif;cursor:pointer;text-align:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
[data-tank-clash] .tc-btn small{display:block;color:#a8b1c5;font-weight:600;font-size:14px;margin-top:2px}
[data-tank-clash] .tc-btn.is-on{border-color:#fde047;background:#1e3a5f;color:#fde047}
[data-tank-clash] .tc-btn.is-focus{outline:3px solid #fff;outline-offset:2px}
[data-tank-clash] .tc-card{display:flex;flex-direction:column;gap:2px;align-items:center;padding:6px 2px;font-size:14px}
[data-tank-clash] .tc-card canvas{flex:0 0 44px;width:44px;height:44px}
[data-tank-clash] .tc-card span{min-width:0;max-width:100%;overflow-wrap:anywhere}
[data-tank-clash] .tc-stage-name{font-weight:800;text-align:center;color:#7dd3fc;font-size:16px}
[data-tank-clash] .tc-start{min-height:56px;font-size:21px;background:#70f0c2;color:#062019;border-color:#fff}
[data-tank-clash] .tc-note{margin:0;color:#cbd5e1;font-size:14.5px}
[data-tank-clash] .tc-warn{margin:0;color:#fdba74;font-size:14.5px}
[data-tank-clash] .tc-goal{margin:0;padding:10px 12px;border-radius:12px;background:#132238;color:#e2e8f0;font-weight:700}
[data-tank-clash] .tc-ghost{min-height:44px;padding:6px 12px;font-size:14px}
[data-tank-clash] .tc-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
[data-tank-clash] .tc-stats{display:grid;grid-template-columns:1fr auto;gap:6px 16px;font-size:17px;margin:0}
[data-tank-clash] .tc-stats dt{color:#a8b1c5}
[data-tank-clash] .tc-stats dd{margin:0;font-weight:900;text-align:right}
[data-tank-clash] .tc-badge{align-self:center;padding:4px 14px;border-radius:999px;background:#ffd15c;color:#221a00;font-weight:900}
[data-tank-clash] .tc-win{color:#70f0c2}
[data-tank-clash] .tc-lose{color:#ff8a8a}
[data-tank-clash] .tc-actions{display:grid;gap:8px;grid-template-columns:1.6fr 1fr}
[data-tank-clash] .tc-primary{background:#70f0c2;color:#062019;border-color:#fff;min-height:54px;font-size:18px}
@media(min-width:760px){
[data-tank-clash] .tc-cols{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}
}
[data-tank-clash] .mobile-controls--stick-action{width:100%;box-sizing:border-box;justify-content:flex-start;gap:10px;padding-left:14px;padding-right:14px}
[data-tank-clash] .mobile-controls--stick-action .mobile-control{border-radius:50%;width:62px;height:62px;min-width:62px;padding:0;font-size:13px}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=fire]{order:3;width:88px;height:88px;min-width:88px;font-size:17px;background:#3a1722;border-color:#fb7185}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=mine]{order:1;margin-left:auto}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=dash]{order:2}
[data-tank-clash] .mobile-controls--stick-action .mobile-control.is-held{background:#70F0C2;color:#071712}
[data-tank-clash] .mobile-controls--stick-action .mobile-stick{width:124px;height:124px;flex-basis:124px}
/* The shared sheet hides touch controls above 720px, which is every phone held sideways. Keep them on touch screens. */
@media (pointer:coarse){[data-tank-clash] .mobile-controls--stick-action{display:flex}}
@media (orientation:landscape) and (max-height:600px){
[data-tank-clash] .mobile-controls--stick-action{align-items:flex-end;width:auto}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=mine]{position:absolute;right:88px;bottom:98px;margin:0}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=dash]{position:absolute;right:14px;bottom:98px}
[data-tank-clash] .mobile-controls--stick-action .mobile-control[data-tc-act=fire]{margin-left:auto}
[data-tank-clash] .mobile-controls--stick-action .stage-pause{position:fixed;top:10px;right:10px}
}
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

export function teamKey(mode: GameMode, setup: TeamSetup): Key {
  return `team.${mode}.${mode === 'duel' && setup === '1p-solo' ? '1p-ai' : setup}` as Key;
}

export function teamOrder(mode: GameMode): TeamSetup[] {
  return mode === 'coop' ? ['1p-ai', '1p-solo', '2p'] : ['1p-ai', '2p'];
}

/** Rough 1-5 firepower rating shown on the tank cards (damage per second incl. twin shots). */
export function firepower(id: ChassisId): number {
  const spec = CHASSIS_SPECS[id];
  const dps = (spec.damage * spec.burstCount) / spec.reload + (spec.splashRadius > 0 ? 1.2 : 0);
  return Math.max(1, Math.min(5, Math.round(dps * 1.5)));
}

export function createUi(root: HTMLElement, onAction: (id: string) => void) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  const overlay = document.createElement('div');
  overlay.className = 'tc-overlay';
  overlay.hidden = true;
  root.append(style, overlay);

  let screen: UiScreen = 'none';
  let items: UiItem[] = [];
  let cursor = '';

  overlay.addEventListener('click', (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!el || !overlay.contains(el)) return;
    cursor = el.dataset.id ?? '';
    paintCursor(false);
    onAction(cursor);
  });

  function collect(): void {
    items = [...overlay.querySelectorAll<HTMLElement>('[data-id]')].map((el) => ({
      id: el.dataset.id ?? '',
      row: Number(el.dataset.row ?? 0),
      col: Number(el.dataset.col ?? 0)
    }));
    if (!items.some((it) => it.id === cursor)) cursor = items[items.length - 1]?.id ?? '';
  }

  function paintCursor(scroll: boolean): void {
    for (const el of overlay.querySelectorAll<HTMLElement>('[data-id]')) {
      const on = el.dataset.id === cursor;
      el.classList.toggle('is-focus', on);
      if (on && scroll) el.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function show(next: UiScreen, html: string, dim: boolean, preferred?: string): void {
    const sameScreen = screen === next;
    const scrollTop = overlay.scrollTop;
    screen = next;
    overlay.hidden = false;
    overlay.classList.toggle('is-dim', dim);
    overlay.classList.toggle('is-full', Boolean(root.closest('.is-immersive')));
    overlay.innerHTML = html;
    if (!sameScreen && preferred) cursor = preferred;
    collect();
    paintCursor(false);
    overlay.scrollTop = sameScreen ? scrollTop : 0;
  }

  function btn(id: string, row: number, col: number, label: string, cls = '', on = false): string {
    return `<button type="button" tabindex="-1" class="tc-btn ${cls}${on ? ' is-on' : ''}" data-id="${id}" data-row="${row}" data-col="${col}" aria-pressed="${on}">${label}</button>`;
  }

  function paintTankIcons(): void {
    for (const cv of overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-chassis]')) {
      const g = cv.getContext('2d');
      if (!g) continue;
      const second = cv.dataset.player === '1';
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.setTransform(2, 0, 0, 2, 0, 0);
      drawTankModel(g, 21, 22, 0, cv.dataset.chassis as ChassisId, second ? '#fb7185' : '#2dd4bf', second ? '#fdba74' : '#fde047', 0, 0, 1.05);
    }
  }

  function tankPicker(view: LobbyView, player: 0 | 1, row: number): string {
    const { cfg, lang } = view;
    const selected = player === 0 ? cfg.p1Chassis : cfg.p2Chassis;
    const solo = cfg.teamSetup !== '2p';
    const heading =
      player === 0 ? t(lang, solo ? 'lobby.tank.you' : 'lobby.tank.p1') : t(lang, solo ? 'lobby.tank.ai' : 'lobby.tank.p2');
    const cards = CHASSIS_ORDER.map((id, i) =>
      btn(
        `p${player + 1}-chassis-${id}`,
        row,
        i,
        `<canvas width="88" height="88" data-chassis="${id}" data-player="${player}"></canvas><span>${esc(t(lang, `chassis.${id}` as Key))}</span>`,
        'tc-card',
        selected === id
      )
    ).join('');
    // Only the chosen tank spells out its perks, which keeps four cards on one row even on a phone.
    const spec = CHASSIS_SPECS[selected];
    const stats = t(lang, 'lobby.stats', { hp: spec.maxHp, spd: Math.round(spec.speed / 40), pow: firepower(selected) });
    return `<section><h3 class="tc-h" style="color:${player === 0 ? '#5eead4' : '#fda4af'}">${esc(heading)}</h3><div class="tc-row tc-tanks">${cards}</div><p class="tc-note" style="margin-top:6px"><b>${esc(t(lang, `chassis.${selected}.tag` as Key))}</b><br>${esc(stats)}</p></section>`;
  }

  return {
    get screen() {
      return screen;
    },
    get cursor() {
      return cursor;
    },
    hide(): void {
      screen = 'none';
      overlay.hidden = true;
      overlay.innerHTML = '';
      items = [];
    },
    /** Move the gamepad/keyboard focus cursor; returns true when it moved. */
    moveCursor(dir: 'up' | 'down' | 'left' | 'right'): boolean {
      const current = items.find((it) => it.id === cursor) ?? items[items.length - 1];
      if (!current) return false;
      const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const candidates = items.filter((it) =>
        dr !== 0 ? Math.sign(it.row - current.row) === dr : it.row === current.row && Math.sign(it.col - current.col) === dc
      );
      const score = (it: UiItem) => Math.abs(it.row - current.row) * 10 + Math.abs(it.col - current.col);
      const next = candidates.sort((a, b) => score(a) - score(b))[0];
      if (!next) return false;
      cursor = next.id;
      paintCursor(true);
      return true;
    },
    activate(): void {
      if (items.some((it) => it.id === cursor)) onAction(cursor);
    },
    showLobby(view: LobbyView): void {
      const { cfg, lang } = view;
      const stageCount = cfg.mode === 'coop' ? 6 : 5;
      const stageName = t(lang, `stage.${cfg.mode}.${cfg.stageIndex % stageCount}` as Key);
      const teams = teamOrder(cfg.mode)
        .map((ts, i) => btn(`team-${ts}`, 1, i, esc(t(lang, teamKey(cfg.mode, ts))), '', cfg.teamSetup === ts))
        .join('');
      const modes = (['coop', 'duel'] as GameMode[])
        .map((m, i) =>
          btn(
            `mode-${m}`,
            2,
            i,
            `${m === 'coop' ? '🦅' : '⚔️'} ${esc(t(lang, `mode.${m}` as Key))}<small>${esc(t(lang, `mode.${m}.desc` as Key))}</small>`,
            '',
            cfg.mode === m
          )
        )
        .join('');
      const controls = view.touch
        ? `<p class="tc-note">${esc(t(lang, 'ctl.touch'))}</p>`
        : cfg.teamSetup === '2p'
          ? `<p class="tc-note">${esc(t(lang, 'ctl.p1'))}</p><p class="tc-note">${esc(t(lang, 'ctl.p2'))}</p>`
          : `<p class="tc-note">${esc(t(lang, 'ctl.1p'))}</p>`;
      const html = `<div class="tc-panel">
  <div class="tc-head">
    <div><h2 class="tc-title">${esc(t(lang, 'title'))}</h2><p class="tc-sub">${esc(t(lang, 'title.sub'))}${view.best > 0 ? ` · ${esc(t(lang, 'lobby.best', { n: view.best }))}` : ''}</p></div>
    ${btn('lang', -1, 0, lang === 'zh' ? 'EN' : '中文', 'tc-ghost')}
  </div>
  <p class="tc-goal">${esc(t(lang, cfg.mode === 'coop' ? 'lobby.goal.coop' : 'lobby.goal.duel'))}</p>
  ${btn('start-battle', 0, 0, `▶ ${esc(t(lang, 'lobby.start'))}`, 'tc-start')}
  <section>${controls}${view.touch ? '' : `<p class="tc-note">${esc(t(lang, 'ctl.pad'))}</p>`}</section>
  <div class="tc-cols">
    <div class="tc-col">
      <section><h3 class="tc-h">${esc(t(lang, 'lobby.players'))}</h3><div class="tc-row tc-seg">${teams}</div>${
        view.touch && cfg.teamSetup === '2p' ? `<p class="tc-warn" style="margin-top:6px">${esc(t(lang, 'lobby.touch2p'))}</p>` : ''
      }</section>
      <section><h3 class="tc-h">${esc(t(lang, 'lobby.mode'))}</h3><div class="tc-row tc-seg">${modes}</div></section>
      <section><h3 class="tc-h">${esc(t(lang, cfg.mode === 'coop' ? 'lobby.stage' : 'lobby.arena'))}</h3><div class="tc-row tc-stage">${btn('stage-prev', 3, 0, '◀', '')}<div class="tc-stage-name">${esc(stageName)}</div>${btn('stage-next', 3, 1, '▶', '')}</div></section>
    </div>
    <div class="tc-col">
      ${tankPicker(view, 0, 4)}
      ${cfg.mode === 'duel' || cfg.teamSetup !== '1p-solo' ? tankPicker(view, 1, 5) : ''}
    </div>
  </div>
  <div class="tc-foot">${view.canConnectPad ? btn('connect', 8, 0, esc(t(lang, 'btn.connect')), 'tc-ghost') : ''}<span class="tc-sub">${esc(view.padStatus)}</span></div>
</div>`;
      show('lobby', html, false, 'start-battle');
      paintTankIcons();
    },
    showPause(lang: Lang): void {
      const html = `<div class="tc-panel is-narrow">
  <h2 class="tc-title tc-center">${esc(t(lang, 'pause.title'))}</h2>
  ${btn('pause-resume', 0, 0, esc(t(lang, 'pause.resume')), 'tc-primary')}
  ${btn('pause-restart', 1, 0, esc(t(lang, 'pause.restart')))}
  ${btn('pause-lobby', 2, 0, esc(t(lang, 'pause.lobby')))}
</div>`;
      show('pause', html, true, 'pause-resume');
    },
    showResults(view: ResultsView): void {
      const rows = view.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      const html = `<div class="tc-panel is-narrow" role="dialog" aria-live="polite">
  <h2 class="tc-title tc-center ${view.tone === 'win' ? 'tc-win' : view.tone === 'lose' ? 'tc-lose' : ''}">${esc(view.title)}</h2>
  ${view.subtitle ? `<p class="tc-sub tc-center">${esc(view.subtitle)}</p>` : ''}
  ${view.badge ? `<span class="tc-badge">${esc(view.badge)}</span>` : ''}
  ${rows ? `<dl class="tc-stats">${rows}</dl>` : ''}
  ${view.tip ? `<p class="tc-note">${esc(view.tip)}</p>` : ''}
  <div class="tc-actions">${btn(view.primary.id, 0, 0, esc(view.primary.label), 'tc-primary')}${btn(view.secondary.id, 0, 1, esc(view.secondary.label))}</div>
  ${view.footnote ? `<p class="tc-sub tc-center" data-tc-foot>${esc(view.footnote)}</p>` : ''}
</div>`;
      show('results', html, true, view.primary.id);
    },
    setFootnote(text: string): void {
      const el = overlay.querySelector<HTMLElement>('[data-tc-foot]');
      if (el && el.textContent !== text) el.textContent = text;
    },
    destroy(): void {
      overlay.remove();
      style.remove();
    }
  };
}

export type TankClashUi = ReturnType<typeof createUi>;
