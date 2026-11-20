# Progress tracker

This is the single place to see **what is done, what changed, and what is still pending**.
Update it in the same commit as the code it describes.

- The plan and full module checklists are in [`PLAN.md`](./PLAN.md).
- Legend: ✅ done · 🟡 done with follow-ups · ⬜ pending

## Module status

| Module | Status | Notes |
|--------|--------|-------|
| M0 · Foundation | ✅ | Next.js 16, Tailwind v4 Tixit tokens, Drizzle schema (41 tables, `property_id` everywhere), auth, tenancy, shell, `Ctrl+K` search, EN/हिं, seed |
| M1 · Property Setup & Settings | ✅ | Hotel Details (GST slabs, invoice, UPI), User Management (roles matrix, login history, sign out everywhere), Branding (live preview), Notifications, Setup wizard, property switcher |
| M2 · Rooms, Rates & Inventory | ✅ | Availability Calendar, cell edit, Bulk Update (preview + Undo), Download Inventory, Rate Management (+ bulk), Room and Rate Plan |
| M3 · Reservations & Guests | 🟡 | All screens done. Follow-up: full "modify booking" dialog (Room Chart drag already moves/extends single-room stays) |
| M4 · Front Office Operations | 🟡 | Today board, check-in (ID, Form-III, 24 h banner), folio, check-out, GST invoice + UPI QR, registration card, Room Chart. Follow-up: ID photo upload |
| M5 · Home Dashboard & Command Centre | 🟡 | Tiles, Today's Task (incl. Form-C, listing, sync, holds), Tonight, System Update, bookings table, notifications. Follow-ups: super-admin System Update editor, owner summary screen |
| M6 · Housekeeping | ✅ | Status board, out-of-order blocks inventory, checklist master + legacy clean-up, inspections → repair tickets, Hindi phone screen |
| M7 · Restaurant POS | ✅ | Terminal, KOT, GST bill series, cash/card/UPI/room transfer/complimentary, discount, voids, day close, menu & tables |
| M8 · Money & Night Audit | ✅ | Payments, Request Money (link + webhook, auto-posted), Petty Cash (approval, bill photo), Credit Report (ageing), Night Audit wizard |
| M9 · Channels & Booking Engine | ✅ | Connect + mapping, listing health + Fix listing, ARI outbox with coalescing and retries, inbound OTA webhook with overbooking guard, promotions, reviews, public booking engine |
| M10 · Reports, Communication & Audit | ✅ | 9 reports with charts + Excel, Activity Log, WhatsApp centre, zero-bookings and Night Audit emails, Support |

## Feature checklist (34 features from the screenshots)

| # | Feature | Status | Where |
|---|---------|--------|-------|
| 1–2 | Today's / month booking tiles | ✅ | Home |
| 3 | 6 POS tiles | ✅ | Home |
| 4 | System Update panel | ✅ | Home |
| 5 | Today's Task with action buttons | ✅ | Home |
| 6 | Today's Bookings table + Assign | ✅ | Home |
| 7 | Property switcher | ✅ | Top bar |
| 8 | Notifications | ✅ | Top bar |
| 9 | WhatsApp | ✅ | Top bar → `/messages` |
| 10 | Apps grid | ✅ | Top bar |
| 11 | Promotions | ✅ | Channels → Promotions |
| 12 | Booking engine | ✅ | `/book/[slug]` |
| 13 | Support | ✅ | `/support` |
| 14 | Make A Reservation | ✅ | Front Desk |
| 15 | Hold Booking | ✅ | Front Desk |
| 16 | Today Check (In-Out) | ✅ | Front Desk |
| 17 | Booking Report | ✅ | Front Desk |
| 18 | Credit Report | ✅ | Money |
| 19–21 | Availability Calendar, Download Inventory, Bulk Update | ✅ | Rooms & Rates |
| 22 | Room Chart | ✅ | Rooms & Rates |
| 23 | Room and Rate Plan | ✅ | Rooms & Rates |
| 24 | Rate Management | ✅ | Rooms & Rates |
| 25 | Channel manager | ✅ | Channels |
| 26 | OTA Reviews | ✅ | Channels |
| 27 | Point Of Sale | ✅ | Restaurant |
| 28 | House Keeping + checklist | ✅ | Housekeeping |
| 29 | Night Audit | ✅ | Money |
| 30 | Petty Cash | ✅ | Money |
| 31 | Request Money | ✅ | Money |
| 32 | Reports | ✅ | Reports |
| 33 | Hotel Details, User Management, Branding | ✅ | Settings |
| 34 | Zero-bookings email alert | ✅ | Settings → Notifications + worker |

**The 10 small additions:** global search ✅ · action buttons on tasks ✅ · drag-and-drop Room Chart ✅ · duplicate guest
warning and merge ✅ · overbooking guard ✅ · auto GST slabs ✅ · Form-III helper ✅ · UPI QR on invoices ✅ · Hindi
housekeeping phone screen ✅ · activity log ✅

## Verified

| Check | Result |
|-------|--------|
| `npm run typecheck` | clean |
| `npm run lint` | clean (React Compiler rules on) |
| `npm test` | 12 unit tests pass (GST slabs, tax split, amount in words, financial year, duplicates, formatting) |
| `npm run build` | production build passes, all routes compile |
| End to end in a browser | reservation → returning-guest autofill → check-in → charge → check-out → invoice `SRP/26-27/0001`; POS table → KOT → settle; payment link → webhook → booking paid; Night Audit 6 steps → business date moved, report emailed |
| Overbooking guard | sold-out OTA booking refused (409); **6 simultaneous OTA requests for the last room → exactly 1 booking** |
| Inventory integrity | seeded `booked` counts match booking rooms on every date; availability never negative |

## Pending (next up)

Production readiness:
- [ ] Real providers: WhatsApp Business API (the console provider is in place), Razorpay live keys and webhook secret (adapter written, sandbox test pending), Channex certification (adapter written)
- [ ] Encrypt OTA credentials at rest. Move uploads (`public/uploads`) to object storage (S3 / R2)
- [ ] Rate limiting / bot protection on `/book/*`, `/pay/*` and webhooks
- [ ] Postgres Row-Level Security on `property_id`; super-admin console (organisations, System Update editor)
- [ ] Server-side PDF for invoices (email attachment); thermal print agent for KOT (58/80 mm)

Product follow-ups:
- [ ] "Modify booking" dialog (change dates, rooms, room type / upgrade) for multi-room bookings
- [ ] Guest ID photo upload at check-in (masked number only today)
- [ ] Hindi for every screen: the shell, Home tiles and the housekeeping phone screen are translated; other screens fall back to English
- [ ] Owner summary screen for phones; logo / hero image upload in Branding
- [ ] Integration tests for server actions (unit tests cover the money maths today)

Questions for the client (from PLAN.md): "Today's POS In House" meaning, rates incl./excl. GST at the desk, live OTA codes, printer models.

## Change log

### 2026-11-21
- **Verification and polish:** React Compiler lint rules fixed (no setState-in-effect, no ref or variable mutation
  during render), unit tests (Vitest), README, OTA push coalescing, seed mappings and counters.
- **M10:** reports hub with 9 reports (occupancy/ADR/RevPAR, revenue by source, collections, GST summary, room revenue,
  restaurant by item and by day, housekeeping, Night Audit history), bar charts, Excel export, Activity Log, WhatsApp
  centre with phone-style preview, Support page, Form-C task on the dashboard.
- **M9:** channel manager (connect with hotel code + token, automatic mapping, mapping editor, listing health,
  Fix listing re-sends paused updates), sync log with retry and back-off, inbound OTA webhook (new + cancel) through
  the locked reservation path, promotions (early bird, last minute, long stay, coupon) pushed to OTAs, OTA reviews with
  replies, public booking engine (`WEB…` bookings, coupons, pay now via link or at hotel), background worker.
- **M1:** Hotel Details (GSTIN validation with state auto-fill, GST slabs, invoice prefix, UPI, bank details),
  User Management (roles, permission matrix, language, password reset signs out everywhere, login history), Branding
  with live booking-page preview, Notifications, Setup wizard with progress and Go live.
- **M8:** payments ledger, Request Money (mock and Razorpay adapters, idempotent webhook, money auto-added to the bill),
  Petty Cash (running balance, approval above ₹2,000, bill photo), Credit Report (guest / company / agent / OTA, aged
  0–30 / 31–60 / 61–90 / 90+), Night Audit wizard (no-shows → room charges → POS closed → cash match → lock day → email).
- **M7:** POS terminal (tables, take-away, room and in-house orders, menu search and categories, "86" items), KOT print
  (80 mm), GST bill series per financial year, settle by cash/card/UPI/room transfer/complimentary, discounts, voids,
  orders list with totals by mode, day close, menu and tables editor.
- **M6:** housekeeping board, out-of-order with inventory blocking, checklist master with duplicate block, drag sort and
  legacy clean-up, inspections (OK / Problem / Missing) creating repair tickets, Hindi phone screen. Login now sets the
  user's language.
- **M4 Room Chart:** rooms × 14 days, drag to move/extend, drop unassigned bookings, click an empty cell to book.
- **M3 + M4 front desk:** one-page reservation, holds, Booking Report + Excel, guests and merge, check-in/out, folio,
  GST invoice with UPI QR, registration card, Today board.
- **M2:** Availability Calendar, Bulk Update with preview and Undo, Download Inventory, Rate Management, Room and
  Rate Plan.
- **M5:** dashboard with 12 clickable tiles, Today's Task, Tonight, System Update, Today's Bookings.
- Schema: `bookings.form_c_submitted_at/form_c_ref` (`0001_form_c`), `rooms.ooo_until` (`0002_room_ooo`).

### 2026-11-20
- Added `docs/PLAN.md`, `docs/DESIGN.md` and this tracker.
- **M0 Foundation:** Next.js 16 + Tailwind v4 with Tixit tokens, PostgreSQL + Drizzle schema for every module, session
  auth with per-property roles, `requireContext()` tenancy guard, 9-section sidebar, top bar, `Ctrl+K` search,
  row-locked inventory engine, pricing with GST slabs, booking service, demo seed for Shri Ram Portico.
