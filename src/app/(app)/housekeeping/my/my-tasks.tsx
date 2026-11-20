'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CircleCheckBig, PackageX, Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';
import { completeTaskAction, startTaskAction } from '@/server/actions/housekeeping';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

type Result = 'ok' | 'problem' | 'missing';
interface Task {
  id: string;
  status: string;
  type: string;
  priority: string;
  notes: string | null;
  roomNumber: string;
  floor: string | null;
  typeName: string;
  assigneeName: string | null;
  items: { id: string; name: string; nameHi: string | null; category: 'cleaning' | 'amenities' | 'maintenance' }[];
}

export function MyTasks({ tasks, supervisor }: { tasks: Task[]; supervisor: boolean }) {
  const { t } = useT();
  const [active, setActive] = useState<Task | null>(null);
  const { run, pending } = useRun();

  if (active) return <Inspection task={active} supervisor={supervisor} onDone={() => setActive(null)} />;

  if (tasks.length === 0)
    return (
      <div className="mt-10 flex flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheckBig className="h-8 w-8" />
        </span>
        <p className="mt-4 text-base font-semibold text-ink-800">{t('hk.noTasks')}</p>
      </div>
    );

  return (
    <ul className="mt-5 space-y-3">
      {tasks.map((task) => (
        <li key={task.id} className={cn('card overflow-hidden', task.priority === 'high' && 'ring-2 ring-rose-300')}>
          <div className="flex items-center gap-4 p-4">
            <span className={cn('num grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold text-white', task.status === 'in_progress' ? 'bg-sky-600' : 'bg-amber-500')}>
              {task.roomNumber}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">{task.typeName}</p>
              <p className="text-sm text-ink-500">
                {task.status === 'in_progress' ? t('hk.cleaning') : t('hk.dirty')}
                {task.priority === 'high' && <span className="ml-2 font-bold text-rose-600">· {t('hk.guestArriving')}</span>}
              </p>
              {supervisor && task.assigneeName && <p className="text-xs text-ink-400">{task.assigneeName}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-ink-100">
            <button
              disabled={pending || task.status === 'in_progress'}
              onClick={() => run(() => startTaskAction(task.id), { success: `${task.roomNumber} · ${t('hk.cleaning')}` })}
              className="flex h-14 items-center justify-center gap-2 bg-white text-sm font-semibold text-ink-700 transition active:bg-ink-50 disabled:text-ink-300"
            >
              <Play className="h-4 w-4" /> {t('hk.startCleaning')}
            </button>
            <button onClick={() => setActive(task)} className="flex h-14 items-center justify-center gap-2 bg-white text-sm font-bold text-brand-700 transition active:bg-brand-50">
              <Sparkles className="h-4 w-4" /> {t('hk.markClean')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Inspection({ task, supervisor, onDone }: { task: Task; supervisor: boolean; onDone: () => void }) {
  const { t, locale } = useT();
  const [results, setResults] = useState<Record<string, Result>>(Object.fromEntries(task.items.map((i) => [i.id, 'ok'])));
  const [notes, setNotes] = useState('');
  const { run, pending } = useRun();
  const issues = Object.values(results).filter((r) => r !== 'ok').length;
  const groups = (['cleaning', 'amenities', 'maintenance'] as const).map((c) => ({ c, items: task.items.filter((i) => i.category === c) })).filter((g) => g.items.length);

  const submit = (inspect: boolean) =>
    run(
      () =>
        completeTaskAction({
          taskId: task.id,
          results: Object.entries(results).map(([itemId, result]) => ({ itemId, result })),
          notes: notes || null,
          inspect,
        }),
      { success: (d) => `${d.number}: ${inspect ? t('hk.inspected') : t('hk.clean')}${d.tickets ? ` · ${d.tickets} ticket` : ''}`, onSuccess: onDone },
    );

  return (
    <div className="mt-4 pb-28">
      <button onClick={onDone} className="mb-3 flex items-center gap-1 text-sm font-medium text-ink-500">
        <ArrowLeft className="h-4 w-4" /> {t('hk.back')}
      </button>
      <div className="flex items-center gap-3">
        <span className="num grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-xl font-extrabold text-white">{task.roomNumber}</span>
        <div>
          <p className="font-bold text-ink-900">{task.typeName}</p>
          <p className="text-sm text-ink-500">{t('hk.tapIssues')}</p>
        </div>
      </div>

      {groups.map(({ c, items }) => (
        <section key={c} className="mt-5">
          <p className="mb-2 text-xs font-bold tracking-wider text-ink-400 uppercase">{t(`hk.${c}`)}</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="card p-3">
                <p className="text-[15px] font-semibold text-ink-900">{locale === 'hi' && item.nameHi ? item.nameHi : item.name}</p>
                {locale === 'hi' && item.nameHi && <p className="text-xs text-ink-400">{item.name}</p>}
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: 'ok', label: t('hk.ok'), icon: Check, on: 'bg-emerald-600 text-white border-emerald-600' },
                      { value: 'problem', label: t('hk.problem'), icon: AlertTriangle, on: 'bg-amber-500 text-white border-amber-500' },
                      { value: 'missing', label: t('hk.missing'), icon: PackageX, on: 'bg-rose-600 text-white border-rose-600' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setResults((r) => ({ ...r, [item.id]: opt.value }))}
                      className={cn(
                        'flex h-12 items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-bold transition active:scale-95',
                        results[item.id] === opt.value ? opt.on : 'border-ink-200 bg-white text-ink-500',
                      )}
                    >
                      <opt.icon className="h-4 w-4" /> {opt.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Textarea className="mt-5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notes')} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-lg gap-2">
          {supervisor && (
            <Button variant="outline" size="lg" className="flex-1" loading={pending} onClick={() => submit(true)}>
              {t('hk.inspected')}
            </Button>
          )}
          <Button size="lg" className="flex-[2]" loading={pending} onClick={() => submit(false)}>
            {t('hk.submit')} {issues > 0 && <span className="rounded-full bg-white/25 px-2 text-xs">{issues} issue</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
