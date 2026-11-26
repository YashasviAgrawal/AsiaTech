'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { superAdminActionContext } from '../context';
import { runAction } from '../action';
import { appUrl } from '../app-url';
import { logActivity } from '../audit';
import { saveSystemUpdate, setOrganization } from '../services/admin';
import { createHotel, type NewHotelInput } from '../services/onboarding';
import { queueBackup } from '../services/backup';

const updateSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3, 'Write a short title').max(120),
  body: z.string().trim().min(3, 'Say what changed').max(600),
  tag: z.string().trim().max(20).nullable().optional(),
  isPublished: z.boolean(),
});

/** System Update cards on every hotel's dashboard. */
export async function saveSystemUpdateAction(input: z.input<typeof updateSchema>) {
  return runAction(async () => {
    const ctx = await superAdminActionContext();
    const data = updateSchema.parse(input);
    const result = await saveSystemUpdate(data);
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'system_update', entityId: result.id, action: data.id ? 'update' : 'create', summary: `System update: ${data.title}${data.isPublished ? '' : ' (hidden)'}` });
    revalidatePath('/', 'layout');
    return result;
  }, 'System update saved.');
}

const orgSchema = z.object({ id: z.string().uuid(), plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).optional(), isActive: z.boolean().optional() });

export async function setOrganizationAction(input: z.input<typeof orgSchema>) {
  return runAction(async () => {
    const ctx = await superAdminActionContext();
    const data = orgSchema.parse(input);
    await setOrganization(data.id, { plan: data.plan, isActive: data.isActive });
    await logActivity({
      propertyId: ctx.propertyId,
      userId: ctx.userId,
      entityType: 'organization',
      entityId: data.id,
      action: 'update',
      summary: data.isActive === false ? 'Suspended an organisation' : data.isActive ? 'Re-activated an organisation' : `Changed plan to ${data.plan}`,
    });
    revalidatePath('/admin');
    return { ok: true };
  }, 'Organisation updated.');
}

/** A new client (or a group's next hotel): organisation, hotel in setup, owner login. The password is returned once. */
export async function createHotelAction(input: NewHotelInput) {
  return runAction(async () => {
    const ctx = await superAdminActionContext();
    // Platform team only: never a way to make another platform admin from the browser.
    const result = await createHotel({ ...input, platformAdmin: false });
    await logActivity({
      propertyId: ctx.propertyId,
      userId: ctx.userId,
      entityType: 'property',
      entityId: result.propertyId,
      action: 'create',
      summary: `Created hotel ${input.hotelName} for ${result.login}${result.existingUser ? ' (existing login)' : ''}`,
    });
    revalidatePath('/admin');
    return { ...result, signInUrl: appUrl('/login'), bookingUrl: appUrl(`/book/${result.slug}`) };
  }, 'Hotel created.');
}

/** "Back up now": queued for the worker, which has pg_dump and the backups folder. */
export async function queueBackupAction() {
  return runAction(async () => {
    const ctx = await superAdminActionContext();
    const result = await queueBackup(ctx.userId);
    if (!result.alreadyQueued) await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'backup', entityId: result.id, action: 'create', summary: 'Asked for a backup now' });
    revalidatePath('/admin');
    return result;
  }, 'Backup asked for. It starts within a minute.');
}
