/** Puzzle-mode CSS, layered on the shared Crumb Raiders styles (`ui/styles.ts`). Scoped under `.ar`. */
export const PUZZLE_STYLES = `
.ar-hud .ar-top{gap:6px;flex-wrap:nowrap}
.ar-pill.goal{flex-direction:column;align-items:flex-start;gap:0;line-height:1.15;padding:4px 12px}
.ar-pill.goal .lbl{display:block!important;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-pill.goal small{font-size:12px;font-weight:800;opacity:.8}
.ar-pill.scent{gap:6px}
.ar-pill.scent .pips{display:flex;flex-wrap:wrap;gap:2px;max-width:96px}
.ar-pill.scent .pips i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.18)}
.ar-pill.scent .pips i.on{background:var(--honey)}
.ar-pill.scent b{font-size:13px}
.ar-pill.scent.empty{border-color:var(--bad)}
.ar-pill.shake{animation:ar-shake .35s}
@keyframes ar-shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.ar-hud .ar-bottom{justify-content:space-between;align-items:flex-end}
.ar-hud .ar-bottom [data-ui=go]{margin-left:auto;min-width:132px}
.ar-hud .ar-bottom [data-ui=undo],.ar-hud .ar-bottom [data-ui=digger]{flex-direction:column;gap:0;line-height:1.1;min-width:76px}
.ar-hud .ar-bottom [data-ui=undo] small{font-size:11px}
.ar-hud [data-ui=digger][aria-pressed=true]{outline:3px solid #fff;outline-offset:2px;transform:translateY(-3px)}
.ar-btn.pulse{animation:ar-gopulse .7s infinite alternate}
@keyframes ar-gopulse{to{transform:scale(1.07);box-shadow:0 0 0 6px rgba(255,201,74,.85),0 4px 0 var(--ink)}}
.ar.reduced .ar-btn.pulse{animation:none;box-shadow:0 0 0 5px rgba(255,201,74,.85),0 4px 0 var(--ink)}
.ar-btn.running{background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);text-shadow:none}
.ar-banner{position:absolute;left:50%;top:var(--ar-top,60px);transform:translateX(-50%);z-index:4;width:min(520px,calc(100% - 16px));padding:8px 14px;border-radius:14px;background:rgba(110,25,15,.93);border:2px solid var(--bad);color:#fff;pointer-events:none;text-align:center;animation:ar-fade .15s}
.ar-banner.info{background:rgba(25,40,20,.9);border-color:var(--honey)}
.ar-banner p{font-size:var(--fs-m);font-weight:900}
.ar-banner small{display:block;font-size:13px;font-weight:700;opacity:.85}
.ar-banner button{pointer-events:auto;margin-top:6px}
.ar:not(.rot) .ar-banner{top:auto;bottom:10px;width:min(560px,calc(100% - 330px))}
.ar:not(.rot) .ar-banner p{font-size:var(--fs-s)}
.ar-actions.col{flex-direction:column;align-items:stretch;width:min(320px,100%)}
.ar-results .ar-result,.ar-rules .ar-result{max-width:440px}
.ar-screen.ar-results,.ar-screen.ar-rules,.ar-screen[data-screen=pause]{justify-content:center}
.ar[data-state=results] .ar-hud,.ar[data-state=dialogue] .ar-hud{display:none}
.ar-results .ar-result h2{color:var(--ink);text-shadow:none}
.ar-par{font-size:var(--fs-m);font-weight:900}
.ar-par span{color:#8a7a5a;font-size:24px}
.ar-par.on span{color:var(--honey2);text-shadow:0 1px 0 var(--ink)}
.ar-par small{font-weight:700;opacity:.8}
.ar-rule{display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:6px}
.ar-rule h3{margin:4px 0 0}
.ar-rule p{font-size:var(--fs-l)!important;font-weight:800;max-width:340px}
.ar-rulepic{width:260px;height:110px;border-radius:14px;border:3px solid var(--ink)}
.ar-rules .ar-result{max-height:calc(100% - 20px);overflow-y:auto}
.ar-node.won{background:linear-gradient(#eaffd9,#cdeeb5)}
.ar-node small{font-size:13px;font-weight:800}
.ar-chapter .ar-nodes{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.ar-finger{position:absolute;z-index:6;width:54px;height:54px;margin:-6px 0 0 -14px;pointer-events:none;filter:drop-shadow(0 3px 2px rgba(0,0,0,.35));transition:opacity .2s}
.ar-finger[hidden]{display:none}
.ar.narrow .ar-hud .ar-top{flex-wrap:wrap}
.ar.narrow .ar-pill.goal{flex:1 1 100%;order:0}
.ar.narrow .ar-pill.scent{order:1;flex:1}
.ar.narrow .ar-pill.scent .lbl{display:inline!important}
.ar.narrow .ar-pill.scent .pips{max-width:120px}
.ar.narrow .ar-hud [data-ui=rules],.ar.narrow .ar-hud [data-ui=menu]{order:2;min-height:40px;padding:4px 10px}
.ar.narrow .ar-hud .ar-bottom{flex-wrap:nowrap;gap:6px}
.ar.narrow .ar-hud .ar-bottom [data-ui=go]{min-width:116px}
`;
