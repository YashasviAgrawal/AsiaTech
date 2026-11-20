'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDay, formatINR, sourceLabel } from '@/lib/format';
import { useT } from '@/i18n/client';
import type { DashboardBookingRow } from '@/server/services/dashboard';

type TabKey = 'created' | 'arriving' | 'inhouse';

export function BookingsTabs({
  createdToday,
  arriving,
  inHouse,
  canAssign,
}: {
  createdToday: DashboardBookingRow[];
  arriving: DashboardBookingRow[];
  inHouse: DashboardBookingRow[];
  canAssign: boolean;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<TabKey>('created');
  const rows = tab === 'created' ? createdToday : tab === 'arriving' ? arriving : inHouse;

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2.5 pb-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <CalendarDays className="h-4 w-4" />
          </span>
          <h2 className="text-[15px] font-bold text-ink-900">{t('dash.todaysBookingsTable')}</h2>
        </div>
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          className="border-b-0"
          items={[
            { value: 'created', label: 'Booked today', count: createdToday.length },
            { value: 'arriving', label: 'Arriving today', count: arriving.length },
            { value: 'inhouse', label: 'In house', count: inHouse.length },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-ink-100 px-5 py-10 text-center text-sm text-ink-500">No bookings here yet.</p>
      ) : (
        <Table className="border-t border-ink-100" minWidth={880}>
          <THead>
            <tr>
              <Th>Booking ID</Th>
              <Th>Source</Th>
              <Th>Name</Th>
              <Th>Check In</Th>
              <Th>Check Out</Th>
              <Th>Room Name</Th>
              <Th>Room Assigned</Th>
              <Th className="text-right">Balance</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link href={`/front-desk/bookings/${row.id}`} className="font-mono text-[13px] font-semibold text-ink-900 hover:text-brand-600">
                    {row.bookingNo}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{sourceLabel(row.source, row.channel)}</Td>
                <Td className="font-medium whitespace-nowrap text-ink-900">{row.guestName}</Td>
                <Td className="whitespace-nowrap">{formatDay(row.checkIn)}</Td>
                <Td className="whitespace-nowrap">{formatDay(row.checkOut)}</Td>
                <Td className="max-w-48 truncate">{row.roomTypeName}</Td>
                <Td>
                  {row.roomNumber ? (
                    <span className="num inline-flex rounded-md bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-800">{row.roomNumber}</span>
                  ) : canAssign && ['confirmed', 'hold'].includes(row.status) ? (
                    <Link
                      href={`/front-desk/bookings/${row.id}?do=assign`}
                      className="inline-flex h-7 items-center rounded-md bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100"
                    >
                      Assign
                    </Link>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </Td>
                <Td className="num text-right font-semibold whitespace-nowrap">
                  {row.balance > 0.5 ? <span className="text-amber-700">{formatINR(row.balance)}</span> : <span className="text-emerald-600">Paid</span>}
                </Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
