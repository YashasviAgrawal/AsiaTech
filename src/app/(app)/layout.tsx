import { requireContext } from '@/server/context';
import { getShellData } from '@/server/services/shell';
import { AppShell } from '@/components/shell/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const data = await getShellData(ctx);
  return <AppShell data={data}>{children}</AppShell>;
}
