'use client';

import { useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Camera, Check, ImageIcon, Loader2, Plus, Wallet, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDay, formatINR } from '@/lib/format';
import { addPettyCashAction, reviewPettyCashAction, uploadBillPhotoAction } from '@/server/actions/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented, Select } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';
import { tx } from '@/i18n/tx';

interface Entry {
  id: string;
  entryDate: string;
  type: 'opening' | 'top_up' | 'expense';
  amount: number;
  category: string | null;
  paidTo: string | null;
  description: string | null;
  billPhotoUrl: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdByName: string | null;
  balance: number;
}

const CATEGORIES = ['Housekeeping supplies', 'Repairs', 'Guest amenities', 'Transport', 'Kitchen', 'Laundry', 'Stationery', 'Staff welfare', 'Other'];

export function PettyCash({ ledger, canManage, canApprove }: { ledger: { openingBalance: number; entries: Entry[]; closingBalance: number; spent: number; added: number; pending: number }; canManage: boolean; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useRun();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-ink-900 to-ink-950 p-4 text-white shadow-card">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-400 uppercase">
            <Wallet className="h-3.5 w-3.5" /> {tx('In the cash box')}
          </p>
          <p className="num mt-1 text-2xl font-extrabold">{formatINR(ledger.closingBalance)}</p>
        </div>
        {[
          { label: 'Opening balance', value: ledger.openingBalance },
          { label: 'Added', value: ledger.added },
          { label: 'Spent', value: ledger.spent },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{s.label}</p>
            <p className="num mt-1 text-2xl font-bold text-ink-900">{formatINR(s.value)}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <p className="font-bold text-ink-900">
            Register {ledger.pending > 0 && <Badge tone="warning" className="ml-2">{ledger.pending} awaiting approval</Badge>}
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New entry
            </Button>
          )}
        </div>
        <ul className="divide-y divide-ink-100">
          {ledger.entries.map((e) => (
            <li key={e.id} className={cn('flex flex-wrap items-center gap-4 px-5 py-3', e.status === 'rejected' && 'opacity-50')}>
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', e.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
                {e.type === 'expense' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">
                  {e.type === 'opening' ? tx('Opening balance') : e.type === 'top_up' ? tx('Cash added') : e.description || e.category}
                  {e.status === 'pending' && <Badge tone="warning" className="ml-2">Pending</Badge>}
                  {e.status === 'rejected' && <Badge tone="danger" className="ml-2">Rejected</Badge>}
                </p>
                <p className="text-xs text-ink-500">
                  {formatDay(e.entryDate)}
                  {e.category && e.type === 'expense' && <> · {tx(e.category)}</>}
                  {e.paidTo && <> · {tx(`paid to ${e.paidTo}`)}</>}
                  {e.createdByName && <> · {tx(`by ${e.createdByName}`)}</>}
                </p>
              </div>
              {e.billPhotoUrl && (
                <a href={e.billPhotoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <ImageIcon className="h-3.5 w-3.5" /> {tx('Bill')}
                </a>
              )}
              {e.status === 'pending' && canApprove && (
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="success" disabled={pending} onClick={() => run(() => reviewPettyCashAction(e.id, true))} aria-label="Approve">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="outline" disabled={pending} onClick={() => run(() => reviewPettyCashAction(e.id, false))} aria-label="Reject">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <span className={cn('num w-24 text-right font-semibold', e.type === 'expense' ? 'text-rose-600' : 'text-emerald-700')}>
                {e.type === 'expense' ? '−' : '+'}
                {formatINR(e.amount)}
              </span>
              <span className="num w-24 text-right text-sm text-ink-500">{formatINR(e.balance)}</span>
            </li>
          ))}
          {ledger.entries.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-500">{tx('No entries in this period.')}</li>}
        </ul>
      </Card>
      {open && <EntryDialog onClose={() => setOpen(false)} canApprove={canApprove} />}
    </div>
  );
}

function EntryDialog({ onClose, canApprove }: { onClose: () => void; canApprove: boolean }) {
  const [form, setForm] = useState({ type: 'expense' as 'opening' | 'top_up' | 'expense', amount: 0, category: CATEGORIES[0], paidTo: '', description: '', billPhotoUrl: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { run, pending } = useRun();
  const toast = useToast();

  async function upload(file: File) {
    setUploading(true);
    const data = new FormData();
    data.set('file', file);
    const result = await uploadBillPhotoAction(data);
    setUploading(false);
    if (result.ok) setForm((f) => ({ ...f, billPhotoUrl: result.data.url }));
    else toast.error(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Petty cash entry"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => addPettyCashAction(form), { success: (d) => (d.pending ? 'Saved · waiting for manager approval' : 'Saved'), onSuccess: onClose })}>
            Save entry
          </Button>
        </>
      }
    >
      <Segmented
        value={form.type}
        onChange={(type) => setForm({ ...form, type })}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'top_up', label: 'Add cash' },
          { value: 'opening', label: 'Opening balance' },
        ]}
      />
      <Field label="Amount" className="mt-4">
        <Input type="number" min={1} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} leading={<span className="text-sm">₹</span>} className="num text-lg font-semibold" autoFocus />
      </Field>
      {form.type === 'expense' && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Paid to">
              <Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Shop / person" />
            </Field>
          </div>
          <Field label="What for" className="mt-4">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Phenyl and garbage bags" />
          </Field>
          <div className="mt-4">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {form.billPhotoUrl ? 'Bill photo added ✓' : 'Add bill photo'}
            </Button>
            {!canApprove && form.amount > 2000 && <p className="mt-2 text-xs text-amber-700">{tx('Expenses above ₹2,000 need a manager’s approval.')}</p>}
          </div>
        </>
      )}
    </Dialog>
  );
}
