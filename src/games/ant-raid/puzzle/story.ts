import type { Line, Scene, Speaker } from '../story';

/** Short scenes after a first clear: one tap skips the lot. Gentle tone, food changes hands, nobody is hurt. */
const L = (who: Speaker, en: string, zh: string): Line => ({ who, text: { en, zh } });
export const PUZZLE_SCENES: Record<string, Scene> = {
  'p1-intro': { id: 'p1-intro', lines: [
    L('narrator', 'Summer. Under the lawn, a colony wakes up hungry.', '夏天。草坪底下，一窝蚂蚁饿醒了。'),
    L('mim', 'Pip, you found the first cookie. Well done.', '小皮，你找到了第一块饼干，干得好。'),
    L('pip', 'I only drew the trail. They did the walking!', '我只是画了路线，走路的是大家！'),
    L('mim', 'That is the whole trick. Plan it well, and the colony follows.', '诀窍就在这里。计划做好，蚁群自然跟上。')
  ] },
  'p1-outro': { id: 'p1-outro', lines: [
    L('pip', 'A whole strawberry! Four of us, all at once.', '一整颗草莓！我们四个一起抬回来的。'),
    L('mim', 'Who leaves first matters as much as where the trail goes.', '谁先出发，和路线往哪走一样重要。'),
    L('mim', 'Next: the stream by the hedge, and the chalk lines the children drew.', '下一站：篱笆边的小溪，还有孩子们画的粉笔线。')
  ] },
  'p2-outro': { id: 'p2-outro', lines: [
    L('pip', 'The spider ate the first two again. On purpose, this time.', '蜘蛛又吃了最先的两只。不过这回是我们故意的。'),
    L('mim', 'Send the ones you can spare first. Clever.', '先派能牺牲的去。聪明。')
  ] },
  'p3-outro': { id: 'p3-outro', lines: [
    L('pip', 'Big ants, twin holes... the garden is full of tricks.', '大力蚁、双子洞……花园里到处是机关。'),
    L('mim', 'And you read every one of them before you pressed GO.', '而你每次都在出发前就看懂了。')
  ] },
  'p4-outro': { id: 'p4-outro', lines: [
    L('narrator', 'The pantry is full. The picnic blanket is folded away.', '粮仓满了。野餐布也收起来了。'),
    L('mim', 'Rest now, Pip. Tomorrow there will be new crumbs.', '休息吧，小皮。明天还会有新的面包屑。')
  ] }
};
