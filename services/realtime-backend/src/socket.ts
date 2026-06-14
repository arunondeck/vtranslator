import { Buffer } from 'node:buffer';
import type { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SpeakerAudioChunkPayload,
  type SocketErrorPayload,
} from '@translator/shared-socket-contracts';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@translator/shared-types';
import {
  sessionStore,
  type ActiveSession,
} from './sessions/session-store.js';
import { processAudioChunk } from './services/sarvam.service.js';

export type SocketData = {
  viewerSessionId?: string;
  viewerLanguage?: SupportedLanguage;
};

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  SocketData
>;
type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  SocketData
>;

export function registerSocketHandlers(io: RealtimeServer): void {
  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.SPEAKER_START, (payload) => {
      const session = sessionStore.create(socket.id, payload?.sessionId);
      void socket.join(roomFor(session.sessionId));
      socket.emit(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, {
        sessionId: session.sessionId,
      });
    });

    socket.on(SOCKET_EVENTS.SPEAKER_AUDIO_CHUNK, (payload) => {
      const validationError = validateAudioChunk(payload);
      if (validationError) {
        emitSpeakerError(socket, validationError, 'INVALID_CHUNK');
        return;
      }

      const session = sessionStore.getActive(payload.sessionId);
      if (!session || session.speakerSocketId !== socket.id) {
        emitSpeakerError(
          socket,
          'Active session not found for this speaker.',
          'SESSION_NOT_FOUND',
        );
        return;
      }

      sessionStore.enqueue(session, async () => {
        try {
          await handleAudioChunk(io, session, payload);
        } catch (error) {
          console.error('Audio processing failed', error);
          emitSpeakerError(
            socket,
            error instanceof Error ? error.message : 'Audio processing failed.',
            'PROCESSING_FAILED',
          );
        }
      });
    });

    socket.on(SOCKET_EVENTS.SPEAKER_STOP, (payload) => {
      if (!payload?.sessionId || !sessionStore.stop(payload.sessionId, socket.id)) {
        emitSpeakerError(
          socket,
          'Active session not found for this speaker.',
          'SESSION_NOT_FOUND',
        );
      }
    });

    socket.on(SOCKET_EVENTS.VIEWER_JOIN, (payload) => {
      if (!payload || !isSupportedLanguage(payload.language)) {
        emitViewerError(socket, 'Unsupported language.', 'INVALID_LANGUAGE');
        return;
      }

      const session = payload.sessionId
        ? sessionStore.getActive(payload.sessionId)
        : sessionStore.getLatestActive();
      if (!session) {
        emitViewerError(
          socket,
          'No active session is available. Start the speaker first.',
          'SESSION_NOT_FOUND',
        );
        return;
      }

      joinViewer(socket, session, payload.language);
    });

    socket.on(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, (payload) => {
      if (!payload || !isSupportedLanguage(payload.language)) {
        emitViewerError(socket, 'Unsupported language.', 'INVALID_LANGUAGE');
        return;
      }

      const session = socket.data.viewerSessionId
        ? sessionStore.getActive(socket.data.viewerSessionId)
        : undefined;
      if (!session) {
        emitViewerError(
          socket,
          'Join an active session before changing language.',
          'INVALID_VIEWER_STATE',
        );
        return;
      }

      socket.data.viewerLanguage = payload.language;
      socket.emit(SOCKET_EVENTS.TRANSCRIPT_UPDATE, {
        sessionId: session.sessionId,
        language: payload.language,
        text: session.transcripts[payload.language],
        isFinal: false,
        sequence: session.latestSequence,
        updatedAt: new Date().toISOString(),
      });
    });
  });
}

async function handleAudioChunk(
  io: RealtimeServer,
  session: ActiveSession,
  payload: SpeakerAudioChunkPayload,
): Promise<void> {
  const result = await processAudioChunk(payload);
  session.transcripts = {
    en: result.en,
    ml: result.ml,
    hi: result.hi,
    bn: result.bn,
  };
  session.latestSequence = payload.sequence;
  const updatedAt = new Date().toISOString();
  const room = roomFor(session.sessionId);

  io.to(room).emit(SOCKET_EVENTS.TRANSCRIPT_ALL, {
    sessionId: session.sessionId,
    transcripts: { ...session.transcripts },
    sequence: session.latestSequence,
    updatedAt,
  });

  for (const language of SUPPORTED_LANGUAGES) {
    io.to(room).emit(SOCKET_EVENTS.TRANSCRIPT_UPDATE, {
      sessionId: session.sessionId,
      language,
      text: session.transcripts[language],
      isFinal: result.isFinal,
      sequence: session.latestSequence,
      updatedAt,
    });
  }
}

function joinViewer(
  socket: RealtimeSocket,
  session: ActiveSession,
  language: SupportedLanguage,
): void {
  if (socket.data.viewerSessionId) {
    void socket.leave(roomFor(socket.data.viewerSessionId));
  }
  void socket.join(roomFor(session.sessionId));
  socket.data.viewerSessionId = session.sessionId;
  socket.data.viewerLanguage = language;
  socket.emit(SOCKET_EVENTS.TRANSCRIPT_ALL, {
    sessionId: session.sessionId,
    transcripts: { ...session.transcripts },
    sequence: session.latestSequence,
    updatedAt: new Date().toISOString(),
  });
}

function validateAudioChunk(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return 'Missing audio payload.';
  const candidate = payload as Partial<SpeakerAudioChunkPayload>;
  if (
    typeof candidate.sessionId !== 'string' ||
    typeof candidate.chunk !== 'string' ||
    typeof candidate.mimeType !== 'string'
  ) {
    return 'Audio fields must be strings.';
  }
  if (
    !candidate.sessionId.trim() ||
    !candidate.chunk.trim() ||
    !candidate.mimeType.trim()
  ) {
    return 'Missing audio fields.';
  }
  if (!Number.isInteger(candidate.sequence) || Number(candidate.sequence) < 1) {
    return 'Sequence must be a positive integer.';
  }
  if (!isValidBase64(candidate.chunk)) return 'Chunk must be valid base64.';
  return undefined;
}

function isValidBase64(value: string): boolean {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').toString('base64') === value;
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === 'string' &&
    SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
  );
}

function emitSpeakerError(
  socket: RealtimeSocket,
  message: string,
  code?: string,
): void {
  const payload: SocketErrorPayload = { message, ...(code ? { code } : {}) };
  socket.emit(SOCKET_EVENTS.SPEAKER_ERROR, payload);
}

function emitViewerError(
  socket: RealtimeSocket,
  message: string,
  code?: string,
): void {
  const payload: SocketErrorPayload = { message, ...(code ? { code } : {}) };
  socket.emit(SOCKET_EVENTS.VIEWER_ERROR, payload);
}

function roomFor(sessionId: string): string {
  return `session:${sessionId}`;
}
