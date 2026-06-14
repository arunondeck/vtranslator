import {
  EMPTY_TRANSCRIPTS,
  type TranscriptMap,
} from '@translator/shared-types';
import { createSessionId } from '../utils/ids.js';

export type ActiveSession = {
  sessionId: string;
  speakerSocketId: string;
  startedAt: string;
  endedAt?: string;
  latestSequence: number;
  transcripts: TranscriptMap;
};

type StoredSession = ActiveSession & {
  processing: Promise<void>;
};

class SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private latestSessionId?: string;

  create(speakerSocketId: string, requestedSessionId?: string): StoredSession {
    const existing = requestedSessionId
      ? this.sessions.get(requestedSessionId)
      : undefined;

    if (existing && !existing.endedAt) {
      existing.speakerSocketId = speakerSocketId;
      this.latestSessionId = existing.sessionId;
      return existing;
    }

    const session: StoredSession = {
      sessionId: requestedSessionId ?? createSessionId(),
      speakerSocketId,
      startedAt: new Date().toISOString(),
      latestSequence: 0,
      transcripts: { ...EMPTY_TRANSCRIPTS },
      processing: Promise.resolve(),
    };
    this.sessions.set(session.sessionId, session);
    this.latestSessionId = session.sessionId;
    return session;
  }

  getActive(sessionId: string): StoredSession | undefined {
    const session = this.sessions.get(sessionId);
    return session && !session.endedAt ? session : undefined;
  }

  getLatestActive(): StoredSession | undefined {
    if (!this.latestSessionId) return undefined;
    return this.getActive(this.latestSessionId);
  }

  stop(sessionId: string, speakerSocketId: string): boolean {
    const session = this.getActive(sessionId);
    if (!session || session.speakerSocketId !== speakerSocketId) return false;

    session.endedAt = new Date().toISOString();
    if (this.latestSessionId === sessionId) {
      this.latestSessionId = [...this.sessions.values()]
        .reverse()
        .find((candidate) => !candidate.endedAt)?.sessionId;
    }
    return true;
  }

  enqueue(session: StoredSession, operation: () => Promise<void>): void {
    session.processing = session.processing.then(operation);
  }
}

export const sessionStore = new SessionStore();
