'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MobileSidebar, Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { GlobalSearch } from './global-search';
import type { ShellData } from './types';

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Ctrl/⌘ + K or "/" opens search from anywhere (rule 3: one search box finds anything).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar data={data} />
      <MobileSidebar data={data} open={menuOpen} onClose={closeMenu} />
      <div className="lg:pl-64">
        <Topbar data={data} onOpenMenu={() => setMenuOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main key={pathname} className="mx-auto w-full max-w-[1600px] animate-enter p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
