'use server';

import { revalidatePath } from 'next/cache';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { actorFromContext } from '../services/actor';
import { addPettyCash, cancelLink, markLinkPaid, requestMoney, reviewPettyCash } from '../services/money';
import { auditCashMatch, auditCheckPos, auditLockDay, auditNoShows, auditPostRoomCharges } from '../services/nightaudit';

function refresh() {
  revalidatePath('/', 'layout');
}

const requestSchema = z.object({
  bookingId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'Enter the payer name'),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').nullable().optional(),
  email: z.string().trim().email().or(z.literal('')).nullable().optional(),
  amount: z.number().positive('Enter an amount'),
  purpose: z.string().trim().min(3, 'Say what the payment is for'),
  channel: z.enum(['whatsapp', 'sms', 'none']),
  expiresInHours: z.number().int().min(1).max(24 * 30),
});

export async function requestMoneyAction(input: z.input<typeof requestSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('money.manage');
    const data = requestSchema.parse(input);
    const result = await requestMoney({ ...actorFromContext(ctx), hotelName: ctx.property.name }, data);
    refresh();
    return result;
  });
}

/** Front desk confirms a payment that arrived outside the link (e.g. guest paid by UPI to the counter QR). */
export async function markRequestPaidAction(linkId: string, reference: string) {
  return runAction(async () => {
    await actionContext('money.manage');
    const result = await markLinkPaid(linkId, reference || 'Marked paid at desk');
    refresh();
    return result;
  }, 'Marked as paid and added to the bill.');
}

export async function cancelRequestAction(paymentId: string) {
  return runAction(async () => {
    const ctx = await actionContext('money.manage');
    await cancelLink(actorFromContext(ctx), paymentId);
    refresh();
    return { ok: true };
  }, 'Payment link cancelled.');
}

const pettySchema = z.object({
  type: z.enum(['opening', 'top_up', 'expense']),
  amount: z.number().positive('Enter an amount'),
  category: z.string().trim().max(60).nullable().optional(),
  paidTo: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  billPhotoUrl: z.string().max(300).nullable().optional(),
  entryDate: z.string().nullable().optional(),
});

export async function addPettyCashAction(input: z.input<typeof pettySchema>) {
  return runAction(async () => {
    const ctx = await actionContext('money.manage');
    const data = pettySchema.parse(input);
    if (data.type !== 'expense' && !ctx.can('nightaudit.run') && !['owner', 'manager'].includes(ctx.role.key)) throw new UserError('Only a manager or accountant can add cash to the box.');
    const result = await addPettyCash({ ...actorFromContext(ctx), canApprove: ['owner', 'manager', 'accountant'].includes(ctx.role.key) }, data);
    refresh();
    return result;
  });
}

export async function reviewPettyCashAction(id: string, approve: boolean) {
  return runAction(async () => {
    const ctx = await actionContext('money.manage');
    if (!['owner', 'manager', 'accountant'].includes(ctx.role.key)) throw new UserError('Only a manager can approve expenses.');
    await reviewPettyCash(actorFromContext(ctx), id, approve);
    refresh();
    return { ok: true };
  }, approve ? 'Expense approved.' : 'Expense rejected.');
}

/** Bill photos are stored on local disk in development (public/uploads); use object storage in production. */
export async function uploadBillPhotoAction(formData: FormData) {
  return runAction(async () => {
    await actionContext('money.manage');
    const file = formData.get('file');
    if (!(file instanceof File)) throw new UserError('Choose a photo.');
    if (file.size > 5 * 1024 * 1024) throw new UserError('Photo must be under 5 MB.');
    if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type)) throw new UserError('Upload a JPG, PNG or WebP photo.');
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    const dir = path.join(process.cwd(), 'public', 'uploads', 'bills');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    return { url: `/uploads/bills/${name}` };
  });
}

/* ───────── Night Audit ───────── */

export async function auditNoShowsAction(bookingIds: string[]) {
  return runAction(async () => {
    const ctx = await actionContext('nightaudit.run');
    const result = await auditNoShows(actorFromContext(ctx), z.array(z.string().uuid()).parse(bookingIds));
    refresh();
    return result;
  });
}

export async function auditRoomChargesAction() {
  return runAction(async () => {
    const ctx = await actionContext('nightaudit.run');
    const result = await auditPostRoomCharges(actorFromContext(ctx));
    refresh();
    return result;
  });
}

export async function auditPosAction() {
  return runAction(async () => {
    const ctx = await actionContext('nightaudit.run');
    const result = await auditCheckPos(actorFromContext(ctx));
    refresh();
    return result;
  });
}

export async function auditCashAction(counted: number, note?: string | null) {
  return runAction(async () => {
    const ctx = await actionContext('nightaudit.run');
    const result = await auditCashMatch(actorFromContext(ctx), counted, note);
    refresh();
    return result;
  });
}

export async function auditLockAction() {
  return runAction(async () => {
    const ctx = await actionContext('nightaudit.run');
    const result = await auditLockDay({ ...actorFromContext(ctx), emails: ctx.property.settings.notifications.emails, hotelName: ctx.property.name });
    refresh();
    return result;
  });
}
