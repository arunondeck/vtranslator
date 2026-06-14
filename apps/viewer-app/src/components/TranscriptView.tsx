import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  text: string;
};

export function TranscriptView({ text }: Props) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [text]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      ref={scrollViewRef}
      style={styles.container}
    >
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {text || 'Waiting for speaker...'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5D9DE',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginVertical: 14,
  },
  content: {
    flexGrow: 1,
    padding: 18,
  },
  text: {
    color: '#18212B',
    fontSize: 24,
    lineHeight: 36,
  },
});
