'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, History, KeyRound, LogOut, MonitorSmartphone, UserRound, XCircle } from 'lucide-react';
import { changePasswordAction, saveProfileAction, signOutOtherDevicesAction } from '@/server/actions/account';
import { setLanguageAction } from '@/server/actions/shell';
import { deviceName } from '@/lib/device';
import { formatDateTime } from '@/lib/format';
import { useTr } from '@/i18n/client';
import { tx } from '@/i18n/tx';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

type SignIn = { id: string; success: boolean; ip: string | null; userAgent: string | null; createdAt: string };

export function AccountForms({
  user,
  role,
  signIns,
}: {
  user: { name: string; email: string | null; mobile: string | null; language: 'en' | 'hi' };
  role: { name: string; hotel: string };
  signIns: SignIn[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Profile user={user} role={role} />
      <Password />
      <Devices />
      <SignIns signIns={signIns} />
    </div>
  );
}

function Profile({ user, role }: { user: { name: string; email: string | null; mobile: string | null; language: 'en' | 'hi' }; role: { name: string; hotel: string } }) {
  const tr = useTr();
  const router = useRouter();
  const { run, pending } = useRun();
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(user.language);
  const [switching, startSwitch] = useTransition();
  return (
    <Card>
      <CardHeader icon={<UserRound className="h-4 w-4" />} title="Profile" description="How your name appears to the team and on the activity log." />
      <div className="space-y-4 p-5">
        <Field label="Your name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Language">
          <Segmented
            value={language}
            onChange={(value) => {
              setLanguage(value);
              startSwitch(async () => {
                await setLanguageAction(value);
                router.refresh();
              });
            }}
            options={[
              { value: 'en', label: 'English' },
              { value: 'hi', label: 'हिंदी' },
            ]}
            className={switching ? 'opacity-60' : undefined}
          />
        </Field>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-ink-50 px-3.5 py-3 text-sm">
          <dt className="text-ink-500">{tx('Sign in with')}</dt>
          <dd className="min-w-0 truncate font-medium text-ink-800">{[user.email, user.mobile].filter(Boolean).join(' · ')}</dd>
          <dt className="text-ink-500">{tx('Role')}</dt>
          <dd className="font-medium text-ink-800">
            {tr(role.name)} · {role.hotel}
          </dd>
        </dl>
        <p className="text-xs text-ink-500">{tx('Your email, mobile and role are changed by whoever manages staff (Settings → User Management).')}</p>
        <div className="flex justify-end">
          <Button loading={pending} disabled={name.trim() === user.name} onClick={() => run(() => saveProfileAction({ name }))}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Password() {
  const tr = useTr();
  const { run, pending } = useRun();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const type = show ? 'text' : 'password';
  return (
    <Card>
      <CardHeader
        icon={<KeyRound className="h-4 w-4" />}
        title="Password"
        description="Changing it signs you out on every other device."
      />
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => changePasswordAction(form), { onSuccess: () => setForm({ current: '', next: '', confirm: '' }) });
        }}
      >
        <Field label="Current password" required>
          <Input
            type={type}
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            autoComplete="current-password"
            trailing={
              <button type="button" onClick={() => setShow((v) => !v)} className="-mr-1 grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={tr(show ? 'Hide passwords' : 'Show passwords')}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </Field>
        <Field label="New password" required hint="At least 8 characters. A short sentence is easy to remember and hard to guess.">
          <Input type={type} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="New password again" required error={mismatch ? 'The two new passwords are not the same' : undefined}>
          <Input type={type} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" invalid={mismatch} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={!form.current || form.next.length < 8 || form.next !== form.confirm}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Devices() {
  const { run, pending } = useRun();
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <CardHeader icon={<MonitorSmartphone className="h-4 w-4" />} title="Other devices" description="Signed in on a shared counter PC or a lost phone? Sign out everywhere else; this device stays signed in." />
      <div className="flex justify-end p-5">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          <LogOut className="h-4 w-4" /> Sign out other devices
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out on every other device?"
        description="Phones and PCs where you are signed in will go back to the sign-in page. This device stays signed in."
        confirmLabel="Sign out other devices"
        variant="primary"
        undoable={false}
        loading={pending}
        onConfirm={async () => {
          const result = await run(() => signOutOtherDevicesAction());
          if (result.ok) setConfirming(false);
        }}
      />
    </Card>
  );
}

function SignIns({ signIns }: { signIns: SignIn[] }) {
  const tr = useTr();
  return (
    <Card>
      <CardHeader icon={<History className="h-4 w-4" />} title="Recent sign-ins" description="Your last sign-ins and wrong-password tries. Something you don't recognise? Change your password." />
      <ul className="divide-y divide-ink-100">
        {signIns.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            {s.success ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-600" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink-800">{tr(deviceName(s.userAgent))}</span>
              <span className="block text-xs text-ink-400">{tr(s.success ? 'signed in' : 'wrong password')}</span>
            </span>
            <span className="shrink-0 text-right text-xs text-ink-400">
              <span className="block">{formatDateTime(s.createdAt)}</span>
              <span className="block">{s.ip ?? '—'}</span>
            </span>
          </li>
        ))}
        {signIns.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-500">{tx('No sign-ins yet.')}</li>}
      </ul>
    </Card>
  );
}
