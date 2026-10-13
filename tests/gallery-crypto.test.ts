import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { encryptGallery } from "../scripts/encrypt-gallery.ts";
import { decryptPhoto, GalleryUnlockError, openPublicAlbum, unlockAlbum } from "../src/lib/encryptedGallery.ts";
import type { GalleryManifest } from "../src/lib/galleryCryptoTypes.ts";

const fixturePassword = "test-only private album phrase";
const fixtureAlt = "Private fixture caption that must never be public";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-crypto-"));
  for (const slug of ["life", "lover"]) {
    await mkdir(path.join(root, ".private/gallery", slug), { recursive: true });
    await writeFile(path.join(root, ".private/gallery", slug, "photos.json"), "[]");
  }
  await writeFile(path.join(root, ".private/gallery/keys.json"), JSON.stringify({ life: fixturePassword, lover: fixturePassword }));
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#b2c8dc" } }).png().toBuffer();
  await writeFile(path.join(root, ".private/gallery/life/fixture.png"), original);
  await writeFile(path.join(root, ".private/gallery/life/photos.json"), JSON.stringify([
    { id: "private-fixture-id", src: "fixture.png", alt: { en: fixtureAlt, zh: "仅用于测试的私密说明" } },
  ]));
  return { root, original };
}

function fetchFromFixture(root: string) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://fixture.test/");
    const bytes = await readFile(path.join(root, "public", url.pathname));
    return new Response(bytes, { status: 200 });
  };
}

test("private albums interoperate with browser Web Crypto without exposing photos or metadata", async (context) => {
  const { root, original } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  context.mock.method(globalThis, "fetch", fetchFromFixture(root));
  await encryptGallery({ root });

  const manifestPath = path.join(root, "public/gallery-encrypted/life/manifest.json");
  const manifest: GalleryManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const loverManifest: GalleryManifest = JSON.parse(await readFile(path.join(root, "public/gallery-encrypted/lover/manifest.json"), "utf8"));
  assert.equal(manifest.photoCount, 1);
  assert.equal(loverManifest.photoCount, 0);
  assert.notEqual(manifest.salt, loverManifest.salt, "Equal passwords still get independent album keys");
  const unlocked = await unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", fixturePassword);
  assert.equal(unlocked.key.extractable, false);
  assert.equal(unlocked.photos.length, 1);
  assert.equal(unlocked.photos[0].alt.en, fixtureAlt);
  assert.equal(unlocked.photos[0].width, 800);
  assert.equal(unlocked.photos[0].height, 600);
  const full = await decryptPhoto(unlocked.photos[0], unlocked.key);
  assert.equal(full.type, "image/png");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), original, "Original file is not recompressed or altered");
  const thumbnail = await decryptPhoto(unlocked.photos[0], unlocked.key, "thumbnail");
  assert.equal(thumbnail.type, "image/webp");
  const thumbnailInfo = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
  assert.equal(thumbnailInfo.width, 480);
  assert.equal(thumbnailInfo.height, 360);
  assert.deepEqual((await unlockAlbum("https://fixture.test/gallery-encrypted/lover/manifest.json", fixturePassword)).photos, []);
  await assert.rejects(unlockAlbum("https://fixture.test/gallery-encrypted/lover/manifest.json", "wrong"), GalleryUnlockError);

  const ivs = [manifest.iv, loverManifest.iv];
  for (const file of await readdir(path.dirname(manifestPath))) {
    const bytes = await readFile(path.join(path.dirname(manifestPath), file));
    assert.equal(bytes.includes(Buffer.from(fixturePassword)), false);
    assert.equal(bytes.includes(Buffer.from(fixtureAlt)), false);
    assert.equal(bytes.includes(Buffer.from("private-fixture-id")), false);
    assert.equal(bytes.includes(original), false);
    assert.equal(bytes.includes(Buffer.from("image/png")), false);
    if (file.endsWith(".enc")) ivs.push(bytes.subarray(0, 12).toString("base64"));
  }
  assert.equal(new Set(ivs).size, ivs.length, "Every encrypted resource has a distinct IV");
  const generated = JSON.parse(await readFile(path.join(root, "src/data/gallery-private.generated.json"), "utf8"));
  assert.deepEqual(generated, {
    life: { photoCount: 1, manifest: "gallery-encrypted/life/manifest.json" },
    lover: { photoCount: 0, manifest: "gallery-encrypted/lover/manifest.json" },
  });

  await assert.rejects(unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", "wrong"), GalleryUnlockError);
  const tampered = Buffer.from(manifest.ciphertext, "base64");
  tampered[0] ^= 1;
  await writeFile(manifestPath, JSON.stringify({ ...manifest, ciphertext: tampered.toString("base64") }));
  await assert.rejects(unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", fixturePassword), GalleryUnlockError);
  await writeFile(manifestPath, JSON.stringify(manifest));
  const photoPath = path.join(root, "public", new URL(unlocked.photos[0].src).pathname);
  const badPhoto = await readFile(photoPath);
  badPhoto[20] ^= 1;
  await writeFile(photoPath, badPhoto);
  await assert.rejects(decryptPhoto(unlocked.photos[0], unlocked.key));

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", fixturePassword, controller.signal), { name: "AbortError" });
});

test("regenerating one album replaces its ciphertext and key while preserving other albums", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  context.mock.method(globalThis, "fetch", fetchFromFixture(root));
  await encryptGallery({ root });
  const albumDirectory = path.join(root, "public/gallery-encrypted/life");
  const previousFiles = await readdir(albumDirectory);
  const previousManifest = JSON.parse(await readFile(path.join(albumDirectory, "manifest.json"), "utf8"));
  const loverPath = path.join(root, "public/gallery-encrypted/lover/manifest.json");
  const loverBefore = await readFile(loverPath);
  const newPassword = "replacement fixture secret";
  await writeFile(path.join(root, ".private/gallery/keys.json"), JSON.stringify({ life: newPassword, lover: fixturePassword }));
  await encryptGallery({ root, albumSlug: "life" });
  const newManifest = JSON.parse(await readFile(path.join(albumDirectory, "manifest.json"), "utf8"));
  assert.notEqual(newManifest.salt, previousManifest.salt);
  const currentFiles = await readdir(albumDirectory);
  assert.equal(previousFiles.filter((file) => file.endsWith(".enc")).some((file) => currentFiles.includes(file)), false);
  assert.deepEqual(await readdir(path.join(root, "public/gallery-encrypted")), ["life", "lover"]);
  assert.deepEqual(await readdir(path.join(root, "src/data")), ["gallery-private.generated.json"], "Atomic count writes leave no temporary files behind");
  assert.deepEqual(await readFile(loverPath), loverBefore);
  await assert.rejects(unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", fixturePassword), GalleryUnlockError);
  assert.equal((await unlockAlbum("https://fixture.test/gallery-encrypted/life/manifest.json", newPassword)).photos.length, 1);
});

test("encryption rejects traversal and symlinks escaping the private album", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const writeSource = (src: string) => writeFile(path.join(root, ".private/gallery/life/photos.json"), JSON.stringify([
    { id: "escape", src, alt: { en: "Fixture", zh: "测试" } },
  ]));
  await writeSource("../keys.json");
  await assert.rejects(encryptGallery({ root, albumSlug: "life" }), /stay inside/);
  await symlink(path.join(root, ".private/gallery/keys.json"), path.join(root, ".private/gallery/life/escape.png"));
  await writeSource("escape.png");
  await assert.rejects(encryptGallery({ root, albumSlug: "life" }), /external symlinks/);
  assert.deepEqual(await readdir(path.join(root, "public/gallery-encrypted")), []);
  await assert.rejects(encryptGallery({ root, albumSlug: "../life" }), /valid slug/);
});

test("malformed local key files never echo their contents", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const secretText = "SECRET-FIXTURE-DO-NOT-LOG";
  await writeFile(path.join(root, ".private/gallery/keys.json"), `{"life":${secretText}}`);
  await assert.rejects(encryptGallery({ root }), (error: Error) => {
    assert.equal(error.message.includes(secretText), false);
    return /keys.json/.test(error.message);
  });
});

test("publish mode strips image metadata, preserves organization, and isolates public cover keys", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  context.mock.method(globalThis, "fetch", fetchFromFixture(root));
  await encryptGallery({ root });
  const loverPath = path.join(root, "public/gallery-encrypted/lover/manifest.json");
  const unchangedLover = await readFile(loverPath);
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#c9d5b2" } })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Artist: "Private fixture creator", Model: "Private camera model" },
      IFD3: { GPSLatitude: "25/1 3/1 0/1", GPSLatitudeRef: "N", GPSLongitude: "121/1 30/1 0/1", GPSLongitudeRef: "E" },
    }).jpeg({ quality: 98 }).toBuffer();
  assert.ok((await sharp(original).metadata()).exif, "Fixture must contain EXIF to exercise removal");
  const organization = { date: "2026-09-22", year: 2026, section: "a-section", sequence: 3 };
  const source = { id: "fixture-photo", src: "photo.jpg", alt: { en: fixtureAlt, zh: "私密说明" }, caption: { en: "Private caption", zh: "私密标题" }, ...organization };
  for (const slug of ["life", "photography"]) {
    const local = path.join(root, ".private/gallery", slug);
    await mkdir(local, { recursive: true });
    await writeFile(path.join(local, "photo.jpg"), original);
    await writeFile(path.join(local, "photos.json"), JSON.stringify([source]));
  }
  await writeFile(path.join(root, ".private/gallery/publish.json"), JSON.stringify({
    defaults: { fullMaxDimension: 400, thumbnailMaxDimension: 200, fullLossless: true, thumbnailQuality: 94 },
    albums: { life: { access: "password", coverPhotoId: source.id }, photography: { access: "public", coverPhotoId: source.id } },
  }));
  assert.deepEqual(await encryptGallery({ root }), [{ slug: "life", photoCount: 1 }, { slug: "photography", photoCount: 1 }]);
  assert.deepEqual(await readFile(loverPath), unchangedLover, "Albums omitted from publish.json stay untouched");
  const publicData = JSON.parse(await readFile(path.join(root, "src/data/gallery-public.generated.json"), "utf8"));
  const privateData = JSON.parse(await readFile(path.join(root, "src/data/gallery-private.generated.json"), "utf8"));
  assert.deepEqual(Object.keys(privateData).sort(), ["life", "lover"]);
  const publicAlbum = publicData.albums.photography;
  const publicCover = publicData.covers.life;
  const publicUrl = (value: string) => `https://fixture.test/${value}`;
  const visible = await openPublicAlbum(publicUrl(publicAlbum.manifest), publicAlbum.viewKey);
  const privateAlbum = await unlockAlbum(publicUrl(privateData.life.manifest), fixturePassword);
  const cover = await openPublicAlbum(publicUrl(publicCover.manifest), publicCover.viewKey);
  assert.equal(visible.photos.length, 1);
  assert.equal(visible.key.extractable, false);
  for (const album of [visible, privateAlbum]) {
    for (const [field, value] of Object.entries(organization)) assert.equal(album.photos[0][field as keyof typeof organization], value);
    assert.equal(album.photos[0].width, 300);
    assert.equal(album.photos[0].height, 400);
    const full = Buffer.from(await (await decryptPhoto(album.photos[0], album.key)).arrayBuffer());
    const info = await sharp(full).metadata();
    assert.equal(info.format, "webp");
    assert.equal(info.exif, undefined);
    assert.equal(info.icc, undefined);
    assert.equal(info.orientation, undefined);
    assert.equal(full.includes(Buffer.from("Private fixture creator")), false);
    const expectedPixels = await sharp(original).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).raw().toBuffer();
    assert.deepEqual(await sharp(full).raw().toBuffer(), expectedPixels, "Lossless WebP preserves the resized display pixels");
    const thumbnail = Buffer.from(await (await decryptPhoto(album.photos[0], album.key, "thumbnail")).arrayBuffer());
    const thumbInfo = await sharp(thumbnail).metadata();
    assert.equal(thumbInfo.width, 150);
    assert.equal(thumbInfo.height, 200);
    assert.equal(thumbInfo.exif, undefined);
  }
  assert.equal(cover.photos[0].id, source.id);
  assert.equal(cover.photos[0].caption, undefined);
  assert.equal(cover.photos[0].date, undefined);
  assert.equal(cover.photos[0].section, undefined);
  assert.equal(new Set([publicAlbum.viewKey, publicCover.viewKey, publicData.covers.photography.viewKey]).size, 3);
  await assert.rejects(decryptPhoto(privateAlbum.photos[0], cover.key));
  await assert.rejects(openPublicAlbum(publicUrl(privateData.life.manifest), publicCover.viewKey), /does not support public viewing/);
  assert.equal(JSON.stringify(publicData).includes(fixturePassword), false);
  assert.equal(JSON.stringify(publicData).includes(fixtureAlt), false);
  const localOriginal = await readFile(path.join(root, ".private/gallery/life/photo.jpg"));
  assert.deepEqual(localOriginal, original, "Publishing never changes the locally backed-up original");
});
