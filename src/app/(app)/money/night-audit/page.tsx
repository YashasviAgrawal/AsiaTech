import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { AUDIT_STEPS, auditHistory, getAuditState } from '@/server/services/nightaudit';
import { formatDayLong } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { NightAuditWizard } from './wizard';

export const metadata: Metadata = { title: 'Night Audit' };

export default async function NightAuditPage() {
  const ctx = await requireContext('nightaudit.run');
  const [state, history] = await Promise.all([getAuditState(ctx.propertyId, ctx.property.businessDate), auditHistory(ctx.propertyId)]);
  return (
    <div>
      <PageHeader
        eyebrow={`Business date · ${formatDayLong(ctx.property.businessDate)}`}
        title="Night Audit"
        description="One guided run that closes the day: no-shows, room charges, restaurant, cash, then lock the day and email the report."
      />
      <NightAuditWizard
        state={JSON.parse(JSON.stringify(state))}
        steps={AUDIT_STEPS}
        businessDate={ctx.property.businessDate}
        history={JSON.parse(JSON.stringify(history.map((h) => ({ ...h.audit, runBy: h.runBy }))))}
        emails={ctx.property.settings.notifications.emails}
      />
    </div>
  );
}
