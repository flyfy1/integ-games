import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const game = (slug: string) => readFileSync(resolve(process.cwd(), 'src', 'games', slug, 'index.ts'), 'utf8');

describe('catalog 01–10 gameplay audio chains', () => {
  it('assigns success and failure cues to actual terminal branches', () => {
    expect(game('merge-2048')).toMatch(/lost = true; services\.sound\.play\('fail'\)/);
    expect(game('block-drop')).toMatch(/stopped = true; services\.sound\.play\('fail'\)/);
    expect(game('snake')).toMatch(/dead = true; services\.sound\.play\('fail'\)/);
    expect(game('mines')).toMatch(/active = false;[\s\S]*sound\.play\('fail'\)/);
    expect(game('solitaire')).toMatch(/foundations\.every[\s\S]*sound\.play\('success'\)/);
    expect(game('sudoku')).toMatch(/values\.every[\s\S]*sound\.play\('success'\)/);
    expect(game('word-grid')).toMatch(/found\.length === WORDS\.length[\s\S]*sound\.play\('success'\)/);
    expect(game('memory')).toMatch(/matched\.size === cards\.length[\s\S]*sound\.play\('success'\)/);
    expect(game('stack')).toMatch(/landed\.length >= 15[\s\S]*sound\.play\('success'\)/);
    expect(game('flap')).toMatch(/ended = true;[\s\S]*sound\.play\('fail'\)/);
  });

  it('uses action and reward cues without putting movement sounds in per-frame loops', () => {
    expect(game('merge-2048')).toContain("result.gained) services.sound.play('merge')");
    expect(game('block-drop')).toMatch(/const drop[\s\S]*sound\.play\('tap'\)[\s\S]*move\(0, 1, false\)/);
    expect(game('block-drop')).toMatch(/const loop[\s\S]*move\(0, 1, false\)/);
    expect(game('snake')).toMatch(/const change[\s\S]*sound\.play\('move'\)/);
    expect(game('snake')).toMatch(/head\[0\] === food\[0\][\s\S]*sound\.play\('collect'\)/);
    expect(game('mines')).toContain("services.sound.play('tap')");
    expect(game('solitaire')).toContain("services.sound.play('upgrade')");
    expect(game('sudoku')).toContain("services.sound.play('hit')");
    expect(game('word-grid')).toMatch(/if \(!last\) services\.sound\.play\('tap'\)/);
    expect(game('memory')).toContain("services.sound.play('collect')");
    expect(game('stack')).toMatch(/perfect \? 'upgrade' : 'tap'/);
    expect(game('flap')).toContain("services.sound.play('jump')");
    expect(game('flap')).toContain("services.sound.play('clear')");
  });
});

describe('catalog 11–20 gameplay audio chains', () => {
  it('assigns operation, reward, progression, and terminal cues to every cabinet', () => {
    const required: Record<string, readonly string[]> = {
      breakout: ['hit', 'clear', 'upgrade', 'fail'], invaders: ['shoot', 'hit', 'clear', 'fail'], runner: ['jump', 'move', 'upgrade', 'fail'], platformer: ['jump', 'hit', 'clear', 'fail'], drive: ['move', 'upgrade', 'fail'],
      'fruit-merge': ['move', 'collect', 'upgrade', 'fail'], bubble: ['shoot', 'hit', 'clear', 'upgrade', 'fail'], 'hex-puzzle': ['move', 'clear', 'upgrade', 'fail'], knife: ['shoot', 'hit', 'clear', 'fail'], arena: ['hit', 'collect', 'upgrade', 'fail']
    };
    Object.entries(required).forEach(([slug, cues]) => cues.forEach(cue => expect(game(slug)).toContain(`sound.play('${cue}')`)));
  });

  it('guards automatic and held interactions from frame-level audio spam', () => {
    expect(game('arena')).toContain('attackCueCooldown');
    expect(game('arena')).toContain('hurtCueCooldown');
    expect(game('runner')).toMatch(/const duckAction[\s\S]*if \(!duck\) services\.sound\.play\('move'\)/);
    expect(game('invaders')).not.toMatch(/enemyShots\.push\([^)]*\); services\.sound\.play\('shoot'\)/);
  });
});
