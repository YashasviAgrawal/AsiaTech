'use client';

import { useMemo, useState } from 'react';
import { BedDouble, CircleAlert, Crown, LogIn, LogOut, Sparkles, User, Wrench } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { addDay, formatDayShort } from '@/lib/format';
import type { BoardRoom } from '@/server/services/housekeeping';
import { assignTaskAction, setRoomStatusAction } from '@/server/actions/housekeeping';
import { useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

type Status = 'clean' | 'dirty' | 'inspected' | 'out_of_order';

export const HK_STYLE: Record<Status, { card: string; pill: string; dot: string }> = {
  clean: { card: 'border-emerald-200 bg-emerald-50/50', pill: 'bg-emerald-600 text-white', dot: 'bg-emerald-500' },
  inspected: { card: 'border-sky-200 bg-sky-50/50', pill: 'bg-sky-600 text-white', dot: 'bg-sky-500' },
  dirty: { card: 'border-amber-300 bg-amber-50/70', pill: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  out_of_order: { card: 'border-rose-200 bg-rose-50/60', pill: 'bg-rose-600 text-white', dot: 'bg-rose-500' },
};

const ORDER: Status[] = ['dirty', 'clean', 'inspected', 'out_of_order'];

export function HousekeepingBoard({ rooms, staff, canManage, businessDate }: { rooms: BoardRoom[]; staff: { id: string; name: string }[]; canManage: boolean; businessDate: string }) {
  const { t } = useT();
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [floor, setFloor] = useState('');
  const [open, setOpen] = useState<BoardRoom | null>(null);
  const counts = useMemo(() => Object.fromEntries(ORDER.map((s) => [s, rooms.filter((r) => r.hkStatus === s).length])) as Record<Status, number>, [rooms]);
  const floors = [...new Set(rooms.map((r) => r.floor ?? '—'))];
  const visible = rooms.filter((r) => (filter === 'all' || r.hkStatus === filter) && (!floor || (r.floor ?? '—') === floor));
  const byFloor = floors.filter((f) => !floor || f === floor).map((f) => ({ floor: f, rooms: visible.filter((r) => (r.floor ?? '—') === f) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter('all')} className={cn('rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition', filter === 'all' ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-600 ring-ink-200')}>
          All <span className="num ml-1 opacity-70">{rooms.length}</span>
        </button>
        {ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn('flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition', filter === s ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300')}
          >
            <span className={cn('h-2 w-2 rounded-full', HK_STYLE[s].dot)} />
            {t(`hk.${s}`)}
            <span className="num opacity-70">{counts[s]}</span>
          </button>
        ))}
        <Select value={floor} onChange={(e) => setFloor(e.target.value)} className="ml-auto h-9 w-auto py-1.5 text-[13px]">
          <option value="">All floors</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              {`Floor ${f}`}
            </option>
          ))}
        </Select>
      </div>

      {byFloor.map(({ floor: f, rooms: list }) =>
        list.length === 0 ? null : (
          <section key={f}>
            <p className="mb-2.5 text-[11px] font-bold tracking-wider text-ink-400 uppercase">{tx(`Floor ${f}`)}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {list.map((room) => {
                const style = HK_STYLE[room.hkStatus as Status];
                const occ = room.occupancy;
                return (
                  <button
                    key={room.id}
                    onClick={() => setOpen(room)}
                    className={cn('group relative flex min-h-36 flex-col rounded-2xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift', style.card)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="num text-2xl leading-none font-extrabold text-ink-900">{room.number}</p>
                        <p className="mt-1 text-[11px] font-medium text-ink-500">{room.typeCode}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase', style.pill)}>{t(`hk.${room.hkStatus as Status}`)}</span>
                    </div>
                    <div className="mt-auto space-y-1.5 pt-3 text-xs">
                      {occ.kind === 'vacant' ? (
                        <p className="flex items-center gap-1.5 text-ink-400">
                          <BedDouble className="h-3.5 w-3.5" /> {tx('Vacant')}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 font-medium text-ink-700">
                          {occ.kind === 'arriving' ? <LogIn className="h-3.5 w-3.5 text-violet-600" /> : occ.kind === 'departing' ? <LogOut className="h-3.5 w-3.5 text-amber-600" /> : <User className="h-3.5 w-3.5 text-emerald-600" />}
                          <span className="truncate">{occ.guestName}</span>
                          {occ.isVip && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                        </p>
                      )}
                      {occ.kind !== 'vacant' && (
                        <p className="text-[11px] text-ink-500">{tx(occ.kind === 'arriving' ? 'Arriving today' : occ.kind === 'departing' ? 'Departing today' : `Leaves ${formatDayShort(occ.checkOut!)}`)}</p>
                      )}
                      {room.hkStatus === 'out_of_order' && <p className="truncate text-[11px] font-medium text-rose-700">{room.oooReason}</p>}
                      <div className="flex items-center gap-1.5">
                        {room.task?.assigneeName && (
                          <span className="flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 ring-1 ring-ink-200">
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-ink-800 text-[8px] text-white">{initials(room.task.assigneeName)}</span>
                            {tx(room.task.status === 'in_progress' ? 'Cleaning' : 'Assigned')}
                          </span>
                        )}
                        {room.openTickets > 0 && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            <Wrench className="h-2.5 w-2.5" /> {room.openTickets}
                          </span>
                        )}
                        {room.hkStatus === 'dirty' && occ.kind === 'arriving' && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <CircleAlert className="h-2.5 w-2.5" /> {tx('Priority')}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ),
      )}

      {open && <RoomDrawer room={open} staff={staff} canManage={canManage} businessDate={businessDate} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RoomDrawer({ room, staff, canManage, businessDate, onClose }: { room: BoardRoom; staff: { id: string; name: string }[]; canManage: boolean; businessDate: string; onClose: () => void }) {
  const { t } = useT();
  const { run, pending } = useRun();
  const [assignee, setAssignee] = useState(room.task?.assignedTo ?? '');
  const [oooReason, setOooReason] = useState(room.oooReason ?? '');
  const [oooUntil, setOooUntil] = useState(room.oooUntil ?? addDay(businessDate, 1));
  const [showOoo, setShowOoo] = useState(false);
  const statuses: Status[] = ['dirty', 'clean', 'inspected'];

  return (
    <Drawer open onClose={onClose} title={`Room ${room.number}`} description={room.typeName} width="sm">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">{tx('Status')}</p>
      <div className="grid grid-cols-3 gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            disabled={pending}
            onClick={() => run(() => setRoomStatusAction(room.id, s), { success: `Room ${room.number}: ${t(`hk.${s}`)}`, onSuccess: onClose })}
            className={cn(
              'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition active:scale-95',
              room.hkStatus === s ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', HK_STYLE[s].dot)} />
            {t(`hk.${s}`)}
          </button>
        ))}
      </div>

      {canManage && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          {room.hkStatus === 'out_of_order' ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-rose-800">
                {tx('Out of order')} · {room.oooReason}
              </p>
              <p className="text-xs text-rose-700">{tx(`Blocked in inventory until ${room.oooUntil ? formatDayShort(room.oooUntil) : '—'}.`)}</p>
              <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => setRoomStatusAction(room.id, 'dirty'), { success: 'Room back in service (needs cleaning)', onSuccess: onClose })}>
                Back in service
              </Button>
            </div>
          ) : !showOoo ? (
            <button onClick={() => setShowOoo(true)} className="flex w-full items-center gap-2 text-sm font-semibold text-rose-700">
              <Wrench className="h-4 w-4" /> {tx('Put out of order…')}
            </button>
          ) : (
            <div className="space-y-3">
              <Field label="Reason">
                <Input value={oooReason} onChange={(e) => setOooReason(e.target.value)} placeholder="AC repair, painting…" />
              </Field>
              <Field label="Until (room returns on)" hint="The room is blocked on every OTA for these nights.">
                <Input type="date" min={addDay(businessDate, 1)} value={oooUntil} onChange={(e) => setOooUntil(e.target.value)} />
              </Field>
              <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => setRoomStatusAction(room.id, 'out_of_order', { reason: oooReason, until: oooUntil }), { onSuccess: onClose, success: `Room ${room.number} out of order` })}>
                {tx('Block room')}
              </Button>
            </div>
          )}
        </div>
      )}

      {canManage && room.hkStatus !== 'out_of_order' && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">{tx('Assign cleaning')}</p>
          <div className="flex gap-2">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button loading={pending} onClick={() => run(() => assignTaskAction(room.id, assignee || null, room.occupancy.kind === 'arriving' ? 'high' : 'normal'), { onSuccess: onClose })}>
              <Sparkles className="h-4 w-4" /> Assign
            </Button>
          </div>
          {room.task && <p className="mt-2 text-xs text-ink-500">
              {tx('Current task:')} {tx(room.task.status.replaceAll('_', ' '))} {room.task.assigneeName ? `· ${room.task.assigneeName}` : ''}
            </p>}
        </div>
      )}
    </Drawer>
  );
}
