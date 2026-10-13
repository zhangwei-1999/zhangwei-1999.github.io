import {
  GALLERY_ITERATIONS,
  galleryAdditionalData,
  type EncryptedPhoto,
  type EncryptedPhotoMetadata,
  type GalleryManifest,
  type PublicGalleryManifest,
  type ManagedGalleryManifest,
  type UnlockedAlbum,
} from "./galleryCryptoTypes";

export type { EncryptedPhoto, UnlockedAlbum } from "./galleryCryptoTypes";

export class GalleryUnlockError extends Error {
  constructor() {
    super("The password is incorrect or this album could not be verified.");
    this.name = "GalleryUnlockError";
  }
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function isLocalized(value: unknown): value is { en: string; zh: string } {
  return typeof value === "object" && value !== null && "en" in value &&
    typeof value.en === "string" && "zh" in value && typeof value.zh === "string";
}

function isMetadata(value: unknown): value is EncryptedPhotoMetadata {
  if (typeof value !== "object" || value === null) return false;
  const photo = value as EncryptedPhotoMetadata;
  return typeof photo.id === "string" && isLocalized(photo.alt) &&
    (photo.caption === undefined || isLocalized(photo.caption)) &&
    (photo.date === undefined || /^\d{4}-\d{2}-\d{2}$/.test(photo.date)) &&
    (photo.year === undefined || (Number.isInteger(photo.year) && photo.year > 0)) &&
    (photo.section === undefined || typeof photo.section === "string") &&
    (photo.sequence === undefined || (Number.isSafeInteger(photo.sequence) && photo.sequence >= 0)) &&
    Number.isSafeInteger(photo.width) && photo.width > 0 &&
    Number.isSafeInteger(photo.height) && photo.height > 0 &&
    /^image\/(jpeg|png|webp|gif|avif)$/.test(photo.mimeType) &&
    /^[a-f0-9-]{36}\.enc$/.test(photo.file) &&
    /^[a-f0-9-]{36}\.enc$/.test(photo.thumbnailFile);
}

async function readManifest(manifestUrl: string, signal?: AbortSignal) {
  const response = await fetch(manifestUrl, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The encrypted album could not be loaded.");
  const manifest = await response.json() as GalleryManifest | PublicGalleryManifest | ManagedGalleryManifest;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug) ||
    !Number.isSafeInteger(manifest.photoCount) || manifest.photoCount < 0 ||
    typeof manifest.iv !== "string" || typeof manifest.ciphertext !== "string") {
    throw new Error("The encrypted album format is unsupported.");
  }
  return manifest;
}

async function decryptManifest(
  manifest: GalleryManifest | PublicGalleryManifest | ManagedGalleryManifest,
  manifestUrl: string,
  key: CryptoKey,
  signal?: AbortSignal,
): Promise<UnlockedAlbum> {
  const iv = fromBase64(manifest.iv);
  if (iv.length !== 12) throw new Error("Invalid encryption parameters.");
  signal?.throwIfAborted();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: galleryAdditionalData(manifest.slug, "manifest") },
    key, fromBase64(manifest.ciphertext),
  );
  const photos: EncryptedPhotoMetadata[] = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(photos) || photos.length !== manifest.photoCount || !photos.every(isMetadata)) {
    throw new Error("Invalid encrypted metadata.");
  }
  signal?.throwIfAborted();
  const resolvedManifest = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/");
  return {
    key,
    photos: photos.map((photo) => ({
      id: photo.id,
      alt: photo.alt,
      caption: photo.caption,
      date: photo.date,
      year: photo.year,
      section: photo.section,
      sequence: photo.sequence,
      width: photo.width,
      height: photo.height,
      mimeType: photo.mimeType,
      albumSlug: manifest.slug,
      src: new URL(photo.file, resolvedManifest).href,
      thumbnail: new URL(photo.thumbnailFile, resolvedManifest).href,
    })),
  };
}

/** Passwords and keys are never persisted. A reload or leaving the album locks it. */
export async function unlockAlbum(
  manifestUrl: string,
  password: string,
  signal?: AbortSignal,
): Promise<UnlockedAlbum> {
  const manifest = await readManifest(manifestUrl, signal);
  if (manifest.version !== 1 || manifest.iterations !== GALLERY_ITERATIONS || typeof manifest.salt !== "string") {
    throw new Error("The encrypted album format is unsupported.");
  }
  try {
    const salt = fromBase64(manifest.salt);
    if (salt.length !== 16) throw new Error("Invalid encryption parameters.");
    const passwordKey = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", iterations: manifest.iterations, salt },
      passwordKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
    );
    return await decryptManifest(manifest, manifestUrl, key, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new GalleryUnlockError();
  }
}

/** Public albums/covers have an intentionally public view key; no password prompt. */
export async function openPublicAlbum(
  manifestUrl: string,
  viewKey: string,
  signal?: AbortSignal,
): Promise<UnlockedAlbum> {
  const manifest = await readManifest(manifestUrl, signal);
  if (manifest.version !== 2 || manifest.access !== "public") {
    throw new Error("This album does not support public viewing.");
  }
  const raw = fromBase64(viewKey);
  if (raw.length !== 32) throw new Error("The public view key is invalid.");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  raw.fill(0);
  return decryptManifest(manifest, manifestUrl, key, signal);
}

/** The server supplies this random key only after successful authorization. */
export async function openManagedAlbum(
  manifestUrl: string,
  viewKey: string,
  signal?: AbortSignal,
): Promise<UnlockedAlbum> {
  const manifest = await readManifest(manifestUrl, signal);
  if (manifest.version !== 3 || manifest.access !== "managed") {
    throw new Error("This album does not support managed access.");
  }
  const raw = fromBase64(viewKey);
  if (raw.length !== 32) throw new Error("The authorized gallery key is invalid.");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  raw.fill(0);
  return decryptManifest(manifest, manifestUrl, key, signal);
}

/** Decrypt only the visible thumbnail/full image; callers own/revoke object URLs. */
export async function decryptPhoto(
  photo: EncryptedPhoto,
  key: CryptoKey,
  kind: "full" | "thumbnail" = "full",
  signal?: AbortSignal,
): Promise<Blob> {
  const url = kind === "thumbnail" ? photo.thumbnail : photo.src;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The encrypted photo could not be loaded.");
  const encrypted = await response.arrayBuffer();
  if (encrypted.byteLength <= 28) throw new Error("The encrypted photo is incomplete.");
  const filename = new URL(url).pathname.split("/").at(-1)!;
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: encrypted.slice(0, 12),
      additionalData: galleryAdditionalData(photo.albumSlug, filename),
    },
    key, encrypted.slice(12),
  );
  signal?.throwIfAborted();
  return new Blob([decrypted], { type: kind === "thumbnail" ? "image/webp" : photo.mimeType });
}
