import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@translator/shared-types';

type Props = {
  selectedLanguage: SupportedLanguage;
  onSelect: (language: SupportedLanguage) => void;
};

export function LanguageSelector({ selectedLanguage, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  function selectLanguage(language: SupportedLanguage) {
    onSelect(language);
    setIsOpen(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Language</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((current) => !current)}
        style={({ pressed }) => [styles.select, pressed && styles.pressed]}
      >
        <Text style={styles.selectText}>{LANGUAGE_LABELS[selectedLanguage]}</Text>
        <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.options}>
          {SUPPORTED_LANGUAGES.map((language) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: language === selectedLanguage }}
              key={language}
              onPress={() => selectLanguage(language)}
              style={({ pressed }) => [
                styles.option,
                language === selectedLanguage && styles.selectedOption,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.optionText}>{LANGUAGE_LABELS[language]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
    zIndex: 1,
  },
  label: {
    color: '#66717E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 7,
  },
  select: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#AEB6C0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectText: {
    color: '#18212B',
    fontSize: 16,
  },
  chevron: {
    color: '#66717E',
    fontSize: 12,
  },
  options: {
    backgroundColor: '#FFFFFF',
    borderColor: '#AEB6C0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 5,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  selectedOption: {
    backgroundColor: '#E8EEF5',
  },
  optionText: {
    color: '#18212B',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.65,
  },
});
