import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'public'), dist, { recursive: true });
const fileEnv = await readDotEnv(resolve(root, '.env'));
await writeFile(resolve(dist, 'env.js'), renderEnv(fileEnv));
console.log(`Built static translator web app in ${dist}`);

function renderEnv(fileEnv) {
  const config = {
    BACKEND_SOCKET_URL: process.env.VITE_BACKEND_SOCKET_URL ?? fileEnv.VITE_BACKEND_SOCKET_URL ?? process.env.BACKEND_SOCKET_URL ?? 'http://localhost:4000',
    SITE_NAME: process.env.VITE_SITE_NAME ?? fileEnv.VITE_SITE_NAME ?? 'Translator',
    SITE_VERSION: process.env.VITE_SITE_VERSION ?? fileEnv.VITE_SITE_VERSION ?? '0.1.0',
  };
  return `window.TRANSLATOR_WEB_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
}

async function readDotEnv(path) {
  try {
    const contents = await readFile(path, 'utf8');
    return Object.fromEntries(
      contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1).replace(/^['\"]|['\"]$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}
