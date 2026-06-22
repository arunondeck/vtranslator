import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, process.argv[2] ?? 'public');
const port = Number(process.env.PORT ?? 5173);
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname === '/env.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(renderEnv());
    return;
  }
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = join(publicDir, requestedPath);
  const safePath = resolve(filePath).startsWith(publicDir) ? filePath : join(publicDir, 'index.html');
  const finalPath = existsSync(safePath) ? safePath : join(publicDir, 'index.html');
  response.setHeader('Content-Type', mimeTypes[extname(finalPath)] ?? 'application/octet-stream');
  createReadStream(finalPath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Web viewer serving ${publicDir} at http://localhost:${port}`);
});

function renderEnv() {
  const fileEnv = readDotEnv(join(publicDir, '..', '.env'));
  return `window.TRANSLATOR_WEB_CONFIG = ${JSON.stringify({
    BACKEND_SOCKET_URL: process.env.VITE_BACKEND_SOCKET_URL ?? fileEnv.VITE_BACKEND_SOCKET_URL ?? 'http://localhost:4000',
    SITE_NAME: process.env.VITE_SITE_NAME ?? fileEnv.VITE_SITE_NAME ?? 'Translator Live Wall',
    SITE_VERSION: process.env.VITE_SITE_VERSION ?? fileEnv.VITE_SITE_VERSION ?? '0.1.0',
    DISPLAY_LANGUAGES: process.env.VITE_DISPLAY_LANGUAGES ?? fileEnv.VITE_DISPLAY_LANGUAGES ?? 'en,ml,hi,bn',
  }, null, 2)};\n`;
}

function readDotEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).replace(/^['\"]|['\"]$/g, '')];
      }),
  );
}
