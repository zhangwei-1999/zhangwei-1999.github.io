import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

// Test the deployment artifact as files. Missing routes receive a real HTTP 404;
// there is deliberately no development-server fallback to the Home document.
const directory = await realpath(resolve(process.argv[2] || 'dist'));
const home = await readFile(resolve(directory, 'index.html'), 'utf8');
const base = home.match(/data-base-path="([^"]+)"/)?.[1];
if (!base || !base.startsWith('/') || !base.endsWith('/')) throw new Error('Build dist before starting the static server (missing data-base-path).');
const port = Number(process.env.STATIC_PORT || 4180);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};

async function existingFile(candidate) {
  let actual;
  try { actual = await realpath(candidate); } catch { return null; }
  // Following a symlink must never expose a file outside the deployment artifact.
  if (actual !== directory && !actual.startsWith(`${directory}${sep}`)) return null;
  const info = await stat(actual);
  return { actual, info };
}

async function sendFile(response, request, file, status = 200) {
  const info = await stat(file);
  response.writeHead(status, {
    'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 404 ? { 'X-Robots-Tag': 'noindex' } : {}),
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch {
      response.writeHead(400); response.end('Invalid URL encoding'); return;
    }
    if (base !== '/' && pathname === base.slice(0, -1)) {
      response.writeHead(301, { Location: `${base}${url.search}` }); response.end(); return;
    }
    if (pathname.startsWith(base) && !pathname.includes('\0')) {
      const candidate = resolve(directory, pathname.slice(base.length));
      if (candidate === directory || candidate.startsWith(`${directory}${sep}`)) {
        let result = await existingFile(candidate);
        if (result?.info.isDirectory()) {
          if (!pathname.endsWith('/')) {
            response.writeHead(301, { Location: `${url.pathname}/${url.search}` }); response.end(); return;
          }
          result = await existingFile(resolve(result.actual, 'index.html'));
        }
        if (result?.info.isFile()) {
          await sendFile(response, request, result.actual); return;
        }
      }
    }
    await sendFile(response, request, resolve(directory, '404.html'), 404);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end('Static server error');
  }
});

server.listen(port, '127.0.0.1', () => console.info(`Serving ${directory} at http://127.0.0.1:${port}${base}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
