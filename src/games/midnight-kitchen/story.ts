import type { BarkDef, Loc } from './types';

/**
 * Story data: the cast, the dialogue scenes and the in-level barks. Pure data, no DOM.
 *
 * To add a scene: add an entry to `SCENES` and reference its id from a level's `intro` / `outro` in
 * `data/levels.ts`. To add barks: add a `BARKS[levelId]` list. The dialogue UI and the bark bubble need no changes.
 * A portrait for a new speaker goes in `render/portraits.ts`; a speaker without one gets a plain coloured badge.
 */
export type Mood = 'neutral' | 'happy' | 'worried' | 'angry' | 'sad' | 'smug';
export type Character = { id: string; name: Loc; color: string; side: 'left' | 'right' };
export type SceneLine = { who: string; text: Loc; mood: Mood };
export type Scene = { id: string; backdrop: string; lines: SceneLine[] };

export const CHARACTERS: Record<string, Character> = {
  pip: { id: 'pip', name: { en: 'Pip', zh: '团团' }, color: '#fff4e0', side: 'left' },
  ladle: { id: 'ladle', name: { en: 'Old Ladle', zh: '老汤勺' }, color: '#c9d4e3', side: 'right' },
  grind: { id: 'grind', name: { en: 'Sgt. Grind', zh: '研磨军士' }, color: '#c98b5a', side: 'right' },
  bun: { id: 'bun', name: { en: 'Bun', zh: '阿面' }, color: '#f3d9a8', side: 'right' },
  shelly: { id: 'shelly', name: { en: 'Shelly', zh: '蛋蛋' }, color: '#ffe9c4', side: 'right' },
  frost: { id: 'frost', name: { en: 'Frost', zh: '阿冰' }, color: '#aee6ff', side: 'right' },
  scout: { id: 'scout', name: { en: 'Scout Ant', zh: '侦察蚁' }, color: '#b0563c', side: 'right' },
  queen: { id: 'queen', name: { en: 'Queen Crumb', zh: '碎屑女王' }, color: '#d9627a', side: 'right' },
  drainking: { id: 'drainking', name: { en: 'The Drain King', zh: '下水道之王' }, color: '#6f97a6', side: 'right' },
  greasegolem: { id: 'greasegolem', name: { en: 'Grease Golem', zh: '油垢魔像' }, color: '#c49a4a', side: 'right' },
  baron: { id: 'baron', name: { en: 'The Pantry Baron', zh: '储物柜男爵' }, color: '#a796ab', side: 'right' },
  bloom: { id: 'bloom', name: { en: 'The Bloom', zh: '霉华' }, color: '#8cc7ad', side: 'right' },
  granny: { id: 'granny', name: { en: 'Granny (a memory)', zh: '奶奶（回忆）' }, color: '#f4c99a', side: 'right' },
  stew: { id: 'stew', name: { en: 'Sunday Stew', zh: '星期天的炖菜' }, color: '#e09a6a', side: 'right' }
};

const say = (who: string, en: string, zh: string, mood: Mood = 'neutral'): SceneLine => ({ who, text: { en, zh }, mood });
const scene = (id: string, lines: SceneLine[], backdrop = 'countertop'): Scene => ({ id, backdrop, lines });

const SCENE_LIST: Scene[] = [
  // ------------------------------------------------------------ Chapter 1: Countertop
  scene('c1-1-intro', [
    say('pip', 'Click. That was the fridge door. So it is midnight, and I am… outside the fridge?', '咔哒。是冰箱门关上的声音。也就是说现在是午夜，而我……在冰箱外面？', 'worried'),
    say('ladle', 'You rolled off the plate at dinner, rice ball. Nobody noticed. Welcome to the counter.', '晚饭的时候你从盘子上滚下来了，小饭团。没人发现。欢迎来到台面。'),
    say('pip', 'Nobody noticed? I am from Tuesday! I had a whole quiet evening planned at the back of the shelf.', '没人发现？我可是星期二的剩饭！本来打算在架子最里面安安静静过一晚的。', 'sad'),
    say('ladle', 'Plans change. See that cake? Mei turns seven in the morning. And tonight, everything that lives in the walls wants a slice.', '计划赶不上变化。看见那个蛋糕了吗？天一亮，小美就七岁了。而今晚，住在墙缝里的家伙们都想来分一块。'),
    say('grind', 'Ants at the far end! I grind on Heat, and I needed it yesterday!', '台面那头有蚂蚁！我磨胡椒要火候，而且早就该有了！', 'angry'),
    say('ladle', 'Light a Burner, sous-chef. Heat first. Pepper second.', '点个炉头吧，副厨。先有火候，再上胡椒。'),
    say('pip', 'Sous-chef? …I have been promoted. Okay. Okay! Burner first.', '副厨？……我升职了。好。好！先点炉头。', 'happy')
  ]),
  scene('c1-1-outro', [
    say('pip', 'Not a single bite! …Did you see their faces, though? They looked so hungry.', '一口都没被咬到！……不过你看到它们的表情了吗？它们看起来好饿。', 'happy'),
    say('ladle', 'Ants are always hungry.', '蚂蚁永远是饿的。'),
    say('grind', 'Not like this. They used to wait for crumbs to fall. Tonight they marched.', '不是这种饿法。以前它们只等着碎屑掉下来。今晚，它们是列队来的。', 'worried'),
    say('ladle', 'Hm. Wake the Dough, rice ball. We will want a wall before the next lot arrives.', '嗯。去把面团叫醒，小饭团。下一批来之前，我们需要一堵墙。')
  ]),
  scene('c1-2-intro', [
    say('bun', '…mm. Five more minutes. I am still rising.', '……嗯。再睡五分钟。我还在发呢。'),
    say('pip', 'Bun, they are coming down every lane now. Can you just… stand there? Be in the way?', '阿面，它们现在每一路都来了。你能不能就……站在那儿？挡着路？', 'worried'),
    say('bun', 'Standing there is my whole thing. If they chew on me, leave me be a moment. I rise back.', '站着不动就是我的拿手好戏。要是被啃了，别管我，过一会儿我自己会发回来。', 'happy'),
    say('grind', 'And spend your spare Heat on us. Tap a guard to upgrade it. I look terrific with a second grinder.', '火候有富余就花在我们身上。点一下守卫就能升级。我装上第二个磨头可帅了。', 'smug'),
    say('ladle', 'Something quick is in that crowd tonight. Hard shell. Do not let it reach the cake.', '今晚那群里有个跑得快的，壳很硬。别让它跑到蛋糕那儿。', 'worried')
  ]),
  scene('c1-2-outro', [
    say('bun', 'Chewed. Slightly. I will be fine by breakfast.', '被啃了。一点点。早饭前就能好。'),
    say('pip', 'Ladle, one of the ants dropped this. It is a biscuit crumb… they were carrying it like a shield.', '老汤勺，有只蚂蚁掉了这个。是块饼干屑……它们把它当盾牌举着。', 'worried'),
    say('ladle', 'Then somebody is teaching them. Ants do not invent shields.', '那就是有人在教它们。蚂蚁可发明不出盾牌。'),
    say('shelly', 'Did someone say shields? I go OVER shields. I have never done it. But I am very sure.', '有人说盾牌吗？我能从盾牌上面越过去。虽然从没试过，但我非常确定。', 'happy')
  ]),
  scene('c1-3-intro', [
    say('shelly', 'To be clear, I am the one who throws. I am not the one who gets thrown. That is important to me.', '先说清楚，我是负责扔的那个，不是被扔的那个。这一点对我很重要。', 'worried'),
    say('ladle', 'Stand next to Bun, Shelly. Egg and dough. Some things are simply better together.', '站到阿面旁边去，蛋蛋。鸡蛋配面团，有些东西凑在一起就是更好。'),
    say('pip', 'That is a recipe! Neighbours on the counter make a recipe! Is there a book for this?', '这就是食谱！在台面上挨在一起就能做出食谱！有没有一本书专门记这个？', 'happy'),
    say('ladle', 'There is now. You are writing it. Try things next to other things.', '现在有了。你正在写。把东西摆到别的东西旁边，多试试。', 'smug')
  ]),
  scene('c1-3-outro', [
    say('pip', 'Two recipes in the Cookbook. I used to be an ingredient. Now I have a Cookbook.', '菜谱上已经有两道了。我以前只是一种食材，现在我有一本菜谱。', 'happy'),
    say('grind', 'Sous-chef. Look at this crumb shield. The back of it.', '副厨，看看这块饼干盾牌。看背面。', 'worried'),
    say('pip', 'It is… fuzzy. Green. It smells like the very back of the fridge.', '它……毛茸茸的。绿色的。闻起来像冰箱最里面的味道。', 'worried'),
    say('ladle', '…Put it down, Pip. Wash your rice. We have flies coming.', '……放下它，团团。把你的米洗一洗。果蝇要来了。', 'sad')
  ]),
  scene('c1-4-intro', [
    say('frost', 'I heard there was a situation. I am here to make it slower.', '听说这儿有情况。我是来让情况变慢的。', 'smug'),
    say('pip', 'Frost! And you brought… is that chili asleep?', '阿冰！你还带了……那个辣椒是睡着了吗？'),
    say('frost', 'Do not wake it until you mean it. One lane, one time, very loud.', '不到真要用的时候别叫醒它。一路，一次，动静很大。'),
    say('ladle', 'Flies overhead tonight; walls will not stop them. And something slow is leaving a trail. Do not let the others run on it.', '今晚头顶有果蝇，墙拦不住它们。还有个很慢的家伙会留下一道痕迹，别让其他的踩着它跑起来。', 'worried')
  ]),
  scene('c1-4-outro', [
    say('scout', 'Wait! Please. I am not here to eat. I am here to ask you to stop winning.', '等等！求你们了。我不是来吃东西的。我是来请你们别再赢了。', 'worried'),
    say('pip', 'That is a strange thing to ask.', '这个请求可真奇怪。'),
    say('scout', 'The Queen promised the Bloom your cake. If she fails, it will not feed us. And we are so hungry now. We were never hungry like this before.', '女王答应把你们的蛋糕献给“霉华”。要是她失败了，它就不再喂我们。可我们现在好饿。以前从来没有这么饿过。', 'sad'),
    say('ladle', 'The Bloom. So it has a name now.', '霉华。原来它现在有名字了。', 'sad'),
    say('pip', 'Ladle? You know what that is?', '老汤勺？你知道那是什么？', 'worried'),
    say('ladle', 'Get the Onion and the Whisk. The Queen is coming herself.', '去把洋葱和打蛋器叫来。女王要亲自来了。')
  ]),
  scene('c1-5-intro', [
    say('queen', 'Little grain. Step aside. My children have walked a long way on empty stomachs.', '小米粒，让开。我的孩子们空着肚子走了很远的路。', 'smug'),
    say('pip', 'It is a birthday cake, Your Majesty. It is for a seven-year-old. You can have the crumbs after, like always!', '陛下，这是生日蛋糕，是给一个七岁孩子的。等吃完了碎屑都归你们，就像以前一样！', 'worried'),
    say('queen', 'Crumbs. We lived on what you forgot, and we were grateful. Then the Bloom woke, and it told us what forgetting means.', '碎屑。我们靠你们忘掉的东西过活，而且心怀感激。后来霉华醒了，它告诉了我们“被忘掉”是什么意思。', 'angry'),
    say('grind', 'Enough talk. Positions! She hits hard and she does not stay in her lane!', '少废话。各就各位！她下手很重，而且不会老实待在一路上！', 'angry'),
    say('pip', '…I know what forgetting means too. I am from Tuesday. But the cake stays.', '……我也知道被忘掉是什么意思。我是星期二的剩饭。但蛋糕不能给你。', 'sad')
  ]),
  scene('c1-5-outro', [
    say('queen', 'Enough. Enough… You fight like something that is still wanted.', '够了。够了……你们打起来，就像还有人要的东西。', 'sad'),
    say('pip', 'Your Majesty, what is the Bloom?', '陛下，霉华到底是什么？', 'worried'),
    say('queen', 'It grew at the back of the cold place, from a dish nobody came back for. It hums. An old song, about Sundays. It says the family forgot it, so everything of theirs should be eaten.', '它长在那个冷地方的最里面，从一盘再也没人回来拿的菜里长出来。它会哼歌，一首很老的歌，唱的是星期天。它说这家人把它忘了，所以他们的一切都该被吃掉。', 'sad'),
    say('ladle', '…Sundays. I stirred that pot. Every Sunday, for years.', '……星期天。那锅汤是我搅的。每个星期天，搅了好多年。', 'sad'),
    say('pip', 'Ladle…', '老汤勺……', 'sad'),
    say('ladle', 'Not tonight, Pip. The cake stands, and dawn is a long way off. They will come up through the sink next.', '今晚先不说，团团。蛋糕还在，离天亮还早。接下来，它们会从水槽那边上来。'),
    say('pip', 'Then we hold the sink. And after that… I want to hear the song.', '那我们就守住水槽。然后……我想听听那首歌。', 'happy')
  ]),
  // ------------------------------------------------------------ Chapter 2: Sink
  scene('c2-1-intro', [
    say('pip', 'The sink is so much bigger from down here. And wetter. Everything is wetter.', '从下面看，水槽大多了。也湿多了。什么都湿漉漉的。', 'worried'),
    say('ladle', 'Mind the tiles by the cake. Water got on them at dinner, and a Burner will not catch on a wet tile.', '小心蛋糕旁边那几块地砖。晚饭时溅上了水，炉头在湿地砖上是点不着的。'),
    say('frost', 'I brought a friend. She is mostly steam and opinions.', '我带了个朋友来。她浑身上下，除了蒸汽就是意见。', 'smug'),
    say('pip', 'The Kettle! Hello! What do you do?', '水壶！你好！你会做什么？', 'happy'),
    say('frost', 'She whistles, and then everything in front of her is very sorry. Put her where they queue up.', '她一吹哨，前面那一串就全都后悔了。把她放在它们排队的地方。'),
    say('ladle', 'Something is climbing up the plughole tonight. It has been collecting things down there for years.', '今晚有东西要从下水口爬上来。它在下面收集东西，已经收集好多年了。', 'worried')
  ], 'sink'),
  scene('c2-1-outro', [
    say('pip', 'The ants out here are soaked. One of them was carrying a ring. A real, shiny ring!', '这边的蚂蚁全湿透了。有一只还扛着一枚戒指。真的，亮闪闪的戒指！', 'worried'),
    say('ladle', 'Things go down the drain and never come back. Or so people think.', '东西掉进下水道就再也回不来了。人们是这么以为的。'),
    say('shelly', 'I found a jar of honey under the sink. She is very sticky and very calm. I like her.', '我在水槽底下找到一罐蜂蜜。她黏黏的，特别淡定。我喜欢她。', 'happy'),
    say('pip', 'Sticky is good. Sticky is very good. Bring her along!', '黏好啊。黏太好了。把她也带上！', 'happy')
  ], 'sink'),
  scene('c2-2-intro', [
    say('pip', 'Ladle, the tap is dripping. Drip. Drip. It is very hard to think.', '老汤勺，水龙头在滴水。滴答。滴答。我都没法思考了。', 'worried'),
    say('ladle', 'Watch where it glows. A drop that size will wash a beetle halfway back to the wall.', '看它在哪儿发亮。那么大一滴水，能把一只甲虫冲回去半面墙。'),
    say('grind', 'It will also knock any soldier standing under it flat on his back. Do not ask me how I know.', '站在下面的兵，也会被它砸个四脚朝天。别问我是怎么知道的。', 'angry'),
    say('pip', 'So we do not stand under the drips, and the bugs can stand under them as much as they like.', '所以我们别站在滴水的地方，虫子们爱站多久就站多久。', 'happy'),
    say('ladle', 'And put the Kettle by Bun. Steamed dough bites back.', '还有，把水壶放在阿面旁边。蒸过的面团，谁咬谁烫嘴。', 'smug')
  ], 'sink'),
  scene('c2-2-outro', [
    say('scout', 'Pip! It is me, from the counter. I swam the whole sink.', '团团！是我，台面上那只。我游过了整个水槽。', 'worried'),
    say('pip', 'Scout! You are dripping. Are you hungry? You look hungry.', '侦察蚁！你浑身在滴水。你饿不饿？你看起来好饿。', 'worried'),
    say('scout', 'Always. But listen: the Drain King says if he brings the Bloom something shiny, the hunger will stop.', '一直都饿。但你听我说：下水道之王说，只要给霉华献上亮闪闪的东西，饥饿就会停下来。', 'sad'),
    say('ladle', 'Hunger does not stop for shiny things. It stops for supper.', '饥饿不会因为亮闪闪的东西停下。只有晚饭能让它停下。', 'sad'),
    say('scout', 'Then you will want to see his treasure pile. There is a card in it. It smells like Sundays.', '那你们一定想看看他的宝藏堆。里面有一张卡片，闻起来像星期天。')
  ], 'sink'),
  scene('c2-3-intro', [
    say('bun', 'Something just went under me. UNDER me. I felt it go by. I would like to lie down.', '刚才有个东西从我底下过去了。从我底下！我感觉到它擦过去了。我想躺一会儿。', 'worried'),
    say('ladle', 'Weevils. They tunnel under the first one in their way and come up behind it.', '是象鼻虫。它们会从挡路的第一个守卫底下钻过去，在后面冒出来。'),
    say('pip', 'Then what stops a tunnel?', '那什么能拦住会打洞的家伙？', 'worried'),
    say('ladle', 'Nothing that stands in its way. Something it walks straight into, though…', '站着挡路的，拦不住。可要是它自己一脚踩进去的东西……', 'smug'),
    say('pip', 'Honey! They walk onto the honey and get stuck! Shelly, your friend is a genius!', '蜂蜜！它们会踩上蜂蜜，然后被粘住！蛋蛋，你的朋友是个天才！', 'happy')
  ], 'sink'),
  scene('c2-3-outro', [
    say('grind', 'Sous-chef, a clove of garlic just rolled out of the plughole. It smells like a battlefield.', '副厨，下水口刚滚出来一瓣大蒜。闻起来像战场。', 'smug'),
    say('pip', 'It smells like… a lot. Can it fight?', '它闻起来……很冲。它能打吗？', 'worried'),
    say('grind', 'It does not need to. One sniff and the enemy decides to be somewhere else. Usually next door.', '它用不着打。敌人闻一下，就决定换个地方待着。通常是隔壁。', 'smug'),
    say('ladle', 'Then we choose the door. Put it where the crowd is, and make sure the lane beside it is ready.', '那就由我们来挑是哪个隔壁。把它放在人多的地方，确保旁边那一路已经准备好了。')
  ], 'sink'),
  scene('c2-4-intro', [
    say('pip', 'Why is everything coming along the rim?', '为什么它们全都沿着池边过来？', 'worried'),
    say('ladle', 'Because the rim is wet and slippery and nobody can light a fire there. They are not stupid. Just hungry.', '因为池边又湿又滑，谁也没法在那儿生火。它们不傻，只是饿。'),
    say('grind', 'So we do not hold the rim. We hold the lanes beside it, and the garlic sends them to us.', '那我们就不守池边。我们守它旁边的路，让大蒜把它们给我们送过来。', 'smug'),
    say('pip', 'A detour! We are giving them a detour. Straight into the pepper.', '改道！我们给它们安排一条改道路线，直通胡椒。', 'happy')
  ], 'sink'),
  scene('c2-4-outro', [
    say('drainking', 'WHO is making all that noise above OUR drain?', '是谁在朕的下水道上面大吵大闹？', 'angry'),
    say('pip', 'Um. Pip. Sous-chef. From Tuesday.', '呃。团团。副厨。星期二的。', 'worried'),
    say('drainking', 'A leftover! How delightful. We collect leftovers. Rings, spoons, a little card with a very nice smell… Finders keepers, rice ball.', '一颗剩饭团！妙极了。朕最爱收集被落下的东西。戒指、勺子、一张很好闻的小卡片……谁捡到就归谁，饭团。', 'smug'),
    say('ladle', 'That card is not yours.', '那张卡片不是你的。', 'angry'),
    say('drainking', 'Everything that goes down the drain is OURS. Come and take it, if you can climb.', '掉进下水道的一切，都归朕。有本事就爬下来拿。', 'smug')
  ], 'sink'),
  scene('c2-5-intro', [
    say('drainking', 'Blub. Behold the Court of the Drain! We have come to collect the cake for the Bloom.', '咕噜。看哪，下水道的朝廷！朕来替霉华收下这块蛋糕。', 'smug'),
    say('pip', 'Why does everybody want to give the Bloom our cake?', '为什么大家都想把我们的蛋糕献给霉华？', 'worried'),
    say('drainking', 'Because it is hungry, and when it is hungry, WE are hungry. It is a very… sharing sort of mold.', '因为它饿了。它一饿，朕也跟着饿。这是一种很……爱分享的霉。', 'sad'),
    say('ladle', 'He floods his own lane, and Burners there go out. Keep them out of his path, and hit him when he comes up for air.', '他会把自己那一路淹掉，那里的炉头都会熄火。别让炉头挡他的道，等他浮上来换气的时候再打。'),
    say('grind', 'All mills, ready! Tonight we unclog a king!', '全体研磨瓶准备！今晚我们给国王通通下水道！', 'angry')
  ], 'sink'),
  scene('c2-5-outro', [
    say('drainking', 'Blub… blub. Fine. FINE. Take the card. It was making us sad anyway.', '咕噜……咕噜。好吧。好吧！卡片拿去。反正它也一直让朕难过。', 'sad'),
    say('pip', 'It is a recipe card. The ink has run… "Sunday Stew. Ginger, onion, a long slow simmer. For when I am not there to make it."', '是一张菜谱卡。墨迹都晕开了……“星期天炖菜。姜、洋葱、小火慢炖。留着，等我不在的时候做。”', 'worried'),
    say('granny', 'Stir it like you mean it, little one.', '搅的时候要用心，小乖乖。', 'happy'),
    say('pip', 'Did… did anyone else hear that?', '刚才……你们也听到了吗？', 'worried'),
    say('ladle', '…I know that hand. I know that voice. Keep the card safe, Pip. The stove is next, and the stove remembers everything.', '……这个字迹我认得。这个声音我也认得。把卡片收好，团团。下一站是灶台，灶台什么都记得。', 'sad')
  ], 'sink'),
  // ------------------------------------------------------------ Chapter 3: Stove
  scene('c3-1-intro', [
    say('pip', 'The stove! I have never been up here. It is like a little town of round hills.', '灶台！我从来没上来过。像一座全是圆圆小山丘的小镇。', 'happy'),
    say('grind', 'Those hills are hobs, and the pilot lights are still on. Sit a Burner on one and it works twice as hard.', '那些小山丘是灶眼，长明火还亮着。把炉头放上去，它一个能顶俩。'),
    say('ladle', 'Every so often a hob flares. Pests caught on it burn. Anyone else gets singed, unless they were built for heat.', '灶眼时不时会“呼”地烧起来。被困在上面的害虫会着火。别人站上去也会被燎到，除非本来就耐热。'),
    say('pip', 'Built for heat… like that shiny box with the slots?', '耐热的……比如那个带两条缝的亮盒子？', 'worried'),
    say('grind', 'The Toaster. Slow to warm up. Hits like a falling shelf.', '烤面包机。热身慢，可一出手，就跟架子塌下来一样。', 'smug'),
    say('ladle', '…On Sundays this stove was never off. Never.', '……以前每个星期天，这个灶台就没关过。从来没有。', 'sad')
  ], 'stove'),
  scene('c3-1-outro', [
    say('pip', 'Ladle, you keep saying Sundays.', '老汤勺，你一直在说星期天。', 'worried'),
    say('ladle', 'Granny cooked on Sundays. The whole family came. I stirred her pot from morning until the lamps came on.', '奶奶每个星期天都做饭，一大家子都会来。我从早上一直搅她的锅，搅到天黑点灯。', 'sad'),
    say('pip', 'Where is Granny now?', '那奶奶现在在哪儿？'),
    say('ladle', '…Not here. Not since last winter. Mind your Heat, rice ball. Moths are coming, and they love a flame.', '……不在这儿了。去年冬天以后，就不在了。顾好你的火候吧，小饭团。飞蛾要来了，它们最爱火苗。', 'sad')
  ], 'stove'),
  scene('c3-2-intro', [
    say('grind', 'Moths! Twelve o\'clock high! They are going for the Burners!', '飞蛾！正上方！它们冲着炉头去了！', 'angry'),
    say('pip', 'They fly over Bun. They fly over everything. What can reach them?', '它们从阿面头上飞过去，什么都能飞过去。谁打得着？', 'worried'),
    say('frost', 'Shots. Mine, his, the Toaster\'s. Any lane with a Burner in it needs something that shoots.', '射击。我的、他的、烤面包机的都行。哪一路有炉头，哪一路就得有能射的。'),
    say('grind', 'And the Kettle! Steam goes up as well as along. Science!', '还有水壶！蒸汽既往前喷，也往上冒。这叫科学！', 'smug')
  ], 'stove'),
  scene('c3-2-outro', [
    say('pip', 'Why do they only want the Burners?', '它们为什么只盯着炉头？'),
    say('frost', 'Cold things want warm things. Everyone does, really. Some just ask more politely.', '冷的东西想要暖的东西。其实谁都一样，只是有的问得客气些。'),
    say('ladle', 'Mind the grease ahead. This stove has a lot of old Sundays stuck to it.', '小心前面的油。这个灶台上，粘着好多陈年的星期天。', 'worried')
  ], 'stove'),
  scene('c3-3-intro', [
    say('pip', 'The floor is slippery! The ants are sliding past like they are on skates!', '地上好滑！蚂蚁们滑过去，跟穿了冰鞋似的！', 'worried'),
    say('grind', 'Grease. It makes them fast. It also makes them flammable.', '是油。让它们跑得快，也让它们一点就着。', 'smug'),
    say('ladle', 'A burning pest that steps onto grease sets the whole slick alight. Toast your pepper, and let them walk into it.', '着了火的害虫一踩上油渍，整片油都会烧起来。让研磨瓶挨着炉头烤一烤胡椒，再让它们自己走进去。'),
    say('pip', 'That is a little bit cruel.', '这有点残忍。', 'sad'),
    say('ladle', 'It is a little bit of a kitchen.', '厨房嘛，多少都有一点。')
  ], 'stove'),
  scene('c3-3-outro', [
    say('pip', 'The grease is moving. Over there. Like it is breathing.', '那边的油在动。像在呼吸。', 'worried'),
    say('grind', 'Grease does not breathe, sous-chef.', '油是不会呼吸的，副厨。'),
    say('greasegolem', '…Pot… always on… Sunday…', '……锅……一直……开着……星期天……', 'sad'),
    say('grind', '…I stand corrected.', '……我收回刚才的话。', 'worried')
  ], 'stove'),
  scene('c3-4-intro', [
    say('pip', 'Everything at once. Hobs, grease, moths. The whole stove is awake.', '全都一起来了。灶眼、油、飞蛾。整个灶台都醒了。', 'worried'),
    say('ladle', 'Then cook. Think about who stands next to whom. A good kitchen is mostly good neighbours.', '那就开火做饭。想想谁该挨着谁。一间好厨房，靠的大多是好邻居。'),
    say('shelly', 'I am standing next to Bun. Bun is soft and agrees with everything.', '我站在阿面旁边。阿面软软的，什么都说好。', 'happy'),
    say('bun', 'Mm. Yes.', '嗯。好。', 'happy')
  ], 'stove'),
  scene('c3-4-outro', [
    say('greasegolem', 'Little… rice. You smell… like Sunday.', '小……米饭。你闻起来……像星期天。', 'sad'),
    say('pip', 'I am from Tuesday, actually.', '其实我是星期二的。', 'worried'),
    say('greasegolem', 'Sunday… rice… in the bowl… with the rabbit. Where… is the bowl?', '星期天……米饭……盛在……有小兔子的碗里。碗……在哪儿？', 'sad'),
    say('ladle', 'It is coming. Whatever it is, it is coming for the cake. Hold the hobs.', '它要来了。不管它是什么，都是冲着蛋糕来的。守住灶眼。', 'worried')
  ], 'stove'),
  scene('c3-5-intro', [
    say('greasegolem', 'Cake… is warm. I was… warm. Once.', '蛋糕……是暖的。我……也暖过。从前。', 'sad'),
    say('pip', 'You are made of old frying. All those Sundays.', '你是很多很多年的油攒成的。那么多个星期天。', 'worried'),
    say('greasegolem', 'Then… nobody came. Pot went cold. Fat went… hard.', '然后……没人来了。锅……凉了。油……硬了。', 'sad'),
    say('ladle', 'Its hide shrugs off almost everything. But old fat burns: set it alight and its armour melts.', '它的皮几乎什么都挡得住。可老油是会烧的：把它点着，护甲就化了。'),
    say('grind', 'You heard the spoon. Toast everything!', '听见汤勺说的了吧。全都给我烤起来！', 'angry')
  ], 'stove'),
  scene('c3-5-outro', [
    say('greasegolem', 'Warm… again. Thank… you.', '又……暖了。谢……谢。', 'happy'),
    say('pip', 'Something fell out of it. A little bowl, with a rabbit painted on the side. The rim is chipped.', '它身上掉出来一样东西。一只小碗，侧面画着一只小兔子。碗边缺了个口。', 'worried'),
    say('ladle', 'That was Mei\'s dad\'s bowl. When he was small, Granny filled it every Sunday. He chipped it on the sink when he was nine.', '那是小美爸爸的碗。他小时候，奶奶每个星期天都给他盛得满满的。他九岁那年，在水槽边磕掉了一个口。', 'sad'),
    say('granny', 'Never mind the chip. It still holds stew, doesn\'t it?', '缺个口没关系。还能盛炖菜，不是吗？', 'happy'),
    say('pip', 'A card, a bowl… Ladle, the Bloom is not just a mold. Is it?', '一张卡片，一只碗……老汤勺，霉华不只是一团霉，对不对？', 'worried'),
    say('ladle', '…The pantry is next. Bring a light. And the Salt: she keeps under the flour.', '……下一站是储物柜。带上光。还有盐罐，她就收在面粉底下。', 'sad')
  ], 'stove'),
  // ------------------------------------------------------------ Chapter 4: Pantry
  scene('c4-1-intro', [
    say('bun', 'It is very dark in here. I do not like it. Dough likes to be warm and seen.', '这里好黑。我不喜欢。面团喜欢暖和，也喜欢被人看见。', 'worried'),
    say('ladle', 'In the dark you can only set a guard down where there is light. The candle stubs help, and every Burner pushes the dark back.', '在黑暗里，只有亮着的地方才能放守卫。那几截蜡烛头能帮上忙，每多一个炉头，黑暗就退后一步。'),
    say('grind', 'And my peppercorns will not fly at what I cannot see. Light the lanes, sous-chef!', '我的胡椒粒也不会射向看不见的东西。把路照亮，副厨！', 'angry'),
    say('pip', 'Hello? Is someone there? Something sparkly by the flour…', '你好？有人吗？面粉旁边有个亮晶晶的东西……', 'worried'),
    say('frost', 'That is the Salt. Slugs and mold hate her, and she scrubs a moldy cell clean.', '那是盐罐。鼻涕虫和霉菌都恨她，她还能把发霉的格子擦干净。')
  ], 'pantry'),
  scene('c4-1-outro', [
    say('pip', 'We lit the whole shelf. It is not so scary when you can see it.', '整层架子都照亮了。看得见的话，其实也没那么可怕。', 'happy'),
    say('scout', 'Pip… the mice are awake. The Baron has called his court. They take things.', '团团……老鼠们醒了。男爵召集了他的朝臣。它们会拿东西。', 'worried'),
    say('pip', 'What kind of things?', '拿什么东西？', 'worried'),
    say('scout', 'Your friends. Your Heat. Anything not nailed down. Catch them before they reach the edge and they drop it.', '你的朋友，你的火候，只要没钉死，什么都拿。在它们跑到边上之前截住，它们就会把东西丢下。')
  ], 'pantry'),
  scene('c4-2-intro', [
    say('baron', 'Good evening, good evening! The Pantry Baron: Keeper of the Dry Goods, Lord of Everything Fallen Behind the Flour.', '晚上好，晚上好！本人乃储物柜男爵：干货的守护者，面粉后头一切失物之主。', 'smug'),
    say('pip', 'That is a long title for a mouse.', '对一只老鼠来说，这名号可真长。'),
    say('baron', 'A long title for a LONG collection. My lads will be borrowing your guards now. With love.', '名号长，是因为收藏多！我的小伙子们这就来借用一下你的守卫。满怀爱意地借。', 'smug'),
    say('ladle', 'Mice are fast. Slow them, wall them, and keep a shooter in every lane they might run back through.', '老鼠跑得快。让它们慢下来，用墙挡住，它们可能逃回去的每一路都要有射手。'),
    say('grind', 'Salt, Honey and a Burner, all touching. I hear it makes a caramel nobody escapes from.', '盐、蜂蜜、炉头挨在一起。听说能熬出一种谁也逃不掉的焦糖。', 'smug')
  ], 'pantry'),
  scene('c4-2-outro', [
    say('baron', 'Tsk. You keep taking your things back. Most impolite.', '啧。你们老是把东西拿回去。太没礼貌了。', 'angry'),
    say('pip', 'Baron, did your lads ever find a photo? It would have fallen off the fridge door.', '男爵，你的手下有没有捡到过一张照片？应该是从冰箱门上掉下来的。', 'worried'),
    say('baron', 'Perhaps. It is my finest piece. A lady laughing, a little boy, a rabbit bowl. I look at it every night. Nobody else does.', '也许吧。那是我最好的藏品。一位老太太在笑，一个小男孩，一只小兔子碗。我每天晚上都看。别人谁也不看。', 'sad')
  ], 'pantry'),
  scene('c4-3-intro', [
    say('pip', 'The middle shelf fell down! There are holes everywhere!', '中间那层架子塌了！到处都是窟窿！', 'worried'),
    say('ladle', 'Four lanes, then, and fewer places to stand. Every spot counts tonight.', '那就只剩四路，能站的地方也更少了。今晚每一格都很金贵。'),
    say('bun', 'I can be very wide. I will be wide on purpose.', '我可以变得很宽。我会故意变宽的。', 'happy'),
    say('grind', 'The moths will go for the lamps. Keep a shooter by every light.', '飞蛾会去扑那些灯。每一盏灯旁边都要有射手。')
  ], 'pantry'),
  scene('c4-3-outro', [
    say('pip', 'Ladle! Something is humming in the corner. It is round and white and… warm.', '老汤勺！角落里有什么在嗡嗡响。圆圆的、白白的……还暖乎乎的。', 'happy'),
    say('ladle', 'The Rice Cooker. She kept Granny\'s rice warm every Sunday for twenty years.', '电饭煲。二十年来，每个星期天都是她给奶奶的米饭保温。', 'happy'),
    say('pip', 'She is… is she my…?', '她是……她是我的……？', 'worried'),
    say('ladle', 'Where you came from, rice ball. Go on. Say hello.', '你就是从那里来的，小饭团。去吧，打个招呼。', 'happy'),
    say('pip', 'Hello. I am Pip. I am from Tuesday. I am… doing my best.', '你好。我是团团。我是星期二的。我……在尽力。', 'happy')
  ], 'pantry'),
  scene('c4-4-intro', [
    say('pip', 'She hums while she works, and everyone near her gets patched up.', '她干活的时候会哼歌，挨着她的伙伴，伤都会慢慢好起来。', 'happy'),
    say('ladle', 'Put the Rice Cooker, an Egg and a Burner together and you have fried rice. Granny made it on Mondays, from the Sunday rice.', '把电饭煲、鸡蛋和炉头放在一起，就是一盘蛋炒饭。奶奶每个星期一都拿星期天剩的米饭炒。'),
    say('pip', 'Leftovers made into something good. I like that very much.', '把剩饭做成好吃的。我非常喜欢这个。', 'happy'),
    say('baron', 'Supper? Supper is MINE tonight. Lads! The whole court!', '夜宵？今晚的夜宵是我的！小伙子们！全体朝臣出动！', 'angry')
  ], 'pantry'),
  scene('c4-4-outro', [
    say('baron', 'All right. All RIGHT. You may have it back, if you must.', '好吧。好吧！要是你们非要不可，就还给你们。', 'sad'),
    say('pip', 'Have what back?', '还什么？', 'worried'),
    say('baron', 'Not yet! Come to my court and take it, like a proper hero. I insist. It is the most fun I have had all year.', '现在还不还！到我的朝堂来拿，像个真正的英雄那样。我坚持。这是我一整年里最开心的事。', 'smug')
  ], 'pantry'),
  scene('c4-5-intro', [
    say('baron', 'Welcome to my court! Mind the dark. I am MUCH harder to hit when the lights are out.', '欢迎来到我的朝堂！小心脚下的黑。灯一灭，我可就难打多了。', 'smug'),
    say('ladle', 'He blows out the light around a Burner. When you see the glow, light it somewhere else, and keep the lamps covered.', '他会吹灭炉头周围的光。看见那一下闪光，就去别处把灯点起来，守住那几盏灯。'),
    say('pip', 'Baron, why do you want the cake so much?', '男爵，你为什么那么想要蛋糕？'),
    say('baron', 'I do not, particularly. The Bloom does. And when the Bloom is sad, the whole pantry is hungry.', '其实我也没那么想要。是霉华想要。霉华一难过，整个储物柜的家伙都会饿。', 'sad'),
    say('grind', 'Enough speeches! Lamps lit! Mills loaded!', '演讲够了！点灯！上膛！', 'angry')
  ], 'pantry'),
  scene('c4-5-outro', [
    say('baron', 'Well fought. Well fought indeed. Here: the finest piece in my collection.', '打得好。打得真好。拿去吧：我收藏里最好的一件。', 'sad'),
    say('pip', 'The photo. Granny, laughing, a little boy on her lap. The rabbit bowl, full. A pot on the stove behind them.', '是那张照片。奶奶在笑，腿上坐着一个小男孩。小兔子碗盛得满满的。他们身后的灶台上，坐着一口锅。', 'sad'),
    say('baron', 'On the back it says "Sunday." Nobody has looked at it since it fell. I did. Every night.', '背面写着“星期天”。它掉下来以后，就没人看过了。我看过。每天晚上都看。', 'sad'),
    say('ladle', 'That pot. Her last pot. They brought it home after the funeral and put it in the fridge, all the way at the back.', '那口锅。她做的最后一锅。葬礼过后，他们把它带回家，放进冰箱，放在最里面。', 'sad'),
    say('ladle', 'Nobody could eat it. Nobody could throw it away. So it waited. And then everyone forgot.', '谁也吃不下，谁也舍不得倒。所以它就一直等着。后来，大家就都忘了。', 'sad'),
    say('pip', 'The Bloom is Granny\'s stew.', '霉华，是奶奶的炖菜。', 'sad')
  ], 'pantry'),
  // ------------------------------------------------------------ Chapter 5: Inside the Fridge
  scene('c5-1-intro', [
    say('pip', 'Ladle, I have been in here before. On a plate. I never looked around.', '老汤勺，我以前来过这里。在盘子上。我从来没好好看过。', 'worried'),
    say('frost', 'Welcome home. Everything slows down in here. Pests too. But so do you, if nobody keeps you warm.', '欢迎回家。在这里，什么都会变慢。害虫也是。可要是没人给你们取暖，你们也一样。'),
    say('ladle', 'A guard on frost works at half speed unless a Burner or the Rice Cooker stands close enough to warm it.', '站在霜上的守卫只剩一半力气，除非身边有炉头或电饭煲给它取暖。'),
    say('pip', 'Then we huddle. Warm things in the middle, everyone else around them.', '那我们就挤在一起。暖和的放中间，其他人围着它们。', 'happy'),
    say('ladle', 'Huddle well. It is a long way to the back of the fridge.', '好好挤着。到冰箱最里面，还有很长的路。')
  ], 'fridge'),
  scene('c5-1-outro', [
    say('pip', 'It is humming. Can you hear it? Very far back.', '它在哼歌。你听见了吗？在很远很远的里面。', 'worried'),
    say('bloom', 'sunday… sunday… who is coming on sunday…', '星期天……星期天……星期天谁会来……', 'sad'),
    say('ladle', 'That was her song. She hummed it while she stirred.', '那是她的歌。她搅锅的时候，总哼这一首。', 'sad'),
    say('pip', 'It sounds so lonely.', '听起来好孤单。', 'sad')
  ], 'fridge'),
  scene('c5-2-intro', [
    say('bun', 'Something big is coming. Something soft, like me. But wrong.', '有个大家伙要来了。软软的，跟我一样。可是不对劲。', 'worried'),
    say('ladle', 'Mold Brutes. Old leftovers that gave up. They burst into spores when they fall.', '霉菌壮汉。是放弃了的陈年剩菜。它们倒下时会炸出霉孢子。'),
    say('grind', 'Then drop them far from the line, and keep the Salt close.', '那就在离防线远的地方把它们放倒，盐罐放在手边。'),
    say('pip', 'They used to be somebody\'s dinner.', '它们以前也是谁家的晚饭啊。', 'sad')
  ], 'fridge'),
  scene('c5-2-outro', [
    say('pip', 'Ladle, do all leftovers turn into that? Will I?', '老汤勺，所有剩菜最后都会变成那样吗？我也会吗？', 'worried'),
    say('ladle', 'Only the ones nobody remembers.', '只有没人记得的，才会。', 'sad'),
    say('pip', 'Then somebody had better remember me.', '那最好有人记得我。', 'sad'),
    say('ladle', 'Somebody already does, rice ball.', '已经有人记得了，小饭团。', 'happy')
  ], 'fridge'),
  scene('c5-3-intro', [
    say('frost', 'The mold back here is alive. Every few heartbeats it creeps onto the next shelf.', '这里的霉是活的。每隔几下心跳，它就往隔壁格子爬一点。', 'worried'),
    say('pip', 'Salt scrubs it off! And if she sees mold she shakes, even with nothing coming.', '盐能把它擦掉！只要看见霉，就算没有害虫过来，她也会撒。', 'happy'),
    say('ladle', 'Keep the lanes clean, or soon there will be nowhere left to stand.', '把路保持干净，不然很快就没地方站了。')
  ], 'fridge'),
  scene('c5-3-outro', [
    say('bloom', 'little rice… you are a leftover too… they forgot you too…', '小米粒……你也是剩下的……他们也把你忘了……', 'sad'),
    say('pip', 'Yes. On a Tuesday. I rolled off the plate.', '是的。在一个星期二。我从盘子上滚下来了。', 'sad'),
    say('bloom', 'then eat with us… eat everything… so nothing is ever forgotten again…', '那就和我们一起吃吧……把一切都吃掉……这样就再也没有东西会被忘记了……', 'angry'),
    say('pip', 'That is not how remembering works.', '记住一个人，不是这样的。', 'sad')
  ], 'fridge'),
  scene('c5-4-intro', [
    say('ladle', 'Cold snaps back here. When the frost glows, every chilled guard freezes solid for a moment. Warm guards never notice.', '这里会来寒流。霜光一亮，所有受冻的守卫都会被冻住一会儿。暖和的守卫根本感觉不到。'),
    say('pip', 'Ladle… the card says ginger, onion, a long slow simmer. The Rice Cooker is warm, the Onion makes you cry, the Kettle bubbles…', '老汤勺……卡片上写着姜、洋葱、小火慢炖。电饭煲是暖的，洋葱会让人流泪，水壶会咕嘟冒泡……', 'worried'),
    say('ladle', 'Then put them together. Stir it like you mean it.', '那就把它们放在一起。搅的时候要用心。', 'sad'),
    say('granny', 'That\'s it. Low and slow. Everybody gets a bowl.', '对了。小火，慢慢来。每个人都有一碗。', 'happy')
  ], 'fridge'),
  scene('c5-4-outro', [
    say('pip', 'There. Behind the jam. A pot with a lid on it, all covered in frost.', '在那儿。果酱罐后面。一口盖着盖子的锅，结满了霜。', 'worried'),
    say('bloom', 'nobody came… on sunday… nobody came…', '没人来……星期天……没人来……', 'sad'),
    say('ladle', 'I know. I was in the drawer the whole time. I am sorry.', '我知道。我一直躺在抽屉里。对不起。', 'sad'),
    say('pip', 'Ladle. We are not going to destroy it, are we?', '老汤勺。我们不会毁掉它的，对吧？', 'worried'),
    say('ladle', 'No. We are going to remind it what it is.', '不会。我们要让它想起来，它本来是什么。')
  ], 'fridge'),
  scene('c5-5-intro', [
    say('bloom', 'the cake… the cake is warm… give me the cake… and nobody will be hungry…', '蛋糕……蛋糕是暖的……把蛋糕给我……就没有谁会饿了……', 'angry'),
    say('pip', 'It is Mei\'s cake. She is seven tomorrow. Granny would have wanted her to have it.', '那是小美的蛋糕。她明天就七岁了。奶奶一定希望她能吃到。', 'sad'),
    say('bloom', 'granny… is not coming…', '奶奶……不会来了……', 'sad'),
    say('ladle', 'It will throw everything it has at us: mold, cold, the whole fridge. But it will tire. When it stops, do not strike it.', '它会把一切都砸向我们：霉、寒气、整个冰箱。但它会累的。等它停下来，别再打它。'),
    say('pip', 'Then what do we do?', '那我们怎么办？', 'worried'),
    say('ladle', 'We bring it something warm. A Burner, the Rice Cooker, right up close. And we wait.', '给它带去暖和的东西。炉头、电饭煲，就放在它身边。然后我们等。'),
    say('grind', 'Positions, everyone. One last time tonight.', '各就各位，所有人。今晚最后一次。', 'angry')
  ], 'fridge'),
  scene('c5-5-outro', [
    say('stew', 'Oh. Oh… I remember. I was a Sunday stew. Ginger, onion, a long slow simmer.', '哦。哦……我想起来了。我是一锅星期天的炖菜。姜、洋葱、小火慢炖。', 'happy'),
    say('stew', 'She made me for them, so they would have one more Sunday after she was gone. And I was so afraid they had forgotten her.', '她做我，是为了让他们在她走了以后，还能再过一个星期天。我好怕他们已经把她忘了。', 'sad'),
    say('pip', 'They did not forget her. It just hurt too much to lift the lid.', '他们没有忘记她。只是掀开盖子，太疼了。', 'sad'),
    say('granny', 'There you are. Everybody gets a bowl.', '原来你在这儿。每个人都有一碗。', 'happy'),
    say('ladle', '…Goodnight, Granny.', '……晚安，奶奶。', 'sad'),
    say('pip', 'Dawn! The kitchen light! Someone is coming!', '天亮了！厨房的灯亮了！有人来了！', 'worried'),
    say('pip', 'Mei\'s dad found the card, the bowl and the photo beside the cake. He sat on the floor for a long time. Then he laughed, and put on an apron.', '小美的爸爸在蛋糕旁边看见了卡片、小碗和照片。他在地上坐了很久。然后他笑了，系上了围裙。', 'happy'),
    say('ladle', '"Granny\'s Sunday stew," he said. "For your birthday lunch, Mei. And every Sunday after that."', '“奶奶的星期天炖菜，”他说，“给你过生日的午饭，小美。以后每个星期天，我们都做。”', 'happy'),
    say('scout', 'He swept the cake crumbs into a little pile by the door for us. Just like always.', '他把蛋糕屑扫成一小堆，放在门边留给我们。就像从前一样。', 'happy'),
    say('pip', 'And he found me on the counter and said, "A rice ball? Into the pot with you." I am going to be in a Sunday stew!', '他还在台面上发现了我，说：“一个饭团？进锅里去吧。”我要成为星期天炖菜的一部分了！', 'happy'),
    say('ladle', 'Happy birthday, Mei. Good work, sous-chef.', '生日快乐，小美。干得好，副厨。', 'happy')
  ], 'fridge')
];

export const SCENES: Record<string, Scene> = Object.fromEntries(SCENE_LIST.map(item => [item.id, item]));

const bark = (when: BarkDef['when'], speaker: string, en: string, zh: string): BarkDef => ({ when, speaker, line: { en, zh } });

/** One-liners during a level. Triggers: `{ time }`, `{ wave }` (0-based) or `{ on: <sim event type>, def? }`. */
export const BARKS: Record<string, BarkDef[]> = {
  'c1-1': [
    bark({ on: 'place', def: 'burner' }, 'ladle', 'Good. Feel that? That is Heat.', '很好。感觉到了吗？这就是火候。'),
    bark({ on: 'place', def: 'pepper' }, 'grind', 'Loaded and grinding!', '装填完毕，开磨！'),
    bark({ on: 'enemyDown' }, 'pip', 'Sorry! Sorry. Please go home!', '对不起！对不起。请回家吧！'),
    bark({ on: 'telegraph' }, 'grind', 'Big group coming. Every lane needs a mill!', '来了一大群。每一路都得有研磨瓶！'),
    bark({ on: 'slice' }, 'pip', 'The cake! Not the frosting roses!', '蛋糕！别碰奶油玫瑰花！')
  ],
  'c1-2': [
    bark({ on: 'place', def: 'dough' }, 'bun', 'I am in the way. This is my best work.', '我挡在这儿了。这是我的得意之作。'),
    bark({ on: 'enemySpawn', def: 'roach' }, 'ladle', 'There is the quick one. Put Bun in front of it.', '快的那个来了。让阿面挡在它前面。'),
    bark({ on: 'upgrade' }, 'grind', 'Now THAT is a grinder.', '这才叫研磨瓶。'),
    bark({ on: 'defenderDown' }, 'pip', 'We lost one! Rebuild, rebuild!', '倒了一个！快补上，快补上！'),
    bark({ on: 'telegraph' }, 'grind', 'Here they come. Hold the line!', '它们来了。守住防线！')
  ],
  'c1-3': [
    bark({ on: 'enemySpawn', def: 'shieldant' }, 'grind', 'Crumb shields. My pepper just bounces off!', '饼干盾牌。我的胡椒打上去就弹开了！'),
    bark({ on: 'place', def: 'egg' }, 'shelly', 'Over the top! I think! Here goes!', '从上面过去！应该是！我扔了！'),
    bark({ on: 'recipe' }, 'pip', 'A recipe! Write that down, write that down!', '一道食谱！快记下来，快记下来！'),
    bark({ on: 'shieldBreak' }, 'grind', 'Shield is down. Now it is my turn.', '盾碎了。现在轮到我了。'),
    bark({ on: 'telegraph' }, 'ladle', 'Many shields in this one. Eggs to the front lanes.', '这一波盾牌很多。把抛蛋手放到要紧的那几路。'),
    bark({ time: 75 }, 'ladle', 'Bun likes a warm neighbour. Dough beside a Burner bakes a crust.', '阿面喜欢暖和的邻居。面团挨着炉头，会烤出一层硬壳。')
  ],
  'c1-4': [
    bark({ on: 'enemySpawn', def: 'fruitfly' }, 'ladle', 'Flies. They go over Bun. Shoot them down.', '果蝇。它们会从阿面头上飞过去。把它们打下来。'),
    bark({ on: 'enemySpawn', def: 'slug' }, 'frost', 'Slow one. I respect that. Salt would be better, but I will do.', '是个慢性子。我欣赏。要是有盐就更好了，不过有我也行。'),
    bark({ on: 'laneFire' }, 'pip', 'It is awake! It is very awake!', '它醒了！它彻底醒了！'),
    bark({ on: 'status', def: 'slow' }, 'frost', 'Chill.', '冷静点。'),
    bark({ on: 'telegraph' }, 'grind', 'Everything at once. Save the chili for the worst lane.', '全都一起上了。把辣椒留给最吃紧的那一路。'),
    bark({ on: 'place', def: 'ice' }, 'frost', 'Stand me by a Pepper Mill. We keep each other sharp.', '把我放在研磨瓶旁边。我们俩能互相提神。')
  ],
  'c1-5': [
    bark({ on: 'enemySpawn', def: 'queen' }, 'queen', 'Children. The cake.', '孩子们。蛋糕。'),
    bark({ on: 'enemySpawn', def: 'spore' }, 'ladle', 'Mold spores. Drop them far from our line, or the counter turns.', '霉孢子。离防线远远地打掉，不然台面会发霉。'),
    bark({ on: 'mold' }, 'pip', 'Ew. Ew! Nothing can stand on that!', '咦——！那一格什么都站不了了！'),
    bark({ on: 'bossAttack', def: 'toss' }, 'grind', 'Sugar cube incoming! Someone is going to be stuck!', '方糖来了！有人要被砸晕了！'),
    bark({ on: 'bossPhase' }, 'queen', 'You are stubborn, little grain. So was I, once.', '你真倔，小米粒。我从前也是这样。'),
    bark({ on: 'slice' }, 'queen', 'One slice. It is not enough. It is never enough now.', '一块。不够。现在永远都不够。'),
    bark({ on: 'place', def: 'onion' }, 'grind', 'Onion next to my mill makes a salsa with a temper. Try it!', '洋葱挨着我的研磨瓶，能拌出一碗脾气很冲的莎莎酱。试试！'),
    bark({ on: 'place', def: 'whisk' }, 'shelly', 'Whisk, stand by me! Egg and whisk make clouds!', '打蛋器，站我旁边！鸡蛋加打蛋器，能打出云来！'),
    bark({ on: 'sliceRestored' }, 'pip', 'Egg, dough and fire… it baked the slice back! A birthday sponge!', '鸡蛋、面团、火……它把那块蛋糕烤回来了！生日海绵蛋糕！'),
    bark({ time: 150 }, 'ladle', 'Egg, Dough and a Burner all touching can bake back a lost slice. Once a night.', '鸡蛋、面团、炉头全挨在一起，能烤回一块丢掉的蛋糕。每晚一次。')
  ],
  'c2-1': [
    bark({ on: 'place', def: 'kettle' }, 'frost', 'She is on. Stand her by me sometime: hot and cold makes iced tea.', '她开了。哪天让她站我旁边：一热一冷，就是冰红茶。'),
    bark({ on: 'enemySpawn', def: 'slug' }, 'ladle', 'A slug in a queue. Kettle steam goes through the lot of them.', '一只鼻涕虫领着一串。水壶的蒸汽能把它们一口气全烫透。'),
    bark({ on: 'recipe', def: 'iced-tea' }, 'pip', 'Iced tea! Cold steam! That should not work, and it does!', '冰红茶！冷的蒸汽！按理说不行，可它就是行！'),
    bark({ on: 'telegraph' }, 'grind', 'Big wave! Every lane, every mill!', '大波来袭！每一路，每一台研磨瓶！'),
    bark({ on: 'slice' }, 'pip', 'The cake! Ladle, they got the cake!', '蛋糕！老汤勺，它们咬到蛋糕了！')
  ],
  'c2-2': [
    bark({ on: 'warn', def: 'drip' }, 'ladle', 'See the ring? That is where the next drop lands.', '看见那个圈了吗？下一滴就落在那儿。'),
    bark({ on: 'defenderStun', def: 'drip' }, 'grind', 'Ow. Right on the lid. Do not build under the drips!', '哎哟。正砸在盖子上。别在滴水的地方放人！'),
    bark({ on: 'place', def: 'honey' }, 'shelly', 'Honey is down. Whatever walks in, stays in.', '蜂蜜放好了。谁走进去，谁就别想出来。'),
    bark({ on: 'recipe', def: 'steamed-buns' }, 'bun', 'Oh, I am steaming. Anyone who bites me will regret it. Politely.', '哦，我在冒热气。谁咬我谁后悔。我会很客气地让它后悔。'),
    bark({ on: 'telegraph' }, 'grind', 'Here comes the flood of them. Hold!', '它们像潮水一样来了。顶住！')
  ],
  'c2-3': [
    bark({ on: 'enemySpawn', def: 'weevil' }, 'ladle', 'Weevil. It will go under the first guard it meets. Honey goes on the ground; it cannot dig under that.', '象鼻虫。它会从遇到的第一个守卫底下钻过去。蜂蜜是铺在地上的，它可钻不过去。'),
    bark({ on: 'burrow' }, 'bun', 'It went under! It is under me right now! I can feel its little feet!', '它钻下去了！它现在就在我底下！我能感觉到它的小脚！'),
    bark({ on: 'emerge' }, 'grind', 'It came up behind the wall. Second line, open fire!', '它从墙后面冒出来了。第二道防线，开火！'),
    bark({ on: 'telegraph' }, 'pip', 'A whole tunnel of them. Honey, honey everywhere!', '一整条隧道的象鼻虫。蜂蜜，到处都放蜂蜜！')
  ],
  'c2-4': [
    bark({ on: 'place', def: 'garlic' }, 'grind', 'Garlic deployed. Gas, gas, gas!', '大蒜就位。放毒气，放毒气！'),
    bark({ on: 'push' }, 'pip', 'It worked! It wandered into the next lane, looking very offended.', '成功了！它晃到隔壁那一路去了，一脸被冒犯的样子。'),
    bark({ time: 90 }, 'ladle', 'Honey by the Garlic makes a glaze: stickier stink, and the jar holds more.', '蜂蜜挨着大蒜能熬成酱：臭气也变黏，罐子还能多粘几个。'),
    bark({ on: 'telegraph' }, 'grind', 'Both rims at once! Garlic, earn your keep!', '两边池沿一起来了！大蒜，该你出力了！')
  ],
  'c2-5': [
    bark({ on: 'enemySpawn', def: 'drainking' }, 'drainking', 'Make way for the King of Everything That Went Down the Drain!', '给朕让路！朕乃一切掉进下水道之物的国王！'),
    bark({ on: 'warn', def: 'flood' }, 'ladle', 'He is filling his lane! Burners there will go out.', '他要淹掉他那一路了！那里的炉头会熄火。'),
    bark({ on: 'bossAttack', def: 'dive' }, 'grind', 'He ducked under! Watch where the ripples come up!', '他潜下去了！看水波从哪儿冒出来！'),
    bark({ on: 'bossPhase' }, 'drainking', 'Blub! You splash quite hard for a grain of rice.', '咕噜！一粒米，水花倒是溅得挺大。'),
    bark({ time: 60 }, 'grind', 'Chili next to Garlic spills fire into the lanes beside it. Just saying.', '小辣椒挨着大蒜，火会烧到两边的路上。我就提一句。'),
    bark({ on: 'slice' }, 'drainking', 'Delicious. Frosting goes down the drain eventually anyway.', '美味。反正奶油最后都会流进下水道的。')
  ],
  'c3-1': [
    bark({ on: 'warn', def: 'hob' }, 'ladle', 'The hobs are glowing. They will flare in a moment.', '灶眼在发亮。马上就要烧起来了。'),
    bark({ on: 'hazard', def: 'hobOn' }, 'grind', 'Whoosh! Anything standing on a hob just got toasted.', '呼！站在灶眼上的家伙全被烤了一遍。'),
    bark({ on: 'place', def: 'toaster' }, 'pip', 'The Toaster is warming up. Tick, tick, tick…', '烤面包机在预热。嘀嗒，嘀嗒，嘀嗒……'),
    bark({ time: 80 }, 'shelly', 'I heard the Toaster likes Honey. Sticky slices! Very rude.', '听说烤面包机喜欢蜂蜜。黏糊糊的吐司片！太不讲武德了。'),
    bark({ on: 'telegraph' }, 'grind', 'Big pot boiling over! Steady!', '一大锅要溢出来了！稳住！')
  ],
  'c3-2': [
    bark({ on: 'enemySpawn', def: 'moth' }, 'frost', 'Moth. It wants a Burner. Make it earn it.', '飞蛾。它想要炉头。让它付出代价。'),
    bark({ on: 'defenderHurt', def: 'burner' }, 'pip', 'They are nibbling the Burners! Shoot them down!', '它们在啃炉头！把它们打下来！'),
    bark({ on: 'telegraph' }, 'grind', 'A whole cloud of wings. Every Burner lane needs a gun!', '一整片翅膀。有炉头的每一路都要有枪！')
  ],
  'c3-3': [
    bark({ on: 'flare' }, 'pip', 'The grease caught! It is all on fire! I said it was cruel!', '油着了！全烧起来了！我就说很残忍吧！'),
    bark({ on: 'recipe', def: 'toasted-pepper' }, 'grind', 'Toasted pepper. Now walk them over the slick.', '胡椒烤好了。现在把它们引到油上去。'),
    bark({ on: 'telegraph' }, 'ladle', 'A big one. Let the grease do the work.', '大的来了。让油渍替我们干活。')
  ],
  'c3-4': [
    bark({ time: 3 }, 'ladle', 'Everything at once tonight. Hobs, grease, moths. Cook with neighbours.', '今晚什么都来。灶眼、油渍、飞蛾。好好安排邻居。'),
    bark({ on: 'upgrade' }, 'grind', 'A bigger grinder for a bigger night!', '夜越长，磨头越大！'),
    bark({ on: 'telegraph' }, 'pip', 'The pot is boiling over! Hold on to something!', '锅要溢了！抓紧点什么！')
  ],
  'c3-5': [
    bark({ on: 'enemySpawn', def: 'greasegolem' }, 'greasegolem', '…Warm… cake…', '……暖的……蛋糕……'),
    bark({ on: 'warn', def: 'splatter' }, 'ladle', 'It is throwing grease ahead of itself. Good. Grease burns.', '它在往前面甩油。好，油会烧。'),
    bark({ on: 'warn', def: 'breath' }, 'grind', 'It is drawing breath! Everyone in front of it, brace!', '它在吸气！它前面的人，顶住！'),
    bark({ on: 'status', def: 'burn' }, 'pip', 'Fire! Old fat goes soft when it burns: get the Golem alight!', '着火了！老油一烧就变软：把魔像点着！'),
    bark({ on: 'bossPhase' }, 'greasegolem', '…Hot… like… Sunday…', '……烫……像……星期天……')
  ],
  'c4-1': [
    bark({ time: 3 }, 'pip', 'I cannot see a thing. Burners first: light the way.', '我什么都看不见。先放炉头：把路照亮。'),
    bark({ on: 'place', def: 'salt' }, 'frost', 'Salt is out. Slugs, you have been warned.', '盐罐上场了。鼻涕虫们，别说没提醒过你们。'),
    bark({ on: 'enemySpawn', def: 'spore' }, 'ladle', 'Spores. Salt scrubs the mold they leave behind.', '霉孢子。它们留下的霉，盐能擦干净。'),
    bark({ on: 'cleanse' }, 'pip', 'Scrubbed clean! I can stand there again!', '擦干净了！那一格又能站人了！'),
    bark({ on: 'telegraph' }, 'grind', 'Something big moving in the dark. Light it up!', '黑暗里有大东西在动。把它照出来！')
  ],
  'c4-2': [
    bark({ on: 'enemySpawn', def: 'mouse' }, 'ladle', 'A mouse. Stop it before it reaches anything worth taking.', '一只老鼠。在它碰到值钱东西之前拦住它。'),
    bark({ on: 'steal' }, 'pip', 'Hey! Put that down! That is a colleague!', '嘿！放下！那是我同事！'),
    bark({ on: 'recovered' }, 'grind', 'Got it back! Nobody steals from this kitchen!', '抢回来了！谁也别想从这个厨房偷东西！'),
    bark({ on: 'recipe', def: 'salted-caramel' }, 'shelly', 'Salted caramel! It smells like a fairground and it burns like one too!', '海盐焦糖！闻起来像游乐园，烫起来也像！'),
    bark({ on: 'telegraph' }, 'baron', 'Lads! Borrow EVERYTHING!', '小伙子们！什么都给我借走！')
  ],
  'c4-3': [
    bark({ time: 3 }, 'ladle', 'Four lanes and holes in the shelves. Choose every spot carefully.', '四路，架子上还有窟窿。每一格都要好好选。'),
    bark({ on: 'enemySpawn', def: 'moth' }, 'grind', 'Moths to the lamps! Shooters by the lights!', '飞蛾扑灯了！射手守住灯！'),
    bark({ on: 'defenderDown' }, 'bun', 'We lost someone. Close up. Be wide.', '少了一个。靠拢。变宽。'),
    bark({ on: 'telegraph' }, 'pip', 'Everyone at once! Hold the shelves!', '全来了！守住架子！')
  ],
  'c4-4': [
    bark({ on: 'place', def: 'ricecooker' }, 'pip', 'She is humming! Everyone near her, you will feel better soon.', '她在哼歌！挨着她的大家，很快就会好起来的。'),
    bark({ on: 'recipe', def: 'fried-rice' }, 'pip', 'Egg fried rice! The best thing that ever happened to leftovers!', '蛋炒饭！剩饭这辈子遇到过最好的事！'),
    bark({ on: 'steal' }, 'baron', 'A fine piece! Into the collection with you.', '好东西！收进我的藏品里。'),
    bark({ on: 'telegraph' }, 'baron', 'The whole court, lads! Supper is served!', '全体朝臣，小伙子们！开饭了！')
  ],
  'c4-5': [
    bark({ on: 'enemySpawn', def: 'baron' }, 'baron', 'Court is in session! Lights… out!', '开庭！熄……灯！'),
    bark({ on: 'warn', def: 'lightsOut' }, 'ladle', 'He is about to blow out that light. Get ready to light another.', '他要吹灭那片灯了。准备在别处再点一盏。'),
    bark({ on: 'hazard', def: 'lightsOut' }, 'pip', 'It went dark! I cannot see him!', '黑了！我看不见他了！'),
    bark({ on: 'bossPhase' }, 'baron', 'Ha! Splendid! Nobody has played with me like this in years!', '哈！太精彩了！好多年没人这样陪我玩了！'),
    bark({ on: 'slice' }, 'baron', 'A souvenir! Frosting, vintage tonight.', '留个纪念！奶油，今晚的年份。')
  ],
  'c5-1': [
    bark({ on: 'chill' }, 'frost', 'That one is chilled. Get a Burner or the Rice Cooker next to it.', '那个冻着了。在它旁边放个炉头或者电饭煲。'),
    bark({ on: 'place', def: 'ricecooker' }, 'ladle', 'Good. Everyone around her stays warm.', '很好。她身边的伙伴都暖和了。'),
    bark({ on: 'telegraph' }, 'grind', 'Something cold and big. Huddle up!', '又冷又大的东西来了。挤紧点！')
  ],
  'c5-2': [
    bark({ on: 'enemySpawn', def: 'brute' }, 'ladle', 'A Brute. When it falls, spores fly. Keep it away from our line.', '壮汉来了。它一倒，孢子就飞出来。别让它靠近防线。'),
    bark({ on: 'mold' }, 'pip', 'Mold on the shelf! Salt, please!', '架子上长霉了！盐罐，拜托！'),
    bark({ on: 'telegraph' }, 'bun', 'They are all coming. I will be very wide.', '它们全来了。我会变得非常宽。')
  ],
  'c5-3': [
    bark({ on: 'hazard', def: 'moldSpread' }, 'frost', 'It is creeping. One more cell gone.', '它在爬。又一格没了。'),
    bark({ on: 'cleanse' }, 'pip', 'Scrubbed! Keep shaking, Salt!', '擦掉了！继续撒，盐罐！'),
    bark({ on: 'telegraph' }, 'grind', 'A big wave behind the mold. Hold!', '霉后面跟着一大波。顶住！')
  ],
  'c5-4': [
    bark({ on: 'warn', def: 'coldSnap' }, 'frost', 'Cold snap coming. Anyone not warm will freeze.', '寒流要来了。没取暖的，都会被冻住。'),
    bark({ on: 'hazard', def: 'coldSnap' }, 'pip', 'Brrr! Everybody in the warm, quickly!', '好冷！大家快往暖和的地方靠！'),
    bark({ on: 'recipe', def: 'sunday-stew' }, 'granny', 'That\'s it. Everybody gets a bowl.', '对了。每个人都有一碗。'),
    bark({ on: 'telegraph' }, 'ladle', 'This is the last door before the back. Hold it.', '这是通往最里面的最后一道门。守住。')
  ],
  'c5-5': [
    bark({ on: 'enemySpawn', def: 'bloom' }, 'bloom', 'sunday… sunday… who is coming on sunday…', '星期天……星期天……星期天谁会来……'),
    bark({ on: 'warn', def: 'sporeRain' }, 'ladle', 'Mold is about to fall where it glows. Salt will clean it after.', '发光的地方马上会落霉。之后用盐擦掉。'),
    bark({ on: 'warn', def: 'breath' }, 'frost', 'It breathes cold. Only the warm will keep moving.', '它在呼出寒气。只有暖和的才能继续动。'),
    bark({ on: 'bossPhase' }, 'bloom', 'why does nobody come… why does nobody come…', '为什么没人来……为什么没人来……'),
    bark({ on: 'calm' }, 'pip', 'It stopped. It is shivering. Do not hit it! Put a Burner or the Rice Cooker right next to it!', '它停下了。它在发抖。别打它！把炉头或者电饭煲放到它身边去！'),
    bark({ on: 'remembered' }, 'stew', '…Warm. Oh. I remember now.', '……暖的。哦。我想起来了。'),
    bark({ on: 'recipe', def: 'sunday-stew' }, 'granny', 'Low and slow. You are doing it right.', '小火，慢慢来。你们做得对。')
  ],
  endless: [
    bark({ wave: 0 }, 'ladle', 'No dawn tonight, sous-chef. Let us see how long the counter holds.', '今晚没有天亮，副厨。看看台面能守多久。'),
    bark({ wave: 9 }, 'grind', 'Ten waves. I have ground through worse. Probably.', '十波了。更糟的我也磨过来了。大概吧。'),
    bark({ wave: 19 }, 'pip', 'Twenty! I am going to need a bigger Cookbook.', '二十波！我得换本更大的菜谱了。')
  ]
};
