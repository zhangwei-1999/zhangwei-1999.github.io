import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { encryptGallery } from "../scripts/encrypt-gallery.ts";
import { migrateManagedGallery } from "../scripts/gallery-managed.ts";
import { decryptPhoto, openManagedAlbum, openPublicAlbum, unlockAlbum } from "../src/lib/encryptedGallery.ts";

const password = "synthetic migration fixture only";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const url = (file: string) => `https://managed-fixture.test/${file}`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "managed-gallery-"));
  const organization = { date: "2026-09-23", year: 2026, section: "birthday", sequence: 7 };
  const original = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c4d8cb" } }).png().toBuffer();
  for (const slug of ["life", "lover", "photography"]) {
    const local = path.join(root, ".private/gallery", slug);
    await mkdir(local, { recursive: true });
    await writeFile(path.join(local, "photo.png"), original);
    await writeFile(path.join(local, "photos.json"), JSON.stringify(slug === "lover" ? [] : [{
      id: "fixture-photo", src: "photo.png", alt: { en: "Fixture photo", zh: "测试照片" }, caption: { en: "Synthetic caption", zh: "测试说明" }, ...organization,
    }]));
  }
  await writeFile(path.join(root, ".private/gallery/keys.json"), JSON.stringify({ life: password, lover: password }));
  await writeFile(path.join(root, ".private/gallery/publish.json"), JSON.stringify({
    defaults: { fullMaxDimension: 256, thumbnailMaxDimension: 128, fullLossless: true, thumbnailQuality: 94 },
    albums: { life: { access: "password", coverPhotoId: "fixture-photo" }, lover: { access: "password" }, photography: { access: "public", coverPhotoId: "fixture-photo" } },
  }));
  await mkdir(path.join(root, ".private/analytics"), { recursive: true });
  const dataKeys = { life: randomBytes(32).toString("base64"), lover: randomBytes(32).toString("base64") };
  await writeFile(path.join(root, ".private/analytics/secrets.json"), JSON.stringify({
    albums: Object.fromEntries(Object.entries(dataKeys).map(([slug, dataKey]) => [slug, { dataKey, verifier: { salt: "fixture", hash: "fixture", iterations: 600000 } }])),
    adminVerifier: {}, resetVerifier: {}, auditKey: "fixture", ipHmacKey: "fixture", dashboardKey: "fixture",
  }));
  await encryptGallery({ root });
  return { root, dataKeys, original, organization };
}

async function treeHashes(directory: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await treeHashes(file, `${relative}/`));
    else result[relative] = digest(await readFile(file));
  }
  return result;
}

function fetchFrom(root: string) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const location = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return new Response(await readFile(path.join(root, "public", location.pathname)), { status: 200 });
  };
}

test("managed migration preserves prepared pixels and metadata, isolates keys, and backs up legacy bytes", async (context) => {
  const { root, dataKeys, original, organization } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  context.mock.method(globalThis, "fetch", fetchFrom(root));
  const lifePath = path.join(root, "public/gallery-encrypted/life");
  const oldLifeFiles = await treeHashes(lifePath);
  const oldLoverFiles = await treeHashes(path.join(root, "public/gallery-encrypted/lover"));
  const oldPublicFiles = await treeHashes(path.join(root, "public/gallery-encrypted/photography"));
  const oldCoverFiles = await treeHashes(path.join(root, "public/gallery-encrypted/covers"));
  const oldPublicDescriptor = await readFile(path.join(root, "src/data/gallery-public.generated.json"));
  const oldSession = await unlockAlbum(url("gallery-encrypted/life/manifest.json"), password);
  const beforeFull = Buffer.from(await (await decryptPhoto(oldSession.photos[0], oldSession.key)).arrayBuffer());
  const beforeThumbnail = Buffer.from(await (await decryptPhoto(oldSession.photos[0], oldSession.key, "thumbnail")).arrayBuffer());
  assert.deepEqual(await migrateManagedGallery({ root }), [
    { slug: "life", photoCount: 1, status: "migrated" }, { slug: "lover", photoCount: 0, status: "migrated" },
  ]);
  const manifest = JSON.parse(await readFile(path.join(lifePath, "manifest.json"), "utf8"));
  assert.equal(manifest.version, 3);
  assert.equal(manifest.access, "managed");
  assert.equal("salt" in manifest, false);
  assert.equal("iterations" in manifest, false);
  const session = await openManagedAlbum(url("gallery-encrypted/life/manifest.json"), dataKeys.life);
  assert.equal(session.key.extractable, false);
  assert.deepEqual(Buffer.from(await (await decryptPhoto(session.photos[0], session.key)).arrayBuffer()), beforeFull);
  assert.deepEqual(Buffer.from(await (await decryptPhoto(session.photos[0], session.key, "thumbnail")).arrayBuffer()), beforeThumbnail);
  for (const [field, value] of Object.entries(organization)) assert.equal(session.photos[0][field as keyof typeof organization], value);
  assert.deepEqual(session.photos[0].alt, oldSession.photos[0].alt);
  assert.deepEqual(session.photos[0].caption, oldSession.photos[0].caption);
  assert.notEqual(session.photos[0].src, oldSession.photos[0].src);
  await assert.rejects(unlockAlbum(url("gallery-encrypted/life/manifest.json"), password), /format is unsupported/);
  await assert.rejects(openPublicAlbum(url("gallery-encrypted/life/manifest.json"), dataKeys.life), /does not support public viewing/);
  await assert.rejects(decryptPhoto(session.photos[0], oldSession.key));
  await assert.rejects(openManagedAlbum(url("gallery-encrypted/life/manifest.json"), dataKeys.lover));
  assert.deepEqual((await openManagedAlbum(url("gallery-encrypted/lover/manifest.json"), dataKeys.lover)).photos, []);
  assert.deepEqual(await treeHashes(path.join(root, ".private/analytics/legacy-encrypted/life")), oldLifeFiles);
  assert.deepEqual(await treeHashes(path.join(root, ".private/analytics/legacy-encrypted/lover")), oldLoverFiles);
  assert.deepEqual(await treeHashes(path.join(root, "public/gallery-encrypted/photography")), oldPublicFiles);
  assert.deepEqual(await treeHashes(path.join(root, "public/gallery-encrypted/covers")), oldCoverFiles);
  assert.deepEqual(await readFile(path.join(root, "src/data/gallery-public.generated.json")), oldPublicDescriptor);
  assert.deepEqual(await readFile(path.join(root, ".private/gallery/life/photo.png")), original);
  const descriptors = JSON.parse(await readFile(path.join(root, "src/data/gallery-private.generated.json"), "utf8"));
  assert.equal(descriptors.life.access, "managed");
  assert.equal(descriptors.lover.access, "managed");
  for (const file of await readdir(lifePath)) {
    const bytes = await readFile(path.join(lifePath, file));
    assert.equal(bytes.includes(Buffer.from(password)), false);
    assert.equal(bytes.includes(Buffer.from(dataKeys.life)), false);
    assert.equal(bytes.includes(Buffer.from(dataKeys.life, "base64")), false);
    assert.equal(bytes.includes(beforeFull), false);
  }
  assert.equal((await readdir(path.join(root, "public/gallery-encrypted"))).some((file) => file.startsWith(".")), false);
  const published = await treeHashes(path.join(root, "public"));
  const generated = await readFile(path.join(root, "src/data/gallery-private.generated.json"));
  const backup = await treeHashes(path.join(root, ".private/analytics/legacy-encrypted"));
  await rm(path.join(root, ".private/gallery/keys.json"));
  assert.deepEqual(await migrateManagedGallery({ root }), [
    { slug: "life", photoCount: 1, status: "unchanged" }, { slug: "lover", photoCount: 0, status: "unchanged" },
  ]);
  assert.deepEqual(await treeHashes(path.join(root, "public")), published);
  assert.deepEqual(await readFile(path.join(root, "src/data/gallery-private.generated.json")), generated);
  assert.deepEqual(await treeHashes(path.join(root, ".private/analytics/legacy-encrypted")), backup);
});

test("managed reruns verify every image and reject corruption without changing the published album", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await migrateManagedGallery({ root });
  const directory = path.join(root, "public/gallery-encrypted/life");
  const stray = path.join(directory, "11111111-1111-1111-1111-111111111111.enc");
  await writeFile(stray, Buffer.alloc(32));
  await assert.rejects(migrateManagedGallery({ root }), /unexpected/);
  await rm(stray);
  const image = (await readdir(directory)).find((file) => file.endsWith(".enc"))!;
  const corrupted = await readFile(path.join(directory, image));
  corrupted[20] ^= 1;
  await writeFile(path.join(directory, image), corrupted);
  const before = await treeHashes(path.join(root, "public"));
  await assert.rejects(migrateManagedGallery({ root }));
  assert.deepEqual(await treeHashes(path.join(root, "public")), before);
});

test("failed legacy decryption leaves publication unchanged and removes staging artifacts", async (context) => {
  const { root } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "public/gallery-encrypted/life");
  const image = (await readdir(directory)).find((file) => file.endsWith(".enc"))!;
  const corrupted = await readFile(path.join(directory, image));
  corrupted[20] ^= 1;
  await writeFile(path.join(directory, image), corrupted);
  const before = await treeHashes(path.join(root, "public"));
  const descriptor = await readFile(path.join(root, "src/data/gallery-private.generated.json"));
  await assert.rejects(migrateManagedGallery({ root }));
  assert.deepEqual(await treeHashes(path.join(root, "public")), before);
  assert.deepEqual(await readFile(path.join(root, "src/data/gallery-private.generated.json")), descriptor);
  assert.equal((await readdir(path.join(root, "public/gallery-encrypted"))).some((file) => file.startsWith(".")), false);
});

test("future photo publishing retains managed access and fails closed when its server key is unavailable", async (context) => {
  const { root, dataKeys } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  context.mock.method(globalThis, "fetch", fetchFrom(root));
  await migrateManagedGallery({ root });
  await rm(path.join(root, ".private/gallery/keys.json"));
  await encryptGallery({ root, albumSlug: "life" });
  const manifest = JSON.parse(await readFile(path.join(root, "public/gallery-encrypted/life/manifest.json"), "utf8"));
  assert.equal(manifest.version, 3);
  assert.equal(manifest.access, "managed");
  assert.equal((await openManagedAlbum(url("gallery-encrypted/life/manifest.json"), dataKeys.life)).photos.length, 1);
  const descriptors = JSON.parse(await readFile(path.join(root, "src/data/gallery-private.generated.json"), "utf8"));
  assert.equal(descriptors.life.access, "managed");
  const before = await treeHashes(path.join(root, "public"));
  await rm(path.join(root, ".private/analytics/secrets.json"));
  await assert.rejects(encryptGallery({ root, albumSlug: "life" }), /local server secrets file/);
  assert.deepEqual(await treeHashes(path.join(root, "public")), before);
});
