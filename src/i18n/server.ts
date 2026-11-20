import 'server-only';
import { cookies } from 'next/headers';
import { createTranslator, getDictionary, LOCALE_COOKIE, type Locale, type Translate } from './index';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value === 'hi' ? 'hi' : 'en';
}

export async function getT(): Promise<{ t: Translate; locale: Locale }> {
  const locale = await getLocale();
  return { t: createTranslator(getDictionary(locale)), locale };
}
