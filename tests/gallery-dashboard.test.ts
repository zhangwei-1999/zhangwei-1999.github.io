import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { galleryService } from "../src/data/galleryService";
import { galleryDashboard, GalleryServiceError } from "../src/lib/galleryService";
import type { AuditEvent, DashboardPage } from "../services/gallery-worker/types";

const generatedAt = "2026-09-23T06:00:00.000Z";
const totals = { visits: 2001, failedUnlocks: 0, successfulUnlocks: 0, blockedAttempts: 0, uniqueVisitors: 3 };
const event = (id: number): AuditEvent => ({ id: `event-${id}`, at: 1_700_000_000_000 - id, album: "life", kind: "visit", ip: "203.0.113.1", visitorId: "synthetic", location: { accuracy: "network-approximate" } });

function mockPages(t: TestContext, pages: DashboardPage[]) {
  const previousUrl = galleryService.apiUrl;
  galleryService.apiUrl = "https://audit.example.test";
  t.after(() => { galleryService.apiUrl = previousUrl; });
  const requests: { url: URL; options?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
    requests.push({ url: new URL(String(input)), options });
    const page = pages[requests.length - 1];
    if (!page) throw new Error("Unexpected extra request");
    return new Response(JSON.stringify(page), { headers: { "Content-Type": "application/json" } });
  });
  return requests;
}

function page(index: number, last: boolean, truncated = !last): DashboardPage {
  return {
    events: Array.from({ length: 50 }, (_, offset) => event(index * 50 + offset)),
    ...(index === 0 ? { totals, albums: [{ slug: "life", ...totals }] } : {}),
    generatedAt, nextCursor: last ? null : `page-${index + 1}+/=`, truncated,
  };
}

test("dashboard helper joins bounded pages, retaining first-page totals and bearer authentication", async (t) => {
  const second = { ...page(1, true), events: [event(50), event(51)] };
  const requests = mockPages(t, [page(0, false), second]);
  const signal = new AbortController().signal;
  const data = await galleryDashboard(7, "life", "synthetic-bearer", signal);
  assert.deepEqual(data.events, Array.from({ length: 52 }, (_, index) => event(index)));
  assert.deepEqual(data.totals, totals);
  assert.equal(data.truncated, false);
  assert.equal(data.generatedAt, generatedAt);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get("cursor"), null);
  assert.equal(requests[1].url.searchParams.get("cursor"), "page-1+/=");
  for (const request of requests) {
    assert.equal(request.url.searchParams.get("days"), "7");
    assert.equal(request.url.searchParams.get("album"), "life");
    assert.equal(new Headers(request.options?.headers).get("Authorization"), "Bearer synthetic-bearer");
    assert.equal(request.options?.signal, signal);
  }
});

test("dashboard helper stops at 2000 events and preserves accurate truncation", async (t) => {
  const pages = Array.from({ length: 40 }, (_, index) => page(index, index === 39, true));
  const requests = mockPages(t, pages);
  const data = await galleryDashboard(30, "all", "synthetic-bearer");
  assert.equal(requests.length, 40);
  assert.deepEqual(data.events, Array.from({ length: 2000 }, (_, index) => event(index)));
  assert.equal(data.truncated, true);
  assert.equal(data.totals.visits, 2001);
});

test("dashboard helper rejects repeated cursors, duplicate events and changed snapshots", async (t) => {
  const invalidContinuations: DashboardPage[][] = [
    [page(0, false), { ...page(1, false), nextCursor: "page-1+/=" }],
    [page(0, false), { ...page(1, true), events: [event(0)] }],
    [page(0, false), { ...page(1, true), generatedAt: "2026-09-23T06:01:00.000Z" }],
    [page(0, false), { ...page(1, true), events: [] }],
    [page(0, false), { ...page(1, true), events: Array.from({ length: 51 }, (_, i) => event(50 + i)) }],
  ];
  for (const [index, pages] of invalidContinuations.entries()) await t.test(`invalid continuation ${index + 1}`, async (subtest) => {
    const requests = mockPages(subtest, pages);
    await assert.rejects(galleryDashboard(30, "all", "synthetic-bearer"), GalleryServiceError);
    assert.equal(requests.length, 2);
  });
});
