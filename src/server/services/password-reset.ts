import 'server-only';
import bcrypt from 'bcryptjs';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { properties, propertyMembers, users } from '@/db/schema';
import { appUrl } from '../app-url';
import { logActivity } from '../audit';
import { UserError } from '../errors';
import { createResetToken, readResetToken, RESET_LINK_MINUTES } from '../password-reset-token';
import { rateLimit } from '../rate-limit';
import { sendMessage } from './messaging';

/**
 * "Forgot password?" for people who sign in with an email. Mobile-only staff ask whoever manages staff
 * (Settings → User Management), since SMS is not set up.
 */

async function homeHotel(userId: string) {
  const [row] = await db
    .select({ id: properties.id, name: properties.name, email: properties.email })
    .from(propertyMembers)
    .innerJoin(properties, eq(properties.id, propertyMembers.propertyId))
    .where(and(eq(propertyMembers.userId, userId), eq(propertyMembers.isActive, true)))
    .orderBy(asc(propertyMembers.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Sends a reset link when the email belongs to an active login with a hotel; otherwise does nothing, so the
 * screen never reveals which emails have logins. At most 3 emails per address per hour.
 * Returns whether an email went out (for tests and logs only; never shown to the person asking).
 */
export async function sendPasswordResetEmail(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return false;
  if (!(await rateLimit(`reset:email:${email}`, 3, 60 * 60_000)).ok) return false;
  const [user] = await db.select({ id: users.id, name: users.name, version: users.sessionVersion, active: users.isActive }).from(users).where(eq(users.email, email)).limit(1);
  if (!user?.active) return false;
  const hotel = await homeHotel(user.id);
  if (!hotel) return false;
  const link = appUrl(`/reset-password/${createResetToken(user.id, user.version)}`);
  const result = await sendMessage({
    propertyId: hotel.id,
    channel: 'email',
    to: email,
    template: 'password_reset',
    subject: 'Reset your password',
    fromName: hotel.name,
    replyTo: hotel.email,
    entityType: 'user',
    entityId: user.id,
    body: [
      `Hello ${user.name},`,
      '',
      `Someone (hopefully you) asked to reset the password you use for ${hotel.name}. Open this link to choose a new one:`,
      '',
      link,
      '',
      `The link works once, for ${RESET_LINK_MINUTES} minutes. If you did not ask, ignore this email: your password stays the same.`,
    ].join('\n'),
    // Staff can read the message log: it must never hold a working link.
    logBody: `Password reset link sent to ${user.name} (works once, for ${RESET_LINK_MINUTES} minutes; the link is not kept here).`,
  });
  return result.status === 'sent';
}

export const resetInput = z
  .object({
    token: z.string().min(10),
    next: z.string().min(8, 'The new password needs at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: 'The two new passwords are not the same', path: ['confirm'] });

/** Whether a reset link can still be used (the page shows a "send a new link" message otherwise). */
export async function checkResetToken(token: string): Promise<{ ok: true; name: string } | { ok: false; reason: 'invalid' | 'expired' | 'used' }> {
  const read = readResetToken(token);
  if (!read.ok) return read;
  const [user] = await db.select({ name: users.name, version: users.sessionVersion, active: users.isActive }).from(users).where(eq(users.id, read.userId));
  if (!user?.active) return { ok: false, reason: 'invalid' };
  if (user.version !== read.sessionVersion) return { ok: false, reason: 'used' };
  return { ok: true, name: user.name };
}

/** Sets the new password, signs out every device and makes the link unusable (the session version moves on). */
export async function resetPassword(input: z.input<typeof resetInput>): Promise<{ login: string }> {
  const data = resetInput.parse(input);
  const read = readResetToken(data.token);
  if (!read.ok) throw new UserError(read.reason === 'expired' ? 'This link has expired. Ask for a new one.' : 'This link is not valid. Ask for a new one.');
  const [user] = await db.select({ email: users.email, mobile: users.mobile, active: users.isActive }).from(users).where(eq(users.id, read.userId));
  if (!user?.active) throw new UserError('This link is not valid. Ask for a new one.');
  if ((user.email && data.next.toLowerCase() === user.email.toLowerCase()) || (user.mobile && data.next === user.mobile)) {
    throw new UserError('Do not use your email or mobile number as the password.');
  }
  // Only succeeds while the version still matches: a link works once, even if opened twice at the same moment.
  const updated = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(data.next, 10), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(users.id, read.userId), eq(users.sessionVersion, read.sessionVersion)))
    .returning({ id: users.id });
  if (updated.length === 0) throw new UserError('This link was already used. Ask for a new one if you still need it.');
  const hotel = await homeHotel(read.userId);
  if (hotel) await logActivity({ propertyId: hotel.id, userId: read.userId, entityType: 'user', entityId: read.userId, action: 'update', summary: 'Reset their password from an email link' });
  return { login: user.email ?? user.mobile ?? '' };
}
