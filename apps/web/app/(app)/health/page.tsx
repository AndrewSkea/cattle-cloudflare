'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, HeartPulse, MoreHorizontal, Pencil, Plus, Search, ShieldAlert, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Field, Select, SelectField } from '@/components/ui/form'
import { Menu, MenuItem, Sheet, Tabs, useConfirm } from '@/components/ui/overlay'
import { HealthSheet } from '@/components/forms/livestock-forms'
import { api, useAnimals, useHealth, useSave } from '@/lib/queries'
import { getData } from '@/lib/api'
import { CATEGORY_LABELS, HEALTH_TYPES, SPECIES, healthType } from '@/lib/constants'
import { fmtDate, fmtDue, fmtMoney, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { HealthRecord } from '@/lib/types'

type Tab = 'due' | 'withdrawals' | 'records'

function HealthInner() {
  const { can, currency } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const tab = (params.get('tab') || 'due') as Tab
  const setTab = (t: Tab) => router.replace(`/health?tab=${t}`, { scroll: false })
  const { data: records, isLoading } = useHealth()
  const due = useQuery({ queryKey: ['health', 'due'], queryFn: () => getData<HealthRecord[]>('/api/health/due') })
  const withdrawals = useQuery({ queryKey: ['health', 'withdrawals'], queryFn: () => getData<HealthRecord[]>('/api/health/withdrawals') })
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<null | { kind: 'record'; record?: HealthRecord; animalId?: number } | { kind: 'group' } | { kind: 'bulk'; ids: number[] }>(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const del = useSave((p: string) => api.del(p), { invalidate: ['health', 'animal', 'finance'], success: 'Deleted' })

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (records || []).filter((r) => (!type || r.type === type) && (!s || `${r.title} ${r.animalTag} ${r.product || ''} ${r.vet || ''}`.toLowerCase().includes(s)))
  }, [records, q, type])

  if (isLoading || !records) return <PageSkeleton />
  const dueList = due.data || []
  const overdue = dueList.filter((d) => d.overdue)
  const soon = dueList.filter((d) => !d.overdue && d.nextDueDate! <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
  const yearStart = `${todayISO().slice(0, 4)}-01-01`
  const thisYear = records.filter((r) => r.date >= yearStart)

  return (
    <div className="space-y-6">
      <PageHeader title="Health" description="Vaccinations, treatments, tests and withdrawal periods across the farm."
        actions={can('worker') && <>
          <Button variant="secondary" onClick={() => setSheet({ kind: 'group' })}><Users />Treat a group</Button>
          <Button onClick={() => setSheet({ kind: 'record' })}><Plus />Add record</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Overdue" value={overdue.length} icon={CalendarClock} tone={overdue.length ? 'clay' : 'brand'} sub="Boosters & follow-ups" />
        <StatCard label="Due in 30 days" value={soon.length} icon={CalendarClock} tone="sky" />
        <StatCard label="In withdrawal" value={new Set((withdrawals.data || []).map((w) => w.animalId)).size} icon={ShieldAlert} tone="wheat" sub="Do not sell for meat" />
        <StatCard label="Records this year" value={thisYear.length} icon={HeartPulse} tone="stone"
          sub={can('manager') ? `${fmtMoney(thisYear.reduce((s, r) => s + (r.cost || 0), 0), currency, { decimals: false })} spent` : undefined} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'due', label: 'Due', count: dueList.length },
        { value: 'withdrawals', label: 'Withdrawals', count: withdrawals.data?.length ?? null },
        { value: 'records', label: 'All records', count: records.length },
      ]} />

      {tab === 'due' && (
        <Card>
          {dueList.length === 0 ? <EmptyState icon={CalendarClock} title="Nothing due" description="Set a “next due” date on a vaccination or treatment and it will appear here." /> : (
            <ul className="divide-y divide-stone-100">
              {dueList.map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', d.overdue ? 'bg-clay-50 text-clay-600' : 'bg-sky-50 text-sky-700')}><CalendarClock className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900">{d.title} · <Link href={`/livestock/view?id=${d.animalId}&tab=health`} className="text-brand-700 hover:underline">{d.animalTag}</Link></p>
                    <p className="text-xs text-stone-500">Last done {fmtDate(d.date)}{d.product ? ` · ${d.product}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-medium', d.overdue ? 'text-clay-600' : 'text-stone-800')}>{fmtDate(d.nextDueDate)}</p>
                    <p className="text-xs text-stone-400">{fmtDue(d.nextDueDate)}</p>
                  </div>
                  {can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'record', animalId: d.animalId })}>Record</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'withdrawals' && (
        <Card>
          {(withdrawals.data || []).length === 0 ? <EmptyState icon={ShieldAlert} title="No active withdrawals" description="Animals treated with a withdrawal period appear here until it ends." /> : (
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Animal</th><th className="px-3 py-2.5 font-medium">Treatment</th><th className="px-3 py-2.5 font-medium">Meat until</th><th className="px-3 py-2.5 font-medium">Milk until</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {withdrawals.data!.map((w) => (
                  <tr key={w.id}>
                    <td className="px-5 py-3"><Link href={`/livestock/view?id=${w.animalId}&tab=health`} className="font-medium text-stone-900 hover:text-brand-700">{w.animalTag}</Link></td>
                    <td className="px-3 py-3 text-stone-600">{w.title}{w.product ? ` (${w.product})` : ''}<span className="block text-xs text-stone-400">{fmtDate(w.date)}</span></td>
                    <td className="px-3 py-3">{w.withdrawalMeatUntil && w.withdrawalMeatUntil >= todayISO() ? <span className="font-medium text-amber-700">{fmtDate(w.withdrawalMeatUntil)} <span className="text-xs font-normal text-stone-400">({fmtDue(w.withdrawalMeatUntil)})</span></span> : '—'}</td>
                    <td className="px-3 py-3">{w.withdrawalMilkUntil && w.withdrawalMilkUntil >= todayISO() ? <span className="font-medium text-amber-700">{fmtDate(w.withdrawalMilkUntil)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'records' && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search treatment, animal, product or vet…" aria-label="Search health records"
                className="h-9 w-full rounded-lg border-0 bg-stone-50 pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-44" aria-label="Type"><option value="">All types</option>{HEALTH_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
          </div>
          {filtered.length === 0 ? <EmptyState icon={HeartPulse} title="No records" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Animal</th><th className="px-3 py-2.5 font-medium">Record</th><th className="px-3 py-2.5 font-medium">Product</th><th className="px-3 py-2.5 font-medium">Next due</th>{can('manager') && <th className="px-3 py-2.5 text-right font-medium">Cost</th>}<th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {filtered.slice(0, 500).map((r) => (
                    <tr key={r.id} className="hover:bg-stone-50">
                      <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5"><Link href={`/livestock/view?id=${r.animalId}&tab=health`} className="font-medium text-stone-900 hover:text-brand-700">{r.animalTag}</Link></td>
                      <td className="px-3 py-2.5"><span className="text-stone-800">{r.title}</span> <Badge tone={healthType(r.type).tone} className="ml-1">{healthType(r.type).label}</Badge></td>
                      <td className="px-3 py-2.5 text-stone-600">{r.product || '—'}</td>
                      <td className="px-3 py-2.5 text-stone-600">{r.nextDueDate ? fmtDate(r.nextDueDate) : '—'}</td>
                      {can('manager') && <td className="px-3 py-2.5 text-right text-stone-600 tabular">{r.cost ? fmtMoney(r.cost, currency) : '—'}</td>}
                      <td className="px-3 py-2.5">{can('worker') && (
                        <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                          <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'record', record: r })}>Edit</MenuItem>
                          <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: 'Delete this record?', confirmLabel: 'Delete', danger: true })) del.mutate(`/api/health/${r.id}`) }}>Delete</MenuItem>
                        </Menu>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {sheet?.kind === 'record' && <HealthSheet open onClose={() => setSheet(null)} record={sheet.record} animalId={sheet.animalId} />}
      {sheet?.kind === 'group' && <GroupPicker onClose={() => setSheet(null)} onPicked={(ids) => setSheet({ kind: 'bulk', ids })} />}
      {sheet?.kind === 'bulk' && <HealthSheet open onClose={() => setSheet(null)} animalIds={sheet.ids} />}
    </div>
  )
}

/** Choose a group of animals by species, class and location, then treat them all at once. */
function GroupPicker({ onClose, onPicked }: { onClose: () => void; onPicked: (ids: number[]) => void }) {
  const { data: animals = [] } = useAnimals('active')
  const [species, setSpecies] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const inSpecies = animals.filter((a) => !species || a.species === species)
  const categories = [...new Set(inSpecies.map((a) => a.category))]
  const locations = [...new Set(inSpecies.map((a) => a.parcelName || a.structureName).filter(Boolean) as string[])].sort()
  const picked = inSpecies.filter((a) => (!category || a.category === category) && (!location || a.parcelName === location || a.structureName === location))
  return (
    <Sheet open onClose={onClose} title="Treat a group" description="Pick which animals to record the treatment for."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!picked.length} onClick={() => onPicked(picked.map((a) => a.id))}>Continue with {picked.length}</Button></>}>
      <div className="space-y-4">
        <SelectField label="Species" value={species} onChange={(e) => { setSpecies(e.target.value); setCategory('') }} placeholder="All species"
          options={SPECIES.filter((s) => animals.some((a) => a.species === s.value)).map((s) => ({ value: s.value, label: s.plural }))} />
        <SelectField label="Class" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All classes" options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c }))} />
        <SelectField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Anywhere" options={locations.map((l) => ({ value: l, label: l }))} />
        <Field label={`${picked.length} animals selected`}>
          <div className="max-h-56 overflow-y-auto rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 ring-1 ring-stone-200">
            {picked.map((a) => a.managementTag || a.tagNo).join(', ') || 'None'}
          </div>
        </Field>
      </div>
    </Sheet>
  )
}

export default function HealthPage() {
  return <Suspense><HealthInner /></Suspense>
}
