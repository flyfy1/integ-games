/** Lantern Works styles: warm wood and brass, paper-lantern red, readable on a phone. Scoped under `.lw`. */
export const STYLES = `
.lw{position:relative;width:100%;height:var(--lw-h,560px);overflow:hidden;border-radius:16px;background:#1a100a;color:#f6e9d0;font-family:ui-rounded,"SF Pro Rounded","PingFang SC","Noto Sans SC",system-ui,sans-serif;user-select:none;-webkit-user-select:none;outline:none;touch-action:none}
.lw *{box-sizing:border-box}
.lw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.lw button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.lw button:focus-visible,.lw [tabindex]:focus-visible{outline:3px solid #ffd36b;outline-offset:2px}
.lw-btn{min-height:42px;padding:8px 14px;border-radius:12px;border:1px solid #8a5a2b;background:linear-gradient(#5a3a20,#3d2614);color:#f6e9d0;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 0 #1d1008,inset 0 1px 0 #ffffff1f}
.lw-btn:hover{border-color:#d9a65a}
.lw-btn.primary{background:linear-gradient(#e2412f,#a8261a);border-color:#ffb27a;color:#fff6e4}
.lw-btn.brass{background:linear-gradient(#f1cf7d,#b98432);border-color:#ffe6a6;color:#3a220c}
.lw-btn.ghost{background:#2a1a0fcc;border-color:#6d4a2a}
.lw-btn:disabled{opacity:.45;cursor:default}
.lw-btn.on{border-color:#ffd36b;box-shadow:0 0 0 2px #ffd36b66,0 2px 0 #1d1008}
/* HUD */
.lw-top{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;gap:4px;padding:6px 8px 4px;background:linear-gradient(#170d07f2,#170d07c0 80%,#170d0700);pointer-events:none}
.lw-top>*{pointer-events:auto}
.lw-row{display:flex;align-items:center;gap:6px;min-width:0}
.lw-title{font-weight:900;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;letter-spacing:.01em}
.lw-title small{color:#d9b27a;font-weight:700;margin-right:4px}
.lw-orders{display:flex;gap:6px;flex:1 1 auto;justify-content:flex-end;flex-wrap:wrap;min-width:0}
.lw-order{display:flex;align-items:center;gap:4px;padding:2px 8px 2px 4px;border-radius:10px;background:#f1e2c3;color:#3a220c;font-weight:900;font-size:.82rem;border:1px solid #c79a5a;box-shadow:0 2px 0 #0006;position:relative;overflow:hidden}
.lw-order img{width:28px;height:28px;display:block}
.lw-order.done{background:#ffd36b;border-color:#fff1b8}
.lw-order.later{opacity:.55}
.lw-order .stall{font-size:.68rem;color:#8a4b1f;margin-right:2px}
.lw-order .bar{position:absolute;left:0;bottom:0;height:3px;background:#e2412f}
.lw-chips{display:flex;gap:5px;flex-wrap:wrap}
.lw-chip{padding:2px 8px;border-radius:999px;background:#2b1a0ecc;border:1px solid #6d4a2a;font-size:.74rem;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
.lw-chip.good{border-color:#ffd36b;color:#ffe9a6}
.lw-chip.bad{border-color:#ff7a5a;color:#ffb39a}
.lw-chip.dim{opacity:.7}
.lw-bottom{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:5px;padding:6px 8px 8px;background:linear-gradient(#170d0700,#170d07d0 22%,#170d07f5);pointer-events:none}
.lw-bottom>*{pointer-events:auto}
.lw-tray{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;padding:2px}
.lw-tray::-webkit-scrollbar{display:none}
.lw-tool{position:relative;flex:0 0 auto;width:54px;height:54px;border-radius:12px;border:1px solid #6d4a2a;background:linear-gradient(#4a2f1a,#2e1c0f);display:grid;place-items:center;padding:0}
.lw-tool img{width:40px;height:40px;pointer-events:none}
.lw-tool b{position:absolute;right:3px;bottom:1px;font-size:.7rem;font-weight:900;color:#ffe9a6;text-shadow:0 1px 2px #000}
.lw-tool i{position:absolute;left:4px;top:1px;font-size:.6rem;font-style:normal;color:#c9a06a}
.lw-tool.on{border-color:#ffd36b;background:linear-gradient(#7a5126,#4a2f14);box-shadow:0 0 0 2px #ffd36b88}
.lw-tool.empty{opacity:.45}
.lw-tool.fresh:after{content:"";position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:#e2412f;border:2px solid #ffd36b}
.lw-controls{display:flex;gap:6px;justify-content:center}
.lw-controls .lw-btn{flex:1 1 0;min-width:0;padding:6px 4px;font-size:.84rem}
.lw-controls .run{flex:1.6 1 0}
.lw-pop{position:absolute;z-index:5;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:14px;background:#2a1a0ff2;border:1px solid #c79a5a;box-shadow:0 8px 24px #000a;max-width:min(320px,92%)}
.lw-pop .head{font-weight:900;font-size:.85rem;color:#ffe9a6}
.lw-pop .does{font-size:.75rem;color:#e6d3b0;line-height:1.3}
.lw-pop .acts{display:flex;gap:6px}
.lw-pop .acts .lw-btn{min-height:38px;padding:4px 10px;font-size:.8rem}
.lw-dials{display:flex;gap:4px;flex-wrap:wrap;max-height:116px;overflow:auto}
.lw-dial{width:40px;height:40px;border-radius:10px;border:1px solid #6d4a2a;background:#3b2614;display:grid;place-items:center;padding:0;font-weight:900;font-size:.8rem}
.lw-dial img{width:30px;height:30px}
.lw-dial.on{border-color:#ffd36b;background:#6e4a1e}
.lw-toast{position:absolute;left:50%;top:38%;transform:translateX(-50%);padding:8px 14px;border-radius:12px;background:#2a1a0ff0;border:1px solid #c79a5a;font-weight:800;font-size:.9rem;pointer-events:none;transition:opacity .3s;white-space:nowrap;z-index:6}
.lw-card-wrap{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:14px;background:#0d0704a6}
.lw-card{width:min(420px,100%);max-height:100%;overflow:auto;padding:18px 18px 16px;border-radius:18px;background:linear-gradient(#f6ead0,#e9d6ad);color:#3a220c;border:2px solid #c79a5a;box-shadow:0 18px 50px #000c;display:flex;flex-direction:column;gap:10px;text-align:center}
.lw-card h2{margin:0;font-size:1.35rem;letter-spacing:-.01em}
.lw-card h2 small{display:block;font-size:.75rem;color:#8a4b1f;letter-spacing:.08em;text-transform:uppercase}
.lw-card p{margin:0;line-height:1.4;font-size:.92rem}
.lw-card .lw-btn{color:#f6e9d0}
.lw-card .lw-btn.brass{color:#3a220c}
.lw-card .row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.lw-card .row .lw-btn{flex:1 1 120px}
.lw-recipe{display:flex;align-items:center;justify-content:center;gap:6px;font-size:1.3rem;font-weight:900;color:#8a4b1f}
.lw-recipe img{width:46px;height:46px}
.lw-recipe .part{width:58px;height:58px;border-radius:12px;background:#2e1c0f;padding:4px}
.lw-recipe .part img{width:50px;height:50px}
.lw-want{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.lw-want .lw-order{font-size:.95rem}
.lw-stars{display:flex;flex-direction:column;gap:6px;text-align:left}
.lw-star{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:10px;background:#00000012;font-weight:800;font-size:.9rem}
.lw-star i{font-style:normal;font-size:1.4rem;color:#bba27a;width:1.5rem;text-align:center}
.lw-star.on i{color:#e2412f;text-shadow:0 0 10px #ffb27a}
.lw-star.new{animation:lw-pop .6s ease}
@keyframes lw-pop{0%{transform:scale(.8)}60%{transform:scale(1.06)}100%{transform:scale(1)}}
/* Screens */
.lw-screen{position:absolute;inset:0;z-index:7;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:radial-gradient(ellipse at 50% 0%,#5a2f18 0%,#2a160b 45%,#130a05 100%)}
.lw-screen header{display:flex;align-items:center;gap:10px}
.lw-screen header h2{margin:0;font-size:1.25rem;flex:1}
.lw-hero{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:10px 0 4px}
.lw-hero h1{margin:0;font-size:clamp(2rem,7vw,3.2rem);letter-spacing:-.02em;color:#ffe2a6;text-shadow:0 0 24px #ff9a3c88,0 3px 0 #5a2f18}
.lw-hero p{margin:0;max-width:440px;color:#e8cfa6;line-height:1.45}
.lw-hero .lanterns{display:flex;gap:14px;height:64px;align-items:flex-start}
.lw-hero .lanterns img{width:46px;height:46px;animation:lw-sway 3s ease-in-out infinite alternate;filter:drop-shadow(0 0 12px #ffa34a)}
.lw-hero .lanterns img:nth-child(2){animation-delay:-1s;margin-top:12px}.lw-hero .lanterns img:nth-child(3){animation-delay:-2s}
@keyframes lw-sway{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
.lw.reduced *{animation:none!important;transition:none!important}
.lw-menu{display:flex;flex-direction:column;gap:8px;width:min(340px,100%);margin:0 auto}
.lw-menu .lw-btn{min-height:50px;font-size:1.02rem}
.lw-menu .lw-btn small{font-weight:600;opacity:.8;font-size:.78rem}
.lw-chapter{border-radius:16px;padding:12px;background:#2a1a0fcc;border:1px solid #6d4a2a}
.lw-chapter h3{margin:0 0 2px;font-size:1.05rem;color:#ffe2a6}
.lw-chapter p{margin:0 0 10px;font-size:.82rem;color:#d9bf94}
.lw-nodes{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.lw-node{min-height:70px;border-radius:12px;border:1px solid #8a5a2b;background:linear-gradient(#5a3a20,#3d2614);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;font-weight:900}
.lw-node .id{font-size:1rem}
.lw-node .nm{font-size:.62rem;font-weight:700;opacity:.85;line-height:1.1;text-align:center}
.lw-node .st{font-size:.8rem;letter-spacing:1px;color:#8e7552}
.lw-node .st .on{color:#ffcf5a}
.lw-node.rush{background:linear-gradient(#8a2a1a,#561a10);border-color:#ffb27a}
.lw-node.current{box-shadow:0 0 0 2px #ffd36b}
.lw-node:disabled{opacity:.4}
.lw-set{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:#2a1a0fcc;border:1px solid #6d4a2a}
.lw-set input[type=range]{width:140px}
.lw-keys{font-size:.72rem;color:#c9a876;text-align:center;line-height:1.4}
.lw-notice{position:absolute;left:8px;right:8px;bottom:8px;z-index:9;padding:8px;border-radius:10px;background:#5a1a10ee;font-size:.82rem;text-align:center}
.lw.compact .lw-tool{width:46px;height:46px}.lw.compact .lw-tool img{width:34px;height:34px}
.lw.compact .lw-controls .lw-btn{min-height:36px;font-size:.78rem}
.lw.compact .lw-order img{width:24px;height:24px}
.lw.compact .lw-title{font-size:.85rem}
`;
