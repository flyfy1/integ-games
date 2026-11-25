export const STYLES = `
.sp{position:relative;width:100%;height:var(--sp-h,560px);overflow:hidden;border-radius:18px;background:#0a2733;color:#eafcff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;touch-action:none;outline:none}
.sp.is-immersive{border-radius:0}
.sp.sp-art .sp-top,.sp.sp-art .sp-bottom{display:none}
.sp.is-immersive .sp-top{padding-left:64px}
.sp canvas{position:absolute;inset:0;display:block}
.sp button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.sp-top{position:absolute;left:0;right:0;top:0;padding:8px 10px 0 10px;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.sp-top>*{pointer-events:auto}
.sp-row{display:flex;align-items:center;gap:8px}
.sp-menu-btn{border:0;background:rgba(255,255,255,.12);border-radius:12px;padding:7px 11px;font-weight:700;font-size:14px}
.sp-title{flex:1;min-width:0;font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-sub{opacity:.75;font-weight:600;font-size:12px}
.sp-scores{display:flex;gap:5px;flex-wrap:wrap}
.sp-chip{display:flex;align-items:center;gap:5px;background:rgba(6,20,26,.6);border-radius:999px;padding:3px 9px 3px 4px;font-size:13px;font-weight:700;border:2px solid transparent}
.sp-chip i{display:inline-block;width:16px;height:16px;border-radius:50%}
.sp-chip.me{border-color:rgba(255,255,255,.6)}
.sp-chip.ready:after{content:"✓";color:#8ef59b;margin-left:2px}
.sp-chip.away{opacity:.55}
.sp-cap{align-self:center;max-width:94%;background:#fff;color:#10303a;border-radius:16px;padding:8px 14px;font-weight:800;font-size:16px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px}
.sp-cap b{font-size:22px;line-height:1}
.sp-cap:empty{display:none}
.sp-bottom{position:absolute;left:0;right:0;bottom:0;padding:0 10px 10px;display:flex;flex-direction:column;gap:8px}
.sp-timer{height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
.sp-timer>i{display:block;height:100%;background:#8ef59b;border-radius:3px;transform-origin:left center}
.sp-timer.urgent>i{background:#ff8a65}
.sp-slots{display:flex;gap:8px;justify-content:center;align-items:center}
.sp-slot{width:52px;height:46px;border-radius:12px;border:2px dashed rgba(255,255,255,.35);background:rgba(6,20,26,.45);display:grid;place-items:center;font-size:24px;font-weight:900;position:relative;padding:0}
.sp-slot.full{border-style:solid;border-color:#fff;background:rgba(255,255,255,.16)}
.sp-slot small{position:absolute;left:5px;top:2px;font-size:10px;opacity:.7}
.sp-controls{display:flex;gap:10px;align-items:center;justify-content:space-between}
.sp-pad{display:grid;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(2,44px);gap:5px}
.sp-pad button,.sp-act{border:0;border-radius:12px;background:rgba(255,255,255,.16);font-size:22px;font-weight:900;display:grid;place-items:center;padding:0}
.sp-pad button:active,.sp-act:active,.sp-slot:active{transform:scale(.94)}
.sp-pad .u{grid-column:2;grid-row:1}.sp-pad .l{grid-column:1;grid-row:2}.sp-pad .d{grid-column:2;grid-row:2}.sp-pad .r{grid-column:3;grid-row:2}
.sp-acts{display:flex;gap:8px;flex:1;justify-content:flex-end}
.sp-act{height:56px;min-width:76px;padding:0 12px;font-size:16px}
.sp-act.brace{background:rgba(255,255,255,.16)}
.sp-act.ready{background:#8ef59b;color:#0b3320;min-width:104px}
.sp-act.ready.done{background:#3d7a52;color:#dfffe6}
.sp-act:disabled{opacity:.4}
.sp-hint{animation:sp-pulse 1s ease-in-out infinite;box-shadow:0 0 0 3px #fff}
@keyframes sp-pulse{50%{box-shadow:0 0 0 7px rgba(255,255,255,.25)}}
.sp.reduced .sp-hint{animation:none}
.sp-emotes{display:flex;gap:6px;justify-content:center}
.sp-emotes button{border:0;background:rgba(255,255,255,.1);border-radius:50%;width:38px;height:38px;font-size:19px;padding:0}
.sp-panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,22,30,.62);padding:14px;z-index:5}
.sp-card{width:min(420px,100%);max-height:100%;overflow:auto;background:#123f4e;border-radius:20px;padding:18px;box-shadow:0 18px 40px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:10px}
.sp-card h2{margin:0;font-size:24px;font-weight:900}
.sp-card p{margin:0;opacity:.85;font-size:14px;line-height:1.4}
.sp-btn{border:0;border-radius:14px;background:rgba(255,255,255,.12);padding:12px 14px;text-align:left;display:flex;flex-direction:column;gap:2px;font-weight:800;font-size:16px}
.sp-btn small{font-weight:600;font-size:12px;opacity:.75}
.sp-btn.primary{background:#8ef59b;color:#0b3320}
.sp-btn:disabled{opacity:.45;cursor:default}
.sp-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.sp-grid button{border:0;border-radius:12px;background:rgba(255,255,255,.12);aspect-ratio:1;font-weight:900;font-size:16px}
.sp-grid button.done{background:#3d7a52}
.sp-grid button:disabled{opacity:.35}
.sp-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sp-inline input{flex:1;min-width:0;border-radius:12px;border:0;padding:11px 12px;font:inherit;font-weight:800;font-size:16px;background:#eafcff;color:#10303a;text-transform:uppercase}
.sp-inline input.name{text-transform:none}
.sp-small{border:0;border-radius:12px;background:rgba(255,255,255,.14);padding:10px 12px;font-weight:800}
.sp-small.primary{background:#8ef59b;color:#0b3320}
.sp-board{display:flex;flex-direction:column;gap:4px}
.sp-board div{display:flex;align-items:center;gap:8px;font-weight:800}
.sp-board i{width:14px;height:14px;border-radius:50%}
.sp-board span{flex:1}
.sp-report span{display:flex;flex-direction:column;line-height:1.2}
.sp-report small{font-size:12px;font-weight:700;color:#a9c0c8}
.sp-lobby .sp-title{white-space:normal}
.sp-lobby{background:rgba(18,63,78,.95);border-radius:16px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.sp-lobby .sp-board{font-size:14px}
.sp-toast{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);background:#fff;color:#10303a;font-weight:900;font-size:20px;border-radius:16px;padding:10px 18px;pointer-events:none;transition:opacity .2s;z-index:6;text-align:center;max-width:90%}
.sp-status{position:absolute;right:10px;top:48px;font-size:12px;font-weight:700;background:rgba(6,20,26,.7);border-radius:10px;padding:4px 8px;z-index:3}
.sp-status:empty{display:none}
.sp.compact .sp-slot{width:46px;height:42px}
.sp.compact .sp-pad{grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,40px)}
.sp.compact .sp-act{height:50px;min-width:66px}
.sp.compact .sp-act.ready{min-width:92px}
.sp.wide .sp-bottom{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px 16px}
.sp.wide .sp-hintrow{grid-column:1/-1;grid-row:1}
.sp.wide .sp-timer{grid-column:1/-1;grid-row:2}
.sp.wide .sp-controls{display:contents}
.sp.wide .sp-pad{grid-column:1;grid-row:3/5;justify-self:start}
.sp.wide .sp-slots:not(.sp-hintrow){grid-column:2;grid-row:3}
.sp.wide .sp-emotes{grid-column:2;grid-row:4}
.sp.wide .sp-acts{grid-column:3;grid-row:3/5}
`;
