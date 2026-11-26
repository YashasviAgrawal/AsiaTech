'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { resetPasswordAction, type ResetState } from '@/server/actions/password-reset';
import { useTr } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/fields';

export function ResetForm({ token }: { token: string }) {
  const tr = useTr();
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="New password" htmlFor="next" hint="At least 8 characters. A short sentence is easy to remember and hard to guess.">
        <Input
          id="next"
          name="next"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus
          value={next}
          onChange={(e) => setNext(e.target.value)}
          leading={<Lock className="h-4 w-4" />}
          trailing={
            <button type="button" onClick={() => setShow((v) => !v)} className="text-ink-400 hover:text-ink-700" aria-label={tr(show ? 'Hide passwords' : 'Show passwords')}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          className="h-11"
        />
      </Field>
      <Field label="New password again" htmlFor="confirm" error={mismatch ? 'The two new passwords are not the same' : undefined}>
        <Input id="confirm" name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={mismatch} leading={<Lock className="h-4 w-4" />} className="h-11" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={next.length < 8 || next !== confirm}>
        Save new password
      </Button>
    </form>
  );
}
