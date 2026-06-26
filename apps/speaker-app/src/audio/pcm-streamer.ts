import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from 'react-native-live-audio-stream';

import {
  AUDIO_BITS_PER_SAMPLE,
  AUDIO_BUFFER_SIZE,
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
} from '../config';

export type AudioFrame = {
  audio: string;
  sequence: number;
};

type AudioFrameHandler = (frame: AudioFrame) => void;

/**
 * Streams continuous 16 kHz mono PCM16 frames from the microphone. Unlike the
 * previous file-based segmenter, audio flows without gaps so Sarvam's VAD can
 * decide utterance boundaries.
 */
export class PcmStreamer {
  private active = false;
  private listenerAttached = false;
  private sequence = 0;
  private onFrame?: AudioFrameHandler;

  get isActive(): boolean {
    return this.active;
  }

  static async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      // iOS prompts on first capture via NSMicrophoneUsageDescription.
      return true;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'Translator Speaker needs the microphone to transcribe speech.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  start(onFrame: AudioFrameHandler): void {
    if (this.active) return;

    this.onFrame = onFrame;
    this.sequence = 0;
    this.active = true;

    AudioRecord.init({
      sampleRate: AUDIO_SAMPLE_RATE,
      channels: AUDIO_CHANNELS,
      bitsPerSample: AUDIO_BITS_PER_SAMPLE,
      bufferSize: AUDIO_BUFFER_SIZE,
      // Required by the native module; we consume the live `data` stream and
      // never read this throwaway file.
      wavFile: 'translator-speaker.wav',
    });

    if (!this.listenerAttached) {
      AudioRecord.on('data', (audio: string) => this.handleData(audio));
      this.listenerAttached = true;
    }

    AudioRecord.start();
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.onFrame = undefined;
    try {
      await AudioRecord.stop();
    } catch {
      // ignore stop failures; recording is already considered inactive
    }
  }

  private handleData(audio: string): void {
    if (!this.active || !audio || !this.onFrame) return;
    this.sequence += 1;
    this.onFrame({ audio, sequence: this.sequence });
  }
}
