import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWebViewerEnv, renderEnvScript } from './web-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'public'), dist, { recursive: true });
const config = readWebViewerEnv(resolve(root, '.env'));
await writeFile(resolve(dist, 'env.js'), renderEnvScript(config));
console.log(`Built static translator web app in ${dist}`);
