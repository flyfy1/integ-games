import { ACTS, DIFFICULTIES, FORGE } from './campaign.js';
const formatTime=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createLevelUI(root,screen,levels,actions) {
  const ribbon=document.createElement('div');ribbon.className='ashfall-ribbon';ribbon.innerHTML='<strong></strong><span></span>';root.insertBefore(ribbon,screen);
  const pattern=document.createElement('div');pattern.className='ashfall-pattern';root.insertBefore(pattern,screen);
  const overlay=document.createElement('section');overlay.className='ashfall-overlay';screen.append(overlay);
  let key='',selection=1;
  function update(g,level,selected,runStartId,progress,best) {
    selection=selected.id;
    const o=actions.options(),zh=o.locale==='zh',t=(en,cn)=>zh?cn:en,L=a=>a?.[zh?1:0]||a?.[0]||'';
    root.lang=zh?'zh-CN':'en';
    const menu=g.mode==='title'||(g.mode==='loading'&&!g.loadingNext),display=menu?selected:level;
    const zone=display.ZONES[menu?0:display.zoneIndexAt(actions.playerX())];
    ribbon.setAttribute('aria-label',t('Current stage and difficulty','当前关卡与难度'));
    ribbon.querySelector('strong').textContent=`${t('LEVEL','关卡')} ${display.numeral}`;
    ribbon.querySelector('span').textContent=`${L(DIFFICULTIES[o.difficulty].label)} · ${menu?L(ACTS[display.act].name):zh?zone.sub:zone.name}`;
    root.dataset.mode=g.mode;
    const b=actions.boss(),p=actions.player();
    pattern.hidden=g.mode!=='play';
    let cue='';
    if(!pattern.hidden) {
      if(o.paused) cue=t('PAUSED · press P to continue','已暂停 · 按 P 继续');
      else if(p.dead) cue=t('YOU FELL · returning to your checkpoint','你倒下了 · 正在返回检查点');
      else if(!g.cine) {
        const attack=b.state==='windup'?b.attack:null;
        const cues={slam:['SLAM · move away, then jump the wave','重击 · 远离落点，再跳过冲击波'],charge:['CHARGE · roll through; punish the wall stun','冲锋 · 翻滚穿过，撞墙后反击'],barrage:['VOLLEY · keep moving after the aim locks','齐射 · 瞄准锁定后继续移动'],beam:[b.beamHigh?'HIGH BEAM · roll low':'LOW BEAM · jump',b.beamHigh?'高位光束 · 低身翻滚':'低位光束 · 跳跃'],missiles:['MISSILES · leave the marked circles','导弹 · 离开标记圆圈'],conduit:['LIGHTNING · step between columns','闪电 · 移动到光柱之间'],pillars:['PILLARS · step aside, then switch lanes','立柱 · 先避开，再换位'],hook:['CHAIN HOOK · jump or roll','锁链钩 · 跳跃或翻滚']};
        if(p.hooked) cue=t('HOOKED · evade the follow-up slam','被钩住了 · 躲避后续重击');
        else if(cues[attack]) cue=L(cues[attack]);
        else if(g.pillars.length) cue=L(cues.pillars);
        else if(g.conduits.length) cue=L(cues.conduit);
        else if(g.hooks.length) cue=L(cues.hook);
        else if(level.hazards?.some(h=>Math.abs(p.x-h.x)<220 && (g.hazardClock+h.offset)%h.period < h.warning*DIFFICULTIES[o.difficulty].warning+h.active)) cue=t('VENT · wait for the pulse or jump across','喷口 · 等待喷发结束，或跳跃通过');
        else if(g.overdrive>0) cue=t(`OVERDRIVE ${Math.ceil(g.overdrive)}s · +35% damage`,`爆发 ${Math.ceil(g.overdrive)}秒 · 伤害 +35%`);
        else if(g.streak>1) cue=t(`${g.streak} CHAIN · ×${1+Math.min(2,Math.floor(g.streak/3))} ASH · HEAT ${Math.floor(g.heat)}%`,`${g.streak} 连杀 · 灰烬 ×${1+Math.min(2,Math.floor(g.streak/3))} · 热量 ${Math.floor(g.heat)}%`);
        else cue=t(`Build heat with hits · ${Math.floor(g.heat)}% · J combo / K shotgun / Shift roll`,`命中积累热量 · ${Math.floor(g.heat)}% · J 连击 / K 枪击 / Shift 翻滚`);
      }
    }
    if(pattern.textContent!==cue) pattern.textContent=cue;
    pattern.classList.toggle('is-warning',b.state==='windup'&&!g.cine);
    const visible=['title','loading','interlude','victory'].includes(g.mode);overlay.hidden=!visible;screen.classList.toggle('has-overlay',visible);
    if(!visible){key='';return;}
    const nextKey=[g.mode,level.id,selected.id,[...progress],best,g.results?.length,g.score,g.victoryT>=2.5,o.locale,o.difficulty,o.reward,JSON.stringify(g.forge),o.saved,o.resume?.level].join('|');
    if(key===nextKey)return;key=nextKey;
    const focused=overlay.contains(document.activeElement)?document.activeElement?.getAttribute('data-control'):null,scroll=overlay.scrollTop;
    const button=(label,control,primary=false,disabled=false)=>`<button type="button" data-control="${control}" class="${primary?'af-primary':'af-secondary'}" ${disabled?'disabled':''}>${esc(label)}</button>`;
    const saveText=o.saved===false?t('Saving unavailable. This run stays in memory while this page is open.','无法保存。此轮进度仅在页面保持打开时保留。'):t('Progress saves on this device after each boss.','每次击败 Boss 后，进度保存在此设备。');
    const settings=`<div class="af-settings"><label>${t('Difficulty','难度')}<select data-control="difficulty" ${g.mode==='loading'?'disabled':''}>${Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${id===o.difficulty?'selected':''}>${L(d.label)}</option>`).join('')}</select></label>${button(zh?'English':'中文','language')}</div>`;
    if(menu) {
      overlay.setAttribute('aria-label',t('Ashfall campaign selection','Ashfall 战役选择'));
      const act=ACTS[selected.act];
      overlay.innerHTML=`<div class="af-panel"><div class="af-heading"><div><p class="af-eyebrow">${t('20 STAGES · 20 GUARDIANS','20 关 · 20 位守卫')}</p><h1>ASHFALL</h1></div>${settings}</div>
      <div class="af-acts" role="group" aria-label="${t('Acts','章节')}">${ACTS.map((a,i)=>`<button type="button" data-control="act-${i}" data-act="${i}" aria-pressed="${selected.act===i}">${i+1} · ${esc(L(a.name))}</button>`).join('')}</div>
      <p class="af-act-goal">${esc(L(act.goal))}</p><div class="af-levels" role="radiogroup" aria-label="${t('Starting level','起始关卡')}">${levels.filter(l=>l.act===selected.act).map(l=>`<button type="button" role="radio" aria-checked="${l.id===selected.id}" tabindex="${l.id===selected.id?0:-1}" data-control="level-${l.id}" data-level="${l.id}"><strong>${t('LEVEL','关卡')} ${l.numeral}</strong><span class="af-name">${esc(zh?l.titleZh:l.title)}</span><small>${progress.has(l.id)?t('CLEARED ✓','已通关 ✓'):t('OPEN','可挑战')}</small></button>`).join('')}</div>
      <div class="af-brief"><p>${esc(L(selected.story))}</p><p class="af-boss"><b>${t('GUARDIAN','守卫')} · ${esc(zh?selected.BOSS.sub:selected.BOSS.name)}</b><br>${selected.BOSS.scripts?esc(selected.BOSS.scripts[0].map(a=>attackName(a,zh)).join(' → ')):t('Break armor with your blade. Save shells for the exposed core.','用刀锋击碎护甲，将子弹留给暴露的核心。')}</p></div>
      <p class="af-help">${esc(L(DIFFICULTIES[o.difficulty].detail))}</p><p class="af-route">${t('RUN ROUTE','挑战路线')} · ${selected.numeral} → XX${best?` · ${t('BEST','最佳')} ${best}`:''}</p>
      <div class="af-buttons">${button(g.mode==='loading'?t('LOADING…','加载中…'):t(`START LEVEL ${selected.numeral}`,`开始第 ${selected.numeral} 关`),'start',true,g.mode==='loading')}${o.resume?button(t(`RESUME LEVEL ${levels[o.resume.level-1].numeral}`,`继续第 ${levels[o.resume.level-1].numeral} 关`),'resume',false,g.mode==='loading'):''}</div>
      <p class="af-help">${t('Arrows: choose stage · Enter: start · J: combo · K: shotgun · Shift: roll','方向键选关 · 回车开始 · J 连击 · K 枪击 · Shift 翻滚')}</p><p class="af-save" role="status">${saveText}</p></div>`;
    } else if(g.mode==='interlude'||g.loadingNext) {
      const next=levels[levels.indexOf(level)+1],result=g.results.at(-1);
      overlay.setAttribute('aria-label',t('Level complete and forge reward','关卡完成与强化奖励'));
      overlay.innerHTML=`<div class="af-panel af-complete"><p class="af-eyebrow">${t(`LEVEL ${level.numeral} COMPLETE → LEVEL ${next.numeral}`,`第 ${level.numeral} 关完成 → 第 ${next.numeral} 关`)}</p><h2>${t('GUARDIAN DEFEATED','守卫已击败')} · ${result?.rank||'B'}</h2><p class="af-bridge">${esc(L(level.aftermath))}</p><p>${formatTime(result?.time||0)} · ${result?.kills||0} ${t('KILLS','击杀')} · ${result?.falls||0} ${t('FALLS','倒下')}</p><h3>${o.reward?t('Choose a forge blessing','选择锻造祝福'):t('FORGE MASTERED · +500 ASH','锻造已满级 · +500 灰烬')}</h3><p class="af-help">${t('Lasts for this run · maximum 3 ranks each · health and shells restored','本轮挑战有效 · 每项最多 3 级 · 生命与弹药恢复')}</p><div class="af-rewards">${Object.entries(FORGE).map(([id,f])=>`<button type="button" data-control="reward-${id}" data-reward="${id}" aria-pressed="${o.reward===id}" ${(g.forge[id]>=3||g.loadingNext)?'disabled':''}><b>${L(f.name)} · ${g.forge[id]}/3</b><span>${L(f.detail)}</span></button>`).join('')}</div><p class="af-help">${level.id===2?t('Salvaged Edge and Storm Mantle expire here; forge blessings remain.','拾荒刀锋与风暴披风在此失效；锻造祝福继续保留。'):''}</p><p>${t('UP NEXT','下一关')} · ${esc(zh?next.titleZh:next.title)}</p><div class="af-buttons">${button(g.loadingNext?t('LOADING…','加载中…'):t(`CONTINUE TO LEVEL ${next.numeral}`,`前往第 ${next.numeral} 关`),'continue',true,!!g.loadingNext)}${button(t('Level select','返回选关'),'menu',false,!!g.loadingNext)}</div><p class="af-save" role="status">${saveText}</p></div>`;
    } else {
      const full=g.results.length===levels.length&&runStartId===1;
      overlay.setAttribute('aria-label',t('Run results','挑战结果'));
      overlay.innerHTML=`<div class="af-panel af-complete"><p class="af-eyebrow">${t('LEVEL XX COMPLETE','第 XX 关完成')} · ${L(DIFFICULTIES[o.difficulty].label)}</p><h2>${t('A SECOND SUNRISE','第二次日出')}</h2><p class="af-bridge">${esc(L(level.aftermath))}</p><p>${full?t('CAMPAIGN COMPLETE · 20 GUARDIANS','战役完成 · 20 位守卫'):t(`RUN COMPLETE · ${g.results.length} STAGES`,`挑战完成 · ${g.results.length} 关`)}</p><p class="af-total">${g.score} ${t('ASH','灰烬')} · ${formatTime(g.playT)} · ${g.deaths} ${t('FALLS','倒下')}</p><details><summary>${t('Per-stage results','逐关战绩')}</summary><table><thead><tr>${[t('LEVEL','关卡'),t('TIME','时间'),t('RANK','评级'),t('SCORE','分数')].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${g.results.map(r=>`<tr><th>${r.numeral}</th><td>${formatTime(r.time)}</td><td>${r.rank}</td><td>${r.score}</td></tr>`).join('')}</tbody></table></details><p>${t('LOCAL BEST','本地最佳')} · ${g.best||g.score}</p><div class="af-buttons">${button(t('Replay run','重玩本轮'),'replay',true)}${button(t('Level select','返回选关'),'menu')}</div><p class="af-save" role="status">${saveText}</p></div>`;
    }
    overlay.scrollTop=scroll;
    if(focused)overlay.querySelector(`[data-control="${focused}"]`)?.focus({preventScroll:true});
  }
  overlay.addEventListener('change',e=>{if(e.target.matches('select'))actions.difficulty(e.target.value);});
  overlay.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.level)actions.select(Number(b.dataset.level));else if(b.dataset.act)actions.select(levels.find(l=>l.act===Number(b.dataset.act)).id);else if(b.dataset.reward)actions.reward(b.dataset.reward);else actions[b.dataset.control]?.();});
  return {update,focusSelection(){overlay.querySelector(`[data-level="${selection}"]`)?.focus();}};
}
function attackName(a,zh){return ({slam:['Slam','重击'],barrage:['Volley','齐射'],charge:['Charge','冲锋'],beam:['Beam','光束'],missiles:['Missiles','导弹'],conduit:['Lightning','闪电'],pillars:['Pillars','立柱'],hook:['Hook','锁链钩']})[a]?.[zh?1:0]||a;}
export const levelStyles=`
.ashfall{--af-canvas:#090e14;--af-surface:#12171b;--af-selected:#32271b;--af-ink:#f4e8d5;--af-muted:#b4c4cd;--af-gold:#f0cd96;--af-dark:#1b1712;--af-focus:#aee6ff;--af-border:#76604a}
.ashfall-screen{position:relative;width:100%;min-width:0}.ashfall-screen canvas{margin:auto}.ashfall-screen.has-overlay canvas{display:none}
.ashfall-ribbon{display:flex;align-items:center;gap:16px;width:100%;max-width:1280px;min-height:48px;padding:8px 16px;border:1px solid var(--af-border);background:var(--af-canvas);color:var(--af-ink);border-radius:8px;font:14px/1.5 system-ui,sans-serif;box-sizing:border-box}.ashfall-ribbon strong{flex:none;white-space:nowrap;font-size:18px;color:var(--af-gold)}.ashfall-ribbon span{min-width:0;overflow-wrap:anywhere}
.ashfall-pattern{box-sizing:border-box;min-height:32px;padding:4px 8px;width:100%;max-width:1280px;text-align:center;font:700 13px/1.5 system-ui,sans-serif;color:var(--af-focus);background:var(--af-canvas);border-radius:6px}.ashfall-pattern.is-warning{color:var(--af-gold);outline:1px solid var(--af-border)}.ashfall-pattern[hidden]{display:none}
.ashfall-overlay{position:relative;display:block;background:var(--af-canvas);border:1px solid var(--af-border);border-radius:8px;padding:24px;color:var(--af-ink);font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;box-sizing:border-box;width:100%}.ashfall-overlay[hidden]{display:none}
.af-panel{width:min(960px,100%);margin:auto}.af-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.af-panel h1{font:700 clamp(1.5rem,4vw,2.5rem)/1.2 Georgia,serif;letter-spacing:.12em;margin:0 0 16px}.af-panel h2{font:700 clamp(1.5rem,3vw,2rem)/1.2 Georgia,serif;margin:16px 0}.af-panel h3{font-size:1rem}.af-panel p{margin:8px 0}.af-eyebrow{font:700 .8125rem/1.5 system-ui,sans-serif;color:var(--af-gold)}
.af-settings{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.af-settings label{display:flex;flex-direction:column;font-size:.8125rem;color:var(--af-muted)}.af-settings select{min-height:48px;font:700 1rem system-ui;padding:8px 12px;background:var(--af-surface);color:var(--af-ink);border:1px solid var(--af-border);border-radius:6px}
.af-acts{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--af-border);padding-bottom:8px}.af-acts button{flex:1;min-width:100px}.af-acts button,.af-rewards button,.af-levels button{min-height:48px;border:1px solid var(--af-border);border-radius:6px;background:var(--af-surface);color:var(--af-ink);font:700 .8125rem/1.5 system-ui;padding:8px;cursor:pointer}.af-acts [aria-pressed=true],.af-rewards [aria-pressed=true],.af-levels [aria-checked=true]{outline:2px solid var(--af-gold);outline-offset:-2px;background:var(--af-selected)}
.af-act-goal{color:var(--af-muted);font-size:.8125rem}.af-levels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.af-levels button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;min-height:96px;padding:12px}.af-levels strong{color:var(--af-gold);font-size:1rem}.af-levels small{color:var(--af-muted)}.af-brief{border-left:3px solid var(--af-gold);padding:0 16px;margin:16px 0}.af-boss{font-size:.8125rem;color:var(--af-focus)}
.af-primary,.af-secondary{min-height:48px;min-width:48px;padding:12px 24px;border-radius:6px;border:1px solid var(--af-border);font:700 .875rem/1.5 system-ui;cursor:pointer}.af-primary{background:var(--af-gold);color:var(--af-dark)}.af-secondary{background:var(--af-surface);color:var(--af-ink)}.ashfall-overlay button:disabled{color:var(--af-muted);background:var(--af-surface);cursor:default}.ashfall-overlay :is(button,select,summary):focus-visible{outline:3px solid var(--af-focus);outline-offset:4px}.af-help,.af-save{color:var(--af-muted);font-size:.8125rem}.af-route,.af-total{color:var(--af-gold)}.af-buttons{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.af-rewards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.af-rewards button{display:flex;flex-direction:column;text-align:left;gap:4px;padding:12px}.af-rewards span{font-weight:400;color:var(--af-muted)}.af-complete table{width:100%;border-collapse:collapse;font-size:.8125rem}.af-complete th,.af-complete td{padding:8px;border-bottom:1px solid var(--af-border);text-align:left}.af-complete summary{cursor:pointer;padding:12px;min-height:48px;box-sizing:border-box}
.ashfall[data-mode=title] .ashfall-touch,.ashfall[data-mode=loading] .ashfall-touch,.ashfall[data-mode=interlude] .ashfall-touch,.ashfall[data-mode=victory] .ashfall-touch{display:none}.ashfall:has(.has-overlay) .ashfall-rotate{display:none!important}
.ashfall canvas{max-width:min(1280px,calc((100dvh - 160px)*16/9))}.is-immersive:has(.ashfall-screen.has-overlay){overflow:auto;align-items:start}.is-immersive .ashfall:has(.has-overlay),:fullscreen .ashfall:has(.has-overlay){height:auto;min-height:100%;justify-content:flex-start;padding-top:58px;gap:12px}.is-immersive .ashfall:not(.is-touch) .ashfall-ribbon,:fullscreen .ashfall:not(.is-touch) .ashfall-ribbon{max-width:calc(100% - 120px)}
.ashfall-actions .a-reload{width:48px;height:48px}.ashfall-actions{grid-template-columns:48px 64px 72px}.ashfall .stage-pause{width:48px;height:48px}.game-stage:has(.ashfall) .immersive-exit{width:48px;height:48px}.ashfall-actions button:focus-visible{outline:3px solid var(--af-focus);outline-offset:4px}
@media(max-width:600px){.ashfall-overlay{padding:12px}.af-heading{align-items:start;flex-direction:column;gap:4px}.af-settings{width:100%}.af-levels{grid-template-columns:repeat(2,minmax(0,1fr))}.af-levels button{min-height:88px;padding:8px}.af-acts button{flex-basis:30%;min-width:72px}.af-rewards{grid-template-columns:1fr}.ashfall-ribbon{padding:8px;gap:8px;font-size:12px}.ashfall-ribbon strong{font-size:16px}.af-buttons>*{flex:1}.af-brief{padding:0 8px}.ashfall-actions{gap:8px 4px;grid-template-columns:48px 56px 60px}.ashfall-actions button{width:56px;height:56px}.ashfall-actions .a-jump,.ashfall-actions .a-slash{width:60px;height:60px}.ashfall-pad{width:100px;min-width:88px;padding:0 10px}.is-immersive .ashfall-actions{grid-template-columns:48px 56px 60px}.is-immersive .ashfall-actions button{width:56px;height:56px}.is-immersive .ashfall-actions .a-jump,.is-immersive .ashfall-actions .a-slash{width:60px;height:60px}.is-immersive .ashfall-actions .a-reload{width:48px;height:48px}.is-immersive .ashfall-pad{width:100px}.ashfall-ribbon,.ashfall-pattern{flex-shrink:0}}
@media(orientation:landscape) and (max-height:600px){.ashfall.is-touch canvas{max-width:min(calc((100dvh - 140px)*16/9),calc(100vw - 290px))}.ashfall:not(:has(.has-overlay)) .ashfall-ribbon,.ashfall-pattern{max-width:calc(100% - 290px)}.ashfall:has(.has-overlay) .ashfall-ribbon{width:100%}.ashfall-overlay{padding:12px}.ashfall-actions .a-reload{width:48px;height:48px}.ashfall-actions{grid-template-columns:58px 60px}}
@media(prefers-reduced-motion:reduce){.ashfall *{transition:none!important;animation:none!important}}
`;
