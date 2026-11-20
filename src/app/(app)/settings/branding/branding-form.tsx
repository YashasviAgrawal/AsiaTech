'use client';

import { useState } from 'react';
import { ExternalLink, MapPin, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveBrandingAction } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

const SWATCHES = ['#e11d48', '#be123c', '#7c3aed', '#0284c7', '#059669', '#d97706', '#0f172a', '#9a3412'];

export function BrandingForm({ initial, hotelName, city, slug }: { initial: { primaryColor: string; tagline: string; aboutText: string; logoUrl: string; heroImageUrl: string }; hotelName: string; city: string; slug: string }) {
  const [form, setForm] = useState(initial);
  const { run, pending } = useRun();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader icon={<Palette className="h-4 w-4" />} title="Booking page look" description="How your public booking engine looks to guests" />
        <div className="space-y-4 p-5">
          <Field label="Brand colour">
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, primaryColor: c })} className={cn('h-9 w-9 rounded-full ring-offset-2 transition', form.primaryColor === c && 'ring-2 ring-ink-900')} style={{ backgroundColor: c }} aria-label={c} />
              ))}
              <Input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-9 w-16 p-1" />
            </div>
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Comfort stays near Jaipur Junction" />
          </Field>
          <Field label="About the hotel">
            <Textarea value={form.aboutText} onChange={(e) => setForm({ ...form, aboutText: e.target.value })} />
          </Field>
          <Field label="Logo URL" hint="Upload to your website or a CDN and paste the link">
            <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Hero photo URL">
            <Input value={form.heroImageUrl} onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })} placeholder="https://…" />
          </Field>
          <div className="flex justify-between">
            <a href={`/book/${slug}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
              Open booking page <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Button loading={pending} onClick={() => run(() => saveBrandingAction(form))}>
              Save branding
            </Button>
          </div>
        </div>
      </Card>

      {/* Live preview */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
        <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate text-xs text-ink-400">/book/{slug}</span>
        </div>
        <div
          className="relative h-48 bg-cover bg-center"
          style={{ backgroundImage: form.heroImageUrl ? `url(${form.heroImageUrl})` : `linear-gradient(135deg, ${form.primaryColor}, #0f172a)` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-5 text-white">
            <p className="text-2xl font-extrabold">{hotelName}</p>
            <p className="flex items-center gap-1 text-sm text-white/80">
              <MapPin className="h-3.5 w-3.5" /> {city} · {form.tagline}
            </p>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-ink-200 p-2 text-xs">
            <div className="rounded-lg bg-ink-50 p-2">
              <p className="text-ink-400">Check-in</p>
              <p className="font-semibold">Today</p>
            </div>
            <div className="rounded-lg bg-ink-50 p-2">
              <p className="text-ink-400">Check-out</p>
              <p className="font-semibold">Tomorrow</p>
            </div>
            <button className="rounded-lg text-sm font-bold text-white" style={{ backgroundColor: form.primaryColor }}>
              Search
            </button>
          </div>
          <p className="mt-4 line-clamp-3 text-sm text-ink-600">{form.aboutText || 'Tell guests what makes your hotel special.'}</p>
        </div>
      </div>
    </div>
  );
}
