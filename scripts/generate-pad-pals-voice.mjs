#!/usr/bin/env node
/**
 * Records every spoken Pad Pals line into public/pad-pals-voice with neural voices, so players hear the same warm
 * voice in any browser and no API key reaches the page. Only rerun it when a line in i18n.ts changes.
 *
 * Run: uvx edge-tts --version && node scripts/generate-pad-pals-voice.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { SPOKEN, t } from '../src/games/pad-pals/i18n.ts';

const VOICES = { zh: ['zh-CN-XiaoxiaoNeural', '-6%'], en: ['en-US-AnaNeural', '-4%'] };
const only = process.env.ONLY?.split(',');
for (const [lang, [voice, rate]] of Object.entries(VOICES)) {
  mkdirSync(`public/pad-pals-voice/${lang}`, { recursive: true });
  for (const key of SPOKEN) {
    if (only && !only.includes(key)) continue;
    const file = `public/pad-pals-voice/${lang}/${key}.mp3`;
    execFileSync('uvx', ['edge-tts', '--voice', voice, `--rate=${rate}`, '--text', t(lang, key).replace(/…$/, '。'), '--write-media', file], { stdio: 'pipe' });
    if (statSync(file).size < 1000) throw new Error(`Suspiciously small recording: ${file}`);
    console.log(file);
  }
}
