import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createCipheriv, createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import worker, { handleRequest } from "../services/gallery-worker/index";
import { DEFAULT_PASSWORD_ITERATIONS, PASSWORD_ITERATIONS, identify, parseSecrets, unseal, verifyPassword } from "../services/gallery-worker/crypto";
import { DAY, acquireLease, readDashboard, recordFailure, releaseLease, writeAudit } from "../services/gallery-worker/store";
import type { AuditEvent, CredentialContext, D1Database, D1Statement, DashboardData, Env, HybridPasswordVerifier, LegacyPasswordVerifier, Secrets } from "../services/gallery-worker/types";

// Exercise real SQLite SQL and concurrency rather than replacing the storage
// behavior with a mock. The CLI is available on macOS and the Ubuntu CI image.
class SQLite implements D1Database {
  constructor(private path: string) {}
  async execute(sql: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("sqlite3", ["-json", this.path], { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      let errors = "";
      child.stdout.on("data", (data: Buffer) => { output += data.toString(); });
      child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(errors)));
      child.stdin.end(`.bail on\n.timeout 5000\n${sql};\n`);
    });
  }
  prepare(query: string): SQLiteStatement { return new SQLiteStatement(this, query); }
  async batch<T>(statements: D1Statement[]): Promise<{ results: T[] }[]> {
    // The CLI's .bail stops at input-line boundaries: keep COMMIT on a
    // separate line so a failed statement exits with the transaction open,
    // rolling it back on connection close just as D1 does for a failed batch.
    await this.execute(`BEGIN IMMEDIATE;\n${statements.map((statement) => (statement as SQLiteStatement).sql()).join(";\n")};\nCOMMIT`);
    return statements.map(() => ({ results: [] }));
  }
}

class SQLiteStatement implements D1Statement {
  private values: unknown[] = [];
  constructor(private db: SQLite, private query: string) {}
  bind(...values: unknown[]): this { this.values = values; return this; }
  sql(): string {
    let index = 0;
    return this.query.replace(/\?/g, () => {
      const value = this.values[index++];
      if (value === null) return "NULL";
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
      throw new Error("Unsupported test binding");
    });
  }
  async all<T>(): Promise<{ results: T[] }> {
    const output = await this.db.execute(this.sql());
    return { results: output.trim() ? JSON.parse(output) as T[] : [] };
  }
  async first<T>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async run(): Promise<{ meta: { changes: number } }> { await this.db.execute(this.sql()); return { meta: { changes: 0 } }; }
}

const PHRASE = "Synthetic album phrase";
const ADMIN = "Synthetic administrator phrase";
const RESET = "Synthetic reset phrase";
function legacyVerifier(password: string): LegacyPasswordVerifier {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("base64"), iterations: PASSWORD_ITERATIONS };
}
const fixturePepper = randomBytes(32).toString("base64");
function verifier(password: string, context: CredentialContext, iterations = DEFAULT_PASSWORD_ITERATIONS): HybridPasswordVerifier {
  const salt = randomBytes(16).toString("base64");
  const derived = pbkdf2Sync(password, Buffer.from(salt, "base64"), iterations, 32, "sha256").toString("base64");
  const hash = createHmac("sha256", Buffer.from(fixturePepper, "base64"))
    .update(JSON.stringify(["gallery-password:v2", context, salt, iterations, derived])).digest("base64");
  return { version: 2, algorithm: "PBKDF2-HMAC-SHA256+HMAC-SHA256", context, salt, iterations, hash };
}
const fixtureSecrets: Secrets = {
  adminVerifier: verifier(ADMIN, "admin-login"), resetVerifier: verifier(RESET, "admin-reset"),
  albums: { life: { verifier: verifier(PHRASE, "album:life"), dataKey: randomBytes(32).toString("base64") }, lover: { verifier: verifier(PHRASE, "album:lover"), dataKey: randomBytes(32).toString("base64") } },
  auditKey: randomBytes(32).toString("base64"), ipHmacKey: randomBytes(32).toString("base64"), dashboardKey: randomBytes(32).toString("base64"),
  passwordPepper: fixturePepper,
};

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "gallery-audit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const db = new SQLite(join(directory, "audit.sqlite"));
  await db.execute(await readFile(new URL("../services/gallery-worker/migrations/0001_audit.sql", import.meta.url), "utf8"));
  const env: Env = { DB: db, SECRETS: JSON.stringify(fixtureSecrets), ALLOWED_ORIGINS: "https://example.test", ALBUM_SLUGS: "life,lover,photography,aesthetic", ENVIRONMENT: "production" };
  let now = Date.UTC(2026, 8, 23, 12);
  t.mock.method(Date, "now", () => now);
  const call = (path: string, body?: unknown, options: { ip?: string; token?: string; origin?: string; cf?: boolean; method?: string } = {}) => {
    const request = new Request(`https://audit.example.test${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: options.origin ?? "https://example.test", "Content-Type": "application/json", "CF-Connecting-IP": options.ip ?? "203.0.113.7", "X-Forwarded-For": "192.0.2.199",
        "User-Agent": "Synthetic Browser", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (options.cf !== false) Object.defineProperty(request, "cf", { value: { country: "TW", city: "Example City", region: "Example Region", latitude: "25.033012", longitude: "121.565428" } });
    return handleRequest(request, env);
  };
  const events = async () => {
    const rows = await db.prepare("SELECT id, payload FROM audit_events ORDER BY occurred_at, rowid").all<{ id: string; payload: string }>();
    return Promise.all(rows.results.map((row) => unseal<AuditEvent>(fixtureSecrets.auditKey, row.id, row.payload)));
  };
  return { db, env, call, events, now: () => now, advance: (milliseconds: number) => { now += milliseconds; } };
}

test("hybrid v2 retains PBKDF2 and requires the right pepper, salt, role, iteration count, and full MAC", async (t) => {
  const password = "Synthetic Unicode phrase 字 \u0000 with punctuation";
  const value = verifier(password, "album:life");
  const originalDeriveBits = crypto.subtle.deriveBits;
  const derivations: number[] = [];
  t.mock.method(crypto.subtle, "deriveBits", (...args: unknown[]) => {
    derivations.push((args[0] as Pbkdf2Params).iterations);
    return Reflect.apply(originalDeriveBits, crypto.subtle, args) as Promise<ArrayBuffer>;
  });
  assert.equal(await verifyPassword(password, value, fixturePepper), true);
  assert.deepEqual(derivations, [30_000], "Verification must execute the retained slow KDF at its configured work factor.");
  assert.equal(await verifyPassword(password + "!", value, fixturePepper), false);
  assert.equal(await verifyPassword(password, value), false);
  assert.equal(await verifyPassword(password, value, randomBytes(32).toString("base64")), false);
  assert.equal(await verifyPassword(password, value, randomBytes(31).toString("base64")), false);
  assert.equal(await verifyPassword(password, { ...value, salt: randomBytes(16).toString("base64") }, fixturePepper), false);
  assert.equal(await verifyPassword(password, { ...value, context: "album:lover" as const }, fixturePepper), false);
  assert.equal(await verifyPassword(password, { ...value, iterations: 30_001 }, fixturePepper), false);
  assert.equal(await verifyPassword(password, { ...value, hash: Buffer.from(value.hash, "base64").subarray(0, 31).toString("base64") }, fixturePepper), false);
  assert.notEqual(fixtureSecrets.albums.life.verifier.hash, fixtureSecrets.albums.lover.verifier.hash);
});

test("hybrid iteration bounds admit 30k through 100k and reject unsafe or malformed values before deriving", async (t) => {
  for (const iterations of [30_000, 60_000, 100_000]) {
    const value = verifier(PHRASE, "album:life", iterations);
    assert.equal(await verifyPassword(PHRASE, value, fixturePepper), true);
    const config = { ...fixtureSecrets, albums: { ...fixtureSecrets.albums, life: { ...fixtureSecrets.albums.life, verifier: value } } };
    assert.doesNotThrow(() => parseSecrets(JSON.stringify(config)));
  }
  const value = verifier(PHRASE, "album:life");
  t.mock.method(crypto.subtle, "deriveBits", () => { throw new Error("Out-of-range iterations must fail before PBKDF2"); });
  for (const iterations of [0, 29_999, 100_001, 30_000.5, NaN]) {
    const malformed = { ...value, iterations };
    assert.equal(await verifyPassword(PHRASE, malformed, fixturePepper), false);
    const config = { ...fixtureSecrets, albums: { ...fixtureSecrets.albums, life: { ...fixtureSecrets.albums.life, verifier: malformed } } };
    assert.throws(() => parseSecrets(JSON.stringify(config)), /^Error: Invalid secret configuration$/);
  }
});

test("v2 configuration fails closed on missing pepper or transplanted credential roles before recording an attempt", async (t) => {
  const f = await setup(t);
  const malformed: Secrets[] = [
    { ...fixtureSecrets, passwordPepper: undefined },
    { ...fixtureSecrets, passwordPepper: randomBytes(31).toString("base64") },
    { ...fixtureSecrets, adminVerifier: fixtureSecrets.resetVerifier },
    { ...fixtureSecrets, albums: { ...fixtureSecrets.albums, life: fixtureSecrets.albums.lover } },
  ];
  for (const value of malformed) {
    assert.throws(() => parseSecrets(JSON.stringify(value)), /^Error: Invalid secret configuration$/);
    f.env.SECRETS = JSON.stringify(value);
    const response = await f.call("/v1/albums/life/unlock", { password: PHRASE });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "service_unavailable" });
  }
  assert.equal((await f.events()).length, 0);
  assert.equal((await f.db.prepare("SELECT * FROM auth_state").all()).results.length, 0);
});

test("legacy PBKDF2 credentials continue to unlock albums and authorize administration before v2 secret migration", async (t) => {
  const f = await setup(t);
  const previous: Secrets = {
    ...fixtureSecrets, passwordPepper: undefined,
    adminVerifier: legacyVerifier(ADMIN), resetVerifier: legacyVerifier(RESET),
    albums: Object.fromEntries(Object.entries(fixtureSecrets.albums).map(([slug, album]) => [slug, { ...album, verifier: legacyVerifier(PHRASE) }])),
  };
  f.env.SECRETS = JSON.stringify(previous);
  assert.deepEqual(parseSecrets(f.env.SECRETS), JSON.parse(f.env.SECRETS));
  assert.equal(await verifyPassword(PHRASE, previous.albums.life.verifier), true);
  assert.equal(await verifyPassword(PHRASE + "!", previous.albums.life.verifier), false);
  const unlocked = await f.call("/v1/albums/life/unlock", { password: PHRASE });
  assert.equal(unlocked.status, 200);
  assert.equal((await unlocked.json() as { viewKey: string }).viewKey, fixtureSecrets.albums.life.dataKey);
  const response = await f.call("/v1/admin/session", { password: ADMIN });
  assert.equal(response.status, 200);
  const session = await response.json() as { token: string };
  assert.equal((await f.call("/v1/admin/reset", { password: RESET }, { token: session.token })).status, 200);
});

test("album cooldown begins at failure 6, escalates globally across albums, and expires after a quiet 24 hours", async (t) => {
  const f = await setup(t);
  const delays = [0, 0, 0, 0, 0, 60_000, 300_000, 600_000, 1_200_000, 1_800_000, 3_600_000, 3_600_000];
  for (let i = 0; i < delays.length; i++) {
    const slug = i % 2 ? "lover" : "life";
    const response = await f.call(`/v1/albums/${slug}/unlock`, { password: `wrong ${i}` });
    assert.equal(response.status, delays[i] ? 429 : 401);
    const result = await response.json() as { failureCount: number; blockedUntil: number };
    assert.equal(result.failureCount, i + 1);
    assert.equal(result.blockedUntil, delays[i] ? f.now() + delays[i] : 0);
    if (delays[i]) {
      const blocked = await f.call("/v1/albums/life/unlock", { password: "blocked value must never be recorded" });
      assert.equal(blocked.status, 429);
      const status = await (await f.call("/v1/albums/lover/status")).json() as typeof result;
      assert.deepEqual(status, { failureCount: i + 1, blockedUntil: result.blockedUntil });
      f.advance(delays[i] + 1);
    }
  }
  const successful = await f.call("/v1/albums/life/unlock", { password: PHRASE });
  assert.equal(successful.status, 200);
  assert.equal((await successful.json() as { viewKey: string }).viewKey, fixtureSecrets.albums.life.dataKey);
  assert.equal((await (await f.call("/v1/albums/life/status")).json() as { failureCount: number }).failureCount, 12);
  f.advance(DAY + 1);
  const fresh = await f.call("/v1/albums/life/unlock", { password: "wrong after idle period" });
  assert.equal(fresh.status, 401);
  assert.equal((await fresh.json() as { failureCount: number }).failureCount, 1);
  assert.ok((await f.events()).every((event) => event.attemptedPhrase !== "blocked value must never be recorded"));
});

test("atomic SQLite lease prevents concurrent same-IP requests from racing the failure count", async (t) => {
  const f = await setup(t);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => f.call(`/v1/albums/${i % 2 ? "life" : "lover"}/unlock`, { password: "parallel wrong" })));
  const bodies = await Promise.all(responses.map((response) => response.json() as Promise<{ error: string }>));
  const verifiedCount = bodies.filter((body) => body.error === "incorrect_phrase").length;
  assert.ok(verifiedCount >= 1 && verifiedCount <= 6);
  assert.ok(responses.every((response) => [401, 409, 429].includes(response.status)), JSON.stringify(responses.map((response) => response.status)));
  const status = await (await f.call("/v1/albums/life/status")).json() as { failureCount: number };
  assert.equal(status.failureCount, verifiedCount);
  assert.equal((await f.events()).filter((event) => event.kind === "unlock_failure").length, verifiedCount);
});

test("lease renewal is atomic at expiry and an old owner cannot release or alter its successor", async (t) => {
  const f = await setup(t);
  const identity = "synthetic-lease-expiry";
  const first = await acquireLease(f.db, identity, f.now());
  assert.ok(first);
  assert.equal(await acquireLease(f.db, identity, f.now() + 29_999), null);
  await f.db.prepare("UPDATE auth_state SET failures = 4, last_failure = ?, blocked_until = ? WHERE identity = ?")
    .bind(f.now(), f.now() + 60_000, identity).run();
  const next = await acquireLease(f.db, identity, f.now() + 30_000);
  assert.ok(next);
  assert.notEqual(next.lease_token, first.lease_token);
  assert.equal(next.failures, 4);
  assert.equal(next.blocked_until, f.now() + 60_000);
  await assert.rejects(releaseLease(f.db, first), /Expired authentication lease/);
  await assert.rejects(recordFailure(f.db, first, f.now() + 30_001), /Expired authentication lease/);
  await releaseLease(f.db, next);
  const released = await acquireLease(f.db, identity, f.now() + 30_001);
  assert.ok(released);
  assert.equal(released.failures, 4);
});

test("only verified wrong shared phrases are encrypted in audit payloads and client location/time is ignored", async (t) => {
  const f = await setup(t);
  const attempt = "<script>alert('synthetic')</script>" + "字".repeat(260);
  await f.call("/v1/albums/life/unlock", { password: attempt, ip: "192.0.2.1", at: 0, latitude: 1.234567, longitude: 2.34567, language: "zh", timezone: "Asia/Taipei", referrerHost: "safe.example.test", extraneous: "do not save" });
  await f.call("/v1/albums/life/unlock", { password: PHRASE });
  await f.call("/v1/admin/session", { password: "wrong administrator secret" });
  const records = await f.events();
  const failed = records.find((event) => event.kind === "unlock_failure")!;
  assert.equal(failed.ip, "203.0.113.7");
  assert.equal(failed.at, f.now());
  assert.deepEqual(failed.location, { accuracy: "network-approximate", country: "TW", city: "Example City", region: "Example Region", latitude: 25, longitude: 121.6 });
  assert.equal(failed.attemptedPhrase, Array.from(attempt).slice(0, 256).join(""));
  assert.equal(failed.attemptTruncated, true);
  assert.equal(failed.referrerHost, "safe.example.test");
  assert.ok(!("extraneous" in failed));
  assert.ok(records.filter((event) => event.kind !== "unlock_failure").every((event) => !("attemptedPhrase" in event)));
  const stored = JSON.stringify((await f.db.prepare("SELECT * FROM audit_events").all()).results);
  for (const forbidden of ["203.0.113.7", "Example City", "script", PHRASE, "wrong administrator secret"]) assert.ok(!stored.includes(forbidden));
});

test("visits deduplicate per IP/album/event ID, and dashboards require a short-lived hashed bearer session", async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 3; i++) assert.equal((await f.call("/v1/visits", { album: "photography", eventId: "unique-visit-id" })).status, 200);
  await f.call("/v1/visits", { album: "life", eventId: "unique-visit-id" });
  await f.call("/v1/visits", { album: "photography", eventId: "unique-visit-id" }, { ip: "203.0.113.8" });
  assert.equal((await f.call("/v1/admin/data")).status, 401);
  const sessionResponse = await f.call("/v1/admin/session", { password: ADMIN });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json() as { token: string; dashboardKey: string; expiresAt: number };
  assert.equal(session.dashboardKey, fixtureSecrets.dashboardKey);
  assert.equal(session.expiresAt, f.now() + 15 * 60_000);
  assert.ok(!JSON.stringify((await f.db.prepare("SELECT * FROM admin_sessions").all()).results).includes(session.token));
  const data = await (await f.call("/v1/admin/data?days=30&album=all", undefined, { token: session.token })).json() as DashboardData;
  assert.equal(data.totals.visits, 3);
  assert.equal(data.totals.uniqueVisitors, 2);
  assert.equal(data.albums.find((album) => album.slug === "photography")?.visits, 2);
  assert.equal(data.truncated, false);
  const album = await (await f.call("/v1/admin/data?album=life", undefined, { token: session.token })).json() as DashboardData;
  assert.equal(album.totals.visits, 1);
  assert.equal(album.events.length, 1);
  f.advance(15 * 60_000);
  assert.equal((await f.call("/v1/admin/data", undefined, { token: session.token })).status, 401);
});

test("admin login commits its success audit and hashed session atomically, rolling both back on failure", async (t) => {
  const f = await setup(t);
  const originalBatch = f.db.batch.bind(f.db);
  const batches: string[][] = [];
  t.mock.method(f.db, "batch", (statements: D1Statement[]) => {
    batches.push(statements.map((statement) => (statement as SQLiteStatement).sql()));
    return originalBatch(statements);
  });
  assert.equal((await f.call("/v1/admin/session", { password: "Synthetic incorrect administrator phrase" })).status, 401);
  assert.equal((await f.events()).filter((event) => event.kind === "admin_login_failure").length, 1);
  assert.equal(batches.length, 0, "Failed authentication keeps the single-statement audit path");

  await f.db.execute("CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON admin_sessions BEGIN SELECT RAISE(ABORT, 'Synthetic transaction failure'); END");
  const failed = await f.call("/v1/admin/session", { password: ADMIN });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "service_unavailable" });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.match(batches[0][0], /^INSERT INTO audit_events/);
  assert.match(batches[0][1], /^INSERT INTO admin_sessions/);
  assert.equal((await f.events()).filter((event) => event.kind === "admin_login_success").length, 0, "The first audit insert must roll back when the second session insert fails");
  assert.equal((await f.db.prepare("SELECT * FROM admin_sessions").all()).results.length, 0);
  assert.equal((await f.events()).filter((event) => event.kind === "admin_login_failure").length, 1);

  await f.db.execute("DROP TRIGGER synthetic_session_failure");
  const successful = await f.call("/v1/admin/session", { password: ADMIN });
  assert.equal(successful.status, 200);
  const session = await successful.json() as { token: string; expiresAt: number; dashboardKey: string };
  assert.equal(typeof session.token, "string");
  assert.ok(session.token.length > 0);
  assert.equal(batches.length, 2);
  assert.equal((await f.events()).filter((event) => event.kind === "admin_login_success").length, 1);
  const rows = (await f.db.prepare("SELECT token_hash, created_at, expires_at FROM admin_sessions").all<{ token_hash: string; created_at: number; expires_at: number }>()).results;
  assert.deepEqual(rows, [{ token_hash: createHash("sha256").update(session.token).digest("base64"), created_at: f.now(), expires_at: session.expiresAt }]);
  assert.equal(JSON.stringify(rows).includes(session.token), false, "Only the bearer token hash is stored after commit");
});

test("dashboard pages bound decryption, retain full totals and traverse a stable snapshot without duplicates", async (t) => {
  const f = await setup(t);
  const rows: AuditEvent[] = Array.from({ length: 2001 }, (_, index) => ({
    id: `synthetic-bulk-${String(index).padStart(4, "0")}`, at: f.now() - Math.floor(index / 3) * 1000,
    album: index % 2 ? "photography" : "life", kind: "visit",
    ip: `203.0.113.${index % 3 + 1}`, visitorId: `synthetic-visitor-${index % 3}`,
    location: { accuracy: "network-approximate" },
  }));
  rows.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  const key = Buffer.from(fixtureSecrets.auditKey, "base64");
  await f.db.batch(rows.map((event) => {
    // Produce independent AES-GCM fixtures with Node crypto, rather than using
    // the implementation's sealing function to generate its own expected data.
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`gallery-audit:v1:${event.id}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(event)), cipher.final(), cipher.getAuthTag()]);
    const payload = `${iv.toString("base64")}.${ciphertext.toString("base64")}`;
    return f.db.prepare("INSERT INTO audit_events(id, occurred_at, album, kind, identity, payload) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.at, event.album, event.kind, event.visitorId, payload);
  }));
  key.fill(0);
  // Start this isolated read with a freshly validated server configuration;
  // imported server keys may then be reused across its continuation pages.
  parseSecrets(JSON.stringify(fixtureSecrets, null, 2));
  const originalImportKey = crypto.subtle.importKey;
  const originalDecrypt = crypto.subtle.decrypt;
  let decryptionKeyImports = 0;
  let decryptions = 0;
  let summaryQueries = 0;
  const originalPrepare = f.db.prepare;
  t.mock.method(f.db, "prepare", (sql: string) => {
    if (sql.includes("SUM(CASE")) summaryQueries++;
    return originalPrepare.call(f.db, sql);
  });
  t.mock.method(crypto.subtle, "importKey", (...args: unknown[]) => {
    if (args[2] === "AES-GCM" && Array.isArray(args[4]) && args[4].includes("decrypt")) decryptionKeyImports++;
    return Reflect.apply(originalImportKey, crypto.subtle, args) as Promise<CryptoKey>;
  });
  t.mock.method(crypto.subtle, "decrypt", (...args: unknown[]) => {
    decryptions++;
    return Reflect.apply(originalDecrypt, crypto.subtle, args) as Promise<ArrayBuffer>;
  });
  const readPage = async (cursor?: string, album = "all", days = 30) => {
    const before = decryptions;
    const result = await readDashboard(f.db, fixtureSecrets, ["life", "photography"], days, album, f.now(), cursor);
    assert.equal(decryptions - before, result.events.length);
    assert.ok(decryptions - before <= 50, "A response must never decrypt more than one bounded page.");
    return result;
  };
  const data = await readPage();
  assert.equal(decryptionKeyImports, 1);
  assert.equal(summaryQueries, 2);
  assert.equal(data.truncated, true);
  assert.deepEqual(data.events, rows.slice(0, 50));
  assert.deepEqual(data.totals, { visits: 2001, uniqueVisitors: 3, failedUnlocks: 0, successfulUnlocks: 0, blockedAttempts: 0 });
  assert.equal(data.albums?.find((album) => album.slug === "life")?.visits, 1001);
  assert.equal(data.albums?.find((album) => album.slug === "photography")?.visits, 1000);
  assert.ok(data.nextCursor);
  await assert.rejects(readPage("invalid"), /Invalid dashboard cursor/);
  await assert.rejects(readPage(`${data.nextCursor.slice(0, -4)}AAAA`), /Invalid dashboard cursor/);
  await assert.rejects(readPage(data.nextCursor, "life"), /Invalid dashboard cursor/);
  await assert.rejects(readPage(data.nextCursor, "all", 7), /Invalid dashboard cursor/);
  assert.equal(decryptionKeyImports, 1, "Rejected cursors never decrypt any events.");
  // A late insertion with an older timestamp must not enter this snapshot.
  await writeAudit(f.db, fixtureSecrets, { ip: "203.0.113.50", identity: "late-visitor", location: { accuracy: "network-approximate" } }, { album: "life", kind: "visit", now: f.now() - 100_000 });
  const events = [...data.events];
  let page = data;
  while (page.nextCursor) {
    page = await readPage(page.nextCursor);
    assert.ok(page.events.length <= 50);
    assert.equal(page.generatedAt, data.generatedAt);
    assert.equal(page.totals, undefined);
    assert.equal(page.albums, undefined);
    events.push(...page.events);
  }
  assert.equal(page.truncated, true);
  assert.equal(decryptionKeyImports, 1, "All pages reuse the same imported key while the server configuration is unchanged.");
  assert.equal(summaryQueries, 2, "Continuation pages never repeat the aggregate queries.");
  assert.deepEqual(events, rows.slice(0, 2000));
  assert.equal(new Set(events.map((event) => event.id)).size, 2000);
  const filtered = await readPage(undefined, "photography");
  const filteredEvents = [...filtered.events];
  page = filtered;
  while (page.nextCursor) {
    page = await readPage(page.nextCursor, "photography");
    filteredEvents.push(...page.events);
  }
  assert.equal(page.truncated, false, "An exact multiple of the page size does not claim truncation.");
  assert.deepEqual(filteredEvents, rows.filter((row) => row.album === "photography"));
  assert.equal(filtered.totals?.visits, 1000);
  // This temporary fixture has no real visitor data. Exactly 2000 rows should
  // finish at the display cap without claiming additional records exist.
  await f.db.prepare("DELETE FROM audit_events WHERE identity = ? OR id = ?").bind("late-visitor", rows.at(-1)!.id).run();
  page = await readPage();
  let exactCount = page.events.length;
  while (page.nextCursor) {
    page = await readPage(page.nextCursor);
    exactCount += page.events.length;
  }
  assert.equal(exactCount, 2000);
  assert.equal(page.truncated, false);
  const session = await (await f.call("/v1/admin/session", { password: ADMIN })).json() as { token: string };
  assert.equal((await f.call("/v1/admin/data?cursor=invalid", undefined, { token: session.token })).status, 400);
  assert.equal((await f.call(`/v1/admin/data?cursor=${encodeURIComponent(data.nextCursor)}`)).status, 401);
  f.advance(15 * 60_000 + 1);
  await assert.rejects(readPage(data.nextCursor), /Invalid dashboard cursor/);
});

test("reset requires independent authorization, deletes records, and preserves album lockouts", async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 6; i++) await f.call("/v1/albums/life/unlock", { password: "wrong" });
  const session = await (await f.call("/v1/admin/session", { password: ADMIN })).json() as { token: string };
  assert.equal((await f.call("/v1/admin/reset", { password: RESET })).status, 401);
  assert.equal((await f.call("/v1/admin/reset", { password: ADMIN }, { token: session.token })).status, 401);
  assert.ok((await f.events()).length > 0);
  assert.equal((await f.call("/v1/admin/reset", { password: RESET }, { token: session.token })).status, 200);
  assert.equal((await f.events()).length, 0);
  const limit = await (await f.call("/v1/albums/lover/status")).json() as { failureCount: number; blockedUntil: number };
  assert.equal(limit.failureCount, 6);
  assert.equal(limit.blockedUntil, f.now() + 60_000);
  assert.equal((await f.call("/v1/admin/logout", {}, { token: session.token })).status, 200);
  assert.equal((await f.call("/v1/admin/data", undefined, { token: session.token })).status, 401);
});

test("CORS, trusted edge context, input limits, and response headers fail closed", async (t) => {
  const f = await setup(t);
  assert.equal((await f.call("/v1/visits", { album: "life", eventId: "valid-event" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await f.call("/v1/albums/life/status", undefined, { cf: false })).status, 503);
  assert.equal((await f.call("/v1/albums/life/unlock", { password: "x".repeat(513) })).status, 400);
  assert.equal((await f.call("/v1/albums/life/unlock", { password: "x".repeat(5000) })).status, 413);
  assert.equal((await f.call("/v1/visits", { album: "../../unknown", eventId: "valid-event" })).status, 400);
  const health = await f.call("/v1/health");
  assert.equal(health.headers.get("Cache-Control"), "no-store");
  assert.equal(health.headers.get("Access-Control-Allow-Origin"), "https://example.test");
  const preflight = await f.call("/v1/albums/life/unlock", undefined, { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Headers"), "Content-Type, Authorization");
  f.env.ENVIRONMENT = "local";
  await f.call("/v1/albums/life/unlock", { password: "local wrong" }, { ip: "192.0.2.1" });
  const localStatus = await (await f.call("/v1/albums/lover/status", undefined, { ip: "192.0.2.2" })).json() as { failureCount: number };
  assert.equal(localStatus.failureCount, 1, "Local caller headers must not create distinct rate-limit identities, even when cf metadata exists.");
  assert.equal((await f.events()).at(-1)?.ip, "127.0.0.1");
  assert.deepEqual((await f.events()).at(-1)?.location, { accuracy: "network-approximate" });
});

test("slow streamed bodies cannot backdate a cooldown or extend an expired administrator session", async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 5; i++) await f.call("/v1/albums/life/unlock", { password: "wrong" });
  const session = await (await f.call("/v1/admin/session", { password: ADMIN })).json() as { token: string };
  async function slowRequest(path: string, password: string, delay: number, token?: string) {
    let release!: () => void;
    let reading!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const readStarted = new Promise<void>((resolve) => { reading = resolve; });
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        reading();
        await gate;
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ password })));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const options: RequestInit & { duplex: "half" } = {
      method: "POST", duplex: "half", body,
      headers: { Origin: "https://example.test", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
    const request = new Request(`https://audit.example.test${path}`, options);
    Object.defineProperty(request, "cf", { value: {} });
    const response = handleRequest(request, f.env);
    await readStarted;
    f.advance(delay);
    release();
    return response;
  }
  const blocked = await slowRequest("/v1/albums/life/unlock", "wrong after a slow upload", 120_000);
  assert.equal(blocked.status, 429);
  const limit = await blocked.json() as { failureCount: number; blockedUntil: number };
  assert.equal(limit.failureCount, 6);
  assert.equal(limit.blockedUntil, f.now() + 60_000);
  const before = (await f.events()).length;
  const expired = await slowRequest("/v1/admin/reset", RESET, 16 * 60_000, session.token);
  assert.equal(expired.status, 401);
  assert.equal((await f.events()).length, before);
});

test("scheduled maintenance deletes ninety-day records, expired sessions, and stale rate state", async (t) => {
  const f = await setup(t);
  const context = { ip: "203.0.113.7", identity: await identify(fixtureSecrets.ipHmacKey, "fixture"), location: { accuracy: "network-approximate" as const } };
  await writeAudit(f.db, fixtureSecrets, context, { album: "life", kind: "visit", now: f.now() - 91 * DAY });
  await writeAudit(f.db, fixtureSecrets, context, { album: "life", kind: "visit", now: f.now() - 89 * DAY });
  await f.call("/v1/albums/life/unlock", { password: "wrong" });
  await f.call("/v1/admin/session", { password: ADMIN });
  f.advance(2 * DAY);
  await worker.scheduled({}, f.env);
  const records = await f.events();
  assert.equal(records.filter((record) => record.kind === "visit").length, 0);
  assert.equal((await f.db.prepare("SELECT * FROM admin_sessions").all()).results.length, 0);
  assert.equal((await f.db.prepare("SELECT * FROM auth_state").all()).results.length, 0);
  assert.equal(records.length, 2);
});
