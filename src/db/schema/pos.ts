import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, percent, pk, ts, updatedAt } from './_shared';
import { properties, users } from './tenancy';
import { bookings } from './reservations';
import { rooms } from './rooms';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const posOutlets = pgTable('pos_outlets', {
  id: pk(),
  propertyId: propertyRef(),
  name: text('name').notNull(),
  code: text('code').notNull().default('RST'),
  gstin: text('gstin'),
  defaultTaxRate: percent('default_tax_rate').notNull().default(5),
  kotPrinterWidth: integer('kot_printer_width').notNull().default(80),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('pos_outlets_code_uq').on(t.propertyId, t.code)]);

export const posCategories = pgTable('pos_categories', {
  id: pk(),
  propertyId: propertyRef(),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => posOutlets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const posMenuItems = pgTable(
  'pos_menu_items',
  {
    id: pk(),
    propertyId: propertyRef(),
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => posOutlets.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => posCategories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    code: text('code'),
    price: money('price').notNull(),
    taxRate: percent('tax_rate').notNull().default(5),
    isVeg: boolean('is_veg').notNull().default(true),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('pos_menu_items_outlet_idx').on(t.outletId)],
);

export const posTables = pgTable('pos_tables', {
  id: pk(),
  propertyId: propertyRef(),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => posOutlets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  seats: integer('seats').notNull().default(4),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

export const POS_ORDER_TYPES = ['dine_in', 'take_away', 'room', 'in_house'] as const;
export const POS_SETTLEMENT_MODES = ['cash', 'card', 'upi', 'room_transfer', 'complimentary'] as const;

export const posOrders = pgTable(
  'pos_orders',
  {
    id: pk(),
    propertyId: propertyRef(),
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => posOutlets.id),
    orderNo: text('order_no').notNull(),
    billNo: text('bill_no'),
    orderType: text('order_type', { enum: POS_ORDER_TYPES }).notNull().default('dine_in'),
    tableId: uuid('table_id').references(() => posTables.id),
    bookingId: uuid('booking_id').references(() => bookings.id),
    roomId: uuid('room_id').references(() => rooms.id),
    guestName: text('guest_name'),
    covers: integer('covers').notNull().default(1),
    status: text('status', { enum: ['open', 'billed', 'settled', 'void'] }).notNull().default('open'),
    subtotal: money('subtotal').notNull().default(0),
    discount: money('discount').notNull().default(0),
    cgst: money('cgst').notNull().default(0),
    sgst: money('sgst').notNull().default(0),
    total: money('total').notNull().default(0),
    settlementMode: text('settlement_mode', { enum: POS_SETTLEMENT_MODES }),
    settledAt: ts('settled_at'),
    voidReason: text('void_reason'),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    kotCount: integer('kot_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('pos_orders_no_uq').on(t.propertyId, t.orderNo),
    index('pos_orders_date_idx').on(t.propertyId, t.businessDate),
    index('pos_orders_status_idx').on(t.outletId, t.status),
  ],
);

export const posOrderItems = pgTable(
  'pos_order_items',
  {
    id: pk(),
    propertyId: propertyRef(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => posOrders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => posMenuItems.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    price: money('price').notNull(),
    taxRate: percent('tax_rate').notNull().default(5),
    amount: money('amount').notNull(),
    notes: text('notes'),
    kotNo: integer('kot_no'),
    status: text('status', { enum: ['new', 'sent', 'void'] }).notNull().default('new'),
    createdAt: createdAt(),
  },
  (t) => [index('pos_order_items_order_idx').on(t.orderId)],
);

export const posDayCloses = pgTable(
  'pos_day_closes',
  {
    id: pk(),
    propertyId: propertyRef(),
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => posOutlets.id),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    totals: jsonb('totals').$type<Record<string, number>>().notNull(),
    closedBy: uuid('closed_by').references(() => users.id),
    closedAt: createdAt(),
  },
  (t) => [uniqueIndex('pos_day_closes_uq').on(t.outletId, t.businessDate)],
);

/* ─────────────────────────────────────────────────────────────────────────────
 * Thermal printing. The app runs in the cloud and cannot reach the kitchen's
 * printers, so a small print agent on a hotel PC collects jobs over HTTPS and
 * sends the raw ESC/POS bytes to each printer on the local network.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PRINTER_ROLES = ['kot', 'bill', 'both'] as const;

export const printers = pgTable('printers', {
  id: pk(),
  propertyId: propertyRef(),
  /** null = used by every outlet. */
  outletId: uuid('outlet_id').references(() => posOutlets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role', { enum: PRINTER_ROLES }).notNull().default('kot'),
  /** network: "192.168.1.50:9100". shared: a USB device or shared printer path on the agent PC ("/dev/usb/lp0", "\\\\localhost\\KOT"). */
  connection: text('connection', { enum: ['network', 'shared'] }).notNull().default('network'),
  address: text('address').notNull(),
  paperWidth: integer('paper_width').notNull().default(80),
  copies: integer('copies').notNull().default(1),
  /** Print KOTs / bills on their own as soon as they are made. */
  autoPrint: boolean('auto_print').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const printAgents = pgTable(
  'print_agents',
  {
    id: pk(),
    propertyId: propertyRef(),
    name: text('name').notNull(),
    /** sha256 of the key; the key itself is shown once. */
    keyHash: text('key_hash').notNull(),
    keyHint: text('key_hint').notNull(),
    lastSeenAt: ts('last_seen_at'),
    lastIp: text('last_ip'),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('print_agents_key_uq').on(t.keyHash)],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: pk(),
    propertyId: propertyRef(),
    printerId: uuid('printer_id')
      .notNull()
      .references(() => printers.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['kot', 'bill', 'test'] }).notNull(),
    /** "KOT 3 · Table T4", shown in the job list. */
    label: text('label').notNull(),
    entityId: uuid('entity_id'),
    /** ESC/POS bytes, base64. Rendered when queued, so a reprint is the same ticket. */
    payload: text('payload').notNull(),
    status: text('status', { enum: ['queued', 'printing', 'printed', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    agentId: uuid('agent_id').references(() => printAgents.id, { onDelete: 'set null' }),
    claimedAt: ts('claimed_at'),
    printedAt: ts('printed_at'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('print_jobs_queue_idx').on(t.propertyId, t.status, t.createdAt)],
);
