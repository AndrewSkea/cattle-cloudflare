'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowLeft, Baby, ChevronDown, HeartPulse, LogOut, MapPin, MoreHorizontal, Pencil, Plus, RotateCcw, Scale, ShieldAlert, Sprout, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, DescriptionList, EmptyState, PageSkeleton } from '@/components/ui/display'
import { Menu, MenuDivider, MenuItem, Tabs, useConfirm } from '@/components/ui/overlay'
import { AnimalSheet, BirthSheet, BreedingSheet, ExitSheet, HealthSheet, WeightSheet } from '@/components/forms/livestock-forms'
import { FamilyView } from '@/components/family'
import { api, useSave } from '@/lib/queries'
import { getData } from '@/lib/api'
import { BIRTH_EASE, STATUS_META, categorySingular, categoryLabel, healthType, speciesInfo } from '@/lib/constants'
import { animalLabel, fmtAge, fmtDate, fmtDue, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { AnimalDetail, BirthRecord, BreedingRecord, FamilyReport, HealthRecord, Movement, Transaction, WeightRecord } from '@/lib/types'

interface Records { health: HealthRecord[]; weights: WeightRecord[]; breeding: BreedingRecord[]; births: BirthRecord[]; movements: Movement[]; transactions: Transaction[] | null }
type TabKey = 'overview' | 'family' | 'health' | 'weights' | 'breeding' | 'movements' | 'money'
type SheetState =
  | null | { kind: 'edit' } | { kind: 'exit' } | { kind: 'health'; record?: HealthRecord } | { kind: 'weight'; record?: WeightRecord }
  | { kind: 'breeding'; record?: BreedingRecord } | { kind: 'birth'; record?: BirthRecord }

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Row actions"><MoreHorizontal className="size-4" /></button>}>
      <MenuItem icon={Pencil} onClick={onEdit}>Edit</MenuItem>
      <MenuItem icon={Trash2} danger onClick={onDelete}>Delete</MenuItem>
    </Menu>
  )
}

function AnimalView() {
  const params = useSearchParams()
  const router = useRouter()
  const id = Number(params.get('id'))
  const tab = (params.get('tab') || 'overview') as TabKey
  const setTab = (t: TabKey) => router.replace(`/livestock/view?id=${id}&tab=${t}`, { scroll: false })
  const { can, currency } = useSession()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<SheetState>(null)

  const animal = useQuery({ queryKey: ['animal', id], queryFn: () => getData<AnimalDetail>(`/api/animals/${id}`), enabled: id > 0 })
  const records = useQuery({ queryKey: ['animal', id, 'records'], queryFn: () => getData<Records>(`/api/animals/${id}/records`), enabled: id > 0 })
  const family = useQuery({ queryKey: ['families', 'animal', id], queryFn: () => getData<FamilyReport>(`/api/animals/${id}/family`), enabled: id > 0 && tab === 'family' })

  const inv = ['animal', 'animals', 'health', 'weights', 'breeding', 'births', 'families', 'finance']
  const del = useSave((path: string) => api.del(path), { invalidate: inv, success: 'Deleted' })
  const reinstate = useSave(() => api.post(`/api/animals/${id}/reinstate`), { invalidate: inv, success: 'Returned to the herd' })
  const removeAnimal = useSave(() => api.del(`/api/animals/${id}`), { invalidate: inv, success: 'Animal deleted', onSuccess: () => router.push('/livestock') })

  if (animal.isError) return <EmptyState title="Animal not found" description="It may have been deleted." action={<Link href="/livestock" className="text-sm font-medium text-brand-700">Back to animals</Link>} />
  if (!animal.data) return <PageSkeleton />
  const a = animal.data
  const r = records.data
  const isFemale = a.sex === 'female'
  const sp = speciesInfo(a.species)
  const latestWeight = r?.weights[0]
  const withdrawal = r?.health.map((h) => h.withdrawalMeatUntil).filter((d): d is string => !!d && d >= todayISO()).sort().pop()
  const pendingPreg = r?.breeding.find((b) => b.outcome === 'pending' && b.event !== 'heat' && (b.event === 'service' || b.scanResult === 'pregnant'))

  const askDelete = async (path: string, what: string) => {
    if (await confirm({ title: `Delete this ${what}?`, description: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) del.mutate(path)
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/livestock" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" />Animals</Link>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className={cn('grid size-16 shrink-0 place-items-center rounded-2xl text-3xl ring-1', isFemale ? 'bg-violet-50 ring-violet-100' : 'bg-sky-50 ring-sky-100')}>{sp.emoji}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{a.managementTag || a.tagNo}</h1>
                {a.name && <span className="font-display text-2xl text-stone-400">{a.name}</span>}
              </div>
              <p className="mt-0.5 text-sm text-stone-500">{a.managementTag ? `${a.tagNo} · ` : ''}{sp.label}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={isFemale ? 'violet' : 'blue'}>{categorySingular(a.category)}</Badge>
                <Badge tone={STATUS_META[a.status].tone} dot>{STATUS_META[a.status].label}{a.exitDate ? ` ${fmtDate(a.exitDate)}` : ''}</Badge>
                {a.castrated && <Badge>Castrated</Badge>}
                {withdrawal && <Badge tone="amber"><ShieldAlert className="size-3" />Withdrawal until {fmtDate(withdrawal)}</Badge>}
                {pendingPreg?.expectedDueDate && a.status === 'active' && (pendingPreg.expectedDueDate < todayISO()
                  ? <Badge tone="amber"><Sprout className="size-3" />Overdue since {fmtDate(pendingPreg.expectedDueDate)}</Badge>
                  : <Badge tone="green"><Sprout className="size-3" />Due {fmtDue(pendingPreg.expectedDueDate)}</Badge>)}
              </div>
            </div>
          </div>
          {can('worker') && (
            <div className="flex flex-wrap gap-2">
              <Menu trigger={<Button><Plus />Record<ChevronDown className="opacity-70" /></Button>}>
                <MenuItem icon={HeartPulse} onClick={() => setSheet({ kind: 'health' })}>Health / vaccination</MenuItem>
                <MenuItem icon={Scale} onClick={() => setSheet({ kind: 'weight' })}>Weight</MenuItem>
                {isFemale && <MenuItem icon={Sprout} onClick={() => setSheet({ kind: 'breeding' })}>Service / scan</MenuItem>}
                {isFemale && <MenuItem icon={Baby} onClick={() => setSheet({ kind: 'birth' })}>Birth</MenuItem>}
              </Menu>
              <Button variant="secondary" onClick={() => setSheet({ kind: 'edit' })}><Pencil />Edit</Button>
              <Menu trigger={<Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontal /></Button>}>
                {a.status === 'active'
                  ? <MenuItem icon={LogOut} onClick={() => setSheet({ kind: 'exit' })}>Record sale or death</MenuItem>
                  : <MenuItem icon={RotateCcw} onClick={() => reinstate.mutate(undefined)}>Return to herd</MenuItem>}
                {can('manager') && <><MenuDivider /><MenuItem icon={Trash2} danger onClick={async () => {
                  if (await confirm({ title: `Delete ${animalLabel(a)}?`, description: 'All of its health, weight, breeding and movement records will be deleted. Offspring keep their records but lose this parent link. To record a sale or death, use "Record sale or death" instead.', confirmLabel: 'Delete permanently', danger: true })) removeAnimal.mutate(undefined)
                }}>Delete animal</MenuItem></>}
              </Menu>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-stone-100 bg-stone-100 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Age', fmtAge(a.ageMonths)],
            ['Born', a.dob ? fmtDate(a.dob) : a.birthYear ? String(a.birthYear) : '—'],
            ['Breed', a.breed || '—'],
            ['Dam', a.dam ? <Link key="d" href={`/livestock/view?id=${a.dam.id}`} className="text-brand-700 hover:underline">{animalLabel(a.dam)}</Link> : '—'],
            ['Sire', a.sire ? <Link key="s" href={`/livestock/view?id=${a.sire.id}`} className="text-brand-700 hover:underline">{animalLabel(a.sire)}</Link> : a.sireName || '—'],
            ['Location', a.parcel || a.structure ? <span key="l" className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-stone-400" />{[a.parcel?.name, a.structure?.name].filter(Boolean).join(' · ')}</span> : '—'],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-white px-5 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{k}</p>
              <p className="mt-0.5 truncate text-sm font-medium text-stone-900">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Overview' },
        { value: 'family', label: 'Family', count: a.offspringCount || null },
        { value: 'health', label: 'Health', count: r?.health.length ?? null },
        { value: 'weights', label: 'Weights', count: r?.weights.length ?? null },
        { value: 'breeding', label: 'Breeding', count: r ? r.breeding.length + r.births.length : null, hidden: !isFemale },
        { value: 'movements', label: 'Movements', count: r?.movements.length ?? null },
        { value: 'money', label: 'Money', hidden: !can('manager') },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Details" />
              <div className="p-5">
                <DescriptionList items={[
                  { label: 'Official tag', value: a.tagNo },
                  { label: 'Management tag', value: a.tagHistory.length
                    ? <>{a.managementTag || '—'}<span className="block text-xs font-normal text-stone-500">Previously {a.tagHistory.map((h) => `${h.previousTag} (until ${fmtDate(h.changedOn)})`).join(', ')}</span></>
                    : a.managementTag },
                  { label: 'Sex', value: `${a.sex === 'female' ? 'Female' : 'Male'}${a.castrated ? ' (castrated)' : ''}` },
                  { label: 'Colour', value: a.colour },
                  { label: 'Frame size', value: a.size, hidden: a.species !== 'cattle' },
                  { label: 'Origin', value: a.origin === 'purchased' ? `Bought ${fmtDate(a.purchaseDate)}${a.purchaseSource ? ` from ${a.purchaseSource}` : ''}` : 'Born on farm' },
                  { label: 'Purchase price', value: fmtMoney(a.purchasePrice, currency), hidden: !a.purchasePrice },
                  { label: 'Births', value: a.birthCount, hidden: !isFemale },
                  { label: 'Exit', value: `${STATUS_META[a.status].label} ${fmtDate(a.exitDate)}${a.buyer ? ` to ${a.buyer}` : ''}`, hidden: a.status === 'active' },
                  { label: 'Sale', value: `${fmtMoney(a.salePrice, currency)}${a.saleWeightKg ? ` · ${fmtNum(a.saleWeightKg)} kg` : ''}`, hidden: !a.salePrice },
                  { label: 'Exit reason', value: a.exitReason, hidden: !a.exitReason },
                ]} />
                {a.notes && <div className="mt-5 rounded-xl bg-wheat-50 px-4 py-3 text-sm text-stone-700 ring-1 ring-wheat-200/70"><p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-wheat-700">Notes</p><p className="whitespace-pre-wrap">{a.notes}</p></div>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent history" />
              <Timeline r={r} />
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="p-5">
              <p className="text-[13px] font-medium text-stone-500">Latest weight</p>
              <p className="mt-1 font-display text-3xl font-semibold text-stone-900">{latestWeight ? `${fmtNum(latestWeight.weightKg)} kg` : '—'}</p>
              <p className="text-xs text-stone-400">{latestWeight ? fmtDate(latestWeight.date) : 'Not weighed yet'}</p>
              {r && r.weights.length > 1 && <WeightChart weights={r.weights} height={140} compact />}
              {can('worker') && <Button size="sm" variant="secondary" className="mt-4" onClick={() => setSheet({ kind: 'weight' })}><Scale />Record weight</Button>}
            </Card>
            {isFemale && r && (
              <Card className="p-5">
                <p className="text-[13px] font-medium text-stone-500">Breeding</p>
                <p className="mt-1 text-sm text-stone-800">{r.births.length} birth{r.births.length === 1 ? '' : 's'} recorded{r.births[0] ? `, last ${fmtDate(r.births[0].date)}` : ''}</p>
                {pendingPreg && <p className="mt-1 text-sm text-stone-800">{pendingPreg.event === 'scan' ? 'Scanned in calf' : 'Served'} {fmtDate(pendingPreg.date)}{pendingPreg.expectedDueDate && <> · due <strong>{fmtDate(pendingPreg.expectedDueDate)}</strong></>}</p>}
                <button onClick={() => setTab('breeding')} className="mt-3 text-sm font-medium text-brand-700 hover:underline">Breeding history →</button>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'family' && (family.data ? <FamilyView report={family.data} animalId={id} currency={currency} /> : <PageSkeleton />)}

      {tab === 'health' && r && (
        <Card>
          <CardHeader title="Health records" action={can('worker') && <Button size="sm" onClick={() => setSheet({ kind: 'health' })}><Plus />Add</Button>} />
          {r.health.length === 0 ? <EmptyState icon={HeartPulse} title="No health records" description="Vaccinations, treatments and tests will appear here." /> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500">
                  <tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Record</th><th className="px-3 py-2 font-medium">Product</th><th className="px-3 py-2 font-medium">Withdrawal</th><th className="px-3 py-2 font-medium">Next due</th>{can('manager') && <th className="px-3 py-2 text-right font-medium">Cost</th>}<th className="w-10" /></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {r.health.map((h) => (
                    <tr key={h.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-3 text-stone-600">{fmtDate(h.date)}</td>
                      <td className="px-3 py-3"><p className="font-medium text-stone-900">{h.title}</p><Badge tone={healthType(h.type).tone} className="mt-1">{healthType(h.type).label}</Badge>{h.result && <p className="mt-1 text-xs text-stone-500">Result: {h.result}</p>}{h.notes && <p className="mt-1 max-w-xs text-xs text-stone-500">{h.notes}</p>}</td>
                      <td className="px-3 py-3 text-stone-600">{h.product || '—'}{h.dose && <span className="block text-xs text-stone-400">{h.dose}{h.batchNo ? ` · batch ${h.batchNo}` : ''}</span>}</td>
                      <td className="px-3 py-3 text-xs text-stone-600">{h.withdrawalMeatUntil ? <span className={cn(h.withdrawalMeatUntil >= todayISO() && 'font-medium text-amber-700')}>Meat {fmtDate(h.withdrawalMeatUntil)}</span> : '—'}{h.withdrawalMilkUntil && <span className="block">Milk {fmtDate(h.withdrawalMilkUntil)}</span>}</td>
                      <td className="px-3 py-3 text-xs">{h.nextDueDate ? <span className={cn(h.nextDueDate < todayISO() ? 'font-medium text-clay-600' : 'text-stone-600')}>{fmtDate(h.nextDueDate)}<span className="block text-stone-400">{fmtDue(h.nextDueDate)}</span></span> : '—'}</td>
                      {can('manager') && <td className="px-3 py-3 text-right text-stone-600 tabular">{h.cost ? fmtMoney(h.cost, currency) : '—'}</td>}
                      <td className="px-3 py-3">{can('worker') && <RowActions onEdit={() => setSheet({ kind: 'health', record: h })} onDelete={() => askDelete(`/api/health/${h.id}`, 'health record')} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'weights' && r && (
        <Card>
          <CardHeader title="Weights" description={weightSummary(r.weights)} action={can('worker') && <Button size="sm" onClick={() => setSheet({ kind: 'weight' })}><Plus />Add</Button>} />
          {r.weights.length === 0 ? <EmptyState icon={Scale} title="No weights recorded" /> : (
            <>
              {r.weights.length > 1 && <div className="px-5 pt-4"><WeightChart weights={r.weights} height={260} /></div>}
              <table className="mt-3 w-full text-sm">
                <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 text-right font-medium">Weight</th><th className="px-3 py-2 text-right font-medium">Gain / day</th><th className="px-3 py-2 font-medium">BCS</th><th className="px-3 py-2 font-medium">Notes</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {r.weights.map((w, i) => {
                    const prev = r.weights[i + 1]
                    const days = prev ? (new Date(w.date).getTime() - new Date(prev.date).getTime()) / 86400000 : 0
                    const adg = prev && days > 0 ? (w.weightKg - prev.weightKg) / days : null
                    return (
                      <tr key={w.id}>
                        <td className="px-5 py-2.5 text-stone-600">{fmtDate(w.date)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-stone-900 tabular">{fmtNum(w.weightKg, 1)} kg</td>
                        <td className={cn('px-3 py-2.5 text-right tabular', adg == null ? 'text-stone-300' : adg >= 0 ? 'text-emerald-700' : 'text-clay-600')}>{adg == null ? '—' : `${adg >= 0 ? '+' : ''}${fmtNum(adg, 2)} kg`}</td>
                        <td className="px-3 py-2.5 text-stone-600">{w.conditionScore ?? '—'}</td>
                        <td className="px-3 py-2.5 text-stone-500">{w.notes}</td>
                        <td className="px-3 py-2.5">{can('worker') && <RowActions onEdit={() => setSheet({ kind: 'weight', record: w })} onDelete={() => askDelete(`/api/weights/${w.id}`, 'weight')} />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}

      {tab === 'breeding' && r && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Births" description={r.births.length ? `${r.births.length} recorded` : undefined} action={can('worker') && <Button size="sm" onClick={() => setSheet({ kind: 'birth' })}><Plus />Record birth</Button>} />
            {r.births.length === 0 ? <EmptyState icon={Baby} title="No births recorded" /> : (
              <table className="mt-3 w-full text-sm">
                <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Offspring</th><th className="px-3 py-2 font-medium">Sire</th><th className="px-3 py-2 font-medium">Ease</th><th className="px-3 py-2 font-medium">Interval</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {r.births.map((b, i) => {
                    const prev = r.births[i + 1]
                    const interval = prev ? Math.round((new Date(b.date).getTime() - new Date(prev.date).getTime()) / 86400000) : null
                    return (
                      <tr key={b.id}>
                        <td className="px-5 py-2.5 text-stone-600">{fmtDate(b.date)}</td>
                        <td className="px-3 py-2.5">
                          {b.offspringId ? <Link href={`/livestock/view?id=${b.offspringId}`} className="font-medium text-brand-700 hover:underline">{b.offspringTag}</Link> : <span className="text-stone-500">Not registered</span>}
                          <span className="ml-2 text-xs text-stone-400">{b.sex || ''}</span>
                          {b.outcome !== 'alive' && <Badge tone="red" className="ml-2">{b.outcome === 'stillborn' ? 'Stillborn' : 'Died'}</Badge>}
                          {b.notes && <p className="text-xs text-stone-400">{b.notes}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-stone-600">{b.sireTag || b.sireName || '—'}</td>
                        <td className="px-3 py-2.5 text-stone-600">{BIRTH_EASE.find((e) => e.value === b.ease)?.label || '—'}</td>
                        <td className="px-3 py-2.5 text-stone-600 tabular">{interval && interval > 200 ? `${interval} days` : '—'}</td>
                        <td className="px-3 py-2.5">{can('worker') && <RowActions onEdit={() => setSheet({ kind: 'birth', record: b })} onDelete={() => askDelete(`/api/births/${b.id}`, 'birth record')} />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>
          <Card>
            <CardHeader title="Services, scans & heats" action={can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'breeding' })}><Plus />Add</Button>} />
            {r.breeding.length === 0 ? <EmptyState icon={Sprout} title="No breeding records" /> : (
              <table className="mt-3 w-full text-sm">
                <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Event</th><th className="px-3 py-2 font-medium">Sire</th><th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 font-medium">Outcome</th><th className="w-10" /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {r.breeding.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 text-stone-600">{fmtDate(b.date)}</td>
                      <td className="px-3 py-2.5 text-stone-800">{b.event === 'service' ? (b.method === 'ai' ? 'AI' : b.method === 'et' ? 'Embryo transfer' : 'Service') : b.event === 'scan' ? `Scan: ${b.scanResult}${b.fetusCount ? ` (${b.fetusCount})` : ''}` : 'Heat'}</td>
                      <td className="px-3 py-2.5 text-stone-600">{b.sireTag || b.sireName || '—'}</td>
                      <td className="px-3 py-2.5 text-stone-600">{b.expectedDueDate ? fmtDate(b.expectedDueDate) : '—'}</td>
                      <td className="px-3 py-2.5">{b.event === 'heat' ? '—' : <Badge tone={b.outcome === 'born' ? 'green' : b.outcome === 'pending' ? (b.overdue || (b.expectedDueDate && b.expectedDueDate < todayISO()) ? 'amber' : 'blue') : 'red'}>{b.outcome === 'pending' && b.expectedDueDate && b.expectedDueDate < todayISO() ? 'Overdue' : b.outcome[0].toUpperCase() + b.outcome.slice(1)}</Badge>}</td>
                      <td className="px-3 py-2.5">{can('worker') && <RowActions onEdit={() => setSheet({ kind: 'breeding', record: b })} onDelete={() => askDelete(`/api/breeding/${b.id}`, 'breeding record')} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {tab === 'movements' && r && (
        <Card>
          <CardHeader title="Movement history" />
          {r.movements.length === 0 ? <EmptyState icon={MapPin} title="No moves recorded" description="Moves between fields and buildings appear here." /> : (
            <ul className="p-5">
              {r.movements.map((m, i) => (
                <li key={m.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < r.movements.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-stone-200" />}
                  <span className="relative mt-1 size-[15px] shrink-0 rounded-full border-[3px] border-white bg-brand-500 ring-1 ring-brand-200" />
                  <div className="flex-1">
                    <p className="text-sm text-stone-800">{m.fromParcelName ? <>{m.fromParcelName} → </> : null}<strong>{[m.toParcelName, m.toStructureName].filter(Boolean).join(' · ') || 'No location'}</strong></p>
                    <p className="text-xs text-stone-400">{fmtDate(m.date)}{m.notes ? ` · ${m.notes}` : ''}</p>
                  </div>
                  {can('worker') && <button onClick={() => askDelete(`/api/movements/${m.id}`, 'movement')} className="self-start rounded p-1 text-stone-300 hover:bg-stone-100 hover:text-clay-600" aria-label="Delete movement"><Trash2 className="size-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'money' && r?.transactions && (
        <Card>
          <CardHeader title="Money linked to this animal" description={r.transactions.length ? `Net ${fmtMoney(r.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0), currency)}` : undefined} />
          {r.transactions.length === 0 ? <EmptyState title="No transactions" description="Purchase, sale and vet costs for this animal show here automatically." /> : (
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {r.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-2.5 text-stone-600">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2.5 text-stone-800">{t.description || categoryLabel(t.category)}<span className="block text-xs text-stone-400">{categoryLabel(t.category)}</span></td>
                    <td className={cn('px-5 py-2.5 text-right font-medium tabular', t.type === 'income' ? 'text-emerald-700' : 'text-stone-800')}>{t.type === 'income' ? '+' : '−'}{fmtMoney(t.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {sheet?.kind === 'edit' && <AnimalSheet open onClose={() => setSheet(null)} animal={a} />}
      {sheet?.kind === 'exit' && <ExitSheet open onClose={() => setSheet(null)} animal={a} />}
      {sheet?.kind === 'health' && <HealthSheet open onClose={() => setSheet(null)} animalId={id} record={sheet.record} />}
      {sheet?.kind === 'weight' && <WeightSheet open onClose={() => setSheet(null)} animalId={id} record={sheet.record} />}
      {sheet?.kind === 'breeding' && <BreedingSheet open onClose={() => setSheet(null)} animalId={id} record={sheet.record} />}
      {sheet?.kind === 'birth' && <BirthSheet open onClose={() => setSheet(null)} damId={id} record={sheet.record} />}
    </div>
  )
}

function weightSummary(w: WeightRecord[]) {
  if (w.length < 2) return undefined
  const first = w[w.length - 1], last = w[0]
  const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000
  if (days <= 0) return undefined
  return `Average gain ${fmtNum((last.weightKg - first.weightKg) / days, 2)} kg/day over ${Math.round(days)} days`
}

function WeightChart({ weights, height, compact }: { weights: WeightRecord[]; height: number; compact?: boolean }) {
  const data = [...weights].reverse().map((w) => ({ date: w.date, kg: w.weightKg }))
  return (
    <div style={{ height }} className={compact ? 'mt-3 -mx-2' : ''}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: compact ? -30 : -10 }}>
          {!compact && <CartesianGrid stroke="#f5f5f4" vertical={false} />}
          <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, 'MMM yy')} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} hide={compact} />
          <YAxis tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} hide={compact} />
          <Tooltip formatter={(v: any) => [`${v} kg`, 'Weight']} labelFormatter={(d: any) => fmtDate(d)} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }} />
          <Line type="monotone" dataKey="kg" stroke="#2f6449" strokeWidth={2.5} dot={{ r: 3, fill: '#2f6449' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Timeline({ r }: { r?: Records }) {
  if (!r) return <div className="p-5"><div className="h-24 animate-pulse rounded-lg bg-stone-100" /></div>
  const items = [
    ...r.health.map((h) => ({ date: h.date, icon: HeartPulse, color: 'text-sky-600 bg-sky-50', text: h.title, sub: healthType(h.type).label })),
    ...r.weights.map((w) => ({ date: w.date, icon: Scale, color: 'text-stone-600 bg-stone-100', text: `Weighed ${fmtNum(w.weightKg, 1)} kg`, sub: w.notes || '' })),
    ...r.births.map((b) => ({ date: b.date, icon: Baby, color: 'text-emerald-700 bg-emerald-50', text: `Gave birth${b.offspringTag ? `: ${b.offspringTag}` : ''}`, sub: b.outcome !== 'alive' ? b.outcome : b.sex || '' })),
    ...r.breeding.map((b) => ({ date: b.date, icon: Sprout, color: 'text-wheat-700 bg-wheat-50', text: b.event === 'service' ? `Served${b.sireName || b.sireTag ? ` by ${b.sireTag || b.sireName}` : ''}` : b.event === 'scan' ? `Scanned ${b.scanResult}` : 'In heat', sub: '' })),
    ...r.movements.map((m) => ({ date: m.date, icon: MapPin, color: 'text-violet-700 bg-violet-50', text: `Moved to ${[m.toParcelName, m.toStructureName].filter(Boolean).join(' · ') || 'no location'}`, sub: '' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
  if (!items.length) return <p className="px-5 pb-6 pt-3 text-sm text-stone-500">Nothing recorded yet.</p>
  return (
    <ul className="space-y-1 p-3">
      {items.map((i, k) => (
        <li key={k} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className={cn('grid size-8 place-items-center rounded-lg', i.color)}><i.icon className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm text-stone-800">{i.text}</span>{i.sub && <span className="block text-xs capitalize text-stone-400">{i.sub}</span>}</span>
          <span className="text-xs text-stone-400">{fmtDate(i.date)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AnimalPage() {
  return <Suspense><AnimalView /></Suspense>
}
