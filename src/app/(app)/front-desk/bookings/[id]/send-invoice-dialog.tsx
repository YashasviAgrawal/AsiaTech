'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileText, Mail, MessageCircle, Paperclip, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { useTr } from '@/i18n/client';
import { invoiceLinkAction, sendInvoiceAction } from '@/server/actions/frontoffice';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';

type LinkInfo = { url: string; mobile: string | null; email: string | null; invoiceNo: string; total: number; due: number; status: string; text: string };

/**
 * Send the GST invoice to the guest. Opens on its own right after check-out, so the bill goes out while the
 * guest is still at the desk. WhatsApp carries the PDF link; email carries the PDF itself.
 */
export function SendInvoiceDialog({ invoiceId, onClose, afterCheckout = false }: { invoiceId: string; onClose: () => void; afterCheckout?: boolean }) {
  const tr = useTr();
  const toast = useToast();
  const { run, pending } = useRun();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWhatsApp, setUseWhatsApp] = useState(true);
  const [useEmail, setUseEmail] = useState(true);
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    invoiceLinkAction(invoiceId).then((result) => {
      if (!active) return;
      if (!result.ok) return setError(result.error);
      setInfo(result.data);
      setMobile(result.data.mobile ?? '');
      setEmail(result.data.email ?? '');
      setUseWhatsApp(!!result.data.mobile || !result.data.email);
      setUseEmail(!!result.data.email);
    });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  const mobileOk = /^[6-9]\d{9}$/.test(mobile.replace(/\D/g, '').slice(-10));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const whatsappOn = useWhatsApp && mobile.trim() !== '';
  const emailOn = useEmail && email.trim() !== '';
  const canSend = !!info && info.status !== 'cancelled' && (whatsappOn || emailOn) && (!whatsappOn || mobileOk) && (!emailOn || emailOk);

  async function copyLink() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.');
    }
  }

  const ownWhatsApp = info && mobileOk ? `https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(info.text)}` : null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<FileText className="h-5 w-5" />}
      title={info ? `${tr('Send invoice')} ${info.invoiceNo}` : 'Send invoice'}
      description={info ? `${formatINR(info.total, { paise: true })} · ${info.due > 0.5 ? `${tr('Balance due')} ${formatINR(info.due)}` : tr('Fully paid')}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {afterCheckout ? 'Not now' : 'Close'}
          </Button>
          <Button
            loading={pending}
            disabled={!canSend}
            onClick={() =>
              run(() => sendInvoiceAction({ invoiceId, whatsapp: whatsappOn ? mobile : null, email: emailOn ? email : null }), {
                success: (d) => {
                  const ok = d.results.filter((r) => r.status === 'sent').map((r) => (r.channel === 'whatsapp' ? 'WhatsApp' : 'email'));
                  const failed = d.results.filter((r) => r.status === 'failed').map((r) => (r.channel === 'whatsapp' ? 'WhatsApp' : 'email'));
                  return `${tr('Invoice sent by')} ${ok.join(' + ')}${failed.length ? ` · ${failed.join(', ')} ${tr('failed')}` : ''}`;
                },
                onSuccess: onClose,
              })
            }
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : !info ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {afterCheckout && (
            <Alert tone="success" icon={<Check className="h-4 w-4" />}>
              Checked out. The room is sent to housekeeping. Send the bill while the guest is still at the desk.
            </Alert>
          )}
          {info.status === 'cancelled' && <Alert tone="warning">This invoice is cancelled and cannot be sent.</Alert>}

          <ChannelRow
            on={useWhatsApp}
            onToggle={setUseWhatsApp}
            icon={<MessageCircle className="h-4.5 w-4.5" />}
            tone="emerald"
            title="WhatsApp"
            hint="A short message with a link to the PDF"
          >
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit mobile" inputMode="tel" invalid={whatsappOn && !mobileOk} leading={<span className="text-xs font-semibold text-ink-400">+91</span>} />
          </ChannelRow>

          <ChannelRow on={useEmail} onToggle={setUseEmail} icon={<Mail className="h-4.5 w-4.5" />} tone="brand" title="Email" hint="The PDF invoice is attached">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@example.com" type="email" invalid={emailOn && !emailOk} />
          </ChannelRow>

          {useWhatsApp && (
            <div className="rounded-2xl bg-[#e7f5ee] p-3.5">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-emerald-800/70 uppercase">{tr('Message preview')}</p>
              <div className="max-w-[92%] rounded-xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-ink-800 shadow-sm">
                {info.text.split(/(\*[^*]+\*)/g).map((part, i) => (part.startsWith('*') && part.endsWith('*') ? <strong key={i}>{part.slice(1, -1)}</strong> : <span key={i}>{part}</span>))}
              </div>
              {useEmail && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-900/70">
                  <Paperclip className="h-3.5 w-3.5" /> {tr('The email also carries the PDF.')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            <a href={`/api/invoices/${invoiceId}/pdf`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-ink-50">
              <Download className="h-4 w-4" /> {tr('Download PDF')}
            </a>
            <button type="button" onClick={copyLink} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-ink-50">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {tr(copied ? 'Copied' : 'Copy guest link')}
            </button>
            {ownWhatsApp && (
              <a href={ownWhatsApp} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-emerald-700 ring-1 ring-ink-200 transition hover:bg-emerald-50">
                <MessageCircle className="h-4 w-4" /> {tr('Send from my WhatsApp')}
              </a>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ChannelRow({
  on,
  onToggle,
  icon,
  tone,
  title,
  hint,
  children,
}: {
  on: boolean;
  onToggle: (value: boolean) => void;
  icon: React.ReactNode;
  tone: 'emerald' | 'brand';
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const tr = useTr();
  return (
    <div className={cn('rounded-2xl p-3.5 ring-1 transition', on ? 'bg-white ring-ink-200 shadow-sm' : 'bg-ink-50/60 ring-ink-100')}>
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 accent-brand-600" />
        <span className={cn('grid h-8 w-8 place-items-center rounded-xl', tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600')}>{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">{tr(title)}</span>
          <span className="block text-xs text-ink-500">{tr(hint)}</span>
        </span>
      </label>
      {on && <div className="mt-3 pl-7">{children}</div>}
    </div>
  );
}
