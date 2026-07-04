import { SonioxNodeClient } from '@soniox/node';
import { config } from '../config.js';

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
    stt(options: { model: string }): SonioxSession;
  };
};

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
