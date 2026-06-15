import type { TranscriptMap } from '@translator/shared-types';

export interface TranscriptionProvider {
  processAudio(audio: Buffer, mimeType: string, sequence: number): Promise<TranscriptMap>;
}

const LANGUAGE_CODES = {
  ml: 'ml-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
} as const;

export class MockTranscriptionProvider implements TranscriptionProvider {
  async processAudio(
    _audio: Buffer,
    _mimeType: string,
    sequence: number,
  ): Promise<TranscriptMap> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      en: `English live transcript sequence ${sequence}`,
      ml: `Malayalam live transcript sequence ${sequence}`,
      hi: `Hindi live transcript sequence ${sequence}`,
      bn: `Bengali live transcript sequence ${sequence}`,
    };
  }
}

export class SarvamProvider implements TranscriptionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async processAudio(audio: Buffer, mimeType: string): Promise<TranscriptMap> {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), `chunk.${extensionFor(mimeType)}`);
    form.append('model', 'saaras:v3');
    form.append('mode', 'translate');

    const transcription = await this.request<{ transcript: string }>(
      '/speech-to-text',
      { method: 'POST', body: form },
    );
    const en = transcription.transcript.trim();
    const translations = await Promise.all(
      Object.entries(LANGUAGE_CODES).map(async ([language, targetLanguage]) => {
        const response = await this.request<{ translated_text: string }>('/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: en,
            source_language_code: 'en-IN',
            target_language_code: targetLanguage,
            model: 'sarvam-translate:v1',
          }),
        });
        return [language, response.translated_text] as const;
      }),
    );

    return {
      en,
      ml: translations.find(([language]) => language === 'ml')?.[1] ?? '',
      hi: translations.find(([language]) => language === 'hi')?.[1] ?? '',
      bn: translations.find(([language]) => language === 'bn')?.[1] ?? '',
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
      throw new Error(`Sarvam request failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}

export function createProvider(): TranscriptionProvider {
  const useMockTranscription = process.env.USE_MOCK_TRANSCRIPTION?.trim().toLowerCase();
  const apiKey = process.env.SARVAM_API_KEY?.trim();

  if (useMockTranscription === 'true' || !apiKey) {
    if (!apiKey && useMockTranscription !== 'true') {
      console.warn('SARVAM_API_KEY is not set; using mock transcription.');
    } else {
      console.log('Mock transcription is enabled.');
    }
    return new MockTranscriptionProvider();
  }
  return new SarvamProvider(
    apiKey,
    process.env.SARVAM_API_BASE_URL ?? 'https://api.sarvam.ai',
  );
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  return 'm4a';
}
