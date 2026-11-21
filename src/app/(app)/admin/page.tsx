import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/server/context';
import { listAllSystemUpdates, listOrganizations } from '@/server/services/admin';
import { PageHeader } from '@/components/ui/card';
import { AdminConsole } from './admin-console';

export const metadata: Metadata = { title: 'Platform admin' };

/** Platform console for the AsiaTech team: organisations and their hotels, and the System Update feed. */
export default async function AdminPage() {
  await requireSuperAdmin();
  const [orgs, updates] = await Promise.all([listOrganizations(), listAllSystemUpdates()]);
  return (
    <div>
      <PageHeader eyebrow="AsiaTech team" title="Platform admin" description="Every organisation and hotel on AsiaTech, and the System Update cards hotels see on their dashboard." />
      <AdminConsole orgs={JSON.parse(JSON.stringify(orgs))} updates={JSON.parse(JSON.stringify(updates))} />
    </div>
  );
}
