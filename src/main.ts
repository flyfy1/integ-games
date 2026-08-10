import { registerSW } from 'virtual:pwa-register';
import { catalog, categoryInfo, categoryLabels, findGame, gameLoader, gamesInCategory, isGameCategory, loadGame, recommendationsFor } from './core/catalog';
import { createShellServices } from './core/services';
import { consumeLoginResult, currentPlayer, leaderboard, loadPlayer, login, logout, submitScore } from './core/online';
import type { GameCatalogEntry, GameCategory, GameController } from './core/game-types';
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
const continuousGames = new Set(['block-drop', 'snake', 'stack', 'flap', 'breakout', 'invaders', 'runner', 'platformer', 'drive', 'fruit-merge', 'bubble', 'knife', 'arena']);
let activeSlug: string | undefined;
let pendingStart: (() => Promise<void>) | undefined;
let immersiveStage: HTMLElement | undefined;
const loginError = consumeLoginResult();

function href(path = ''): string { return `${import.meta.env.BASE_URL}${path}`.replace(/(?<!:)\/+/g, '/'); }
function route(): string { return location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/'; }
function navigate(path: string) { history.pushState({}, '', href(path.replace(/^\//, ''))); void render(); }
function selectedCategory(): GameCategory | undefined {
  const value = new URLSearchParams(location.search).get('category');
  return isGameCategory(value) ? value : undefined;
}
function categoryHref(category?: GameCategory): string { return href(category ? `?category=${category}` : ''); }

function layout(content: string): string {
  const player = currentPlayer();
  return `<main class="app-shell"><header class="site-header"><a class="brand" href="${href()}" data-route>INTEG <span>GAMES</span></a><div class="header-actions">${player ? `<span class="player-name">${escapeHTML(player.name)}</span><button class="account-button" data-action="logout">Log out</button>` : '<button class="account-button" data-action="login">Log in</button>'}<button class="icon-button" data-action="mute" aria-label="${shell.getMuted() ? 'Enable sound' : 'Mute sound'}">${shell.getMuted() ? '◌' : '♪'}</button></div></header>${loginError ? `<p class="auth-notice" role="alert">${escapeHTML(loginError)}</p>` : ''}${content}</main>`;
}

function home(): string {
  const category = selectedCategory();
  const visibleGames = category ? gamesInCategory(category) : catalog;
  const heading = category ? categoryInfo[category] : { label: 'All games', promise: 'Twenty bright little worlds, ready whenever you are.' };
  const recent = shell.recentlyPlayed().map(findGame).filter((item): item is GameCatalogEntry => Boolean(item));
  const featured = catalog[0];
  return layout(`
    <section class="hero"><div><p class="eyebrow">Small games, properly made</p><h1>Pick a bright little<br><em>world</em> to enter.</h1><p class="hero-copy">Twenty original browser games, made for a two-minute break or a very long train ride.</p><a class="primary-button" href="${href(`play/${featured.slug}`)}" data-route>Play ${featured.title} <span>→</span></a></div><div class="hero-orb" aria-hidden="true"><span>2048</span></div></section>
    ${recent.length ? `<section class="section"><div class="section-heading"><h2>Continue playing</h2></div><div class="game-rail">${recent.map(card).join('')}</div></section>` : ''}
    <section class="section leaderboard-section"><div class="section-heading"><div><p class="eyebrow">Across the arcade</p><h2>Overall leaderboard</h2><p class="category-promise">Each player's best score from every game, added together.</p></div></div><ol class="leaderboard" data-leaderboard><li class="leaderboard-empty">Loading the standings…</li></ol></section>
    <section class="section"><div class="section-heading"><div><p class="eyebrow">The arcade</p><h2 data-category-heading>${heading.label}</h2><p class="category-promise" data-category-promise>${heading.promise}</p></div><label class="search"><span>⌕</span><input type="search" data-search placeholder="Search ${heading.label.toLowerCase()}" aria-label="Search ${heading.label}" /></label></div><div class="filters" role="group" aria-label="Filter games"><button class="filter${category ? '' : ' is-active'}" data-filter="all" aria-pressed="${!category}">All <span>${catalog.length}</span></button>${Object.entries(categoryInfo).map(([key, info]) => { const categoryKey = key as GameCategory; return `<button class="filter${category === categoryKey ? ' is-active' : ''}" data-filter="${categoryKey}" aria-pressed="${category === categoryKey}">${info.label} <span>${gamesInCategory(categoryKey).length}</span></button>`; }).join('')}</div><p class="results-status" data-results aria-live="polite">${resultMessage(visibleGames.length, heading.label)}</p><div class="games-grid" data-grid>${visibleGames.map(card).join('')}</div><div class="empty-state" data-empty hidden><h3>No games matched</h3><p>Try another search term or browse a different category.</p></div></section>`);
}

function escapeHTML(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!); }
async function hydrateLeaderboard(): Promise<void> {
  const list = appRoot.querySelector<HTMLOListElement>('[data-leaderboard]');
  if (!list) return;
  const entries = await leaderboard();
  if (!list.isConnected) return;
  list.innerHTML = entries.length ? entries.slice(0, 10).map((entry, index) => `<li><span class="rank">${index + 1}</span><strong>${escapeHTML(entry.name)}</strong><span>${entry.games} games</span><b>${entry.score.toLocaleString()}</b></li>`).join('') : `<li class="leaderboard-empty">No scores yet. ${currentPlayer() ? 'Play a game to take the first spot.' : 'Log in and play to join the board.'}</li>`;
}

function card(game: GameCatalogEntry): string {
  const best = shell.bestScore(game.slug);
  const available = Boolean(gameLoader(game.slug));
  const searchable = `${game.title} ${game.description} ${game.mechanic} ${game.traits.join(' ')}`.toLowerCase();
  return `<article class="game-card" data-game-card data-title="${searchable}"><a href="${href(`play/${game.slug}`)}" data-route aria-label="Play ${game.title}, ${categoryLabels[game.primaryCategory]}"><div class="cover" style="--accent:${game.accent}"><img class="cover-image" src="${gameArt(game.slug, 'cover')}" width="640" height="360" loading="lazy" decoding="async" alt="${game.title} gameplay screenshot" /><span class="cover-glyph" aria-hidden="true">${coverGlyph(game.slug)}</span>${!available ? '<small>Loading soon</small>' : ''}</div><div class="card-info"><p class="card-category">${categoryLabels[game.primaryCategory]}</p><h3>${game.title}</h3><div class="trait-chips">${traitChips(game)}</div><p class="card-mechanic">${game.mechanic}</p><span>${best ? `Best ${best.toLocaleString()}` : 'New game'}</span></div></a></article>`;
}

function traitChips(game: GameCatalogEntry): string { return game.traits.map((trait) => `<span class="trait-chip">${trait}</span>`).join(''); }
function resultMessage(count: number, label: string): string { return `${count} ${count === 1 ? 'game' : 'games'} in ${label}`; }

function coverGlyph(slug: string): string {
  const glyphs: Record<string, string> = { 'merge-2048': '2×2', 'block-drop': '▦', snake: '〰', mines: '✦', solitaire: '♠', sudoku: '9', 'word-grid': 'ABC', memory: '◒', stack: '▤', flap: '◓', breakout: '▰', invaders: '⌁', runner: '↗', platformer: '⌂', drive: '◉', 'fruit-merge': '◍', bubble: '●', 'hex-puzzle': '⬡', knife: '✣', arena: '✹' };
  return glyphs[slug] ?? '•';
}
function gameArt(slug: string, kind: 'cover' | 'icon'): string { return href(`game-art/${slug}-${kind}.jpg`); }
type WebkitFullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type WebkitFullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void | Promise<void> };
function isMobilePlay(): boolean { return innerWidth < 900 || matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0; }
async function enterImmersive(stage: HTMLElement): Promise<void> {
  immersiveStage = stage;
  stage.classList.add('is-immersive');
  document.documentElement.classList.add('game-immersive');
  const webkitStage = stage as WebkitFullscreenElement;
  try {
    if (stage.requestFullscreen) await stage.requestFullscreen({ navigationUI: 'hide' });
    else if (webkitStage.webkitRequestFullscreen) await webkitStage.webkitRequestFullscreen();
  } catch { /* CSS immersive mode remains available when native fullscreen is blocked. */ }
}
async function exitImmersive(): Promise<void> {
  immersiveStage?.classList.remove('is-immersive');
  immersiveStage = undefined;
  document.documentElement.classList.remove('game-immersive');
  const webkitDocument = document as WebkitFullscreenDocument;
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (webkitDocument.webkitFullscreenElement && webkitDocument.webkitExitFullscreen) await webkitDocument.webkitExitFullscreen();
  } catch { /* leaving CSS immersive mode is sufficient */ }
}

async function gamePage(slug: string, token: number): Promise<void> {
  const game = findGame(slug);
  if (!game) { appRoot.innerHTML = layout(notFound()); return; }
  const recommended = recommendationsFor(game);
  appRoot.innerHTML = layout(`<section class="play-page"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="${href()}" data-route>All games</a><span aria-hidden="true">/</span><a href="${categoryHref(game.primaryCategory)}" data-route>${categoryLabels[game.primaryCategory]}</a><span aria-hidden="true">/</span><span aria-current="page">${game.title}</span></nav><div class="game-title"><div><div class="game-kicker"><p class="eyebrow">${categoryLabels[game.primaryCategory]}</p><div class="trait-chips">${traitChips(game)}</div></div><div class="game-heading"><img class="game-logo" src="${gameArt(game.slug, 'icon')}" width="96" height="96" decoding="async" alt="" /><h1>${game.title}</h1></div><p>${game.description}</p></div><div class="play-actions"><button class="secondary-button" data-action="share">Share</button><button class="secondary-button" data-action="help">How to play</button><button class="secondary-button" data-action="restart">Restart</button><button class="primary-button" data-action="pause">Pause</button></div></div><div class="stage-wrap"><div class="game-stage" data-stage aria-busy="true"><span class="stage-loading">Loading game…</span></div><div class="pause-overlay" data-overlay hidden><p>Paused</p><button class="primary-button" data-action="resume">Resume</button><button class="secondary-button" data-action="restart">Restart</button></div></div><p class="share-status" data-share-status role="status" aria-live="polite"></p><aside class="help-sheet" data-help hidden><button class="close-button" data-action="help" aria-label="Close help">×</button><p class="eyebrow">How to play</p><h2>${game.title}</h2><p>${game.instructions}</p></aside><section class="related" aria-labelledby="recommended-heading"><p class="eyebrow">Curated for this cabinet</p><h2 id="recommended-heading">Recommended next</h2><p class="recommended-copy">Try a close mechanical cousin first, then branch into a useful new challenge.</p><div class="game-rail">${recommended.map(card).join('')}</div></section><integ-comments project-key="pk_games_web_v1_7b4e1a" resource="game:${game.slug}"></integ-comments></section>`);
  const stage = appRoot.querySelector<HTMLElement>('[data-stage]');
  if (!stage || !gameLoader(slug)) {
    if (stage) stage.innerHTML = '<p class="stage-message">This game is on its way. Pick another cabinet while it arrives.</p>';
    return;
  }
  try {
    const module = await loadGame(slug);
    if (token !== viewToken) return;
    activeSlug = slug;
    const mountGame = () => { controller = module.mount(stage, shell.createGameServices(slug, {
      score: (score) => { void submitScore(slug, score); },
      complete: () => { /* individual games own their completion treatment */ }
    })); if (stage.classList.contains('is-immersive')) stage.insertAdjacentHTML('beforeend', '<button class="immersive-exit" data-action="exit-fullscreen" aria-label="Exit full screen">×</button>'); shell.recordRecent(slug); stage.removeAttribute('aria-busy'); };
    const mobileStart = isMobilePlay();
    if (mobileStart) {
      stage.removeAttribute('aria-busy');
      stage.innerHTML = `<div class="start-screen"><img src="${gameArt(slug, 'icon')}" width="96" height="96" alt="" /><h2>${game.title}</h2><p>Play in full screen for the best controls.</p><button class="primary-button" data-action="start-game">Start game</button></div>`;
      pendingStart = async () => { pendingStart = undefined; await enterImmersive(stage); stage.innerHTML = ''; mountGame(); };
    } else mountGame();
  } catch (error) {
    console.error(error);
    stage.innerHTML = '<p class="stage-message">This cabinet could not start. Please refresh and try again.</p>';
  }
}

function notFound(): string { return '<section class="not-found"><p class="eyebrow">404</p><h1>That cabinet is elsewhere.</h1><a class="primary-button" href="' + href() + '" data-route>Back to arcade</a></section>'; }

async function render(): Promise<void> {
  shell.stopActiveSound(); controller?.destroy(); controller = undefined; activeSlug = undefined;
  void exitImmersive();
  pendingStart = undefined;
  const token = ++viewToken;
  const current = route();
  if (current === '/' || current === '') { appRoot.innerHTML = home(); void hydrateLeaderboard(); }
  else if (current.startsWith('/play/')) await gamePage(decodeURIComponent(current.slice('/play/'.length)), token);
  else appRoot.innerHTML = layout(notFound());
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-route], [data-action], [data-filter]') : null;
  if (!target) return;
  if (target.hasAttribute('data-route')) {
    event.preventDefault();
    const destination = new URL((target as HTMLAnchorElement).href);
    navigate(`${destination.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '')}${destination.search}`);
    return;
  }
  const action = target.dataset.action;
  if (action === 'mute') { shell.setMuted(!shell.getMuted()); void render(); }
  if (action === 'login') login();
  if (action === 'logout') { void logout().then(() => render()); }
  if (action === 'start-game') void pendingStart?.();
  if (action === 'exit-fullscreen') void exitImmersive();
  if (action === 'share') void shareCurrentGame();
  if (action === 'pause') { controller?.pause(); shell.stopActiveSound(); togglePause(true); }
  if (action === 'resume') { controller?.resume(); togglePause(false); }
  if (action === 'restart') { controller?.restart(); appRoot.querySelector<HTMLElement>('[data-stage]')?.dispatchEvent(new Event('integ:clear-controls')); togglePause(false); }
  if (action === 'help') { const help = appRoot.querySelector<HTMLElement>('[data-help]'); if (help) help.hidden = !help.hidden; }
  const filter = target.dataset.filter;
  if (filter) navigate(filter === 'all' ? '' : `?category=${filter}`);
});

document.addEventListener('error', (event) => {
  const image = event.target instanceof HTMLImageElement ? event.target : null;
  if (!image) return;
  if (image.classList.contains('cover-image')) image.closest<HTMLElement>('.cover')?.classList.add('is-art-fallback');
  if (image.classList.contains('game-logo')) image.hidden = true;
}, true);

document.addEventListener('input', (event) => {
  const input = event.target instanceof HTMLInputElement && event.target.matches('[data-search]') ? event.target : null;
  if (input) filterGames(input.value);
});
window.addEventListener('popstate', () => void render());
const pauseActiveGame = () => { if (controller && activeSlug && continuousGames.has(activeSlug)) { controller.pause(); shell.stopActiveSound(); togglePause(true); } };
appRoot.addEventListener('integ:pause-request', pauseActiveGame);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && controller) { controller.pause(); togglePause(true); } });
window.addEventListener('blur', pauseActiveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseActiveGame(); });

function togglePause(show: boolean) { const overlay = appRoot.querySelector<HTMLElement>('[data-overlay]'); if (overlay) overlay.hidden = !show; }
async function shareCurrentGame(): Promise<void> {
  const game = activeSlug ? findGame(activeSlug) : undefined;
  if (!game) return;
  const data = { title: `${game.title} · Integ Games`, text: `Play ${game.title} with me on Integ Games.`, url: location.href };
  const status = appRoot.querySelector<HTMLElement>('[data-share-status]');
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); if (status) status.textContent = 'Game link copied.'; }
  } catch (error) { if ((error as DOMException).name !== 'AbortError' && status) status.textContent = 'Could not share this link.'; }
}
function filterGames(query: string) {
  const normalized = query.trim().toLowerCase();
  const cards = [...appRoot.querySelectorAll<HTMLElement>('[data-game-card]')];
  const visible = cards.filter((item) => item.dataset.title?.includes(normalized));
  cards.forEach((item) => { item.hidden = !visible.includes(item); });
  const category = selectedCategory();
  const label = category ? categoryLabels[category] : 'All games';
  const result = appRoot.querySelector<HTMLElement>('[data-results]');
  if (result) result.textContent = resultMessage(visible.length, label);
  const empty = appRoot.querySelector<HTMLElement>('[data-empty]');
  if (empty) empty.hidden = visible.length !== 0;
}

const updateSW = registerSW({ immediate: true, onNeedRefresh() { document.documentElement.dataset.updateReady = 'true'; void updateSW(true); } });
void loadPlayer().then(() => render());
