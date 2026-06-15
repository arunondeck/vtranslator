import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SpeakerAudioChunkPayload,
} from '@translator/shared-socket-contracts';
import {
  EMPTY_TRANSCRIPTS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type TranscriptMap,
} from '@translator/shared-types';
import { createProvider } from './providers.js';

type Session = {
  id: string;
  active: boolean;
  transcripts: TranscriptMap;
  sequence: number;
  updatedAt: string;
  processing: Promise<void>;
};

type SocketData = {
  viewerSessionId?: string;
  viewerLanguage?: SupportedLanguage;
};

const app = express();
const server = createServer(app);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(server, {
  cors: { origin: corsOrigin },
  maxHttpBufferSize: 10 * 1024 * 1024,
});
const sessions = new Map<string, Session>();
const provider = createProvider();

app.use(cors({ origin: corsOrigin }));
app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'realtime-backend' });
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on(SOCKET_EVENTS.SPEAKER_START, (payload) => {
    if (!isSpeakerStartPayload(payload)) {
      emitSpeakerError(socket, 'Invalid speaker start payload.', 'INVALID_START');
      return;
    }
    const { sessionId } = payload;
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    const session = existing ?? createSession();
    session.active = true;
    socket.join(roomFor(session.id));
    console.log('speaker connected', socket.id);
    console.log('session created', session.id);
    socket.emit(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, { sessionId: session.id });
  });

  socket.on(SOCKET_EVENTS.SPEAKER_AUDIO_CHUNK, (payload) => {
    if (!isSpeakerAudioChunkPayload(payload)) {
      emitSpeakerError(socket, 'Invalid audio chunk payload.', 'INVALID_CHUNK');
      return;
    }
    const error = validateChunk(payload);
    if (error) {
      emitSpeakerError(socket, error, 'INVALID_CHUNK');
      return;
    }
    const session = sessions.get(payload.sessionId);
    if (!session?.active) {
      socket.emit(SOCKET_EVENTS.SPEAKER_ERROR, {
        message: 'The session is not active.',
        code: 'SESSION_NOT_FOUND',
      });
      return;
    }
    console.log('audio chunk received', session.id, payload.sequence);
    session.processing = session.processing
      .then(() => processChunk(session, payload))
      .catch((cause: unknown) => {
        console.error('Audio processing failed', cause);
        socket.emit(SOCKET_EVENTS.SPEAKER_ERROR, {
          message: cause instanceof Error ? cause.message : 'Audio processing failed.',
          code: 'PROCESSING_FAILED',
        });
      });
  });

  socket.on(SOCKET_EVENTS.SPEAKER_STOP, (payload) => {
    if (!isSpeakerStopPayload(payload)) {
      emitSpeakerError(socket, 'Invalid speaker stop payload.', 'INVALID_STOP');
      return;
    }
    const { sessionId } = payload;
    const session = sessions.get(sessionId);
    if (session) session.active = false;
  });

  socket.on(SOCKET_EVENTS.VIEWER_JOIN, (payload) => {
    if (!isViewerJoinPayload(payload)) {
      emitViewerError(socket, 'Invalid viewer join payload.', 'INVALID_JOIN');
      return;
    }
    const { sessionId, language } = payload;
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      socket.emit(SOCKET_EVENTS.VIEWER_ERROR, {
        message: 'Unsupported language.',
        code: 'INVALID_LANGUAGE',
      });
      return;
    }
    const session = sessionId ? sessions.get(sessionId) : latestSession();
    if (!session) {
      socket.emit(SOCKET_EVENTS.VIEWER_ERROR, {
        message: 'No session is available yet. Start the speaker first.',
        code: 'SESSION_NOT_FOUND',
      });
      return;
    }
    joinViewer(socket, session, language);
  });

  socket.on(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, (payload) => {
    if (!isViewerSetLanguagePayload(payload)) {
      emitViewerError(socket, 'Invalid language payload.', 'INVALID_LANGUAGE');
      return;
    }
    const { language } = payload;
    const session = socket.data.viewerSessionId
      ? sessions.get(socket.data.viewerSessionId)
      : undefined;
    if (!session || !SUPPORTED_LANGUAGES.includes(language)) {
      socket.emit(SOCKET_EVENTS.VIEWER_ERROR, {
        message: 'Join a valid session before changing language.',
        code: 'INVALID_VIEWER_STATE',
      });
      return;
    }
    socket.data.viewerLanguage = language;
    socket.emit(SOCKET_EVENTS.TRANSCRIPT_UPDATE, {
      sessionId: session.id,
      language,
      text: session.transcripts[language],
      isFinal: !session.active,
      sequence: session.sequence,
      updatedAt: session.updatedAt,
    });
  });
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`Realtime backend listening on http://localhost:${port}`));

function createSession(): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id: `session_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    active: true,
    transcripts: { ...EMPTY_TRANSCRIPTS },
    sequence: 0,
    updatedAt: now,
    processing: Promise.resolve(),
  };
  sessions.set(session.id, session);
  return session;
}

async function processChunk(session: Session, payload: SpeakerAudioChunkPayload): Promise<void> {
  const segment = await provider.processAudio(
    Buffer.from(payload.chunk, 'base64'),
    payload.mimeType,
    payload.sequence,
  );
  for (const language of SUPPORTED_LANGUAGES) {
    session.transcripts[language] = [session.transcripts[language], segment[language]]
      .filter(Boolean)
      .join(' ');
  }
  session.sequence = payload.sequence;
  session.updatedAt = new Date().toISOString();
  io.to(roomFor(session.id)).emit(SOCKET_EVENTS.TRANSCRIPT_ALL, {
    sessionId: session.id,
    transcripts: session.transcripts,
    sequence: session.sequence,
    updatedAt: session.updatedAt,
  });
  for (const language of SUPPORTED_LANGUAGES) {
    io.to(roomFor(session.id)).emit(SOCKET_EVENTS.TRANSCRIPT_UPDATE, {
      sessionId: session.id,
      language,
      text: session.transcripts[language],
      isFinal: false,
      sequence: session.sequence,
      updatedAt: session.updatedAt,
    });
  }
  console.log('transcript emitted', session.id, session.sequence);
}

function joinViewer(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  session: Session,
  language: SupportedLanguage,
): void {
  if (socket.data.viewerSessionId) socket.leave(roomFor(socket.data.viewerSessionId));
  socket.join(roomFor(session.id));
  socket.data.viewerSessionId = session.id;
  socket.data.viewerLanguage = language;
  socket.emit(SOCKET_EVENTS.TRANSCRIPT_ALL, {
    sessionId: session.id,
    transcripts: session.transcripts,
    sequence: session.sequence,
    updatedAt: session.updatedAt,
  });
}

function latestSession(): Session | undefined {
  return [...sessions.values()].reverse().find((session) => session.active) ??
    [...sessions.values()].at(-1);
}

function roomFor(sessionId: string): string {
  return `session:${sessionId}`;
}

function validateChunk(payload: SpeakerAudioChunkPayload): string | undefined {
  if (!payload.sessionId || !payload.chunk || !payload.mimeType) return 'Missing audio fields.';
  if (!Number.isInteger(payload.sequence) || payload.sequence < 1) return 'Invalid sequence.';
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSpeakerStartPayload(payload: unknown): payload is { sessionId?: string } {
  return isRecord(payload) &&
    (payload.sessionId === undefined || typeof payload.sessionId === 'string');
}

function isSpeakerAudioChunkPayload(payload: unknown): payload is SpeakerAudioChunkPayload {
  return isRecord(payload) &&
    typeof payload.sessionId === 'string' &&
    typeof payload.chunk === 'string' &&
    typeof payload.mimeType === 'string' &&
    typeof payload.sequence === 'number';
}

function isSpeakerStopPayload(payload: unknown): payload is { sessionId: string } {
  return isRecord(payload) && typeof payload.sessionId === 'string';
}

function isViewerJoinPayload(
  payload: unknown,
): payload is { sessionId?: string; language: SupportedLanguage } {
  return isRecord(payload) &&
    (payload.sessionId === undefined || typeof payload.sessionId === 'string') &&
    typeof payload.language === 'string';
}

function isViewerSetLanguagePayload(
  payload: unknown,
): payload is { language: SupportedLanguage } {
  return isRecord(payload) && typeof payload.language === 'string';
}

function emitSpeakerError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  message: string,
  code: string,
): void {
  socket.emit(SOCKET_EVENTS.SPEAKER_ERROR, { message, code });
}

function emitViewerError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  message: string,
  code: string,
): void {
  socket.emit(SOCKET_EVENTS.VIEWER_ERROR, { message, code });
}
