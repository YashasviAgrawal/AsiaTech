'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionContext } from '../context';
import { runAction } from '../action';
import { actorFromContext } from '../services/actor';
import { createAgentKey, deletePrinter, queueBill, queueKot, queueTest, retryJob, revokeAgent, savePrinter } from '../services/printing';

const refresh = () => revalidatePath('/restaurant/printers');

const printerSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(60),
  outletId: z.string().uuid().nullable(),
  role: z.enum(['kot', 'bill', 'both']),
  connection: z.enum(['network', 'shared']),
  address: z.string().min(1).max(200),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  copies: z.number().int().min(1).max(5),
  autoPrint: z.boolean(),
  isActive: z.boolean(),
});

export async function savePrinterAction(input: z.input<typeof printerSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    const result = await savePrinter(actorFromContext(ctx), printerSchema.parse(input));
    refresh();
    return result;
  });
}

export async function deletePrinterAction(printerId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    await deletePrinter(actorFromContext(ctx), z.string().uuid().parse(printerId));
    refresh();
    return { ok: true };
  }, 'Printer removed.');
}

export async function testPrintAction(printerId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    const name = await queueTest(actorFromContext(ctx), z.string().uuid().parse(printerId));
    refresh();
    return { name };
  });
}

export async function createAgentKeyAction(name: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    const result = await createAgentKey(actorFromContext(ctx), z.string().max(60).parse(name));
    refresh();
    return { ...result, server: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '') };
  });
}

export async function revokeAgentAction(agentId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    await revokeAgent(actorFromContext(ctx), z.string().uuid().parse(agentId));
    refresh();
    return { ok: true };
  }, 'Key revoked. That PC can no longer print.');
}

export async function retryJobAction(jobId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    await retryJob(actorFromContext(ctx), z.string().uuid().parse(jobId));
    refresh();
    return { ok: true };
  }, 'Sent to the printer again.');
}

/** Reprint from the orders screen: on the printers if there are any, otherwise the caller opens the browser print page. */
export async function reprintAction(orderId: string, what: { kotNo: number } | 'bill') {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    const actor = actorFromContext(ctx);
    const id = z.string().uuid().parse(orderId);
    const printedOn = what === 'bill' ? await queueBill(actor, id, { auto: false }) : await queueKot(actor, id, what.kotNo, { auto: false, byName: ctx.user.name });
    refresh();
    return { printedOn };
  });
}
