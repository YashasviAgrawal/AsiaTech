'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { LOCALE_COOKIE, type Locale } from '@/i18n';
import { clearSession, readSession, writeSession } from '../auth/session';
import { actionContext } from '../context';
import { runAction } from '../action';

export async function switchPropertyAction(propertyId: string) {
  const ctx = await actionContext();
  if (!ctx.memberships.some((m) => m.id === propertyId)) return { ok: false as const, error: 'You do not have access to that property.' };
  const session = await readSession();
  if (!session) redirect('/login');
  await writeSession({ ...session, pid: propertyId });
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function setLanguageAction(locale: Locale) {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const session = await readSession();
  if (session) await db.update(users).set({ language: locale }).where(eq(users.id, session.sub));
  revalidatePath('/', 'layout');
}

export async function signOutAction() {
  await clearSession();
  redirect('/login');
}

export async function markNotificationsReadAction() {
  return runAction(async () => {
    const ctx = await actionContext();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.propertyId, ctx.propertyId),
          isNull(notifications.readAt),
          or(isNull(notifications.userId), eq(notifications.userId, ctx.userId)),
        ),
      );
    revalidatePath('/', 'layout');
  });
}
