import { createHmac, pbkdf2Sync, randomBytes, webcrypto } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PASSWORD_ITERATIONS, HYBRID_PASSWORD_ALGORITHM, parseSecrets, validPasswordIterations } from "../services/gallery-worker/crypto";
import type { CredentialContext, HybridPasswordVerifier, Secrets } from "../services/gallery-worker/types";

const root = process.cwd();
const directory = path.join(root, ".private/analytics");
class PreparationError extends Error {}

async function optional(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new PreparationError("A local configuration file is invalid. Check its JSON locally.");
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
function verifier(password: string, context: CredentialContext, pepper: string, iterations: number): HybridPasswordVerifier {
  const salt = randomBytes(16).toString("base64");
  const derived = pbkdf2Sync(password, Buffer.from(salt, "base64"), iterations, 32, "sha256");
  // Match the Worker's framed, domain-separated message. The random pepper
  // remains a server secret; it is never included in the public dashboard.
  const message = JSON.stringify(["gallery-password:v2", context, salt, iterations, derived.toString("base64")]);
  derived.fill(0);
  const hash = createHmac("sha256", Buffer.from(pepper, "base64")).update(message).digest("base64");
  return { version: 2, algorithm: HYBRID_PASSWORD_ALGORITHM, context, salt, iterations, hash };
}
async function privateWrite(file: string, value: string | Buffer): Promise<void> {
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally { await rm(temporary, { force: true }); }
}
async function prepare() {
  const configuredIterations = process.env.GALLERY_PASSWORD_ITERATIONS;
  const iterations = configuredIterations === undefined ? DEFAULT_PASSWORD_ITERATIONS : Number(configuredIterations);
  if ((configuredIterations !== undefined && !/^\d+$/.test(configuredIterations)) || !validPasswordIterations(iterations)) {
    throw new PreparationError("GALLERY_PASSWORD_ITERATIONS must be an integer from 30000 to 100000. No files were changed.");
  }
  const credentials = await optional(path.join(directory, "credentials.json"));
  if (!record(credentials) || !validPassword(credentials.admin) || !validPassword(credentials.reset)) {
    throw new PreparationError("Create valid admin and reset values in .private/analytics/credentials.json locally. Never commit this file.");
  }
  const albumPasswords = await optional(path.join(root, ".private/gallery/keys.json"));
  if (!record(albumPasswords) || Object.entries(albumPasswords).some(([slug, password]) => !validPassword(password) || !/^[a-z0-9-]+$/.test(slug))) {
    throw new PreparationError("Local album credentials are missing or invalid.");
  }
  const previousValue = await optional(path.join(directory, "secrets.json"));
  let previous: Secrets | undefined;
  if (previousValue !== undefined) {
    try { previous = parseSecrets(JSON.stringify(previousValue)); }
    catch { throw new PreparationError("Existing service secrets are invalid. Restore the local backup before preparing; keys were not replaced."); }
    if (Object.keys(previous.albums).some((slug) => !Object.hasOwn(albumPasswords, slug))) {
      throw new PreparationError("An existing album credential is missing. Restore its local key before preparing; data keys were not removed.");
    }
  }
  const passwordPepper = previous?.passwordPepper ?? randomBytes(32).toString("base64");
  const secrets: Secrets = {
    adminVerifier: verifier(credentials.admin, "admin-login", passwordPepper, iterations),
    resetVerifier: verifier(credentials.reset, "admin-reset", passwordPepper, iterations),
    albums: {}, passwordPepper,
    auditKey: previous?.auditKey ?? randomBytes(32).toString("base64"),
    ipHmacKey: previous?.ipHmacKey ?? randomBytes(32).toString("base64"),
    dashboardKey: previous?.dashboardKey ?? randomBytes(32).toString("base64"),
  };
  for (const [slug, password] of Object.entries(albumPasswords)) {
    secrets.albums[slug] = {
      verifier: verifier(password as string, `album:${slug}`, passwordPepper, iterations),
      dataKey: previous?.albums[slug]?.dataKey ?? randomBytes(32).toString("base64"),
    };
  }
  const serialized = JSON.stringify(secrets);
  parseSecrets(serialized);
  // Validate and prepare the dashboard before writing any generated secrets.
  const dashboard = await readFile(path.join(directory, "dashboard.html"));
  const key = await webcrypto.subtle.importKey("raw", Buffer.from(secrets.dashboardKey, "base64"), "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  const encrypted = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("gallery-admin:v1") }, key, dashboard);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await privateWrite(path.join(directory, "secrets.json"), JSON.stringify(secrets, null, 2) + "\n");
  await privateWrite(path.join(directory, "worker-secrets.json"), JSON.stringify({ SECRETS: serialized }) + "\n");
  await mkdir(path.join(root, "services/gallery-worker"), { recursive: true });
  // dotenv retains backslashes before double quotes; a literal single-quoted
  // value is safe because this JSON contains only generated values and slugs.
  await privateWrite(path.join(root, "services/gallery-worker/.dev.vars"), `SECRETS='${serialized}'\n`);
  await mkdir(path.join(root, "public/_data"), { recursive: true });
  await privateWrite(path.join(root, "public/_data/panel.enc"), Buffer.concat([iv, Buffer.from(encrypted)]));
  console.info("Prepared local service secrets and encrypted dashboard. No credentials were printed. Upload only panel.enc, never .private/ or .dev.vars.");
}
prepare().catch((error) => {
  console.error(error instanceof PreparationError ? error.message : "Service preparation failed. Check local configuration and file access; no secret values were printed.");
  process.exitCode = 1;
});
