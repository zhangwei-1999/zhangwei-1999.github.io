import { expect, test } from "@playwright/test";
import { visitors } from "../src/data/visitors";

// The provider is mocked so browser tests never create real visitor records.
const providerFixture = `
  const host = document.getElementById('mapmyvisitors').parentElement;
  const link = document.createElement('a');
  link.id = 'mapmyvisitors-widget';
  link.style.width = '600px';
  link.href = 'https://mapmyvisitors.com/web/test-fixture-only';
  const counter = document.createElement('div');
  counter.className = 'mapmyvisitors-visitors';
  counter.textContent = '12 Test pageviews';
  const map = document.createElement('div');
  map.className = 'mapmyvisitors-map';
  map.style.width = '600px';
  map.style.height = '300px';
  map.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#eaf2f7"/></svg>') + '")';
  link.append(counter, map);
  host.append(link);
`;

test("Visitor map preserves its original counter and loads only when reached", async ({ page, context }) => {
  const requests: string[] = [];
  await context.route("https://mapmyvisitors.com/map.js?**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: providerFixture });
  });
  await page.goto("/");
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "waiting");
  expect(requests).toHaveLength(0);
  await page.locator(".visitor-section").scrollIntoViewIfNeeded();
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "ready");
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get("d")).toBe(visitors.widgetId);
  const initialFrame = await page.locator("iframe.visitor-widget").boundingBox();
  expect(Number(new URL(requests[0]).searchParams.get("w"))).toBe(Math.min(600, Math.floor(initialFrame!.width)));
  await expect(page.locator("#mapmyvisitors")).toHaveCount(0);
  await expect(page.locator(".visitor-widget")).toHaveAttribute(
    "sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox",
  );
  const widget = page.frameLocator("iframe.visitor-widget");
  await expect(widget.locator(".mapmyvisitors-map")).toBeVisible();
  await expect(widget.locator("a")).toHaveAttribute("target", "_blank");
  await expect(widget.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
  await expect(widget.locator("#visitor-white-knockout")).toHaveCount(1);
  const layers = await widget.locator(".mapmyvisitors-map").evaluate((map) => ({
    background: getComputedStyle(map).backgroundImage,
    mapFilter: getComputedStyle(map).filter,
    backgroundFilter: getComputedStyle(map, "::before").filter,
  }));
  expect(layers.background).toBe("none");
  expect(layers.mapFilter).toBe("none");
  expect(layers.backgroundFilter).toContain("visitor-white-knockout");
  await expect(widget.locator(".mapmyvisitors-visitors")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect.poll(async () => {
    const map = await widget.locator(".mapmyvisitors-map").boundingBox();
    const frame = await page.locator("iframe.visitor-widget").boundingBox();
    return map!.width - frame!.width;
  }).toBeLessThanOrEqual(0.01);
});

test("Visitor map waits for its real layout width and starts the provider only once", async ({ page, context }) => {
  const requests: string[] = [];
  await context.route("**/visitor-map.html?**", async (route) => {
    const response = await route.fetch();
    // Reproduce WebKit's initial zero-width layout independently of browser
    // timing. The external provider must not receive a prematurely clamped w.
    await route.fulfill({
      response,
      body: (await response.text()).replace("<body>", '<body style="width:0">'),
    });
  });
  await context.route("https://mapmyvisitors.com/map.js?**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: providerFixture });
  });
  await page.goto("/");
  await page.locator(".visitor-section").scrollIntoViewIfNeeded();
  const widget = page.frameLocator("iframe.visitor-widget");
  await expect(widget.locator("#map")).toBeAttached();
  await expect(widget.locator("#mapmyvisitors")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await widget.locator("body").evaluate((body) => { body.style.width = "100%"; });
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "ready");
  const frame = await page.locator("iframe.visitor-widget").boundingBox();
  expect(requests).toHaveLength(1);
  expect(Number(new URL(requests[0]).searchParams.get("w"))).toBe(Math.min(600, Math.floor(frame!.width)));
  await page.setViewportSize({ width: 375, height: 740 });
  await expect(widget.locator("#mapmyvisitors")).toHaveCount(1);
  expect(requests).toHaveLength(1);
});

test("Unavailable visitor map offers a working retry without fake counts", async ({ page, context }) => {
  let requests = 0;
  await context.route("https://mapmyvisitors.com/map.js?**", (route) => {
    requests++;
    return requests === 1
      ? route.abort()
      : route.fulfill({ contentType: "text/javascript", body: providerFixture });
  });
  await page.goto("/");
  await page.locator(".visitor-section").scrollIntoViewIfNeeded();
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "unavailable");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "ready");
  expect(requests).toBe(2);
  await expect(page.locator("#mapmyvisitors")).toHaveCount(0);
  await expect(page.locator("iframe.visitor-widget")).toHaveCount(1);
  await expect(page.frameLocator("iframe.visitor-widget").locator("#mapmyvisitors")).toHaveCount(1);
});

test("Visitor provider cannot read the parent document or spoof status from another window", async ({ page, context }) => {
  await context.route("https://mapmyvisitors.com/map.js?**", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `
      let isolated = false;
      try { void parent.document.body; } catch { isolated = true; }
      document.body.dataset.parentIsolated = String(isolated);
      // Deliberately provide no image: only a message from this frame may
      // change the parent's status, not an arbitrary main-window message.
    `,
  }));
  await page.goto("/");
  await page.locator(".visitor-section").scrollIntoViewIfNeeded();
  await expect(page.frameLocator("iframe.visitor-widget").locator("body"))
    .toHaveAttribute("data-parent-isolated", "true");
  await page.evaluate(() => window.postMessage({ type: "academic-visitor-map", status: "ready" }, "*"));
  await expect(page.locator(".visitor-map-frame")).toHaveAttribute("data-status", "loading");
});
