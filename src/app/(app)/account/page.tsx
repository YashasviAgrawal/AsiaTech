import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { myRecentSignIns } from '@/server/services/account';
import { PageHeader } from '@/components/ui/card';
import { AccountForms } from './account-forms';

export const metadata: Metadata = { title: 'My account' };

/** Every signed-in person's own login: name, language, password, other devices, recent sign-ins. */
export default async function AccountPage() {
  const ctx = await requireContext();
  const signIns = await myRecentSignIns(ctx.userId);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Your login" title="My account" description="Your name, language and password. Changes here only affect your own login." />
      <AccountForms
        user={{ name: ctx.user.name, email: ctx.user.email, mobile: ctx.user.mobile, language: ctx.user.language }}
        role={{ name: ctx.role.name, hotel: ctx.property.name }}
        signIns={signIns.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
      />
    </div>
  );
}
