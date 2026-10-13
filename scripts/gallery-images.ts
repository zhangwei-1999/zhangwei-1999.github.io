import sharp from "sharp";
import type { PhotoOrganization } from "../src/lib/galleryCryptoTypes.ts";

export interface SourcePhoto extends PhotoOrganization {
  id: string;
  src: string;
  alt: { en: string; zh: string };
  caption?: { en: string; zh: string };
}

export interface ImageDeliverySettings {
  fullMaxDimension: number;
  thumbnailMaxDimension: number;
  fullLossless: boolean;
  thumbnailQuality: number;
}

export interface AlbumPublishSettings {
  access: "password" | "public";
  coverPhotoId?: string;
  delivery?: Partial<ImageDeliverySettings>;
}

export interface GalleryPublishSettings {
  defaults?: Partial<ImageDeliverySettings>;
  albums: Record<string, AlbumPublishSettings>;
}

const defaults: ImageDeliverySettings = {
  fullMaxDimension: 2560,
  thumbnailMaxDimension: 960,
  fullLossless: true,
  thumbnailQuality: 94,
};

export function deliverySettings(...overrides: (Partial<ImageDeliverySettings> | undefined)[]) {
  const settings = Object.assign({}, defaults, ...overrides) as ImageDeliverySettings;
  if (![settings.fullMaxDimension, settings.thumbnailMaxDimension].every((value) => Number.isSafeInteger(value) && value >= 64 && value <= 8192) ||
    typeof settings.fullLossless !== "boolean" || !Number.isInteger(settings.thumbnailQuality) || settings.thumbnailQuality < 70 || settings.thumbnailQuality > 100) {
    throw new Error("Invalid delivery settings: dimensions must be 64–8192px; thumbnail quality must be 70–100.");
  }
  return settings;
}

export async function prepareImages(original: Buffer, settings?: ImageDeliverySettings) {
  const originalInfo = await sharp(original, { limitInputPixels: 100_000_000 }).metadata();
  const supported: Record<string, string | undefined> = {
    jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heif: "image/avif",
  };
  const originalMime = supported[originalInfo.format ?? ""];
  if (!originalMime || !originalInfo.width || !originalInfo.height || (originalInfo.format === "heif" && originalInfo.compression !== "av1")) {
    throw new Error("Gallery photos must be JPEG, PNG, WebP, GIF or AVIF images.");
  }
  const thumbnailSize = settings?.thumbnailMaxDimension ?? 480;
  // Sharp strips metadata by default. Deliberately never call keepMetadata or
  // withMetadata: EXIF/GPS, device details, filenames and embedded profiles stay local.
  const thumbnail = await sharp(original, { limitInputPixels: 100_000_000 })
    .rotate().resize({ width: thumbnailSize, height: thumbnailSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: settings?.thumbnailQuality ?? 86, effort: 5 }).toBuffer();
  if (settings) {
    const { data, info } = await sharp(original, { limitInputPixels: 100_000_000 })
      .rotate().resize({ width: settings.fullMaxDimension, height: settings.fullMaxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ lossless: settings.fullLossless, quality: 96, effort: 6 }).toBuffer({ resolveWithObject: true });
    return { full: data, thumbnail, width: info.width, height: info.height, mimeType: "image/webp" };
  }
  // Backward-compatible mode for earlier private albums; publish.json explicitly
  // opts actual uploads into the sanitized, optimized delivery pipeline above.
  const rotatesDimensions = originalInfo.orientation !== undefined && originalInfo.orientation >= 5;
  return {
    full: original,
    thumbnail,
    width: rotatesDimensions ? originalInfo.height : originalInfo.width,
    height: rotatesDimensions ? originalInfo.width : originalInfo.height,
    mimeType: originalMime,
  };
}
