import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties } from '@/db/schema';
import { addDay, todayIST } from '@/lib/format';
import { BookingEngine } from './booking-engine';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [p] = await db.select({ name: properties.name, city: properties.city }).from(properties).where(eq(properties.slug, slug));
  return { title: p ? `Book ${p.name}, ${p.city ?? ''}` : 'Book', robots: { index: true, follow: true } };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p] = await db.select().from(properties).where(eq(properties.slug, slug));
  if (!p || p.status === 'suspended') notFound();
  const today = todayIST();
  return (
    <BookingEngine
      hotel={{
        slug: p.slug,
        name: p.name,
        city: p.city ?? '',
        address: [p.addressLine1, p.addressLine2, p.city, p.state].filter(Boolean).join(', '),
        phone: p.phone,
        email: p.email,
        checkInTime: p.checkInTime,
        checkOutTime: p.checkOutTime,
        starRating: p.starRating,
        branding: p.branding,
      }}
      defaults={{ checkIn: today, checkOut: addDay(today, 1), today }}
    />
  );
}
