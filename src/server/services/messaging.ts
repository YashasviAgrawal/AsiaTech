import 'server-only';
import { db, type DbOrTx } from '@/db';
import { messageLog } from '@/db/schema';
import { normaliseMobile } from '@/lib/utils';
import { sendEmail } from './email';

/**
 * WhatsApp / SMS / email sending behind one interface. The default "console" provider logs the message and
 * marks it sent, so every flow works in development. Email goes through SMTP when EMAIL_PROVIDER=smtp
 * (any mail service: Gmail / Google Workspace, Zoho, Amazon SES, Brevo). Swap in a WhatsApp Business API
 * provider by setting WHATSAPP_PROVIDER and adding its adapter here.
 */
export interface OutgoingMessage {
  propertyId: string;
  channel: 'whatsapp' | 'sms' | 'email';
  to: string;
  template: string;
  body: string;
  /** Email only. */
  subject?: string;
  /** Email only, e.g. the invoice PDF. */
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  /** Email only: the hotel's name and address shown as the sender and for replies. */
  fromName?: string;
  replyTo?: string | null;
  entityType?: string;
  entityId?: string;
  sentBy?: string | null;
  /** What the message log keeps instead of the body, when the body holds a secret (a password reset link). */
  logBody?: string;
}

export async function sendMessage(message: OutgoingMessage, tx: DbOrTx = db): Promise<{ id: string; status: 'sent' | 'failed' }> {
  const recipient = message.channel === 'email' ? message.to.trim() : normaliseMobile(message.to) ?? message.to;
  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  const provider = message.channel === 'whatsapp' ? process.env.WHATSAPP_PROVIDER ?? 'console' : message.channel === 'email' ? process.env.EMAIL_PROVIDER ?? 'console' : 'console';
  try {
    if (provider === 'console') {
      const files = message.attachments?.map((a) => `${a.filename} (${Math.round(a.content.length / 1024)} KB)`).join(', ');
      console.info(`[${message.channel}] → ${recipient}${message.subject ? ` · ${message.subject}` : ''}\n${message.body}${files ? `\n📎 ${files}` : ''}`);
    } else if (message.channel === 'email' && provider === 'smtp') {
      await sendEmail({ to: recipient, subject: message.subject ?? message.template, text: message.body, attachments: message.attachments, fromName: message.fromName, replyTo: message.replyTo });
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
      body: message.logBody ?? (message.attachments?.length ? `${message.body}\n\n📎 ${message.attachments.map((a) => a.filename).join(', ')}` : message.body),
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
