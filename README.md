# AsiaTech Hotel OS

The AsiaTech hotel panel, rebuilt as one simple, premium web app. It covers:

- **front desk (PMS)**
- **channel manager**
- **booking engine**
- **restaurant POS**
- **housekeeping**
- **back office**

It is built for Indian hotels: ₹ with Indian number format, GST slabs, Form-C for foreign guests, UPI, WhatsApp, and Hindi + English.

Every feature from the old AsiaTech screens is still here. The app gets simpler through fewer menus, smart defaults and one-click actions, not by cutting features. The UI uses the **Tixit** design language: rose brand, slate neutrals, dark sidebar.

| Doc | What it covers |
|-----|----------------|
| [`docs/PLAN.md`](docs/PLAN.md) | Build plan: 10 modules, checklists, feature traceability, database, phases |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | What is done, what changed, what is pending |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system (Tixit tokens, status colours, layout rules) |

## Quick start

Requirements: Node 20.9+ and PostgreSQL 14+.

```bash
cp .env.example .env            # then set DATABASE_URL and a long AUTH_SECRET
npm install
npm run db:migrate              # create the tables
npm run db:seed                 # demo hotel: Shri Ram Portico
npm run dev                     # http://localhost:3000
npm run worker                  # optional: OTA sync queue, hold expiry, monthly alerts
```

To start over at any time, run `npm run db:reset` (drop + migrate + seed).

### Demo logins

Every demo user has the password `Hotel@123`.

| Role | Sign in with | Lands on |
|------|--------------|----------|
| Owner (2 properties, property switcher) | `owner@shriramportico.in` | Home |
| Manager | `manager@shriramportico.in` | Home |
| Front desk | `frontdesk@shriramportico.in` | Home |
| Housekeeping (Hindi) | `9876500003` | My rooms (phone screen) |
| Restaurant | `restaurant@shriramportico.in` | Point Of Sale |
| Accountant | `accounts@shriramportico.in` | Home |

The public booking engine is at `/book/shri-ram-portico`, and needs no login.

## What is inside

| Section | Screens |
|---------|---------|
| **Home** | 12 clickable tiles, Today's Task with an action button on every item, Tonight (occupancy/ADR/RevPAR), System Update, Today's Bookings with Assign |
| **Front Desk** | Make A Reservation (one page, live GST), Hold Booking, Today Check (In-Out), Booking Report (+ Excel), Guests (duplicate merge), booking page (check-in with Form-III, folio, payments, check-out, GST invoice + UPI QR) |
| **Rooms & Rates** | Availability Calendar (Bulk Update with preview + Undo, Download Inventory), Room Chart (drag and drop), Rate Management, Room and Rate Plan |
| **Channels** | Channel Manager (connect, mapping, listing health, Fix listing), Sync Log with retry, Promotions, OTA Reviews, Booking Engine |
| **Restaurant** | POS terminal (tables, take-away, room orders, KOT, GST bill, room transfer), Orders & day close, Menu & Tables |
| **Housekeeping** | Room status board, checklist master (duplicate clean-up), repair tickets, Hindi phone screen |
| **Money** | Payments, Request Money (payment link → WhatsApp, auto-posted to the bill), Credit Report (ageing), Petty Cash, Night Audit wizard |
| **Reports** | 9 reports with charts and Excel export, Activity Log |
| **Settings** | Hotel Details (GST slabs, invoice settings), User Management (roles, login history), Branding, Notifications, Setup wizard |

## Architecture in one minute

- **Next.js 16** App Router. Server Components read data and Server Actions change it. Each action is validated with **zod** and returns `{ ok, error }`.
- **PostgreSQL + Drizzle ORM**. All 41 tables live in `src/db/schema`. Every business table has `property_id`, ready for multi-tenancy.
- **Tenancy guard**: every action resolves `requireContext()` / `actionContext(permission)` on the server, and every query filters by `ctx.propertyId`. Nothing trusts the browser.
- **No double-selling**: `reserveInventory()` locks the inventory rows (`SELECT … FOR UPDATE`) in a fixed order inside the same transaction as the booking insert. Six simultaneous OTA requests for the last room produce exactly one booking.
- **OTA sync**: every inventory/rate change writes to an outbox (`sync_logs`) inside the same transaction. The worker coalesces and pushes the updates through a provider adapter: `mock` by default, `channex` for production.
- **Providers behind adapters**: payments (`mock` / `razorpay`), WhatsApp (`console`), channels (`mock` / `channex`). All are switched by environment variables.
- **Audit and undo**: `activity_log` keeps before/after snapshots. Bulk inventory and rate changes and cancellations can be undone.

```
src/
  app/(app)/…      signed-in screens        app/book/…   public booking engine
  app/print/…      invoice, registration card, KOT, bill (print → PDF)
  app/api/…        search, Excel exports, OTA + payment webhooks
  components/ui    Tixit-style primitives    components/shell  sidebar, top bar, search
  db/              schema, migrations runner, seed
  server/          context (auth + tenancy), services/<domain>, actions/<domain>, adapters/
  lib/             ₹ + IST formatting, GST, navigation    i18n/  English + Hindi
```

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `npm run lint` · `npm test` | TypeScript, ESLint, Vitest |
| `npm run db:generate` | New migration from schema changes |
| `npm run db:migrate` · `db:seed` · `db:reset` | Database |
| `npm run worker` | Background jobs (OTA push queue, holds, alerts) |
