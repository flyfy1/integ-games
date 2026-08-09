import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('static deployment assets', () => {
  it('uses the production custom domain and a client-side deep-link fallback', () => {
    expect(read('public/CNAME').trim()).toBe('games.integ.life');
    const fallback = read('404.html');
    expect(fallback).toContain('<script type="module">');
    expect(fallback).toContain("sessionStorage.setItem('integ-games:redirect'");
    expect(fallback).toContain('location.replace(import.meta.env.BASE_URL)');
    expect(read('vite.config.ts')).toContain("fallback: fileURLToPath(new URL('./404.html', import.meta.url))");
  });

  it('runs all verification gates and deploys Pages from the built arcade', () => {
    const workflow = read('.github/workflows/pages.yml');
    for (const command of ['npm ci', 'npm run typecheck', 'npm test', 'npm run test:e2e', 'npm run build']) expect(workflow).toContain(command);
    expect(workflow).toContain('actions/upload-pages-artifact@v3');
    expect(workflow).toContain('actions/deploy-pages@v4');
    expect(workflow).toContain('VITE_BASE: ${{ vars.PAGES_BASE_PATH || \'/\' }}');
  });
});
