import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { gallery } from "../src/data/gallery";
import { profile } from "../src/data/profile";
import { pageMeta } from "../src/lib/seo";
import { galleryAdditionalData, type GalleryManifest, type PublicGalleryManifest, type ManagedGalleryManifest } from "../src/lib/galleryCryptoTypes";

/** Verify the actual deployment files; no dev-server SPA fallback is involved. */
const directory = resolve(process.argv[2] || "dist");
const errors: string[] = [];
const checkedFiles = new Set<string>();
const htmlDocuments = new Map<string, string>();
let deploymentBytes = 0;
const decodeHtml = (value: string) =>
  value.replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[\da-f]+);/gi, (entity) => {
    const known: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
    };
    const normalized = entity.toLowerCase();
    if (known[normalized]) return known[normalized];
    return String.fromCodePoint(
      normalized.startsWith("&#x")
        ? parseInt(normalized.slice(3, -1), 16)
        : Number(normalized.slice(2, -1)),
    );
  });
const attributes = (tag: string) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
      (match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3])],
    ),
  );
const tags = (html: string, names: string) =>
  [...html.matchAll(new RegExp(`<(${names})\\b[^>]*>`, "gi"))].map((match) => ({
    name: match[1].toLowerCase(),
    attributes: attributes(match[0]),
  }));
const normalizeBase = (value: string) =>
  `/${value.split("/").filter(Boolean).join("/")}/`.replace(/^\/\/$/, "/");

const home = await readFile(resolve(directory, "index.html"), "utf8");
const root = tags(home, "div").find(
  (tag) => tag.attributes.id === "root",
)?.attributes;
assert.ok(
  root?.["data-base-path"],
  "Static HTML must identify its asset base path.",
);
assert.ok(
  root["data-site-url"],
  "Static HTML must identify its canonical site URL.",
);
const base = root["data-base-path"];
assert.equal(
  base,
  normalizeBase(base),
  "The built base must have leading and trailing slashes.",
);
if (process.env.PAGES_BASE_PATH)
  assert.equal(
    base,
    normalizeBase(process.env.PAGES_BASE_PATH),
    "Built asset base differs from PAGES_BASE_PATH.",
  );

const site = new URL(root["data-site-url"]);
assert.ok(
  ["http:", "https:"].includes(site.protocol),
  "Canonical site URL must use HTTP(S).",
);
assert.equal(
  site.pathname,
  base,
  "Canonical site path must match the configured asset base.",
);
assert.equal(
  site.search + site.hash,
  "",
  "Canonical site URL cannot have query parameters or a fragment.",
);
if (process.env.SITE_URL)
  assert.equal(
    site.href,
    new URL(`${process.env.SITE_URL.replace(/\/$/, "")}/`).href,
    "Built canonical URL differs from SITE_URL.",
  );
else
  assert.equal(
    site.origin,
    new URL(profile.siteUrl).origin,
    "Default canonical origin differs from profile.siteUrl.",
  );

const routes = [
  "/",
  "/publications",
  "/news",
  "/awards",
  "/gallery",
  ...gallery.map((album) => `/gallery/${album.slug}`),
  "/404",
];
const routeUrl = (route: string) =>
  new URL(route === "/" ? "" : `${route.slice(1)}/`, site).href;

async function verifyLocalUrl(raw: string, pageUrl: string, context: string) {
  if (!raw || /^(?:data:|mailto:|tel:|blob:|#)/i.test(raw)) return;
  const url = new URL(raw, pageUrl);
  if (url.origin !== site.origin) return;
  assert.ok(
    url.pathname.startsWith(base),
    `${context}: ${raw} escapes the deployed base ${base}.`,
  );
  const relative = decodeURIComponent(url.pathname.slice(base.length));
  let file = resolve(directory, relative);
  assert.ok(
    file === directory || file.startsWith(`${directory}${sep}`),
    `${context}: unsafe path ${raw}.`,
  );
  const info = await stat(file).catch(() => null);
  assert.ok(info, `${context}: missing local URL ${raw}.`);
  if (info.isDirectory()) file = resolve(file, "index.html");
  const fileInfo = await stat(file).catch(() => null);
  assert.ok(
    fileInfo && fileInfo.isFile(),
    `${context}: route has no static index.html for ${raw}.`,
  );
  assert.ok(fileInfo.size > 0, `${context}: empty file for ${raw}.`);
  checkedFiles.add(file);
}

for (const route of routes) {
  try {
    const file =
      route === "/404"
        ? resolve(directory, "404.html")
        : resolve(directory, route.slice(1), "index.html");
    const html = await readFile(file, "utf8");
    htmlDocuments.set(route, html);
    assert.ok(
      !html.includes("<!--app-html-->"),
      `${route}: unrendered app placeholder.`,
    );
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    assert.ok(
      main && main.replace(/<[^>]*>/g, "").trim().length > 30,
      `${route}: missing meaningful static main content.`,
    );
    assert.ok(/<h1\b/i.test(main), `${route}: missing static page heading.`);
    const pageRoot = tags(html, "div").find(
      (tag) => tag.attributes.id === "root",
    )?.attributes;
    assert.equal(
      pageRoot?.["data-prerendered-path"],
      route,
      `${route}: missing hydration route marker.`,
    );
    assert.equal(
      pageRoot?.["data-site-url"],
      site.href,
      `${route}: inconsistent site URL.`,
    );
    assert.equal(
      pageRoot?.["data-base-path"],
      base,
      `${route}: inconsistent base path.`,
    );
    const metadata = pageMeta(route, "en");
    assert.equal(
      decodeHtml(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ""),
      metadata.title,
      `${route}: wrong document title.`,
    );
    const meta = tags(html, "meta").map((tag) => tag.attributes);
    assert.equal(
      meta.find((item) => item.name === "description")?.content,
      metadata.description,
      `${route}: wrong description.`,
    );
    assert.equal(
      meta.find((item) => item.property === "og:title")?.content,
      metadata.title,
      `${route}: wrong OpenGraph title.`,
    );
    assert.equal(
      meta.find((item) => item.property === "og:description")?.content,
      metadata.description,
      `${route}: wrong OpenGraph description.`,
    );
    assert.equal(
      meta.find((item) => item.property === "og:url")?.content,
      routeUrl(route),
      `${route}: wrong OpenGraph URL.`,
    );
    const links = tags(html, "link").map((tag) => tag.attributes);
    assert.equal(
      links.find((item) => item.rel === "canonical")?.href,
      routeUrl(route),
      `${route}: wrong canonical URL.`,
    );
    assert.ok(
      links.some((item) => item.rel === "stylesheet"),
      `${route}: missing built stylesheet.`,
    );
    assert.ok(
      links.some((item) => item.rel === "icon"),
      `${route}: missing favicon.`,
    );
    assert.ok(
      tags(html, "script").some(
        (tag) => tag.attributes.type === "module" && tag.attributes.src,
      ),
      `${route}: missing built module script.`,
    );
    if (route === "/404")
      assert.ok(
        meta
          .find((item) => item.name === "robots")
          ?.content.includes("noindex"),
        "404.html must be excluded from indexing.",
      );

    for (const tag of tags(html, "script|link|img|a")) {
      if (tag.name === "link" && tag.attributes.rel === "canonical") continue;
      const source = tag.attributes.src || tag.attributes.href;
      if (source)
        await verifyLocalUrl(source, routeUrl(route), `${route} <${tag.name}>`);
      const candidates = tag.attributes.srcset || tag.attributes.imagesrcset;
      if (candidates && !candidates.startsWith("data:")) {
        for (const candidate of candidates.split(",")) {
          await verifyLocalUrl(
            candidate.trim().split(/\s+/)[0],
            routeUrl(route),
            `${route} responsive image`,
          );
        }
      }
    }
    const socialImage = meta.find(
      (item) => item.property === "og:image",
    )?.content;
    assert.ok(socialImage, `${route}: missing OpenGraph image.`);
    await verifyLocalUrl(
      socialImage,
      routeUrl(route),
      `${route} OpenGraph image`,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

// Only public counts and encrypted resources belong in a Pages artifact. These
// checks deliberately never open the local keys file or private source images.
async function verifyNoPrivateSources(current: string): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const name = entry.name.toLowerCase();
    const relative = resolve(current, entry.name).slice(directory.length + 1).split(sep).join("/");
    assert.ok(
      ![".private", ".wrangler", ".ds_store", "keys.json", "secrets.json", "credentials.json", "worker-secrets.json"].includes(name) && !name.startsWith(".dev.vars") && name !== ".env" && !name.startsWith(".env."),
      `Private gallery source must not be published: ${resolve(current, entry.name).slice(directory.length + 1)}.`,
    );
    assert.ok(!entry.isSymbolicLink(), `Deployment cannot contain symbolic links: ${relative}.`);
    assert.ok(
      !(relative.startsWith("docs/") && /\.md$/i.test(name)) && relative !== "images/myphoto.jpg",
      `Maintenance document or unused portrait original must not be deployed: ${relative}.`,
    );
    assert.ok(
      (!relative.startsWith("gallery/") && !relative.startsWith("gallery-encrypted/")) || !/\.(?:jpe?g|png|webp|gif|avif|heic|heif|tiff?|dng|cr2|cr3|nef|arw)$/i.test(name),
      `Plaintext gallery image must not be published: ${relative}. Move originals to .private/gallery/ and run gallery:encrypt.`,
    );
    if (entry.isDirectory()) await verifyNoPrivateSources(resolve(current, entry.name));
    else if (entry.isFile()) deploymentBytes += (await stat(resolve(current, entry.name))).size;
  }
}

try {
  await verifyNoPrivateSources(directory);
  assert.ok(deploymentBytes < 1_000_000_000, "GitHub Pages deployment must be smaller than 1 GB. Reduce published assets before deploying.");
  await verifyLocalUrl("_data/panel.enc", site.href, "Encrypted administration panel");
  const panel = await readFile(resolve(directory, "_data/panel.enc"));
  assert.ok(panel.length > 28 && !panel.subarray(0, 100).toString("utf8").includes("<!DOCTYPE"), "Administration panel must be an AES-GCM ciphertext, not plaintext HTML.");
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

async function verifyEncryptedManifest(configuration: { manifest: string; photoCount: number; viewKey?: string; access?: "managed" }, slug: string) {
    const manifestUrl = new URL(configuration.manifest, site);
    assert.equal(
      manifestUrl.origin,
      site.origin,
      `${slug}: encrypted manifest must be part of this deployment.`,
    );
    await verifyLocalUrl(manifestUrl.href, site.href, `${slug} encrypted manifest`);
    const relative = decodeURIComponent(manifestUrl.pathname.slice(base.length));
    const manifestPath = resolve(directory, relative);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as GalleryManifest | PublicGalleryManifest | ManagedGalleryManifest;
    const expectedVersion = configuration.viewKey ? 2 : configuration.access === "managed" ? 3 : 1;
    assert.equal(manifest.version, expectedVersion, `${slug}: unsupported encrypted manifest version.`);
    if (manifest.version === 3) {
      assert.equal(manifest.access, "managed", `${slug}: server-authorized albums must explicitly declare managed access.`);
      assert.ok(!("salt" in manifest) && !("iterations" in manifest), `${slug}: managed manifests must not contain legacy password-derived parameters.`);
    }
    assert.equal(manifest.slug, slug, `${slug}: encrypted manifest belongs to another album.`);
    assert.ok(Number.isSafeInteger(manifest.photoCount) && manifest.photoCount >= 0, `${slug}: invalid public photo count.`);
    assert.equal(
      manifest.photoCount,
      configuration.photoCount,
      `${slug}: generated photo count is stale; run gallery:encrypt again and rebuild.`,
    );
    assert.ok(
      typeof manifest.ciphertext === "string" && manifest.ciphertext.length > 0,
      `${slug}: encrypted manifest is missing its authenticated content.`,
    );
    const encryptedFiles = (await readdir(dirname(manifestPath))).filter((file) => file.endsWith(".enc"));
    assert.equal(encryptedFiles.length, manifest.photoCount * 2, `${slug}: expected one encrypted full image and one thumbnail per photo.`);
    if (configuration.viewKey && manifest.version === 2) {
      assert.equal(manifest.access, "public", `${slug}: view-key manifest must explicitly declare public access.`);
      const raw = Buffer.from(configuration.viewKey, "base64");
      assert.equal(raw.length, 32, `${slug}: invalid public view key.`);
      const key = await webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const plain = await webcrypto.subtle.decrypt({
        name: "AES-GCM", iv: Buffer.from(manifest.iv, "base64"), additionalData: galleryAdditionalData(slug, "manifest"),
      }, key, Buffer.from(manifest.ciphertext, "base64"));
      const photos = JSON.parse(new TextDecoder().decode(plain));
      assert.ok(Array.isArray(photos) && photos.length === manifest.photoCount, `${slug}: public encrypted metadata does not match its count.`);
      for (const photo of photos) {
        for (const file of [photo.file, photo.thumbnailFile]) {
          assert.ok(typeof file === "string" && /^[a-f0-9-]{36}\.enc$/.test(file), `${slug}: unsafe encrypted photo filename.`);
          await verifyLocalUrl(new URL(file, manifestUrl).href, site.href, `${slug} encrypted photo`);
        }
      }
    }
}

for (const album of gallery) {
  try {
    const configuration = album.private ?? album.encrypted;
    if (configuration) {
      assert.equal(album.photos.length, 0, `${album.slug}: encrypted photos belong in .private/gallery/, never in public gallery data.`);
      assert.ok(!album.cover, `${album.slug}: encrypted albums must publish their cover through an independent encryptedCover.`);
      await verifyEncryptedManifest(configuration, album.slug);
    }
    if (album.encryptedCover) {
      assert.ok(!album.cover && album.photos.length === 0, `${album.slug}: encrypted-cover albums must not also contain plaintext cover/photo paths.`);
      await verifyEncryptedManifest({ ...album.encryptedCover, photoCount: 1 }, `cover-${album.slug}`);
      if (album.encrypted) assert.notEqual(album.encryptedCover.viewKey, album.encrypted.viewKey, `${album.slug}: cover must use its own public view key.`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

try {
  const sitemap = await readFile(resolve(directory, "sitemap.xml"), "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => decodeHtml(match[1]),
  );
  assert.deepEqual(
    sitemapUrls.sort(),
    routes
      .filter((route) => route !== "/404")
      .map(routeUrl)
      .sort(),
    "Sitemap must contain every public route exactly once, and exclude 404.",
  );
  for (const url of sitemapUrls)
    await verifyLocalUrl(url, site.href, "sitemap.xml");
  const robots = await readFile(resolve(directory, "robots.txt"), "utf8");
  assert.ok(
    robots.includes(`Sitemap: ${new URL("sitemap.xml", site).href}`),
    "robots.txt must point to the deployed sitemap.",
  );
  assert.ok(
    (await stat(resolve(directory, ".nojekyll"))).isFile(),
    ".nojekyll must be present.",
  );
  for (const file of checkedFiles) {
    if (!file.endsWith(".css")) continue;
    const css = await readFile(file, "utf8");
    const stylesheetUrl = new URL(
      file
        .slice(directory.length + 1)
        .split(sep)
        .join("/"),
      site,
    ).href;
    for (const match of css.matchAll(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g,
    ))
      await verifyLocalUrl(
        match[1] ?? match[2] ?? match[3],
        stylesheetUrl,
        "CSS resource",
      );
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

if (errors.length)
  throw new Error(
    `Static build verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  );
console.info(
  `Verified ${htmlDocuments.size} rendered documents, ${checkedFiles.size} local files, metadata, sitemap, and base path ${base}.`,
);
console.info(`Deployment size: ${(deploymentBytes / 1_000_000).toFixed(1)} MB / 1,000 MB.`);
