import { en, type Dictionary, type MessageKey } from './en';
import { hi } from './hi';

export type Locale = 'en' | 'hi';
export const LOCALE_COOKIE = 'hos_lang';
export const LOCALES: Locale[] = ['en', 'hi'];

export function getDictionary(locale: Locale): Dictionary {
  if (locale === 'hi') return { ...en, ...hi } as Dictionary;
  return en;
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

export type { MessageKey, Dictionary };
