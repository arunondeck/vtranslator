export type SupportedLanguage = 'en' | 'ml' | 'hi' | 'bn';

export type TranscriptMap = Record<SupportedLanguage, string>;

export type TranscriptUpdate = {
  sessionId: string;
  language: SupportedLanguage;
  text: string;
  isFinal: boolean;
  sequence: number;
  updatedAt: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'ml', 'hi', 'bn'];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  bn: 'Bengali',
};

export const EMPTY_TRANSCRIPTS: TranscriptMap = {
  en: '',
  ml: '',
  hi: '',
  bn: '',
};
