import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getContext } from '@/server/context';
import { AuthCard } from '../auth-card';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default async function ForgotPasswordPage() {
  if (await getContext()) redirect('/account');
  return (
    <AuthCard title="Forgot your password?" description="Enter the email you sign in with. We will send a link to choose a new password.">
      <ForgotForm />
    </AuthCard>
  );
}
