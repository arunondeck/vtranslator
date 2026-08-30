import { Buffer } from 'node:buffer';
import type { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SpeakerAudioFramePayload,
  type SocketErrorPayload,
  type TranslationService,
} from '@translator/shared-socket-contracts';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@translator/shared-types';
import {
  sessionStore,
  type ActiveSession,
  type StoredSession,
} from './sessions/session-store.js';
import {
  createTranslateStream,
  type TranslateStreamCallbacks,
} from './services/sarvam-stream.js';
import { translateToTargets } from './services/sarvam.service.js';
import { createSonioxTranslateStream } from './services/soniox.service.js';

export type SocketData = {
  viewerSessionId?: string;
  viewerLanguage?: SupportedLanguage;
  speakerService?: TranslationService;
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

const TARGET_LANGUAGES: SupportedLanguage[] = ['ml', 'hi', 'bn'];
// Grace period after an explicit stop so Sarvam can return the final flushed
// utterance before we tear the upstream connection down.
const STOP_GRACE_MS = 1_200;

export function registerSocketHandlers(io: RealtimeServer): void {
  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.SPEAKER_START, (payload) => {
      void startSpeakerSession(io, socket, payload?.sessionId, payload?.service);
    });

    socket.on(SOCKET_EVENTS.SPEAKER_AUDIO_FRAME, (payload) => {
      const validationError = validateAudioFrame(payload);
      if (validationError) {
        emitSpeakerError(socket, validationError, 'INVALID_FRAME');
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

      if (!session.stream) {
        emitSpeakerError(
          socket,
          'Transcription stream is not ready yet.',
          'STREAM_NOT_READY',
        );
        return;
      }

      session.stream.sendFrame(payload.audio);
    });

    socket.on(SOCKET_EVENTS.SPEAKER_STOP, (payload) => {
      const session = payload?.sessionId
        ? sessionStore.getActive(payload.sessionId)
        : undefined;

      if (!session || session.speakerSocketId !== socket.id) {
        emitSpeakerError(
          socket,
          'Active session not found for this speaker.',
          'SESSION_NOT_FOUND',
        );
        return;
      }

      try {
        session.stream?.flush();
      } catch {
        // ignore flush failures
      }
      setTimeout(() => {
        sessionStore.stop(session.sessionId, socket.id);
      }, STOP_GRACE_MS);
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

    socket.on('disconnect', () => {
      sessionStore.endBySpeaker(socket.id);
    });
  });
}

async function startSpeakerSession(
  io: RealtimeServer,
  socket: RealtimeSocket,
  requestedSessionId: string | undefined,
  requestedService: TranslationService | undefined,
): Promise<void> {
  const session = sessionStore.create(socket.id, requestedSessionId);
  await socket.join(roomFor(session.sessionId));
  const service = readTranslationService(requestedService);
  socket.data.speakerService = service;

  console.info('[socket] starting speaker session', {
    sessionId: session.sessionId,
    service,
    socketId: socket.id,
  });

  try {
    const callbacks = buildStreamCallbacks(io, socket, session);
    const stream =
      service === 'soniox'
        ? await createSonioxTranslateStream(callbacks)
        : await createTranslateStream(callbacks);
    sessionStore.attachStream(session, stream);
  } catch (error) {
    logSocketError('stream init failed', error, {
      sessionId: session.sessionId,
      service,
      socketId: socket.id,
    });
    sessionStore.endSession(session);
    emitSpeakerError(
      socket,
      error instanceof Error ? error.message : 'Failed to start transcription.',
      'STREAM_INIT_FAILED',
      session.sessionId,
      service,
    );
    return;
  }

  socket.emit(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, {
    sessionId: session.sessionId,
  });
}

function readTranslationService(
  value: TranslationService | undefined,
): TranslationService {
  return value === 'sarvam' ? 'sarvam' : 'soniox';
}

function buildStreamCallbacks(
  io: RealtimeServer,
  socket: RealtimeSocket,
  session: StoredSession,
): TranslateStreamCallbacks {
  const room = roomFor(session.sessionId);
  return {
    onSpeechStart: () => {
      io.to(room).emit(SOCKET_EVENTS.SPEAKER_VAD, {
        sessionId: session.sessionId,
        speaking: true,
      });
    },
    onSpeechEnd: () => {
      io.to(room).emit(SOCKET_EVENTS.SPEAKER_VAD, {
        sessionId: session.sessionId,
        speaking: false,
      });
    },
    onTranslation: (english) => {
      void handleFinalUtterance(io, session, english).catch((error: unknown) => {
        logSocketError('translation failed', error, {
          sessionId: session.sessionId,
          service: socket.data.speakerService,
          socketId: socket.id,
        });
        emitSpeakerError(
          socket,
          error instanceof Error ? error.message : 'Translation failed.',
          'TRANSLATION_FAILED',
          session.sessionId,
          socket.data.speakerService,
        );
      });
    },
    onError: (message) => {
      logSocketError('stream error', message, {
        sessionId: session.sessionId,
        service: socket.data.speakerService,
        socketId: socket.id,
      });
      emitSpeakerError(
        socket,
        message,
        'STREAM_ERROR',
        session.sessionId,
        socket.data.speakerService,
      );
    },
  };
}

async function handleFinalUtterance(
  io: RealtimeServer,
  session: StoredSession,
  english: string,
): Promise<void> {
  if (session.endedAt) return;

  session.latestSequence += 1;
  const room = roomFor(session.sessionId);

  const englishText = sessionStore.appendUtterance(session, 'en', english);
  emitLanguageUpdate(io, session, 'en', englishText, new Date().toISOString());

  const translations = await translateToTargets(english);
  if (session.endedAt) return;

  const updatedAt = new Date().toISOString();
  for (const language of TARGET_LANGUAGES) {
    const text = sessionStore.appendUtterance(
      session,
      language,
      translations[language as 'ml' | 'hi' | 'bn'],
    );
    emitLanguageUpdate(io, session, language, text, updatedAt);
  }

  io.to(room).emit(SOCKET_EVENTS.TRANSCRIPT_ALL, {
    sessionId: session.sessionId,
    transcripts: { ...session.transcripts },
    sequence: session.latestSequence,
    updatedAt,
  });
}

function emitLanguageUpdate(
  io: RealtimeServer,
  session: ActiveSession,
  language: SupportedLanguage,
  text: string,
  updatedAt: string,
): void {
  io.to(roomFor(session.sessionId)).emit(SOCKET_EVENTS.TRANSCRIPT_UPDATE, {
    sessionId: session.sessionId,
    language,
    text,
    isFinal: true,
    sequence: session.latestSequence,
    updatedAt,
  });
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

function validateAudioFrame(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return 'Missing audio payload.';
  const candidate = payload as Partial<SpeakerAudioFramePayload>;
  if (
    typeof candidate.sessionId !== 'string' ||
    typeof candidate.audio !== 'string'
  ) {
    return 'Audio fields must be strings.';
  }
  if (!candidate.sessionId.trim() || !candidate.audio.trim()) {
    return 'Missing audio fields.';
  }
  if (!Number.isInteger(candidate.sequence) || Number(candidate.sequence) < 1) {
    return 'Sequence must be a positive integer.';
  }
  if (!isValidBase64(candidate.audio)) return 'Audio must be valid base64.';
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
  sessionId?: string,
  service?: TranslationService,
): void {
  const payload: SocketErrorPayload = {
    message,
    ...(code ? { code } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(service ? { service } : {}),
  };
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

function logSocketError(
  label: string,
  error: unknown,
  context: Record<string, unknown>,
): void {
  const serialized =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { error };
  console.error(`[socket] ${label}`, { ...context, ...serialized });
}
