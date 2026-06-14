import type {
  SupportedLanguage,
  TranscriptMap,
  TranscriptUpdate,
} from '@translator/shared-types';

export const SOCKET_EVENTS = {
  SPEAKER_START: 'speaker:start',
  SPEAKER_AUDIO_CHUNK: 'speaker:audio-chunk',
  SPEAKER_STOP: 'speaker:stop',
  SPEAKER_SESSION_CREATED: 'speaker:session-created',
  SPEAKER_ERROR: 'speaker:error',
  VIEWER_JOIN: 'viewer:join',
  VIEWER_SET_LANGUAGE: 'viewer:set-language',
  VIEWER_ERROR: 'viewer:error',
  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_ALL: 'transcript:all',
} as const;

export type SpeakerStartPayload = { sessionId?: string };
export type SpeakerAudioChunkPayload = {
  sessionId: string;
  chunk: string;
  mimeType: string;
  sequence: number;
};
export type SpeakerStopPayload = { sessionId: string };
export type SpeakerSessionCreatedPayload = { sessionId: string };
export type SocketErrorPayload = { message: string; code?: string };
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
  'speaker:audio-chunk': (payload: SpeakerAudioChunkPayload) => void;
  'speaker:stop': (payload: SpeakerStopPayload) => void;
  'viewer:join': (payload: ViewerJoinPayload) => void;
  'viewer:set-language': (payload: ViewerSetLanguagePayload) => void;
}

export interface ServerToClientEvents {
  'speaker:session-created': (payload: SpeakerSessionCreatedPayload) => void;
  'speaker:error': (payload: SocketErrorPayload) => void;
  'viewer:error': (payload: SocketErrorPayload) => void;
  'transcript:update': (payload: TranscriptUpdate) => void;
  'transcript:all': (payload: TranscriptAllPayload) => void;
}
