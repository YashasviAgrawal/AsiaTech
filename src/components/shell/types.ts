export interface ShellNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface ShellData {
  user: { name: string; email: string | null; roleName: string };
  property: { id: string; name: string; city: string | null; businessDate: string; status: string; slug: string };
  memberships: { id: string; name: string; city: string | null; roleName: string }[];
  permissions: string[];
  notifications: ShellNotification[];
  unreadCount: number;
  /** Counts shown next to sidebar items, keyed by href. */
  badges: Record<string, number>;
}
