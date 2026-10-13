# Verification record

Latest service verification includes real Cloudflare deployments on 2026-09-23. Earlier implementation checks below are historical.

## PBKDF2 CPU optimization — 2026-09-23

The owner authorized retaining PBKDF2 and choosing 30,000–100,000 iterations. All four active credentials now use **30,000 PBKDF2-HMAC-SHA256 iterations**, followed by a dedicated server-only HMAC pepper. Independent salts and credential contexts remain mandatory. Actual preparation was checked against a private backup: all album, audit, IP-identity and dashboard keys were preserved, and every existing phrase still verifies. No photographs were re-encoded or re-encrypted for this change.

Worker version `18607b41-6c83-4130-bad1-da2411d53c5d` is deployed at `https://wei-gallery-audit.zhangwei99-math.workers.dev`. The account remains on confirmed **Free ($0)**; no paid plan was activated. APAC D1, migration 0001, existing records, exact-origin CORS and retention cron remain in place. Secrets are held only in ignored local files and the Cloudflare Secret binding.

CPU-related changes:

- The Cloudflare-specific `entry.ts` validates configured secrets and pre-imports four server key usages at module initialization. A real local workerd instance started successfully on port 8788 and returned health 200; its temporary process was stopped. Cloudflare reported 4ms startup time, which is distinct from request CPU. No password derivation, randomness, network or D1 operation runs in this initialization. Parsed, frozen configuration and up to eight server CryptoKeys are reused within an isolate. A changed or invalid configuration invalidates the cache. Every actual password verification still runs PBKDF2; passwords, derived password keys and successful decisions are never cached.
- Authentication leases are acquired with one atomic SQLite UPSERT, preserving concurrent-request serialization, failure counters and lease expiry. Successful administrator audit and session creation use one atomic D1 batch; an injected session-insert failure rolls back the success audit and issues no token.
- Each dashboard request decrypts at most 50 records. Signed, expiring keyset cursors retain a stable insertion/time boundary. Only the first page computes complete SQL aggregates; the browser joins at most 2,000 details. Every page reauthenticates the session.

Cloudflare GraphQL reports CPU in microseconds. The original 100,000-iteration deployment measured **26.260ms P99**. The first 30,000-iteration deployment still measured **11.436ms P99**. Configuration/key reuse and atomic lease acquisition brought one tested window to **9.788ms P99**, but deliberately testing administrator login as the first request after the next deployment revealed **12.247ms**. A final module-initialization experiment pre-imported static server keys. It lowered the measured first-request cost slightly but did not eliminate all over-budget requests.

**Final measured window, starting 2026-09-23T07:54:38Z:** 33 single-request analytics groups, **3.460ms P50**, **11.731ms P99 / highest sample**, and zero reported errors. The first administrator login consumed **11.731ms**; one later Life unlock consumed **10.578ms**. The explicit test script completed all 33 endpoint assertions, with these two above the 10ms Free CPU allowance. Therefore **the requested condition that every request remain below the allowance has not been achieved**. The authorized 30,000-iteration floor is retained; no lower iteration count, alternative password algorithm or paid plan was applied. Cloudflare permits limited occasional CPU overruns, explaining why a successful response is not proof of compliance. These adaptive analytics observations cannot guarantee future requests or daily free-tier quotas. See [Cloudflare CPU limits and overrun flexibility](https://developers.cloudflare.com/workers/platform/limits/).

No further speculative optimization or load test was performed after this bounded initialization experiment. The current 30,000-iteration service remains functional, with the measured limitation documented rather than described as fully within the Free budget.

Validation passed: **76 unit/integration tests**, ESLint, TypeScript, production build and asset checks (10 documents, 152 local references, base `/`), and **25 static browser tests**. Tests use synthetic temporary databases for reset/deletion, malformed credentials, iteration bounds, preserved keys, cache invalidation, startup pre-imports without password derivation or I/O, repeated PBKDF2 calls, exact cooldowns, stale leases, cursor tampering/expiry, stable 2,001-row pagination and accurate full totals. A scan of 119 source/public/build/documentation/backend text files found no actual owner phrase, verifier hash or private key.

Live API checks cover health, preflight, invalid origin/body/session, all four album visits, repeated Life/Lover unlock, administrator sessions, dashboard reads, logout, and synthetic incorrect album/reset inputs. The wrong reset input was rejected; **no live history deletion was performed**, and all verification records remain. A browser used the actual local `dist/` under the production origin with an unmocked Cloudflare API: Life's 122-photo collection, decoded thumbnail and Lightbox image, encrypted administration iframe, refresh, 375px layout, reset-dialog cancellation and logout all worked without runtime errors.

The Pages workflow defaults to the deployed public API URL; `GALLERY_API_URL` remains an optional override. The frontend build is ready, but no Git commit, push or GitHub Pages deployment was performed because this workspace has no `.git` directory. Development continues to use the local Worker. The existing system proxy was used for terminal verification without changing system network settings.

## Managed Gallery and encrypted audit service — earlier local verification, 2026-09-23

Implemented the Cloudflare Workers + D1 backend, encrypted administrator panel, hidden Chinese Gallery punctuation entry, server-authorized v3 albums, and shared-IP cooldown. Life's 122 existing photographs and the empty Lover album were migrated locally without changing prepared image bytes; SHA-256-checked legacy ciphertext backups remain under ignored `.private/analytics/legacy-encrypted/`. Public albums and independent covers remain v2. No administrator phrase, reset phrase, private album key, verifier or private AES key appeared in a scan of source, public, build, documentation and backend text files. Local secret bindings and private source directories are excluded from Vite access and publication.

Validation completed:

- Dependency installation, ESLint, TypeScript, production build and deployment-file checks passed. Node 22+ is now required for Wrangler; final lint/unit/build checks and local Workers tests used bundled Node 24.19.0. A Wrangler deployment dry-run also passed (5.99 KiB gzip; no upload). HTTP requests for private credentials, local Worker bindings and the actual SQLite file were rejected with 403.
- 32 unit/integration tests passed, including eight real-SQLite backend tests for the exact sixth-failure cooldown schedule, global IP serialization, successful verification preserving the streak, failed-phrase ciphertext, session expiry, reset authorization, retention, trusted IP handling and slow request bodies.
- 63 development browser tests and 25 root-path static browser tests passed. New service tests use synthetic keys and API responses, covering managed decryption, persisted cooldown, unavailable-service refusal, encrypted iframe delivery, independent reset authorization and session expiry.
- Actual local workerd + D1 authentication, encrypted audit reading and logout passed. A browser opened all 122 real Life photographs and the encrypted administrator dashboard; mouse refresh, logout and reset-dialog cancellation worked at desktop and 375px, with no runtime errors or horizontal page overflow. The final mobile close control has its own space above the panel.
- The private dashboard was separately tested with synthetic totals larger than the 2,000-detail limit, source-text injection, keyboard controls, empty data and reset. Headline and album totals come from complete SQL aggregates; truncated detail charts are labelled.

A live-record deletion smoke step was rejected by automatic approval review, so it was removed. Existing local audit records were retained; reset deletion behavior was verified only against synthetic test databases. Browser verification does not imply cloud deployment.

Remote status: Wrangler reports not authenticated; no remote D1 database, Worker deployment, GitHub commit or Pages deployment was created. This workspace has no `.git` directory. The running local Worker uses port 8787; the current development preview connects to it through ignored `.env.development.local`. Production needs an authenticated Cloudflare deployment and the Actions repository variable `GALLERY_API_URL`. An unconfigured production build keeps managed albums locked. Details: [Gallery administration](GALLERY_ADMIN.md).

## Encrypted photo collections — 2026-09-23 (previous update)

Imported all 176 supplied photographs: Life 122, Photography 46, Aesthetic 8. The 176 original files were copied out of the build directory before building and verified against SHA-256 receipts. They remain byte-for-byte intact under ignored `.private/gallery/`. Life contains 119 timeline photographs on 62 dated entries and three separate birthday photographs (2026, 2025, 2024). Photography has five visually curated categories with renamed working copies; Aesthetic has ordered 01–05 artwork and a separate three-photo concert section. Lover remains empty.

The publication pipeline generates sanitized WebP derivatives before AES-GCM encryption. A local audit decrypted and inspected every one of the 358 published image resources, including full images, thumbnails, and three independent public covers. All were valid WebP, correctly sized, and free of EXIF, GPS, XMP, IPTC, embedded profiles, and comments. The original-file hashes still match. Full images are losslessly encoded after proportional resizing to a maximum 2560px longest edge; all eight Aesthetic images retain their native dimensions. Thumbnails are at most 960px and quality 94. Album cards load the separately encrypted cover thumbnail; their combined image payload is approximately 397 KiB. Lossless cover versions up to 1280px are retained.

Life remains password-protected. Public albums and covers use deliberately public, independent view keys. A public cover key cannot decrypt Life; public image delivery encryption does not prevent a visitor from saving a displayed public photograph. A separate local scan checked 900 source/public/build/documentation files for the configured private credentials without printing them and found none. The build rejects plaintext Gallery images and private source files. The supplied raw `dist/gallery/` images are absent from the rebuilt artifact.

Validation:

- ESLint and TypeScript passed.
- All 20 unit tests passed, including sanitized-image pixel preservation, password rotation, authentication/tampering, public access, independent cover keys, grouping metadata, and water interference.
- All 59 development browser tests passed across the full configured suite: 25 water/navigation/News/visitor checks and 34 site/private-gallery/collection checks. Private UI tests use synthetic photos and credentials only.
- Root-path production build and asset checks passed: 10 rendered documents (nine routes plus 404), 151 local references, metadata, sitemap and encrypted manifests.
- All 25 static browser tests passed at `/` and all 25 passed again at `/preview-repo/`, using a file server without SPA fallback. The final cover-thumbnail optimization is covered by the production encrypted-cover and public-collection test. The final artifact is restored to `/` for the personal user site.

Browser coverage checks actual public covers/counts, lazy Blob image loading, complete aspect ratios, artwork ordering, concert separation, timeline year filtering, horizontal slider drag and keyboard control, birthday placement, Lightbox navigation/focus, and 320px containment. Manual in-app inspection confirmed the three specified covers, Photography at 375px, and a full concert Lightbox image. Pointer clicks have a slightly stronger lavender tint while retaining the existing shared physical wave field.

JavaScript is 101.52KB gzip and CSS 16.98KB gzip. The full encrypted collection is approximately 648 MiB; the complete static artifact is approximately 684 MiB. Those files are loaded individually on demand, not downloaded together. No runtime dependency was added. Lighthouse was not rerun. No commit, push, or online deployment was performed; this workspace has no `.git` directory. See [gallery maintenance](PRIVATE_GALLERY.md) for source locations and future updates.

## Previous shared lavender click waves (historical)

Click disturbances now enter the already-moving ambient surface. Only one water canvas is rendered. An auxiliary field tracks click-origin colour, but transparency and light intensity are computed from the combined displacement; the colour cannot paint a wave that has physically cancelled. Small clicks use translucent lavender shadows and pale lavender highlights in every page palette. They propagate and dissipate naturally, with a small initial source and lower strength than background drops. A short burst budget bounds energy from rapid clicks. The previous independent click canvas and animation module were removed.

Lint, TypeScript, all 19 unit tests and all 12 water/glass browser tests passed. New numerical tests prove that an injected click reinforces and cancels already-propagating ambient waves, that cancelled waves render transparently, and that ambient-only rendering is byte-identical to the previous implementation. Browser tests repeat an identical seeded background and verify the click changes its painted overlapping pixels; they also check lavender colour, small initial extent, propagation, decay, rapid clicking, keyboard exclusion, reduced motion and mobile layout. Manual in-app inspection confirmed the subtle lavender effect on Home.

Production build, asset checks and all 24 static browser tests passed at `/`, with 9 public pages plus 404.html, 32 local references and sitemap/metadata verified. JavaScript is 97.66KB gzip; CSS is 14.81KB gzip. No dependency was added. Lighthouse was not rerun. No commit, push or online deployment was performed.

## Previous water, compact navigation and News visual update (historical)

The background now uses a shared two-dimensional damped wave field. Signed displacements are combined before shading, so overlapping crests reinforce and opposing displacements cancel. Unit tests verify both effects, propagation, decay, numerical stability and reset. The average disturbance interval is 2400ms with 28% variation. Source positions and sizes vary; the field propagates continuously rather than animating independent circle elements.

Rendering is limited to 30 updates per second and 64,000 backing pixels on desktop / 24,000 on small screens, independent of device pixel ratio. Hidden tabs and reduced-motion preferences stop the simulation and clear the field. The 76px local click feedback now uses the same WaveField solver, directional shading and route palette as a miniature background wave, replacing its old CSS ring. Each click has a 64 × 64 grid, a 950ms fade/cleanup deadline and a two-wave concurrency limit. No runtime dependency was added. Navigation refraction textures regenerate only after its resizing settles, not on every frame of the unfolding animation.

The navigation rests as a small glass handle, opens on hover, keyboard focus or tap, and closes on pointer departure, Escape or touch navigation. Keyboard focus is retained correctly and closed links are inert. The News monthly visualization is a twelve-month ribbon with one bead per update, preserving the source date precision. Manual quote arrows have transparent resting surfaces and pointer-following glass highlights. The visitor section now has one heading above a centered map, without the previous left explanatory column.

Manual in-app browser inspection checked the collapsed/expanded navigation, News ribbon and quote controls at desktop and 390px widths. The real visitor map rendered at its full 600px desktop width with a transparent ocean, readable live counter and native zoom controls. Initialization now waits for a nonzero iframe layout width, avoiding WebKit's early zero-width measurement. A local SVG filter removes white only from the map background; counters, markers and controls remain unfiltered. Four provider tests cover deferred initialization, one request only, responsive fitting, errors/retry and sandbox isolation.

Final validation: lint and TypeScript passed; all 16 unit tests passed. The full development browser suite passed 48 tests, followed by all 18 affected water/navigation/visitor checks after the final texture optimization and map fix (including one new map regression). Production static suites passed 24 tests at `/preview-repo/` and 24 again at the final `/` base. The plain static server has no SPA fallback. Build checks verified 10 documents, 32 local files, metadata, sitemap and protected album manifests. The final `dist/` uses `/` and contains 9 public pages plus 404.html.

The subsequent miniature-click update passed lint, TypeScript, all 16 unit tests, all 10 water/glass browser tests, production build and asset checks. Pixel sampling verifies outward propagation and declining alpha, correct centering, the shared page tint/white highlights, concurrency limits, cleanup, keyboard exclusion, reduced motion and mobile overflow. Manual Gallery inspection confirmed the subtle local effect. The ambient implementation was unchanged.

Final JavaScript is 97.74KB gzip and CSS 14.90KB gzip. README files document all new controls. Lighthouse results farther down are historical, not a measurement of this wave simulation. No commit, push or online deployment was performed; this workspace snapshot has no `.git` directory.

## Previous Gallery / News / visitor-map update (historical)

The latest update passed lint, TypeScript, 13 unit tests and the production build. The full development browser suite passed 42 tests before the final visitor-frame refinement; its 3 focused isolation/provider tests passed again afterwards. The final root-path static suite passed 24 tests. The project-prefix suite also passed 24 tests, and its visitor-frame case passed again after matching the provider's real DOM.

The final artifact has 9 public pages plus 404.html. Build checks verify 10 page documents, 32 local references, metadata, sitemap, encrypted manifest presence/counts, and absence of private source files. The final base is restored to `/`.

Life and Lover have authenticated AES-GCM encrypted manifests, images and thumbnails. Browser tests cover wrong passwords, independent passwords, Blob thumbnails/Lightbox images, refresh/route-exit relocking, focus restoration and 320px unlock controls. Crypto tests use synthetic data and cover original-byte preservation, tampering, unique salts/IVs, password rotation, traversal/symlinks and temporary-file cleanup. No fixture photographs are published.

A separate local audit verified both configured passwords against the real encrypted empty manifests without printing credentials. The source/public/build scan found no configured password. The key file is local-only with mode 0600; Vite returns HTTP 403 for its URL, including raw-file requests. Private albums cannot include plaintext photo lists in public content data. See [private album instructions](PRIVATE_GALLERY.md).

The News heatmap now aggregates all 18 original month-precision records. Precisely dated future records enable Daily view without inventing dates. Tests verify counts/year changes, mixed precision, manual quote previous/next/dots, wraparound, bilingual controls, focus/hover pause and reduced motion.

MapMyVisitors keeps the original counter and history. Its script runs only in an isolated static iframe without same-origin permission, loaded when the footer enters view. Tests check that it cannot read the parent document and cannot accept forged status messages from another window. The real provider uses a CSS background/SVG map and text counter; the implementation checks their readiness and adapts native width/text color.

Manual in-app browser inspection successfully displayed the real world map, zoom controls and **102 Total Pageviews** at verification time. That is a point-in-time PV count, not unique visitors. The official history link remains available if the external service fails. Automated tests mock the provider.

Visual inspection also confirmed three upper albums, full-width Lover, public count badges, the requested Chinese hint, the glass unlock dialog, monthly heatmap and manual quote controls. All four actual albums currently contain zero photographs.

The final JavaScript is about 96KB gzip and CSS 14KB gzip. This update adds no dependencies. Lighthouse below is a historical measurement and was not rerun for this update. No commit, push or online deployment was performed because the workspace snapshot has no `.git`.

## Previous redesign checks (historical)

| Check | Result |
| --- | --- |
| Clean dependency installation (`npm ci`) | Passed; npm audit reported 0 vulnerabilities |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 8 tests passed |
| `npm run test:e2e` | 31 browser tests passed |
| Root-path production build | Passed; 8 public routes plus 404.html |
| `npm run check:build` | 9 documents, 29 referenced local files (including responsive images), metadata and sitemap verified |
| `npm run test:static`, base `/` | 20 tests passed |
| `npm run test:static`, base `/preview-repo/` | 20 tests passed |

Browser coverage includes Home's latest eight News and configured featured papers, EN/中文 persistence, active navigation and history, publication filters, all route refreshes, calendar tooltips, quote timing and hover pause, reduced motion, mobile layouts at 320px/375px, menu keyboard behavior, Lightbox focus trapping, image navigation, Escape/backdrop close, focus restoration, and touch swipe.

The visual refinement adds nine browser checks for randomized ripple positions and concurrency, a single expanding crest whose opacity decreases at 15%/45%/80% of its lifetime, small lavender click ripples (76px, 950ms) and cleanup, local glass highlights without moving the page background, live reduced-motion cancellation, keyboard activation without pointer ripples, local brand logos, and undistorted responsive portraits on 320px/375px touch screens. Tests also cover language-specific names, five route palettes, and removal of lens/orbit decorations.

Latest pointer-follow adjustment: lint, TypeScript, all 8 unit tests, production build, asset checks, and the 9 focused water/glass browser tests passed again. The tests now sample varied ambient diameters inside the desktop 280–680px interval and its proportionally scaled mobile interval. Moving across empty page areas changes the decorative illumination's rendered transform and sheen opacity while content bounds and the base palette stay fixed. Touch and reduced-motion checks verify that flow variables are cleared. The full 31-test and static-route runs in the table were completed before this focused adjustment.

Static tests use a plain HTTP file server with **no SPA fallback**. They check every page and album directly, real 404 status and recovery, canonical URLs, hydration errors, missing local assets, explicit `index.html` aliases, and readable prerendered HTML with JavaScript disabled. The final `dist/` is restored to base `/` for the personal user site.

Gallery tests inject temporary fixture data inside a test browser. No test photos were added to the real albums.

## Lighthouse

Lighthouse 12.8.2, mobile preset, local production preview, 2026-09-22 (before the latest decorative pointer-follow adjustment; not remeasured for that adjustment):

| Category | Score |
| --- | ---: |
| Performance | 93 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

LCP: 3.2 s · CLS: 0 · Total Blocking Time: 0 ms. This measurement is from the final refined glass/ripple version with the replacement portrait.

These are local measurements, not a guarantee of identical scores on a deployed network. The homepage was measured; this is not a full manual accessibility certification. CSS and JavaScript use no external fonts, animation packages, WebGL, or remote content APIs. Production JavaScript is approximately 90 KB gzip; CSS approximately 13 KB gzip. The replacement portrait has 512px (~161 KiB), 680px (~281 KiB), and 1200px (~828 KiB) variants. All use lossless WebP encoding after proportional resizing and preserve the full composition. The original `images/myphoto.jpg` remains unchanged.

Visual inspection checked the transparent navigation, local edge highlights, soft ripples, pale rose News background, complete portrait framing, and independent English/Chinese names. Water frequency and intensity are configurable in `src/data/appearance.ts`; page palettes are in `src/styles/themes.css`. A small SVG displacement map enhances navigation edge refraction on supporting desktop browsers and is regenerated only on resize; the underlying CSS material remains available elsewhere. Effects pause in hidden tabs and respect reduced motion. Subpath static tests in the table were performed during the initial implementation; root-path static tests (including SVG hydration) and responsive-asset build checks were repeated for this refinement.

## Content and deployment status

Preserved 6 publications, 18 News entries, 11 year-specific award records, 3 education entries, original profile links, and original paper/image assets. See [content migration](CONTENT_MIGRATION.md) for source precision and items to confirm.

The current Gallery contains 176 photographs across Life, Photography and Aesthetic; Lover remains intentionally empty. Quote lines are explicitly marked TODO editorial examples. Existing News only specify months and appear in the monthly heatmap instead of receiving fictional exact dates.

This working directory did not contain `.git`. No commit, remote push, or online GitHub Pages deployment was performed. The static artifact and deployment workflow are ready. To publish, commit these files in the actual Git repository, select **GitHub Actions** as the Pages source, and push to `main` or `master`.

## Reproduce

```sh
npm ci
npm run lint
npm test
npm run build
npm run check:build
npm run test:e2e
npm run test:static

# Test repository Pages paths
PAGES_BASE_PATH=/preview-repo/ npm run build
npm run check:build
npm run test:static

# Restore the personal user site artifact
npm run build
```

Browser tests use installed macOS Google Chrome, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or Playwright Chromium (`npx playwright install chromium`).
