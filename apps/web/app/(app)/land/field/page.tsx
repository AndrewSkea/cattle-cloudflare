'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowLeft, CalendarClock, Check, FlaskConical, Gauge, MoreHorizontal, Pencil, Plus, Sprout, Trash2, Beef } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, Skeleton, StatCard } from '@/components/ui/display'
import { Select } from '@/components/ui/form'
import { Menu, MenuItem, Tabs, useConfirm } from '@/components/ui/overlay'
import { CropSheet, FieldEventSheet } from '@/components/forms/field-forms'
import { api, useSave } from '@/lib/queries'
import { getData } from '@/lib/api'
import { CROP_PURPOSES, FIELD_EVENT_TYPES, RATE_UNITS, YIELD_UNITS, cropInfo, cropLabel, fieldEventType, landUse, readingColor, readingGradient, readingKind, speciesInfo, type FieldEventType } from '@/lib/constants'
import { fmtArea, fmtDate, fmtDue, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { FieldCrop, FieldDetail, FieldEvent } from '@/lib/types'

const FieldPointsMap = dynamic(() => import('@/components/map/field-points-map'), { ssr: false, loading: () => <Skeleton className="h-[320px] rounded-xl" /> })

type Tab = 'timeline' | 'readings' | 'crops' | 'grazing'
type SheetState = null | { kind: 'crop'; crop?: FieldCrop } | { kind: 'event'; event?: FieldEvent; type?: FieldEventType; plan?: boolean }

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const unitLabel = (u: string | null, list: { value: string; label: string }[]) => list.find((x) => x.value === u)?.label ?? u ?? ''

function FieldView() {
  const id = Number(useSearchParams().get('id'))
  const { farm, can, currency } = useSession()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('timeline')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [filter, setFilter] = useState<string>('all')
  const { data, isError } = useQuery({ queryKey: ['land', 'field', id], queryFn: () => getData<FieldDetail>(`/api/fields/${id}`), enabled: id > 0 })
  const inv = ['land', 'finance']
  const delEvent = useSave((eid: number) => api.del(`/api/fields/${id}/events/${eid}`), { invalidate: inv, success: 'Record deleted' })
  const doneEvent = useSave((eid: number) => api.post(`/api/fields/${id}/events/${eid}/done`, {}), { invalidate: inv, success: 'Marked done' })
  const delCrop = useSave((cid: number) => api.del(`/api/fields/${id}/crops/${cid}`), { invalidate: inv, success: 'Crop removed' })

  const t = todayISO()
  const summary = useMemo(() => {
    if (!data) return null
    const { parcel, crops, events } = data
    const done = events.filter((e) => e.status === 'done')
    const crop = crops.find((c) => c.status === 'growing' && (!c.startDate || c.startDate <= t)) ?? null
    const next = crops.filter((c) => c.status === 'planned').sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))[0] ?? null
    const yearStart = `${t.slice(0, 4)}-01-01`
    const nut = { n: 0, p: 0, k: 0 }
    for (const e of done) {
      if (e.date < yearStart) continue
      const share = e.areaHa && parcel.areaHa ? Math.min(1, e.areaHa / parcel.areaHa) : 1
      nut.n += (e.nKgHa || 0) * share; nut.p += (e.pKgHa || 0) * share; nut.k += (e.kKgHa || 0) * share
    }
    const noGraze = done.map((e) => e.noGrazeUntil).filter((d): d is string => !!d && d >= t).sort().pop() ?? null
    const soil = done.find((e) => e.type === 'soil_test') ?? null
    const ph = done.flatMap((e) => e.readings.filter((r) => r.kind === 'ph').map((r) => ({ ...r, date: e.date })))[0] ?? null
    return { crop, next, nut, noGraze, soil, ph }
  }, [data, t])

  if (isError) return <EmptyState title="Field not found" action={<Link href="/land" className="text-sm font-medium text-brand-700">Back to land</Link>} />
  if (!data || !summary) return <PageSkeleton />
  const { parcel, crops, events, grazing } = data
  const planned = events.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))
  const done = events.filter((e) => e.status === 'done' && (filter === 'all' || e.type === filter))
  const byYear = new Map<string, FieldEvent[]>()
  for (const e of done) { const y = e.date.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y)!.push(e) }
  const usedTypes = new Set(events.map((e) => e.type))
  const soilDue = !summary.soil || days(summary.soil.date, t) > 5 * 365
  const tillable = !['woodland', 'yard'].includes(parcel.landUse)
  const center = { latitude: farm.latitude, longitude: farm.longitude }

  const onDelete = async (e: FieldEvent) => {
    if (await confirm({ title: `Delete this ${fieldEventType(e.type).short.toLowerCase()} record?`, description: e.cost ? 'Its cost is removed from Finances too.' : undefined, confirmLabel: 'Delete', danger: true })) delEvent.mutate(e.id)
  }

  return (
    <div className="space-y-6">
      <Link href="/land" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" />Land</Link>
      <PageHeader title={parcel.name}
        description={[landUse(parcel.landUse).label, fmtArea(parcel.areaHa, farm.areaUnit), summary.crop ? cropLabel(summary.crop) : null].filter(Boolean).join(' · ')}
        actions={can('worker') && <>
          <Button variant="secondary" onClick={() => setSheet({ kind: 'event', plan: true })}><CalendarClock />Plan work</Button>
          <Button onClick={() => setSheet({ kind: 'event' })}><Plus />Add record</Button>
        </>} />

      {summary.noGraze && (
        <Card className="flex items-center gap-3 bg-clay-50 p-4 ring-clay-200">
          <AlertTriangle className="size-5 shrink-0 text-clay-700" />
          <p className="text-sm text-clay-900"><span className="font-semibold">Keep stock off until {fmtDate(summary.noGraze, 'd MMM')}</span> ({fmtDue(summary.noGraze)}) — sprayed.{parcel.animalCount > 0 && ` ${parcel.animalCount} animals are in this field now.`}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Crop" icon={Sprout}
          value={summary.crop ? <span className="flex items-center gap-2"><span className="size-3 shrink-0 rounded-full" style={{ background: cropInfo(summary.crop.crop).color }} />{cropInfo(summary.crop.crop).label}</span> : 'Not set'}
          sub={summary.crop
            ? summary.crop.startDate ? `Sown ${fmtDate(summary.crop.startDate, 'MMM yyyy')}${summary.crop.expectedHarvest ? ` · harvest ${fmtDate(summary.crop.expectedHarvest, 'MMM')}` : ''}` : 'Long-standing'
            : summary.next ? `Next: ${cropLabel(summary.next)}` : can('worker') ? <button className="font-medium text-brand-700" onClick={() => setSheet({ kind: 'crop' })}>Add what’s growing</button> : '—'} />
        <StatCard label="Grazing" icon={Beef} tone="wheat"
          value={grazing.head ? `${grazing.head} head` : grazing.restDays != null ? `${grazing.restDays} days` : 'Empty'}
          sub={grazing.head
            ? `${Object.entries(parcel.animalsBySpecies).map(([s, n]) => `${n} ${speciesInfo(s).plural.toLowerCase()}`).join(', ')}${grazing.since ? ` · since ${fmtDate(grazing.since, 'd MMM')}` : ''}`
            : grazing.restDays != null ? `Rested since ${fmtDate(grazing.lastOut, 'd MMM')}` : 'No grazing recorded'} />
        <StatCard label={`Nutrients ${t.slice(0, 4)}`} icon={Sprout} tone="sky"
          value={summary.nut.n || summary.nut.p || summary.nut.k ? <span className="tabular">{Math.round(summary.nut.n)}<span className="text-sm font-normal text-stone-500"> kg N/ha</span></span> : 'None yet'}
          sub={summary.nut.p || summary.nut.k ? `P ${Math.round(summary.nut.p)} · K ${Math.round(summary.nut.k)} kg/ha` : 'From fertiliser and slurry records'} />
        <StatCard label="Soil" icon={FlaskConical} tone={soilDue && tillable ? 'clay' : 'stone'}
          value={summary.ph ? `pH ${fmtNum(summary.ph.value, 1)}` : summary.soil ? 'Tested' : 'No test'}
          sub={summary.soil ? `${soilDue ? 'Due again · ' : ''}tested ${fmtDate(summary.soil.date, 'MMM yyyy')}` : tillable ? 'Test every 3–5 years' : '—'} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'timeline', label: 'Timeline', count: events.length },
        { value: 'readings', label: 'Readings', count: events.filter((e) => e.readings.length).length || null },
        { value: 'crops', label: 'Crops', count: crops.length },
        { value: 'grazing', label: 'Grazing' },
      ]} />

      {tab === 'timeline' && (
        <div className="space-y-6">
          {planned.length > 0 && (
            <Card>
              <CardHeader title="Planned" description="Tick off when done; overdue jobs show in the morning reminder." icon={CalendarClock} />
              <ul className="mt-3 divide-y divide-stone-100">
                {planned.map((e) => (
                  <EventRow key={e.id} e={e} crops={crops} currency={currency} areaUnit={farm.areaUnit}
                    action={can('worker') && <>
                      <Button size="sm" variant="secondary" onClick={() => doneEvent.mutate(e.id)} loading={doneEvent.isPending && doneEvent.variables === e.id}><Check />Done</Button>
                      <RowMenu onEdit={() => setSheet({ kind: 'event', event: e })} onDelete={() => onDelete(e)} />
                    </>} />
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h2 className="text-[15px] font-semibold text-stone-900">History</h2>
              {usedTypes.size > 1 && (
                <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-44 text-[13px]" aria-label="Show">
                  <option value="all">Everything</option>
                  {FIELD_EVENT_TYPES.filter((x) => usedTypes.has(x.value)).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </Select>
              )}
            </div>
            {done.length === 0 ? (
              <EmptyState icon={Sprout} title="Nothing recorded yet" className="py-10"
                description="Add sowing, fertiliser, lime, slurry, sprays, field work, harvests, soil tests and readings to build this field’s history."
                action={can('worker') && <Button size="sm" onClick={() => setSheet({ kind: 'event' })}><Plus />Add record</Button>} />
            ) : [...byYear.entries()].map(([year, list]) => (
              <div key={year} className="mt-3">
                <p className="sticky top-0 bg-white/95 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">{year}</p>
                <ul className="divide-y divide-stone-100">
                  {list.map((e) => (
                    <EventRow key={e.id} e={e} crops={crops} currency={currency} areaUnit={farm.areaUnit}
                      action={can('worker') && <RowMenu onEdit={() => setSheet({ kind: 'event', event: e })} onDelete={() => onDelete(e)} />} />
                  ))}
                </ul>
              </div>
            ))}
            <div className="h-3" />
          </Card>
        </div>
      )}

      {tab === 'readings' && <ReadingsTab detail={data} center={center} onAdd={can('worker') ? () => setSheet({ kind: 'event', type: 'reading' }) : undefined} onSoil={can('worker') ? () => setSheet({ kind: 'event', type: 'soil_test' }) : undefined} />}

      {tab === 'crops' && (
        <Card>
          <CardHeader title="Crops" description="What has grown here, newest first." action={can('worker') && <Button size="sm" onClick={() => setSheet({ kind: 'crop' })}><Plus />Crop</Button>} />
          {crops.length === 0 ? <EmptyState icon={Sprout} title="No crops yet" description="Add the crop in the field now — permanent grass counts too." className="py-10" /> : (
            <ul className="mt-3 divide-y divide-stone-100">
              {crops.map((c) => {
                const harvests = events.filter((e) => e.cropId === c.id && e.type === 'harvest' && e.status === 'done')
                return (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: cropInfo(c.crop).color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-900">{cropLabel(c)} <span className="font-normal text-stone-500">· {CROP_PURPOSES.find((p) => p.value === c.purpose)?.label}</span></p>
                      <p className="text-xs text-stone-500">
                        {c.startDate ? `${c.status === 'planned' ? 'Planned for' : 'Sown'} ${fmtDate(c.startDate)}` : 'Long-standing'}
                        {c.endDate ? ` → ${fmtDate(c.endDate)}` : c.expectedHarvest ? ` · harvest expected ${fmtDate(c.expectedHarvest, 'MMM yyyy')}` : ''}
                      </p>
                      {harvests.length > 0 && <p className="mt-0.5 text-xs text-stone-600">{harvests.length} harvest{harvests.length === 1 ? '' : 's'}{harvests.some((h) => h.yieldAmount) ? `: ${harvests.filter((h) => h.yieldAmount).map((h) => `${fmtNum(h.yieldAmount, 1)} ${unitLabel(h.yieldUnit, YIELD_UNITS)}`).join(', ')}` : ''}</p>}
                    </div>
                    <Badge tone={c.status === 'growing' ? 'green' : c.status === 'planned' ? 'blue' : 'gray'}>{c.status === 'growing' ? 'Growing' : c.status === 'planned' ? 'Planned' : 'Finished'}</Badge>
                    {can('worker') && <RowMenu onEdit={() => setSheet({ kind: 'crop', crop: c })} onDelete={async () => {
                      if (await confirm({ title: `Remove ${cropLabel(c)}?`, description: 'Its records stay on the timeline.', confirmLabel: 'Remove', danger: true })) delCrop.mutate(c.id)
                    }} />}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="h-3" />
        </Card>
      )}

      {tab === 'grazing' && (
        <Card>
          <CardHeader title="Grazing" icon={Beef}
            description={grazing.head ? `${grazing.head} head in now${grazing.since ? `, since ${fmtDate(grazing.since)}` : ''}.` : grazing.restDays != null ? `Empty and resting for ${grazing.restDays} days.` : 'Moves recorded on animals show here.'}
            action={can('worker') && <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'event', type: 'grazing' })}><Plus />Grazing</Button>} />
          {(() => {
            const manual = events.filter((e) => e.type === 'grazing' && e.status === 'done').map((e) => ({ date: e.date, text: `${e.product || 'Grazed'}${e.endDate ? ` until ${fmtDate(e.endDate, 'd MMM')}` : ''}` }))
            const moves = grazing.history.map((h) => ({ date: h.date, text: [h.in && `${h.in} moved in`, h.out && `${h.out} moved out`].filter(Boolean).join(', ') }))
            const all = [...manual, ...moves].sort((a, b) => b.date.localeCompare(a.date))
            return all.length === 0 ? <EmptyState title="No grazing yet" description="Move animals into this field from Animals, or add a grazing record." className="py-10" /> : (
              <ul className="mt-3 divide-y divide-stone-100">
                {all.map((x, i) => <li key={i} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="text-stone-800">{x.text}</span><span className="shrink-0 text-stone-500">{fmtDate(x.date)}</span></li>)}
              </ul>
            )
          })()}
          <div className="h-3" />
        </Card>
      )}

      {sheet?.kind === 'crop' && <CropSheet parcel={parcel} crop={sheet.crop} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'event' && <FieldEventSheet parcel={parcel} event={sheet.event} type={sheet.type} plan={sheet.plan} crops={crops} center={center} onClose={() => setSheet(null)} />}
    </div>
  )
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <Menu trigger={<button className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="More"><MoreHorizontal className="size-4" /></button>}>
      <MenuItem icon={Pencil} onClick={onEdit}>Edit</MenuItem>
      <MenuItem icon={Trash2} danger onClick={onDelete}>Delete</MenuItem>
    </Menu>
  )
}

function EventRow({ e, crops, currency, areaUnit, action }: { e: FieldEvent; crops: FieldCrop[]; currency: string; areaUnit: 'ha' | 'ac'; action?: React.ReactNode }) {
  const meta = fieldEventType(e.type)
  const crop = crops.find((c) => c.id === e.cropId)
  const t = todayISO()
  const chips: string[] = []
  if (e.rate != null) chips.push(`${fmtNum(e.rate, 2)} ${unitLabel(e.rateUnit, RATE_UNITS)}`)
  if (e.areaHa != null) chips.push(`${fmtArea(e.areaHa, areaUnit)} done`)
  if (e.nKgHa || e.pKgHa || e.kKgHa) chips.push(`N ${fmtNum(e.nKgHa)} · P ${fmtNum(e.pKgHa)} · K ${fmtNum(e.kKgHa)}${e.sKgHa ? ` · S ${fmtNum(e.sKgHa)}` : ''} kg/ha`)
  if (e.yieldAmount != null) chips.push(`${fmtNum(e.yieldAmount, 1)} ${unitLabel(e.yieldUnit, YIELD_UNITS)}`)
  if (e.moisturePct != null) chips.push(`${fmtNum(e.moisturePct, 1)}% moisture`)
  if (e.dryMatterPct != null) chips.push(`${fmtNum(e.dryMatterPct, 1)}% DM`)
  if (e.contractor) chips.push(e.contractor)
  if (e.cost) chips.push(fmtMoney(e.cost, currency))
  if (e.readings.length) {
    const byKind = new Map<string, number[]>()
    for (const r of e.readings) { if (!byKind.has(r.kind)) byKind.set(r.kind, []); byKind.get(r.kind)!.push(r.value) }
    for (const [k, vals] of byKind) {
      const info = readingKind(k)
      chips.push(vals.length === 1 ? `${info.label} ${fmtNum(vals[0], 1)} ${info.unit}` : `${info.label} avg ${fmtNum(vals.reduce((a, b) => a + b, 0) / vals.length, 1)} ${info.unit} (${vals.length})`)
    }
  }
  const overdue = e.status === 'planned' && e.date < t
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', e.status === 'planned' && 'ring-2 ring-offset-1')} style={e.status === 'planned' ? { background: 'white', ['--tw-ring-color' as string]: meta.color } : { background: meta.color }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-900"><span className="font-medium">{meta.short}</span>{e.product ? <span className="text-stone-700"> · {e.product}</span> : null}</p>
        <p className={cn('text-xs', overdue ? 'font-medium text-clay-700' : 'text-stone-500')}>
          {e.status === 'planned' ? `${fmtDate(e.date, 'EEE d MMM')} · ${fmtDue(e.date)}` : fmtDate(e.date, 'd MMM')}{e.endDate ? ` → ${fmtDate(e.endDate, 'd MMM')}` : ''}
          {crop ? ` · ${cropInfo(crop.crop).label}` : ''}
          {e.noGrazeUntil && e.noGrazeUntil >= t ? <span className="font-medium text-clay-700"> · stock off until {fmtDate(e.noGrazeUntil, 'd MMM')}</span> : null}
        </p>
        {chips.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{chips.map((c, i) => <span key={i} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">{c}</span>)}</div>}
        {e.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-stone-600">{e.notes}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </li>
  )
}

function ReadingsTab({ detail, center, onAdd, onSoil }: { detail: FieldDetail; center: { latitude: number | null; longitude: number | null }; onAdd?: () => void; onSoil?: () => void }) {
  const withReadings = detail.events.filter((e) => e.status === 'done' && e.readings.length)
  const kinds = [...new Set(withReadings.flatMap((e) => e.readings.map((r) => r.kind)))]
  // Open on the latest readings taken at points (a map is more useful than a whole-field soil test)
  const [kind, setKind] = useState(() => withReadings.flatMap((e) => e.readings).find((r) => r.latitude != null)?.kind ?? kinds[0] ?? 'soil_moisture')
  const sets = withReadings.filter((e) => e.readings.some((r) => r.kind === kind))
  const [setId, setSetId] = useState<number | null>(null)
  const current = sets.find((e) => e.id === setId) ?? sets[0]
  const info = readingKind(kind)

  if (!kinds.length) {
    return (
      <Card>
        <EmptyState icon={Gauge} title="No readings yet" className="py-12"
          description="Walk the field and record soil moisture, grass height or cover, crop moisture or pH. Tap where you took each one, or use your phone’s GPS."
          action={(onAdd || onSoil) && <div className="flex flex-wrap justify-center gap-2">{onAdd && <Button size="sm" onClick={onAdd}><Plus />Add readings</Button>}{onSoil && <Button size="sm" variant="secondary" onClick={onSoil}>Soil test results</Button>}</div>} />
      </Card>
    )
  }
  const series = [...sets].reverse().map((e) => {
    const vals = e.readings.filter((r) => r.kind === kind).map((r) => r.value)
    return { date: e.date, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, min: Math.min(...vals), max: Math.max(...vals) }
  })
  const pts = (current?.readings ?? []).filter((r) => r.kind === kind)
  const mapPts = pts.filter((r) => r.latitude != null && r.longitude != null)
    .map((r, i) => ({ key: r.id ?? i, lat: r.latitude!, lng: r.longitude!, color: readingColor(kind, r.value), text: fmtNum(r.value, 1), title: r.label ?? undefined }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setSetId(null) }} className="w-52" aria-label="Reading">
          {kinds.map((k) => <option key={k} value={k}>{readingKind(k).label}</option>)}
        </Select>
        {sets.length > 1 && (
          <Select value={current?.id ?? ''} onChange={(e) => setSetId(Number(e.target.value))} className="w-44" aria-label="Date">
            {sets.map((e) => <option key={e.id} value={e.id}>{fmtDate(e.date)}</option>)}
          </Select>
        )}
        <div className="ml-auto flex gap-2">
          {onSoil && <Button size="sm" variant="secondary" onClick={onSoil}>Soil test</Button>}
          {onAdd && <Button size="sm" onClick={onAdd}><Plus />Readings</Button>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-4">
          {mapPts.length ? (
            <>
              <FieldPointsMap key={`${current?.id}-${kind}`} polygon={detail.parcel.polygon} center={center} points={mapPts} height={340} />
              <div className="mt-3 flex items-center gap-2 text-[11px] text-stone-500">
                <span>{info.low}</span><span className="h-2 flex-1 rounded-full" style={{ background: readingGradient(kind) }} /><span>{info.high}</span>
              </div>
            </>
          ) : <p className="py-10 text-center text-sm text-stone-500">These readings weren’t placed on the map.</p>}
        </Card>
        <Card>
          <CardHeader title={`${info.label}, ${current ? fmtDate(current.date) : ''}`} description={pts.length > 1 ? `Average ${fmtNum(pts.reduce((a, r) => a + r.value, 0) / pts.length, 1)} ${info.unit} · range ${fmtNum(Math.min(...pts.map((r) => r.value)), 1)}–${fmtNum(Math.max(...pts.map((r) => r.value)), 1)}` : undefined} />
          <ul className="mt-3 max-h-[300px] divide-y divide-stone-100 overflow-y-auto">
            {pts.map((r, i) => (
              <li key={r.id ?? i} className="flex items-center gap-3 px-5 py-2 text-sm">
                <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: readingColor(kind, r.value) }} />
                <span className="flex-1 text-stone-700">{r.label || (r.latitude != null ? `Point ${i + 1}` : 'Whole field')}</span>
                <span className="font-medium tabular text-stone-900">{fmtNum(r.value, 1)} {info.unit}</span>
              </li>
            ))}
          </ul>
          {current?.notes && <p className="px-5 pt-2 text-xs text-stone-600">{current.notes}</p>}
          <div className="h-4" />
        </Card>
      </div>
      {series.length > 1 && (
        <Card>
          <CardHeader title={`${info.label} over time`} description="Field average on each date" />
          <div className="h-64 p-4">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ left: -10, right: 10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, 'd MMM yy')} fontSize={11} />
                <YAxis fontSize={11} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={(d) => fmtDate(String(d))} formatter={(v) => [`${v} ${info.unit}`, 'Average']} />
                <Line type="monotone" dataKey="avg" stroke="#275040" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )
}

export default function FieldPage() {
  return <Suspense fallback={<PageSkeleton />}><FieldView /></Suspense>
}
