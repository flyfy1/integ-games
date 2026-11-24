/**
 * All CSS for Crumb Raiders, scoped under `.ar` and injected inside the game root (destroy removes it).
 * Look: a summer picnic storybook. Cream paper panels with ink outlines, lawn greens, picnic-blanket red for the
 * main buttons, honey gold for anything earned. Type never goes under 14px; touch targets are at least 48px.
 */
export const STYLES = `
.ar{--ink:#2b1d14;--ink2:#4a3424;--paper:#fff6e3;--paper2:#f5e3bd;--lawn:#2f5a2a;--lawn2:#3f7536;--leaf:#8fcf5f;--red:#e8574a;--red2:#c43b30;--honey:#ffc94a;--honey2:#f0a92a;--sky:#bfe6ff;--good:#8fe08a;--bad:#ff7a6b;--dim:#e6dcc0;
  --fs-xs:14px;--fs-s:15px;--fs-m:17px;--fs-l:20px;--fs-xl:26px;
  position:relative;width:100%;height:var(--ar-h,560px);overflow:hidden;border-radius:16px;background:#2f5a2a;color:var(--paper);
  font-family:ui-rounded,"SF Pro Rounded","Nunito","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;font-size:16px;line-height:1.35;font-weight:600;
  user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;outline:none;text-align:left}
.ar *{box-sizing:border-box}
.ar.is-immersive{border-radius:0;height:100%}
.ar-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
:where(.ar button){font:inherit;color:inherit;cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none}
.ar button:focus-visible,.ar input:focus-visible{outline:3px solid #fff;outline-offset:3px;box-shadow:0 0 0 6px rgba(255,201,74,.6)}
.ar [hidden]{display:none!important}
.ar h1,.ar h2,.ar h3,.ar p{margin:0}

/* buttons */
.ar-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 20px;border-radius:14px;border:3px solid var(--ink);
  background:linear-gradient(#4f8a42,#3a6b31);color:var(--paper);font-weight:800;font-size:var(--fs-m);box-shadow:0 4px 0 var(--ink);transition:transform .08s,box-shadow .08s,filter .12s;white-space:nowrap}
.ar-btn:hover:not(:disabled){filter:brightness(1.08)}
.ar-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.ar-btn.primary{background:linear-gradient(#ff8a7a,var(--red) 55%,var(--red2));color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.25)}
.ar-btn.honey{background:linear-gradient(#ffe08a,var(--honey) 50%,var(--honey2));color:var(--ink)}
.ar-btn.paper{background:linear-gradient(var(--paper),var(--paper2));color:var(--ink)}
.ar-btn.ghost{background:rgba(20,40,18,.6);border-color:rgba(255,246,227,.35);box-shadow:none}
.ar-btn.big{min-height:60px;font-size:var(--fs-l);padding:12px 32px;border-radius:18px}
.ar-btn.small{min-height:44px;padding:6px 14px;font-size:var(--fs-s);border-radius:12px}
.ar-btn:disabled{opacity:.55;cursor:default;filter:grayscale(.5)}
.ar-sub{font-size:var(--fs-xs);font-weight:700;opacity:.85}

/* screens */
.ar-screen{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;overflow-y:auto;overflow-x:hidden;padding:14px 16px 20px;
  background:radial-gradient(120% 90% at 50% 0%,rgba(63,117,54,.55),rgba(20,40,18,.9));-webkit-overflow-scrolling:touch;animation:ar-fade .22s ease-out}
.ar-screen.clear{background:radial-gradient(90% 70% at 50% 45%,rgba(20,40,18,.15),rgba(20,40,18,.75))}
.ar-screen button{scroll-margin:70px 0 90px}
@keyframes ar-fade{from{opacity:0}to{opacity:1}}
.ar.reduced .ar-screen,.ar.reduced .ar-toast,.ar.reduced .ar-coach{animation:none}
.ar-head{position:sticky;top:-14px;z-index:2;flex:none;width:100%;max-width:900px;display:flex;align-items:center;gap:10px;margin:-14px 0 12px;padding:14px 0 10px;min-height:60px;background:linear-gradient(rgba(25,48,22,.96) 70%,rgba(25,48,22,0))}
.ar-head h2{flex:1;min-width:0;font-size:var(--fs-xl);font-weight:900;color:#fff1c0;text-shadow:0 2px 0 var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-body{width:100%;max-width:900px;display:flex;flex-direction:column;gap:12px}
.ar-panel{background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);border:3px solid var(--ink);border-radius:20px;padding:16px;box-shadow:0 5px 0 rgba(0,0,0,.3)}
.ar-panel h3{font-size:var(--fs-l);font-weight:900;margin-bottom:6px}
.ar-panel p{font-size:var(--fs-s)}
.ar-purse{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.35);border:2px solid rgba(255,246,227,.3);font-weight:900}
.ar-purse i{width:16px;height:16px;border-radius:4px;background:linear-gradient(135deg,#fff,#ffe9a8 50%,#f0c060);border:2px solid var(--ink);transform:rotate(45deg)}
.ar-stars{color:#5a4a30;letter-spacing:2px;font-size:18px}
.ar-stars i{font-style:normal}
.ar-stars i.on{color:var(--honey);text-shadow:0 1px 0 var(--ink)}

/* title */
.ar-title{justify-content:center;gap:14px;text-align:center;background:radial-gradient(80% 60% at 50% 40%,rgba(20,40,18,.25),rgba(20,40,18,.82))}
.ar-logo{font-size:clamp(40px,8vw,70px);font-weight:900;line-height:.95;color:#fff1c0;text-shadow:0 4px 0 var(--ink),0 0 24px rgba(255,201,74,.45);letter-spacing:-1px}
.ar-logo-zh{font-size:var(--fs-l);font-weight:900;letter-spacing:6px;color:#ffe9a8;text-shadow:0 2px 0 var(--ink)}
.ar-tag{max-width:440px;font-size:var(--fs-m);color:var(--paper);text-shadow:0 2px 0 rgba(0,0,0,.4)}
.ar-menu{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:min(440px,100%)}
.ar-menu .wide{grid-column:1/-1}
.ar-lang{display:flex;border:3px solid var(--ink);border-radius:14px;overflow:hidden;box-shadow:0 4px 0 var(--ink)}
.ar-lang button{flex:1;min-height:44px;border:0;background:#3a6b31;color:var(--paper);font-weight:800}
.ar-lang button[aria-pressed=true]{background:var(--honey);color:var(--ink)}

/* map */
.ar-tabs{display:flex;gap:8px;flex-wrap:wrap}
.ar-tab{flex:1;min-width:120px;min-height:48px;border:3px solid var(--ink);border-radius:14px;background:#3a6b31;color:var(--paper);font-weight:800;padding:6px 10px;box-shadow:0 3px 0 var(--ink)}
.ar-tab[aria-selected=true]{background:var(--honey);color:var(--ink)}
.ar-tab:disabled{opacity:.5}
.ar-nodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ar-node{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:96px;padding:10px 12px;border:3px solid var(--ink);border-radius:16px;background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);text-align:left;box-shadow:0 4px 0 var(--ink)}
.ar-node b{font-size:var(--fs-m);font-weight:900}
.ar-node .id{font-size:var(--fs-xs);font-weight:900;color:var(--red2)}
.ar-node.boss{background:linear-gradient(#ffe1c8,#ffc49a)}
.ar-node.current{outline:3px solid var(--honey);outline-offset:2px}
.ar-node:disabled{opacity:.5;filter:grayscale(.6)}
.ar-chapter-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}

/* loadout */
.ar-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ar-cardpick{display:flex;gap:10px;align-items:center;min-height:64px;padding:8px 10px;border:3px solid var(--ink);border-radius:14px;background:#fff;color:var(--ink);text-align:left;box-shadow:0 3px 0 var(--ink)}
.ar-cardpick[aria-pressed=true]{background:linear-gradient(#e9ffd9,#c9f5b8)}
.ar-cardpick canvas{width:44px;height:44px;flex:none}
.ar-cardpick small{display:block;font-size:12px;font-weight:700;opacity:.8}
.ar-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:var(--fs-s)}
.ar-facts dt{font-weight:900;color:var(--red2)}
.ar-facts dd{margin:0}
.ar-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}

/* hud */
.ar-hud{position:absolute;inset:0;z-index:3;pointer-events:none}
.ar-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:6px;padding:6px 8px;pointer-events:none}
.ar-top>*{pointer-events:auto}
.ar-pill{display:flex;align-items:center;gap:6px;min-height:40px;padding:4px 10px;border-radius:12px;background:rgba(25,40,20,.82);border:2px solid rgba(255,246,227,.25);font-weight:900;font-size:var(--fs-s);white-space:nowrap}
.ar-pill .bar{position:relative;width:54px;height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden}
.ar-pill .bar i{position:absolute;inset:0 auto 0 0;background:var(--honey);border-radius:4px}
.ar-pill.goal{flex:1;min-width:0;justify-content:center}
.ar-pill.goal span{overflow:hidden;text-overflow:ellipsis}
.ar-pill.goal .bar{width:auto;flex:1;max-width:160px;height:10px}
.ar-pill.goal .bar i{background:var(--good)}
.ar-pill.alarm .bar i{background:linear-gradient(90deg,#ffd24a,#ff5a3a)}
.ar-pill.alarm.hot{animation:ar-pulse .5s infinite alternate}
@keyframes ar-pulse{to{background:rgba(160,30,20,.9)}}
.ar-eye{width:22px;height:14px;border-radius:50%;background:#fff;border:2px solid var(--ink);position:relative}
.ar-eye:after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--ink)}
.ar-sugar{width:14px;height:14px;border-radius:3px;background:#fff;border:2px solid var(--ink);transform:rotate(12deg)}
.ar-sun{position:relative;width:62px;height:36px;flex:none}
.ar-sun svg{width:100%;height:100%;overflow:visible}
.ar-icon{display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:12px;border:3px solid var(--ink);background:linear-gradient(#4f8a42,#3a6b31);font-weight:900;font-size:var(--fs-s);box-shadow:0 3px 0 var(--ink);flex:none;line-height:1}
.ar-icon[aria-pressed=true]{background:var(--honey);color:var(--ink)}
.ar-bottom{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-end;justify-content:center;gap:6px;padding:6px 8px 8px;pointer-events:none}
.ar-bottom>*{pointer-events:auto}
.ar-hand{display:flex;gap:5px;padding:5px;border-radius:16px;background:rgba(25,40,20,.75);border:2px solid rgba(255,246,227,.2);overflow-x:auto;scrollbar-width:none;max-width:100%}
.ar-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:62px;min-width:62px;height:72px;padding:2px 2px 4px;border-radius:12px;border:3px solid var(--ink);background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);box-shadow:0 3px 0 var(--ink);overflow:hidden}
.ar-card canvas{width:40px;height:36px;margin-bottom:auto}
.ar-card b{font-size:12px;font-weight:900;line-height:1.1;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-card .cost{font-size:13px;font-weight:900;color:var(--red2)}
.ar-card .key{position:absolute;left:4px;top:2px;font-size:11px;font-weight:900;opacity:.55}
.ar-card .stock{position:absolute;right:3px;top:3px;min-width:18px;padding:0 4px;border-radius:9px;background:var(--good);border:2px solid var(--ink);font-size:11px;font-weight:900}
.ar-card .cd{position:absolute;inset:0;background:rgba(43,29,20,.45);transform-origin:bottom;pointer-events:none}
.ar-card.poor{filter:grayscale(.7) brightness(.85)}
.ar-card[aria-pressed=true]{background:linear-gradient(#e9ffd9,#9fe58f);transform:translateY(-4px)}
.ar-card.hl{outline:3px solid #fff;outline-offset:1px}
.ar-card.coach,.ar-queen.coach,.ar-icon.coach,.ar-pill.coach{animation:ar-glow .8s infinite alternate}
@keyframes ar-glow{to{box-shadow:0 0 0 5px rgba(255,201,74,.9),0 3px 0 var(--ink)}}
.ar-queens{display:flex;gap:5px}
.ar-queen{position:relative;display:grid;place-items:center;width:62px;height:58px;border-radius:22px;border:3px solid var(--ink);background:radial-gradient(circle at 35% 30%,#ffe9a8,var(--honey2));color:var(--ink);font-weight:900;font-size:11px;box-shadow:0 3px 0 var(--ink);overflow:hidden;padding:0;line-height:1.05;text-align:center}
.ar-queen .glyph{font-size:20px;line-height:1}
.ar-queen .cd{position:absolute;inset:0;border-radius:20px;pointer-events:none}
.ar-queen.active{background:radial-gradient(circle,#fff,#9fe58f)}
.ar-queen .key{position:absolute;right:9px;top:5px;font-size:10px;opacity:.6}
.ar-coach{position:absolute;left:50%;bottom:var(--ar-bottom,96px);z-index:4;transform:translateX(-50%);width:min(440px,calc(100% - 20px));padding:10px 14px;border-radius:16px;background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);border:3px solid var(--ink);box-shadow:0 5px 0 rgba(0,0,0,.35);pointer-events:none;animation:ar-fade .25s}
.ar-coach button{pointer-events:auto}
.ar.rot .ar-coach{bottom:auto;top:var(--ar-top,60px)}
.ar.rot .ar-toasts{top:auto;bottom:var(--ar-bottom,96px)}
.ar.is-immersive .ar-top{padding-left:56px}
.ar-coach p{font-size:var(--fs-m);font-weight:800}
.ar-coach footer{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:var(--fs-xs);font-weight:800;color:var(--red2)}
.ar-coach button{border:0;background:none;text-decoration:underline;font-weight:800;color:var(--ink);min-height:36px;padding:0 4px}
.ar-toasts{position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:min(420px,90%)}
.ar-toast{padding:8px 16px;border-radius:999px;background:rgba(25,40,20,.92);border:2px solid var(--honey);font-weight:900;font-size:var(--fs-m);text-align:center;animation:ar-fade .2s}
.ar-toast.bad{border-color:var(--bad);background:rgba(110,25,15,.92)}
.ar-toast.good{border-color:var(--good)}
.ar-notice{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:9;padding:8px 14px;border-radius:12px;background:rgba(0,0,0,.8);font-size:var(--fs-s)}

/* results / pause / dialogue */
.ar-result{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;max-width:520px;width:100%}
.ar-result h2{font-size:clamp(28px,6vw,42px);font-weight:900;color:#fff1c0;text-shadow:0 3px 0 var(--ink)}
.ar-bigstars{display:flex;gap:10px;justify-content:center}
.ar-bigstars div{display:flex;flex-direction:column;align-items:center;gap:4px;width:110px;font-size:var(--fs-xs);font-weight:800}
.ar-bigstars span{font-size:46px;line-height:1;color:#5a4a30;text-shadow:0 3px 0 var(--ink)}
.ar-bigstars .on span{color:var(--honey);animation:ar-star .5s ease-out backwards}
.ar-bigstars .on:nth-child(2) span{animation-delay:.25s}.ar-bigstars .on:nth-child(3) span{animation-delay:.5s}
@keyframes ar-star{from{transform:scale(2.2) rotate(-30deg);opacity:0}}
.ar.reduced .ar-bigstars .on span{animation:none}
.ar-statrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.ar-statrow div{min-width:96px;padding:8px 12px;border-radius:12px;background:rgba(0,0,0,.3);font-size:var(--fs-xs)}
.ar-statrow b{display:block;font-size:var(--fs-l);color:#fff1c0}
.ar-dialogue{position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;justify-content:flex-end;padding:16px;background:linear-gradient(rgba(20,40,18,.2),rgba(20,40,18,.85))}
.ar-say{max-width:640px;width:100%;margin:0 auto;padding:16px 18px;border-radius:20px;background:linear-gradient(var(--paper),var(--paper2));color:var(--ink);border:3px solid var(--ink);box-shadow:0 6px 0 rgba(0,0,0,.35)}
.ar-say h4{margin:0 0 6px;font-size:var(--fs-m);font-weight:900}
.ar-say p{font-size:var(--fs-l);font-weight:700;min-height:2.7em}
.ar-say footer{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.ar-portrait{width:72px;height:72px;margin:0 auto 8px;display:block}
.ar-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px}
.ar-row input[type=range]{width:min(220px,50vw);accent-color:var(--red)}
.ar-switch{width:58px;height:34px;border-radius:17px;border:3px solid var(--ink);background:#bbb;position:relative;padding:0}
.ar-switch[aria-checked=true]{background:var(--good)}
.ar-switch:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid var(--ink);transition:left .15s}
.ar-switch[aria-checked=true]:after{left:26px}

/* compact / phones */
.ar.compact .ar-card{width:58px;min-width:58px;height:68px}
.ar.compact .ar-card canvas{width:32px;height:28px}
.ar.compact .ar-card b{font-size:11px}
.ar.compact .ar-queen{width:54px;height:50px;font-size:10px}
.ar.compact .ar-queen .glyph{font-size:17px}
.ar.compact .ar-pill{min-height:36px;padding:3px 8px;font-size:14px}
.ar.compact .ar-sun{width:50px}
.ar.narrow .ar-pill .lbl{display:none}
.ar.narrow .ar-bottom{flex-wrap:wrap}
.ar.narrow .ar-hand{order:2;width:100%;justify-content:center}
.ar.narrow .ar-queens{order:1}
.ar.narrow .ar-top{flex-wrap:wrap}
.ar.narrow .ar-pill.goal{order:5;flex-basis:100%}
`;
