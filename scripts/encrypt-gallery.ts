import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GALLERY_ITERATIONS, galleryAdditionalData,
  type EncryptedPhotoMetadata, type GalleryManifest, type PublicGalleryManifest, type ManagedGalleryManifest,
} from "../src/lib/galleryCryptoTypes.ts";
import {
  deliverySettings, prepareImages,
  type SourcePhoto, type ImageDeliverySettings, type GalleryPublishSettings,
} from "./gallery-images.ts";
import { readManagedGalleryKey } from "./gallery-managed.ts";

interface AlbumOutput { photoCount: number; manifest: string; access?: "managed" }
interface PublicAlbumOutput extends AlbumOutput { viewKey: string }
interface PublicOutput {
  albums: Record<string, PublicAlbumOutput>;
  covers: Record<string, { manifest: string; viewKey: string; photoId: string }>;
}
interface EncryptionContext {
  key: webcrypto.CryptoKey;
  viewKey?: string;
  salt?: string;
  managed?: boolean;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const inside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
};
function isLocalized(value: unknown): value is { en: string; zh: string } {
  return typeof value === "object" && value !== null && "en" in value &&
    typeof value.en === "string" && "zh" in value && typeof value.zh === "string";
}
function validatePhotos(value: unknown): asserts value is SourcePhoto[] {
  if (!Array.isArray(value)) throw new Error("photos.json must contain an array.");
  const ids = new Set<string>();
  for (const photo of value) {
    if (typeof photo !== "object" || photo === null || typeof photo.id !== "string" ||
      !photo.id || ids.has(photo.id) || typeof photo.src !== "string" || !photo.src ||
      path.isAbsolute(photo.src) || !isLocalized(photo.alt) ||
      (photo.caption !== undefined && !isLocalized(photo.caption)) ||
      (photo.date !== undefined && (typeof photo.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(photo.date))) ||
      (photo.year !== undefined && (!Number.isInteger(photo.year) || photo.year < 1)) ||
      (photo.section !== undefined && typeof photo.section !== "string") ||
      (photo.sequence !== undefined && (!Number.isSafeInteger(photo.sequence) || photo.sequence < 0))) {
      throw new Error("Invalid photo metadata; IDs must be unique, paths relative, and date/group fields valid.");
    }
    ids.add(photo.id);
  }
}

async function readOptionalJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.gallery-generated-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

async function createEncryption(password?: string): Promise<EncryptionContext> {
  if (password === undefined) {
    const raw = randomBytes(32);
    const viewKey = raw.toString("base64");
    const key = await webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
    raw.fill(0);
    return { key, viewKey };
  }
  const salt = randomBytes(16);
  const passwordBytes = new TextEncoder().encode(password);
  const passwordKey = await webcrypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
  passwordBytes.fill(0);
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: GALLERY_ITERATIONS },
    passwordKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  return { key, salt: salt.toString("base64") };
}

async function writeEncryptedSet({ root, albumRoot, slug, output, photos, encryption, delivery }: {
  root: string;
  albumRoot: string;
  slug: string;
  output: string;
  photos: SourcePhoto[];
  encryption: EncryptionContext;
  delivery?: ImageDeliverySettings;
}) {
  const destination = path.join(root, "public", output);
  const outputParent = path.dirname(destination);
  await mkdir(outputParent, { recursive: true });
  const stage = path.join(outputParent, `.${slug}-stage-${randomUUID()}`);
  await mkdir(stage);
  const metadata: EncryptedPhotoMetadata[] = [];
  const encrypt = async (plain: Uint8Array, resource: string) => {
    const iv = randomBytes(12);
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: galleryAdditionalData(slug, resource) },
      encryption.key, new Uint8Array(plain),
    );
    return { iv, ciphertext: Buffer.from(ciphertext) };
  };
  try {
    for (const photo of photos) {
      const lexicalPath = path.resolve(albumRoot, photo.src);
      if (!inside(albumRoot, lexicalPath)) throw new Error("Photo paths must stay inside their private album directory.");
      const source = await realpath(lexicalPath);
      if (!inside(albumRoot, source) || !(await stat(source)).isFile()) {
        throw new Error("Photos must be regular files inside their private album directory; external symlinks are not allowed.");
      }
      const images = await prepareImages(await readFile(source), delivery);
      const file = `${randomUUID()}.enc`;
      const thumbnailFile = `${randomUUID()}.enc`;
      const full = await encrypt(images.full, file);
      const thumb = await encrypt(images.thumbnail, thumbnailFile);
      await writeFile(path.join(stage, file), Buffer.concat([full.iv, full.ciphertext]));
      await writeFile(path.join(stage, thumbnailFile), Buffer.concat([thumb.iv, thumb.ciphertext]));
      metadata.push({
        id: photo.id, alt: photo.alt, caption: photo.caption,
        date: photo.date, year: photo.year, section: photo.section, sequence: photo.sequence,
        width: images.width, height: images.height, mimeType: images.mimeType, file, thumbnailFile,
      });
    }
    const encrypted = await encrypt(new TextEncoder().encode(JSON.stringify(metadata)), "manifest");
    const common = { slug, photoCount: metadata.length, iv: encrypted.iv.toString("base64"), ciphertext: encrypted.ciphertext.toString("base64") };
    const manifest: GalleryManifest | PublicGalleryManifest | ManagedGalleryManifest = encryption.managed
      ? { version: 3, access: "managed", ...common }
      : encryption.salt
        ? { version: 1, salt: encryption.salt, iterations: GALLERY_ITERATIONS, ...common }
        : { version: 2, access: "public", ...common };
    await writeFile(path.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const previous = path.join(outputParent, `.${slug}-previous-${randomUUID()}`);
    let movedPrevious = false;
    try { await rename(destination, previous); movedPrevious = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await rename(stage, destination); }
    catch (error) { if (movedPrevious) await rename(previous, destination); throw error; }
    if (movedPrevious) await rm(previous, { recursive: true, force: true });
    return { photoCount: metadata.length, manifest: `${output}/manifest.json`, ...(encryption.managed ? { access: "managed" as const } : {}) };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

/** Local preprocessing only: never call this from a Pages build or CI. */
export async function encryptGallery({ root, albumSlug }: { root: string; albumSlug?: string }) {
  const privateRoot = path.join(root, ".private/gallery");
  const canonicalPrivateRoot = await realpath(privateRoot);
  const settings = await readOptionalJson<GalleryPublishSettings | null>(path.join(privateRoot, "publish.json"), null);
  if (settings && (typeof settings.albums !== "object" || settings.albums === null || Array.isArray(settings.albums))) {
    throw new Error("publish.json must contain an albums object.");
  }
  let keys: Record<string, unknown> | undefined;
  const readKeys = async () => {
    if (keys) return keys;
    try { keys = JSON.parse(await readFile(path.join(privateRoot, "keys.json"), "utf8")); }
    catch { throw new Error("Could not read the local keys.json file. Check its existence and JSON syntax."); }
    if (typeof keys !== "object" || keys === null || Array.isArray(keys)) throw new Error("Invalid local keys file.");
    return keys;
  };
  const slugs = albumSlug ? [albumSlug] : settings ? Object.keys(settings.albums) : Object.keys(await readKeys());
  if (!slugs.length) throw new Error("No albums configured.");
  const privatePath = path.join(root, "src/data/gallery-private.generated.json");
  const publicPath = path.join(root, "src/data/gallery-public.generated.json");
  const privateData = await readOptionalJson<Record<string, AlbumOutput>>(privatePath, {});
  const publicData = await readOptionalJson<PublicOutput>(publicPath, { albums: {}, covers: {} });
  const completed: { slug: string; photoCount: number }[] = [];
  for (const slug of slugs) {
    if (!slugPattern.test(slug)) throw new Error("Each requested album needs a valid slug.");
    const configuration = settings?.albums[slug];
    if (configuration && !["password", "public"].includes(configuration.access)) throw new Error("Album access must be password or public.");
    const access = configuration?.access ?? "password";
    const currentManifest = await readOptionalJson<{ version?: number } | null>(path.join(root, "public/gallery-encrypted", slug, "manifest.json"), null);
    const managed = access === "password" && (currentManifest?.version === 3 || privateData[slug]?.access === "managed");
    let password: string | undefined;
    if (access === "password" && !managed) {
      const value = (await readKeys())[slug];
      if (typeof value !== "string" || !value) throw new Error("Each private album needs a nonempty local key.");
      password = value;
    }
    const albumRoot = await realpath(path.join(privateRoot, slug));
    if (!inside(canonicalPrivateRoot, albumRoot)) throw new Error("Album directory must stay inside the private gallery directory.");
    const sourceList = await realpath(path.join(albumRoot, "photos.json"));
    if (!inside(albumRoot, sourceList)) throw new Error("Photo metadata must stay inside its private album directory.");
    const photos: unknown = JSON.parse(await readFile(sourceList, "utf8"));
    validatePhotos(photos);
    const cover = configuration?.coverPhotoId ? photos.find((photo) => photo.id === configuration.coverPhotoId) : undefined;
    if (configuration?.coverPhotoId && !cover) throw new Error(`Configured cover photo does not exist in ${slug}.`);
    const delivery = settings ? deliverySettings(settings.defaults, configuration?.delivery) : undefined;
    // Once migrated, publishing must never silently return to password-derived
    // encryption. Missing server key material fails closed instead of downgrading.
    const encryption: EncryptionContext = managed
      ? { key: await readManagedGalleryKey(root, slug), managed: true }
      : await createEncryption(password);
    const output = await writeEncryptedSet({ root, albumRoot, slug, output: `gallery-encrypted/${slug}`, photos, encryption, delivery });
    if (access === "public") {
      publicData.albums[slug] = { ...output, viewKey: encryption.viewKey! };
      delete privateData[slug];
    } else {
      privateData[slug] = output;
      delete publicData.albums[slug];
    }
    if (cover) {
      // Publishing a cover never exposes the protected album key or captions.
      const coverEncryption = await createEncryption();
      const coverDelivery = deliverySettings(delivery, { fullMaxDimension: Math.min(delivery?.fullMaxDimension ?? 1280, 1280) });
      const coverOutput = await writeEncryptedSet({
        root, albumRoot, slug: `cover-${slug}`, output: `gallery-encrypted/covers/${slug}`,
        photos: [{ id: cover.id, src: cover.src, alt: { en: `${slug} album cover`, zh: `${slug} 相册封面` } }],
        encryption: coverEncryption, delivery: coverDelivery,
      });
      publicData.covers[slug] = { manifest: coverOutput.manifest, viewKey: coverEncryption.viewKey!, photoId: cover.id };
    }
    await atomicJson(privatePath, privateData);
    // Avoid creating an unrelated public data file for legacy private-only runs.
    if (settings || Object.keys(publicData.albums).length || Object.keys(publicData.covers).length) await atomicJson(publicPath, publicData);
    completed.push({ slug, photoCount: output.photoCount });
  }
  return completed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) {
    console.error("Usage: npm run gallery:encrypt -- [album-slug]");
    process.exitCode = 1;
  } else {
    encryptGallery({ root: process.cwd(), albumSlug: process.argv[2] })
      .then((albums) => albums.forEach(({ slug, photoCount }) => console.log(`Encrypted ${slug}: ${photoCount} photos.`)))
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : "Gallery encryption failed.");
        process.exitCode = 1;
      });
  }
}
