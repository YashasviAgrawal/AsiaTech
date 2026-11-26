'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChefHat, Copy, Download, KeyRound, Laptop, Network, Pencil, Plus, Printer, Receipt, RotateCcw, Trash2, Usb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { useTr } from '@/i18n/client';
import { createAgentKeyAction, deletePrinterAction, retryJobAction, revokeAgentAction, savePrinterAction, testPrintAction } from '@/server/actions/printing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Segmented, Select, Stepper } from '@/components/ui/fields';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';

type PrinterRow = {
  id: string;
  name: string;
  outletId: string | null;
  outletName: string | null;
  role: 'kot' | 'bill' | 'both';
  connection: 'network' | 'shared';
  address: string;
  paperWidth: number;
  copies: number;
  autoPrint: boolean;
  isActive: boolean;
};
type AgentRow = { id: string; name: string; keyHint: string; lastSeenAt: string | null; lastSeenLabel: string | null; lastIp: string | null; online: boolean };
type JobRow = { id: string; kind: 'kot' | 'bill' | 'test'; label: string; status: 'queued' | 'printing' | 'printed' | 'failed'; attempts: number; error: string | null; createdAt: string; printedAt: string | null; printerName: string };

const ROLE_LABEL = { kot: 'KOT (kitchen)', bill: 'Bills (counter)', both: 'KOT + bills' } as const;

export function PrintersManager({ printers, agents, jobs, outlets, staleMinutes }: { printers: PrinterRow[]; agents: AgentRow[]; jobs: JobRow[]; outlets: { id: string; name: string }[]; staleMinutes: number }) {
  const router = useRouter();
  // Agent status and job results change on their own: refresh while the page is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <PrintersCard printers={printers} outlets={outlets} agentOnline={agents.some((a) => a.online)} />
        <JobsCard jobs={jobs} staleMinutes={staleMinutes} />
      </div>
      <AgentCard agents={agents} />
    </div>
  );
}

/* ───────────────────────────── agent ───────────────────────────── */

function AgentCard({ agents }: { agents: AgentRow[] }) {
  const tr = useTr();
  const { run, pending } = useRun();
  const [created, setCreated] = useState<{ key: string; server: string } | null>(null);
  const [revoking, setRevoking] = useState<AgentRow | null>(null);
  const online = agents.some((a) => a.online);

  return (
    <Card className="h-fit">
      <CardHeader
        icon={<Laptop className="h-4 w-4" />}
        title="Print agent"
        description="Runs on one PC in the hotel that stays on during service."
        action={
          agents.length > 0 ? (
            <Badge tone={online ? 'success' : 'warning'} dot>
              {online ? 'Online' : 'Offline'}
            </Badge>
          ) : undefined
        }
      />
      <div className="space-y-4 p-5 pt-1">
        {agents.length > 0 && (
          <ul className="space-y-2">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5 ring-1 ring-ink-100">
                <span className={cn('relative h-2.5 w-2.5 shrink-0 rounded-full', a.online ? 'bg-emerald-500' : 'bg-ink-300')}>
                  {a.online && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{a.name}</p>
                  <p className="truncate text-xs text-ink-500">
                    <span className="font-mono">…{a.keyHint}</span> · {a.lastSeenLabel ? `${tr(a.online ? 'Connected' : 'Last seen')} ${a.lastSeenLabel}` : tr('Never connected yet')}
                  </p>
                </div>
                <button type="button" onClick={() => setRevoking(a)} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 hover:bg-rose-50 hover:text-rose-600">
                  {tr('Revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ol className="space-y-3 text-sm">
          <Step n={1} title="Install Node.js 18 or newer on the PC">
            {tr('Free from nodejs.org. Choose the LTS version.')}
          </Step>
          <Step n={2} title="Download the print agent">
            <a href="/api/print-agent/download" className="mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
              <Download className="h-3.5 w-3.5" /> asiatech-print-agent.mjs
            </a>
          </Step>
          <Step n={3} title="Create a key and run the command it shows">
            <Button size="sm" variant="soft" className="mt-1.5" loading={pending} onClick={() => run(() => createAgentKeyAction('Front desk PC'), { success: 'Key created', onSuccess: (d) => setCreated({ key: d.key, server: d.server }) })}>
              <KeyRound className="h-3.5 w-3.5" /> {tr('Create agent key')}
            </Button>
          </Step>
          <Step n={4} title="Add your printers on the left and press Test">
            {tr('Network printers need a fixed IP address (set it in the router or the printer menu).')}
          </Step>
        </ol>
      </div>

      {created && <KeyDialog created={created} onClose={() => setCreated(null)} />}
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke key …${revoking?.keyHint ?? ''}?`}
        description="The PC using it stops printing at once. Create a new key to connect it again."
        confirmLabel="Revoke key"
        variant="danger"
        onConfirm={async () => {
          if (revoking) await run(() => revokeAgentAction(revoking.id), { onSuccess: () => setRevoking(null) });
        }}
      />
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  const tr = useTr();
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-900 text-[11px] font-bold text-white">{n}</span>
      <div className="min-w-0 pt-0.5">
        <p className="font-semibold text-ink-900">{tr(title)}</p>
        {children && <div className="mt-0.5 text-xs leading-relaxed text-ink-500">{children}</div>}
      </div>
    </li>
  );
}

function CopyLine({ value, label }: { value: string; label: string }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-500">{tr(label)}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-xs break-all text-emerald-300">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="grid w-10 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-ink-200 hover:bg-ink-50"
          aria-label={tr('Copy')}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-ink-500" />}
        </button>
      </div>
    </div>
  );
}

function KeyDialog({ created, onClose }: { created: { key: string; server: string }; onClose: () => void }) {
  const command = `node asiatech-print-agent.mjs --server ${created.server} --key ${created.key}`;
  return (
    <Dialog open onClose={onClose} size="lg" icon={<KeyRound className="h-5 w-5" />} title="Agent key created" description="Copy it now: it is shown only once." footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-4">
        <CopyLine label="Run this on the print PC (in the folder where you saved the agent)" value={command} />
        <CopyLine label="Key only" value={created.key} />
        <Alert tone="info">
          To start it with Windows: put the command in a file named start-printing.bat and add a shortcut to it in the Startup folder (Win + R → shell:startup).
        </Alert>
      </div>
    </Dialog>
  );
}

/* ───────────────────────────── printers ───────────────────────────── */

function PrintersCard({ printers, outlets, agentOnline }: { printers: PrinterRow[]; outlets: { id: string; name: string }[]; agentOnline: boolean }) {
  const tr = useTr();
  const toast = useToast();
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<PrinterRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PrinterRow | null>(null);

  return (
    <Card>
      <CardHeader
        icon={<Printer className="h-4 w-4" />}
        title="Printers"
        description="KOTs go to the kitchen printer, bills to the counter printer. Without a printer here, the terminal opens the browser print window as before."
        action={
          <Button size="sm" variant="soft" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add printer
          </Button>
        }
      />
      {printers.length === 0 ? (
        <div className="p-5 pt-0">
          <EmptyState icon={<ChefHat className="h-5 w-5" />} title="No printers yet" description="Add the kitchen printer first: every KOT then prints there the moment it is sent." />
        </div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {printers.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5', !p.isActive && 'opacity-60')}>
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', p.role === 'bill' ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600')}>
                {p.role === 'bill' ? <Receipt className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink-900">{p.name}</p>
                  <Badge tone={p.role === 'bill' ? 'info' : p.role === 'both' ? 'violet' : 'warning'}>{ROLE_LABEL[p.role]}</Badge>
                  {!p.isActive && <Badge>Off</Badge>}
                  {p.isActive && !p.autoPrint && <Badge tone="neutral">Reprints only</Badge>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                  {p.connection === 'network' ? <Network className="h-3.5 w-3.5" /> : <Usb className="h-3.5 w-3.5" />}
                  <span className="font-mono">{p.address}</span>
                  <span>·</span>
                  <span>{p.paperWidth} mm</span>
                  {p.copies > 1 && (
                    <>
                      <span>·</span>
                      <span>
                        {p.copies} {tr('copies')}
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>{p.outletName ?? tr('All outlets')}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => testPrintAction(p.id), {
                      success: (d) => `${tr('Test page sent to')} ${d.name}`,
                      onSuccess: () => {
                        if (!agentOnline) toast.info('The print agent is offline', 'The test page prints as soon as the agent PC is on.');
                      },
                    })
                  }
                >
                  <Printer className="h-3.5 w-3.5" /> Test
                </Button>
                <button type="button" onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Edit ${p.name}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setDeleting(p)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${p.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <PrinterDialog printer={editing === 'new' ? null : editing} outlets={outlets} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name ?? ''}?`}
        description="Tickets waiting for this printer are dropped. KOTs then use another printer, or the browser print window."
        confirmLabel="Remove printer"
        variant="danger"
        onConfirm={async () => {
          if (deleting) await run(() => deletePrinterAction(deleting.id), { onSuccess: () => setDeleting(null) });
        }}
      />
    </Card>
  );
}

function PrinterDialog({ printer, outlets, onClose }: { printer: PrinterRow | null; outlets: { id: string; name: string }[]; onClose: () => void }) {
  const tr = useTr();
  const { run, pending } = useRun();
  const [form, setForm] = useState({
    name: printer?.name ?? (outlets.length ? 'Kitchen' : ''),
    outletId: printer?.outletId ?? '',
    role: printer?.role ?? ('kot' as PrinterRow['role']),
    connection: printer?.connection ?? ('network' as PrinterRow['connection']),
    address: printer?.address ?? '',
    paperWidth: String(printer?.paperWidth ?? 80) as '58' | '80',
    copies: printer?.copies ?? 1,
    autoPrint: printer?.autoPrint ?? true,
    isActive: printer?.isActive ?? true,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Printer className="h-5 w-5" />}
      title={printer ? `Edit ${printer.name}` : 'Add printer'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(() => savePrinterAction({ ...form, id: printer?.id ?? null, outletId: form.outletId || null, paperWidth: form.paperWidth === '58' ? 58 : 80 }), { success: 'Printer saved', onSuccess: onClose })
            }
          >
            Save printer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Kitchen" autoFocus />
          </Field>
          <Field label="Outlet">
            <Select value={form.outletId} onChange={(e) => set('outletId', e.target.value)}>
              <option value="">{tr('All outlets')}</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Prints">
          <Segmented
            value={form.role}
            onChange={(v) => set('role', v)}
            options={[
              { value: 'kot', label: 'KOT' },
              { value: 'bill', label: 'Bills' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </Field>
        <Field label="Connected by">
          <Segmented
            value={form.connection}
            onChange={(v) => set('connection', v)}
            options={[
              { value: 'network', label: 'Network (LAN / Wi-Fi)' },
              { value: 'shared', label: 'USB on the agent PC' },
            ]}
          />
        </Field>
        <Field
          label={form.connection === 'network' ? 'Printer IP address' : 'Printer path on the agent PC'}
          hint={form.connection === 'network' ? 'Print a self-test page on the printer (hold FEED while switching on) to see its IP. Port 9100 is added for you.' : 'Windows: share the printer (Generic / Text Only driver) and enter \\\\localhost\\SHARE-NAME. Linux: /dev/usb/lp0.'}
          required
        >
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder={form.connection === 'network' ? '192.168.1.50' : '\\\\localhost\\KOT'} className="font-mono" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paper width">
            <Segmented
              value={form.paperWidth}
              onChange={(v) => set('paperWidth', v)}
              options={[
                { value: '80', label: '80 mm' },
                { value: '58', label: '58 mm' },
              ]}
            />
          </Field>
          <Field label="Copies">
            <Stepper value={form.copies} onChange={(v) => set('copies', v)} min={1} max={5} />
          </Field>
        </div>
        <div className="space-y-2.5 rounded-xl bg-ink-50 p-3.5">
          <Checkbox checked={form.autoPrint} onChange={(e) => set('autoPrint', e.target.checked)} label="Print on its own" description="KOTs print when sent, bills when you press Print bill. Off: only reprints from the job list." />
          <Checkbox checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} label="Printer is in use" />
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────────── jobs ───────────────────────────── */

const STATUS_TONE = { queued: 'warning', printing: 'info', printed: 'success', failed: 'danger' } as const;
const STATUS_LABEL = { queued: 'Waiting', printing: 'Printing', printed: 'Printed', failed: 'Failed' } as const;

function JobsCard({ jobs, staleMinutes }: { jobs: JobRow[]; staleMinutes: number }) {
  const tr = useTr();
  const { run, pending } = useRun();
  return (
    <Card>
      <CardHeader icon={<RotateCcw className="h-4 w-4" />} title="Recent print jobs" description={`${tr('Tickets nobody printed within')} ${staleMinutes} ${tr('minutes are not printed late. Use Print again if still needed.')}`} />
      {jobs.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-500">{tr('Nothing printed yet.')}</p>
      ) : (
        <Table minWidth={640}>
          <THead>
            <tr>
              <Th>Time</Th>
              <Th>Ticket</Th>
              <Th>Printer</Th>
              <Th>Status</Th>
              <Th className="text-right"> </Th>
            </tr>
          </THead>
          <TBody>
            {jobs.map((j) => (
              <Tr key={j.id}>
                <Td className="text-xs whitespace-nowrap text-ink-500">{formatDateTime(j.createdAt)}</Td>
                <Td className="font-medium text-ink-900">{j.label}</Td>
                <Td className="text-ink-600">{j.printerName}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[j.status]} dot>
                    {STATUS_LABEL[j.status]}
                  </Badge>
                  {j.error && j.status !== 'printed' && <p className="mt-1 max-w-xs text-xs text-rose-600">{j.error}</p>}
                </Td>
                <Td className="text-right">
                  {(j.status === 'failed' || j.status === 'printed') && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retryJobAction(j.id))}>
                      <RotateCcw className="h-3.5 w-3.5" /> {tr('Print again')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
