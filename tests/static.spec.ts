import { readFileSync } from 'node:fs';
import { test as baseTest, expect, type Page } from '@playwright/test';
import { gallery } from '../src/data/gallery';
import { profile } from '../src/data/profile';
import { pageMeta } from '../src/lib/seo';
import { openNavigation } from './helpers/navigation';

const builtHome = readFileSync('dist/index.html', 'utf8');
const base = builtHome.match(/data-base-path="([^"]+)"/)?.[1];
const site = builtHome.match(/data-site-url="([^"]+)"/)?.[1];
if (!base || !site) throw new Error('Production browser tests require a prerendered dist build.');
const origin = 'http://127.0.0.1:4180';
const localPath = (route: string) => `${base}${route.replace(/^\//, '')}`;
const canonical = (route: string) => new URL(route.replace(/^\//, ''), site).href;
const routes = ['/', '/publications/', '/news/', '/awards/', '/gallery/', ...gallery.map((album) => `/gallery/${album.slug}/`)];
const activeSection = (route: string) => ({ publications: 'Publications', news: 'News', awards: 'Awards', gallery: 'Gallery' }[route.split('/')[1]] ?? 'Home');

const test = baseTest.extend<{ expectedDocument404s: Set<string> }>({
  expectedDocument404s: [async ({ page, context }, use) => {
    const allowed = new Set<string>();
    const errors: string[] = [];
    // These tests validate built assets and hydration, not the live audit service.
    // Intercept every service endpoint before navigation so no visit or attempted
    // password from this suite reaches production or changes real rate limits.
    await context.route(/\/v1\//, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store',
      };
      const visit = path === '/v1/visits';
      const status = /^\/v1\/albums\/[a-z0-9-]+\/status$/.test(path);
      const unlock = /^\/v1\/albums\/[a-z0-9-]+\/unlock$/.test(path);
      if ((visit || status || unlock) && method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (visit && method === 'POST') {
        await route.fulfill({ json: { ok: true }, headers });
        return;
      }
      if (status && method === 'GET') {
        await route.fulfill({ json: { failureCount: 0, blockedUntil: 0 }, headers });
        return;
      }
      if (unlock && method === 'POST') {
        // A synthetic key can never decrypt the owner's album. It lets the locked
        // album test load the real built manifest and exercise safe failure without
        // recording a live password attempt or fetching a real authorization key.
        await route.fulfill({ json: { viewKey: Buffer.alloc(32).toString('base64') }, headers });
        return;
      }
      errors.push(`Unexpected audit service request in static tests: ${method} ${path}`);
      await route.fulfill({ json: {}, headers });
    });
    page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // Chrome logs the expected HTTP 404 document as a failed resource. Only
      // these intentional navigation failures are allowed; asset errors fail below.
      const source = message.location().url || page.url();
      if (allowed.has(source) && /Failed to load resource.*404/.test(message.text())) return;
      errors.push(`Console: ${message.text()} (${source})`);
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      if (response.status() === 404 && response.request().resourceType() === 'document' && allowed.has(response.url())) return;
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await use(allowed);
    expect(errors, 'Production pages must hydrate without console, runtime, or missing-asset errors').toEqual([]);
  }, { auto: true }],
});

async function expectHealthyPage(page: Page, route: string) {
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.nav-link[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('.nav-link[aria-current="page"]')).toHaveText(activeSection(route));
  await expect(page).toHaveTitle(pageMeta(route === '/' ? '/' : route.slice(0, -1), 'en').title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical(route));
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical(route));
}

for (const route of routes) {
  test(`Built ${route} loads directly, refreshes, and hydrates`, async ({ page }) => {
    const first = await page.goto(localPath(route));
    expect(first?.status()).toBe(200);
    await expectHealthyPage(page, route);
    const refreshed = await page.reload();
    expect(refreshed?.status()).toBe(200);
    await expectHealthyPage(page, route);
    // A working language control proves we tested the hydrated application.
    await openNavigation(page);
    await page.getByRole('button', { name: '中文', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectHealthyPage(page, route);
  });
}

for (const unknown of ['/gallery/missing/', '/totally-missing/']) {
  test(`Built 404 safely hydrates at ${unknown} and can return home`, async ({ page, expectedDocument404s }) => {
    const url = `${origin}${localPath(unknown)}`;
    expectedDocument404s.add(url);
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'A little off the path.' })).toBeVisible();
    await expect(page.locator('.nav-link[aria-current="page"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('link', { name: /Return home/ }).click();
    await expect(page).toHaveURL(`${origin}${base}`);
    await expectHealthyPage(page, '/');
    await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
  });
}

test('Direct index.html aliases retain their logical route and normalized canonical', async ({ page }) => {
  const response = await page.goto(localPath('/news/index.html'));
  expect(response?.status()).toBe(200);
  await expectHealthyPage(page, '/news/');
  await openNavigation(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Publications', exact: true }).click();
  await expectHealthyPage(page, '/publications/');
  await page.goBack();
  await expectHealthyPage(page, '/news/');
});

test('Client navigation preserves the configured canonical domain and project base', async ({ page }) => {
  await page.goto(localPath('/'));
  for (const route of ['/publications/', '/news/', '/awards/', '/gallery/', '/']) {
    await openNavigation(page);
    await page.getByRole('navigation').getByRole('link', { name: activeSection(route), exact: true }).click();
    await expect(page).toHaveURL(`${origin}${localPath(route)}`);
    await expectHealthyPage(page, route);
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).origin).toBe(new URL(site).origin);
  }
});

test('Built private albums resolve encrypted manifests under the configured base and remain locked', async ({ page }) => {
  for (const album of gallery.filter((item) => item.private)) {
    await page.goto(localPath(`/gallery/${album.slug}/`));
    await expect(page.locator('.gallery-locked')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Unlock album', exact: true }).click();
    const managed = album.private!.access === 'managed';
    const manifest = managed ? undefined : page.waitForResponse((response) => response.url().endsWith(`/${album.private!.manifest}`));
    await page.getByLabel('Password', { exact: true }).fill('incorrect-fixture-password');
    await page.getByRole('dialog').getByRole('button', { name: 'Unlock album', exact: true }).click();
    if (manifest) expect((await manifest).status()).toBe(200);
    await expect(page.getByRole('alert')).toContainText(managed ? 'could not be loaded' : 'password is incorrect');
    await expect(page.locator('.collection-photo__button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close unlock dialog' }).click();
  }
});

test('Built public covers and collections decrypt under the configured Pages base', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(localPath('/gallery/'));
  for (const album of gallery.filter((item) => item.encryptedCover)) {
    const card = page.locator('.album-card').filter({ has: page.getByRole('heading', { name: album.title.en, exact: true }) });
    await card.scrollIntoViewIfNeeded();
    const image = card.locator('.album-cover img');
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for (const album of gallery.filter((item) => item.encrypted)) {
    await page.goto(localPath(`/gallery/${album.slug}/`));
    await expect(page.locator('.collection-photo__button')).toHaveCount(album.encrypted!.photoCount);
    const first = page.locator('.collection-photo__button').first();
    await first.scrollIntoViewIfNeeded();
    await expect(first.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => first.locator('img').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const galleryResources = requests.filter((url) => url.includes('/gallery-encrypted/'));
  expect(galleryResources.length).toBeGreaterThan(3);
  expect(galleryResources.every((url) => url.startsWith(`${origin}${base}gallery-encrypted/`))).toBe(true);
});

test('Built visitor map uses an isolated static frame under the configured base', async ({ page, context }) => {
  await context.route('https://mapmyvisitors.com/map.js?**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `const widget = document.createElement('a');
      widget.id = 'mapmyvisitors-widget';
      widget.style.width = '600px';
      widget.href = 'https://mapmyvisitors.com/web/test-fixture-only';
      const counter = document.createElement('div');
      counter.className = 'mapmyvisitors-visitors';
      counter.textContent = '12 Test pageviews';
      const map = document.createElement('div');
      map.className = 'mapmyvisitors-map';
      map.style.width = '600px'; map.style.height = '300px';
      map.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#eaf2f7"/></svg>') + '")';
      widget.append(counter, map);
      document.getElementById('mapmyvisitors').parentElement.append(widget);`,
  }));
  await page.goto(localPath('/'));
  await page.locator('.visitor-section').scrollIntoViewIfNeeded();
  const frame = page.locator('iframe.visitor-widget');
  await expect(frame).toHaveAttribute('src', new RegExp(`^${base}visitor-map\\.html\\?`));
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  await expect(page.locator('.visitor-map-frame')).toHaveAttribute('data-status', 'ready');
  await expect(page.frameLocator('iframe.visitor-widget').locator('.mapmyvisitors-map')).toBeVisible();
  await expect(page.frameLocator('iframe.visitor-widget').locator('.mapmyvisitors-visitors')).toHaveText('12 Test pageviews');
});

test.describe('Static content with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  for (const route of routes) {
    test(`Built ${route} remains readable without JavaScript`, async ({ page }) => {
      const response = await page.goto(localPath(route));
      expect(response?.status()).toBe(200);
      await expectHealthyPage(page, route);
      if (route === '/') {
        await expect(page.locator('main h1')).toContainText(profile.name.en);
        await expect(page.locator('.hero-role')).toContainText(profile.role.en);
        await expect(page.locator('.hero-institution')).toContainText(profile.institution.en);
      }
    });
  }
});
