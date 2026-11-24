import type { Icon } from './levels';

/** Small lesson pictures (inline SVG, 48 x 48): one per new idea, shown beside its caption. */
const WAVES = '<path d="M4 38c4-3 8-3 12 0s8 3 12 0 8-3 12 0 4 2 4 2" fill="none" stroke="#8fd8ea" stroke-width="2.4" stroke-linecap="round"/>';
const LOG = (x: number, y: number) => `<rect x="${x}" y="${y}" width="22" height="9" rx="4.5" fill="#8a5a32"/><ellipse cx="${x + 18}" cy="${y + 4.5}" rx="2.6" ry="4" fill="#d9b07c"/>`;
const BELL = (fill: string) => `<path d="M8 10h32" stroke="#835b36" stroke-width="3"/><path d="M11 10v26M37 10v26" stroke="#6b4a2c" stroke-width="2.6"/><path d="M20 14q4-3 8 0l2 12q3 3-6 3t-6-3z" fill="${fill}"/><circle cx="24" cy="31" r="1.8" fill="${fill}"/>`;
const ARROW = (up: boolean) => (up ? '<path d="M40 30l4 6h-8z" fill="#fff"/>' : '<path d="M40 36l4-6h-8z" fill="#fff"/>');
const CASTLE = (fill: string) => `<path d="M12 34V22h5v4h4v-8h6v8h4v-4h5v12z" fill="${fill}"/><rect x="22" y="28" width="4" height="6" rx="2" fill="#7a5a34"/>`;

const ICONS: Record<Icon, string> = {
  bell: BELL('#ffd56a') + WAVES,
  wood: LOG(13, 25) + WAVES,
  drift: LOG(6, 25) + '<path d="M32 29h10m-4-4 4 4-4 4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' + WAVES,
  float: LOG(13, 22) + '<path d="M24 8v8m-4-4 4-4 4 4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' + WAVES,
  tides: '<path d="M14 8v14m-4-4 4 4 4-4M34 22V8m-4 4 4-4 4 4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' + LOG(13, 26) + WAVES,
  up: BELL('#9fe3d4') + ARROW(true) + WAVES,
  down: BELL('#ffb59c') + ARROW(false) + WAVES,
  high: '<path d="M4 34q10-14 20-10t20 10z" fill="#d8bd85"/><path d="M18 24l2-5 2 5M28 25l2-4 2 4" stroke="#6e8c50" stroke-width="2" fill="none"/>' + WAVES,
  castle: CASTLE('#dcc18a') + WAVES,
  highcastle: CASTLE('#c9a868') + '<path d="M24 10v8" stroke="#6b5136" stroke-width="1.6"/><path d="M24 10l6 2-6 2z" fill="#ff8a5b"/>' + WAVES,
  current: '<path d="M8 20l6 6-6 6M20 20l6 6-6 6M32 20l6 6-6 6" stroke="#bdf0ff" stroke-width="2.8" fill="none" stroke-linecap="round"/>' + WAVES,
  ride: LOG(13, 27) + '<circle cx="24" cy="15" r="5" fill="#ffc93c"/><ellipse cx="24" cy="24" rx="5" ry="5" fill="#e8a91c"/><path d="M38 14h6m-3-3 3 3-3 3" stroke="#fff" stroke-width="2" fill="none"/>' + WAVES,
  flag: '<path d="M18 8v28" stroke="#5b4632" stroke-width="3"/><path d="M19 9h16l-4 5 4 5H19z" fill="#ff6b5a"/>' + WAVES
};

export const iconSvg = (icon: Icon) => `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">${ICONS[icon]}</svg>`;
