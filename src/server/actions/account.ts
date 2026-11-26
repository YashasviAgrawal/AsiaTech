'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionContext } from '../context';
import { runAction } from '../action';
import { logActivity } from '../audit';
import { writeSession } from '../auth/session';
import { changePassword, passwordChange, profileInput, saveProfile, signOutOtherDevices } from '../services/account';

/** My account: open to every signed-in person (no permission needed, it only ever touches their own login). */

export async function changePasswordAction(input: z.input<typeof passwordChange>) {
  return runAction(async () => {
    const ctx = await actionContext();
    const version = await changePassword(ctx.userId, input);
    // Other devices are now signed out; this one carries on with the new version.
    await writeSession({ sub: ctx.userId, pid: ctx.propertyId, v: version });
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'user', entityId: ctx.userId, action: 'update', summary: 'Changed their own password' });
    return { ok: true };
  }, 'Password changed. Other devices are signed out.');
}

export async function signOutOtherDevicesAction() {
  return runAction(async () => {
    const ctx = await actionContext();
    const version = await signOutOtherDevices(ctx.userId);
    await writeSession({ sub: ctx.userId, pid: ctx.propertyId, v: version });
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'user', entityId: ctx.userId, action: 'update', summary: 'Signed out their other devices' });
    return { ok: true };
  }, 'Signed out on every other device.');
}

export async function saveProfileAction(input: z.input<typeof profileInput>) {
  return runAction(async () => {
    const ctx = await actionContext();
    const data = await saveProfile(ctx.userId, input);
    revalidatePath('/', 'layout');
    return data;
  }, 'Saved.');
}
