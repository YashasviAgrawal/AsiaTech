import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { BrandingForm } from './branding-form';

export const metadata: Metadata = { title: 'Branding' };

export default async function BrandingPage() {
  const ctx = await requireContext('settings.manage');
  return <BrandingForm initial={{ primaryColor: ctx.property.branding.primaryColor, tagline: ctx.property.branding.tagline ?? '', aboutText: ctx.property.branding.aboutText ?? '', logoUrl: ctx.property.branding.logoUrl ?? '', heroImageUrl: ctx.property.branding.heroImageUrl ?? '' }} hotelName={ctx.property.name} city={ctx.property.city ?? ''} slug={ctx.property.slug} />;
}
