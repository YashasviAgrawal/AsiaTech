'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDay, dateRange, formatDayShort, formatINR, isWeekend, nightsBetween, parseDay, sourceLabel } from '@/lib/format';
import type { ChartStay } from '@/server/services/roomchart';
import { assignRoomAction, moveStayAction } from '@/server/actions/frontoffice';
import { useToast } from '@/components/ui/toast';
import { tx } from '@/i18n/tx';
import { useTr } from '@/i18n/client';

interface ChartRoom {
  id: string;
  number: string;
  floor: string | null;
  hkStatus: string;
  roomTypeId: string;
  typeName: string;
  typeCode: string;
  typeColor: string;
}

const COL = 64;
const ROW = 46;
const LABEL = 168;

const HK_DOT: Record<string, string> = { clean: 'bg-emerald-500', dirty: 'bg-amber-500', inspected: 'bg-sky-500', out_of_order: 'bg-rose-500' };

type Drag = { stay: ChartStay; mode: 'move' | 'resize'; startX: number; startY: number; dx: number; dy: number };

export function RoomChart({
  rooms,
  stays,
  unassigned,
  start,
  days,
  today,
  highlight,
  canEdit,
  canBook,
}: {
  rooms: ChartRoom[];
  stays: ChartStay[];
  unassigned: ChartStay[];
  start: string;
  days: number;
  today: string;
  highlight: string | null;
  canEdit: boolean;
  canBook: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const tr = useTr();
  const dates = useMemo(() => dateRange(start, days), [start, days]);
  const end = addDay(start, days);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [hover, setHover] = useState<{ stay: ChartStay; x: number; y: number } | null>(null);
  const [dropRoom, setDropRoom] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Row index per room, with a header row before each room type.
  const layout = useMemo(() => {
    const rows: ({ kind: 'type'; name: string; color: string; count: number } | { kind: 'room'; room: ChartRoom })[] = [];
    let lastType = '';
    for (const room of rooms) {
      if (room.roomTypeId !== lastType) {
        rows.push({ kind: 'type', name: room.typeName, color: room.typeColor, count: rooms.filter((r) => r.roomTypeId === room.roomTypeId).length });
        lastType = room.roomTypeId;
      }
      rows.push({ kind: 'room', room });
    }
    return rows;
  }, [rooms]);

  const roomRowIndex = useMemo(() => {
    const map = new Map<string, number>();
    layout.forEach((row, i) => row.kind === 'room' && map.set(row.room.id, i));
    return map;
  }, [layout]);

  const rowTop = (index: number) => {
    let top = 0;
    for (let i = 0; i < index; i++) top += layout[i].kind === 'type' ? 30 : ROW;
    return top;
  };
  const totalHeight = rowTop(layout.length);

  function rowAtY(y: number): ChartRoom | null {
    let top = 0;
    for (const row of layout) {
      const h = row.kind === 'type' ? 30 : ROW;
      if (y >= top && y < top + h) return row.kind === 'room' ? row.room : null;
      top += h;
    }
    return null;
  }

  function barGeometry(stay: ChartStay) {
    const from = stay.checkIn < start ? start : stay.checkIn;
    const offset = nightsBetween(start, from);
    const startsBefore = stay.checkIn < start;
    const endsAfter = stay.checkOut > end;
    const left = offset * COL + (startsBefore ? 0 : COL / 2);
    const right = (endsAfter ? days * COL : nightsBetween(start, stay.checkOut) * COL + COL / 2);
    return { left, width: Math.max(right - left - 4, 18) };
  }

  async function commit(d: Drag) {
    const dayShift = Math.round(d.dx / COL);
    const target = gridRef.current ? rowAtY(rowTop(roomRowIndex.get(d.stay.roomId!) ?? 0) + ROW / 2 + d.dy) : null;
    const roomId = target?.id ?? d.stay.roomId!;
    let checkIn = d.stay.checkIn;
    let checkOut = d.stay.checkOut;
    if (d.mode === 'move') {
      if (d.stay.status === 'in_house' && dayShift !== 0) {
        toast.error('The guest is already in house', 'You can change the room or extend the stay, not move the arrival date.');
        return;
      }
      checkIn = addDay(checkIn, dayShift);
      checkOut = addDay(checkOut, dayShift);
    } else {
      checkOut = addDay(checkOut, dayShift);
      if (checkOut <= checkIn) checkOut = addDay(checkIn, 1);
    }
    if (roomId === d.stay.roomId && checkIn === d.stay.checkIn && checkOut === d.stay.checkOut) return;
    setSaving(d.stay.id);
    const result = await moveStayAction({ bookingRoomId: d.stay.id, roomId, checkIn, checkOut });
    setSaving(null);
    if (result.ok) {
      toast.success(`${d.stay.guestName} → room ${target?.number ?? ''}`.trim(), { description: `${formatDayShort(checkIn)} → ${formatDayShort(checkOut)}` });
      router.refresh();
    } else toast.error(result.error);
  }

  function onPointerDown(e: React.PointerEvent, stay: ChartStay, mode: Drag['mode']) {
    if (!canEdit || stay.status === 'departed') return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setHover(null);
    setDrag({ stay, mode, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, dx: e.clientX - drag.startX, dy: drag.mode === 'move' ? e.clientY - drag.startY : 0 });
  }

  function onPointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (Math.abs(d.dx) < 6 && Math.abs(d.dy) < 6) {
      router.push(`/front-desk/bookings/${d.stay.bookingId}`);
      return;
    }
    void commit(d);
  }

  async function assignUnassigned(stay: ChartStay, room: ChartRoom) {
    if (room.roomTypeId !== stay.roomTypeId) {
      toast.error(`Room ${room.number} is a ${room.typeName}`, 'Drop the booking on a room of the same type.');
      return;
    }
    setSaving(stay.id);
    const result = await assignRoomAction(stay.id, room.id);
    setSaving(null);
    if (result.ok) {
      toast.success(`${stay.guestName} assigned to room ${room.number}`);
      router.refresh();
    } else toast.error(result.error);
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="card overflow-hidden">
        <div className="scrollbar-thin overflow-x-auto">
          <div style={{ width: LABEL + days * COL }} className="select-none" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
            {/* Header */}
            <div className="sticky top-0 z-20 flex border-b border-ink-200 bg-ink-50">
              <div className="sticky left-0 z-10 flex items-end border-r border-ink-200 bg-ink-50 px-4 pb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase" style={{ width: LABEL }}>
                {tx('Room')}
              </div>
              {dates.map((date) => {
                const d = parseDay(date);
                const isToday = date === today;
                return (
                  <div key={date} className={cn('py-2 text-center', isToday ? 'bg-brand-50' : isWeekend(date) && 'bg-ink-100/70')} style={{ width: COL }}>
                    <div className={cn('text-[10px] font-semibold uppercase', isToday ? 'text-brand-600' : 'text-ink-400')}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                    <div className={cn('num text-[15px] font-extrabold', isToday ? 'text-brand-700' : 'text-ink-900')}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Body */}
            <div className="relative" style={{ height: totalHeight }} ref={gridRef}>
              {/* Background cells */}
              {layout.map((row, i) => {
                const top = rowTop(i);
                if (row.kind === 'type')
                  return (
                    <div key={`t${i}`} className="absolute inset-x-0 flex items-center border-b border-ink-100 bg-ink-50/80" style={{ top, height: 30 }}>
                      <span className="sticky left-0 flex items-center gap-2 px-4 text-[11px] font-bold tracking-wide text-ink-600 uppercase">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} /> {row.name} <span className="font-medium text-ink-400">({row.count})</span>
                      </span>
                    </div>
                  );
                const room = row.room;
                return (
                  <div
                    key={room.id}
                    className={cn('absolute inset-x-0 flex border-b border-ink-100', dropRoom === room.id && 'bg-brand-50/60', highlight === room.number && 'bg-amber-50')}
                    style={{ top, height: ROW }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropRoom(room.id);
                    }}
                    onDragLeave={() => setDropRoom((r) => (r === room.id ? null : r))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropRoom(null);
                      const id = e.dataTransfer.getData('text/stay');
                      const stay = unassigned.find((s) => s.id === id);
                      if (stay) void assignUnassigned(stay, room);
                    }}
                  >
                    <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-ink-200 bg-white px-4" style={{ width: LABEL }}>
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', HK_DOT[room.hkStatus])} title={tr(room.hkStatus.replaceAll('_', ' '))} />
                      <span className="num text-sm font-extrabold text-ink-900">{room.number}</span>
                      <span className="truncate text-[11px] text-ink-400">{room.typeCode}</span>
                      {room.hkStatus === 'out_of_order' && <span className="ml-auto rounded bg-rose-50 px-1 text-[9px] font-bold text-rose-600">OOO</span>}
                    </div>
                    {dates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        disabled={!canBook || date < today}
                        onClick={() => router.push(`/front-desk/reservations/new?checkIn=${date}&checkOut=${addDay(date, 1)}&roomTypeId=${room.roomTypeId}&roomId=${room.id}`)}
                        className={cn(
                          'h-full border-r border-ink-100/70 transition-colors',
                          date === today ? 'bg-brand-50/40' : isWeekend(date) && 'bg-ink-50/70',
                          canBook && date >= today && 'hover:bg-brand-50',
                        )}
                        style={{ width: COL }}
                        aria-label={tr(`Book room ${room.number} on ${formatDayShort(date)}`)}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Stay bars */}
              {stays.map((stay) => {
                const index = roomRowIndex.get(stay.roomId!);
                if (index === undefined) return null;
                const { left, width } = barGeometry(stay);
                const dragging = drag?.stay.id === stay.id;
                const dx = dragging ? (drag.mode === 'move' ? drag.dx : 0) : 0;
                const dy = dragging ? drag.dy : 0;
                const extraW = dragging && drag.mode === 'resize' ? drag.dx : 0;
                const tone =
                  stay.status === 'in_house'
                    ? 'bg-emerald-500 text-white ring-emerald-600'
                    : stay.status === 'departed'
                      ? 'bg-ink-200 text-ink-600 ring-ink-300'
                      : stay.bookingStatus === 'hold'
                        ? 'bg-amber-100 text-amber-900 ring-amber-300 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(245,158,11,0.18)_6px_12px)]'
                        : 'bg-sky-500 text-white ring-sky-600';
                return (
                  <div
                    key={stay.id}
                    className={cn(
                      'group absolute z-10 flex items-center overflow-hidden rounded-lg text-xs font-semibold shadow-sm ring-1 transition-shadow',
                      tone,
                      canEdit && stay.status !== 'departed' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      dragging && 'z-30 opacity-90 shadow-lift ring-2 ring-brand-500',
                    )}
                    style={{ top: rowTop(index) + 7, height: ROW - 14, left: LABEL + left + 2, width: Math.max(width + extraW, 18), transform: `translate(${dx}px, ${dy}px)` }}
                    onPointerDown={(e) => onPointerDown(e, stay, 'move')}
                    onMouseEnter={(e) => !drag && setHover({ stay, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => !drag && setHover({ stay, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {saving === stay.id ? <Loader2 className="mx-2 h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
                    <span className="truncate px-2">{stay.guestName}</span>
                    {stay.balance > 0.5 && stay.status !== 'departed' && <span className="mr-1 ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300 ring-2 ring-white/60" title={tr('Balance due')} />}
                    {canEdit && stay.status !== 'departed' && (
                      <span
                        className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize rounded-r-lg bg-black/10 opacity-0 transition group-hover:opacity-100"
                        onPointerDown={(e) => onPointerDown(e, stay, 'resize')}
                        title={tr('Drag to extend or shorten')}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-ink-100 px-5 py-3 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded bg-sky-500" /> {tx('Reserved')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded bg-emerald-500" /> {tx('In house')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded bg-amber-200 ring-1 ring-amber-300" /> {tx('On hold')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded bg-ink-200" /> {tx('Departed')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {tx('Balance due')}
          </span>
          <span className="ml-auto">{tx('Dots by room numbers show housekeeping status.')}</span>
        </div>
      </div>

      {/* Unassigned */}
      <aside className="card h-fit overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <Inbox className="h-4 w-4 text-brand-600" />
          <p className="text-sm font-bold text-ink-900">{tx('Unassigned')}</p>
          <span className="num ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">{unassigned.length}</span>
        </div>
        <p className="px-4 pt-3 text-xs text-ink-500">{tx('Drag a booking onto a room of the same type.')}</p>
        <ul className="scrollbar-thin max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {unassigned.map((stay) => {
            const type = rooms.find((r) => r.roomTypeId === stay.roomTypeId);
            return (
              <li
                key={stay.id}
                draggable={canEdit}
                onDragStart={(e) => e.dataTransfer.setData('text/stay', stay.id)}
                className={cn('flex items-start gap-2 rounded-xl border border-ink-200 bg-white p-2.5 text-xs shadow-card', canEdit && 'cursor-grab hover:border-brand-300 active:cursor-grabbing')}
              >
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-900">{stay.guestName}</span>
                  <span className="block text-ink-500">
                    {formatDayShort(stay.checkIn)} → {formatDayShort(stay.checkOut)}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-ink-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type?.typeColor }} /> {type?.typeName}
                  </span>
                </span>
                {saving === stay.id && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
              </li>
            );
          })}
          {unassigned.length === 0 && <li className="py-6 text-center text-xs text-ink-400">{tx('Every booking in this range has a room.')}</li>}
        </ul>
      </aside>

      {hover && !drag && (
        <div className="pointer-events-none fixed z-50 w-60 animate-fade-in rounded-xl border border-ink-200 bg-white p-3 text-xs shadow-lift" style={{ left: Math.min(hover.x + 14, window.innerWidth - 260), top: hover.y + 14 }}>
          <p className="text-sm font-bold text-ink-900">{hover.stay.guestName}</p>
          <p className="font-mono text-ink-500">{hover.stay.bookingNo}</p>
          <div className="mt-2 space-y-1 text-ink-600">
            <p>
              {formatDayShort(hover.stay.checkIn)} → {formatDayShort(hover.stay.checkOut)} · {nightsBetween(hover.stay.checkIn, hover.stay.checkOut)}N · {hover.stay.adults} adults
            </p>
            <p>{sourceLabel(hover.stay.source, hover.stay.channel)}</p>
            <p className={cn('font-semibold', hover.stay.balance > 0.5 ? 'text-amber-700' : 'text-emerald-600')}>{hover.stay.balance > 0.5 ? `Balance ${formatINR(hover.stay.balance)}` : 'Fully paid'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

