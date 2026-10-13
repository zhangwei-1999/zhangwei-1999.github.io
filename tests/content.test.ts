import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { profile } from "../src/data/profile.ts";
import { news } from "../src/data/news.ts";
import { publications } from "../src/data/publications.ts";
import { awards } from "../src/data/awards.ts";
import { gallery } from "../src/data/gallery.ts";
import { quotes } from "../src/data/quotes.ts";
import { newsDateParts } from "../src/lib/calendar.ts";
import { Home } from "../src/pages/Home.tsx";

function uniqueIds(items: { id: string }[], label: string) {
  const ids = items.map(({ id }) => id);
  assert.ok(
    ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)),
    `${label}: use nonempty, URL-safe IDs`,
  );
  assert.equal(new Set(ids).size, ids.length, `${label}: IDs must be unique`);
}

function localizedFields(value: unknown, label: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => localizedFields(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("en" in record || "zh" in record) {
    for (const language of ["en", "zh"]) {
      assert.equal(
        typeof record[language],
        "string",
        `${label}.${language}: missing translation`,
      );
      assert.ok(
        (record[language] as string).trim(),
        `${label}.${language}: translation is empty`,
      );
    }
  }
  Object.entries(record).forEach(([key, item]) =>
    localizedFields(item, `${label}.${key}`),
  );
}

function resourceExists(path: string, label: string) {
  assert.ok(path.trim(), `${label}: empty resource path`);
  if (/^https?:\/\//.test(path)) {
    const url = new URL(path);
    assert.ok(url.hostname, `${label}: external URL needs a hostname`);
    return;
  }
  assert.ok(
    !/^[a-z][a-z\d+.-]*:/i.test(path),
    `${label}: unsupported URL scheme`,
  );
  assert.ok(
    !path.startsWith("/"),
    `${label}: use a relative path for GitHub project Pages`,
  );
  assert.ok(
    !path.startsWith("public/"),
    `${label}: public/ is not part of a served resource URL`,
  );
  const cleanPath = decodeURIComponent(path.split(/[?#]/, 1)[0]);
  assert.ok(
    !cleanPath.split("/").includes(".."),
    `${label}: path may not leave the public root`,
  );
  const inRepository = fileURLToPath(
    new URL(`../${cleanPath}`, import.meta.url),
  );
  const inPublic = fileURLToPath(
    new URL(`../public/${cleanPath}`, import.meta.url),
  );
  assert.ok(
    existsSync(inRepository) || existsSync(inPublic),
    `${label}: missing resource ${path}`,
  );
}

test("content identifiers are unique and bilingual values are complete", () => {
  uniqueIds(news, "News");
  uniqueIds(publications, "Publications");
  uniqueIds(awards, "Awards");
  uniqueIds(
    gallery.map((album) => ({ id: album.slug })),
    "Album slugs",
  );
  for (const [label, value] of Object.entries({
    profile,
    news,
    publications,
    awards,
    gallery,
  })) {
    localizedFields(value, label);
  }
  quotes.forEach((quote, index) => {
    assert.ok(quote.text.trim(), `Quote ${index}: empty text`);
    assert.equal(typeof quote.author, "string");
  });
});

test("every News date is valid and its declared precision matches its content", () => {
  news.forEach((item) => {
    const parts = newsDateParts(item);
    assert.ok(parts, `${item.id}: invalid date ${item.date}`);
    if (item.datePrecision === "day")
      assert.ok(parts.day, `${item.id}: day precision requires YYYY-MM-DD`);
    if (item.datePrecision === "month")
      assert.match(
        item.date,
        /^\d{4}-\d{2}$/,
        `${item.id}: preserve the original month-only date`,
      );
    assert.ok(item.emoji.trim(), `${item.id}: missing emoji`);
    if (item.link) resourceExists(item.link, `News ${item.id}`);
  });
});

test("publication resources, portrait, and education assets resolve", () => {
  resourceExists(profile.portrait, "Profile portrait");
  profile.education.forEach((entry) =>
    resourceExists(entry.logo, entry.institution.en),
  );
  publications.forEach((paper) => {
    assert.ok(
      paper.title.trim() && paper.authors.trim() && paper.venue.trim(),
      `${paper.id}: incomplete paper metadata`,
    );
    assert.ok(
      Number.isInteger(paper.year) && paper.year > 0,
      `${paper.id}: invalid publication year`,
    );
    assert.equal(
      typeof paper.featured,
      "boolean",
      `${paper.id}: choose featured explicitly`,
    );
    resourceExists(paper.cover, `${paper.id} cover`);
    paper.links.forEach((link) => {
      assert.ok(link.label.trim(), `${paper.id}: empty resource label`);
      resourceExists(link.url, `${paper.id} ${link.label}`);
    });
  });
});

test("Home obeys featured flags, including older papers and an unlimited selection", () => {
  const original = publications.map((paper) => paper.featured);
  const renderedCovers = () => {
    const markup = renderToStaticMarkup(createElement(Home));
    return [
      ...markup.matchAll(/<article class="publication-card[^]*?<\/article>/g),
    ].map(([card]) => card.match(/<img[^>]*\balt="([^"]*)"/)?.[1]);
  };
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#x27;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const expected = () =>
    publications
      .filter((paper) => paper.featured)
      .map((paper) => escapeHtml(paper.title));
  try {
    assert.deepEqual(renderedCovers(), expected());
    publications.forEach((paper) => {
      paper.featured = true;
    });
    assert.deepEqual(
      renderedCovers(),
      expected(),
      "Home must not truncate the featured selection",
    );
    publications.forEach((paper) => {
      paper.featured = false;
    });
    assert.deepEqual(
      renderedCovers(),
      [],
      "Home must not substitute the latest papers when none are featured",
    );
    const oldest = [...publications].sort((a, b) => a.year - b.year)[0];
    if (oldest) {
      oldest.featured = true;
      assert.deepEqual(
        renderedCovers(),
        [escapeHtml(oldest.title)],
        "An older paper can be the sole featured publication",
      );
    }
  } finally {
    publications.forEach((paper, index) => {
      paper.featured = original[index];
    });
  }
});

test("gallery assets have usable alt text and explicit image dimensions", () => {
  gallery.forEach((album) => {
    if (album.private) {
      assert.equal(album.photos.length, 0, "Private photos must never be embedded in public content data");
      resourceExists(album.private.manifest, `${album.slug} encrypted manifest`);
      assert.equal("viewKey" in album.private, false, "Private album keys must not appear in public data");
    }
    if (album.encrypted) {
      assert.equal(album.photos.length, 0, "Encrypted collection metadata comes from its encrypted manifest");
      resourceExists(album.encrypted.manifest, `${album.slug} public encrypted manifest`);
      assert.equal(Buffer.from(album.encrypted.viewKey, "base64").length, 32, `${album.slug}: invalid public view key`);
    }
    const encrypted = album.private ?? album.encrypted;
    if (encrypted) {
      const manifest = JSON.parse(readFileSync(new URL(`../public/${encrypted.manifest}`, import.meta.url), "utf8"));
      assert.equal(manifest.slug, album.slug);
      assert.equal(manifest.photoCount, encrypted.photoCount, `${album.slug}: displayed count must match the manifest`);
      assert.equal(manifest.version, album.private ? album.private.access === "managed" ? 3 : 1 : 2);
      assert.ok(typeof manifest.ciphertext === "string" && manifest.ciphertext.length > 0);
      assert.equal("photos" in manifest, false, "The served manifest must not expose unencrypted photo metadata");
    }
    if (album.encryptedCover) {
      resourceExists(album.encryptedCover.manifest, `${album.slug} encrypted cover manifest`);
      assert.equal(Buffer.from(album.encryptedCover.viewKey, "base64").length, 32);
      assert.ok(album.encryptedCover.photoId.trim());
      if (album.private)
        assert.notEqual(album.encryptedCover.manifest, album.private.manifest, "Public covers use a separate encrypted collection from private photographs");
    }
    uniqueIds(album.photos, `Album ${album.slug}`);
    if (album.cover) resourceExists(album.cover, `${album.slug} cover`);
    album.photos.forEach((photo) => {
      resourceExists(photo.src, `${album.slug}/${photo.id}`);
      if (photo.thumbnail)
        resourceExists(photo.thumbnail, `${album.slug}/${photo.id} thumbnail`);
      localizedFields(photo.alt, `${album.slug}/${photo.id}.alt`);
      assert.ok(
        Number.isInteger(photo.width) && photo.width > 0,
        `${photo.id}: width must be a positive pixel count`,
      );
      assert.ok(
        Number.isInteger(photo.height) && photo.height > 0,
        `${photo.id}: height must be a positive pixel count`,
      );
    });
  });
});
