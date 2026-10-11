'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Crown, GitBranch } from 'lucide-react'
import { Card, CardHeader, Skeleton } from './ui/display'
import { FamilyTreeDiagram } from './family-tree'
import { getData } from '@/lib/api'
import { fmtMoney, fmtNum } from '@/lib/format'
import { STATUS_META } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { FamilyReport, FamilyStats, FamilyTree } from '@/lib/types'

function AnimalChip({ n, label, faded }: { n: { id: number; tagNo: string; managementTag: string | null; name: string | null; sex: string; breed?: string | null; status: string } | null; label?: string; faded?: string | null }) {
  if (!n) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 px-3 py-2 text-xs text-stone-400">
        {label && <p className="font-medium uppercase tracking-wide text-[10px] text-stone-300">{label}</p>}
        {faded || 'Unknown'}
      </div>
    )
  }
  return (
    <Link href={`/livestock/view?id=${n.id}&tab=family`}
      className={cn('block rounded-xl px-3 py-2 ring-1 transition hover:shadow-lift',
        n.sex === 'female' ? 'bg-violet-50/70 ring-violet-200 hover:ring-violet-300' : 'bg-sky-50/70 ring-sky-200 hover:ring-sky-300')}>
      {label && <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">{label}</p>}
      <p className="truncate text-sm font-semibold text-stone-900">{n.managementTag || n.tagNo}{n.name && <span className="font-normal text-stone-500"> · {n.name}</span>}</p>
      <p className="truncate text-[11px] text-stone-500">{[n.breed, n.status !== 'active' ? STATUS_META[n.status]?.label : null].filter(Boolean).join(' · ') || n.tagNo}</p>
    </Link>
  )
}

const METRICS: { key: keyof FamilyStats; label: string; fmt: (v: number, cur: string) => string; better?: 'higher' | 'lower'; hint?: string }[] = [
  { key: 'avgCalvingIntervalDays', label: 'Birth interval', fmt: (v) => `${fmtNum(v)} days`, better: 'lower', hint: 'Average days between births' },
  { key: 'avgAgeFirstBirthMonths', label: 'Age at first birth', fmt: (v) => `${fmtNum(v, 1)} mo`, better: 'lower' },
  { key: 'birthLossRate', label: 'Birth losses', fmt: (v) => `${fmtNum(v, 1)}%`, better: 'lower', hint: 'Stillborn or died at birth' },
  { key: 'assistedRate', label: 'Assisted births', fmt: (v) => `${fmtNum(v, 1)}%`, better: 'lower' },
  { key: 'avgDailyGainKg', label: 'Daily liveweight gain', fmt: (v) => `${fmtNum(v, 2)} kg`, better: 'higher' },
  { key: 'avgLatestWeightKg', label: 'Latest weight', fmt: (v) => `${fmtNum(v)} kg`, better: 'higher' },
  { key: 'avgSalePrice', label: 'Sale price', fmt: (v, c) => fmtMoney(v, c, { decimals: false }), better: 'higher' },
  { key: 'avgSaleWeightKg', label: 'Sale weight', fmt: (v) => `${fmtNum(v)} kg`, better: 'higher' },
  { key: 'avgSaleAgeMonths', label: 'Age at sale', fmt: (v) => `${fmtNum(v, 1)} mo` },
]

function Compare({ v, herd, better }: { v: number | null; herd: number | null; better?: 'higher' | 'lower' }) {
  if (v == null || herd == null || herd === 0 || !better) return null
  const pct = ((v - herd) / Math.abs(herd)) * 100
  if (Math.abs(pct) < 1) return <span className="text-[11px] text-stone-400">≈ herd</span>
  const good = better === 'higher' ? pct > 0 : pct < 0
  return <span className={cn('text-[11px] font-medium', good ? 'text-emerald-700' : 'text-clay-600')}>{pct > 0 ? '+' : ''}{fmtNum(pct, 0)}% vs herd</span>
}

export function FamilyView({ report, animalId, currency }: { report: FamilyReport; animalId: number; currency: string }) {
  const [scope, setScope] = useState<'self' | 'offspring' | 'descendantStats'>(report.descendantStats.count ? 'descendantStats' : 'self')
  const tree = useQuery({ queryKey: ['families', 'tree', animalId], queryFn: () => getData<FamilyTree>(`/api/animals/${animalId}/tree?up=3&down=6`) })
  const stats = report[scope]
  const shown = METRICS.filter((m) => stats[m.key] != null || report.herd[m.key] != null)
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Offspring', value: report.offspring.count, sub: report.offspring.count ? `${report.offspring.females} female · ${report.offspring.males} male` : 'None recorded' },
          { label: 'All descendants', value: report.descendantStats.count, sub: report.generations ? `${report.generations} generation${report.generations === 1 ? '' : 's'}` : '—' },
          { label: 'Still on farm', value: report.descendantStats.active, sub: 'descendants' },
          { label: 'Descendant sales', value: report.descendantStats.totalSales ? fmtMoney(report.descendantStats.totalSales, currency, { decimals: false }) : '—', sub: `${report.descendantStats.soldCount} sold` },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium text-stone-500">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-stone-900 tabular">{s.value}</p>
            <p className="text-xs text-stone-400">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Family tree" description="Parents and grandparents above, offspring below. Hover over an animal for details; click to open it." icon={GitBranch} />
        <div className="p-5 pt-3">
          {tree.data ? <FamilyTreeDiagram tree={tree.data}
            emptyHint="No parents or offspring recorded yet. Add a dam or sire with Edit, or record births, to grow the tree." /> : <Skeleton className="h-64 rounded-xl" />}
          {report.founder && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
              <Crown className="size-3.5 text-wheat-500" /> Maternal line founded by
              <Link href={`/livestock/view?id=${report.founder.id}&tab=family`} className="font-medium text-brand-700 hover:underline">{report.founder.managementTag || report.founder.tagNo}</Link>
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Family performance" description="Averages compared with the whole herd of this species"
          action={
            <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-xs">
              {([['self', 'This animal'], ['offspring', 'Offspring'], ['descendantStats', 'All descendants']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setScope(k)} className={cn('rounded-md px-2.5 py-1 font-medium', scope === k ? 'bg-white shadow-sm' : 'text-stone-500')}>{l}</button>
              ))}
            </div>
          } />
        <div className="grid gap-px overflow-hidden rounded-b-2xl bg-stone-100 sm:grid-cols-3">
          {shown.map((m) => (
            <div key={m.key} className="bg-white p-4" title={m.hint}>
              <p className="text-xs text-stone-500">{m.label}</p>
              <p className="mt-1 text-lg font-semibold text-stone-900 tabular">{stats[m.key] != null ? m.fmt(stats[m.key] as number, currency) : '—'}</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400">Herd {report.herd[m.key] != null ? m.fmt(report.herd[m.key] as number, currency) : '—'}</span>
                <Compare v={stats[m.key] as number | null} herd={report.herd[m.key] as number | null} better={m.better} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <Card>
          <CardHeader title="Siblings" description="Same dam" />
          {report.siblings.length === 0 ? <p className="px-5 pb-5 pt-3 text-sm text-stone-500">None recorded.</p> : (
            <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{report.siblings.map((s) => <AnimalChip key={s.id} n={s} />)}</div>
          )}
        </Card>
      </div>
    </div>
  )
}
