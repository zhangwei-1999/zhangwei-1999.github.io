import { test as base, expect, type Page } from "@playwright/test";
import { appearance } from "../src/data/appearance";
import { openNavigation } from "./helpers/navigation";

const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(
        errors,
        "Water and glass interactions have no browser errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

async function pointerStyles(page: Page) {
  return page.locator(".liquid-navigation").evaluate((nav) => ({
    x: (nav as HTMLElement).style.getPropertyValue("--mouse-x"),
    y: (nav as HTMLElement).style.getPropertyValue("--mouse-y"),
    angle: (nav as HTMLElement).style.getPropertyValue("--glass-angle"),
    active: (nav as HTMLElement).style.getPropertyValue("--glass-active"),
  }));
}

const emptyPointerStyles = { x: "", y: "", angle: "", active: "" };
const flowProperties = ["--flow-x", "--flow-y", "--flow-angle", "--flow-active"];

async function flowStyles(page: Page) {
  return page.locator(".water-illumination").evaluate(
    (element, properties) => properties.map((property) =>
      (element as HTMLElement).style.getPropertyValue(property),
    ),
    flowProperties,
  );
}

async function canvasPixels(page: Page) {
  return page.locator(".water-wave-field").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let occupied = 0;
    let checksum = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] > 0) occupied++;
      checksum += pixels[offset] * (offset % 997);
    }
    return { occupied, checksum, pixels: canvas.width * canvas.height };
  });
}

async function seedRippleRandomness(page: Page) {
  await page.addInitScript(() => {
    let state = 0x1a2b3c4d;
    Math.random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  });
}

async function freezeWaterClock(page: Page) {
  await page.clock.install({ time: new Date("2026-09-22T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-22T12:00:01Z"));
}

async function surfaceAppearance(page: Page, region?: { x: number; y: number; radius: number }) {
  return page.locator(".water-wave-field").evaluate((element, area) => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let occupied = 0;
    let alpha = 0;
    let radialWeight = 0;
    let lavender = 0;
    let highlights = 0;
    let peakAlpha = 0;
    let minimumX = Infinity;
    let maximumX = -Infinity;
    let minimumY = Infinity;
    let maximumY = -Infinity;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const point = offset / 4;
      const x = (point % canvas.width + 0.5) / canvas.width * bounds.width;
      const y = (Math.floor(point / canvas.width) + 0.5) / canvas.height * bounds.height;
      const distance = area ? Math.hypot(x - area.x, y - area.y) : 0;
      if (area && distance > area.radius) continue;
      const opacity = pixels[offset + 3];
      alpha += opacity;
      peakAlpha = Math.max(peakAlpha, opacity);
      radialWeight += opacity * distance ** 2;
      if (opacity < 2) continue;
      occupied++;
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      // Ignore almost-transparent edge pixels, where premultiplication creates
      // large rounding differences when ImageData restores the RGB channels.
      if (opacity < 4) continue;
      const [red, green, blue] = pixels.slice(offset, offset + 3);
      if (blue > red + 8 && red > green + 8) lavender++;
      if (red >= 195 && green >= 185 && blue >= 215 && blue > green + 8) highlights++;
    }
    return {
      occupied, alpha, radius: alpha ? Math.sqrt(radialWeight / alpha) : 0,
      lavender, highlights, peakAlpha,
      extent: occupied ? Math.max(maximumX - minimumX, maximumY - minimumY) : 0,
      center: occupied ? { x: (minimumX + maximumX) / 2, y: (minimumY + maximumY) / 2 } : null,
    };
  }, region);
}

async function surfaceFrame(page: Page) {
  return page.locator(".water-wave-field").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = Array.from({ length: canvas.width * canvas.height }, (_, index) => data[index * 4 + 3]);
    const peak = alpha.indexOf(Math.max(...alpha));
    return {
      alpha,
      peak: {
        x: (peak % canvas.width + 0.5) / canvas.width * bounds.width,
        y: (Math.floor(peak / canvas.width) + 0.5) / canvas.height * bounds.height,
      },
    };
  });
}

async function expectUndistortedPortrait(page: Page) {
  const photo = page.locator(".portrait-card > img");
  await expect(photo).toHaveJSProperty("complete", true);
  await expect(photo).toHaveCSS("object-fit", "contain");
  const dimensions = await photo.evaluate((element) => {
    const image = element as HTMLImageElement;
    const style = getComputedStyle(image);
    return {
      source: image.currentSrc,
      intrinsicWidth: image.naturalWidth,
      intrinsicHeight: image.naturalHeight,
      intrinsicRatio: image.naturalWidth / image.naturalHeight,
      // Computed sizes exclude the deliberate rotation of the surrounding frame.
      renderedRatio: parseFloat(style.width) / parseFloat(style.height),
    };
  });
  expect(dimensions.source).toMatch(
    /\/images\/myphoto(?:-small|-mobile)?\.webp$/,
  );
  expect(dimensions.intrinsicWidth).toBeGreaterThan(0);
  // With width-descriptor srcsets, Chrome density-corrects natural dimensions
  // and rounds each axis to an integer; allow one CSS pixel of that rounding.
  expect(
    Math.abs(dimensions.intrinsicWidth / 1.5 - dimensions.intrinsicHeight),
  ).toBeLessThanOrEqual(1);
  expect(dimensions.renderedRatio).toBeCloseTo(3 / 2, 2);
}

test("A bounded shared wave field evolves and overlaps at the increased ambient frequency", async ({ page }) => {
  await page.clock.install();
  await seedRippleRandomness(page);
  await page.goto("/");
  await expect(page.locator(".water-wave-field")).toHaveAttribute("data-state", "active");
  await page.clock.runFor(700);
  const initial = await canvasPixels(page);
  expect(initial.occupied).toBeGreaterThan(10);
  expect(initial.pixels).toBeLessThanOrEqual(64_000);
  expect(appearance.water.ambient.intervalMs).toBeLessThan(4000);
  await page.clock.runFor(appearance.water.ambient.intervalMs * 2);
  const overlapping = await canvasPixels(page);
  expect(overlapping.occupied).toBeGreaterThan(initial.occupied);
  expect(overlapping.checksum).not.toBe(initial.checksum);
  await expect(page.locator(".water-ripple--ambient")).toHaveCount(0);
});

test("Clicks disturb the shared canvas with small translucent lavender waves that spread and settle", async ({
  page,
}) => {
  await freezeWaterClock(page);
  await seedRippleRandomness(page);
  await page.goto("/");
  const surface = page.locator(".water-wave-field");
  await expect(surface).toHaveCount(1);
  expect((await canvasPixels(page)).occupied).toBe(0);
  await page.mouse.click(100, 350);
  await expect(page.locator(".water-ripple, .click-ripple-layer")).toHaveCount(0);
  await page.clock.runFor(100);
  // This corner stays far from the deterministic first ambient source.
  const region = { x: 100, y: 350, radius: 200 };
  const early = await surfaceAppearance(page, region);
  expect(early.occupied).toBeGreaterThan(0);
  expect(early.lavender).toBeGreaterThan(0);
  expect(early.highlights).toBeGreaterThan(0);
  expect(early.peakAlpha, "Click colour remains translucent").toBeLessThan(128);
  expect(early.extent).toBeLessThan(appearance.water.ambient.diameter[0]);
  expect(Math.abs(early.center!.x - region.x)).toBeLessThan(20);
  expect(Math.abs(early.center!.y - region.y)).toBeLessThan(20);
  await page.clock.runFor(300);
  const middle = await surfaceAppearance(page, region);
  expect(middle.occupied).toBeGreaterThan(0);
  expect(middle.radius, "The disturbance spreads through the water surface").toBeGreaterThan(early.radius);
  await page.clock.runFor(1100);
  const late = await surfaceAppearance(page, region);
  expect(late.peakAlpha, "The surface light fades naturally without a hard lifetime cutoff").toBeLessThan(early.peakAlpha);
  await expect(surface).toHaveCount(1);
  await expect(surface).toHaveCSS("pointer-events", "none");
  expect((await canvasPixels(page)).pixels).toBeLessThanOrEqual(64_000);
});

test("The click accent remains lavender across the room palettes", async ({ page }) => {
  await freezeWaterClock(page);
  for (const path of ["/", "/news/", "/gallery/"]) {
    await page.goto(path);
    await page.mouse.click(100, 350);
    await page.clock.runFor(100);
    const painted = await surfaceAppearance(page);
    expect(painted.lavender, `${path} retains lavender click shading`).toBeGreaterThan(0);
    expect(painted.highlights, `${path} has pale surface highlights`).toBeGreaterThan(0);
    await expect(page.locator(".water-background canvas")).toHaveCount(1);
  }
});

test("A click changes the existing ambient wave where their wavefronts overlap", async ({ page }) => {
  await freezeWaterClock(page);
  await seedRippleRandomness(page);
  await page.goto("/");
  await page.clock.runFor(800);
  const initial = await surfaceFrame(page);
  expect(initial.alpha.some((value) => value > 0)).toBe(true);
  await page.clock.runFor(400);
  const baseline = await surfaceFrame(page);

  // Repeat identical public animation timing/randomness, adding only a click
  // at a currently visible crest. Compare actual painted overlapping pixels.
  await page.reload();
  await page.clock.runFor(800);
  const repeated = await surfaceFrame(page);
  expect(repeated.alpha).toEqual(initial.alpha);
  await page.mouse.click(initial.peak.x, initial.peak.y);
  await page.clock.runFor(400);
  const disturbed = await surfaceFrame(page);
  const changedOverlap = baseline.alpha.filter((value, index) => value > 0 && value !== disturbed.alpha[index]);
  expect(changedOverlap.length).toBeGreaterThan(10);
  await expect(page.locator(".water-background canvas")).toHaveCount(1);
  await expect(page.locator(".water-ripple, .click-ripple-layer")).toHaveCount(0);
});

test("Rapid clicking limits injected energy and accepts a new disturbance after the burst window", async ({ page }) => {
  await freezeWaterClock(page);
  await seedRippleRandomness(page);
  await page.goto("/");
  for (const x of [100, 300, 500]) await page.mouse.click(x, 350);
  await page.clock.runFor(100);
  for (const x of [100, 300])
    expect((await surfaceAppearance(page, { x, y: 350, radius: 70 })).occupied).toBeGreaterThan(0);
  expect((await surfaceAppearance(page, { x: 500, y: 350, radius: 70 })).occupied).toBe(0);
  await page.clock.runFor(appearance.water.click.burstWindowMs);
  await page.mouse.click(500, 350);
  await page.clock.runFor(100);
  expect((await surfaceAppearance(page, { x: 500, y: 350, radius: 70 })).lavender).toBeGreaterThan(0);
  await expect(page.locator(".water-background canvas")).toHaveCount(1);
});

test("Keyboard activation remains functional without producing a pointer ripple", async ({
  page,
}) => {
  await freezeWaterClock(page);
  await page.goto("/");
  const initial = await canvasPixels(page);
  await page.locator(".nav-peek").focus();
  await page.getByRole("button", { name: "中文", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.clock.runFor(100);
  expect(await canvasPixels(page)).toEqual(initial);
  await page.getByRole("button", { name: "EN", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.clock.runFor(100);
  expect(await canvasPixels(page)).toEqual(initial);
});

test("Pointer moves decorative water light and local glass rims without moving content or the base palette", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  // CSS animations use a separate timeline from Playwright's mocked JS clock.
  // Finish only the existing page-entry animation before comparing content bounds.
  await page.locator(".page-transition").evaluate((element) => {
    for (const animation of element.getAnimations()) animation.finish();
  });
  const heroBounds = await page.locator("#hero-title").boundingBox();
  // Coordinates in the outer page margin deliberately avoid interactive cards.
  await page.mouse.move(20, 260);
  await page.clock.runFor(1000);
  expect(await pointerStyles(page)).toEqual(emptyPointerStyles);
  const leftFlow = await flowStyles(page);
  expect(leftFlow.every((value) => value !== "")).toBe(true);
  const leftTransform = await page.locator(".water-illumination").evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.mouse.move(page.viewportSize()!.width - 20, 650);
  await page.clock.runFor(1000);
  expect(await flowStyles(page)).not.toEqual(leftFlow);
  const rightTransform = await page.locator(".water-illumination").evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(rightTransform).not.toBe(leftTransform);
  expect(rightTransform).not.toBe("none");
  const sheenOpacity = await page.locator(".water-sheen").evaluate(
    (element) => Number(getComputedStyle(element).opacity),
  );
  expect(sheenOpacity, "The moving sheen is visible, not just an unused CSS variable").toBeGreaterThan(0);
  expect(await page.locator("#hero-title").boundingBox()).toEqual(heroBounds);
  await openNavigation(page);
  await page.locator(".navbar").evaluate((element) => { for (const animation of element.getAnimations()) animation.finish(); });
  const nav = page.locator(".liquid-navigation");
  const bounds = (await nav.boundingBox())!;
  const firstGradient = await nav.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  const pageBackground = await page.locator(".water-background").evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.5);
  await page.clock.runFor(1000);
  await expect.poll(async () => (await pointerStyles(page)).x).not.toBe("");
  const left = await pointerStyles(page);
  const firstEdge = await nav.evaluate(
    (element) => getComputedStyle(element, "::after").backgroundImage,
  );
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.5);
  await page.clock.runFor(1000);
  await expect.poll(async () => (await pointerStyles(page)).x).not.toBe(left.x);
  const right = await pointerStyles(page);
  expect(right.angle).not.toBe(left.angle);
  expect(await nav.evaluate((element) => getComputedStyle(element, "::after").backgroundImage)).not.toBe(firstEdge);
  expect(await nav.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(firstGradient);
  expect(await page.locator(".water-background").evaluate((element) => getComputedStyle(element).backgroundImage)).toBe(pageBackground);

  await page.mouse.move(300, 400);
  await page.clock.runFor(1000);
  const outside = await pointerStyles(page);
  await page.mouse.move(1100, 600);
  await page.clock.runFor(1000);
  expect(await pointerStyles(page), "Moving outside the navbar cannot steer its light").toEqual(outside);
  expect(await page.locator(".site").evaluate((site) => ["--light-x", "--light-y", "--glass-angle", "--glass-shift-x", "--glass-shift-y"]
    .map((property) => (site as HTMLElement).style.getPropertyValue(property)))).toEqual(["", "", "", "", ""]);
  await expect(page.locator(".water-lens, .portrait-orbit")).toHaveCount(0);
  for (const selector of [
    ".water-background",
    ".water-illumination",
    ".water-wave-field",
  ]) {
    await expect(page.locator(selector)).toHaveCSS("pointer-events", "none");
  }
  await openNavigation(page);
  await nav.getByRole("link", { name: "News", exact: true }).click();
  await expect(page).toHaveURL(/\/news\/$/);
  await expect(
    nav.getByRole("link", { name: "News", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("Reduced motion stops ambient and click ripples and resets pointer refraction", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await openNavigation(page);
  await page.locator(".navbar").evaluate((element) => { for (const animation of element.getAnimations()) animation.finish(); });
  const nav = (await page.locator(".liquid-navigation").boundingBox())!;
  await page.mouse.move(nav.x + nav.width / 2, nav.y + nav.height / 2);
  await page.clock.runFor(550);
  await expect.poll(async () => (await pointerStyles(page)).x).not.toBe("");
  expect((await flowStyles(page)).every((value) => value !== "")).toBe(true);
  await page.mouse.click(100, 350);
  await page.clock.runFor(100);
  expect((await surfaceAppearance(page, { x: 100, y: 350, radius: 100 })).lavender).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".water-ripple")).toHaveCount(0);
  await expect
    .poll(async () => pointerStyles(page))
    .toEqual(emptyPointerStyles);
  expect(await flowStyles(page)).toEqual(["", "", "", ""]);
  await page.mouse.move(nav.x + nav.width * 0.75, nav.y + nav.height / 2);
  await page.locator("#hero-title").click();
  await page.clock.runFor(10_000);
  await expect(page.locator(".water-wave-field")).toHaveAttribute("data-state", "paused");
  expect((await canvasPixels(page)).occupied).toBe(0);
  await expect(page.locator(".water-ripple")).toHaveCount(0);
  expect(await pointerStyles(page)).toEqual(emptyPointerStyles);
  expect(await flowStyles(page)).toEqual(["", "", "", ""]);
  await expect(page.locator(".water-light-one")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("The portrait preserves its aspect ratio and all five profile links use local brand logos", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      externalRequests.push(request.url());
  });
  await page.goto("/");
  await expectUndistortedPortrait(page);
  const socials = page.locator(".social-links");
  for (const name of [
    "Google Scholar",
    "GitHub",
    "ORCID",
    "Semantic Scholar",
    "DBLP",
  ]) {
    const link = socials.getByRole("link", { name: new RegExp(name) });
    await expect(link).toBeVisible();
    await expect(link.locator("svg.social-icon path")).toHaveAttribute(
      "d",
      /\S+/,
    );
    await expect(link.locator("svg.social-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  }
  expect(
    externalRequests,
    "Logos and portrait require no third-party requests",
  ).toEqual([]);
});

test("Names follow the selected language and each section keeps its own quiet palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#hero-title")).toHaveAccessibleName("Wei Zhang");
  await expect(page.locator("#hero-title")).not.toContainText("张蔚");
  await openNavigation(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("#hero-title")).toHaveAccessibleName("张蔚");
  await expect(page.locator("#hero-title")).not.toContainText("Wei Zhang");
  await page.reload();
  await expect(page.locator("#hero-title")).toHaveAccessibleName("张蔚");
  await openNavigation(page);
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const palettes: string[] = [];
  for (const [path, className] of [
    ["/", "home-theme"],
    ["/publications/", "publications-theme"],
    ["/news/", "news-theme"],
    ["/awards/", "awards-theme"],
    ["/gallery/", "warm-theme"],
  ]) {
    await page.goto(path);
    await expect(page.locator(".site")).toHaveClass(new RegExp(`\\b${className}\\b`));
    const palette = await page.locator(".site").evaluate((site) => {
      const style = getComputedStyle(site);
      return {
        field: style.getPropertyValue("--water-field"),
        tint: style.getPropertyValue("--water-tint").split(",").map(Number),
      };
    });
    expect(palette.field.trim()).not.toBe("");
    palettes.push(palette.field);
    if (className === "home-theme") expect(palette.tint[2]).toBeGreaterThan(palette.tint[0]);
    if (className === "warm-theme") expect(palette.tint[0]).toBeGreaterThan(palette.tint[2]);
    await expect(page.locator(".water-lens, .portrait-orbit")).toHaveCount(0);
  }
  expect(new Set(palettes).size, "Every main section has a distinct background tint").toBe(5);
  await page.goto("/gallery/life/");
  await expect(page.locator(".site")).toHaveClass(/\bwarm-theme\b/);
});

for (const width of [320, 375]) {
  test.describe(`Water and portrait on ${width}px touch screens`, () => {
    test.use({
      viewport: { width, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    test("Hero content fits, portrait stays undistorted, and ripples never widen the document", async ({
      page,
    }) => {
      await freezeWaterClock(page);
      await seedRippleRandomness(page);
      await page.goto("/");
      await expectUndistortedPortrait(page);
      await expect(page.locator(".social-links .social-icon")).toHaveCount(5);
      // A coordinate in the mobile margin can be adjusted to a nearby link by
      // Chrome's touch targeting. Tap an explicit, noninteractive surface.
      await page.locator("#hero-title").tap();
      await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
      await page.clock.runFor(150);
      expect((await surfaceAppearance(page)).lavender).toBeGreaterThan(0);
      await expect(page.locator(".water-background canvas")).toHaveCount(1);
      await expect(page.locator(".water-ripple, .click-ripple-layer")).toHaveCount(0);
      expect((await canvasPixels(page)).pixels).toBeLessThanOrEqual(24_000);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      const clippedLinks = await page
        .locator(".social-link")
        .evaluateAll((links) =>
          links
            .filter((link) => {
              const rect = link.getBoundingClientRect();
              return rect.left < -1 || rect.right > window.innerWidth + 1;
            })
            .map((link) => link.textContent),
        );
      expect(clippedLinks).toEqual([]);
      expect(
        await pointerStyles(page),
        "Touch does not run desktop refraction tracking",
      ).toEqual(emptyPointerStyles);
      expect(await flowStyles(page)).toEqual(["", "", "", ""]);
      await page.clock.runFor(1000);
      expect((await canvasPixels(page)).occupied).toBeGreaterThan(0);
    });
  });
}
