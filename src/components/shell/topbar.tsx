'use client';

import { useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  Check,
  ChevronsUpDown,
  Globe,
  Headset,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Tag,
  TriangleAlert,
  XCircle,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { visibleNavigation } from '@/lib/navigation';
import { hasPermission } from '@/server/auth/permissions';
import { useT } from '@/i18n/client';
import { markNotificationsReadAction, setLanguageAction, signOutAction, switchPropertyAction } from '@/server/actions/shell';
import { Popover, MenuItem } from '@/components/ui/popover';
import { useToast } from '@/components/ui/toast';
import type { ShellData } from './types';
import { tx } from '@/i18n/tx';

function IconLink({ href, label, children, external, badge }: { href: string; label: string; children: React.ReactNode; external?: boolean; badge?: React.ReactNode }) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      title={label}
      aria-label={label}
      className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
    >
      {children}
      {badge}
    </Link>
  );
}

const NOTIFICATION_ICON: Record<string, React.ReactNode> = {
  booking_new: <CalendarCheck className="h-4 w-4 text-sky-600" />,
  booking_cancelled: <XCircle className="h-4 w-4 text-rose-600" />,
  sync_error: <TriangleAlert className="h-4 w-4 text-amber-600" />,
  payment: <span className="text-sm font-bold text-emerald-600">₹</span>,
  housekeeping: <BellRing className="h-4 w-4 text-violet-600" />,
  system: <Bell className="h-4 w-4 text-ink-500" />,
};

function Notifications({ data }: { data: ShellData }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Popover
      width="w-[22rem]"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          aria-label={t('top.notifications')}
        >
          <Bell className="h-[18px] w-[18px]" />
          {data.unreadCount > 0 && (
            <span className="num absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {data.unreadCount > 99 ? '99+' : data.unreadCount}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-bold text-ink-900">{t('top.notifications')}</p>
            {data.unreadCount > 0 && (
              <button
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                disabled={pending}
                onClick={() => startTransition(async () => void (await markNotificationsReadAction()))}
              >
                {tx('Mark all read')}
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto p-1.5">
            {data.notifications.length === 0 && <p className="px-3 py-8 text-center text-sm text-ink-500">{tx('You’re all caught up.')}</p>}
            {data.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  close();
                  if (n.href) router.push(n.href);
                }}
                className={cn('flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition hover:bg-ink-50', !n.read && 'bg-brand-50/40')}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-100">{NOTIFICATION_ICON[n.type] ?? NOTIFICATION_ICON.system}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-900">{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-xs text-ink-500">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-ink-400">{tx(timeAgo(n.createdAt))}</span>
                </span>
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function AppsGrid({ data }: { data: ShellData }) {
  const { t } = useT();
  const sections = useMemo(() => visibleNavigation((p) => hasPermission(data.permissions, p)), [data.permissions]);
  return (
    <Popover
      width="w-80"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900" aria-label={t('top.apps')}>
          <LayoutGrid className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      {(close) => (
        <div className="grid grid-cols-3 gap-1 p-2">
          {sections.map((section) => (
            <Link
              key={section.key}
              href={section.href}
              onClick={close}
              className="group flex flex-col items-center gap-2 rounded-xl p-3 text-center transition hover:bg-ink-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-100 text-ink-600 transition group-hover:bg-brand-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-brand-600/30">
                <section.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] leading-tight font-medium text-ink-700">{t(section.labelKey)}</span>
            </Link>
          ))}
        </div>
      )}
    </Popover>
  );
}

function LanguageToggle() {
  const { locale } = useT();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn('inline-flex rounded-lg bg-ink-100 p-0.5', pending && 'opacity-60')} role="radiogroup" aria-label="Language">
      {(['en', 'hi'] as const).map((value) => (
        <button
          key={value}
          role="radio"
          aria-checked={locale === value}
          onClick={() => startTransition(() => setLanguageAction(value))}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-semibold transition-all',
            locale === value ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {value === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  );
}

function AccountMenu({ data }: { data: ShellData }) {
  const router = useRouter();
  const { t, tr } = useT();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Popover
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={cn(
            'flex items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition hover:bg-ink-100',
            open && 'bg-ink-100',
            pending && 'opacity-60',
          )}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-ink-700 to-ink-900 text-xs font-bold text-white">{initials(data.user.name)}</span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block max-w-36 truncate text-[13px] font-semibold text-ink-900">{data.property.name}</span>
            <span className="block max-w-36 truncate text-[11px] text-ink-500">
              {data.user.name} · {tr(data.user.roleName)}
            </span>
          </span>
          <ChevronsUpDown className="hidden h-4 w-4 text-ink-400 md:block" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{t('top.switchProperty')}</p>
          {data.memberships.map((m) => (
            <MenuItem
              key={m.id}
              icon={<Building2 className="h-4 w-4" />}
              onClick={() => {
                close();
                if (m.id === data.property.id) return;
                startTransition(async () => {
                  const result = await switchPropertyAction(m.id);
                  if (result.ok) toast.success(`Switched to ${m.name}`);
                  else toast.error(result.error);
                });
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.name}</span>
                <span className="block text-[11px] text-ink-400">
                  {m.city ?? '—'} · {tr(m.roleName)}
                </span>
              </span>
              {m.id === data.property.id && <Check className="h-4 w-4 text-brand-600" />}
            </MenuItem>
          ))}
          <div className="my-1.5 border-t border-ink-100" />
          <div className="px-2.5 py-1.5">
            <p className="text-[13px] font-semibold text-ink-900">{data.user.name}</p>
            {data.user.email && <p className="truncate text-xs text-ink-500">{data.user.email}</p>}
          </div>
          <MenuItem icon={<UserRound className="h-4 w-4" />} onClick={() => (close(), router.push('/account'))}>
            My account
          </MenuItem>
          {data.permissions.some((p) => p === '*' || p === 'money.view') && (
            <MenuItem icon={<Smartphone className="h-4 w-4" />} onClick={() => (close(), router.push('/owner'))}>
              Owner view (phone)
            </MenuItem>
          )}
          {data.user.isSuperAdmin && (
            <MenuItem icon={<ShieldCheck className="h-4 w-4" />} onClick={() => (close(), router.push('/admin'))}>
              Platform admin
            </MenuItem>
          )}
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50">
              <LogOut className="h-4 w-4" />
              {t('top.signOut')}
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}

export function Topbar({ data, onOpenMenu, onOpenSearch }: { data: ShellData; onOpenMenu: () => void; onOpenSearch: () => void }) {
  const { t } = useT();
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(data.permissions, p);
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/75 shadow-[0_1px_0_0_rgb(255_255_255/0.6)_inset] backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <button onClick={onOpenMenu} className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>

        <button
          onClick={onOpenSearch}
          className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-ink-200 bg-ink-50/70 px-3 text-left text-sm text-ink-400 transition hover:border-ink-300 hover:bg-white md:max-w-md"
        >
          <Search className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-ink-600" />
          <span className="truncate">
            <span className="hidden sm:inline">{t('top.search')}</span>
            <span className="sm:hidden">{t('top.searchShort')}</span>
          </span>
          <span className="ml-auto hidden items-center gap-0.5 sm:flex">
            <kbd className="kbd">Ctrl</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <div className="mr-0.5 sm:mr-1">
            <LanguageToggle />
          </div>
          <div className="hidden items-center gap-0.5 xl:flex">
            {can('channels.manage') && (
              <IconLink href="/channels/promotions" label={t('top.promotions')}>
                <Tag className="h-[18px] w-[18px]" />
              </IconLink>
            )}
            <IconLink href={`/book/${data.property.slug}`} label={t('top.bookingEngine')} external>
              <Globe className="h-[18px] w-[18px]" />
            </IconLink>
            <IconLink href="/support" label={t('top.support')}>
              <Headset className="h-[18px] w-[18px]" />
            </IconLink>
          </div>
          <span className="hidden sm:contents">
          <IconLink
            href="/messages"
            label={t('top.whatsapp')}
            badge={<span className="absolute -top-1 -right-1.5 rounded-full bg-brand-600 px-1 py-px text-[8px] font-bold tracking-wide text-white uppercase ring-2 ring-white">{tx('New')}</span>}
          >
            <MessageCircle className="h-[18px] w-[18px] text-emerald-600" />
          </IconLink>
          <AppsGrid data={data} />
          </span>
          <Notifications data={data} />
          <div className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
          <AccountMenu data={data} />
        </div>
      </div>
    </header>
  );
}

export { LanguageToggle };
