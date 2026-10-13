import type { CredentialContext, PasswordVerifier, Secrets } from "./types";

const encoder = new TextEncoder();
// One isolate retains only the active server configuration and a small number
// of imported server keys. No request password, PBKDF2 result, or authentication
// decision is memoized. Changing SECRETS invalidates both caches immediately.
let parsedConfiguration: { source: string; value: Secrets } | undefined;
const serverKeys = new Map<string, Promise<CryptoKey>>();
const MAX_SERVER_KEYS = 8;
// Workers production imposes a 100,000-iteration cap, even when a local
// workerd runtime accepts more. Verifiers are server secrets, never public.
// https://github.com/cloudflare/workerd/issues/1346
export const PASSWORD_ITERATIONS = 100_000;
export const MIN_PASSWORD_ITERATIONS = 30_000;
export const DEFAULT_PASSWORD_ITERATIONS = 30_000;
export const HYBRID_PASSWORD_ALGORITHM = "PBKDF2-HMAC-SHA256+HMAC-SHA256";

export function validPasswordIterations(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_PASSWORD_ITERATIONS && value <= PASSWORD_ITERATIONS;
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  // Bounded chunks avoid both per-byte string concatenation and large spreads
  // that can overflow the stack when encoding an encrypted audit payload.
  for (let offset = 0; offset < bytes.length; offset += 4096) binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
  return btoa(binary);
}

function importServerKey(value: string, algorithm: "HMAC" | "AES-GCM", usage: KeyUsage): Promise<CryptoKey> {
  const identity = `${algorithm}:${usage}:${value}`;
  const cached = serverKeys.get(identity);
  if (cached) return cached;
  if (serverKeys.size >= MAX_SERVER_KEYS) serverKeys.delete(serverKeys.keys().next().value!);
  const imported = crypto.subtle.importKey("raw", fromBase64(value), algorithm === "HMAC" ? { name: "HMAC", hash: "SHA-256" } : algorithm, false, [usage]);
  const pending = imported.catch((error: unknown) => {
    if (serverKeys.get(identity) === pending) serverKeys.delete(identity);
    throw error;
  });
  serverKeys.set(identity, pending);
  return pending;
}

/** Initialize only static server keys; safe to call before the first request. */
export async function warmServerKeys(configuration: string): Promise<void> {
  const secrets = parseSecrets(configuration);
  // No request credentials, random generation, PBKDF2, or I/O belongs here.
  // Deliberately propagate configuration/import failures to startup validation.
  await Promise.all([
    importServerKey(secrets.ipHmacKey, "HMAC", "sign"),
    ...(secrets.passwordPepper ? [importServerKey(secrets.passwordPepper, "HMAC", "verify")] : []),
    importServerKey(secrets.auditKey, "AES-GCM", "encrypt"),
    importServerKey(secrets.auditKey, "AES-GCM", "decrypt"),
  ]);
}

export function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function digest(value: string): Promise<string> {
  return toBase64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function identify(key: string, value: string): Promise<string> {
  const imported = await importServerKey(key, "HMAC", "sign");
  return toBase64(await crypto.subtle.sign("HMAC", imported, encoder.encode(value)));
}

export async function verifyPassword(password: string, verifier: PasswordVerifier, pepper?: string): Promise<boolean> {
  if (verifier.version === 2) {
    if (verifier.algorithm !== HYBRID_PASSWORD_ALGORITHM || !validPasswordIterations(verifier.iterations) || !pepper) return false;
    try {
      const secret = fromBase64(pepper);
      const expected = fromBase64(verifier.hash);
      if (secret.length !== 32 || expected.length !== 32 || fromBase64(verifier.salt).length !== 16) return false;
      const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(verifier.salt), iterations: verifier.iterations }, material, 256);
      // Store only the keyed post-hash, never the PBKDF2 output. A verifier leak
      // without this separate server secret cannot support offline guessing.
      // If both leak, PBKDF2 still imposes the configured (30k–100k) work cost.
      // Framing binds each credential's role, salt, and iteration count.
      const message = encoder.encode(JSON.stringify(["gallery-password:v2", verifier.context, verifier.salt, verifier.iterations, toBase64(derived)]));
      const key = await importServerKey(pepper, "HMAC", "verify");
      return crypto.subtle.verify("HMAC", key, expected, message);
    } catch { return false; }
  }
  // Retain old verifier support so code can be deployed before secret rotation.
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(verifier.salt), iterations: verifier.iterations }, key, 256));
  const expected = fromBase64(verifier.hash);
  let difference = expected.length ^ actual.length;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ (expected[i] ?? 0);
  return difference === 0;
}

export async function seal(key: string, id: string, payload: unknown): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const imported = await importServerKey(key, "AES-GCM", "encrypt");
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(`gallery-audit:v1:${id}`) }, imported, encoder.encode(JSON.stringify(payload)));
  return `${toBase64(nonce)}.${toBase64(encrypted)}`;
}

export async function importAuditDecryptionKey(key: string): Promise<CryptoKey> {
  return importServerKey(key, "AES-GCM", "decrypt");
}

export async function unseal<T>(key: string | CryptoKey, id: string, payload: string): Promise<T> {
  const [nonce, ciphertext] = payload.split(".");
  const imported = typeof key === "string" ? await importAuditDecryptionKey(key) : key;
  const decoded = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(nonce), additionalData: encoder.encode(`gallery-audit:v1:${id}`) }, imported, fromBase64(ciphertext));
  return JSON.parse(new TextDecoder().decode(decoded)) as T;
}

export function parseSecrets(value: string): Secrets {
  if (parsedConfiguration?.source === value) return parsedConfiguration.value;
  parsedConfiguration = undefined;
  serverKeys.clear();
  try {
    const data = JSON.parse(value) as Secrets;
    const validKey = (key: unknown) => typeof key === "string" && fromBase64(key).length === 32;
    const validVerifier = (v: PasswordVerifier, context: CredentialContext) => {
      if (!v || typeof v.salt !== "string" || !validKey(v.hash)) return false;
      if (v.version === 2) return v.algorithm === HYBRID_PASSWORD_ALGORITHM && v.context === context && validPasswordIterations(v.iterations)
        && fromBase64(v.salt).length === 16 && validKey(data.passwordPepper);
      return (v.version === undefined || v.version === 1) && v.iterations === PASSWORD_ITERATIONS && fromBase64(v.salt).length >= 16;
    };
    if (!validKey(data.auditKey) || !validKey(data.ipHmacKey) || !validKey(data.dashboardKey)
        || (data.passwordPepper !== undefined && !validKey(data.passwordPepper))
        || !validVerifier(data.adminVerifier, "admin-login") || !validVerifier(data.resetVerifier, "admin-reset")
        || !data.albums || typeof data.albums !== "object" || Array.isArray(data.albums)
        || Object.entries(data.albums).some(([slug, album]) => !/^[a-z0-9-]+$/.test(slug)
          || !validKey(album.dataKey) || !validVerifier(album.verifier, `album:${slug}`))) {
      throw new Error();
    }
    // Freeze all structured configuration values so a caller cannot mutate the
    // cached verifier, its role, or a data key between independent requests.
    Object.freeze(data.adminVerifier);
    Object.freeze(data.resetVerifier);
    for (const album of Object.values(data.albums)) {
      Object.freeze(album.verifier);
      Object.freeze(album);
    }
    Object.freeze(data.albums);
    Object.freeze(data);
    parsedConfiguration = { source: value, value: data };
    return data;
  } catch { throw new Error("Invalid secret configuration"); }
}
