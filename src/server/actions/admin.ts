'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { superAdminActionContext } from '../context';
import { runAction } from '../action';
import { logActivity } from '../audit';
import { saveSystemUpdate, setOrganization } from '../services/admin';

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
