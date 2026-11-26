import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db';
import { posOrderItems, posOrders, posOutlets, posTables, printAgents, printers, printJobs, properties, rooms, users } from '@/db/schema';
import { PAYMENT_MODE_LABELS, timeAgo } from '@/lib/format';
import { logActivity } from '../audit';
import { UserError } from '../errors';
import type { Actor } from './actor';
import { billTicket, kotTicket, testTicket } from './print-tickets';

/** A job nobody picked up within this time is not printed late (a 2-hour-old KOT would be cooked twice). */
export const STALE_AFTER_MINUTES = 15;
/** A job claimed but not reported back is handed out again after this. */
const CLAIM_TIMEOUT_SECONDS = 60;
const MAX_ATTEMPTS = 3;
/** The agent counts as online when it asked for jobs within this time (it asks every ~25 s at most). */
export const AGENT_ONLINE_SECONDS = 70;

type PrinterRow = typeof printers.$inferSelect;
const width = (p: PrinterRow) => (p.paperWidth <= 58 ? 58 : 80) as 58 | 80;

/* ───────────────────────────── printers ───────────────────────────── */

export async function listPrinting(propertyId: string) {
  const [printerRows, agentRows, jobRows] = await Promise.all([
    db
      .select({ printer: printers, outletName: posOutlets.name })
      .from(printers)
      .leftJoin(posOutlets, eq(posOutlets.id, printers.outletId))
      .where(eq(printers.propertyId, propertyId))
      .orderBy(asc(printers.createdAt)),
    db.select().from(printAgents).where(and(eq(printAgents.propertyId, propertyId), isNull(printAgents.revokedAt))).orderBy(asc(printAgents.createdAt)),
    db
      .select({
        id: printJobs.id,
        kind: printJobs.kind,
        label: printJobs.label,
        status: printJobs.status,
        attempts: printJobs.attempts,
        error: printJobs.error,
        createdAt: printJobs.createdAt,
        printedAt: printJobs.printedAt,
        printerName: printers.name,
      })
      .from(printJobs)
      .innerJoin(printers, eq(printers.id, printJobs.printerId))
      .where(eq(printJobs.propertyId, propertyId))
      .orderBy(desc(printJobs.createdAt))
      .limit(40),
  ]);
  const now = Date.now();
  return {
    printers: printerRows.map((r) => ({ ...r.printer, outletName: r.outletName })),
    // "12 seconds ago" is worked out here, once, so the server and browser render the same text.
    agents: agentRows.map((a) => ({ id: a.id, name: a.name, keyHint: a.keyHint, lastSeenAt: a.lastSeenAt, lastSeenLabel: a.lastSeenAt ? timeAgo(a.lastSeenAt, new Date(now)) : null, lastIp: a.lastIp, createdAt: a.createdAt, online: !!a.lastSeenAt && now - a.lastSeenAt.getTime() < AGENT_ONLINE_SECONDS * 1000 })),
    jobs: jobRows,
  };
}

export interface PrinterInput {
  id?: string | null;
  name: string;
  outletId: string | null;
  role: 'kot' | 'bill' | 'both';
  connection: 'network' | 'shared';
  address: string;
  paperWidth: 58 | 80;
  copies: number;
  autoPrint: boolean;
  isActive: boolean;
}

/** "192.168.1.50" → "192.168.1.50:9100"; refuses anything that is not a LAN-style host. */
export function normalisePrinterAddress(connection: 'network' | 'shared', address: string): string {
  const value = address.trim();
  if (connection === 'shared') {
    if (!value || value.length > 200 || /[\0\r\n]/.test(value)) throw new UserError('Enter the printer path, e.g. \\\\localhost\\KOT or /dev/usb/lp0.');
    return value;
  }
  const match = /^([A-Za-z0-9.-]{1,100})(?::(\d{1,5}))?$/.exec(value);
  if (!match) throw new UserError('Enter the printer IP address, e.g. 192.168.1.50 (port 9100 is added for you).');
  const port = match[2] ? Number(match[2]) : 9100;
  if (port < 1 || port > 65535) throw new UserError('The port must be between 1 and 65535.');
  return `${match[1]}:${port}`;
}

export async function savePrinter(actor: Actor, input: PrinterInput) {
  const name = input.name.trim();
  if (!name) throw new UserError('Give the printer a name, e.g. Kitchen.');
  if (input.outletId) {
    const [outlet] = await db.select({ id: posOutlets.id }).from(posOutlets).where(and(eq(posOutlets.id, input.outletId), eq(posOutlets.propertyId, actor.propertyId)));
    if (!outlet) throw new UserError('Outlet not found.');
  }
  const values = {
    name,
    outletId: input.outletId,
    role: input.role,
    connection: input.connection,
    address: normalisePrinterAddress(input.connection, input.address),
    paperWidth: input.paperWidth === 58 ? 58 : 80,
    copies: Math.max(1, Math.min(input.copies, 5)),
    autoPrint: input.autoPrint,
    isActive: input.isActive,
  };
  if (input.id) {
    const [row] = await db.update(printers).set(values).where(and(eq(printers.id, input.id), eq(printers.propertyId, actor.propertyId))).returning({ id: printers.id });
    if (!row) throw new UserError('Printer not found.');
    return row;
  }
  const [row] = await db.insert(printers).values({ ...values, propertyId: actor.propertyId }).returning({ id: printers.id });
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'printer', entityId: row.id, action: 'create', summary: `Added printer ${name} (${values.address})` });
  return row;
}

export async function deletePrinter(actor: Actor, printerId: string) {
  const [row] = await db.delete(printers).where(and(eq(printers.id, printerId), eq(printers.propertyId, actor.propertyId))).returning({ name: printers.name });
  if (!row) throw new UserError('Printer not found.');
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'printer', entityId: printerId, action: 'delete', summary: `Removed printer ${row.name}` });
}

/* ───────────────────────────── agents ───────────────────────────── */

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** A new agent key, shown once. Only its hash is stored. */
export async function createAgentKey(actor: Actor, name: string) {
  const key = `hpa_${randomBytes(24).toString('base64url')}`;
  const [row] = await db
    .insert(printAgents)
    .values({ propertyId: actor.propertyId, name: name.trim() || 'Front desk PC', keyHash: hashKey(key), keyHint: key.slice(-4) })
    .returning({ id: printAgents.id });
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'print_agent', entityId: row.id, action: 'create', summary: `Created print agent key …${key.slice(-4)}` });
  return { id: row.id, key };
}

export async function revokeAgent(actor: Actor, agentId: string) {
  const [row] = await db
    .update(printAgents)
    .set({ revokedAt: new Date() })
    .where(and(eq(printAgents.id, agentId), eq(printAgents.propertyId, actor.propertyId), isNull(printAgents.revokedAt)))
    .returning({ keyHint: printAgents.keyHint });
  if (!row) throw new UserError('Agent not found.');
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'print_agent', entityId: agentId, action: 'revoke', summary: `Revoked print agent key …${row.keyHint}` });
}

export async function authenticateAgent(authorization: string | null, ip: string) {
  const key = authorization?.match(/^Bearer\s+(hpa_[A-Za-z0-9_-]{32})$/)?.[1];
  if (!key) return null;
  const [agent] = await db
    .update(printAgents)
    .set({ lastSeenAt: new Date(), lastIp: ip.slice(0, 64) })
    .where(and(eq(printAgents.keyHash, hashKey(key)), isNull(printAgents.revokedAt)))
    .returning();
  return agent ?? null;
}

/* ───────────────────────────── queue ───────────────────────────── */

async function queue(tx: DbOrTx, actor: Actor, printer: PrinterRow, job: { kind: 'kot' | 'bill' | 'test'; label: string; entityId?: string | null; payload: Buffer }) {
  const [row] = await tx
    .insert(printJobs)
    .values({ propertyId: actor.propertyId, printerId: printer.id, kind: job.kind, label: job.label, entityId: job.entityId ?? null, payload: job.payload.toString('base64'), createdBy: actor.userId })
    .returning({ id: printJobs.id });
  return row.id;
}

/** Active printers for this outlet that take this kind of ticket. */
async function printersFor(propertyId: string, outletId: string, role: 'kot' | 'bill', autoOnly: boolean) {
  return db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.propertyId, propertyId),
        eq(printers.isActive, true),
        or(isNull(printers.outletId), eq(printers.outletId, outletId)),
        inArray(printers.role, [role, 'both']),
        autoOnly ? eq(printers.autoPrint, true) : undefined,
      ),
    )
    .orderBy(asc(printers.createdAt));
}

async function orderForPrint(propertyId: string, orderId: string) {
  const [row] = await db
    .select({ order: posOrders, outlet: posOutlets, table: posTables.name, room: rooms.number, by: users.name })
    .from(posOrders)
    .innerJoin(posOutlets, eq(posOutlets.id, posOrders.outletId))
    .leftJoin(posTables, eq(posTables.id, posOrders.tableId))
    .leftJoin(rooms, eq(rooms.id, posOrders.roomId))
    .leftJoin(users, eq(users.id, posOrders.createdBy))
    .where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, propertyId)));
  return row ?? null;
}

/** "Table T4", "Room 203", "Take-away" (the KOT prints it in capitals). */
function whereLabel(row: NonNullable<Awaited<ReturnType<typeof orderForPrint>>>) {
  if (row.table) return `Table ${row.table}`;
  if (row.room) return `Room ${row.room}`;
  return row.order.orderType === 'take_away' ? 'Take-away' : row.order.orderType === 'in_house' ? 'In-house' : row.order.orderType;
}

/**
 * Queue a KOT on the kitchen printer(s). `auto` is the automatic print after "Send KOT" (only printers with
 * auto-print on); otherwise it is a reprint. Returns the printer names, so the terminal can say where it went.
 */
export async function queueKot(actor: Actor, orderId: string, kotNo: number, options: { auto: boolean; byName?: string | null }) {
  const row = await orderForPrint(actor.propertyId, orderId);
  if (!row) throw new UserError('Order not found.');
  const targets = await printersFor(actor.propertyId, row.order.outletId, 'kot', options.auto);
  if (targets.length === 0) return [];
  const items = await db
    .select({ quantity: posOrderItems.quantity, name: posOrderItems.name, notes: posOrderItems.notes })
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, orderId), eq(posOrderItems.kotNo, kotNo), ne(posOrderItems.status, 'void')))
    .orderBy(asc(posOrderItems.createdAt));
  if (items.length === 0) throw new UserError('This KOT has no items left.');
  const where = whereLabel(row);
  for (const printer of targets) {
    const payload = kotTicket(
      { outletName: row.outlet.name, kotNo, orderNo: row.order.orderNo, where: where.toUpperCase(), guestName: row.room ? row.order.guestName : null, covers: row.order.covers, by: options.byName ?? row.by, at: new Date(), items, reprint: !options.auto },
      width(printer),
    );
    await queue(db, actor, printer, { kind: 'kot', label: `KOT ${kotNo} · ${row.order.orderNo} · ${where}`, entityId: orderId, payload: repeat(payload, printer.copies) });
  }
  return targets.map((p) => p.name);
}

/** Queue the GST bill on the counter printer(s). */
export async function queueBill(actor: Actor, orderId: string, options: { auto: boolean }) {
  const row = await orderForPrint(actor.propertyId, orderId);
  if (!row) throw new UserError('Order not found.');
  if (!row.order.billNo) throw new UserError('Print the bill from the terminal first.');
  const targets = await printersFor(actor.propertyId, row.order.outletId, 'bill', options.auto);
  if (targets.length === 0) return [];
  const [property] = await db.select().from(properties).where(eq(properties.id, actor.propertyId));
  const items = await db
    .select({ name: posOrderItems.name, quantity: posOrderItems.quantity, price: posOrderItems.price, amount: posOrderItems.amount })
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, orderId), ne(posOrderItems.status, 'void')))
    .orderBy(asc(posOrderItems.createdAt));
  const o = row.order;
  const upi = property.settings.invoice.showUpiQr && property.settings.invoice.upiId ? property.settings.invoice.upiId : null;
  const unpaid = o.status !== 'settled';
  for (const printer of targets) {
    const payload = billTicket(
      {
        outletName: row.outlet.name,
        hotelName: property.name,
        address: [property.addressLine1, property.city].filter(Boolean).join(', '),
        phone: property.phone,
        gstin: row.outlet.gstin ?? property.gstin,
        billNo: o.billNo!,
        at: o.settledAt ?? new Date(),
        where: whereLabel(row),
        items,
        subtotal: o.subtotal,
        discount: o.discount,
        cgst: o.cgst,
        sgst: o.sgst,
        total: o.total,
        paidBy: o.settlementMode ? PAYMENT_MODE_LABELS[o.settlementMode] ?? o.settlementMode : null,
        upiUri: unpaid && upi && o.total > 0 ? `upi://pay?pa=${upi}&pn=${encodeURIComponent(row.outlet.name)}&am=${o.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(o.billNo!)}` : null,
        footer: null,
      },
      width(printer),
    );
    await queue(db, actor, printer, { kind: 'bill', label: `Bill ${o.billNo} · ${o.total.toFixed(2)}`, entityId: orderId, payload: repeat(payload, printer.copies) });
  }
  return targets.map((p) => p.name);
}

export async function queueTest(actor: Actor, printerId: string) {
  const [printer] = await db.select().from(printers).where(and(eq(printers.id, printerId), eq(printers.propertyId, actor.propertyId)));
  if (!printer) throw new UserError('Printer not found.');
  const [property] = await db.select({ name: properties.name }).from(properties).where(eq(properties.id, actor.propertyId));
  await queue(db, actor, printer, { kind: 'test', label: `Test page · ${printer.name}`, payload: testTicket(printer.name, width(printer), property.name) });
  return printer.name;
}

/** "Print again": a failed (or any) job goes back in the queue with the same ticket. */
export async function retryJob(actor: Actor, jobId: string) {
  const [job] = await db.select().from(printJobs).where(and(eq(printJobs.id, jobId), eq(printJobs.propertyId, actor.propertyId)));
  if (!job) throw new UserError('Print job not found.');
  const [row] = await db
    .insert(printJobs)
    .values({ propertyId: job.propertyId, printerId: job.printerId, kind: job.kind, label: job.label.startsWith('Again · ') ? job.label : `Again · ${job.label}`, entityId: job.entityId, payload: job.payload, createdBy: actor.userId })
    .returning({ id: printJobs.id });
  return row.id;
}

function repeat(payload: Buffer, copies: number) {
  return copies > 1 ? Buffer.concat(Array.from({ length: copies }, () => payload)) : payload;
}

/* ───────────────────────────── agent side ───────────────────────────── */

export interface AgentJob {
  id: string;
  label: string;
  printer: { id: string; name: string; connection: 'network' | 'shared'; address: string };
  payload: string;
}

/**
 * Hand out queued jobs to an agent. Stale jobs are failed first (never print a KOT long after it was ordered);
 * SKIP LOCKED lets two agents poll at once without printing the same job twice.
 */
export async function claimJobs(agent: { id: string; propertyId: string }, limit = 10): Promise<AgentJob[]> {
  await db
    .update(printJobs)
    .set({ status: 'failed', error: `Not printed: no print agent was online for ${STALE_AFTER_MINUTES} minutes. Use "Print again" if it is still needed.` })
    .where(and(eq(printJobs.propertyId, agent.propertyId), eq(printJobs.status, 'queued'), sql`${printJobs.createdAt} < now() - make_interval(mins => ${STALE_AFTER_MINUTES})`));
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE print_jobs SET status = 'printing', claimed_at = now(), agent_id = ${agent.id}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM print_jobs
      WHERE property_id = ${agent.propertyId}
        AND (status = 'queued' OR (status = 'printing' AND claimed_at < now() - make_interval(secs => ${CLAIM_TIMEOUT_SECONDS})))
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = claimed.rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: printJobs.id, label: printJobs.label, payload: printJobs.payload, createdAt: printJobs.createdAt, printer: { id: printers.id, name: printers.name, connection: printers.connection, address: printers.address } })
    .from(printJobs)
    .innerJoin(printers, eq(printers.id, printJobs.printerId))
    .where(inArray(printJobs.id, ids))
    .orderBy(asc(printJobs.createdAt));
  return rows.map(({ createdAt: _c, ...r }) => r);
}

/** The agent reports back. A failure is retried (printer busy, paper out) until MAX_ATTEMPTS, then shown as failed. */
export async function completeJob(agent: { id: string; propertyId: string }, jobId: string, result: { ok: boolean; error?: string | null }) {
  const [job] = await db
    .select({ id: printJobs.id, attempts: printJobs.attempts, status: printJobs.status })
    .from(printJobs)
    .where(and(eq(printJobs.id, jobId), eq(printJobs.propertyId, agent.propertyId)));
  if (!job) return false;
  if (result.ok) {
    await db.update(printJobs).set({ status: 'printed', printedAt: new Date(), error: null }).where(eq(printJobs.id, jobId));
  } else {
    const error = (result.error || 'The printer did not answer.').slice(0, 300);
    await db
      .update(printJobs)
      .set({ status: job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', error })
      .where(eq(printJobs.id, jobId));
  }
  return true;
}
