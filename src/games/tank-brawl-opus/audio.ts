/** Every sound is synthesised, so the game ships no audio files. */
import { createSound } from '../_shared/gamepad-kit';
import type { GameEvent } from './sim';

export type TankAudio = ReturnType<typeof createTankAudio>;

export function createTankAudio(isMuted: () => boolean) {
  const sound = createSound(isMuted);
  const { tone } = sound;
  const boom = (size: number) => {
    tone(150 * size, 0.42, 'sawtooth', 0.22, 0, 34);
    tone(90, 0.5, 'square', 0.14, 0.02, 30);
    tone(320, 0.14, 'triangle', 0.12, 0, 60);
  };
  const quack = () => { tone(520, 0.09, 'sawtooth', 0.12, 0, 300); tone(460, 0.1, 'sawtooth', 0.12, 0.11, 260); };
  const event = (item: GameEvent) => {
    switch (item.type) {
      case 'fire':
        if (item.kind === 'duck') quack();
        else if (item.kind === 'laser') tone(180, 0.5, 'sawtooth', 0.12, 0, 1700);
        else if (item.kind === 'bee') tone(240, 0.3, 'sawtooth', 0.08, 0, 300);
        else if (item.kind === 'mega') tone(170, 0.28, 'square', 0.2, 0, 44);
        else tone(300, 0.11, 'square', 0.13, 0, 82);
        return;
      case 'bounce': return tone(880, 0.06, 'triangle', 0.08, 0, 520);
      case 'bumper': tone(330, 0.16, 'sine', 0.2, 0, 1180); return tone(660, 0.12, 'square', 0.05);
      case 'crate': return tone(210, 0.13, 'square', 0.12, 0, 70);
      case 'clash': return tone(1400, 0.08, 'square', 0.08, 0, 500);
      case 'portal': return tone(300, 0.2, 'sine', 0.13, 0, 1500);
      case 'reflect': return tone(1200, 0.12, 'triangle', 0.14, 0, 1900);
      case 'dash': return tone(190, 0.2, 'sawtooth', 0.09, 0, 620);
      case 'crash': return tone(110, 0.12, 'square', 0.17, 0, 54);
      case 'revive': sound.chime(523); sound.chime(659, 0.14, 0.09); return sound.chime(784, 0.14, 0.18);
      case 'hit': return tone(200, 0.17, 'square', 0.2, 0, 62);
      case 'explode': return boom(item.radius / 80);
      case 'pickup': tone(660, 0.09, 'square', 0.1); tone(880, 0.09, 'square', 0.1, 0.08); return tone(1320, 0.14, 'square', 0.1, 0.16);
      case 'fall': return tone(900, 0.68, 'sine', 0.17, 0, 80);
      case 'ko': boom(1.4); return tone(1400, 0.6, 'square', 0.06, 0.08, 90);
      case 'honk': tone(392, 0.15, 'square', 0.13); return tone(494, 0.15, 'square', 0.1);
      case 'collapse': return tone(70, 0.5, 'sawtooth', 0.22, 0, 35);
      case 'empty': return tone(140, 0.05, 'triangle', 0.07);
    }
  };
  return {
    unlock: sound.unlock, destroy: sound.destroy, event,
    tick: () => tone(660, 0.1, 'square', 0.1),
    go: () => { tone(880, 0.3, 'square', 0.13); tone(1320, 0.3, 'square', 0.08); },
    roll: () => tone(1040, 0.03, 'square', 0.05),
    move: () => tone(520, 0.05, 'square', 0.07),
    pick: () => { tone(660, 0.07, 'square', 0.1); tone(990, 0.09, 'square', 0.1, 0.06); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((note, index) => { tone(note, 0.2, 'square', 0.1, index * 0.12); tone(note / 2, 0.2, 'triangle', 0.12, index * 0.12); }),
    sad: () => [392, 370, 349, 330].forEach((note, index) => tone(note, 0.32, 'sawtooth', 0.09, index * 0.27, index === 3 ? 220 : 0))
  };
}
