import { createCipheriv, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { EncryptedPhotoMetadata, GalleryManifest } from "../../src/lib/galleryCryptoTypes";

// Synthetic test-only passwords and solid-color images. Never read owner keys,
// .private/, original personal photographs, or any persistent album session.
export interface FixturePhoto {
  alt?: { en: string; zh: string };
  width?: number;
  height?: number;
  date?: string;
  year?: number;
  section?: string;
  sequence?: number;
}

export interface EncryptedFixture {
  slug: string;
  manifest: GalleryManifest;
  images: Map<string, Buffer>;
  photos: EncryptedPhotoMetadata[];
}

function encrypt(plain: Buffer, key: Buffer, slug: string, resource: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`private-gallery:v1:${slug}:${resource}`));
  return {
    iv,
    ciphertext: Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]),
  };
}

export async function makeEncryptedFixture(slug: string, password: string, descriptions: FixturePhoto[] = [{}, {}]): Promise<EncryptedFixture> {
  const iterations = 600_000;
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const images = new Map<string, Buffer>();
  const photos = await Promise.all(descriptions.map(async (description, index) => {
    const width = description.width ?? 20;
    const height = description.height ?? 12;
    const image = await sharp({ create: {
      width, height, channels: 3,
      background: index % 2 ? "#e8d5cb" : "#c8dce8",
    } }).webp({ lossless: true }).toBuffer();
    const file = `${randomUUID()}.enc`;
    const thumbnailFile = `${randomUUID()}.enc`;
    for (const filename of [file, thumbnailFile]) {
      const encrypted = encrypt(image, key, slug, filename);
      images.set(filename, Buffer.concat([encrypted.iv, encrypted.ciphertext]));
    }
    return {
      id: `${slug}-fixture-${index + 1}`,
      alt: description.alt ?? { en: `${slug} fixture image ${index + 1}`, zh: `${slug} 测试图 ${index + 1}` },
      width, height, date: description.date, year: description.year,
      section: description.section, sequence: description.sequence,
      mimeType: "image/webp", file, thumbnailFile,
    };
  }));
  const encrypted = encrypt(Buffer.from(JSON.stringify(photos)), key, slug, "manifest");
  key.fill(0);
  return {
    slug, photos, images,
    manifest: { version: 1, slug, photoCount: photos.length, iterations,
      salt: salt.toString("base64"), iv: encrypted.iv.toString("base64"), ciphertext: encrypted.ciphertext.toString("base64") },
  };
}

export async function interceptEncryptedFixtures(page: Page, fixtures: EncryptedFixture[]) {
  const requests: string[] = [];
  await page.route("**/gallery-encrypted/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requests.push(pathname);
    const fixture = fixtures.find((item) => pathname.includes(`/gallery-encrypted/${item.slug}/`));
    if (!fixture) return route.fulfill({ status: 404, body: "Fixture not found" });
    const filename = pathname.split("/").at(-1)!;
    if (filename === "manifest.json") return route.fulfill({
      contentType: "application/json", body: JSON.stringify(fixture.manifest),
    });
    const body = fixture.images.get(filename);
    return body
      ? route.fulfill({ contentType: "application/octet-stream", body })
      : route.fulfill({ status: 404, body: "Fixture not found" });
  });
  return requests;
}
