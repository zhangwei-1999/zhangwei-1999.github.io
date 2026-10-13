import { galleryService } from "../data/galleryService";
import type { DashboardData, DashboardPage } from "../../services/gallery-worker/types";

export interface UnlockStatus { blockedUntil: number; failures?: number; retryAfter?: number }
export class GalleryServiceError extends Error {
  constructor(public status: number, public blockedUntil = 0, message = "The gallery service is unavailable.") { super(message); }
}
export function serviceAvailable() { return Boolean(galleryService.apiUrl); }
export async function galleryRequest<T>(path: string, body?: unknown, token?: string, signal?: AbortSignal): Promise<T> {
  if (!serviceAvailable()) throw new GalleryServiceError(503);
  const url = new URL(galleryService.apiUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new GalleryServiceError(503);
  const response = await fetch(`${galleryService.apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST", signal, cache: "no-store", credentials: "omit",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GalleryServiceError(response.status, Number(data.blockedUntil) || Date.now() + Number(response.headers.get("Retry-After") || 0) * 1000);
  return data as T;
}

/** Preserve the private panel's complete response while bounding server CPU. */
export async function galleryDashboard(days: number, album: string, token: string, signal?: AbortSignal): Promise<DashboardData> {
  const path = `/v1/admin/data?days=${encodeURIComponent(days)}&album=${encodeURIComponent(album)}`;
  const first = await galleryRequest<DashboardPage>(path, undefined, token, signal);
  if (!Array.isArray(first.events) || first.events.length > 2000 || !first.totals || !Array.isArray(first.albums)) throw new GalleryServiceError(503);
  const result: DashboardData = { events: [...first.events], totals: first.totals, albums: first.albums, generatedAt: first.generatedAt, truncated: first.truncated };
  let cursor = first.nextCursor;
  const seenCursors = new Set<string>();
  const seenEvents = new Set(first.events.map((event) => event.id));
  while (cursor && result.events.length < 2000) {
    // A bad response must never cause an unbounded request loop.
    if (typeof cursor !== "string" || cursor.length > 1024 || seenCursors.has(cursor) || seenCursors.size >= 39) throw new GalleryServiceError(503);
    seenCursors.add(cursor);
    const page = await galleryRequest<DashboardPage>(`${path}&cursor=${encodeURIComponent(cursor)}`, undefined, token, signal);
    if (!Array.isArray(page.events) || !page.events.length || page.events.length > 50 || page.generatedAt !== result.generatedAt) throw new GalleryServiceError(503);
    for (const event of page.events) {
      if (seenEvents.has(event.id)) throw new GalleryServiceError(503);
      seenEvents.add(event.id);
    }
    result.events.push(...page.events.slice(0, 2000 - result.events.length));
    result.truncated = page.truncated;
    cursor = page.nextCursor;
  }
  result.truncated ||= Boolean(cursor);
  return result;
}
export function visitContext(language: string) {
  let referrerHost = "";
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* No referrer. */ }
  return { language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, referrerHost };
}
// Deduplicate the modal-to-album transition and React strict-mode mount replay.
const recentVisits = new Map<string, number>();
export function recordAlbumVisit(album: string, language: string) {
  if (!serviceAvailable() || Date.now() - (recentVisits.get(album) || 0) < 15_000) return;
  recentVisits.set(album, Date.now());
  void galleryRequest("/v1/visits", { album, eventId: crypto.randomUUID(), ...visitContext(language) }).catch(() => { /* Analytics never interrupts viewing. */ });
}
