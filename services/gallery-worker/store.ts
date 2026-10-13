import { fromBase64, identify, importAuditDecryptionKey, randomToken, seal, unseal } from "./crypto";
import type { AuditEvent, AuditKind, AuditTotals, D1Database, D1Statement, DashboardPage, RequestContext, Secrets } from "./types";

export const DAY = 86_400_000;
const LEASE_MS = 30_000;
const DELAYS = [60_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000];

export interface AuthState {
  identity: string;
  failures: number;
  last_failure: number;
  blocked_until: number;
  lease_token: string;
}

export function currentLimit(state: AuthState | null, now: number): { failureCount: number; blockedUntil: number } {
  if (!state || now - state.last_failure >= DAY) return { failureCount: 0, blockedUntil: 0 };
  return { failureCount: state.failures, blockedUntil: state.blocked_until > now ? state.blocked_until : 0 };
}

export async function acquireLease(db: D1Database, identity: string, now: number): Promise<AuthState | null> {
  // Acquire or renew the lease atomically in one D1 call. The conflict clause
  // keeps all failure counters and refuses to replace an unexpired lease.
  return db.prepare(`INSERT INTO auth_state(identity, lease_token, lease_until) VALUES (?, ?, ?)
    ON CONFLICT(identity) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until
    WHERE auth_state.lease_until <= ? RETURNING *`)
    .bind(identity, randomToken(), now + LEASE_MS, now).first<AuthState>();
}

export async function releaseLease(db: D1Database, state: AuthState): Promise<void> {
  const released = await db.prepare("UPDATE auth_state SET lease_token = NULL, lease_until = 0 WHERE identity = ? AND lease_token = ? RETURNING identity")
    .bind(state.identity, state.lease_token).first();
  if (!released) throw new Error("Expired authentication lease");
}

export async function recordFailure(db: D1Database, state: AuthState, now: number): Promise<{ failureCount: number; blockedUntil: number }> {
  const failureCount = currentLimit(state, now).failureCount + 1;
  const delay = failureCount <= 5 ? 0 : DELAYS[Math.min(failureCount - 6, DELAYS.length - 1)];
  const blockedUntil = delay ? now + delay : 0;
  const updated = await db.prepare("UPDATE auth_state SET failures = ?, last_failure = ?, blocked_until = ?, lease_token = NULL, lease_until = 0 WHERE identity = ? AND lease_token = ? RETURNING identity")
    .bind(failureCount, now, blockedUntil, state.identity, state.lease_token).first();
  if (!updated) throw new Error("Expired authentication lease");
  return { failureCount, blockedUntil };
}

export async function readLimit(db: D1Database, identity: string, now: number) {
  return currentLimit(await db.prepare("SELECT * FROM auth_state WHERE identity = ?").bind(identity).first<AuthState>(), now);
}

function shortString(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length ? value.slice(0, maximum) : undefined;
}

export function clientContext(body: Record<string, unknown>): Pick<AuditEvent, "language" | "timezone" | "referrerHost"> {
  const referrerHost = shortString(body.referrerHost, 253);
  return {
    language: shortString(body.language, 32),
    timezone: shortString(body.timezone, 80),
    referrerHost: referrerHost && /^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(referrerHost) ? referrerHost : undefined,
  };
}

export interface AuditWriteOptions {
  album: string;
  kind: AuditKind;
  now: number;
  body?: Record<string, unknown>;
  details?: Pick<AuditEvent, "failureCount" | "blockedUntil" | "attemptedPhrase" | "attemptTruncated">;
  dedupId?: string;
}

export async function prepareAuditStatement(db: D1Database, secrets: Secrets, context: RequestContext, options: AuditWriteOptions): Promise<D1Statement> {
  const id = crypto.randomUUID();
  const event: AuditEvent = {
    id, at: options.now, album: options.album, kind: options.kind,
    ip: context.ip, visitorId: context.identity, location: context.location, userAgent: context.userAgent,
    ...clientContext(options.body ?? {}), ...options.details,
  };
  const payload = await seal(secrets.auditKey, id, event);
  const dedupKey = options.dedupId ? await identify(secrets.ipHmacKey, `${context.identity}\0${options.album}\0${options.kind}\0${options.dedupId}`) : null;
  return db.prepare("INSERT INTO audit_events(id, occurred_at, album, kind, identity, dedup_key, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_key) DO NOTHING")
    .bind(id, options.now, options.album, options.kind, context.identity, dedupKey, payload);
}

export async function writeAudit(db: D1Database, secrets: Secrets, context: RequestContext, options: AuditWriteOptions): Promise<void> {
  await (await prepareAuditStatement(db, secrets, context, options)).run();
}

const SUMMARY_SQL = `SUM(CASE WHEN kind = 'visit' THEN 1 ELSE 0 END) AS visits,
  SUM(CASE WHEN kind = 'unlock_failure' THEN 1 ELSE 0 END) AS failedUnlocks,
  SUM(CASE WHEN kind = 'unlock_success' THEN 1 ELSE 0 END) AS successfulUnlocks,
  SUM(CASE WHEN kind = 'unlock_blocked' THEN 1 ELSE 0 END) AS blockedAttempts,
  COUNT(DISTINCT CASE WHEN album != '_admin' THEN identity END) AS uniqueVisitors`;

function totals(row: Partial<AuditTotals> | null): AuditTotals {
  return {
    visits: row?.visits ?? 0, failedUnlocks: row?.failedUnlocks ?? 0,
    successfulUnlocks: row?.successfulUnlocks ?? 0, blockedAttempts: row?.blockedAttempts ?? 0,
    uniqueVisitors: row?.uniqueVisitors ?? 0,
  };
}

export const DASHBOARD_PAGE_SIZE = 50;
export const DASHBOARD_EVENT_LIMIT = 2000;
const CURSOR_LIFETIME = 15 * 60_000;

interface DashboardCursor {
  version: 1;
  snapshot: number;
  watermark: number;
  days: number;
  album: string;
  before: number;
  id: string;
  count: number;
}

export class InvalidDashboardCursor extends Error {}

async function encodeCursor(secrets: Secrets, cursor: DashboardCursor): Promise<string> {
  const body = btoa(JSON.stringify(cursor));
  return `${body}.${await identify(secrets.ipHmacKey, `gallery-dashboard-cursor:v1:${body}`)}`;
}

async function decodeCursor(secrets: Secrets, value: string, days: number, album: string, now: number): Promise<DashboardCursor> {
  try {
    if (value.length > 1024 || !/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(value)) throw new Error();
    const [body, signature] = value.split(".");
    const mac = fromBase64(signature);
    if (mac.length !== 32) throw new Error();
    const key = await crypto.subtle.importKey("raw", fromBase64(secrets.ipHmacKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, mac, new TextEncoder().encode(`gallery-dashboard-cursor:v1:${body}`))) throw new Error();
    const cursor = JSON.parse(atob(body)) as DashboardCursor;
    if (cursor.version !== 1 || cursor.days !== days || cursor.album !== album
        || !Number.isSafeInteger(cursor.snapshot) || cursor.snapshot > now || now - cursor.snapshot > CURSOR_LIFETIME
        || !Number.isSafeInteger(cursor.watermark) || cursor.watermark < 0
        || !Number.isSafeInteger(cursor.before) || cursor.before > cursor.snapshot || cursor.before < cursor.snapshot - days * DAY
        || typeof cursor.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor.id)
        || !Number.isInteger(cursor.count) || cursor.count < DASHBOARD_PAGE_SIZE || cursor.count >= DASHBOARD_EVENT_LIMIT || cursor.count % DASHBOARD_PAGE_SIZE !== 0) throw new Error();
    return cursor;
  } catch { throw new InvalidDashboardCursor("Invalid dashboard cursor"); }
}

export async function readDashboard(db: D1Database, secrets: Secrets, slugs: string[], days: number, album: string, now: number, nextCursor?: string): Promise<DashboardPage> {
  const cursor = nextCursor === undefined ? undefined : await decodeCursor(secrets, nextCursor, days, album, now);
  const snapshot = cursor?.snapshot ?? now;
  // Capture the insertion high-water mark as well as time: an in-flight older
  // request inserting later must not shift the pages of this snapshot.
  const watermark = cursor?.watermark ?? (await db.prepare("SELECT COALESCE(MAX(rowid), 0) AS watermark FROM audit_events").first<{ watermark: number }>())!.watermark;
  const where = "rowid <= ? AND occurred_at >= ? AND occurred_at <= ? AND (? = 'all' OR album = ?)";
  const bindings = [watermark, snapshot - days * DAY, snapshot, album, album];
  const position = cursor ? " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))" : "";
  const rows = await db.prepare(`SELECT id, occurred_at, payload FROM audit_events WHERE ${where}${position} ORDER BY occurred_at DESC, id DESC LIMIT ${DASHBOARD_PAGE_SIZE + 1}`)
    .bind(...bindings, ...(cursor ? [cursor.before, cursor.before, cursor.id] : [])).all<{ id: string; occurred_at: number; payload: string }>();
  const pageRows = rows.results.slice(0, DASHBOARD_PAGE_SIZE);
  const hasMore = rows.results.length > DASHBOARD_PAGE_SIZE;
  const count = (cursor?.count ?? 0) + pageRows.length;
  let summary: Pick<DashboardPage, "totals" | "albums"> = {};
  if (!cursor) {
    const row = await db.prepare(`SELECT ${SUMMARY_SQL} FROM audit_events WHERE ${where}`).bind(...bindings).first<AuditTotals>();
    const grouped = await db.prepare(`SELECT album AS slug, ${SUMMARY_SQL} FROM audit_events WHERE ${where} GROUP BY album`).bind(...bindings).all<AuditTotals & { slug: string }>();
    summary = {
      totals: totals(row),
      albums: slugs.filter((slug) => album === "all" || album === slug).map((slug) => ({ slug, ...totals(grouped.results.find((item) => item.slug === slug) ?? null) })),
    };
  }
  // Bound AES + JSON work to one small page, and import the key only once.
  const auditKey = pageRows.length ? await importAuditDecryptionKey(secrets.auditKey) : undefined;
  const events = await Promise.all(pageRows.map((row) => unseal<AuditEvent>(auditKey!, row.id, row.payload)));
  const last = pageRows.at(-1);
  return {
    events, ...summary, generatedAt: new Date(snapshot).toISOString(), truncated: hasMore,
    nextCursor: hasMore && count < DASHBOARD_EVENT_LIMIT && last
      ? await encodeCursor(secrets, { version: 1, snapshot, watermark, days, album, before: last.occurred_at, id: last.id, count }) : null,
  };
}

export async function purgeExpired(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM audit_events WHERE occurred_at < ?").bind(now - 90 * DAY),
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_state WHERE last_failure < ? AND lease_until <= ?").bind(now - DAY, now),
  ]);
}
