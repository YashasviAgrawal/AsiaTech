'use client';

import { usePathname } from 'next/navigation';
import { Tabs } from '@/components/ui/tabs';

export function SettingsTabs({ canUsers }: { canUsers: boolean }) {
  const pathname = usePathname();
  const items = [
    { value: '/settings/hotel', label: 'Hotel Details', href: '/settings/hotel' },
    ...(canUsers ? [{ value: '/settings/users', label: 'User Management', href: '/settings/users' }] : []),
    { value: '/settings/branding', label: 'Branding', href: '/settings/branding' },
    { value: '/settings/notifications', label: 'Notifications', href: '/settings/notifications' },
  ];
  return <Tabs items={items} value={items.find((i) => pathname.startsWith(i.value))?.value ?? '/settings/hotel'} />;
}
