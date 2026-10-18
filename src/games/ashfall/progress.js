// Cabinet storage is optional. v2 records remain intact; campaign-v3 separates difficulties.
export function readStorage(storage,key,fallback) { try { return storage?.get(key,fallback) ?? fallback; } catch { return fallback; } }
export function writeStorage(storage,key,value) { try { if (!storage?.set) return false; storage.set(key,value); return JSON.stringify(storage.get?.(key, undefined)) === JSON.stringify(value); } catch { return false; } }
const validId=id=>Number.isInteger(id)&&id>=1&&id<=20;
const finite=(n,max=1e9)=>Number.isFinite(n)&&n>=0&&n<=max;
const recordKey=d=>`ashfall-campaign-v3-${d}`;
export function loadProgress(storage,difficulty='normal') {
  const value=readStorage(storage,recordKey(difficulty),{}), ids=Array.isArray(value.cleared)?value.cleared.filter(validId):[];
  if(difficulty==='normal') {
    const old=readStorage(storage,'ashfall-progress-v2',{});
    if(old?.version===2&&Array.isArray(old.cleared)) ids.push(...old.cleared.filter(id=>[1,2,3].includes(id)));
    if(readStorage(storage,'ashfall-level2',false)===true) ids.push(1);
  }
  return new Set(ids);
}
export function saveProgress(storage,difficulty,cleared) { return writeStorage(storage,recordKey(difficulty),{version:3,cleared:[...cleared].filter(validId)}); }
export function loadBest(storage,startId,difficulty='normal') {
  const n=readStorage(storage,`ashfall-bests-v3-${difficulty}`,{})?.[startId]; return finite(n)?n:0;
}
export function saveBest(storage,startId,score,difficulty='normal') {
  const bests=Object.fromEntries(Array.from({length:20},(_,i)=>[i+1,loadBest(storage,i+1,difficulty)]));
  bests[startId]=Math.max(bests[startId]||0,finite(score)?score:0); return {best:bests[startId],saved:writeStorage(storage,`ashfall-bests-v3-${difficulty}`,bests)};
}
export function loadResume(storage,difficulty) {
  const v=readStorage(storage,`ashfall-resume-v3-${difficulty}`,null), r=v?.run;
  if(!v||v.version!==3||v.difficulty!==difficulty||!validId(v.level)||!validId(v.start)||v.start>=v.level||!r) return null;
  if(!['score','kills','deaths','playT'].every(k=>finite(r[k]))||!r.forge||!['edge','guard','reload'].every(k=>Number.isInteger(r.forge[k])&&r.forge[k]>=0&&r.forge[k]<=3)) return null;
  if(!Array.isArray(r.results)||r.results.length!==v.level-v.start||r.results.some((x,i)=>!x||typeof x!=='object'||x.id!==v.start+i||!['time','kills','falls','score'].every(k=>finite(x[k])))) return null;
  // Only known scalar fields cross the persistence seam; never restore live actors/events.
  return {version:3,difficulty,level:v.level,start:v.start,run:{score:r.score,kills:r.kills,deaths:r.deaths,playT:r.playT,forge:{...r.forge},results:r.results.map(x=>({id:x.id,numeral:['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'][x.id-1],time:x.time,kills:x.kills,falls:x.falls,score:x.score,rank:['S','A','B','C'].includes(x.rank)?x.rank:'C'})),reported:false},reward:['edge','guard','reload'].includes(v.reward)?v.reward:null};
}
export function saveResume(storage,difficulty,value) { return writeStorage(storage,`ashfall-resume-v3-${difficulty}`,value?{version:3,difficulty,...value}:null); }
