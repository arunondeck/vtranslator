import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWebViewerEnv, renderEnvScript } from './web-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, process.argv[2] ?? 'public');
const port = Number(process.env.PORT ?? 5173);
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname === '/env.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(renderEnvScript(readWebViewerEnv(resolve(root, '.env'))));
    return;
  }
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = join(publicDir, requestedPath);
  const safePath = resolve(filePath).startsWith(publicDir) ? filePath : join(publicDir, 'index.html');
  const finalPath = existsSync(safePath) ? safePath : join(publicDir, 'index.html');
  response.setHeader('Content-Type', mimeTypes[extname(finalPath)] ?? 'application/octet-stream');
  createReadStream(finalPath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Translator web app serving ${publicDir} at http://localhost:${port}`);
});
