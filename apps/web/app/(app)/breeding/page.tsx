'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Baby, ClipboardList, Landmark, MoreHorizontal, Pencil, Plus, ScanLine, Scissors, Sprout, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Select } from '@/components/ui/form'
import { Menu, MenuItem, Tabs, useConfirm } from '@/components/ui/overlay'
import { BirthSheet, BreedingSheet, ScanSheet } from '@/components/forms/livestock-forms'
import { api, useAnimals, useBirths, useBreeding, useSave } from '@/lib/queries'
import { BIRTH_EASE } from '@/lib/constants'
import { cullCandidates } from '@/lib/cull'
import { addDaysISO, fmtAge, fmtDate, fmtDue, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { BirthRecord, BreedingRecord } from '@/lib/types'

type Tab = 'due' | 'records' | 'births' | 'cull'

/** Scottish rules: tag a beef calf within 20 days of birth and register the birth within 27 (Traceability page). */
const TAG_DAYS = 20
const REGISTER_DAYS = 27

type SheetState = null
  | { kind: 'breeding'; record?: BreedingRecord }
  | { kind: 'birth'; record?: BirthRecord; damId?: number; sire?: { id: number | null; name: string | null } }
  | { kind: 'scan' }

function BreedingInner() {
  const { can, shows } = useSession()
  const params = useSearchParams()
  const router = useRouter()
  const tab = (params.get('tab') || 'due') as Tab
  const setTab = (t: Tab) => router.replace(`/breeding?tab=${t}`, { scroll: false })
  const { data: breeding, isLoading: l1 } = useBreeding()
  const { data: births, isLoading: l2 } = useBirths()
  const { data: animals } = useAnimals('active')
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<SheetState>(null)
  const years = useMemo(() => [...new Set((births || []).map((b) => b.date.slice(0, 4)))].sort().reverse(), [births])
  const [year, setYear] = useState<string>('')
  const yr = year || years[0] || String(new Date().getFullYear())
  const del = useSave((p: string) => api.del(p), { invalidate: ['breeding', 'births', 'animal', 'animals', 'families'], success: 'Deleted' })
  const notInCalf = useSave((b: BreedingRecord) => api.put(`/api/breeding/${b.id}`, {
    animalId: b.animalId, event: b.event, date: b.date, method: b.method, sireId: b.sireId, sireName: b.sireName,
    scanResult: b.scanResult, fetusCount: b.fetusCount, expectedDueDate: b.expectedDueDate, notes: b.notes, outcome: 'failed',
  }), { invalidate: ['breeding', 'animal', 'dashboard'], success: 'Marked not in calf' })
  const cullTask = useSave((tags: string[]) => api.post('/api/tasks', {
    title: `Decide on cull cows: ${tags.slice(0, 8).join(', ')}${tags.length > 8 ? ` and ${tags.length - 8} more` : ''}`,
    description: `From the cull list on the Breeding page: ${tags.join(', ')}`, category: 'livestock',
  }), { invalidate: ['tasks', 'dashboard'], success: 'Task added' })

  const today = todayISO()
  const cull = useMemo(() => animals && births && breeding ? cullCandidates(animals, births, breeding, today) : [], [animals, births, breeding, today])

  if (l1 || l2 || !breeding || !births) return <PageSkeleton />

  const pending = breeding.filter((b) => b.outcome === 'pending' && b.event !== 'heat' && b.animalStatus === 'active' && b.scanResult !== 'empty')
  // One row per female: her most recent pending record
  const byAnimal = new Map<number, BreedingRecord>()
  for (const b of pending) if (!byAnimal.has(b.animalId)) byAnimal.set(b.animalId, b)
  const due = [...byAnimal.values()].sort((a, b) => (a.expectedDueDate || '9999').localeCompare(b.expectedDueDate || '9999'))
  const overdue = due.filter((d) => d.expectedDueDate && d.expectedDueDate < today)
  const fortnight = due.filter((d) => d.expectedDueDate && d.expectedDueDate >= today && d.expectedDueDate <= addDaysISO(today, 14))
  const awaitingScan = due.filter((d) => d.event === 'service').length

  // Calving list in groups: past due, this week, next week, then by month
  const groups: { key: string; title: string; tone?: 'amber'; rows: BreedingRecord[] }[] = []
  const push = (key: string, title: string, r: BreedingRecord, tone?: 'amber') => {
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, title, tone, rows: [] }; groups.push(g) }
    g.rows.push(r)
  }
  for (const d of due) {
    const dd = d.expectedDueDate
    if (!dd) push('none', 'No due date', d)
    else if (dd < today) push('late', 'Past due date', d, 'amber')
    else if (dd <= addDaysISO(today, 7)) push('week', 'Due this week', d)
    else if (dd <= addDaysISO(today, 14)) push('next', 'Due next week', d)
    else push(dd.slice(0, 7), fmtDate(dd, 'MMMM yyyy'), d)
  }

  // Calves born in the last 27 days: their ScotEID tagging and registration deadlines
  const recentCalves = births.filter((b) => b.outcome === 'alive' && b.date >= addDaysISO(today, -REGISTER_DAYS)).sort((a, b) => a.date.localeCompare(b.date))

  const yearBirths = births.filter((b) => b.date.startsWith(yr))
  const alive = yearBirths.filter((b) => b.outcome === 'alive').length
  const easeKnown = yearBirths.filter((b) => b.ease)
  const assisted = easeKnown.filter((b) => b.ease !== 'unassisted').length
  const months = Array.from({ length: 12 }, (_, i) => ({ m: new Date(2000, i, 1).toLocaleString('en-GB', { month: 'short' }), alive: 0, lost: 0 }))
  for (const b of yearBirths) { const i = Number(b.date.slice(5, 7)) - 1; b.outcome === 'alive' ? months[i].alive++ : months[i].lost++ }

  const askDelete = async (path: string) => { if (await confirm({ title: 'Delete this record?', confirmLabel: 'Delete', danger: true })) del.mutate(path) }
  const calved = (d: BreedingRecord) => setSheet({ kind: 'birth', damId: d.animalId, sire: { id: d.sireId, name: d.sireName } })

  return (
    <div className="space-y-6">
      <PageHeader title="Breeding" description="Calving, scans, services and births."
        actions={can('worker') && <>
          <Button variant="secondary" onClick={() => setSheet({ kind: 'scan' })}><ScanLine />Scan results</Button>
          <Button variant="secondary" onClick={() => setSheet({ kind: 'breeding' })}><Sprout />Service</Button>
          <Button onClick={() => setSheet({ kind: 'birth' })}><Baby />Record birth</Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="In calf / served" value={due.length} icon={Sprout}
          sub={overdue.length ? `${overdue.length} past due date` : awaitingScan ? `${awaitingScan} not scanned yet` : 'All scanned'} />
        <StatCard label="Due in 14 days" value={fortnight.length} icon={Baby} tone="wheat"
          sub={fortnight.length ? `First ${fmtDate(fortnight[0].expectedDueDate)}` : due[0]?.expectedDueDate ? `Next ${fmtDate(due[0].expectedDueDate)}` : 'None due'} />
        <StatCard label={`Born alive in ${yr}`} value={alive} tone="sky" sub={`${yearBirths.length - alive} lost`} />
        <StatCard label="Assisted births" value={easeKnown.length ? `${fmtNum((assisted / easeKnown.length) * 100)}%` : '—'} tone="stone"
          sub={easeKnown.length ? `${assisted} of ${easeKnown.length} with ease recorded` : 'Calving ease not recorded'} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'due', label: 'Calving', count: due.length },
        { value: 'births', label: 'Births', count: births.length },
        { value: 'records', label: 'Services & scans', count: breeding.length },
        { value: 'cull', label: 'Cull list', count: cull.length },
      ]} />

      {tab === 'due' && (
        <div className="space-y-6">
          {recentCalves.length > 0 && shows('traceability') && (
            <Card>
              <CardHeader title="New calves: tag and register" icon={Landmark}
                description={`Tag within ${TAG_DAYS} days of birth and register with ScotEID within ${REGISTER_DAYS}.`}
                action={<Link href="/traceability" className="text-xs font-medium text-brand-700 hover:underline">Traceability</Link>} />
              <ul className="mt-3 divide-y divide-stone-100">
                {recentCalves.map((b) => {
                  const tagBy = addDaysISO(b.date, TAG_DAYS), regBy = addDaysISO(b.date, REGISTER_DAYS)
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        {b.offspringId ? <Link href={`/livestock/view?id=${b.offspringId}`} className="font-semibold text-stone-900 hover:text-brand-700">{b.offspringTag}</Link> : <span className="font-semibold text-stone-900">Calf of {b.damTag}</span>}
                        <span className="ml-2 text-xs text-stone-500">born {fmtDate(b.date)} to {b.damTag}</span>
                      </span>
                      <span className={cn('text-xs', tagBy < today ? 'font-medium text-clay-700' : 'text-stone-600')}>Tag by {fmtDate(tagBy, 'd MMM')}</span>
                      <span className={cn('text-xs', regBy <= addDaysISO(today, 3) ? 'font-medium text-amber-700' : 'text-stone-600')}>Register by {fmtDate(regBy, 'd MMM')} ({fmtDue(regBy)})</span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          {due.length === 0 ? (
            <Card><EmptyState icon={Sprout} title="No cows in calf recorded" description="Record services, or add scan results after the scanner’s visit, to build the calving list." /></Card>
          ) : groups.map((g) => (
            <Card key={g.key}>
              <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 px-5 py-3">
                <h2 className={cn('text-sm font-semibold', g.tone === 'amber' ? 'text-amber-800' : 'text-stone-900')}>{g.title}</h2>
                <span className="text-xs text-stone-500">{g.rows.length} {g.rows.length === 1 ? 'cow' : 'cows'}</span>
              </div>
              <ul className="divide-y divide-stone-100">
                {g.rows.map((d) => {
                  const late = !!d.expectedDueDate && d.expectedDueDate < today
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50/60">
                      <div className="min-w-0 flex-1">
                        <Link href={`/livestock/view?id=${d.animalId}&tab=breeding`} className="font-semibold text-stone-900 hover:text-brand-700">{d.animalTag}</Link>
                        <p className="truncate text-xs text-stone-500">
                          {d.event === 'scan' ? `Scanned ${d.scanResult === 'pregnant' ? `in calf${d.fetusCount && d.fetusCount > 1 ? ` (${d.fetusCount})` : ''}` : d.scanResult}` : 'Served'} {fmtDate(d.date)}
                          {(d.sireTag || d.sireName) && ` · ${d.sireTag || d.sireName}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {d.expectedDueDate ? <>
                          <p className={cn('text-sm font-medium', late ? 'text-amber-700' : 'text-stone-800')}>{fmtDate(d.expectedDueDate, 'd MMM')}</p>
                          <p className="text-xs text-stone-400">{fmtDue(d.expectedDueDate)}</p>
                        </> : <span className="text-sm text-stone-400">—</span>}
                      </div>
                      {can('worker') && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" onClick={() => calved(d)}><Baby />Calved</Button>
                          <Menu trigger={<button className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100" aria-label={`More for ${d.animalTag}`}><MoreHorizontal className="size-4" /></button>}>
                            <MenuItem icon={XCircle} onClick={() => notInCalf.mutate(d)}>Not in calf</MenuItem>
                            <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'breeding', record: d })}>Edit</MenuItem>
                          </Menu>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tab === 'cull' && (
        <Card>
          <CardHeader title="Cows to consider culling" icon={Scissors}
            description="Scanned empty, long gaps between calves, no calf lately, older cows, lost or hard calvings, and notes that say farrow or cull. A suggestion list, nothing changes until you sell or mark them."
            action={can('worker') && cull.length > 0 && <Button size="sm" variant="secondary" loading={cullTask.isPending} onClick={() => cullTask.mutate(cull.map((c) => c.tag))}><ClipboardList />Make a task</Button>} />
          {cull.length === 0 ? <EmptyState icon={Scissors} title="Nobody on the cull list" description="No cows have a reason to be looked at right now." className="py-10" /> : (
            <ul className="mt-3 divide-y divide-stone-100">
              {cull.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3">
                  <div className="w-28 shrink-0">
                    <Link href={`/livestock/view?id=${c.id}&tab=breeding`} className="font-semibold text-stone-900 hover:text-brand-700">{c.tag}</Link>
                    <p className="text-xs text-stone-500">{fmtAge(c.ageMonths)}{c.breed ? ` · ${c.breed}` : ''}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {c.reasons.map((r) => <Badge key={r.text} tone={r.weight >= 3 ? 'red' : r.weight === 2 ? 'amber' : 'gray'}>{r.text}</Badge>)}
                  </div>
                  <div className="shrink-0 text-right text-xs text-stone-500">
                    <p>{c.calves} calves{c.lastCalved ? ` · last ${fmtDate(c.lastCalved, 'MMM yyyy')}` : ''}</p>
                    {c.dueDate && <p className="font-medium text-emerald-700">In calf, due {fmtDate(c.dueDate, 'd MMM')}</p>}
                  </div>
                </li>
              ))}
            </ul>
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
      {sheet?.kind === 'birth' && <BirthSheet open onClose={() => setSheet(null)} record={sheet.record} damId={sheet.damId} sire={sheet.sire} />}
      {sheet?.kind === 'scan' && <ScanSheet open onClose={() => setSheet(null)} breeding={breeding} />}
    </div>
  )
}

export default function BreedingPage() {
  return <Suspense><BreedingInner /></Suspense>
}
