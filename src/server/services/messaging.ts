import 'server-only';
import { db, type DbOrTx } from '@/db';
import { messageLog } from '@/db/schema';
import { normaliseMobile } from '@/lib/utils';

/**
 * WhatsApp / SMS / email sending behind one interface. The default "console" provider logs the message and
 * marks it sent, so every flow works in development. Swap in a WhatsApp Business API provider by setting
 * WHATSAPP_PROVIDER and adding its adapter here.
 */
export interface OutgoingMessage {
  propertyId: string;
  channel: 'whatsapp' | 'sms' | 'email';
  to: string;
  template: string;
  body: string;
  entityType?: string;
  entityId?: string;
  sentBy?: string | null;
}

export async function sendMessage(message: OutgoingMessage, tx: DbOrTx = db): Promise<{ id: string; status: 'sent' | 'failed' }> {
  const recipient = message.channel === 'email' ? message.to.trim() : normaliseMobile(message.to) ?? message.to;
  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  const provider = message.channel === 'whatsapp' ? process.env.WHATSAPP_PROVIDER ?? 'console' : 'console';
  try {
    if (provider === 'console') {
      console.info(`[${message.channel}] → ${recipient}\n${message.body}`);
    } else {
      throw new Error(`Provider "${provider}" is not configured`);
    }
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : String(e);
  }
  const [row] = await tx
    .insert(messageLog)
    .values({
      propertyId: message.propertyId,
      channel: message.channel,
      recipient,
      template: message.template,
      body: message.body,
      status,
      entityType: message.entityType ?? null,
      entityId: message.entityId ?? null,
      error,
      sentBy: message.sentBy ?? null,
    })
    .returning({ id: messageLog.id });
  return { id: row.id, status };
}

/** "https://wa.me/91XXXXXXXXXX?text=…" so staff can also send from their own WhatsApp in one click. */
export function waLink(mobile: string, text: string): string {
  const m = normaliseMobile(mobile) ?? mobile;
  return `https://wa.me/91${m}?text=${encodeURIComponent(text)}`;
}
