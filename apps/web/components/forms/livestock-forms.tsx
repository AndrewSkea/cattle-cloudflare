'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, FormGrid, FormSection, Input, Segmented, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Sheet, useConfirm } from '@/components/ui/overlay'
import { Picker, type PickerOption } from '@/components/ui/picker'
import { api, useAnimalOptions, useFieldsOverview, useParcels, useSave, useStructures } from '@/lib/queries'
import { ApiError } from '@/lib/api'
import { BIRTH_EASE, BREEDS, HEALTH_TYPES, SPECIES, speciesInfo } from '@/lib/constants'
import { addDaysISO, animalLabel, calfNumber, fmtAge, fmtDate, isYoungStockNumber, nextHerdNumber, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Animal, AnimalOption, BirthRecord, BreedingRecord, HealthRecord, Species, WeightRecord } from '@/lib/types'

const LIVESTOCK = ['animals', 'animal', 'health', 'weights', 'breeding', 'births', 'movements', 'families', 'finance', 'land', 'structures']

export function animalOptions(list: AnimalOption[], filter?: (a: AnimalOption) => boolean): PickerOption[] {
  return list
    .filter((a) => (filter ? filter(a) : true))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (a.managementTag || a.tagNo).localeCompare(b.managementTag || b.tagNo, undefined, { numeric: true }))
    .map((a) => ({ value: a.id, label: animalLabel(a), sub: [a.managementTag ? a.tagNo : null, a.formerTags ? `was ${a.formerTags}` : null, a.breed, a.status !== 'active' ? a.status : null].filter(Boolean).join(' · ') }))
}

function SheetFooter({ formId, onClose, busy, label = 'Save' }: { formId: string; onClose: () => void; busy?: boolean; label?: string }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form={formId} loading={busy}>{label}</Button>
    </>
  )
}

// ============================ ANIMAL ============================

export function AnimalSheet({ open, onClose, animal, defaults }: { open: boolean; onClose: () => void; animal?: Animal | null; defaults?: Partial<Animal> }) {
  const { farm } = useSession()
  const router = useRouter()
  const { data: options = [] } = useAnimalOptions()
  const { data: parcels = [] } = useParcels()
  const { data: structures = [] } = useStructures()
  const init = { species: farm.species[0] || 'cattle', sex: 'female', origin: 'born', castrated: false, ...defaults, ...animal } as Partial<Animal>
  const [species, setSpecies] = useState<Species>(init.species as Species)
  const [sex, setSex] = useState<'female' | 'male'>(init.sex as 'female' | 'male')
  const [origin, setOrigin] = useState(init.origin || 'born')
  const [damId, setDamId] = useState<number | null>(init.damId ?? null)
  const [sireId, setSireId] = useState<number | null>(init.sireId ?? null)
  const [error, setError] = useState<string | null>(null)
  const save = useSave((body: any) => animal ? api.put(`/api/animals/${animal.id}`, body) : api.post('/api/animals', body), {
    invalidate: LIVESTOCK, success: animal ? 'Animal updated' : 'Animal added', silentError: true,
    onSuccess: (r: any) => { onClose(); if (!animal) router.push(`/livestock/view?id=${r.data.id}`) },
  })
  const speciesChoices = SPECIES.filter((s) => farm.species.includes(s.value) || s.value === species)

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = formValues(e.currentTarget)
    setError(null)
    save.mutate({ ...v, species, sex, origin, damId, sireId, castrated: sex === 'male' ? !!v.castrated : false }, { onError: (err) => setError(err.message) })
  }

  return (
    <Sheet open={open} onClose={onClose} wide title={animal ? `Edit ${animalLabel(animal)}` : 'Add animal'} description={animal ? undefined : 'Register a new animal on the farm.'}
      footer={<SheetFooter formId="animal-form" onClose={onClose} busy={save.isPending} label={animal ? 'Save changes' : 'Add animal'} />}>
      <form id="animal-form" onSubmit={submit} className="space-y-8">
        <FormSection title="Identity">
          {speciesChoices.length > 1 && (
            <Field label="Species">
              <div className="flex flex-wrap gap-2">
                {speciesChoices.map((s) => (
                  <button key={s.value} type="button" onClick={() => setSpecies(s.value)} aria-pressed={species === s.value}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition ${species === s.value ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-600 ring-stone-200 hover:ring-stone-300'}`}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <FormGrid>
            <TextField label="Official tag / ID" name="tagNo" required defaultValue={init.tagNo} placeholder="UK123456 700001" maxLength={50} />
            <TextField label="Management tag" name="managementTag" defaultValue={init.managementTag ?? ''} placeholder="e.g. 24-12" hint="Short everyday number" />
            <TextField label="Name" name="name" defaultValue={init.name ?? ''} placeholder="Optional" />
            <Field label="Sex" required>
              <Segmented value={sex} onChange={setSex} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} className="w-full [&>button]:flex-1" />
            </Field>
            <Field label="Breed">
              <Input name="breed" aria-label="Breed" list={`breeds-${species}`} defaultValue={init.breed ?? ''} placeholder="Start typing…" />
              <datalist id={`breeds-${species}`}>{(BREEDS[species] || []).map((b) => <option key={b} value={b} />)}</datalist>
            </Field>
            <TextField label="Colour / markings" name="colour" defaultValue={init.colour ?? ''} />
            <TextField label="Date of birth" name="dob" type="date" max={todayISO()} defaultValue={init.dob ?? ''} />
            {species === 'cattle' && (
              <SelectField label="Frame size" name="size" data-number defaultValue={init.size ?? ''} placeholder="—"
                options={[{ value: 1, label: '1 · Large' }, { value: 2, label: '2 · Medium-large' }, { value: 3, label: '3 · Medium-small' }, { value: 4, label: '4 · Small' }]} />
            )}
          </FormGrid>
          {sex === 'male' && <Checkbox name="castrated" defaultChecked={!!init.castrated} label="Castrated" description={species === 'cattle' ? 'Steer / bullock' : species === 'sheep' || species === 'goat' ? 'Wether' : species === 'horse' ? 'Gelding' : undefined} />}
        </FormSection>

        <FormSection title="Parentage" description="Link to parents on this farm to build the family tree.">
          <FormGrid>
            <Field label="Dam (mother)">
              <Picker label="Dam (mother)" options={animalOptions(options, (a) => a.sex === 'female' && a.species === species && a.id !== animal?.id)} value={damId} onChange={setDamId} placeholder="Search females…" />
            </Field>
            <Field label="Sire (father)">
              <Picker label="Sire (father)" options={animalOptions(options, (a) => a.sex === 'male' && a.species === species && a.id !== animal?.id)} value={sireId} onChange={setSireId} placeholder="Search males…" />
            </Field>
            {!sireId && <TextField label="Sire name or breed" name="sireName" defaultValue={init.sireName ?? ''} hint="For AI or bulls not on the farm" className="sm:col-span-2" />}
          </FormGrid>
        </FormSection>

        <FormSection title="Location">
          <FormGrid>
            <SelectField label="Field" name="parcelId" data-number defaultValue={init.parcelId ?? ''} placeholder="Not in a field" options={parcels.map((p) => ({ value: p.id, label: p.name }))} />
            <SelectField label="Building" name="structureId" data-number defaultValue={init.structureId ?? ''} placeholder="Not housed" options={structures.map((p) => ({ value: p.id, label: p.name }))} />
          </FormGrid>
        </FormSection>

        <FormSection title="Origin">
          <Segmented value={origin as 'born' | 'purchased'} onChange={setOrigin} options={[{ value: 'born', label: 'Born on farm' }, { value: 'purchased', label: 'Bought in' }]} />
          {origin === 'purchased' && (
            <FormGrid cols={3}>
              <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={init.purchaseDate ?? ''} />
              <TextField label="Price" name="purchasePrice" type="number" step="0.01" min={0} prefix={farm.currency === 'GBP' ? '£' : undefined} defaultValue={init.purchasePrice ?? ''} />
              <TextField label="Bought from" name="purchaseSource" defaultValue={init.purchaseSource ?? ''} />
            </FormGrid>
          )}
        </FormSection>

        <TextareaField label="Notes" name="notes" defaultValue={init.notes ?? ''} rows={3} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ HEALTH ============================

const COMMON_TREATMENTS = [
  'BVD vaccine', 'IBR vaccine', 'Leptospirosis vaccine', 'Clostridial vaccine', 'Pneumonia vaccine', 'Blackleg vaccine', 'Ringworm vaccine',
  'Worming', 'Fluke treatment', 'Pour-on', 'Feet trimmed', 'Lameness treatment', 'Mastitis treatment', 'Scour treatment',
  'TB test', 'Johne’s test', 'BVD test', 'Blood sample', 'Vet visit', 'Castration', 'Disbudding', 'Dagging', 'Shearing',
]

export function HealthSheet({ open, onClose, record, animalId, animalIds }: {
  open: boolean; onClose: () => void; record?: HealthRecord | null; animalId?: number | null; animalIds?: number[]
}) {
  const { can, currency } = useSession()
  const { data: options = [] } = useAnimalOptions()
  const bulk = !!animalIds?.length && !record
  const [aid, setAid] = useState<number | null>(record?.animalId ?? animalId ?? null)
  const [type, setType] = useState(record?.type || 'vaccination')
  const [date, setDate] = useState(record?.date || todayISO())
  const [meatW, setMeatW] = useState(record?.withdrawalMeatUntil || '')
  const [milkW, setMilkW] = useState(record?.withdrawalMilkUntil || '')
  const [nextDue, setNextDue] = useState(record?.nextDueDate || '')
  const [error, setError] = useState<string | null>(null)
  const save = useSave((body: any) => bulk ? api.post('/api/animals/bulk/health', { ...body, ids: animalIds })
    : record ? api.put(`/api/health/${record.id}`, body) : api.post('/api/health', body), {
    invalidate: LIVESTOCK, silentError: true,
    success: bulk ? `Recorded for ${animalIds!.length} animals` : record ? 'Health record updated' : 'Health record added', onSuccess: onClose,
  })
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = formValues(e.currentTarget)
    if (!bulk && !aid) return setError('Choose an animal')
    setError(null)
    save.mutate({ ...v, animalId: aid, type, date, withdrawalMeatUntil: meatW || null, withdrawalMilkUntil: milkW || null, nextDueDate: nextDue || null }, { onError: (err) => setError(err.message) })
  }
  const quick = (set: (v: string) => void, days: number) => <button type="button" onClick={() => set(addDaysISO(date, days))} className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 hover:bg-stone-200">+{days >= 28 ? `${Math.round(days / 30.4)}m` : `${days}d`}</button>

  return (
    <Sheet open={open} onClose={onClose} title={record ? 'Edit health record' : bulk ? `Treat ${animalIds!.length} animals` : 'Add health record'}
      description="Vaccinations, treatments, tests, procedures and vet visits."
      footer={<SheetFooter formId="health-form" onClose={onClose} busy={save.isPending} />}>
      <form id="health-form" onSubmit={submit} className="space-y-5">
        {!bulk && (
          <Field label="Animal" required>
            <Picker label="Animal" options={animalOptions(options)} value={aid} onChange={setAid} required placeholder="Search by tag or name…" />
          </Field>
        )}
        <Field label="Type">
          <div className="flex flex-wrap gap-1.5">
            {HEALTH_TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setType(t.value)} aria-pressed={type === t.value}
                className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ring-1 transition ${type === t.value ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-stone-600 ring-stone-200 hover:ring-stone-300'}`}>{t.label}</button>
            ))}
          </div>
        </Field>
        <FormGrid>
          <Field label="What was done" required className="sm:col-span-2">
            <Input name="title" aria-label="What was done" required list="treatments" defaultValue={record?.title ?? ''} placeholder="e.g. BVD vaccine" maxLength={150} />
            <datalist id="treatments">{COMMON_TREATMENTS.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Date" required><Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} required max={todayISO()} /></Field>
          <TextField label="Product" name="product" defaultValue={record?.product ?? ''} placeholder="e.g. Bovilis BVD" />
          <TextField label="Dose" name="dose" defaultValue={record?.dose ?? ''} placeholder="e.g. 2 ml IM" />
          <TextField label="Batch number" name="batchNo" defaultValue={record?.batchNo ?? ''} />
          <TextField label="Given by" name="administeredBy" defaultValue={record?.administeredBy ?? ''} />
          <TextField label="Vet" name="vet" defaultValue={record?.vet ?? ''} />
          {type === 'test' && <TextField label="Result" name="result" defaultValue={record?.result ?? ''} placeholder="e.g. Negative" className="sm:col-span-2" />}
        </FormGrid>
        <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
          <FormGrid>
            <Field label="Meat withdrawal until" hint={<span className="flex gap-1">{quick(setMeatW, 7)}{quick(setMeatW, 28)}{quick(setMeatW, 56)}</span>}>
              <Input type="date" aria-label="Meat withdrawal until" value={meatW} onChange={(e) => setMeatW(e.target.value)} />
            </Field>
            <Field label="Milk withdrawal until" hint={<span className="flex gap-1">{quick(setMilkW, 3)}{quick(setMilkW, 7)}</span>}>
              <Input type="date" aria-label="Milk withdrawal until" value={milkW} onChange={(e) => setMilkW(e.target.value)} />
            </Field>
            <Field label="Next due" hint={<span className="flex gap-1">{quick(setNextDue, 28)}{quick(setNextDue, 183)}{quick(setNextDue, 365)}</span>} className="sm:col-span-2">
              <Input type="date" aria-label="Next due" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </Field>
          </FormGrid>
        </div>
        {!bulk && can('manager') && (
          <TextField label="Cost" name="cost" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={record?.cost ?? ''} hint="Added to farm expenses as Vet & medicine" />
        )}
        <TextareaField label="Notes" name="notes" defaultValue={record?.notes ?? ''} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ WEIGHT ============================

export function WeightSheet({ open, onClose, record, animalId }: { open: boolean; onClose: () => void; record?: WeightRecord | null; animalId?: number | null }) {
  const { data: options = [] } = useAnimalOptions()
  const [aid, setAid] = useState<number | null>(record?.animalId ?? animalId ?? null)
  const [error, setError] = useState<string | null>(null)
  const save = useSave((body: any) => record ? api.put(`/api/weights/${record.id}`, body) : api.post('/api/weights', body), {
    invalidate: LIVESTOCK, success: 'Weight saved', silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open={open} onClose={onClose} title={record ? 'Edit weight' : 'Record weight'} footer={<SheetFooter formId="weight-form" onClose={onClose} busy={save.isPending} />}>
      <form id="weight-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        if (!aid) return setError('Choose an animal')
        save.mutate({ ...formValues(e.currentTarget), animalId: aid }, { onError: (err) => setError(err.message) })
      }}>
        {!animalId && <Field label="Animal" required><Picker label="Animal" options={animalOptions(options, (a) => a.status === 'active' || a.id === record?.animalId)} value={aid} onChange={setAid} required /></Field>}
        <FormGrid>
          <TextField label="Date" name="date" type="date" required max={todayISO()} defaultValue={record?.date ?? todayISO()} />
          <TextField label="Weight" name="weightKg" type="number" step="0.1" min={0.1} required suffix="kg" defaultValue={record?.weightKg ?? ''} />
          <TextField label="Body condition score" name="conditionScore" type="number" step="0.5" min={0} max={10} defaultValue={record?.conditionScore ?? ''} hint="Optional, e.g. 1–5" />
        </FormGrid>
        <TextareaField label="Notes" name="notes" defaultValue={record?.notes ?? ''} rows={2} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ BREEDING ============================

export function BreedingSheet({ open, onClose, record, animalId }: { open: boolean; onClose: () => void; record?: BreedingRecord | null; animalId?: number | null }) {
  const { data: options = [] } = useAnimalOptions()
  const [aid, setAid] = useState<number | null>(record?.animalId ?? animalId ?? null)
  const [sireId, setSireId] = useState<number | null>(record?.sireId ?? null)
  const [event, setEvent] = useState<'service' | 'scan' | 'heat'>(record?.event || 'service')
  const [date, setDate] = useState(record?.date || todayISO())
  const [error, setError] = useState<string | null>(null)
  const dam = options.find((a) => a.id === aid)
  const gestation = dam ? speciesInfo(dam.species).gestationDays : undefined
  const save = useSave((body: any) => record ? api.put(`/api/breeding/${record.id}`, body) : api.post('/api/breeding', body), {
    invalidate: LIVESTOCK, success: 'Breeding record saved', silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open={open} onClose={onClose} title={record ? 'Edit breeding record' : 'Record service, scan or heat'} footer={<SheetFooter formId="breeding-form" onClose={onClose} busy={save.isPending} />}>
      <form id="breeding-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        if (!aid) return setError('Choose a female')
        const v = formValues(e.currentTarget)
        save.mutate({ outcome: 'pending', ...v, animalId: aid, sireId, event, date }, { onError: (err) => setError(err.message) })
      }}>
        <Field label="Female" required><Picker label="Female" options={animalOptions(options, (a) => a.sex === 'female' && (a.status === 'active' || a.id === record?.animalId))} value={aid} onChange={setAid} required /></Field>
        <Segmented value={event} onChange={setEvent} options={[{ value: 'service', label: 'Service / AI' }, { value: 'scan', label: 'Pregnancy scan' }, { value: 'heat', label: 'Heat' }]} />
        <FormGrid>
          <Field label="Date" required><Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} required /></Field>
          {event === 'service' && <SelectField label="Method" name="method" defaultValue={record?.method ?? 'natural'} options={[{ value: 'natural', label: 'Natural service' }, { value: 'ai', label: 'Artificial insemination' }, { value: 'et', label: 'Embryo transfer' }]} />}
          {event === 'scan' && <SelectField label="Result" name="scanResult" defaultValue={record?.scanResult ?? 'pregnant'} options={[{ value: 'pregnant', label: 'In calf / pregnant' }, { value: 'empty', label: 'Empty' }, { value: 'unknown', label: 'Unsure' }]} />}
          {event === 'scan' && <TextField label="Number carried" name="fetusCount" type="number" min={0} max={20} defaultValue={record?.fetusCount ?? ''} />}
          {event !== 'heat' && (
            <>
              <Field label="Sire on farm"><Picker label="Sire on farm" options={animalOptions(options, (a) => a.sex === 'male' && (!dam || a.species === dam.species))} value={sireId} onChange={setSireId} placeholder="Search males…" /></Field>
              {!sireId && <TextField label="Sire name / AI straw" name="sireName" defaultValue={record?.sireName ?? ''} />}
              <TextField label="Expected due date" name="expectedDueDate" type="date" defaultValue={record?.expectedDueDate ?? ''}
                hint={gestation && event === 'service' ? `Leave blank to use ${gestation}-day gestation (${fmtDate(addDaysISO(date, gestation))})` : undefined} />
            </>
          )}
          {record && event !== 'heat' && <SelectField label="Outcome" name="outcome" defaultValue={record.outcome} options={[{ value: 'pending', label: 'Pending' }, { value: 'born', label: 'Born' }, { value: 'failed', label: 'Not in calf / failed' }, { value: 'aborted', label: 'Aborted' }]} />}
        </FormGrid>
        <TextareaField label="Notes" name="notes" defaultValue={record?.notes ?? ''} rows={2} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ BIRTH ============================

/** `sire`: prefill from the service the calf came from (the calving list passes it). */
export function BirthSheet({ open, onClose, record, damId, sire }: {
  open: boolean; onClose: () => void; record?: BirthRecord | null; damId?: number | null; sire?: { id: number | null; name: string | null }
}) {
  const { data: options = [] } = useAnimalOptions()
  const [dam, setDam] = useState<number | null>(record?.damId ?? damId ?? null)
  const [sireId, setSireId] = useState<number | null>(record?.sireId ?? sire?.id ?? null)
  const [outcome, setOutcome] = useState<'alive' | 'stillborn' | 'died'>(record?.outcome || 'alive')
  const [sex, setSex] = useState<'female' | 'male' | ''>((record?.sex as any) || '')
  const [register, setRegister] = useState(!record)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(record?.date ?? todayISO())
  const damA = options.find((a) => a.id === dam)
  const suggestedNumber = damA ? calfNumber(damA.managementTag, date, options.map((a) => a.managementTag)) : ''
  const word = damA?.species === 'sheep' ? 'lamb' : damA?.species === 'pig' ? 'piglet' : damA?.species === 'goat' ? 'kid' : damA?.species === 'horse' ? 'foal' : 'calf'
  const save = useSave((body: any) => record ? api.put(`/api/births/${record.id}`, body) : api.post('/api/births', body), {
    invalidate: LIVESTOCK, success: record ? 'Birth updated' : 'Birth recorded', silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open={open} onClose={onClose} wide title={record ? 'Edit birth' : 'Record a birth'} footer={<SheetFooter formId="birth-form" onClose={onClose} busy={save.isPending} />}>
      <form id="birth-form" className="space-y-6" onSubmit={(e) => {
        e.preventDefault()
        if (!dam) return setError('Choose the mother')
        const v = formValues(e.currentTarget)
        const offspring = register && outcome === 'alive' && !record
          ? { tagNo: v.offTagNo, managementTag: v.offManagementTag, name: v.offName, breed: v.offBreed } : null
        if (offspring && !offspring.tagNo) return setError(`Enter the ${word}'s tag to register it, or untick "Register"`)
        save.mutate({
          date: v.date, ease: v.ease, birthWeightKg: v.birthWeightKg, notes: v.notes, sireName: sireId ? null : v.sireName,
          damId: dam, sireId, outcome, sex: sex || null, offspring, offspringId: record?.offspringId ?? null,
        }, { onError: (err) => setError(err.message) })
      }}>
        <FormGrid>
          <Field label="Mother" required><Picker label="Mother" options={animalOptions(options, (a) => a.sex === 'female' && (a.status === 'active' || a.id === record?.damId))} value={dam} onChange={setDam} required /></Field>
          <TextField label="Date of birth" name="date" type="date" required max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Outcome"><Segmented value={outcome} onChange={setOutcome} options={[{ value: 'alive', label: 'Alive' }, { value: 'stillborn', label: 'Stillborn' }, { value: 'died', label: 'Died' }]} /></Field>
          <Field label="Sex"><Segmented value={(sex || 'unknown') as any} onChange={(v: string) => setSex(v === 'unknown' ? '' : v as any)} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'unknown', label: 'Unknown' }]} /></Field>
          <SelectField label="Ease" name="ease" defaultValue={record?.ease ?? 'unassisted'} options={BIRTH_EASE} />
          <TextField label="Birth weight" name="birthWeightKg" type="number" step="0.1" min={0} suffix="kg" defaultValue={record?.birthWeightKg ?? ''} />
          <Field label="Sire on farm"><Picker label="Sire on farm" options={animalOptions(options, (a) => a.sex === 'male' && (!damA || a.species === damA.species))} value={sireId} onChange={setSireId} placeholder="Search males…" /></Field>
          {!sireId && <TextField label="Sire name / breed" name="sireName" defaultValue={record?.sireName ?? sire?.name ?? ''} />}
        </FormGrid>
        {!record && outcome === 'alive' && (
          <div className="space-y-4 rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
            <Checkbox checked={register} onChange={(e) => setRegister(e.target.checked)} label={`Register the ${word} as a new animal`} description="Creates its record linked to the mother and sire" />
            {register && (
              <FormGrid>
                <TextField label="Tag / ID" name="offTagNo" required placeholder="Official tag" />
                <TextField key={suggestedNumber} label="Management tag" name="offManagementTag" defaultValue={suggestedNumber}
                  hint={suggestedNumber ? "Mother's number and year; for twins use -A and -B" : undefined} />
                <TextField label="Name" name="offName" />
                <TextField label="Breed" name="offBreed" placeholder={damA?.breed || ''} hint="Defaults to the mother's breed" />
              </FormGrid>
            )}
          </div>
        )}
        <TextareaField label="Notes" name="notes" defaultValue={record?.notes ?? ''} rows={2} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ EXIT (sale / death) ============================

export function ExitSheet({ open, onClose, animal }: { open: boolean; onClose: () => void; animal: Animal }) {
  const { currency } = useSession()
  const confirm = useConfirm()
  const [status, setStatus] = useState<'sold' | 'died' | 'culled' | 'missing'>('sold')
  const [error, setError] = useState<string | null>(null)
  const save = useSave((body: any) => api.post(`/api/animals/${animal.id}/exit`, body), { invalidate: LIVESTOCK, silentError: true, success: 'Saved', onSuccess: onClose })
  const isSale = status === 'sold' || status === 'culled'
  return (
    <Sheet open={open} onClose={onClose} title={`Record sale or death · ${animalLabel(animal)}`} footer={<SheetFooter formId="exit-form" onClose={onClose} busy={save.isPending} />}>
      <form id="exit-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        const v = formValues(e.currentTarget)
        const body = { ...v, status }
        save.mutate(body, {
          onError: async (err) => {
            if (err instanceof ApiError && err.status === 409 && err.details?.code === 'withdrawal') {
              if (await confirm({ title: 'Withdrawal period still active', description: err.message + ' Record the sale anyway?', confirmLabel: 'Record sale', danger: true })) {
                save.mutate({ ...body, overrideWithdrawal: true }, { onError: (e2) => setError(e2.message) })
              }
            } else setError(err.message)
          },
        })
      }}>
        <Segmented value={status} onChange={setStatus} options={[{ value: 'sold', label: 'Sold' }, { value: 'culled', label: 'Culled' }, { value: 'died', label: 'Died' }, { value: 'missing', label: 'Missing' }]} />
        <FormGrid>
          <TextField label="Date" name="exitDate" type="date" required max={todayISO()} defaultValue={todayISO()} />
          {isSale && <TextField label="Buyer / market" name="buyer" />}
          {isSale && <TextField label="Price" name="salePrice" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} hint="Added to income as Livestock sales" />}
          {isSale && <TextField label="Weight" name="saleWeightKg" type="number" step="0.1" min={0} suffix="kg" />}
          {(isSale || status === 'died') && <TextField label="Carcase weight" name="carcaseWeightKg" type="number" step="0.1" min={0} suffix="kg" hint="Deadweight, from the abattoir" />}
          {(isSale || status === 'died') && <TextField label="Carcase grade" name="carcaseGrade" placeholder="e.g. R4L" maxLength={10} hint="EUROP conformation + fat class" />}
        </FormGrid>
        <TextareaField label={status === 'died' ? 'Cause of death' : 'Reason / notes'} name="exitReason" rows={3} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

// ============================ MOVE ============================

export function MoveSheet({ open, onClose, animalIds }: { open: boolean; onClose: () => void; animalIds: number[] }) {
  const { data: parcels = [] } = useParcels()
  const { data: structures = [] } = useStructures()
  const { data: fields } = useFieldsOverview()
  const [to, setTo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const noGraze = to ? fields?.fields.find((f) => f.parcelId === to)?.noGrazeUntil : null
  const save = useSave((body: any) => api.post('/api/animals/bulk/move', { ...body, ids: animalIds }), {
    invalidate: LIVESTOCK, success: `Moved ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'}`, silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open={open} onClose={onClose} title={`Move ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'}`} description="Moves are kept in each animal's history." footer={<SheetFooter formId="move-form" onClose={onClose} busy={save.isPending} label="Move" />}>
      <form id="move-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(formValues(e.currentTarget), { onError: (err) => setError(err.message) }) }}>
        <SelectField label="To field" name="parcelId" data-number placeholder="No field" onChange={(e) => setTo(e.target.value ? Number(e.target.value) : null)}
          options={parcels.map((p) => ({ value: p.id, label: `${p.name}${p.animalCount ? ` (${p.animalCount} now)` : ''}` }))} />
        {noGraze && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-800 ring-1 ring-clay-200">This field was sprayed: keep stock off until {fmtDate(noGraze)}.</p>}
        <SelectField label="Into building" name="structureId" data-number placeholder="Not housed" options={structures.map((p) => ({ value: p.id, label: p.name }))} />
        <TextField label="Date" name="date" type="date" required defaultValue={todayISO()} max={todayISO()} />
        <TextareaField label="Notes" name="notes" rows={2} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

export function useAnimalMap() {
  const { data = [] } = useAnimalOptions()
  return useMemo(() => new Map(data.map((a) => [a.id, a])), [data])
}


// ============================ RENUMBER ============================

/**
 * Give young stock their own herd numbers (e.g. heifers "97/24" or "12.24" joining the cows). Shows the selected
 * animals, or else every heifer over a year old that still has a calf or heifer number.
 */
export function RenumberSheet({ open, onClose, animalIds }: { open: boolean; onClose: () => void; animalIds?: number[] }) {
  const { data: options = [] } = useAnimalOptions()
  const rows = useMemo(() => {
    const picked = animalIds?.length
      ? options.filter((a) => animalIds.includes(a.id))
      : options.filter((a) => a.status === 'active' && a.sex === 'female' && isYoungStockNumber(a.managementTag)
        && a.dob && (Date.now() - Date.parse(a.dob)) / 2.63e9 >= 12)
    return picked.sort((a, b) => (a.dob || '').localeCompare(b.dob || '') || a.tagNo.localeCompare(b.tagNo))
  }, [options, animalIds])
  const [values, setValues] = useState<Record<number, string>>({})
  // Heifers about two years old are the ones joining the cows; tick those to start with.
  const [include, setInclude] = useState<Set<number>>(() => new Set())
  const [touched, setTouched] = useState(false)
  const ticked = touched ? include : new Set(rows.filter((a) => animalIds?.length || (a.dob && (Date.now() - Date.parse(a.dob)) / 2.63e9 >= 22)).map((a) => a.id))
  const toggle = (id: number) => { const n = new Set(ticked); if (n.has(id)) n.delete(id); else n.add(id); setInclude(n); setTouched(true) }
  const [start, setStart] = useState<string>('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const next = nextHerdNumber(options)
  const save = useSave((body: any) => api.post<{ changed: number }>('/api/animals/bulk/renumber', body), {
    invalidate: LIVESTOCK, success: 'Numbers updated', silentError: true, onSuccess: onClose,
  })
  const fill = () => {
    let n = Number(start || next)
    const v: Record<number, string> = {}
    for (const a of rows) if (ticked.has(a.id)) v[a.id] = String(n++)
    setValues(v)
  }
  const changes = rows.filter((a) => ticked.has(a.id) && values[a.id]?.trim()).map((a) => ({ id: a.id, managementTag: values[a.id].trim() }))
  return (
    <Sheet open={open} onClose={onClose} wide title="Give animals new numbers"
      description="Their old numbers are kept, so you can still find them by either."
      footer={<SheetFooter formId="renumber-form" onClose={onClose} busy={save.isPending} label={changes.length ? `Renumber ${changes.length}` : 'Renumber'} />}>
      <form id="renumber-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        if (!changes.length) return setError('Enter at least one new number')
        save.mutate({ date, changes }, { onError: (err) => setError(err.message) })
      }}>
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No heifers over a year old are waiting for their own number. Select animals in the list to renumber others.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Start from"><Input type="number" min={1} aria-label="Start from" value={start} placeholder={String(next)} onChange={(e) => setStart(e.target.value)} className="w-28" /></Field>
              <Button type="button" variant="secondary" onClick={fill} disabled={!ticked.size}>Number the {ticked.size} ticked in order</Button>
              <Field label="Date of change"><Input type="date" aria-label="Date of change" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
            <div className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {rows.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <input type="checkbox" className="size-4 rounded border-stone-300 text-brand-600 focus-ring" aria-label={`Renumber ${a.tagNo}`}
                    checked={ticked.has(a.id)} onChange={() => toggle(a.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-900">{a.managementTag || a.tagNo}</p>
                    <p className="truncate text-xs text-stone-500">{a.tagNo}{a.breed ? ` · ${a.breed}` : ''}{a.dob ? ` · ${fmtAge((Date.now() - Date.parse(a.dob)) / 2.63e9)}` : ''}</p>
                  </div>
                  <Input aria-label={`New number for ${a.tagNo}`} className="w-28" value={values[a.id] ?? ''} placeholder="New no." disabled={!ticked.has(a.id)}
                    onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))} />
                </div>
              ))}
            </div>
          </>
        )}
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

type ScanChoice = 'pregnant' | 'twins' | 'empty' | 'unknown' | ''

/**
 * Scan results for a whole batch on the scanner's visit: every female with a service still waiting for a result,
 * one tap each. Others can be added from the picker (e.g. cows with the bull but no recorded service).
 */
export function ScanSheet({ open, onClose, breeding }: { open: boolean; onClose: () => void; breeding: BreedingRecord[] }) {
  const { data: options = [] } = useAnimalOptions()
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const [extra, setExtra] = useState<number[]>([])
  const [adding, setAdding] = useState<number | null>(null)
  const [choice, setChoice] = useState<Record<number, ScanChoice>>({})

  // Females whose latest pending record is a service (no scan since), in tag order
  const waiting = useMemo(() => {
    const latest = new Map<number, BreedingRecord>()
    for (const b of breeding) {
      if (b.outcome !== 'pending' || b.event === 'heat' || b.animalStatus !== 'active') continue
      const cur = latest.get(b.animalId)
      if (!cur || b.date > cur.date || (b.date === cur.date && b.id > cur.id)) latest.set(b.animalId, b)
    }
    return [...latest.values()].filter((b) => b.event === 'service')
      .sort((a, b) => (a.animalTag || '').localeCompare(b.animalTag || '', undefined, { numeric: true }))
  }, [breeding])
  const rows = [
    ...waiting.map((b) => ({ id: b.animalId, tag: b.animalTag || `#${b.animalId}`, sub: `Served ${fmtDate(b.date)}${b.sireTag || b.sireName ? ` · ${b.sireTag || b.sireName}` : ''}` })),
    ...extra.map((id) => { const a = options.find((o) => o.id === id); return { id, tag: a ? animalLabel(a) : `#${id}`, sub: 'No service recorded' } }),
  ]
  const set = (id: number, v: ScanChoice) => setChoice((c) => ({ ...c, [id]: c[id] === v ? '' : v }))
  const counts = Object.values(choice).reduce((m, v) => { if (v) m[v === 'twins' ? 'pregnant' : v] = (m[v === 'twins' ? 'pregnant' : v] || 0) + 1; return m }, {} as Record<string, number>)
  const chosen = rows.filter((r) => choice[r.id])

  const save = useSave((body: any) => api.post<{ data: { saved: number; pregnant: number; empty: number } }>('/api/breeding/scans', body).then((r) => r.data), {
    invalidate: LIVESTOCK, silentError: true, onSuccess: onClose,
    success: (r) => `Saved ${r.saved} scan result${r.saved === 1 ? '' : 's'}: ${r.pregnant} in calf, ${r.empty} empty`,
  })
  const OPTIONS: { v: ScanChoice; label: string; on: string }[] = [
    { v: 'pregnant', label: 'In calf', on: 'bg-emerald-600 text-white ring-emerald-600' },
    { v: 'twins', label: 'Twins', on: 'bg-emerald-700 text-white ring-emerald-700' },
    { v: 'empty', label: 'Empty', on: 'bg-clay-600 text-white ring-clay-600' },
    { v: 'unknown', label: 'Unsure', on: 'bg-stone-600 text-white ring-stone-600' },
  ]
  return (
    <Sheet open={open} onClose={onClose} wide title="Scan results"
      description="Tap a result for each cow scanned. Cows left blank aren’t changed. In-calf cows keep the due date from their service."
      footer={<SheetFooter formId="scan-form" onClose={onClose} busy={save.isPending} label={chosen.length ? `Save ${chosen.length} result${chosen.length === 1 ? '' : 's'}` : 'Save'} />}>
      <form id="scan-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        if (!chosen.length) return setError('Choose a result for at least one cow')
        save.mutate({
          date,
          results: chosen.map((r) => ({ animalId: r.id, result: choice[r.id] === 'twins' ? 'pregnant' : choice[r.id], fetusCount: choice[r.id] === 'twins' ? 2 : choice[r.id] === 'pregnant' ? 1 : null })),
        }, { onError: (err) => setError(err.message) })
      }}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Scan date" required><Input type="date" aria-label="Scan date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} required className="w-44" /></Field>
          {rows.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setChoice(Object.fromEntries(rows.map((r) => [r.id, choice[r.id] || 'pregnant'])))}>Mark the rest in calf</Button>
          )}
          <p className="ml-auto text-sm text-stone-500">{counts.pregnant || 0} in calf · {counts.empty || 0} empty{counts.unknown ? ` · ${counts.unknown} unsure` : ''}</p>
        </div>
        {rows.length === 0 && <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No services are waiting for a scan result. Add a cow below to record her scan.</p>}
        <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <p className="font-semibold text-stone-900">{r.tag}</p>
                <p className="truncate text-xs text-stone-500">{r.sub}</p>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Scan result for ${r.tag}`}>
                {OPTIONS.map((o) => (
                  <button key={o.v} type="button" role="radio" aria-checked={choice[r.id] === o.v} onClick={() => set(r.id, o.v)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition ${choice[r.id] === o.v ? o.on : 'bg-white text-stone-600 ring-stone-200 hover:ring-stone-300'}`}>{o.label}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <Field label="Add another cow">
          <Picker label="Add another cow" options={animalOptions(options, (a) => a.sex === 'female' && a.status === 'active' && !rows.some((r) => r.id === a.id))}
            value={adding} onChange={(id) => { if (id) { setExtra((x) => [...x, id]); setAdding(null) } }} placeholder="Search females…" />
        </Field>
        <FormError error={error} />
      </form>
    </Sheet>
  )
}
