import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import { AUDIO_SEGMENT_DURATION_MS } from '../config';

export type AudioChunk = {
  chunk: string;
  mimeType: string;
  sequence: number;
};

type AudioChunkHandler = (chunk: AudioChunk) => void | Promise<void>;
type RecordingErrorHandler = (message: string) => void;

export class SegmentedAudioRecorder {
  private active = false;
  private recording?: Audio.Recording;
  private segmentTimer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private operation = Promise.resolve();

  constructor(
    private readonly onChunk: AudioChunkHandler,
    private readonly onError: RecordingErrorHandler,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  static async requestPermission(): Promise<boolean> {
    const permission = await Audio.requestPermissionsAsync();
    return permission.granted;
  }

  async start(): Promise<void> {
    if (this.active) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    this.active = true;
    this.sequence = 0;

    try {
      await this.startSegment();
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.active = false;
    this.clearSegmentTimer();
    await this.queueSegmentFinish(false);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  private async startSegment(): Promise<void> {
    if (!this.active) return;

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );

    if (!this.active) {
      await recording.stopAndUnloadAsync();
      await this.deleteRecordingFile(recording.getURI());
      return;
    }

    this.recording = recording;
    this.segmentTimer = setTimeout(() => {
      void this.queueSegmentFinish(true).catch((error: unknown) => {
        this.onError(error instanceof Error ? error.message : 'Recording failed.');
      });
    }, AUDIO_SEGMENT_DURATION_MS);
  }

  private queueSegmentFinish(continueRecording: boolean): Promise<void> {
    this.operation = this.operation.then(() => this.finishSegment(continueRecording));
    return this.operation;
  }

  private async finishSegment(continueRecording: boolean): Promise<void> {
    this.clearSegmentTimer();
    const recording = this.recording;
    this.recording = undefined;

    if (!recording) return;

    let uri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();

      if (uri) {
        const chunk = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (chunk) {
          this.sequence += 1;
          await this.onChunk({
            chunk,
            mimeType: 'audio/mp4',
            sequence: this.sequence,
          });
        }
      }
    } catch (error) {
      this.active = false;
      throw error;
    } finally {
      await this.deleteRecordingFile(uri);
    }

    if (continueRecording && this.active) {
      await this.startSegment();
    }
  }

  private clearSegmentTimer(): void {
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = undefined;
    }
  }

  private async deleteRecordingFile(uri: string | null): Promise<void> {
    if (!uri) return;

    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
