# Gallery audit service

This Worker is separate from the GitHub Pages site. An unconfigured checkout
does not contact Cloudflare and does not contain owner credentials. For a fresh
deployment, configure its D1 database, apply the migration, and supply the
`SECRETS` binding with Cloudflare's secret facility. Never put it in `vars`,
GitHub Actions logs, a URL, or browser storage.

## Deployment status — 2026-09-23

Cloudflare OAuth completed. The Workers dashboard confirmed **Free ($0)** as the
current plan; no subscription purchase or upgrade was made. D1 `wei-gallery-audit`
was created in APAC (`9fbc7e60-c22a-4bd7-9dcc-1c599c83513e`), migration `0001` was
applied remotely, and the `SECRETS` binding was uploaded through secret bulk.

The Worker is deployed at
[wei-gallery-audit.zhangwei99-math.workers.dev](https://wei-gallery-audit.zhangwei99-math.workers.dev/v1/health),
current version `18607b41-6c83-4130-bad1-da2411d53c5d`, with cleanup cron `17 3 * * *`.
Live health, visits, Life/Lover unlock and manifest decryption, admin
login/panel/audit/logout, revoked-token rejection and origin rejection passed.
Correct/admin inputs were not retained. Reset was not executed; synthetic test
records remain. Initial 100,000-iteration PBKDF2 measured 26.260ms P99 CPU, above
Free's 10ms budget. The owner has authorized retaining PBKDF2 with 30,000–100,000
iterations. The hybrid verifier and paginated audit API are deployed and active, with all
credentials using 30,000 PBKDF2 iterations. The final window beginning 2026-09-23 07:54:38 UTC contained 33 single-request
GraphQL samples with zero errors: P50 3.460ms, P99/maximum 11.731ms. The first
admin request took 11.731ms and one Life unlock took 10.578ms. **Functionality
passes, but the requirement that every request stay below 10ms remains unmet.**
Passwords, photographs and all existing data keys were preserved.

Browser integration against the real deployed API also passed using locally
served production files; the API was not mocked and the files were not uploaded
to GitHub. Detailed evidence is recorded in [VERIFICATION.md](../../docs/VERIFICATION.md).

No Git push or GitHub Pages deployment was performed. Development still uses
the local Worker on port 8787. Ignored `.env.production.local` is prepared with
the public Worker URL. The Pages workflow defaults to that same URL;
`GALLERY_API_URL` is an optional Actions repository-variable override, not a
required setup step. See [the administration guide](../../docs/GALLERY_ADMIN.md).

The repository-level gallery administration guide describes owner setup. Local
development needs `ENVIRONMENT=local` and explicit localhost entries in
`ALLOWED_ORIGINS`; local requests deliberately share `127.0.0.1` rather than
trusting a spoofable forwarding header. Production requires Cloudflare's edge
request metadata and uses `CF-Connecting-IP`.

## API

All responses are `Cache-Control: no-store`. JSON POST requests have a 4 KiB
body limit. CORS matches an exact configured origin; it is not authentication.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /v1/health` | none | `{ok:true}` |
| `POST /v1/visits` | `album`, unique `eventId`, optional `language`, `timezone`, `referrerHost` | `{ok:true}` |
| `GET /v1/albums/:slug/status` | protected album | `failureCount`, `blockedUntil` in milliseconds |
| `POST /v1/albums/:slug/unlock` | `password`, optional visit context | `viewKey`, `blockedUntil:0` |
| `POST /v1/admin/session` | `password` | `token`, `expiresAt`, `dashboardKey` |
| `GET /v1/admin/data?days=30&album=all` | bearer token; days 1–90; optional `cursor` | Up to 50 `events`, `generatedAt`, `truncated`, `nextCursor`; first page also includes `totals` and `albums` |
| `POST /v1/admin/reset` | bearer token and independent reset `password` | `{ok:true}` |
| `POST /v1/admin/logout` | bearer token | `{ok:true}` |

Wrong verification returns `incorrect_phrase`; an active cooldown returns
`rate_limited`, with `failureCount` and `blockedUntil`. A concurrent verification
can return HTTP 409 `verification_in_progress` without counting a failure.
Status polling and blocked submissions do not advance or extend a cooldown.

## Stored information and authentication

The first five wrong album phrases have no cooldown. Failure 6 starts one
minute; the following failures use 5, 10, 20, 30, and then 60 minutes. Further
failures keep the 60-minute tier. The counter resets only after 24 hours without
a failed verification, including when a correct verification occurred in
between. One HMAC-derived IP identity is shared across protected albums. Admin
login and reset use separate rate-limit identities. SQLite compare-and-set
leases serialize attempts, including concurrent requests across Worker isolates.

Audit details are AES-256-GCM encrypted with a fresh nonce and authenticated
event ID. The plaintext database columns contain time, event type, album, and an
HMAC visitor identifier for aggregation. Exact IP, network-estimated location,
bounded browser/context strings, and wrong shared album phrase guesses exist
only inside encrypted payloads. A failed phrase is recorded only after the
server actually verifies it as wrong, with at most 256 Unicode code points and
an explicit truncation flag. Successful phrases, blocked submissions, admin
passwords, and reset passwords are never stored. No exception, request body, or
secret is logged.

Coordinates come from Cloudflare network metadata, are rounded to one decimal
degree, and are marked `network-approximate`. They are not GPS, a street address,
or evidence of a visitor's actual physical location. Caller-supplied coordinates,
IP addresses, and event timestamps are ignored. There is no geolocation prompt.

Session tokens contain 256 random bits; only their SHA-256 hash is stored in D1.
Sessions expire after 15 minutes. Reset deletes analytics records and deduplication
entries, preserving rate limits and the current administrator session. The daily
scheduled handler purges records older than 90 days, expired sessions, and stale
rate-limit state. The updated admin API returns 50 event details per request; the
panel automatically loads up to 2,000 latest events. The first response includes
SQL aggregates across the full selected range; `truncated` exposes the detail cap.

New **verifier v2** uses `PBKDF2-HMAC-SHA256+HMAC-SHA256`. PBKDF2 derives 32 bytes
from a random 16-byte salt. A separate random 32-byte server-only `passwordPepper`
then authenticates the protocol label, `admin-login`, `admin-reset` or
`album:<slug>` context, salt, iteration count and derived key. Only the final
HMAC is stored; Web Crypto verifies it. Preparation defaults to **30,000
iterations**. Set `GALLERY_PASSWORD_ITERATIONS` to an integer from 30,000–100,000
when running `gallery:admin:prepare`, then upload the generated Secret. A Worker
environment change alone does not alter stored verifier iterations.

The runtime accepts legacy 100,000-iteration PBKDF2 verifiers so compatible code
can deploy before the Secret changes. Preparation validates existing secrets
first, preserves AES/audit/IP/panel keys and any existing pepper, and atomically
replaces each mode-0600 file. No photo re-encryption is needed. Album manifest
v3 and password verifier v2 are separate formats.

A verifier alone cannot validate guesses without the secret pepper. If both
leak, each guess still requires the configured PBKDF2 work, although 30,000
iterations provide less work than the previous 100,000. Keep both out of GitHub
and clients; online IP cooldowns remain unchanged. Independent random album
keys prevent their derivation from a password verifier. The hybrid protocol is deployed and active. The final sample had no resource
failures, but platform tolerance does not guarantee future requests. Its two
requests above 10ms mean the CPU target is not fully met. The prior 26.260ms P99
measurement describes only the old 100,000-iteration deployment. Large audit loads need separate
measurement. See [Cloudflare CPU limits](https://developers.cloudflare.com/workers/platform/limits/). No subscription has been purchased or upgraded.

## Runtime setup

The Cloudflare entrypoint is `entry.ts`. At module startup it validates configured
secrets and imports four server CryptoKeys: IP HMAC signing, pepper HMAC
verification, and audit AES encryption/decryption. Startup does not run PBKDF2,
generate randomness, call D1 or make network requests. Each password attempt
still performs the full 30,000-iteration PBKDF2. Configuration/key caching,
an atomic rate-limit UPSERT, and one D1 batch transaction for a successful
administrator session plus its audit event reduce other request work. Wrangler
reported 4ms startup for the current version; startup timing is not request CPU
verification. The real workerd smoke check and 76 unit tests passed.

## Verification

`tests/gallery-audit-backend.test.ts` runs the API against real SQLite through
the `sqlite3` command-line tool, including concurrent authentication, cooldown
escalation, encrypted payload inspection, deduplication, session expiry, reset,
retention, CORS, and input limits. It uses synthetic secrets and never reads the
owner's `.private` directory. Install SQLite on environments that do not already
provide the command. Production deployment and Cloudflare credentials are not
covered by these local tests.
