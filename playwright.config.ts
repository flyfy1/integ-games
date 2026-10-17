import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5187', trace: 'retain-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5187', url: 'http://127.0.0.1:5187', reuseExistingServer: !process.env.CI }
});
