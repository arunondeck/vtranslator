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
      en: `Demo transcript segment ${sequence}.`,
      ml: `ഡെമോ ട്രാൻസ്ക്രിപ്റ്റ് ഭാഗം ${sequence}.`,
      hi: `डेमो ट्रांसक्रिप्ट भाग ${sequence}।`,
      bn: `ডেমো ট্রান্সক্রিপ্ট অংশ ${sequence}।`,
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
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    console.warn('SARVAM_API_KEY is not set; using mock transcription.');
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
