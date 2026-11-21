import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { promotions } from '@/db/schema';
import { nightsBetween } from '@/lib/format';

export interface AppliedPromotion {
  id: string;
  name: string;
  type: string;
  discount: { type: 'percent' | 'flat'; value: number };
}

/**
 * The best automatic promotion for a stay on a channel ("web" for the booking engine):
 * early bird (book N+ days ahead), last minute (within N days), long stay (N+ nights) or a basic deal, inside its
 * stay and booking windows. Promotions do not stack; the biggest saving wins. Coupons are applied separately.
 */
export async function bestPromotion(
  propertyId: string,
  input: { checkIn: string; checkOut: string; bookedOn: string; channel: string; roomTypeId?: string; estimatedTotal: number },
): Promise<AppliedPromotion | null> {
  const active = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.propertyId, propertyId), eq(promotions.isActive, true)));
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const leadDays = nightsBetween(input.bookedOn, input.checkIn);
  const eligible = active.filter((p) => {
    if (p.type === 'coupon') return false;
    if (!p.channels.includes(input.channel)) return false;
    if (p.roomTypeIds.length && input.roomTypeId && !p.roomTypeIds.includes(input.roomTypeId)) return false;
    if (p.stayFrom && input.checkIn < p.stayFrom) return false;
    if (p.stayTo && input.checkIn > p.stayTo) return false;
    if (p.bookFrom && input.bookedOn < p.bookFrom) return false;
    if (p.bookTo && input.bookedOn > p.bookTo) return false;
    const n = p.conditionValue ?? 0;
    if (p.type === 'early_bird') return leadDays >= n;
    if (p.type === 'last_minute') return leadDays <= n;
    if (p.type === 'long_stay') return nights >= n;
    return true;
  });
  const saving = (p: (typeof eligible)[number]) => (p.discountType === 'percent' ? (input.estimatedTotal * p.value) / 100 : p.value);
  const best = eligible.sort((a, b) => saving(b) - saving(a))[0];
  return best ? { id: best.id, name: best.name, type: best.type, discount: { type: best.discountType, value: best.value } } : null;
}
