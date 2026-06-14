import type { TranscriptMap } from '@translator/shared-types';
import { config } from '../config.js';

export type ProcessAudioChunkInput = {
  sessionId: string;
  chunk: string;
  mimeType: string;
  sequence: number;
};

export type ProcessAudioChunkResult = TranscriptMap & {
  isFinal: boolean;
};

interface SarvamAdapter {
  processAudioChunk(input: ProcessAudioChunkInput): Promise<ProcessAudioChunkResult>;
}

const TARGET_LANGUAGE_CODES = {
  ml: 'ml-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
} as const;

class MockSarvamAdapter implements SarvamAdapter {
  async processAudioChunk(
    input: ProcessAudioChunkInput,
  ): Promise<ProcessAudioChunkResult> {
    return {
      en: `English live transcript sequence ${input.sequence}`,
      ml: `Malayalam live transcript sequence ${input.sequence}`,
      hi: `Hindi live transcript sequence ${input.sequence}`,
      bn: `Bengali live transcript sequence ${input.sequence}`,
      isFinal: false,
    };
  }
}

class HttpSarvamAdapter implements SarvamAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async processAudioChunk(
    input: ProcessAudioChunkInput,
  ): Promise<ProcessAudioChunkResult> {
    const audio = Buffer.from(input.chunk, 'base64');
    const form = new FormData();
    form.append(
      'file',
      new Blob([audio], { type: input.mimeType }),
      `chunk.${extensionFor(input.mimeType)}`,
    );
    form.append('model', 'saaras:v3');
    form.append('mode', 'translate');

    const transcription = await this.request<{ transcript: string }>(
      '/speech-to-text',
      { method: 'POST', body: form },
    );
    const en = transcription.transcript.trim();
    const translations = await Promise.all(
      Object.entries(TARGET_LANGUAGE_CODES).map(
        async ([language, targetLanguage]) => {
          const response = await this.request<{ translated_text: string }>(
            '/translate',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: en,
                source_language_code: 'en-IN',
                target_language_code: targetLanguage,
                model: 'sarvam-translate:v1',
              }),
            },
          );
          return [language, response.translated_text] as const;
        },
      ),
    );

    return {
      en,
      ml: translations.find(([language]) => language === 'ml')?.[1] ?? '',
      hi: translations.find(([language]) => language === 'hi')?.[1] ?? '',
      bn: translations.find(([language]) => language === 'bn')?.[1] ?? '',
      isFinal: false,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'api-subscription-key': this.apiKey,
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Sarvam request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }
}

const adapter: SarvamAdapter = config.useMockTranscription
  ? new MockSarvamAdapter()
  : new HttpSarvamAdapter(config.sarvamApiKey, config.sarvamApiBaseUrl);

if (config.useMockTranscription) {
  console.warn('Using mock transcription. Set USE_MOCK_TRANSCRIPTION=false and SARVAM_API_KEY to use Sarvam AI.');
}

export function processAudioChunk(
  input: ProcessAudioChunkInput,
): Promise<ProcessAudioChunkResult> {
  return adapter.processAudioChunk(input);
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  return 'm4a';
}
