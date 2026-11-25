import { catalog } from './core/catalog';
const measurementId = 'G-FZ76Z2ZFKD';
const productionHost = 'games.integ.life';
const publicPaths = new Set(['/', ...catalog.map(game => `/play/${game.slug}/`)]);

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  integAnalyticsStarted?: boolean;
  integAnalyticsEvents?: number;
};

const MAX_EVENTS = 40;
const SAFE_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const SAFE_VALUE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * A game event (e.g. `ace`). A no-op until `startAnalytics` has run, so only the production host reports. Param values
 * must be numbers or short enum strings (never free text), and a page load sends at most 40 events.
 */
export function trackEvent(name: string, params: Record<string, number | string> = {}, win: AnalyticsWindow = window) {
  if (!win.integAnalyticsStarted || !win.dataLayer || !SAFE_NAME.test(name)) return false;
  if ((win.integAnalyticsEvents ?? 0) >= MAX_EVENTS) return false;
  const clean: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!SAFE_NAME.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
    else if (typeof v === 'string' && SAFE_VALUE.test(v)) clean[k] = v;
  }
  win.integAnalyticsEvents = (win.integAnalyticsEvents ?? 0) + 1;
  // The Google tag reads the Arguments object, not a plain array.
  (function gtag(..._args: unknown[]) { win.dataLayer!.push(arguments); })('event', name, { ...clean, send_to: measurementId });
  return true;
}

export function analyticsPath(pathname: string) {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return publicPaths.has(path) ? path : '/not-found';
}

export function startAnalytics(win: AnalyticsWindow = window) {
  if (win.location.hostname !== productionHost || win.top !== win.self || win.integAnalyticsStarted) return;
  win.integAnalyticsStarted = true;
  win.dataLayer = win.dataLayer || [];
  // The Google tag consumes the standard gtag Arguments command format.
  function gtag(..._args: unknown[]) { win.dataLayer!.push(arguments); }
  gtag('js', new Date());
  gtag('set', { allow_google_signals: false, allow_ad_personalization_signals: false });
  gtag('config', measurementId, {
    send_page_view: false,
    page_location: `https://${productionHost}${analyticsPath(win.location.pathname)}`,
    page_referrer: '',
    page_title: 'Integ Games',
  });
  let previous = '';
  const track = () => {
    const path = analyticsPath(win.location.pathname);
    if (path === previous) return;
    previous = path;
    gtag('set', { page_location: `https://${productionHost}${path}`, page_referrer: '', page_title: 'Integ Games' });
    gtag('event', 'page_view', { send_to: measurementId, page_location: `https://${productionHost}${path}`, page_referrer: '', page_title: 'Integ Games' });
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = win.history[method];
    win.history[method] = function (...args: Parameters<History[typeof method]>) {
      original.apply(this, args);
      track();
    };
  }
  win.addEventListener('popstate', track);
  track();
  const script = win.document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  win.document.head.append(script);
}
