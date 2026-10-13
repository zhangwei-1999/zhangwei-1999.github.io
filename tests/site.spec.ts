import { test as base, expect, type Page } from "@playwright/test";
import { news } from "../src/data/news";
import { publications } from "../src/data/publications";
import { gallery } from "../src/data/gallery";
import { openNavigation } from "./helpers/navigation";

const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "No uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

const routes = [
  "/",
  "/publications/",
  "/news/",
  "/awards/",
  "/gallery/",
  ...gallery.map((album) => `/gallery/${album.slug}/`),
];

// These photos exist only inside an intercepted module during this browser test.
// Nothing is written to the personal gallery data or published with the website.
async function injectGalleryFixture(page: Page) {
  await page.route("**/src/data/gallery.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const gallery = ${JSON.stringify([
        {
          slug: "photography",
          title: { en: "Test album", zh: "测试相册" },
          description: {
            en: "Browser test fixture only.",
            zh: "仅用于浏览器测试。",
          },
          cover: "images/me.webp",
          // Keep this legacy lightbox fixture independent of real collections.
          encrypted: undefined,
          encryptedCover: undefined,
          presentation: undefined,
          sections: undefined,
          photos: [
            {
              id: "fixture-portrait",
              src: "images/me.webp",
              alt: { en: "Test fixture portrait", zh: "测试人像" },
              width: 600,
              height: 800,
            },
            {
              id: "fixture-paper",
              src: "docs/A-arxiv26/arxiv26.webp",
              alt: { en: "Test fixture paper", zh: "测试论文图" },
              width: 800,
              height: 450,
            },
          ],
        },
      ])};`,
    }),
  );
}

test("Home shows the latest eight news items and all explicitly featured publications", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".home-news .news-item")).toHaveCount(
    Math.min(8, news.length),
  );
  await expect(page.locator(".home-news .news-item").first()).toContainText(
    [...news].sort((a, b) => b.date.localeCompare(a.date))[0].content.en,
  );
  await expect(page.locator(".publication-card")).toHaveCount(
    publications.filter((paper) => paper.featured).length,
  );
  for (const paper of publications.filter((item) => item.featured)) {
    await expect(
      page.getByRole("heading", { name: paper.title, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".portrait-card img")).toHaveJSProperty(
    "complete",
    true,
  );
  expect(
    await page
      .locator(".portrait-card img")
      .evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});

test("Desktop navigation synchronizes the active route and supports browser Back", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation");
  for (const [name, path] of [
    ["Publications", "/publications/"],
    ["News", "/news/"],
    ["Awards", "/awards/"],
    ["Gallery", "/gallery/"],
    ["Home", "/"],
  ]) {
    await openNavigation(page);
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("main h1")).toBeVisible();
  }
  await page.goBack();
  await expect(
    nav.getByRole("link", { name: "Gallery", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

for (const route of routes) {
  test(`Direct entry and refresh render ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('.nav-link[aria-current="page"]')).toHaveCount(1);
  });
}

test("Chinese content and language preference persist through navigation and refresh", async ({
  page,
}) => {
  await page.goto("/");
  await openNavigation(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("navigation")).toHaveAccessibleName("主导航");
  await expect(page.locator(".home-news .news-item").first()).toContainText(
    [...news].sort((a, b) => b.date.localeCompare(a.date))[0].content.zh,
  );
  await page.reload();
  await openNavigation(page);
  await expect(
    page.getByRole("button", { name: "中文", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await openNavigation(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "学术论文" })
    .click();
  await expect(page.locator(".paper-description").first()).toHaveText(
    publications[0].description!.zh,
  );
  await openNavigation(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "生活相册" })
    .click();
  await expect(
    page.getByRole("heading", { name: gallery[0].title.zh, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Publication filters show only their category and restore the complete collection", async ({
  page,
}) => {
  await page.goto("/publications/");
  await expect(page.locator(".publication-card")).toHaveCount(
    publications.length,
  );
  for (const category of new Set(publications.map((paper) => paper.category))) {
    const button = page.getByRole("button", {
      name: new RegExp(`^${category}`, "i"),
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const expected = publications.filter(
      (paper) => paper.category === category,
    );
    await expect(page.locator(".publication-card")).toHaveCount(
      expected.length,
    );
    for (const paper of expected)
      await expect(
        page.getByRole("heading", { name: paper.title, exact: true }),
      ).toBeVisible();
  }
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(page.locator(".publication-card")).toHaveCount(
    publications.length,
  );
});

test("News calendar exposes data-driven entries and keyboard-accessible tooltips", async ({
  page,
}) => {
  await page.goto("/news/");
  await expect(page.locator(".news-archive .news-item")).toHaveCount(
    news.length,
  );
  const entry = news[0];
  await page.getByLabel("Select year").selectOption(entry.date.slice(0, 4));
  const monthly = entry.datePrecision === "month";
  const key = monthly ? entry.date.slice(0, 7) : entry.date;
  const expected = news.filter((item) =>
    monthly
      ? item.datePrecision === "month" && item.date.startsWith(key)
      : item.datePrecision !== "month" && item.date === key,
  );
  const label = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    ...(monthly ? {} : { day: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${key}${monthly ? "-01" : ""}T12:00:00Z`));
  const dateButton = page.getByRole("button", {
    name: `${label}: ${expected.length} ${expected.length === 1 ? "update" : "updates"}`,
    exact: true,
  });
  await dateButton.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(
    expected.length,
  );
  for (const item of expected)
    await expect(page.getByRole("tooltip")).toContainText(item.content.en);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("Reduced motion disables background and hover animation and quote rotation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/news/");
  await expect(page.getByText("Auto-rotation off")).toBeVisible();
  const quote = await page.locator(".quote-content blockquote").textContent();
  await page.clock.fastForward(31_000);
  await expect(page.locator(".quote-content blockquote")).toHaveText(quote!);
  await expect(page.locator(".water-light-one")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.locator(".news-item").first().hover();
  expect(
    await page
      .locator(".news-item")
      .first()
      .evaluate(
        (element) => getComputedStyle(element, "::after").animationName,
      ),
  ).toBe("none");
  await expect(page.locator("main")).toHaveCSS("animation-name", "none");
});

test("Quotes rotate slowly and pause while the reader hovers", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/news/");
  const panel = page.locator(".quote-panel");
  await expect(panel.locator("blockquote")).toBeVisible();
  const initial = await panel.locator("blockquote").textContent();
  await page.clock.fastForward(11_000);
  await expect(panel.locator("blockquote")).not.toHaveText(initial!);
  await panel.hover();
  const paused = await panel.locator("blockquote").textContent();
  await page.clock.fastForward(22_000);
  await expect(panel.locator("blockquote")).toHaveText(paused!);
  await page.mouse.move(0, 0);
  await page.clock.fastForward(11_000);
  await expect(panel.locator("blockquote")).not.toHaveText(paused!);
});

for (const width of [375, 320]) {
  test.describe(`Mobile ${width}px`, () => {
    test.use({
      viewport: { width, height: 812 },
      isMobile: true,
      hasTouch: true,
    });

    test("Every page fits the viewport without horizontal scrolling", async ({
      page,
    }) => {
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
          route,
        ).toBeLessThanOrEqual(1);
        const clippedHeadings = await page
          .locator("main h1, main h2")
          .evaluateAll((headings) =>
            headings
              .filter((heading) => {
                const rect = heading.getBoundingClientRect();
                return (
                  rect.width > 0 &&
                  (rect.left < -1 || rect.right > window.innerWidth + 1)
                );
              })
              .map((heading) => heading.textContent),
          );
        expect(clippedHeadings, `Visible headings fit on ${route}`).toEqual([]);
      }
    });

    test("Menu supports Escape, restores focus, and closes after navigation", async ({
      page,
    }) => {
      await page.goto("/");
      const menu = page.getByRole("button", { name: "Open navigation" });
      await openNavigation(page);
      await expect(
        page.getByRole("button", { name: "Close navigation" }),
      ).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
      await openNavigation(page);
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "News", exact: true })
        .click();
      await expect(page).toHaveURL(/\/news\/$/);
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(
        page
          .getByRole("navigation")
          .getByRole("link", { name: "News", exact: true }),
      ).toBeHidden();
    });
  });
}

test("Gallery renders every public count and distinguishes encrypted albums from empty collections", async ({
  page,
}) => {
  await page.goto("/gallery/");
  await expect(page.locator(".album-card")).toHaveCount(gallery.length);
  await expect(page.locator(".album-card__count")).toHaveCount(gallery.length);
  for (const album of gallery) {
    const card = page.locator(".album-card").filter({ has: page.getByRole("heading", { name: album.title.en, exact: true }) });
    const count = album.private?.photoCount ?? album.encrypted?.photoCount ?? album.photos.length;
    await expect(card.locator(".album-card__count")).toHaveText(`${count} ${count === 1 ? "photo" : "photos"}`);
  }
  for (const album of gallery.filter((item) => !item.private && !item.encrypted && item.photos.length === 0)) {
    await page
      .getByRole("link")
      .filter({
        has: page.getByRole("heading", { name: album.title.en, exact: true }),
      })
      .click();
    await expect(page.locator(".gallery-empty")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: /All albums/ }).click();
  }
});

test("Lightbox loads local photos, traps focus, navigates, and restores focus after closing", async ({
  page,
}) => {
  await injectGalleryFixture(page);
  await page.goto("/gallery/photography/");
  const trigger = page.getByRole("button", {
    name: "Open photo: Test fixture portrait",
  });
  const originalOverflow = await page
    .locator("body")
    .evaluate((body) => body.style.overflow);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "Test fixture portrait" }),
  ).toHaveJSProperty("complete", true);
  expect(
    await dialog
      .locator("img")
      .evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  const close = dialog.getByRole("button", { name: "Close photo viewer" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Next photo" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Test fixture paper",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Test fixture portrait",
  );
  await page.keyboard.press("End");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Test fixture paper",
  );
  await page.keyboard.press("Home");
  await expect(dialog.getByRole("img")).toHaveAttribute(
    "alt",
    "Test fixture portrait",
  );
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.locator("body").evaluate((body) => body.style.overflow),
  ).toBe(originalOverflow);
  await trigger.click();
  await dialog.click({ position: { x: 5, y: 90 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test.describe("Touch lightbox", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  test("A horizontal swipe navigates photos and the close control remains available", async ({
    page,
  }) => {
    await injectGalleryFixture(page);
    await page.goto("/gallery/photography/");
    await page
      .getByRole("button", { name: "Open photo: Test fixture portrait" })
      .tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.locator(".gallery-lightbox__stage").evaluate((stage) => {
      const touch = (x: number) =>
        new Touch({ identifier: 1, target: stage, clientX: x, clientY: 240 });
      stage.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [touch(290)] }),
      );
      stage.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          changedTouches: [touch(75)],
        }),
      );
    });
    await expect(dialog.getByRole("img")).toHaveAttribute(
      "alt",
      "Test fixture paper",
    );
    await dialog.getByRole("button", { name: "Close photo viewer" }).tap();
    await expect(dialog).toHaveCount(0);
  });
});
