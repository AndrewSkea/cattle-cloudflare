'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Crown, GitBranch } from 'lucide-react'
import { Card, CardHeader, EmptyState } from './ui/display'
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format'
import { STATUS_META } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { FamilyReport, FamilyStats, PedigreeNode, TreeNode } from '@/lib/types'

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

/** Three-generation pedigree laid out left (animal) → right (grandparents → great-grandparents). */
function Pedigree({ p }: { p: PedigreeNode }) {
  const col = (nodes: { n: PedigreeNode | null; label: string; faded?: string | null }[]) => (
    <div className="flex flex-col justify-around gap-2">
      {nodes.map((x, i) => <AnimalChip key={i} n={x.n} label={x.label} faded={x.faded} />)}
    </div>
  )
  const g1 = [{ n: p.sire, label: 'Sire', faded: p.sireName }, { n: p.dam, label: 'Dam' }]
  const g2 = g1.flatMap((x) => [{ n: x.n?.sire ?? null, label: `${x.label === 'Sire' ? 'Paternal' : 'Maternal'} grandsire`, faded: x.n?.sireName }, { n: x.n?.dam ?? null, label: `${x.label === 'Sire' ? 'Paternal' : 'Maternal'} granddam` }])
  const g3 = g2.flatMap((x) => [{ n: x.n?.sire ?? null, label: 'Great-grandsire', faded: x.n?.sireName }, { n: x.n?.dam ?? null, label: 'Great-granddam' }])
  // Only show generations where something is known.
  const known = (xs: { n: PedigreeNode | null; faded?: string | null }[]) => xs.some((x) => x.n || x.faded)
  const cols = [g1, g2, g3].filter((g, i) => i === 0 || known(g))
  if (!known(g1)) {
    return <p className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500">No parents recorded. {p.managementTag || p.tagNo} is a founding animal on this farm. Add a dam or sire with <strong>Edit</strong> to build the pedigree.</p>
  }
  return (
    <div className="overflow-x-auto pb-2">
      <div className={cn('grid gap-3', cols.length === 1 ? 'min-w-[420px] grid-cols-2' : cols.length === 2 ? 'min-w-[600px] grid-cols-3' : 'min-w-[760px] grid-cols-4')}>
        <div className="flex flex-col justify-center"><AnimalChip n={p} label="This animal" /></div>
        {cols.map((g, i) => <div key={i} className="contents">{col(g)}</div>)}
      </div>
    </div>
  )
}

function Tree({ node, depth = 0, rootId }: { node: TreeNode; depth?: number; rootId: number }) {
  const [open, setOpen] = useState(depth < 2)
  const has = node.children.length > 0
  return (
    <li className="relative">
      <div className="flex items-center gap-1.5 py-1">
        {has ? (
          <button onClick={() => setOpen((o) => !o)} className="grid size-5 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : <span className="size-5" />}
        <span className={cn('size-2 rounded-full', node.sex === 'female' ? 'bg-violet-400' : 'bg-sky-400')} />
        {node.id === rootId ? (
          <span className="text-sm font-semibold text-stone-900">{node.managementTag || node.tagNo}</span>
        ) : (
          <Link href={`/livestock/view?id=${node.id}&tab=family`} className="text-sm font-medium text-stone-800 hover:text-brand-700 hover:underline">{node.managementTag || node.tagNo}</Link>
        )}
        <span className="text-xs text-stone-400">{[node.name, node.breed, node.dob ? fmtDate(node.dob, 'yyyy') : null].filter(Boolean).join(' · ')}</span>
        {node.status !== 'active' && <span className="rounded bg-stone-100 px-1.5 text-[10px] font-medium text-stone-500">{STATUS_META[node.status]?.label}</span>}
        {has && <span className="ml-1 text-[11px] text-stone-400">({node.children.length})</span>}
      </div>
      {has && open && (
        <ul className="ml-[9px] border-l border-stone-200 pl-4">
          {node.children.map((c) => <Tree key={c.id} node={c} depth={depth + 1} rootId={rootId} />)}
        </ul>
      )}
    </li>
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
        <CardHeader title="Pedigree" description="Three generations back. Click any animal to open its family." icon={GitBranch} />
        <div className="p-5">
          <Pedigree p={report.pedigree} />
          {report.founder && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-stone-500">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Descendants" description={report.descendantStats.count ? `${report.descendantStats.count} in total` : undefined} />
          {report.descendants.children.length === 0 ? <EmptyState title="No offspring recorded" className="py-8" /> : (
            <ul className="p-4"><Tree node={report.descendants} rootId={animalId} /></ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Siblings" description="Same dam" />
          {report.siblings.length === 0 ? <p className="px-5 pb-5 pt-3 text-sm text-stone-500">None recorded.</p> : (
            <div className="grid gap-2 p-4">{report.siblings.map((s) => <AnimalChip key={s.id} n={s} />)}</div>
          )}
        </Card>
      </div>
    </div>
  )
}
