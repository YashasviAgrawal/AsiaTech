import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { NotificationsForm } from './notifications-form';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const ctx = await requireContext('settings.manage');
  return <NotificationsForm initial={ctx.property.settings.notifications} />;
}
