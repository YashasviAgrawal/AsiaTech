import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * SMTP email (EMAIL_PROVIDER=smtp). SMTP_URL holds the server and login, e.g.
 * smtps://user%40hotel.com:app-password@smtp.gmail.com:465 or smtp://apikey:KEY@smtp-relay.brevo.com:587.
 * EMAIL_FROM is the sending address the mail service allows (the hotel's name is shown in front of it).
 */
let transporter: Transporter | null = null;

function transport(): Transporter {
  if (transporter) return transporter;
  const url = process.env.SMTP_URL;
  if (!url) throw new Error('EMAIL_PROVIDER=smtp needs SMTP_URL');
  transporter = nodemailer.createTransport(url);
  return transporter;
}

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  fromName?: string;
  replyTo?: string | null;
}

export async function sendEmail(input: EmailInput) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_PROVIDER=smtp needs EMAIL_FROM');
  const name = input.fromName?.replace(/["<>\r\n]/g, '').trim();
  await transport().sendMail({
    from: name ? { name, address: from } : from,
    to: input.to,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
}

/** For tests: drop the cached connection so a new SMTP_URL is picked up. */
export function resetEmailTransport() {
  transporter = null;
}
