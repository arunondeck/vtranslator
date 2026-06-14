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
  response.json({ ok: true, activeSessions: [...sessions.values()].filter((s) => s.active).length });
});

io.on('connection', (socket) => {
  socket.on(SOCKET_EVENTS.SPEAKER_START, ({ sessionId }) => {
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    const session = existing ?? createSession();
    session.active = true;
    socket.join(roomFor(session.id));
    socket.emit(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, { sessionId: session.id });
  });

  socket.on(SOCKET_EVENTS.SPEAKER_AUDIO_CHUNK, (payload) => {
    const error = validateChunk(payload);
    if (error) {
      socket.emit(SOCKET_EVENTS.SPEAKER_ERROR, { message: error, code: 'INVALID_CHUNK' });
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

  socket.on(SOCKET_EVENTS.SPEAKER_STOP, ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (session) session.active = false;
  });

  socket.on(SOCKET_EVENTS.VIEWER_JOIN, ({ sessionId, language }) => {
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

  socket.on(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, ({ language }) => {
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
    id: randomUUID(),
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
