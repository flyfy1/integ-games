import type { SimEvent } from '../types';

/**
 * Reads the fight from sim events and turns it into a music intensity (0..1) and a story mood. Calm between waves,
 * a lift when a wave is telegraphed, fuller as the counter fills up, everything for a big wave or a boss. In Endless
 * the base level also climbs with the wave number, so the arrangement layers up as the night goes on.
 */
export class Conductor {
  private live = 0;
  private waveActive = false;
  private big = false;
  private final = false;
  private wave = 0;
  private telegraphUntil = -1;
  private lastSpawn = -99;
  private bossAlive = false;
  private bossPhase = 0;
  private bossDefeated = false;
  private remembered = false;
  endless = false;

  reset(endless = false) {
    this.live = 0; this.waveActive = false; this.big = false; this.final = false; this.wave = 0;
    this.telegraphUntil = -1; this.lastSpawn = -99; this.bossAlive = false; this.bossPhase = 0; this.bossDefeated = false; this.remembered = false;
    this.endless = endless;
  }

  onEvent(event: SimEvent, now: number) {
    switch (event.type) {
      case 'telegraph': this.telegraphUntil = now + Math.max(1, event.seconds); break;
      case 'waveStart':
        this.waveActive = true; this.big = event.big; this.wave = event.wave;
        this.final = event.total > 0 && event.wave === event.total - 1;
        this.telegraphUntil = -1; this.lastSpawn = now;
        break;
      case 'enemySpawn':
        this.live++; this.lastSpawn = now;
        if (event.boss) { this.bossAlive = true; this.waveActive = true; }
        break;
      case 'enemyDown':
        this.live = Math.max(0, this.live - 1);
        if (event.boss) { this.bossAlive = false; this.bossDefeated = true; }
        break;
      case 'slice': this.live = Math.max(0, this.live - 1); break;
      case 'bossPhase': this.bossPhase = Math.max(this.bossPhase, event.phase); break;
      case 'calm': this.bossPhase = Math.max(this.bossPhase, 1); break;
      case 'remembered': this.remembered = true; this.bossAlive = false; break;
      case 'wavesDone': this.big = false; break;
      case 'win': case 'lose': this.waveActive = false; this.live = 0; this.bossAlive = false; break;
      default: break;
    }
  }

  intensity(now: number): number {
    if (this.waveActive && this.live === 0 && !this.bossAlive && now - this.lastSpawn > 4) { this.waveActive = false; this.big = false; }
    let value = this.waveActive ? 0.42 : 0.12;
    if (now < this.telegraphUntil) value = Math.max(value, 0.4);
    value += Math.min(0.3, this.live * 0.022);
    if (this.waveActive && this.big) value += 0.25;
    if (this.waveActive && this.final) value += 0.1;
    if (this.bossAlive) value = Math.max(value, 0.75 + 0.08 * this.bossPhase);
    if (this.endless) value += Math.min(0.45, this.wave * 0.035);
    return Math.max(0, Math.min(1, value));
  }

  /** Finale mood: 0 forgotten (minor), 1 remembering (Dorian, once the Bloom changes phase), 2 warm (major, remembered or beaten). */
  mood(): number {
    if (this.bossDefeated || this.remembered) return 2;
    return this.bossPhase >= 1 ? 1 : 0;
  }
}
