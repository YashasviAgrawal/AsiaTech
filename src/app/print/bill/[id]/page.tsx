import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { posOrderItems, posOrders, posOutlets, posTables, properties, rooms } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatDateTime, formatINR, PAYMENT_MODE_LABELS } from '@/lib/format';
import { amountInWords } from '@/lib/words';

export const metadata: Metadata = { title: 'Restaurant bill' };

/** Restaurant GST bill (thermal width). */
export default async function BillPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('pos.use');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db
    .select({ order: posOrders, outlet: posOutlets, table: posTables.name, room: rooms.number })
    .from(posOrders)
    .innerJoin(posOutlets, eq(posOutlets.id, posOrders.outletId))
    .leftJoin(posTables, eq(posTables.id, posOrders.tableId))
    .leftJoin(rooms, eq(rooms.id, posOrders.roomId))
    .where(and(eq(posOrders.id, id), eq(posOrders.propertyId, ctx.propertyId)));
  if (!row) notFound();
  const [property] = await db.select().from(properties).where(eq(properties.id, ctx.propertyId));
  const items = await db.select().from(posOrderItems).where(and(eq(posOrderItems.orderId, id), ne(posOrderItems.status, 'void'))).orderBy(asc(posOrderItems.createdAt));
  const o = row.order;
  return (
    <article className="mx-auto w-[80mm] bg-white p-4 font-mono text-[12px] text-black shadow-lift print:w-full print:p-0 print:shadow-none">
      <p className="text-center text-sm font-bold">{row.outlet.name}</p>
      <p className="text-center">{property.name}</p>
      <p className="text-center text-[11px]">{[property.addressLine1, property.city].filter(Boolean).join(', ')}</p>
      {(row.outlet.gstin ?? property.gstin) && <p className="text-center text-[11px]">GSTIN {row.outlet.gstin ?? property.gstin}</p>}
      <hr className="my-2 border-dashed border-black" />
      <p>Bill: {o.billNo ?? '—'}</p>
      <p>{formatDateTime(o.settledAt ?? o.createdAt)}</p>
      <p>{row.table ? `Table ${row.table}` : row.room ? `Room ${row.room} · ${o.guestName ?? ''}` : o.orderType.replace('_', ' ')}</p>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.name}
                <div className="text-[11px]">
                  {i.quantity} × {i.price.toFixed(2)}
                </div>
              </td>
              <td className="text-right align-top">{i.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <div className="space-y-0.5">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{o.subtotal.toFixed(2)}</span>
        </p>
        {o.discount > 0 && (
          <p className="flex justify-between">
            <span>Discount</span>
            <span>-{o.discount.toFixed(2)}</span>
          </p>
        )}
        <p className="flex justify-between">
          <span>CGST</span>
          <span>{o.cgst.toFixed(2)}</span>
        </p>
        <p className="flex justify-between">
          <span>SGST</span>
          <span>{o.sgst.toFixed(2)}</span>
        </p>
        <p className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatINR(o.total, { paise: true })}</span>
        </p>
      </div>
      <p className="mt-1 text-[10px]">{amountInWords(o.total)}</p>
      {o.settlementMode && <p className="mt-1">Paid by {PAYMENT_MODE_LABELS[o.settlementMode]}</p>}
      <hr className="my-2 border-dashed border-black" />
      <p className="text-center text-[11px]">SAC 996331 · Thank you! Visit again.</p>
    </article>
  );
}
