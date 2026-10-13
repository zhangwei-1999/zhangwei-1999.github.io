/** Public format: only the album slug and photo count remain readable. */
export interface GalleryManifest {
  version: 1;
  slug: string;
  photoCount: number;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}

/** Public encrypted delivery is obfuscation in transit/storage, not access control. */
export interface PublicGalleryManifest {
  version: 2;
  access: "public";
  slug: string;
  photoCount: number;
  iv: string;
  ciphertext: string;
}

/** Server-authorized albums use a random key that is never derived in the browser. */
export interface ManagedGalleryManifest {
  version: 3;
  access: "managed";
  slug: string;
  photoCount: number;
  iv: string;
  ciphertext: string;
}

export interface PhotoOrganization {
  date?: string;
  year?: number;
  section?: string;
  sequence?: number;
}

export interface EncryptedPhotoMetadata extends PhotoOrganization {
  id: string;
  alt: { en: string; zh: string };
  caption?: { en: string; zh: string };
  width: number;
  height: number;
  mimeType: string;
  file: string;
  thumbnailFile: string;
}

export interface EncryptedPhoto extends PhotoOrganization {
  id: string;
  alt: { en: string; zh: string };
  caption?: { en: string; zh: string };
  width: number;
  height: number;
  mimeType: string;
  albumSlug: string;
  /** Encrypted URLs, never assign these directly to an image's src. */
  src: string;
  thumbnail: string;
}

export interface UnlockedAlbum {
  photos: EncryptedPhoto[];
  /** Non-extractable; keep in component memory only. */
  key: CryptoKey;
}

export const GALLERY_ITERATIONS = 600_000;
export const GALLERY_VERSION = 1;
export const galleryAdditionalData = (slug: string, resource: string) =>
  new TextEncoder().encode(`private-gallery:v1:${slug}:${resource}`);
