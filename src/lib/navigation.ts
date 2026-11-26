import {
  BarChart3,
  BedDouble,
  ConciergeBell,
  Globe,
  Home,
  IndianRupee,
  Settings,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/i18n';
import type { Permission } from '@/server/auth/permissions';

export interface NavLink {
  href: string;
  labelKey: MessageKey;
  permission?: Permission;
  /** Old AsiaTech menu name, shown as a hint so long-time staff can still find things. */
  legacy?: string;
}

export interface NavSection {
  key: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Section landing page (also the link when the section has a single screen). */
  href: string;
  permission?: Permission;
  items?: NavLink[];
}

/**
 * The single source of the menu (simplicity rule 1): 14 old AsiaTech sidebar items → 9 sections.
 * Every old screen keeps its name inside its section.
 */
export const NAVIGATION: NavSection[] = [
  { key: 'home', labelKey: 'nav.home', icon: Home, href: '/dashboard', permission: 'dashboard.view' },
  {
    key: 'front-desk',
    labelKey: 'nav.frontDesk',
    icon: ConciergeBell,
    href: '/front-desk/today',
    permission: 'bookings.view',
    items: [
      { href: '/front-desk/reservations/new', labelKey: 'nav.makeReservation', permission: 'bookings.create', legacy: 'Bookings › Make A Reservation' },
      { href: '/front-desk/holds', labelKey: 'nav.holdBooking', permission: 'bookings.view', legacy: 'Bookings › Hold Booking' },
      { href: '/front-desk/today', labelKey: 'nav.todayCheck', permission: 'bookings.view', legacy: 'Bookings › Today Check (In-Out)' },
      { href: '/front-desk/bookings', labelKey: 'nav.bookingReport', permission: 'bookings.view', legacy: 'Bookings › Booking Report' },
      { href: '/front-desk/guests', labelKey: 'nav.guests', permission: 'bookings.view' },
    ],
  },
  {
    key: 'rooms',
    labelKey: 'nav.roomsRates',
    icon: BedDouble,
    href: '/rooms/calendar',
    permission: 'inventory.view',
    items: [
      { href: '/rooms/calendar', labelKey: 'nav.availabilityCalendar', permission: 'inventory.view', legacy: 'Room Management › Availability Calendar' },
      { href: '/rooms/chart', labelKey: 'nav.roomChart', permission: 'inventory.view', legacy: 'Room Management › Room Chart' },
      { href: '/rooms/rates', labelKey: 'nav.rateManagement', permission: 'inventory.view', legacy: 'Rate Management' },
      { href: '/rooms/setup', labelKey: 'nav.roomRatePlan', permission: 'rooms.manage', legacy: 'Room Management › Room and Rate Plan' },
    ],
  },
  {
    key: 'channels',
    labelKey: 'nav.channels',
    icon: Globe,
    href: '/channels',
    permission: 'channels.manage',
    items: [
      { href: '/channels', labelKey: 'nav.channelManager', permission: 'channels.manage' },
      { href: '/channels/promotions', labelKey: 'nav.promotions', permission: 'channels.manage', legacy: 'Promotions (tag icon)' },
      { href: '/channels/reviews', labelKey: 'nav.otaReviews', permission: 'channels.manage', legacy: 'OTA Reviews' },
      { href: '/channels/sync-log', labelKey: 'nav.syncLog', permission: 'channels.manage' },
      { href: '/channels/booking-engine', labelKey: 'nav.bookingEngine', permission: 'channels.manage', legacy: 'Booking engine (globe icon)' },
    ],
  },
  {
    key: 'restaurant',
    labelKey: 'nav.restaurant',
    icon: UtensilsCrossed,
    href: '/restaurant',
    permission: 'pos.use',
    items: [
      { href: '/restaurant', labelKey: 'nav.pointOfSale', permission: 'pos.use', legacy: 'Point Of Sale' },
      { href: '/restaurant/menu', labelKey: 'nav.menuTables', permission: 'pos.manage' },
      { href: '/restaurant/printers', labelKey: 'nav.printers', permission: 'pos.manage' },
    ],
  },
  {
    key: 'housekeeping',
    labelKey: 'nav.housekeeping',
    icon: Sparkles,
    href: '/housekeeping',
    permission: 'housekeeping.use',
    items: [
      { href: '/housekeeping', labelKey: 'nav.roomStatus', permission: 'housekeeping.use', legacy: 'House Keeping' },
      { href: '/housekeeping/checklist', labelKey: 'nav.checklist', permission: 'housekeeping.manage', legacy: 'House Keeping › Checklist' },
      { href: '/housekeeping/tickets', labelKey: 'nav.repairs', permission: 'housekeeping.use' },
      { href: '/housekeeping/my', labelKey: 'nav.myTasks', permission: 'housekeeping.use' },
    ],
  },
  {
    key: 'money',
    labelKey: 'nav.money',
    icon: IndianRupee,
    href: '/money/payments',
    permission: 'money.view',
    items: [
      { href: '/money/payments', labelKey: 'nav.payments', permission: 'money.view' },
      { href: '/money/request', labelKey: 'nav.requestMoney', permission: 'money.manage', legacy: 'Request Money' },
      { href: '/money/credit', labelKey: 'nav.creditReport', permission: 'money.view', legacy: 'Bookings › Credit Report' },
      { href: '/money/petty-cash', labelKey: 'nav.pettyCash', permission: 'money.view', legacy: 'Petty Cash' },
      { href: '/money/night-audit', labelKey: 'nav.nightAudit', permission: 'nightaudit.run', legacy: 'Night Audit' },
    ],
  },
  {
    key: 'reports',
    labelKey: 'nav.reports',
    icon: BarChart3,
    href: '/reports',
    permission: 'reports.view',
    items: [
      { href: '/reports', labelKey: 'nav.allReports', permission: 'reports.view', legacy: 'Reports' },
      { href: '/reports/activity', labelKey: 'nav.activityLog', permission: 'activity.view' },
    ],
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    icon: Settings,
    href: '/settings/hotel',
    permission: 'settings.manage',
    items: [
      { href: '/settings/hotel', labelKey: 'nav.hotelDetails', permission: 'settings.manage', legacy: 'Hotel Details' },
      { href: '/settings/users', labelKey: 'nav.userManagement', permission: 'users.manage', legacy: 'User Management' },
      { href: '/settings/branding', labelKey: 'nav.branding', permission: 'settings.manage', legacy: 'Branding' },
      { href: '/settings/notifications', labelKey: 'nav.notifications', permission: 'settings.manage' },
      { href: '/setup', labelKey: 'nav.setupWizard', permission: 'settings.manage' },
    ],
  },
];

/** The menu filtered to what this user may open. Sections without visible items disappear. */
export function visibleNavigation(can: (permission: Permission) => boolean): NavSection[] {
  return NAVIGATION.flatMap((section) => {
    const items = section.items?.filter((item) => !item.permission || can(item.permission));
    const sectionAllowed = !section.permission || can(section.permission);
    if (section.items) {
      if (!items || items.length === 0) return [];
      // Land on the first screen the user can actually open.
      const href = sectionAllowed && items.some((i) => i.href === section.href) ? section.href : items[0].href;
      return [{ ...section, href, items }];
    }
    return sectionAllowed ? [section] : [];
  });
}
