import { buildLevel3Art, makeCanvas, LAYER_W } from './art.js';

export const DIFFICULTIES = {
  easy: { label: ['Easy', '简单'], detail: ['55% damage taken · longer warnings · stronger attacks', '受到 55% 伤害 · 更长预警 · 更强攻击'], incoming: .55, outgoing: 1.25, warning: 1.3, recovery: 1.2 },
  normal: { label: ['Normal', '普通'], detail: ['Standard damage · generous checkpoints', '标准伤害 · 检查点快速重试'], incoming: 1, outgoing: 1, warning: 1, recovery: 1 },
  hard: { label: ['Hard', '困难'], detail: ['135% damage taken · tighter warnings · same enemy health', '受到 135% 伤害 · 更紧凑预警 · 敌人血量不变'], incoming: 1.35, outgoing: 1, warning: .88, recovery: .85 }
};
export const FORGE = {
  edge: { name: ['Tempered Edge', '淬火刀锋'], detail: ['+8% damage per rank', '每级伤害 +8%'] },
  guard: { name: ['Ember Ward', '余烬护甲'], detail: ['−7% damage taken per rank', '每级受到伤害 −7%'] },
  reload: { name: ['Quick Chamber', '快装弹仓'], detail: ['10% faster reload per rank', '每级装填时间 −10%'] }
};
export const ACTS = [
  { name: ['Ash & Iron', '灰烬与钢铁'], goal: ['Find the source of the signal.', '寻找信号的源头。'], color: '#ffcf8a', sky: '#3d251c', fog: '180,130,90', motif: 'furnace' },
  { name: ['The Root Network', '根系网络'], goal: ['Restore the living forest to the city.', '让森林的生命重返城市。'], color: '#a8f0ba', sky: '#163f35', fog: '110,180,145', motif: 'forest' },
  { name: ['Winter Circuit', '寒冬回路'], goal: ['Carry the thaw through the frozen relays.', '让融雪的暖流穿过冰封中继站。'], color: '#b8eaff', sky: '#25455b', fog: '140,190,220', motif: 'ice' },
  { name: ['The Memory Vault', '记忆秘库'], goal: ['Recover the names the engines erased.', '找回引擎抹去的名字。'], color: '#e0c0ff', sky: '#402b58', fog: '175,135,210', motif: 'archive' },
  { name: ['A Second Sunrise', '第二次日出'], goal: ['Break the Crown and return the sun.', '打破王冠，让太阳重新升起。'], color: '#ffe6a6', sky: '#635134', fog: '210,185,125', motif: 'sun' }
];
const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
// Each row owns its encounter: route, enemy pack, phase scripts and story consequence.
const rows = [
  ['Cinder Relay','余烬中继','Bellkeeper','守钟人',0,0,['hound','husk','husk'],['slam','barrage','charge'],['beam','slam','charge'], 'The broken Warden carried a message: the city still has a heartbeat. Ring the relay bell.', '破碎守卫留下讯息：城市的心脏仍在跳动。敲响中继钟。','The bell answers. A living root lights the road north.','钟声得到回应，一根活着的树根照亮了北方。'],
  ['Rootwake','根系初醒','Thorn Marshal','荆棘统领',1,1,['hound','hound','husk'],['charge','slam','charge'],['charge','pillars','slam'], 'Roots have wrapped the evacuation rails. Free the first seed engine.', '根系缠住了撤离铁轨。解放第一台种子引擎。','Green returns to the rails. The forest asks for water.','绿色重返铁轨，森林开始呼唤水。'],
  ['Rain Gardens','雨水花园','Rain Collector','集雨者',1,2,['drone','husk','hound'],['conduit','barrage','slam'],['conduit','beam','barrage'], 'The Collector hoards every drop. Open the cisterns before the seedlings die.', '集雨者扣住每一滴水。在幼苗枯萎前打开水池。','The cisterns open. Rain reaches the lower streets.','水池开启，雨水抵达下层街道。'],
  ['Briar Viaduct','荆棘高架','Briar Reaper','荆棘收割者',1,3,['brute','hound','husk'],['hook','slam','barrage'],['hook','pillars','charge'], 'A chain engine tears up new growth. Cross the broken viaduct and silence it.', '锁链引擎撕碎新芽。穿过断桥，让它停下来。','The chains fall. A path to the heartwood opens.','锁链落地，通往树心的路打开了。'],
  ['Heartwood','古木之心','Root Sovereign','根系之王',1,4,['hound','drone','brute'],['pillars','charge','conduit'],['pillars','hook','conduit','slam'], 'The Sovereign binds the forest to the Crown. Sever the command, spare the roots.', '根系之王将森林绑在王冠上。切断命令，留下树根。','The forest is free. Its warmth finds a frozen northern gate.','森林重获自由，暖流抵达冰封的北门。'],
  ['Frostline','霜冻前线','Rime Sentinel','冰霜哨兵',2,2,['husk','drone','husk'],['beam','slam','barrage'],['beam','charge','slam'], 'A wall of cold blocks the refugees. Carry the first ember into winter.', '寒冷之墙拦住了逃难的人。带着第一簇余烬踏入冬天。','The gate thaws. A distant turbine begins to turn.','城门解冻，远处的涡轮开始转动。'],
  ['Turbine Lake','涡轮之湖','Whiteout Turbine','白夜涡轮',2,0,['drone','hound','drone'],['barrage','charge','barrage'],['missiles','beam','charge'], 'The lake powers a blizzard machine. Reach its turbines between the volleys.', '湖水驱动着暴雪机器。在齐射之间抵达涡轮。','The blizzard weakens. You hear voices beneath the ice.','暴雪减弱，你听见冰层下的声音。'],
  ['Blue Crevasse','蓝色裂隙','Glacier Hook','冰川之钩',2,3,['brute','drone','hound'],['hook','beam','slam'],['hook','missiles','beam'], 'Workers sleep below the crevasse. Cut the anchor before their shelter collapses.', '工人沉睡在裂隙下方。在庇护所坍塌前切断锚链。','The shelter holds. The workers give you a relay key.','庇护所保住了，工人们交给你一把中继钥匙。'],
  ['Aurora Engine','极光引擎','Aurora Regent','极光摄政者',2,4,['drone','brute','hound'],['conduit','beam','charge'],['conduit','missiles','pillars','beam'], 'The last ice engine guards a warm archive. Turn its own rhythm against it.', '最后的寒冰引擎守着温暖的秘库。用它的节奏击败它。','Winter breaks. The archive doors remember your name.','寒冬终结，秘库的大门记起了你的名字。'],
  ['Lost Index','失落索引','Index Keeper','索引保管者',3,1,['husk','husk','drone'],['pillars','barrage','slam'],['pillars','beam','slam'], 'The Crown erased a city from its records. Recover the first page.', '王冠从记录中抹去了整座城市。找回第一页。','A thousand names return. One of them is yours.','一千个名字重现，其中一个是你。'],
  ['Echo Gallery','回声长廊','Echo Cantor','回声吟唱者',3,2,['hound','drone','hound'],['beam','barrage','beam'],['beam','conduit','missiles'], 'Every echo repeats the last command. Break the pattern and let the dead speak.', '每一道回声都在重复最后的命令。打破节奏，让逝者说话。','The echoes become a warning: the sun is a captive.','回声变成警告：太阳是一名囚徒。'],
  ['Chain Library','锁链书库','Oath Binder','誓言束缚者',3,3,['brute','husk','drone'],['hook','pillars','barrage'],['hook','conduit','pillars'], 'The truth is chained to a machine oath. Pull its keeper away from the seals.', '真相被机器誓言锁住。将守护者引离封印。','The oath breaks. The Crown was built to protect, then forgot.','誓言破裂。王冠原为守护而建，却忘了初衷。'],
  ['The Witness','最后见证者','Memory Architect','记忆构筑者',3,4,['drone','brute','brute'],['pillars','conduit','hook'],['pillars','beam','hook','missiles'], 'The Architect offers silence. Refuse it. Carry the city\'s memory into the light.', '构筑者许诺宁静。拒绝它，带着城市的记忆走向光。','The people remember. Their signal points to the sun tower.','人们记起来了，他们的信号指向太阳之塔。'],
  ['Sunward Road','向阳之路','Dawn Lancer','黎明枪骑',4,0,['hound','hound','drone'],['charge','barrage','slam'],['charge','beam','barrage'], 'The tower sees you coming. Break its forward guard before the road burns.', '高塔已经发现了你。在道路燃烧前突破前卫。','The road survives. Refugees follow your light.','道路保住了，逃难的人们跟随着你的光。'],
  ['Solar Furnace','太阳熔炉','Helios Smith','日轮铁匠',4,2,['brute','drone','husk'],['slam','pillars','charge'],['slam','missiles','pillars'], 'The furnace feeds the Crown with stolen dawns. Turn off the last forge.', '熔炉用偷来的黎明供养王冠。关闭最后的锻炉。','The forge cools. Real sunlight touches the lower city.','锻炉冷却，真正的阳光触及下城。'],
  ['Broken Throne','破碎王座','Crown Executioner','王冠行刑者',4,3,['drone','hound','brute'],['hook','charge','beam'],['hook','pillars','missiles','charge'], 'Only the Executioner stands between you and the heart. Read the chain, then strike.', '你与核心之间只剩行刑者。看清锁链，然后反击。','The throne is empty. The Crown itself descends.','王座空了，王冠亲自降临。'],
  ['Second Sunrise','第二次日出','The Hollow Sun','空心太阳',4,4,['brute','drone','hound'],['conduit','slam','beam','charge'],['pillars','hook','beam','missiles','conduit'], 'One last engine. Twenty stolen embers. Bring them home.', '最后一台引擎，二十簇被夺走的余烬。带它们回家。','The engines fall quiet. Windows open. For the first time, the ash catches sunlight.','引擎归于寂静，窗户一扇扇打开。灰烬第一次映出了阳光。']
];
// Routes vary pits, safe raised ledges and encounter spacing. All jumps fit the existing movement envelope.
const routes = [
  { length: 4600, gaps: [[1480,120],[2780,140]], ledges: [[630,220,80],[2070,240,100]], seals: [1050,3200] },
  { length: 4900, gaps: [[1660,140],[2950,150]], ledges: [[700,190,60],[2200,260,110]], seals: [1120,3430] },
  { length: 5200, gaps: [[1550,100],[3030,160]], ledges: [[600,300,100],[2200,240,80],[3500,210,65]], seals: [1080,2620] },
  { length: 5500, gaps: [[1540,160],[2900,160],[3750,120]], ledges: [[600,180,70],[2080,280,110],[3280,200,80]], seals: [1040,2480] },
  { length: 5800, gaps: [[1610,140],[3000,150],[3940,140]], ledges: [[640,240,100],[2080,220,70],[3480,250,100]], seals: [1120,2600] }
];
export function buildCampaignLevels() {
  return rows.map((r, index) => {
    const [title, titleZh, bossName, bossZh, act, routeId, pack, phase1, phase2, story, storyZh, after, afterZh] = r;
    const id = index + 4, theme = ACTS[act], route = routes[routeId], end = route.length, arena = end - 1000;
    const shift = (index % 3) * 20;
    const pits = route.gaps.map(([x,w]) => ({ x: x + shift, w, zone: x < end / 3 ? 0 : x < arena ? 1 : 2 }));
    const zoneStarts = [0, Math.round(arena / 2), arena];
    const safe = x => !pits.some(p => x >= p.x - 30 && x <= p.x + p.w + 30);
    const solids = [];
    let cursor = -400;
    for (const p of pits) { solids.push({x:cursor,y:450,w:p.x-cursor,h:250,kind:'ground'}); cursor = p.x+p.w; }
    solids.push({x:cursor,y:450,w:end+400-cursor,h:250,kind:'ground'});
    for (const [x,w,rise] of route.ledges) solids.push({x:x+shift,y:450-rise,w,h:14,kind:'catwalk',oneway:true});
    const spawns = [480,740,1380,1940,2210,2840,3340,3660,4120].filter(x => x < arena - 120 && safe(x)).map((x,i) => [pack[i%pack.length],x]);
    const seals = route.seals.map((x,i) => ({ x, l:x-210, r:x+300, wave: [[pack[i%3],x-170],[pack[(i+1)%3],x+260],...(act > 1 ? [[pack[(i+2)%3],x+210]] : [])] }));
    const hazardXs = [1850+shift,3200+shift].filter(x => x < arena-180 && safe(x) && !seals.some(a => x > a.l-130 && x < a.r+130));
    const ZONES = zoneStarts.map((start,i) => ({ id:['railyard','wastes','cathedral'][i], music:['railyard','wastes','cathedral'][i], name:i === 2 ? bossName.toUpperCase() : title.toUpperCase(), sub:i === 2 ? bossZh : titleZh, chapter:`${id}.${i+1}`, start, end:zoneStarts[i+1]||end, pit:act===2?'abyss':act===3?'glass':undefined }));
    const variant = phase1.includes('hook') || phase1.includes('pillars') ? 'reforged' : phase1.includes('conduit') ? 'tempest' : 'warden';
    return { id, numeral:roman[id-1], title:title.toUpperCase(), titleZh, descriptor:['Relay assault','Root pathways','Ice crossings','Memory seals','Sun tower'][act], act, story:[story,storyZh], aftermath:[after,afterZh],
      terrain:'descent', flood:null, upgrades:[], enemyHpMultiplier:1, containDrones:true, buildSeed:100+id*17,
      artBuilder:seed => buildCampaignArt(seed,theme), visuals:{pits:'aftermath',fog:[theme.fog,theme.fog,theme.fog],grade:[theme.sky,theme.sky,theme.sky],ambient:[.58,.55,.52],ember:theme.color},
      BOSS:{variant,armor:260+act*30,hp:320+act*35,w:140,h:220,name:bossName.toUpperCase(),sub:bossZh,bar2:`${bossName.toUpperCase()} · UNBOUND`,unbound:`${bossName.toUpperCase()} · UNBOUND`,sub2:'核心暴露',scripts:[phase1,phase2],color:theme.color,crest:routeId},
      completion:{title:`${title.toUpperCase()} · RESTORED`,bridge:after,sub:afterZh},
      WORLD_END:end,ARENA:{left:arena,right:end,trigger:arena+180},ZONES,zoneIndexAt:x=>x>=arena?2:x>=zoneStarts[1]?1:0,
      buildSolids:()=>solids.map(s=>({...s})),PITS:pits,ENEMIES:spawns,AMBUSHES:seals,
      CHECKPOINTS:[60,...seals.map(a=>a.r+60),arena-100],MEDKITS:[...seals.map(a=>[a.r+70,430]),[arena-70,430]],
      LIGHTS:[300,...seals.map(a=>a.x),arena+80,end-80].map(x=>({x,y:350,r:280,c:act===1?[120,230,170]:act===2?[170,220,255]:[220,180,130],f:.2,kind:'signal',tint:'cool'})),
      PROPS:[['tower',260],['spire',2100],['statue',arena+70]],hazards:hazardXs.map((x,i)=>({x,w:86,offset:i*1.7,period:5.2,warning:1.25,active:.55,damage:14+act*2})), theme
    };
  });
}
function buildCampaignArt(seed, theme) {
  const art = buildLevel3Art(seed);
  art.skies = [0,1,2].map(zone => {
    const cv=makeCanvas(960,540), c=cv.getContext('2d'), gr=c.createLinearGradient(0,0,0,540);
    gr.addColorStop(0,'#090e14'); gr.addColorStop(.65,theme.sky); gr.addColorStop(1,'#12171b'); c.fillStyle=gr;c.fillRect(0,0,960,540);
    c.fillStyle=theme.color;c.globalAlpha=.23;c.beginPath();c.arc(640-zone*90,160,theme.motif==='sun'?100:62,0,Math.PI*2);c.fill();c.globalAlpha=1;
    return cv;
  });
  art.layers = [0,1,2].map(zone => {
    const layer=(depth)=>{
      const cv=makeCanvas(LAYER_W,540),c=cv.getContext('2d');c.fillStyle=['#142027','#101b20','#0d161b'][depth];c.strokeStyle=theme.color;
      for(let i=0;i<18;i++){
        const x=i*185+(seed%53),h=80+((i*71+zone*31)%220),y=490;
        if(theme.motif==='forest') { c.fillRect(x,y-h,12,h);c.beginPath();c.ellipse(x+6,y-h,55,100,Math.sin(i),0,7);c.fill(); }
        else if(theme.motif==='ice') {c.beginPath();c.moveTo(x-65,y);c.lineTo(x+12,y-h);c.lineTo(x+66,y);c.fill();c.globalAlpha=.18;c.beginPath();c.moveTo(x+12,y-h);c.lineTo(x+25,y);c.stroke();c.globalAlpha=1;}
        else if(theme.motif==='archive') { c.fillRect(x,y-h,65,h);c.clearRect(x+14,y-h+28,37,h-28);c.globalAlpha=.15;for(let q=0;q<4;q++)c.strokeRect(x+6,y-h+q*23,53,14);c.globalAlpha=1; }
        else if(theme.motif==='sun') { c.fillRect(x,y-h,20,h);c.beginPath();c.arc(x+10,y-h,38,Math.PI,0);c.fill();c.globalAlpha=.2;c.fillStyle=theme.color;c.fillRect(x+6,y-h+25,8,60);c.globalAlpha=1;c.fillStyle=['#142027','#101b20','#0d161b'][depth]; }
        else {c.fillRect(x,y-h,50,h);c.fillRect(x-10,y-h-15,70,15);}
      }return cv;
    };
    return {far:layer(0),mid:layer(1),near:layer(2),fg:makeCanvas(LAYER_W,540)};
  });
  return art;
}
export const ORIGINAL_STORIES = [
  [['A signal survives beneath the ash. Follow it through the dead woods and break the Foundry Warden.', '灰烬之下还有信号。穿过死林，击败铸炉守卫。'],['The foundry falls silent. The signal leads upward, into rising water.', '铸炉归于寂静。信号向上延伸，深入上涨的洪水。']],
  [['The flood is climbing faster than the city can breathe. Reach the Storm Crown and open its gates.', '洪水涨得比城市的呼吸还快。抵达风暴王冠，打开闸门。'],['The storm breaks. Below the crown, a guardian has rebuilt itself.', '风暴止息，王冠下方有一个守卫重铸了自己。']],
  [['The last descent was only the end of the old road. A reforged guardian holds the first relay key.', '最后一次下降只是旧路的终点。重铸守卫握着第一把中继钥匙。'],['The key carries a message: twenty engines bind the sun. Find the relay.', '钥匙带来讯息：二十台引擎束缚着太阳。找到中继站。']]
];
