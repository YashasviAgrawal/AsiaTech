import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts, updatedAt } from './_shared';
import { properties, users } from './tenancy';
import { rooms } from './rooms';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const HK_CATEGORIES = ['cleaning', 'amenities', 'maintenance'] as const;
export type HkCategory = (typeof HK_CATEGORIES)[number];

/** One master item per thing (e.g. "AC"); duplicates are blocked case-insensitively via name_key. */
export const hkChecklistItems = pgTable(
  'hk_checklist_items',
  {
    id: pk(),
    propertyId: propertyRef(),
    name: text('name').notNull(),
    nameHi: text('name_hi'),
    nameKey: text('name_key').notNull(),
    category: text('category', { enum: HK_CATEGORIES }).notNull().default('cleaning'),
    /** Empty array = applies to every room type. */
    roomTypeIds: uuid('room_type_ids').array().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('hk_checklist_items_key_uq').on(t.propertyId, t.nameKey)],
);

export type ChecklistResult = { itemId: string; result: 'ok' | 'problem' | 'missing'; note?: string };

export const hkTasks = pgTable(
  'hk_tasks',
  {
    id: pk(),
    propertyId: propertyRef(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['checkout_clean', 'stayover_clean', 'inspection', 'deep_clean', 'turn_down'] })
      .notNull()
      .default('checkout_clean'),
    status: text('status', { enum: ['pending', 'in_progress', 'done', 'verified', 'cancelled'] })
      .notNull()
      .default('pending'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] }).notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    results: jsonb('results').$type<ChecklistResult[]>().notNull().default([]),
    notes: text('notes'),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('hk_tasks_room_idx').on(t.roomId), index('hk_tasks_due_idx').on(t.propertyId, t.dueDate, t.status)],
);

export const maintenanceTickets = pgTable(
  'maintenance_tickets',
  {
    id: pk(),
    propertyId: propertyRef(),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    checklistItemId: uuid('checklist_item_id').references(() => hkChecklistItems.id, { onDelete: 'set null' }),
    hkTaskId: uuid('hk_task_id').references(() => hkTasks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['open', 'in_progress', 'resolved'] }).notNull().default('open'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] }).notNull().default('normal'),
    reportedBy: uuid('reported_by').references(() => users.id),
    assignedTo: uuid('assigned_to').references(() => users.id),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('maintenance_tickets_status_idx').on(t.propertyId, t.status)],
);
