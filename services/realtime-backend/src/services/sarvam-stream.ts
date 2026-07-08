import { SarvamAI, SarvamAIClient } from 'sarvamai';
import { config } from '../config.js';

export type TranslateStreamCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onTranslation: (englishText: string) => void;
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
  ReturnType<SarvamAIClient['speechToTextStreaming']['connect']>
>;

class SarvamTranslateStream implements TranslateStream {
  private socket?: StreamingSocket;
  private ready = false;
  private closed = false;
  private readonly pending: string[] = [];

  constructor(private readonly callbacks: TranslateStreamCallbacks) {}

  async open(): Promise<void> {
    const client = new SarvamAIClient({ apiSubscriptionKey: config.sarvamApiKey });
    const connectArgs: Parameters<typeof client.speechToTextStreaming.connect>[0] & {
      mode: SarvamAI.SpeechToTextStreamingMode;
    } = {
      model: config.sarvamModel as never,
      mode: 'translate' as SarvamAI.SpeechToTextStreamingMode,
      'language-code': config.sarvamLanguageCode as SarvamAI.SpeechToTextStreamingLanguageCode,
      input_audio_codec:
        config.sarvamInputCodec as SarvamAI.SpeechToTextStreamingInputAudioCodec,
      sample_rate: String(config.sarvamSampleRate),
      high_vad_sensitivity: config.highVadSensitivity ? 'true' : 'false',
      vad_signals: config.vadSignals ? 'true' : 'false',
      flush_signal: 'true',
      'Api-Subscription-Key': config.sarvamApiKey,
    };
    const socket = await client.speechToTextStreaming.connect(connectArgs);

    this.socket = socket;

    socket.on('open', () => {
      this.ready = true;
      this.drainPending();
    });
    socket.on('message', (message) => this.handleMessage(message));
    socket.on('error', (error) => {
      this.callbacks.onError?.(error?.message ?? 'Sarvam stream error.');
    });
    socket.on('close', () => {
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
    this.socket?.flush();
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
    this.socket?.transcribe({
      audio: base64Pcm16,
      encoding: config.sarvamInputCodec,
      sample_rate: config.sarvamSampleRate,
    });
  }

  private handleMessage(
    message: SarvamAI.SpeechToTextStreamingResponse,
  ): void {
    if (message.type === 'events') {
      const signal = (message.data as SarvamAI.EventsData).signal_type;
      if (signal === 'START_SPEECH') this.callbacks.onSpeechStart?.();
      else if (signal === 'END_SPEECH') this.callbacks.onSpeechEnd?.();
      return;
    }

    if (message.type === 'data') {
      const text = (
        message.data as SarvamAI.SpeechToTextTranscriptionData
      ).transcript?.trim();
      if (text) this.callbacks.onTranslation(text);
      return;
    }

    if (message.type === 'error') {
      const errorData = message.data as SarvamAI.ErrorData;
      this.callbacks.onError?.(errorData.error ?? 'Sarvam stream error.');
    }
  }
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
