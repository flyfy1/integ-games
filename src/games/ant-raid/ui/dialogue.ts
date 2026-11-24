import type { Audio } from '../audio';
import type { I18n } from '../i18n';
import { drawAnt, drawKingfisher, drawMower, drawToad } from '../render/sprites';
import { SPEAKERS, type Scene, type Speaker } from '../story';
import { h } from './dom';

/** Story scenes: a portrait, a name, typewriter text. Space / Enter / tap advance; Esc or Skip ends the scene. */
export type Dialogue = { element: HTMLElement; advance(): void; back(): void; update(dt: number): void };

function portrait(who: Speaker): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 144; canvas.height = 144; canvas.className = 'ar-portrait';
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.setTransform !== 'function') return canvas;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  if (who === 'gulp') drawToad(ctx, 36, 38, 30, 0, -Math.PI / 2, false, 0);
  else if (who === 'rumble') drawMower(ctx, 36, 38, 28, 0, 1);
  else if (who === 'blue') drawKingfisher(ctx, 36, 36, 26, 0.3, 0);
  else if (who !== 'narrator') {
    drawAnt(ctx, 36, 40, who === 'pip' ? 44 : 54, -Math.PI / 2, who === 'pip' ? 'worker' : 'honeypot', 1, { rival: who === 'cinder' });
    if (who === 'mim' || who === 'cinder') { ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#2b1d14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(28, 14); ctx.lineTo(31, 6); ctx.lineTo(36, 12); ctx.lineTo(41, 6); ctx.lineTo(44, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  }
  return canvas;
}

export function createDialogue(ctx: { i18n: I18n; audio: Audio; reduced: boolean }, scene: Scene, done: () => void): Dialogue {
  let index = -1, shown = 0, full = '', finished = false;
  const name = h('h4'), text = h('p', { 'aria-live': 'polite' }), face = h('div');
  const next = h('button', { class: 'ar-btn primary small', 'data-action': 'next', onclick: () => dialogue.advance() }, ctx.i18n.t('dialogue.next'));
  const skip = h('button', { class: 'ar-btn ghost small', 'data-action': 'skip', onclick: () => dialogue.back() }, ctx.i18n.t('dialogue.skip'));
  const box = h('div', { class: 'ar-say' }, face, name, text, h('footer', null, skip, next));
  const element = h('div', { class: 'ar-dialogue', 'data-screen': 'dialogue' }, box);
  element.addEventListener('click', (event) => { if (!(event.target as HTMLElement).closest('button')) dialogue.advance(); });
  const show = () => {
    const line = scene.lines[index];
    const speaker = SPEAKERS[line.who];
    name.textContent = ctx.i18n.tr(speaker.name); name.style.color = speaker.color === '#fff4e0' ? '#4a3424' : '#2b1d14';
    face.replaceChildren(line.who === 'narrator' ? h('span') : portrait(line.who));
    full = ctx.i18n.tr(line.text); shown = ctx.reduced ? full.length : 0;
    text.textContent = full.slice(0, shown);
  };
  const dialogue: Dialogue = {
    element,
    advance() {
      if (finished) return;
      if (index >= 0 && shown < full.length) { shown = full.length; text.textContent = full; return; }
      index++;
      if (index >= scene.lines.length) { finished = true; done(); return; }
      show();
    },
    back() { if (!finished) { finished = true; done(); } },
    update(dt) {
      if (finished || shown >= full.length) return;
      const before = Math.floor(shown);
      shown = Math.min(full.length, shown + dt * (ctx.i18n.lang === 'zh' ? 22 : 45));
      if (Math.floor(shown) !== before) { text.textContent = full.slice(0, Math.floor(shown)); if (Math.floor(shown) % 3 === 0) ctx.audio.sfx('voice', scene.lines[index].who === 'pip' ? 1.6 : 1); }
    }
  };
  dialogue.advance();
  return dialogue;
}
