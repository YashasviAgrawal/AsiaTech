import type { Metadata } from 'next';
import Link from 'next/link';
import { checkResetToken } from '@/server/services/password-reset';
import { tx } from '@/i18n/tx';
import { buttonClasses } from '@/components/ui/button-styles';
import { AuthCard } from '../../auth-card';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

/** Opened from the email. The link is checked here first, so a used or expired link says so before any typing. */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await checkResetToken(token);
  if (!check.ok) {
    const message = check.reason === 'expired' ? 'This link has expired.' : check.reason === 'used' ? 'This link was already used.' : 'This link is not valid.';
    return (
      <AuthCard title={message} description="Links work once, for 30 minutes. Ask for a new one and use the newest email.">
        <Link href="/forgot-password" className={buttonClasses('primary', 'lg', 'w-full')}>
          {tx('Send a new link')}
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description={`Hello ${check.name}. After this, you sign in with the new password on every device.`}>
      <ResetForm token={token} />
    </AuthCard>
  );
}
