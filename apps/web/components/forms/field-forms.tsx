'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, FormGrid, FormSection, Input, Segmented, SelectField, TextField, TextareaField } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { Skeleton } from '@/components/ui/display'
import { api, useEquipment, useSave } from '@/lib/queries'
import {
  CROP_PURPOSES, CROPS, FIELD_EVENT_TYPES, FIELD_OPERATIONS, MANURE_PRESETS, RATE_UNITS, READING_KINDS, SOIL_TEST_KINDS, SPRAY_SUGGESTIONS,
  YIELD_UNITS, cropLabel, fieldEventType, readingColor, readingKind, type FieldEventType,
} from '@/lib/constants'
import { addDaysISO, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { FieldCrop, FieldEvent, FieldReading, Parcel } from '@/lib/types'

const FieldPointsMap = dynamic(() => import('@/components/map/field-points-map'), { ssr: false, loading: () => <Skeleton className="h-[280px] rounded-xl" /> })

const INVALIDATE = ['land', 'finance']
const AC = 2.47105

// ============================ CROP ============================

export function CropSheet({ parcel, crop, onClose }: { parcel: Parcel; crop?: FieldCrop; onClose: () => void }) {
  const { currency } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState(crop?.crop ?? (parcel.landUse === 'arable' ? 'spring_barley' : 'grass'))
  const [status, setStatus] = useState<FieldCrop['status']>(crop?.status ?? 'growing')
  const [unknownStart, setUnknownStart] = useState(crop ? !crop.startDate : false)
  const [withSowing, setWithSowing] = useState(!crop)
  const save = useSave((b: any) => crop ? api.put(`/api/fields/${parcel.id}/crops/${crop.id}`, b) : api.post(`/api/fields/${parcel.id}/crops`, b), {
    invalidate: INVALIDATE, success: crop ? 'Crop updated' : status === 'planned' ? 'Crop planned' : 'Crop added', silentError: true, onSuccess: onClose,
  })
  const defaultPurpose = crop?.purpose ?? (parcel.landUse === 'silage' ? 'silage' : parcel.landUse === 'hay' ? 'hay' : ['spring_barley', 'winter_barley', 'oats', 'wheat'].includes(kind) ? 'grain' : 'grazing')

  return (
    <Sheet open onClose={onClose} title={crop ? `Edit ${cropLabel(crop)}` : `What’s in ${parcel.name}?`}
      description={crop ? undefined : 'Add the crop that is growing now (including grass for grazing), or plan the next one.'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="crop-form" loading={save.isPending}>Save</Button></>}>
      <form id="crop-form" className="space-y-6" onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const s = (k: string) => (f.get(k) as string | null)?.trim() || null
        const n = (k: string) => (s(k) == null ? null : Number(s(k)))
        const unit = s('rateUnit')
        save.mutate({
          crop: kind, variety: s('variety'), purpose: s('purpose'), status, notes: s('notes'),
          startDate: unknownStart ? null : s('startDate'), expectedHarvest: s('expectedHarvest'),
          ...(status === 'finished' ? { endDate: s('endDate') ?? todayISO() } : crop ? { endDate: null } : {}),
          ...(!crop && withSowing && !unknownStart ? { sowing: { product: s('seed'), rate: n('rate'), rateUnit: unit, cost: n('cost'), contractor: s('contractor') } } : {}),
        }, { onError: (err) => setError(err.message) })
      }}>
        <Field label="Crop">
          <div className="flex flex-wrap gap-1.5">
            {CROPS.map((c) => (
              <button key={c.value} type="button" onClick={() => setKind(c.value)} aria-pressed={kind === c.value}
                className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium ring-1 transition', kind === c.value ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-600 ring-stone-200')}>
                <span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Status">
          <Segmented value={status} onChange={setStatus} options={[{ value: 'growing', label: 'In the ground' }, { value: 'planned', label: 'Planned' }, ...(crop ? [{ value: 'finished' as const, label: 'Finished' }] : [])]} />
        </Field>
        <FormGrid>
          <TextField label="Variety / mix" name="variety" defaultValue={crop?.variety ?? ''} placeholder={kind.startsWith('grass') ? 'e.g. Long-term ley mix' : 'e.g. Laureate'} maxLength={100} />
          <SelectField label="For" name="purpose" defaultValue={defaultPurpose} options={CROP_PURPOSES} />
          <div className="space-y-2">
            <TextField label={status === 'planned' ? 'Planned sowing date' : 'Sown / reseeded'} name="startDate" type="date" disabled={unknownStart}
              defaultValue={crop?.startDate ?? (status === 'planned' ? '' : todayISO())} />
            {kind.startsWith('grass') && status !== 'planned' && <Checkbox label="Long-standing grass, date unknown" checked={unknownStart} onChange={(e) => setUnknownStart(e.target.checked)} />}
          </div>
          <TextField label="Expected harvest" name="expectedHarvest" type="date" defaultValue={crop?.expectedHarvest ?? ''} hint="Optional — shows on the season chart" />
          {status === 'finished' && <TextField label="Finished on" name="endDate" type="date" defaultValue={crop?.endDate ?? todayISO()} />}
        </FormGrid>
        {!crop && !unknownStart && (
          <FormSection title="Sowing" description="Saved on the field’s timeline (and its cost in Finances).">
            <Checkbox label="Record the sowing too" checked={withSowing} onChange={(e) => setWithSowing(e.target.checked)} />
            {withSowing && (
              <FormGrid>
                <TextField label="Seed" name="seed" placeholder="Seed mix / variety" className="sm:col-span-2" />
                <TextField label="Seed rate" name="rate" type="number" step="0.01" min={0} />
                <SelectField label="Rate unit" name="rateUnit" defaultValue="kg/ha" options={RATE_UNITS} />
                <TextField label="Cost" name="cost" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} />
                <TextField label="Contractor" name="contractor" />
              </FormGrid>
            )}
          </FormSection>
        )}
        <TextareaField label="Notes" name="notes" defaultValue={crop?.notes ?? ''} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ TIMELINE RECORD ============================

/** "20-10-10", "20:10:10", "27-0-0+5SO3", "25-5-5-6" → % N, P2O5, K2O, SO3 */
export function parseAnalysis(v: string): { n: number; p: number; k: number; s: number } | null {
  const nums = v.match(/\d+(?:\.\d+)?/g)?.map(Number)
  if (!nums || nums.length < 3) return null
  return { n: nums[0], p: nums[1], k: nums[2], s: nums[3] ?? 0 }
}

/** Rate → kg per hectare (or m³/ha for liquids), so nutrients can be worked out. */
function perHa(rate: number, unit: string): { kg?: number; m3?: number; t?: number } {
  switch (unit) {
    case 'kg/ha': return { kg: rate, t: rate / 1000 }
    case 'kg/ac': return { kg: rate * AC, t: (rate * AC) / 1000 }
    case 'bags/ac': return { kg: rate * 50 * AC, t: (rate * 50 * AC) / 1000 }
    case 't/ha': return { kg: rate * 1000, t: rate }
    case 't/ac': return { kg: rate * 1000 * AC, t: rate * AC }
    case 'm3/ha': return { m3: rate }
    case 'gal/ac': return { m3: rate * 0.0045461 * AC }
    case 'L/ha': return { m3: rate / 1000 }
    case 'L/ac': return { m3: (rate * AC) / 1000 }
    default: return {}
  }
}

const DEFAULT_UNIT: Partial<Record<FieldEventType, string>> = {
  sowing: 'kg/ha', fertiliser: 'kg/ha', lime: 't/ha', slurry: 'm3/ha', minerals: 'kg/ha', spray: 'L/ha',
}
const RATE_TYPES: FieldEventType[] = ['sowing', 'fertiliser', 'lime', 'slurry', 'minerals', 'spray']
const NUTRIENT_TYPES: FieldEventType[] = ['fertiliser', 'slurry', 'minerals']
const COST_TYPES: FieldEventType[] = ['sowing', 'fertiliser', 'lime', 'slurry', 'minerals', 'spray', 'cultivation', 'harvest', 'soil_test']

interface ReadingRow { key: number; kind: string; label: string; value: string; lat: number | null; lng: number | null }
let rowKey = 1

type Str = Record<string, string>
const s = (v: number | string | null | undefined) => (v == null ? '' : String(v))

export function FieldEventSheet({ parcel, event, type: initialType, crops, center, onClose, plan }: {
  parcel: Parcel; event?: FieldEvent; type?: FieldEventType; crops: FieldCrop[]; center: { latitude: number | null; longitude: number | null }
  onClose: () => void; plan?: boolean
}) {
  const { farm, currency } = useSession()
  const { data: equipment = [] } = useEquipment()
  const [type, setType] = useState<FieldEventType | null>((event?.type as FieldEventType) ?? initialType ?? null)
  const [status, setStatus] = useState<'done' | 'planned'>(event?.status ?? (plan ? 'planned' : 'done'))
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState<Str>(() => ({
    date: event?.date ?? todayISO(), endDate: s(event?.endDate), cropId: s(event?.cropId), product: s(event?.product),
    rate: s(event?.rate), rateUnit: event?.rateUnit ?? DEFAULT_UNIT[(event?.type ?? initialType) as FieldEventType] ?? 'kg/ha',
    area: event?.areaHa != null ? s(farm.areaUnit === 'ac' ? Math.round(event.areaHa * AC * 100) / 100 : event.areaHa) : '',
    n: s(event?.nKgHa), p: s(event?.pKgHa), k: s(event?.kKgHa), s: s(event?.sKgHa),
    yieldAmount: s(event?.yieldAmount), yieldUnit: event?.yieldUnit ?? 'bales', moisturePct: s(event?.moisturePct), dryMatterPct: s(event?.dryMatterPct),
    noGrazeUntil: s(event?.noGrazeUntil), cost: s(event?.cost), contractor: s(event?.contractor), equipmentId: s(event?.equipmentId), notes: s(event?.notes),
    analysis: '', preset: '', keepOffDays: '',
  }))
  const set = (patch: Str) => setV((x) => ({ ...x, ...patch }))
  const [finishesCrop, setFinishesCrop] = useState(false)
  const [readingKindSel, setReadingKindSel] = useState<string>(() => event?.type === 'reading' ? event.readings[0]?.kind ?? 'soil_moisture' : 'soil_moisture')
  const [rows, setRows] = useState<ReadingRow[]>(() => {
    if (event?.type === 'soil_test' || (!event && initialType === 'soil_test')) {
      return SOIL_TEST_KINDS.map((k) => { const r = event?.readings.find((x) => x.kind === k); return { key: rowKey++, kind: k, label: '', value: s(r?.value), lat: null, lng: null } })
    }
    return (event?.readings || []).map((r) => ({ key: rowKey++, kind: r.kind, label: r.label ?? '', value: s(r.value), lat: r.latitude, lng: r.longitude }))
  })

  const save = useSave((b: any) => event ? api.put(`/api/fields/${parcel.id}/events/${event.id}`, b) : api.post(`/api/fields/${parcel.id}/events`, b), {
    invalidate: INVALIDATE, success: event ? 'Record updated' : status === 'planned' ? 'Planned' : 'Saved', silentError: true, onSuccess: onClose,
  })

  const pickType = (t: FieldEventType) => {
    setType(t)
    set({ rateUnit: DEFAULT_UNIT[t] ?? 'kg/ha' })
    if (t === 'soil_test') setRows(SOIL_TEST_KINDS.map((k) => ({ key: rowKey++, kind: k, label: '', value: '', lat: null, lng: null })))
    else setRows([])
  }

  // Work out nutrients per hectare from analysis / manure type and rate
  const recalc = (next: Str) => {
    const merged = { ...v, ...next }
    const rate = Number(merged.rate)
    if (!rate || !type) return setV(merged)
    const ha = perHa(rate, merged.rateUnit)
    if (type === 'slurry' && merged.preset) {
      const m = MANURE_PRESETS.find((x) => x.value === merged.preset)!
      const amount = m.unit === 'm3' ? ha.m3 : ha.t
      if (amount != null) return setV({ ...merged, n: fmtNum(amount * m.n), p: fmtNum(amount * m.p), k: fmtNum(amount * m.k), s: fmtNum(amount * m.s) })
    }
    if (type !== 'slurry' && merged.analysis) {
      const a = parseAnalysis(merged.analysis)
      if (a && ha.kg != null) return setV({ ...merged, n: fmtNum((ha.kg * a.n) / 100), p: fmtNum((ha.kg * a.p) / 100), k: fmtNum((ha.kg * a.k) / 100), s: fmtNum((ha.kg * a.s) / 100) })
    }
    setV(merged)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!type) return
    const num = (x: string) => (x.trim() === '' ? null : Number(x.replace(/,/g, '')))
    const txt = (x: string) => x.trim() || null
    const area = num(v.area)
    const readings: Omit<FieldReading, 'id'>[] = rows.filter((r) => r.value.trim() !== '').map((r) => ({
      kind: r.kind, label: txt(r.label), value: Number(r.value), unit: readingKind(r.kind).unit || null, latitude: r.lat, longitude: r.lng,
    }))
    if (type === 'reading' && !readings.length) { setError('Add at least one reading'); return }
    save.mutate({
      type, status, date: v.date, endDate: txt(v.endDate), cropId: num(v.cropId), product: txt(v.product), notes: txt(v.notes),
      rate: RATE_TYPES.includes(type) ? num(v.rate) : null, rateUnit: RATE_TYPES.includes(type) && v.rate ? v.rateUnit : null,
      areaHa: area == null ? null : farm.areaUnit === 'ac' ? area / AC : area,
      nKgHa: NUTRIENT_TYPES.includes(type) ? num(v.n) : null, pKgHa: NUTRIENT_TYPES.includes(type) ? num(v.p) : null,
      kKgHa: NUTRIENT_TYPES.includes(type) ? num(v.k) : null, sKgHa: NUTRIENT_TYPES.includes(type) ? num(v.s) : null,
      yieldAmount: type === 'harvest' ? num(v.yieldAmount) : null, yieldUnit: type === 'harvest' && v.yieldAmount ? v.yieldUnit : null,
      moisturePct: type === 'harvest' ? num(v.moisturePct) : null, dryMatterPct: type === 'harvest' ? num(v.dryMatterPct) : null,
      noGrazeUntil: type === 'spray' ? txt(v.noGrazeUntil) : null,
      cost: COST_TYPES.includes(type) ? num(v.cost) : null, contractor: txt(v.contractor), equipmentId: num(v.equipmentId),
      readings, finishesCrop: type === 'harvest' ? finishesCrop : undefined,
    }, { onError: (err) => setError(err.message) })
  }

  const meta = type ? fieldEventType(type) : null
  const cropOptions = crops.map((c) => ({ value: c.id, label: `${cropLabel(c)}${c.status === 'planned' ? ' (planned)' : c.status === 'finished' ? ` (${c.endDate?.slice(0, 4) ?? 'finished'})` : ''}` }))
  const unitSuffix = farm.areaUnit === 'ac' ? 'ac' : 'ha'
  const money = currency === 'GBP' ? '£' : undefined

  if (!type) {
    return (
      <Sheet open onClose={onClose} title={plan ? `Plan work in ${parcel.name}` : `Add to ${parcel.name}`}
        footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
        <div className="grid grid-cols-2 gap-2">
          {FIELD_EVENT_TYPES.filter((t) => !plan || !['reading', 'note', 'grazing'].includes(t.value)).map((t) => (
            <button key={t.value} type="button" onClick={() => pickType(t.value)}
              className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-3 text-left text-sm font-medium text-stone-800 ring-1 ring-stone-200 transition hover:ring-brand-400">
              <span className="size-3 shrink-0 rounded-full" style={{ background: t.color }} />{t.label}
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  const pointRows = rows.filter((r) => r.lat != null)
  return (
    <Sheet open onClose={onClose} wide={type === 'reading'} title={`${event ? 'Edit' : status === 'planned' ? 'Plan' : 'Add'}: ${meta!.label.toLowerCase()}`} description={parcel.name}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="field-event-form" loading={save.isPending}>Save</Button></>}>
      <form id="field-event-form" className="space-y-6" onSubmit={submit}>
        {!['reading', 'note', 'grazing'].includes(type) && (
          <Segmented value={status} onChange={setStatus} options={[{ value: 'done', label: 'Done' }, { value: 'planned', label: 'Planned' }]} />
        )}
        <FormGrid>
          <TextField label={status === 'planned' ? 'Planned for' : type === 'grazing' ? 'Stock went in' : 'Date'} type="date" required value={v.date} onChange={(e) => set({ date: e.target.value })}
            max={status === 'done' ? todayISO() : undefined} />
          {(type === 'grazing' || type === 'harvest') && (
            <TextField label={type === 'grazing' ? 'Stock came out' : 'Finished (if over several days)'} type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} min={v.date}
              hint={type === 'grazing' ? 'Leave empty while they’re still in' : undefined} />
          )}
          {crops.length > 0 && !['soil_test', 'note'].includes(type) && (
            <SelectField label="Crop" value={v.cropId} onChange={(e) => set({ cropId: e.target.value })} placeholder="The crop in the field then" options={cropOptions} />
          )}
        </FormGrid>

        {/* What was used */}
        {type === 'sowing' && <TextField label="Seed" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="Seed mix / variety" />}
        {type === 'fertiliser' && (
          <FormGrid>
            <TextField label="Product" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Nitram, 20-10-10" />
            <TextField label="Analysis (N-P-K-S)" value={v.analysis} onChange={(e) => recalc({ analysis: e.target.value })} placeholder="e.g. 20-10-10 or 27-0-0-5" hint="Fills in the nutrients below" />
          </FormGrid>
        )}
        {type === 'slurry' && (
          <FormGrid>
            <SelectField label="What" value={v.preset} onChange={(e) => { const p = MANURE_PRESETS.find((x) => x.value === e.target.value); recalc({ preset: e.target.value, product: p?.label ?? v.product, rateUnit: p?.unit === 't' ? 't/ha' : v.rateUnit.startsWith('t') ? 'm3/ha' : v.rateUnit }) }}
              placeholder="Choose for typical nutrients" options={MANURE_PRESETS} />
            <TextField label="Description" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Cattle slurry from the tank" />
          </FormGrid>
        )}
        {type === 'lime' && <TextField label="Product" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Ground limestone, Calcified seaweed" />}
        {type === 'minerals' && <TextField label="Product" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Selenium prills, Kieserite (Mg), Cobalt, Iodine" />}
        {type === 'spray' && <>
          <TextField label="Product / target" value={v.product} onChange={(e) => set({ product: e.target.value })} list="spray-suggestions" placeholder="e.g. Doxstar Pro for docks" />
          <datalist id="spray-suggestions">{SPRAY_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
        </>}
        {type === 'cultivation' && <>
          <TextField label="Job" value={v.product} onChange={(e) => set({ product: e.target.value })} list="ops" placeholder="e.g. Rolling" required />
          <datalist id="ops">{FIELD_OPERATIONS.map((x) => <option key={x} value={x} />)}</datalist>
        </>}
        {type === 'harvest' && <TextField label="What" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. First cut silage, Hay, Barley" />}
        {type === 'grazing' && <TextField label="Which stock" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Cows and calves, 40 ewes" hint="Moves recorded on animals are counted automatically" />}
        {type === 'soil_test' && <TextField label="Lab / sampled by" value={v.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. SAC" />}

        {RATE_TYPES.includes(type) && (
          <FormGrid cols={3}>
            <TextField label="Rate" type="number" step="any" min={0} value={v.rate} onChange={(e) => recalc({ rate: e.target.value })} />
            <SelectField label="Unit" value={v.rateUnit} onChange={(e) => recalc({ rateUnit: e.target.value })} options={RATE_UNITS} />
            <TextField label={`Area done (${unitSuffix})`} type="number" step="any" min={0} value={v.area} onChange={(e) => set({ area: e.target.value })} placeholder="Whole field" />
          </FormGrid>
        )}
        {NUTRIENT_TYPES.includes(type) && (
          <Field label="Nutrients applied (kg per hectare)" hint={type === 'slurry' ? 'Typical values (RB209). Change them if you have an analysis.' : 'P as P₂O₅, K as K₂O, S as SO₃'}>
            <div className="grid grid-cols-4 gap-2">
              {(['n', 'p', 'k', 's'] as const).map((k) => (
                <Input key={k} type="number" step="any" min={0} value={v[k]} onChange={(e) => set({ [k]: e.target.value })} prefix={k.toUpperCase()} aria-label={`${k.toUpperCase()} kg/ha`} />
              ))}
            </div>
          </Field>
        )}
        {type === 'spray' && (
          <FormGrid>
            <TextField label="Keep stock off for (days)" type="number" min={0} value={v.keepOffDays}
              onChange={(e) => set({ keepOffDays: e.target.value, noGrazeUntil: e.target.value ? addDaysISO(v.date, Number(e.target.value)) : '' })} hint="From the product label" />
            <TextField label="Safe to graze from" type="date" value={v.noGrazeUntil} onChange={(e) => set({ noGrazeUntil: e.target.value })} />
          </FormGrid>
        )}
        {type === 'harvest' && (
          <FormGrid>
            <TextField label="Yield" type="number" step="any" min={0} value={v.yieldAmount} onChange={(e) => set({ yieldAmount: e.target.value })} />
            <SelectField label="Unit" value={v.yieldUnit} onChange={(e) => set({ yieldUnit: e.target.value })} options={YIELD_UNITS} />
            <TextField label="Moisture %" type="number" step="0.1" min={0} max={100} value={v.moisturePct} onChange={(e) => set({ moisturePct: e.target.value })} />
            <TextField label="Dry matter %" type="number" step="0.1" min={0} max={100} value={v.dryMatterPct} onChange={(e) => set({ dryMatterPct: e.target.value })} />
            {crops.some((c) => c.status === 'growing') && !event && (
              <Checkbox className="sm:col-span-2" label="Last harvest of this crop" description="Marks the crop finished on this date" checked={finishesCrop} onChange={(e) => setFinishesCrop(e.target.checked)} />
            )}
          </FormGrid>
        )}

        {type === 'soil_test' && (
          <Field label="Results" hint="Leave out anything not tested">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rows.map((r) => (
                <label key={r.key} className="block text-xs text-stone-600">{readingKind(r.kind).label}
                  <Input type="number" step="any" value={r.value} className="mt-1" onChange={(e) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, value: e.target.value } : x))} />
                </label>
              ))}
            </div>
          </Field>
        )}

        {type === 'reading' && (
          <ReadingsEditor parcel={parcel} center={center} kind={readingKindSel} setKind={(k) => { setReadingKindSel(k); setRows((rs) => rs.map((r) => ({ ...r, kind: k }))) }}
            rows={rows} setRows={setRows} pointCount={pointRows.length} />
        )}

        {(COST_TYPES.includes(type) || ['cultivation', 'harvest'].includes(type)) && (
          <FormGrid>
            {COST_TYPES.includes(type) && <TextField label="Cost" type="number" step="0.01" min={0} prefix={money} value={v.cost} onChange={(e) => set({ cost: e.target.value })} hint={status === 'done' ? 'Added to Finances' : 'Added to Finances once it’s done'} />}
            {type !== 'soil_test' && <TextField label="Contractor" value={v.contractor} onChange={(e) => set({ contractor: e.target.value })} />}
            {['cultivation', 'harvest', 'slurry', 'fertiliser', 'lime', 'spray', 'sowing'].includes(type) && equipment.length > 0 && (
              <SelectField label="Machine" value={v.equipmentId} onChange={(e) => set({ equipmentId: e.target.value })} placeholder="—"
                options={equipment.filter((x) => !['sold', 'retired'].includes(x.status)).map((x) => ({ value: x.id, label: x.name }))} />
            )}
          </FormGrid>
        )}
        <TextareaField label="Notes" value={v.notes} onChange={(e) => set({ notes: e.target.value })} required={type === 'note'} placeholder={type === 'note' ? 'e.g. Wet patch by the burn, drain blocked' : undefined} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

function ReadingsEditor({ parcel, center, kind, setKind, rows, setRows, pointCount }: {
  parcel: Parcel; center: { latitude: number | null; longitude: number | null }; kind: string; setKind: (k: string) => void
  rows: ReadingRow[]; setRows: React.Dispatch<React.SetStateAction<ReadingRow[]>>; pointCount: number
}) {
  const k = readingKind(kind)
  const add = (lat: number | null, lng: number | null) => {
    const key = rowKey++
    setRows((rs) => [...rs, { key, kind, label: lat != null ? `Point ${rs.filter((r) => r.lat != null).length + 1}` : '', value: '', lat, lng }])
    setTimeout(() => document.getElementById(`reading-${key}`)?.focus(), 50)
  }
  const values = rows.map((r) => Number(r.value)).filter((x, i) => rows[i].value.trim() !== '' && Number.isFinite(x))
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  const points = useMemo(() => rows.filter((r) => r.lat != null && r.lng != null).map((r) => ({
    key: r.key, lat: r.lat!, lng: r.lng!, color: r.value.trim() ? readingColor(kind, Number(r.value)) : '#ffffff', text: r.value.trim() || '?', title: r.label,
  })), [rows, kind])

  return (
    <div className="space-y-4">
      <SelectField label="Measuring" value={kind} onChange={(e) => setKind(e.target.value)} options={READING_KINDS.map((x) => ({ value: x.value, label: `${x.label}${x.unit ? ` (${x.unit})` : ''}` }))} />
      {parcel.polygon || center.latitude != null ? (
        <FieldPointsMap polygon={parcel.polygon} center={center} points={points} onAdd={(lat, lng) => add(lat, lng)}
          onMove={(key, lat, lng) => setRows((rs) => rs.map((r) => r.key === key ? { ...r, lat, lng } : r))} height={280} />
      ) : <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">Draw this field on the Land map to place readings at points in it.</p>}
      <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
        {rows.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">Tap the map where you took each reading, or add one for the whole field.</li>}
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 px-3 py-2">
            <MapPin className={cn('size-4 shrink-0', r.lat != null ? 'text-brand-700' : 'text-stone-300')} aria-label={r.lat != null ? 'On the map' : 'Whole field'} />
            <Input value={r.label} onChange={(e) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, label: e.target.value } : x))} placeholder={r.lat != null ? 'Point' : 'Whole field'}
              className="h-8 min-w-0 flex-1 text-[13px]" aria-label="Where" />
            <Input id={`reading-${r.key}`} type="number" step="any" inputMode="decimal" value={r.value} onChange={(e) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, value: e.target.value } : x))}
              suffix={k.unit} className="h-8 w-28" aria-label={`${k.label} value`} />
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-clay-600" aria-label="Remove reading"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => add(null, null)}><Plus />Reading for the whole field</Button>
        {avg != null && <p className="text-xs text-stone-500">{values.length} reading{values.length === 1 ? '' : 's'}{pointCount ? ` (${pointCount} on the map)` : ''} · average <span className="font-medium text-stone-800">{fmtNum(avg, 1)} {k.unit}</span></p>}
      </div>
    </div>
  )
}
