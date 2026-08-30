import { RealtimeUtteranceBuffer, SonioxNodeClient } from '@soniox/node';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@translator/shared-types';
import { Buffer } from 'node:buffer';
import { config, getLanguageLabel } from '../config.js';
import type {
  TranslateStream,
  TranslateStreamCallbacks,
} from './sarvam-stream.js';

export type SonioxRuntimeConfig = {
  api_key?: string;
  region?: string;
  base_domain?: string;
  base_url?: string;
  realtime?: {
    ws_base_url?: string;
    tts_ws_url?: string;
  };
  tts_api_url?: string;
};

export type SonioxTranscribeOptions = {
  url: string;
  model?: string;
  paceMs?: number;
};

export type SonioxToken = {
  text?: string;
  [key: string]: unknown;
};

export type SonioxTranscription = {
  text: string;
  tokens: SonioxToken[];
  model: string;
};

export type SonioxTranslateStreamOptions = {
  inputMode?: 'mixed' | 'single';
  inputLanguage?: string;
  outputLanguages?: SupportedLanguage[];
};

type SonioxResult = {
  tokens?: SonioxToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
};

type SonioxSession = {
  on(event: 'result', listener: (result: SonioxResult) => void): void;
  on(event: 'endpoint', listener: () => void): void;
  on(event: 'finished', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  connect(): Promise<void>;
  sendStream(
    stream: AsyncIterable<Uint8Array>,
    options: { pace_ms: number; finish: true },
  ): Promise<void>;
};

type SonioxClient = {
  realtime: {
    stt(options: SonioxSttConfig | { model: string }): SonioxSession;
  };
};

type SonioxSttConfig = {
  model: string;
  audio_format: 'pcm_s16le';
  sample_rate: number;
  num_channels: number;
  language_hints: string[];
  enable_language_identification: boolean;
  enable_endpoint_detection: boolean;
  translation: { type: 'one_way'; target_language: string };
};

type SonioxUtterance = {
  text?: string;
  segments?: Array<{
    text?: string;
    language?: string;
    tokens?: SonioxToken[];
  }>;
};

type SonioxUtteranceBuffer = {
  addResult(result: SonioxResult): void;
  markEndpoint(): SonioxUtterance | undefined;
};

type SessionState = {
  language: SupportedLanguage;
  session: SonioxSession;
  buffer: SonioxUtteranceBuffer;
  chunks: Uint8Array[];
  waiters: Array<() => void>;
};

class SonioxTranslateStream implements TranslateStream {
  private closed = false;
  private readonly sessions: SessionState[] = [];
  private readonly inputMode: 'mixed' | 'single';
  private readonly inputLanguage: string;
  private readonly outputLanguages: SupportedLanguage[];

  constructor(
    private readonly callbacks: TranslateStreamCallbacks,
    options: SonioxTranslateStreamOptions = {},
  ) {
    this.inputMode = options.inputMode === 'single' ? 'single' : 'mixed';
    this.inputLanguage = normalizeInputLanguage(options.inputLanguage);
    this.outputLanguages = normalizeOutputLanguages(options.outputLanguages);
  }

  async connect(): Promise<void> {
    if (!config.sonioxApiKey) {
      throw new Error('SONIOX_API_KEY is required to use Soniox translation.');
    }

    const client = new (SonioxNodeClient as unknown as {
      new (options?: SonioxRuntimeConfig): SonioxClient;
    })(getSonioxRuntimeConfig());
    const hints = getLanguageHints(this.inputMode, this.inputLanguage);

    for (const language of this.outputLanguages) {
      const sessionState = this.createSession(client, language, hints);
      this.sessions.push(sessionState);
    }

    await Promise.all(
      this.sessions.map(async (sessionState) => {
        await sessionState.session.connect();
        void sessionState.session
          .sendStream(this.readFrames(sessionState), {
            pace_ms: config.sonioxStreamPaceMs,
            finish: true,
          })
          .catch((error: unknown) => {
            this.callbacks.onError?.(
              error instanceof Error ? error.message : 'Soniox stream error.',
            );
          });
      }),
    );
  }

  sendFrame(frameBase64: string): void {
    if (this.closed) return;
    this.callbacks.onSpeechStart?.();
    const chunk = Buffer.from(frameBase64, 'base64');
    for (const sessionState of this.sessions) {
      sessionState.chunks.push(chunk);
      this.resolveWaiters(sessionState);
    }
  }

  flush(): void {
    this.callbacks.onSpeechEnd?.();
  }

  close(): void {
    this.closed = true;
    for (const sessionState of this.sessions) {
      this.resolveWaiters(sessionState);
    }
  }

  private createSession(
    client: SonioxClient,
    language: SupportedLanguage,
    languageHints: string[],
  ): SessionState {
    const session = client.realtime.stt({
      model: config.sonioxSttModel,
      audio_format: 'pcm_s16le',
      sample_rate: 16_000,
      num_channels: 1,
      language_hints: languageHints,
      enable_language_identification: true,
      enable_endpoint_detection: true,
      translation: { type: 'one_way', target_language: language },
    });
    const buffer = new (RealtimeUtteranceBuffer as unknown as {
      new (): SonioxUtteranceBuffer;
    })();
    const sessionState: SessionState = {
      language,
      session,
      buffer,
      chunks: [],
      waiters: [],
    };

    session.on('result', (result) => {
      buffer.addResult(result);
    });
    session.on('endpoint', () => {
      this.callbacks.onSpeechEnd?.();
      this.flushUtterance(sessionState);
    });
    session.on('finished', () => {
      this.flushUtterance(sessionState);
    });
    session.on('error', (error) => {
      this.callbacks.onError?.(
        error.message || `Soniox ${getLanguageLabel(language)} stream error.`,
      );
    });

    return sessionState;
  }

  private flushUtterance(sessionState: SessionState): void {
    const utterance = sessionState.buffer.markEndpoint();
    if (!utterance) return;

    const text = renderTranslatedUtterance(utterance).trim();
    if (!text) return;

    this.callbacks.onTranslations?.({ [sessionState.language]: text });
  }

  private async *readFrames(
    sessionState: SessionState,
  ): AsyncIterable<Uint8Array> {
    while (!this.closed || sessionState.chunks.length > 0) {
      const chunk = sessionState.chunks.shift();
      if (chunk) {
        yield chunk;
        continue;
      }

      await new Promise<void>((resolve) => {
        sessionState.waiters.push(resolve);
      });
    }
  }

  private resolveWaiters(sessionState: SessionState): void {
    for (const resolve of sessionState.waiters.splice(0)) {
      resolve();
    }
  }
}

export function getSonioxRuntimeConfig(): SonioxRuntimeConfig {
  return {
    ...(config.sonioxApiKey ? { api_key: config.sonioxApiKey } : {}),
    ...(config.sonioxRegion ? { region: config.sonioxRegion } : {}),
    ...(config.sonioxBaseDomain ? { base_domain: config.sonioxBaseDomain } : {}),
    ...(config.sonioxApiBaseUrl ? { base_url: config.sonioxApiBaseUrl } : {}),
    ...(config.sonioxWsUrl || config.sonioxTtsWsUrl
      ? {
          realtime: {
            ...(config.sonioxWsUrl ? { ws_base_url: config.sonioxWsUrl } : {}),
            ...(config.sonioxTtsWsUrl
              ? { tts_ws_url: config.sonioxTtsWsUrl }
              : {}),
          },
        }
      : {}),
    ...(config.sonioxTtsApiUrl ? { tts_api_url: config.sonioxTtsApiUrl } : {}),
  };
}

export function getPublicSonioxConfig() {
  const inputLanguages = config.sonioxInputLanguages.map((code) => ({
    code,
    label: getLanguageLabel(code),
  }));
  const outputLanguages = normalizeOutputLanguages().map((code) => ({
    code,
    label: getLanguageLabel(code),
  }));

  return {
    configured: Boolean(config.sonioxApiKey),
    defaultModel: config.sonioxSttModel,
    defaultInputMode: config.sonioxDefaultInputMode,
    defaultInputLanguage: config.sonioxDefaultInputLanguage,
    inputLanguages,
    outputLanguages,
    region: config.sonioxRegion || undefined,
    baseDomain: config.sonioxBaseDomain || undefined,
    apiBaseUrl: config.sonioxApiBaseUrl || undefined,
    wsUrl: config.sonioxWsUrl || undefined,
    ttsApiUrl: config.sonioxTtsApiUrl || undefined,
    ttsWsUrl: config.sonioxTtsWsUrl || undefined,
  };
}

export async function transcribeUrlWithSoniox({
  url,
  model = config.sonioxSttModel,
  paceMs = config.sonioxStreamPaceMs,
}: SonioxTranscribeOptions): Promise<SonioxTranscription> {
  if (!config.sonioxApiKey) {
    throw new Error('SONIOX_API_KEY is required to use Soniox transcription.');
  }

  const stream = await createAudioStreamFromUrl(url);
  const client = new (SonioxNodeClient as unknown as {
    new (options?: SonioxRuntimeConfig): SonioxClient;
  })(getSonioxRuntimeConfig());
  const session = client.realtime.stt({ model });
  const tokens: SonioxToken[] = [];

  await new Promise<void>((resolve, reject) => {
    session.on('result', (result) => {
      tokens.push(...(result.tokens ?? []));
    });
    session.on('error', reject);

    session
      .connect()
      .then(() => session.sendStream(stream, { pace_ms: paceMs, finish: true }))
      .then(resolve, reject);
  });

  return {
    text: tokens.map((token) => token.text ?? '').join('').trim(),
    tokens,
    model,
  };
}

export async function createSonioxTranslateStream(
  callbacks: TranslateStreamCallbacks,
  options?: SonioxTranslateStreamOptions,
): Promise<TranslateStream> {
  const stream = new SonioxTranslateStream(callbacks, options);
  await stream.connect();
  return stream;
}

async function createAudioStreamFromUrl(
  url: string,
): Promise<AsyncIterable<Uint8Array>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Audio request failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Audio response did not include a body.');
  }
  return response.body;
}

function getLanguageHints(inputMode: 'mixed' | 'single', inputLanguage: string): string[] {
  if (inputMode === 'single') return [inputLanguage];
  return prioritizeLanguage(config.sonioxInputLanguages, inputLanguage);
}

function normalizeInputLanguage(value: string | undefined): string {
  const language = value?.trim().toLowerCase();
  if (language && config.sonioxInputLanguages.includes(language)) {
    return language;
  }
  if (config.sonioxInputLanguages.includes(config.sonioxDefaultInputLanguage)) {
    return config.sonioxDefaultInputLanguage;
  }
  return config.sonioxInputLanguages[0] ?? 'en';
}

function normalizeOutputLanguages(
  values?: SupportedLanguage[],
): SupportedLanguage[] {
  const allowed = new Set(SUPPORTED_LANGUAGES);
  const requested = values?.length ? values : config.sonioxOutputLanguages;
  const languages = requested.filter(
    (language): language is SupportedLanguage =>
      allowed.has(language as SupportedLanguage),
  );
  return languages.length ? [...new Set(languages)] : ['en'];
}

function prioritizeLanguage(languages: readonly string[], primary: string): string[] {
  return [...new Set([primary, ...languages])];
}

function renderTranslatedUtterance(utterance: SonioxUtterance): string {
  const segments = utterance.segments ?? [];
  const translatedSegments = segments.filter((segment) =>
    (segment.tokens ?? []).some(
      (token) => token.translation_status === 'translation',
    ),
  );
  const rendered = (translatedSegments.length ? translatedSegments : segments)
    .map((segment) => segment.text ?? '')
    .join('')
    .trim();
  return rendered || utterance.text?.trim() || '';
}
