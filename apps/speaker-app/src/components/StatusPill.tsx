import { StyleSheet, Text, View } from 'react-native';

import type { ConnectionState } from '../socket/socket-client';

const STATUS_LABELS: Record<ConnectionState, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
};

export function StatusPill({ status }: { status: ConnectionState }) {
  return (
    <View style={[styles.pill, styles[status]]}>
      <Text style={[styles.text, status === 'disconnected' && styles.disconnectedText]}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connected: {
    backgroundColor: '#D5F5E3',
  },
  disconnected: {
    backgroundColor: '#FADBD8',
  },
  reconnecting: {
    backgroundColor: '#FCF3CF',
  },
  text: {
    color: '#196F3D',
    fontSize: 12,
    fontWeight: '700',
  },
  disconnectedText: {
    color: '#922B21',
  },
});
