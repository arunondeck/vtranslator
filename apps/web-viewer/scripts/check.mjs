import { access } from 'node:fs/promises';

await Promise.all([
  access(new URL('../public/index.html', import.meta.url)),
  access(new URL('../public/app.js', import.meta.url)),
  access(new URL('../public/styles.css', import.meta.url)),
  access(new URL('../public/env.js', import.meta.url)),
]);
console.log('Web viewer static files are present.');
