import { registerSW } from 'virtual:pwa-register';
import { catalog, categoryLabels, findGame, gameLoader, loadGame } from './core/catalog';
import { createShellServices } from './core/services';
import type { GameController, GameMeta } from './core/game-types';
import './styles/app.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing application root');
const appRoot: HTMLElement = root;
const redirectedPath = sessionStorage.getItem('integ-games:redirect');
if (redirectedPath) {
  sessionStorage.removeItem('integ-games:redirect');
  history.replaceState({}, '', redirectedPath);
}
const shell = createShellServices();
let controller: GameController | undefined;
let viewToken = 0;

function href(path = ''): string { return `${import.meta.env.BASE_URL}${path}`.replace(/(?<!:)\/+/g, '/'); }
function route(): string { return location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/'; }
function navigate(path: string) { history.pushState({}, '', href(path.replace(/^\//, ''))); void render(); }

function layout(content: string): string {
  return `<main class="app-shell"><header class="site-header"><a class="brand" href="${href()}" data-route>INTEG <span>GAMES</span></a><button class="icon-button" data-action="mute" aria-label="${shell.getMuted() ? 'Enable sound' : 'Mute sound'}">${shell.getMuted() ? '◌' : '♪'}</button></header>${content}</main>`;
}

function home(): string {
  const recent = shell.recentlyPlayed().map(findGame).filter((item): item is GameMeta => Boolean(item));
  const featured = catalog[0];
  return layout(`
    <section class="hero"><div><p class="eyebrow">Small games, properly made</p><h1>Pick a bright little<br><em>world</em> to enter.</h1><p class="hero-copy">Twenty original browser games, made for a two-minute break or a very long train ride.</p><a class="primary-button" href="${href(`play/${featured.slug}`)}" data-route>Play ${featured.title} <span>→</span></a></div><div class="hero-orb" aria-hidden="true"><span>2048</span></div></section>
    ${recent.length ? `<section class="section"><div class="section-heading"><h2>Continue playing</h2></div><div class="game-rail">${recent.map(card).join('')}</div></section>` : ''}
    <section class="section"><div class="section-heading"><div><p class="eyebrow">The arcade</p><h2>All games</h2></div><label class="search"><span>⌕</span><input type="search" data-search placeholder="Find a game" aria-label="Find a game" /></label></div><div class="filters" role="group" aria-label="Filter games"><button class="filter is-active" data-filter="all">All</button>${Object.entries(categoryLabels).map(([key, label]) => `<button class="filter" data-filter="${key}">${label}</button>`).join('')}</div><div class="games-grid" data-grid>${catalog.map(card).join('')}</div></section>`);
}

function card(game: GameMeta): string {
  const best = shell.bestScore(game.slug);
  const available = Boolean(gameLoader(game.slug));
  return `<article class="game-card" data-game-card data-category="${game.category}" data-title="${game.title.toLowerCase()}"><a href="${href(`play/${game.slug}`)}" data-route aria-label="Play ${game.title}"><div class="cover" style="--accent:${game.accent}"><span>${coverGlyph(game.slug)}</span>${!available ? '<small>Loading soon</small>' : ''}</div><div class="card-info"><p>${game.mechanic}</p><h3>${game.title}</h3><span>${best ? `Best ${best.toLocaleString()}` : 'New game'}</span></div></a></article>`;
}

function coverGlyph(slug: string): string {
  const glyphs: Record<string, string> = { 'merge-2048': '2×2', 'block-drop': '▦', snake: '〰', mines: '✦', solitaire: '♠', sudoku: '9', 'word-grid': 'ABC', memory: '◒', stack: '▤', flap: '◓', breakout: '▰', invaders: '⌁', runner: '↗', platformer: '⌂', drive: '◉', 'fruit-merge': '◍', bubble: '●', 'hex-puzzle': '⬡', knife: '✣', arena: '✹' };
  return glyphs[slug] ?? '•';
}

async function gamePage(slug: string, token: number): Promise<void> {
  const game = findGame(slug);
  if (!game) { appRoot.innerHTML = layout(notFound()); return; }
  const related = catalog.filter((item) => item.category === game.category && item.slug !== game.slug).slice(0, 3);
  appRoot.innerHTML = layout(`<section class="play-page"><a class="back-link" href="${href()}" data-route>← All games</a><div class="game-title"><div><p class="eyebrow">${categoryLabels[game.category]}</p><h1>${game.title}</h1><p>${game.description}</p></div><div class="play-actions"><button class="secondary-button" data-action="help">How to play</button><button class="secondary-button" data-action="restart">Restart</button><button class="primary-button" data-action="pause">Pause</button></div></div><div class="stage-wrap"><div class="game-stage" data-stage aria-busy="true"><span class="stage-loading">Loading game…</span></div><div class="pause-overlay" data-overlay hidden><p>Paused</p><button class="primary-button" data-action="resume">Resume</button><button class="secondary-button" data-action="restart">Restart</button></div></div><aside class="help-sheet" data-help hidden><button class="close-button" data-action="help" aria-label="Close help">×</button><p class="eyebrow">How to play</p><h2>${game.title}</h2><p>${game.instructions}</p></aside>${related.length ? `<section class="related"><h2>Keep exploring</h2><div class="game-rail">${related.map(card).join('')}</div></section>` : ''}</section>`);
  const stage = appRoot.querySelector<HTMLElement>('[data-stage]');
  if (!stage || !gameLoader(slug)) {
    if (stage) stage.innerHTML = '<p class="stage-message">This game is on its way. Pick another cabinet while it arrives.</p>';
    return;
  }
  try {
    const module = await loadGame(slug);
    if (token !== viewToken) return;
    controller = module.mount(stage, shell.createGameServices(slug, {
      score: () => { /* score is written by the service; cards read it on next render */ },
      complete: () => { /* individual games own their completion treatment */ }
    }));
    shell.recordRecent(slug);
    stage.removeAttribute('aria-busy');
  } catch (error) {
    console.error(error);
    stage.innerHTML = '<p class="stage-message">This cabinet could not start. Please refresh and try again.</p>';
  }
}

function notFound(): string { return '<section class="not-found"><p class="eyebrow">404</p><h1>That cabinet is elsewhere.</h1><a class="primary-button" href="' + href() + '" data-route>Back to arcade</a></section>'; }

async function render(): Promise<void> {
  controller?.destroy(); controller = undefined;
  const token = ++viewToken;
  const current = route();
  if (current === '/' || current === '') appRoot.innerHTML = home();
  else if (current.startsWith('/play/')) await gamePage(decodeURIComponent(current.slice('/play/'.length)), token);
  else appRoot.innerHTML = layout(notFound());
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-route], [data-action], [data-filter]') : null;
  if (!target) return;
  if (target.hasAttribute('data-route')) { event.preventDefault(); navigate(new URL((target as HTMLAnchorElement).href).pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '')); return; }
  const action = target.dataset.action;
  if (action === 'mute') { shell.setMuted(!shell.getMuted()); void render(); }
  if (action === 'pause') { controller?.pause(); togglePause(true); }
  if (action === 'resume') { controller?.resume(); togglePause(false); }
  if (action === 'restart') controller?.restart();
  if (action === 'help') { const help = appRoot.querySelector<HTMLElement>('[data-help]'); if (help) help.hidden = !help.hidden; }
  const filter = target.dataset.filter;
  if (filter) filterGames(filter, '');
});

document.addEventListener('input', (event) => {
  const input = event.target instanceof HTMLInputElement && event.target.matches('[data-search]') ? event.target : null;
  if (input) filterGames('all', input.value);
});
window.addEventListener('popstate', () => void render());
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && controller) { controller.pause(); togglePause(true); } });

function togglePause(show: boolean) { const overlay = appRoot.querySelector<HTMLElement>('[data-overlay]'); if (overlay) overlay.hidden = !show; }
function filterGames(category: string, query: string) {
  const selected = appRoot.querySelector<HTMLElement>(`[data-filter="${category}"]`);
  appRoot.querySelectorAll<HTMLElement>('[data-filter]').forEach((button) => button.classList.toggle('is-active', button === selected));
  appRoot.querySelectorAll<HTMLElement>('[data-game-card]').forEach((item) => { item.hidden = !((category === 'all' || item.dataset.category === category) && item.dataset.title?.includes(query.trim().toLowerCase())); });
}

registerSW({ onNeedRefresh() { document.documentElement.dataset.updateReady = 'true'; } });
void render();
