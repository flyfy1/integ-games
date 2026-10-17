// DOM controls keep level identity and selection readable independently of canvas scaling.
export function createLevelUI(root, screen, levels, actions) {
  const ribbon = document.createElement('div'); ribbon.className = 'ashfall-ribbon';
  ribbon.setAttribute('aria-label', 'Current level and chapter');
  ribbon.innerHTML = '<strong></strong><span></span>';
  root.insertBefore(ribbon, screen);
  const overlay = document.createElement('section'); overlay.className = 'ashfall-overlay';
  overlay.setAttribute('aria-label', 'Ashfall level selection');
  screen.append(overlay);
  let key = '', selection = 1;
  function update(g, level, selected, runStartId, progress, best) {
    selection = selected.id;
    const inMenu = g.mode === 'title' || (g.mode === 'loading' && !g.loadingNext);
    const display = inMenu ? selected : level;
    const zone = display.ZONES[inMenu ? 0 : display.zoneIndexAt(actions.playerX())];
    ribbon.querySelector('strong').textContent = `LEVEL ${display.numeral}`;
    ribbon.querySelector('span').textContent = `CH. ${zone.chapter} · ${zone.name}`;
    root.dataset.mode = g.mode;
    const visible = ['title', 'loading', 'interlude', 'victory'].includes(g.mode);
    overlay.hidden = !visible;
    screen.classList.toggle('has-overlay', visible);
    if (!visible) { key = ''; return; }
    const nextKey = [g.mode, level.id, selected.id, [...progress], best, g.results?.length, g.score, g.victoryT >= 2.5].join('|');
    if (key === nextKey) return;
    const focused = overlay.contains(document.activeElement) ? document.activeElement?.getAttribute('data-control') : null;
    key = nextKey;
    const route = levels.filter(l => l.id >= selected.id).map(l => l.numeral).join(' → ');
    const button = (label, control, primary = false, disabled = false) => `<button type="button" data-control="${control}" class="${primary ? 'af-primary' : 'af-secondary'}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    if (inMenu) {
      overlay.setAttribute('aria-label', 'Ashfall level selection');
      overlay.innerHTML = `<div class="af-panel"><p class="af-eyebrow">THREE LEVELS · ONE JOURNEY</p><h1>ASHFALL</h1><div class="af-levels" role="radiogroup" aria-label="Starting level">${levels.map(l => `<button type="button" role="radio" aria-checked="${l.id === selected.id}" tabindex="${l.id === selected.id ? 0 : -1}" data-control="level-${l.id}" data-level="${l.id}"><strong>LEVEL ${l.numeral}</strong><span class="af-name">${l.title}</span><span>${l.descriptor}</span><small>${progress.has(l.id) ? 'CLEARED ✓' : l.id === 1 ? 'RECOMMENDED START' : 'OPEN'}</small></button>`).join('')}</div><p class="af-route">RUN ROUTE · ${route}${best ? ` · BEST ${best}` : ''}</p>${button(g.mode === 'loading' ? 'LOADING…' : `START LEVEL ${selected.numeral}`, 'start', true, g.mode === 'loading')}<p class="af-help">Select with 1 / 2 / 3 or arrows · Enter to start</p></div>`;
    } else if (g.mode === 'interlude' || g.loadingNext) {
      const next = levels[levels.indexOf(level) + 1];
      overlay.setAttribute('aria-label', 'Level complete');
      overlay.innerHTML = `<div class="af-panel af-complete"><p class="af-eyebrow">LEVEL ${level.numeral} COMPLETE → LEVEL ${next.numeral}</p><h2>${level.completion.title}</h2><p class="af-bridge">${level.completion.bridge}</p><p>UP NEXT · LEVEL ${next.numeral}<br>CH. ${next.ZONES[0].chapter} · ${next.ZONES[0].name}</p>${next.BOSS.variant === 'reforged' ? '<p class="af-help">The foundry guardian waits, reforged in the cathedral.<br>Salvaged Edge and Storm Mantle expire here · Level II only.</p>' : ''}<div class="af-buttons">${button(g.loadingNext ? `LOADING LEVEL ${next.numeral}…` : `CONTINUE TO LEVEL ${next.numeral}`, 'continue', true, !!g.loadingNext || g.victoryT < 2.5)}${button('Level select', 'menu')}</div></div>`;
    } else {
      const start = levels.find(l => l.id === runStartId), full = g.results.map(r => r.id).join(',') === '1,2,3';
      const routeDone = g.results.map(r => r.numeral).join(' → ');
      overlay.setAttribute('aria-label', 'Run results');
      overlay.innerHTML = `<div class="af-panel af-complete"><p class="af-eyebrow">LEVEL ${level.numeral} COMPLETE</p><h2>${level.completion.title}</h2><p class="af-sub">${level.completion.sub}</p><p>${full ? 'CAMPAIGN' : 'RUN'} COMPLETE · ${routeDone}</p><table><caption>Per-level results</caption><thead><tr><th>LEVEL</th><th>TIME</th><th>KILLS</th><th>FALLS</th><th>SCORE</th></tr></thead><tbody>${g.results.map(r => `<tr><th>LEVEL ${r.numeral}</th><td>${formatTime(r.time)}</td><td>${r.kills}</td><td>${r.falls}</td><td>${r.score}</td></tr>`).join('')}</tbody></table><p class="af-total">${g.score} ASH · ${formatTime(g.playT)} · ${g.deaths} FALLS</p><p class="af-help">${full ? 'Campaign score recorded' : 'Local run record'} · BEST ${g.best || g.score}</p><div class="af-buttons">${button(`Replay from LEVEL ${start.numeral}`, 'replay', true, g.victoryT < 2.5)}${button('Level select', 'menu')}</div></div>`;
    }
    if (focused) overlay.querySelector(`[data-control="${focused}"]`)?.focus();
  }
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
    if (btn.dataset.level) actions.select(Number(btn.dataset.level));
    else actions[btn.dataset.control]?.();
  });
  return { update, focusSelection() { overlay.querySelector(`[data-level="${selection}"]`)?.focus(); } };
}
function formatTime(time) { return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`; }

export const levelStyles = `
.ashfall-screen{position:relative;width:100%;min-width:0}.ashfall-screen canvas{margin:auto}
.ashfall-ribbon{display:flex;align-items:center;gap:16px;width:100%;max-width:1280px;min-height:44px;padding:10px 18px;border:1px solid #76604a;background:#100f12;color:#eee3d2;border-radius:8px;font:14px/1.3 Georgia,serif;box-sizing:border-box;z-index:1}
.ashfall-ribbon strong{flex:0 0 auto;white-space:nowrap;font-size:18px;font-weight:800;letter-spacing:.06em;color:#ffda9a}.ashfall-ribbon span{min-width:0;overflow-wrap:anywhere}
.ashfall-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#090e14f5,#1e1514ee);border:1px solid #775b40;border-radius:14px;padding:18px;color:#f4e8d5;font:15px/1.5 Georgia,serif;overflow:auto;box-sizing:border-box;z-index:2}
.ashfall-overlay[hidden]{display:none}.ashfall-screen.has-overlay{min-height:470px}.af-panel{width:min(850px,100%);text-align:center;margin:auto}.af-panel h1{font-size:40px;letter-spacing:.18em;margin:0 0 16px}.af-panel h2{font-size:30px;letter-spacing:.06em;margin:12px 0}.af-panel p{margin:10px 0}.af-eyebrow{font:700 13px/1.4 system-ui,sans-serif;letter-spacing:.1em;color:#edc38e}.af-levels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.af-levels button{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:150px;padding:16px;text-align:left;border:1px solid #61564e;border-radius:8px;background:#12171b;color:#d9d4cd;font:14px/1.4 Georgia,serif;cursor:pointer}.af-levels strong{color:#ffe1aa;font:800 20px/1.3 system-ui,sans-serif}.af-levels .af-name{font-size:16px;color:#fff0d8}.af-levels small{font:11px system-ui,sans-serif;color:#a9c8c1}.af-levels [aria-checked=true]{border:2px solid #ffd494;padding:15px;background:#32271b;box-shadow:inset 0 0 20px #d6952c15}.ashfall-overlay button:focus-visible{outline:3px solid #aee6ff;outline-offset:4px}.af-primary,.af-secondary{min-height:48px;padding:12px 24px;border-radius:6px;border:1px solid #ab8560;font:700 14px/1.4 system-ui,sans-serif;cursor:pointer}.af-primary{background:#f0cd96;color:#1b1712}.af-secondary{background:#111a20;color:#e4dbce}.ashfall-overlay button:disabled{opacity:.5;cursor:wait}.af-help{color:#b4c4cd;font:12px/1.5 system-ui,sans-serif}.af-route{color:#efd2a6}.af-bridge{max-width:640px;margin:18px auto!important;color:#c8e0e9}.af-buttons{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.af-sub{color:#d6b794;letter-spacing:.2em}.af-total{font-size:18px;color:#ffda9a}.af-complete table{width:100%;max-width:600px;margin:12px auto;border-collapse:collapse;font:13px/1.5 system-ui,sans-serif}.af-complete caption{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}.af-complete td,.af-complete th{padding:7px;border-bottom:1px solid #544636}.af-complete thead{color:#b7c6c9}
.ashfall[data-mode=title] .ashfall-touch,.ashfall[data-mode=loading] .ashfall-touch,.ashfall[data-mode=interlude] .ashfall-touch,.ashfall[data-mode=victory] .ashfall-touch{display:none}
.ashfall[data-mode=title] .ashfall-rotate,.ashfall[data-mode=loading] .ashfall-rotate{display:none!important}
.ashfall canvas{max-width:min(1280px,calc((100dvh - 90px) * 16 / 9))}
@media(max-width:600px){.ashfall-ribbon{gap:10px;padding:8px 10px;font-size:12px}.ashfall-ribbon strong{font-size:16px}.af-levels{grid-template-columns:1fr;gap:8px}.af-levels button{min-height:78px;display:grid;grid-template-columns:85px 1fr;gap:3px 9px;padding:10px}.af-levels [aria-checked=true]{padding:9px}.af-levels strong{font-size:17px;grid-row:span 2}.af-levels .af-name{font-size:13px}.af-levels small{grid-column:2}.af-levels span{font-size:12px}.af-panel h1{font-size:28px;margin-bottom:10px}.af-panel h2{font-size:23px}.af-panel{font-size:13px}.ashfall-overlay{padding:12px}.ashfall-screen.has-overlay{min-height:470px}.af-help{font-size:11px}.af-complete td,.af-complete th{padding:6px 2px;font-size:11px}}
@media(orientation:landscape) and (max-height:600px){.ashfall-ribbon{width:calc(100% - 290px);padding:6px 10px;min-height:40px;font-size:11px}.ashfall-ribbon strong{font-size:16px}.ashfall.is-touch canvas{max-width:min(calc((100dvh - 100px) * 16 / 9),calc(100vw - 290px))}.ashfall-screen.has-overlay{min-height:300px}.ashfall-overlay{padding:10px 24px}.af-panel h1{font-size:25px;margin:0 0 8px}.af-panel h2{font-size:22px;margin:6px 0}.af-levels button{min-height:100px;padding:9px}.af-levels [aria-checked=true]{padding:8px}.af-levels strong{font-size:17px}.af-levels .af-name{font-size:13px}.af-panel p{margin:6px 0}.af-help{font-size:11px}.af-eyebrow{font-size:11px}.af-primary,.af-secondary{min-height:44px;padding:8px 18px}.af-complete td,.af-complete th{padding:3px}.af-complete table{margin:4px auto}}
`;
