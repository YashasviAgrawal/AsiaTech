'use client';

import { useState } from 'react';
import { Check, KeyRound, LogOut, Minus, Pencil, Plus, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { formatDateTime, timeAgo } from '@/lib/format';
import { deleteRoleAction, saveRoleAction, saveUserAction, signOutEverywhereAction } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Segmented, Select } from '@/components/ui/fields';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';
import { deviceName } from '@/lib/device';
import { useTr } from '@/i18n/client';

interface Staff {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  language: 'en' | 'hi';
  lastLoginAt: string | null;
  roleKey: string;
  roleName: string;
  isActive: boolean;
}

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  members: number;
}

/** Same rule as the server: you can only hand out what you have. */
function canGrant(mine: readonly string[], role: readonly string[]) {
  if (mine.includes('*')) return true;
  if (role.includes('*')) return false;
  return role.every((p) => mine.includes(p));
}

const ROLE_TONE: Record<string, 'brand' | 'violet' | 'info' | 'success' | 'warning' | 'neutral'> = {
  owner: 'brand',
  manager: 'violet',
  front_desk: 'info',
  housekeeping: 'success',
  restaurant: 'warning',
  accountant: 'neutral',
};

export function UsersManager({
  staff,
  logins,
  roles,
  permissions,
  groups,
  myPermissions,
  currentUserId,
  isOwner,
}: {
  staff: Staff[];
  logins: { id: string; name: string; success: boolean; ip: string | null; userAgent: string | null; createdAt: string }[];
  roles: Role[];
  permissions: { key: string; label: string }[];
  groups: { title: string; permissions: string[] }[];
  myPermissions: string[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const [editingRole, setEditingRole] = useState<Role | 'new' | null>(null);
  const [removingRole, setRemovingRole] = useState<Role | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const { run, pending } = useRun();
  const tr = useTr();
  const labels = Object.fromEntries(permissions.map((p) => [p.key, p.label]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<UserPlus className="h-4 w-4" />}
          title="Staff"
          description={`${staff.filter((s) => s.isActive).length} active logins`}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowMatrix((v) => !v)}>
                <ShieldCheck className="h-3.5 w-3.5" /> {showMatrix ? 'Hide' : 'What can each role do?'}
              </Button>
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="h-3.5 w-3.5" /> {tx('Add staff')}
              </Button>
            </div>
          }
        />
        <Table minWidth={780}>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Signs in with</Th>
              <Th>Role</Th>
              <Th>Language</Th>
              <Th>Last login</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {staff.map((s) => (
              <Tr key={s.id} className={cn(!s.isActive && 'opacity-50')}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-800 text-xs font-bold text-white">{initials(s.name)}</span>
                    <span className="font-semibold text-ink-900">
                      {s.name} {s.id === currentUserId && <span className="text-xs font-normal text-ink-400">(you)</span>}
                    </span>
                  </span>
                </Td>
                <Td className="text-xs">
                  {s.email && <p>{s.email}</p>}
                  {s.mobile && <p className="num">{s.mobile}</p>}
                </Td>
                <Td>
                  <Badge tone={ROLE_TONE[s.roleKey] ?? 'violet'}>{s.roleName}</Badge>
                  {!s.isActive && <Badge tone="danger" className="ml-1">Inactive</Badge>}
                </Td>
                <Td>{s.language === 'hi' ? 'हिंदी' : 'English'}</Td>
                <Td className="text-xs">{tx(s.lastLoginAt ? timeAgo(s.lastLoginAt) : 'Never')}</Td>
                <Td className="text-right whitespace-nowrap">
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {s.id !== currentUserId && (
                    <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => run(() => signOutEverywhereAction(s.id))} title="Sign out on every device" aria-label="Sign out everywhere">
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {showMatrix && (
        <Card className="animate-enter">
          <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="What each role can do" description="System roles and your own roles side by side." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink-50 text-[11px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">{tx('Permission')}</th>
                  {roles.map((r) => (
                    <th key={r.key} className="px-3 py-2.5 text-center font-semibold">
                      {r.isSystem ? tr(r.name) : r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {permissions.map((p) => (
                  <tr key={p.key}>
                    <td className="px-5 py-2 text-ink-700">{tr(p.label)}</td>
                    {roles.map((r) => {
                      const ok = r.permissions.includes('*') || r.permissions.includes(p.key);
                      return (
                        <td key={r.key} className="px-3 py-2 text-center">
                          {ok ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <Minus className="mx-auto h-4 w-4 text-ink-200" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Roles"
          description="Six system roles, plus roles you make for your own team (for example a night auditor)."
          action={
            <Button size="sm" onClick={() => setEditingRole('new')}>
              <Plus className="h-3.5 w-3.5" /> {tx('New role')}
            </Button>
          }
        />
        <ul className="grid gap-3 p-5 pt-1 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const all = r.permissions.includes('*');
            const mine = canGrant(myPermissions, r.permissions);
            return (
              <li key={r.id} className="flex flex-col rounded-xl border border-ink-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-ink-900">
                      <span className="truncate">{r.isSystem ? tr(r.name) : r.name}</span>
                      <Badge tone={r.isSystem ? 'neutral' : 'violet'}>{r.isSystem ? 'System' : 'Custom'}</Badge>
                    </p>
                    {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{r.isSystem ? tr(r.description) : r.description}</p>}
                  </div>
                  {!r.isSystem && mine && (
                    <span className="flex shrink-0">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditingRole(r)} aria-label={tr('Edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setRemovingRole(r)} aria-label={tr('Remove')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </div>
                <p className="mt-auto pt-3 text-xs text-ink-500">
                  {tr(all ? 'Everything' : `${r.permissions.length} of ${permissions.length} permissions`)} · {tr(`${r.members} staff`)}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={<KeyRound className="h-4 w-4" />} title="Login history" description="Last 30 sign-in attempts" />
        <ul className="divide-y divide-ink-100">
          {logins.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
              {l.success ? <Check className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
              <span className="font-medium text-ink-800">{l.name}</span>
              <span className="text-xs text-ink-400">{tx(l.success ? 'signed in' : 'wrong password')}</span>
              <span className="ml-auto truncate text-xs text-ink-400">
                {tx(deviceName(l.userAgent))} · {l.ip ?? '—'} · {formatDateTime(l.createdAt)}
              </span>
            </li>
          ))}
          {logins.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-500">{tx('No sign-ins yet.')}</li>}
        </ul>
      </Card>

      {editing && (
        <StaffDialog
          staff={editing === 'new' ? null : editing}
          // Only roles you could hand out yourself; the owner role stays with owners.
          roles={roles.filter((r) => (isOwner || r.key !== 'owner') && (canGrant(myPermissions, r.permissions) || (editing !== 'new' && r.key === editing.roleKey)))}
          onClose={() => setEditing(null)}
        />
      )}
      {editingRole && (
        <RoleDialog role={editingRole === 'new' ? null : editingRole} roles={roles} groups={groups} labels={labels} myPermissions={myPermissions} onClose={() => setEditingRole(null)} />
      )}
      <ConfirmDialog
        open={Boolean(removingRole)}
        onClose={() => setRemovingRole(null)}
        title={removingRole ? `${tr('Remove role')} ${removingRole.name}?` : ''}
        description={
          removingRole?.members
            ? tr(`${removingRole.members} staff ${removingRole.members === 1 ? 'member still has' : 'members still have'} this role. Give them another role first.`)
            : tr('Staff will no longer be able to get this role.')
        }
        confirmLabel="Remove role"
        variant="danger"
        undoable={false}
        loading={pending}
        onConfirm={async () => {
          if (!removingRole) return;
          await run(() => deleteRoleAction(removingRole.id), { onSuccess: () => setRemovingRole(null) });
        }}
      />
    </div>
  );
}

function StaffDialog({ staff, roles, onClose }: { staff: Staff | null; roles: Role[]; onClose: () => void }) {
  const [form, setForm] = useState({
    name: staff?.name ?? '',
    email: staff?.email ?? '',
    mobile: staff?.mobile ?? '',
    roleKey: staff?.roleKey ?? 'front_desk',
    language: staff?.language ?? ('en' as 'en' | 'hi'),
    password: '',
    isActive: staff?.isActive ?? true,
  });
  const { run, pending } = useRun();
  const role = roles.find((r) => r.key === form.roleKey);
  return (
    <Dialog
      open
      onClose={onClose}
      title={staff ? `Edit ${staff.name}` : 'Add staff'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveUserAction({ ...form, id: staff?.id, mobile: form.mobile || null, email: form.email || null }), { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </Field>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Mobile">
          <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(-10) })} inputMode="tel" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
      </div>
      <Field label="Role" className="mt-4" hint={role?.description ?? undefined}>
        <Select value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="App language" className="mt-4">
        <Segmented
          value={form.language}
          onChange={(language) => setForm({ ...form, language })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'हिंदी' },
          ]}
        />
      </Field>
      <Field label={staff ? 'New password (leave empty to keep)' : 'First password'} className="mt-4" hint="At least 8 characters. Changing it signs them out everywhere.">
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
      </Field>
      <Checkbox className="mt-4" label="Active" description="Inactive staff cannot sign in." checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
    </Dialog>
  );
}

function RoleDialog({
  role,
  roles,
  groups,
  labels,
  myPermissions,
  onClose,
}: {
  role: Role | null;
  roles: Role[];
  groups: { title: string; permissions: string[] }[];
  labels: Record<string, string>;
  myPermissions: string[];
  onClose: () => void;
}) {
  const tr = useTr();
  const [form, setForm] = useState({ name: role?.name ?? '', description: role?.description ?? '', permissions: role?.permissions ?? ['dashboard.view'] });
  const { run, pending } = useRun();
  const has = (p: string) => myPermissions.includes('*') || myPermissions.includes(p);
  const toggle = (p: string, on: boolean) => setForm({ ...form, permissions: on ? [...form.permissions, p] : form.permissions.filter((x) => x !== p) });
  // "Start from" copies a role's permissions, keeping only the ones you can give.
  const startFrom = (key: string) => {
    const from = roles.find((r) => r.key === key);
    if (!from) return;
    const all = groups.flatMap((g) => g.permissions);
    setForm({ ...form, permissions: (from.permissions.includes('*') ? all : from.permissions).filter(has) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={role ? `${tr('Edit role')} ${role.name}` : 'New role'}
      description="Pick what people with this role can see and do. You can only give permissions you have yourself."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveRoleAction({ ...form, id: role?.id }), { onSuccess: onClose })}>
            Save role
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Night auditor" maxLength={40} autoFocus />
        </Field>
        {!role && (
          <Field label="Start from">
            <Select defaultValue="" onChange={(e) => startFrom(e.target.value)}>
              <option value="">Blank</option>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Description" className="mt-3">
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Closes the day at night; no rate changes" maxLength={160} />
      </Field>
      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <section key={g.title}>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
              {tr(g.title)} · {g.permissions.filter((p) => form.permissions.includes(p)).length}/{g.permissions.length}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.permissions.map((p) => (
                <Checkbox
                  key={p}
                  label={labels[p] ?? p}
                  description={has(p) ? undefined : 'You do not have this permission'}
                  checked={form.permissions.includes(p)}
                  disabled={!has(p)}
                  onChange={(e) => toggle(p, e.target.checked)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
