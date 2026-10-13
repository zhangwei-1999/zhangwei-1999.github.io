import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { renderToString } from 'react-dom/server';
import { gallery } from '../src/data/gallery';
import { profile } from '../src/data/profile';

// The same base is used by Vite, client navigation, asset URLs, and static HTML.
const base = `/${(process.env.PAGES_BASE_PATH ?? '/').split('/').filter(Boolean).join('/')}/`.replace(/^\/\/$/, '/');
process.env.PAGES_BASE_PATH = base;

const configuredSiteUrl = process.env.SITE_URL;
const site = new URL(configuredSiteUrl || profile.siteUrl);
if (!['http:', 'https:'].includes(site.protocol)) throw new Error('SITE_URL must be an absolute HTTP(S) URL.');
if (!configuredSiteUrl && base !== '/') {
  const existingPath = site.pathname.replace(/\/$/, '');
  const basePath = base.replace(/\/$/, '');
  if (!existingPath.endsWith(basePath)) site.pathname = `${existingPath}${basePath}/`;
}
site.pathname = `${site.pathname.replace(/\/$/, '')}/`;
site.search = '';
site.hash = '';

const [{ App }, { pageMeta }] = await Promise.all([import('../src/App'), import('../src/lib/seo')]);
const outputDirectory = resolve('dist');
const template = await readFile(resolve(outputDirectory, 'index.html'), 'utf8');
if (!template.includes('<!--app-html-->')) throw new Error('The Vite HTML template must contain <!--app-html--> for prerendering.');

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const routeUrl = (route: string) => new URL(route === '/' ? '' : `${route.replace(/^\//, '')}/`, site).href;

function setMeta(html: string, attribute: 'name' | 'property', key: string, value: string) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${key}["'])[^>]*>`, 'i');
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(value)}">`;
  return pattern.test(html) ? html.replace(pattern, () => tag) : html.replace('</head>', `${tag}\n</head>`);
}

function routeHtml(route: string) {
  const metadata = pageMeta(route, 'en');
  const canonical = routeUrl(route);
  let html = template.replace('<!--app-html-->', () => renderToString(<App initialPath={route} />));
  // A GitHub Pages 404 document can be served at any unknown URL. Hydration must
  // begin with the exact route that produced its HTML, including index.html aliases.
  html = html.replace(/<div\b(?=[^>]*\bid=["']root["'])[^>]*>/i, (tag) => `${tag.slice(0, -1)} data-prerendered-path="${escapeHtml(route)}" data-site-url="${escapeHtml(site.href)}" data-base-path="${escapeHtml(base)}">`);
  html = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeHtml(metadata.title)}</title>`);
  html = setMeta(html, 'name', 'description', metadata.description);
  html = setMeta(html, 'property', 'og:title', metadata.title);
  html = setMeta(html, 'property', 'og:description', metadata.description);
  html = setMeta(html, 'property', 'og:url', canonical);
  html = setMeta(html, 'property', 'og:type', route === '/' ? 'profile' : 'website');
  html = setMeta(html, 'property', 'og:site_name', `${profile.name.en} · Academic homepage`);
  html = setMeta(html, 'property', 'og:image', new URL(profile.portrait.replace(/^\//, ''), site).href);
  html = setMeta(html, 'name', 'twitter:card', 'summary');
  html = setMeta(html, 'name', 'twitter:title', metadata.title);
  html = setMeta(html, 'name', 'twitter:description', metadata.description);
  if (route === '/404') html = setMeta(html, 'name', 'robots', 'noindex, follow');
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  const canonicalPattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  return canonicalPattern.test(html) ? html.replace(canonicalPattern, () => canonicalTag) : html.replace('</head>', `${canonicalTag}\n</head>`);
}

for (const album of gallery) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(album.slug)) {
    throw new Error(`Invalid gallery slug "${album.slug}". Use lowercase letters, numbers, and hyphens.`);
  }
}
const routes = ['/', '/publications', '/news', '/awards', '/gallery', ...gallery.map((album) => `/gallery/${album.slug}`)];
if (new Set(routes).size !== routes.length) throw new Error('Each gallery album must have a unique slug.');

await Promise.all(routes.map(async (route) => {
  const directory = resolve(outputDirectory, route.replace(/^\//, ''));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.html'), routeHtml(route));
}));
await writeFile(resolve(outputDirectory, '404.html'), routeHtml('/404'));

// Preserve paper assets and legacy image URLs without publishing maintenance
// notes, Finder metadata, or the unused full-resolution portrait source.
// User-added assets in public/ are already copied by Vite.
await Promise.all(['images', 'docs'].map((directory) => cp(resolve(directory), resolve(outputDirectory, directory), {
  recursive: true,
  filter: (source) => {
    const path = relative(resolve(directory), source).split(sep).join('/');
    return !path.split('/').some((part) => part.startsWith('.'))
      && !(directory === 'docs' && /\.md$/i.test(path))
      && !(directory === 'images' && path === 'myphoto.jpg');
  },
})));
await mkdir(resolve(outputDirectory, 'scripts'), { recursive: true });
await cp(resolve('scripts/scholar.json'), resolve(outputDirectory, 'scripts/scholar.json'));
await writeFile(resolve(outputDirectory, '.nojekyll'), '');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${escapeHtml(routeUrl(route))}</loc><lastmod>${escapeHtml(profile.lastUpdated)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
await writeFile(resolve(outputDirectory, 'sitemap.xml'), sitemap);
await writeFile(resolve(outputDirectory, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', site).href}\n`);
console.info(`Prerendered ${routes.length} pages and 404.html. Asset base: ${base}. Canonical site: ${site.href}`);
