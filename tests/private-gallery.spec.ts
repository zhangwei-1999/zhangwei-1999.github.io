import { expect, test as base, type Page } from "@playwright/test";
import { makeEncryptedFixture, interceptEncryptedFixtures, type EncryptedFixture } from "./helpers/encryptedGalleryFixture";

// Entirely synthetic credentials and images. These fixtures never read local
// private albums, never use the owner's password, and are never published.
const fixturePasswords = {
  life: "Life browser fixture only",
  lover: "A different browser fixture",
};
const fixtureHint = "Synthetic browser-test hint";
let fixtures: EncryptedFixture[];
base.beforeAll(async () => {
  fixtures = await Promise.all([makeEncryptedFixture("life", fixturePasswords.life), makeEncryptedFixture("lover", fixturePasswords.lover)]);
});

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

async function installFixtures(page: Page) {
  const privateAlbum = (slug: "life" | "lover", title: string) => ({
    slug,
    title: { en: title, zh: title },
    description: { en: "Synthetic fixture album.", zh: "测试相册。" },
    cover: "images/myphoto-small.webp",
    photos: [],
    ...(slug === "lover" ? { layout: "wide" } : {}),
    private: {
      manifest: `gallery-encrypted/${slug}/manifest.json`,
      photoCount: 2,
      hint: { en: fixtureHint, zh: "浏览器测试提示" },
    },
  });
  const publicAlbum = (slug: string, title: string) => ({
    slug,
    title: { en: title, zh: title },
    description: { en: "Empty browser fixture.", zh: "空白测试相册。" },
    photos: [],
  });
  await page.route("**/src/data/gallery.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const gallery = ${JSON.stringify([
        privateAlbum("life", "Life"),
        publicAlbum("photography", "Photography"),
        publicAlbum("aesthetic", "Aesthetic"),
        privateAlbum("lover", "Lover"),
      ])};`,
    }),
  );
  return interceptEncryptedFixtures(page, fixtures);
}

function albumLink(page: Page, name: string) {
  return page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function submitPassword(page: Page, password: string) {
  const dialog = page.getByRole("dialog", { name: /^Unlock / });
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "Unlock album", exact: true })
    .click();
}

async function expectNoPersistedCredential(page: Page) {
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }),
  );
  for (const password of Object.values(fixturePasswords))
    expect(persisted).not.toContain(password);
}

test("locked album counts and covers stay public; unlock prompts require activation and Escape restores focus", async ({
  page,
}) => {
  const requests = await installFixtures(page);
  await page.goto("/gallery/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".album-card")).toHaveCount(4);
  for (const name of ["Life", "Lover"]) {
    const card = albumLink(page, name);
    await expect(card.locator(".album-card__count")).toContainText("2");
    await expect(card.locator("img")).toBeVisible();
    await expect(card.locator("img")).toHaveJSProperty("complete", true);
  }
  expect(requests).toEqual([]);
  const life = albumLink(page, "Life");
  await life.click();
  const dialog = page.getByRole("dialog", { name: "Unlock Life", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fixtureHint);
  const password = dialog.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("");
  await expect(password).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(life).toBeFocused();
  await expect(page).toHaveURL(/\/gallery\/$/);
});

test("wrong passwords reveal no photos; correct passwords decrypt thumbnails and lightbox, then refresh locks again", async ({
  page,
}) => {
  await installFixtures(page);
  await page.goto("/gallery/");
  await albumLink(page, "Life").click();
  await submitPassword(page, "Intentionally incorrect fixture password");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".collection-photo__button")).toHaveCount(0);
  await submitPassword(page, fixturePasswords.life);
  await expect(page).toHaveURL(/\/gallery\/life\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const photos = page.locator(".collection-photo__button");
  await expect(photos).toHaveCount(2);
  const thumbnail = photos.first().locator("img");
  await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail).toHaveAttribute("src", /^blob:/);
  await expect(thumbnail).toHaveJSProperty("naturalWidth", 20);
  await photos.first().click();
  const viewer = page.getByRole("dialog", {
    name: "Photo viewer",
    exact: true,
  });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img")).toHaveAttribute("src", /^blob:/);
  await expect(viewer.getByRole("img")).toHaveJSProperty("naturalWidth", 20);
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByRole("img")).toHaveAttribute(
    "alt",
    "life fixture image 2",
  );
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expectNoPersistedCredential(page);
  await page.reload();
  await expect(page.locator(".collection-photo__button")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unlock album", exact: true }),
  ).toBeVisible();
  await expectNoPersistedCredential(page);
});

test("albums use independent passwords and leaving an unlocked album locks it", async ({
  page,
}) => {
  await installFixtures(page);
  await page.goto("/gallery/");
  await albumLink(page, "Life").click();
  await submitPassword(page, fixturePasswords.life);
  await expect(page).toHaveURL(/\/gallery\/life\/$/);
  await page.getByRole("link", { name: /All albums/ }).click();
  await albumLink(page, "Lover").click();
  await submitPassword(page, fixturePasswords.life);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Unlock Lover", exact: true }),
  ).toBeVisible();
  await submitPassword(page, fixturePasswords.lover);
  await expect(page).toHaveURL(/\/gallery\/lover\/$/);
  await expect(page.locator(".collection-photo__button")).toHaveCount(2);
  await page.getByRole("link", { name: /All albums/ }).click();
  await albumLink(page, "Life").click();
  await expect(
    page.getByRole("dialog", { name: "Unlock Life", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expectNoPersistedCredential(page);
});

test("direct locked routes stay private and mobile unlock controls fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installFixtures(page);
  await page.goto("/gallery/life/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".collection-photo__button")).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: "Unlock album",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Unlock Life", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await dialog
    .getByRole("button", { name: "Close unlock dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await submitPassword(page, fixturePasswords.life);
  await expect(page.locator(".collection-photo__button")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
