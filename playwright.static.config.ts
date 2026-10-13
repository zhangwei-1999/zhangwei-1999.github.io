import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const home = readFileSync('dist/index.html', 'utf8');
const base = home.match(/data-base-path="([^"]+)"/)?.[1];
if (!base) throw new Error('Run npm run build before the production browser tests.');
const systemChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/static.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 40_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/static', open: 'never' }]],
  outputDir: 'test-results/static',
  use: {
    baseURL: 'http://127.0.0.1:4180',
    viewport: { width: 1440, height: 1000 },
    browserName: 'chromium',
    headless: true,
    launchOptions: existsSync(systemChrome) ? { executablePath: systemChrome } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-static.mjs',
    url: `http://127.0.0.1:4180${base}`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
