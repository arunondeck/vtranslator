function readPort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

export const config = {
  port: readPort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  maxAudioChunkBytes: 10 * 1024 * 1024,
  sarvamApiKey: process.env.SARVAM_API_KEY?.trim() ?? '',
  sarvamApiBaseUrl: process.env.SARVAM_API_BASE_URL?.trim() || 'https://api.sarvam.ai',
  useMockTranscription:
    process.env.USE_MOCK_TRANSCRIPTION?.toLowerCase() === 'true' ||
    !process.env.SARVAM_API_KEY?.trim(),
} as const;
