import { useCallback, useEffect, useRef, useState } from 'react';
import { SOCKET_EVENTS } from '@translator/shared-socket-contracts';
import {
  EMPTY_TRANSCRIPTS,
  type SupportedLanguage,
  type TranscriptMap,
} from '@translator/shared-types';
import { createSocketClient, type ViewerSocket } from '../socket/socket-client';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

type ViewerState = {
  selectedLanguage: SupportedLanguage;
  sessionId?: string;
  transcripts: TranscriptMap;
  connectionStatus: ConnectionStatus;
  error?: string;
};

const initialState: ViewerState = {
  selectedLanguage: 'en',
  transcripts: { ...EMPTY_TRANSCRIPTS },
  connectionStatus: 'reconnecting',
};

export function useTranscript() {
  const socketRef = useRef<ViewerSocket | null>(null);
  const selectedLanguageRef = useRef<SupportedLanguage>(initialState.selectedLanguage);
  const [state, setState] = useState<ViewerState>(initialState);

  useEffect(() => {
    const socket = createSocketClient();
    socketRef.current = socket;

    const joinLatestSession = () => {
      socket.emit(SOCKET_EVENTS.VIEWER_JOIN, {
        language: selectedLanguageRef.current,
      });
    };

    socket.on('connect', () => {
      setState((current) => ({
        ...current,
        connectionStatus: 'connected',
        error: undefined,
      }));
      joinLatestSession();
    });

    socket.on('disconnect', () => {
      setState((current) => ({
        ...current,
        connectionStatus: 'disconnected',
        error: 'Connection lost',
      }));
    });

    socket.io.on('reconnect_attempt', () => {
      setState((current) => ({
        ...current,
        connectionStatus: 'reconnecting',
      }));
    });

    socket.on(SOCKET_EVENTS.TRANSCRIPT_ALL, ({ sessionId, transcripts }) => {
      setState((current) => ({
        ...current,
        sessionId,
        transcripts: { ...transcripts },
        error: undefined,
      }));
    });

    socket.on(SOCKET_EVENTS.TRANSCRIPT_UPDATE, ({ sessionId, language, text }) => {
      setState((current) => ({
        ...current,
        sessionId,
        transcripts: {
          ...current.transcripts,
          [language]: text,
        },
      }));
    });

    socket.on(SOCKET_EVENTS.VIEWER_ERROR, ({ message }) => {
      setState((current) => ({
        ...current,
        error: message,
      }));
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const setLanguage = useCallback((language: SupportedLanguage) => {
    selectedLanguageRef.current = language;
    setState((current) => ({
      ...current,
      selectedLanguage: language,
      error: undefined,
    }));

    if (socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, { language });
    }
  }, []);

  return {
    ...state,
    transcript: state.transcripts[state.selectedLanguage],
    setLanguage,
  };
}
