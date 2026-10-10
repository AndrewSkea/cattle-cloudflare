'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Baby, MoreHorizontal, Pencil, Plus, Sprout, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Select } from '@/components/ui/form'
import { Menu, MenuItem, Tabs, useConfirm } from '@/components/ui/overlay'
import { BirthSheet, BreedingSheet } from '@/components/forms/livestock-forms'
import { api, useBirths, useBreeding, useSave } from '@/lib/queries'
import { BIRTH_EASE } from '@/lib/constants'
import { fmtDate, fmtDue, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { BirthRecord, BreedingRecord } from '@/lib/types'

type Tab = 'due' | 'records' | 'births'

function BreedingInner() {
  const { can } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const tab = (params.get('tab') || 'due') as Tab
  const setTab = (t: Tab) => router.replace(`/breeding?tab=${t}`, { scroll: false })
  const { data: breeding, isLoading: l1 } = useBreeding()
  const { data: births, isLoading: l2 } = useBirths()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<null | { kind: 'breeding'; record?: BreedingRecord } | { kind: 'birth'; record?: BirthRecord; damId?: number }>(null)
  const years = useMemo(() => [...new Set((births || []).map((b) => b.date.slice(0, 4)))].sort().reverse(), [births])
  const [year, setYear] = useState<string>('')
  const yr = year || years[0] || String(new Date().getFullYear())
  const del = useSave((p: string) => api.del(p), { invalidate: ['breeding', 'births', 'animal', 'animals', 'families'], success: 'Deleted' })
  const notInCalf = useSave((b: BreedingRecord) => api.put(`/api/breeding/${b.id}`, {
    animalId: b.animalId, event: b.event, date: b.date, method: b.method, sireId: b.sireId, sireName: b.sireName,
    scanResult: b.scanResult, fetusCount: b.fetusCount, expectedDueDate: b.expectedDueDate, notes: b.notes, outcome: 'failed',
  }), { invalidate: ['breeding', 'animal'], success: 'Marked not in calf' })

  if (l1 || l2 || !breeding || !births) return <PageSkeleton />

  const pending = breeding.filter((b) => b.outcome === 'pending' && b.event !== 'heat' && b.animalStatus === 'active' && b.scanResult !== 'empty')
  // One row per female: her most recent pending record
  const byAnimal = new Map<number, BreedingRecord>()
  for (const b of pending) if (!byAnimal.has(b.animalId)) byAnimal.set(b.animalId, b)
  const due = [...byAnimal.values()].sort((a, b) => (a.expectedDueDate || '9999').localeCompare(b.expectedDueDate || '9999'))
  const overdue = due.filter((d) => d.expectedDueDate && d.expectedDueDate < todayISO())

  const yearBirths = births.filter((b) => b.date.startsWith(yr))
  const alive = yearBirths.filter((b) => b.outcome === 'alive').length
  const assisted = yearBirths.filter((b) => b.ease && b.ease !== 'unassisted').length
  const months = Array.from({ length: 12 }, (_, i) => ({ m: new Date(2000, i, 1).toLocaleString('en-GB', { month: 'short' }), alive: 0, lost: 0 }))
  for (const b of yearBirths) { const i = Number(b.date.slice(5, 7)) - 1; b.outcome === 'alive' ? months[i].alive++ : months[i].lost++ }

  const askDelete = async (path: string) => { if (await confirm({ title: 'Delete this record?', confirmLabel: 'Delete', danger: true })) del.mutate(path) }

  return (
    <div className="space-y-6">
      <PageHeader title="Breeding" description="Services, scans, due dates and births."
        actions={can('worker') && <>
          <Button variant="secondary" onClick={() => setSheet({ kind: 'breeding' })}><Sprout />Service / scan</Button>
          <Button onClick={() => setSheet({ kind: 'birth' })}><Baby />Record birth</Button>
        </>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Due or pregnant" value={due.length} icon={Sprout} sub={overdue.length ? `${overdue.length} past due date` : 'All on schedule'} />
        <StatCard label={`Born alive in ${yr}`} value={alive} icon={Baby} tone="wheat" sub={`${yearBirths.length - alive} lost`} />
        <StatCard label="Assisted births" value={yearBirths.length ? `${fmtNum((assisted / yearBirths.length) * 100)}%` : '—'} tone="sky" sub={`${assisted} of ${yearBirths.length}`} />
        <StatCard label="Twins & multiples" value={(() => { const m = new Map<string, number>(); for (const b of yearBirths) m.set(`${b.damId}${b.date}`, (m.get(`${b.damId}${b.date}`) || 0) + 1); return [...m.values()].filter((v) => v > 1).length })()} tone="stone" sub={yr} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'due', label: 'Due & pregnant', count: due.length },
        { value: 'births', label: 'Births', count: births.length },
        { value: 'records', label: 'Services & scans', count: breeding.length },
      ]} />

      {tab === 'due' && (
        <Card>
          {due.length === 0 ? <EmptyState icon={Sprout} title="Nothing due" description="Record services or scans to track due dates." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Female</th><th className="px-3 py-2.5 font-medium">Last event</th><th className="px-3 py-2.5 font-medium">Sire</th><th className="px-3 py-2.5 font-medium">Due</th><th className="px-3 py-2.5" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {due.map((d) => {
                    const late = d.expectedDueDate && d.expectedDueDate < todayISO()
                    return (
                      <tr key={d.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3"><Link href={`/livestock/view?id=${d.animalId}&tab=breeding`} className="font-semibold text-stone-900 hover:text-brand-700">{d.animalTag}</Link></td>
                        <td className="px-3 py-3 text-stone-600">{d.event === 'scan' ? `Scanned ${d.scanResult}` : 'Served'} {fmtDate(d.date)}</td>
                        <td className="px-3 py-3 text-stone-600">{d.sireTag || d.sireName || '—'}</td>
                        <td className="px-3 py-3">{d.expectedDueDate ? <><span className={cn('font-medium', late ? 'text-amber-700' : 'text-stone-800')}>{fmtDate(d.expectedDueDate)}</span><span className="ml-2 text-xs text-stone-400">{fmtDue(d.expectedDueDate)}</span></> : '—'}</td>
                        <td className="px-3 py-3 text-right">
                          {can('worker') && <div className="flex justify-end gap-1">
                            <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'birth', damId: d.animalId })}>Born</Button>
                            <Button size="sm" variant="ghost" onClick={() => notInCalf.mutate(d)}>Not in calf</Button>
                            <Button size="sm" variant="ghost" onClick={() => setSheet({ kind: 'breeding', record: d })}>Edit</Button>
                          </div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'births' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Birth spread" description="Births by month" action={years.length > 1 && <Select value={yr} onChange={(e) => setYear(e.target.value)} className="w-28" aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</Select>} />
            <div className="h-56 px-3 pb-3 pt-4">
              <ResponsiveContainer>
                <BarChart data={months} margin={{ left: -24, right: 8 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f5f5f4' }} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }} />
                  <Bar dataKey="alive" name="Born alive" stackId="a" fill="#3f7d5c" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="lost" name="Lost" stackId="a" fill="#d6755b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            {births.length === 0 ? <EmptyState icon={Baby} title="No births recorded" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Mother</th><th className="px-3 py-2.5 font-medium">Offspring</th><th className="px-3 py-2.5 font-medium">Sire</th><th className="px-3 py-2.5 font-medium">Ease</th><th className="w-10" /></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {births.map((b) => (
                      <tr key={b.id} className="hover:bg-stone-50">
                        <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">{fmtDate(b.date)}</td>
                        <td className="px-3 py-2.5"><Link href={`/livestock/view?id=${b.damId}&tab=breeding`} className="font-medium text-stone-900 hover:text-brand-700">{b.damTag}</Link></td>
                        <td className="px-3 py-2.5">
                          {b.offspringId ? <Link href={`/livestock/view?id=${b.offspringId}`} className="text-brand-700 hover:underline">{b.offspringTag}</Link> : <span className="text-stone-400">—</span>}
                          <span className="ml-2 text-xs text-stone-400">{b.sex}</span>
                          {b.outcome !== 'alive' && <Badge tone="red" className="ml-2">{b.outcome}</Badge>}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600">{b.sireTag || b.sireName || '—'}</td>
                        <td className="px-3 py-2.5 text-stone-600">{BIRTH_EASE.find((e) => e.value === b.ease)?.label || '—'}</td>
                        <td className="px-3 py-2.5">{can('worker') && (
                          <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                            <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'birth', record: b })}>Edit</MenuItem>
                            <MenuItem icon={Trash2} danger onClick={() => askDelete(`/api/births/${b.id}`)}>Delete</MenuItem>
                          </Menu>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'records' && (
        <Card>
          {breeding.length === 0 ? <EmptyState icon={Sprout} title="No services or scans yet" action={can('worker') && <Button onClick={() => setSheet({ kind: 'breeding' })}><Plus />Add</Button>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Female</th><th className="px-3 py-2.5 font-medium">Event</th><th className="px-3 py-2.5 font-medium">Sire</th><th className="px-3 py-2.5 font-medium">Due</th><th className="px-3 py-2.5 font-medium">Outcome</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {breeding.map((b) => (
                    <tr key={b.id} className="hover:bg-stone-50">
                      <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">{fmtDate(b.date)}</td>
                      <td className="px-3 py-2.5"><Link href={`/livestock/view?id=${b.animalId}&tab=breeding`} className="font-medium text-stone-900 hover:text-brand-700">{b.animalTag}</Link></td>
                      <td className="px-3 py-2.5 text-stone-700">{b.event === 'service' ? (b.method === 'ai' ? 'AI' : 'Service') : b.event === 'scan' ? `Scan: ${b.scanResult}` : 'Heat'}</td>
                      <td className="px-3 py-2.5 text-stone-600">{b.sireTag || b.sireName || '—'}</td>
                      <td className="px-3 py-2.5 text-stone-600">{b.expectedDueDate ? fmtDate(b.expectedDueDate) : '—'}</td>
                      <td className="px-3 py-2.5">{b.event === 'heat' ? '—' : <Badge tone={b.outcome === 'born' ? 'green' : b.outcome === 'pending' ? (b.overdue ? 'amber' : 'blue') : 'red'}>{b.overdue ? 'Overdue' : b.outcome}</Badge>}</td>
                      <td className="px-3 py-2.5">{can('worker') && (
                        <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                          <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'breeding', record: b })}>Edit</MenuItem>
                          <MenuItem icon={Trash2} danger onClick={() => askDelete(`/api/breeding/${b.id}`)}>Delete</MenuItem>
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

      {sheet?.kind === 'breeding' && <BreedingSheet open onClose={() => setSheet(null)} record={sheet.record} />}
      {sheet?.kind === 'birth' && <BirthSheet open onClose={() => setSheet(null)} record={sheet.record} damId={sheet.damId} />}
    </div>
  )
}

export default function BreedingPage() {
  return <Suspense><BreedingInner /></Suspense>
}
