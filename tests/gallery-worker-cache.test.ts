import assert from "node:assert/strict";
import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import test, { type TestContext } from "node:test";
import { fromBase64, identify, importAuditDecryptionKey, parseSecrets, seal, toBase64, unseal, verifyPassword, warmServerKeys } from "../services/gallery-worker/crypto";
import type { CredentialContext, HybridPasswordVerifier, Secrets } from "../services/gallery-worker/types";

const password = "Synthetic cache test password 密碼";
const key = () => randomBytes(32).toString("base64");

function verifier(context: CredentialContext, pepper: string): HybridPasswordVerifier {
  const salt = randomBytes(16).toString("base64");
  const iterations = 30_000;
  const derived = pbkdf2Sync(password, Buffer.from(salt, "base64"), iterations, 32, "sha256").toString("base64");
  const hash = createHmac("sha256", Buffer.from(pepper, "base64"))
    .update(JSON.stringify(["gallery-password:v2", context, salt, iterations, derived])).digest("base64");
  return { version: 2, algorithm: "PBKDF2-HMAC-SHA256+HMAC-SHA256", context, salt, iterations, hash };
}

function fixture(): Secrets & { passwordPepper: string } {
  const passwordPepper = key();
  return {
    passwordPepper, auditKey: key(), ipHmacKey: key(), dashboardKey: key(),
    adminVerifier: verifier("admin-login", passwordPepper), resetVerifier: verifier("admin-reset", passwordPepper),
    albums: { life: { verifier: verifier("album:life", passwordPepper), dataKey: key() } },
  };
}

function imports(t: TestContext) {
  const original = crypto.subtle.importKey;
  const counts = new Map<string, number>();
  t.mock.method(crypto.subtle, "importKey", (...args: unknown[]) => {
    const algorithm = typeof args[2] === "string" ? args[2] : (args[2] as Algorithm).name;
    const purpose = `${algorithm}:${(args[4] as KeyUsage[]).join(",")}`;
    counts.set(purpose, (counts.get(purpose) ?? 0) + 1);
    return Reflect.apply(original, crypto.subtle, args) as Promise<CryptoKey>;
  });
  return (purpose: string) => counts.get(purpose) ?? 0;
}

test("only the identical valid configuration is reused, frozen, and changes clear imported keys before validation", async (t) => {
  const first = fixture();
  const second = { ...fixture(), auditKey: first.auditKey };
  const firstSource = JSON.stringify(first);
  const secondSource = JSON.stringify(second);
  const count = imports(t);
  const parsedFirst = parseSecrets(firstSource);
  assert.equal(parseSecrets(firstSource), parsedFirst);
  for (const value of [parsedFirst, parsedFirst.adminVerifier, parsedFirst.resetVerifier,
    parsedFirst.albums, parsedFirst.albums.life, parsedFirst.albums.life.verifier]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { parsedFirst.albums.life.dataKey = key(); }, TypeError);
  const firstKey = await importAuditDecryptionKey(first.auditKey);
  assert.equal(await importAuditDecryptionKey(first.auditKey), firstKey);
  assert.equal(count("AES-GCM:decrypt"), 1);

  const parsedSecond = parseSecrets(secondSource);
  assert.notEqual(parsedSecond, parsedFirst);
  const secondKey = await importAuditDecryptionKey(first.auditKey);
  assert.notEqual(secondKey, firstKey, "A changed configuration invalidates even unchanged raw keys");
  assert.equal(count("AES-GCM:decrypt"), 2);
  assert.throws(() => parseSecrets("invalid synthetic configuration"), /^Error: Invalid secret configuration$/);
  assert.notEqual(await importAuditDecryptionKey(first.auditKey), secondKey, "Invalid configuration clears keys immediately");
  assert.equal(count("AES-GCM:decrypt"), 3);
  assert.throws(() => parseSecrets("null"), /^Error: Invalid secret configuration$/);
  assert.notEqual(parseSecrets(secondSource), parsedSecond, "Invalid input must not fall back to the previous cached configuration");
  assert.notEqual(parseSecrets(firstSource), parsedFirst, "Only one configuration is retained");
  const reparsed = parseSecrets(firstSource);
  const reordered = parseSecrets(JSON.stringify(first, null, 2));
  assert.notEqual(reordered, reparsed, "Cache identity depends on the exact source string");
});

test("concurrent server-key imports share a promise while HMAC and AES purposes stay independent", async (t) => {
  parseSecrets(JSON.stringify(fixture()));
  const count = imports(t);
  const raw = key();
  const messages = ["first synthetic identity", "second synthetic identity", "first synthetic identity"];
  const signatures = await Promise.all(messages.map((message) => identify(raw, message)));
  assert.deepEqual(signatures, messages.map((message) => createHmac("sha256", Buffer.from(raw, "base64")).update(message).digest("base64")));
  assert.equal(count("HMAC:sign"), 1);

  const payloads = [{ fixture: "one" }, { fixture: "two" }];
  const ciphertexts = await Promise.all(payloads.map((payload, index) => seal(raw, `event-${index}`, payload)));
  const decrypted = await Promise.all(ciphertexts.map((ciphertext, index) => unseal(raw, `event-${index}`, ciphertext)));
  assert.deepEqual(decrypted, payloads);
  assert.equal(count("AES-GCM:encrypt"), 1);
  assert.equal(count("AES-GCM:decrypt"), 1);
  assert.equal(await importAuditDecryptionKey(raw), await importAuditDecryptionKey(raw));
  assert.equal(count("AES-GCM:decrypt"), 1);

  const value = verifier("admin-login", raw);
  assert.equal(await verifyPassword(password, value, raw), true);
  assert.equal(count("HMAC:verify"), 1, "HMAC verify imports are separate from HMAC sign imports for the same key");
  assert.equal(count("HMAC:sign"), 1);
});

test("every password attempt repeats PBKDF2 but reuses only the server pepper key", async (t) => {
  const secrets = fixture();
  parseSecrets(JSON.stringify(secrets));
  const count = imports(t);
  const original = crypto.subtle.deriveBits;
  let derivations = 0;
  t.mock.method(crypto.subtle, "deriveBits", (...args: unknown[]) => {
    derivations++;
    return Reflect.apply(original, crypto.subtle, args) as Promise<ArrayBuffer>;
  });
  assert.deepEqual(await Promise.all([
    verifyPassword(password, secrets.adminVerifier, secrets.passwordPepper),
    verifyPassword(password, secrets.adminVerifier, secrets.passwordPepper),
  ]), [true, true]);
  assert.equal(count("PBKDF2:deriveBits"), 2);
  assert.equal(derivations, 2);
  assert.equal(count("HMAC:verify"), 1);
  assert.equal(await verifyPassword(password, secrets.adminVerifier, key()), false, "A different pepper cannot reuse a cached successful decision");
  assert.equal(await verifyPassword(password + "wrong", secrets.adminVerifier, secrets.passwordPepper), false);
  assert.equal(await verifyPassword(password, secrets.adminVerifier, secrets.passwordPepper), true);
  assert.equal(count("PBKDF2:deriveBits"), 5);
  assert.equal(derivations, 5);
  assert.equal(count("HMAC:verify"), 2);
});

test("rejected server-key imports can retry and the cache does not retain more than eight keys", async (t) => {
  parseSecrets(JSON.stringify(fixture()));
  const original = crypto.subtle.importKey;
  let attempts = 0;
  t.mock.method(crypto.subtle, "importKey", (...args: unknown[]) => {
    attempts++;
    if (attempts === 1) return Promise.reject(new Error("Synthetic import failure"));
    return Reflect.apply(original, crypto.subtle, args) as Promise<CryptoKey>;
  });
  const retryKey = key();
  await assert.rejects(identify(retryKey, "retry fixture"), /Synthetic import failure/);
  assert.equal(await identify(retryKey, "retry fixture"), createHmac("sha256", Buffer.from(retryKey, "base64")).update("retry fixture").digest("base64"));
  assert.equal(attempts, 2);
  await identify(retryKey, "another fixture");
  assert.equal(attempts, 2, "A successful retry is cached");

  parseSecrets(JSON.stringify(fixture()));
  const keys = Array.from({ length: 9 }, key);
  const start = attempts;
  for (const raw of keys) await identify(raw, "bounded cache fixture");
  assert.equal(attempts - start, 9);
  for (const raw of keys) await identify(raw, "bounded cache fixture");
  assert.ok(attempts - start > 9, "At least one of nine different server keys must be evicted from an eight-key cache");
});

test("base64 conversion matches Node across empty, key-sized, and chunk-boundary payloads", () => {
  for (const size of [0, 1, 31, 4095, 4096, 4097, 16385]) {
    const bytes = randomBytes(size);
    const encoded = bytes.toString("base64");
    assert.equal(toBase64(new Uint8Array(bytes)), encoded);
    assert.deepEqual(Buffer.from(fromBase64(encoded)), bytes);
    assert.deepEqual(Buffer.from(fromBase64(bytes.toString("base64url"))), bytes);
  }
});

test("warming imports only server keys, reuses an identical configuration, and never skips password derivation", async (t) => {
  const first = fixture();
  const second = fixture();
  const firstSource = JSON.stringify(first);
  const secondSource = JSON.stringify(second);
  const count = imports(t);
  const originalDeriveBits = crypto.subtle.deriveBits;
  const forbidden = () => { throw new Error("Synthetic forbidden work during server-key warming"); };
  const deriveMock = t.mock.method(crypto.subtle, "deriveBits", forbidden);
  const randomMock = t.mock.method(crypto, "getRandomValues", forbidden);
  const uuidMock = t.mock.method(crypto, "randomUUID", forbidden);
  const fetchMock = t.mock.method(globalThis, "fetch", forbidden);
  const purposes = ["HMAC:sign", "HMAC:verify", "AES-GCM:encrypt", "AES-GCM:decrypt"];

  await warmServerKeys(firstSource);
  await warmServerKeys(firstSource);
  for (const purpose of purposes) assert.equal(count(purpose), 1);
  assert.equal(count("PBKDF2:deriveBits"), 0);
  assert.equal(deriveMock.mock.callCount(), 0);
  assert.equal(randomMock.mock.callCount(), 0);
  assert.equal(uuidMock.mock.callCount(), 0);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(await identify(first.ipHmacKey, "warmed fixture"), createHmac("sha256", Buffer.from(first.ipHmacKey, "base64")).update("warmed fixture").digest("base64"));
  await importAuditDecryptionKey(first.auditKey);

  randomMock.mock.restore();
  const encrypted = await seal(first.auditKey, "warmed-event", { fixture: "warmed payload" });
  assert.deepEqual(await unseal(first.auditKey, "warmed-event", encrypted), { fixture: "warmed payload" });
  for (const purpose of purposes) assert.equal(count(purpose), 1, "Operations reuse keys imported by warming");

  await warmServerKeys(secondSource);
  await warmServerKeys(secondSource);
  for (const purpose of purposes) assert.equal(count(purpose), 2, "A changed configuration imports its own four keys once");
  assert.equal(count("PBKDF2:deriveBits"), 0);
  deriveMock.mock.restore();
  let derivations = 0;
  t.mock.method(crypto.subtle, "deriveBits", (...args: unknown[]) => {
    derivations++;
    return Reflect.apply(originalDeriveBits, crypto.subtle, args) as Promise<ArrayBuffer>;
  });
  assert.equal(await verifyPassword(password, second.adminVerifier, second.passwordPepper), true);
  assert.equal(derivations, 1, "Warming must not precompute credentials or successful authentication");
  assert.equal(count("PBKDF2:deriveBits"), 1);
  assert.equal(count("HMAC:verify"), 2, "Password verification reuses only the warmed pepper key");
  assert.equal(uuidMock.mock.callCount(), 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("warming rejects invalid configurations and import failures, and a rejected import remains retryable", async (t) => {
  const source = JSON.stringify(fixture());
  await assert.rejects(warmServerKeys("invalid synthetic configuration"), /^Error: Invalid secret configuration$/);
  const original = crypto.subtle.importKey;
  let attempts = 0;
  t.mock.method(crypto.subtle, "importKey", (...args: unknown[]) => {
    attempts++;
    if (attempts === 1) return Promise.reject(new Error("Synthetic warming import failure"));
    return Reflect.apply(original, crypto.subtle, args) as Promise<CryptoKey>;
  });
  await assert.rejects(warmServerKeys(source), /Synthetic warming import failure/);
  assert.equal(attempts, 4);
  await warmServerKeys(source);
  assert.equal(attempts, 5, "Retry imports the failed key and reuses the other successful imports");
  await warmServerKeys(source);
  assert.equal(attempts, 5);
});
