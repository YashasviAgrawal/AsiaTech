import 'server-only';
import { and, count, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, hkTasks, maintenanceTickets, notifications, rooms } from '@/db/schema';
import type { AppContext } from '../context';
import type { ShellData } from '@/components/shell/types';

/** Everything the sidebar and top bar need, in one round of small parallel queries. */
export async function getShellData(ctx: AppContext): Promise<ShellData> {
  const pid = ctx.propertyId;
  const today = ctx.property.businessDate;
  const visibleToUser = or(isNull(notifications.userId), eq(notifications.userId, ctx.userId));

  const [recent, [unread], [arrivals], [holds], [dirty], [tickets]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.propertyId, pid), visibleToUser))
      .orderBy(desc(notifications.createdAt))
      .limit(15),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.propertyId, pid), visibleToUser, isNull(notifications.readAt))),
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'confirmed'), lte(bookings.checkIn, today))),
    db.select({ n: count() }).from(bookings).where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'hold'))),
    db.select({ n: count() }).from(rooms).where(and(eq(rooms.propertyId, pid), eq(rooms.hkStatus, 'dirty'), eq(rooms.isActive, true))),
    db
      .select({ n: count() })
      .from(maintenanceTickets)
      .where(and(eq(maintenanceTickets.propertyId, pid), inArray(maintenanceTickets.status, ['open', 'in_progress']))),
  ]);

  const [myTasks] = await db
    .select({ n: count() })
    .from(hkTasks)
    .where(and(eq(hkTasks.propertyId, pid), eq(hkTasks.assignedTo, ctx.userId), inArray(hkTasks.status, ['pending', 'in_progress'])));

  return {
    user: { name: ctx.user.name, email: ctx.user.email, roleName: ctx.role.name },
    property: {
      id: ctx.property.id,
      name: ctx.property.name,
      city: ctx.property.city,
      businessDate: ctx.property.businessDate,
      status: ctx.property.status,
      slug: ctx.property.slug,
    },
    memberships: ctx.memberships,
    permissions: ctx.permissions,
    notifications: recent.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      read: Boolean(n.readAt),
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount: unread?.n ?? 0,
    badges: {
      '/front-desk/today': arrivals?.n ?? 0,
      '/front-desk/holds': holds?.n ?? 0,
      '/housekeeping': dirty?.n ?? 0,
      '/housekeeping/tickets': tickets?.n ?? 0,
      '/housekeeping/my': myTasks?.n ?? 0,
    },
  };
}
