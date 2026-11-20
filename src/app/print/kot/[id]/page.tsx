import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { posOrderItems, posOrders, posTables, rooms } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatDateTime, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'KOT' };

/** Kitchen order ticket for 58/80 mm thermal printers. */
export default async function KotPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kot?: string }> }) {
  const ctx = await requireContext('pos.use');
  const { id } = await params;
  const { kot } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order] = await db
    .select({ order: posOrders, table: posTables.name, room: rooms.number })
    .from(posOrders)
    .leftJoin(posTables, eq(posTables.id, posOrders.tableId))
    .leftJoin(rooms, eq(rooms.id, posOrders.roomId))
    .where(and(eq(posOrders.id, id), eq(posOrders.propertyId, ctx.propertyId)));
  if (!order) notFound();
  const kotNo = Number(kot) || order.order.kotCount;
  const items = await db
    .select()
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, id), eq(posOrderItems.kotNo, kotNo)))
    .orderBy(asc(posOrderItems.createdAt));
  return (
    <article className="mx-auto w-[80mm] bg-white p-4 font-mono text-[13px] text-black shadow-lift print:w-full print:p-0 print:shadow-none">
      <p className="text-center text-base font-bold">KOT #{kotNo}</p>
      <p className="text-center">{order.order.orderNo}</p>
      <p className="mt-1 text-center text-lg font-bold">{order.table ? `TABLE ${order.table}` : order.room ? `ROOM ${order.room}` : titleCase(order.order.orderType).toUpperCase()}</p>
      <p className="text-center text-xs">{formatDateTime(new Date())}</p>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className={i.status === 'void' ? 'line-through' : ''}>
              <td className="w-8 align-top font-bold">{i.quantity}</td>
              <td className="font-bold">
                {i.name}
                {i.notes && <div className="text-xs font-normal">* {i.notes}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <p className="text-xs">By {ctx.user.name}</p>
    </article>
  );
}
