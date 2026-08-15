import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://games.integ.life';
const SOCIAL_META_PATTERN = /<!-- social-meta:start -->[\s\S]*?<!-- social-meta:end -->/;
const catalogRows = JSON.parse(readFileSync(new URL('../src/core/catalog-data.json', import.meta.url), 'utf8'));

const escapeAttribute = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function socialMetadata({ slug, title, description }) {
  const pageTitle = `${title} · Integ Games`;
  const url = `${SITE_ORIGIN}/play/${slug}/`;
  const image = `${SITE_ORIGIN}/game-art/${slug}-cover.jpg`;
  return `<!-- social-meta:start -->
    <meta name="description" content="${escapeAttribute(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Integ Games" />
    <meta property="og:title" content="${escapeAttribute(pageTitle)}" />
    <meta property="og:description" content="${escapeAttribute(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="640" />
    <meta property="og:image:height" content="360" />
    <meta property="og:image:alt" content="${escapeAttribute(`${title} gameplay screenshot`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttribute(pageTitle)}" />
    <meta name="twitter:description" content="${escapeAttribute(description)}" />
    <meta name="twitter:image" content="${image}" />
    <!-- social-meta:end -->`;
}

export function generateSharePages(outputDirectory) {
  const output = resolve(outputDirectory);
  const shell = readFileSync(join(output, 'index.html'), 'utf8');
  if (!SOCIAL_META_PATTERN.test(shell)) throw new Error('Built index.html is missing the social metadata markers');
  for (const row of catalogRows) {
    const [slug, title, , description] = row;
    const page = shell
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(`${title} · Integ Games`)}</title>`)
      .replace(SOCIAL_META_PATTERN, socialMetadata({ slug, title, description }));
    const directory = join(output, 'play', slug);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'index.html'), page);
  }
  return catalogRows.length;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outputDirectory = process.argv[2] ?? 'dist';
  const count = generateSharePages(outputDirectory);
  console.log(`Generated ${count} social preview pages in ${resolve(outputDirectory)}`);
}
