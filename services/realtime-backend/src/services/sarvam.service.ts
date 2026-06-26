import { config } from '../config.js';

export type TargetTranslations = {
  ml: string;
  hi: string;
  bn: string;
};

const TARGET_LANGUAGE_CODES = {
  ml: 'ml-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
} as const;

type TargetLanguage = keyof typeof TARGET_LANGUAGE_CODES;

async function requestTranslation(
  english: string,
  targetLanguage: string,
): Promise<string> {
  const response = await fetch(
    `${config.sarvamApiBaseUrl.replace(/\/$/, '')}/translate`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': config.sarvamApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: english,
        source_language_code: 'en-IN',
        target_language_code: targetLanguage,
        model: 'sarvam-translate:v1',
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Sarvam translate failed (${response.status})`);
  }

  const body = (await response.json()) as { translated_text?: string };
  return body.translated_text?.trim() ?? '';
}

/**
 * Translates a finalized English utterance into Malayalam, Hindi, and Bengali.
 * In mock mode (no API key) it returns deterministic placeholder text so the
 * full socket pipeline can be exercised without network access.
 */
export async function translateToTargets(
  english: string,
): Promise<TargetTranslations> {
  const trimmed = english.trim();
  if (!trimmed) {
    return { ml: '', hi: '', bn: '' };
  }

  if (config.useMockTranscription) {
    return {
      ml: `[ml] ${trimmed}`,
      hi: `[hi] ${trimmed}`,
      bn: `[bn] ${trimmed}`,
    };
  }

  const languages = Object.keys(TARGET_LANGUAGE_CODES) as TargetLanguage[];
  const entries = await Promise.all(
    languages.map(
      async (language) =>
        [
          language,
          await requestTranslation(trimmed, TARGET_LANGUAGE_CODES[language]),
        ] as const,
    ),
  );

  const result: TargetTranslations = { ml: '', hi: '', bn: '' };
  for (const [language, text] of entries) {
    result[language] = text;
  }
  return result;
}
