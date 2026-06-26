import { readFileSync } from 'node:fs';

export function readWebViewerEnv(fileEnvPath) {
  const fileEnv = readDotEnv(fileEnvPath);
  const backendUrl =
    process.env.VITE_BACKEND_SOCKET_URL ??
    process.env.BACKEND_SOCKET_URL ??
    fileEnv.VITE_BACKEND_SOCKET_URL ??
    fileEnv.BACKEND_SOCKET_URL;

  if (!backendUrl?.trim()) {
    throw new Error(
      'Missing BACKEND_SOCKET_URL. Set VITE_BACKEND_SOCKET_URL in apps/web-viewer/.env for local dev, or as a Render env var for deploy.',
    );
  }

  return {
    BACKEND_SOCKET_URL: normalizeBackendUrl(backendUrl),
    SITE_NAME:
      process.env.VITE_SITE_NAME?.trim() ||
      fileEnv.VITE_SITE_NAME?.trim() ||
      'Translator',
    SITE_VERSION:
      process.env.VITE_SITE_VERSION?.trim() ||
      fileEnv.VITE_SITE_VERSION?.trim() ||
      '0.1.0',
  };
}

export function renderEnvScript(config) {
  return `window.TRANSLATOR_WEB_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
}

function normalizeBackendUrl(value) {
  const trimmed = value.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function readDotEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^['"]|['"]$/g, ''),
          ];
        }),
    );
  } catch {
    return {};
  }
}
