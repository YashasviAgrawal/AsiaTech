import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/server/context';
import { listAllSystemUpdates, listOrganizations } from '@/server/services/admin';
import { backupOverview } from '@/server/services/backup';
import { PageHeader } from '@/components/ui/card';
import { AdminConsole } from './admin-console';

export const metadata: Metadata = { title: 'Platform admin' };

/** Platform console for the AsiaTech team: organisations and their hotels, and the System Update feed. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSuperAdmin();
  const { tab } = await searchParams;
  const [orgs, updates, backups] = await Promise.all([listOrganizations(), listAllSystemUpdates(), backupOverview()]);
  return (
    <div>
      <PageHeader eyebrow="AsiaTech team" title="Platform admin" description="Every organisation and hotel on AsiaTech, the System Update cards hotels see on their dashboard, and the server's backups." />
      <AdminConsole orgs={JSON.parse(JSON.stringify(orgs))} updates={JSON.parse(JSON.stringify(updates))} backups={JSON.parse(JSON.stringify(backups))} initialTab={tab === 'backups' || tab === 'updates' ? tab : 'orgs'} />
    </div>
  );
}
