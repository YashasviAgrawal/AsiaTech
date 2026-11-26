import { en, type Dictionary, type MessageKey } from './en';
import { hi } from './hi';
import { hiPatterns, hiPhrases } from './phrases-hi';

export type Locale = 'en' | 'hi';
export const LOCALE_COOKIE = 'hos_lang';
export const LOCALES: Locale[] = ['en', 'hi'];

export function getDictionary(locale: Locale): Dictionary {
  if (locale === 'hi') return { ...en, ...hi } as Dictionary;
  return en;
}

export type Patterns = [RegExp, string | ((...groups: string[]) => string)][];

/** On-screen English phrase → translation, used by shared components. Empty for English. */
export function getPhrases(locale: Locale): Record<string, string> {
  return locale === 'hi' ? hiPhrases : {};
}

/** Patterns cannot be sent to the browser as props (RegExp/functions), so both sides pick them by locale. */
export function getPatterns(locale: Locale): Patterns {
  return locale === 'hi' ? hiPatterns : [];
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createTranslator(dictionary: Dictionary): Translate {
  return (key, vars) => {
    let message: string = dictionary[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) message = message.replaceAll(`{${name}}`, String(value));
    }
    return message;
  };
}

/** Translate an English phrase, keeping surrounding spaces ("  Check in" → "  चेक-इन करें"). Unknown text is returned as is. */
export function translatePhrase(phrases: Record<string, string>, text: string, patterns: Patterns = []): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  let hit: string | undefined = phrases[trimmed];
  if (!hit) {
    for (const [pattern, replacement] of patterns) {
      const match = pattern.exec(trimmed);
      if (match) {
        hit = typeof replacement === 'function' ? replacement(...match.slice(1)) : trimmed.replace(pattern, replacement);
        break;
      }
    }
  }
  if (!hit) return text;
  const start = text.indexOf(trimmed);
  return text.slice(0, start) + hit + text.slice(start + trimmed.length);
}

export type { MessageKey, Dictionary };
