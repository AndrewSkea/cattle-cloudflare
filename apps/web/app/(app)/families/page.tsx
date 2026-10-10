'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Crown, GitBranch, Search } from 'lucide-react'
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { getData } from '@/lib/api'
import { fmtMoney, fmtNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { FamilyStats } from '@/lib/types'

interface Family {
  founder: { id: number; tagNo: string; managementTag: string | null; name: string | null; breed: string | null; dob: string | null; status: string }
  descendants: number
  generations: number
  stats: FamilyStats
}

type Sort = 'size' | 'interval' | 'sales' | 'active'

export default function FamiliesPage() {
  const { currency } = useSession()
  const { data, isLoading } = useQuery({ queryKey: ['families'], queryFn: () => getData<Family[]>('/api/animals/families') })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('size')
  const [showSingles, setShowSingles] = useState(false)

  const rows = useMemo(() => {
    let list = (data || []).filter((f) => showSingles || f.descendants > 0)
    const s = q.trim().toLowerCase()
    if (s) list = list.filter((f) => `${f.founder.tagNo} ${f.founder.managementTag || ''} ${f.founder.name || ''} ${f.founder.breed || ''}`.toLowerCase().includes(s))
    const key = (f: Family) => sort === 'size' ? f.descendants : sort === 'active' ? f.stats.active : sort === 'sales' ? f.stats.totalSales || 0 : -(f.stats.avgCalvingIntervalDays || 9999)
    return [...list].sort((a, b) => key(b) - key(a))
  }, [data, q, sort, showSingles])

  const max = Math.max(1, ...rows.map((r) => r.descendants))
  const singles = (data || []).filter((f) => f.descendants === 0).length

  return (
    <div>
      <PageHeader title="Families" description="Maternal lines on your farm, traced back to each founding female." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search founders…" aria-label="Search founders"
            className="h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <Segmented value={sort} onChange={setSort} options={[{ value: 'size', label: 'Largest' }, { value: 'active', label: 'Most on farm' }, { value: 'interval', label: 'Best interval' }, { value: 'sales', label: 'Most sales' }]} />
      </div>
      {isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        : rows.length === 0 ? <Card><EmptyState icon={GitBranch} title="No families yet" description="Link animals to their dams to build maternal lines." /></Card> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((f, i) => (
              <Link key={f.founder.id} href={`/livestock/view?id=${f.founder.id}&tab=family`} className="group focus-ring rounded-2xl">
                <Card className="h-full p-5 transition group-hover:shadow-lift group-hover:ring-brand-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('grid size-10 place-items-center rounded-xl', i < 3 && sort === 'size' && !q ? 'bg-wheat-100 text-wheat-700' : 'bg-brand-50 text-brand-700')}>
                        {i < 3 && sort === 'size' && !q ? <Crown className="size-5" /> : <GitBranch className="size-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900 group-hover:text-brand-700">{f.founder.managementTag || f.founder.tagNo}{f.founder.name && <span className="font-normal text-stone-500"> · {f.founder.name}</span>}</p>
                        <p className="text-xs text-stone-500">{[f.founder.breed, f.founder.status !== 'active' ? 'no longer on farm' : null].filter(Boolean).join(' · ') || f.founder.tagNo}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-semibold text-stone-900 tabular">{f.descendants}</p>
                      <p className="text-[11px] text-stone-400">descendants</p>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${(f.descendants / max) * 100}%` }} /></div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[11px] text-stone-400">On farm</dt><dd className="text-sm font-semibold text-stone-800 tabular">{f.stats.active}</dd></div>
                    <div><dt className="text-[11px] text-stone-400">Generations</dt><dd className="text-sm font-semibold text-stone-800 tabular">{f.generations + 1}</dd></div>
                    <div><dt className="text-[11px] text-stone-400">Interval</dt><dd className="text-sm font-semibold text-stone-800 tabular">{f.stats.avgCalvingIntervalDays ? `${fmtNum(f.stats.avgCalvingIntervalDays)} d` : '—'}</dd></div>
                  </dl>
                  {f.stats.totalSales ? <p className="mt-3 text-center text-xs text-stone-500">{fmtMoney(f.stats.totalSales, currency, { decimals: false })} in sales · avg {fmtMoney(f.stats.avgSalePrice, currency, { decimals: false })}</p> : null}
                </Card>
              </Link>
            ))}
          </div>
        )}
      {singles > 0 && !isLoading && (
        <button onClick={() => setShowSingles((s) => !s)} className="mt-6 text-sm font-medium text-brand-700 hover:underline">
          {showSingles ? 'Hide' : 'Show'} {singles} females with no recorded offspring
        </button>
      )}
    </div>
  )
}
