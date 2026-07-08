import { SonioxNodeClient } from '@soniox/node';
import { Buffer } from 'node:buffer';
import { config } from '../config.js';
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
  languageHints?: string[];
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

type SonioxResult = {
  tokens?: SonioxToken[];
};

type SonioxSession = {
  on(event: 'result', listener: (result: SonioxResult) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  connect(): Promise<void>;
  sendStream(
    stream: AsyncIterable<Uint8Array>,
    options: { pace_ms: number; finish: true },
  ): Promise<void>;
};

type SonioxClient = {
  realtime: {
    stt(options: SonioxSttSessionConfig): SonioxSession;
  };
};

type SonioxSttSessionConfig = {
  model: string;
  audio_format: 'pcm_s16le';
  sample_rate: number;
  num_channels: 1;
  language_hints?: string[];
  enable_language_identification: true;
};

class SonioxTranslateStream implements TranslateStream {
  private readonly chunks: Uint8Array[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;
  private session?: SonioxSession;

  constructor(
    private readonly callbacks: TranslateStreamCallbacks,
    private readonly languageHints: string[] = config.defaultSpokenLanguageHints,
  ) {}

  async connect(): Promise<void> {
    if (!config.sonioxApiKey) {
      throw new Error('SONIOX_API_KEY is required to use Soniox transcription.');
    }

    const client = new (SonioxNodeClient as unknown as {
      new (options?: SonioxRuntimeConfig): SonioxClient;
    })(getSonioxRuntimeConfig());
    this.session = client.realtime.stt(
      buildSonioxSttConfig(config.sonioxSttModel, this.languageHints),
    );
    this.session.on('result', (result) => {
      const text = (result.tokens ?? [])
        .map((token) => token.text ?? '')
        .join('')
        .trim();
      if (text) {
        this.callbacks.onTranslation(text);
      }
    });
    this.session.on('error', (error) => {
      this.callbacks.onError?.(error.message || 'Soniox stream error.');
    });

    await this.session.connect();
    void this.session
      .sendStream(this.readFrames(), {
        pace_ms: config.sonioxStreamPaceMs,
        finish: true,
      })
      .catch((error: unknown) => {
        this.callbacks.onError?.(
          error instanceof Error ? error.message : 'Soniox stream error.',
        );
      });
  }

  sendFrame(frameBase64: string): void {
    if (this.closed) return;
    this.callbacks.onSpeechStart?.();
    this.chunks.push(Buffer.from(frameBase64, 'base64'));
    this.resolveWaiters();
  }

  flush(): void {
    this.callbacks.onSpeechEnd?.();
  }

  close(): void {
    this.closed = true;
    this.resolveWaiters();
  }

  private async *readFrames(): AsyncIterable<Uint8Array> {
    while (!this.closed || this.chunks.length > 0) {
      const chunk = this.chunks.shift();
      if (chunk) {
        yield chunk;
        continue;
      }

      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }

  private resolveWaiters(): void {
    for (const resolve of this.waiters.splice(0)) {
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
  return {
    configured: Boolean(config.sonioxApiKey),
    defaultModel: config.sonioxSttModel,
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
  languageHints = config.defaultSpokenLanguageHints,
}: SonioxTranscribeOptions): Promise<SonioxTranscription> {
  if (!config.sonioxApiKey) {
    throw new Error('SONIOX_API_KEY is required to use Soniox transcription.');
  }

  const stream = await createAudioStreamFromUrl(url);
  const client = new (SonioxNodeClient as unknown as {
    new (options?: SonioxRuntimeConfig): SonioxClient;
  })(getSonioxRuntimeConfig());
  const session = client.realtime.stt(buildSonioxSttConfig(model, languageHints));
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
  languageHints = config.defaultSpokenLanguageHints,
): Promise<TranslateStream> {
  const stream = new SonioxTranslateStream(callbacks, languageHints);
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

function buildSonioxSttConfig(
  model: string,
  languageHints: string[],
): SonioxSttSessionConfig {
  return {
    model,
    audio_format: 'pcm_s16le',
    sample_rate: config.sarvamSampleRate,
    num_channels: 1,
    ...(languageHints.length > 0 ? { language_hints: languageHints } : {}),
    enable_language_identification: true,
  };
}
