import './helpers';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { users } from '@/db/schema';
import { changePassword, saveProfile, signOutOtherDevices } from '@/server/services/account';

/** My account: a person changes their own password (current one required) and signs out other devices. */
let userId: string;

async function me() {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u;
}

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ name: 'Account Test', email: 'account.test@example.com', mobile: '9811100001', passwordHash: await bcrypt.hash('first-password', 10) })
    .returning({ id: users.id });
  userId = u.id;
});

describe('my account', () => {
  it('refuses a wrong current password, a mismatch, the same password and the email as password', async () => {
    await expect(changePassword(userId, { current: 'not-it', next: 'second-password', confirm: 'second-password' })).rejects.toThrow('current password is not right');
    await expect(changePassword(userId, { current: 'first-password', next: 'second-password', confirm: 'second-passw0rd' })).rejects.toThrow('not the same');
    await expect(changePassword(userId, { current: 'first-password', next: 'first-password', confirm: 'first-password' })).rejects.toThrow('different from the current');
    await expect(changePassword(userId, { current: 'first-password', next: 'short', confirm: 'short' })).rejects.toThrow('at least 8');
    await expect(changePassword(userId, { current: 'first-password', next: 'Account.Test@example.com', confirm: 'Account.Test@example.com' })).rejects.toThrow('email or mobile');
    await expect(changePassword(userId, { current: 'first-password', next: '9811100001', confirm: '9811100001' })).rejects.toThrow('email or mobile');
  });

  it('saves the new password and moves the session version on, so other devices are signed out', async () => {
    const before = await me();
    const version = await changePassword(userId, { current: 'first-password', next: 'second-password', confirm: 'second-password' });
    const after = await me();
    expect(version).toBe(before.sessionVersion + 1);
    expect(after.sessionVersion).toBe(version);
    expect(await bcrypt.compare('second-password', after.passwordHash)).toBe(true);
    expect(await bcrypt.compare('first-password', after.passwordHash)).toBe(false);
  });

  it('stops guessing after 5 wrong current passwords', async () => {
    for (let i = 0; i < 4; i++) await expect(changePassword(userId, { current: `guess-${i}`, next: 'third-password', confirm: 'third-password' })).rejects.toThrow('not right');
    // One wrong try was counted in the first test: this is the 6th.
    await expect(changePassword(userId, { current: 'guess-x', next: 'third-password', confirm: 'third-password' })).rejects.toThrow('Too many wrong passwords');
    // Even the right password waits now.
    await expect(changePassword(userId, { current: 'second-password', next: 'third-password', confirm: 'third-password' })).rejects.toThrow('Too many wrong passwords');
  });

  it('signs out other devices and saves the name', async () => {
    const before = await me();
    expect(await signOutOtherDevices(userId)).toBe(before.sessionVersion + 1);
    await saveProfile(userId, { name: '  Account Tester  ' });
    expect((await me()).name).toBe('Account Tester');
    await expect(saveProfile(userId, { name: 'A' })).rejects.toThrow('too short');
  });
});
