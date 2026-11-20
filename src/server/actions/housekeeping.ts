'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { HK_CATEGORIES, HK_STATUSES } from '@/db/schema';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { actorFromContext } from '../services/actor';
import {
  completeTask,
  createTask,
  createTicket,
  deleteChecklistItem,
  getChecklist,
  planLegacyImport,
  reorderChecklist,
  saveChecklistItem,
  setRoomStatus,
  startTask,
  updateTicket,
} from '../services/housekeeping';

function refresh() {
  revalidatePath('/housekeeping', 'layout');
  revalidatePath('/dashboard');
}

export async function setRoomStatusAction(roomId: string, status: (typeof HK_STATUSES)[number], opts: { reason?: string | null; until?: string | null } = {}) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.use');
    if (status === 'out_of_order' && !ctx.can('housekeeping.manage')) throw new UserError('Ask a supervisor to put a room out of order.');
    const result = await setRoomStatus(actorFromContext(ctx), roomId, z.enum(HK_STATUSES).parse(status), opts);
    refresh();
    revalidatePath('/rooms', 'layout');
    return result;
  });
}

export async function assignTaskAction(roomId: string, assignedTo: string | null, priority: 'low' | 'normal' | 'high' = 'normal') {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    const result = await createTask(actorFromContext(ctx), { roomId, type: 'checkout_clean', assignedTo, priority });
    refresh();
    return result;
  }, 'Task assigned.');
}

export async function startTaskAction(taskId: string) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.use');
    await startTask(actorFromContext(ctx), taskId);
    refresh();
    return { ok: true };
  });
}

const completeSchema = z.object({
  taskId: z.string().uuid(),
  results: z.array(z.object({ itemId: z.string().uuid(), result: z.enum(['ok', 'problem', 'missing']), note: z.string().max(200).optional() })),
  notes: z.string().max(500).nullable().optional(),
  inspect: z.boolean().optional(),
});

export async function completeTaskAction(input: z.input<typeof completeSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.use');
    const data = completeSchema.parse(input);
    if (data.inspect && !ctx.can('housekeeping.manage')) throw new UserError('Only a supervisor can mark a room inspected.');
    const result = await completeTask(actorFromContext(ctx), data.taskId, data);
    refresh();
    return result;
  });
}

const itemSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'Enter an item name').max(60),
  nameHi: z.string().trim().max(60).nullable().optional(),
  category: z.enum(HK_CATEGORIES),
  roomTypeIds: z.array(z.string().uuid()),
  isActive: z.boolean().optional(),
});

export async function saveChecklistItemAction(input: z.input<typeof itemSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    const result = await saveChecklistItem(actorFromContext(ctx), itemSchema.parse(input));
    refresh();
    return result;
  }, 'Checklist saved.');
}

export async function reorderChecklistAction(ids: string[]) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    await reorderChecklist(actorFromContext(ctx), z.array(z.string().uuid()).parse(ids));
    refresh();
    return { ok: true };
  });
}

export async function deleteChecklistItemAction(id: string) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    await deleteChecklistItem(actorFromContext(ctx), id);
    refresh();
    return { ok: true };
  }, 'Item removed.');
}

/** Preview: paste the old AsiaTech checklist, get one clean master item per thing. */
export async function previewLegacyImportAction(text: string) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    const existing = await getChecklist(ctx.propertyId);
    return planLegacyImport(text.split(/\r?\n|,/), existing);
  });
}

export async function applyLegacyImportAction(names: { name: string; category: (typeof HK_CATEGORIES)[number] }[]) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.manage');
    const actor = actorFromContext(ctx);
    let added = 0;
    for (const item of names) {
      try {
        await saveChecklistItem(actor, { name: item.name, category: item.category, roomTypeIds: [] });
        added++;
      } catch {
        /* duplicate: skipped on purpose */
      }
    }
    refresh();
    return { added };
  });
}

export async function updateTicketAction(id: string, status: 'open' | 'in_progress' | 'resolved') {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.use');
    await updateTicket(actorFromContext(ctx), id, status);
    refresh();
    return { ok: true };
  }, status === 'resolved' ? 'Ticket resolved.' : 'Ticket updated.');
}

export async function createTicketAction(input: { roomId?: string | null; title: string; description?: string | null; priority: 'low' | 'normal' | 'high' }) {
  return runAction(async () => {
    const ctx = await actionContext('housekeeping.use');
    const result = await createTicket(actorFromContext(ctx), input);
    refresh();
    return result;
  }, 'Repair ticket created.');
}
