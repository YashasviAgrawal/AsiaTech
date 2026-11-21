import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties } from '@/db/schema';
import { requireContext } from '@/server/context';
import { HotelForm } from './hotel-form';

export const metadata: Metadata = { title: 'Hotel Details' };

export default async function HotelDetailsPage() {
  const ctx = await requireContext('settings.manage');
  const [p] = await db.select().from(properties).where(eq(properties.id, ctx.propertyId));
  return (
    <HotelForm
      initial={{
        name: p.name,
        legalName: p.legalName ?? '',
        gstin: p.gstin ?? '',
        stateCode: p.stateCode ?? '',
        state: p.state ?? '',
        addressLine1: p.addressLine1 ?? '',
        addressLine2: p.addressLine2 ?? '',
        city: p.city ?? '',
        pincode: p.pincode ?? '',
        phone: p.phone ?? '',
        email: p.email ?? '',
        website: p.website ?? '',
        starRating: p.starRating ?? 0,
        checkInTime: p.checkInTime,
        checkOutTime: p.checkOutTime,
        shortCode: p.shortCode,
        tax: {
          slabLimit: p.settings.tax.roomSlabs.find((s) => s.upTo !== null)?.upTo ?? 7500,
          lowRate: p.settings.tax.roomSlabs.find((s) => s.upTo !== null)?.rate ?? 5,
          highRate: p.settings.tax.roomSlabs.find((s) => s.upTo === null)?.rate ?? 18,
          ratesIncludeTax: p.settings.tax.ratesIncludeTax,
          posDefaultRate: p.settings.tax.posDefaultRate,
        },
        invoice: p.settings.invoice,
        booking: { holdMinutesDefault: p.settings.booking.holdMinutesDefault, childAgeLimit: p.settings.booking.childAgeLimit },
      }}
    />
  );
}
