import { createCipheriv, randomBytes } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";
import { openNavigation } from "./helpers/navigation";

// Synthetic fixtures only. No owner keys, photographs, dashboard source,
// credentials, or private files are read by this suite.
const apiOrigin = "http://127.0.0.1:8787";
const albumPhrase = "Synthetic managed gallery phrase";
const adminPhrase = "Synthetic dashboard phrase";
const resetPhrase = "Synthetic independent reset phrase";

function encrypt(value: string, key: Buffer, additionalData: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(additionalData));
  return { iv, ciphertext: Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]) };
}

async function fixturePage(page: Page) {
  const key = randomBytes(32);
  const encrypted = encrypt("[]", key, "private-gallery:v1:life:manifest");
  const manifest = { version: 3, access: "managed", slug: "life", photoCount: 0, iv: encrypted.iv.toString("base64"), ciphertext: encrypted.ciphertext.toString("base64") };
  const manifestRequests: string[] = [];
  await page.route("**/src/data/galleryService.ts*", (route) => route.fulfill({ contentType: "text/javascript", body: `export const galleryService = ${JSON.stringify({ apiUrl: apiOrigin, dashboardAsset: "_data/panel.enc", cooldownMinutes: [1, 5, 10, 20, 30, 60], unrestrictedFailures: 5 })};` }));
  await page.route("**/src/data/gallery.ts*", (route) => route.fulfill({ contentType: "text/javascript", body: `export const gallery = ${JSON.stringify([{
    slug: "life", title: { en: "Life", zh: "生活" }, description: { en: "Synthetic managed collection.", zh: "测试相册。" }, photos: [],
    private: { access: "managed", manifest: "gallery-encrypted/life/manifest.json", photoCount: 0, hint: { en: "A synthetic shared phrase.", zh: "测试共享口令。" } },
  }])};` }));
  await page.route("**/gallery-encrypted/**", (route) => {
    manifestRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) });
  });
  return { key: key.toString("base64"), manifestRequests };
}

async function respond(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", headers: {
    "Access-Control-Allow-Origin": "http://127.0.0.1:4173", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store",
  }, body: JSON.stringify(value) });
}

function lifeLink(page: Page) {
  return page.getByRole("link").filter({ has: page.getByRole("heading", { name: "Life", exact: true }) });
}

async function noStoredSecrets(page: Page, values: string[]) {
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const value of values) expect(stored).not.toContain(value);
}

test("managed unlock uses a server key, relocks, and honors a persisted sixth-failure cooldown", async ({ page }) => {
  const fixture = await fixturePage(page);
  let failures = 0;
  let blockedUntil = 0;
  let unlockRequests = 0;
  await page.route(`${apiOrigin}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") return respond(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status")) return respond(route, { failureCount: failures, blockedUntil });
    if (path.endsWith("/unlock")) {
      unlockRequests++;
      const body = route.request().postDataJSON() as { password: string };
      if (body.password === albumPhrase) return respond(route, { viewKey: fixture.key, blockedUntil: 0 });
      failures++;
      if (failures === 6) blockedUntil = Date.now() + 60_000;
      return respond(route, { error: "incorrect_phrase", failureCount: failures, blockedUntil }, failures < 6 ? 401 : 429);
    }
    return respond(route, { ok: true });
  });
  await page.goto("/gallery/");
  await lifeLink(page).click();
  let dialog = page.getByRole("dialog", { name: "Unlock Life" });
  await expect(dialog.getByRole("button", { name: "Unlock album", exact: true })).toBeEnabled();
  await dialog.getByLabel("Password", { exact: true }).fill(albumPhrase);
  await dialog.getByRole("button", { name: "Unlock album", exact: true }).click();
  await expect(page).toHaveURL(/\/gallery\/life\/$/);
  await expect(page.getByRole("button", { name: "Lock album", exact: true })).toBeVisible();
  expect(fixture.manifestRequests).toHaveLength(1);
  await page.getByRole("button", { name: "Lock album", exact: true }).click();
  await page.getByRole("button", { name: "Unlock album", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Unlock Life" });
  for (let i = 0; i < 6; i++) {
    await expect(dialog.getByRole("button", { name: "Unlock album", exact: true })).toBeEnabled();
    await dialog.getByLabel("Password", { exact: true }).fill(`Synthetic wrong phrase ${i + 1}`);
    await dialog.getByRole("button", { name: "Unlock album", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByLabel("Password", { exact: true })).toHaveValue("");
  }
  await expect(dialog.locator(".gallery-cooldown")).toContainText("Please wait");
  await expect(dialog.getByRole("button", { name: "Unlock album", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Unlock album", exact: true }).click();
  await expect(dialog.locator(".gallery-cooldown")).toBeVisible();
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveAttribute("readonly", "");
  await dialog.locator("form").evaluate((form: HTMLFormElement) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(unlockRequests).toBe(7);
  expect(fixture.manifestRequests).toHaveLength(1);
  await noStoredSecrets(page, [albumPhrase, fixture.key]);
});

test("managed service outage never falls back to browser password decryption or downloads the private manifest", async ({ page }) => {
  const fixture = await fixturePage(page);
  let attempts = 0;
  await page.route(`${apiOrigin}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") return respond(route, {});
    if (route.request().url().endsWith("/unlock")) attempts++;
    return respond(route, { error: "service_unavailable" }, 503);
  });
  await page.goto("/gallery/");
  await lifeLink(page).click();
  const dialog = page.getByRole("dialog", { name: "Unlock Life" });
  await expect(dialog.getByRole("alert")).toContainText("could not be loaded");
  await dialog.getByLabel("Password", { exact: true }).fill(albumPhrase);
  await dialog.getByRole("button", { name: "Unlock album", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not be loaded");
  expect(attempts).toBe(1);
  expect(fixture.manifestRequests).toEqual([]);
  await expect(page).toHaveURL(/\/gallery\/$/);
  await noStoredSecrets(page, [albumPhrase]);
});

const panelHtml = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>Synthetic encrypted panel</title>
<body><h1>合成管理面板</h1><output id="status" role="status">正在连接</output>
<button id="refresh">刷新记录</button><label>删除口令<input id="reset-password" autocomplete="off"></label><button id="reset">清除记录</button><button id="logout">退出管理</button>
<script>let port;window.addEventListener('message',event=>{if(event.data?.type!=='gallery-admin:init')return;port=event.ports[0];port.onmessage=({data})=>{document.querySelector('#status').textContent=data.type==='data'?'Visits '+data.data.totals.visits:data.type==='error'?data.message:data.type;};port.start();port.postMessage({type:'refresh',days:30,album:'all'});});document.querySelector('#refresh').onclick=()=>port.postMessage({type:'refresh'});document.querySelector('#reset').onclick=()=>{const input=document.querySelector('#reset-password');port.postMessage({type:'reset',password:input.value});input.value='';};document.querySelector('#logout').onclick=()=>port.postMessage({type:'logout'});</script></body></html>`;

async function adminFixture(page: Page) {
  await fixturePage(page);
  const token = randomBytes(32).toString("base64url");
  const key = randomBytes(32);
  const encrypted = encrypt(panelHtml, key, "gallery-admin:v1");
  await page.route("**/_data/panel.enc", (route) => route.fulfill({ contentType: "application/octet-stream", body: Buffer.concat([encrypted.iv, encrypted.ciphertext]) }));
  const requests: { path: string; method: string; authorization?: string; body: unknown }[] = [];
  const state = { visits: 3, expire: false };
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return respond(route, {});
    const url = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : undefined;
    requests.push({ path: url.pathname + url.search, method: request.method(), authorization: request.headers().authorization, body });
    if (url.pathname.endsWith("/session")) return body?.password === adminPhrase
      ? respond(route, { token, expiresAt: Date.now() + 900_000, dashboardKey: key.toString("base64") })
      : respond(route, { error: "incorrect_phrase" }, 401);
    if (url.pathname.endsWith("/data")) return state.expire
      ? respond(route, { error: "session_expired" }, 401)
      : respond(route, { events: [], totals: { visits: state.visits }, albums: [], generatedAt: new Date().toISOString(), truncated: false });
    if (url.pathname.endsWith("/reset")) {
      if (body?.password !== resetPhrase) return respond(route, { error: "incorrect_phrase" }, 401);
      state.visits = 0;
    }
    return respond(route, { ok: true });
  });
  return { token, key: key.toString("base64"), requests, state };
}

async function openChineseAdmin(page: Page) {
  await page.goto("/gallery/");
  await expect(page.getByRole("link", { name: "打开相册管理" })).toHaveCount(0);
  await openNavigation(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  const link = page.getByRole("link", { name: "打开相册管理" });
  await expect(link).toHaveText("。");
  await link.click();
  return page.getByRole("dialog", { name: "相册管理", exact: true });
}

test("Chinese punctuation opens a sandboxed encrypted admin panel; bearer session stays in parent memory and reset uses its own body", async ({ page }) => {
  const fixture = await adminFixture(page);
  const dialog = await openChineseAdmin(page);
  await dialog.getByLabel("管理口令", { exact: true }).fill("Synthetic wrong dashboard phrase");
  await dialog.getByRole("button", { name: "打开记录", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("管理口令", { exact: true }).fill(adminPhrase);
  await dialog.getByRole("button", { name: "打开记录", exact: true }).click();
  const iframe = page.locator('iframe[title="加密相册管理面板"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  const frame = page.frameLocator('iframe[title="加密相册管理面板"]');
  await expect(frame.getByRole("status")).toHaveText("Visits 3");
  expect(await iframe.evaluate((element) => {
    try { void (element as HTMLIFrameElement).contentWindow!.document; return false; } catch { return true; }
  })).toBe(true);
  await frame.getByLabel("删除口令", { exact: true }).fill(resetPhrase);
  await expect(frame.getByLabel("删除口令", { exact: true })).toHaveValue(resetPhrase);
  await frame.getByRole("button", { name: "清除记录" }).press("Enter");
  await expect(frame.getByLabel("删除口令", { exact: true })).toHaveValue("");
  await expect(frame.getByRole("status")).toHaveText("Visits 0");
  const reset = fixture.requests.find((request) => request.path === "/v1/admin/reset");
  expect(reset).toEqual({ path: "/v1/admin/reset", method: "POST", authorization: `Bearer ${fixture.token}`, body: { password: resetPhrase } });
  expect(fixture.requests.filter((request) => request.path.startsWith("/v1/admin/data")).every((request) => request.authorization === `Bearer ${fixture.token}`)).toBe(true);
  for (const request of fixture.requests) for (const secret of [adminPhrase, resetPhrase, fixture.token, fixture.key]) expect(request.path).not.toContain(secret);
  await noStoredSecrets(page, [adminPhrase, resetPhrase, fixture.token, fixture.key]);
  await expect(frame.locator("body")).not.toContainText(fixture.token);
  await frame.getByRole("button", { name: "退出管理" }).press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixture.requests.some((request) => request.path === "/v1/admin/logout")).toBe(true);
});

test("expired administrator authorization removes the iframe and returns to an empty login form", async ({ page }) => {
  const fixture = await adminFixture(page);
  const dialog = await openChineseAdmin(page);
  await dialog.getByLabel("管理口令", { exact: true }).fill(adminPhrase);
  await dialog.getByRole("button", { name: "打开记录", exact: true }).click();
  const frame = page.frameLocator('iframe[title="加密相册管理面板"]');
  await expect(frame.getByRole("status")).toHaveText("Visits 3");
  fixture.state.expire = true;
  await frame.getByRole("button", { name: "刷新记录" }).press("Enter");
  await expect(page.locator('iframe[title="加密相册管理面板"]')).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toContainText("会话已过期");
  await expect(dialog.getByLabel("管理口令", { exact: true })).toHaveValue("");
  await noStoredSecrets(page, [adminPhrase, fixture.token, fixture.key]);
});
