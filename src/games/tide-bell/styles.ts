/** Tide Bell styles: a calm coastal palette over the canvas, big touch targets, and a compact phone layout. */
export const STYLES = `
.tb{position:relative;isolation:isolate;width:100%;height:var(--tb-h,560px);overflow:hidden;border-radius:16px;background:#123f5c;color:#f4fbff;font-family:ui-rounded,"SF Pro Rounded","PingFang SC","Noto Sans SC",system-ui,sans-serif;user-select:none;-webkit-user-select:none;outline:none;touch-action:none}
.tb *{box-sizing:border-box}
.tb-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.tb button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
.tb-top{position:absolute;z-index:2;left:10px;right:10px;top:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none}
.tb-title small{display:block;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#a9dcea}
.tb-title strong{font-size:1.15rem;letter-spacing:-.01em}
.tb-count{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;font-size:.85rem;font-variant-numeric:tabular-nums}
.tb-count>span{padding:4px 9px;border-radius:999px;background:#0b2a40b3}
.tb-par{color:#ffe08a}
.tb-tide{display:inline-flex;align-items:center;gap:6px}
.tb-tide i{width:14px;height:14px;border-radius:50%;border:2px solid #8fd8ea;background:linear-gradient(to top,#5ec8de 0 var(--f,30%),transparent var(--f,30%))}
.tb-tide.tide-0 i{--f:22%}.tb-tide.tide-1 i{--f:78%}.tb-tide.three.tide-1 i{--f:52%}.tb-tide.tide-2 i{--f:92%}
.tb-lesson{position:absolute;z-index:2;left:10px;right:10px;margin:0 auto;width:fit-content;top:62px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px);padding:5px 14px 5px 6px;border-radius:14px;background:#0b2a40cc;font-size:.95rem;line-height:1.25;pointer-events:none}
.tb-lesson svg{flex:none;border-radius:10px;background:#1d5a78}
.tb-banner{position:absolute;z-index:3;left:10px;right:10px;margin:0 auto;width:fit-content;bottom:84px;display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;border-radius:14px;background:#fff7e0;color:#3b2a10;font-weight:700;box-shadow:0 8px 24px #0006;max-width:calc(100% - 20px)}
.tb-chip{border:0;border-radius:10px;padding:7px 12px;background:#2a6f8e;color:#fff!important;font-weight:800}
.tb-bar{position:absolute;z-index:2;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:10px;padding:0 10px}
.tb-btn{min-width:64px;min-height:52px;border:1px solid #ffffff33;border-radius:14px;background:#0b2a40d9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 10px}
.tb-btn span{font-size:1.25rem;line-height:1}
.tb-btn b{font-size:.72rem;font-weight:700;color:#cfeaf3}
.tb-btn:disabled{opacity:.45}
.tb-btn:active{transform:translateY(1px);background:#16486a}
.tb-card{position:absolute;z-index:5;inset:0;display:grid;place-items:center;background:#06192799;backdrop-filter:blur(3px);padding:12px}
.tb-panel{width:min(520px,100%);max-height:100%;overflow:auto;border-radius:20px;background:#f6f1e4;color:#203040;padding:18px 18px 16px;box-shadow:0 20px 60px #0008;touch-action:pan-y}
.tb-panel h2{margin:2px 0 6px;font-size:1.6rem;letter-spacing:-.02em}
.tb-panel.win{text-align:center;width:min(380px,100%)}
.tb-kicker{margin:0;color:#4a7a8c;font-size:.8rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.tb-result{margin:4px 0;font-size:1.05rem;font-weight:800;color:#1d5a78}
.tb-sub{margin:4px 0;color:#5a6a72;font-size:.9rem}
.tb-row{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.tb-btn2{min-height:46px;padding:8px 16px;border-radius:12px;border:1px solid #c9bfa8;background:#fff;color:#203040!important;font-weight:800}
.tb-btn2.primary{background:#1d7a9a;border-color:#1d7a9a;color:#fff!important}
.tb-btn2:focus-visible,.tb-level:focus-visible,.tb-chip:focus-visible,.tb-btn:focus-visible{outline:3px solid #ffb347;outline-offset:2px}
.tb-menuhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tb-menuhead h2{margin:0}
.tb-menuhead .tb-sub{flex:1}
.tb-tools{display:flex;gap:6px}
.tb-chapter h3{margin:14px 0 6px;font-size:.85rem;letter-spacing:.06em;text-transform:uppercase;color:#4a7a8c}
.tb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.tb.compact .tb-grid{grid-template-columns:repeat(2,1fr)}
.tb-level{position:relative;min-height:52px;border:1px solid #d6ccb4;border-radius:12px;background:#fff;color:#203040!important;text-align:left;padding:6px 26px 6px 10px;display:flex;flex-direction:column;justify-content:center}
.tb-level b{font-size:.72rem;color:#6a8a96}
.tb-level span{font-size:.9rem;font-weight:700;line-height:1.15}
.tb-level i{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-style:normal;color:#2a9a6a;font-weight:900}
.tb-level.perfect i{color:#d8a020}
.tb-level.current{border-color:#1d7a9a;box-shadow:inset 0 0 0 1px #1d7a9a}
.tb-level:disabled{opacity:.4;cursor:default}
.tb-keys{margin:14px 0 0;color:#6a7a80;font-size:.78rem;text-align:center}
.tb.is-immersive .tb-top{left:62px}
.tb.compact .tb-title strong{font-size:1rem}
.tb.compact .tb-count{font-size:.78rem;gap:5px}
.tb.compact .tb-count>span{padding:3px 7px}
.tb.compact .tb-lesson{top:58px;font-size:.88rem}
.tb.compact .tb-btn{min-width:60px}
@media (prefers-reduced-motion:reduce){.tb *{transition:none!important;animation:none!important}}
`;
