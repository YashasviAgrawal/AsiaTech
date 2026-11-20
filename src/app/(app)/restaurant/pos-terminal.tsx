'use client';

import { useMemo, useState } from 'react';
import { ArrowRightLeft, BedDouble, ChefHat, CreditCard, Gift, IndianRupee, Minus, Plus, Printer, QrCode, Receipt, RotateCcw, Search, ShoppingBag, Trash2, Users, Wallet, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import type { getPosTerminal } from '@/server/services/pos';
import { billOrderAction, reopenOrderAction, sendKotAction, setDiscountAction, settleOrderAction, toggleAvailabilityAction, voidItemAction, voidOrderAction } from '@/server/actions/pos';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';

type Terminal = NonNullable<Awaited<ReturnType<typeof getPosTerminal>>>;
type Order = Terminal['orders'][number];
type Draft = { orderType: 'dine_in' | 'take_away' | 'room' | 'in_house'; tableId?: string; bookingId?: string; roomId?: string; guestName?: string; label: string };

export function PosTerminal({ data, canVoid, canManage }: { data: Terminal; canVoid: boolean; canManage: boolean }) {
  const toast = useToast();
  const { run, pending } = useRun();
  const [selectedId, setSelectedId] = useState<string | null>(data.orders[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const [settleOpen, setSettleOpen] = useState(false);
  const [roomPicker, setRoomPicker] = useState(false);
  const [voidOrderOpen, setVoidOrderOpen] = useState(false);
  const [voidItemId, setVoidItemId] = useState<string | null>(null);

  const selected = data.orders.find((o) => o.id === selectedId) ?? null;
  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartTotal = cartLines.reduce((t, [id, qty]) => t + (itemMap.get(id)?.price ?? 0) * qty, 0);
  const cartWithTax = cartLines.reduce((t, [id, qty]) => {
    const item = itemMap.get(id);
    return t + (item ? item.price * qty * (1 + item.taxRate / 100) : 0);
  }, 0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const menu = data.items.filter((i) => (category === 'all' || i.categoryId === category) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const tableOrder = (tableId: string) => data.orders.find((o) => o.tableId === tableId);
  const otherOrders = data.orders.filter((o) => !o.tableId);

  function select(order: Order) {
    setSelectedId(order.id);
    setDraft(null);
    setCart({});
  }
  function startDraft(d: Draft) {
    setSelectedId(null);
    setDraft(d);
    setCart({});
  }
  function add(itemId: string) {
    if (!selected && !draft) {
      toast.info('Pick a table, room or take-away first');
      return;
    }
    if (selected && selected.status !== 'open') {
      toast.info('This bill is printed', 'Re-open it to add more items.');
      return;
    }
    setCart((c) => ({ ...c, [itemId]: (c[itemId] ?? 0) + 1 }));
  }

  async function sendKot(thenPrint = true) {
    const items = cartLines.map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    const result = await run(
      () =>
        sendKotAction({
          orderId: selected?.id ?? null,
          meta: draft ? { outletId: data.outlet.id, orderType: draft.orderType, tableId: draft.tableId ?? null, bookingId: draft.bookingId ?? null, roomId: draft.roomId ?? null, guestName: draft.guestName ?? null } : undefined,
          items,
        }),
      { success: (d) => `KOT ${d.kotNo} sent to kitchen · ${d.orderNo}` },
    );
    if (result.ok) {
      setCart({});
      setDraft(null);
      setSelectedId(result.data.orderId);
      if (thenPrint) window.open(`/print/kot/${result.data.orderId}?kot=${result.data.kotNo}`, '_blank', 'width=420,height=640');
    }
    return result;
  }

  const ticketLabel = selected
    ? selected.tableName
      ? `Table ${selected.tableName}`
      : selected.orderType === 'room'
        ? `Room ${selected.roomNumber} · ${selected.guestName ?? ''}`
        : selected.orderType === 'in_house'
          ? `In-house · ${selected.guestName ?? 'Staff'}`
          : `Take-away${selected.guestName ? ` · ${selected.guestName}` : ''}`
    : draft?.label;

  return (
    <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_360px]">
      {/* Left: tables & open orders */}
      <div className="space-y-4">
        <div className="card p-3">
          <p className="mb-2 px-1 text-[11px] font-bold tracking-wider text-ink-400 uppercase">Tables</p>
          <div className="grid grid-cols-4 gap-2 xl:grid-cols-3">
            {data.tables.map((table) => {
              const order = tableOrder(table.id);
              const active = (order && order.id === selectedId) || draft?.tableId === table.id;
              return (
                <button
                  key={table.id}
                  onClick={() => (order ? select(order) : startDraft({ orderType: 'dine_in', tableId: table.id, label: `Table ${table.name}` }))}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-xl border-2 text-sm font-extrabold transition active:scale-95',
                    active ? 'border-brand-600 bg-brand-600 text-white shadow-lg shadow-brand-600/30' : order ? (order.status === 'billed' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-amber-300 bg-amber-50 text-amber-900') : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                  )}
                >
                  {table.name}
                  <span className={cn('num mt-0.5 text-[10px] font-semibold', active ? 'text-white/80' : 'text-ink-500')}>{order ? formatINR(order.total, { compact: true }) : `${table.seats} seats`}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="card p-3">
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="outline" className="h-auto flex-col gap-1 py-2" onClick={() => startDraft({ orderType: 'take_away', label: 'Take-away' })}>
              <ShoppingBag className="h-4 w-4" /> <span className="text-[11px]">Take-away</span>
            </Button>
            <Button size="sm" variant="outline" className="h-auto flex-col gap-1 py-2" onClick={() => setRoomPicker(true)}>
              <BedDouble className="h-4 w-4" /> <span className="text-[11px]">Room</span>
            </Button>
            <Button size="sm" variant="outline" className="h-auto flex-col gap-1 py-2" onClick={() => startDraft({ orderType: 'in_house', guestName: 'Staff', label: 'In-house · Staff' })}>
              <Users className="h-4 w-4" /> <span className="text-[11px]">In-house</span>
            </Button>
          </div>
          <ul className="space-y-1.5">
            {otherOrders.map((o) => (
              <li key={o.id}>
                <button onClick={() => select(o)} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition', o.id === selectedId ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-ink-50')}>
                  {o.orderType === 'room' ? <BedDouble className="h-4 w-4 text-violet-500" /> : o.orderType === 'in_house' ? <Users className="h-4 w-4 text-ink-400" /> : <ShoppingBag className="h-4 w-4 text-ink-400" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{o.orderType === 'room' ? `Room ${o.roomNumber}` : o.orderType === 'in_house' ? 'In-house' : 'Take-away'}</span>
                  <span className="num text-xs font-semibold text-ink-600">{formatINR(o.total)}</span>
                </button>
              </li>
            ))}
            {otherOrders.length === 0 && <li className="px-2 py-1 text-xs text-ink-400">No open take-away or room orders.</li>}
          </ul>
        </div>
      </div>

      {/* Center: menu */}
      <div className="card flex min-h-[560px] flex-col overflow-hidden">
        <div className="space-y-3 border-b border-ink-100 p-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu…" leading={<Search className="h-4 w-4" />} className="h-10" />
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {[{ id: 'all', name: 'All' }, ...data.categories].map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition', category === c.id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 2xl:grid-cols-4">
          {menu.map((item) => (
            <div key={item.id} className="relative">
              <button
                onClick={() => add(item.id)}
                disabled={!item.isAvailable}
                className={cn(
                  'flex h-24 w-full flex-col justify-between rounded-xl border border-ink-200 bg-white p-3 text-left transition active:scale-[0.97]',
                  item.isAvailable ? 'hover:border-brand-300 hover:shadow-card' : 'cursor-not-allowed opacity-40',
                  cart[item.id] && 'border-brand-500 ring-2 ring-brand-100',
                )}
              >
                <span className="flex items-start gap-1.5">
                  <span className={cn('mt-1 grid h-3 w-3 shrink-0 place-items-center rounded-[3px] border', item.isVeg ? 'border-emerald-600' : 'border-rose-700')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', item.isVeg ? 'bg-emerald-600' : 'bg-rose-700')} />
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink-900">{item.name}</span>
                </span>
                <span className="num text-sm font-bold text-ink-700">{formatINR(item.price)}</span>
              </button>
              {cart[item.id] ? <span className="num absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white shadow">{cart[item.id]}</span> : null}
              <button
                onClick={() => run(() => toggleAvailabilityAction(item.id, !item.isAvailable))}
                className="absolute right-1.5 bottom-1.5 rounded px-1 text-[10px] font-semibold text-ink-400 hover:text-ink-700"
                title={item.isAvailable ? 'Mark finished for today' : 'Back on menu'}
              >
                {item.isAvailable ? '86' : 'On'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: ticket */}
      <div className="card flex flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)]">
        <div className="bg-ink-950 px-4 py-3.5 text-white">
          <p className="text-[11px] font-medium text-ink-400">{selected ? `${selected.orderNo}${selected.billNo ? ` · Bill ${selected.billNo}` : ''}` : draft ? 'New order' : 'No order selected'}</p>
          <p className="mt-0.5 truncate text-lg font-bold">{ticketLabel ?? 'Pick a table, room or take-away'}</p>
        </div>
        <div className="scrollbar-thin min-h-40 flex-1 overflow-y-auto">
          <ul className="divide-y divide-ink-100">
            {selected?.items.map((item) => (
              <li key={item.id} className={cn('flex items-center gap-2 px-4 py-2.5 text-sm', item.status === 'void' && 'text-ink-300 line-through')}>
                <span className="num w-6 text-right font-bold text-ink-500">{item.quantity}×</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-800">{item.name}</span>
                  <span className="text-[11px] text-ink-400">KOT {item.kotNo}</span>
                </span>
                <span className="num font-semibold text-ink-800">{formatINR(item.amount)}</span>
                {canVoid && item.status !== 'void' && selected.status === 'open' && (
                  <button onClick={() => setVoidItemId(item.id)} className="rounded p-0.5 text-ink-300 hover:text-rose-600" aria-label="Void item">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
            {cartLines.map(([id, qty]) => {
              const item = itemMap.get(id)!;
              return (
                <li key={id} className="flex items-center gap-2 bg-brand-50/60 px-4 py-2 text-sm">
                  <div className="flex items-center rounded-md bg-white ring-1 ring-ink-200">
                    <button onClick={() => setCart((c) => ({ ...c, [id]: qty - 1 }))} className="grid h-7 w-7 place-items-center text-ink-500" aria-label="Less">
                      {qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="num w-5 text-center text-xs font-bold">{qty}</span>
                    <button onClick={() => setCart((c) => ({ ...c, [id]: qty + 1 }))} className="grid h-7 w-7 place-items-center text-ink-500" aria-label="More">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{item.name}</span>
                  <span className="num font-semibold text-brand-700">{formatINR(item.price * qty)}</span>
                </li>
              );
            })}
          </ul>
          {!selected?.items.length && cartLines.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-400">Tap menu items to add them.</p>}
        </div>

        <div className="space-y-1.5 border-t border-ink-200 px-4 py-3 text-sm">
          {selected && (
            <>
              <div className="flex justify-between text-ink-500">
                <span>Subtotal</span>
                <span className="num">{formatINR(selected.subtotal)}</span>
              </div>
              {selected.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="num">−{formatINR(selected.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-500">
                <span>CGST + SGST</span>
                <span className="num">{formatINR(selected.cgst + selected.sgst)}</span>
              </div>
            </>
          )}
          {cartLines.length > 0 && (
            <div className="flex justify-between font-medium text-brand-700">
              <span>Not sent yet</span>
              <span className="num">+{formatINR(cartTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-extrabold text-ink-900">
            <span>Total</span>
            <span className="num">{formatINR(Math.round(((selected?.total ?? 0) + cartWithTax) * 100) / 100)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-ink-100 bg-ink-50/60 p-3">
          <Button variant="secondary" disabled={cartLines.length === 0 || pending} onClick={() => sendKot(true)} className="col-span-2">
            <ChefHat className="h-4 w-4" /> Send KOT {cartLines.length ? `(${cartLines.reduce((t, [, q]) => t + q, 0)})` : ''}
          </Button>
          {selected && selected.status === 'open' && (
            <Button variant="outline" disabled={pending || cartLines.length > 0} onClick={() => run(() => billOrderAction(selected.id), { success: (d) => `Bill ${d.billNo}`, onSuccess: () => window.open(`/print/bill/${selected.id}`, '_blank', 'width=420,height=700') })}>
              <Printer className="h-4 w-4" /> Print bill
            </Button>
          )}
          {selected && selected.status === 'billed' && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => reopenOrderAction(selected.id), { success: 'Bill re-opened' })}>
              <RotateCcw className="h-4 w-4" /> Re-open
            </Button>
          )}
          {selected && (
            <Button disabled={pending || cartLines.length > 0 || selected.total <= 0} onClick={() => setSettleOpen(true)}>
              <IndianRupee className="h-4 w-4" /> Settle
            </Button>
          )}
          {selected && canManage && (
            <Button variant="ghost" onClick={() => (setDiscountValue(selected.discount ? String(selected.discount) : ''), setDiscountOpen(true))}>
              <Gift className="h-4 w-4" /> Discount
            </Button>
          )}
          {selected && canVoid && (
            <Button variant="ghost" className="text-rose-600" onClick={() => setVoidOrderOpen(true)}>
              <Trash2 className="h-4 w-4" /> Void
            </Button>
          )}
        </div>
      </div>

      {settleOpen && selected && (
        <SettleDialog
          order={selected}
          inHouse={data.inHouse}
          onClose={() => setSettleOpen(false)}
          onSettle={async (mode, bookingId) => {
            const result = await run(() => settleOrderAction(selected.id, mode, bookingId), { success: (d) => `Settled ${d.billNo} · ${formatINR(d.total)}` });
            if (result.ok) {
              setSettleOpen(false);
              setSelectedId(null);
            }
          }}
          pending={pending}
          canComp={canManage}
        />
      )}
      {roomPicker && (
        <Dialog open onClose={() => setRoomPicker(false)} title="Room order" description="Choose the in-house guest. The bill can be added to their room bill.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data.inHouse.map((g) => (
              <button
                key={g.bookingId + g.roomId}
                onClick={() => {
                  setRoomPicker(false);
                  startDraft({ orderType: 'room', bookingId: g.bookingId, roomId: g.roomId, guestName: g.guestName, label: `Room ${g.roomNumber} · ${g.guestName}` });
                }}
                className="rounded-xl border border-ink-200 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p className="num text-lg font-extrabold text-ink-900">{g.roomNumber}</p>
                <p className="truncate text-xs text-ink-500">{g.guestName}</p>
              </button>
            ))}
            {data.inHouse.length === 0 && <p className="col-span-4 text-sm text-ink-500">No guests in house.</p>}
          </div>
        </Dialog>
      )}
      {discountOpen && selected && (
        <Dialog
          open
          size="sm"
          onClose={() => setDiscountOpen(false)}
          title="Discount on this bill"
          description="Amount in ₹ before GST."
          footer={
            <>
              <Button variant="outline" onClick={() => setDiscountOpen(false)}>
                Cancel
              </Button>
              <Button loading={pending} onClick={() => run(() => setDiscountAction(selected.id, Number(discountValue) || 0), { onSuccess: () => setDiscountOpen(false) })}>
                Apply
              </Button>
            </>
          }
        >
          <Input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} leading={<span className="text-sm">₹</span>} autoFocus />
        </Dialog>
      )}
      <ConfirmDialog
        open={voidOrderOpen}
        onClose={() => setVoidOrderOpen(false)}
        title={`Void ${selected?.orderNo}?`}
        description="The whole order is cancelled. If it was moved to a room bill, it is removed from there too."
        requireReason
        confirmLabel="Void order"
        loading={pending}
        onConfirm={async (reason) => {
          if (!selected) return;
          const r = await run(() => voidOrderAction(selected.id, reason));
          if (r.ok) {
            setVoidOrderOpen(false);
            setSelectedId(null);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(voidItemId)}
        onClose={() => setVoidItemId(null)}
        title="Void this item?"
        requireReason
        confirmLabel="Void item"
        loading={pending}
        onConfirm={async (reason) => {
          if (voidItemId) await run(() => voidItemAction(voidItemId, reason), { onSuccess: () => setVoidItemId(null) });
        }}
      />
    </div>
  );

}

function SettleDialog({
  order,
  inHouse,
  onClose,
  onSettle,
  pending,
  canComp,
}: {
  order: Order;
  inHouse: Terminal['inHouse'];
  onClose: () => void;
  onSettle: (mode: 'cash' | 'card' | 'upi' | 'room_transfer' | 'complimentary', bookingId?: string | null) => void;
  pending: boolean;
  canComp: boolean;
}) {
  const [bookingId, setBookingId] = useState(order.bookingId ?? '');
  const [tendered, setTendered] = useState('');
  const change = Number(tendered) - order.total;
  const modes = [
    { mode: 'cash' as const, label: 'Cash', icon: Wallet },
    { mode: 'upi' as const, label: 'UPI', icon: QrCode },
    { mode: 'card' as const, label: 'Card', icon: CreditCard },
  ];
  return (
    <Dialog open onClose={onClose} title={`Settle ${formatINR(order.total)}`} description={order.orderNo}>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button
            key={m.mode}
            disabled={pending}
            onClick={() => onSettle(m.mode)}
            className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-ink-200 bg-white text-sm font-bold text-ink-800 transition hover:border-brand-500 hover:bg-brand-50/50 active:scale-95"
          >
            <m.icon className="h-5 w-5 text-brand-600" /> {m.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-sm">
        <span className="text-ink-600">Cash received</span>
        <Input type="number" value={tendered} onChange={(e) => setTendered(e.target.value)} className="h-9 w-28" />
        {Number(tendered) > 0 && <span className={cn('num ml-auto font-bold', change >= 0 ? 'text-emerald-700' : 'text-rose-600')}>{change >= 0 ? `Return ${formatINR(change)}` : `Short ${formatINR(-change)}`}</span>}
      </div>
      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <ArrowRightLeft className="h-4 w-4" /> Room transfer (add to the guest's room bill)
        </p>
        <div className="mt-2 flex gap-2">
          <Select value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            <option value="">Choose in-house guest…</option>
            {inHouse.map((g) => (
              <option key={g.bookingId + g.roomId} value={g.bookingId}>
                Room {g.roomNumber} · {g.guestName}
              </option>
            ))}
          </Select>
          <Button variant="secondary" disabled={!bookingId || pending} onClick={() => onSettle('room_transfer', bookingId)}>
            Transfer
          </Button>
        </div>
      </div>
      {canComp && (
        <button disabled={pending} onClick={() => onSettle('complimentary')} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
          <Receipt className="h-3.5 w-3.5" /> Mark complimentary
        </button>
      )}
    </Dialog>
  );
}
