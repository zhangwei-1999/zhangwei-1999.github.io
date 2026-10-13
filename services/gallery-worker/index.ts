import { digest, identify, parseSecrets, randomToken, verifyPassword } from "./crypto";
import { acquireLease, currentLimit, InvalidDashboardCursor, prepareAuditStatement, purgeExpired, readDashboard, readLimit, recordFailure, releaseLease, writeAudit, type AuditWriteOptions } from "./store";
import type { AuditEvent, Env, PasswordVerifier, RequestContext, Secrets } from "./types";

const SESSION_MS = 15 * 60_000;
const MAX_BODY_BYTES = 4096;

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "json_required");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, "body_too_large"); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new HttpError(400, "invalid_body"); }
}

function passwordFrom(body: Record<string, unknown>): string {
  if (typeof body.password !== "string" || !body.password.length || body.password.length > 512) throw new HttpError(400, "invalid_phrase");
  return body.password;
}

async function requestContext(request: Request, env: Env, secrets: Secrets): Promise<RequestContext> {
  const cf = env.ENVIRONMENT === "local" ? undefined : (request as Request & { cf?: Record<string, unknown> }).cf;
  // CF supplies this header at its edge. Never trust caller-provided forwarding
  // headers on a local/non-Cloudflare server.
  const ip = env.ENVIRONMENT === "local" ? "127.0.0.1" : cf ? request.headers.get("CF-Connecting-IP") : null;
  if (!ip || ip.length > 64 || !/^[\da-fA-F:.]+$/.test(ip)) throw new HttpError(503, "edge_context_required");
  const location: AuditEvent["location"] = { accuracy: "network-approximate" };
  for (const field of ["country", "region", "city"] as const) {
    if (typeof cf?.[field] === "string") location[field] = String(cf[field]).slice(0, 120);
  }
  for (const [field, bound] of [["latitude", 90], ["longitude", 180]] as const) {
    const raw = cf?.[field];
    if ((typeof raw !== "string" && typeof raw !== "number") || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && Math.abs(value) <= bound) location[field] = Math.round(value * 10) / 10;
  }
  return { ip, identity: await identify(secrets.ipHmacKey, `visitor:${ip}`), location, userAgent: request.headers.get("User-Agent")?.slice(0, 512) };
}

async function authenticate(request: Request, env: Env, now: number): Promise<string> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [a-zA-Z0-9_-]{43}$/.test(authorization)) throw new HttpError(401, "session_required");
  const tokenHash = await digest(authorization.slice(7));
  const session = await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, now).first();
  if (!session) throw new HttpError(401, "session_expired");
  return tokenHash;
}

async function verifyAttempt(env: Env, secrets: Secrets, context: RequestContext, scope: string, verifier: PasswordVerifier, password: string, now: number) {
  const identity = await identify(secrets.ipHmacKey, `${scope}:${context.ip}`);
  const lease = await acquireLease(env.DB, identity, now);
  if (!lease) throw new HttpError(409, "verification_in_progress");
  const limit = currentLimit(lease, Date.now());
  if (limit.blockedUntil) {
    await releaseLease(env.DB, lease);
    return { status: "blocked" as const, ...limit };
  }
  let verified: boolean;
  try { verified = await verifyPassword(password, verifier, secrets.passwordPepper); }
  catch (error) { await releaseLease(env.DB, lease); throw error; }
  if (!verified) return { status: "wrong" as const, ...await recordFailure(env.DB, lease, Date.now()) };
  // Successful requests do not erase the streak. Only 24 hours without a
  // failure clears it, including across different protected albums.
  await releaseLease(env.DB, lease);
  return { status: "ok" as const, ...limit };
}

function denied(result: { status: string; blockedUntil: number; failureCount: number }): Response {
  const response = json({ error: result.status === "blocked" ? "rate_limited" : "incorrect_phrase", blockedUntil: result.blockedUntil, failureCount: result.failureCount }, result.blockedUntil ? 429 : 401);
  if (result.blockedUntil) response.headers.set("Retry-After", String(Math.max(1, Math.ceil((result.blockedUntil - Date.now()) / 1000))));
  return response;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/v1/health" && request.method === "GET") return json({ ok: true });
  const secrets = parseSecrets(env.SECRETS);
  const slugs = env.ALBUM_SLUGS.split(",").map((slug) => slug.trim()).filter(Boolean);
  let now = Date.now();

  if (url.pathname.startsWith("/v1/admin/") && url.pathname !== "/v1/admin/session") {
    // Parse a reset body before checking session expiry. A slow upload must not
    // keep an expired bearer session valid for a later destructive operation.
    const resetBody = url.pathname === "/v1/admin/reset" && request.method === "POST" ? await readBody(request) : undefined;
    now = Date.now();
    const sessionHash = await authenticate(request, env, now);
    if (url.pathname === "/v1/admin/data" && request.method === "GET") {
      const days = Number(url.searchParams.get("days") ?? 30);
      const album = url.searchParams.get("album") ?? "all";
      if (!Number.isInteger(days) || days < 1 || days > 90 || (album !== "all" && !slugs.includes(album))) throw new HttpError(400, "invalid_filter");
      try { return json(await readDashboard(env.DB, secrets, slugs, days, album, now, url.searchParams.get("cursor") ?? undefined)); }
      catch (error) {
        if (error instanceof InvalidDashboardCursor) throw new HttpError(400, "invalid_cursor");
        throw error;
      }
    }
    if (url.pathname === "/v1/admin/logout" && request.method === "POST") {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(sessionHash).run();
      return json({ ok: true });
    }
    if (url.pathname === "/v1/admin/reset" && request.method === "POST") {
      const body = resetBody!;
      const context = await requestContext(request, env, secrets);
      const result = await verifyAttempt(env, secrets, context, "admin-reset", secrets.resetVerifier, passwordFrom(body), now);
      if (result.status !== "ok") {
        if (result.status === "wrong") await writeAudit(env.DB, secrets, context, { album: "_admin", kind: "admin_reset_failure", now, details: { failureCount: result.failureCount, blockedUntil: result.blockedUntil } });
        return denied(result);
      }
      // Reset deletes analytics only. It cannot bypass a current album/admin
      // lockout, revoke the caller accidentally, or rotate decryption keys.
      await env.DB.prepare("DELETE FROM audit_events").run();
      return json({ ok: true });
    }
    throw new HttpError(404, "not_found");
  }

  const context = await requestContext(request, env, secrets);
  if (url.pathname === "/v1/visits" && request.method === "POST") {
    const body = await readBody(request);
    now = Date.now();
    if (typeof body.album !== "string" || !slugs.includes(body.album) || typeof body.eventId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.eventId)) throw new HttpError(400, "invalid_visit");
    await writeAudit(env.DB, secrets, context, { album: body.album, kind: "visit", now, body, dedupId: body.eventId });
    return json({ ok: true });
  }

  const albumRoute = url.pathname.match(/^\/v1\/albums\/([a-z0-9-]+)\/(status|unlock)$/);
  if (albumRoute) {
    const [, album, action] = albumRoute;
    if (!slugs.includes(album) || !secrets.albums[album]) throw new HttpError(404, "not_found");
    if (action === "status" && request.method === "GET") {
      return json(await readLimit(env.DB, await identify(secrets.ipHmacKey, `album:${context.ip}`), now));
    }
    if (action === "unlock" && request.method === "POST") {
      const body = await readBody(request);
      now = Date.now();
      const password = passwordFrom(body);
      const result = await verifyAttempt(env, secrets, context, "album", secrets.albums[album].verifier, password, now);
      const kind = result.status === "ok" ? "unlock_success" : result.status === "wrong" ? "unlock_failure" : "unlock_blocked";
      const characters = result.status === "wrong" ? Array.from(password) : [];
      await writeAudit(env.DB, secrets, context, {
        album, kind, now, body,
        details: {
          failureCount: result.failureCount, blockedUntil: result.blockedUntil,
          ...(result.status === "wrong" ? { attemptedPhrase: characters.slice(0, 256).join(""), attemptTruncated: characters.length > 256 } : {}),
        },
        dedupId: result.status === "blocked" ? String(Math.floor(now / 60_000)) : undefined,
      });
      if (result.status !== "ok") return denied(result);
      return json({ viewKey: secrets.albums[album].dataKey, blockedUntil: 0 });
    }
    throw new HttpError(405, "method_not_allowed");
  }

  if (url.pathname === "/v1/admin/session" && request.method === "POST") {
    const body = await readBody(request);
    now = Date.now();
    const result = await verifyAttempt(env, secrets, context, "admin-login", secrets.adminVerifier, passwordFrom(body), now);
    const audit: AuditWriteOptions = {
      album: "_admin", kind: result.status === "ok" ? "admin_login_success" : result.status === "wrong" ? "admin_login_failure" : "admin_login_blocked",
      now, details: { failureCount: result.failureCount, blockedUntil: result.blockedUntil },
      dedupId: result.status === "blocked" ? String(Math.floor(now / 60_000)) : undefined,
    };
    if (result.status !== "ok") {
      await writeAudit(env.DB, secrets, context, audit);
      return denied(result);
    }
    const token = randomToken();
    const expiresAt = Date.now() + SESSION_MS;
    // D1 batches commit atomically. A session and its success audit must either
    // both be stored, or neither; return the token only after that commit.
    await env.DB.batch([
      await prepareAuditStatement(env.DB, secrets, context, audit),
      env.DB.prepare("INSERT INTO admin_sessions(token_hash, created_at, expires_at) VALUES (?, ?, ?)").bind(await digest(token), now, expiresAt),
    ]);
    return json({ token, expiresAt, dashboardKey: secrets.dashboardKey });
  }
  throw new HttpError(404, "not_found");
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  const isHealth = new URL(request.url).pathname === "/v1/health" && request.method === "GET";
  if ((!origin || !allowed.includes(origin)) && !isHealth) return json({ error: "origin_not_allowed" }, 403);
  let response: Response;
  if (request.method === "OPTIONS") {
    response = new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" } });
  } else {
    try { response = await route(request, env); }
    catch (error) { response = error instanceof HttpError ? json({ error: error.code }, error.status) : json({ error: "service_unavailable" }, 503); }
  }
  if (origin && allowed.includes(origin)) response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  return response;
}

export default {
  fetch: handleRequest,
  async scheduled(_controller: unknown, env: Env): Promise<void> { await purgeExpired(env.DB, Date.now()); },
};
