import type {
  SupportedLanguage,
  TranscriptMap,
  TranscriptUpdate,
} from '@translator/shared-types';

export const SOCKET_EVENTS = {
  SPEAKER_START: 'speaker:start',
  SPEAKER_AUDIO_FRAME: 'speaker:audio-frame',
  SPEAKER_STOP: 'speaker:stop',
  SPEAKER_SESSION_CREATED: 'speaker:session-created',
  SPEAKER_ERROR: 'speaker:error',
  SPEAKER_VAD: 'speaker:vad',
  VIEWER_JOIN: 'viewer:join',
  VIEWER_SET_LANGUAGE: 'viewer:set-language',
  VIEWER_ERROR: 'viewer:error',
  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_ALL: 'transcript:all',
} as const;

export type TranslationService = 'soniox' | 'sarvam';
export type SpeakerStartPayload = {
  sessionId?: string;
  service?: TranslationService;
  /** ISO language hints for providers that can bias spoken-language detection. */
  spokenLanguageHints?: string[];
};
export type SpeakerAudioFramePayload = {
  sessionId: string;
  audio: string;
  sequence: number;
};
export type SpeakerStopPayload = { sessionId: string };
export type SpeakerSessionCreatedPayload = { sessionId: string };
export type SocketErrorPayload = { message: string; code?: string };
export type SpeakerVadPayload = { sessionId: string; speaking: boolean };
export type ViewerJoinPayload = {
  sessionId?: string;
  language: SupportedLanguage;
};
export type ViewerSetLanguagePayload = { language: SupportedLanguage };
export type TranscriptAllPayload = {
  sessionId: string;
  transcripts: TranscriptMap;
  sequence: number;
  updatedAt: string;
};

export interface ClientToServerEvents {
  'speaker:start': (payload: SpeakerStartPayload) => void;
  'speaker:audio-frame': (payload: SpeakerAudioFramePayload) => void;
  'speaker:stop': (payload: SpeakerStopPayload) => void;
  'viewer:join': (payload: ViewerJoinPayload) => void;
  'viewer:set-language': (payload: ViewerSetLanguagePayload) => void;
}

export interface ServerToClientEvents {
  'speaker:session-created': (payload: SpeakerSessionCreatedPayload) => void;
  'speaker:error': (payload: SocketErrorPayload) => void;
  'speaker:vad': (payload: SpeakerVadPayload) => void;
  'viewer:error': (payload: SocketErrorPayload) => void;
  'transcript:update': (payload: TranscriptUpdate) => void;
  'transcript:all': (payload: TranscriptAllPayload) => void;
}
