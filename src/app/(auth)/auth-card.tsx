import type { ReactNode } from 'react';
import { Logo } from '@/components/shell/logo';
import { LanguageToggle } from '@/components/shell/topbar';
import { tx } from '@/i18n/tx';

/** The small centred card used by "Forgot password" and "Choose a new password". */
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50 px-6 py-8">
      <div className="mx-auto flex w-full max-w-sm items-center justify-between">
        <Logo dark={false} />
        <LanguageToggle />
      </div>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="card w-full max-w-sm p-6 sm:p-7">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">{tx(title)}</h1>
          {description && <p className="mt-1.5 text-sm text-ink-500">{tx(description)}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
