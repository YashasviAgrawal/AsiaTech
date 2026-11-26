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
| `npm test` | 48 unit tests pass (money maths, Hindi phrases and patterns, incl. dates and times inside sentences and activity log lines, secrets sealing, rate limiter, S3 signing, signed guest links, SMTP email with attachment, invoice PDF content incl. IGST / UPI QR / cancelled, ESC/POS text and KOT / bill / test tickets) |
| `npm run test:integration` | 16 DB-backed tests pass (inventory: 3; shared rate limits: 4, including 20 simultaneous requests at a limit of 5 → exactly 5; row-level security: 3, including 24 interleaved requests for two hotels each seeing only its own rows; custom roles: 6, including no escalation, system roles locked, no removal while in use) on a freshly seeded `hotel_os_test` |
| `npm run build` | production build passes, all routes compile |
| End to end in a browser | reservation → returning-guest autofill → check-in → charge → check-out → invoice `SRP/26-27/0001`; POS table → KOT → settle; payment link → webhook → booking paid; Night Audit 6 steps → business date moved, report emailed |
| Overbooking guard | sold-out OTA booking refused (409); **6 simultaneous OTA requests for the last room → exactly 1 booking** |
| Inventory integrity | seeded `booked` counts match booking rooms on every date; availability never negative |
| Unused uploads | registry row written on upload; sweep removed 2 old unattached files, kept the old file still on a guest and a fresh unattached one; removing an ID photo in the app leaves it for the next sweep |
| S3 storage | SigV4 signature equals the AWS documentation example; put / get / delete against a local S3 stand-in; app `saveImage` → bucket → `readStoredFile` round trip with `STORAGE_DRIVER=s3` |
| Hardening | OTA tokens sealed (seed + migrate re-seal, pushes still succeed; wrong key fails one channel with "reconnect", no crash); OTA webhook 120/min then 429, other IP unaffected; 8 failed sign-ins lock that account for 15 min (right password waits too) |
| Platform admin | `/admin` is a 404 for hotel staff; super admin publishes a System Update → it appears on the front desk dashboard; suspending the organisation signs its staff out (super admin still in); re-activating lets them back in |
| Multi-outlet POS | duplicate bill prefix refused; café added; switcher on terminal / menu / orders ("All outlets" hides day close); bills RST/26-27/00142 and CAFE/26-27/00001 in separate consecutive series; old counter carried over by migration; fresh reset + seed OK |
| Owner phone view | `/owner` on iPhone 13: earnings today (rooms + restaurant, WoW, sparkline), occupancy with per-type bars, desk counts, collected today by mode, money owed, month so far, needs-attention list; no horizontal scroll; Hindi checked |
| Hindi | All 40 staff screens crawled in Hindi with untranslated text marked: only hotel data (names, room types, menu, reviews, OTA replies) is left in English; 9 main dialogs (cell / rate editor, housekeeping room, petty cash, promotion, check-out, room type, OTA mapping) checked the same way. Both languages: no leaked code or "[object Object]" on any screen, no page errors; English mode shows no Hindi apart from data. Sentences with dates and times ("Synced 5 d ago", "Sat, 21 Nov → Sun, 22 Nov · 1 night") translate inside the sentence |
| Exports and undo | Payments, Credit, Petty Cash, Activity Log export with the screen's filters (valid .xlsx, 403 without permission); Booking Report prints / saves as A4 landscape PDF; folio line void → Undo → void → Restore keeps the linked restaurant bill in step; POS order void → restore puts the room-bill line back; restore refused on another business day |
| Uploads | fake image refused; ID uploaded + webcam scan (fake camera) saved on the guest at check-in; private file 200 for staff, login redirect for anonymous; room photos + cover order on the booking page; logo/cover on the booking page for anonymous visitors; CSS-injection link refused |
| Invoice PDF and sending | checked out a guest in the browser → "Send invoice" opened by itself with the guest's mobile and email filled in → sent on WhatsApp (signed link) and email (PDF attached, 47 KB) → logged on the booking's history; PDF text checked (GSTIN, CGST/SGST split, amount in words, "Fully paid"); balance-due bill shows the UPI QR for the right amount; guest link opens the PDF signed out, tampered or swapped tokens → 404, 30 requests/min then 429; staff route 401 signed out; Hindi dialog checked |
| Row-level security | in psql, a connection stamped as the Residency sees none of Portico's bookings, updates 0 Portico rows and is refused when inserting a Portico guest. In the app: all 37 staff screens load with their data and no errors; Postgres log shows each request stamped with its hotel; reservation → cancel works (bookings, rooms, inventory, counters, OTA queue); platform console still counts the Residency's 6 rooms while the owner works in Portico; switched to the Residency, a Portico booking link shows "not found". Test booking removed, inventory consistent over 400 days |
| Shared rate limits | two production servers (ports 3001 and 3002) with `RATE_LIMIT_STORE=postgres`, one client alternating between them: 15 + 15 answered, then 429 with Retry-After from both; another client unaffected |
| Thermal printing | Restaurant → Printers: bad address refused; kitchen (80 mm) and counter (58 mm) printers added; agent key created and the real agent script run against two stand-in network printers. Test page, then POS table T2 → Send KOT → printed in the kitchen with **no browser print window**; Print bill → printed at the counter with GST split and UPI QR (bytes decoded and checked). Kitchen printer switched off → 3 tries, then "Failed: 127.0.0.1:9100 refused the connection"; switched on → Print again → printed. A 20-minute-old queued KOT was failed, not printed. Revoking the key stopped the agent. Test printers, order and bill number removed afterwards |
| Custom roles | Settings → User Management as the owner: "Night auditor" made from Accountant minus "Record payments…" (6 of 23 permissions); "manager" as a name refused; given to a new staff member; removing it while in use refused ("1 staff member still has this role"). Signed in as that person: Night Audit, Payments, Reports and Activity Log open, Rate Management, User Management and Request Money send them to Home. Owner untick "See and export reports" → their next visit to Reports goes to Home. Editor checked in Hindi. Test staff and role removed afterwards |
| Change booking | +1 night, upgrade Standard → Deluxe Family and add a room: blocked while a type is sold out, then saved; `booked` still matches booking rooms on every date (SQL check), OTAs pushed, activity log written. In-house guest extended: room kept, agreed nights kept at ₹2,300 |

## Pending (next up)

Production readiness:
- [ ] Real providers: WhatsApp Business API (the console provider is in place), Razorpay live keys and webhook secret (adapter written, sandbox test pending), Channex certification (adapter written)
- [x] Encrypt OTA credentials at rest (AES-256-GCM, `CREDENTIALS_KEY`)
- [x] S3 / R2 / MinIO storage driver (`STORAGE_DRIVER=s3`, SigV4 without an SDK)
- [x] Hourly worker job removes uploads no record uses (abandoned uploads, removed ID copies) after 24 h, on any storage driver
- [x] Rate limiting on sign-in (failed attempts per network and per account), booking engine, payment and OTA webhooks, invoice links, print agent; shared between app servers with `RATE_LIMIT_STORE=postgres`
- [x] Postgres Row-Level Security on `property_id` (38 business tables, FORCEd for the table owner; staff requests stamped per connection)
- [x] Super-admin console `/admin`: organisations and hotels (plan, suspend / re-activate), System Update editor
- [x] Server-side PDF for invoices: download, email attachment over SMTP, signed WhatsApp link for the guest; "Send invoice" opens right after check-out
- [x] Thermal printing: KOTs and bills straight to the kitchen and counter printers (ESC/POS, 58/80 mm) through a one-file print agent on a hotel PC

Product follow-ups:
- [x] "Change booking" dialog (dates, add/remove rooms, room type upgrade, plan, occupancy) with a live availability re-check
- [x] Guest ID scan at check-in (webcam or phone camera, private storage), room type photos, logo and cover photo upload
- [x] Hindi on every screen: shared components translate their text (headers, labels, buttons, tables, tabs, dialogs, badges, filters, dropdown options, toasts), plus ~1,190 phrases and sentence patterns; the long sentences inside individual screens and dialogs are translated too
- [x] Owner summary screen for phones (`/owner`)
- [x] Custom roles per organisation: pick permissions (grouped), start from any role, edit, remove when nobody has it; you can only give permissions you hold
- [x] DB-backed integration tests (`npm run test:integration`): concurrent last-room sales, change booking, cancel, sold-out change refused

Questions for the client (from PLAN.md): "Today's POS In House" meaning, rates incl./excl. GST at the desk, live OTA codes, printer models.

## Change log

### 2026-11-26
- **Custom roles:** Settings → User Management has a Roles card. Owners (anyone with "Add staff and change their
  roles") make roles for their organisation, e.g. a night auditor: name, description, permissions in 7 groups,
  optionally starting from an existing role. Custom roles show up in the staff role picker and in the "What each role
  can do" matrix; changes apply on the member's next page. Nobody can create, edit, remove or assign a role with
  permissions they do not hold, "everything" is reserved for owners, system roles cannot be changed, and a role
  cannot be removed while staff have it. Every change is in the activity log.
- **Hindi, second sweep:** every staff screen and the main dialogs checked in Hindi with a crawler that marks any text
  the dictionary does not know. Fixed: the Booking Report, new reservation form, night audit, rooms and rates, channel
  manager, reports, support and settings screens had sentences written straight into the page; dropdown options and
  switch / stepper labels now follow the language; the trend chip on stat tiles; "out_of_order" shown as
  "out of_order". 390 phrases and 94 sentence patterns added (activity log lines, sync log lines, night audit
  steps, dates and "5 d ago" inside sentences). Hotel data (guest names, room types, menu, reviews) stays as entered.
- **Row-level security (`0007_row_level_security`):** Postgres policies on `property_id` for 38 business tables,
  FORCEd so they apply to the app's own role. Staff requests stamp their hotel on each pooled connection, so a query
  that forgets its property filter still cannot read or write another hotel's rows. Background work, webhooks, the
  public booking engine and the platform console run unstamped, as before.
- **Shared rate limits:** `RATE_LIMIT_STORE=postgres` keeps the counts in an unlogged table (`0006_rate_limit_store`)
  so several app servers enforce one limit; a per-key advisory lock makes simultaneous requests count exactly.
  Memory stays the default for a single server.
- **Thermal printing (Restaurant → Printers):** add kitchen and counter printers (network IP or USB / shared on the
  agent PC, 58 or 80 mm, copies, per outlet). "Send KOT" prints in the kitchen and "Print bill" at the counter with no
  browser print window; without a printer the browser window opens as before. A one-file print agent on a hotel PC
  (key shown once, revocable) collects tickets and reports back; failures retry 3 times and show why, with Print
  again. Tickets are never printed more than 15 minutes late. Reprints are marked on the KOT.

### 2026-11-25
- **Invoice PDF and sending:** the GST invoice is rendered as a real PDF on the server (same content as the print page:
  GSTIN, CGST/SGST or IGST, amount in words, UPI QR while money is owed, bank details). "Send invoice" on the booking
  page, and on its own right after check-out: WhatsApp gets a short message with a signed link the guest opens without
  signing in, email gets the PDF attached (SMTP, any mail service). Download PDF on the booking menu and the print page.
  A mobile or email typed while sending is saved on the guest when they had none.

### 2026-11-21
- **Unused uploads:** `uploads` registry (`0004_uploads_registry`) and an hourly worker sweep that deletes files nobody
  references after 24 hours, so removed guest ID copies really go away.
- **Cloud storage:** S3-compatible driver (AWS S3, Cloudflare R2, MinIO) selected with `STORAGE_DRIVER=s3`; files are
  still served through `/files`, so private IDs and bills keep their permission check. Hindi finished on the restaurant
  terminal and orders screens. Unit tests can no longer reach the integration suite or the dev database.
- **Hardening:** OTA credentials encrypted at rest (AES-256-GCM, legacy rows sealed by `db:migrate`), rate limits on
  sign-in / booking engine / webhooks, DB-backed integration tests against a separate `_test` database.
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
