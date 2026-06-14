import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@translator/shared-socket-contracts';
import {
  EMPTY_TRANSCRIPTS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type TranscriptMap,
} from '@translator/shared-types';

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_SOCKET_URL ?? 'http://localhost:4000';

export default function App() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>();
  const selectedRef = useRef<SupportedLanguage>('en');
  const [selected, setSelected] = useState<SupportedLanguage>('en');
  const [transcripts, setTranscripts] = useState<TranscriptMap>({ ...EMPTY_TRANSCRIPTS });
  const [status, setStatus] = useState('Connecting…');

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(backendUrl);
    socketRef.current = socket;
    socket.on('connect', () => {
      setStatus('Live');
      socket.emit(SOCKET_EVENTS.VIEWER_JOIN, { language: selectedRef.current });
    });
    socket.on('disconnect', () => setStatus('Disconnected'));
    socket.on(SOCKET_EVENTS.TRANSCRIPT_ALL, ({ transcripts: next }) => setTranscripts(next));
    socket.on(SOCKET_EVENTS.TRANSCRIPT_UPDATE, (update) => {
      setTranscripts((current) => ({ ...current, [update.language]: update.text }));
    });
    socket.on(SOCKET_EVENTS.VIEWER_ERROR, ({ message }) => setStatus(message));
    return () => socket.disconnect();
  }, []);

  function chooseLanguage(language: SupportedLanguage) {
    selectedRef.current = language;
    setSelected(language);
    socketRef.current?.emit(SOCKET_EVENTS.VIEWER_SET_LANGUAGE, { language });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>REALTIME TRANSLATOR</Text>
          <Text style={styles.title}>Live transcript</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>{status}</Text>
        </View>
      </View>
      <View style={styles.languages}>
        {SUPPORTED_LANGUAGES.map((language) => (
          <Pressable
            key={language}
            onPress={() => chooseLanguage(language)}
            style={[styles.languageButton, selected === language && styles.languageButtonSelected]}
          >
            <Text style={[styles.languageText, selected === language && styles.languageTextSelected]}>
              {LANGUAGE_LABELS[language]}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.transcriptCard}>
        <Text style={styles.transcript}>
          {transcripts[selected] || 'Waiting for the speaker to begin…'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F4ED' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { color: '#567568', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#17342C', fontSize: 31, fontWeight: '700', marginTop: 6 },
  liveBadge: {
    backgroundColor: '#E2EEE8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 130,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1D725B', marginRight: 7 },
  liveText: { color: '#315E50', fontSize: 12, fontWeight: '700' },
  languages: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageButton: {
    borderWidth: 1,
    borderColor: '#CDD7D1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  languageButtonSelected: { backgroundColor: '#173F34', borderColor: '#173F34' },
  languageText: { color: '#496158', fontSize: 13, fontWeight: '600' },
  languageTextSelected: { color: '#FFFFFF' },
  transcriptCard: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 22,
    padding: 24,
  },
  transcript: { color: '#223B33', fontSize: 25, lineHeight: 39 },
});
