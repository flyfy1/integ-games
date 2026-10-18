import { afterEach, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import { LEVELS } from '../src/games/ashfall/levels.js';
import { loadResume, loadProgress } from '../src/games/ashfall/progress.js';
let controller: any;
const complete=vi.fn(),report=vi.fn();
function boot(id=4,difficulty='normal',stored: Record<string,any>={}) {
  history.replaceState({},'',`/play/ashfall?ashfall-debug&ashfall-level=${id}&difficulty=${difficulty}`);
  const host=document.createElement('div');document.body.append(host);
  controller=createAshfall(host,{storage:{get:(k:string,f:any)=>stored[k]??f,set:(k:string,v:any)=>stored[k]=structuredClone(v)},isReducedMotion:true,random:()=>.5,reportComplete:complete,reportScore:report} as any);
  const d=(globalThis as any).__ashfall;d.start();return d;
}
function finish(d:any) {
  d.warp(d.level.ARENA.trigger+40);d.step(240);d.enemies.forEach((e:any)=>e.dead=true);
  Object.assign(d.boss,{phase:2,armor:0,hp:1,state:'idle',cd:100});Object.assign(d.player,{x:d.boss.x-160,y:d.boss.y,face:1,ammo:4,shootCd:0,invuln:true});d.press('shoot');d.step(400);
}
afterEach(()=>{controller?.destroy();document.body.replaceChildren();vi.clearAllMocks();});
it('has twenty authored encounters with safe ground, unique patterns and bilingual consequences',()=>{
  expect(LEVELS).toHaveLength(20);expect(new Set(LEVELS.map(l=>l.BOSS.name)).size).toBe(20);
  const scripts=new Set();
  for(const l of LEVELS as any[]) {
    expect(l.story).toHaveLength(2);expect(l.aftermath).toHaveLength(2);
    const ground=l.buildSolids().filter((s:any)=>!s.oneway);
    const onGround=(x:number)=>ground.some((s:any)=>x>=s.x&&x<=s.x+s.w);
    for(const x of l.CHECKPOINTS)expect(onGround(x),`checkpoint ${l.id}:${x}`).toBe(true);
    for(const [type,x] of l.ENEMIES)if(type!=='drone')expect(onGround(x),`enemy ${l.id}:${x}`).toBe(true);
    for(const a of l.AMBUSHES)for(let x=a.l;x<a.r;x+=10)expect(onGround(x),`seal ${l.id}:${x}`).toBe(true);
    if(l.id>3){expect(l.WORLD_END).toBeLessThan(6000);scripts.add(JSON.stringify(l.BOSS.scripts));}
  }
  expect(scripts.size).toBe(17);
});
for(const difficulty of ['easy','normal','hard'])for(let id=1;id<=20;id++)it(`${difficulty} stage ${id} settles once and advances cleanly`,()=>{
  const stored:any={},d=boot(id,difficulty,stored);finish(d);
  expect(d.g.results).toHaveLength(1);expect(d.g.mode).toBe(id===20?'victory':'interlude');expect(d.g.results[0].difficulty).toBe(difficulty);
  const score=d.g.score;d.step(300);expect(d.g.score).toBe(score);expect(d.g.results).toHaveLength(1);
  if(id<20){const snapshot=loadResume({get:(k:string,f:any)=>stored[k]??f},difficulty);expect(snapshot?.level).toBe(id+1);d.continue();expect(d.g.level).toBe(id+1);expect(d.g.forge.edge).toBe(1);expect(d.g.pillars).toEqual([]);expect(d.g.impacts).toEqual([]);}
  expect(report).not.toHaveBeenCalled();
});
it.each(['easy','normal','hard'])('difficulty %s changes reaction time and real damage without inflating boss health',difficulty=>{
  const d=boot(4,difficulty);d.warp(d.level.ARENA.trigger+40);d.step(240);d.enemies.forEach((e:any)=>e.dead=true);
  Object.assign(d.boss,{state:'idle',next:'slam',cd:0,phase:1});d.step();
  expect(d.boss.armor).toBe(260);expect(d.boss.windup).toBeCloseTo(.95*1.12*({easy:1.3,normal:1,hard:.88}[difficulty]!));
  Object.assign(d.player,{x:d.boss.slamX,y:450,hp:100,iframe:0,invuln:false,rolling:false,grounded:true});
  while(d.boss.state==='windup')d.step();
  expect(d.player.hp).toBeLessThan(100);expect(d.player.hp).toBeGreaterThan(0);
  const damage=100-d.player.hp;expect(damage).toBeCloseTo(18*({easy:.55,normal:1,hard:1.35}[difficulty]!));
});
it('preserves old records, separates difficulty and rejects corrupt resumes',()=>{
  const data:any={'ashfall-progress-v2':{version:2,cleared:[1,3,99]},'ashfall-level2':true};const storage={get:(k:string,f:any)=>data[k]??f};
  expect([...loadProgress(storage,'normal')]).toEqual([1,3]);expect([...loadProgress(storage,'easy')]).toEqual([]);
  data['ashfall-resume-v3-normal']={version:3,difficulty:'normal',level:21,start:1,run:{}};expect(loadResume(storage,'normal')).toBeNull();
  data['ashfall-resume-v3-normal']={version:3,difficulty:'normal',level:2,start:1,run:{score:1,kills:1,deaths:0,playT:10,forge:{edge:100,guard:0,reload:0},results:[]}};expect(loadResume(storage,'normal')).toBeNull();
});
it('caps forge choices, carries them through death and keeps full recovery on new stages',()=>{
  const d=boot(4);Object.assign(d.g.forge,{edge:3,guard:3,reload:2});finish(d);
  expect((document.querySelector('[data-reward=edge]') as HTMLButtonElement).disabled).toBe(true);
  d.continue();expect(d.g.forge).toEqual({edge:3,guard:3,reload:3});expect(d.player.hp).toBe(100);
  Object.assign(d.player,{dead:true,deadT:4,hp:0});d.step();expect(d.g.forge.reload).toBe(3);expect(d.player.hp).toBe(100);
  finish(d);d.continue();expect(d.g.forge).toEqual({edge:3,guard:3,reload:3});
});
it('ordinary held jumps cross every new route gap',()=>{
  for(let id=4;id<=20;id++){
    const d=boot(id);d.enemies.forEach((e:any)=>e.dead=true);d.g.ambushDone=new Set([0,1]);
    for(const pit of d.level.PITS){d.warp(pit.x-35);Object.assign(d.player,{vx:300,vy:0,grounded:true,hp:100,atk:null});d.press('right');d.press('jump');d.step(46);d.press('jump',false);d.press('right',false);expect(d.player.x,`gap ${id}:${pit.x}`).toBeGreaterThan(pit.x+pit.w);expect(d.player.hp).toBe(100);}
    controller.destroy();
  }
});
it('Chinese controls and results remain readable',()=>{
  controller=undefined;const d=boot(20,'easy',{'ashfall-language':'zh'});d.render();expect(document.querySelector('.ashfall')?.getAttribute('lang')).toBe('zh-CN');finish(d);expect(document.querySelector('.af-panel')?.textContent).toContain('第二次日出');
});
it('ignores null result entries in otherwise valid resume saves',()=>{
  const value={version:3,difficulty:'normal',level:2,start:1,run:{score:1,kills:1,deaths:0,playT:10,forge:{edge:0,guard:0,reload:0},results:[null]}};
  expect(()=>loadResume({get:()=>value},'normal')).not.toThrow();expect(loadResume({get:()=>value},'normal')).toBeNull();
});
it.each(['constructor','toString','__proto__'])('rejects inherited difficulty key %s',difficulty=>{
  const d=boot(4,difficulty);expect(d.difficulty).toBe('normal');
});
