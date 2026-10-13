import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createDecipheriv, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

interface Verifier {
  version: 2;
  algorithm: "PBKDF2-HMAC-SHA256+HMAC-SHA256";
  context: string;
  salt: string;
  iterations: number;
  hash: string;
}
interface PreparedSecrets {
  adminVerifier: Verifier;
  resetVerifier: Verifier;
  passwordPepper: string;
  auditKey: string;
  ipHmacKey: string;
  dashboardKey: string;
  albums: Record<string, { verifier: Verifier; dataKey: string }>;
}

const credentials = { admin: "Synthetic admin 'quoted'\n密碼", reset: "Synthetic reset \\ phrase" };
const albumPasswords = { life: "Synthetic shared album 密碼", lover: "Synthetic shared album 密碼", "new-album": "Synthetic new album phrase" };
const passwords = [...Object.values(credentials), ...Object.values(albumPasswords)];
const dashboard = Buffer.from("<!doctype html><title>Synthetic private dashboard</title><p>Fixture content only.</p>");
const artifactPaths = [
  ".private/analytics/secrets.json", ".private/analytics/worker-secrets.json",
  "services/gallery-worker/.dev.vars", "public/_data/panel.enc",
];
const script = fileURLToPath(new URL("../scripts/gallery-admin-prepare.ts", import.meta.url));
const loader = import.meta.resolve("tsx");
const key = () => randomBytes(32).toString("base64");

async function write(root: string, relative: string, value: string | Buffer) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}

async function fixture(t: TestContext) {
  // The CLI uses cwd for all private inputs and generated outputs. Never run it
  // in the repository, where a developer may have real credentials.
  const root = await mkdtemp(path.join(tmpdir(), "gallery-admin-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await write(root, ".private/analytics/credentials.json", JSON.stringify(credentials));
  await write(root, ".private/gallery/keys.json", JSON.stringify(albumPasswords));
  await write(root, ".private/analytics/dashboard.html", dashboard);
  return root;
}

function run(root: string, iterations?: string) {
  const env = { ...process.env };
  delete env.GALLERY_PASSWORD_ITERATIONS;
  if (iterations !== undefined) env.GALLERY_PASSWORD_ITERATIONS = iterations;
  const result = spawnSync(process.execPath, ["--import", loader, script], { cwd: root, env, encoding: "utf8", timeout: 20_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, "Preparation must finish without a signal");
  return { status: result.status, output: result.stdout + result.stderr };
}

async function artifacts(root: string) {
  return Promise.all(artifactPaths.map((file) => readFile(path.join(root, file))));
}

async function readPrepared(root: string): Promise<PreparedSecrets> {
  return JSON.parse(await readFile(path.join(root, artifactPaths[0]), "utf8")) as PreparedSecrets;
}

function validBase64(value: string, bytes: number) {
  assert.equal(typeof value, "string");
  assert.equal(Buffer.from(value, "base64").length, bytes);
  assert.equal(Buffer.from(value, "base64").toString("base64"), value, "Generated values use canonical base64");
}

function checkVerifier(verifier: Verifier, context: string, password: string, pepper: string, iterations: number) {
  assert.equal(verifier.version, 2);
  assert.equal(verifier.algorithm, "PBKDF2-HMAC-SHA256+HMAC-SHA256");
  assert.equal(verifier.context, context);
  assert.equal(verifier.iterations, iterations);
  validBase64(verifier.salt, 16);
  validBase64(verifier.hash, 32);
  // Independently reproduce the specified framing with Node crypto; do not use
  // the Worker's verifier to manufacture the expected result.
  const derived = pbkdf2Sync(password, Buffer.from(verifier.salt, "base64"), iterations, 32, "sha256").toString("base64");
  const expected = createHmac("sha256", Buffer.from(pepper, "base64"))
    .update(JSON.stringify(["gallery-password:v2", context, verifier.salt, iterations, derived]), "utf8")
    .digest("base64");
  assert.equal(verifier.hash, expected);
  assert.notEqual(verifier.hash, derived, "Only the post-hashed HMAC is a stored verifier");
  return derived;
}

function checkPrepared(secrets: PreparedSecrets, iterations = 30_000) {
  for (const value of [secrets.auditKey, secrets.ipHmacKey, secrets.dashboardKey, secrets.passwordPepper]) validBase64(value, 32);
  const derived = [
    checkVerifier(secrets.adminVerifier, "admin-login", credentials.admin, secrets.passwordPepper, iterations),
    checkVerifier(secrets.resetVerifier, "admin-reset", credentials.reset, secrets.passwordPepper, iterations),
  ];
  assert.deepEqual(Object.keys(secrets.albums).sort(), Object.keys(albumPasswords).sort());
  for (const [slug, password] of Object.entries(albumPasswords)) {
    validBase64(secrets.albums[slug].dataKey, 32);
    derived.push(checkVerifier(secrets.albums[slug].verifier, `album:${slug}`, password, secrets.passwordPepper, iterations));
  }
  return derived;
}

async function checkPanel(root: string, originalKey: string) {
  const encrypted = await readFile(path.join(root, "public/_data/panel.enc"));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(originalKey, "base64"), encrypted.subarray(0, 12));
  decipher.setAAD(Buffer.from("gallery-admin:v1"));
  decipher.setAuthTag(encrypted.subarray(-16));
  assert.deepEqual(Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]), dashboard);
}

function legacyVerifier(password: string) {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("base64"), iterations: 100_000 };
}

function legacySecrets() {
  return {
    adminVerifier: legacyVerifier(credentials.admin), resetVerifier: legacyVerifier(credentials.reset),
    auditKey: key(), ipHmacKey: key(), dashboardKey: key(),
    albums: {
      life: { verifier: legacyVerifier(albumPasswords.life), dataKey: key() },
      lover: { verifier: legacyVerifier(albumPasswords.lover), dataKey: key() },
    },
  };
}

function assertAbsent(text: string | Buffer, values: string[]) {
  for (const value of values) {
    if (value) assert.equal(text.includes(value), false, "Sensitive fixture values must not be exposed");
  }
}

function privateValues(secrets: PreparedSecrets) {
  return [secrets.auditKey, secrets.ipHmacKey, secrets.dashboardKey, secrets.passwordPepper,
    secrets.adminVerifier.hash, secrets.resetVerifier.hash,
    ...Object.values(secrets.albums).flatMap((album) => [album.dataKey, album.verifier.hash])];
}

test("preparation migrates legacy verifiers while preserving encryption keys and rerun pepper", async (t) => {
  const root = await fixture(t);
  const previous = legacySecrets();
  await write(root, artifactPaths[0], JSON.stringify(previous));
  const firstRun = run(root);
  assert.equal(firstRun.status, 0, firstRun.output);
  const migrated = await readPrepared(root);
  checkPrepared(migrated);
  for (const field of ["auditKey", "ipHmacKey", "dashboardKey"] as const) assert.equal(migrated[field], previous[field]);
  for (const slug of ["life", "lover"] as const) assert.equal(migrated.albums[slug].dataKey, previous.albums[slug].dataKey);
  assert.notEqual(migrated.albums["new-album"].dataKey, migrated.albums.life.dataKey);
  await checkPanel(root, previous.dashboardKey);

  const secondRun = run(root);
  assert.equal(secondRun.status, 0, secondRun.output);
  const repeated = await readPrepared(root);
  checkPrepared(repeated);
  for (const field of ["auditKey", "ipHmacKey", "dashboardKey", "passwordPepper"] as const) assert.equal(repeated[field], migrated[field]);
  for (const slug of Object.keys(albumPasswords)) assert.equal(repeated.albums[slug].dataKey, migrated.albums[slug].dataKey);
  await checkPanel(root, previous.dashboardKey);
  assertAbsent(firstRun.output + secondRun.output, [...passwords, ...privateValues(migrated), ...privateValues(repeated)]);
});

test("fresh preparation honors allowed iteration settings and never stores plaintext or intermediate PBKDF2 output", async (t) => {
  const configurations: [string, string | undefined, number][] = [
    ["unset defaults to 30000", undefined, 30_000],
    ["60000 override", "60000", 60_000],
    ["100000 upper bound", "100000", 100_000],
  ];
  for (const [name, configured, expected] of configurations) {
    await t.test(name, async (subtest) => {
      const root = await fixture(subtest);
      const result = run(root, configured);
      assert.equal(result.status, 0, result.output);
      const secrets = await readPrepared(root);
      const derived = checkPrepared(secrets, expected);
      const generated = await artifacts(root);
      for (const bytes of generated) {
        assertAbsent(bytes, [...passwords, ...derived]);
        for (const value of derived) assert.equal(bytes.includes(Buffer.from(value, "base64")), false, "Raw PBKDF2 output must not be stored");
      }
      assertAbsent(result.output, [...passwords, ...derived, ...privateValues(secrets)]);
      assertAbsent(generated[3], [dashboard.toString(), ...privateValues(secrets)]);
      const workerSecrets = JSON.parse(generated[1].toString()) as { SECRETS: string };
      assert.deepEqual(JSON.parse(workerSecrets.SECRETS), secrets);
      const devVars = generated[2].toString();
      assert.ok(devVars.startsWith("SECRETS='") && devVars.endsWith("'\n"));
      assert.deepEqual(JSON.parse(devVars.slice("SECRETS='".length, -2)), secrets);
      await checkPanel(root, secrets.dashboardKey);
    });
  }
});

test("invalid iteration settings preserve existing artifacts and fail with sanitized errors", async (t) => {
  const root = await fixture(t);
  const initial = run(root);
  assert.equal(initial.status, 0, initial.output);
  const before = await artifacts(root);
  const secrets = await readPrepared(root);
  const invalidSettings = ["29999", "100001", "30000.5", "3e4", "not-an-integer", ""];
  for (const configured of invalidSettings) {
    await t.test(configured || "explicitly empty", async () => {
      const result = run(root, configured);
      assert.equal(result.status, 1, "Invalid iteration settings must fail closed");
      assert.ok(result.output.trim(), "A sanitized error should explain the failure");
      assertAbsent(result.output, [...passwords, ...privateValues(secrets)]);
      assert.deepEqual(await artifacts(root), before, "Invalid iteration settings must not replace existing output bytes");
    });
  }
});

test("invalid existing secrets and missing album credentials fail without disclosure or artifact replacement", async (t) => {
  const valid = { ...legacySecrets(), passwordPepper: key() };
  const invalidMarker = "Synthetic-invalid-private-value-do-not-echo!";
  const cases: [string, unknown][] = [
    ["invalid audit key", { ...valid, auditKey: invalidMarker }],
    ["empty IP HMAC key", { ...valid, ipHmacKey: "" }],
    ["short dashboard key", { ...valid, dashboardKey: randomBytes(31).toString("base64") }],
    ["invalid album data key", { ...valid, albums: { ...valid.albums, life: { ...valid.albums.life, dataKey: invalidMarker } } }],
    ["empty existing pepper", { ...valid, passwordPepper: "" }],
    ["invalid existing pepper", { ...valid, passwordPepper: invalidMarker }],
    ["null existing JSON", null],
    ["missing existing album credential", { ...valid, albums: { ...valid.albums, archived: { ...valid.albums.life } } }],
  ];
  for (const [name, existing] of [...cases, ["invalid JSON", invalidMarker] as [string, unknown]]) {
    await t.test(name, async (subtest) => {
      const root = await fixture(subtest);
      for (const file of artifactPaths) await write(root, file, `Existing fixture bytes for ${file}`);
      await write(root, artifactPaths[0], typeof existing === "string" ? existing : JSON.stringify(existing));
      const before = await artifacts(root);
      const result = run(root);
      assert.equal(result.status, 1, "Invalid state must fail closed");
      assert.ok(result.output.trim(), "A sanitized error should explain the failure");
      assertAbsent(result.output, [...passwords, invalidMarker, valid.auditKey, valid.ipHmacKey, valid.dashboardKey,
        valid.passwordPepper, valid.adminVerifier.hash, valid.resetVerifier.hash,
        ...Object.values(valid.albums).flatMap((album) => [album.dataKey, album.verifier.hash])]);
      assert.deepEqual(await artifacts(root), before, "Failed preparation must preserve every existing output byte");
    });
  }
});
