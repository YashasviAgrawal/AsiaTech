import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { ratePlans, roomTypes, rooms } from '@/db/schema';
import { requireContext } from '@/server/context';
import { PageHeader } from '@/components/ui/card';
import { RoomSetup } from './room-setup';

export const metadata: Metadata = { title: 'Room and Rate Plan' };

export default async function RoomSetupPage() {
  const ctx = await requireContext('rooms.manage');
  const [types, roomRows, plans] = await Promise.all([
    db.select().from(roomTypes).where(eq(roomTypes.propertyId, ctx.propertyId)).orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name)),
    db.select().from(rooms).where(eq(rooms.propertyId, ctx.propertyId)).orderBy(asc(rooms.sortOrder), asc(rooms.number)),
    db.select().from(ratePlans).where(eq(ratePlans.propertyId, ctx.propertyId)).orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name)),
  ]);

  const data = types.map((type) => ({
    ...type,
    createdAt: undefined,
    updatedAt: undefined,
    rooms: roomRows
      .filter((r) => r.roomTypeId === type.id)
      .map((r) => ({ id: r.id, number: r.number, floor: r.floor, hkStatus: r.hkStatus, isActive: r.isActive, notes: r.notes, roomTypeId: r.roomTypeId })),
    plans: plans
      .filter((p) => p.roomTypeId === type.id)
      .map((p) => ({ ...p, createdAt: undefined, updatedAt: undefined })),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Rooms & Rates"
        title="Room and Rate Plan"
        description="Your room types, the physical rooms in each, and what you sell them as: room only (EP), with breakfast (CP), breakfast + 1 meal (MAP) or all meals (AP)."
      />
      <RoomSetup types={data} />
    </div>
  );
}
