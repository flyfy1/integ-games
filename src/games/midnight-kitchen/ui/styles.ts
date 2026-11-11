/**
 * All CSS for Midnight Kitchen, scoped under `.mk`. Injected once per mount as a <style> inside the root, so nothing
 * leaks into the arcade shell and destroy() removes it with the root.
 *
 * One UI kit, "a cookbook on the counter at night": deep night-blue scrims, cream recipe-card paper with ink
 * outlines, warm amber for anything you can press or earn. Tokens first, then components, then screens, then the
 * in-level HUD, then breakpoints. Type scale never goes under 14px.
 */
export const STYLES = `
.mk{--ink:#2a1a12;--ink2:#4a3424;--night:#141936;--night2:#1d2450;--night3:#283271;--line:#3b4686;--cream:#fff4e0;--paper:#fbecd0;--paper2:#f2dcb4;--dim:#c3c9ec;--mute:#8d95c4;
  --amber:#ffb454;--amber2:#ff9a3c;--gold:#ffd24a;--good:#8fe08a;--good2:#4fae5a;--bad:#ff7a6b;--bad2:#d9473a;--pink:#ff9fc6;--teal:#7fd6c8;
  --fs-xs:14px;--fs-s:15px;--fs-m:17px;--fs-l:20px;--fs-xl:26px;--fs-xxl:34px;--r:16px;--gap:12px;--safe-l:0px;
  position:relative;width:100%;height:var(--mk-h,560px);overflow:hidden;border-radius:16px;background:#0f1430;color:var(--cream);
  font-family:ui-rounded,"SF Pro Rounded","Nunito","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;font-size:16px;line-height:1.35;font-weight:600;
  user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;outline:none;text-align:left}
.mk *{box-sizing:border-box}
.mk.is-immersive{border-radius:0;height:100%;--safe-l:52px}
.mk-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
:where(.mk button){font:inherit;color:inherit;cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none}
.mk button:focus-visible,.mk input:focus-visible,.mk [tabindex]:focus-visible{outline:3px solid #fff;outline-offset:3px;box-shadow:0 0 0 6px rgba(255,180,84,.55)}
.mk [hidden]{display:none!important}
.mk h1,.mk h2,.mk h3,.mk h4,.mk p{margin:0}

/* ================= kit: buttons ================= */
.mk-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 20px;border-radius:14px;border:3px solid var(--ink);
  background:linear-gradient(#34407f,#232b5c);color:var(--cream);font-weight:800;font-size:var(--fs-m);box-shadow:0 4px 0 var(--ink);transition:transform .08s,box-shadow .08s,filter .12s;white-space:nowrap}
.mk-btn:hover:not(:disabled){filter:brightness(1.08)}
.mk-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.mk-btn.primary{background:linear-gradient(#ffd08a,#ffb454 45%,#ff9a3c);color:var(--ink)}
.mk-btn.paper{background:linear-gradient(var(--cream),var(--paper2));color:var(--ink)}
.mk-btn.danger{background:linear-gradient(#ffb3a6,#ff7a6b);color:var(--ink)}
.mk-btn.good{background:linear-gradient(#c9f5b8,#8fe08a);color:var(--ink)}
.mk-btn.ghost{background:rgba(20,25,54,.72);border-color:var(--line);box-shadow:none}
.mk-btn.big{min-height:58px;font-size:var(--fs-l);padding:12px 28px;border-radius:18px}
.mk-btn.small{min-height:44px;padding:6px 14px;font-size:var(--fs-s);border-radius:12px}
.mk-btn:disabled{opacity:.55;cursor:default;filter:grayscale(.4)}
.mk-btn .mk-sub{font-size:var(--fs-xs);font-weight:700;opacity:.8}
.mk-btn.back{padding:6px 14px 6px 10px;min-height:44px;font-size:var(--fs-s)}
.mk-btn.back span:first-child{font-size:22px;line-height:1}
.mk-icon-btn{display:grid;place-items:center;width:46px;height:46px;min-height:46px;padding:0;border-radius:14px;border:3px solid var(--ink);background:linear-gradient(#34407f,#232b5c);font-weight:900;font-size:var(--fs-s);box-shadow:0 3px 0 var(--ink);flex:none;line-height:1}
.mk-icon-btn.is-on{background:linear-gradient(#ffd08a,var(--amber));color:var(--ink)}
.mk-icon-btn svg{width:20px;height:20px;display:block}
.mk-gear{font-size:24px;line-height:1}
.mk-door .mk-tagnew{top:-10px;left:auto;right:-6px}
.mk-btn.back{min-width:46px}

/* ================= kit: surfaces ================= */
.mk-screen{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;overflow-y:auto;overflow-x:hidden;padding:14px 16px 18px;
  background:radial-gradient(120% 90% at 50% 10%,rgba(29,36,80,.55),rgba(10,13,34,.9));-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--line) transparent;animation:mk-fade .22s ease-out}
/* Keyboard / pad focus scrolls a control clear of the sticky header and the sticky action bars. */
.mk-screen button,.mk-screen input{scroll-margin:76px 0 96px}
.mk-screen.clear{background:radial-gradient(90% 70% at 50% 45%,rgba(10,13,34,.25),rgba(10,13,34,.82))}
.mk-screen-head{position:sticky;top:-14px;z-index:2;flex:none;width:100%;max-width:960px;display:flex;align-items:center;gap:10px;margin:-14px 0 12px;padding:14px 0 10px;min-height:60px;
  background:linear-gradient(rgba(14,18,44,.96) 70%,rgba(14,18,44,0))}
.mk.is-immersive .mk-screen-head{padding-left:var(--safe-l)}
.mk-screen-head h2{flex:1;min-width:0;font-size:var(--fs-xl);font-weight:900;color:#ffe9a8;text-shadow:0 2px 0 var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mk-head-extra{display:flex;gap:8px;align-items:center;flex:none}
.mk-body{width:100%;max-width:960px;display:flex;flex-direction:column;gap:var(--gap)}
.mk-panel{position:relative;background:linear-gradient(rgba(40,50,113,.94),rgba(29,36,80,.94));border:3px solid var(--ink);border-radius:20px;padding:16px;box-shadow:0 5px 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)}
.mk-panel.paper{background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 5px 0 rgba(0,0,0,.35)}
.mk-panel.paper::before{content:"";position:absolute;inset:6px;border:2px dashed rgba(42,26,18,.14);border-radius:14px;pointer-events:none}
.mk-panel h3{font-size:var(--fs-l);font-weight:900;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.mk-panel p{color:var(--dim);font-size:var(--fs-s)}
.mk-panel.paper p{color:var(--ink2)}
.mk-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.mk-row.center{justify-content:center}
.mk-grow{flex:1;min-width:0}
.mk-eyebrow{font-size:var(--fs-xs);font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)}
.mk-panel.paper .mk-eyebrow{color:#b5650d}
.mk-lead{font-size:var(--fs-m);color:var(--cream)}
.mk-panel.paper .mk-lead{color:var(--ink)}

/* ================= kit: small parts ================= */
.mk-purse{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px 0 10px;border-radius:999px;background:rgba(16,20,44,.9);border:2px solid var(--line);font-weight:900;color:#ffe2a8;font-variant-numeric:tabular-nums;font-size:var(--fs-m)}
.mk-crumb{width:16px;height:13px;border-radius:4px 7px 5px 8px;background:radial-gradient(circle at 35% 35%,#f6d79b,#d9a65c);border:2px solid var(--ink);display:inline-block;transform:rotate(-12deg)}
.mk-staricon{font-style:normal;color:var(--gold);text-shadow:0 2px 0 var(--ink);font-size:18px}
.mk-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:rgba(16,20,44,.85);border:2px solid var(--line);font-size:var(--fs-xs);font-weight:800;color:#ffe2a8;white-space:nowrap}
.mk-panel.paper .mk-chip,.mk-card-paper .mk-chip{background:rgba(42,26,18,.08);border-color:rgba(42,26,18,.25);color:var(--ink)}
.mk-chip.good{color:#1f5a26;background:#c9f5b8;border-color:var(--ink)}
.mk-chip.warn{color:#6a1d14;background:#ffc2b8;border-color:var(--ink)}
.mk-tagnew{position:absolute;top:-9px;left:-6px;z-index:2;padding:1px 8px;border-radius:999px;background:linear-gradient(#ff8a7a,#e8503f);color:#fff;font-size:var(--fs-xs);font-weight:900;border:2px solid var(--ink);transform:rotate(-8deg);box-shadow:0 2px 0 var(--ink);font-style:normal;line-height:1.3}
.mk-stars{display:inline-flex;gap:2px;font-size:20px;letter-spacing:0;color:#4a5391}
.mk-stars i{font-style:normal;line-height:1}
.mk-stars i.on{color:var(--gold);text-shadow:0 2px 0 var(--ink)}
.mk-pips{display:inline-flex;gap:5px;vertical-align:middle}
.mk-pips i{width:14px;height:14px;border-radius:50%;border:2px solid var(--ink);background:#10142c}
.mk-pips i.on{background:var(--amber)}
.mk-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:5px;border-radius:16px;background:rgba(16,20,44,.75);border:2px solid var(--line)}
.mk-tabs button{flex:1 1 auto;min-height:44px;padding:6px 14px;border-radius:12px;border:0;background:transparent;font-weight:800;font-size:var(--fs-s);color:var(--dim);display:inline-flex;align-items:center;justify-content:center;gap:6px}
.mk-tabs button small{font-size:var(--fs-xs);opacity:.85}
.mk-tabs button[aria-selected=true]{background:linear-gradient(#ffd08a,var(--amber));color:var(--ink);box-shadow:0 3px 0 var(--ink)}
.mk-lang{display:inline-flex;border:3px solid var(--ink);border-radius:14px;overflow:hidden;box-shadow:0 3px 0 var(--ink)}
.mk-lang button{min-width:56px;min-height:44px;border:0;background:var(--night3);font-weight:900;padding:0 14px;font-size:var(--fs-s)}
.mk-lang button[aria-pressed=true]{background:var(--amber);color:var(--ink)}
.mk-setting{display:flex;align-items:center;gap:14px;min-height:56px;padding:8px 0;border-bottom:2px dashed rgba(255,255,255,.08)}
.mk-setting:last-child{border-bottom:0}
.mk-setting-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mk-setting-text b{font-size:var(--fs-m)}
.mk-setting-text small,.mk-setting-text output{font-size:var(--fs-xs);color:var(--dim);font-weight:700}
.mk-setting.slider{flex-wrap:wrap}
.mk-setting.slider .mk-setting-text{flex-direction:row;justify-content:space-between;align-items:baseline;flex-basis:100%}
.mk-setting.slider input{flex:1;width:100%}
.mk-switch{position:relative;flex:none;width:76px;height:44px;min-height:44px;border-radius:999px;border:3px solid var(--ink);background:#10142c;padding:0}
.mk-switch i{position:absolute;top:4px;left:4px;width:30px;height:30px;border-radius:50%;background:var(--mute);border:2px solid var(--ink);transition:left .15s,background .15s}
.mk-switch[aria-checked=true]{background:linear-gradient(#ffd08a,var(--amber))}
.mk-switch[aria-checked=true] i{left:36px;background:var(--cream)}
.mk-setting.has-switch{cursor:pointer}
.mk input[type=range]{-webkit-appearance:none;appearance:none;height:44px;background:transparent;cursor:pointer;--fill:50%}
.mk input[type=range]::-webkit-slider-runnable-track{height:12px;border-radius:999px;border:2px solid var(--ink);background:linear-gradient(90deg,var(--amber) var(--fill),#10142c var(--fill))}
.mk input[type=range]::-moz-range-track{height:12px;border-radius:999px;border:2px solid var(--ink);background:linear-gradient(90deg,var(--amber) var(--fill),#10142c var(--fill))}
.mk input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-11px;border-radius:50%;background:var(--cream);border:3px solid var(--ink);box-shadow:0 2px 0 var(--ink)}
.mk input[type=range]::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:var(--cream);border:3px solid var(--ink)}
.mk-notice{position:absolute;z-index:20;left:50%;bottom:14px;transform:translateX(-50%);max-width:calc(100% - 24px);padding:10px 16px;border-radius:14px;border:3px solid var(--ink);background:var(--cream);color:var(--ink);font-size:var(--fs-s);font-weight:800;box-shadow:0 5px 0 rgba(0,0,0,.35);animation:mk-rise .25s;pointer-events:none;text-align:center}

/* ================= title ================= */
.mk-title{margin:auto;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;width:100%;max-width:560px;padding:10px 0}
.mk-logo{font-size:clamp(40px,9vw,70px);line-height:.95;font-weight:900;color:#ffe9a8;text-shadow:0 3px 0 var(--ink),0 7px 0 rgba(0,0,0,.35),0 0 44px rgba(255,180,84,.5);letter-spacing:.01em}
.mk-logo small{display:block;font-size:max(14px,.34em);color:var(--cream);letter-spacing:.32em;margin-top:10px;text-shadow:0 2px 0 var(--ink)}
.mk-moon{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 62% 40%,transparent 44%,#ffe9a8 45%);filter:drop-shadow(0 0 16px rgba(255,233,168,.6));margin-bottom:-6px}
.mk-tag{color:var(--cream);font-size:var(--fs-m);text-shadow:0 1px 4px #000;max-width:440px}
.mk-title-main{display:flex;flex-direction:column;gap:10px;align-items:stretch;width:min(100%,360px)}
.mk-title-main .mk-btn.big{flex-direction:column;gap:0;line-height:1.15}
.mk-title-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:min(100%,360px)}
.mk-title-grid .mk-btn{justify-content:flex-start;padding:8px 12px;font-size:var(--fs-s)}
.mk-title-grid .mk-btn .mk-ico{font-size:20px;width:24px;text-align:center}
.mk-title-foot{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap}

/* ================= chapter map ================= */
.mk-chapters{display:flex;gap:8px;overflow-x:auto;padding:12px 6px 8px;margin:0 -4px;scroll-snap-type:x mandatory;scrollbar-width:none}
.mk-chapters::-webkit-scrollbar{display:none}
.mk-chapter{position:relative;flex:1 0 132px;scroll-snap-align:start;display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:84px;padding:10px 12px;border-radius:16px;border:3px solid var(--ink);
  background:linear-gradient(160deg,var(--ch1,#3a477f),var(--ch2,#232b5c));box-shadow:0 4px 0 var(--ink);text-align:left}
.mk-chapter b{font-size:var(--fs-m);font-weight:900;line-height:1.15}
.mk-chapter small{font-size:var(--fs-xs);font-weight:800;opacity:.9}
.mk-chapter[aria-selected=true]{outline:3px solid var(--amber);outline-offset:2px;transform:translateY(-2px)}
.mk-chapter.locked{filter:saturate(.25) brightness(.7);box-shadow:none}
.mk-chapter .mk-tagnew{top:-10px;left:auto;right:-4px;transform:rotate(6deg)}
.mk-chapter.soon{border-style:dashed;background:rgba(16,20,44,.7)}
.mk-chapter-hero{display:flex;gap:14px;align-items:center;overflow:hidden;background:linear-gradient(120deg,var(--ch1,#3a477f),var(--ch2,#1d2450))}
.mk-chapter-hero h3{font-size:var(--fs-xl);margin:0}
.mk-chapter-hero .mk-grow p{color:var(--cream);opacity:.92}
.mk-chapter-hero .mk-hero-num{flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.25);border:3px solid var(--ink);font-size:30px;font-weight:900;color:#ffe9a8;text-shadow:0 2px 0 var(--ink)}
.mk-ribbon{position:absolute;top:10px;right:-34px;transform:rotate(35deg);padding:2px 40px;background:var(--bad);color:#fff;font-weight:900;font-size:var(--fs-xs);border:2px solid var(--ink)}
.mk-path{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:8px 2px}
.mk-path::before{content:"";position:absolute;left:8%;right:8%;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:repeating-linear-gradient(90deg,rgba(255,233,168,.5) 0 12px,transparent 12px 22px)}
.mk-node{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:150px;padding:12px 8px 10px;border-radius:20px;border:3px solid var(--ink);
  background:linear-gradient(var(--cream),var(--paper2));color:var(--ink);box-shadow:0 5px 0 var(--ink);text-align:center}
.mk-node:active:not(:disabled){transform:translateY(3px);box-shadow:0 2px 0 var(--ink)}
.mk-node .mk-node-num{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--night2);color:#ffe9a8;border:3px solid var(--ink);font-size:var(--fs-l);font-weight:900}
.mk-node b{font-size:var(--fs-s);font-weight:900;line-height:1.2}
.mk-node .mk-stars{font-size:19px}
.mk-node .mk-stars i:not(.on){color:rgba(42,26,18,.22)}
.mk-node.boss{background:linear-gradient(#ffd6dc,#f29aa9)}
.mk-node.boss .mk-node-num{background:#7d2f45;font-size:22px}
.mk-node.current{box-shadow:0 5px 0 var(--ink),0 0 0 4px var(--amber),0 0 24px rgba(255,180,84,.6)}
.mk-node.current::after{content:"";position:absolute;top:-12px;left:50%;width:16px;height:16px;margin-left:-8px;background:var(--amber);border:3px solid var(--ink);transform:rotate(45deg);animation:mk-bob 1.2s ease-in-out infinite}
.mk-node:disabled{background:rgba(16,20,44,.85);color:var(--mute);border-color:var(--line);box-shadow:none;cursor:default}
.mk-node:disabled .mk-node-num{background:#10142c;color:var(--mute);border-color:var(--line)}
.mk-node em{font-style:normal;font-size:var(--fs-xs);font-weight:800;color:inherit;opacity:.85}
.mk-map-extra{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mk-door{position:relative;display:flex;align-items:center;gap:12px;min-height:76px;padding:10px 14px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(#34407f,#232b5c);box-shadow:0 4px 0 var(--ink);text-align:left}
.mk-door .mk-door-ico{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:rgba(0,0,0,.25);font-size:24px}
.mk-door b{display:block;font-size:var(--fs-m);font-weight:900}
.mk-door small{display:block;font-size:var(--fs-xs);color:var(--dim);font-weight:700}
.mk-door.endless{background:linear-gradient(#2c6470,#1c3a4a)}
.mk-door:disabled{opacity:.6;box-shadow:none;cursor:default}

/* ================= loadout / briefing ================= */
.mk-brief{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:var(--gap)}
.mk-brief-recipes{margin-top:12px;padding-top:10px;border-top:2px dashed rgba(181,101,13,.35)}
.mk-brief-recipes .mk-eyebrow{color:#9a5a12}
.mk-brief-recipes .mk-recipe-hint{padding:2px 12px 2px 6px;border-radius:12px;background:rgba(255,255,255,.6);color:var(--ink)}
.mk-brief-recipes p{color:#6b5640}
.mk-facts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.mk-goal{display:flex;align-items:center;gap:10px;margin-top:10px;padding:8px 12px;border-radius:14px;background:rgba(255,210,74,.12);border:2px dashed rgba(255,210,74,.55);color:#ffe9a8;font-weight:800;font-size:var(--fs-s)}
.mk-goal::before{content:"★";color:var(--gold);font-size:22px;text-shadow:0 2px 0 var(--ink)}
.mk-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
.mk-pick{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px 8px;border-radius:16px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper2));color:var(--ink);box-shadow:0 4px 0 var(--ink);min-height:132px}
.mk-pick b{font-size:var(--fs-xs);font-weight:900;text-align:center;line-height:1.15}
.mk-pick .mk-cost{font-size:var(--fs-xs);font-weight:900;color:#a85a00}
.mk-pick[aria-pressed=false]{background:rgba(42,50,102,.9);color:var(--dim);box-shadow:none;border-color:var(--line)}
.mk-pick[aria-pressed=false] .mk-cost{color:var(--dim)}
.mk-pick[aria-pressed=false] canvas{filter:grayscale(.8) brightness(.85)}
.mk-pick[aria-pressed=true]::after{content:"✓";position:absolute;top:4px;right:8px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--good);border:2px solid var(--ink);font-weight:900;font-size:14px;color:var(--ink)}
.mk-pick.rec{outline:3px dashed rgba(255,180,84,.7);outline-offset:2px}
.mk-pick .mk-role{font-size:var(--fs-xs);font-weight:800;opacity:.75}
.mk-visitors{display:flex;gap:8px;flex-wrap:wrap}
.mk-visitor{position:relative;display:flex;align-items:center;gap:8px;padding:4px 12px 4px 4px;border-radius:14px;background:rgba(16,20,44,.85);border:2px solid var(--line);font-size:var(--fs-s);max-width:100%}
.mk-visitor canvas{flex:none}
.mk-clue{margin-top:4px;font-style:italic;color:#ffe9a8;font-size:var(--fs-s)}
.mk-entry:not(.unknown) .mk-clue{color:#7a4a12}
.mk-visitor div{display:flex;flex-direction:column;min-width:0}
.mk-visitor em{font-style:normal;color:var(--dim);font-size:var(--fs-xs);font-weight:700}
.mk-recipe-hints{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.mk-recipe-hint{display:flex;align-items:center;gap:8px;font-size:var(--fs-s);font-weight:800}
.mk-recipe-hint .mk-parts{display:flex;align-items:center;gap:0;flex:none}
.mk-recipe-hint .mk-parts canvas{margin:0 -4px}
.mk-secret-ico{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;border:2px dashed currentColor;font-weight:900;opacity:.7}
.mk-recipe-hint.secret{font-style:italic;opacity:.85}
/* The action bar is opaque with a soft fade above it, so cards scrolling under it read as "more below", never as
   greyed-out picks; the body gets matching bottom room so the last row of cards can always scroll clear of it. */
.mk-loadout-foot{position:sticky;bottom:-18px;z-index:2;margin:0 -16px -18px;padding:10px 16px 14px;display:flex;gap:6px 14px;align-items:center;justify-content:center;flex-wrap:wrap;background:#0e122c;border-top:2px solid var(--line);box-shadow:0 -22px 18px -4px rgba(14,18,44,.92)}
.mk-loadout-foot p{flex:1 1 220px;max-width:520px;text-align:center;font-size:var(--fs-s);color:var(--dim)}
.mk-loadout-foot p:empty{display:none}
.mk-loadout-foot .mk-btn.big{min-height:52px;padding:10px 28px}
.mk-loadout-side{display:contents}
.mk{container-type:inline-size;container-name:mk;isolation:isolate}
@media (min-height:560px){@container mk (min-width:860px){
  .mk-loadout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:start;max-width:1180px}
  .mk-loadout>.mk-brief{grid-template-columns:1fr;grid-column:1}
  .mk-loadout>.mk-panel{grid-column:1}
  .mk-loadout-side{grid-column:2;grid-row:1/span 3;position:sticky;top:62px;display:flex;flex-direction:column;gap:var(--gap);max-height:calc(var(--mk-h,700px) - 88px)}
  .mk-loadout-side>.mk-panel{flex:0 1 auto;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
  .mk-loadout-foot{position:static;margin:0;padding:0;background:none;border:0;box-shadow:none;flex:none;justify-content:flex-end}
  .mk-loadout-foot p{text-align:right}
  .mk-loadout .mk-picks{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
}}
.mk-records{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.mk-record{padding:10px;border-radius:14px;background:rgba(16,20,44,.8);border:2px solid var(--line);text-align:center}
.mk-record b{display:block;font-size:var(--fs-xl);font-weight:900;color:#ffe9a8;font-variant-numeric:tabular-nums}
.mk-record small{font-size:var(--fs-xs);color:var(--dim);font-weight:800}
.mk-rules{margin:8px 0 0;padding-left:20px;color:var(--cream);font-size:var(--fs-s);display:flex;flex-direction:column;gap:4px}

/* ================= results ================= */
.mk-results{margin:auto;width:100%;max-width:560px;text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;padding:6px 0}
.mk-results h2{font-size:var(--fs-xxl);font-weight:900;color:#ffe9a8;text-shadow:0 3px 0 var(--ink),0 0 30px rgba(255,180,84,.45);animation:mk-pop .45s backwards}
.mk-results.lost h2{color:#ffc4ba;text-shadow:0 3px 0 var(--ink)}
.mk-results .mk-tag{font-size:var(--fs-m)}
.mk-bigstars{display:flex;gap:6px;justify-content:center;width:100%}
.mk-bigstar{position:relative;flex:1;max-width:150px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--dim);font-weight:800;line-height:1.25}
.mk-bigstar i.g{font-style:normal;font-size:58px;line-height:1;color:#323a72;text-shadow:0 4px 0 var(--ink)}
.mk-bigstar:nth-child(2) i.g{font-size:70px;margin-top:-10px}
.mk-bigstar.on{color:var(--cream)}
.mk-bigstar.on i.g{color:var(--gold);text-shadow:0 4px 0 var(--ink),0 0 26px rgba(255,210,74,.7);animation:mk-star .55s cubic-bezier(.3,1.6,.5,1) backwards;animation-delay:var(--d,0s)}
.mk-bigstar.had i.g{animation:none}
.mk-bigstar .mk-tagnew{top:-2px;left:auto;right:6px;animation:mk-pop .3s backwards;animation-delay:var(--d,0s)}
.mk-statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;width:100%}
.mk-stat{padding:8px 6px;border-radius:14px;background:rgba(16,20,44,.85);border:2px solid var(--line)}
.mk-stat b{display:block;font-size:var(--fs-l);font-weight:900;color:var(--cream);font-variant-numeric:tabular-nums}
.mk-stat small{font-size:var(--fs-xs);color:var(--dim);font-weight:800}
.mk-reward{display:flex;align-items:center;gap:12px;width:100%;text-align:left;animation:mk-rise .4s backwards;animation-delay:var(--d,0s)}
.mk-reward canvas{flex:none;border-radius:14px;background:rgba(42,26,18,.08)}
.mk-reward h3{margin:0 0 2px;font-size:var(--fs-m)}
.mk-reward .mk-door-ico{flex:none;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;border:3px solid var(--ink);background:radial-gradient(circle at 40% 35%,#ffe9a8,var(--amber));color:var(--ink);font-weight:900;line-height:1;box-shadow:0 3px 0 rgba(0,0,0,.3)}
.mk-pb{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:999px;background:linear-gradient(#ffe08a,var(--gold));color:var(--ink);border:3px solid var(--ink);font-weight:900;font-size:var(--fs-m);box-shadow:0 4px 0 var(--ink);animation:mk-pop .5s backwards .3s}
.mk-bigscore{font-size:52px;font-weight:900;line-height:1;color:#ffe9a8;text-shadow:0 4px 0 var(--ink);font-variant-numeric:tabular-nums}
/* Results sit on a strong scrim (the board stays a dim hint, never behind text), and the action bar is opaque with a
   fade above it, so a reward card scrolling under it looks deliberately tucked away rather than cut. */
.mk-screen[data-screen=results]{background:radial-gradient(110% 80% at 50% 35%,rgba(14,18,44,.86),rgba(8,10,26,.95))}
.mk-results-actions{position:sticky;bottom:-18px;z-index:2;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;width:calc(100% + 32px);margin:4px -16px -18px;padding:10px 16px 14px;background:#0c1028;border-top:2px solid var(--line);box-shadow:0 -24px 18px -4px rgba(12,16,40,.95)}
.mk-results-actions .mk-btn{flex:1 1 120px;max-width:220px}

/* ================= cookbook / shop entries ================= */
.mk-entries{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.mk-entry{position:relative;display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 4px 0 rgba(0,0,0,.3)}
.mk-entry canvas{flex:none;border-radius:14px;background:radial-gradient(circle at 50% 40%,#ffffff,#ead3a8)}
.mk-entry h4{font-size:var(--fs-m);font-weight:900;margin-bottom:2px}
.mk-entry p{font-size:var(--fs-xs);color:var(--ink2);font-weight:700}
.mk-entry .mk-stats-mini{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:var(--fs-xs);color:var(--ink2);font-weight:800}
.mk-entry .mk-stats-mini b{color:var(--ink)}
.mk-entry.unknown{background:rgba(29,36,80,.9);color:var(--mute);border-color:var(--line);box-shadow:none}
.mk-entry.unknown canvas{background:rgba(0,0,0,.25)}
.mk-entry.unknown p{color:var(--mute)}
.mk-entry .mk-chips{display:flex;gap:4px;flex-wrap:wrap;margin:3px 0 5px}
.mk-recipe-parts{display:flex;align-items:center;gap:0;flex:none;font-weight:900;font-size:var(--fs-l)}
.mk-recipe-parts span{margin:0 -2px}
.mk-recipe-swatch{position:absolute;top:10px;right:10px;width:16px;height:16px;border-radius:50%;border:2px solid var(--ink)}
.mk-lore{display:flex;flex-direction:column;gap:10px}
.mk-lore-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink)}
.mk-lore-item.locked{background:rgba(29,36,80,.9);color:var(--mute);border-color:var(--line)}
.mk-lore-item q{display:block;font-size:var(--fs-xs);color:var(--ink2);font-weight:700;quotes:"“" "”"}
.mk-lore-item b{font-size:var(--fs-m)}
.mk-lore-item.locked q{color:var(--dim)}
.mk-shop-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mk-effect{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-top:6px;font-size:var(--fs-xs);font-weight:800;color:var(--ink2)}
.mk-effect .arrow{color:#b5650d}
.mk-effect .next{color:#1f6a2a}

/* ================= pause ================= */
.mk-pause{margin:auto;display:flex;flex-direction:column;gap:10px;align-items:stretch;width:min(100%,380px);text-align:center}
.mk-pause h2{font-size:var(--fs-xxl);font-weight:900;text-shadow:0 3px 0 var(--ink);color:#ffe9a8}
.mk-pause .mk-sub{color:var(--dim);font-size:var(--fs-s);margin-top:-4px}
.mk-pause .mk-panel{text-align:left}
.mk-keys{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:var(--fs-s);color:var(--cream);margin-top:8px}
.mk-keys kbd{display:inline-block;min-width:30px;padding:2px 8px;border-radius:8px;border:2px solid var(--ink);background:var(--cream);color:var(--ink);font:inherit;font-weight:900;font-size:var(--fs-xs);text-align:center;box-shadow:0 2px 0 var(--ink)}

/* ================= dialogue ================= */
.mk-dialogue{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:12px 12px 16px;background:linear-gradient(rgba(8,10,28,.25),rgba(8,10,28,.85) 70%);cursor:pointer;animation:mk-fade .25s}
.mk-dialogue-bar{position:absolute;top:10px;right:10px;left:10px;display:flex;gap:8px;justify-content:flex-end}
.mk.is-immersive .mk-dialogue-bar{left:var(--safe-l)}
.mk-dialogue-box{position:relative;width:100%;max-width:760px;display:flex;gap:12px;align-items:flex-end}
.mk-dialogue-box.right{flex-direction:row-reverse}
.mk-portrait{flex:none;width:124px;height:124px;border-radius:24px;border:3px solid var(--ink);background:radial-gradient(circle at 50% 35%,#5a6ac0,#232b5c);box-shadow:0 5px 0 rgba(0,0,0,.35);overflow:hidden;display:grid;place-items:center;animation:mk-pop .3s}
.mk-speech{flex:1;min-width:0;min-height:124px;padding:14px 18px 30px;border-radius:20px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 5px 0 rgba(0,0,0,.35);position:relative}
.mk-nameplate{position:absolute;top:-18px;left:16px;padding:3px 14px;border-radius:999px;border:3px solid var(--ink);background:var(--cream);color:var(--ink);font-size:var(--fs-s);font-weight:900;box-shadow:0 3px 0 var(--ink)}
.mk-dialogue-box.right .mk-nameplate{left:auto;right:16px}
.mk-speech p{font-size:var(--fs-m);line-height:1.45;font-weight:700;min-height:2.9em;margin-top:6px}
.mk-portrait canvas{width:92%!important;height:92%!important}
.mk-speech small{position:absolute;right:16px;bottom:8px;font-size:var(--fs-xs);color:#6f5236;font-weight:800;animation:mk-blink 1.2s infinite}
.mk-dots{display:flex;gap:5px;justify-content:center;margin-top:10px}
.mk-dots i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.25)}
.mk-dots i.on{background:var(--amber)}
.mk-log{position:absolute;inset:60px 12px 12px;z-index:2;max-width:760px;margin:0 auto;overflow-y:auto;padding:14px;border-radius:20px;border:3px solid var(--ink);background:rgba(16,20,44,.97);cursor:default;display:flex;flex-direction:column;gap:10px}
.mk-log div{font-size:var(--fs-s);color:var(--cream)}
.mk-log b{color:var(--amber);margin-right:6px}

/* ================= HUD ================= */
.mk-hud{position:absolute;inset:0;pointer-events:none;z-index:2}
.mk-hud>*{pointer-events:auto}
.mk-top{position:absolute;top:6px;left:6px;right:6px;display:flex;align-items:center;gap:6px;pointer-events:none}
.mk-top>*{pointer-events:auto}
.mk.is-immersive .mk-top{left:calc(var(--safe-l) + 6px)}
.mk-heat{position:relative;display:flex;align-items:center;gap:4px;height:46px;padding:0 14px 0 6px;border-radius:15px;border:3px solid var(--ink);background:linear-gradient(#4a3320,#2a1a12);color:#ffd27a;font-weight:900;font-size:22px;font-variant-numeric:tabular-nums;flex:none;min-width:94px;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.mk-heat canvas{flex:none}
.mk-heat.is-bump b{animation:mk-bump .25s}
.mk-heat.is-spend{animation:mk-shake .25s}
/* Heat +/- floaters drift down from under the counter (above it they would leave the stage and be clipped). */
.mk-delta{position:absolute;left:44px;top:calc(100% + 2px);font-size:var(--fs-s);font-weight:900;pointer-events:none;animation:mk-sink 1s ease-out forwards;text-shadow:0 2px 0 var(--ink),0 0 6px rgba(0,0,0,.8)}
.mk-delta.up{color:#ffe9a8}
.mk-delta.down{color:#ff9a8a}
.mk-is-focus{animation:mk-pulse 1.1s infinite!important;position:relative;z-index:3}
.mk-waves{position:relative;flex:1;min-width:70px;height:34px;border-radius:12px;border:3px solid var(--ink);background:#10142c;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.mk-waves-track{position:absolute;inset:0;border-radius:9px;overflow:hidden}
.mk-waves-fill{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,#4b5ac9,#9b6bd6 45%,#ffb454 85%,#ffe9a8);transition:width .4s linear}
.mk-flag{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:rgba(255,255,255,.35)}
.mk-flag.big{width:3px;background:#ff6b6b}
.mk-flag.boss{width:3px;background:#ff6b8a}
.mk-mark{position:absolute;top:-14px;z-index:1;width:24px;height:24px;margin-left:-12px;display:grid;place-items:center;font-size:14px;font-style:normal;border-radius:50%;border:2px solid var(--ink);background:#ff6b6b;color:#fff;font-weight:900;line-height:1;pointer-events:none}
.mk-mark.boss{background:#ffd24a;color:var(--ink)}
.mk-mark.done{filter:grayscale(1) brightness(.7)}
.mk-waves-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:var(--fs-xs);font-weight:900;text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;letter-spacing:.02em}
.mk-slices{display:flex;gap:3px;align-items:center;flex:none;height:46px;padding:0 9px;border-radius:15px;border:3px solid var(--ink);background:#10142c;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.mk-slice{width:20px;height:22px;background:linear-gradient(#ff9fc6 0 32%,#fff3e6 32%);clip-path:polygon(50% 100%,0 12%,18% 0,82% 0,100% 12%);transition:opacity .3s,transform .3s}
.mk-slice.gone{opacity:.18;transform:scale(.75) rotate(-20deg);filter:grayscale(1)}
.mk-slices.is-hit{animation:mk-shake .35s}
.mk-score{flex:none;display:flex;flex-direction:column;align-items:flex-end;line-height:1.05;font-weight:900;font-size:var(--fs-m);padding:0 6px;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px #000}
.mk-score small{font-size:var(--fs-xs);color:var(--dim)}
.mk-boss{position:relative;flex:1;min-width:70px;height:40px;display:flex;align-items:center;gap:6px;padding:0 10px 0 4px;border-radius:12px;border:3px solid var(--ink);background:linear-gradient(#5a1c30,#3a1020);box-shadow:0 3px 0 rgba(0,0,0,.35);animation:mk-drop .3s}
.mk-boss canvas{flex:none;border-radius:50%;background:rgba(0,0,0,.3)}
.mk-boss-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mk-boss b{font-size:var(--fs-xs);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ffd0dc;line-height:1.05}
.mk-boss-bar{position:relative;height:10px;border-radius:999px;border:2px solid var(--ink);background:#1a0c14;overflow:hidden}
.mk-boss-bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#ff4f7a,#ff9fb4);transition:width .25s}
.mk-boss.warm .mk-boss-bar i{background:linear-gradient(90deg,#ffb454,#ffe9a8)}
.mk-boss.warm .mk-boss-bar span{display:none}
.mk-boss-bar u{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.75);text-decoration:none}
.mk-boss .mk-pips{flex:none;gap:3px}
.mk-boss .mk-pips i{width:12px;height:12px}
.mk-boss .mk-pips i.on{background:#ff6b8a}

.mk-hand{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);display:flex;gap:6px;align-items:flex-end;justify-content:center;max-width:calc(100% - 8px);padding:7px 8px;border-radius:20px;background:linear-gradient(rgba(29,36,80,.92),rgba(15,20,48,.92));border:3px solid var(--ink);box-shadow:0 4px 0 rgba(0,0,0,.35)}
.mk-card{position:relative;width:68px;height:88px;padding:0;border-radius:14px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper2));color:var(--ink);box-shadow:0 4px 0 var(--ink);overflow:hidden;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:space-between;transition:transform .12s,box-shadow .12s;touch-action:none}
.mk-card canvas{pointer-events:none;margin-top:2px}
.mk-card-cost{width:100%;height:25px;display:flex;align-items:center;justify-content:center;gap:2px;background:var(--ink);color:#ffd27a;font-weight:900;font-size:var(--fs-s);font-variant-numeric:tabular-nums}
.mk-card-cost::before{content:"";width:9px;height:12px;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;background:radial-gradient(circle at 50% 70%,#fff3b0,#ffb454 60%,#ff7a3c);flex:none}
.mk-card.spatula .mk-card-cost::before{display:none}
.mk-card-key{position:absolute;top:2px;left:5px;z-index:2;font-size:var(--fs-xs);font-weight:900;color:rgba(42,26,18,.8)}
.mk-card-cd{position:absolute;inset:0 0 25px 0;pointer-events:none;background:conic-gradient(rgba(20,25,54,.74) calc(var(--cd,0) * 1turn),transparent 0);transition:none}
.mk-card-cdtext{position:absolute;inset:0 0 25px 0;display:grid;place-items:center;font-size:var(--fs-l);font-weight:900;color:#fff;text-shadow:0 2px 0 var(--ink);pointer-events:none}
.mk-card.is-poor .mk-card-cost{color:#ff9a8a}
.mk-card.is-poor canvas{filter:grayscale(.7) brightness(.85)}
.mk-card.is-cooling canvas{filter:grayscale(.4)}
.mk-card.is-selected{transform:translateY(-10px);border-color:#fff;box-shadow:0 0 0 3px var(--amber),0 10px 0 var(--ink),0 0 22px rgba(255,180,84,.7)}
.mk-card.is-ready-flash{animation:mk-ready .45s}
.mk-card.spatula{background:linear-gradient(#dfe4f7,#aeb8e0)}
.mk-card.spatula.is-selected{box-shadow:0 0 0 3px var(--bad),0 10px 0 var(--ink)}
.mk-card .mk-tagnew{top:1px;left:auto;right:1px;transform:rotate(6deg);padding:0 5px;line-height:1.2}
.mk-info{position:absolute;z-index:6;width:min(300px,calc(100% - 16px));padding:12px 14px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 6px 0 rgba(0,0,0,.35);pointer-events:none;animation:mk-rise .15s}
.mk-info h4{font-size:var(--fs-m);font-weight:900;display:flex;align-items:center;gap:8px;justify-content:space-between}
.mk-info p{font-size:var(--fs-xs);color:var(--ink2);font-weight:700;margin:4px 0 6px}
.mk-statrows{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:var(--fs-xs);font-weight:800}
.mk-statrows span{color:var(--ink2)}
.mk-statrows b{text-align:right;font-variant-numeric:tabular-nums}
.mk-statrows b .arrow{color:#b5650d;margin:0 4px}
.mk-statrows b .up{color:#1f7a2e}

.mk-pop{position:absolute;z-index:4;width:250px;max-width:calc(100% - 12px);padding:12px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 6px 0 rgba(0,0,0,.35);animation:mk-pop .18s}
.mk-pop h4{font-size:var(--fs-m);font-weight:900;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
.mk-pop-stars{color:#d98a00;letter-spacing:1px;font-size:var(--fs-m)}
.mk-pop .mk-statrows{margin:4px 0 10px}
.mk-pop .mk-chips{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 8px}
.mk-pop-row{display:flex;gap:6px}
.mk-pop .mk-btn{flex:1;min-height:48px;padding:4px 8px;font-size:var(--fs-s);box-shadow:0 3px 0 var(--ink);flex-direction:column;gap:0;line-height:1.1}
.mk-pop .mk-btn b{font-size:var(--fs-s)}
.mk-pop .mk-btn span{font-size:var(--fs-xs);font-weight:800}
.mk-pop .mk-btn.is-poor{filter:grayscale(.7);opacity:.75}

.mk-notes{position:absolute;top:var(--mk-top,56px);left:8px;right:8px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.mk.is-immersive .mk-notes{left:calc(var(--safe-l) + 4px)}
.mk-notes>*{pointer-events:none}
.mk-banner{max-width:100%;padding:7px 18px;border-radius:999px;border:3px solid var(--ink);background:linear-gradient(#ffd08a,#ff9a3c);color:var(--ink);font-weight:900;font-size:var(--fs-m);text-align:center;animation:mk-drop .3s;box-shadow:0 4px 0 rgba(0,0,0,.3)}
.mk-banner.warn{background:linear-gradient(#ffb3a6,#ff6b6b)}
.mk-banner.good{background:linear-gradient(#d9f8c9,#8fe08a)}
.mk-banner.boss{background:linear-gradient(#ff9fb4,#d9405f);color:#fff;text-shadow:0 2px 0 var(--ink)}
.mk-bottom{position:absolute;left:8px;right:8px;bottom:var(--mk-hand,106px);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.mk.is-immersive .mk-bottom{left:calc(var(--safe-l) + 4px)}
.mk-bark{display:flex;align-items:center;gap:8px;max-width:min(560px,100%);padding:4px 14px 4px 4px;border-radius:999px;border:3px solid var(--ink);background:rgba(29,36,80,.96);font-size:var(--fs-s);animation:mk-rise .25s;box-shadow:0 4px 0 rgba(0,0,0,.3)}
.mk-bark canvas{flex:none;border-radius:50%;background:#3b4686}
.mk-bark b{color:var(--amber);margin-right:6px}
.mk-toast{padding:7px 16px;border-radius:999px;background:rgba(20,10,4,.92);border:2px solid var(--bad);color:#ffd0c8;font-size:var(--fs-s);font-weight:800;text-align:center;animation:mk-rise .15s}
.mk-toast.info{border-color:var(--amber);color:#ffe9a8}
.mk-chipfloat{position:absolute;z-index:5;transform:translate(-50%,-100%);padding:4px 10px;border-radius:14px;border:2px solid var(--ink);background:var(--cream);color:var(--ink);font-size:var(--fs-xs);font-weight:900;width:max-content;max-width:min(300px,calc(100% - 12px));text-align:center;pointer-events:none;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.mk-chipfloat.bad{background:#ffc2b8}
.mk-chipfloat.recipe{border-color:var(--ink);background:linear-gradient(#fff8e6,#ffe2a8)}
.mk-chipfloat.recipe i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;border:2px solid var(--ink);vertical-align:-1px}
.mk-recipe-toast{position:absolute;z-index:3;transform:translate(-50%,-50%);padding:5px 12px;border-radius:999px;border:3px solid var(--ink);background:linear-gradient(#fff8e6,#ffe2a8);color:var(--ink);font-size:var(--fs-s);font-weight:900;white-space:nowrap;pointer-events:none;animation:mk-recipe 1.9s ease-out forwards;box-shadow:0 4px 0 rgba(0,0,0,.3)}
.mk-recipe-toast.first{background:linear-gradient(#ffe08a,var(--gold))}
.mk-ghost{position:absolute;z-index:7;pointer-events:none;transform:translate(-50%,-115%);filter:drop-shadow(0 6px 4px rgba(0,0,0,.45));opacity:.95}
.mk-ghost.bad{filter:drop-shadow(0 6px 4px rgba(0,0,0,.45)) grayscale(.6)}

.mk-coach{position:absolute;z-index:6;width:min(320px,calc(100% - 16px));padding:12px 14px 12px;border-radius:18px;border:3px solid var(--ink);background:linear-gradient(var(--cream),var(--paper));color:var(--ink);box-shadow:0 6px 0 rgba(0,0,0,.35);animation:mk-pop .22s;pointer-events:auto}
.mk-coach p{font-size:var(--fs-s);font-weight:800;line-height:1.35;padding-right:6px}
.mk-coach-row{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:8px}
.mk-coach-row .mk-btn{min-height:44px;font-size:var(--fs-xs);padding:4px 12px;box-shadow:0 3px 0 var(--ink)}
.mk-coach-row .mk-btn.ghost{background:transparent;color:var(--ink2);border-color:transparent;text-decoration:underline}
.mk-coach-step{font-size:var(--fs-xs);font-weight:900;color:#b5650d}
.mk-hand-pointer{position:absolute;z-index:6;width:44px;height:44px;margin:-6px 0 0 -14px;font-size:38px;line-height:1;pointer-events:none;filter:drop-shadow(0 3px 0 rgba(0,0,0,.45));animation:mk-tap 1.1s ease-in-out infinite;text-align:center}
.mk-ring{position:absolute;z-index:2;border-radius:16px;border:4px solid var(--amber);box-shadow:0 0 0 4px rgba(42,26,18,.55),0 0 24px rgba(255,180,84,.8);pointer-events:none;animation:mk-ring 1.2s ease-in-out infinite}

/* ================= breakpoints ================= */
.mk.compact .mk-card{width:54px;height:72px;border-radius:12px}
.mk.compact .mk-card-cost{height:22px;font-size:var(--fs-xs)}
.mk.compact .mk-card-cd,.mk.compact .mk-card-cdtext{bottom:22px}
.mk.compact .mk-card canvas{width:46px!important;height:46px!important}
.mk.compact .mk-hand{gap:3px;padding:4px;border-radius:18px}
.mk.compact .mk-card{flex:0 1 54px;min-width:0}
/* Touch targets never shrink under 44px. A portrait phone hand that cannot fit one row at that size (seven cards and
   the spatula or more) stays one row and scrolls sideways: a second row would take the height the tall board needs.
   A sideways swipe on a card scrolls it (input.ts scrubs it by hand, so a diagonal pull up onto the board stays a
   card drag rather than being taken by the browser as a pan); the side with more cards fades out. */
.mk.compact .mk-card{min-width:44px}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)){left:4px;right:4px;transform:none;max-width:none;justify-content:flex-start;gap:4px;padding:12px 6px 5px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,transparent,#000 var(--fl,0px),#000 calc(100% - var(--fr,0px)),transparent);mask-image:linear-gradient(90deg,transparent,#000 var(--fl,0px),#000 calc(100% - var(--fr,0px)),transparent)}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8))::-webkit-scrollbar{display:none}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)) .mk-card{flex:none;width:52px;height:70px}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)) .mk-card:first-child{margin-left:auto}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)) .mk-card:last-child{margin-right:auto}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)) .mk-card canvas{width:42px!important;height:42px!important}
.mk.narrow:not(.hand-side) .mk-hand:has(> :nth-child(8)) .mk-card.is-selected{transform:translateY(-6px)}
.mk.compact .mk-card-key{display:none}
.mk.compact .mk-card.spatula .mk-card-cost{font-size:0}
.mk.compact .mk-card.spatula .mk-card-cost::after{content:"✕";font-size:var(--fs-s)}
.mk.compact .mk-banner{font-size:var(--fs-s);padding:5px 14px}
.mk.compact .mk-icon-btn{width:44px;height:44px;min-height:44px}
.mk.compact .mk-heat{height:44px;font-size:20px;min-width:80px;padding-right:10px}
.mk.compact .mk-slices{height:44px;padding:0 6px}
.mk.compact .mk-slice{width:16px;height:18px}
.mk.narrow .mk-top{flex-wrap:wrap;row-gap:6px}
.mk.narrow .mk-waves,.mk.narrow .mk-boss{order:9;flex-basis:100%;height:30px;margin-top:6px}
.mk.narrow .mk-boss{height:36px}
.mk.narrow .mk-heat{margin-right:auto}
.mk.narrow .mk-score{order:8}
.mk.hand-side .mk-hand{left:calc(var(--safe-l) + 6px);top:var(--mk-top,56px);bottom:6px;transform:none;display:grid;grid-template-columns:repeat(2,auto);align-content:center;gap:5px;padding:5px;border-radius:18px}
.mk.hand-side .mk-card{flex:none;width:54px;height:62px;border-width:2px;border-radius:12px}
.mk.hand-side .mk-card canvas{width:38px!important;height:38px!important}
.mk.hand-side .mk-card-cost{height:20px}
.mk.hand-side .mk-card-cd,.mk.hand-side .mk-card-cdtext{bottom:20px}
.mk.hand-side .mk-card.is-selected{transform:translateX(6px)}
/* Eight cards and the spatula would stand five rows tall on a 390px-high phone: three columns instead. */
.mk.hand-side .mk-hand:has(> :nth-child(9)){grid-template-columns:repeat(3,auto)}
.mk.hand-side .mk-notes,.mk.hand-side .mk-bottom{left:var(--mk-side,130px)}
.mk.hand-side .mk-bottom{bottom:8px}
@media (max-width:720px){
  .mk-brief{grid-template-columns:1fr}
  .mk-path{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mk-path::before{display:none}
  .mk-node.boss{grid-column:1/-1}
  .mk-node{min-height:120px}
  .mk-map-extra{grid-template-columns:1fr}
  .mk-chapter{flex-basis:128px}
}
@media (max-width:560px){
  .mk-screen{padding:10px 12px 16px}
  .mk-screen-head{margin-top:-10px;padding-top:10px;top:-10px}
  .mk-screen-head h2{font-size:var(--fs-l)}
  /* Purses and buttons in the head leave no room for the title on a phone: it drops onto its own line. */
  .mk-screen-head:has(.mk-purse){flex-wrap:wrap;row-gap:2px}
  .mk-screen-head:has(.mk-purse) .mk-head-extra{margin-left:auto}
  .mk-screen-head:has(.mk-purse) h2{order:9;flex-basis:100%;font-size:var(--fs-l);padding:6px 2px 2px}
  .mk-screen-head:has(.mk-purse){margin-bottom:2px;padding-bottom:10px;background:linear-gradient(rgba(14,18,44,.97) 80%,rgba(14,18,44,0))}
  .mk-chapter-hero > .mk-chip{display:none}
  .mk-chapter-hero .mk-hero-num{width:48px;height:48px;font-size:24px}
  .mk-chapter{flex-basis:118px;min-height:72px}
  .mk-back-label{display:none}
  .mk-portrait{width:88px;height:88px;border-radius:20px}
  .mk-speech{min-height:96px;padding:12px 14px 28px}
  .mk-speech p{font-size:var(--fs-s)}
  .mk-entries{grid-template-columns:1fr}
  .mk-picks{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .mk-bigstar i.g{font-size:46px}.mk-bigstar:nth-child(2) i.g{font-size:56px}
  .mk-results h2{font-size:var(--fs-xl)}
  .mk-bigscore{font-size:44px}
  .mk-records{grid-template-columns:repeat(3,minmax(0,1fr))}
  .mk-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  .mk-tabs button{padding:6px 8px}
  .mk-statgrid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .mk-stat{padding:6px 2px}
  .mk-stat b{font-size:var(--fs-m)}
  .mk-stat small{display:block;line-height:1.2}
  .mk-statgrid:has(> :nth-child(5)){grid-template-columns:repeat(3,minmax(0,1fr))}
  .mk-record b{font-size:var(--fs-l)}
}
@media (max-height:480px){
  .mk-screen{padding:8px 14px 10px}
  .mk-screen-head{margin-top:-8px;padding-top:8px;top:-8px;min-height:52px;margin-bottom:6px}
  .mk-portrait{width:76px;height:76px}
  .mk-speech{min-height:76px;padding:10px 14px 24px}
  .mk-logo{font-size:38px}.mk-moon{display:none}
  .mk-title{gap:8px;flex-direction:row;flex-wrap:wrap;justify-content:center;max-width:780px}
  .mk-title-head{flex-basis:100%}
  .mk-title .mk-tag{display:none}
  .mk-results{gap:6px}
  .mk-results h2{font-size:var(--fs-xl)}
  .mk-bigstar i.g{font-size:40px}.mk-bigstar:nth-child(2) i.g{font-size:48px;margin-top:-6px}
  .mk-path{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
  .mk-node{min-height:112px;padding:8px 4px}
  .mk-node .mk-node-num{width:38px;height:38px;font-size:var(--fs-m)}
  .mk-node.boss{grid-column:auto}
  .mk-map-extra{grid-template-columns:repeat(3,minmax(0,1fr))}
  .mk-chapter{min-height:64px;padding:6px 10px}
  .mk-chapter-hero .mk-hero-num{width:48px;height:48px;font-size:24px}
  .mk-chapter-hero h3{font-size:var(--fs-m)}
  /* Landscape phone: the level path must show without scrolling, so the chapter banner shrinks to one line. */
  .mk-chapter-hero{padding:8px 14px;gap:10px}
  .mk-chapter-hero .mk-hero-num,.mk-chapter-hero .mk-eyebrow,.mk-chapter-hero > .mk-chip{display:none}
  .mk-chapter-hero .mk-grow{display:flex;align-items:baseline;gap:10px;min-width:0}
  .mk-chapter-hero .mk-grow p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .mk-chapter{min-height:0;padding:4px 10px 6px}
  .mk-brief{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}
}
@keyframes mk-bump{0%{transform:scale(1)}40%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes mk-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes mk-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,214,90,.95),0 3px 0 rgba(0,0,0,.35)}50%{box-shadow:0 0 0 9px rgba(255,214,90,0),0 3px 0 rgba(0,0,0,.35)}}
@keyframes mk-drop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes mk-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes mk-fade{from{opacity:0}to{opacity:1}}
@keyframes mk-pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
@keyframes mk-star{from{transform:scale(0) rotate(-50deg);opacity:0}70%{transform:scale(1.3) rotate(8deg);opacity:1}to{transform:none;opacity:1}}
@keyframes mk-ready{0%{transform:scale(1)}40%{transform:scale(1.12);box-shadow:0 0 0 4px #ffe9a8,0 4px 0 var(--ink)}100%{transform:scale(1)}}
@keyframes mk-sink{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(16px)}}
@keyframes mk-float{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-26px)}}
@keyframes mk-recipe{0%{opacity:0;transform:translate(-50%,-30%) scale(.7)}15%{opacity:1;transform:translate(-50%,-60%) scale(1.08)}75%{opacity:1;transform:translate(-50%,-90%)}100%{opacity:0;transform:translate(-50%,-120%)}}
@keyframes mk-tap{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes mk-ring{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes mk-bob{0%,100%{transform:translateY(0) rotate(45deg)}50%{transform:translateY(-5px) rotate(45deg)}}
@keyframes mk-blink{0%,100%{opacity:1}50%{opacity:.45}}
.mk.reduced *{animation:none!important;transition:none!important}
`;
