import { SarvamAI, SarvamAIClient } from 'sarvamai';
import type { SupportedLanguage } from '@translator/shared-types';
import { config } from '../config.js';

export type TranslateStreamCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onTranslation: (englishText: string) => void;
  onTranslations?: (translations: Partial<Record<SupportedLanguage, string>>) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export interface TranslateStream {
  /** Push one base64-encoded raw PCM16 frame to Sarvam. */
  sendFrame(base64Pcm16: string): void;
  /** Force-finalize the current utterance (used on speaker stop). */
  flush(): void;
  /** Close the upstream connection and release resources. */
  close(): void;
}

// Cap how many frames we buffer before the socket reports "open" so a slow
// handshake cannot grow memory without bound.
const MAX_PENDING_FRAMES = 50;

type StreamingSocket = Awaited<
  ReturnType<SarvamAIClient['speechToTextTranslateStreaming']['connect']>
>;

class SarvamTranslateStream implements TranslateStream {
  private socket?: StreamingSocket;
  private ready = false;
  private closed = false;
  private readonly pending: string[] = [];

  constructor(private readonly callbacks: TranslateStreamCallbacks) {}

  async open(): Promise<void> {
    console.info('[sarvam-stream] opening stream', {
      model: config.sarvamModel,
      inputCodec: config.sarvamInputCodec,
      sampleRate: config.sarvamSampleRate,
      highVadSensitivity: config.highVadSensitivity,
      vadSignals: config.vadSignals,
      hasApiKey: Boolean(config.sarvamApiKey),
    });

    const client = new SarvamAIClient({ apiSubscriptionKey: config.sarvamApiKey });
    const socket = await client.speechToTextTranslateStreaming.connect({
      model: config.sarvamModel as SarvamAI.SpeechToTextTranslateModel,
      input_audio_codec:
        config.sarvamInputCodec as SarvamAI.SpeechToTextTranslateStreamingInputAudioCodec,
      sample_rate: String(config.sarvamSampleRate),
      high_vad_sensitivity: config.highVadSensitivity ? 'true' : 'false',
      vad_signals: config.vadSignals ? 'true' : 'false',
      flush_signal: 'true',
      'Api-Subscription-Key': config.sarvamApiKey,
    });

    this.socket = socket;

    socket.on('open', () => {
      console.info('[sarvam-stream] socket open');
      this.ready = true;
      this.drainPending();
    });
    socket.on('message', (message) => this.handleMessage(message));
    socket.on('error', (error) => {
      console.error('[sarvam-stream] socket error', serializeError(error));
      this.callbacks.onError?.(
        `Sarvam stream error: ${error?.message ?? 'Unknown socket error.'}`,
      );
    });
    socket.on('close', (...args: unknown[]) => {
      console.warn('[sarvam-stream] socket close', { args });
      this.ready = false;
      if (!this.closed) {
        this.callbacks.onClose?.();
      }
    });
  }

  sendFrame(base64Pcm16: string): void {
    if (this.closed || !base64Pcm16) return;
    if (!this.ready || !this.socket) {
      this.pending.push(base64Pcm16);
      if (this.pending.length > MAX_PENDING_FRAMES) {
        this.pending.shift();
      }
      return;
    }
    this.transmit(base64Pcm16);
  }

  flush(): void {
    if (this.closed) return;
    this.drainPending();
    try {
      this.socket?.flush();
    } catch (error) {
      this.handleSocketSendFailure(error);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pending.length = 0;
    try {
      this.socket?.close();
    } catch {
      // ignore close failures; the socket is being discarded anyway
    }
  }

  private drainPending(): void {
    if (!this.ready || !this.socket) return;
    while (this.pending.length > 0) {
      const frame = this.pending.shift();
      if (frame) this.transmit(frame);
    }
  }

  private transmit(base64Pcm16: string): void {
    try {
      this.socket?.translate({
        audio: base64Pcm16,
        sample_rate: config.sarvamSampleRate,
      });
    } catch (error) {
      this.handleSocketSendFailure(error);
    }
  }

  private handleSocketSendFailure(error: unknown): void {
    console.error('[sarvam-stream] socket send failed', {
      ...serializeError(error),
      ready: this.ready,
      closed: this.closed,
      pendingFrames: this.pending.length,
    });
    this.ready = false;
    this.pending.length = 0;
    this.callbacks.onError?.(
      `Sarvam stream send failed: ${
        error instanceof Error ? error.message : 'Stream is not available.'
      }`,
    );
  }

  private handleMessage(
    message: SarvamAI.SpeechToTextTranslateStreamingResponse,
  ): void {
    if (message.type === 'events') {
      const signal = (message.data as SarvamAI.EventsData).signal_type;
      if (signal === 'START_SPEECH') this.callbacks.onSpeechStart?.();
      else if (signal === 'END_SPEECH') this.callbacks.onSpeechEnd?.();
      return;
    }

    if (message.type === 'data') {
      const text = (
        message.data as SarvamAI.SpeechToTextTranslateTranscriptionData
      ).transcript?.trim();
      if (text) this.callbacks.onTranslation(text);
      return;
    }

    if (message.type === 'error') {
      const errorData = message.data as SarvamAI.ErrorData;
      console.error('[sarvam-stream] message error', errorData);
      this.callbacks.onError?.(
        `Sarvam stream message error: ${errorData.error ?? 'Unknown stream error.'}`,
      );
    }
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error };
}

/**
 * Deterministic stand-in used when no Sarvam API key is configured. It emits a
 * finalized utterance shortly after audio frames start arriving, exercising the
 * same append/translate path as the real stream.
 */
class MockTranslateStream implements TranslateStream {
  private timer?: ReturnType<typeof setInterval>;
  private sequence = 0;
  private hasAudioSinceLastEmit = false;
  private closed = false;

  constructor(private readonly callbacks: TranslateStreamCallbacks) {}

  start(): void {
    this.timer = setInterval(() => this.emitIfSpeaking(), 2_500);
  }

  sendFrame(base64Pcm16: string): void {
    if (this.closed || !base64Pcm16) return;
    this.hasAudioSinceLastEmit = true;
  }

  flush(): void {
    this.emitIfSpeaking();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.callbacks.onClose?.();
  }

  private emitIfSpeaking(): void {
    if (this.closed || !this.hasAudioSinceLastEmit) return;
    this.hasAudioSinceLastEmit = false;
    this.sequence += 1;
    this.callbacks.onSpeechStart?.();
    this.callbacks.onTranslation(`This is mock utterance number ${this.sequence}.`);
    this.callbacks.onSpeechEnd?.();
  }
}

export async function createTranslateStream(
  callbacks: TranslateStreamCallbacks,
): Promise<TranslateStream> {
  if (config.useMockTranscription) {
    const mock = new MockTranslateStream(callbacks);
    mock.start();
    return mock;
  }

  const stream = new SarvamTranslateStream(callbacks);
  await stream.open();
  return stream;
}

