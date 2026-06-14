import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@translator/shared-socket-contracts';

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_SOCKET_URL ?? 'http://localhost:4000';
const SEGMENT_MS = 3_000;

export default function App() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>();
  const recordingRef = useRef<Audio.Recording>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const activeRef = useRef(false);
  const sessionRef = useRef<string>();
  const sequenceRef = useRef(0);
  const [status, setStatus] = useState('Connecting…');
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(backendUrl);
    socketRef.current = socket;
    socket.on('connect', () => setStatus('Ready to speak'));
    socket.on('disconnect', () => setStatus('Disconnected'));
    socket.on(SOCKET_EVENTS.SPEAKER_SESSION_CREATED, ({ sessionId }) => {
      sessionRef.current = sessionId;
      setStatus('Listening…');
      void recordSegment();
    });
    socket.on(SOCKET_EVENTS.SPEAKER_ERROR, ({ message }) => setStatus(message));
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      socket.disconnect();
    };
  }, []);

  async function toggleRecording() {
    if (activeRef.current) {
      await stopSpeaking();
      return;
    }
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus('Microphone permission is required.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    activeRef.current = true;
    sequenceRef.current = 0;
    setIsRecording(true);
    setStatus('Starting session…');
    socketRef.current?.emit(SOCKET_EVENTS.SPEAKER_START, {});
  }

  async function recordSegment() {
    if (!activeRef.current) return;
    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      timerRef.current = setTimeout(() => void finishSegment(true), SEGMENT_MS);
    } catch {
      activeRef.current = false;
      setIsRecording(false);
      setStatus('Could not start microphone recording.');
    }
  }

  async function finishSegment(continueRecording: boolean) {
    const recording = recordingRef.current;
    recordingRef.current = undefined;
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (uri && sessionRef.current) {
      const chunk = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      sequenceRef.current += 1;
      socketRef.current?.emit(SOCKET_EVENTS.SPEAKER_AUDIO_CHUNK, {
        sessionId: sessionRef.current,
        chunk,
        mimeType: 'audio/mp4',
        sequence: sequenceRef.current,
      });
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
    if (continueRecording && activeRef.current) await recordSegment();
  }

  async function stopSpeaking() {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    await finishSegment(false);
    if (sessionRef.current) {
      socketRef.current?.emit(SOCKET_EVENTS.SPEAKER_STOP, { sessionId: sessionRef.current });
    }
    setIsRecording(false);
    setStatus('Ready to speak');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>REALTIME TRANSLATOR</Text>
        <Text style={styles.title}>Speaker</Text>
        <Text style={styles.description}>
          Tap once and speak naturally. Your words will appear live for viewers.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void toggleRecording()}
          style={[styles.button, isRecording && styles.buttonActive]}
        >
          <View style={[styles.icon, isRecording && styles.stopIcon]} />
          <Text style={styles.buttonText}>{isRecording ? 'Stop talking' : 'Start talking'}</Text>
        </Pressable>
        <Text style={styles.status}>{status}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F4ED' },
  content: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { color: '#567568', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#17342C', fontSize: 48, fontWeight: '700', marginTop: 12 },
  description: {
    color: '#5C6D66',
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 340,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 48,
  },
  button: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#1D725B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17342C',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  buttonActive: { backgroundColor: '#C65046' },
  icon: { width: 28, height: 38, borderRadius: 14, backgroundColor: '#FFFFFF' },
  stopIcon: { width: 28, height: 28, borderRadius: 4 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 14 },
  status: { color: '#5C6D66', marginTop: 30, fontSize: 15 },
});
