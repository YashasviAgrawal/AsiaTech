import { boolean, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, pk, updatedAt } from './_shared';
import { properties } from './tenancy';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const MEAL_PLANS = ['EP', 'CP', 'MAP', 'AP'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

export const HK_STATUSES = ['clean', 'dirty', 'inspected', 'out_of_order'] as const;
export type HkStatus = (typeof HK_STATUSES)[number];

export const roomTypes = pgTable(
  'room_types',
  {
    id: pk(),
    propertyId: propertyRef(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    baseOccupancy: integer('base_occupancy').notNull().default(2),
    maxAdults: integer('max_adults').notNull().default(2),
    maxChildren: integer('max_children').notNull().default(1),
    maxExtraBeds: integer('max_extra_beds').notNull().default(1),
    sizeSqft: integer('size_sqft'),
    bedType: text('bed_type'),
    amenities: text('amenities').array().notNull().default([]),
    photos: text('photos').array().notNull().default([]),
    /** Hex colour used for this room type on the Room Chart and calendar. */
    color: text('color').notNull().default('#e11d48'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('room_types_code_uq').on(t.propertyId, t.code)],
);

export const rooms = pgTable(
  'rooms',
  {
    id: pk(),
    propertyId: propertyRef(),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    floor: text('floor'),
    hkStatus: text('hk_status', { enum: HK_STATUSES }).notNull().default('clean'),
    oooReason: text('ooo_reason'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rooms_number_uq').on(t.propertyId, t.number), index('rooms_type_idx').on(t.roomTypeId)],
);

/** A sellable product: room type × meal plan (EP/CP/MAP/AP) with rack prices and a policy. */
export const ratePlans = pgTable(
  'rate_plans',
  {
    id: pk(),
    propertyId: propertyRef(),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mealPlan: text('meal_plan', { enum: MEAL_PLANS }).notNull().default('EP'),
    cancellationPolicy: text('cancellation_policy'),
    /** Rack prices used when no per-date row exists in `rates`. */
    price1: money('price_1').notNull(),
    price2: money('price_2').notNull(),
    price3: money('price_3').notNull(),
    extraBed: money('extra_bed').notNull().default(0),
    childPrice: money('child_price').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('rate_plans_type_idx').on(t.roomTypeId)],
);

/** Price and restrictions for one rate plan on one date. */
export const rates = pgTable(
  'rates',
  {
    id: pk(),
    propertyId: propertyRef(),
    ratePlanId: uuid('rate_plan_id')
      .notNull()
      .references(() => ratePlans.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    price1: money('price_1').notNull(),
    price2: money('price_2').notNull(),
    price3: money('price_3').notNull(),
    extraBed: money('extra_bed').notNull().default(0),
    minStay: integer('min_stay').notNull().default(1),
    stopSell: boolean('stop_sell').notNull().default(false),
    closedToArrival: boolean('closed_to_arrival').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rates_plan_date_uq').on(t.ratePlanId, t.date), index('rates_property_date_idx').on(t.propertyId, t.date)],
);

/**
 * One row per room type per date. available = total − booked − blocked.
 * Rows are locked with SELECT … FOR UPDATE whenever a booking reserves or releases rooms (PLAN.md §4).
 */
export const inventory = pgTable(
  'inventory',
  {
    id: pk(),
    propertyId: propertyRef(),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    total: integer('total').notNull(),
    booked: integer('booked').notNull().default(0),
    blocked: integer('blocked').notNull().default(0),
    stopSell: boolean('stop_sell').notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('inventory_type_date_uq').on(t.roomTypeId, t.date),
    index('inventory_property_date_idx').on(t.propertyId, t.date),
  ],
);
