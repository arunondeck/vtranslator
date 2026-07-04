import { Router } from 'express';
import { config } from './config.js';
import {
  getPublicSonioxConfig,
  transcribeUrlWithSoniox,
} from './services/soniox.service.js';

const DEMO_AUDIO_URL = 'https://soniox.com/media/examples/coffee_shop.mp3';
const MAX_PACE_MS = 1_000;

export const sonioxRouter = Router();

sonioxRouter.get('/status', (_request, response) => {
  response.json({ ok: true, service: 'soniox', ...getPublicSonioxConfig() });
});

sonioxRouter.get('/config', (_request, response) => {
  response.json(getPublicSonioxConfig());
});

sonioxRouter.post('/stt/transcribe-demo', async (request, response, next) => {
  try {
    const body = request.body as Partial<{ model: string; paceMs: number }>;
    const result = await transcribeUrlWithSoniox({
      url: DEMO_AUDIO_URL,
      model: readModel(body.model),
      paceMs: readPaceMs(body.paceMs),
    });
    response.json({ ...result, sourceUrl: DEMO_AUDIO_URL });
  } catch (error) {
    next(error);
  }
});

sonioxRouter.post('/stt/transcribe-url', async (request, response, next) => {
  try {
    const body = request.body as Partial<{
      url: string;
      model: string;
      paceMs: number;
    }>;
    const url = readUrl(body.url);
    const result = await transcribeUrlWithSoniox({
      url,
      model: readModel(body.model),
      paceMs: readPaceMs(body.paceMs),
    });
    response.json({ ...result, sourceUrl: url });
  } catch (error) {
    next(error);
  }
});

function readModel(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : config.sonioxSttModel;
}

function readPaceMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return config.sonioxStreamPaceMs;
  }
  return Math.min(Math.max(Math.floor(value), 0), MAX_PACE_MS);
}

function readUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('A non-empty audio URL is required.');
  }
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Audio URL must use http or https.');
  }
  return url.toString();
}
