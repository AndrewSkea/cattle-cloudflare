'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Gauge, Plus, Search, Tractor, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, ProgressBar, StatCard } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { EquipmentSheet } from '@/components/forms/equipment-forms'
import { useEquipment } from '@/lib/queries'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUS, SERVICE_STATE } from '@/lib/constants'
import { fmtDate, fmtDue, fmtNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Equipment } from '@/lib/types'

function serviceProgress(e: Equipment): { pct: number; label: string } | null {
  if (e.serviceIntervalHours && e.hours != null) {
    const used = e.hours - (e.lastServiceHours ?? 0)
    return { pct: (used / e.serviceIntervalHours) * 100, label: `${fmtNum(Math.max(0, e.serviceIntervalHours - used))} h to service` }
  }
  if (e.nextServiceDate) return { pct: 0, label: `Service ${fmtDue(e.nextServiceDate)}` }
  return null
}

export default function EquipmentPage() {
  const { can } = useSession()
  const { data, isLoading } = useEquipment()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'active' | 'all'>('active')

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const order = { overdue: 0, due_soon: 1, unknown: 2, ok: 3 }
    return (data || [])
      .filter((e) => view === 'all' || (e.status !== 'sold' && e.status !== 'retired'))
      .filter((e) => !s || `${e.name} ${e.make || ''} ${e.model || ''} ${e.registration || ''}`.toLowerCase().includes(s))
      .sort((a, b) => order[a.serviceState] - order[b.serviceState] || a.name.localeCompare(b.name))
  }, [data, q, view])

  if (isLoading || !data) return <PageSkeleton />
  const active = data.filter((e) => e.status !== 'sold' && e.status !== 'retired')

  return (
    <div className="space-y-6">
      <PageHeader title="Equipment" description="Tractors, vehicles, implements and tools: service schedules, hours and costs."
        actions={can('worker') && <Button onClick={() => setAdding(true)}><Plus />Add equipment</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In use" value={active.length} icon={Tractor} />
        <StatCard label="Service overdue" value={active.filter((e) => e.serviceState === 'overdue').length} icon={Wrench} tone="clay" />
        <StatCard label="Due within 30 days" value={active.filter((e) => e.serviceState === 'due_soon').length} icon={Gauge} tone="wheat" />
        <StatCard label="Needs attention" value={active.filter((e) => e.status === 'needs_attention' || e.status === 'in_repair').length} icon={Wrench} tone="stone" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, make, model or registration…" aria-label="Search equipment"
            className="h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm shadow-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: 'active', label: 'In use' }, { value: 'all', label: 'All incl. sold' }]} />
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={Tractor} title={data.length ? 'Nothing matches' : 'No equipment yet'} description="Add tractors, quads, trailers and tools to track servicing and costs."
          action={!data.length && can('worker') && <Button onClick={() => setAdding(true)}><Plus />Add equipment</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => {
            const st = SERVICE_STATE[e.serviceState]
            const prog = serviceProgress(e)
            const status = EQUIPMENT_STATUS.find((s) => s.value === e.status)!
            return (
              <Link key={e.id} href={`/equipment/view?id=${e.id}`} className="group focus-ring rounded-2xl">
                <Card className="h-full p-5 transition group-hover:shadow-lift group-hover:ring-brand-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid size-11 place-items-center rounded-xl bg-stone-100 text-stone-600"><Tractor className="size-5" /></div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-stone-900 group-hover:text-brand-700">{e.name}</p>
                        <p className="truncate text-xs text-stone-500">{[EQUIPMENT_CATEGORIES.find((c) => c.value === e.category)?.label, e.year, e.registration].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    {e.status === 'active' ? <Badge tone={st.tone} dot>{st.label}</Badge> : <Badge tone={status.tone}>{status.label}</Badge>}
                  </div>
                  <div className="mt-5 space-y-2">
                    {prog && e.serviceIntervalHours ? <ProgressBar value={prog.pct} tone={prog.pct >= 100 ? 'red' : prog.pct >= 90 ? 'amber' : 'brand'} /> : null}
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>{e.hours != null ? `${fmtNum(e.hours)} h` : 'No hours logged'}</span>
                      <span>{prog?.label || (e.lastServiceDate ? `Serviced ${fmtDate(e.lastServiceDate)}` : 'No schedule')}</span>
                    </div>
                    {e.serviceReasons.length > 0 && <p className="text-xs font-medium text-clay-700">{e.serviceReasons.join(' · ')}</p>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
      {adding && <EquipmentSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
