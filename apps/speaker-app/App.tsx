import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SOCKET_EVENTS,
  type SocketErrorPayload,
  type SpeakerSessionCreatedPayload,
} from '@translator/shared-socket-contracts';

import { SegmentedAudioRecorder } from './src/audio/recorder';
import { StatusPill } from './src/components/StatusPill';
import { BACKEND_SOCKET_URL } from './src/config';
import {
  createSpeakerSocket,
  type ConnectionState,
  type SpeakerSocket,
} from './src/socket/socket-client';

export type RecordingState =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'error';

const RECORDING_LABELS: Record<RecordingState, string> = {
  idle: 'Idle',
  'requesting-permission': 'Requesting microphone permission',
  recording: 'Recording and sending',
  stopping: 'Stopping',
  error: 'Error',
};

export default function App() {
  const socketRef = useRef<SpeakerSocket | null>(null);
  const recorderRef = useRef<SegmentedAudioRecorder | null>(null);
  const mountedRef = useRef(true);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [sessionId, setSessionId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  const stopRecording = useCallback(async (emitStop: boolean) => {
    if (!recorderRef.current?.isActive) {
      const activeSessionId = sessionIdRef.current;
      if (emitStop && activeSessionId && socketRef.current?.connected) {
        socketRef.current.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
      }
      setRecordingState('idle');
      return;
    }

    setRecordingState('stopping');

    try {
      await recorderRef.current.stop();
    } catch {
      if (mountedRef.current) {
        setErrorMessage('Recording failed while stopping.');
        setRecordingState('error');
      }
      return;
    }

    const activeSessionId = sessionIdRef.current;
    if (emitStop && activeSessionId && socketRef.current?.connected) {
      socketRef.current.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: activeSessionId });
    }

    if (mountedRef.current) {
      setRecordingState('idle');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const socket = createSpeakerSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState('connected');
      setErrorMessage(undefined);
      if (!recorderRef.current?.isActive) {
        setRecordingState('idle');
      }
    };
    const handleDisconnect = () => {
      setConnectionState('disconnected');
      setErrorMessage('Socket disconnected.');
      void stopRecording(false).finally(() => {
        if (mountedRef.current) {
          setErrorMessage('Socket disconnected.');
          setRecordingState('error');
        }
      });
    };
    const handleReconnectAttempt = () => setConnectionState('reconnecting');
    const handleSessionCreated = ({ sessionId: newSessionId }: SpeakerSessionCreatedPayload) => {
      sessionIdRef.current = newSessionId;
      setSessionId(newSessionId);
      setErrorMessage(undefined);

      const recorder = recorderRef.current;
      if (!recorder) {
        setErrorMessage('Recording could not be initialized.');
        setRecordingState('error');
        return;
      }

      setRecordingState('recording');
      void recorder.start().catch(() => {
        setErrorMessage('Recording failed.');
        setRecordingState('error');
        if (socket.connected) {
          socket.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: newSessionId });
        }
      });
    };
    const handleSpeakerError = ({ message }: SocketErrorPayload) => {
      setErrorMessage(message || 'Backend error.');
      void stopRecording(false).finally(() => {
        if (mountedRef.current) {
          setErrorMessage(message || 'Backend error.');
          setRecordingState('error');
        }
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, handleSessionCreated);
    socket.on(SOCKET_EVENTS.SPEAKER_ERROR, handleSpeakerError);
    socket.connect();

    return () => {
      mountedRef.current = false;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, handleSessionCreated);
      socket.off(SOCKET_EVENTS.SPEAKER_ERROR, handleSpeakerError);
      socket.disconnect();
      void recorderRef.current?.stop();
    };
  }, [stopRecording]);

  async function startTalking() {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setErrorMessage('Socket disconnected. Wait for the connection to return.');
      setRecordingState('error');
      return;
    }

    setErrorMessage(undefined);
    setRecordingState('requesting-permission');

    try {
      const hasPermission = await SegmentedAudioRecorder.requestPermission();
      if (!hasPermission) {
        setErrorMessage('Microphone permission denied.');
        setRecordingState('error');
        return;
      }

      recorderRef.current = new SegmentedAudioRecorder(
        (audioChunk) => {
          const activeSocket = socketRef.current;
          const activeSessionId = sessionIdRef.current;

          if (!activeSocket?.connected || !activeSessionId) {
            throw new Error('Audio chunk send failed.');
          }

          activeSocket.emit(SOCKET_EVENTS.SPEAKER_AUDIO_CHUNK, {
            sessionId: activeSessionId,
            ...audioChunk,
          });
        },
        (message) => {
          if (mountedRef.current) {
            setErrorMessage(message);
            setRecordingState('error');
          }
          const activeSessionId = sessionIdRef.current;
          if (activeSessionId && socketRef.current?.connected) {
            socketRef.current.emit(SOCKET_EVENTS.SPEAKER_STOP, {
              sessionId: activeSessionId,
            });
          }
        },
      );

      sessionIdRef.current = undefined;
      setSessionId(undefined);
      socket.emit(SOCKET_EVENTS.SPEAKER_START, {});
    } catch {
      setErrorMessage('Recording failed.');
      setRecordingState('error');
    }
  }

  async function handleMainAction() {
    if (recordingState === 'recording') {
      await stopRecording(true);
      return;
    }

    await startTalking();
  }

  const isBusy =
    recordingState === 'requesting-permission' || recordingState === 'stopping';
  const isRecording = recordingState === 'recording';
  const canStart = connectionState === 'connected' && !isBusy;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>Translator Speaker</Text>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Connection</Text>
            <StatusPill status={connectionState} />
          </View>
          <View style={styles.sessionBlock}>
            <Text style={styles.detailLabel}>Session ID</Text>
            <Text selectable style={styles.sessionId}>
              {sessionId ?? 'Not connected to a session'}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityHint={
            isRecording ? 'Stops recording and sending audio' : 'Starts a speaker session'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStart && !isRecording }}
          disabled={!canStart && !isRecording}
          onPress={() => void handleMainAction()}
          style={({ pressed }) => [
            styles.mainButton,
            isRecording && styles.stopButton,
            (!canStart && !isRecording) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <Text style={styles.buttonText}>
              {isRecording ? 'Stop Talking' : 'Start Talking'}
            </Text>
          )}
        </Pressable>

        <Text
          accessibilityLiveRegion="polite"
          style={[styles.recordingStatus, recordingState === 'error' && styles.errorText]}
        >
          {RECORDING_LABELS[recordingState]}
        </Text>
        {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}

        <Text style={styles.backendText}>Backend: {BACKEND_SOCKET_URL}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#17202A',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 32,
    textAlign: 'center',
  },
  details: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    marginBottom: 40,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: '#53606C',
    fontSize: 14,
    fontWeight: '600',
  },
  sessionBlock: {
    borderTopColor: '#E5E7E9',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  sessionId: {
    color: '#17202A',
    fontSize: 13,
    marginTop: 8,
  },
  mainButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#167D4C',
  },
  stopButton: {
    backgroundColor: '#C0392B',
  },
  disabledButton: {
    backgroundColor: '#9AA4AD',
  },
  pressedButton: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  recordingStatus: {
    color: '#34495E',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 28,
  },
  errorText: {
    color: '#B03A2E',
  },
  errorMessage: {
    color: '#B03A2E',
    fontSize: 14,
    marginTop: 8,
    maxWidth: 360,
    textAlign: 'center',
  },
  backendText: {
    color: '#7B8791',
    fontSize: 11,
    marginTop: 28,
    textAlign: 'center',
  },
});
