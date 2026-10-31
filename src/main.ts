import { registerSW } from 'virtual:pwa-register';
import { catalog, categoryInfo, categoryLabels, findGame, gameLoader, gamesInCategory, isGameCategory, loadGame, recommendationsFor } from './core/catalog';
import { createShellServices } from './core/services';
import { consumeLoginResult, currentPlayer, leaderboard, loadPlayer, login, logout, submitScore } from './core/online';
import type { GameCatalogEntry, GameCategory, GameController } from './core/game-types';
import { createGamepadBridge, type GamepadBridge } from './games/_shared/gamepad-bridge';
import './styles/app.css';
import '@integ-life/ui/static';
import '@integ-life/ui/styles.css';
import './styles/shared-layout.css';
import { startAnalytics } from './analytics';

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
let gamepad: GamepadBridge | undefined;
let viewToken = 0;
let paused = false;
let updateReady = false;
const siteOrigin = 'https://games.integ.life';
let activeSlug: string | undefined;
let pendingStart: (() => Promise<void>) | undefined;
let immersiveStage: HTMLElement | undefined;
const loginError = consumeLoginResult();
startAnalytics();

function href(path = ''): string { return `${import.meta.env.BASE_URL}${path}`.replace(/(?<!:)\/+/g, '/'); }
function route(): string {
  const path = location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
function navigate(path: string) { history.pushState({}, '', href(path.replace(/^\//, ''))); void render(); }
function selectedCategory(): GameCategory | undefined {
  const value = new URLSearchParams(location.search).get('category');
  return isGameCategory(value) ? value : undefined;
}
function categoryHref(category?: GameCategory): string { return href(category ? `?category=${category}` : ''); }

function setMetaContent(selector: string, value: string): void {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value);
}

function applyPageMetadata(game?: GameCatalogEntry): void {
  const title = game ? `${game.title} · Integ Games` : 'Integ Games';
  const description = game ? game.description : 'Twenty-three original browser games made for any screen.';
  const path = game ? `/play/${game.slug}/` : '/';
  const url = new URL(path, siteOrigin).href;
  const image = new URL(game ? `/game-art/${game.slug}-cover.jpg` : '/game-art/merge-2048-cover.jpg', siteOrigin).href;
  document.title = title;
  document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', url);
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[property="og:image"]', image);
  setMetaContent('meta[property="og:image:alt"]', game ? `${game.title} gameplay screenshot` : 'Integ Games arcade preview');
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
  setMetaContent('meta[name="twitter:image"]', image);
}

function layout(content: string): string {
  const player = currentPlayer();
  return `<integ-family-bar product="games" home-href="${href()}" default-theme="dark"><div data-il-actions>${player ? `<details class="game-account-menu"><summary class="il-control" aria-label="Account" title="Account"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></summary><div><strong>${escapeHTML(player.name)}</strong><button class="il-control" data-action="logout">Log out</button></div></details>` : '<button class="il-control" data-il-compact="account" aria-label="Log in" title="Log in" data-action="login">Log in</button>'}<button class="il-control" data-action="mute" aria-pressed="${shell.getMuted()}" aria-label="${shell.getMuted() ? 'Enable sound' : 'Mute sound'}">${shell.getMuted() ? '◌' : '♪'}</button></div></integ-family-bar><main class="app-shell">${loginError ? `<p class="auth-notice" role="alert">${escapeHTML(loginError)}</p>` : ''}${content}</main>`;
}

function home(): string {
  const category = selectedCategory();
  const visibleGames = category ? gamesInCategory(category) : catalog;
  const heading = category ? categoryInfo[category] : { label: 'All games', promise: 'Twenty-three bright little worlds, ready whenever you are.' };
  const recent = shell.recentlyPlayed().map(findGame).filter((item): item is GameCatalogEntry => Boolean(item));
  const featured = catalog[0];
  return layout(`
    <section class="hero"><div><p class="eyebrow">Small games, properly made</p><h1>Pick a bright little<br><em>world</em> to enter.</h1><p class="hero-copy">Twenty-three original browser games, made for a two-minute break or a very long train ride.</p><a class="primary-button" href="${href(`play/${featured.slug}/`)}" data-route>Play ${featured.title} <span>→</span></a></div><div class="hero-orb" aria-hidden="true"><span>2048</span></div></section>
    ${recent.length ? `<section class="section"><div class="section-heading"><h2>Continue playing</h2></div><div class="game-rail">${recent.map(card).join('')}</div></section>` : ''}
    <section class="section leaderboard-section"><div class="section-heading"><div><p class="eyebrow">Across the arcade</p><h2>Overall leaderboard</h2><p class="category-promise">Each player's best score from every game, added together.</p></div></div><ol class="leaderboard" data-leaderboard aria-live="polite"><li class="leaderboard-empty">Loading the standings…</li></ol></section>
    <section class="section"><div class="section-heading"><div><p class="eyebrow">The arcade</p><h2 data-category-heading>${heading.label}</h2><p class="category-promise" data-category-promise>${heading.promise}</p></div><label class="search"><span>⌕</span><input type="search" data-search placeholder="Search ${heading.label.toLowerCase()}" aria-label="Search ${heading.label}" /></label></div><div class="filters" role="group" aria-label="Filter games"><button class="filter${category ? '' : ' is-active'}" data-filter="all" aria-pressed="${!category}">All <span>${catalog.length}</span></button>${Object.entries(categoryInfo).map(([key, info]) => { const categoryKey = key as GameCategory; return `<button class="filter${category === categoryKey ? ' is-active' : ''}" data-filter="${categoryKey}" aria-pressed="${category === categoryKey}">${info.label} <span>${gamesInCategory(categoryKey).length}</span></button>`; }).join('')}</div><p class="results-status" data-results aria-live="polite">${resultMessage(visibleGames.length, heading.label)}</p><div class="games-grid" data-grid>${visibleGames.map(card).join('')}</div><div class="empty-state" data-empty hidden><h3>No games matched</h3><p>Try another search term or browse a different category.</p></div></section>`);
}

function escapeHTML(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!); }
async function hydrateLeaderboard(): Promise<void> {
  const list = appRoot.querySelector<HTMLOListElement>('[data-leaderboard]');
  if (!list || list.getAttribute('aria-busy') === 'true') return;
  list.innerHTML = '<li class="leaderboard-empty">Loading the standings…</li>';
  list.setAttribute('aria-busy', 'true');
  try {
    const entries = await leaderboard();
    if (!list.isConnected) return;
    list.innerHTML = entries.length ? entries.slice(0, 10).map((entry, index) => `<li><span class="rank">${index + 1}</span><strong>${escapeHTML(entry.name)}</strong><span>${entry.games} games</span><b>${entry.score.toLocaleString()}</b></li>`).join('') : `<li class="leaderboard-empty">No scores yet. ${currentPlayer() ? 'Play a game to take the first spot.' : 'Log in and play to join the board.'}</li>`;
  } catch {
    if (!list.isConnected) return;
    list.innerHTML = '<li class="leaderboard-empty">Leaderboard is temporarily unavailable. <button class="secondary-button" data-action="retry-leaderboard">Retry</button></li>';
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

function card(game: GameCatalogEntry): string {
  const best = shell.bestScore(game.slug);
  const available = Boolean(gameLoader(game.slug));
  const searchable = `${game.title} ${game.description} ${game.mechanic} ${game.traits.join(' ')}`.toLowerCase();
  return `<article class="game-card" data-game-card data-title="${searchable}"><a href="${href(`play/${game.slug}/`)}" data-route aria-label="Play ${game.title}, ${categoryLabels[game.primaryCategory]}"><div class="cover" style="--accent:${game.accent}"><img class="cover-image" src="${gameArt(game.slug, 'cover')}" width="640" height="360" loading="lazy" decoding="async" alt="${game.title} gameplay screenshot" /><span class="cover-glyph" aria-hidden="true">${coverGlyph(game.slug)}</span>${!available ? '<small>Loading soon</small>' : ''}</div><div class="card-info"><p class="card-category">${categoryLabels[game.primaryCategory]}</p><h3>${game.title}</h3><div class="trait-chips">${traitChips(game)}</div><p class="card-mechanic">${game.mechanic}</p><span>${best ? `Best ${best.toLocaleString()}` : 'New game'}</span></div></a></article>`;
}

function traitChips(game: GameCatalogEntry): string { return game.traits.map((trait) => `<span class="trait-chip">${trait}</span>`).join(''); }
function resultMessage(count: number, label: string): string { return `${count} ${count === 1 ? 'game' : 'games'} in ${label}`; }

function coverGlyph(slug: string): string {
  const glyphs: Record<string, string> = { 'merge-2048': '2×2', 'block-drop': '▦', snake: '〰', mines: '✦', solitaire: '♠', sudoku: '9', 'word-grid': 'ABC', memory: '◒', stack: '▤', flap: '◓', breakout: '▰', invaders: '⌁', runner: '↗', platformer: '⌂', drive: '◉', 'fruit-merge': '◍', bubble: '●', 'hex-puzzle': '⬡', knife: '✣', arena: '✹', 'pad-pals': '✚' };
  return glyphs[slug] ?? '•';
}
function gameArt(slug: string, kind: 'cover' | 'icon'): string { return href(`game-art/${slug}-${kind}.jpg`); }
type WebkitFullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type WebkitFullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void | Promise<void> };
function isMobilePlay(): boolean { return innerWidth < 900 || matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0; }
const landscapeGames = new Set(['ashfall', 'pad-pals']);
async function enterImmersive(stage: HTMLElement): Promise<void> {
  immersiveStage = stage;
  if (!stage.querySelector('.immersive-exit')) stage.insertAdjacentHTML('beforeend', '<button class="immersive-exit" data-action="exit-fullscreen" aria-label="Exit full screen">×</button>');
  stage.classList.add('is-immersive');
  document.documentElement.classList.add('game-immersive');
  const webkitStage = stage as WebkitFullscreenElement;
  try {
    if (stage.requestFullscreen) await stage.requestFullscreen({ navigationUI: 'hide' });
    else if (webkitStage.webkitRequestFullscreen) await webkitStage.webkitRequestFullscreen();
  } catch { /* CSS immersive mode remains available when native fullscreen is blocked. */ }
  // Wide cabinets ask for landscape; browsers that refuse (iOS) keep the portrait layout.
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (activeSlug && landscapeGames.has(activeSlug)) orientation?.lock?.('landscape').catch(() => undefined);
}
async function exitImmersive(): Promise<void> {
  immersiveStage?.classList.remove('is-immersive');
  immersiveStage?.querySelectorAll('.immersive-exit').forEach((button) => button.remove());
  try { screen.orientation?.unlock?.(); } catch { /* not locked */ }
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
  activeSlug = slug;
  const recommended = recommendationsFor(game);
  appRoot.innerHTML = layout(`<section class="play-page"><div class="play-bar"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="${href()}" data-route>All games</a><span aria-hidden="true">/</span><a href="${categoryHref(game.primaryCategory)}" data-route>${categoryLabels[game.primaryCategory]}</a><span aria-hidden="true">/</span><span aria-current="page">${game.title}</span></nav><div class="play-actions"><button class="primary-button" data-action="fullscreen" aria-label="Play in full screen">Full screen</button><button class="secondary-button" data-action="gamepad" hidden>🎮 Connect 2-in-1 receiver</button><button class="secondary-button" data-action="share">Share</button><button class="secondary-button" data-action="help">How to play</button><button class="secondary-button" data-action="restart">Restart</button><button class="secondary-button" data-action="pause">Pause</button></div></div><div class="stage-wrap"><div class="game-stage" data-stage aria-busy="true"><span class="stage-loading">Loading game…</span></div><div class="pause-overlay" data-overlay hidden><p>Paused</p><button class="primary-button" data-action="resume">Resume</button><button class="secondary-button" data-action="restart">Restart</button></div></div><div class="game-title"><div><div class="game-kicker"><p class="eyebrow">${categoryLabels[game.primaryCategory]}</p><div class="trait-chips">${traitChips(game)}</div></div><div class="game-heading"><img class="game-logo" src="${gameArt(game.slug, 'icon')}" width="96" height="96" decoding="async" alt="" /><h1>${game.title}</h1></div><p>${game.description}</p></div></div><p class="share-status" data-share-status role="status" aria-live="polite"></p><div class="share-fallback" data-share-fallback hidden><p>Copy this game link manually:</p><div class="share-link-row"><input data-share-link aria-label="Game link" readonly /><button class="primary-button" data-action="copy-share-link">Copy link</button></div><button class="share-fallback-close" data-action="close-share-fallback">Close</button></div><aside class="help-sheet" data-help hidden><button class="close-button" data-action="help" aria-label="Close help">×</button><p class="eyebrow">How to play</p><h2>${game.title}</h2><p>${game.instructions}</p></aside><section class="related" aria-labelledby="recommended-heading"><p class="eyebrow">Curated for this cabinet</p><h2 id="recommended-heading">Recommended next</h2><p class="recommended-copy">Try a close mechanical cousin first, then branch into a useful new challenge.</p><div class="game-rail">${recommended.map(card).join('')}</div></section><integ-comments project-key="pk_games_web_v1_7b4e1a" resource="game:${game.slug}"></integ-comments></section>`);
  setGameActions(false);
  const stage = appRoot.querySelector<HTMLElement>('[data-stage]');
  if (!stage || !gameLoader(slug)) {
    if (stage) stage.innerHTML = '<p class="stage-message">This game is on its way. Pick another cabinet while it arrives.</p>';
    return;
  }
  try {
    const module = await loadGame(slug);
    if (token !== viewToken) return;
    const overlay = appRoot.querySelector<HTMLElement>('[data-overlay]')!;
    const mountGame = () => { controller = module.mount(stage, shell.createGameServices(slug, {
      score: (score) => { void submitScore(slug, score); },
      complete: () => { /* individual games own their completion treatment */ }
    })); stage.append(overlay); setGameActions(true); if (document.hidden) pauseActiveGame(); if (stage.classList.contains('is-immersive') && !stage.querySelector('.immersive-exit')) stage.insertAdjacentHTML('beforeend', '<button class="immersive-exit" data-action="exit-fullscreen" aria-label="Exit full screen">×</button>'); shell.recordRecent(slug); stage.removeAttribute('aria-busy'); attachGamepad(slug, stage); };
    const mobileStart = isMobilePlay();
    if (mobileStart) {
      stage.removeAttribute('aria-busy');
      stage.innerHTML = `<div class="start-screen"><img src="${gameArt(slug, 'icon')}" width="96" height="96" alt="" /><h2>${game.title}</h2><p>Play in full screen for the best controls.</p><button class="primary-button" data-action="start-game">Start game</button></div>`;
      pendingStart = async () => { pendingStart = undefined; await enterImmersive(stage); if (token !== viewToken || !stage.isConnected) return; stage.innerHTML = ''; mountGame(); };
    } else mountGame();
  } catch (error) {
    console.error(error);
    stage.innerHTML = '<p class="stage-message">This cabinet could not start. Please refresh and try again.</p>';
  }
}

function notFound(): string { return '<section class="not-found"><p class="eyebrow">404</p><h1>That cabinet is elsewhere.</h1><a class="primary-button" href="' + href() + '" data-route>Back to arcade</a></section>'; }

async function render(): Promise<void> {
  paused = false; shell.stopActiveSound(); gamepad?.destroy(); gamepad = undefined; controller?.destroy(); controller = undefined; activeSlug = undefined;
  void exitImmersive();
  pendingStart = undefined;
  const token = ++viewToken;
  const current = route();
  if (current === '/' || current === '') { applyPageMetadata(); appRoot.innerHTML = home(); void hydrateLeaderboard(); }
  else if (current.startsWith('/play/')) { const slug = decodeURIComponent(current.slice('/play/'.length)); applyPageMetadata(findGame(slug)); await gamePage(slug, token); }
  else { applyPageMetadata(); appRoot.innerHTML = layout(notFound()); }
  showUpdatePrompt();
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
  if (action === 'retry-leaderboard') void hydrateLeaderboard();
  if (action === 'mute') {
    shell.setMuted(!shell.getMuted());
    target.textContent = shell.getMuted() ? '◌' : '♪';
    target.setAttribute('aria-pressed', String(shell.getMuted()));
    target.setAttribute('aria-label', shell.getMuted() ? 'Enable sound' : 'Mute sound');
  }
  if (action === 'update' && !activeSlug && updateReady) void updateSW(true);
  if (action === 'login') login();
  if (action === 'logout') { void logout().then(() => render()); }
  if (action === 'start-game') void pendingStart?.();
  if (action === 'exit-fullscreen') void exitImmersive();
  if (action === 'fullscreen') { const stage = appRoot.querySelector<HTMLElement>('[data-stage]'); if (stage) { if (pendingStart) void pendingStart(); else void enterImmersive(stage); } }
  if (action === 'gamepad') void gamepad?.connect().then(syncGamepadButton);
  if (action === 'share') void shareCurrentGame();
  if (action === 'copy-share-link') void copyDisplayedShareLink();
  if (action === 'close-share-fallback') hideManualShare();
  if (action === 'pause') pauseActiveGame();
  if (action === 'resume' && !document.hidden) { controller?.resume(); togglePause(false); }
  if (action === 'restart' && controller) { controller.restart(); appRoot.querySelector<HTMLElement>('[data-stage]')?.dispatchEvent(new Event('integ:clear-controls')); togglePause(false); }
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
// Leaving native fullscreen (Esc, back gesture) also leaves the CSS immersive layout.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && immersiveStage) void exitImmersive(); });
const pauseActiveGame = () => { if (controller) { if (!paused) controller.pause(); shell.stopActiveSound(); togglePause(true); } };
appRoot.addEventListener('integ:pause-request', pauseActiveGame);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') pauseActiveGame(); });
window.addEventListener('blur', pauseActiveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseActiveGame(); });

/** Pad Pals reads the controller itself; every other cabinet gets its keys from the bridge. */
function attachGamepad(slug: string, stage: HTMLElement) {
  if (slug === 'pad-pals') return;
  gamepad?.destroy();
  gamepad = createGamepadBridge({
    slug,
    target: () => stage.querySelector('canvas') ?? stage,
    isPaused: () => paused,
    togglePause: () => { if (paused) { if (!document.hidden) { controller?.resume(); togglePause(false); } } else pauseActiveGame(); },
    onChange: syncGamepadButton
  });
  syncGamepadButton();
}
function syncGamepadButton() {
  const button = appRoot.querySelector<HTMLButtonElement>('[data-action=gamepad]');
  const state = gamepad?.status();
  if (button) button.hidden = !state?.hidAvailable || state.connected;
}

function setGameActions(started: boolean) {
  appRoot.querySelectorAll<HTMLButtonElement>('.play-actions [data-action=restart], .play-actions [data-action=pause]').forEach(button => { button.hidden = !started; button.disabled = !started; });
}

function togglePause(show: boolean) {
  const overlay = appRoot.querySelector<HTMLElement>('[data-overlay]');
  if (!overlay) return;
  paused = show;
  overlay.hidden = !show;
}

function setShareStatus(message: string): void {
  const status = appRoot.querySelector<HTMLElement>('[data-share-status]');
  if (status) status.textContent = message;
}

function hideManualShare(): void {
  const fallback = appRoot.querySelector<HTMLElement>('[data-share-fallback]');
  if (fallback) fallback.hidden = true;
}

function showManualShare(url: string): void {
  const fallback = appRoot.querySelector<HTMLElement>('[data-share-fallback]');
  const input = fallback?.querySelector<HTMLInputElement>('[data-share-link]');
  if (!fallback || !input) return;
  input.value = url;
  fallback.hidden = false;
  input.focus();
  input.select();
  setShareStatus('Select the link and copy it manually.');
}

async function copyShareLink(url: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(url);
    setShareStatus('Game link copied.');
    return true;
  } catch { return false; }
}

async function copyDisplayedShareLink(): Promise<void> {
  const input = appRoot.querySelector<HTMLInputElement>('[data-share-link]');
  if (!input) return;
  if (await copyShareLink(input.value)) hideManualShare();
  else { input.focus(); input.select(); setShareStatus('Select the link and copy it manually.'); }
}

async function shareCurrentGame(): Promise<void> {
  const game = activeSlug ? findGame(activeSlug) : undefined;
  if (!game) return;
  const data = { title: `${game.title} · Integ Games`, text: `Play ${game.title} with me on Integ Games.`, url: new URL(`/play/${game.slug}/`, siteOrigin).href };
  hideManualShare();
  setShareStatus('');
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      setShareStatus('Game shared.');
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  if (!(await copyShareLink(data.url))) showManualShare(data.url);
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

function showUpdatePrompt() {
  if (!updateReady || activeSlug || appRoot.querySelector('[data-action=update]')) return;
  const notice = document.createElement('p'); notice.setAttribute('role', 'status');
  notice.innerHTML = 'A new version is ready. <button class="secondary-button" data-action="update">Update now</button>';
  appRoot.querySelector('main')?.prepend(notice);
}
const updateSW = registerSW({ immediate: true, onNeedRefresh() { updateReady = true; document.documentElement.dataset.updateReady = 'true'; showUpdatePrompt(); } });
void loadPlayer().then(() => render());
