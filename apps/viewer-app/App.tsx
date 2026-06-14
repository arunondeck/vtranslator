import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ConnectionStatus } from './src/components/ConnectionStatus';
import { LanguageSelector } from './src/components/LanguageSelector';
import { TranscriptView } from './src/components/TranscriptView';
import { useTranscript } from './src/hooks/useTranscript';

export default function App() {
  const {
    connectionStatus,
    error,
    selectedLanguage,
    sessionId,
    transcript,
    setLanguage,
  } = useTranscript();

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.title}>Translator Viewer</Text>

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ConnectionStatus status={connectionStatus} />
        <LanguageSelector selectedLanguage={selectedLanguage} onSelect={setLanguage} />

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Live Translation</Text>
        <View style={styles.divider} />

        <TranscriptView text={transcript} />

        <View style={styles.session}>
          <Text style={styles.sessionLabel}>Session ID</Text>
          <Text selectable style={styles.sessionValue}>
            {sessionId ?? 'Waiting for speaker...'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: '#18212B',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
  },
  errorBanner: {
    backgroundColor: '#FDE8E7',
    borderColor: '#E7A09B',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  errorText: {
    color: '#8A2520',
    fontSize: 14,
  },
  divider: {
    backgroundColor: '#D5D9DE',
    height: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    color: '#18212B',
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 12,
  },
  session: {
    borderTopColor: '#D5D9DE',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  sessionLabel: {
    color: '#66717E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  sessionValue: {
    color: '#18212B',
    fontSize: 16,
  },
});
