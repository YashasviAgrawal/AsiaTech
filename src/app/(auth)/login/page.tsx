import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BedDouble, CalendarCheck2, Globe2, IndianRupee, ShieldCheck, Sparkles } from 'lucide-react';
import { getContext } from '@/server/context';
import { Logo } from '@/components/shell/logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getContext()) redirect('/');
  const { next } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(225,29,72,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(244,63,94,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />

          <div className="max-w-lg">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-200 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5" /> Built for Indian hotels
            </p>
            <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight text-white">
              Your whole hotel,
              <br />
              <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">one calm screen.</span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
              Front desk, OTA channel manager, booking engine, restaurant POS, housekeeping and Night Audit. In Hindi and English.
            </p>

            {/* A glimpse of the product: not a screenshot, a live-looking summary card */}
            <div className="mt-10 grid grid-cols-2 gap-3">
              {[
                { icon: CalendarCheck2, label: "Today's Check In", value: '12', tone: 'text-emerald-300' },
                { icon: IndianRupee, label: 'November Earning', value: '₹3,97,474', tone: 'text-brand-300' },
                { icon: BedDouble, label: 'Occupancy', value: '86%', tone: 'text-sky-300' },
                { icon: Globe2, label: 'OTAs in sync', value: '3 / 3', tone: 'text-amber-300' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur">
                  <item.icon className={`h-5 w-5 ${item.tone}`} />
                  <p className="num mt-3 text-2xl font-extrabold text-white">{item.value}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-ink-500">
            <ShieldCheck className="h-4 w-4" /> Every change is logged · GST-ready invoices · Data hosted in India
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo dark={false} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-500">Sign in with your email or mobile number.</p>
          <LoginForm next={next} showDemo={process.env.NODE_ENV !== 'production'} />
        </div>
      </div>
    </div>
  );
}
