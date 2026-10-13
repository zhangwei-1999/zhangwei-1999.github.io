import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { gallery } from "../src/data/gallery";
import { interceptEncryptedFixtures, makeEncryptedFixture, type EncryptedFixture, type FixturePhoto } from "./helpers/encryptedGalleryFixture";

const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(errors);
    expect(errors, "Gallery collections have no uncaught browser errors").toEqual([]);
  }, { auto: true }],
});

const lifePassword = "Synthetic timeline fixture only";
const named = (name: string) => ({ en: name, zh: `测试：${name}` });
const timelinePhotos: FixturePhoto[] = [
  { alt: named("Oldest test moment"), date: "2022-01-03" },
  { alt: named("Birthday test 2024"), section: "birthdays", year: 2024, width: 12, height: 20 },
  // Deliberately shuffled manifest order: display sequence and lightbox source
  // index must remain distinct and correct after grouping the photographs.
  ...[2, 0, 5, 1, 4, 3].map((index) => ({
    alt: named(`Recent test moment ${index + 1}`), date: "2025-06-15", sequence: index + 1,
    width: index % 2 ? 12 : 20, height: index % 2 ? 20 : 12,
  })),
  { alt: named("Middle test moment"), date: "2023-03-02" },
  { alt: named("Birthday test 2025"), section: "birthdays", year: 2025 },
  { alt: named("Undated test moment") },
];

let lifeFixture: EncryptedFixture;

async function installLifeFixture(page: Page) {
  lifeFixture ??= await makeEncryptedFixture("life", lifePassword, timelinePhotos);
  await page.route("**/src/data/gallery.ts", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `export const gallery = ${JSON.stringify([{
      slug: "life", title: named("Life"), description: named("Synthetic timeline, never personal photos."),
      photos: [], presentation: "timeline",
      private: { manifest: "gallery-encrypted/life/manifest.json", photoCount: timelinePhotos.length, hint: named("Browser fixture password") },
    }])};`,
  }));
  return interceptEncryptedFixtures(page, [lifeFixture]);
}

async function unlockLifeFixture(page: Page) {
  await page.goto("/gallery/life/");
  await page.getByRole("button", { name: "Unlock album", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock Life", exact: true });
  await dialog.getByLabel("Password", { exact: true }).fill(lifePassword);
  await dialog.getByRole("button", { name: "Unlock album", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".life-timeline")).toBeVisible();
}

async function expectFullPhoto(image: Locator) {
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect(image).toHaveJSProperty("complete", true);
  await expect(image).toHaveCSS("object-fit", "contain");
  const size = await image.evaluate((node) => {
    const photo = node as HTMLImageElement;
    const rect = photo.getBoundingClientRect();
    return { width: photo.naturalWidth, ratio: photo.naturalWidth / photo.naturalHeight, displayed: rect.width / rect.height };
  });
  expect(size.width).toBeGreaterThan(0);
  expect(Math.abs(size.ratio - size.displayed), "The complete image preserves its aspect ratio").toBeLessThan(0.04);
}

function recordPhotoRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // Unrelated visitor-map providers may use their own PNG assets.
    if (url.hostname === "127.0.0.1") requests.push(url.pathname);
  });
  return requests;
}

function expectNoOriginalPhotoRequests(requests: string[]) {
  expect(requests.filter((path) => /\.(jpe?g|png|heic)$/i.test(path)), "Original photo paths are never loaded directly").toEqual([]);
}

test("Real album covers and counts load publicly without fetching private photo manifests", async ({ page }) => {
  const requests = recordPhotoRequests(page);
  await page.goto("/gallery/");
  await expect(page.locator(".album-card")).toHaveCount(gallery.length);
  for (const album of gallery) {
    const card = page.locator(".album-card").filter({ has: page.getByRole("heading", { name: album.title.en, exact: true }) });
    const count = album.private?.photoCount ?? album.encrypted?.photoCount ?? album.photos.length;
    await expect(card.locator(".album-card__count")).toHaveText(`${count} ${count === 1 ? "photo" : "photos"}`);
    if (album.encryptedCover) {
      await card.scrollIntoViewIfNeeded();
      const image = card.locator(".album-cover img");
      await expect(image).toHaveAttribute("src", /^blob:/);
      await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    if (album.private) expect(requests.some((path) => path.endsWith(`/${album.private!.manifest}`))).toBe(false);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectNoOriginalPhotoRequests(requests);
});

test("Photography opens without a password, decrypts lazily, and keeps complete photographs", async ({ page }) => {
  const requests = recordPhotoRequests(page);
  const count = gallery.find((album) => album.slug === "photography")!.encrypted!.photoCount;
  await page.goto("/gallery/photography/");
  const frames = page.locator(".collection-photo__button");
  await expect(frames).toHaveCount(count);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unlock album", exact: true })).toHaveCount(0);
  await frames.first().scrollIntoViewIfNeeded();
  await expectFullPhoto(frames.first().locator("img"));
  expect(await frames.locator("img").count(), "Offscreen photographs remain deferred").toBeLessThan(count);
  await frames.last().scrollIntoViewIfNeeded();
  await expectFullPhoto(frames.last().locator("img"));
  await frames.first().click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer", exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img")).toHaveAttribute("src", /^blob:/);
  await expect(viewer.getByRole("img")).toHaveJSProperty("complete", true);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(frames.first()).toBeFocused();
  expectNoOriginalPhotoRequests(requests);
});

test("Aesthetic keeps five numbered artworks in order and three concert photographs in their own section", async ({ page }) => {
  const requests = recordPhotoRequests(page);
  await page.goto("/gallery/aesthetic/");
  await expect(page.locator(".collection-photo__button")).toHaveCount(8);
  const art = page.locator(".curated-section--artwork");
  const concert = page.locator(".curated-section--concert");
  await expect(art.locator(".collection-photo__button")).toHaveCount(5);
  await expect(concert.locator(".collection-photo__button")).toHaveCount(3);
  await expect(art.locator(".artwork-print__sequence")).toHaveText(["01", "02", "03", "04", "05"]);
  expect(await art.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector(".curated-section--concert")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  for (const frame of [art.locator(".collection-photo__button").first(), concert.locator(".collection-photo__button").last()]) {
    await frame.scrollIntoViewIfNeeded();
    await expectFullPhoto(frame.locator("img"));
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectNoOriginalPhotoRequests(requests);
});

test("Synthetic private Life moments form a newest-first timeline and birthdays remain below it", async ({ page }) => {
  await installLifeFixture(page);
  await unlockLifeFixture(page);
  await expect(page.locator(".life-entry time")).toHaveCount(3);
  expect(await page.locator(".life-entry time").evaluateAll((times) => times.map((time) => time.getAttribute("datetime")))).toEqual(["2025-06-15", "2023-03-02", "2022-01-03"]);
  await expect(page.locator(".life-entry").last()).toHaveAccessibleName("Undated moments");
  await expect(page.locator(".birthday-year h3")).toHaveText(["2025", "2024"]);
  expect(await page.locator(".life-timeline").evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector(".birthday-chapters")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

  const filter = page.getByRole("group", { name: "Browse life photographs by year" });
  await filter.getByRole("button", { name: "2023", exact: true }).click();
  await expect(page.locator(".life-entry")).toHaveCount(1);
  await expect(filter.getByRole("button", { name: "2023", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".birthday-year")).toHaveCount(2);
  await filter.getByRole("button", { name: "All years", exact: true }).click();
  await expect(page.locator(".life-entry")).toHaveCount(4);
  await page.getByRole("link", { name: "Birthday chapters", exact: false }).click();
  await expect(page).toHaveURL(/#birthdays$/);
  const birthday = page.locator(".birthday-year").first().locator(".collection-photo__button");
  await birthday.scrollIntoViewIfNeeded();
  await expectFullPhoto(birthday.locator("img"));
});

test("Life photo rows support scrollbar dragging, keyboard scrolling and the correct original lightbox index", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installLifeFixture(page);
  await unlockLifeFixture(page);
  const row = page.locator(".life-entry").first();
  expect(await row.locator(".collection-photo__button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))).toEqual(
    Array.from({ length: 6 }, (_, index) => `Open photo: Recent test moment ${index + 1}`),
  );
  const rail = row.locator(".photo-rail__viewport");
  const slider = row.getByRole("slider", { name: /scroll photographs/ });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute("aria-controls", await rail.getAttribute("id") as string);
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("1000");
  expect(await rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await rail.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBe(0);
  await slider.hover();
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + 8, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.75, track.y + track.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await rail.focus();
  await page.keyboard.press("Home");
  const selected = row.getByRole("button", { name: "Open photo: Recent test moment 3", exact: true });
  await selected.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer", exact: true });
  await expect(viewer.getByRole("img")).toHaveAttribute("alt", "Recent test moment 3");
  await expect(viewer.locator(".gallery-lightbox__counter")).toContainText("03");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByRole("img")).toHaveAttribute("alt", "Recent test moment 1");
  await page.keyboard.press("Escape");
  await expect(selected).toBeFocused();
});

test.describe("Small-screen collections", () => {
  test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  test("Public collections preserve their image ratio without page overflow", async ({ page }) => {
    for (const slug of ["photography", "aesthetic"]) {
      await page.goto(`/gallery/${slug}/`);
      const first = page.locator(".collection-photo__button").first();
      await first.scrollIntoViewIfNeeded();
      await expectFullPhoto(first.locator("img"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });
  test("Private timeline controls, photo rows and birthday prints remain accessible and contained", async ({ page }) => {
    await installLifeFixture(page);
    await unlockLifeFixture(page);
    const slider = page.locator(".life-entry").first().getByRole("slider", { name: /scroll photographs/ });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", /%$/);
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("1000");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const birthday = page.locator(".birthday-year").last().locator(".collection-photo__button");
    await birthday.scrollIntoViewIfNeeded();
    await expectFullPhoto(birthday.locator("img"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await birthday.tap();
    const viewer = page.getByRole("dialog", { name: "Photo viewer", exact: true });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Close photo viewer" }).tap();
    await expect(viewer).toHaveCount(0);
    await expect(birthday).toBeFocused();
  });
});
