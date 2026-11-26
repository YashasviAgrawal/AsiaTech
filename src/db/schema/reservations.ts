import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, percent, pk, ts, updatedAt } from './_shared';
import { properties, users } from './tenancy';
import { MEAL_PLANS, ratePlans, roomTypes, rooms } from './rooms';

const propertyRef = () =>
  uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' });

export const ID_TYPES = ['aadhaar', 'passport', 'driving_licence', 'voter_id', 'pan', 'other'] as const;

export const guests = pgTable(
  'guests',
  {
    id: pk(),
    propertyId: propertyRef(),
    name: text('name').notNull(),
    /** Lower-cased, de-spaced name used for duplicate detection. */
    nameKey: text('name_key').notNull(),
    mobile: text('mobile'),
    email: text('email'),
    gender: text('gender', { enum: ['male', 'female', 'other'] }),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    nationality: text('nationality').notNull().default('Indian'),
    isForeign: boolean('is_foreign').notNull().default(false),
    addressLine: text('address_line'),
    city: text('city'),
    state: text('state'),
    country: text('country').notNull().default('India'),
    pincode: text('pincode'),
    company: text('company'),
    companyGstin: text('company_gstin'),
    idType: text('id_type', { enum: ID_TYPES }),
    /** Only the masked number is stored (e.g. XXXX-XXXX-1234). */
    idNumberMasked: text('id_number_masked'),
    idPhotos: text('id_photos').array().notNull().default([]),
    /** Form-III (FRRO) fields for foreign guests. */
    passportNumber: text('passport_number'),
    passportExpiry: date('passport_expiry', { mode: 'string' }),
    visaNumber: text('visa_number'),
    visaType: text('visa_type'),
    visaExpiry: date('visa_expiry', { mode: 'string' }),
    arrivedFrom: text('arrived_from'),
    nextDestination: text('next_destination'),
    arrivalInIndia: date('arrival_in_india', { mode: 'string' }),
    purposeOfVisit: text('purpose_of_visit'),
    notes: text('notes'),
    isVip: boolean('is_vip').notNull().default(false),
    mergedIntoId: uuid('merged_into_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('guests_mobile_idx').on(t.propertyId, t.mobile),
    index('guests_name_key_idx').on(t.propertyId, t.nameKey),
    // LIKE 'vive%' lookups for possible duplicates (the plain index cannot serve LIKE outside the C collation).
    index('guests_name_key_prefix_idx').on(t.propertyId, t.nameKey.op('text_pattern_ops')),
    index('guests_created_idx').on(t.propertyId, t.createdAt),
  ],
);

export const BOOKING_SOURCES = ['front_desk', 'walk_in', 'phone', 'ota', 'web', 'agent', 'corporate'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const BOOKING_STATUSES = ['hold', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable(
  'bookings',
  {
    id: pk(),
    propertyId: propertyRef(),
    /** FDR… (front desk), OTA… (channels), WEB… (booking engine). */
    bookingNo: text('booking_no').notNull(),
    source: text('source', { enum: BOOKING_SOURCES }).notNull().default('front_desk'),
    /** OTA name when source = ota, e.g. makemytrip, goibibo, booking_com. */
    channel: text('channel'),
    otaRef: text('ota_ref'),
    status: text('status', { enum: BOOKING_STATUSES }).notNull().default('confirmed'),
    holdUntil: ts('hold_until'),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id),
    checkIn: date('check_in', { mode: 'string' }).notNull(),
    checkOut: date('check_out', { mode: 'string' }).notNull(),
    nights: integer('nights').notNull(),
    adults: integer('adults').notNull().default(1),
    children: integer('children').notNull().default(0),
    /** Room charges before discount and tax. */
    roomAmount: money('room_amount').notNull().default(0),
    discountAmount: money('discount_amount').notNull().default(0),
    taxAmount: money('tax_amount').notNull().default(0),
    /** Room booking value (room − discount + tax). Folio extras are added on top at check-out. */
    totalAmount: money('total_amount').notNull().default(0),
    paidAmount: money('paid_amount').notNull().default(0),
    /** Who pays: the guest, a company or a travel agent (drives the Credit Report). */
    billTo: text('bill_to', { enum: ['guest', 'company', 'agent', 'ota'] }).notNull().default('guest'),
    billToName: text('bill_to_name'),
    arrivalTime: text('arrival_time'),
    specialRequests: text('special_requests'),
    internalNotes: text('internal_notes'),
    createdBy: uuid('created_by').references(() => users.id),
    confirmedAt: ts('confirmed_at'),
    /** FRRO Form-C for foreign guests must be filed within 24 hours of arrival. */
    formCSubmittedAt: ts('form_c_submitted_at'),
    formCRef: text('form_c_ref'),
    cancelledAt: ts('cancelled_at'),
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('bookings_no_uq').on(t.propertyId, t.bookingNo),
    index('bookings_dates_idx').on(t.propertyId, t.checkIn, t.checkOut),
    index('bookings_status_idx').on(t.propertyId, t.status),
    index('bookings_guest_idx').on(t.guestId),
    index('bookings_created_idx').on(t.propertyId, t.createdAt),
  ],
);

export interface NightlyRate {
  date: string;
  rate: number;
  extraBeds: number;
  amount: number;
  taxRate: number;
}

export const bookingRooms = pgTable(
  'booking_rooms',
  {
    id: pk(),
    propertyId: propertyRef(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    ratePlanId: uuid('rate_plan_id').references(() => ratePlans.id),
    mealPlan: text('meal_plan', { enum: MEAL_PLANS }).notNull().default('EP'),
    /** Assigned physical room; null until assigned. */
    roomId: uuid('room_id').references(() => rooms.id),
    checkIn: date('check_in', { mode: 'string' }).notNull(),
    checkOut: date('check_out', { mode: 'string' }).notNull(),
    adults: integer('adults').notNull().default(2),
    children: integer('children').notNull().default(0),
    extraBeds: integer('extra_beds').notNull().default(0),
    nightly: jsonb('nightly').$type<NightlyRate[]>().notNull().default([]),
    amount: money('amount').notNull().default(0),
    status: text('status', { enum: ['reserved', 'in_house', 'departed', 'cancelled', 'no_show'] })
      .notNull()
      .default('reserved'),
    checkedInAt: ts('checked_in_at'),
    checkedOutAt: ts('checked_out_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('booking_rooms_booking_idx').on(t.bookingId),
    index('booking_rooms_room_dates_idx').on(t.propertyId, t.roomId, t.checkIn, t.checkOut),
    // Stays covering a date or range (revenue for the dashboard and reports): check_out > from finds the few recent ones.
    index('booking_rooms_stay_idx').on(t.propertyId, t.checkOut, t.checkIn),
  ],
);

export const FOLIO_TYPES = ['room', 'pos', 'extra', 'discount', 'payment', 'refund', 'adjustment', 'cancellation'] as const;
export type FolioType = (typeof FOLIO_TYPES)[number];

/** Every charge and credit on a guest's bill. Charges are positive, payments/discounts negative. */
export const folioLines = pgTable(
  'folio_lines',
  {
    id: pk(),
    propertyId: propertyRef(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    bookingRoomId: uuid('booking_room_id').references(() => bookingRooms.id),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    type: text('type', { enum: FOLIO_TYPES }).notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    /** Taxable value (before GST). */
    amount: money('amount').notNull(),
    taxRate: percent('tax_rate').notNull().default(0),
    cgst: money('cgst').notNull().default(0),
    sgst: money('sgst').notNull().default(0),
    igst: money('igst').notNull().default(0),
    total: money('total').notNull(),
    hsnSac: text('hsn_sac'),
    posOrderId: uuid('pos_order_id'),
    paymentId: uuid('payment_id'),
    postedBy: uuid('posted_by').references(() => users.id),
    isVoid: boolean('is_void').notNull().default(false),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
  },
  (t) => [index('folio_lines_booking_idx').on(t.bookingId), index('folio_lines_date_idx').on(t.propertyId, t.businessDate)],
);

export interface InvoiceLine {
  description: string;
  hsnSac: string;
  quantity: number;
  amount: number;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export const invoices = pgTable(
  'invoices',
  {
    id: pk(),
    propertyId: propertyRef(),
    bookingId: uuid('booking_id').references(() => bookings.id),
    posOrderId: uuid('pos_order_id'),
    invoiceNo: text('invoice_no').notNull(),
    financialYear: text('financial_year').notNull(),
    invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
    buyerName: text('buyer_name').notNull(),
    buyerGstin: text('buyer_gstin'),
    buyerAddress: text('buyer_address'),
    placeOfSupply: text('place_of_supply'),
    lines: jsonb('lines').$type<InvoiceLine[]>().notNull(),
    subtotal: money('subtotal').notNull(),
    cgst: money('cgst').notNull().default(0),
    sgst: money('sgst').notNull().default(0),
    igst: money('igst').notNull().default(0),
    total: money('total').notNull(),
    paid: money('paid').notNull().default(0),
    status: text('status', { enum: ['issued', 'cancelled'] }).notNull().default('issued'),
    pdfUrl: text('pdf_url'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invoices_no_uq').on(t.propertyId, t.invoiceNo), index('invoices_booking_idx').on(t.bookingId)],
);

export const PAYMENT_MODES = ['cash', 'card', 'upi', 'bank_transfer', 'link', 'ota', 'cheque', 'room_transfer'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    propertyId: propertyRef(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    guestId: uuid('guest_id').references(() => guests.id),
    mode: text('mode', { enum: PAYMENT_MODES }).notNull(),
    kind: text('kind', { enum: ['advance', 'settlement', 'refund', 'request'] }).notNull().default('settlement'),
    amount: money('amount').notNull(),
    reference: text('reference'),
    purpose: text('purpose'),
    status: text('status', { enum: ['pending', 'success', 'failed', 'expired', 'refunded'] })
      .notNull()
      .default('success'),
    /** Request Money: payment link details. */
    linkId: text('link_id'),
    linkUrl: text('link_url'),
    linkExpiresAt: ts('link_expires_at'),
    payerName: text('payer_name'),
    payerMobile: text('payer_mobile'),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    paidAt: ts('paid_at'),
    receivedBy: uuid('received_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_booking_idx').on(t.bookingId),
    index('payments_date_idx').on(t.propertyId, t.businessDate),
    index('payments_link_idx').on(t.linkId),
  ],
);
