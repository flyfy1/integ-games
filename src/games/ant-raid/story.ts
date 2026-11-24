import type { Loc } from './types';

/**
 * The story: short scenes between chapters and before each boss. Gentle tone: people appear only as a shoe, a hand
 * or a shadow, nobody is hurt, only food changes hands. Ends with the two colonies sharing the last marshmallow.
 */
export type Speaker = 'mim' | 'pip' | 'gulp' | 'rumble' | 'blue' | 'cinder' | 'narrator';
export type Line = { who: Speaker; text: Loc };
export type Scene = { id: string; lines: Line[] };
export const SPEAKERS: Record<Speaker, { name: Loc; color: string }> = {
  mim: { name: { en: 'Queen Mim', zh: '蚁后咪咪' }, color: '#ffb454' },
  pip: { name: { en: 'Pip', zh: '小皮' }, color: '#8fe08a' },
  gulp: { name: { en: 'Old Gulp', zh: '老咕' }, color: '#9cc46a' },
  rumble: { name: { en: 'Rumble', zh: '轰轰' }, color: '#ff7a5a' },
  blue: { name: { en: 'Bluestreak', zh: '蓝闪' }, color: '#5ab8ff' },
  cinder: { name: { en: 'Queen Cinder', zh: '女王“烬”' }, color: '#ff6a3d' },
  narrator: { name: { en: '', zh: '' }, color: '#fff4e0' }
};
const L = (who: Speaker, en: string, zh: string): Line => ({ who, text: { en, zh } });

export const SCENES: Record<string, Scene> = {
  'c1-intro': { id: 'c1-intro', lines: [
    L('narrator', 'Summer. Under the lawn, a colony wakes up hungry.', '夏天。草坪底下，一窝蚂蚁饿醒了。'),
    L('mim', 'Pip, can you smell that? Butter. Sugar. A picnic.', '小皮，闻到了吗？黄油，糖。有人野餐。'),
    L('pip', 'I can smell it! Which way, my Queen?', '闻到了！往哪边走，女王？'),
    L('mim', 'Whichever way you lay the scent. Where you draw it, the colony follows.', '你把气味铺到哪，大家就跟到哪。')
  ] },
  'boss-toad': { id: 'boss-toad', lines: [
    L('pip', 'The last slice of cake! And... a very large frog.', '最后一块蛋糕！还有……一只好大的青蛙。'),
    L('gulp', 'Toad. Old Gulp. This cake is my lookout post, and you look delicious.', '是蟾蜍。叫我老咕。这蛋糕是我的地盘，你们看起来很好吃。'),
    L('mim', 'He only snaps at what is nearest and in front of him. And he gets sleepy.', '他只卷正前方最近的。而且他容易犯困。')
  ] },
  'c1-outro': { id: 'c1-outro', lines: [
    L('gulp', 'Hmph. Take your cake. I was on a diet anyway.', '哼。蛋糕拿去吧，反正我在减肥。'),
    L('mim', 'The pantry is full for a week! Pip, the sandbox is next.', '粮仓够吃一周了！小皮，下一站是沙坑。')
  ] },
  'c2-intro': { id: 'c2-intro', lines: [
    L('pip', 'The sandbox! Sugar cubes, juice boxes, and... it is raining?', '沙坑！方糖、果汁盒，还有……下雨了？'),
    L('mim', 'Sprinklers. They wash the scent away. Lay it again, a little smarter each time.', '是洒水器，会冲掉气味。冲掉就再铺，一次比一次聪明。')
  ] },
  'boss-mower': { id: 'boss-mower', lines: [
    L('rumble', 'BEEP. LAWN TOO LONG. BEEP. ANTS ARE ALSO LAWN.', '哔。草太长。哔。蚂蚁也算草。'),
    L('pip', 'It is going to drive right over our trail!', '它要直接碾过我们的路线了！'),
    L('mim', 'It shows where it will go next. Watch the grass, dig under, and lay it again.', '它会先在草上画出下一条路。看准了，挖地道，再铺回去。')
  ] },
  'c2-outro': { id: 'c2-outro', lines: [
    L('rumble', 'BATTERY LOW. GOING HOME. BEEP.', '电量低。回家充电。哔。'),
    L('mim', 'Sixty crumbs under its wheels. I am proud of you, Pip. Now, the pond.', '在它轮子底下搬了六十粒。我为你骄傲，小皮。下一站，池塘。')
  ] },
  'c3-intro': { id: 'c3-intro', lines: [
    L('pip', 'Water everywhere. Ants cannot swim!', '到处是水。蚂蚁不会游泳！'),
    L('mim', 'No, but we can hold on to each other. Three of us make a bridge.', '不会，但我们可以手拉手。三只就是一座桥。')
  ] },
  'boss-kingfisher': { id: 'boss-kingfisher', lines: [
    L('blue', 'Oh, a bridge! I love bridges. They are so easy to see from up here.', '哇，一座桥！我最喜欢桥了，从上面看得一清二楚。'),
    L('mim', 'When her shadow falls on the bridge, lift it. When she flies off, lower it.', '她的影子落到桥上就收桥，她飞走了再放下。')
  ] },
  'c3-outro': { id: 'c3-outro', lines: [
    L('blue', 'Fine, fine. That biscuit was shaped like a fish but tasted like a biscuit.', '好吧好吧。那饼干长得像鱼，吃起来就是饼干。'),
    L('pip', 'The sun is going down. There is a campfire on the hill.', '太阳下山了。山坡上有篝火。'),
    L('mim', 'Marshmallows. And another colony. Stay close tonight.', '棉花糖。还有另一窝蚂蚁。今晚跟紧我。')
  ] },
  'c4-intro': { id: 'c4-intro', lines: [
    L('pip', 'I cannot see anything!', '我什么都看不见！'),
    L('mim', 'Then send a Scout ahead. And keep the Flyers away from that humming lamp.', '那就派侦察蚁先去。飞蚁离那盏嗡嗡响的灯远点。')
  ] },
  'boss-cinder': { id: 'boss-cinder', lines: [
    L('cinder', 'Little Mim. The campfire feast is ours. It has always been ours.', '小咪咪。篝火盛宴是我们的，一直都是。'),
    L('mim', 'There is enough here for two colonies, Cinder.', '这里的东西够两窝蚂蚁吃，烬。'),
    L('cinder', 'Then prove it. Out-haul me, or cut all three of my trails at once.', '那就证明给我看。比我搬得多，或者同时切断我三条路线。')
  ] },
  'c4-outro': { id: 'c4-outro', lines: [
    L('cinder', '...You did not take everything. Why?', '……你们没有全拿走。为什么？'),
    L('mim', 'Because the last marshmallow is too big for one colony.', '因为最后一颗棉花糖，一窝蚂蚁搬不动。'),
    L('narrator', 'Under the stars, red ants and brown ants carry the last marshmallow together, halfway to each nest.', '星光下，红蚂蚁和棕蚂蚁一起抬着最后一颗棉花糖，各自往家走了一半。'),
    L('pip', 'Same time next summer?', '明年夏天，老地方见？')
  ] }
};
