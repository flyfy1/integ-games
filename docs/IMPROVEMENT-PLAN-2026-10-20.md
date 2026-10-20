# Integ Games 改进规划：可读、悦耳、不断局

日期：2026-10-20。范围：仅规划；本次不修改游戏、样式、配置、资产或部署。

**建议先把“进入一款 → 看懂状态 → 得到恰当反馈 → 轻松重试或换一款”连成一个可靠的体验，再增加少量有意义的语音。** 最优先修正静音导致游戏重建的问题；美术工作的第一投入是层级、对比度和可操作尺寸；声音工作的第一投入是语义与混音，不是给 21 款统一加背景音乐。

产品边界：Games 提供轻量娱乐与少量深度战役；保留 Integ.Life 家族导航、身份入口和现有可选社交服务，不另造账户中心、任务管理、习惯打卡或成长平台。核心玩法无需登录；联网功能失败不能阻断游玩。

## 1. 现状诊断

### 调研口径与完成情况

- 源码基线：`7cd588675ed4a15bc1c9fa567f0bd1ec4ac5a397`，开始调研时工作树及暂存区均干净。
- 已通读调研前 `docs/` 全部 10 份文档：`PRODUCT_AND_DESIGN.md`、`AUDIO_AND_MOBILE_CONTROLS.md`、`GAME_POLISH_EVALUATION.md`、`GAME_POLISH_SCORECARD.md`、`CATEGORIES_AND_RECOMMENDATIONS.md`、`RELEASE_CHECKLIST.md`、`ASHFALL-CAMPAIGN-REVIEW.md`，以及 `ashfall/design-contract.md`、`ashfall/content-matrix.md`、`ashfall/verification.md`。
- 已读取 `src/core/` 全部文件、`src/main.ts`、`src/styles/`、`src/games/_shared/`、`src/games/arcade-kit.ts` 和全部 21 个 `index.ts`。四类深读锚点为 Merge 2048、Block Drop、Neon Snake、Pocket Survivor；Ashfall 的 `index.ts` 只是入口，另读 `audio.js`、UI/游戏生命周期及战役文档。
- 已执行 `curl -s https://games.integ.life/`：返回约 1,910 B 的 SPA HTML，`#app` 为空挂载点；meta 已写 twenty-one，加载 `main-BMV4QkI_.js`、`main-ZA6IVBjU.css` 以及跨子域 comments SDK。**curl 本身不能证明列表和排行榜渲染。**
- Luna 使用 Playwright 技能完成线上桌面与 390px 手机视口核验：英文、Dark 主题；主文案为 “Small games, properly made” 和 “Pick a bright little world to enter.”，CTA 为 Play Merge 2048；总数 21，四类计数 7/4/4/6；总榜位于 Hero 后、目录前，当时有 1 条记录、分数 8；零控制台 error/warning。首页与2048检查止于开始前；未登录、未提交分数或评论。临时截图在 `/tmp/integ-games-home-desktop.png`、`/tmp/integ-games-home-mobile.png`、`/tmp/integ-games-merge-2048-mobile.png`，不作为长期仓库附件。
- 补充核验Hexa Fit：1280×900视口仍显示Start game入口；点击开始后只见 `FIT 0 · ROUND 1` 与编号1–3的空槽，无棋盘格/可选块。未落子，console零error/warning；`/tmp/integ-games-hex-after-start.png`记录该状态。浏览器配置仍可能被识别为触控，不把它称作纯鼠标桌面自动挂载证明。
- 当次线上 `/build-version.json` 返回上述同一完整 commit、`dirty:false`、UI 版本 `0.6.0`；这支持首页与当前源码对照，不等于全量运行时验收。
- 已尝试 `npm run build`，在 prebuild 即失败：缺少 `node_modules/@integ-life/ui/package.json`（ENOENT；Node v23.11.0）。未安装依赖或改配置，未继续 dev/typecheck/unit/E2E；**当前构建健康未验证**。旧文档中的成功记录属于 2026-10-18，不冒充本次成功。
- Sol 独立进行了文档/源码交叉审查。未进行 21 款人类实玩、真机或耳机听评；下文精美度是源码及现有呈现的设计判断，不是玩家满意度测量。
- 本环境未找到可读的 `website-design/SKILL.md`，本规划以 owner 在任务中提供的完整原则为约束；48px、全状态双语、无追踪和总 CSS 预算优先于旧文档中的 40/44px 与历史例外。

### 1.1 UI

| 判断 | 证据 | 性质与处理方向 |
| --- | --- | --- |
| 家族壳已存在，不能把站点当成没有设计系统 | `src/main.ts:7–9,66–69` 引入本地 vendor UI 与 family bar；`src/styles/shared-layout.css:1–19` 让目录跟随家族明暗主题、舞台保留深色 | 已完成。保留家族导航/主题；补 Games 语义 token，不另做平行品牌壳 |
| 样式合同分散，CSS 实际超预算 | `app.css` 15,918 B + `shared-layout.css` 2,179 B + vendor tgz 内 `package/styles.css` 11,177 B = **29,274 B 原始 CSS**；还没算 Ashfall 注入 10,819 B 及其他 inline styles；`docs/ashfall/verification.md:14,38` 已承认超预算 | 真问题。历史“共享 27.57KB”不是当前原始源码总量；先量全，再收敛重复规则及无用 vendor 样式 |
| 关键文字存在可计算的对比度缺口 | `app.css:1` 中 2048 的 `#F7F9FF` 对 `#8B7CFF/#B99BFF/#FF6B7A` 分别 **3.10/2.17/2.61:1**；`solitaire/index.ts:14` 红牌号 `#E85C72` 对 `#F7F9FF` 为 **3.22:1** | 真问题。后两种数字背景连大字 3:1 都不到；17px 牌号低于普通文字 AA。按颜色对修复，不能仅看“字体很粗” |
| 不必无差别把次级文字加亮 | `#A8B1C5` 对舞台面板 `#12192A` 实测 **8.15:1**；Ashfall 已有对比度表，见 `docs/ashfall/verification.md:5–12` | 已有合格部分。保持层级；核心文本目标 ≥7:1，普通文本底线 4.5:1 |
| 操作尺寸有明显遗漏，Canvas 逻辑像素不是 CSS 像素 | `app.css:8,14,16` 的暂停/退出为 44px、工具栏为 40px；`shared-layout.css:22–25` 声音/账户按钮 44px；`game-ui.ts:25–28` 将 600px Canvas 缩放；Sudoku 的 52×48 逻辑键也会缩小 | 真问题。统一控件 ≥48×48 CSS px；密集棋盘另做可达输入方案，不能只把绘图常数改成 48 |
| UI 双语覆盖并不完整 | `main.ts:68–110,153–178` 的目录、在线状态、操作与错误基本写死英语；`mobile-controls.ts:5–7,16–22` 为英文标签；Ashfall 在 `ui.js:11–12` 已有 EN/zh | 真问题。复用 Ashfall 翻译成果，补壳及旧 20 款；不得宣称“站点已双语” |
| 首页可更快帮助选游戏 | 线上总榜先于目录；`main.ts:76–81` Hero 固定推荐 catalog[0]；卡片同时显示类别、两 trait、玩法和 best；390px 筛选条宽354px、内容760px，后续类别缺明显滚动提示 | 位置和密度属于产品假设，不是渲染 bug。建议把选游戏放前、总榜下移，用找游戏任务验证；保留现成搜索/分类 |
| 封面已经是本地实机图，不缺一整套新插画 | `main.ts:107` 使用 `/game-art/…`；当前42张 cover/icon 合计255,315 B，最大22,099 B（Solitaire cover） | 已完成且预算良好。优先改善截图构图，必要时重拍；“霓虹不够高级”只是个人口味，不足以支持全站换皮 |

### 1.2 音频

| 判断 | 证据 | 性质与处理方向 |
| --- | --- | --- |
| 旧 20 款并非无声，基础事件接线已经完成 | `game-types.ts:30–35` 有11种 cue；`services.ts:21–50` 合成、按 kind 限频；各 `index.ts` 已调用 action/reward/fail 等；`AUDIO_AND_MOBILE_CONTROLS.md` 是现有规格 | 已完成。此次应升级声音质量与语义，不再提“给所有游戏接上音效” |
| 多数音色差异主要是频率/波形，事件之间表达力有限 | `services.ts:39–43` 单振荡器、固定频率表，普通声音110ms、胜负180ms；`soundTheme()` 的 calm 与 puzzle 最终同为 sine | 实现事实；“显得单薄”是待听评假设。优先包络、材质、音高轮廓与适度变化，少量采样补充，避免只增加响度 |
| 一些声音语义混淆 | `arena/index.ts:15` 命中敌人与自己受伤都为 `hit`；`hex-puzzle/index.ts:20,25` 无效放置与终局都用 `fail`；Sudoku 错误、Memory 不匹配也复用 `hit` | 真问题。区分 reject/hit/hurt/warning/terminal，声音与文字/形状相互佐证 |
| 全局设置和音频资源所有权不足 | `services.ts:21–50,66–73` 每次创建新的 Sound，只有 mute、stop，无显式 dispose/close、总线、优先级或硬并发上限；resume 在 play 内尝试 | 真问题。先解决不中断设置、手势解锁、生命周期、音量持久化与限幅；不能把“已调用 resume”当作所有设备可发声 |
| Ashfall 已是更完整的独立音频栈 | `ashfall/audio.js:24–40,45–119,121–216` 有 SFX/music buses、噪声/滤波/压缩、动态程序配乐、duck、disconnect、suspend/close；`game.js:1990` 每帧同步 shell mute | 已完成。保留作曲与素材方法，把所有权/设置接入共享合同；不要重写现有配乐或误称 Ashfall 不响应 mute |
| “有声音”不是“听起来精美” | `tests/audio-cues.test.ts` 包含源码模式检查；`docs/ashfall/verification.md:32` 明言耳机混音与人类偏好未验证 | 证据边界。音频回归需真实输出试听，不能只看 AudioContext running 或测试绿灯 |

### 1.3 连贯性

| 判断 | 证据 | 性质与处理方向 |
| --- | --- | --- |
| 声音开关会打断当前局 | `main.ts:202` mute 后调用 render；`render():181` destroy；`gamePage():162` 重新 mount。只有实现保存的游戏能部分恢复 | **P0 真问题，代码路径确认，未做本次在线破坏性复现。** 原位更新声音/按钮；暂停、调音量、换语言都不得重建模拟 |
| Hexa Fit首次开始为空棋盘 | `hex-puzzle/index.ts:13,19,27–33` 定义reset填充cells/pieces，却在首次mount直接loop而未调用；线上开始后已验证无棋盘格/可选块 | **P0 真问题。** 先恢复首次初始化再润色；源码还显示空盘点击会访问undefined.q，此异常路径未在线点击复现。仅外部Restart能补初始化不是正常首局体验 |
| 共享壳与触控已存在，但不是单一可复用呈现层 | `game-ui.ts` 提供600×600画布+文本HUD；`arcade-kit.ts` 主要为360×560画布、HUD画在Canvas；2048用DOM，Ashfall自有UI | 真问题是状态合同不同，不是引擎数量。共享状态/操作/生命周期适配层，保留渲染技术与玩法个性 |
| “结束”与“进度”不能用现有 complete 回调直接推断 | `game-types.ts:42–44` 只有 reportScore/reportComplete；`main.ts:164` completion为空；Hexa Fit、Brick Pulse、Arena在换轮/升级时也 reportComplete | 真问题。增加明确 milestone 与 terminal result 通道，才可接统一结算、下一款和语音；不能给每次升级弹终局 |
| 全屏旅程有待验证的暂停层问题 | `main.ts:153` 通用 overlay 在 stage 的外面；`enterImmersive():126–134` 全屏的是 stage；`togglePause():239–245` 只对 Ashfall 特判迁移 overlay | 高风险结构缺口，待原生全屏复现。应保证所有游戏暂停层在实际全屏树内；移动开始前不应展示可操作的 Restart/Pause |
| 部分 reduced-motion 处理反而增加刺激 | `arcade-kit.ts:28–31` 将 burst 变成整画布 flash；Snake pickupPulse、Block clearFlash 未检查 reduced-motion | 真问题。改成局部静态轮廓/文字；已有2048降动效和Ashfall零震屏方案继续保留 |
| 自动更新可能抢断一局 | `main.ts:315` onNeedRefresh 直接 updateSW(true)；`docs/ashfall/verification.md:38–42` 记录自动刷新及曾有短暂 worker 缓存滞后 | 真风险。更新提示在安全边界由玩家触发，不清缓存/存档；既往缓存事件已自行传播解决，不再当成待修 CDN 故障 |
| 总榜和 Integ.Life 登录已有，不能再造账户层 | `online.ts:5–47`、`backend/main.go:236–254`、`main.ts:68,80`；线上总榜已渲染 | 已完成。原始 best 相加不是公平的跨游戏能力分；保留并明确口径，不在本轮改算法/排行历史；Ashfall v3 仍本地独立 |
| 历史规格已落后于实现 | PRODUCT/RELEASE/CATEGORIES 多处写20款、旧module类别、无后端；当前 catalog 为21款、访问层四类。Ashfall旧评审三个具体bug已由 verification:28记载修复 | 未来实施首批同步规格，避免照旧清单“补做”。本次只写本文，不修改旧文档 |
| 自包含原则与当前在线依赖有冲突 | `src/analytics.ts:1–48` 生产加载Google tag；`index.html` 外链discuss SDK；main还有games-api调用 | 真问题。按本次明确要求移除追踪；评论脚本需本地版本化并按需加载，在线API作为明确可选功能降级。Pi仅是资源约束，本次未验证实际生产托管在Pi |

## 2. 21 款速览表

评分为本次“当前精美度”单项设计估计：1=基本呈现未成形，2=能看懂但反馈/可读性明显粗糙，3=基础完整、仍有突出短板，4=已有较完整的个性与反馈，5=经双语/无障碍/真机/听评验证的旗舰质量。本次不授予5分。它与2026-08-10七维源码评分口径不同，不能解读为历史退步或实测前后对比。表中建议优先依据现有代码；具体视觉偏好须在试点确认。

### Puzzle & Strategy（7）

| 游戏 / slug | 玩法一句话 | 分 | 最该改的一点与证据 |
| --- | --- | ---: | --- |
| Merge 2048 / `merge-2048` | 四向滑动合并同值数字，累积最高方块 | 4 | 修正高值方块的数字对比度，保留稳定ID、150ms滑动、合并/生成动效与存档；`index.ts:23–121`、`app.css:1` |
| Pocket Mines / `mines` | 根据邻格数字找出安全格并标雷 | 3 | 把手机长按猜操作改成明确的“翻开/插旗”48px模式与精确选格；`index.ts:14–19`，现有520ms长按并非不存在 |
| Daily Solitaire / `solitaire` | 交替颜色叠牌，把四种花色送入基础堆 | 2 | 先解决手机牌号与可选牌范围：红牌对比度、小牌缩放、选中目的地反馈；`index.ts:14–24`。不是先加洗牌动画 |
| Calm Sudoku / `sudoku` | 在9×9网格中填入不重复的数字 | 3 | 提供不随Canvas缩小的数字键盘、选中行列/冲突形状提示；`index.ts:11–18`。当前单固定题，不包装成丰富每日题库 |
| Word Trail / `word-grid` | 连相邻字母找出五个目标英文单词 | 2 | 修正棋盘/待找词布局和完成路径留痕；`index.ts:10–15` 的末行圆底在y=599，与y=572词列表争空间。中文界面明确标“英文单词” |
| Memory Flip / `memory` | 翻开16张牌，记忆并配对8组图形 | 2 | 白色牌面上的浅色图形加深/加轮廓；第8种 `#F7F9FF` 图形与牌面同色。保留已有匹配与计时锁；`index.ts:4,10–12` |
| Hexa Fit / `hex-puzzle` | 选择拼块放入网格，填满行列得分 | 2 | **先修首次mount缺reset的空盘阻断**，线上已见空棋盘/托盘；`index.ts:13,19,27–33`。恢复可玩后再区分非法放置与终局音效，保留已有preview |

### Match & Build（4）

| 游戏 / slug | 玩法一句话 | 分 | 最该改的一点与证据 |
| --- | --- | ---: | --- |
| Block Drop / `block-drop` | 移动旋转落块，填满整行并提速 | 3 | 把已存在的全井消行白闪改为清晰的行内确认与落点提示，移出手机看不清的画内键盘说明；`index.ts:14–22` |
| Perfect Stack / `stack` | 让横移方块精准叠上塔身，挑战15层 | 3 | 用切掉部分的短暂局部反馈解释“为何变窄”，突出Perfect并保留即时落位；`index.ts:9–12`。catalog的Endless与15层结束不一致需校正文案 |
| Fruit Orbit / `fruit-merge` | 投下球形果实，让同级碰撞合成升级 | 3 | 让果实层级和溢出边界可读：加轮廓/符号/等级而不只换颜色；保留已有掉落和合并burst；`index.ts:4,17–28` |
| Bubble Pop / `bubble` | 瞄准发射同色球，连成三颗并清掉悬空球 | 3 | 色球加可辨纹样与更清晰的命中落点，不重复开发已有瞄准线、连通消除和悬空掉落；`index.ts:11–31,45–55` |

### Quick Reflex（4）

| 游戏 / slug | 玩法一句话 | 分 | 最该改的一点与证据 |
| --- | --- | ---: | --- |
| Neon Snake / `snake` | 吃光点增长，避开边界和身体 | 3 | 将死亡原因定位到碰撞处，并给清楚的再来一局按钮；已有转向队列和拾取脉冲，需补降动效；`index.ts:14–19` |
| Sky Flap / `flap` | 单键控制飞行高度，穿越连续门洞 | 3 | 失败时标出碰撞部位并让触屏重试与文案一致；已有角色倾斜、过门音效，不另添干扰飞行的背景运动；`index.ts:10–14` |
| Brick Pulse / `breakout` | 控制挡板反弹小球，击碎砖块 | 3 | 耐久砖增加裂纹/分段，区分碰墙、碰板、碎砖声音，减少同时hit+clear叠播；`index.ts:13–18` |
| Orbit Knife / `knife` | 把飞刀插进旋转靶，避开已插入的刀 | 3 | 用剩余刀位/本轮进度解释清轮，避免score归零看似丢分；已有飞行trail和撞击效果；`index.ts:8–11` |

### Action & Adventure（6）

| 游戏 / slug | 玩法一句话 | 分 | 最该改的一点与证据 |
| --- | --- | ---: | --- |
| Pixel Defense / `invaders` | 横移射击清除敌群并躲弹幕 | 3 | 敌弹与己弹用形状/亮度区分，波次过渡与开火声留出危险提示空间；已有枪口/命中burst；`index.ts:12–16` |
| Metro Dash / `runner` | 三路切换、跳跃或下滑躲障碍 | 3 | 障碍轮廓明确提示“跨越/下滑”，失败说明对应动作；已有切道、跳、蹲反馈；`index.ts:7–11` |
| Trap Trail / `platformer` | 在平台间跳跃避陷阱，抵达出口 | 3 | 给出口和危险区明确的视觉层级与到达反馈，不扩大粒子；当前单布局，catalog的Levels应避免暗示多关内容；`index.ts:11–22` |
| Tiny Wheels / `drive` | 用油门和刹车保持小车在坡道上行驶 | 2 | 合并画内与共享DOM两套踏板表达，让触屏失败重试真正匹配提示；`index.ts:11–21` 的pointerdown只setPedal，而文字声称Tap重试 |
| Pocket Survivor / `arena` | 移动避敌、自动攻击、升级选择能力 | 3 | 分清自己受伤与攻击命中，并将三项升级做可读DOM选择；当前11px副文案与同一hit声音；`index.ts:10–16` |
| Ashfall / `ashfall` | 在五幕20关中斩击、射击、翻滚并打败守卫 | 4 | 保留成熟战斗与音乐，先统一壳语言/音量，再试点幕间语音；先做真人听评与手机验证；`index.ts:5–15`、`audio.js`、`docs/ashfall/verification.md:32` |

这些点不是重做21款的授权清单。若实施时发现可操作性缺陷，先用普通输入复现，再修最小问题；每款优先完成上表一点，只有试点证据支持才继续加饰。

## 3. UI 改进方案

### 3.1 视觉系统与 token 合同草案

视觉方向：目录使用现有 Integ.Life 的安静绿色家族框架，游戏舞台保留各自的霓虹/纸牌/灰烬色彩。不要为了“统一”把 Ashfall 染成薄荷绿。所有下面的值是合同候选值，实施前以一页组件/状态对照确认；同一语义只允许一个token，不新增近似值。

```css
/* 目录：沿用家族命名，Games局部语义引用；不在游戏内改全站变量。 */
:root {
  --ig-bg: var(--il-bg); --ig-surface: var(--il-surface);
  --ig-text: var(--il-text); --ig-accent: var(--il-accent);
  --ig-on-accent: var(--il-on-accent); --ig-border: var(--il-border);
  --ig-muted: #455749; /* light：比当前家族muted更适合小型核心标签 */
  --ig-focus: #244E3C;
  --ig-stage-bg: #090D18; --ig-stage-surface: #12192A;
  --ig-stage-text: #F7F9FF; --ig-stage-muted: #A8B1C5;
  --ig-stage-focus: #70F0C2; --ig-stage-danger: #FF6B7A;
  --ig-stage-on-bright: #090D18;
  --ig-font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --ig-size-caption: 0.875rem; --ig-size-body: 1rem;
  --ig-size-label: 1rem; --ig-size-hud: 1.5rem;
  --ig-size-section: 1.5rem;
  --ig-size-title: clamp(2rem, 4vw, 3rem);
  --ig-line-body: 1.5; --ig-line-title: 1.125;
  --ig-weight-body: 400; --ig-weight-label: 600; --ig-weight-title: 700;
  --ig-space-1: 4px; --ig-space-2: 8px; --ig-space-3: 12px;
  --ig-space-4: 16px; --ig-space-6: 24px; --ig-space-8: 32px;
  --ig-space-12: 48px;
  --ig-radius-control: 8px; --ig-radius-card: 12px;
  --ig-radius-stage: 16px; --ig-radius-pill: 999px;
  --ig-shadow-card: none; --ig-shadow-overlay: 0 8px 24px #00000026;
  --ig-stroke: 1px; --ig-focus-width: 3px; --ig-focus-offset: 3px;
  --ig-target: 48px; --ig-control-game: 56px; --ig-control-primary: 64px;
  --ig-content-width: 1120px; --ig-reading-width: 640px;
  --ig-motion-press: 80ms; --ig-motion-hover: 120ms;
  --ig-motion-feedback: 160ms; --ig-motion-panel: 160ms;
  --ig-ease: cubic-bezier(.2, .8, .2, 1);
}
:root[data-integ-theme="dark"] {
  --ig-muted: #B3C2B1; --ig-focus: #B2D3A6;
}
```

- 家族别名当前精确落值：light 背景 `#F6F7F2`、surface `#FFFFFF`、text `#26382E`、accent `#244E3C`、on-accent `#FFFFFF`、border `#D8DFD3`；dark 为 `#171E1A/#202A23/#E8EFE5/#B2D3A6/#183021/#435346`。依赖版本升级必须重验；无外部字体下载。
- 合同对比度计算：light主文本/白面板12.44:1、候选muted/白7.74:1；dark主文本/面板12.64:1、muted/面板7.95:1；dark按钮文字/accent8.60:1。舞台正文16.65:1、次级8.15:1。均按sRGB线性化后 `(L亮+0.05)/(L暗+0.05)` 算；透明叠层、hover、disabled与实际背景组合仍需单独验收。
- 彩色数字块不机械继承白字：深字 `#090D18` 配珊瑚 `#FF6B7A` 为7.05:1；紫色核心数字候选改为 `#111827` 配 `#AFA4FF` 为8.09:1。红牌号候选 `#8E2338` 配白底8.58:1。形状/符号保留颜色身份，不能只靠色相区别状态。
- 所有输入边界、焦点与必要非文本图形另验 ≥3:1；弱边框只用于装饰分隔，不能作为唯一可交互线索。禁用控件用原生disabled与说明，不用整体opacity把关键原因变得难读。
- 根字体16px；caption只用于辅助元信息，计分/关键指令至少16px CSS尺寸；数字用tabular-nums。Ashfall保留本地Georgia标题与现有金色token，映射到语义接口即可。
- Canvas色值/字体读取同一token来源并在主题/设置变化时缓存更新，不在每帧getComputedStyle；不得复制一套近似JS颜色常量。物理尺寸/关卡坐标不属于视觉token，不改玩法几何来凑规范。

### 3.2 首页、列表与游戏内层级

首页顺序建议：紧凑的“挑一款，现在玩 / Pick a game. Play now.” → 有历史时“最近玩过 / Recently played” → 搜索/四类筛选/游戏网格 → 折叠或紧凑总榜。首次访问仅保留一个编辑精选，不做轮播、自动视频或不断跳动的Hero。

- 保留现有分类、计数、URL查询、trait与编辑推荐数据；手机类别改可换行的48px按钮组，或有明确“更多分类”入口，不以隐蔽横滑为唯一发现方式。
- 卡片只强调标题、实机图、一句玩法和一项真实状态；类别可作辅助，trait压缩但不依赖hover才能看懂。未开始显示“开始玩 / Play”；零分不等于未玩，应由played状态区分。
- “Continue playing”目前来自recent列表，不能承诺所有游戏续局；无保存的游戏用“最近玩过”，2048用“继续棋盘”，Ashfall用“从第N关继续”，明确“当前设备 / This device”。
- 游戏页维持已有game-first顺序；主操作仅开始/继续，暂停常驻；重开、说明、声音与分享收纳但仍可达。loading/未开始时禁用暂停/重开，并说明原因；不让五个等重按钮抢主操作。
- HUD统一结构为“本局主指标 → 当前目标/危险 → 次级最佳”，游戏自行决定单位。Canvas舞台上方用DOM HUD/状态辅助层，暂停/结算用DOM；战斗血条、瞄准线与关卡世界继续Canvas绘制。
- 暂停展示“继续 / Resume”为主、重开为次、返回目录为弱；焦点移入、Esc关闭非必要面板、关闭后回原控件。说明面板打开时暂停实时玩法，关闭仅在玩家确认继续后恢复。
- 结算显示原因/结果、最终分/关卡、是否新纪录、保存/联网状态；主按钮“再来一局 / Play again”，次按钮推荐一款。Ashfall幕间仍优先下一关/锻造，结束战役或玩家离开时才推荐外部游戏；2048达到2048但还能继续时不强制终局。

### 3.3 全状态 × 双语合同

引入轻量词典与参数化消息，不引框架。一个shell locale管理EN/zh-CN：显式URL（如有）→已存选择→浏览器→EN；原位切换，持久化到Games设置；读取旧Ashfall语言作首次迁移，之后由shell提供locale、Ashfall保留局部入口但写同一设置。账号/主题沿家族契约，先核对vendor是否已有语言事件，避免重复开关。游戏名作为品牌可不译；玩法、单位、按钮、错误、accessible name都提供两种文案。

| 状态 | EN / 中文核心文案示例 | 行为与验收 |
| --- | --- | --- |
| 首次进入/准备 | Ready when you are / 准备好就开始 | 一句玩法+真实输入提示；不自动倒计时 |
| 加载 | Loading game… / 正在加载游戏… | aria-busy；操作禁用但返回始终可用；无必须循环的装饰 |
| 资源失败 | Could not load. Try again. / 加载失败，请重试 | 原位重试/返回；不只有“刷新网页” |
| 搜索为空 | No games matched / 没有找到游戏 | 清空搜索/查看全部；仅目录计数，不把推荐卡算入结果 |
| 游玩 | Score / 分数；Goal / 目标 | HUD不靠颜色；live region只读重要节点，不逐帧读分 |
| 无效操作 | That space is occupied / 这个位置已被占用 | 局部标记+可选reject声音，不等同失败 |
| 暂停/后台 | Paused. Resume when ready. / 已暂停，准备好再继续 | 输入/音频停；回前台不自动恢复 |
| 失败/胜利/里程碑 | Run over / 本局结束；Stage clear / 本关完成 | 区分终局与升级；可立即操作，不等演出结束 |
| 无可用动作/禁用 | Start the game first / 请先开始游戏 | 原生disabled+可读原因；禁用不是“点了没反应” |
| 音频受限/失败 | Sound is off / 声音已关闭；Enable sound / 开启声音 | 失败静默回退并提供手动重试，玩法照常 |
| 存储不可用 | Progress lasts for this visit only / 进度仅保留到本次离开前 | 不声称已保存；复用Ashfall已有处理思路 |
| 总榜loading/empty/error | Loading standings… / 正在加载榜单…；No scores yet / 暂无成绩；Retry / 重试 | 复用现有分支，补双语；无数据不等于网络错误 |
| 登录/提交 | Play as guest / 游客游玩；Saved locally; upload failed / 已保存在本机，上传失败 | 仅在知道提交结果时显示；当前submitScore吞错需先返回真实状态 |
| 分享/404/更新 | Link copied / 链接已复制；Back to arcade / 返回游戏厅；Update after this run / 本局结束后更新 | 保留手动复制降级；更新不能抢断游戏 |

### 3.4 动效与反馈（juice）

| 事件 | 建议反馈 | 生命周期/降动效要求 |
| --- | --- | --- |
| 按下/hover | 80ms按压、120ms颜色变化；无需hover上浮 | 输入立即生效；reduced-motion只保留静态样式 |
| 普通操作成功 | 局部轮廓或≤160ms的小幅确认；安静音色 | 同一事件只发一次；不为播放音效排队延迟操作 |
| 合并/消除/精准落位 | 数值/结果当帧更新，短局部脉冲；少量有方向的碎片 | 保留2048现有动画，审查150ms锁能否安全接纳下一输入；不得扩大锁或等待animationend |
| 命中/受伤 | 明确目标位置、短伤害标记；不同形状/音色 | 不用整屏白闪代替粒子；reduced-motion零相机震动、零非必要位移 |
| 升级/新纪录 | 一条静态徽标+短和声音阶，不增加遮挡弹窗 | 屏幕信息先出现；声音/动画不能延迟选择/下一局 |
| 终局/换页 | 无强制倒计时；面板≤160ms淡入 | 按钮立即可用；动画销毁即取消，不穿越路由 |

默认无环境循环动画、不做自动漂浮卡片/闪烁CTA。现有游戏运动属于规则；瞬态FX按simulation事件创建、统一有界时间步更新，pause冻结、restart清空、destroy回收。帧率相关的视觉效果先使用delta-time；涉及现有玩法速度则单独回归，避免以“润色”改变难度。Ashfall已存在hit-stop不在本次加长，新增UI反馈不阻断操作。

### 3.5 移动端与无障碍

- 320×568、390×844、768px平板、900×450横屏、1280×900桌面及200%缩放均纳入验收。安全区四边与100dvh保留；全屏失败仍可在页内完成全部操作。
- 点击控件至少48×48 CSS px；移动动作目标56px、主要动作64px，保留现有已达52/64px的按钮。设备是否有触控按pointer/coarse等能力决定，修正JS允许coarse、CSS却在>720px隐藏的冲突，不强制把触控平板当鼠标桌面。
- 棋盘9列要让每格48px至少需要432px，320px屏不能凭空满足。采用“全局棋盘预览 + 可选放大/平移精确区 + 48px方向/确认/插旗/数字键盘”方案；选择时自动把焦点格带入视口，不把多个小格的命中区重叠放大。纸牌用选中牌抬出到可读区、48px目的地按钮；先在Sudoku/Mines/Solitaire验证再推广。
- 游戏HUD和指令不随Canvas比例缩小；不能因画布缩放把16px字变成8px。密集棋盘提供键盘/DOM选格状态和坐标读出，不能只给Canvas一个role=application便宣称读屏可用。
- 统一pointercancel、lostpointercapture、blur、visibilitychange的held-state清理；同时按方向和动作可用。暂停后测试键盘与触控都不能继续发射/落子，不能仅依赖遮罩挡住点击。
- 手机横屏控件不得盖住危险预告、出口和血条；Ashfall保留专有布局。对话框、暂停层、声音设置必须在实际fullscreen元素内；退出按钮始终可见且可读屏。
- 动作游戏不承诺本次实现完整非视觉游玩，但所有壳、菜单、帮助、设置、结果和棋盘替代操作应可键盘完成；记录各游戏剩余障碍，不能笼统写“全站无障碍通过”。

## 4. 配音 / 音频方案（重点子系统）

### 4.1 “配音”的分层与投入判断

本规划把owner的“配音”拆成四层：UI音效、玩法音效、BGM、语言语音。前两层是21款普遍适用的质量工作；BGM按类型有选择地投入；语言语音作为受控试点，不把更吵等同于更engaging。

| 层 | 适用与默认 | 不值得做的噪音 |
| --- | --- | --- |
| UI SFX | 开始、明确确认、结束；全局共用一组短而轻的声音，支持全关 | hover、焦点移动、搜索每个字、排行榜刷新、每次开菜单都响 |
| 玩法 SFX | 21款根据事件分层：轻操作、动作接触、奖励、危险、终局；高频操作主动减声 | 每帧运动、每个粒子、每次碰撞都叠播；无效动作发和失败一样的音 |
| BGM/环境 | Ashfall保留已有自适应音乐；其余首轮默认无BGM，只在玩家打开“音乐”且该游戏有profile时播放 | 首页BGM、益智游戏强制循环曲、所有游戏复用一条短循环、退出后继续响 |
| Voice | Ashfall幕间/结尾、一次性按需教学；少量高手时刻可做A/B试听 | 每次失败斥责、每一步操作解释、动态念分、每一枪报连击、普通棋盘持续旁白 |

**逐款声音身份与开关策略**（“可试”均属P2，默认不开新功能）：

| 游戏 | 玩法音色身份；共享家族关系 | BGM | 语言语音 |
| --- | --- | --- | --- |
| Merge 2048 | 柔和玻璃敲击，合并提升音程，普通滑动极轻 | 不加 | 不加；达2048用短旋律足够 |
| Pocket Mines | 纸面/小晶体，翻开与插旗不同，爆雷短而不惊吓 | 不加 | 不加 |
| Daily Solitaire | 短纸牌刷动，入基础堆温暖和声 | 不加 | 不加 |
| Calm Sudoku | 柔软木键，冲突低音短点，完成小和弦 | 不加 | 只可按需朗读规则，非首轮 |
| Word Trail | 连线过程静默，完整词捕获玻璃二音 | 不加 | 不做自动单词发音；这不是语言学习产品 |
| Memory Flip | 纸/毛毡翻牌，匹配温暖二音，不匹配轻落下 | 不加 | 不加 |
| Hexa Fit | 陶片落位，清线多音，reject为低强度闷音 | 不加 | 不加 |
| Block Drop | 短木块锁定、消行清脆阶梯，硬降与软移分开 | 后续可试稀疏程序节奏 | 可试罕见大消除/新纪录，默认关 |
| Perfect Stack | 木/玻璃叠放，Perfect音程上扬但有封顶 | 不加 | 可试3/5次Perfect，仅稀疏播报 |
| Fruit Orbit | 柔软气泡/果冻合成，音高按有限层级变化 | 不加 | 不加 |
| Bubble Pop | 空气弹射与清簇分层，一簇只响一次 | 不加 | 不加 |
| Neon Snake | 极短电子转向、较暖拾取、碰撞收束 | 不加 | 不加 |
| Sky Flap | 轻风/扑翼、过门清音；不每拍报分 | 不加 | 不加 |
| Brick Pulse | 球板木弹、砖块晶体裂声、清波短旋律 | 不加 | 不加 |
| Orbit Knife | 短金属/木质接触，冲突与命中不同 | 不加 | 可试清轮一次，需证明不烦 |
| Pixel Defense | 低强度街机脉冲、危险音优先于开火 | 后续可试低密度程序节奏 | 可试大波次胜利，非每波 |
| Metro Dash | 换道轻风、跳/滑材质不同，撞击短 | 首轮不加 | 不加，以免遮住操作节奏 |
| Trap Trail | 轻落地、危险预告、出口小和声 | 首轮不加 | 教学按需，非强制 |
| Tiny Wheels | 踏板确认与短抓地声，不做常驻发动机嗡鸣 | 不加 | 不加 |
| Pocket Survivor | 命中低中频、受伤独立短警示、升级暖和弦 | 后续可试低音量张力层 | 可试升级/存活里程碑，默认关 |
| Ashfall | 保留金属、风、低频与分幕motif；削减密战遮蔽 | 保留现有程序音乐与duck | P2幕间/结尾试点，不做全战役逐句配音 |

统一的是事件强弱、响度范围、控制和两三音的奖励语汇；可辨识度来自材质、包络、音域与有限变奏。变化使用音频自己的确定性变体序列，不消耗游戏RNG、不得影响关卡/牌序或公平性。

### 4.2 共享架构：扩展现有 services，不引入音频平台

目标：每个页面实例至多一个活动AudioContext，一个master，经UI/SFX/music/voice四条总线输出；游戏只拿到有生命周期的session。保留现有 `services.sound.play(kind)` 接口作为适配器，让20款逐批迁移；不引大型第三方音频依赖。

```ts
// 草案，只表达边界；不在本次实现。
type AudioChannel = 'ui' | 'sfx' | 'music' | 'voice';
type Cue = 'tap' | 'move' | 'merge' | 'collect' | 'clear' | 'jump'
  | 'shoot' | 'hit' | 'upgrade' | 'success' | 'fail'
  | 'reject' | 'hurt' | 'warning';
type AudioSettings = {
  version: 2; muted: boolean; master: number;
  sfx: number; music: number; voice: number;
  musicEnabled: boolean; voiceEnabled: boolean;
};
interface AudioService {
  unlock(): Promise<boolean>; // 必须在可信手势处理器里直接调用
  session(slug: string): GameAudioSession;
  settings(): Readonly<AudioSettings>;
  updateSettings(patch: Partial<AudioSettings>): void; // 原位，不触发render/mount
  dispose(): Promise<void>; // app真正卸载时close；路由切换只dispose session
}
interface GameAudioSession {
  play(cue: Cue, detail?: { eventId?: string; strength?: number; variant?: number }): void;
  music(scene: string | null, intensity?: number): void;
  voice(id: string): { cancel(): void } | undefined; // manifest ID；locale由shell注入
  stop(): void; // 清已排程/活动声部，不销毁全局设置
  pause(): void; resume(): void; dispose(): void;
}
```

实现责任与迁移顺序：

1. `core/services.ts` 持有AudioService、设置与活动session；`GameServices.sound`映射到该session，`muted/setMuted/stop`保持兼容。先修mute后的render调用；更新按钮的icon、aria-pressed与label即可，不能销毁游戏。游戏不直接写全局设置DOM。
2. P0兼容阶段允许Ashfall仍拥有自己的context，普通Sound保持lazy且Ashfall不创建它；由同一设置/暂停/销毁入口调用，保留每帧mute同步。必须先在私有provider集中登记tone/noise/ambience的source句柄、未来调度与关联nodes，提供stop-all：暂停时停止并断开旧源、取消scheduler，继续时从当前scene重建音乐，不恢复已冻结的旧SFX。只调用现有suspend/resume不够。保证任一时刻只一套活动音频，上一游戏离开先释放；不急着抽出全部作曲代码。
3. P1再把Ashfall `createAudio()`改成接收受控provider host：SCORES、SFX和schedule留在Ashfall，master设置/上下文由shell拥有。所有oscillator、buffer source及环境LFO必须经session allocator按cue/声源数申请并登记owned handles；普通游戏不接触raw context。provider dispose只释放自己的nodes/timer，不能close全局context；不能绕过allocator直接创建声源。普通cue与Ashfall不得重复响应同一事件。这样才能计数/抢占/清理，而不只是把两套音频连到同一bus。
4. 为每款定义轻量profile，包含cue到patch映射、音域、有限variation与cooldown；新增语义只用于已经明确的事件。`reportComplete`绝不直接触发success/voice，终局必须由明确result事件产生。
5. 先做WebAudio音色包络/滤波/两音层叠。只有纸牌、木块、气泡等材质经等响对比仍明显不足，才添加本地短采样；BGM优先现有程序方案。不做实时生成音频请求、云端TTS调用或远程流媒体。

### 4.3 设置、解锁、混音与生命周期

- 设置存 `integ-games:v2:shell:audio`，首次迁移保留 `integ-games:v1:shell:muted`；不迁移/清除best或存档。新用户候选滑杆master=0.8、sfx=0.7、music=0.3、voice=0.8，musicEnabled=true（仅已有Ashfall profile会发声），voiceEnabled=false。这些是0–1控制值，不是响度验收值；由统一感知曲线映射并校准，返回用户保留其明确选择。
- UI先提供总静音+“声音设置 / Sound settings”；展开才显示音效/音乐/语音音量及语音开关。UI声随SFX滑杆。设置写失败保留本次有效并说明；跨标签读取storage变更只更新设置，不重开游戏。不自动取消静音以便播放“测试音”。
- 首页不创建/播放音频。开始按钮或游戏首个有效pointerdown/keydown中直接create/resume，**放在等待import、进入全屏或其他await之前**；异步加载结束后不再假定手势仍有效。拒绝/无API时静默可玩，显示“开启声音”用于再次手动解锁。恢复时依据context状态重试，不承诺后台自动播。
- 原理依据：[MDN Web Audio最佳实践](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)与[Autoplay指南](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)：创建/恢复应来自用户交互；不同浏览器策略不能靠自动调用resume统一绕过。以上为设计依据，实际iOS/Android行为仍必须真机验收。
- P1候选硬预算：SFX最多8个cue实例、合计≤24源；普通cue≤3源，Ashfall专有profile允许≤7源（现有shot/armorBreak/overdrive分别4/7/6源），按完整cue申请额度，不半途截断关键层。UI最多1实例/2源；voice最多1实例/1源；music含环境LFO、调度窗口与交叉淡化≤16源；总活动/已排程声源≤43。当前Ashfall音乐和长尾并发可能超限，P0先登记实测基线，P1通过缩短重复pad尾、降低环境层并发或复合patch达标；先等响听评再迁移，不能靠硬截声谎称无回归。抢占以低优先完整cue为单位短淡出后stop，申请不足的低优先cue直接丢弃。
- 同事件由适配器生成含runId的eventId去重，普通操作≥80ms间隔，move≥100ms；无eventId的旧调用仅按原kind限频，不假装能判断同一事件。密集碰撞聚合为一次奖励，终局声抢占低优先级而不排长队。
- 优先级：危险/玩家受伤 > 终局/语音 > 奖励 > 普通操作 > 环境。危险仍靠视觉成立。强提示触发music duck -6dB、20ms attack、250ms release；voice触发music -9dB、40ms attack、300ms release；多个duck取最强者，不叠加压到听不见，结束后按当前设置恢复。
- 普通操作目标40–120ms，奖励120–280ms，终局≤800ms；保留Ashfall已有必要较长的特殊声，但按profile列出并预算。音频直接随规则事件触发，不等视觉动画结束；需对齐的音符只小量提前调度，不能让游戏等拍点。
- master保留headroom与限幅；采样峰值≤-3dBFS，代表性混音true peak≤-1dBTP；完整30–60秒场景候选-20±2 LUFS，音乐单独-26至-22 LUFS、语音-19±2 LUFS作为起点。短提示用峰值/包络和等响听评，**不对几十毫秒cue机械套整首曲子的LUFS**。
- Pause/隐藏页：取消未来SFX/voice和timer调度、清held-input，记录可恢复音乐scene与拍位置；不保留伤害声排队。Resume只从显式继续动作启动音乐，不补播离开时的奖励/旁白。重开清队列与去重记录；换路由dispose全部session nodes/listeners/buffers引用；最后页面关闭close context。mute立即关闭输出并停止不必要调度；unmute从当前状态继续，不重播过去事件。
- 所有播放方法失败都不throw到game loop；采样没到用相同语义的合成短声，语音没到只留字幕；过期事件直接丢弃，禁止资源下载好后突然补响。

### 4.4 语言语音单独论证

**推荐：离线制作、人工审核的本地预录短音频，先做Ashfall一幕；不用Web Speech作为默认announcer。** 预录可由获授权真人或生成语音制作，但生成发生在构建前，提交经剪辑/试听的产物与字幕；不要为本规划调用生成服务，也不预设付费供应商。

| 场景 | 是否值得 | 推荐实现/限制 |
| --- | --- | --- |
| Ashfall幕开场与幕结束 | 值得小试：帮玩家记住目标与后果，已有双语故事可取材 | 首批仅第一幕开/结各一条，≤5秒/条；玩家主动开始后播，字幕即时出现，可跳过/重听，不锁按钮 |
| Ashfall最终胜利 | 可能加分：为长旅程收束 | 总量放行后加入一条，不在每关重复；保留原有音乐落点，旁白不压住结果信息 |
| Perfect Stack连Perfect、Block Drop大消除、少数波次胜利 | 可能加分但容易烦 | 共用最多4种短announcer语句；单条≤1秒、两次间隔≥20秒，同句每局最多一次；初始关闭 |
| 首次教学 | 只有读短文/认按键仍困难才加 | 用户点击“听说明 / Listen”才播放，一次一条；操作可先完成，字幕/图示始终是主信息 |
| 失败、普通移动、棋盘每步、动态分数 | 不值得 | 用短音效与可读状态；不做羞辱/催促/“再玩一局”语音 |

示例脚本：`The relay is awake. Follow the light. / 中继已苏醒，沿着光前进。`；`Perfect! / 完美！`；`A new best. / 新纪录。`。先审叙事与游戏事件是否匹配，再录音；中文不逐字照搬英文语速。语音语言跟随界面，不自动同时播两种。

Web Speech API优势是无需分发录音文件、适合可选朗读；劣势是音色/可用语言取决于设备，voice可能由远程服务提供（见[MDN getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)和[localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)）。因此不满足统一声线与必然自包含的默认体验。若未来做辅助朗读，只在存在匹配语言的localService voice时启用、标明设备语音、无则回退文本；不与屏幕阅读器争抢发声。

双语成本按脚本→译审→两种录制→响度/发音→两套设备听评计算，不能只算字数：第一幕2条×2语言=4录音；扩展上限为Ashfall 12条+共享announcer 4条，每语言16条、总计32录音。每语言总时长≤60秒。故事长文保持文字；不配完20关所有剧情，不用特定演员/公众人物仿声。manifest记录文本版本、locale、时长、字节数、来源授权与内容hash。

### 4.5 音频资产体积预算与验收

口径统一用十进制B/KB/MB；**生产所有编码版本、两种语言合计≤1,500,000 B**，不是“每种格式各1.5MB”。开发母带不进入public/dist。首批纯合成时音频文件预算实际可为0。

| 资产/运行项 | 硬上限 | 加载与失败策略 |
| --- | ---: | --- |
| 共享材质SFX（含全部fallback编码） | 480,000 B | 单个≤30,000 B、单游戏首次额外音频≤120,000 B；只取需要的profile |
| EN语音包 | 480,000 B | ≤16条/60秒，单条≤60,000 B；不开语音不取 |
| 中文语音包 | 480,000 B | 同上；只取选定语言，不预取另一语言 |
| manifest/字幕/音频元数据 | 16,000 B | 文本常可先到；音频失败不阻塞 |
| 预留 | 44,000 B | 用于容器开销与必要兼容版本，不能挤占后再称超预算例外 |
| 首页音频网络传输 | **0 B** | 不预载全21款语音/音乐 |
| 首幕语音新增下载 | ≤160,000 B | 语音显式开启、已进入Ashfall后再取 |
| 解码后PCM缓存 | ≤12 MiB | 活动游戏/当前语言LRU；48kHz单声道60秒float32约11.52MB，禁止两语言全量同时解码 |
| 音频实现代码 | 新增共享≤12,000 B gzip | 与文件预算另计；现有Ashfall chunk基线单列，不能用“零资产”掩盖合成CPU/代码 |

优先先验证单一编码覆盖目标Safari/Chrome（短语音可候选48–64kbps mono MP3）；若选择Opus/AAC组合，两个版本都算入总额，按实际编码产物调整总时长，不能引用理论比特率当验收文件大小。BGM不增加采样文件；若以后改外部配乐必须重开预算决策。

验收分三层：

1. 自动：manifest校验所有文件/语言/字幕/授权与字节；网络记录证明首页0音频、切语言不同时下载两包；拒绝加载后仍能玩；OfflineAudioContext验证cue包络、并发/抢占、取消、静音迁移。混音离线录制30–60秒计算峰值/响度，浏览器trace核对活动源/定时器上限。
2. 生命周期：21路由反复进出、连续重开20次、静音/后台/全屏/浏览器拒绝解锁，确认无过去事件补响、无重复context、无增长性nodes/buffers泄漏；暂停后输出静默、继续不叠两首曲。
3. 真听评：iPhone Safari、Android Chrome、桌面Chrome/Safari；手机外放+普通耳机；听普通操作、密集碰撞、伤害预告、终局、语音与音乐混播。至少5名目标玩家做等响旧/新片段盲选，4/5能分清关键cue且无重复刺耳投诉才扩展。小样本是方向证据，不宣称统计显著或长期留存提高。

## 5. 连贯性方案

### 5.1 Arcade 壳旅程

```text
目录（选玩法/最近玩过）
  → 准备（输入说明、可继续位置、声音状态）
  → 游玩（HUD、暂停、帮助；网络失效不打断）
  → 里程碑（局内继续）或结算（明确原因/纪录/保存）
  → 再来一局〔默认主操作〕 / 下一关〔战役〕 / 推荐一款
  → 换游戏时回收输入、音频、FX，带着同一语言/声音偏好进入
```

没有额外“选择房间→领奖大厅→总进度弹窗”的层级。推荐使用现有四个编辑邻居：结算只突出第一款，标出关系如“同样考验时机 / More timing challenges”；展开才看另外三款，不用AI推荐服务、不自动跳转。完整列表仍保留在舞台下方。

### 5.2 应共享与应保留的边界

| 共享交付物 | 职责 | 保持各游戏所有的部分 |
| --- | --- | --- |
| `GameChrome` / StageStatus | 准备、loading/error、暂停、结果、返回与焦点/fullscreen树 | 世界布局、Canvas/DOM渲染方式、物理与关卡 |
| `HudRow` / AccessibleStatus | 指标名/单位/值、目标、重大事件读出；布局与token | 分数规则、血条/计时语义、战斗内信息密度 |
| `ResultPanel` / NextGameCard | 最终结果、best delta、保存状态、重试/下一款 | Ashfall锻造/下一关、2048继续合成、自有结尾演出 |
| `AudioService` / SoundSettings | context、buses、音量、mute、解锁、预算、生命周期 | Ashfall作曲/场景强度、各游戏材质与音色profile |
| `Locale` / message catalog | locale设置、EN/zh词条、参数/单位、aria标签 | 原创命名、故事风格；英文找词题材不伪装中文题 |
| `MobileControls` / InputLifecycle | 复用现有库并补clear/lostcapture、能力检测、标注 | Ashfall多动作布局、各游戏原生swipe/aim手势 |
| `TransientFeedback` | 有界局部FX、reduce策略、pause/reset/dispose | 角色动作、弹道、物理模拟、boss telegraph设计 |

不合并成新通用游戏引擎。先在DOM 2048、Frame Block Drop、Kit Arena、专有Ashfall四种形态验证同一contract，再为其他17款接小适配器。移动控件通过已有onChange action接口逐步接入；不能把“迁移合成键盘事件”升级成全量重写输入。

新增生命周期事件草案：`ready`、`started`、`milestone({kind,label,value})`、`ended({outcome,finalScore,unit,reason,canContinue})`；每局有runId，ended幂等一次。旧reportScore仍负责现有best路径；旧reportComplete继续兼容，不能自动推导ended。壳result只显示已确认数据；未知best不显示“新纪录”，不知道保存成功不显示“已保存”。

### 5.3 跨游戏元层：先不加 streak / 每日挑战系统

本轮只做“最近玩过、明确本机最佳、真实可继续位置”和结算推荐，帮助回到游戏。可选P2实验为一个本机“已尝试 N/21”轻进度标记，只有有效游玩后计数、不计单纯打开路由，无勋章墙、兑换或账号任务。

- **不做登录连续天数streak**：容易把两分钟休息变成打卡负担，也重复家族其他产品可能承担的习惯/目标职责；本仓库未证明有此需求。尊重中断，不用断签损失促活。
- **不做统一每日挑战赛**：Sudoku/Word Trail当前题库固定，跨游戏seed、规则版本、时区、作弊与线上验证都未形成合同。若试验，从单个可确定性游戏的“今日精选题”开始，非竞争、免登录、不混原总榜。
- **不再加一个总分货币**：当前总榜是各game best相加，不同单位天然偏置。保留并说明“各游戏最高分之和 / Sum of personal bests”；不宣传为综合实力排名。归一化/赛季/反作弊需要单独产品决定和历史迁移。
- 实验不加追踪SDK。用自愿主持的短访谈/任务观察看：首次找游戏耗时、失败后能否说出原因、能否一次找到重试、是否自愿尝试下一款。长期留存若需要数据，必须另行明确最少数据与隐私合同；本轮不悄悄新增采集。

### 5.4 与 Integ.Life 身份及在线能力的关系

沿用 `games-api` 的Integ登录跳转与现有session，不另发Games密码或创建头像系统。账户只为总榜/现有评论提供可选身份；本地音量/语言/存档无需登录。登出不清本机进度；切换账户需明示“这是本机纪录”，不自动把旧游客/其他账户的所有best回灌到新账户。

本轮不做跨设备云存档，也不把Ashfall v3分数送入旧榜。若为结算显示在线保存状态，先将`submitScore`返回值改成可辨的未登录/成功/失败；离线仍保存本地，允许明确的手动重试，不未经设计加入后台永久队列。评论保留可选入口，但脚本须本地版本化/按需加载、服务不可用不影响舞台。

## 6. 优先级

### P0：先不伤玩家，再谈精美

| 具体交付物 | 可观察完成标准 |
| --- | --- |
| Hexa Fit首次可玩 | 新访客无需点Restart，首次Start后即有完整棋盘与3个可选拼块；普通输入可合法放置、无异常；刷新和重开也正确 |
| 原位声音设置；暂停/全屏/后台/更新的不中断合同 | 进行中的4种渲染栈切mute/音量不会mount第二次、分数/位置不变；暂停后输入无效、无音频；离开不遗留；更新提示不会刷新当前局 |
| token、对比度、48px控件、密集棋盘可达方案 | 全21款关键数字/指令计算≥7:1目标、所有文字至少AA；互动图形≥3:1；真CSS尺寸量测，320px时密集格仍有48px替代输入；Memory同色图形被修复 |
| 全状态EN/zh、准备/暂停/错误/结果合同及终局适配 | 全21款列状态矩阵；不可用状态明确N/A理由；两个语言可在不中断游戏下切换；milestone不误弹result；结果可立即重试 |
| 降动效与低刺激反馈 | reduced-motion下共享FX无整屏flash/相机位移；常规模式反馈局部有界，操作和结果不等动效 |
| 自包含与真实预算基线 | 移除生产追踪、无外部字体/CDN脚本；评论脚本自包含、API可选；总原始CSS<25,000 B，目标≤24,000 B；旧20款规格修订为21款并注明在线可选 |

### P1：让已经存在的反馈真正好用

| 具体交付物 | 可观察完成标准 |
| --- | --- |
| 共享AudioService及11→14种事件语义、4个普通profile+Ashfall provider，共5款 | 关键事件可盲听区分，mute迁移/gesture解锁/并发上限可测；Ashfall接同一bus所有权且配乐不回归 |
| 首页目录优先、紧凑HUD/结果/下一款 | 手机不被榜单推迟选游戏；分类可发现；同一测试任务中多数参与者能快速找到重试/下一款；不新增导航层 |
| 表2中21款各自第一改进点 | 每款一组同状态前后截图/短录屏与声音片段；无规则/存档/排行榜口径偷偷改变；个性辨识度保留 |
| 全量生命周期与设备回归 | catalog21路由/两个语言/两主题/降动效覆盖；iOS/Android物理设备检查；公开发布版本与worker证据单独核验 |

### P2：有证据才扩展

| 具体交付物 | 可观察完成标准 |
| --- | --- |
| Ashfall首幕双语预录语音试点 | 4个录音、字幕齐备、可跳过、无新增等待；等响试听多数偏好有语音且不掩盖警告；达标后才扩至≤32录音 |
| 少数游戏announcer/稀疏程序BGM试验 | 用户主动开启；频率限制、预算与退出策略均通过；不能只用“听见了”作为engagement证明 |
| 本机已尝试N/21或单款今日精选题 | 主持测试显示能帮助选下一款且无打卡压力；无额外账号/新货币/排行榜迁移；不通过则删除实验 |

### 最高回报的20%

这是投入排序，不是凭空估算精确ROI：**原位静音与生命周期 → 可读的数字/按钮/状态 → 轻、重、危险、结束四层音效 → 统一重试/下一款出口。** 先用2048、Block Drop、Neon Snake、Arena和Ashfall检验；前四项共享能力惠及21款，远高于制作21首BGM或全套新封面。

### Deferred（理由与解锁条件）

| 暂缓项 | 理由 | 重新考虑的条件 |
| --- | --- | --- |
| 21款全面语音、Ashfall逐句故事配音 | 双语维护/下载/重复疲劳成本高 | 首幕语音听评通过，且玩家主动请求更多叙事而非只想跳过 |
| 为每款制作录制BGM | 增加负担且可能盖过玩法线索 | 程序/无BGM对照显示明确收益，资产预算仍可保持 |
| 全站新插画/3D/视频封面 | 当前实机图小且真实，选择效率收益未知 | 玩家无法据图识别玩法，重拍构图仍不能解决 |
| Streak、通行证、跨游戏金币/任务 | 偏离轻量休息，容易制造义务与重复产品 | 明确目标用户与重复产品审查，玩家确需长期跨游戏目标 |
| 每日竞赛、归一化总榜与赛季 | 题库/规则版本/校验/分数迁移尚未设计 | 单款挑战验证重复游玩价值并有后端责任人 |
| 云存档/精确中场恢复 | 序列化、账户归属/冲突解决远超本轮 | 本机续玩稳定且出现真实跨设备需求 |
| 通用游戏引擎/大型动画音频库 | 四种渲染栈无需为统一外观全部重写 | 至少两个新增游戏共享具体痛点，适配层确已不足 |
| Ashfall新关卡/更多boss骨架 | 最近已完成20关，本轮应验证现有内容 | 真人反馈证明复用影响辨识度且愿意继续战役 |

## 7. 分批实施计划

建议5批，每批可独立上线、可独立回滚。估计按1名熟悉项目的前端开发+间歇设计/音频评审计，不含owner决策等待或大规模资产制作；是范围估算，不是工期承诺。**本次不实施这些批次。**

| 批次 | 范围与预估改动面 | 验收方式与退出条件 |
| --- | --- | --- |
| 1. 不中断的基础（P0，3–5工作日） | `main.ts`、services/types、两套helper与Ashfall适配/owned sources、Hexa Fit、少量回归测试；约10–18文件。修首局空盘、mute重建、fullscreen暂停层、暂停输入隔离、未来音频取消、SW安全更新；同步旧规格事实 | Hexa首次Start即可放置；单元检查状态/清理；桌面/手机浏览器四种栈各玩一段切mute、pause、后台、更新。断言没有重新mount/score丢失，Ashfall长声/未来调度暂停后不补响；前后截图只确认状态，不能充当听评 |
| 2. 清晰且双语的界面（P0，6–10日） | 两份CSS、vendor可用样式入口、共享HUD/状态/locale、21款最小状态适配；约25–35文件。token、对比度/48px、棋盘替代输入、DOM结果、首页层级、追踪移除/评论本地化、CSS压预算 | EN/zh×light/dark×320/390/900横屏/1280截图；计算所有核心色对，测DOM与Canvas映射CSS尺寸；键盘/读屏、200% zoom；密集棋盘真机选格。未达25KB时不宣称本批完成，不靠minify挤数字 |
| 3. 音频系统与5款试点（P1，4–6日） | core音频/session、profile/settings、2048/Block Drop/Snake/Arena/Ashfall；约10–16文件。新事件语义、总线/并发/duck、Ashfall共享context迁移；优先零新增采样 | 合成包络/抢占/取消测试；录制混音算峰值/响度；首次手势解锁、离线/失败/静音迁移；5人耳机/外放等响对照。任何不适先减密度再加材质 |
| 4. 全目录完成与连贯性收口（P1，5–8日） | 余16款profile及各表2第一点，现有推荐接结算，recent/保存语义；约18–26文件。保留所有现有规则/历史best/存档 | 21款普通输入至少完成一次有效动作与pause/restart/离开；可达终局/升级分别用行为测试，fixture强制结束只证明UI不证明难度；全部路由无错误。iPhone/Android横竖屏和密战试听，重新核预算 |
| 5. 语音小试（P2，2–4日+制作） | Ashfall首幕4录音+manifest/字幕、voice队列/开关、少量脚本；约4–8代码/文档文件及资产 | 预算、语言匹配、offline/404降级、skip、快速离开取消；5人试点记录“理解故事/愿意保留/烦扰”理由。不达标保留字幕与SFX、不上更多录音 |

共同工程门槛：在已安装锁定依赖的环境运行`npm run typecheck`、`npm test`、`npm run build`；相关Playwright与原有Lighthouse门槛（Performance≥85、Accessibility≥90）继续用，不把分数替代真机/听评。发布时再核线上build-version完整SHA、deep link、资产404、返回旧profile与worker更新；原始存档/游客偏好保留，不靠清localStorage完成验证。

**CSS预算实施口径**：全站实际分发的唯一原始规则总和（shared、实际使用的vendor、所有游戏注入样式、固定cssText），先于minify/gzip；同一规则复用一次计数，副本逐份计入，动态几何数值不属于额外样式表。候选分配：家族必要样式≤4KB、壳/状态≤7KB、共享游戏UI≤3KB、Ashfall≤8KB、其他专用规则≤1KB、余量1KB，总目标24KB。禁止把CSS藏进JS字符串规避统计；同时记录单路由运行时总量。vendor精简优先上游提供必要组件样式入口，不能盲删动态class、直接改node_modules或维持一份失去同步的拷贝。

图片预算：单张≤200,000 B，本轮沿用现有42张约255KB总量；重拍不得把小图升级为大幅插画。所有字体/图片/脚本/音频由自身发布资产提供；CSS审计/网络清单应覆盖family bar及按需评论，允许的联网API单独列为可选服务，断网不会影响本机游戏。

每批必须留真实证据：同状态截图、尺寸/对比度/资源字节清单、行为回归结果、试听设备/片段/意见与未验证项。若只用了fixture或模拟手机，文档必须明确，不能将其写成真人通关或真机验收。

## 8. 风险与不做清单

- 不用毛玻璃、大范围渐变、荧光描边堆叠来掩盖层级；读取/操作面板优先实底与清楚文字。发光可留在游戏世界，不能成为看懂状态的前提。
- 不做自动播放Hero、3D卡片、悬浮粒子背景、鼠标跟随光斑或无限动画；增加耗电与刺激，却没有缩短选游戏和重试路径。
- 不做奖励倒计时、无法跳过的胜利演出、强制整段听完旁白、拉长hit-stop。结果先可用，效果随后或并行。
- 不做全局同一种“胜利嗓音”覆盖所有游戏；不用反复叫好、失败嘲讽或“还差一点”催促。语音要稀有、有信息、可关。
- 不把Web Speech远程声音当本地资产，不加载CDN音频/字体，不增加第三方追踪；现有生产GA也不能因为“原来就有”绕过本次无追踪要求。
- 不重做分类、推荐、共享触控、2048动画或Ashfall20关；已有功能改的是质量和边界。旧评审已修bug不重新排优先级。
- 不把总榜当跨游戏公平竞技，不顺手重算旧分或上传Ashfall v3；不改变游戏规则/计分来配合UI。若确需规则修复，独立版本与回归。
- 不因为有ARIA或最低按钮尺寸就声称无障碍完成；Canvas读出、对比度、焦点、运动敏感、密集目标和听觉冗余均须验证。
- 不为手头一个壳建立通用设计平台/音频编辑器/成就系统；契约足够小、用旧适配器迁移。最大的工程风险是全量双语与CSS压缩波及vendor及21款，因此单列批次与逐路由回归，不藏在“换皮一天”里。
- 不以机器人通关、历史通过记录或5人偏好测试宣称留存提升。当前缺的是人类听感与物理手机证据；必须先把这两项补上。
- 不假定线上已在Pi托管；自包含/体积为本规划约束，部署机器迁移不在范围。版权、语音授权与缓存版本要随资产交付，不在上线后补记。

## 9. 需 owner 拍板的问题（4个，均给默认推荐）

这些问题不阻塞本规划交付；P0/P1可按推荐准备，实际需要付费录音或扩展范围时再作最终决定。

1. **语音采用哪种方式、做到哪里？** 推荐离线生成/预录、人工审听的本地短语音，仅Ashfall首幕EN/中文各2条起步，初始关闭、字幕默认有。声线一致、可控且不依赖运行时网络；不要全21款默认播报。真人 vs 生成可用同脚本等响样片决定。
2. **跨游戏成长做到多重？** 推荐先只有已有best/recent的真实表达与结算推荐；最多试验本机N/21。暂不streak/每日竞赛/金币。它帮助继续游玩，而不把休息变成打卡任务，也不复制Integ.Life的其他职责。
3. **视觉方向是否维持家族壳与各游戏个性？** 推荐维持；目录继承家族绿色明暗主题，舞台保留霓虹/纸牌/Ashfall金灰。主要预算放文字、尺寸、状态、声音，先不采购整站新插画。
4. **是否安排真人与设备验收资源？** 推荐至少5名目标玩家、各一台iPhone/Android以及耳机与外放，先体验第3批的5款；若暂不能提供，仍可上线通过客观门槛的基础修正，但语音/BGM扩展与“更engaging”的结论保持未验证。

本次交付状态：仅本文规划；未实现上述改进、未发布。构建验证因本地依赖缺失未通过；线上核验覆盖首页、2048开始前与Hexa Fit开始后的空盘状态，未进行全量实玩/听评。规划独立提交，不push；后续实施需按批次另行执行与验收。
