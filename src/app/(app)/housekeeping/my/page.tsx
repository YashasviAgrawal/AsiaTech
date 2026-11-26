import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getMyTasks } from '@/server/services/housekeeping';
import { getT } from '@/i18n/server';
import { MyTasks } from './my-tasks';

export const metadata: Metadata = { title: 'My rooms' };

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const ctx = await requireContext('housekeeping.use');
  const { all } = await searchParams;
  const supervisor = ctx.can('housekeeping.manage');
  const showAll = supervisor && all !== '0';
  const tasks = await getMyTasks(ctx.propertyId, ctx.userId, showAll, ctx.property.businessDate);
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-ink-900">{showAll ? 'All rooms to clean' : t('hk.myTasks')}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {ctx.user.name} · {tasks.length} {t('hk.rooms')}
      </p>
      <MyTasks tasks={tasks.map((task) => ({ ...task, items: task.items.map((i) => ({ id: i.id, name: i.name, nameHi: i.nameHi, category: i.category })) }))} supervisor={supervisor} />
    </div>
  );
}
