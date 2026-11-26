'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { loginAction, type LoginState } from '@/server/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/fields';
import { Alert } from '@/components/ui/card';
import { tx } from '@/i18n/tx';
import { useTr } from '@/i18n/client';

const DEMO_ACCOUNTS = [
  { label: 'Owner', id: 'owner@shriramportico.in' },
  { label: 'Front desk', id: 'frontdesk@shriramportico.in' },
  { label: 'Housekeeping', id: '9876500003' },
];

export function LoginForm({ next, showDemo, resetDone }: { next?: string; showDemo: boolean; resetDone?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [identifier, setIdentifier] = useState(state.identifier ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const tr = useTr();

  return (
    <form action={action} className="mt-8 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error ? <Alert tone="error">{state.error}</Alert> : resetDone && <Alert tone="success">{tx('Password changed. Sign in with your new password.')}</Alert>}
      <Field label="Email or mobile" htmlFor="identifier">
        <Input
          id="identifier"
          name="identifier"
          autoComplete="username"
          autoFocus
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you@hotel.com or 98765 43210"
          leading={<User className="h-4 w-4" />}
          className="h-11"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          leading={<Lock className="h-4 w-4" />}
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-400 hover:text-ink-700" aria-label={tr(show ? 'Hide password' : 'Show password')}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          className="h-11"
        />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot-password" className="text-xs font-medium text-ink-500 hover:text-brand-700">
          {tx('Forgot password?')}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>

      {showDemo && (
        <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-3.5">
          <p className="text-xs font-semibold text-ink-700">{tx('Demo accounts')} · {tx('password')} <code className="rounded bg-white px-1 py-0.5 text-brand-700">Hotel@123</code></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  setIdentifier(account.id);
                  setPassword('Hotel@123');
                }}
                className="rounded-md bg-white px-2 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-200 transition hover:text-brand-700 hover:ring-brand-300"
              >
                {tx(account.label)}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
