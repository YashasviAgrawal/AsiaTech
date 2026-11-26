/**
 * Permission keys. Roles hold a list of these; '*' means everything.
 * Keep this list in sync with the role matrix shown under Settings → User Management.
 */
export const PERMISSIONS = {
  'dashboard.view': 'See the Home dashboard',
  'bookings.view': 'See bookings and guests',
  'bookings.create': 'Make reservations and holds',
  'bookings.edit': 'Change bookings, discounts and guests',
  'bookings.cancel': 'Cancel bookings and mark no-shows',
  'frontdesk.checkin': 'Check guests in and out, post to folios',
  'inventory.view': 'See the Availability Calendar and Room Chart',
  'inventory.edit': 'Change availability and bulk update',
  'rates.edit': 'Change prices and restrictions',
  'rooms.manage': 'Manage room types, rooms and rate plans',
  'channels.manage': 'Connect OTAs, mappings, promotions and reviews',
  'pos.use': 'Take restaurant orders and settle bills',
  'pos.manage': 'Manage menu, tables and close the restaurant day',
  'pos.void': 'Void restaurant orders',
  'housekeeping.use': 'Update room status and checklists',
  'housekeeping.manage': 'Manage checklist and assign housekeeping tasks',
  'money.view': 'See payments, credit report and petty cash',
  'money.manage': 'Record payments, petty cash and request money',
  'nightaudit.run': 'Run the Night Audit',
  'reports.view': 'See and export reports',
  'settings.manage': 'Change hotel details, branding and notifications',
  'users.manage': 'Add staff and change their roles',
  'activity.view': 'See the activity log',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: (Permission | '*')[] }[] = [
  { key: 'owner', name: 'Owner', description: 'Full access to everything, including staff and billing.', permissions: ['*'] },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Runs the hotel day to day: everything except staff management.',
    permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p !== 'users.manage'),
  },
  {
    key: 'front_desk',
    name: 'Front Desk',
    description: 'Reservations, check-in/out, folios and requesting payments.',
    permissions: [
      'dashboard.view',
      'bookings.view',
      'bookings.create',
      'bookings.edit',
      'bookings.cancel',
      'frontdesk.checkin',
      'inventory.view',
      'inventory.edit',
      'housekeeping.use',
      'pos.use',
      'money.view',
      'money.manage',
      'reports.view',
    ],
  },
  {
    key: 'housekeeping',
    name: 'Housekeeping',
    description: 'Room status, cleaning tasks and checklists (phone screen in Hindi).',
    permissions: ['housekeeping.use', 'inventory.view'],
  },
  {
    key: 'restaurant',
    name: 'Restaurant',
    description: 'Point of Sale: orders, KOT, bills and day close.',
    permissions: ['pos.use', 'pos.manage'],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Payments, petty cash, credit report, Night Audit and reports.',
    permissions: ['dashboard.view', 'bookings.view', 'money.view', 'money.manage', 'nightaudit.run', 'reports.view', 'activity.view'],
  },
];

export function hasPermission(granted: readonly string[], permission: Permission): boolean {
  return granted.includes('*') || granted.includes(permission);
}

/** The permission list grouped by area, in the order the role editor shows it. */
export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  { title: 'Front desk', permissions: ['dashboard.view', 'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.cancel', 'frontdesk.checkin'] },
  { title: 'Rooms & Rates', permissions: ['inventory.view', 'inventory.edit', 'rates.edit', 'rooms.manage'] },
  { title: 'Channels', permissions: ['channels.manage'] },
  { title: 'Restaurant', permissions: ['pos.use', 'pos.manage', 'pos.void'] },
  { title: 'Housekeeping', permissions: ['housekeeping.use', 'housekeeping.manage'] },
  { title: 'Money', permissions: ['money.view', 'money.manage', 'nightaudit.run'] },
  { title: 'Reports and settings', permissions: ['reports.view', 'activity.view', 'settings.manage', 'users.manage'] },
];

/**
 * Whether someone holding `granted` may hand out a role with `rolePermissions` (create, edit or assign it).
 * Nobody can give away more than they have, so a custom role is never a way to raise your own access.
 */
export function canGrant(granted: readonly string[], rolePermissions: readonly string[]): boolean {
  if (granted.includes('*')) return true;
  if (rolePermissions.includes('*')) return false;
  return rolePermissions.every((p) => granted.includes(p));
}
