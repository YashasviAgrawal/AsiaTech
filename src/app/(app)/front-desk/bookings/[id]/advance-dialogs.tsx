'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Check, HandCoins, Undo2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { splitInclusiveCharge } from '@/lib/booking-money';
import { useTr } from '@/i18n/client';
import { tx } from '@/i18n/tx';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/fields';

type Mode = 'upi' | 'cash' | 'card' | 'bank_transfer';
type Choice = 'refund' | 'keep' | 'later';

export interface AdvanceDecision {
  keep: number;
  refund: number;
  mode: Mode;
  reference: string | null;
}

/** State for the "what happens to the advance" choice, shared by the cancel and settle dialogs. */
function useAdvanceChoice(held: number, initial: Choice) {
  const [choice, setChoice] = useState<Choice>(initial);
  const [keep, setKeep] = useState(Math.round(held * 100) / 100);
  const [mode, setMode] = useState<Mode>('upi');
  const [reference, setReference] = useState('');
  const keepAmount = choice === 'keep' ? Math.max(0, keep) : 0;
  const refund = choice === 'refund' ? held : choice === 'keep' ? Math.max(0, Math.round((held - keepAmount) * 100) / 100) : 0;
  const decision: AdvanceDecision | null = choice === 'later' ? null : { keep: keepAmount, refund, mode, reference: reference.trim() || null };
  const valid = choice === 'later' || (choice === 'refund' ? held > 0 : keepAmount > 0);
  return { choice, setChoice, keep, setKeep, mode, setMode, reference, setReference, refund, keepAmount, decision, valid };
}

type ChoiceState = ReturnType<typeof useAdvanceChoice>;

function Option({ value, state, icon, title, children }: { value: Choice; state: ChoiceState; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  const tr = useTr();
  const selected = state.choice === value;
  return (
    <div className={cn('rounded-xl border bg-white transition', selected ? 'border-brand-400 ring-2 ring-brand-100' : 'border-ink-200 hover:border-ink-300')}>
      <button type="button" role="radio" aria-checked={selected} onClick={() => state.setChoice(value)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', selected ? 'bg-brand-50 text-brand-600' : 'bg-ink-50 text-ink-500')}>{icon}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">{tr(title)}</span>
        <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300')}>
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </button>
      {selected && children && <div className="border-t border-ink-100 px-3.5 py-3">{children}</div>}
    </div>
  );
}

/** Refund, keep (with a GST invoice) or decide later. `rate` is the GST rate of the rooms the money was for. */
function AdvanceChoice({ state, held, rate, noShow, allowLater }: { state: ChoiceState; held: number; rate: number; noShow: boolean; allowLater: boolean }) {
  const tr = useTr();
  const id = useId();
  const split = splitInclusiveCharge(state.keepAmount, rate);
  const what = noShow ? 'no-show' : 'cancellation';
  return (
    <div className="space-y-2" role="radiogroup" aria-label={tr('What happens to the advance?')}>
      <Option value="refund" state={state} icon={<Undo2 className="h-4 w-4" />} title={`Refund ${formatINR(held)} to the guest`} />
      <Option value="keep" state={state} icon={<HandCoins className="h-4 w-4" />} title={`Keep it as a ${what} charge`}>
        <Field label="Amount kept (incl. GST)" htmlFor={`${id}-keep`}>
          <Input
            id={`${id}-keep`}
            type="number"
            min={0}
            step="0.01"
            value={state.keep || ''}
            onChange={(e) => state.setKeep(Number(e.target.value) || 0)}
            leading={<span className="text-sm">₹</span>}
            className="num font-semibold"
          />
        </Field>
        {state.keepAmount > 0 && (
          <p className="mt-2 text-xs text-ink-600">
            {tr(`GST invoice: ${formatINR(split.taxable)} + ${formatINR(split.tax)} GST (${rate}%)`)}
          </p>
        )}
        {state.keepAmount > 0 && state.keepAmount < held - 0.005 && (
          <p className="mt-1 text-xs font-medium text-ink-800">{tr(`The other ${formatINR(state.refund)} is refunded.`)}</p>
        )}
        {state.keepAmount > held + 0.005 && (
          <p className="mt-1 text-xs font-medium text-amber-700">{tr(`${formatINR(state.keepAmount - held)} more is still due and goes on the credit report.`)}</p>
        )}
      </Option>
      {allowLater && (
        <Option value="later" state={state} icon={<Clock className="h-4 w-4" />} title="Decide later">
          <p className="text-xs text-ink-600">{tr('It stays on Home as a task until you refund or keep it.')}</p>
        </Option>
      )}
      {state.refund > 0 && (
        <div className="grid gap-3 pt-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Field label={`Refund ${formatINR(state.refund)} by`}>
            <Segmented
              value={state.mode}
              onChange={state.setMode}
              options={[
                { value: 'upi', label: 'UPI' },
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'bank_transfer', label: 'Bank' },
              ]}
            />
          </Field>
          {state.mode !== 'cash' && (
            <Field label="Reference" htmlFor={`${id}-ref`}>
              <Input id={`${id}-ref`} value={state.reference} onChange={(e) => state.setReference(e.target.value)} placeholder="UPI / card transaction ID" />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Cancel, release a hold or mark no-show. With money already paid, the same step says what happens to it: refunded,
 * kept as a charge (GST invoice) or decided later from Home.
 */
export function CancelDialog({
  kind,
  title,
  description,
  confirmLabel,
  held,
  rate,
  canMoney,
  loading,
  onClose,
  onConfirm,
}: {
  kind: 'cancel' | 'noshow';
  title: string;
  description: string;
  confirmLabel: string;
  held: number;
  rate: number;
  canMoney: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string, decision: AdvanceDecision | null) => void;
}) {
  const tr = useTr();
  const [reason, setReason] = useState('');
  const hasAdvance = held > 0.5 && canMoney;
  const state = useAdvanceChoice(held, 'later');
  const reasonOk = kind === 'noshow' || reason.trim().length >= 3;
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      size={hasAdvance ? 'md' : 'sm'}
      icon={
        <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Go back
          </Button>
          <Button variant="danger" loading={loading} disabled={!reasonOk || (hasAdvance && !state.valid)} onClick={() => onConfirm(reason.trim(), hasAdvance ? state.decision : null)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {kind === 'cancel' && (
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type a short reason" autoFocus />
        </Field>
      )}
      {hasAdvance && (
        <div className={kind === 'cancel' ? 'mt-5' : undefined}>
          <p className="mb-2 text-sm font-semibold text-ink-900">{tr(`${formatINR(held)} advance was paid. What happens to it?`)}</p>
          <AdvanceChoice state={state} held={held} rate={rate} noShow={kind === 'noshow'} allowLater />
        </div>
      )}
      {held > 0.5 && !canMoney && <p className={cn('text-sm text-ink-600', kind === 'cancel' && 'mt-4')}>{tr(`The ${formatINR(held)} advance stays on Home for the manager to refund or keep.`)}</p>}
      {kind === 'noshow' && held <= 0.5 && <p className="text-sm text-ink-600">{tx('You can restore the booking if the guest turns up.')}</p>}
    </Dialog>
  );
}

/** Refund or keep an advance still held on a cancelled or no-show booking. */
export function SettleAdvanceDialog({
  held,
  rate,
  noShow,
  loading,
  onClose,
  onConfirm,
}: {
  held: number;
  rate: number;
  noShow: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (decision: AdvanceDecision) => void;
}) {
  const tr = useTr();
  const state = useAdvanceChoice(held, 'refund');
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${formatINR(held)} advance held`}
      description={noShow ? 'The guest did not arrive. Refund the money or keep it as a no-show charge.' : 'The booking is cancelled. Refund the money or keep it as a cancellation charge.'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Go back
          </Button>
          <Button loading={loading} disabled={!state.valid} onClick={() => state.decision && onConfirm(state.decision)}>
            {state.choice === 'refund'
              ? tr(`Refund ${formatINR(held)}`)
              : state.refund > 0
                ? tr(`Keep ${formatINR(state.keepAmount)}, refund ${formatINR(state.refund)}`)
                : tr(`Keep ${formatINR(state.keepAmount)} and make invoice`)}
          </Button>
        </>
      }
    >
      <AdvanceChoice state={state} held={held} rate={rate} noShow={noShow} allowLater={false} />
    </Dialog>
  );
}
