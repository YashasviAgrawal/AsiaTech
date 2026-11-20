'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/db';
import { loginHistory, users } from '@/db/schema';
import { normaliseMobile } from '@/lib/utils';
import { writeSession } from '../auth/session';

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

  if (!user || !valid) return { error: 'That email/mobile and password do not match.', identifier };

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await writeSession({ sub: user.id, pid: null, v: user.sessionVersion });

  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  redirect(safeNext);
}
