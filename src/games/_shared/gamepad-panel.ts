/** The controller panel on a game page: connection status, plus per-game bindings saved in this browser. */
import type { GameStorage } from '../../core/game-types';
import { actionsFor, gamepadProfiles, type BridgeControl, type BridgeProfile, type GamepadBridge } from './gamepad-bridge';
import { createInput, type PadStatus } from './gamepad-kit';

const zh = () => /^zh\b/i.test(navigator.language || '');
export const tr = (en: string, cn: string) => (zh() ? cn : en);

const NAMES: Record<'ps' | 'xbox', Partial<Record<BridgeControl, string>>> = {
  ps: { south: '✕', east: '○', west: '□', north: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'Select', l3: 'L3', r3: 'R3' },
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'Back', l3: 'LS', r3: 'RS' }
};
const DIRECTIONS: Partial<Record<BridgeControl, string>> = { up: '↑', down: '↓', left: '←', right: '→' };
export const isPlayStationStyle = (state: PadStatus) => state.connected || state.ids.some((id) => /054c|sony|dualsense|dualshock|wireless controller/i.test(id));
export const controlName = (control: BridgeControl, playStation: boolean) => DIRECTIONS[control] ?? NAMES[playStation ? 'ps' : 'xbox'][control] ?? control;

/** Move a control to `key`: one control can only do one thing. */
export function bind(bindings: BridgeProfile, control: BridgeControl, key: string): BridgeProfile { return { ...bindings, [control]: key }; }
export function unbind(bindings: BridgeProfile, control: BridgeControl): BridgeProfile { const next = { ...bindings }; delete next[control]; return next; }

export function gamepadSummary(state: PadStatus) {
  const ready = state.connected || state.standard > 0;
  const touchOnly = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  return { ready, show: ready || !touchOnly, pill: state.unclaimedProfile ? tr('Connect controller', '连接手柄') : ready ? tr('Controller ready', '手柄已连接') : tr('Connect controller', '连接手柄') };
}

/** Grants site-wide access to a 2-in-1 receiver from the home page; every game then reconnects to it by itself. */
export async function connectGamepadOnce() {
  if (!navigator.hid) return tr('Controller detected automatically: plug it in and press any button in a game.', '手柄会自动识别：插上后，在游戏里按任意键即可。');
  const input = createInput({ keyboard: [] });
  const result = await input.connect();
  input.destroy();
  if (result.ok) return tr('Connected. Open any game to play.', '已连接，打开任意游戏就能玩。');
  return tr('Standard controllers need no pairing here: plug in and press any button in a game.', '普通手柄不用在这里配对：插上后，在游戏里按任意键即可。');
}

export function createGamepadPanel(host: HTMLElement, { slug, bridge, storage }: { slug: string; bridge: GamepadBridge; storage: GameStorage }) {
  const defaults = gamepadProfiles[slug] ?? {};
  let bindings: BridgeProfile = storage.get<BridgeProfile>(slug, defaults);
  let listening: string | null = null, last = '';
  const panel = document.createElement('section');
  panel.className = 'help-sheet pad-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', tr('Controller settings', '手柄设置'));
  host.append(panel);

  function save(next: BridgeProfile) {
    bindings = next;
    bridge.setBindings(next);
    storage.set(slug, next);
  }
  function render(state = bridge.status()) {
    const playStation = isPlayStationStyle(state), ready = state.connected || state.standard > 0;
    const message = state.unclaimedProfile ? tr('Your 2-in-1 receiver needs one click to connect.', '检测到一拖二接收器，点一下下面的按钮连接。') : ready ? tr('Controller ready. Changes apply right away, so try them in the game.', '手柄已连接。改完立刻生效，可以直接在游戏里试。') : tr('Plug in a controller and press any button.', '插上手柄，按任意键。');
    const rows = actionsFor(slug).map(({ key, label }) => {
      const chips = (Object.entries(bindings) as Array<[BridgeControl, string]>).filter(([, bound]) => bound === key)
        .map(([control]) => `<button type="button" class="pad-chip" data-unbind="${control}" title="${tr('Remove', '移除')}">${controlName(control, playStation)} ×</button>`).join('');
      const add = listening === key ? `<button type="button" class="pad-chip is-add is-listening" data-cancel>${tr('Press a button…', '请按手柄…')}</button>` : `<button type="button" class="pad-chip is-add" data-listen="${encodeURIComponent(key)}" aria-label="${tr('Add a button for', '添加按键：')} ${label[zh() ? 1 : 0]}">+</button>`;
      return `<div class="pad-row"><span>${label[zh() ? 1 : 0]}</span><div class="pad-row-binds">${chips}${add}</div></div>`;
    }).join('');
    const connect = state.hidAvailable && !state.connected ? `<button type="button" class="primary-button" data-connect>${tr('Connect 2-in-1 receiver', '连接一拖二接收器')}</button>` : '';
    panel.innerHTML = `<h2>🎮 ${tr('Controller', '手柄')}</h2><p>${message}</p>${rows}<p style="margin-top:10px">${tr('Start always pauses and resumes.', '开始键固定用于暂停和继续。')}</p><div class="pad-panel-actions">${connect}<button type="button" class="secondary-button" data-reset>${tr('Reset to default', '恢复默认')}</button><button type="button" class="secondary-button" data-close>${tr('Close', '关闭')}</button></div>`;
    last = stateKey(state);
  }
  const stateKey = (state: PadStatus) => [state.connected, state.standard, state.unclaimedProfile, state.ids.join()].join('|');

  panel.addEventListener('click', async (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!el) return;
    if (el.dataset.close !== undefined) { close(); return; }
    if (el.dataset.connect !== undefined) { await bridge.connect(); render(); return; }
    if (el.dataset.reset !== undefined) { bridge.capture(null); listening = null; save({ ...defaults }); storage.remove(slug); }
    if (el.dataset.cancel !== undefined) { bridge.capture(null); listening = null; }
    if (el.dataset.unbind) save(unbind(bindings, el.dataset.unbind as BridgeControl));
    if (el.dataset.listen) {
      const key = decodeURIComponent(el.dataset.listen);
      listening = key;
      bridge.capture((control) => { listening = null; save(bind(bindings, control, key)); render(); });
    }
    render();
  });
  function close() { bridge.capture(null); listening = null; panel.hidden = true; }
  return {
    toggle() { if (panel.hidden) { render(); panel.hidden = false; } else close(); },
    refresh(state: PadStatus) { if (!panel.hidden && !listening && stateKey(state) !== last) render(state); },
    destroy() { bridge.capture(null); panel.remove(); }
  };
}
export type GamepadPanel = ReturnType<typeof createGamepadPanel>;
