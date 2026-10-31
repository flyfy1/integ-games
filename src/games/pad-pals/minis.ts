/** One small game per skill. Update never touches the canvas, so tests can play every level with its bot. */
import { BUTTON_INDEX, type ButtonName, type Direction, type PadState } from '../_shared/gamepad-kit';
import type { SpokenKey } from './i18n';
import type { Difficulty, Level } from './levels';
import { drawChip, PLAY_HEIGHT, WIDTH, type GlyphSet, type Highlight } from './pad-view';

export type Frame = { any: PadState; pads: PadState[] };
export type BotMove = { press?: ButtonName; hold?: readonly ButtonName[]; x?: number; y?: number; rx?: number; ry?: number };
export type MiniEnv = {
  difficulty: Difficulty; random: () => number; players: number; glyphs: () => GlyphSet;
  good(x: number, y: number, note?: number): void; bad(x: number, y: number): void; tick(note?: number): void;
  /** A clear melodic note, loud enough to remember. */
  note(note: number): void;
  say(key: SpokenKey): void;
};
export type Mini = {
  goal: number; misses: number; done: boolean; winner?: number;
  update(dt: number, frame: Frame): void;
  draw(g: CanvasRenderingContext2D, time: number): void;
  highlights(): Highlight[];
  /** Replaces the level hint while the level is in a phase worth naming. */
  caption?(): SpokenKey | undefined;
  progress(): number;
  bot(): BotMove;
};

const just = (pad: PadState, button: ButtonName) => pad.justPressed[BUTTON_INDEX[button]];
const held = (pad: PadState, button: ButtonName) => pad.buttons[BUTTON_INDEX[button]];
const pick = <T>(env: MiniEnv, items: readonly T[]) => items[Math.floor(env.random() * items.length)];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const CENTER_X = WIDTH / 2;

function emoji(g: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  g.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';
  g.fillText(value, x, y);
}
function sky(g: CanvasRenderingContext2D, top: string, bottom: string, ground?: string, groundY = 400) {
  const gradient = g.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
  gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
  g.fillStyle = gradient; g.fillRect(0, 0, WIDTH, PLAY_HEIGHT);
  if (ground) { g.fillStyle = ground; g.fillRect(0, groundY, WIDTH, PLAY_HEIGHT - groundY); }
}

/* Buttons: the same round of "something appears, press its button" with three skins. */
const MOLE_SPOTS: Partial<Record<ButtonName, [number, number]>> = { north: [640, 110], west: [400, 245], east: [880, 245], south: [640, 380] };
const FROG_SPOTS: Partial<Record<ButtonName, [number, number]>> = { south: [430, 270], east: [850, 270] };
function pressMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], wait = level.wait[d], set = level.buttons;
  const limit = level.id === 'mole' && d === 2 ? 2 : 1;
  const spots = level.id === 'mole' ? MOLE_SPOTS : FROG_SPOTS;
  let cooldown = 0.25, resolved = 0, flowers = 0;
  let active: Array<{ button: ButtonName | null; age: number }> = [];
  const flowerSpot = (i: number): [number, number] => [150 + (i % 6) * 196, 400 - Math.floor(i / 6) * 110];
  const spotOf = (button: ButtonName | null): [number, number] => (button ? spots[button]! : flowerSpot(flowers));
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      active.forEach((item) => { item.age += dt; });
      const wrong = d > 0 && active.length > 0 && set?.some((b) => just(frame.any, b) && !active.some((a) => a.button === b));
      if (wrong) { mini.misses++; env.bad(CENTER_X, 245); }
      const expired = active.filter((item) => item.age > wait);
      expired.forEach((item) => { mini.misses++; resolved++; env.bad(...spotOf(item.button)); });
      active = active.filter((item) => item.age <= wait);
      for (const item of [...active]) {
        const hit = item.button ? just(frame.any, item.button) : frame.any.pressed;
        if (!hit) continue;
        env.good(...spotOf(item.button), resolved);
        resolved++; flowers += item.button ? 0 : 1;
        active = active.filter((other) => other !== item);
      }
      cooldown -= dt;
      if (cooldown <= 0 && active.length < limit && resolved + active.length < goal) {
        const free = (set ?? [null]).filter((b) => !active.some((a) => a.button === b));
        active.push({ button: pick(env, free), age: 0 }); cooldown = d === 2 ? 0.25 : 0.4; env.tick();
      }
      mini.done = resolved >= goal;
    },
    draw(g, time) {
      if (level.id === 'hello') {
        sky(g, '#bfe8ff', '#e8f8d8', '#8fd46a');
        for (let i = 0; i < flowers; i++) { const [x, y] = flowerSpot(i); emoji(g, ['🌷', '🌻', '🌸', '🌼'][i % 4], x, y, 100); }
        active.forEach(() => { const [x, y] = flowerSpot(flowers); emoji(g, '🌱', x, y + 10, 70 + 10 * Math.sin(time * 6)); });
        return;
      }
      const mole = level.id === 'mole';
      sky(g, mole ? '#a9e07f' : '#9fe0ee', mole ? '#7ec45a' : '#5fc3d8');
      (Object.entries(spots) as Array<[ButtonName, [number, number]]>).forEach(([button, [x, y]]) => {
        g.fillStyle = mole ? '#5b3a23' : '#3fae6a';
        g.beginPath(); g.ellipse(x, y + 40, mole ? 96 : 130, mole ? 30 : 50, 0, 0, Math.PI * 2); g.fill();
        const item = active.find((a) => a.button === button);
        if (item) {
          const rise = Math.min(1, item.age * 8);
          emoji(g, mole ? '🐹' : '🐸', x, y + 34 - 40 * rise, 110);
          drawChip(g, button, x + 92, y - 26, 28, env.glyphs());
          if (Number.isFinite(wait)) { g.fillStyle = '#ffffffcc'; g.fillRect(x - 60, y + 76, 120 * (1 - item.age / wait), 8); }
        }
      });
    },
    highlights: () => active.flatMap((item) => (item.button ? [item.button] : (['south', 'east', 'west', 'north'] as ButtonName[]))),
    progress: () => resolved,
    bot: () => { const target = active[0]; return target ? { press: target.button ?? 'south' } : {}; }
  };
  return mini;
}

/* Directions: step through a grid. Single presses teach that one press is one step. */
const MAZES = [
  ['.........', '.........', '.........', '.........', '.........'],
  ['.........', '..#...#..', '..#...#..', '..#...#..', '.........'],
  ['..#...#..', '.##.#.##.', '....#....', '.##.#.##.', '..#......']
];
const CELL = 86, MAZE_X = (WIDTH - 9 * CELL) / 2, MAZE_Y = 28;
const STEP: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function mazeMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], map = MAZES[d];
  const free = (x: number, y: number) => map[y]?.[x] === '.';
  let hero = { x: 0, y: 2 }, got = 0, carrot = { x: 8, y: 2 }, bump = 0;
  /** Distance from every reachable cell to `from`, so the carrot is never walled off and the bot can walk. */
  function distances(from: { x: number; y: number }) {
    const seen = new Map([[`${from.x},${from.y}`, 0]]), queue = [from];
    while (queue.length) {
      const at = queue.shift()!, here = seen.get(`${at.x},${at.y}`)!;
      Object.values(STEP).forEach(([dx, dy]) => { const next = { x: at.x + dx, y: at.y + dy }, id = `${next.x},${next.y}`; if (free(next.x, next.y) && !seen.has(id)) { seen.set(id, here + 1); queue.push(next); } });
    }
    return seen;
  }
  function placeCarrot() {
    const options = [...distances(hero)].filter(([, far]) => far >= 4).map(([id]) => id.split(',').map(Number));
    const [x, y] = pick(env, options);
    carrot = { x, y };
  }
  const cellCenter = (x: number, y: number): [number, number] => [MAZE_X + (x + 0.5) * CELL, MAZE_Y + (y + 0.5) * CELL];
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      bump = Math.max(0, bump - dt);
      const direction = frame.any.dirPressed;
      if (!direction) return;
      const [dx, dy] = STEP[direction], next = { x: hero.x + dx, y: hero.y + dy };
      if (!free(next.x, next.y)) { bump = 0.2; if (d === 2) mini.misses++; env.bad(...cellCenter(hero.x, hero.y)); return; }
      hero = next; env.tick(hero.x + hero.y);
      if (hero.x === carrot.x && hero.y === carrot.y) {
        got++; env.good(...cellCenter(hero.x, hero.y), got);
        if (got >= goal) mini.done = true; else placeCarrot();
      }
    },
    draw(g) {
      sky(g, '#c9efb0', '#a4dd86');
      for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) {
        g.fillStyle = free(x, y) ? ((x + y) % 2 ? '#e6d3a3' : '#efdfb6') : '#5f8f4a';
        g.beginPath(); g.roundRect(MAZE_X + x * CELL + 2, MAZE_Y + y * CELL + 2, CELL - 4, CELL - 4, 12); g.fill();
        if (!free(x, y)) emoji(g, '🌳', ...cellCenter(x, y), 56);
      }
      emoji(g, '🥕', ...cellCenter(carrot.x, carrot.y), 62);
      const [x, y] = cellCenter(hero.x, hero.y);
      emoji(g, '🐰', x + (bump ? Math.sin(bump * 60) * 6 : 0), y, 66);
    },
    highlights: () => ['dpad'],
    progress: () => got,
    bot() {
      const routes = distances(carrot), here = routes.get(`${hero.x},${hero.y}`) ?? 0;
      const step = (Object.entries(STEP) as Array<[Direction, [number, number]]>).find(([, [dx, dy]]) => routes.get(`${hero.x + dx},${hero.y + dy}`) === here - 1);
      if (!step) return {};
      return { x: step[1][0], y: step[1][1] };
    }
  };
  return mini;
}

/* Directions: analog flight. Speed follows the stick, so soft pushes visibly go slower. */
function roamMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], speed = 430;
  const heroes = [{ x: 400, y: 245, stun: 0, icon: '🐻' }, { x: 880, y: 245, stun: 0, icon: '🐰' }].slice(0, env.players);
  let got = 0;
  const makeStar = () => ({ x: 90 + env.random() * (WIDTH - 180), y: 60 + env.random() * (PLAY_HEIGHT - 130) });
  let stars = [makeStar(), makeStar()];
  const clouds = Array.from({ length: [0, 1, 3][d] }, (_, i) => ({ x: 200 + i * 400, y: 120 + i * 110, vx: 150 + i * 40, vy: 110 - i * 30 }));
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      heroes.forEach((hero, i) => {
        const pad = env.players > 1 ? frame.pads[i] : frame.any;
        hero.stun = Math.max(0, hero.stun - dt);
        if (!hero.stun) {
          hero.x = clamp(hero.x + pad.x * speed * dt, 40, WIDTH - 40);
          hero.y = clamp(hero.y + pad.y * speed * dt, 40, PLAY_HEIGHT - 40);
        }
        stars = stars.filter((star) => {
          if (Math.hypot(star.x - hero.x, star.y - hero.y) > 70) return true;
          got++; env.good(star.x, star.y, got);
          return false;
        });
        clouds.forEach((cloud) => {
          if (hero.stun || Math.hypot(cloud.x - hero.x, cloud.y - hero.y) > 66) return;
          hero.stun = 0.9; mini.misses++; env.bad(hero.x, hero.y);
        });
      });
      clouds.forEach((cloud) => {
        cloud.x += cloud.vx * dt; cloud.y += cloud.vy * dt;
        if (cloud.x < 60 || cloud.x > WIDTH - 60) cloud.vx *= -1;
        if (cloud.y < 50 || cloud.y > PLAY_HEIGHT - 50) cloud.vy *= -1;
      });
      if (got >= goal) mini.done = true;
      while (!mini.done && stars.length < Math.min(2, goal - got)) stars.push(makeStar());
    },
    draw(g, time) {
      sky(g, '#3a3f8f', '#7d6bd0');
      stars.forEach((star, i) => emoji(g, '⭐', star.x, star.y, 64 + 8 * Math.sin(time * 5 + i)));
      clouds.forEach((cloud) => emoji(g, '⛈️', cloud.x, cloud.y, 84));
      heroes.forEach((hero) => { g.globalAlpha = hero.stun ? 0.5 : 1; emoji(g, hero.icon, hero.x, hero.y, 80); g.globalAlpha = 1; });
    },
    highlights: () => ['stick'],
    progress: () => Math.min(got, goal),
    bot() {
      const hero = heroes[0], star = stars[0];
      if (!star) return {};
      const length = Math.hypot(star.x - hero.x, star.y - hero.y) || 1;
      return { x: (star.x - hero.x) / length, y: (star.y - hero.y) / length };
    }
  };
  return mini;
}

/* Directions: push the stick the way the balloon's arrow points, in four or (Tiger) eight directions. */
function flickMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], wait = level.wait[d], count = d === 2 ? 8 : 4;
  const ARROWS = ['➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '⬆️', '↗️'];
  let resolved = 0, age = 0, armed = true, slot = 0;
  const next = () => { slot = Math.floor(env.random() * count) * (8 / count); age = 0; env.tick(); };
  next();
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      age += dt;
      const { x, y } = frame.any, length = Math.hypot(x, y);
      if (length < 0.4) armed = true;
      if (armed && length > 0.7) {
        armed = false;
        const want = slot * Math.PI / 4, off = Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - want), Math.cos(Math.atan2(y, x) - want)));
        if (off < (d === 2 ? 0.38 : 0.6)) { env.good(CENTER_X, 220, resolved); resolved++; if (resolved < goal) next(); }
        else if (d > 0) { mini.misses++; env.bad(CENTER_X, 220); }
      } else if (age > wait) { mini.misses++; resolved++; env.bad(CENTER_X, 220); if (resolved < goal) next(); }
      mini.done = resolved >= goal;
    },
    draw(g, time) {
      sky(g, '#ffe3b8', '#ffc6d9');
      const y = 220 + 12 * Math.sin(time * 3);
      emoji(g, '🎈', CENTER_X, y, 270);
      g.fillStyle = '#ffffffdd'; g.beginPath(); g.arc(CENTER_X, y - 30, 66, 0, Math.PI * 2); g.fill();
      emoji(g, ARROWS[slot], CENTER_X, y - 30, 88);
    },
    highlights: () => ['stick'],
    progress: () => resolved,
    bot: () => (armed ? { x: Math.cos(slot * Math.PI / 4), y: Math.sin(slot * Math.PI / 4) } : { x: 0, y: 0 })
  };
  return mini;
}

/* Shoulders: fruit drops down the left or right side; Tiger adds rocks that must be left alone. */
function catchMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], wait = level.wait[d], band = 290;
  let resolved = 0, flash = 0, side: 0 | 1 = 0;
  const lanes = [300, 980];
  const button = (lane: number): ButtonName => (lane === 0 ? 'l1' : 'r1');
  let fruit: { lane: number; y: number; waited: number; rock: boolean } | null = null, cooldown = 0.3;
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      flash = Math.max(0, flash - dt); cooldown -= dt;
      if (!fruit && cooldown <= 0) { fruit = { lane: env.random() < 0.5 ? 0 : 1, y: -40, waited: 0, rock: d === 2 && env.random() < 0.25 }; env.tick(); }
      if (!fruit) return;
      if (fruit.y < band) fruit.y += 520 * dt; else fruit.waited += dt;
      if (fruit.y >= band && !Number.isFinite(wait)) fruit.y = band;
      if (fruit.y >= band && Number.isFinite(wait)) fruit.y += 60 * dt;
      const landed = just(frame.any, button(fruit.lane)) && fruit.y > band - 110;
      if (landed) {
        side = fruit.lane as 0 | 1; flash = 0.25;
        if (fruit.rock) { mini.misses++; env.bad(lanes[fruit.lane], 340); } else { env.good(lanes[fruit.lane], 340, resolved); resolved++; }
        fruit = null; cooldown = 0.35;
      } else if (fruit.waited > wait) {
        if (!fruit.rock) { mini.misses++; resolved++; env.bad(lanes[fruit.lane], 400); }
        fruit = null; cooldown = 0.35;
      }
      mini.done = resolved >= goal;
    },
    draw(g) {
      sky(g, '#c7f0ff', '#e6fbd6', '#8fd46a', 430);
      emoji(g, '🌳', lanes[0], 80, 190); emoji(g, '🌳', lanes[1], 80, 190);
      lanes.forEach((x, i) => emoji(g, '🧺', x, 400 - (flash && side === i ? 18 : 0), 120));
      emoji(g, '🦔', CENTER_X, 370, 110);
      if (fruit) { emoji(g, fruit.rock ? '🪨' : '🍎', lanes[fruit.lane], fruit.y, 92); if (!fruit.rock && fruit.y > 170) drawChip(g, button(fruit.lane), lanes[fruit.lane] + 90, fruit.y - 20, 28, env.glyphs()); }
    },
    highlights: () => (fruit && !fruit.rock ? [button(fruit.lane)] : []),
    progress: () => resolved,
    bot: () => (fruit && !fruit.rock && fruit.y > band - 60 ? { press: button(fruit.lane) } : {})
  };
  return mini;
}

/* Triggers: hold to fill, release inside the green. This is the first level where letting go matters. */
function holdMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], [low, high] = [[0.45, 0.88], [0.58, 0.8], [0.66, 0.77]][d];
  let air = 0, got = 0, wasHeld = false, want: ButtonName = 'r2', popped = 0;
  const choose = () => { want = pick(env, level.buttons!); };
  choose();
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      popped = Math.max(0, popped - dt);
      const down = d === 0 ? held(frame.any, 'l2') || held(frame.any, 'r2') : held(frame.any, want);
      if (down) {
        air += 0.5 * dt;
        if (air >= 1) { air = 0; popped = 0.5; mini.misses++; env.bad(CENTER_X, 220); }
      } else if (wasHeld && air >= low && air <= high) {
        got++; air = 0; env.good(CENTER_X, 220, got);
        if (got >= goal) mini.done = true; else choose();
      } else air = Math.max(0, air - 0.12 * dt);
      wasHeld = down && !popped;
    },
    draw(g) {
      sky(g, '#d9f1ff', '#fff2cf');
      emoji(g, popped ? '💥' : '🎈', CENTER_X, 245 - air * 40, popped ? 180 : 110 + air * 240);
      const x = 980, top = 50, height = 380;
      g.fillStyle = '#ffffff'; g.fillRect(x, top, 60, height);
      g.fillStyle = '#7ee08f'; g.fillRect(x, top + height * (1 - high), 60, height * (high - low));
      g.fillStyle = '#ff7a59'; g.fillRect(x + 16, top + height * (1 - air), 28, height * air);
      if (d > 0) drawChip(g, want, 840, 240, 46, env.glyphs(), false);
    },
    highlights: () => (d === 0 ? ['l2', 'r2'] : [want]),
    progress: () => got,
    bot: () => (air >= (low + high) / 2 ? {} : { hold: [want] })
  };
  return mini;
}

/* Memory: the parrot hops between four perches laid out like the buttons, then the child copies it.
   Each round adds one note to the same tune, so a child practises what they just heard. */
const PERCHES: Partial<Record<ButtonName, [number, number]>> = { north: [640, 92], west: [440, 232], east: [840, 232], south: [640, 372], l1: [170, 232], r1: [1110, 232] };
const PERCH_NOTES: Partial<Record<ButtonName, number>> = { south: 0, east: 2, west: 3, north: 5, l1: 7, r1: 8 };
function simonMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], wait = level.wait[d];
  const set: readonly ButtonName[] = d === 2 ? [...level.buttons!, 'l1', 'r1'] : level.buttons!;
  const stepTime = [0.95, 0.75, 0.55][d], lit = 0.68, hintAfter = [3, 7, Infinity][d];
  let round = 0, sequence: ButtonName[] = [], at = 0, clock = 0, idle = 0, spoke = false;
  let phase: 'watch' | 'turn' | 'cheer' | 'oops' = 'watch', glow: ButtonName | null = null, glowLeft = 0;
  const flash = (button: ButtonName, time = 0.32) => { glow = button; glowLeft = time; env.note(PERCH_NOTES[button] ?? 0); };
  const watch = () => { phase = 'watch'; clock = -0.7; at = 0; idle = 0; };
  const grow = () => { while (sequence.length < round + 1 + d) sequence.push(pick(env, set)); watch(); };
  grow();
  const miss = () => {
    mini.misses++; idle = 0; clock = 0; phase = 'oops'; glow = sequence[at]; glowLeft = 1.3;
    env.bad(CENTER_X, 232); env.say('simon.again');
  };
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      glowLeft = Math.max(0, glowLeft - dt);
      if (!glowLeft) glow = null;
      clock += dt;
      if (phase === 'cheer') {
        if (clock >= 1) { if (round >= goal) mini.done = true; else grow(); }
        return;
      }
      if (phase === 'oops') {
        if (clock < 1.3) return;
        // Chick stays on the same note with the answer lit; the others hear the tune again.
        if (d === 0) { phase = 'turn'; idle = hintAfter; } else watch();
        return;
      }
      if (phase === 'watch') {
        if (!spoke) { spoke = true; env.say('simon.watch'); }
        const now = Math.floor(clock / stepTime), before = Math.floor((clock - dt) / stepTime);
        if (now !== before && now >= 0 && now < sequence.length) flash(sequence[now], stepTime * lit);
        if (now >= sequence.length) { phase = 'turn'; idle = 0; env.say('simon.turn'); }
        return;
      }
      idle += dt;
      const pressed = set.find((button) => just(frame.any, button));
      if (idle > wait || (pressed && pressed !== sequence[at])) { miss(); return; }
      if (!pressed) return;
      flash(pressed); at++; idle = 0;
      if (at >= sequence.length) { round++; phase = 'cheer'; clock = 0; env.good(CENTER_X, 232, round + 4); }
    },
    draw(g, time) {
      sky(g, '#bdf1cf', '#79d6c3');
      (Object.entries(PERCHES) as Array<[ButtonName, [number, number]]>).filter(([button]) => set.includes(button)).forEach(([button, [x, y]]) => {
        const on = glow === button, size = on ? 76 : 62;
        if (on) { g.fillStyle = '#ffffff'; g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, size + 16, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        g.globalAlpha = on ? 1 : 0.72;
        drawChip(g, button, x, y, size, env.glyphs(), on);
        g.globalAlpha = 1;
      });
      const perch = glow ? PERCHES[glow] : undefined, happy = phase === 'cheer';
      const bird = perch ? [CENTER_X + (perch[0] - CENTER_X) * 0.42, 232 + (perch[1] - 232) * 0.42] : [CENTER_X, 232];
      emoji(g, '🦜', bird[0] + (phase === 'oops' ? Math.sin(time * 30) * 6 : 0), bird[1] + (happy ? -Math.abs(Math.sin(time * 9)) * 34 : 0), 118);
      if (happy) emoji(g, '🎵', bird[0] + 96, bird[1] - 60 + Math.sin(time * 6) * 8, 54);
      sequence.forEach((_, i) => {
        g.fillStyle = happy || (phase !== 'watch' && i < at) ? '#ffc93c' : '#ffffff';
        g.beginPath(); g.arc(120 + i * 40, 40, 14, 0, Math.PI * 2); g.fill();
      });
    },
    highlights() {
      if (glow && phase !== 'turn') return [glow];
      return phase === 'turn' && idle >= hintAfter ? [sequence[at]] : [];
    },
    caption: () => (phase === 'watch' ? 'simon.watch' : phase === 'turn' ? 'simon.turn' : phase === 'oops' ? 'simon.again' : undefined),
    progress: () => round,
    bot: () => (phase === 'turn' ? { press: sequence[at] } : {})
  };
  return mini;
}

/* Both hands: right thumb aims while a finger on top fires. */
function aimMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], radius = [78, 60, 48][d], drift = [0, 70, 130][d];
  let cannonX = CENTER_X, angle = -Math.PI / 2, got = 0, cooldown = 0;
  const cannonY = 440;
  let shots: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  const makeTarget = () => ({ x: 130 + env.random() * (WIDTH - 260), y: 60 + env.random() * 190, vx: drift * (env.random() < 0.5 ? -1 : 1) });
  let targets = [makeTarget(), makeTarget()];
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      const pad = frame.any;
      cooldown -= dt;
      // Pads without a right stick can still play the lower difficulties.
      const [ax, ay] = pad.rx || pad.ry ? [pad.rx, pad.ry] : d < 2 ? [pad.x, pad.y] : [0, 0];
      if (Math.hypot(ax, ay) > 0.35) angle = clamp(Math.atan2(Math.min(ay, -0.02), ax), -Math.PI + 0.1, -0.1);
      if (d === 2) cannonX = clamp(cannonX + pad.x * 420 * dt, 80, WIDTH - 80);
      if (just(pad, 'r1') && cooldown <= 0) {
        shots.push({ x: cannonX, y: cannonY, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900 }); cooldown = 0.28; env.tick(8);
      }
      targets.forEach((target) => { target.x += target.vx * dt; if (target.x < 90 || target.x > WIDTH - 90) target.vx *= -1; });
      shots = shots.filter((shot) => {
        shot.x += shot.vx * dt; shot.y += shot.vy * dt;
        const hit = targets.find((target) => Math.hypot(target.x - shot.x, target.y - shot.y) < radius);
        if (hit) { targets = targets.filter((target) => target !== hit); got++; env.good(hit.x, hit.y, got); return false; }
        const gone = shot.y < -30 || shot.x < -30 || shot.x > WIDTH + 30;
        if (gone && d > 0) { mini.misses++; env.bad(clamp(shot.x, 40, WIDTH - 40), 40); }
        return !gone;
      });
      if (got >= goal) mini.done = true;
      while (!mini.done && targets.length < Math.min(2, goal - got)) targets.push(makeTarget());
    },
    draw(g) {
      sky(g, '#7fd3ff', '#d7f4ff');
      targets.forEach((target) => emoji(g, '🎈', target.x, target.y, radius * 2.1));
      g.fillStyle = '#ffffff';
      for (let i = 1; i < 9; i++) { g.globalAlpha = 0.6 - i * 0.05; g.beginPath(); g.arc(cannonX + Math.cos(angle) * i * 44, cannonY + Math.sin(angle) * i * 44, 6, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      shots.forEach((shot) => emoji(g, '🫧', shot.x, shot.y, 44));
      g.save(); g.translate(cannonX, cannonY); g.rotate(angle); g.fillStyle = '#3a4772'; g.fillRect(0, -18, 72, 36); g.restore();
      emoji(g, '🐙', cannonX, cannonY + 8, 76);
    },
    highlights: () => (d === 2 ? ['rstick', 'r1', 'stick'] : ['rstick', 'r1']),
    progress: () => Math.min(got, goal),
    bot() {
      const target = targets[0];
      if (!target) return {};
      const dx = target.x + target.vx * 0.3 - cannonX, dy = target.y - cannonY, length = Math.hypot(dx, dy);
      const aligned = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle))) < 0.03;
      return { rx: dx / length, ry: dy / length, press: aligned ? 'r1' : undefined };
    }
  };
  return mini;
}

/* Both hands: run with the left hand, jump with the right. Falling just sends the kangaroo back a step. */
function hopMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], speed = [260, 320, 380][d], groundY = 400;
  const spacing = 520 - d * 40;
  const course = Array.from({ length: goal }, (_, i) => ({ x: 800 + i * spacing, kind: d > 0 && i % 2 === 1 ? 'gap' as const : 'rock' as const, width: [0, 130, 175][d] || 60 }));
  const finish = 800 + goal * spacing;
  let px = 200, py = groundY, vy = 0, passed = 0, hurt = 0;
  const obstacleWidth = (o: typeof course[number]) => (o.kind === 'gap' ? o.width : 56);
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      hurt = Math.max(0, hurt - dt);
      px = Math.max(60, px + frame.any.x * speed * dt);
      const grounded = py >= groundY && vy >= 0;
      if (grounded && just(frame.any, 'south')) { vy = -780; env.tick(9); }
      vy += 1800 * dt; py += vy * dt;
      const over = course.find((o) => px > o.x && px < o.x + obstacleWidth(o));
      if (over?.kind === 'gap' && py >= groundY) {
        mini.misses++; env.bad(px, groundY); px = over.x - 90; py = groundY; vy = 0; hurt = 0.5;
      } else if (over?.kind === 'rock' && py > groundY - 66) {
        mini.misses++; env.bad(px, py); px = over.x - 90; vy = 0; py = groundY; hurt = 0.5;
      }
      if (py >= groundY) { py = groundY; vy = 0; }
      const nowPassed = course.filter((o) => px > o.x + obstacleWidth(o)).length;
      if (nowPassed > passed) { passed = nowPassed; env.good(px, py - 40, passed); }
      if (px >= finish) mini.done = true;
    },
    draw(g) {
      sky(g, '#ffd9a0', '#ffefc9', '#c98a4b', groundY + 30);
      const camera = Math.max(0, px - 320);
      course.forEach((o) => {
        const x = o.x - camera;
        if (o.kind === 'gap') { g.fillStyle = '#ffe9c0'; g.fillRect(x, groundY + 30, o.width, PLAY_HEIGHT); } else emoji(g, '🪨', x + 28, groundY + 2, 76);
      });
      emoji(g, '🏁', finish - camera, groundY - 30, 100);
      g.globalAlpha = hurt ? 0.5 : 1;
      emoji(g, '🦘', px - camera, py - 16, 92);
      g.globalAlpha = 1;
    },
    highlights: () => ['stick', 'south'],
    progress: () => passed,
    bot() {
      const next = course.find((o) => o.x + obstacleWidth(o) > px);
      const close = next && next.x - px < speed * 0.26 && next.x - px > 0;
      return { x: 1, press: close ? 'south' : undefined };
    }
  };
  return mini;
}

/* Everything so far, in time: notes fall into the lane of their button. */
function rhythmMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], lanes: readonly ButtonName[] = d === 0 ? ['south', 'east'] : ['west', 'south', 'north', 'east'];
  const gap = [1.3, 0.8, 0.52][d], window = [0.5, 0.26, 0.16][d], lineY = 400, speed = 300;
  const laneX = (lane: number) => CENTER_X + (lane - (lanes.length - 1) / 2) * 170;
  let clock = -1.2, made = 0, resolved = 0, nextAt = 0;
  let notes: Array<{ lane: number; at: number }> = [];
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      clock += dt;
      const waiting = d === 0 && notes.some((note) => note.at <= clock);
      if (waiting) clock = Math.min(...notes.map((n) => n.at));
      while (made < goal && nextAt < clock + 2) { notes.push({ lane: Math.floor(env.random() * lanes.length), at: nextAt }); nextAt += gap; made++; }
      lanes.forEach((button, lane) => {
        if (!just(frame.any, button)) return;
        const near = notes.filter((n) => n.lane === lane && Math.abs(n.at - clock) <= window).sort((a, b) => a.at - b.at)[0];
        if (near) { notes = notes.filter((n) => n !== near); env.good(laneX(lane), lineY, resolved); resolved++; }
        else if (d > 0) { mini.misses++; env.bad(laneX(lane), lineY); }
      });
      const late = notes.filter((n) => clock - n.at > window);
      if (d > 0) late.forEach((note) => { mini.misses++; resolved++; env.bad(laneX(note.lane), lineY); });
      if (d > 0) notes = notes.filter((n) => !late.includes(n));
      mini.done = resolved >= goal;
    },
    draw(g) {
      sky(g, '#2b2467', '#5b3fa8');
      g.fillStyle = '#ffffff'; g.fillRect(0, lineY - 3, WIDTH, 6);
      lanes.forEach((button, lane) => {
        g.fillStyle = '#ffffff14'; g.fillRect(laneX(lane) - 66, 0, 132, PLAY_HEIGHT);
        drawChip(g, button, laneX(lane), lineY, 32, env.glyphs(), false);
      });
      notes.forEach((note) => { const y = lineY - (note.at - clock) * speed; if (y > -40) drawChip(g, lanes[note.lane], laneX(note.lane), y, 42, env.glyphs()); });
    },
    highlights: () => notes.filter((n) => Math.abs(n.at - clock) <= window).map((n) => lanes[n.lane]),
    progress: () => resolved,
    bot() {
      const note = notes.filter((n) => Math.abs(n.at - clock) <= window * 0.6).sort((a, b) => a.at - b.at)[0];
      return note ? { press: lanes[note.lane] } : {};
    }
  };
  return mini;
}

/* Final exam: a friendly robot asks for any skill the child has met so far. */
type Ask = { kind: 'button'; button: ButtonName } | { kind: 'hold'; button: ButtonName; time: number } | { kind: 'push'; right: boolean; direction: Direction };
function bossMini(level: Level, env: MiniEnv): Mini {
  const d = env.difficulty, goal = level.goal[d], wait = level.wait[d];
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  const ARROW: Record<Direction, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
  const asks: Array<() => Ask> = [
    () => ({ kind: 'button', button: pick(env, ['south', 'east', 'west', 'north'] as const) }),
    () => ({ kind: 'push', right: false, direction: pick(env, directions) })
  ];
  if (d > 0) asks.push(() => ({ kind: 'button', button: pick(env, ['l1', 'r1'] as const) }), () => ({ kind: 'hold', button: pick(env, ['l2', 'r2'] as const), time: 0.7 }));
  if (d > 1) asks.push(() => ({ kind: 'push', right: true, direction: pick(env, directions) }));
  let resolved = 0, age = 0, charge = 0, ask = pick(env, asks)(), cooldown = 0, shake = 0;
  const finish = (ok: boolean) => {
    if (ok) { env.good(CENTER_X, 190, resolved); shake = 0.3; } else { mini.misses++; env.bad(CENTER_X, 190); }
    resolved++; age = 0; charge = 0; cooldown = 0.35;
    if (resolved >= goal) mini.done = true; else { ask = pick(env, asks)(); env.tick(); }
  };
  const mini: Mini = {
    goal, misses: 0, done: false,
    update(dt, frame) {
      shake = Math.max(0, shake - dt);
      if (cooldown > 0) { cooldown -= dt; return; }
      age += dt;
      const pad = frame.any;
      if (ask.kind === 'button' && just(pad, ask.button)) return finish(true);
      if (ask.kind === 'hold') {
        charge = held(pad, ask.button) ? charge + dt : 0;
        if (charge >= ask.time) return finish(true);
      }
      if (ask.kind === 'push') {
        const [x, y] = ask.right ? [pad.rx, pad.ry] : [pad.x, pad.y], [wantX, wantY] = STEP[ask.direction];
        if (x * wantX + y * wantY > 0.7) return finish(true);
      }
      if (age > wait) finish(false);
    },
    draw(g) {
      sky(g, '#1f3358', '#3e6a9c');
      emoji(g, '🤖', CENTER_X - 240 + (shake ? Math.sin(shake * 70) * 10 : 0), 240, 240);
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(CENTER_X - 60, 110, 340, 260, 40); g.fill();
      if (ask.kind === 'push') { emoji(g, ARROW[ask.direction], CENTER_X + 110, 240, 120); emoji(g, '🕹️', CENTER_X + (ask.right ? 230 : -10), 330, 56); }
      else drawChip(g, ask.button, CENTER_X + 110, 240, 80, env.glyphs());
      if (ask.kind === 'hold') { g.fillStyle = '#ff9a4a'; g.fillRect(CENTER_X - 20, 340, 260 * Math.min(1, charge / ask.time), 16); emoji(g, '✋', CENTER_X + 240, 150, 56); }
      if (Number.isFinite(wait)) { g.fillStyle = '#ffffffaa'; g.fillRect(CENTER_X - 60, 390, 340 * Math.max(0, 1 - age / wait), 10); }
      for (let i = 0; i < goal; i++) { g.fillStyle = i < resolved ? '#ffffff33' : '#ff5d6c'; g.fillRect(CENTER_X - 400 + (i * 800) / goal, 24, 800 / goal - 6, 18); }
    },
    highlights: () => (ask.kind === 'push' ? [ask.right ? 'rstick' : 'stick'] : [ask.button]),
    progress: () => resolved,
    bot() {
      if (ask.kind === 'button') return { press: ask.button };
      if (ask.kind === 'hold') return { hold: [ask.button] };
      const [x, y] = STEP[ask.direction];
      return ask.right ? { rx: x, ry: y } : { x, y };
    }
  };
  return mini;
}

/* Party: first to press pulls the rope. With one player, the bunny plays at the chosen difficulty. */
function tugMini(level: Level, env: MiniEnv): Mini {
  const set = level.buttons!, reaction = level.wait[env.difficulty], two = env.players > 1, pull = 0.25;
  let rope = 0, age = 0, cooldown = 0.5, target: ButtonName = pick(env, set), wins = 0;
  const score = (who: number) => {
    rope += who === 0 ? -pull : pull;
    if (who === 0) { wins++; env.good(CENTER_X - 120, 250, wins); } else { mini.misses++; env.tick(1); }
    target = pick(env, set); age = 0; cooldown = 0.3;
    if (Math.abs(rope) >= 0.99) { mini.done = true; mini.winner = rope < 0 ? 0 : 1; }
  };
  const mini: Mini = {
    goal: 8, misses: 0, done: false,
    update(dt, frame) {
      if (cooldown > 0) { cooldown -= dt; return; }
      age += dt;
      const first = two ? frame.pads[0] : frame.any;
      if (just(first, target)) score(0);
      else if (two ? just(frame.pads[1], target) : age > reaction) score(1);
    },
    draw(g, time) {
      sky(g, '#c9efb0', '#ffe3a8', '#8fd46a', 340);
      const shift = rope * 260, sway = Math.sin(time * 6) * 3;
      g.fillStyle = '#ff5d6c'; g.fillRect(CENTER_X - 4, 200, 8, 200);
      g.strokeStyle = '#8a5a2b'; g.lineWidth = 16; g.beginPath(); g.moveTo(CENTER_X - 340 + shift, 310); g.lineTo(CENTER_X + 340 + shift, 310); g.stroke();
      g.fillStyle = '#ffd23f'; g.fillRect(CENTER_X - 12 + shift, 294, 24, 32);
      emoji(g, '🐻', CENTER_X - 380 + shift, 300 + sway, 130);
      emoji(g, '🐰', CENTER_X + 380 + shift, 300 - sway, 130);
      if (cooldown <= 0) drawChip(g, target, CENTER_X, 110, 72, env.glyphs());
    },
    highlights: () => (cooldown <= 0 ? [target] : []),
    progress: () => wins,
    bot: () => ({ press: target })
  };
  return mini;
}

const BUILDERS = { press: pressMini, maze: mazeMini, roam: roamMini, flick: flickMini, catch: catchMini, hold: holdMini, simon: simonMini, aim: aimMini, hop: hopMini, rhythm: rhythmMini, boss: bossMini, tug: tugMini };
export const createMini = (level: Level, env: MiniEnv): Mini => BUILDERS[level.kind](level, env);
