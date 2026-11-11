import type { Audio } from '../audio';
import type { I18n } from '../i18n';
import { spriteIcon } from '../render/sprites';
import { CHARACTERS, type Scene } from '../story';
import { h } from './dom';

/**
 * Dialogue scene player: portrait (with the line's mood), a name plate in the speaker's colour, typewriter text,
 * tap / Space / Enter to finish the line and then to advance, optional auto-advance, a backlog, and Skip.
 * Time comes from `update(dt)` on the game loop rather than timers, so pausing the game pauses the typewriter
 * and destroy() has nothing to cancel.
 */
export type Dialogue = { element: HTMLElement; advance(): void; skip(): void; update(dt: number): void; /** Esc: close the log if open, else skip. */ back(): void };
export type DialogueDeps = { i18n: I18n; audio: Audio; reduced: boolean; auto: boolean; setAuto?(on: boolean): void };

export function createDialogue(deps: DialogueDeps, scene: Scene, onDone: () => void): Dialogue {
  const { i18n, audio } = deps, { t, tr } = i18n;
  const portrait = h('div', { class: 'mk-portrait' }), name = h('span', { class: 'mk-nameplate' }), text = h('p'), hint = h('small', null, t('dialogue.next'));
  const box = h('div', { class: 'mk-dialogue-box' }, portrait, h('div', { class: 'mk-speech' }, name, text, hint));
  const dots = h('div', { class: 'mk-dots', 'aria-hidden': 'true' }, scene.lines.map(() => h('i')));
  let index = -1, shown = 0, full = '', done = false, auto = deps.auto, wait = 0, lastWho = '';
  const speed = i18n.lang === 'zh' ? 24 : 52;
  const log = h('div', { class: 'mk-log', hidden: true, role: 'log', onclick: (event: Event) => event.stopPropagation() });

  const show = (next: number) => {
    index = next;
    const line = scene.lines[index], who = CHARACTERS[line.who];
    full = tr(line.text); shown = deps.reduced ? full.length : 0; wait = 0;
    name.textContent = who ? tr(who.name) : line.who;
    name.style.background = who?.color ?? '';
    portrait.replaceChildren(spriteIcon('character', line.who, 112, { mood: line.mood }));
    if (line.who !== lastWho) { portrait.style.animation = 'none'; void portrait.offsetWidth; portrait.style.animation = ''; }
    lastWho = line.who;
    box.classList.toggle('right', who?.side === 'right');
    text.textContent = full.slice(0, shown);
    // The whole line is exposed to assistive tech immediately; the typewriter is only visual.
    text.setAttribute('aria-label', `${name.textContent}: ${full}`);
    hint.hidden = shown < full.length;
    dots.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i <= index));
    audio.sfx('dialogue');
  };
  const finish = () => { if (done) return; done = true; onDone(); };
  const advance = () => {
    if (done) return;
    if (!log.hidden) { log.hidden = true; return; }
    if (shown < full.length) { shown = full.length; text.textContent = full; hint.hidden = false; return; }
    if (index + 1 >= scene.lines.length) finish(); else show(index + 1);
  };
  const autoButton = h('button', { class: 'mk-btn small ghost', 'data-action': 'auto', 'aria-pressed': String(auto), onclick: (event: Event) => { event.stopPropagation(); auto = !auto; autoButton.setAttribute('aria-pressed', String(auto)); autoButton.classList.toggle('primary', auto); autoButton.classList.toggle('ghost', !auto); deps.setAuto?.(auto); } }, `▶ ${t('dialogue.auto')}`);
  if (auto) { autoButton.classList.add('primary'); autoButton.classList.remove('ghost'); }
  const logButton = h('button', { class: 'mk-btn small ghost', 'data-action': 'log', onclick: (event: Event) => {
    event.stopPropagation();
    if (!log.hidden) { log.hidden = true; return; }
    log.replaceChildren(...scene.lines.slice(0, index + 1).map(line => { const who = CHARACTERS[line.who]; return h('div', null, h('b', null, who ? tr(who.name) : line.who), tr(line.text)); }));
    log.hidden = false; log.scrollTop = log.scrollHeight;
  } }, `☰ ${t('dialogue.log')}`);
  const skipButton = h('button', { class: 'mk-btn small', 'data-action': 'skip', onclick: (event: Event) => { event.stopPropagation(); finish(); } }, `${t('dialogue.skip')} »`);
  const element = h('div', { class: 'mk-dialogue', 'data-scene': scene.id, role: 'dialog', 'aria-live': 'polite', 'aria-label': t('dialogue.label'), onclick: advance },
    h('div', { class: 'mk-dialogue-bar' }, autoButton, logButton, skipButton), log, box, dots);
  if (scene.lines.length) show(0); else finish();
  return {
    element, advance, skip: finish,
    back() { if (!log.hidden) log.hidden = true; else finish(); },
    update(dt) {
      if (done) return;
      if (shown < full.length) {
        const before = Math.floor(shown);
        shown = Math.min(full.length, shown + dt * speed);
        text.textContent = full.slice(0, Math.floor(shown));
        if (Math.floor(shown) > before && /\S/.test(full.charAt(before))) audio.voice?.(scene.lines[index].who);
        if (shown >= full.length) hint.hidden = false;
        return;
      }
      if (auto && log.hidden) { wait += dt; if (wait >= 1.4 + full.length * (i18n.lang === 'zh' ? 0.06 : 0.025)) advance(); }
    }
  };
}
