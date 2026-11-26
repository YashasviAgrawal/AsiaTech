'use server';

import { revalidatePath } from 'next/cache';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { sendMessage } from '../services/messaging';

export async function sendCustomMessageAction(to: string, body: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    if (!/^[6-9]\d{9}$/.test(to)) throw new UserError('Enter a 10-digit mobile number.');
    if (body.trim().length < 5) throw new UserError('Write a message.');
    const result = await sendMessage({ propertyId: ctx.propertyId, channel: 'whatsapp', to, template: 'custom', body: body.trim(), sentBy: ctx.userId });
    revalidatePath('/messages');
    return result;
  });
}
