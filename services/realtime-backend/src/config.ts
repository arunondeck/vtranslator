function readPort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const config = {
  port: readPort(process.env.PORT),
  host: process.env.HOST?.trim() || '0.0.0.0',
  corsOrigin: readCorsOrigin(process.env.CORS_ORIGIN),
  maxAudioChunkBytes: 10 * 1024 * 1024,
  sarvamApiKey: process.env.SARVAM_API_KEY?.trim() ?? '',
  sarvamApiBaseUrl: process.env.SARVAM_API_BASE_URL?.trim() || 'https://api.sarvam.ai',
  useMockTranscription:
    process.env.USE_MOCK_TRANSCRIPTION?.toLowerCase() === 'true' ||
    !process.env.SARVAM_API_KEY?.trim(),
  // Streaming speech-to-text-translate (Sarvam saaras:v3) settings.
  sarvamModel: process.env.SARVAM_STREAM_MODEL?.trim() || 'saaras:v3',
  sarvamInputCodec: process.env.SARVAM_INPUT_CODEC?.trim() || 'pcm_s16le',
  sarvamSampleRate: readInt(process.env.SARVAM_SAMPLE_RATE, 16_000),
  highVadSensitivity: readBool(process.env.SARVAM_HIGH_VAD_SENSITIVITY, true),
  vadSignals: readBool(process.env.SARVAM_VAD_SIGNALS, true),
  // Rolling window of accumulated transcript text kept per language.
  transcriptWindowChars: readInt(process.env.TRANSCRIPT_WINDOW_CHARS, 800),
} as const;

function readCorsOrigin(value: string | undefined): string | string[] {
  const raw = value?.trim();
  if (!raw || raw === '*') {
    return '*';
  }

  return raw.split(',').map((entry) => normalizeOrigin(entry.trim()));
}

function normalizeOrigin(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}
