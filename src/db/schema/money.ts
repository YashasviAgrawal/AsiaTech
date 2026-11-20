import { date, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, pk, ts } from './_shared';
import { properties, users } from './tenancy';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const pettyCash = pgTable(
  'petty_cash',
  {
    id: pk(),
    propertyId: propertyRef(),
    entryDate: date('entry_date', { mode: 'string' }).notNull(),
    type: text('type', { enum: ['opening', 'top_up', 'expense'] }).notNull(),
    amount: money('amount').notNull(),
    category: text('category'),
    paidTo: text('paid_to'),
    description: text('description'),
    billPhotoUrl: text('bill_photo_url'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('approved'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('petty_cash_date_idx').on(t.propertyId, t.entryDate)],
);

export type NightAuditStep = {
  key: 'no_shows' | 'room_charges' | 'pos_closed' | 'cash_match' | 'lock_day' | 'email_report';
  status: 'pending' | 'done' | 'skipped';
  at?: string;
  detail?: string;
};

export const nightAudits = pgTable(
  'night_audits',
  {
    id: pk(),
    propertyId: propertyRef(),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
    steps: jsonb('steps').$type<NightAuditStep[]>().notNull().default([]),
    summary: jsonb('summary').$type<Record<string, number | string>>().notNull().default({}),
    reportUrl: text('report_url'),
    runBy: uuid('run_by').references(() => users.id),
    startedAt: createdAt(),
    completedAt: ts('completed_at'),
  },
  (t) => [uniqueIndex('night_audits_date_uq').on(t.propertyId, t.businessDate)],
);
