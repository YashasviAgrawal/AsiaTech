import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_shared';
import { properties, users } from './tenancy';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

/** Persisted Today's Task items (system alerts such as OTA listing problems). Derived tasks are computed live. */
export const tasks = pgTable(
  'tasks',
  {
    id: pk(),
    propertyId: propertyRef(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    severity: text('severity', { enum: ['info', 'warning', 'danger'] }).notNull().default('info'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    actionLabel: text('action_label'),
    actionHref: text('action_href'),
    status: text('status', { enum: ['open', 'done', 'dismissed'] }).notNull().default('open'),
    dueAt: ts('due_at'),
    createdAt: createdAt(),
  },
  (t) => [index('tasks_property_status_idx').on(t.propertyId, t.status)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    propertyId: propertyRef(),
    /** Null = everyone on the property. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['booking_new', 'booking_cancelled', 'sync_error', 'payment', 'housekeeping', 'system'] }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_property_idx').on(t.propertyId, t.createdAt)],
);

/** Product news shown in the "System Update" panel. Global, posted from the super-admin screen. */
export const systemUpdates = pgTable('system_updates', {
  id: pk(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tag: text('tag'),
  isPublished: boolean('is_published').notNull().default(true),
  publishedAt: createdAt(),
});

/** Who changed what, and when. `before`/`after` snapshots make undo possible. */
export const activityLog = pgTable(
  'activity_log',
  {
    id: pk(),
    propertyId: propertyRef(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    undoneAt: ts('undone_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_log_property_idx').on(t.propertyId, t.createdAt),
    index('activity_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

/** Per-property number series (booking numbers, invoice numbers, KOTs). Incremented under a row lock. */
export const counters = pgTable(
  'counters',
  {
    propertyId: propertyRef(),
    key: text('key').notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.key] })],
);

export const messageLog = pgTable(
  'message_log',
  {
    id: pk(),
    propertyId: propertyRef(),
    channel: text('channel', { enum: ['whatsapp', 'sms', 'email'] }).notNull(),
    recipient: text('recipient').notNull(),
    template: text('template'),
    body: text('body').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'delivered', 'failed'] }).notNull().default('queued'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    error: text('error'),
    sentBy: uuid('sent_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('message_log_property_idx').on(t.propertyId, t.createdAt)],
);

/** Generic background job queue (hold expiry, emails, reports). Drained by `npm run worker`. */
export const jobs = pgTable(
  'jobs',
  {
    id: pk(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    runAt: ts('run_at').notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('jobs_status_run_idx').on(t.status, t.runAt)],
);
