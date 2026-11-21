import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, percent, pk, ts, updatedAt } from './_shared';
import { properties } from './tenancy';
import { ratePlans, roomTypes } from './rooms';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const OTAS = ['makemytrip', 'goibibo', 'booking_com', 'agoda', 'expedia', 'airbnb', 'cleartrip', 'easemytrip'] as const;
export type Ota = (typeof OTAS)[number];

export const channels = pgTable(
  'channels',
  {
    id: pk(),
    propertyId: propertyRef(),
    ota: text('ota', { enum: OTAS }).notNull(),
    hotelCode: text('hotel_code'),
    /** Access token or API key, sealed with AES-256-GCM (`src/server/secrets.ts`). Never read it directly: use openSecrets(). */
    credentials: jsonb('credentials').$type<Record<string, string>>().notNull().default({}),
    status: text('status', { enum: ['disconnected', 'pending', 'connected', 'error'] }).notNull().default('disconnected'),
    /** Listing health reported by the OTA (e.g. Booking.com "parked_business"). */
    listingStatus: text('listing_status', { enum: ['open', 'closed', 'parked_business', 'suspended', 'unknown'] })
      .notNull()
      .default('unknown'),
    listingMessage: text('listing_message'),
    commissionPercent: percent('commission_percent').notNull().default(0),
    rateMarkupPercent: percent('rate_markup_percent').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    lastSyncAt: ts('last_sync_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('channels_ota_uq').on(t.propertyId, t.ota)],
);

export const channelMappings = pgTable(
  'channel_mappings',
  {
    id: pk(),
    propertyId: propertyRef(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    ratePlanId: uuid('rate_plan_id').references(() => ratePlans.id, { onDelete: 'cascade' }),
    otaRoomId: text('ota_room_id').notNull(),
    otaRateId: text('ota_rate_id'),
    createdAt: createdAt(),
  },
  (t) => [index('channel_mappings_channel_idx').on(t.channelId)],
);

/** Outbox + log for every message exchanged with an OTA. Queued rows are drained by the worker. */
export const syncLogs = pgTable(
  'sync_logs',
  {
    id: pk(),
    propertyId: propertyRef(),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
    direction: text('direction', { enum: ['push', 'pull', 'webhook'] }).notNull(),
    kind: text('kind', { enum: ['availability', 'rates', 'restrictions', 'booking', 'promotion', 'listing'] }).notNull(),
    message: text('message').notNull(),
    payload: jsonb('payload'),
    response: jsonb('response'),
    status: text('status', { enum: ['queued', 'processing', 'success', 'failed'] }).notNull().default('queued'),
    retries: integer('retries').notNull().default(0),
    nextRetryAt: ts('next_retry_at'),
    processedAt: ts('processed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('sync_logs_status_idx').on(t.status, t.nextRetryAt), index('sync_logs_property_idx').on(t.propertyId, t.createdAt)],
);

export const PROMOTION_TYPES = ['basic', 'early_bird', 'last_minute', 'long_stay', 'coupon'] as const;

export const promotions = pgTable(
  'promotions',
  {
    id: pk(),
    propertyId: propertyRef(),
    name: text('name').notNull(),
    type: text('type', { enum: PROMOTION_TYPES }).notNull(),
    discountType: text('discount_type', { enum: ['percent', 'flat'] }).notNull().default('percent'),
    value: percent('value').notNull(),
    couponCode: text('coupon_code'),
    /** early_bird: days before arrival; last_minute: within days; long_stay: min nights. */
    conditionValue: integer('condition_value'),
    stayFrom: date('stay_from', { mode: 'string' }),
    stayTo: date('stay_to', { mode: 'string' }),
    bookFrom: date('book_from', { mode: 'string' }),
    bookTo: date('book_to', { mode: 'string' }),
    roomTypeIds: uuid('room_type_ids').array().notNull().default([]),
    channels: text('channels').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    pushedAt: ts('pushed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('promotions_property_idx').on(t.propertyId)],
);

export const reviews = pgTable(
  'reviews',
  {
    id: pk(),
    propertyId: propertyRef(),
    channel: text('channel').notNull(),
    externalId: text('external_id'),
    reviewerName: text('reviewer_name').notNull(),
    rating: percent('rating').notNull(),
    title: text('title'),
    text: text('text'),
    stayDate: date('stay_date', { mode: 'string' }),
    reply: text('reply'),
    repliedAt: ts('replied_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reviews_property_idx').on(t.propertyId, t.createdAt)],
);
