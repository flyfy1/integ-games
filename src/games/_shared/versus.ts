/**
 * Two-player versus for any game module, with no change to the game: it mounts the same game twice with the same
 * seed, gives each seat its own controls, and picks a winner from what the games already report.
 * Seats come straight from the kit: seat 1 is pad 1 or WASD, seat 2 is pad 2 or the arrows, so any mix works.
 */
import type { GameController, GameModule, GameServices, GameStorage } from '../../core/game-types';
import { seededRandom } from '../../core/services';
import { createKeySender, type BridgeProfile } from './gamepad-bridge';
import { tr } from './gamepad-panel';
import { BUTTON_INDEX, createInput, startLoop, VERSUS_KEYBOARD } from './gamepad-kit';

export type VersusRule = {
  /** `race`: the first real finish wins. `timed`: the clock decides, and a player who loses can retry until it runs out. */
  finish: 'timed' | 'race';
  seconds: number;
  /** `progress` is for games that only report a score at the end, or reset it mid-run; milestones then count first. */
  rank: 'score' | 'progress';
  /** Pressed for both seats when play begins, for games that open on a menu. */
  startKey?: string;
  /** For games with no in-game restart: Select restarts that seat. */
  restartOnSelect?: boolean;
};
const timed = (rank: VersusRule['rank'] = 'score', seconds = 120): VersusRule => ({ finish: 'timed', seconds, rank });
const race = (seconds = 300): VersusRule => ({ finish: 'race', seconds, rank: 'score' });
export const versusRules: Record<string, VersusRule> = {
  arena: timed(), 'block-drop': timed(), breakout: timed(), bubble: timed(), flap: timed(), 'fruit-merge': timed(), 'hex-puzzle': timed(), invaders: timed(), snake: timed(), stack: timed(),
  drive: timed('progress'), runner: timed('progress'), knife: timed('progress'),
  'merge-2048': { ...timed('score', 180), restartOnSelect: true }, 'capital-quiz': { ...timed('score', 180), startKey: '1' },
  memory: race(), mines: race(), solitaire: race(600), sudoku: race(600), 'word-grid': race(), platformer: race()
};
export const isVersusGame = (slug: string) => slug in versusRules;

export type SeatResult = { best: number; progress: number; finished: boolean };
/** 0 or 1 for the winning seat, -1 for a tie. */
export function decideWinner(rule: VersusRule, seats: readonly [SeatResult, SeatResult]): number {
  const [a, b] = seats;
  if (a.finished !== b.finished) return a.finished ? 0 : 1;
  const compare = (rule.rank === 'progress' ? a.progress - b.progress : 0) || a.best - b.best;
  return compare === 0 ? -1 : compare > 0 ? 0 : 1;
}

function memoryStorage(): GameStorage {
  const values = new Map<string, unknown>();
  return { get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } };
}
const clockText = (seconds: number) => { const whole = Math.ceil(seconds); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; };

export type VersusOptions = { slug: string; bindings?: BridgeProfile; buttonMaps?: Record<string, number[]>; togglePause(): void };

export function wrapVersus(module: GameModule, { slug, bindings, buttonMaps, togglePause }: VersusOptions): GameModule {
  const rule = versusRules[slug];
  return {
    meta: module.meta,
    mount(host, services) {
      const root = document.createElement('div');
      root.className = 'versus'; root.dataset.versus = '';
      root.innerHTML = `<div class="versus-hud"><span data-seat-1></span><span class="versus-clock" data-clock></span><span data-seat-2></span></div><div class="versus-seats"><div class="versus-seat" data-versus-seat></div><div class="versus-seat" data-versus-seat></div></div><div class="versus-overlay" data-versus-overlay></div>`;
      host.replaceChildren(root);
      const seatHosts = [...root.querySelectorAll<HTMLElement>('[data-versus-seat]')];
      const overlay = root.querySelector<HTMLElement>('[data-versus-overlay]')!, clock = root.querySelector<HTMLElement>('[data-clock]')!;
      const scoreEls = [root.querySelector<HTMLElement>('[data-seat-1]')!, root.querySelector<HTMLElement>('[data-seat-2]')!];
      const senders = seatHosts.map((seat) => createKeySender(slug, () => seat.querySelector('canvas') ?? seat, bindings));
      const input = createInput({ keyboard: VERSUS_KEYBOARD, exclusiveKeyboard: true });
      Object.entries(buttonMaps ?? {}).forEach(([kind, map]) => input.setButtonMap(kind, map));

      type Phase = 'lobby' | 'countdown' | 'play' | 'over';
      let phase: Phase = 'lobby', paused = false, left = 0, waitLeft = 0, shownClock = '', shownOverlay = '';
      let ready = [false, false], results: [SeatResult, SeatResult], controllers: GameController[] = [];

      function paintScores() {
        scoreEls.forEach((el, i) => {
          const seat = results[i], text = `P${i + 1} · ${rule.rank === 'progress' ? `⭐${seat.progress} · ` : ''}${seat.best}`;
          if (el.textContent !== text) el.textContent = text;
        });
      }
      function seatServices(index: number, seed: number): GameServices {
        const random = seededRandom(seed);
        return {
          ...services, storage: memoryStorage(), random,
          reportScore(score) { results[index].best = Math.max(results[index].best, Math.round(score)); paintScores(); },
          reportComplete(progress = 1) {
            results[index].progress = Math.max(results[index].progress, progress); paintScores();
            if (rule.finish === 'race' && phase === 'play') { results[index].finished = true; finish(); }
          }
        };
      }
      function clearGames() {
        senders.forEach((sender) => sender.release());
        controllers.forEach((controller) => controller.destroy());
        controllers = [];
      }
      function round() {
        clearGames();
        results = [{ best: 0, progress: 0, finished: false }, { best: 0, progress: 0, finished: false }];
        const seed = Math.floor(Math.random() * 2 ** 31);
        controllers = seatHosts.map((seat, i) => module.mount(seat, seatServices(i, seed)));
        controllers.forEach((controller) => controller.pause());
        ready = [false, false]; left = rule.seconds; phase = 'lobby'; shownOverlay = '';
        clock.textContent = clockText(left); paintScores(); paintOverlay();
      }
      function finish() {
        phase = 'over'; waitLeft = 1; shownOverlay = '';
        senders.forEach((sender) => sender.release());
        controllers.forEach((controller) => controller.pause());
        services.sound.play('success');
        paintOverlay();
      }
      function paintOverlay() {
        let html = '';
        if (phase === 'lobby') {
          const status = input.status();
          const seat = (i: number, keys: string) => `<div class="${ready[i] ? 'is-on' : ''}"><strong>P${i + 1} ${ready[i] ? '✓' : ''}</strong><p>${tr(`Controller ${i + 1} or ${keys}`, `${i + 1} 号手柄或 ${keys}`)}</p></div>`;
          const connect = status.hidAvailable && !status.connected ? `<button type="button" class="secondary-button" data-versus-connect>🎮 ${tr('Connect 2-in-1 receiver', '连接一拖二接收器')}</button>` : '';
          html = `<h2>${tr('Two players', '双人对战')}</h2><p>${tr(rule.finish === 'race' ? 'First to finish wins.' : 'Highest score when time runs out wins. You can retry until then.', rule.finish === 'race' ? '先完成的人赢。' : '时间到时分高的人赢，中途输了可以重来。')}</p><div class="versus-ready">${seat(0, 'WASD + Space')}${seat(1, tr('arrows + Enter', '方向键 + 回车'))}</div><p>${tr('Both players press a button to begin.', '两位玩家各按一个键就开始。')}</p><div class="versus-actions">${connect}</div>`;
        } else if (phase === 'countdown') html = `<div class="versus-count">${Math.ceil(left)}</div>`;
        else if (phase === 'over') {
          const winner = decideWinner(rule, results);
          html = `<h2>${winner < 0 ? tr('It’s a tie!', '平局！') : tr(`P${winner + 1} wins!`, `P${winner + 1} 赢了！`)}</h2><p>P1 ${results[0].best} · P2 ${results[1].best}</p><div class="versus-actions"><button type="button" class="primary-button" data-versus-again>${tr('Play again', '再来一局')}</button></div>`;
        }
        if (html === shownOverlay) return;
        shownOverlay = html;
        overlay.innerHTML = html;
        overlay.hidden = !html;
      }
      overlay.addEventListener('click', async (event) => {
        const el = (event.target as HTMLElement).closest('button');
        if (!el) return;
        if (el.matches('[data-versus-again]')) round();
        if (el.matches('[data-versus-connect]')) { await input.connect(); shownOverlay = ''; paintOverlay(); }
      });

      function beginPlay() {
        phase = 'play';
        controllers.forEach((controller) => controller.resume());
        if (rule.startKey) senders.forEach((sender) => sender.tap(rule.startKey!));
        paintOverlay();
      }
      const stop = startLoop((dt) => {
        const pads = input.read();
        if (phase === 'lobby') {
          pads.forEach((pad, i) => { if (pad.pressed) ready[i] = true; });
          if (ready.every(Boolean)) { phase = 'countdown'; left = 3; }
          paintOverlay();
        } else if (phase === 'countdown') {
          if (paused) return;
          left -= dt;
          if (left <= 0) { left = rule.seconds; beginPlay(); } else paintOverlay();
        } else if (phase === 'play') {
          if (pads.some((pad) => pad.justPressed[BUTTON_INDEX.start])) togglePause();
          if (paused) { senders.forEach((sender) => sender.release()); return; }
          senders.forEach((sender, i) => sender.step(dt, pads[i]));
          if (rule.restartOnSelect) pads.forEach((pad, i) => { if (pad.justPressed[BUTTON_INDEX.select]) controllers[i].restart(); });
          left -= dt;
          const text = clockText(Math.max(0, left));
          if (text !== shownClock) { shownClock = text; clock.textContent = text; }
          if (left <= 0) finish();
        } else {
          waitLeft -= dt;
          if (waitLeft <= 0 && pads.some((pad) => pad.pressed)) round();
        }
      });
      void input.reconnect();
      round();
      return {
        pause() { paused = true; senders.forEach((sender) => sender.release()); if (phase === 'play') controllers.forEach((controller) => controller.pause()); },
        resume() { paused = false; if (phase === 'play') controllers.forEach((controller) => controller.resume()); },
        restart() { paused = false; round(); },
        destroy() { stop(); clearGames(); input.destroy(); host.replaceChildren(); }
      };
    }
  };
}
