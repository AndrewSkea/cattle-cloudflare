'use client'

import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/constants'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-white shadow-card ring-1 ring-stone-900/[0.06]', className)} {...props}>{children}</div>
}

export function CardHeader({ title, description, action, className, icon: Icon }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; icon?: LucideIcon
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-4" /></div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-stone-500">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

const toneClasses: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-clay-50 text-clay-700 ring-clay-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  gray: 'bg-stone-100 text-stone-600 ring-stone-500/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  brand: 'bg-brand-50 text-brand-800 ring-brand-600/20',
}
const dotClasses: Record<Tone, string> = {
  green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-clay-500', blue: 'bg-sky-500', gray: 'bg-stone-400', violet: 'bg-violet-500', brand: 'bg-brand-600',
}

export function Badge({ tone = 'gray', children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', toneClasses[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', dotClasses[tone])} />}
      {children}
    </span>
  )
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', href, trend }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: LucideIcon; tone?: 'brand' | 'wheat' | 'clay' | 'sky' | 'stone'; href?: string
  trend?: { value: string; positive: boolean } | null
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700', wheat: 'bg-wheat-50 text-wheat-700', clay: 'bg-clay-50 text-clay-700', sky: 'bg-sky-50 text-sky-700', stone: 'bg-stone-100 text-stone-700',
  }
  const inner = (
    <Card className={cn('h-full p-5 transition', href && 'hover:shadow-lift hover:ring-stone-900/10')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-stone-500">{label}</p>
        {Icon && <div className={cn('grid size-8 place-items-center rounded-lg', tones[tone])}><Icon className="size-4" /></div>}
      </div>
      <p className="mt-2 font-display text-[28px] font-semibold leading-none tracking-tight text-stone-900 tabular">{value}</p>
      {(sub || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
          {trend && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium', trend.positive ? 'text-emerald-700' : 'text-clay-700')}>
              {trend.positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{trend.value}
            </span>
          )}
          {sub}
        </div>
      )}
    </Card>
  )
  return href ? <Link href={href} className="block focus-ring rounded-2xl">{inner}</Link> : inner
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-stone-200/70', className)} />
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow, children }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; children?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[13px] text-stone-500">{eyebrow}</div>}
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-stone-900 sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode; hidden?: boolean }[]; cols?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
      {items.filter((i) => !i.hidden).map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">{i.label}</dt>
          <dd className="mt-1 truncate text-sm text-stone-900">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className={cn('shrink-0 rounded-full object-cover ring-1 ring-black/5', className)} style={{ width: size, height: size }} />
  }
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name}
    </span>
  )
}

export function ProgressBar({ value, max = 100, tone = 'brand' }: { value: number; max?: number; tone?: 'brand' | 'amber' | 'red' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const c = tone === 'red' ? 'bg-clay-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div className={cn('h-full rounded-full transition-all', c)} style={{ width: `${pct}%` }} />
    </div>
  )
}
