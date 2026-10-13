import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GALLERY_ITERATIONS, galleryAdditionalData,
  type EncryptedPhotoMetadata, type GalleryManifest, type ManagedGalleryManifest,
} from "../src/lib/galleryCryptoTypes.ts";

interface PrivateDescriptor { manifest: string; photoCount: number; access?: "managed" }
interface ServerSecrets { albums?: Record<string, { dataKey?: unknown }> }

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const resourcePattern = /^[a-f0-9-]{36}\.enc$/;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function readJson<T>(file: string, label: string): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch { throw new Error(`Could not read ${label}; check that it exists and contains valid JSON.`); }
}

/** Never prints a key or derives it from an album password. */
export async function readManagedGalleryKey(root: string, slug: string) {
  if (!slugPattern.test(slug)) throw new Error("Invalid album slug.");
  const secrets = await readJson<ServerSecrets>(path.join(root, ".private/analytics/secrets.json"), "the local server secrets file");
  const encoded = secrets.albums?.[slug]?.dataKey;
  if (typeof encoded !== "string") throw new Error(`No managed data key is configured for ${slug}.`);
  const raw = Buffer.from(encoded, "base64");
  if (raw.length !== 32 || raw.toString("base64") !== encoded) throw new Error(`The managed data key for ${slug} must be 32 random bytes in base64.`);
  const key = await webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  raw.fill(0);
  return key;
}

async function deriveLegacyKey(root: string, slug: string, manifest: GalleryManifest) {
  if (manifest.iterations !== GALLERY_ITERATIONS) throw new Error("Unsupported legacy key derivation settings.");
  const keys = await readJson<Record<string, unknown>>(path.join(root, ".private/gallery/keys.json"), "the local legacy album keys file");
  const password = keys[slug];
  if (typeof password !== "string" || !password) throw new Error(`No legacy password is configured for ${slug}.`);
  const salt = Buffer.from(manifest.salt, "base64");
  if (salt.length !== 16) throw new Error("Invalid legacy salt.");
  const raw = new TextEncoder().encode(password);
  const material = await webcrypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]);
  raw.fill(0);
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: GALLERY_ITERATIONS },
    material, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
}

async function decryptManifest(manifest: GalleryManifest | ManagedGalleryManifest, key: webcrypto.CryptoKey) {
  const iv = Buffer.from(manifest.iv, "base64");
  if (iv.length !== 12) throw new Error("Invalid manifest IV.");
  const plain = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: galleryAdditionalData(manifest.slug, "manifest") },
    key, Buffer.from(manifest.ciphertext, "base64"),
  );
  const photos: EncryptedPhotoMetadata[] = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(photos) || photos.length !== manifest.photoCount || !photos.every((photo) =>
    typeof photo.id === "string" && resourcePattern.test(photo.file) && resourcePattern.test(photo.thumbnailFile))) {
    throw new Error("Invalid encrypted photo metadata.");
  }
  const files = photos.flatMap((photo) => [photo.file, photo.thumbnailFile]);
  if (new Set(files).size !== files.length) throw new Error("Each encrypted image must have a unique resource filename.");
  return photos;
}

async function decryptResource(directory: string, slug: string, resource: string, key: webcrypto.CryptoKey) {
  if (!resourcePattern.test(resource)) throw new Error("Unsafe encrypted resource filename.");
  const file = path.join(directory, resource);
  const actual = await realpath(file);
  if (path.dirname(actual) !== directory || !(await stat(actual)).isFile()) throw new Error("Encrypted resources must remain inside their album directory.");
  const bytes = await readFile(actual);
  if (bytes.length <= 28) throw new Error("Encrypted image is incomplete.");
  return Buffer.from(await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: galleryAdditionalData(slug, resource) },
    key, bytes.subarray(12),
  ));
}

async function verifyResourceListing(directory: string, photos: EncryptedPhotoMetadata[]) {
  const expected = new Set(["manifest.json", ...photos.flatMap((photo) => [photo.file, photo.thumbnailFile])]);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== expected.size || entries.some((entry) => !entry.isFile() || !expected.has(entry.name))) {
    throw new Error("Encrypted album contains missing, unexpected, or nonregular resources.");
  }
}

async function encryptBytes(bytes: Buffer, slug: string, resource: string, key: webcrypto.CryptoKey) {
  const iv = randomBytes(12);
  const ciphertext = Buffer.from(await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: galleryAdditionalData(slug, resource) }, key, new Uint8Array(bytes),
  ));
  return { iv, ciphertext };
}

async function snapshotFiles(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) throw new Error("Encrypted album snapshots must contain regular files only.");
  return Object.fromEntries(await Promise.all(entries.map(async (entry) => [entry.name, digest(await readFile(path.join(directory, entry.name)))])));
}

async function backupLegacy(root: string, slug: string, directory: string) {
  const parent = path.join(root, ".private/analytics/legacy-encrypted");
  const backup = path.join(parent, slug);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const snapshot = await snapshotFiles(directory);
  const exists = await stat(backup).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (exists) {
    if (!exists.isDirectory()) throw new Error("The legacy backup destination is not a directory.");
    const old = await snapshotFiles(backup);
    if (Object.keys(old).length !== Object.keys(snapshot).length || Object.entries(snapshot).some(([file, hash]) => old[file] !== hash)) {
      throw new Error(`The existing ${slug} backup differs from the current legacy album; preserve it before migrating again.`);
    }
    return;
  }
  const temporary = path.join(parent, `.${slug}-backup-${randomUUID()}`);
  await mkdir(temporary, { mode: 0o700 });
  try {
    for (const file of Object.keys(snapshot)) await copyFile(path.join(directory, file), path.join(temporary, file));
    const copied = await snapshotFiles(temporary);
    if (Object.entries(snapshot).some(([file, hash]) => copied[file] !== hash)) throw new Error("Legacy encrypted backup verification failed.");
    await rename(temporary, backup);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function atomicJson(file: string, value: unknown) {
  const temporary = path.join(path.dirname(file), `.managed-gallery-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

/** Re-encrypt existing delivery bytes locally; no original photo reads or resampling. */
export async function migrateManagedGallery({ root, slugs = ["life", "lover"] }: { root: string; slugs?: string[] }) {
  if (!slugs.length || slugs.some((slug) => !slugPattern.test(slug)) || new Set(slugs).size !== slugs.length) throw new Error("Provide unique, valid album slugs.");
  const publicRoot = await realpath(path.join(root, "public/gallery-encrypted"));
  const generatedPath = path.join(root, "src/data/gallery-private.generated.json");
  const generated = await readJson<Record<string, PrivateDescriptor>>(generatedPath, "the generated private gallery descriptors");
  const result: { slug: string; photoCount: number; status: "migrated" | "unchanged" }[] = [];
  for (const slug of slugs) {
    const directory = await realpath(path.join(publicRoot, slug));
    if (path.dirname(directory) !== publicRoot) throw new Error("Album directory must remain inside gallery-encrypted.");
    const manifest = await readJson<GalleryManifest | ManagedGalleryManifest>(path.join(directory, "manifest.json"), "the encrypted manifest");
    if (manifest.slug !== slug || !Number.isSafeInteger(manifest.photoCount) || manifest.photoCount < 0 || ![1, 3].includes(manifest.version)) throw new Error("Only valid private v1/v3 albums may be migrated.");
    const descriptor = generated[slug];
    if (!descriptor || descriptor.photoCount !== manifest.photoCount || descriptor.manifest !== `gallery-encrypted/${slug}/manifest.json`) throw new Error(`The ${slug} descriptor does not match its encrypted album.`);
    const newKey = await readManagedGalleryKey(root, slug);
    if (manifest.version === 3) {
      if (manifest.access !== "managed" || "salt" in manifest || "iterations" in manifest) throw new Error("Invalid managed manifest.");
      const photos = await decryptManifest(manifest, newKey);
      await verifyResourceListing(directory, photos);
      for (const photo of photos) for (const resource of [photo.file, photo.thumbnailFile]) await decryptResource(directory, slug, resource, newKey);
      if (descriptor.access !== "managed") {
        generated[slug] = { ...descriptor, access: "managed" };
        await atomicJson(generatedPath, generated);
      }
      result.push({ slug, photoCount: photos.length, status: "unchanged" });
      continue;
    }
    const oldKey = await deriveLegacyKey(root, slug, manifest);
    const photos = await decryptManifest(manifest, oldKey);
    await verifyResourceListing(directory, photos);
    await backupLegacy(root, slug, directory);
    const stage = path.join(publicRoot, `.${slug}-managed-stage-${randomUUID()}`);
    await mkdir(stage);
    const rollbackParent = path.join(root, ".private/analytics/migration-rollback");
    const rollback = path.join(rollbackParent, `${slug}-${randomUUID()}`);
    let previousMoved = false;
    let published = false;
    try {
      const updated: EncryptedPhotoMetadata[] = [];
      for (const photo of photos) {
        const next = { ...photo };
        for (const field of ["file", "thumbnailFile"] as const) {
          const plain = await decryptResource(directory, slug, photo[field], oldKey);
          const filename = `${randomUUID()}.enc`;
          const encrypted = await encryptBytes(plain, slug, filename, newKey);
          await writeFile(path.join(stage, filename), Buffer.concat([encrypted.iv, encrypted.ciphertext]));
          next[field] = filename;
        }
        updated.push(next);
      }
      const encrypted = await encryptBytes(Buffer.from(JSON.stringify(updated)), slug, "manifest", newKey);
      const nextManifest: ManagedGalleryManifest = { version: 3, access: "managed", slug, photoCount: updated.length, iv: encrypted.iv.toString("base64"), ciphertext: encrypted.ciphertext.toString("base64") };
      await writeFile(path.join(stage, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`);
      await mkdir(rollbackParent, { recursive: true, mode: 0o700 });
      await rename(directory, rollback);
      previousMoved = true;
      await rename(stage, directory);
      published = true;
      generated[slug] = { ...descriptor, access: "managed" };
      await atomicJson(generatedPath, generated);
      previousMoved = false;
      await rm(rollback, { recursive: true, force: true });
      result.push({ slug, photoCount: updated.length, status: "migrated" });
    } catch (error) {
      generated[slug] = descriptor;
      if (previousMoved) {
        if (published) await rm(directory, { recursive: true, force: true });
        await rename(rollback, directory);
        await atomicJson(generatedPath, generated);
      }
      throw error;
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateManagedGallery({ root: process.cwd(), slugs: process.argv.length > 2 ? process.argv.slice(2) : undefined })
    .then((albums) => albums.forEach(({ slug, photoCount, status }) => console.log(`${slug}: ${photoCount} photos, ${status}.`)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Managed gallery migration failed.");
      process.exitCode = 1;
    });
}
