/** Pebble Putt shell styles: warm paper-and-ink cards over the 3D garden. */
export const STYLES = `
.pp{position:relative;width:100%;height:var(--pp-h,560px);overflow:hidden;border-radius:16px;background:#2a2018;color:#2b2118;font-family:ui-rounded,"SF Pro Rounded",system-ui,sans-serif;outline:none;user-select:none;-webkit-user-select:none;touch-action:none}
.pp.is-immersive{border-radius:0}
.pp.is-immersive .pp-hud{padding-left:62px}
.pp canvas.pp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.pp-hud{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:6px;padding:8px;pointer-events:none;z-index:2}
.pp-hud>*{pointer-events:auto}
.pp-pill{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px;border-radius:999px;background:#fff8ecdd;box-shadow:0 2px 10px #0002;font-weight:800;font-size:.9rem;white-space:nowrap}
.pp-pill small{font-weight:700;color:#7a6650;font-size:.78rem}
.pp-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.pp-btn{min-height:44px;min-width:44px;padding:8px 16px;border:0;border-radius:14px;background:#fff8ec;color:#2b2118;font:inherit;font-weight:800;box-shadow:0 2px 0 #c9b28f,0 4px 12px #0002;cursor:pointer}
.pp-btn:focus-visible{outline:3px solid #e9b45a;outline-offset:2px}
.pp-btn.primary{background:#e9b45a;color:#2b1a08;box-shadow:0 2px 0 #a8762c,0 4px 14px #0003}
.pp-btn.ghost{background:#fff8ec99;box-shadow:none}
.pp-btn.round{border-radius:50%;padding:0;width:44px;font-size:1.15rem}
.pp-btn:disabled{opacity:.45;cursor:default}
.pp-chip{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #0004;vertical-align:middle}
.pp-caption{position:absolute;left:50%;top:62px;transform:translateX(-50%);z-index:2;padding:8px 18px;border-radius:999px;background:#2b2118d0;color:#fff4dc;font-weight:800;font-size:1.05rem;letter-spacing:.02em;pointer-events:none;transition:opacity .4s;white-space:nowrap}
.pp-turn{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:2;padding:8px 16px;border-radius:999px;background:#fff8ecee;font-weight:800;pointer-events:none;display:flex;gap:8px;align-items:center;transition:opacity .3s}
.pp-ghost{position:absolute;z-index:2;width:46px;height:46px;margin:-6px 0 0 -10px;pointer-events:none;animation:pp-drag 2.2s ease-in-out infinite}
.pp-ghost svg{width:100%;height:100%;filter:drop-shadow(0 2px 3px #0006)}
.pp-ghost span{position:absolute;left:44px;top:6px;padding:3px 8px;border-radius:8px;background:#2b2118d0;color:#fff4dc;font-weight:800;font-size:.85rem;white-space:nowrap}
@keyframes pp-drag{0%,12%{transform:translate(0,0);opacity:0}20%{opacity:1}60%{transform:translate(0,64px);opacity:1}72%{transform:translate(0,64px);opacity:0}100%{opacity:0}}
.pp.reduced .pp-ghost{animation:none;transform:translate(0,40px)}
.pp-toast{position:absolute;left:50%;top:112px;transform:translateX(-50%);z-index:4;padding:8px 16px;border-radius:12px;background:#2b2118e0;color:#fff4dc;font-weight:800;pointer-events:none;transition:opacity .3s;white-space:nowrap}
.pp-screen{position:absolute;inset:0;z-index:5;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 16px;background:linear-gradient(180deg,#f6d9a8f2,#f2c98cf2 60%,#e7b57af2);text-align:center}
.pp-screen.night{background:linear-gradient(180deg,#1c2250f2,#3b3f7af2)}
.pp-screen h1{margin:8px 0 0;font-size:clamp(2rem,7vw,3.2rem);letter-spacing:-.03em;color:#3a2614}
.pp-screen h2{margin:0;font-size:1.5rem;color:#3a2614}
.pp-screen p{margin:0;max-width:30rem;color:#5b4632;line-height:1.45}
.pp-menu{display:grid;gap:10px;width:min(320px,100%)}
.pp-menu small{display:block;font-weight:700;color:#7a6650;font-size:.78rem}
.pp-keys{font-size:.8rem;color:#7a6650!important}
.pp-hero{width:120px;height:70px}
.pp-head{display:flex;align-items:center;gap:10px;width:min(560px,100%)}
.pp-head h2{flex:1;text-align:left}
.pp-garden{width:min(560px,100%);text-align:left}
.pp-garden h3{margin:6px 0 2px;color:#3a2614}
.pp-garden p{font-size:.85rem}
.pp-holes{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:8px}
.pp-node{display:grid;gap:2px;justify-items:center;min-height:64px;padding:6px 2px;border:0;border-radius:12px;background:#fff8ec;font:inherit;color:#2b2118;box-shadow:0 2px 0 #c9b28f;cursor:pointer}
.pp-node b{font-size:1.1rem}
.pp-node .st{font-size:.7rem;letter-spacing:1px;color:#cdb89a}
.pp-node .st .on{color:#d18a1c}
.pp-node.current{outline:3px solid #e9b45a}
.pp-node:disabled{opacity:.45;cursor:default}
.pp-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;width:min(340px,calc(100% - 28px));display:grid;gap:10px;justify-items:center;padding:20px 18px;border-radius:20px;background:#fff8ecf5;box-shadow:0 18px 50px #0006;text-align:center;animation:pp-pop .28s ease-out}
@keyframes pp-pop{from{transform:translate(-50%,-44%);opacity:0}to{transform:translate(-50%,-50%);opacity:1}}
.pp.reduced .pp-card{animation:none}
.pp-card h2{margin:0;font-size:2rem;color:#3a2614}
.pp-card p{margin:0;color:#5b4632}
.pp-card .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.pp-stars{display:flex;gap:12px;justify-content:center}
.pp-stars div{display:grid;justify-items:center;font-size:.75rem;font-weight:800;color:#a8957c}
.pp-stars b{font-size:1.9rem;color:#dccbb0;line-height:1}
.pp-stars .on b{color:#e3a12a}
.pp-stars .fresh b{animation:pp-star .5s ease-out}
@keyframes pp-star{0%{transform:scale(.2)}70%{transform:scale(1.35)}100%{transform:scale(1)}}
.pp-tease{font-size:.85rem;font-style:italic}
.pp-set{display:flex;align-items:center;justify-content:space-between;gap:12px;width:min(420px,100%);padding:8px 12px;border-radius:12px;background:#fff8ecb0;font-weight:700}
.pp-seg{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.pp-seg .pp-btn.on{background:#e9b45a}
.pp-table{border-collapse:collapse;font-variant-numeric:tabular-nums;background:#fff8ec;border-radius:12px;overflow:hidden;font-size:.85rem}
.pp-table td,.pp-table th{padding:4px 7px;border-bottom:1px solid #ead9bd}
.pp-table th{background:#f3e3c6}
.pp-table td.lead{font-weight:900;color:#a8620e}
.pp-fallback{position:absolute;inset:0;z-index:7;display:grid;place-content:center;gap:12px;padding:24px;text-align:center;background:#2a2018;color:#fff4dc}
.pp-fallback h2{margin:0}
.pp-fallback p{margin:0;max-width:28rem;color:#e8d6b8;line-height:1.5}
.pp-loading{position:absolute;inset:0;z-index:1;display:grid;place-content:center;color:#f6dcae;font-weight:800}
.pp-notice{position:absolute;left:8px;right:8px;bottom:8px;z-index:8;padding:8px 12px;border-radius:10px;background:#7a2e1ee6;color:#fff;font-size:.85rem}
.pp.compact .pp-pill{min-height:36px;padding:3px 10px;font-size:.82rem}
.pp.compact .pp-caption{top:54px;font-size:.95rem}
`;
