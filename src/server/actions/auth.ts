'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/db';
import { loginHistory, users } from '@/db/schema';
import { normaliseMobile } from '@/lib/utils';
import { writeSession } from '../auth/session';
import { LOCALE_COOKIE } from '@/i18n';
import { ipFrom, peekLimit, recordHit } from '../rate-limit';

const schema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or mobile number'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
  identifier?: string;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, identifier: String(formData.get('identifier') ?? '') };
  const { identifier, password, next } = parsed.data;

  // Brute-force guard: failed attempts per network and per account, checked before touching the password hash.
  const headerList0 = await headers();
  const ipKey = `login:ip:${ipFrom((name) => headerList0.get(name))}`;
  const accountKey = `login:id:${identifier.trim().toLowerCase()}`;
  const [byIp, byAccount] = await Promise.all([peekLimit(ipKey, 30, 15 * 60_000), peekLimit(accountKey, 8, 15 * 60_000)]);
  if (!byIp.ok || !byAccount.ok) {
    const wait = Math.ceil(Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds) / 60);
    return { error: `Too many sign-in attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`, identifier };
  }

  const email = identifier.includes('@') ? identifier.toLowerCase() : null;
  const mobile = email ? null : normaliseMobile(identifier);
  const [user] = await db
    .select()
    .from(users)
    .where(email ? eq(users.email, email) : or(eq(users.mobile, mobile ?? ''), eq(users.email, identifier.toLowerCase())))
    .limit(1);

  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = headerList.get('user-agent');

  const valid = user && user.isActive ? await bcrypt.compare(password, user.passwordHash) : false;
  await db.insert(loginHistory).values({ userId: user?.id ?? null, identifier, success: Boolean(valid), ip, userAgent });

  if (!user || !valid) {
    await Promise.all([recordHit(ipKey), recordHit(accountKey)]);
    return { error: 'That email/mobile and password do not match.', identifier };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await writeSession({ sub: user.id, pid: null, v: user.sessionVersion });
  // Staff see the app in their own language from the first screen (rule 7).
  (await cookies()).set(LOCALE_COOKIE, user.language, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });

  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  redirect(safeNext);
}
