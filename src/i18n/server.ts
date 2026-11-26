import 'server-only';
import { cookies } from 'next/headers';
import { createTranslator, getDictionary, getPatterns, getPhrases, LOCALE_COOKIE, translatePhrase, type Locale, type Translate } from './index';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value === 'hi' ? 'hi' : 'en';
}

export async function getT(): Promise<{ t: Translate; tr: (text: string) => string; locale: Locale }> {
  const locale = await getLocale();
  const phrases = getPhrases(locale);
  const patterns = getPatterns(locale);
  return { t: createTranslator(getDictionary(locale)), tr: (text) => translatePhrase(phrases, text, patterns), locale };
}
