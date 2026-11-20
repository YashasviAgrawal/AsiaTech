import { redirect } from 'next/navigation';
import { getContext } from '@/server/context';

export default async function Root() {
  const ctx = await getContext();
  if (!ctx) redirect('/login');
  if (ctx.can('dashboard.view')) redirect('/dashboard');
  if (ctx.can('housekeeping.use')) redirect('/housekeeping/my');
  if (ctx.can('pos.use')) redirect('/restaurant');
  redirect('/dashboard');
}
