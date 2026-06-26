import {
  EMPTY_TRANSCRIPTS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type TranscriptMap,
} from '@translator/shared-types';
import { config } from '../config.js';
import type { TranslateStream } from '../services/sarvam-stream.js';
import { createSessionId } from '../utils/ids.js';

export type ActiveSession = {
  sessionId: string;
  speakerSocketId: string;
  startedAt: string;
  endedAt?: string;
  latestSequence: number;
  transcripts: TranscriptMap;
};

export type StoredSession = ActiveSession & {
  stream?: TranslateStream;
  utterances: Record<SupportedLanguage, string[]>;
};

function createUtteranceBuffers(): Record<SupportedLanguage, string[]> {
  return SUPPORTED_LANGUAGES.reduce(
    (buffers, language) => {
      buffers[language] = [];
      return buffers;
    },
    {} as Record<SupportedLanguage, string[]>,
  );
}

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
      utterances: createUtteranceBuffers(),
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

  attachStream(session: StoredSession, stream: TranslateStream): void {
    session.stream = stream;
  }

  /**
   * Appends a finalized utterance for one language and returns the rolled-up
   * text kept within `transcriptWindowChars` so the displayed transcript grows
   * but never without bound.
   */
  appendUtterance(
    session: StoredSession,
    language: SupportedLanguage,
    text: string,
  ): string {
    const trimmed = text.trim();
    if (trimmed) {
      session.utterances[language].push(trimmed);
    }
    const rendered = this.renderText(session, language);
    session.transcripts[language] = rendered;
    return rendered;
  }

  renderText(session: StoredSession, language: SupportedLanguage): string {
    const utterances = session.utterances[language];
    const kept: string[] = [];
    let length = 0;
    for (let index = utterances.length - 1; index >= 0; index -= 1) {
      const utterance = utterances[index];
      if (!utterance) continue;
      const addition = length === 0 ? utterance.length : utterance.length + 1;
      if (length + addition > config.transcriptWindowChars && kept.length > 0) {
        break;
      }
      kept.unshift(utterance);
      length += addition;
    }
    return kept.join(' ');
  }

  stop(sessionId: string, speakerSocketId: string): boolean {
    const session = this.getActive(sessionId);
    if (!session || session.speakerSocketId !== speakerSocketId) return false;

    this.endSession(session);
    return true;
  }

  endBySpeaker(speakerSocketId: string): void {
    for (const session of this.sessions.values()) {
      if (session.endedAt || session.speakerSocketId !== speakerSocketId) {
        continue;
      }
      try {
        session.stream?.flush();
      } catch {
        // ignore flush failures
      }
      this.endSession(session);
    }
  }

  endSession(session: StoredSession): void {
    if (session.endedAt) return;
    session.endedAt = new Date().toISOString();
    try {
      session.stream?.close();
    } catch {
      // ignore stream close failures
    }
    session.stream = undefined;
    if (this.latestSessionId === session.sessionId) {
      this.latestSessionId = [...this.sessions.values()]
        .reverse()
        .find((candidate) => !candidate.endedAt)?.sessionId;
    }
  }
}

export const sessionStore = new SessionStore();
