'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { visibleNavigation, type NavSection } from '@/lib/navigation';
import { hasPermission } from '@/server/auth/permissions';
import { useT } from '@/i18n/client';
import { formatDayShort } from '@/lib/format';
import { Logo, LogoMark } from './logo';
import type { ShellData } from './types';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionActive(pathname: string, section: NavSection) {
  if (section.items) return section.items.some((item) => isActive(pathname, item.href)) || isActive(pathname, `/${section.key}`);
  return isActive(pathname, section.href);
}

function RailNav({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const { t } = useT();
  const sections = useMemo(() => visibleNavigation((p) => hasPermission(data.permissions, p)), [data.permissions]);
  return (
    <nav className="flex flex-col items-center gap-1" aria-label="Main">
      {sections.map((section) => {
        const active = sectionActive(pathname, section);
        const badge = section.items?.reduce((total, item) => total + (data.badges[item.href] ?? 0), 0) ?? 0;
        return (
          <Link
            key={section.key}
            href={section.href}
            title={t(section.labelKey)}
            aria-label={t(section.labelKey)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative grid h-11 w-11 place-items-center rounded-xl transition-all duration-200 ease-smooth',
              active ? 'bg-brand-600 text-white shadow-lg shadow-brand-950/50' : 'text-ink-400 hover:bg-white/[0.07] hover:text-white',
            )}
          >
            <section.icon className="h-5 w-5" />
            {badge > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-ink-950" />}
            <span className="pointer-events-none absolute left-full z-50 ml-3 rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lift ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
              {t(section.labelKey)}
              {badge > 0 && <span className="num ml-1.5 text-brand-300">{badge}</span>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarNav({ data, onNavigate }: { data: ShellData; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useT();
  const sections = useMemo(() => visibleNavigation((p) => hasPermission(data.permissions, p)), [data.permissions]);
  // Explicit open/close choices; a section without one is open when it holds the current page.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav className="space-y-0.5" aria-label="Main">
      {sections.map((section) => {
        const active = sectionActive(pathname, section);
        const Icon = section.icon;
        const sectionBadge = section.items?.reduce((total, item) => total + (data.badges[item.href] ?? 0), 0) ?? data.badges[section.href] ?? 0;

        if (!section.items) {
          return (
            <Link
              key={section.key}
              href={section.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                active ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-950/40' : 'text-ink-300 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{t(section.labelKey)}</span>
            </Link>
          );
        }

        const expanded = open[section.key] ?? active;
        return (
          <div key={section.key}>
            <button
              type="button"
              onClick={() => setOpen((state) => ({ ...state, [section.key]: !expanded }))}
              aria-expanded={expanded}
              className={cn(
                'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                active ? 'text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-brand-400')} />
              <span className="flex-1 truncate text-left">{t(section.labelKey)}</span>
              {!expanded && sectionBadge > 0 && (
                <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                  {sectionBadge > 99 ? '99+' : sectionBadge}
                </span>
              )}
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 ease-smooth',
                expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div className="relative mt-0.5 mb-1 ml-[22px] space-y-0.5 border-l border-white/10 pl-3">
                  {section.items.map((item) => {
                    const itemActive = isActive(pathname, item.href) && !section.items!.some((other) => other.href !== item.href && other.href.startsWith(item.href) && isActive(pathname, other.href));
                    const badge = data.badges[item.href] ?? 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        title={item.legacy ? `AsiaTech: ${item.legacy}` : undefined}
                        aria-current={itemActive ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-all duration-150',
                          itemActive ? 'bg-brand-600 font-semibold text-white shadow-md shadow-brand-950/40' : 'text-ink-400 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <span className="flex-1 truncate">{t(item.labelKey)}</span>
                        {badge > 0 && (
                          <span
                            className={cn(
                              'num grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold',
                              itemActive ? 'bg-white/25 text-white' : 'bg-white/10 text-ink-200',
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBody({ data, onNavigate, onClose, onCollapse }: { data: ShellData; onNavigate?: () => void; onClose?: () => void; onCollapse?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="Home">
          <Logo />
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:text-white" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
        {onCollapse && (
          <button onClick={onCollapse} className="rounded-lg p-1.5 text-ink-500 transition hover:bg-white/[0.07] hover:text-white" aria-label="Collapse sidebar" title="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
        <SidebarNav data={data} onNavigate={onNavigate} />
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <p className="truncate text-[13px] font-semibold text-white">{data.property.name}</p>
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            {t('top.businessDate')}: <span className="font-semibold text-ink-200">{formatDayShort(data.property.businessDate)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ data, collapsed, onToggle }: { data: ShellData; collapsed: boolean; onToggle: (value: boolean) => void }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden overflow-hidden border-r border-white/[0.06] bg-ink-950 transition-[width] duration-300 ease-smooth lg:block',
        'bg-[radial-gradient(120%_60%_at_0%_0%,rgba(225,29,72,0.16),transparent_60%)]',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center py-3">
          <Link href="/dashboard" aria-label="Home" className="mb-4 grid h-12 place-items-center">
            <LogoMark />
          </Link>
          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
            <RailNav data={data} />
          </div>
          <button onClick={() => onToggle(false)} className="mt-3 grid h-10 w-10 place-items-center rounded-xl text-ink-500 transition hover:bg-white/[0.07] hover:text-white" aria-label="Expand sidebar" title="Expand sidebar">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <SidebarBody data={data} onCollapse={() => onToggle(true)} />
      )}
    </aside>
  );
}

export function MobileSidebar({ data, open, onClose }: { data: ShellData; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onClose();
    // Close the drawer whenever the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 w-72 animate-enter bg-ink-950 shadow-2xl">
        <SidebarBody data={data} onClose={onClose} />
      </aside>
    </div>
  );
}
