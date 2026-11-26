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
npm run db:migrate              # create the tables and built-in roles
npm run db:seed                 # demo hotel: Shri Ram Portico
npm run dev                     # http://localhost:3000
npm run worker                  # optional: OTA sync queue, hold expiry, monthly alerts
```

To start over at any time, run `npm run db:reset` (drop + migrate + seed).

### On a server (Docker)

```bash
cd deploy && cp .env.example .env   # fill in the four secrets and APP_URL
docker compose up -d --build        # Postgres + migrations + app + worker
docker compose run --rm tools npm run create-hotel -- --hotel "Hotel Sunrise" --owner "Asha Mehta" --email asha@sunrise.in
```

The owner signs in and Home walks them through setup (hotel details → rooms → rates → OTA → go live). HTTPS, updates and backups: [`deploy/README.md`](deploy/README.md).

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
| **Settings** | Hotel Details (GST slabs, invoice settings), User Management (roles, custom roles, login history), Branding, Notifications, Setup wizard; **My account** for everyone (own password, other devices, recent sign-ins) |

## Architecture in one minute

- **Next.js 16** App Router. Server Components read data and Server Actions change it. Each action is validated with **zod** and returns `{ ok, error }`.
- **PostgreSQL + Drizzle ORM**. All 41 tables live in `src/db/schema`. Every business table has `property_id`, ready for multi-tenancy.
- **Tenancy guard**: every action resolves `requireContext()` / `actionContext(permission)` on the server, and every query filters by `ctx.propertyId`. Nothing trusts the browser.
- **No double-selling**: `reserveInventory()` locks the inventory rows (`SELECT … FOR UPDATE`) in a fixed order inside the same transaction as the booking insert. Six simultaneous OTA requests for the last room produce exactly one booking.
- **OTA sync**: every inventory/rate change writes to an outbox (`sync_logs`) inside the same transaction. The worker coalesces and pushes the updates through a provider adapter: `mock` by default, `channex` for production.
- **Providers behind adapters**: payments (`mock` / `razorpay`), WhatsApp (`console`), channels (`mock` / `channex`). All are switched by environment variables.
- **Uploads** (`src/server/storage.ts`): photos are shrunk in the browser, checked by their bytes on the server and stored behind a driver (`local` disk, or `s3` for AWS S3 / Cloudflare R2 / MinIO, signed with SigV4 and no SDK). Guest IDs and bills are private (`/files/prv/…`, staff of that hotel only); room photos and branding are public.
- **Invoices as PDF** (`src/server/pdf/invoice-pdf.tsx`): the GST invoice is drawn on the server (react-pdf, Geist font with ₹), downloaded by staff at `/api/invoices/<id>/pdf`, emailed as an attachment over SMTP (`EMAIL_PROVIDER=smtp`), and shared on WhatsApp as a signed link (`/i/<token>`) the guest opens without signing in. Links are HMAC-signed with `AUTH_SECRET` and rate limited.
- **Thermal printing** (`src/lib/escpos.ts`, `src/server/services/printing.ts`, `print-agent/`): KOTs and bills are rendered as ESC/POS bytes (58 / 80 mm) and queued in `print_jobs`. A one-file agent (`node asiatech-print-agent.mjs --server … --key …`, Node 18+, no installs) on a hotel PC long-polls `/api/print-agent/jobs` and sends them to network printers (port 9100) or a USB / shared printer. Jobs are claimed with `SKIP LOCKED`, retried 3 times, and never printed more than 15 minutes late. Set up in Restaurant → Printers.
- **Rate limits** (`src/server/rate-limit.ts`): sliding windows on sign-in (failed attempts per network and per account), booking engine, webhooks, invoice links and the print agent. `RATE_LIMIT_STORE=memory` for one server; `postgres` shares counts between servers through an unlogged table with a per-key advisory lock.
- **Row-level security** (`src/db/tenant.ts`, `drizzle/0007_row_level_security.sql`): every business table has a Postgres policy on `property_id`. A staff request's hotel is stamped on each pooled connection (`app.property_id`), so even a query that forgets its property filter only sees and writes that hotel's rows. Work without a hotel (worker, webhooks, public booking engine, seed, platform console) runs unstamped and sees all rows. Connect as a role that is not a superuser and has no BYPASSRLS (the table owner is fine: the policies are FORCEd).
- **Secrets at rest**: OTA tokens and API keys are sealed with AES-256-GCM (`src/server/secrets.ts`, key `CREDENTIALS_KEY`). `db:migrate` seals any older plain rows.
- **Deployment** (`Dockerfile`, `deploy/`): two images from one Dockerfile. `app` is the Next.js standalone server (only the files it uses, runs as `node`, health check on `/api/health`); `tools` runs migrations, the seed, `create-hotel` and the worker, and carries `pg_dump` from the same Postgres image as the database for the nightly backup (status, Back up now and downloads in the platform console; restore steps in `deploy/README.md`). `deploy/compose.yaml` adds Postgres with a non-superuser app role, so row-level security always applies. Links the app sends out use `APP_URL`, read at run time, so one image serves any domain. CI (`.github/workflows/ci.yml`) runs lint, types, unit and database tests, the build and both images on every push.
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
| `npm run typecheck` · `npm run lint` · `npm test` | TypeScript, ESLint, Vitest unit tests |
| `npm run test:integration` | Resets and seeds `hotel_os_test` (or `TEST_DATABASE_URL`, must end in `_test`), then runs the DB-backed tests: concurrent last-room sales, change booking, cancel, sold-out change refused, custom roles, row-level security, creating a hotel, backups |
| `npm run db:generate` | New migration from schema changes |
| `npm run db:migrate` · `db:seed` · `db:reset` | Database |
| `npm run worker` | Background jobs (OTA push queue, holds, alerts, hourly removal of unused uploads, nightly backup when `BACKUP_DIR` is set) |
| `npm run backup` | Back up now: database dump (every hotel) plus local uploads into `BACKUP_DIR` (default `.data/backups`), optional off-site copy; needs `pg_dump` 16+ |
| `npm run create-hotel -- --hotel … --owner … --email …` | A new hotel with its owner login on a fresh install (`--help` for options); the owner then finishes the setup wizard |
