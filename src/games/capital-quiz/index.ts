import type { GameController, GameModule } from '../../core/game-types';
import { REGION_COLORS, flagEmoji, type ShapeEntry } from './data';
import { SHAPE_VIEWBOX } from './shapes';
import { MODES, ROUND_LENGTH, answerOf, buildRound, isMode, poolFor, pointsFor, type Mode, type Question } from './logic';

type State = { mode: Mode; round: Question[]; index: number; score: number; streak: number; correct: number; missed: string[] };
type Saved = { mode?: Mode; round: Array<{ country: string; options: string[] }>; index: number; score: number; streak: number; correct: number; missed: string[] };

const STYLE_ID = 'capital-quiz-style';
const CSS = `
.cq{width:min(100%,460px);display:grid;gap:12px;color:#F7F9FF;touch-action:manipulation}
.cq-hud{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:#A8B1C5}
.cq-hud strong{color:#F7F9FF;font-size:1.25rem;letter-spacing:0;font-variant-numeric:tabular-nums}
.cq-streak{min-width:3.4em;text-align:right;color:#FFDA74;font-weight:800}
.cq-bar{height:8px;border-radius:99px;background:#273149;overflow:hidden}
.cq-bar i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#70F0C2,#59C9FF);transition:width .25s ease}
.cq-card{--region:#59C9FF;position:relative;display:grid;justify-items:center;gap:4px;padding:18px 14px 16px;border-radius:20px;border:1px solid color-mix(in srgb,var(--region) 55%,#273149);background:radial-gradient(circle at 50% 0,color-mix(in srgb,var(--region) 30%,#182039),#12192A 72%);text-align:center}
.cq-flag{font-size:clamp(3.2rem,15vw,4.6rem);line-height:1.05}
.cq-card h2{margin:0;font-size:clamp(1.3rem,6vw,1.75rem);letter-spacing:-.02em;overflow-wrap:anywhere}
.cq-card p{margin:0;color:#A8B1C5;font-size:.9rem}
.cq-chip{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#071712;background:var(--region)}
.cq-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cq-option{min-height:64px;padding:8px 10px;border:1px solid #52617f;border-radius:14px;background:#182039;color:#F7F9FF;font-weight:800;font-size:clamp(.92rem,4vw,1.05rem);line-height:1.15;overflow-wrap:anywhere;touch-action:manipulation}
.cq-option:active:not(:disabled){background:#273149}
.cq-option:focus-visible,.cq-action:focus-visible{outline:3px solid #70F0C2;outline-offset:2px}
.cq-option.is-right{background:#70F0C2;border-color:#70F0C2;color:#071712}
.cq-option.is-wrong{background:#FF6B7A;border-color:#FF6B7A;color:#2a0a10}
.cq-option:disabled:not(.is-right):not(.is-wrong){opacity:.55}
.cq-option:disabled{cursor:default}
.cq-shape{width:clamp(110px,40vw,170px);height:clamp(110px,40vw,170px);color:#70F0C2;filter:drop-shadow(0 2px 8px rgba(0,0,0,.35))}
.cq-menu{display:grid;gap:10px}
.cq-menu h2{margin:0;text-align:center;font-size:1.4rem;letter-spacing:-.02em}
.cq-menu>p{margin:0;text-align:center;color:#A8B1C5;font-size:.9rem}
.cq-mode{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 14px;min-height:76px;padding:10px 16px;border:1px solid #52617f;border-radius:16px;background:#182039;color:#F7F9FF;text-align:left;touch-action:manipulation}
.cq-mode:active{background:#273149}
.cq-mode:focus-visible{outline:3px solid #70F0C2;outline-offset:2px}
.cq-mode-icon{grid-row:span 2;font-size:2.1rem;line-height:1}
.cq-mode strong{font-size:1.05rem}
.cq-mode span:last-child{color:#A8B1C5;font-size:.82rem}
.cq-secondary{background:transparent;border:1px solid #52617f;color:#F7F9FF}
.cq-result-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.cq-feedback{min-height:2.7em;margin:0;text-align:center;font-size:.95rem;font-weight:700;color:#A8B1C5}
.cq-feedback.is-right{color:#70F0C2}.cq-feedback.is-wrong{color:#FF9baa}
.cq-action{min-height:48px;padding:10px 18px;border:0;border-radius:12px;background:#70F0C2;color:#071712;font-weight:900;touch-action:manipulation}
.cq-next-slot{min-height:48px;display:grid;place-items:center}
.cq-result{display:grid;justify-items:center;gap:10px;padding:22px 16px;border-radius:20px;border:1px solid #273149;background:#12192A;text-align:center}
.cq-result h2{margin:0;font-size:1.5rem}.cq-result .cq-big{font-size:3rem;font-weight:900;color:#70F0C2;line-height:1}
.cq-result p{margin:0;color:#A8B1C5}
.cq-missed{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:.88rem;color:#F7F9FF;max-height:7.5em;overflow:auto;width:100%}
.cq.is-motion .cq-card.pop{animation:cq-pop .28s ease}
.cq.is-motion .cq-option.is-wrong{animation:cq-shake .3s ease}
@keyframes cq-pop{50%{transform:scale(1.03)}}
@keyframes cq-shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@media(max-height:640px){.cq{gap:8px}.cq-card{padding:10px}.cq-option{min-height:56px}.cq-shape{width:100px;height:100px}.cq-mode{min-height:64px}}
`;

const game: GameModule = {
  meta: {
    slug: 'capital-quiz', title: 'Geo Quiz', category: 'puzzle', accent: '#59C9FF',
    description: 'Name capitals, flags and country outlines from every continent.',
    instructions: 'Pick a mode: capitals, flags or outlines. Tap the right answer out of four; answer in a row for a streak bonus.',
    mechanic: 'Pick capitals, flags or outlines'
  },
  mount(host, services): GameController {
    if (!document.getElementById(STYLE_ID)) { const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.append(style); }
    // The capital mode keeps the original key so existing best scores carry over.
    const bestKey = (m: Mode) => (m === 'capital' ? 'capital-quiz-best' : `capital-quiz-best-${m}`);
    let mode: Mode | null = null;
    let round: Question[] = [], index = 0, score = 0, streak = 0, correct = 0, missed: string[] = [];
    let answered = false, paused = false, destroyed = false, timer: number | undefined;

    const saved = restore(services.storage.get<Saved | null>('save', null));
    if (saved) ({ mode, round, index, score, streak, correct, missed } = saved);

    host.innerHTML = '<div class="cq" data-cq></div>';
    const root = host.firstElementChild as HTMLElement;
    root.classList.toggle('is-motion', !services.isReducedMotion);
    const el = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;

    const persist = () => services.storage.set<Saved | null>('save', !mode || index >= ROUND_LENGTH ? null : { mode, round: round.map((q) => ({ country: q.entry.country, options: q.options })), index, score, streak, correct, missed });
    const clearTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };

    const hud = () => `<div data-hud><div class="cq-hud" aria-live="polite"><span>Question <strong>${answered ? index : Math.min(index + 1, ROUND_LENGTH)}/${ROUND_LENGTH}</strong></span><span>Score <strong>${score}</strong></span><span class="cq-streak" aria-label="Streak">${streak >= 2 ? `🔥 ${streak}` : ''}</span></div><div class="cq-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ROUND_LENGTH}" aria-valuenow="${index}"><i style="width:${(index / ROUND_LENGTH) * 100}%"></i></div></div>`;

    const MODE_INFO: Record<Mode, { icon: string; name: string; blurb: string; choices: string; again: string }> = {
      capital: { icon: '🏛️', name: 'Guess the capital', blurb: 'A country, four capitals', choices: 'Capital choices', again: 'Capital genius!' },
      flag: { icon: '🚩', name: 'Guess the flag', blurb: 'A flag, four countries', choices: 'Country choices', again: 'Flag master!' },
      shape: { icon: '🗺️', name: 'Guess the outline', blurb: 'A silhouette, four countries', choices: 'Country choices', again: 'Cartographer!' }
    };

    function showMenu() {
      clearTimer(); answered = false; mode = null; persist();
      root.innerHTML = `<div class="cq-menu"><h2>Geo Quiz</h2><p>Ten questions. Pick a mode.</p>${MODES.map((m) => `<button type="button" class="cq-mode" data-mode="${m}"><span class="cq-mode-icon" aria-hidden="true">${MODE_INFO[m].icon}</span><strong>${MODE_INFO[m].name}</strong><span>${MODE_INFO[m].blurb} · Best ${services.storage.get<number>(bestKey(m), 0)}</span></button>`).join('')}</div>`;
    }

    function start(m: Mode) {
      clearTimer(); mode = m; round = buildRound(services.random, poolFor(m), m); index = 0; score = 0; streak = 0; correct = 0; missed = []; paused = false;
      services.reportScore(0); persist(); showQuestion();
    }

    function card(q: Question, m: Mode) {
      const e = q.entry;
      if (m === 'flag') return `<div class="cq-card pop"><span class="cq-flag" role="img" aria-label="A national flag">${flagEmoji(e.iso)}</span><p>Which country's flag is this?</p></div>`;
      if (m === 'shape') return `<div class="cq-card pop"><svg class="cq-shape" viewBox="0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}" role="img" aria-label="A country outline"><path d="${(e as ShapeEntry).path}" fill="currentColor"/></svg><p>Which country has this outline?</p></div>`;
      return `<div class="cq-card pop" style="--region:${REGION_COLORS[e.region]}"><span class="cq-flag" aria-hidden="true">${flagEmoji(e.iso)}</span><h2>${e.country}</h2><p>What is its capital?</p><span class="cq-chip">${e.region}</span></div>`;
    }

    function showQuestion() {
      clearTimer(); answered = false;
      const q = round[index], m = mode as Mode;
      root.innerHTML = `${hud()}
        ${card(q, m)}
        <div class="cq-options" role="group" aria-label="${MODE_INFO[m].choices}">${q.options.map((o, i) => `<button type="button" class="cq-option" data-i="${i}">${o}</button>`).join('')}</div>
        <p class="cq-feedback" data-fb aria-live="polite"></p><div class="cq-next-slot" data-next></div>`;
    }

    function answer(i: number) {
      if (answered || paused || destroyed || !mode) return;
      const q = round[index];
      if (i < 0 || i >= q.options.length) return;
      answered = true;
      const right = i === q.answerIndex, buttons = [...root.querySelectorAll<HTMLButtonElement>('.cq-option')];
      buttons.forEach((b) => { b.disabled = true; });
      buttons[q.answerIndex].classList.add('is-right');
      const fb = el<HTMLElement>('[data-fb]');
      if (right) {
        streak++; correct++; score += pointsFor(q.entry.difficulty, streak);
        fb.className = 'cq-feedback is-right'; fb.textContent = streak >= 2 ? `Correct! ${streak} in a row 🔥` : 'Correct!';
        services.sound.play('success');
      } else {
        buttons[i].classList.add('is-wrong'); streak = 0; missed.push(mode === 'capital' ? `${q.entry.country} — ${q.entry.capital}` : mode === 'flag' ? `${flagEmoji(q.entry.iso)} ${q.entry.country}` : q.entry.country);
        fb.className = 'cq-feedback is-wrong'; fb.textContent = mode === 'capital' ? `Not quite — the capital of ${q.entry.country} is ${q.entry.capital}.` : `Not quite — that was ${q.entry.country}.`;
        services.sound.play('fail');
      }
      services.reportScore(score); index++; persist();
      el<HTMLElement>('[data-hud]').outerHTML = hud();
      const slot = el<HTMLElement>('[data-next]');
      slot.innerHTML = `<button type="button" class="cq-action" data-next-btn>${index >= ROUND_LENGTH ? 'See results' : 'Next'}</button>`;
      if (right) scheduleNext();
    }

    function scheduleNext() { clearTimer(); if (!paused) timer = window.setTimeout(next, 900); }
    function next() { clearTimer(); if (!answered || destroyed) return; if (index >= ROUND_LENGTH) finish(); else showQuestion(); }

    function finish() {
      const m = mode as Mode, prior = services.storage.get<number>(bestKey(m), 0), best = Math.max(prior, score);
      if (best !== prior) services.storage.set(bestKey(m), best);
      services.reportScore(score); services.reportComplete(1); services.sound.play('success');
      root.innerHTML = `${hud()}<div class="cq-result"><h2>${correct >= 9 ? MODE_INFO[m].again : correct >= 6 ? 'Nicely navigated!' : 'Good start — keep exploring!'}</h2><span class="cq-big">${score}</span><p>${correct}/${ROUND_LENGTH} correct · Best ${best}</p>${missed.length ? `<p>Worth remembering:</p><ul class="cq-missed">${missed.map((m) => `<li>${m}</li>`).join('')}</ul>` : '<p>A perfect round — no misses!</p>'}<div class="cq-result-actions"><button type="button" class="cq-action" data-again>Play again</button><button type="button" class="cq-action cq-secondary" data-menu>Change mode</button></div></div>`;
      answered = true;
    }

    /** Replays the current mode, or returns to the menu when none is chosen. */
    function restart() { paused = false; if (mode) start(mode); else showMenu(); }

    root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('button'); if (!t || paused) return;
      if (t.dataset.mode !== undefined && isMode(t.dataset.mode)) { services.sound.play('tap'); start(t.dataset.mode); }
      else if (t.hasAttribute('data-menu')) showMenu();
      else if (t.dataset.i !== undefined) { services.sound.play('tap'); answer(Number(t.dataset.i)); }
      else if (t.hasAttribute('data-next-btn')) next();
      else if (t.hasAttribute('data-again')) restart();
    });
    const onKey = (ev: KeyboardEvent) => {
      if (paused || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (!mode) { if (/^[1-3]$/.test(ev.key)) start(MODES[Number(ev.key) - 1]); }
      else if (/^[1-4]$/.test(ev.key)) { answer(Number(ev.key) - 1); }
      else if ((ev.key === 'Enter' || ev.key === ' ') && answered && (ev.target as HTMLElement).tagName !== 'BUTTON') { ev.preventDefault(); if (root.querySelector('[data-again]')) restart(); else next(); }
    };
    host.addEventListener('keydown', onKey);

    if (mode) showQuestion(); else showMenu();
    return {
      pause() { paused = true; clearTimer(); },
      resume() { paused = false; if (answered && index < ROUND_LENGTH && root.querySelector('.cq-feedback.is-right')) scheduleNext(); },
      restart,
      destroy() { destroyed = true; clearTimer(); host.removeEventListener('keydown', onKey); host.replaceChildren(); }
    };
  }
};

/** Rebuild a saved round, rejecting anything inconsistent with the current question bank. */
function restore(s: Saved | null): State | null {
  const mode: Mode = s && isMode(s.mode) ? s.mode : 'capital'; // saves from before the modes existed are capital rounds
  if (!s || !Array.isArray(s.round) || s.round.length !== ROUND_LENGTH || !Number.isInteger(s.index) || s.index < 0 || s.index >= ROUND_LENGTH) return null;
  const round: Question[] = [];
  for (const r of s.round) {
    const entry = poolFor(mode).find((c) => c.country === r.country);
    if (!entry || !Array.isArray(r.options) || r.options.length !== 4 || new Set(r.options).size !== 4 || !r.options.includes(answerOf(entry, mode))) return null;
    round.push({ entry, options: r.options, answerIndex: r.options.indexOf(answerOf(entry, mode)) });
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return { mode, round, index: s.index, score: num(s.score), streak: num(s.streak), correct: num(s.correct), missed: Array.isArray(s.missed) ? s.missed.filter((m) => typeof m === 'string') : [] };
}

export { game };
export default game;
