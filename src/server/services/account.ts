import 'server-only';
import bcrypt from 'bcryptjs';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { loginHistory, users } from '@/db/schema';
import { UserError } from '../errors';
import { peekLimit, recordHit } from '../rate-limit';

/** Your own login, from "My account": every signed-in person, whatever their role. */

export const passwordChange = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    next: z.string().min(8, 'The new password needs at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: 'The two new passwords are not the same', path: ['confirm'] })
  .refine((v) => v.next !== v.current, { message: 'Choose a password different from the current one', path: ['next'] });

const WRONG_LIMIT = 5;
const WRONG_WINDOW = 15 * 60_000;

/**
 * Checks the current password (5 wrong tries per 15 minutes), saves the new one and signs out every other
 * device by moving the session version on. Returns the new version so the caller keeps this device signed in.
 */
export async function changePassword(userId: string, input: z.input<typeof passwordChange>): Promise<number> {
  const data = passwordChange.parse(input);
  const key = `account:password:${userId}`;
  const limit = await peekLimit(key, WRONG_LIMIT, WRONG_WINDOW);
  if (!limit.ok) throw new UserError(`Too many wrong passwords. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`);

  const [user] = await db.select({ hash: users.passwordHash, email: users.email, mobile: users.mobile }).from(users).where(eq(users.id, userId));
  if (!user) throw new UserError('Your login was not found. Sign in again.');
  if (!(await bcrypt.compare(data.current, user.hash))) {
    await recordHit(key);
    throw new UserError('Your current password is not right.');
  }
  const lowered = data.next.toLowerCase();
  if ((user.email && lowered === user.email.toLowerCase()) || (user.mobile && data.next === user.mobile)) {
    throw new UserError('Do not use your email or mobile number as the password.');
  }
  const [row] = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(data.next, 10), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ version: users.sessionVersion });
  return row.version;
}

/** "Sign out on every other device": this device gets the new version, the others stop working. */
export async function signOutOtherDevices(userId: string): Promise<number> {
  const [row] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ version: users.sessionVersion });
  return row.version;
}

export const profileInput = z.object({ name: z.string().trim().min(2, 'Your name is too short').max(80) });

export async function saveProfile(userId: string, input: z.input<typeof profileInput>) {
  const data = profileInput.parse(input);
  await db.update(users).set({ name: data.name, updatedAt: new Date() }).where(eq(users.id, userId));
  return data;
}

export async function myRecentSignIns(userId: string, limit = 10) {
  return db
    .select({ id: loginHistory.id, success: loginHistory.success, ip: loginHistory.ip, userAgent: loginHistory.userAgent, createdAt: loginHistory.createdAt })
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(limit);
}
