import './helpers';
import bcrypt from 'bcryptjs';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { messageLog, properties, propertyMembers, roles, users } from '@/db/schema';
import { createResetToken } from '@/server/password-reset-token';
import { checkResetToken, resetPassword, sendPasswordResetEmail } from '@/server/services/password-reset';

/** "Forgot password?": an emailed link that works once, never kept in the message log. */
let userId: string;
const email = 'reset.test@example.com';
const logged: string[] = [];

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation((line: string) => void logged.push(line));
  const [hotel] = await db.select({ id: properties.id }).from(properties).where(eq(properties.slug, 'shri-ram-portico'));
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, 'front_desk'));
  const [u] = await db.insert(users).values({ name: 'Reset Test', email, mobile: '9811100002', passwordHash: await bcrypt.hash('old-password', 10) }).returning({ id: users.id });
  userId = u.id;
  await db.insert(propertyMembers).values({ propertyId: hotel.id, userId, roleId: role.id });
});

afterAll(() => vi.restoreAllMocks());

const linkFromEmail = () => {
  const line = logged.reverse().find((l) => l.includes('/reset-password/'));
  logged.reverse();
  return /\/reset-password\/(\S+)/.exec(line ?? '')?.[1] ?? '';
};

describe('forgot password', () => {
  it('emails a link to a known email (any case) and keeps the link out of the message log', async () => {
    expect(await sendPasswordResetEmail('  Reset.Test@Example.com ')).toBe(true);
    const token = linkFromEmail();
    expect(token).not.toBe('');
    const [row] = await db.select().from(messageLog).where(and(eq(messageLog.recipient, email), eq(messageLog.template, 'password_reset'))).orderBy(desc(messageLog.createdAt)).limit(1);
    expect(row.status).toBe('sent');
    expect(row.body).not.toContain(token);
    expect(row.body).not.toContain('/reset-password/');
    expect(await checkResetToken(token)).toEqual({ ok: true, name: 'Reset Test' });
  });

  it('sends nothing for unknown emails or junk, and at most 3 emails an hour per address', async () => {
    expect(await sendPasswordResetEmail('nobody@example.com')).toBe(false);
    expect(await sendPasswordResetEmail('not an email')).toBe(false);
    expect(await sendPasswordResetEmail(email)).toBe(true);
    expect(await sendPasswordResetEmail(email)).toBe(true);
    expect(await sendPasswordResetEmail(email)).toBe(false); // 4th within the hour
  });

  it('sets the new password once; the same link then says it was used', async () => {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const token = createResetToken(userId, user.sessionVersion);
    await expect(resetPassword({ token, next: 'new-password-1', confirm: 'new-password-2' })).rejects.toThrow('not the same');
    await expect(resetPassword({ token, next: 'reset.test@example.com', confirm: 'reset.test@example.com' })).rejects.toThrow('email or mobile');
    expect(await resetPassword({ token, next: 'new-password-1', confirm: 'new-password-1' })).toEqual({ login: email });
    const [after] = await db.select().from(users).where(eq(users.id, userId));
    expect(await bcrypt.compare('new-password-1', after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    expect(await checkResetToken(token)).toEqual({ ok: false, reason: 'used' });
    await expect(resetPassword({ token, next: 'new-password-2', confirm: 'new-password-2' })).rejects.toThrow('already used');
  });

  it('refuses expired and edited links, and links of deactivated logins', async () => {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const old = createResetToken(userId, user.sessionVersion, Date.now() - 31 * 60_000);
    await expect(resetPassword({ token: old, next: 'new-password-3', confirm: 'new-password-3' })).rejects.toThrow('expired');
    const good = createResetToken(userId, user.sessionVersion);
    await expect(resetPassword({ token: good.slice(0, -2) + 'xx', next: 'new-password-3', confirm: 'new-password-3' })).rejects.toThrow('not valid');
    await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    expect(await checkResetToken(good)).toEqual({ ok: false, reason: 'invalid' });
    await expect(resetPassword({ token: good, next: 'new-password-3', confirm: 'new-password-3' })).rejects.toThrow('not valid');
  });
});
