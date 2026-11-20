'use client';

import { createContext, useContext, useMemo } from 'react';
import { createTranslator, type Dictionary, type Locale, type Translate } from './index';

const I18nContext = createContext<{ t: Translate; locale: Locale } | null>(null);

export function I18nProvider({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: React.ReactNode }) {
  const value = useMemo(() => ({ t: createTranslator(dictionary), locale }), [dictionary, locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT must be used inside <I18nProvider>');
  return value;
}
