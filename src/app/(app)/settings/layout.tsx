import { requireContext } from '@/server/context';
import { SettingsTabs } from './settings-tabs';
import { tx } from '@/i18n/tx';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <div>
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-wider text-brand-600 uppercase">{tx('Settings')}</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">{ctx.property.name}</h1>
      </div>
      <SettingsTabs canUsers={ctx.can('users.manage')} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
