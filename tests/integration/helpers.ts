// Second guard (the integration config has the first): these tests write bookings, so never run on real data.
if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(`Integration tests only run against a *_test database (got ${process.env.DATABASE_URL ?? 'none'}). Use npm run test:integration.`);
}

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { systemActor, type Actor } from '@/server/services/actor';
import { addDay } from '@/lib/format';

export async function porticoActor(): Promise<Actor> {
  const [p] = (await db.execute(sql`select id from properties where slug = 'shri-ram-portico'`)).rows as { id: string }[];
  return systemActor(p.id);
}

/** Room type + its default plan, and a date range far enough ahead to be empty in the seed. */
export async function freeStay(actor: Actor, code: string, offsetDays: number, nights = 1) {
  const [rt] = (await db.execute(sql`
    select rt.id, rt.name, (select rp.id from rate_plans rp where rp.room_type_id = rt.id and rp.is_active order by rp.is_default desc limit 1) as plan
    from room_types rt where rt.property_id = ${actor.propertyId} and rt.code = ${code}`)).rows as { id: string; name: string; plan: string }[];
  const checkIn = addDay(actor.businessDate, offsetDays);
  return { roomTypeId: rt.id, ratePlanId: rt.plan, checkIn, checkOut: addDay(checkIn, nights) };
}

export async function available(actor: Actor, roomTypeId: string, date: string) {
  const [row] = (await db.execute(sql`select total - booked - blocked as n from inventory where property_id = ${actor.propertyId} and room_type_id = ${roomTypeId} and date = ${date}`)).rows as { n: number }[];
  return Number(row?.n ?? 0);
}

/** Rows where inventory.booked disagrees with the booking rooms covering that night, or availability is negative. */
export async function inventoryMismatches(actor: Actor) {
  const { rows } = await db.execute(sql`
    with actual as (
      select br.room_type_id, d::date as date, count(*) as n
      from booking_rooms br, generate_series(br.check_in, br.check_out - 1, interval '1 day') d
      where br.status in ('reserved','in_house','departed') and br.property_id = ${actor.propertyId}
      group by 1, 2
    )
    select i.room_type_id, i.date, i.booked, coalesce(a.n, 0) as actual
    from inventory i left join actual a on a.room_type_id = i.room_type_id and a.date = i.date
    where i.property_id = ${actor.propertyId} and i.date >= ${actor.businessDate}
      and (i.booked <> coalesce(a.n, 0) or i.total - i.booked - i.blocked < 0)`);
  return rows;
}

export const guest = (n: number) => ({ name: `Test Guest ${n}`, mobile: `90000${String(n).padStart(5, '0')}` });
