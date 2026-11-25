'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  BedDouble,
  CalendarRange,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Globe2,
  History,
  IdCard,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  UserX,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTr } from '@/i18n/client';
import { formatDateTime, formatDay, formatDayShort, formatINR, ID_TYPE_LABELS, MEAL_PLAN_LABELS, PAYMENT_MODE_LABELS, sourceLabel, timeAgo } from '@/lib/format';
import type { BookingDetail } from '@/server/services/frontoffice';
import { cancelBookingAction, confirmHoldAction, extendHoldAction, noShowAction, restoreBookingAction } from '@/server/actions/reservations';
import { restoreFolioLineAction, updateGuestIdPhotosAction, voidFolioLineAction } from '@/server/actions/frontoffice';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { MenuItem, Popover } from '@/components/ui/popover';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';
import type { RoomTypeOption } from '@/server/services/room-options';
import { AssignDialog, ChargeDialog, CheckInDialog, CheckOutDialog, FormCDialog, PaymentDialog } from './booking-dialogs';
import { ModifyDialog } from './modify-dialog';
import { SendInvoiceDialog } from './send-invoice-dialog';
import { PhotoGrid } from '@/components/ui/photo-upload';

type Dialogs = 'checkin' | 'checkout' | 'payment' | 'charge' | 'cancel' | 'noshow' | 'formc' | 'modify' | { assign: string } | { sendInvoice: string; afterCheckout?: boolean } | null;

export function BookingView({
  data,
  intent,
  roomTypes,
  businessDate,
  hotel,
  can,
}: {
  data: BookingDetail;
  intent: string | null;
  roomTypes: RoomTypeOption[];
  businessDate: string;
  hotel: { name: string; upiId: string };
  can: { checkin: boolean; cancel: boolean; edit: boolean; create: boolean; requestMoney: boolean };
}) {
  const { booking: b, guest: g, totals } = data;
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun();
  const tr = useTr();
  const activeRooms = data.rooms.filter((r) => ['reserved', 'in_house'].includes(r.status));
  // Dashboard "Check in now" / "Check out" / "Assign" buttons land here with ?do=…
  const [dialog, setDialog] = useState<Dialogs>(() => {
    if (intent === 'checkin' && b.status === 'confirmed') return 'checkin';
    if (intent === 'checkout' && b.status === 'checked_in') return 'checkout';
    if (intent === 'modify' && ['hold', 'confirmed', 'checked_in'].includes(b.status)) return 'modify';
    if (intent === 'assign') {
      const first = activeRooms.find((r) => !r.roomId) ?? activeRooms[0];
      if (first) return { assign: first.id };
    }
    return null;
  });
  const [now] = useState(() => Date.now());

  const close = () => {
    setDialog(null);
    if (intent) router.replace(`/front-desk/bookings/${b.id}`, { scroll: false });
  };

  const formCDue = g.isForeign && b.status === 'checked_in' && !b.formCSubmittedAt;
  const checkedInAt = data.rooms.find((r) => r.checkedInAt)?.checkedInAt;
  const formCHoursLeft = checkedInAt ? Math.round(24 - (now - new Date(checkedInAt).getTime()) / 3600_000) : 24;
  const invoice = data.invoices[0];
  const canModify = can.edit && ['hold', 'confirmed', 'checked_in'].includes(b.status) && roomTypes.length > 0;

  const primary =
    b.status === 'hold' && can.create ? (
      <Button loading={pending} onClick={() => run(() => confirmHoldAction(b.id), { success: 'Booking confirmed' })}>
        <BadgeCheck className="h-4 w-4" /> Confirm booking
      </Button>
    ) : b.status === 'confirmed' && can.checkin ? (
      <Button onClick={() => setDialog('checkin')} disabled={b.checkIn > businessDate} title={b.checkIn > businessDate ? `Arrives ${formatDay(b.checkIn)}` : undefined}>
        <LogIn className="h-4 w-4" /> Check in
      </Button>
    ) : b.status === 'checked_in' && can.checkin ? (
      <Button onClick={() => setDialog('checkout')}>
        <LogOut className="h-4 w-4" /> Check out
      </Button>
    ) : b.status === 'checked_out' && invoice ? (
      <>
        <ButtonLink variant="outline" href={`/print/invoice/${invoice.id}`} target="_blank">
          <Printer className="h-4 w-4" /> Print invoice
        </ButtonLink>
        {invoice.status === 'issued' && (
          <Button onClick={() => setDialog({ sendInvoice: invoice.id })}>
            <Send className="h-4 w-4" /> Send invoice
          </Button>
        )}
      </>
    ) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/front-desk/bookings" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> Booking Report
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-ink-900">{b.bookingNo}</h1>
              <StatusBadge status={b.status} />
              <Badge tone={b.source === 'ota' ? 'violet' : b.source === 'web' ? 'info' : 'neutral'}>{sourceLabel(b.source, b.channel)}</Badge>
              {b.otaRef && <span className="font-mono text-xs text-ink-500">Ref {b.otaRef}</span>}
            </div>
            <p className="mt-1.5 text-sm text-ink-500">
              {tr('Booked')} {formatDateTime(b.createdAt)}
              {data.createdByName ? ` by ${data.createdByName}` : ''}
              {b.status === 'hold' && b.holdUntil && (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700">
                  <Clock className="h-3.5 w-3.5" /> held until {formatDateTime(b.holdUntil)}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['confirmed', 'checked_in', 'hold'].includes(b.status) && can.checkin && (
              <Button variant="outline" onClick={() => setDialog('payment')}>
                <CreditCard className="h-4 w-4" /> Payment
              </Button>
            )}
            {b.status === 'checked_in' && can.checkin && (
              <Button variant="outline" onClick={() => setDialog('charge')}>
                <Plus className="h-4 w-4" /> Charge
              </Button>
            )}
            {primary}
            <Popover
              width="w-60"
              trigger={({ toggle }) => (
                <Button variant="outline" size="icon" onClick={toggle} aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              )}
            >
              {(closeMenu) => (
                <div className="p-1.5">
                  <MenuItem icon={<Printer className="h-4 w-4" />} onClick={() => (closeMenu(), window.open(`/print/registration/${b.id}`, '_blank'))}>
                    Registration card
                  </MenuItem>
                  {invoice && (
                    <>
                      <MenuItem icon={<Receipt className="h-4 w-4" />} onClick={() => (closeMenu(), window.open(`/print/invoice/${invoice.id}`, '_blank'))}>
                        GST invoice {invoice.invoiceNo}
                      </MenuItem>
                      <MenuItem icon={<FileText className="h-4 w-4" />} onClick={() => (closeMenu(), window.open(`/api/invoices/${invoice.id}/pdf`, '_blank'))}>
                        Download invoice PDF
                      </MenuItem>
                      {invoice.status === 'issued' && (
                        <MenuItem icon={<Send className="h-4 w-4" />} onClick={() => (closeMenu(), setDialog({ sendInvoice: invoice.id }))}>
                          Send invoice to guest
                        </MenuItem>
                      )}
                    </>
                  )}
                  {g.mobile && (
                    <MenuItem
                      icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}
                      onClick={() => (closeMenu(), window.open(`https://wa.me/91${g.mobile}?text=${encodeURIComponent(`Namaste ${g.name.split(' ')[0]}, regarding your booking ${b.bookingNo} at ${hotel.name}: `)}`, '_blank'))}
                    >
                      WhatsApp guest
                    </MenuItem>
                  )}
                  {can.requestMoney && totals.balance > 0.5 && (
                    <MenuItem icon={<Send className="h-4 w-4" />} onClick={() => (closeMenu(), router.push(`/money/request?booking=${b.id}`))}>
                      Request {formatINR(totals.balance)}
                    </MenuItem>
                  )}
                  {canModify && (
                    <MenuItem icon={<PencilLine className="h-4 w-4" />} onClick={() => (closeMenu(), setDialog('modify'))}>
                      Change dates, rooms or plan
                    </MenuItem>
                  )}
                  {b.status === 'hold' && can.create && (
                    <MenuItem icon={<Clock className="h-4 w-4" />} onClick={() => (closeMenu(), run(() => extendHoldAction(b.id, 2), { success: 'Hold extended by 2 hours' }))}>
                      Extend hold by 2 hours
                    </MenuItem>
                  )}
                  {['confirmed', 'hold'].includes(b.status) && can.cancel && (
                    <>
                      <div className="my-1 border-t border-ink-100" />
                      {b.status === 'confirmed' && b.checkIn <= businessDate && (
                        <MenuItem icon={<UserX className="h-4 w-4" />} onClick={() => (closeMenu(), setDialog('noshow'))}>
                          Mark no-show
                        </MenuItem>
                      )}
                      <MenuItem danger icon={<XCircle className="h-4 w-4" />} onClick={() => (closeMenu(), setDialog('cancel'))}>
                        {b.status === 'hold' ? 'Release hold' : 'Cancel booking'}
                      </MenuItem>
                    </>
                  )}
                  {['cancelled', 'no_show'].includes(b.status) && can.cancel && (
                    <MenuItem icon={<RotateCcw className="h-4 w-4" />} onClick={() => (closeMenu(), run(() => restoreBookingAction(b.id)))}>
                      Restore booking
                    </MenuItem>
                  )}
                </div>
              )}
            </Popover>
          </div>
        </div>
      </div>

      {formCDue && (
        <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3.5', formCHoursLeft <= 6 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50')}>
          <ShieldAlert className={cn('h-5 w-5', formCHoursLeft <= 6 ? 'text-rose-600' : 'text-amber-600')} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink-900">Form-C (FRRO) due for this foreign guest</p>
            <p className="text-ink-600">
              Submit on indianfrro.gov.in within 24 hours of arrival.{' '}
              <strong className="num">{formCHoursLeft > 0 ? `${formCHoursLeft} h left` : 'Overdue'}</strong>
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setDialog('formc')}>
            Mark submitted
          </Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Stay */}
          <Card>
            <CardHeader
              icon={<CalendarRange className="h-4 w-4" />}
              title="Stay"
              description={`${b.nights} night${b.nights === 1 ? '' : 's'} · ${b.adults} adult${b.adults === 1 ? '' : 's'}${b.children ? `, ${b.children} child` : ''}`}
              action={
                canModify && (
                  <Button size="sm" variant="soft" onClick={() => setDialog('modify')}>
                    <PencilLine className="h-4 w-4" /> {b.status === 'checked_in' ? 'Extend / change' : 'Change booking'}
                  </Button>
                )
              }
            />
            <div className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-4">
              {[
                { label: 'Check-in', value: formatDayShort(b.checkIn), sub: b.arrivalTime ? `arriving ${b.arrivalTime}` : undefined },
                { label: 'Check-out', value: formatDayShort(b.checkOut) },
                { label: 'Bill to', value: b.billToName ?? tr('Guest'), sub: b.billTo !== 'guest' ? b.billTo : undefined },
                { label: 'Booking value', value: formatINR(b.totalAmount), sub: b.discountAmount > 0 ? `incl. ${formatINR(b.discountAmount)} off` : 'incl. GST' },
              ].map((cell) => (
                <div key={cell.label} className="bg-white px-5 py-3.5">
                  <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{tr(cell.label)}</p>
                  <p className="num mt-1 font-semibold text-ink-900">{cell.value}</p>
                  {cell.sub && <p className="text-xs text-ink-500 capitalize">{tr(cell.sub)}</p>}
                </div>
              ))}
            </div>
            <ul className="divide-y divide-ink-100 border-t border-ink-100">
              {data.rooms.map((room, i) => (
                <li key={room.id} className={cn('flex flex-wrap items-center gap-4 px-5 py-3.5', ['cancelled', 'no_show'].includes(room.status) && 'opacity-50')}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ backgroundColor: room.typeColor }}>
                    {room.roomNumber ?? <BedDouble className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">
                      Room {i + 1} · {room.typeName}
                    </p>
                    <p className="text-xs text-ink-500">
                      {MEAL_PLAN_LABELS[room.mealPlan]} · {room.adults}A{room.children ? ` ${room.children}C` : ''}
                      {room.extraBeds ? ` · ${room.extraBeds} extra bed` : ''} · {formatINR(room.amount)} + GST
                    </p>
                  </div>
                  <StatusBadge status={room.status} />
                  {can.checkin && ['reserved', 'in_house'].includes(room.status) && (
                    <Button size="sm" variant={room.roomId ? 'ghost' : 'soft'} onClick={() => setDialog({ assign: room.id })}>
                      {room.roomId ? 'Change room' : 'Assign room'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {(b.specialRequests || b.internalNotes || b.cancelReason) && (
              <div className="space-y-2 border-t border-ink-100 px-5 py-3.5 text-sm">
                {b.specialRequests && (
                  <p>
                    <span className="font-semibold text-ink-700">Requests:</span> <span className="text-ink-600">{b.specialRequests}</span>
                  </p>
                )}
                {b.internalNotes && (
                  <p>
                    <span className="font-semibold text-ink-700">Staff notes:</span> <span className="text-ink-600">{b.internalNotes}</span>
                  </p>
                )}
                {b.cancelReason && (
                  <p className="text-rose-700">
                    <span className="font-semibold">Reason:</span> {b.cancelReason}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Folio */}
          <Card>
            <CardHeader
              icon={<FileText className="h-4 w-4" />}
              title="Bill (folio)"
              description="Room charges, restaurant, extras and payments"
              action={invoice && <Badge tone="success">Invoice {invoice.invoiceNo}</Badge>}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <tbody className="divide-y divide-ink-100">
                  <tr className="bg-ink-50/50">
                    <td className="px-5 py-2.5 text-ink-500">{formatDayShort(b.checkIn)}</td>
                    <td className="px-2 py-2.5 font-medium text-ink-800">
                      {tr('Room charges')} · {tr(`${b.nights} night${b.nights === 1 ? '' : 's'}`)}
                      <span className="ml-2 text-xs font-normal text-ink-500">({formatINR(totals.roomPosted)} {tr('posted so far')})</span>
                    </td>
                    <td className="num px-5 py-2.5 text-right font-semibold text-ink-900">{formatINR(totals.room)}</td>
                    <td className="w-10" />
                  </tr>
                  {data.folio
                    .filter((l) => l.type !== 'room')
                    .map((line) => (
                      <tr key={line.id} className={cn(line.isVoid && 'text-ink-400 line-through')}>
                        <td className="px-5 py-2.5 text-ink-500">{formatDayShort(line.businessDate)}</td>
                        <td className="px-2 py-2.5 text-ink-800">
                          {line.description}
                          {line.taxRate > 0 && <span className="ml-1.5 text-xs text-ink-400">GST {line.taxRate}%</span>}
                          {line.isVoid && line.voidReason && <span className="ml-2 text-xs no-underline">void: {line.voidReason}</span>}
                        </td>
                        <td className={cn('num px-5 py-2.5 text-right font-medium', line.total < 0 ? 'text-emerald-700' : 'text-ink-900')}>{formatINR(line.total)}</td>
                        <td className="pr-3 text-right">
                          {!line.isVoid && can.edit && b.status === 'checked_in' && (
                            <VoidButton onVoid={(reason) => run(() => voidFolioLineAction(line.id, reason), { undoable: true })} />
                          )}
                          {line.isVoid && can.edit && b.status === 'checked_in' && (
                            <button
                              type="button"
                              onClick={() => run(() => restoreFolioLineAction(line.id))}
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-brand-600 no-underline transition hover:bg-brand-50"
                              title="Put this line back on the bill"
                            >
                              <RotateCcw className="h-3 w-3" /> Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {data.payments
                    .filter((p) => p.status === 'success')
                    .map((p) => (
                      <tr key={p.id} className="bg-emerald-50/40">
                        <td className="px-5 py-2.5 text-ink-500">{formatDayShort(p.businessDate)}</td>
                        <td className="px-2 py-2.5 text-ink-800">
                          {p.kind === 'refund' ? 'Refund' : p.kind === 'advance' ? 'Advance' : 'Payment'} · {PAYMENT_MODE_LABELS[p.mode] ?? p.mode}
                          {p.reference && <span className="ml-1.5 font-mono text-xs text-ink-400">{p.reference}</span>}
                        </td>
                        <td className="num px-5 py-2.5 text-right font-medium text-emerald-700">{p.kind === 'refund' ? '+' : '−'}{formatINR(p.amount)}</td>
                        <td />
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3.5 text-sm">
              <span className="text-ink-500">
                {tr('Total')} <strong className="num ml-1 text-ink-900">{formatINR(totals.grandTotal)}</strong>
              </span>
              <span className="text-ink-500">
                {tr('Paid')} <strong className="num ml-1 text-emerald-700">{formatINR(totals.paid)}</strong>
              </span>
              <span className="text-ink-500">
                {tr('Balance')}{' '}
                <strong className={cn('num ml-1 text-base', totals.balance > 0.5 ? 'text-amber-700' : 'text-emerald-700')}>{totals.balance > 0.5 ? formatINR(totals.balance) : tr('Nil')}</strong>
              </span>
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader icon={<History className="h-4 w-4" />} title="History" description="Every change, who made it and when" />
            <ol className="relative space-y-4 px-5 py-4 before:absolute before:top-5 before:bottom-5 before:left-[27px] before:w-px before:bg-ink-200">
              {data.timeline.map((event) => (
                <li key={event.id} className="relative flex gap-3">
                  <span className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-800">{event.summary}</p>
                    <p className="text-xs text-ink-400">
                      {event.userName ?? 'System'} · {timeAgo(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
              {data.timeline.length === 0 && <p className="text-sm text-ink-500">No history yet.</p>}
            </ol>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-ink-100 p-5">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
                {g.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="min-w-0">
                <Link href={`/front-desk/guests/${g.id}`} className="block truncate text-base font-bold text-ink-900 hover:text-brand-600">
                  {g.name}
                </Link>
                <p className="text-xs text-ink-500">
                  {tr(data.guestStays > 1 ? `${data.guestStays} stays · returning guest` : 'First stay')}
                  {g.isVip && <Badge tone="warning" className="ml-1.5 px-1.5 py-0 text-[10px]">VIP</Badge>}
                </p>
              </div>
            </div>
            <dl className="space-y-2.5 p-5 text-sm">
              {g.mobile && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-ink-400" />
                  <a href={`tel:+91${g.mobile}`} className="num text-ink-800 hover:text-brand-600">
                    +91 {g.mobile.slice(0, 5)} {g.mobile.slice(5)}
                  </a>
                </div>
              )}
              {g.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-ink-400" />
                  <span className="truncate text-ink-800">{g.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Globe2 className="h-4 w-4 text-ink-400" />
                <span className="text-ink-800">
                  {[g.city, g.nationality].filter(Boolean).join(' · ')}
                  {g.isForeign && <Badge tone="info" className="ml-1.5 px-1.5 py-0 text-[10px]">Foreign</Badge>}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <IdCard className="h-4 w-4 text-ink-400" />
                <span className="text-ink-800">{g.idType ? `${ID_TYPE_LABELS[g.idType] ?? g.idType} ${g.idNumberMasked ?? ''}` : <span className="text-ink-400">{tr('ID not collected yet')}</span>}</span>
              </div>
              {(can.checkin || g.idPhotos.length > 0) && <GuestIdPhotos guestId={g.id} photos={g.idPhotos} editable={can.checkin} />}
              {g.isForeign && g.passportNumber && (
                <div className="rounded-lg bg-ink-50 p-2.5 text-xs text-ink-600">
                  Passport {g.passportNumber} · Visa {g.visaNumber ?? '—'} ({g.visaType ?? '—'}) · arrived from {g.arrivedFrom ?? '—'}
                  {b.formCSubmittedAt && (
                    <p className="mt-1 flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Form-C submitted · {b.formCRef}
                    </p>
                  )}
                </div>
              )}
              {(g.company || g.companyGstin) && (
                <p className="text-xs text-ink-500">
                  {g.company} {g.companyGstin && <span className="font-mono">· GSTIN {g.companyGstin}</span>}
                </p>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{tr('Balance due')}</p>
            <p className={cn('num mt-1 text-3xl font-extrabold tracking-tight', totals.balance > 0.5 ? 'text-ink-900' : 'text-emerald-600')}>
              {totals.balance > 0.5 ? formatINR(totals.balance) : 'Fully paid'}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, totals.grandTotal > 0 ? (totals.paid / totals.grandTotal) * 100 : 0)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-500">
              {tr(`${formatINR(totals.paid)} of ${formatINR(totals.grandTotal)} paid`)}
            </p>
            {totals.balance > 0.5 && ['confirmed', 'checked_in', 'hold'].includes(b.status) && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {can.checkin && (
                  <Button size="sm" variant="secondary" onClick={() => setDialog('payment')}>
                    Collect now
                  </Button>
                )}
                {can.requestMoney && (
                  <ButtonLink size="sm" variant="outline" href={`/money/request?booking=${b.id}`}>
                    <Send className="h-3.5 w-3.5" /> Send link
                  </ButtonLink>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {dialog === 'checkin' && <CheckInDialog data={data} onClose={close} />}
      {dialog === 'checkout' && <CheckOutDialog data={data} businessDate={businessDate} onClose={close} onCheckedOut={(invoiceId) => setDialog({ sendInvoice: invoiceId, afterCheckout: true })} />}
      {typeof dialog === 'object' && dialog && 'sendInvoice' in dialog && <SendInvoiceDialog invoiceId={dialog.sendInvoice} afterCheckout={dialog.afterCheckout} onClose={close} />}
      {dialog === 'payment' && <PaymentDialog bookingId={b.id} balance={totals.balance} onClose={close} />}
      {dialog === 'charge' && <ChargeDialog bookingId={b.id} onClose={close} />}
      {dialog === 'modify' && <ModifyDialog data={data} roomTypes={roomTypes} businessDate={businessDate} onClose={close} />}
      {dialog === 'formc' && <FormCDialog bookingId={b.id} onClose={close} />}
      {typeof dialog === 'object' && dialog && 'assign' in dialog && <AssignDialog room={data.rooms.find((r) => r.id === dialog.assign)!} onClose={close} />}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={close}
        title={b.status === 'hold' ? `Release hold ${b.bookingNo}?` : `Cancel ${b.bookingNo}?`}
        description={`${g.name} · ${formatDayShort(b.checkIn)} → ${formatDayShort(b.checkOut)}. The rooms go back on sale on every OTA immediately.`}
        confirmLabel={b.status === 'hold' ? 'Release rooms' : 'Cancel booking'}
        requireReason
        loading={pending}
        onConfirm={(reason) =>
          run(() => cancelBookingAction(b.id, reason), { refresh: true, onSuccess: close, success: (d) => `${d.bookingNo} cancelled` }).then((result) => {
            if (result.ok)
              toast.show({
                tone: 'info',
                title: 'Changed your mind?',
                description: 'Restore puts the booking back if the rooms are still free.',
                action: { label: 'Undo', onClick: async () => void (await restoreBookingAction(b.id), router.refresh()) },
              });
          })
        }
      />
      <ConfirmDialog
        open={dialog === 'noshow'}
        onClose={close}
        title={`Mark ${g.name} as no-show?`}
        description="The rooms are released for sale. You can restore the booking if the guest turns up."
        confirmLabel="Mark no-show"
        loading={pending}
        onConfirm={async () => void (await run(() => noShowAction(b.id), { onSuccess: close }))}
      />
    </div>
  );
}

function VoidButton({ onVoid }: { onVoid: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded p-1 text-ink-300 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Void line">
        <XCircle className="h-4 w-4" />
      </button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title="Void this line?" requireReason confirmLabel="Void" onConfirm={(reason) => (onVoid(reason), setOpen(false))} />
    </>
  );
}

/** ID photos on the guest card: thumbnails open full size; desk staff can scan or replace them here too. */
function GuestIdPhotos({ guestId, photos, editable }: { guestId: string; photos: string[]; editable: boolean }) {
  const { run } = useRun();
  if (!editable) {
    return (
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-14 w-20 overflow-hidden rounded-lg ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`ID photo ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    );
  }
  return (
    <PhotoGrid
      folder="ids"
      value={photos}
      onChange={(urls) => run(() => updateGuestIdPhotosAction(guestId, urls), { success: urls.length > photos.length ? 'ID photo saved' : 'ID photo removed' })}
      max={4}
      webcam
      scanLabel="Scan ID"
      tileClassName="h-14 w-20"
    />
  );
}
