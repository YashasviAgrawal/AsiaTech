# Progress tracker

This is the single place to see **what is done, what changed, and what is still pending**.
Update it in the same commit as the code it describes.

- The plan and full module checklists are in [`PLAN.md`](./PLAN.md).
- Legend: ✅ done · 🟡 in progress / partial · ⬜ pending

## Module status

| Module | Status | Notes |
|--------|--------|-------|
| M0 · Foundation | ✅ | Next.js 16, Tailwind v4 Tixit tokens, Drizzle schema (41 tables), auth, tenancy, shell, search, i18n, seed |
| M1 · Property Setup & Settings | ⬜ | Property switcher works (M0). Settings screens are next. |
| M2 · Rooms, Rates & Inventory | ✅ | Calendar, cell edit, Bulk Update (preview + undo), Excel, Rate Management, Room and Rate Plan |
| M3 · Reservations & Guests | ✅ | One-page reservation, holds, Booking Report + Excel, guests, duplicate merge |
| M4 · Front Office Operations | ✅ | Today board, check-in (ID, Form-III), folio, check-out, GST invoice + UPI QR, registration card, Room Chart (drag & drop) |
| M5 · Home Dashboard & Command Centre | 🟡 | Tiles, Today's Task, Tonight, System Update, bookings table and notifications done. Owner phone view pending. |
| M6 · Housekeeping | ⬜ | |
| M7 · Restaurant POS | ⬜ | |
| M8 · Money & Night Audit | ⬜ | |
| M9 · Channels & Booking Engine | ⬜ | ARI outbox (`sync_logs`) is already filled by every inventory/rate change |
| M10 · Reports, Communication & Audit | 🟡 | WhatsApp message log (console provider) and activity log are written; screens pending |

## Feature checklist (34 features from the screenshots)

| # | Feature | Status |
|---|---------|--------|
| 1–2 | Today's / month booking tiles | ✅ |
| 3 | 6 POS tiles | ✅ (data from POS tables; POS screens in M7) |
| 4 | System Update panel | ✅ |
| 5 | Today's Task with action buttons | ✅ |
| 6 | Today's Bookings table + Assign | ✅ |
| 7 | Property switcher | ✅ |
| 8 | Notifications | ✅ |
| 9 | WhatsApp | 🟡 sending + log done, screen pending |
| 10 | Apps grid | ✅ |
| 11 | Promotions | ⬜ |
| 12 | Booking engine | ⬜ |
| 13 | Support | ⬜ |
| 14 | Make A Reservation | ✅ |
| 15 | Hold Booking | ✅ |
| 16 | Today Check (In-Out) | ✅ |
| 17 | Booking Report | ✅ |
| 18 | Credit Report | ⬜ |
| 19–21 | Availability Calendar, Download Inventory, Bulk Update | ✅ |
| 22 | Room Chart | ✅ |
| 23 | Room and Rate Plan | ✅ |
| 24 | Rate Management | ✅ |
| 25 | Channel manager | ⬜ |
| 26 | OTA Reviews | ⬜ |
| 27 | Point Of Sale | ⬜ |
| 28 | House Keeping + checklist | ⬜ |
| 29 | Night Audit | ⬜ |
| 30 | Petty Cash | ⬜ |
| 31 | Request Money | ⬜ |
| 32 | Reports | ⬜ |
| 33 | Hotel Details, User Management, Branding | ⬜ |
| 34 | Zero-bookings email alert | ⬜ |

## Pending (next up)

- [ ] M6 Housekeeping: status board, checklist master, inspections, repair tickets, Hindi phone screen
- [ ] M7 Restaurant POS
- [ ] M8 Money & Night Audit
- [ ] M1 Settings + setup wizard
- [ ] M9 Channels & Booking Engine
- [ ] M10 Reports hub, WhatsApp centre, activity log viewer, support page

## Change log

### 2026-11-21
- **M4 Room Chart:** rooms × 14 days with stay bars (reserved / in house / hold / departed), hover card with balance,
  drag to move (room or dates), drag the right edge to extend, drop unassigned bookings onto a room, click an empty
  cell to start a booking for that room and date.
- **M3 + M4 front desk:** one-page reservation (live price and GST slab per night, returning-guest autofill by
  mobile, near-duplicate warning, discount, advance, hold, WhatsApp confirmation); Hold Booking with countdown;
  Booking Report with filters, totals and Excel export; Guests list, profile and duplicate merge; booking page with
  assign room, check-in (ID masking, Form-III for foreign guests and a 24 h Form-C banner), folio charges and voids,
  payments and refunds, cancel / no-show with Undo, check-out (early departure re-prices and releases nights),
  GST invoice `SRP/26-27/0001` with UPI QR and amount in words, printable registration card. Check-out marks the
  room dirty and creates a housekeeping task.
- **M2:** Availability Calendar (15 days, colour rule, stop-sell), cell editor, Bulk Update with preview and Undo,
  Download Inventory (Excel), Rate Management grid and bulk rate update with preview and Undo, Room and Rate Plan
  (room types, room numbers with ranges, EP/CP/MAP/AP plans).
- **M5:** dashboard with 12 clickable tiles, Today's Task (pending check-ins/outs, unassigned rooms, Booking.com
  "Parked business", failed syncs, expiring holds) each with an action button, Tonight occupancy/ADR/RevPAR, System
  Update, Today's Bookings table with Assign.
- Schema: added `bookings.form_c_submitted_at` and `form_c_ref` (migration `0001_form_c`).

### 2026-11-20
- Added `docs/PLAN.md` (10-module build plan with checklists and feature traceability), `docs/DESIGN.md` (Tixit design
  system) and this tracker.
- **M0 Foundation:** Next.js 16 + Tailwind v4 with Tixit tokens, PostgreSQL + Drizzle schema for every module,
  session auth with per-property roles, `requireContext()` tenancy guard, 9-section sidebar, top bar (search,
  EN/हिं, promotions, booking engine, support, WhatsApp, apps grid, notifications, property switcher), `Ctrl+K`
  global search, row-locked inventory engine, pricing with GST slabs, booking service, demo seed for Shri Ram Portico.
