# Wei Zhang · Personal academic homepage

[中文说明](README_cn.md) · [Content migration notes](docs/CONTENT_MIGRATION.md)

A light, bilingual academic homepage built with React, TypeScript, and Vite. The design uses pale blue glass surfaces, slow water-like light, and restrained lavender hover effects. The Gallery introduces a warmer cream palette.

The site has Home, Publications, News, Awards, Gallery, and individual album pages. Every route is prerendered to a real HTML file for GitHub Pages; direct links and refreshes do not require a server rewrite or hash router. Personal content lives in `src/data/`, independently of the UI.

## Local development

Use **Node.js 22+** and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). Do not serve the repository root with a plain HTTP server; it contains TypeScript source that needs the Vite build.

```sh
npm run lint
npm run test
npm run build
npm run preview
```

- `lint`: ESLint for the source and supporting scripts.
- `test`: unit tests, including calendar/date handling.
- `build`: TypeScript check, Vite production build, and static prerendering into `dist/`.
- `preview`: serves the production build, normally at `http://127.0.0.1:4173`.
- `npm run typecheck`: runs the TypeScript check separately.
- `npm run test:e2e`: Playwright browser checks. Install Google Chrome or run `npx playwright install chromium` before the first run.

## Project structure

```text
src/
  data/                 # All editable personal content
    profile.ts
    news.ts
    publications.ts
    awards.ts
    gallery.ts
    gallery-private.generated.json # Generated password-album counts / manifest paths
    gallery-public.generated.json  # Generated public album / cover view keys and paths
    visitors.ts         # Existing visitor-map counter and colors
    quotes.ts
    appearance.ts       # Water frequency, size, opacity, pointer influence
  components/           # Navigation, cards, calendar, quotes, lightbox, footer
  pages/                # Home, Publications, News, Awards, Gallery
  lib/                  # Router, language, calendar, water simulation, pointer helpers
  styles/               # Design tokens, responsive layout, effects
  types.ts              # Content schemas
public/                  # Public assets and gallery-encrypted/ ciphertext
.private/gallery/        # Ignored passwords, publish config, lists, ALL Gallery originals
.private/analytics/      # Ignored service credentials, random keys, plaintext dashboard
services/gallery-worker/ # Separate Cloudflare Workers + D1 authorization/audit service
images/                  # Preserved portrait / institution assets
docs/                   # Preserved paper covers, BibTeX, migration notes
scripts/prerender.tsx    # HTML, sitemap, robots, and legacy asset generation
scripts/encrypt-gallery.ts # Local-only Gallery image preparation and encryption
.github/workflows/      # GitHub Pages build/deploy; manual legacy Scholar crawler
academic.md             # Preserved original content; not the live source
```

`README.md` links to this English file. The original valid content is preserved: 18 news entries, six papers, 11 annual award records, three education entries, and existing contact/resource links. Core content schemas are defined in `src/types.ts`.

## Edit profile and languages

Edit `src/data/profile.ts` for name, position, institution, biography, SEO summary (`tagline`), research interests, social links, education, portrait, site URL, repository, and footer `lastUpdated`. The `tagline` contributes to page metadata and is not displayed in the Home hero. Update `lastUpdated` to a real maintenance date (`YYYY-MM-DD`).

Bilingual fields use the same shape throughout:

```ts
{ en: 'English text', zh: '中文文本' }
```

Fill both fields when adding content. The first visit defaults to English; the language switch updates the page and saves the selection in localStorage. Paper titles, authors, venues, and resource labels can remain in their original language. Add an optional `titleZh` to a publication if you have a Chinese title. Quote text deliberately remains English.

## Add News

Add an object to the exported `news` array in `src/data/news.ts`:

```ts
{
  id: 'example-update',                    // unique; replace example content
  date: '2026-09-15',
  datePrecision: 'day',
  emoji: '📢',
  content: { en: 'Your update.', zh: '你的动态。' },
  category: 'announcement',
  // link: 'https://your-actual-link',      // optional; omit if unavailable
},
```

News is sorted by date. Home shows only the latest eight entries; News shows everything. The calendar is generated from this same array, including all news on the same day and automatic year options.

**Preserve date precision:** legacy entries only specify a month, so they use `date: '2026-02'` and `datePrecision: 'month'`. The default view is a transparent year ribbon: twelve fine month ticks, with a glass dot for each update and a total above populated months. It counts all news, including entries with exact dates; dense months show up to twelve dots plus the remaining count. On small screens, the ribbon splits into two half-years. Hover, focus, or select a populated month to read every update in its tooltip. A Daily view becomes available only when the selected year contains exact dates; its contribution grid includes only those dated entries. No unknown date is assigned an invented day. Do not change legacy dates to the first of the month merely to color a cell.

## Add or feature a publication

Add an object to `src/data/publications.ts`. This is a schema example, not a real paper:

```ts
{
  id: 'example-paper',
  title: 'Your actual paper title',
  authors: 'First Author, Wei Zhang, Last Author†',
  venue: 'Actual venue',
  year: 2026,
  category: 'journal',                     // conference | journal | preprint
  cover: 'docs/example-paper/teaser.webp',
  featured: false,
  description: { en: 'A factual summary.', zh: '准确的研究简介。' },
  badges: [],                             // optional
  links: [
    { label: 'Paper', url: 'https://your-actual-paper-url' },
    { label: 'BibTeX', url: 'docs/example-paper/bibtex.txt' },
  ],
},
```

Place the corresponding files under `docs/example-paper/`. Add only links that exist; the generic `links` array also accepts Project, Code, Video, Slides, and other resources. Local paths must be relative to the site root, without `public/` or a repository prefix.

Set **`featured: true`** to pin a paper on Home. There is no count limit and no “latest papers” auto-selection. TEA, EL, and ANM are the initial explicit selection. The complete Publications page groups papers by year and offers category filters; other category values are supported.

Author markers are preserved: `*` denotes equal contribution and `†` denotes corresponding author. The existing SCI quartile / impact-factor badges are historical source values, not independently verified current metrics.

## Add an award

Add an entry to `src/data/awards.ts`:

```ts
{
  id: 'example-award',
  year: 2026,
  title: { en: 'Your actual award', zh: '真实奖项名称' },
  organization: { en: 'Awarding organization', zh: '颁奖单位' }, // optional
  description: { en: 'Optional context.', zh: '可选说明。' },   // optional
  // link: 'https://your-actual-award-url',                    // optional
},
```

The timeline sorts years automatically. No new personal awards were invented. The legacy **GMU Academic Scholarship** abbreviation needs owner confirmation before being expanded; exact Chinese certificate wording can also be refined.

## Add a Gallery album or photo

The Gallery has four albums. All cards show the current photo count, including locked albums. Life and Lover ask for a password only when selected; their covers remain visible. Lover spans the full row below the other three on desktop.

| Album | Current collection | Presentation | Public cover |
| --- | --- | --- | --- |
| Life | 139 photos | 136 dated photos across 63 dates, then three large birthday photographs | `birth-2026` |
| Photography | 46 photos | Five visual categories | `everyday-warmth_02` (the original `pic-13`) |
| Aesthetic | 8 photos | 01–05 in order without cropping, then ZJ-1/2/3 in a concert section | `01` |
| Lover | Empty until you add photographs | Private, full-width album card | Not yet selected |

Life provides year selection and horizontal rows for each date. Overflow rows support touch scrolling and a thin translucent scrollbar that appears on hover or keyboard focus. Birthday photographs sit in a separate large-image section at the bottom. Photography categories are Light & Sky, Botanical Notes, After the Rain, City Frames, and Everyday Warmth. Images load as they approach the viewport; the lightbox supports previous/next, arrow keys, Escape, backdrop close, and mobile swipe.

### Where photographs live

**Keep every Gallery original under `.private/gallery/`, including public albums. Do not put photographs in `dist/`, `public/gallery/`, `images/`, or `docs/`.** `dist/` is disposable build output. The imported 176 original files are backed up under each album's `originals/` directory; the local import receipt records their checksums. Photography also has renamed working copies in `photography/photos/` and a local `rename-map.json` linking them to the original filenames.

The website publishes only encrypted image derivatives and encrypted photo metadata. All derivatives have EXIF/GPS/device metadata removed. After managed activation, Life and Lover obtain random decryption keys through server authorization; their password no longer derives an image key in the browser. Photography, Aesthetic, and the selected covers use public view keys so they open automatically. Those public keys are intentionally part of the site: **publicly displayed photographs can still be saved by a visitor**. Encryption keeps raw image files out of the published assets; it does not make a public album confidential. Original source files and their embedded metadata stay on your computer.

### Add or arrange photos

1. Put the original in `.private/gallery/<album-slug>/originals/`.
2. Add its record to that album's local `photos.json`. `src` is relative to the album directory; dimensions are read automatically.
3. Run the local encryption command, then build and check the generated site.

Example Life record; replace the example with a real photograph and date:

```json
{
  "id": "2026-09-23-01",
  "src": "originals/your-photo.jpg",
  "alt": { "en": "Describe the actual photograph.", "zh": "描述照片的实际内容。" },
  "date": "2026-09-23",
  "section": "timeline",
  "sequence": 1
}
```

For a birthday photograph, use `section: "birthdays"` and `year: 2027`; `sequence` controls order within a group. For Photography, use a category ID as `section` and name the working file and photo ID `<category>_<NN>`, for example `light-and-sky_10.jpg` / `light-and-sky_10`. Existing categories are `light-and-sky`, `botanical-notes`, `after-the-rain`, `city-frames`, and `everyday-warmth`. Aesthetic uses `section: "prints"` for the numbered artwork and `section: "concert"` for concert images, each with its own `sequence`. Optional `caption` uses the same `{ en, zh }` shape as `alt`. Change labels and section descriptions in `src/data/gallery.ts`; dates, order, and individual photo text belong in the local photo list.

```sh
npm run gallery:encrypt -- photography  # Update just this album and its cover
npm run build
npm run check:build
```

Running `npm run gallery:encrypt` without a slug updates the albums listed in `.private/gallery/publish.json`—currently Life, Photography, and Aesthetic. Lover stays unchanged until explicitly updated or added to this configuration. Add Lover with `access: "password"` to `publish.json` when you want it included in the all-albums command or want to configure a cover. An explicit `-- lover` run uses the same metadata-removing defaults whenever `publish.json` exists.

Commit these generated paths together after encryption:

- `public/gallery-encrypted/`
- `src/data/gallery-private.generated.json`
- `src/data/gallery-public.generated.json`

Do not manually edit generated files. Album password source values stay in ignored `.private/gallery/keys.json`; managed verifiers and random data keys stay in `.private/analytics/` and Cloudflare Secret bindings. GitHub Actions uses committed ciphertext and defaults to the deployed Worker URL; the public `GALLERY_API_URL` repository variable is an optional override. **The Pages build does not encrypt photos and needs no private password/key secret.** Keep a separate local backup of both `.private/gallery/` and `.private/analytics/`, since GitHub cannot restore the originals, source lists, or private service keys. Once an album is migrated to v3, `gallery:encrypt` retains managed access and fails if its server key is missing.

### Change covers, image quality, or add an album

Set `coverPhotoId` in `.private/gallery/publish.json` to an existing photo ID, then re-encrypt that album. Covers are separately encrypted with independent public view keys, including Life's cover; publishing one does not expose its protected album key or private captions.

Current full-view images use lossless WebP after orientation correction and proportional resizing to a maximum 2560px longest edge. They are never upscaled. Thumbnails use a 960px limit and quality 94; public covers retain a lossless version up to 1280px. Album cards display the independently encrypted 960px cover thumbnail to reduce the initial download. The Aesthetic originals fit within the full-view limit, so their native dimensions are retained. “Lossless” describes the WebP encoding of the prepared pixels; resizing a larger camera original still reduces pixel dimensions. Original files remain untouched locally. Adjust defaults or a per-album `delivery` override in `publish.json` if a different tradeoff is needed.

To add an album, create its local directory and `photos.json`, add its `access` and optional `coverPhotoId` to `publish.json`, and run encryption. Then add its bilingual card and `sections` in `src/data/gallery.ts`, referencing `publicAlbums.albums[slug]` for public access or `privateAlbums[slug]` plus a hint for protected access. Reference `publicAlbums.covers[slug]` as `encryptedCover`, and keep `photos: []` because the photographs come from the encrypted manifest. A new protected album also needs service key preparation, Worker configuration and managed migration before publication. Rebuild to generate the new route and sitemap entry. See the [gallery publishing guide](docs/PRIVATE_GALLERY.md) and [managed service setup](docs/GALLERY_ADMIN.md).

## Gallery authorization and private administration

Cloudflare Workers + D1 supply managed v3 album authorization, server-side IP cooldowns and encrypted audit details. **On 2026-09-23, Cloudflare OAuth, APAC D1 creation, remote migration 0001, Secret upload and initial Worker deployment completed; live backend and local-frontend integration checks passed.** The initial 100,000-iteration PBKDF2 deployment measured **26.260ms P99 CPU**, exceeding Free's 10ms budget. The owner has authorized retaining PBKDF2 with 30,000–100,000 iterations. The hybrid verifier and paginated audit API are now deployed and active in version `18607b41-6c83-4130-bad1-da2411d53c5d`, with 30,000 PBKDF2 iterations for every credential. The final 33-request sample had no errors, with P50 3.460ms and P99/maximum 11.731ms; two requests exceeded 10ms. **Functionality passes, but the requirement that every request stay within 10ms is not met.** Passwords, photo assets and all existing data keys were preserved. The account remains on confirmed **Free ($0)**, with no purchase or upgrade. No Git push or Pages deployment was performed. Audit reset was not executed; synthetic test records remain. See [GALLERY_ADMIN.md](docs/GALLERY_ADMIN.md) for current deployment status. `gallery:service:migrate` applies local migrations only; remote migrations require `--remote`.

Only verified wrong shared album phrases are retained, up to 256 Unicode code points with a truncation flag, inside encrypted D1 details. Successful, blocked, administrator and reset inputs are never stored. Locations are approximate IP-derived coordinates rounded to one decimal, not GPS. Retention is 90 days. The updated audit API serves 50 details per request; the panel automatically loads up to 2,000 latest events, while the first response includes SQL aggregates for the entire selected range. The first five failures have no cooldown; subsequent delays are 1/5/10/20/30/60 minutes, then 60 minutes thereafter. A 24-hour interval without failures resets the counter; successful unlock does not. Resetting audit history does not clear cooldowns.

The Chinese Gallery footer punctuation is only a UI shortcut. The plaintext dashboard stays local; only AES-encrypted `panel.enc` is published. Admin sessions remain in page memory for 15 minutes. New verifier v2 uses **PBKDF2-HMAC-SHA256 followed by secret-pepper HMAC-SHA256**: default 30,000 iterations, configurable from 30,000–100,000 via `GALLERY_PASSWORD_ITERATIONS`. A random 16-byte salt derives 32 bytes; a separate 32-byte server-only pepper authenticates the credential context, salt, iteration count and derived key. Only the final HMAC is stored. If both pepper and verifier leak, each offline guess still incurs the configured PBKDF2 work, though 30,000 provides less work than the former 100,000. Neither secret belongs on GitHub. Deploy code compatible with both formats before preparing and uploading v2 secrets; preparation preserves AES/audit/IP/panel keys and the existing pepper, without photo re-encryption. The measured sample contained no resource failures, but platform tolerance is not a future guarantee; larger audit loads need separate assessment. See [the service guide](docs/GALLERY_ADMIN.md). Previously uploaded v1 ciphertext or saved photos cannot be revoked.

## Edit quotes

Edit `src/data/quotes.ts`:

```ts
{ text: 'Your chosen quotation.', author: 'Verified author' },
```

The initial three entries are original, unattributed editorial placeholders marked `TODO` in the data file. Replace them with your favorite quotations and accurate attribution. Quotes rotate locally every ten seconds and pause on hover or keyboard focus. Previous/next buttons and clickable position dots let you choose a card manually; a separate pause control stops automatic rotation. An empty array is supported. Reduced-motion preferences disable automatic rotation while preserving all manual controls.

The arrow controls have transparent backgrounds at rest and 44px targets. Hovering or focusing them reveals a soft glass reflection; desktop highlights follow the pointer without moving the quote text.

## Homepage visitor map

The bottom of Home restores the original **MapMyVisitors** counter and its existing history. Edit `src/data/visitors.ts` to enable/disable the section or adjust map colors. Keep the existing `widgetId` to retain the same counter. The script loads only when the map enters the viewport, so it does not delay the initial page render. It runs inside a sandboxed frame without same-origin access; the provider cannot access the main page or private-album password fields.

The section is headed **From around the world**, with a centered map in a translucent glass surface. It has no explanatory left column; the visitor-history link remains beside the heading.

Select the provider-rendered map for visitor totals and the historical chart on its official details page. Counts are supplied by MapMyVisitors, never hard-coded. If the external service is blocked or unavailable, the section shows a retry action instead of a fabricated count. The permanent visitor-history link opens the original official statistics page even when the embedded map cannot load. Map availability depends on the provider and the visitor’s network.

## Tune water and liquid glass

Edit `src/data/appearance.ts` without changing components:

- `water.ambient.intervalMs`: average background disturbance interval, initially `2400` ms; lower values make waves more frequent.
- `water.ambient.intervalVariation`: random interval variation, initially `0.28` (±28%).
- `water.ambient.speed`: propagation speed, initially `58` CSS pixels per second.
- `water.ambient.diameter`: random size parameter, initially `[280, 680]`. It scales the initial disturbance footprint and resulting visible spread; waves then propagate and dissipate in the shared surface, so this is not a fixed CSS ring diameter. Small screens scale the whole range before sampling.
- `water.ambient.opacity`: surface-light opacity, initially `0.38`.
- `water.click`: a small translucent lavender disturbance injected directly into the ambient water surface. `diameter: 76` sets the initial disturbance footprint, `strength: 2.8` keeps it gentler than ambient drops, and `tint: [146, 111, 196]` controls its lavender colour. `maxPerBurst: 2` within `burstWindowMs: 950` limits energy from rapid clicking. Waves naturally propagate and dissipate; they are not clipped to a separate canvas or forcibly removed at a fixed age. Combined surface normals determine the light, so click waves can reinforce or cancel existing background waves.
- `glass.response`: local reflection smoothing, initially `0.18`.
- `glass.flowTravel`, `flowAngle`, `flowResponse`: decorative light travel, angle and smoothing, initially `48px`, `5°`, and `0.075`. Pointer movement over empty areas also responds; content and the base palette remain stationary.
- `glass.refraction`: navigation edge displacement, initially `8`; `0` disables the SVG enhancement.
- Set either ripple configuration's `enabled` to `false` to disable it.

Ambient waves use a shared damped two-dimensional wave field in `src/lib/waveField.ts`, driven and rendered by `src/lib/waterSimulation.ts`. All disturbances contribute to the same surface height before lighting is calculated, so overlapping waves reinforce or cancel each other. Damping and absorbing edges gradually settle the surface. The canvas simulation runs at 30 Hz with a backing-resolution budget of at most 64,000 pixels on desktop and 24,000 on small screens, independent of display pixel density. Hidden tabs and reduced-motion preferences pause and clear the simulation. Click feedback remains small, and Gallery hover light fades away; reduced motion also disables pointer tracking.

The navigation rests as a small floating glass bar. Hover or keyboard focus unfolds it; touch users tap to open. It collapses after the pointer and keyboard focus leave, and supports Escape and an explicit close button. Hidden navigation links stay out of keyboard focus until the bar opens. Reduced motion disables the unfolding transition, and a static link row remains available without JavaScript.

Glass combines actual backdrop blur, translucent fill and local edge highlights. Desktop browsers supporting SVG backdrop filters also receive restrained edge refraction of underlying content, leaving labels sharp. The displacement map is generated only when navigation dimensions change, never on pointer movement. Other cases retain the CSS material. Across the desktop page, including empty margins, a broad soft refracted light layer eases with the pointer without moving the text or drawing an outlined lens or circular spotlight. It returns gently when the pointer leaves; touch and reduced-motion modes disable tracking.

Route palettes live in `src/styles/themes.css`: original ice-blue Home, pale lavender Publications, pale rose News, mint Awards, and the original warm cream Gallery. The Home name displays only the selected language. See `src/styles/effects.css` and `src/styles/navigation.css` for optical styling; publication border highlights travel on a `4.8s` cycle.

The homepage uses `images/myphoto.webp` with responsive `myphoto-small.webp` and `myphoto-mobile.webp` variants. All retain the original composition and use lossless WebP encoding after proportional resizing. The original `images/myphoto.jpg` remains untouched. Profile links select their local SVG brand logos using the `icon` field; no external icon service is involved.

## GitHub Pages deployment

1. Put the source and encrypted resources intended for publication in the actual Git repository, retaining the root `.gitignore`. This working directory has no `.git` metadata. Do not drag the entire working directory into GitHub's web uploader: it does not use your local `.gitignore` to exclude private files.
2. Run `git status --short --ignored` in the actual repository. Confirm that local files such as `.private/`, `.env`, `.env.*` (except explicit `.example` templates), `.dev.vars*`, `node_modules/`, and `dist/` are ignored and that no private files are already tracked or staged before committing. Adding `.gitignore` does not untrack files that Git already knows about.
3. In GitHub, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Push to `main` or `master`, or manually run the Pages workflow.
5. Confirm that the build and deploy jobs in **Actions** have succeeded, then open the deployment URL.

See the [release check report](docs/RELEASE_CHECK.md) for this publication review.

The workflow uses `actions/configure-pages` to obtain the site's base path and URL. It builds with npm and deploys `dist/` through the official Pages artifact/deploy actions. The default local build targets a user site such as `https://zhangwei-1999.github.io/` with base `/`.

The Worker is deployed at `https://wei-gallery-audit.zhangwei99-math.workers.dev`. The Pages workflow uses that URL by default and maps it to `VITE_GALLERY_API_URL`; the public **Actions repository variable `GALLERY_API_URL` is an optional override**, useful if the service URL changes. Do not add service credentials or data keys to the frontend environment. Development still uses the local Worker at port 8787 through ignored `.env.development.local`; ignored `.env.production.local` is prepared with the deployed URL for production builds, without changing the source default.

For a repository/project site, test the same prefix locally:

```sh
PAGES_BASE_PATH=/your-repository/ SITE_URL=https://your-user.github.io/your-repository/ npm run build
PAGES_BASE_PATH=/your-repository/ npm run preview
```

Then open the preview URL with `/your-repository/` appended. `PAGES_BASE_PATH` must start and end with `/`. `SITE_URL` is the complete public base URL (including the repository segment) and overrides `profile.siteUrl`; set it for a custom domain as well.

The build writes physical HTML for every page and album, a 404 page, sitemap, robots file, canonical URLs, and Open Graph metadata. It copies paper files, BibTeX, and display assets from `images/` and `docs/` into `dist/`, excluding hidden files, Markdown maintenance documents, and the unused portrait original `images/myphoto.jpg`; source files remain intact. Vite copies `public/`. Always deploy **`dist/`**, not the source directory. JavaScript navigation keeps the selected menu item and browser back/forward history in sync; physical HTML handles direct links and refreshes on Pages.

A successful local build is not proof of a live GitHub deployment. The supplied workspace snapshot has no `.git` metadata, so cloud deployment status must be checked after these changes are committed and pushed from your actual repository.

## Accessibility, motion, and maintenance

The UI includes visible keyboard focus, semantic landmarks, mobile navigation, an accessible keyboard-controlled lightbox, and lazy image loading. System `prefers-reduced-motion` disables background motion, pointer ripples, animated borders, and quote rotation. Desktop pointer effects use CSS variables and animation-frame updates rather than React state per mouse movement. No animation library or WebGL dependency is required.

The old `academic.md`, source image files, and BibTeX files are retained for provenance. **Editing `academic.md` no longer changes the live site.** The old Scholar crawler is manual-only and retained as an optional legacy utility; it is not required for building or viewing this site. Citation/resource links remain available without live remote badges.

Before publishing a content change, run `npm run lint`, `npm run test`, and `npm run build`; use `npm run test:e2e` for interaction and routing checks. Add further Gallery photos through the local encryption workflow, replace the quote samples, confirm the GMU abbreviation / award translations, and refresh any historical journal metrics as desired.

The original static homepage template came from [AntXinyuan's academic homepage](https://github.com/AntXinyuan/antxinyuan.github.io/). Existing personal content and assets were retained during this reconstruction.

## Verify deployment files and optimize other public images

`npm run check:build` checks actual `dist/` pages, assets, BibTeX links, canonical URLs, and the sitemap. It also rejects private sources, environment files, symbolic links, unwanted maintenance documents, and deployments reaching 1 GB. After building, `npm run test:static` uses a plain static server with no SPA fallback to verify refresh, 404 recovery, JavaScript-disabled content, and hydration. It works for both root and repository subpaths.

```sh
npm run build
npm run check:build
npm run test:static
npm run optimize:image -- paper-teaser-original.jpg docs/example-paper/teaser.webp 1600
```

The last command is for intentionally public non-gallery assets, such as a paper teaser. It corrects orientation, preserves aspect ratio, and reports the WebP dimensions without overwriting the original. Gallery photographs use `gallery:encrypt` instead; do not write them to a public image directory. The build checks also reject raw image files in Gallery publication directories.

See [verification results](docs/VERIFICATION.md) for this implementation's measured checks.
