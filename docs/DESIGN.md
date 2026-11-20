# Design system: Tixit theme for AsiaTech Hotel OS

The panel uses the same visual language as **Tixit** (`YashasviAgrawal/Evento`): a crimson-rose brand on cool slate
"ink" neutrals, white cards on an `ink-50` canvas, a near-black sidebar, and calm motion. The AsiaTech logo is also
crimson, so the two fit together.

## Tokens (copied from Tixit's `tailwind.config.ts`)

| Token | Value | Use |
|-------|-------|-----|
| `brand-600` | `#e11d48` | Primary buttons, active nav item, focus ring, key numbers |
| `brand-50 … 950` | Tailwind *rose* scale | Tints, badges, selection |
| `ink-50` | `#f8fafc` | App canvas |
| `ink-200` | `#e2e8f0` | Borders, dividers |
| `ink-500` | `#64748b` | Secondary text |
| `ink-900` | `#0f172a` | Headings, body text |
| `ink-950` | `#020617` | Sidebar background |
| `shadow-card` | `0 1px 3px rgb(15 23 42/.06), 0 1px 2px -1px rgb(15 23 42/.04)` | Resting cards |
| `shadow-lift` | `0 12px 32px -8px rgb(15 23 42/.16), 0 4px 12px -4px rgb(15 23 42/.08)` | Hovered tiles, popovers, dialogs |
| Radius | `rounded-lg` (controls), `rounded-xl` (cards), `rounded-2xl` (dialogs) | |
| Motion | `ease-smooth = cubic-bezier(.16,1,.3,1)`; `enter` 0.3 s; buttons scale to `0.97` on press | All motion respects `prefers-reduced-motion` |
| Font | System UI stack, plus *Nirmala UI* / *Noto Sans Devanagari* for Hindi | Fast, crisp on Windows front-desk PCs |
| Numbers | `tabular-nums` everywhere money or counts appear | Columns line up |

## Status colours (simplicity rule 6)

| Meaning | Tone | Example |
|---------|------|---------|
| Sold out / problem / overdue | **rose/red** (`danger`) | Calendar cell with 0 left, failed sync |
| Partly used / needs attention | **amber** (`warning`) | Calendar cell with some rooms booked, hold expiring |
| All good / free / paid | **emerald** (`success`) | All rooms free, invoice paid |
| Informational | **sky** (`info`) | New booking notification |
| Neutral | **ink** | Draft, cancelled |

A colour **never** appears alone. There is always a number or a word next to it.

## Layout

- **Sidebar** (`ink-950`, 256 px): logo, 9 sections with lucide icons. Sections expand to show the old AsiaTech screen
  names. The active item is a solid `brand-600` pill. The current property and the user sit at the bottom. On a phone it
  becomes a slide-over drawer.
- **Top bar** (white/90 with backdrop blur, 64 px, sticky): global search (`⌘K`), EN/हिं toggle, promotions, booking
  engine, support, WhatsApp ("New"), apps grid, notifications (badge), property switcher.
- **Page header:** title, one-line description and primary actions on the right.
- **Content:** `p-4 sm:p-6 lg:p-8` on `ink-50`. Cards use `rounded-xl border-ink-200 bg-white shadow-card`.

## Components

`Button` (primary · secondary · outline · ghost · danger · success; sm/md/lg/icon) · `Card` · `StatTile` (always
clickable) · `Badge`/`StatusBadge` · `Pill` (calendar cells) · `Input`/`Select`/`Textarea`/`Field` · `Dialog` ·
`ConfirmDialog` (preview + typed reason) · `Drawer` · `Tabs` · `DataTable` · `EmptyState` · `Skeleton` ·
`Toast` (with an **Undo** action) · `Kbd`.

## UX principles

1. **One primary action per screen**, in brand rose. Everything else is outline or ghost.
2. **Smart defaults:** today → tomorrow, 1 room, 2 adults, the default rate plan, the cheapest clean room.
3. **Inline editing** over modal forms where the context matters (calendar cells, rates).
4. **Progressive disclosure:** advanced fields (foreign guest, company GSTIN) appear only when relevant.
5. **Feedback within 100 ms:** optimistic UI, a skeleton on load, a toast on save.
6. **Phone-first** for housekeeping and owner views: 44 px tap targets, bottom actions.
