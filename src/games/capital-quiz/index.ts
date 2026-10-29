import type { GameController, GameModule } from '../../core/game-types';
import { COUNTRIES, REGION_COLORS, flagEmoji, type CountryEntry, type Difficulty, type ShapeEntry } from './data';
import { SHAPE_VIEWBOX } from './shapes';
import { LANGS, capitalLabel, capitalName, countryLabel, countryName, defaultLang, isLang, regionName, t, type Key, type Lang } from './i18n';
import { BASE_POINTS, MODES, ROUND_LENGTH, answerOf, buildRound, isMode, poolFor, pointsFor, type Mode, type Question } from './logic';

/** `results[i]` is whether question i was answered correctly; null when unknown (saves from before results were kept). */
type Result = boolean | null;
type State = { mode: Mode; round: Question[]; index: number; score: number; streak: number; correct: number; missed: string[]; results: Result[] };
type Saved = { mode?: Mode; round: Array<{ country: string; options: string[] }>; index: number; score: number; streak: number; correct: number; missed: string[]; results?: Result[] };

const STYLE_ID = 'capital-quiz-style';
const CSS = `
.cq{--ok:#70F0C2;--bad:#FF6B7A;--ink:#F7F9FF;--muted:#A8B1C5;--line:#273149;width:min(100%,460px);max-width:100%;display:grid;gap:10px;color:var(--ink);touch-action:manipulation;min-width:0}
.cq *{box-sizing:border-box}
.cq-langbar{display:flex;justify-content:flex-end}
.cq-lang{display:inline-flex;border:1px solid #52617f;border-radius:12px;overflow:hidden}
.cq-lang button{min-width:48px;min-height:44px;padding:0 12px;border:0;background:#182039;color:var(--muted);font-weight:800;font-size:.9rem;touch-action:manipulation}
.cq-lang button+button{border-left:1px solid #52617f}
.cq-lang button[aria-pressed=true]{background:var(--ok);color:#071712}
.cq-lang button:focus-visible{outline:3px solid var(--ok);outline-offset:-3px}
.cq-body{display:grid;gap:10px;min-width:0}
.cq-hud{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px}
/* Clear the immersive exit button pinned to the top-left corner. */
.game-stage.is-immersive .cq-hud{padding-left:50px}
.cq-hud-q,.cq-hud-score{display:grid;line-height:1.05}
.cq-hud small{font-size:.66rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.cq-streak small{white-space:nowrap}
.cq-hud strong{font-size:1.3rem;font-variant-numeric:tabular-nums}
.cq-hud-score{justify-items:center}
.cq-hud-score strong{position:relative;font-size:1.55rem;color:var(--ink)}
.cq-hud-score.is-bump strong{color:var(--ok)}
.cq-streak{--tier:#52617f;display:grid;justify-items:center;min-width:4.6em;padding:4px 9px;border-radius:12px;border:1px solid color-mix(in srgb,var(--tier) 70%,transparent);background:color-mix(in srgb,var(--tier) 16%,#12192A);line-height:1.05;transition:background .25s,border-color .25s}
.cq-streak b{font-size:1.05rem;font-variant-numeric:tabular-nums;color:var(--ink)}
.cq-streak small{color:var(--tier)!important;font-weight:800;letter-spacing:.06em!important}
.cq-streak.t1{--tier:#FFDA74}.cq-streak.t2{--tier:#FFB06B}.cq-streak.t3{--tier:#FF8A5C}
.cq-streak.t4{--tier:#FF6BD5;box-shadow:0 0 14px color-mix(in srgb,#FF6BD5 45%,transparent)}
.cq-streak.is-reset{--tier:#8C97B0}
.cq-segs{display:grid;grid-template-columns:repeat(${ROUND_LENGTH},1fr);gap:4px}
.cq-segs i{height:7px;border-radius:99px;background:var(--line);transition:background .25s}
.cq-segs i.is-ok{background:var(--ok)}.cq-segs i.is-bad{background:var(--bad)}.cq-segs i.is-done{background:#52617f}
.cq-segs i.is-now{background:#F7F9FF80}
.cq-card{--region:#59C9FF;position:relative;display:grid;justify-items:center;align-content:center;gap:6px;min-height:clamp(150px,30vh,200px);padding:26px 14px 14px;border-radius:20px;border:1px solid color-mix(in srgb,var(--region) 55%,var(--line));background:radial-gradient(circle at 50% 0,color-mix(in srgb,var(--region) 30%,#182039),#12192A 72%);text-align:center;overflow:hidden}
.cq-diff{position:absolute;top:9px;left:10px;padding:2px 8px;border-radius:99px;background:#090D18aa;color:#FFDA74;font-size:.68rem;font-weight:800;letter-spacing:.04em;white-space:nowrap}
.cq-diff span{color:var(--muted);font-weight:700}
.cq-flag{font-size:clamp(3.2rem,15vw,4.4rem);line-height:1.05}
.cq-flag.is-hero{font-size:clamp(4.6rem,24vw,6.4rem);filter:drop-shadow(0 6px 14px rgba(0,0,0,.45))}
.cq-card h2{margin:0;font-size:clamp(1.3rem,6vw,1.75rem);letter-spacing:-.02em;overflow-wrap:anywhere}
.cq-card p{margin:0;color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}
.cq-card p.is-reveal{color:var(--ink);font-weight:800;font-size:1.02rem}
.cq-card p.is-reveal.is-ok{color:var(--ok)}
.cq-chip{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#071712;background:var(--region)}
.cq-globe{display:grid;place-items:center;width:clamp(120px,38vw,160px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 30%,#22345a,#111a2e 70%);box-shadow:inset 0 0 0 1px #2c3a5c,0 8px 22px rgba(0,0,0,.35)}
.cq-shape{width:84%;height:84%;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))}
.cq-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cq-option{position:relative;min-width:0;min-height:64px;padding:8px 10px;border:1px solid #52617f;border-radius:14px;background:#182039;color:var(--ink);font-weight:800;font-size:clamp(.92rem,4vw,1.05rem);line-height:1.15;overflow-wrap:anywhere;touch-action:manipulation;transition:background .15s,border-color .15s,transform .1s}
.cq-option:active:not(:disabled){background:#273149;transform:scale(.98)}
.cq-option:focus-visible,.cq-action:focus-visible,.cq-mode:focus-visible{outline:3px solid var(--ok);outline-offset:2px}
.cq-option.is-right{background:var(--ok);border-color:var(--ok);color:#071712}
.cq-option.is-wrong{background:var(--bad);border-color:var(--bad);color:#2a0a10}
.cq-option.is-right::after,.cq-option.is-wrong::after{position:absolute;top:5px;right:8px;font-size:.85rem;font-weight:900}
.cq-option.is-right::after{content:"✓"}.cq-option.is-wrong::after{content:"✕"}
.cq-option:disabled:not(.is-right):not(.is-wrong){opacity:.45}
.cq-option:disabled{cursor:default}
.cq-float{position:absolute;left:50%;top:0;transform:translate(-50%,-30%);padding:2px 9px;border-radius:99px;background:#071712;color:var(--ok);font-size:1rem;font-weight:900;pointer-events:none;white-space:nowrap;opacity:0;z-index:2}
.cq-feedback{display:grid;gap:2px;min-height:2.9em;margin:0;text-align:center;font-size:.95rem;color:var(--muted)}
.cq-feedback strong{font-weight:800}.cq-feedback small{font-size:.8rem;color:var(--muted)}
.cq-feedback.is-right strong{color:var(--ok)}.cq-feedback.is-wrong strong{color:#FF9BAA}
.cq-action{min-height:48px;padding:10px 22px;border:0;border-radius:12px;background:var(--ok);color:#071712;font-weight:900;touch-action:manipulation}
.cq-secondary{background:transparent;border:1px solid #52617f;color:var(--ink)}
.cq-next-slot{min-height:48px;display:grid;place-items:center}
.cq-menu{display:grid;gap:10px}
.cq-menu-head{display:grid;justify-items:center;gap:2px;text-align:center}
.cq-menu-head>span{font-size:2.4rem;line-height:1}
.cq-menu h2{margin:0;font-size:1.6rem;letter-spacing:-.02em}
.cq-menu-head p,.cq-rules{margin:0;color:var(--muted);font-size:.86rem;text-align:center}
.cq-rules{font-size:.78rem}
.cq-mode{--accent:#59C9FF;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;min-height:78px;padding:10px 14px;border:1px solid color-mix(in srgb,var(--accent) 40%,#52617f);border-radius:18px;background:linear-gradient(100deg,color-mix(in srgb,var(--accent) 18%,#182039),#182039 70%);color:var(--ink);text-align:left;touch-action:manipulation;min-width:0}
.cq-mode:active{transform:scale(.985)}
.cq-mode-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:color-mix(in srgb,var(--accent) 28%,#0f1628);font-size:1.8rem;line-height:1}
.cq-mode-text{display:grid;gap:2px;min-width:0}
.cq-mode strong{font-size:1.06rem}
.cq-mode-text span{color:var(--muted);font-size:.82rem;overflow-wrap:anywhere}
.cq-best{display:grid;justify-items:end;line-height:1.05}
.cq-best small{font-size:.62rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.cq-best b{font-size:1.05rem;font-variant-numeric:tabular-nums;color:var(--accent)}
.cq-best.is-new b{font-size:.8rem;color:var(--muted)}
.cq-result{display:grid;justify-items:center;gap:10px;padding:18px 14px;border-radius:20px;border:1px solid var(--line);background:radial-gradient(circle at 50% 0,#1d2a48,#12192A 70%);text-align:center;min-width:0}
.cq-result h2{margin:0;font-size:1.35rem;letter-spacing:-.02em}
.cq-result-mode{margin:-6px 0 0;color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}
.cq-total{display:flex;align-items:baseline;gap:6px}
.cq-total strong{font-size:clamp(2.6rem,13vw,3.3rem);font-weight:900;color:var(--ok);line-height:1;font-variant-numeric:tabular-nums}
.cq-total small{color:var(--muted);font-size:.85rem}
.cq-vs{margin:0;padding:5px 12px;border-radius:99px;background:#273149;color:var(--ink);font-size:.85rem;font-weight:700}
.cq-vs.is-best{background:color-mix(in srgb,#FFDA74 22%,#182039);color:#FFDA74}
.cq-break{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin:0}
.cq-break div{display:grid;gap:2px;padding:8px 6px;border-radius:12px;background:#182039;border:1px solid var(--line)}
.cq-break dt{font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
.cq-break dd{margin:0;font-size:1.15rem;font-weight:900;font-variant-numeric:tabular-nums}
.cq-recap{width:100%;display:grid;gap:4px;text-align:left}
.cq-recap p{margin:0;color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em}
.cq-missed{margin:0;padding:0;list-style:none;display:grid;gap:3px;font-size:.86rem;color:var(--ink);max-height:6.2em;overflow:auto}
.cq-missed li{padding:3px 8px;border-left:3px solid var(--bad);background:#182039;border-radius:4px;overflow-wrap:anywhere}
.cq-perfect{margin:0;color:var(--ok);font-weight:700}
.cq-result-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.cq.is-motion .cq-card.pop{animation:cq-in .3s ease-out}
.cq.is-motion .cq-option.is-wrong{animation:cq-shake .3s ease}
.cq.is-motion .cq-option.is-right.is-picked{animation:cq-pop .3s ease}
.cq.is-motion .cq-option.is-right:not(.is-picked){animation:cq-glow .9s ease 2}
.cq.is-motion .cq-float{animation:cq-float 1s ease-out forwards}
.cq.is-motion .cq-hud-score.is-bump strong{animation:cq-pop .35s ease}
.cq.is-motion .cq-streak.is-up{animation:cq-up .45s cubic-bezier(.3,1.6,.5,1)}
.cq.is-motion .cq-segs i.is-now{animation:cq-blink 1.4s ease-in-out infinite}
.cq.is-motion .cq-vs.is-best{animation:cq-pop .5s ease .6s both}
.cq:not(.is-motion) .cq-float{display:none}
@keyframes cq-pop{50%{transform:scale(1.06)}}
@keyframes cq-in{from{opacity:0;transform:translateY(8px)}}
@keyframes cq-shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes cq-glow{50%{box-shadow:0 0 0 4px color-mix(in srgb,#70F0C2 45%,transparent)}}
@keyframes cq-float{0%{opacity:0;transform:translate(-50%,-10%) scale(.8)}20%{opacity:1;transform:translate(-50%,-60%) scale(1.1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-115%) scale(1)}}
@keyframes cq-up{0%{transform:scale(1)}40%{transform:scale(1.22) rotate(-3deg)}100%{transform:scale(1)}}
@keyframes cq-blink{50%{background:#F7F9FF30}}
@media(max-height:700px){.cq{gap:6px}.cq-body{gap:8px}.cq-card{min-height:136px;padding:24px 10px 10px}.cq-globe{width:112px}.cq-flag.is-hero{font-size:4.2rem}.cq-option{min-height:56px}.cq-mode{min-height:66px}.cq-mode-icon{width:44px;height:44px}.cq-result{gap:8px;padding:14px 12px}.cq-total strong{font-size:2.5rem}}
`;

const LANG_KEY = 'lang';
const fmt = (n: number) => n.toLocaleString('en-US');
const STARS: Record<Difficulty, string> = { 1: '★☆☆', 2: '★★☆', 3: '★★★' };
/** Streak tier 0..4: tier n means this answer earned +25×n bonus (tier 4 is the +100 cap). */
const tierOf = (streak: number) => Math.max(0, Math.min(4, streak - 1));

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
    const motion = !services.isReducedMotion && typeof requestAnimationFrame === 'function';
    const storedLang = services.storage.get<unknown>(LANG_KEY, null);
    let lang: Lang = isLang(storedLang) ? storedLang : defaultLang();
    const tr = (key: Key, params?: Record<string, string | number>) => t(lang, key, params);
    let mode: Mode | null = null;
    let round: Question[] = [], index = 0, score = 0, streak = 0, correct = 0, missed: string[] = [], results: Result[] = [];
    let answered = false, paused = false, destroyed = false, timer: number | undefined, raf: number | undefined;
    /** What the player just did on the question on screen, kept so a language switch can repaint the feedback. */
    let last: { picked: number; right: boolean; gained: number; lostStreak: number } | null = null;
    let view: 'menu' | 'question' | 'result' = 'menu';
    let resultInfo = { prior: 0, newBest: false };

    const saved = restore(services.storage.get<Saved | null>('save', null));
    if (saved) ({ mode, round, index, score, streak, correct, missed, results } = saved);

    host.innerHTML = '<div class="cq" data-cq><div class="cq-langbar"><div class="cq-lang" role="group" data-langbar></div></div><div class="cq-body" data-body></div></div>';
    const root = host.firstElementChild as HTMLElement;
    root.classList.toggle('is-motion', motion);
    const el = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const body = el<HTMLElement>('[data-body]');
    const paintLangBar = () => {
      const bar = el<HTMLElement>('[data-langbar]');
      bar.setAttribute('aria-label', tr('lang.label'));
      bar.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" lang="${l}" aria-pressed="${l === lang}">${t(l, `lang.${l}`)}</button>`).join('');
    };

    const persist = () => services.storage.set<Saved | null>('save', !mode || index >= ROUND_LENGTH ? null : { mode, round: round.map((q) => ({ country: q.entry.country, options: q.options })), index, score, streak, correct, missed, results });
    const clearTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
    const stopRoll = () => { if (raf !== undefined) { cancelAnimationFrame(raf); raf = undefined; } };

    /** Count a number up from `from` to `to` inside `target`; instant when motion is off. */
    function roll(target: HTMLElement, from: number, to: number, ms: number) {
      stopRoll();
      if (!motion || from === to) { target.textContent = fmt(to); return; }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms), eased = 1 - (1 - p) ** 3;
        target.textContent = fmt(Math.round(from + (to - from) * eased));
        raf = p < 1 ? requestAnimationFrame(step) : undefined;
      };
      raf = requestAnimationFrame(step);
    }

    const segs = () => Array.from({ length: ROUND_LENGTH }, (_, i) => {
      const r = results[i];
      return `<i class="${i < results.length ? (r === true ? 'is-ok' : r === false ? 'is-bad' : 'is-done') : i === index && !answered ? 'is-now' : ''}"></i>`;
    }).join('');
    const streakChip = (s: number, reset = false) => {
      const tier = tierOf(s);
      const label = reset ? tr('streak.fresh') : tier === 4 ? tr('streak.max') : tier > 0 ? tr('streak.bonus', { n: 25 * tier }) : tr('streak.none');
      return `<span class="cq-streak${reset ? ' is-reset' : tier ? ` t${tier}` : ''}" data-streak aria-label="${tr('streak.aria', { n: s })}"><b>${s >= 2 ? `🔥 ${s}` : s}</b><small>${label}</small></span>`;
    };
    const hud = () => `<div data-hud><div class="cq-hud"><span class="cq-hud-q"><small>${tr('hud.question')}</small><strong data-q>${answered ? index : Math.min(index + 1, ROUND_LENGTH)}/${ROUND_LENGTH}</strong></span><span class="cq-hud-score" data-score-box><small>${tr('hud.score')}</small><strong data-score aria-label="${tr('hud.score')}">${fmt(score)}</strong></span>${streakChip(streak, view === 'question' && !!last && !last.right && last.lostStreak >= 2)}</div><div class="cq-segs" role="progressbar" aria-label="${tr('hud.progress')}" aria-valuemin="0" aria-valuemax="${ROUND_LENGTH}" aria-valuenow="${index}" data-segs>${segs()}</div></div>`;

    const MODE_ACCENT: Record<Mode, string> = { capital: '#59C9FF', flag: '#FFB06B', shape: '#70F0C2' };
    const MODE_ICON: Record<Mode, string> = { capital: '🏛️', flag: '🚩', shape: '🗺️' };
    const optionLabel = (o: string, m: Mode) => (m === 'capital' ? capitalLabel(o, lang) : countryLabel(o, lang));
    /** The question on screen: after an answer `index` has already advanced. */
    const current = () => round[answered ? index - 1 : index];

    function showMenu() {
      clearTimer(); stopRoll(); answered = false; mode = null; last = null; view = 'menu'; persist();
      body.innerHTML = `<div class="cq-menu"><div class="cq-menu-head"><span aria-hidden="true">🌍</span><h2>${tr('menu.title')}</h2><p>${tr('menu.sub')}</p></div>${MODES.map((m) => {
        const best = services.storage.get<number>(bestKey(m), 0);
        return `<button type="button" class="cq-mode" data-mode="${m}" style="--accent:${MODE_ACCENT[m]}"><span class="cq-mode-icon" aria-hidden="true">${MODE_ICON[m]}</span><span class="cq-mode-text"><strong>${tr(`mode.${m}.name`)}</strong><span>${tr(`mode.${m}.blurb`)}</span></span><span class="cq-best${best ? '' : ' is-new'}"><small>${tr('menu.best')}</small><b>${best ? fmt(best) : tr('menu.notYet')}</b></span></button>`;
      }).join('')}<p class="cq-rules">${tr('menu.rules', { a: BASE_POINTS[1], b: BASE_POINTS[2], c: BASE_POINTS[3] })}</p></div>`;
    }

    function start(m: Mode) {
      clearTimer(); stopRoll(); mode = m; round = buildRound(services.random, poolFor(m), m); index = 0; score = 0; streak = 0; correct = 0; missed = []; results = []; paused = false; last = null;
      services.reportScore(0); persist(); showQuestion();
    }

    function card(q: Question, m: Mode, pop: boolean) {
      const e = q.entry, pts = BASE_POINTS[e.difficulty], cls = `cq-card${pop ? ' pop' : ''}`;
      const diff = `<span class="cq-diff" aria-label="${tr('diff.aria', { name: tr(`diff.${e.difficulty}`), pts })}">${STARS[e.difficulty]} <span>${tr('diff.pts', { pts })}</span></span>`;
      if (m === 'flag') return `<div class="${cls}" style="--region:${MODE_ACCENT.flag}">${diff}<span class="cq-flag is-hero" role="img" aria-label="${tr('card.flagAria')}">${flagEmoji(e.iso)}</span><p data-prompt>${tr('prompt.flag')}</p></div>`;
      if (m === 'shape') return `<div class="${cls}" style="--region:${MODE_ACCENT.shape}">${diff}<span class="cq-globe"><svg class="cq-shape" viewBox="0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}" role="img" aria-label="${tr('card.shapeAria')}"><defs><linearGradient id="cq-land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BFFD9"/><stop offset="1" stop-color="#3FBF9A"/></linearGradient></defs><path d="${(e as ShapeEntry).path}" fill="url(#cq-land)" stroke="#071712" stroke-width="1" stroke-linejoin="round"/></svg></span><p data-prompt>${tr('prompt.shape')}</p></div>`;
      return `<div class="${cls}" style="--region:${REGION_COLORS[e.region]}">${diff}<span class="cq-flag" aria-hidden="true">${flagEmoji(e.iso)}</span><h2>${countryName(e, lang)}</h2><p data-prompt>${tr('prompt.capital')}</p><span class="cq-chip">${regionName(e.region, lang)}</span></div>`;
    }

    /** Draws the current question; when it was already answered (language switch) the feedback is repainted without animation. */
    function showQuestion(pop = true) {
      clearTimer(); stopRoll(); view = 'question';
      if (pop) { answered = false; last = null; }
      const q = current(), m = mode as Mode;
      body.innerHTML = `${hud()}
        ${card(q, m, pop)}
        <div class="cq-options" role="group" aria-label="${tr(`mode.${m}.choices`)}">${q.options.map((o, i) => `<button type="button" class="cq-option" data-i="${i}">${optionLabel(o, m)}</button>`).join('')}</div>
        <p class="cq-feedback" data-fb aria-live="polite"></p><div class="cq-next-slot" data-next></div>`;
      if (!pop && answered && last) paintAnswer(q, false);
    }

    /** Marks the options and writes prompt, feedback and the next button for the answer in `last`. */
    function paintAnswer(q: Question, fresh: boolean) {
      if (!last) return;
      const { picked, right, gained, lostStreak } = last, e = q.entry, m = mode as Mode;
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('.cq-option')];
      buttons.forEach((b) => { b.disabled = true; });
      buttons[q.answerIndex].classList.add('is-right');
      buttons[picked].classList.add('is-picked');
      const fb = el<HTMLElement>('[data-fb]'), prompt = el<HTMLElement>('[data-prompt]');
      prompt.className = `is-reveal${right ? ' is-ok' : ''}`;
      prompt.textContent = m === 'capital' ? tr('reveal.capital', { name: capitalName(e, lang) }) : m === 'flag' ? countryName(e, lang) : `${flagEmoji(e.iso)} ${countryName(e, lang)}`;
      if (right) {
        const bonus = gained - BASE_POINTS[e.difficulty];
        fb.className = 'cq-feedback is-right';
        fb.innerHTML = `<strong>${tr('fb.correct', { n: gained })}</strong><small>${bonus ? tr('fb.bonus', { base: BASE_POINTS[e.difficulty], bonus, streak }) : tr('fb.plain', { diff: tr(`diff.${e.difficulty}`), base: BASE_POINTS[e.difficulty] })}</small>`;
        if (fresh) { const float = document.createElement('span'); float.className = 'cq-float'; float.setAttribute('aria-hidden', 'true'); float.textContent = `+${gained}`; buttons[picked].append(float); }
      } else {
        buttons[picked].classList.add('is-wrong');
        fb.className = 'cq-feedback is-wrong';
        fb.innerHTML = `<strong>${m === 'capital' ? tr('fb.wrongCapital', { name: capitalName(e, lang) }) : tr('fb.wrongCountry', { name: countryName(e, lang) })}</strong><small>${lostStreak >= 2 ? tr('fb.lostRun', { n: lostStreak }) : tr('fb.hint')}</small>`;
      }
      el<HTMLElement>('[data-next]').innerHTML = `<button type="button" class="cq-action" data-next-btn>${index >= ROUND_LENGTH ? tr('btn.results') : tr('btn.next')}</button>`;
    }

    function answer(i: number) {
      if (answered || paused || destroyed || !mode) return;
      const q = round[index];
      if (i < 0 || i >= q.options.length) return;
      answered = true;
      const right = i === q.answerIndex;
      const before = score, lostStreak = streak, e = q.entry;
      let gained = 0;
      if (right) {
        streak++; correct++;
        gained = pointsFor(e.difficulty, streak);
        score += gained;
        // A new streak tier gets the brighter "upgrade" cue; plain correct answers keep "success".
        services.sound.play(tierOf(streak) > tierOf(streak - 1) ? 'upgrade' : 'success');
      } else {
        streak = 0; missed.push(e.iso);
        services.sound.play('fail');
      }
      last = { picked: i, right, gained, lostStreak };
      results.push(right);
      services.reportScore(score); index++; persist();
      paintAnswer(q, true);
      updateHud(before, right, lostStreak);
      if (right) scheduleNext();
    }

    /** Update the HUD in place so the score roll and streak animations can play. */
    function updateHud(before: number, right: boolean, lostStreak: number) {
      el<HTMLElement>('[data-q]').textContent = `${index}/${ROUND_LENGTH}`;
      const bar = el<HTMLElement>('[data-segs]'); bar.innerHTML = segs(); bar.setAttribute('aria-valuenow', String(index));
      const chip = el<HTMLElement>('[data-streak]');
      chip.outerHTML = streakChip(streak, !right && lostStreak >= 2);
      if (right) {
        const box = el<HTMLElement>('[data-score-box]');
        box.classList.remove('is-bump'); void box.offsetWidth; box.classList.add('is-bump');
        roll(el<HTMLElement>('[data-score]'), before, score, 650);
        if (tierOf(streak) > tierOf(streak - 1)) el<HTMLElement>('[data-streak]').classList.add('is-up');
      }
    }

    // Long enough for the score roll and +points float to land before the next card.
    function scheduleNext() { clearTimer(); if (!paused) timer = window.setTimeout(next, 1150); }
    function next() { clearTimer(); if (!answered || destroyed) return; if (index >= ROUND_LENGTH) finish(); else showQuestion(); }

    /** A missed question is stored as its ISO code; anything else is a pre-i18n saved line shown as written. */
    const missedLine = (x: string, m: Mode) => {
      const e: CountryEntry | undefined = COUNTRIES.find((c) => c.iso === x);
      if (!e) return x;
      return m === 'capital' ? `${countryName(e, lang)} — ${capitalName(e, lang)}` : m === 'flag' ? `${flagEmoji(e.iso)} ${countryName(e, lang)}` : countryName(e, lang);
    };

    function finish() {
      stopRoll();
      const m = mode as Mode, prior = services.storage.get<number>(bestKey(m), 0), best = Math.max(prior, score);
      if (best !== prior) services.storage.set(bestKey(m), best);
      services.reportScore(score); services.reportComplete(1);
      resultInfo = { prior, newBest: score > prior };
      services.sound.play(resultInfo.newBest ? 'clear' : 'success');
      answered = true;
      showResult(true);
    }

    function showResult(fresh: boolean) {
      view = 'result';
      const m = mode as Mode, { prior, newBest } = resultInfo;
      const known = results.every((r) => r !== null);
      const base = results.reduce<number>((sum, r, i) => sum + (r ? BASE_POINTS[round[i].entry.difficulty] : 0), 0);
      let run = 0, bestRun = 0;
      for (const r of results) { run = r ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
      const max = round.reduce((sum, q, i) => sum + pointsFor(q.entry.difficulty, i + 1), 0);
      const vs = prior === 0 ? (score > 0 ? tr('vs.first', { mode: tr(`mode.${m}.short`), score: fmt(score) }) : tr('vs.none')) : newBest ? tr('vs.new', { gain: fmt(score - prior), prior: fmt(prior) }) : score === prior ? tr('vs.match', { prior: fmt(prior) }) : tr('vs.behind', { prior: fmt(prior), gap: fmt(prior - score) });
      const animate = fresh && motion;
      body.innerHTML = `${hud()}<div class="cq-result">
        <h2>${correct >= 9 ? tr(`mode.${m}.again`) : correct >= 6 ? tr('result.mid') : tr('result.low')}</h2>
        <p class="cq-result-mode">${MODE_ICON[m]} ${tr(`mode.${m}.name`)}</p>
        <div class="cq-total"><strong data-total aria-label="${tr('result.totalAria', { n: score })}">${fmt(animate ? 0 : score)}</strong><small>/ ${fmt(max)}</small></div>
        <p class="cq-vs${newBest && score > 0 ? ' is-best' : ''}">${vs}</p>
        <dl class="cq-break">
          <div><dt>${tr('result.correct')}</dt><dd>${correct}/${ROUND_LENGTH}</dd></div>
          <div><dt>${tr('result.bestStreak')}</dt><dd>${known ? `${bestRun >= 2 ? '🔥 ' : ''}${bestRun}` : '—'}</dd></div>
          <div><dt>${tr('result.base')}</dt><dd>${known ? fmt(base) : '—'}</dd></div>
          <div><dt>${tr('result.bonus')}</dt><dd>${known ? `+${fmt(score - base)}` : '—'}</dd></div>
        </dl>
        ${missed.length ? `<div class="cq-recap"><p>${tr('result.recap')}</p><ul class="cq-missed">${missed.map((x) => `<li>${missedLine(x, m)}</li>`).join('')}</ul></div>` : `<p class="cq-perfect">${tr('result.perfect')}</p>`}
        <div class="cq-result-actions"><button type="button" class="cq-action" data-again>${tr('btn.again')}</button><button type="button" class="cq-action cq-secondary" data-menu>${tr('btn.menu')}</button></div></div>`;
      if (animate) roll(el<HTMLElement>('[data-total]'), 0, score, 900);
    }

    /** Switch language and repaint the current screen; round, score and streak are untouched. */
    function setLang(l: Lang) {
      if (l === lang) return;
      lang = l; services.storage.set(LANG_KEY, l); paintLangBar();
      if (view === 'menu') showMenu();
      else if (view === 'question') showQuestion(false);
      else showResult(false);
    }

    /** Replays the current mode, or returns to the menu when none is chosen. */
    function restart() { paused = false; if (mode) start(mode); else showMenu(); }

    root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('button'); if (!t) return;
      if (t.dataset.lang !== undefined && isLang(t.dataset.lang)) { setLang(t.dataset.lang); return; }
      if (paused) return;
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

    paintLangBar();
    if (mode) showQuestion(); else showMenu();
    return {
      pause() { paused = true; clearTimer(); },
      resume() { paused = false; if (answered && index < ROUND_LENGTH && root.querySelector('.cq-feedback.is-right')) scheduleNext(); },
      restart,
      destroy() { destroyed = true; clearTimer(); stopRoll(); host.removeEventListener('keydown', onKey); host.replaceChildren(); }
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
  const correct = num(s.correct);
  // Per-question results only drive the progress strip and result breakdown; older saves lack them, so mark those answers unknown.
  const results: Result[] = Array.isArray(s.results) && s.results.length === s.index && s.results.every((r) => typeof r === 'boolean') && s.results.filter(Boolean).length === correct
    ? s.results : Array.from({ length: s.index }, () => null);
  return { mode, round, index: s.index, score: num(s.score), streak: num(s.streak), correct, missed: Array.isArray(s.missed) ? s.missed.filter((m) => typeof m === 'string') : [], results };
}

export { game };
export default game;
