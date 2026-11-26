'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { z, ZodError } from 'zod';
import { UserError } from '../errors';
import { clientIp, rateLimit } from '../rate-limit';
import { resetPassword, sendPasswordResetEmail } from '../services/password-reset';

export interface ForgotState {
  sent?: boolean;
  error?: string;
  email?: string;
}

/** Always answers the same way whether or not the email has a login; the email goes out after the response. */
export async function forgotPasswordAction(_previous: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!z.string().email().safeParse(email).success) return { error: 'Enter the email you sign in with', email };
  const limited = await rateLimit(`reset:ip:${await clientIp()}`, 10, 60 * 60_000);
  if (!limited.ok) return { error: `Too many requests. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minutes.`, email };
  after(() => sendPasswordResetEmail(email).catch((error) => console.error('[password reset] could not send', error)));
  return { sent: true, email };
}

export interface ResetState {
  error?: string;
}

export async function resetPasswordAction(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const limited = await rateLimit(`reset:use:${await clientIp()}`, 20, 60 * 60_000);
  if (!limited.ok) return { error: `Too many tries. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minutes.` };
  try {
    await resetPassword({ token: String(formData.get('token') ?? ''), next: String(formData.get('next') ?? ''), confirm: String(formData.get('confirm') ?? '') });
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? 'Please check the form.' };
    if (error instanceof UserError) return { error: error.message };
    console.error('[password reset]', error);
    return { error: 'Something went wrong. Please try again.' };
  }
  redirect('/login?reset=1');
}
