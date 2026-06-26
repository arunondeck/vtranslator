const DEFAULT_BACKEND_SOCKET_URL = 'http://localhost:4000';

export const BACKEND_SOCKET_URL =
  process.env.EXPO_PUBLIC_BACKEND_SOCKET_URL?.trim() || DEFAULT_BACKEND_SOCKET_URL;

// Raw PCM16 mono capture settings. 16 kHz is Sarvam's recommended streaming rate.
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_BITS_PER_SAMPLE = 16;
// ~128 ms of audio per frame (2048 samples * 2 bytes) keeps latency low while
// avoiding an excessive number of socket emits.
export const AUDIO_BUFFER_SIZE = 4096;
