import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, BedDouble, ClipboardList, IndianRupee, Sparkles, UtensilsCrossed, Wallet } from 'lucide-react';
import { requireContext } from '@/server/context';
import { REPORTS } from '@/server/services/reports';
import { PageHeader } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Reports' };

const GROUP_ICON = { Rooms: BedDouble, Money: IndianRupee, Restaurant: UtensilsCrossed, Operations: Sparkles } as const;

const SHORTCUTS = [
  { href: '/front-desk/bookings', title: 'Booking Report', description: 'Search and export all bookings', icon: ClipboardList },
  { href: '/money/credit', title: 'Credit Report', description: 'Who owes money, by age', icon: Wallet },
  { href: '/money/payments', title: 'Payments', description: 'Every payment received', icon: IndianRupee },
];

export default async function ReportsPage() {
  await requireContext('reports.view');
  const groups = ['Rooms', 'Money', 'Restaurant', 'Operations'] as const;
  return (
    <div>
      <PageHeader eyebrow="Reports" title="All reports" description="Pick a report, choose dates, export to Excel. Every number on screen can be downloaded." />
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="card group flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-white">
              <s.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink-900">{s.title}</span>
              <span className="block text-xs text-ink-500">{s.description}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 text-ink-300 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>
      <div className="space-y-8">
        {groups.map((group) => {
          const Icon = GROUP_ICON[group];
          return (
            <section key={group}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-ink-500 uppercase">
                <Icon className="h-4 w-4" /> {group}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {REPORTS.filter((r) => r.group === group).map((r) => (
                  <Link key={r.key} href={`/reports/${r.key}`} className="card group flex items-start gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                      <BarChart3 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">{r.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-500">{r.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
