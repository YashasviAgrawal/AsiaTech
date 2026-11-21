# AsiaTech Hotel OS: Build Plan

> We are rebuilding the hotel's AsiaTech panel: front desk (PMS), channel manager, booking engine, restaurant POS,
> housekeeping and back office.
> **Every feature in the old screenshots stays.** The app gets simpler through fewer menus, smart defaults and
> one-click actions, not by cutting features.

- **First client:** Shri Ram Portico. It has 4 room types and about 20 rooms, bills in ₹, gets bookings from MakeMyTrip, Goibibo and Booking.com, and its staff work in Hindi and English.
- **Scope today:** one hotel.
- **Scope tomorrow:** multi-tenant SaaS (many organisations, many properties each). The data model and code are built for that from day one. See [Multi-tenancy](#3-multi-tenancy-built-in-from-day-one).

Progress is tracked in [`PROGRESS.md`](./PROGRESS.md). The UI rules are in [`DESIGN.md`](./DESIGN.md).

---

## 1. Simplicity rules (check every screen against these)

| # | Rule | How we enforce it in code |
|---|------|---------------------------|
| 1 | **Fewer menus.** The 14 sidebar items become 9 sections, and every old screen keeps its name inside its section. | `src/lib/navigation.ts` is the single source of the menu. |
| 2 | **Every alert has a button.** | A `Task` always carries an `action` (`label` and `href` or server action). |
| 3 | **One search box finds anything** (booking ID, guest, mobile, room). | `⌘K` / `/` global search calls `/api/search`. |
| 4 | **Every number is clickable.** | `StatTile` requires an `href`. |
| 5 | **One-page forms with smart defaults** (today → tomorrow, mobile autofills a returning guest, live price). | Reservation form and `useLivePrice`. |
| 6 | **Colours always mean the same thing.** Red = sold out or problem, amber = partly used or attention, green = all good. A number or word always sits next to the colour. | `toneFor()` helpers and the `Pill` component. |
| 7 | **Two languages.** Hindi/English toggle on every screen. Housekeeping and owner screens work on a phone. | Cookie-based `t()` dictionary; responsive shell. |
| 8 | **Safe actions.** Cancel, void and bulk update ask for confirmation, show a preview and can be undone. | `ConfirmDialog` plus activity-log snapshots for undo. |
| 9 | **Guided setup.** Hotel → rooms → rates → OTA → go live. | `/setup` wizard driven by `properties.onboarding_step`. |

---

## 2. Tech stack

| Part | Pick | Why |
|------|------|-----|
| App | **Next.js 16** (App Router, React 19, Server Components and Server Actions), TypeScript strict | One codebase for UI and API. Server Actions remove most hand-written REST plumbing. |
| Styling | **Tailwind CSS v4** with the **Tixit design tokens** (brand rose, ink slate) and `lucide-react` icons | Same look and feel as Tixit. |
| Database | **PostgreSQL 16** | Row locks (`SELECT … FOR UPDATE`) keep inventory correct. |
| ORM | **Drizzle ORM** + drizzle-kit migrations, `pg` driver | TypeScript-first schema, no code generation, native `.for('update')`. |
| Validation | **zod** | One schema validates server actions and API input. |
| Auth | Own session: `bcryptjs` hashes plus a signed `jose` JWT in an httpOnly cookie | Simple and portable. Per-property roles and permissions. |
| Exports | `exceljs` (Excel) and print-optimised pages (PDF through the browser) | Download Inventory, Booking Report and every report. |
| Background jobs | **Phase 1:** a DB outbox (`sync_logs`, `jobs`) drained by `npm run worker`. **Later:** Redis + BullMQ. | OTA sync, hold expiry, Today's Tasks and Night Audit email work without Redis on day one. |
| Payments | Razorpay Payment Links and UPI QR (adapter, sandbox first) | Request Money, and a QR on every invoice. |
| WhatsApp | WhatsApp Business API through a provider (adapter; console provider in dev) | Confirmations, payment links, invoices. |
| OTA connectivity | **Channex** channel API (Booking.com, Expedia, Airbnb and 78+ more). For MakeMyTrip/Goibibo, the hotel selects us in the InGo-MMT extranet. | Behind a `ChannelProvider` interface. |
| Hosting | Docker, Mumbai/Bangalore region, daily DB backups | Low latency for Indian hotels. |

### Folder layout

```
docs/                     PLAN.md · PROGRESS.md · DESIGN.md
drizzle/                  SQL migrations (generated)
src/
  app/
    (auth)/login          Sign-in
    (app)/…               Signed-in panel (sidebar + top bar)
      dashboard           Home
      front-desk/…        Make A Reservation, Hold Booking, Today Check (In-Out), Booking Report, Guests
      rooms/…             Availability Calendar, Room Chart, Room and Rate Plan, Rate Management
      channels/…          Channel manager, Promotions, OTA Reviews, Sync log
      restaurant/…        Point Of Sale, Menu, Tables, Day close
      housekeeping/…      Room status board, Checklist, Repair tickets
      money/…             Credit Report, Night Audit, Petty Cash, Request Money, Payments
      reports/…           All reports with export
      settings/…          Hotel Details, User Management, Branding, Notifications
      setup               First-time wizard
    book/[slug]           Public booking engine (WEB bookings)
    print/…               Registration card, GST invoice, KOT (print → PDF)
    api/…                 Search, exports, OTA webhooks, payment webhooks
  components/
    ui/                   Tixit-style primitives (Button, Card, Badge, Dialog, Table…)
    shell/                Sidebar, Topbar, GlobalSearch, PropertySwitcher, LanguageToggle
    <module>/             Feature components
  db/
    schema/               Drizzle tables, one file per domain
    index.ts              Pool and db client
    seed.ts               Shri Ram Portico demo data
  server/
    auth/                 Session, password, permissions
    context.ts            requireContext() → { user, property, role, permissions }
    services/<module>/    Domain logic, always scoped by propertyId
    adapters/             channel / payments / whatsapp providers
  lib/                    Formatting (₹ Indian format, IST dates), GST, navigation, i18n
  i18n/                   en.ts · hi.ts dictionaries
```

---

## 3. Multi-tenancy (built in from day one)

```
organizations ──< properties ──< (every business table has property_id)
users ──< property_members >── properties     (role per property)
```

- **Every** business table carries `property_id`, as the guide's database rule says. `users`, `organizations` and `system_updates` are global.
- **One login, many hotels:** `property_members` links a user to several properties, each with its own role. The **property switcher** in the top bar changes the active property, which is stored in the session.
- **No query trusts the browser:** every service function takes a `ctx` built on the server by `requireContext()`, and filters by `ctx.propertyId`.
- **Later hardening:** Postgres Row-Level Security policies on `property_id`, per-organisation billing, a super-admin console, and custom roles per organisation (the `roles.organization_id` column already exists).

---

## 4. Rules that matter most

1. **No double-selling.** When a booking comes in, the code locks that room type's `inventory` rows (`SELECT … FOR UPDATE`), checks availability, updates `booked` and saves the booking in **one transaction**. It then queues an availability push to every OTA.
   `available = total − booked − blocked`.
2. **Money** is `numeric(12,2)` in ₹. Totals are computed on the server only.
3. **GST on room bills** (rule since 22 Sep 2025): **5% up to ₹7,500** per room per night, **18% above**. The slabs live in `properties.settings.tax`, not in code. Place of supply for accommodation is the hotel's location, so the tax is split as CGST + SGST.
4. **IDs:** bookings `FDR…` (front desk), `OTA…`, `WEB…` (booking engine). Invoices are numbered per financial year (`SRP/26-27/0001`, 16 characters or fewer as GST requires). Per-property counters are locked.
5. **Business date:** each property has a `business_date`. Night Audit moves it forward and locks the closed day.
6. **Audit trail:** every change to a rate, discount, booking or inventory writes `activity_log` with before/after snapshots. Undo uses these snapshots.

---

## 5. New simple menu (14 old items → 9 sections)

| New section | Old AsiaTech screens inside it |
|-------------|--------------------------------|
| 🏠 **Home** | Dashboard (tiles, Today's Task, System Update, Today's Bookings) |
| 🛎️ **Front Desk** | Bookings › Make A Reservation · Hold Booking · Today Check (In-Out) · Booking Report · (Guests) |
| 🛏️ **Rooms & Rates** | Room Management › Availability Calendar · Room Chart · Room and Rate Plan · **Rate Management** |
| 🌐 **Channels** | Channel manager (OTA sync) · Promotions · **OTA Reviews** · Booking engine |
| 🍽️ **Restaurant** | **Point Of Sale** (orders, KOT, bills, room transfer, day close) |
| 🧹 **Housekeeping** | **House Keeping** (room status, checklist, repair tickets) |
| ₹ **Money** | Bookings › Credit Report · **Night Audit** · **Petty Cash** · **Request Money** · Payments |
| 📊 **Reports** | **Reports** (every report with export) |
| ⚙️ **Settings** | **Hotel Details** · **User Management** · **Branding** · Notifications |

The top bar keeps the old icons: property switcher, notifications (badge), WhatsApp ("New"), apps grid, promotions
(tag), booking engine (globe) and support (headset). It adds the **global search** and the **EN / हिं** toggle.

---

## 6. The 10 modules

Each module can be shipped on its own on top of the **Foundation (M0)**. A module owns its screens, server services
and tests. All database tables are created in M0, so modules never need disruptive migrations of each other's tables.

> Legend: `[ ]` pending · `[x]` done. The **same checklist** is mirrored with dates in `PROGRESS.md`.

### M0 · Foundation (project base)
**Goal:** a running, signed-in, multi-tenant shell with the Tixit design system. Every module plugs into it.

- [x] Next.js 16 + TypeScript + Tailwind v4 project, lint, strict TS
- [x] Tixit design tokens (brand rose / ink slate, radii, shadows, motion) and the UI kit (Button, Card, Badge, Pill, Input, Select, Dialog, ConfirmDialog, Drawer, Tabs, Table, EmptyState, Skeleton, Toast with Undo)
- [x] PostgreSQL + Drizzle: **full schema for all modules** (≈40 tables) and the first migration
- [x] Auth: login (email or mobile + password), httpOnly JWT session, logout, login history
- [x] Tenancy: organizations → properties → property_members (role per property) and `requireContext()`
- [x] Roles and permissions (owner, manager, front_desk, housekeeping, restaurant, accountant)
- [x] App shell: dark sidebar with the 9 sections, top bar (search, EN/हिं, promotions, booking engine, support, WhatsApp, apps grid, notifications, property switcher, user menu), mobile drawer
- [x] i18n: `t()` dictionary (English + Hindi), language cookie, per-user default
- [x] Global search (`⌘K`): bookings, guests, mobile, rooms
- [x] Activity log helper (`logActivity`) and counters (FDR/OTA/WEB, invoice numbers)
- [x] Formatting helpers: ₹ Indian format (₹3,97,474), IST dates, GST calculator
- [x] Seed: Shri Ram Portico, 4 room types (3 / 4 / 12 / 4 rooms), rate plans, staff users, sample bookings that match the screenshots

### M1 · Property Setup & Settings
**Goal:** the hotel can describe itself and its staff. Features **#7, #33, #34**, rule 9.

- [x] Hotel Details: name, legal name, GSTIN (validated), state code, address, phone/email, check-in/out time, invoice prefix and footer, tax slabs
- [x] User Management: invite or add staff, role per property, activate/deactivate, reset password, **login history**
- [x] Roles: permission matrix view (system roles; custom roles later)
- [x] Branding: logo, brand colour, booking-page hero, live preview · 🟡 image upload (URLs today)
- [x] Notifications settings: **zero-bookings monthly email** (no bookings for 3 months), daily summary toggle
- [x] Property switcher (one login, many hotels) in the top bar
- [x] **Guided setup wizard**: hotel details → rooms → rates → OTA connection → go live

### M2 · Rooms, Rates & Inventory
**Goal:** the hotel controls what it sells and at what price. Features **#19 – #24**.

- [x] Room and Rate Plan: room types (name, total rooms, max adults/children, extra beds, amenities, photos), room numbers (floor, status), rate plans with meal plans **EP / CP / MAP / AP**, cancellation policy
- [x] **Availability Calendar**: room types down the side, 15 dates across, rows Available / Booked / Blocked, colour rule (red 0 left · amber partly used · green all free), Pre/Next and date search, sticky header and first column
- [x] Click a cell to edit (set available or blocked, stop-sell) with an inline popover
- [x] **Bulk Update**: date range, weekdays, room types → **preview table → confirm → Undo**
- [x] **Download Inventory** to Excel
- [x] **Rate Management**: price per date for 1/2/3 adults and extra bed, min stay, stop-sell; bulk rate update with preview
- [x] Inventory engine: auto-create 365 days of rows, row-locked `reserve()` / `release()`, OOO rooms counted as blocked
- [x] Every change queues an ARI push (picked up by M9)

### M3 · Reservations & Guests
**Goal:** taking a booking takes seconds. Features **#14, #15, #17**, global search, duplicate-guest warning.

- [x] **Make A Reservation**, one page: dates (today → tomorrow) → room type and count (live availability) → meal plan → guest (search by mobile; returning guests autofill) → discount → advance payment → Save
- [x] Live price panel: nightly breakdown, extra beds, discount, **auto GST slab**, grand total
- [x] FDR booking number, WhatsApp confirmation in the same step
- [x] **Hold Booking**: same form with "hold until"; Confirm / Extend / Release; auto-release on expiry
- [x] Booking detail page: rooms, guest, folio, payments, timeline (activity log)
- [x] **Cancel** with confirm + reason + undo, No-show · change dates/rooms/room type/plan from the "Change booking" dialog (and Room Chart drag for single-room stays)
- [x] **Booking Report**: filters (dates, source, status, room type), search, totals, export Excel
- [x] Guest directory: profiles, stay history, **duplicate warning and merge** ("Vivek Agrawal" vs "Vivek Agewal")

### M4 · Front Office Operations
**Goal:** arrivals and departures are one click. Features **#16, #22**, check-in/out, Form-III, GST invoice.

- [x] **Today Check (In-Out)**: tabs Arrivals · In-House · Departures with one-click Check in / Check out
- [x] Check-in: assign room (clean rooms first), guest ID (masked number), advance payment, **print registration card** · 🟡 ID photo upload pending
- [x] **Form-III helper** for foreign guests: passport/visa fields and a 24-hour FRRO countdown
- [x] Check-out: full folio (room + restaurant + extras), settle payment, **GST invoice** (CGST/SGST, invoice no. per FY) with **UPI QR**; room → *dirty* and a cleaning task is created
- [x] Folio: post extras, discounts, payments; void with reason
- [x] **Room Chart**: rooms down the side, dates across, a coloured bar per stay, hover for guest and balance, **drag to move/extend**, click an empty cell to book
- [x] Assign / change room from anywhere (dashboard "Assign" button)

### M5 · Home Dashboard & Command Centre
**Goal:** one screen tells the front desk what to do next. Features **#1 – #6, #8**, rules 2 and 4.

- [x] 12 tiles in 2 rows of 6 (Today's Bookings / Earning / Check In / Check Out, Month Bookings / Earning, 6 POS tiles), **every tile clickable**, Indian ₹ format
- [x] **Today's Task**: auto-generated (pending check-ins and check-outs, rooms not assigned, OTA listing problems such as "Parked business", failed syncs, unpaid balances, holds expiring), each with its action button
- [x] **System Update** panel · 🟡 super-admin screen to post updates pending (seeded for now)
- [x] **Today's Bookings** table (Booking ID, Source, Name, Check In, Check Out, Room Name, Room Assigned, Status) with an **Assign** button
- [x] Notifications centre (badge): new bookings, cancellations, sync errors; mark read
- [x] Owner's phone view (responsive dashboard: tiles 2-up, occupancy card) · 🟡 dedicated owner summary screen pending

### M6 · Housekeeping
**Goal:** clean, inspected rooms with no paper. Feature **#28**, Hindi phone screen.

- [x] Room status board: **Clean / Dirty / Inspected / Out of Order**, filter by floor/type, one-tap status change
- [x] Checklist master: one item per thing, grouped **Cleaning / Amenities / Maintenance**, **duplicates blocked (case-insensitive)**, drag-to-sort, assign items to room types; a clean-up tool merges the legacy duplicates ("AC" ×2, "bath soap" ×3)
- [x] Tasks: auto-created at check-out; assign to staff; inspect with **OK / Problem / Missing** per item
- [x] **Problem → repair ticket** automatically; ticket list (open → resolved)
- [x] Phone-first `/housekeeping/my` screen in Hindi with big tap targets

### M7 · Restaurant POS
**Goal:** a fast restaurant till that talks to the room bill. Feature **#27** and POS tiles.

- [x] Outlets, menu categories and items (price, GST %, veg/non-veg, availability), tables
- [x] Order types: **dine-in, take-away, room order, in-house**
- [x] Order screen: tap to add, quantities, notes, **KOT print** (58/80 mm print page)
- [x] Bill with GST (CGST/SGST) and a separate GST bill number series
- [x] Settle: **cash / card / UPI / Room Transfer** (posts to the in-house guest's folio)
- [x] **Close the day** per outlet (totals by mode)

### M8 · Money & Night Audit
**Goal:** every rupee is accounted for and the day closes cleanly. Features **#18, #29, #30, #31**.

- [x] Payments ledger (all modes), receipts
- [x] **Request Money**: amount + purpose → Razorpay/UPI link → WhatsApp/SMS; when paid, the money is added to the bill automatically (webhook)
- [x] **Petty Cash**: opening balance, top-ups, expenses with a bill photo, approval, daily closing balance
- [x] **Credit Report**: amounts owed by guests, companies, agents and OTAs, aged 0–30 / 31–60 / 61–90 / 90+ days
- [x] **Night Audit** wizard: mark no-shows → post room charges → check POS days are closed → match cash → lock the day (advance the business date) → email the report

### M9 · Channels & Booking Engine
**Goal:** sell everywhere without double-selling. Features **#11, #12, #25, #26**, overbooking guard.

- [x] Channel connections: MakeMyTrip, Goibibo, Booking.com, Agoda, Expedia, Airbnb (status, hotel code, token)
- [x] Room/rate **mapping** per channel
- [x] ARI push queue: every inventory/rate change is pushed within seconds; **sync log with Retry**
- [x] Inbound OTA bookings (webhook) → `OTA…` bookings through the same locked `reserve()`
- [x] Listing health alerts (e.g. *Booking.com: Parked business*) with a **Fix listing** action
- [x] **Promotions**: early bird, last minute, long stay, coupon; push to OTAs in one click
- [x] **OTA Reviews**: all reviews in one list, rating summary, reply
- [x] **Public booking engine** `/book/[slug]`: dates → rooms → guest → pay → `WEB…` booking

### M10 · Reports, Communication & Audit
**Goal:** every number can be exported, and nothing happens silently. Features **#9, #10, #13, #32**, activity log.

- [x] Reports hub with export (Excel/PDF): bookings, occupancy, revenue by source, collections, **GST**, restaurant sales, credit, housekeeping, Night Audit
- [x] Charts: occupancy and ADR/RevPAR trend
- [x] WhatsApp centre: templates (confirmation, payment link, invoice), message log
- [x] **Zero-bookings monthly email** job and daily summary email
- [x] **Activity log** viewer (who changed which rate, discount or booking, and when)
- [x] Apps grid and Support (help articles, contact)

---

## 7. Feature traceability (all 34 features from the screenshots)

| # | Feature (AsiaTech name) | Module | New place |
|---|-------------------------|--------|-----------|
| 1 | Today's Bookings / Earning / Check In / Check Out tiles | M5 | Home |
| 2 | Month Bookings / Month Earning tiles | M5 | Home |
| 3 | 6 POS tiles | M5 + M7 | Home |
| 4 | System Update panel | M5 | Home |
| 5 | Today's Task panel | M5 | Home |
| 6 | Today's Bookings table | M5 | Home |
| 7 | Property switcher | M0 + M1 | Top bar |
| 8 | Notifications (badge) | M5 | Top bar |
| 9 | WhatsApp ("New") | M10 | Top bar |
| 10 | Apps grid | M0 + M10 | Top bar |
| 11 | Promotions (tag icon) | M9 | Top bar → Channels |
| 12 | Booking engine (globe icon) | M9 | Top bar |
| 13 | Support (headset icon) | M10 | Top bar |
| 14 | Make A Reservation | M3 | Front Desk |
| 15 | Hold Booking | M3 | Front Desk |
| 16 | Today Check (In-Out) | M4 | Front Desk |
| 17 | Booking Report | M3 | Front Desk |
| 18 | Credit Report | M8 | Money |
| 19 | Availability Calendar | M2 | Rooms & Rates |
| 20 | Download Inventory | M2 | Rooms & Rates |
| 21 | Bulk Update | M2 | Rooms & Rates |
| 22 | Room Chart | M4 | Rooms & Rates |
| 23 | Room and Rate Plan | M2 | Rooms & Rates |
| 24 | Rate Management | M2 | Rooms & Rates |
| 25 | Channel manager (OTA sync) | M9 | Channels |
| 26 | OTA Reviews | M9 | Channels |
| 27 | Point Of Sale | M7 | Restaurant |
| 28 | House Keeping + checklist | M6 | Housekeeping |
| 29 | Night Audit | M8 | Money |
| 30 | Petty Cash | M8 | Money |
| 31 | Request Money | M8 | Money |
| 32 | Reports | M10 | Reports |
| 33 | Hotel Details, User Management, Branding | M1 | Settings |
| 34 | Zero-bookings email alert | M1 + M10 | Settings → Notifications |

**The 10 "small additions":** global search (M0), action buttons on tasks (M5), drag-and-drop Room Chart (M4), duplicate guest warning (M3), overbooking guard (M2 + M9), auto GST (M3 + M4), Form-III helper (M4), UPI QR on invoices (M4), Hindi housekeeping phone screen (M6), activity log (M0 + M10).

---

## 8. Database (all tables are created in M0)

| Domain | Tables |
|--------|--------|
| Tenancy and auth | `organizations`, `properties`, `users`, `roles`, `property_members`, `login_history` |
| Rooms and rates | `room_types`, `rooms`, `rate_plans`, `rates`, `inventory` |
| Reservations | `guests`, `bookings`, `booking_rooms`, `folio_lines`, `invoices`, `payments` |
| Channels | `channels`, `channel_mappings`, `sync_logs`, `promotions`, `reviews` |
| Restaurant | `pos_outlets`, `pos_categories`, `pos_menu_items`, `pos_tables`, `pos_orders`, `pos_order_items`, `pos_day_closes` |
| Housekeeping | `hk_checklist_items`, `hk_tasks`, `maintenance_tickets` |
| Money | `petty_cash`, `night_audits` |
| Platform | `tasks`, `notifications`, `system_updates`, `activity_log`, `counters`, `message_log`, `jobs` |

---

## 9. Build order and phases

| Phase | Modules | Outcome |
|-------|---------|---------|
| **0 · Base** | M0 | Sign in, see the shell, switch language, search, seeded hotel |
| **1 · Run the front desk** | M1 → M2 → M3 → M4 → M5 | Replace AsiaTech for daily front-desk work |
| **2 · Run the whole hotel** | M6 → M7 → M8 | Housekeeping, restaurant and money on the same system |
| **3 · Sell everywhere and analyse** | M9 → M10 | Live OTA sync, booking engine, reports |

> Before going live, spend 1–2 weeks in the client's live AsiaTech panel to capture the sub-menus the screenshots
> don't show (Rate Management, Hotel Details, Reports, Night Audit, Petty Cash, Branding), then update this plan.

### Open questions for the client
1. "Today's POS In House". We currently count POS orders of type *in-house* (staff or complimentary). Please confirm.
2. Do room rates on the front desk include GST or exclude it? We default to **exclusive**, and this is a setting.
3. Which OTA hotel codes and tokens are live today, and should promotions be pushed to all channels or chosen ones?
4. Printers: model and width (58 or 80 mm) for KOT and bills.
