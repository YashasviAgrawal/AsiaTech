'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, getPatterns, translatePhrase, type Dictionary, type Locale, type Translate } from './index';

interface I18nValue {
  t: Translate;
  /** Translate an on-screen English phrase (falls back to the English text). */
  tr: (text: string) => string;
  locale: Locale;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, dictionary, phrases, children }: { locale: Locale; dictionary: Dictionary; phrases: Record<string, string>; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({ t: createTranslator(dictionary), tr: (text) => translatePhrase(phrases, text, getPatterns(locale)), locale }), [dictionary, phrases, locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT must be used inside <I18nProvider>');
  return value;
}

/** Phrase translation that also works outside the provider (print pages, tests): English is returned as is. */
export function useTr() {
  const value = useContext(I18nContext);
  return value ? value.tr : (text: string) => text;
}

/** Renders a translated phrase. Lets server components and shared UI translate plain strings. */
export function Tx({ text }: { text: string }) {
  const tr = useTr();
  return <>{tr(text)}</>;
}
