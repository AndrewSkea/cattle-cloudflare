'use client'

import Link from 'next/link'
import { ArrowRight, CalendarCheck2, GitBranch, HeartPulse, Map, ShieldCheck, Tractor, Users, Wallet } from 'lucide-react'
import { Logo } from '@/components/shell'
import { LinkButton } from '@/components/ui/button'
import { useMe } from '@/lib/session'

const FEATURES = [
  { icon: GitBranch, title: 'Every animal, every bloodline', text: 'Cattle, sheep, goats, pigs, horses and poultry. Pedigrees and descendant trees, with family averages you can compare against the herd.' },
  { icon: HeartPulse, title: 'Health that keeps itself on time', text: 'Vaccinations, treatments, tests and withdrawal periods. Boosters come due on the dashboard before they’re missed.' },
  { icon: Map, title: 'Your land on a satellite map', text: 'Draw fields, pin barns, troughs and gates. See which stock is grazing where, and what each field costs you.' },
  { icon: Tractor, title: 'Machinery that’s ready to go', text: 'Service intervals by hours or months, MOT and insurance dates, and a full log of repairs, fuel and costs.' },
  { icon: Wallet, title: 'Money in, money out', text: 'Sales, subsidies, feed, vet and wages in one ledger. Monthly profit and loss, cost per head and price per kilo.' },
  { icon: Users, title: 'Your team, with the right access', text: 'Invite managers, workers and viewers. Each person signs in with their own account and sees only what their role allows.' },
]

export default function Landing() {
  const { data: me } = useMe()
  const signedIn = !!me
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {signedIn
            ? <LinkButton href="/dashboard">Open your farm <ArrowRight /></LinkButton>
            : <><LinkButton href="/login" variant="ghost">Sign in</LinkButton><LinkButton href="/login">Get started</LinkButton></>}
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(ellipse_at_top,theme(colors.brand.100),transparent_65%)]" />
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 text-center sm:pt-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-800 shadow-sm ring-1 ring-brand-100">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Built for working livestock farms
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-stone-900 sm:text-6xl">
            The whole farm, <span className="text-brand-700">in one place.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">
            Herd records, family trees, health, fields, machinery, stock, people and money, so you spend less time on paperwork and more time on the land.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LinkButton href={signedIn ? '/dashboard' : '/login'} size="lg">{signedIn ? 'Open your farm' : 'Sign in with Google'} <ArrowRight /></LinkButton>
            <a href="#features" className="text-sm font-medium text-stone-600 hover:text-stone-900">See what’s inside ↓</a>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 pb-20">
          <div className="rounded-3xl bg-brand-900 p-3 shadow-pop ring-1 ring-brand-950/20 sm:p-4">
            <div className="grid gap-3 rounded-2xl bg-stone-50 p-4 sm:grid-cols-3 sm:p-6">
              {[
                { k: 'On farm', v: '212', s: '84 cows · 41 heifers · 87 calves' },
                { k: 'Due to calve', v: '12', s: 'Next 45 days' },
                { k: 'Net this year', v: '£48.2k', s: 'Income less costs' },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl bg-white p-5 text-left shadow-card ring-1 ring-stone-900/5">
                  <p className="text-[13px] font-medium text-stone-500">{x.k}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-stone-900">{x.v}</p>
                  <p className="mt-1 text-xs text-stone-500">{x.s}</p>
                </div>
              ))}
              <div className="rounded-2xl bg-white p-5 text-left shadow-card ring-1 ring-stone-900/5 sm:col-span-2">
                <p className="text-[13px] font-medium text-stone-500">Coming up</p>
                <ul className="mt-3 space-y-2.5 text-sm">
                  {[
                    ['BVD booster: 24 cows', 'in 3 days', 'bg-sky-500'],
                    ['JD 6155R: 500 h service', 'in 18 h', 'bg-amber-500'],
                    ['Cow 24-31 due to calve', 'next week', 'bg-emerald-500'],
                  ].map(([a, b, c]) => (
                    <li key={a} className="flex items-center gap-3"><span className={`size-2 rounded-full ${c}`} /><span className="flex-1 text-stone-800">{a}</span><span className="text-stone-400">{b}</span></li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-left text-white">
                <CalendarCheck2 className="size-6 text-wheat-300" />
                <p className="mt-6 font-display text-xl font-semibold leading-snug">Nothing slips through the gate.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-stone-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Everything a working farm needs. Nothing it doesn’t.</h2>
          <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><f.icon className="size-5" /></div>
                <h3 className="mt-4 font-semibold text-stone-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 size-6 shrink-0 text-wheat-300" />
            <div>
              <p className="font-display text-2xl font-semibold text-white">Your records stay yours.</p>
              <p className="mt-1 text-sm text-brand-200">Sign in with Google. Each farm’s data is private to the people you invite.</p>
            </div>
          </div>
          <LinkButton href={signedIn ? '/dashboard' : '/login'} variant="accent" size="lg">{signedIn ? 'Open your farm' : 'Get started'} <ArrowRight /></LinkButton>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-stone-500">
        <span>© {new Date().getFullYear()} HoovesWho</span>
        <Link href="/login" className="hover:text-stone-800">Sign in</Link>
      </footer>
    </div>
  )
}
