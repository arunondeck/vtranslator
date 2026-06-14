import { StyleSheet, Text, View } from 'react-native';
import type { ConnectionStatus as ConnectionStatusValue } from '../hooks/useTranscript';

type Props = {
  status: ConnectionStatusValue;
};

const STATUS_LABELS: Record<ConnectionStatusValue, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
};

export function ConnectionStatus({ status }: Props) {
  return (
    <View
      accessibilityLabel={`Connection status: ${STATUS_LABELS[status]}`}
      style={styles.container}
    >
      <View style={[styles.indicator, styles[status]]} />
      <View>
        <Text style={styles.label}>Connection Status</Text>
        <Text style={styles.value}>{STATUS_LABELS[status]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 18,
  },
  indicator: {
    borderRadius: 6,
    height: 12,
    marginRight: 10,
    width: 12,
  },
  connected: {
    backgroundColor: '#26834A',
  },
  disconnected: {
    backgroundColor: '#B83A32',
  },
  reconnecting: {
    backgroundColor: '#CA8218',
  },
  label: {
    color: '#66717E',
    fontSize: 12,
  },
  value: {
    color: '#18212B',
    fontSize: 15,
    fontWeight: '600',
  },
});
