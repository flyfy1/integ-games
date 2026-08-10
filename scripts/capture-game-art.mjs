#!/usr/bin/env node
/**
 * Capture real, locally-rendered game art. The foreground in every exported
 * image is a screenshot of the mounted game canvas or 2048 board; the small
 * compositor only supplies a blurred crop behind portrait canvases so covers
 * remain useful 16:9 thumbnails.
 *
 * Run: node scripts/capture-game-art.mjs
 */
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public', 'game-art');
const slugs = [
  'merge-2048', 'block-drop', 'snake', 'mines', 'solitaire', 'sudoku', 'word-grid', 'memory', 'stack', 'flap',
  'breakout', 'invaders', 'runner', 'platformer', 'drive', 'fruit-merge', 'bubble', 'hex-puzzle', 'knife', 'arena'
];
const selectedSlugs = process.env.ONLY ? process.env.ONLY.split(',').filter((slug) => slugs.includes(slug)) : slugs;
if (!selectedSlugs.length) throw new Error('ONLY did not contain a known game slug');

const framing = {
  'merge-2048': { fit: 'contain', position: 'center center' },
  'block-drop': { position: 'center 22%' }, snake: { position: 'center 58%' }, mines: { position: 'center center' },
  solitaire: { position: 'center 42%' }, sudoku: { position: 'center 48%' }, 'word-grid': { position: 'center 44%' }, memory: { position: 'center 52%' },
  stack: { position: 'center 84%' }, flap: { position: 'center 52%' }, breakout: { position: 'center 36%' }, invaders: { position: 'center 20%' },
  runner: { position: 'center 84%', delay: 900 }, platformer: { position: 'center 70%' }, drive: { position: 'center 56%' },
  'fruit-merge': { fit: 'contain', position: 'center center', iconPosition: 'center 4%' }, bubble: { position: 'center 45%' }, 'hex-puzzle': { fit: 'contain', position: 'center center' }, knife: { position: 'center 43%' }, arena: { position: 'center 52%' }
};

async function clickCanvas(target, x, y, width = 360, height = 560) {
  const box = await target.boundingBox();
  if (!box) throw new Error('game canvas had no bounding box');
  await target.click({ position: { x: x / width * box.width, y: y / height * box.height } });
}

const safeInteraction = {
  'merge-2048': async (page) => { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(180); },
  'block-drop': async (page) => { await page.keyboard.press('ArrowUp'); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown'); },
  snake: async (page) => { await page.keyboard.press('ArrowDown'); },
  // The capture context fixes the seed below; cell (4,4) is known safe and often cascades.
  mines: async (_page, target) => { await clickCanvas(target, 299, 299, 600, 600); },
  solitaire: async (page, target) => { await target.click({ position: { x: 50, y: 55 } }); },
  sudoku: async (page, target) => { await target.click({ position: { x: 150, y: 150 } }); await page.keyboard.press('1'); },
  'word-grid': async (page, target) => { await target.hover({ position: { x: 90, y: 90 } }); },
  memory: async (page, target) => { await target.click({ position: { x: 55, y: 110 } }); },
  stack: async (page) => { await page.waitForTimeout(430); await page.keyboard.press('Space'); },
  flap: async (page) => { await page.keyboard.press('Space'); await page.waitForTimeout(90); },
  breakout: async (page, target) => { await target.hover({ position: { x: 210, y: 500 } }); },
  invaders: async (page) => { await page.keyboard.press('Space'); },
  runner: async (page) => { await page.keyboard.press('ArrowRight'); },
  platformer: async (page) => { await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); },
  drive: async (page) => { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(70); await page.keyboard.up('ArrowRight'); },
  'fruit-merge': async (page) => { await page.keyboard.press('Space'); await page.waitForTimeout(560); },
  bubble: async (page) => { await page.keyboard.press('Space'); },
  'hex-puzzle': async (page, target) => {
    // This cabinet intentionally builds its board in restart(); use the real shell control first.
    await page.locator('[data-action="restart"]').first().click();
    await clickCanvas(target, 38, 470);
    await clickCanvas(target, 180, 180);
  },
  knife: async (page) => { await page.keyboard.press('Space'); },
  arena: async (page) => { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(70); await page.keyboard.up('ArrowRight'); }
};

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG');
  for (let index = 2; index < buffer.length - 9;) {
    if (buffer[index] !== 0xff) { index++; continue; }
    const marker = buffer[index + 1];
    const length = buffer.readUInt16BE(index + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buffer.readUInt16BE(index + 7), height: buffer.readUInt16BE(index + 5) };
    index += 2 + length;
  }
  throw new Error('JPEG dimensions not found');
}

async function writeComposite(composer, source, destination, width, height, { icon = false, fit = 'cover', position = 'center center', mime = 'image/png' } = {}) {
  const data = `data:${mime};base64,${source.toString('base64')}`;
  await composer.setViewportSize({ width, height });
  await composer.setContent(`<!doctype html><style>
    *{box-sizing:border-box}body{margin:0;background:#090d18;overflow:hidden}
    #art{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#10192b}
    .back{position:absolute;inset:-16px;background-image:url('${data}');background-size:cover;background-position:center;filter:blur(${icon ? 8 : 15}px);opacity:.5;transform:scale(1.12)}
    .shade{position:absolute;inset:0;background:linear-gradient(135deg,#090d183d,#090d18a0)}
    .game{position:absolute;inset:${icon ? '4px' : '8px'};width:calc(100% - ${icon ? 8 : 16}px);height:calc(100% - ${icon ? 8 : 16}px);object-fit:${fit};object-position:${position};border-radius:14px;filter:drop-shadow(0 12px 20px #0008)}
  </style><div id="art"><div class="back"></div><div class="shade"></div><img class="game" src="${data}" alt=""></div>`);
  await composer.locator('#art').screenshot({ path: destination, type: 'jpeg', quality: icon ? 80 : 78 });
}

async function verify() {
  const names = await readdir(outputDir);
  const expected = slugs.flatMap((slug) => [`${slug}-cover.jpg`, `${slug}-icon.jpg`]);
  const missing = expected.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`missing artwork: ${missing.join(', ')}`);
  let total = 0;
  for (const slug of slugs) {
    for (const [suffix, width, height, limit] of [['cover', 640, 360, 90_000], ['icon', 96, 96, 30_000]]) {
      const filename = path.join(outputDir, `${slug}-${suffix}.jpg`);
      const [info, buffer] = await Promise.all([stat(filename), readFile(filename)]);
      const dimensions = jpegSize(buffer);
      if (!info.size || info.size > limit) throw new Error(`${path.basename(filename)} has unexpected size ${info.size}`);
      if (dimensions.width !== width || dimensions.height !== height) throw new Error(`${path.basename(filename)} is ${dimensions.width}×${dimensions.height}, expected ${width}×${height}`);
      total += info.size;
    }
  }
  if (total > 2_400_000) throw new Error(`artwork total ${total} is unexpectedly large`);
  console.log(`Verified ${expected.length} JPEGs (${Math.round(total / 1024)} KiB total).`);
}

const vite = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5189, strictPort: true } });
let browser;
try {
  await mkdir(outputDir, { recursive: true });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Fixed only in this ephemeral capture profile, making the mines reveal reproducible.
    try { localStorage.setItem('integ-games:v1:game:mines:seed', JSON.stringify(123456)); } catch { /* origin not ready */ }
  });
  const composer = await context.newPage();
  for (const slug of selectedSlugs) {
    await page.goto(`http://127.0.0.1:5189/play/${slug}`, { waitUntil: 'networkidle' });
    await page.locator('[data-stage]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[data-stage][aria-busy]'));
    const target = page.locator(slug === 'merge-2048' ? '.merge-game' : '.game-stage canvas').first();
    await target.waitFor({ state: 'visible' });
    await page.locator('.game-stage [tabindex]').first().focus();
    await safeInteraction[slug](page, target);
    const frame = framing[slug] ?? {};
    await page.waitForTimeout(110 + (frame.delay ?? 0));
    const source = await target.screenshot({ type: 'png' });
    const coverPath = path.join(outputDir, `${slug}-cover.jpg`);
    await writeComposite(composer, source, coverPath, 640, 360, frame);
    // Fruit Orbit's falling subject occupies a narrow part of a tall board; its
    // cover keeps both fruits legible, so it is the most recognisable icon crop.
    const iconSource = slug === 'fruit-merge' ? await readFile(coverPath) : source;
    await writeComposite(composer, iconSource, path.join(outputDir, `${slug}-icon.jpg`), 96, 96, { icon: true, position: slug === 'fruit-merge' ? 'center center' : frame.iconPosition ?? frame.position, mime: slug === 'fruit-merge' ? 'image/jpeg' : 'image/png' });
    console.log(`Captured ${slug}`);
  }
  await verify();
  await context.close();
} finally {
  await browser?.close();
  await vite.close();
}
