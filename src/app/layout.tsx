import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/i18n/client';
import { getDictionary } from '@/i18n';
import { getLocale } from '@/i18n/server';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'AsiaTech';

export const metadata: Metadata = {
  title: { default: `${APP_NAME} Hotel OS`, template: `%s · ${APP_NAME}` },
  description: 'Front desk, channel manager, booking engine, restaurant POS, housekeeping and back office for Indian hotels.',
  applicationName: `${APP_NAME} Hotel OS`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#e11d48',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === 'hi' ? 'hi' : 'en-IN'}>
      <body>
        <I18nProvider locale={locale} dictionary={getDictionary(locale)}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
