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
| M3 · Reservations & Guests | ✅ | All screens done, including the "Change booking" dialog (dates, add/remove rooms, upgrade, plan, occupancy) |
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
| `npm test` | 16 unit tests pass (incl. Hindi phrase + pattern translation) (GST slabs, tax split, amount in words, financial year, duplicates, formatting) |
| `npm run build` | production build passes, all routes compile |
| End to end in a browser | reservation → returning-guest autofill → check-in → charge → check-out → invoice `SRP/26-27/0001`; POS table → KOT → settle; payment link → webhook → booking paid; Night Audit 6 steps → business date moved, report emailed |
| Overbooking guard | sold-out OTA booking refused (409); **6 simultaneous OTA requests for the last room → exactly 1 booking** |
| Inventory integrity | seeded `booked` counts match booking rooms on every date; availability never negative |
| Platform admin | `/admin` is a 404 for hotel staff; super admin publishes a System Update → it appears on the front desk dashboard; suspending the organisation signs its staff out (super admin still in); re-activating lets them back in |
| Multi-outlet POS | duplicate bill prefix refused; café added; switcher on terminal / menu / orders ("All outlets" hides day close); bills RST/26-27/00142 and CAFE/26-27/00001 in separate consecutive series; old counter carried over by migration; fresh reset + seed OK |
| Owner phone view | `/owner` on iPhone 13: earnings today (rooms + restaurant, WoW, sparkline), occupancy with per-type bars, desk counts, collected today by mode, money owed, month so far, needs-attention list; no horizontal scroll; Hindi checked |
| Hindi | Dashboard, Today board, booking page, POS, money and settings checked in Hindi: page chrome, task sentences ("… का चेक-आउट करें"), dates and months translated; data (names, room types, menu) stays as entered; English mode unchanged |
| Exports and undo | Payments, Credit, Petty Cash, Activity Log export with the screen's filters (valid .xlsx, 403 without permission); Booking Report prints / saves as A4 landscape PDF; folio line void → Undo → void → Restore keeps the linked restaurant bill in step; POS order void → restore puts the room-bill line back; restore refused on another business day |
| Uploads | fake image refused; ID uploaded + webcam scan (fake camera) saved on the guest at check-in; private file 200 for staff, login redirect for anonymous; room photos + cover order on the booking page; logo/cover on the booking page for anonymous visitors; CSS-injection link refused |
| Change booking | +1 night, upgrade Standard → Deluxe Family and add a room: blocked while a type is sold out, then saved; `booked` still matches booking rooms on every date (SQL check), OTAs pushed, activity log written. In-house guest extended: room kept, agreed nights kept at ₹2,300 |

## Pending (next up)

Production readiness:
- [ ] Real providers: WhatsApp Business API (the console provider is in place), Razorpay live keys and webhook secret (adapter written, sandbox test pending), Channex certification (adapter written)
- [ ] Encrypt OTA credentials at rest. Add an S3 / R2 driver to `src/server/storage.ts` (local disk driver in place); clean up uploads that were never attached to a record
- [ ] Rate limiting / bot protection on `/book/*`, `/pay/*` and webhooks
- [ ] Postgres Row-Level Security on `property_id`
- [x] Super-admin console `/admin`: organisations and hotels (plan, suspend / re-activate), System Update editor
- [ ] Server-side PDF for invoices (email attachment); thermal print agent for KOT (58/80 mm)

Product follow-ups:
- [x] "Change booking" dialog (dates, add/remove rooms, room type upgrade, plan, occupancy) with a live availability re-check
- [x] Guest ID scan at check-in (webcam or phone camera, private storage), room type photos, logo and cover photo upload
- [x] Hindi on every screen: shared components translate their text (headers, labels, buttons, tables, tabs, dialogs, badges, filters, toasts), plus ~640 phrases and sentence patterns. Follow-up: a few long sentences inside individual screens are still English
- [x] Owner summary screen for phones (`/owner`)
- [ ] Integration tests for server actions (unit tests cover the money maths today)

Questions for the client (from PLAN.md): "Today's POS In House" meaning, rates incl./excl. GST at the desk, live OTA codes, printer models.

## Change log

### 2026-11-21
- **Platform admin (`/admin`):** organisations with their hotels (rooms, staff, 30-day bookings, last sign-in), plan
  and suspend / re-activate (suspended organisations lock their staff out), System Update editor with drafts.
- **Multi-outlet POS:** add/rename outlets (restaurant, café, bar, room service), outlet switcher on the terminal, menu
  and orders screens, one GST bill series per outlet (`0003_outlet_bill_series` carries the old counter over), day close
  per outlet.
- **Owner phone view (`/owner`):** one-scroll summary for the owner on a phone, linked from the account menu.
- **Hindi everywhere (rule 7):** phrase dictionary (English text is the key) and anchored sentence patterns for names,
  numbers and dates. Shared components translate their plain-string text automatically, on the server and in the
  browser, so every screen switches to Hindi; dashboard tasks, Today board and booking page translated in detail.
- **Exports and undo:** Excel for Payments (with totals by mode), Credit Report (with ageing sheet), Petty Cash (running
  balance) and Activity Log, all using the same filters as the screen. Booking Report "Print / PDF" (A4 landscape with
  totals). Voids can be undone: bill lines (Undo in the toast or Restore on the row), restaurant orders (Undo, or Restore
  on the orders list the same day before day close) and order items; room-transfer bills stay in step with the folio.
- **Uploads:** storage layer with private (guest IDs, bills) and public (room photos, branding) files, byte-level
  image check, browser-side downscaling. ID scan at check-in with a webcam scanner (card guide, retake) or the phone
  camera; ID photos on the guest card and the printed registration card. Room type photos with a cover photo and a
  carousel on the booking page. Logo and cover photo upload in Branding (links still accepted, checked). Petty cash
  bills moved to private storage. Fixed a hydration mismatch in dialogs opened from a link; Escape closes only the top
  dialog.
- **Change booking (M3):** one dialog for dates, rooms (add / remove), room type upgrade, rate plan, occupancy and
  discount. A live preview shows the new price, the difference, the balance and any sold-out night; saving releases
  and re-reserves inventory under row locks in one transaction. Agreed nightly prices are kept by default
  ("Today's rates" re-prices everything). In-house guests can extend or shorten the stay and change plan/occupancy.
- **Premium UI:** Geist + Noto Devanagari fonts, sparkline tiles with week/month trends, count-up numbers, collapsible
  sidebar rail, skeleton loading, undo countdown, glass top bar.
- **Rates and channels:** min stay / stop-sell / closed-to-arrival enforced on the booking engine and shown as warnings
  at the desk; automatic promotions (early bird, last minute, long stay) on the booking engine; OTA updates are pushed
  within seconds of a change (after-response sync) instead of waiting for the worker.
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
