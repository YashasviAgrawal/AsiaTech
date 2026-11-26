'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { forgotPasswordAction, type ForgotState } from '@/server/actions/password-reset';
import { tx } from '@/i18n/tx';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/fields';

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  if (state.sent) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{tx(`If ${state.email} has a login, a link is on its way. It works once, for 30 minutes. Check spam too.`)}</p>
        </div>
        <BackToSignIn />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus defaultValue={state.email} placeholder="you@hotel.com" leading={<Mail className="h-4 w-4" />} className="h-11" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
      <p className="rounded-lg bg-ink-50 px-3 py-2.5 text-xs leading-relaxed text-ink-600">
        {tx('Sign in with a mobile number only? Ask your manager or owner to set a new password in Settings → User Management.')}
      </p>
      <BackToSignIn />
    </form>
  );
}

function BackToSignIn() {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700">
      <ArrowLeft className="h-4 w-4" /> {tx('Back to sign in')}
    </Link>
  );
}
