import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Headset, Keyboard, Mail, MessageCircle, Phone } from 'lucide-react';
import { requireContext } from '@/server/context';
import { Card, CardHeader, PageHeader } from '@/components/ui/card';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'Help & support' };

const GUIDES = [
  { q: 'How do I take a booking?', a: 'Front Desk → Make A Reservation. Type the mobile number first; returning guests fill in by themselves. The price and GST update as you go.', href: '/front-desk/reservations/new' },
  { q: 'How do I block a room for repairs?', a: 'Housekeeping → tap the room → Put out of order. Pick the date it comes back; every OTA stops selling it.', href: '/housekeeping' },
  { q: 'How do I change prices for a weekend?', a: 'Rooms & Rates → Rate Management → Bulk rate update. Pick Fri–Sat, preview, apply. You can undo it.', href: '/rooms/rates' },
  { q: 'Booking.com says “Parked business”', a: 'Finish the contract or bank details in the Booking.com extranet, then press Fix listing under Channels.', href: '/channels' },
  { q: 'How do I close the day?', a: 'Money → Night Audit. Six guided steps: no-shows, room charges, restaurant, cash, lock, report.', href: '/money/night-audit' },
  { q: 'A guest wants to pay by UPI from home', a: 'Money → Request Money. The link goes on WhatsApp and the payment is added to their bill automatically.', href: '/money/request' },
];

const SHORTCUTS = [
  ['Ctrl + K', 'Search anything (booking, guest, mobile, room)'],
  ['/', 'Search (when not typing)'],
  ['Esc', 'Close a window'],
  ['↑ ↓ ↵', 'Move and open in search'],
];

export default async function SupportPage() {
  await requireContext();
  return (
    <div>
      <PageHeader eyebrow="Help" title="Help & support" description="Quick answers, keyboard shortcuts and how to reach us." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader icon={<BookOpen className="h-4 w-4" />} title="Quick answers" />
          <ul className="divide-y divide-ink-100">
            {GUIDES.map((g) => (
              <li key={g.q} className="px-5 py-4">
                <p className="font-semibold text-ink-900">{tx(g.q)}</p>
                <p className="mt-1 text-sm text-ink-600">{tx(g.a)}</p>
                <Link href={g.href} className="mt-1.5 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
                  {tx('Take me there →')}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Headset className="h-4 w-4" />} title="Talk to us" description="9 AM – 9 PM, every day" />
            <ul className="space-y-3 p-5 text-sm">
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-ink-400" /> <span className="num font-medium">+91 141 400 0000</span>
              </li>
              <li className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-emerald-600" /> <span className="font-medium">{tx('WhatsApp support')}</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-ink-400" /> <span className="font-medium">support@asiatech.in</span>
              </li>
            </ul>
          </Card>
          <Card>
            <CardHeader icon={<Keyboard className="h-4 w-4" />} title="Keyboard shortcuts" />
            <ul className="space-y-2 p-5 text-sm">
              {SHORTCUTS.map(([k, label]) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span className="text-ink-600">{tx(label)}</span>
                  <kbd className="kbd px-1.5">{k}</kbd>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
