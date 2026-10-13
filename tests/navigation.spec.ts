import { test, expect } from "@playwright/test";
import { openNavigation } from "./helpers/navigation";

test("Compact glass handle unfolds on hover, preserves the layout, and returns after leaving", async ({ page }) => {
  await page.goto("/news/");
  const header = page.locator(".nav-wrap");
  const mainTop = await page.locator("main").evaluate((element) => (element as HTMLElement).offsetTop);
  await expect(header).toHaveAttribute("data-state", "collapsed");
  await expect(page.getByRole("navigation").getByRole("link")).toHaveCount(0);
  const resting = await page.locator(".navbar").boundingBox();
  expect(resting!.width).toBeLessThanOrEqual(110);
  await openNavigation(page);
  const news = page.getByRole("navigation").getByRole("link", { name: "News", exact: true });
  await expect(news).toBeVisible();
  await expect(news).toHaveAttribute("aria-current", "page");
  expect(await page.locator("main").evaluate((element) => (element as HTMLElement).offsetTop)).toBe(mainTop);
  await page.getByRole("navigation").getByRole("link", { name: "Gallery", exact: true }).click();
  await expect(page).toHaveURL(/\/gallery\/$/);
  await expect(header).toHaveAttribute("data-state", "expanded");
  await page.mouse.move(15, 400);
  await expect(header).toHaveAttribute("data-state", "collapsed");
});

test("Keyboard opens the handle, keeps links available, and Escape restores focus", async ({ page }) => {
  await page.goto("/");
  const handle = page.locator(".nav-peek");
  await page.keyboard.press("Tab"); // Skip to content
  await page.keyboard.press("Tab"); // Compact navigation
  await expect(handle).toBeFocused();
  await expect(page.locator(".nav-wrap")).toHaveAttribute("data-state", "expanded");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /Wei Zhang — Home/ })).toBeFocused();
  await page.mouse.move(20, 400);
  await page.waitForTimeout(400);
  await expect(page.locator(".nav-wrap")).toHaveAttribute("data-state", "expanded");
  await page.keyboard.press("Escape");
  await expect(page.locator(".nav-wrap")).toHaveAttribute("data-state", "collapsed");
  await expect(handle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".nav-wrap")).toHaveAttribute("data-state", "expanded");
});

test("Reduced motion reveals the complete navigation without a material animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/news/");
  await openNavigation(page);
  await expect(page.locator(".navbar")).toHaveCSS("transition-duration", "0s");
  await expect(page.locator(".nav-content")).toHaveCSS("transition-duration", "0s");
  await expect(page.getByRole("navigation").getByRole("link", { name: "News", exact: true })).toBeVisible();
});

test("Expanded tablet navigation keeps every link and control inside the glass", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [701, 768, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await openNavigation(page);
    const surface = (await page.locator(".navbar").boundingBox())!;
    for (const control of await page.locator(".nav-content a, .nav-content button").all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(surface.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(surface.x + surface.width);
    }
    expect(surface.x).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width).toBeLessThanOrEqual(width);
  }
});

test.describe("Touch handle", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test("Tap opens the whole menu and selecting a route folds it back into the handle", async ({ page }) => {
    await page.goto("/");
    for (const [title, route] of [["Publications", "publications"], ["News", "news"], ["Awards", "awards"], ["Gallery", "gallery"]]) {
      await openNavigation(page);
      const bounds = await page.locator(".navbar").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
      await page.getByRole("navigation").getByRole("link", { name: title, exact: true }).tap();
      await expect(page).toHaveURL(new RegExp(`/${route}/$`));
      await expect(page.locator(".nav-wrap")).toHaveAttribute("data-state", "collapsed");
    }
    await openNavigation(page);
    await page.getByRole("button", { name: "中文", exact: true }).tap();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "收起导航" }).tap();
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  });
});
