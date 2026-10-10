'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Home, Map as MapIcon, MapPin, Move, Pencil, PenTool, Plus, Shapes, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, DescriptionList, EmptyState, PageHeader, Skeleton } from '@/components/ui/display'
import { FormError, FormGrid, Input, SelectField, TextField, TextareaField, Field, formValues } from '@/components/ui/form'
import { Menu, MenuItem, Sheet, Tabs, useConfirm, useToast } from '@/components/ui/overlay'
import { api, useParcels, useSave, useStructures } from '@/lib/queries'
import { LAND_USES, STRUCTURE_KINDS, TENURES, landUse, speciesInfo, structureKind } from '@/lib/constants'
import { fmtArea, fmtMoney, fmtNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Parcel, Structure } from '@/lib/types'
import type { MapMode, Selection } from '@/components/map/farm-map'

const FarmMap = dynamic(() => import('@/components/map/farm-map'), { ssr: false, loading: () => <Skeleton className="h-[560px] rounded-2xl" /> })

export default function LandPage() {
  const { farm, can, currency } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: parcels, isLoading: lp } = useParcels()
  const { data: structures, isLoading: ls } = useStructures()
  const [mode, setMode] = useState<MapMode>({ kind: 'view' })
  const [selected, setSelected] = useState<Selection>(null)
  const [list, setList] = useState<'fields' | 'buildings'>('fields')
  const [sheet, setSheet] = useState<null | { kind: 'parcel'; parcel?: Parcel; polygon?: string; areaHa?: number } | { kind: 'structure'; structure?: Structure; lat?: number; lng?: number }>(null)

  const invalidate = ['land', 'structures', 'animals']
  const patchParcel = useSave(({ id, body }: { id: number; body: any }) => api.put(`/api/land/${id}`, body), { invalidate, success: 'Field updated' })
  const patchStructure = useSave(({ id, body }: { id: number; body: any }) => api.put(`/api/structures/${id}`, body), { invalidate, success: 'Building moved' })
  const delParcel = useSave((id: number) => api.del(`/api/land/${id}`), { invalidate, success: 'Field deleted', onSuccess: () => setSelected(null) })
  const delStructure = useSave((id: number) => api.del(`/api/structures/${id}`), { invalidate, success: 'Building deleted', onSuccess: () => setSelected(null) })

  const totals = useMemo(() => {
    const p = parcels || []
    const area = p.reduce((s, x) => s + (x.areaHa || 0), 0)
    const owned = p.filter((x) => x.tenure === 'owned').reduce((s, x) => s + (x.areaHa || 0), 0)
    const rent = p.reduce((s, x) => s + (x.rentAnnual || 0), 0)
    const grazing = p.reduce((s, x) => s + x.animalCount, 0)
    return { area, owned, rented: area - owned, rent, grazing }
  }, [parcels])

  if (lp || ls || !parcels || !structures) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-[560px] rounded-2xl" /></div>

  const selParcel = selected?.type === 'parcel' ? parcels.find((p) => p.id === selected.id) : null
  const selStructure = selected?.type === 'structure' ? structures.find((s) => s.id === selected.id) : null
  const noLocation = farm.latitude == null && !parcels.some((p) => p.polygon)

  return (
    <div className="space-y-6">
      <PageHeader title="Land & map" description={parcels.length ? `${parcels.length} fields · ${fmtArea(totals.area, farm.areaUnit)} · ${structures.length} buildings and points` : 'Map your fields, barns and water points.'}
        actions={can('worker') && <>
          {can('manager') && <Button variant="secondary" onClick={() => { setSelected(null); setMode({ kind: 'draw-boundary' }) }}><Shapes />Farm boundary</Button>}
          <Button variant="secondary" onClick={() => { setSelected(null); setMode({ kind: 'place-structure' }) }}><MapPin />Add building</Button>
          <Button onClick={() => { setSelected(null); setMode({ kind: 'draw-parcel' }) }}><PenTool />Draw field</Button>
        </>} />

      {noLocation && (
        <Card className="flex items-center gap-4 bg-wheat-50 p-4 ring-wheat-200">
          <Home className="size-5 shrink-0 text-wheat-700" />
          <p className="flex-1 text-sm text-stone-700">Set your farm’s location so the map opens on your land.</p>
          <Link href="/settings" className="text-sm font-medium text-brand-700 hover:underline">Set location</Link>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <FarmMap
          center={farm}
          boundary={farm.boundary}
          parcels={parcels}
          structures={structures}
          areaUnit={farm.areaUnit}
          selected={selected}
          mode={mode}
          height={600}
          onSelect={(s) => { if (mode.kind === 'view') { setSelected(s); setList(s?.type === 'structure' ? 'buildings' : 'fields') } }}
          onCancel={() => setMode({ kind: 'view' })}
          onDrawn={async (geojson, areaHa) => {
            if (mode.kind === 'draw-boundary') {
              setMode({ kind: 'view' })
              try {
                await api.put('/api/farm', { boundary: geojson })
                qc.invalidateQueries({ queryKey: ['me'] })
                toast(`Farm boundary saved (${fmtArea(areaHa, farm.areaUnit)})`)
              } catch (e: any) { toast(e.message, 'error') }
              return
            }
            setMode({ kind: 'view' })
            setSheet({ kind: 'parcel', polygon: geojson, areaHa })
          }}
          onEdited={(id, geojson, areaHa) => { setMode({ kind: 'view' }); patchParcel.mutate({ id, body: { polygon: geojson, areaHa } }) }}
          onPlaced={(lat, lng, id) => {
            setMode({ kind: 'view' })
            if (id) patchStructure.mutate({ id, body: { latitude: lat, longitude: lng } })
            else setSheet({ kind: 'structure', lat, lng })
          }}
        />

        <div className="space-y-4">
          {selParcel || selStructure ? (
            <Card className="animate-slide-up">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                  {selParcel
                    ? <span className="size-10 rounded-xl ring-1 ring-black/5" style={{ background: selParcel.color || landUse(selParcel.landUse).color }} />
                    : <span className="grid size-10 place-items-center rounded-xl bg-stone-100 text-xl">{structureKind(selStructure!.kind).emoji}</span>}
                  <div>
                    <h2 className="font-semibold text-stone-900">{selParcel?.name || selStructure?.name}</h2>
                    <p className="text-xs text-stone-500">{selParcel ? `${landUse(selParcel.landUse).label} · ${fmtArea(selParcel.areaHa, farm.areaUnit)}` : structureKind(selStructure!.kind).label}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Close"><X className="size-4" /></button>
              </div>
              <div className="border-t border-stone-100 p-5">
                {selParcel ? (
                  <DescriptionList items={[
                    { label: 'Tenure', value: TENURES.find((t) => t.value === selParcel.tenure)?.label },
                    { label: 'Rent / year', value: fmtMoney(selParcel.rentAnnual, currency, { decimals: false }), hidden: !selParcel.rentAnnual || !can('manager') },
                    { label: 'Grazing now', value: selParcel.animalCount ? Object.entries(selParcel.animalsBySpecies).map(([s, n]) => `${n} ${speciesInfo(s).plural.toLowerCase()}`).join(', ') : 'Empty' },
                    { label: 'Capacity', value: selParcel.capacity, hidden: !selParcel.capacity },
                    { label: 'Stocking', value: selParcel.areaHa && selParcel.animalCount ? `${fmtNum(selParcel.animalCount / selParcel.areaHa, 1)} / ha` : '—' },
                    { label: 'Soil', value: selParcel.soilType, hidden: !selParcel.soilType },
                  ]} />
                ) : (
                  <DescriptionList items={[
                    { label: 'Housing now', value: selStructure!.animalCount || 'Empty' },
                    { label: 'Capacity', value: selStructure!.capacity, hidden: !selStructure!.capacity },
                    { label: 'Condition', value: selStructure!.condition, hidden: !selStructure!.condition },
                    { label: 'In field', value: parcels.find((p) => p.id === selStructure!.parcelId)?.name, hidden: !selStructure!.parcelId },
                  ]} />
                )}
                {(selParcel?.notes || selStructure?.notes) && <p className="mt-4 whitespace-pre-wrap text-sm text-stone-600">{selParcel?.notes || selStructure?.notes}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  {(selParcel?.animalCount || selStructure?.animalCount) ? <Link href={`/livestock?location=${encodeURIComponent((selParcel?.name || selStructure?.name)!)}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50">View animals</Link> : null}
                  {can('worker') && selParcel && <>
                    <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'parcel', parcel: selParcel })}><Pencil />Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => selParcel.polygon ? setMode({ kind: 'edit-parcel', id: selParcel.id }) : setMode({ kind: 'draw-parcel' })}><Shapes />{selParcel.polygon ? 'Reshape' : 'Draw'}</Button>
                  </>}
                  {can('worker') && selStructure && <>
                    <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'structure', structure: selStructure })}><Pencil />Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => setMode({ kind: 'place-structure', id: selStructure.id })}><Move />Move pin</Button>
                  </>}
                  {can('manager') && <Button size="sm" variant="danger-ghost" onClick={async () => {
                    const name = selParcel?.name || selStructure?.name
                    if (await confirm({ title: `Delete ${name}?`, description: 'Animals in it will be left without a location.', confirmLabel: 'Delete', danger: true })) {
                      selParcel ? delParcel.mutate(selParcel.id) : delStructure.mutate(selStructure!.id)
                    }
                  }}><Trash2 />Delete</Button>}
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4"><p className="text-xs text-stone-500">Total land</p><p className="mt-1 font-display text-2xl font-semibold text-stone-900">{fmtArea(totals.area, farm.areaUnit)}</p></Card>
              <Card className="p-4"><p className="text-xs text-stone-500">Owned / rented</p><p className="mt-1 text-sm font-semibold text-stone-900">{fmtArea(totals.owned, farm.areaUnit)}<span className="font-normal text-stone-400"> / </span>{fmtArea(totals.rented, farm.areaUnit)}</p></Card>
              <Card className="p-4"><p className="text-xs text-stone-500">Animals grazing</p><p className="mt-1 font-display text-2xl font-semibold text-stone-900">{totals.grazing}</p></Card>
              {can('manager') && <Card className="p-4"><p className="text-xs text-stone-500">Rent per year</p><p className="mt-1 font-display text-2xl font-semibold text-stone-900">{fmtMoney(totals.rent, currency, { decimals: false })}</p></Card>}
            </div>
          )}

          <Card>
            <div className="px-4 pt-3"><Tabs value={list} onChange={setList} tabs={[{ value: 'fields', label: 'Fields', count: parcels.length }, { value: 'buildings', label: 'Buildings & points', count: structures.length }]} /></div>
            {list === 'fields' ? (parcels.length === 0 ? <EmptyState icon={MapIcon} title="No fields yet" description="Click “Draw field” and trace a field on the map." className="py-10" /> : (
              <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
                {parcels.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setSelected({ type: 'parcel', id: p.id })} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50', selected?.type === 'parcel' && selected.id === p.id && 'bg-brand-50/60')}>
                      <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: p.color || landUse(p.landUse).color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-900">{p.name}</span>
                        <span className="block text-xs text-stone-500">{landUse(p.landUse).label}{p.tenure !== 'owned' ? ` · ${TENURES.find((t) => t.value === p.tenure)?.label}` : ''}{!p.polygon ? ' · not on map' : ''}</span>
                      </span>
                      <span className="text-right text-xs text-stone-500 tabular">{fmtArea(p.areaHa, farm.areaUnit)}{p.animalCount > 0 && <span className="block text-brand-700">{p.animalCount} head</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )) : (structures.length === 0 ? <EmptyState icon={MapPin} title="No buildings yet" description="Pin barns, sheds, water troughs and gates." className="py-10" /> : (
              <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
                {structures.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setSelected({ type: 'structure', id: s.id })} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50', selected?.type === 'structure' && selected.id === s.id && 'bg-brand-50/60')}>
                      <span className="text-lg">{structureKind(s.kind).emoji}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-stone-900">{s.name}</span><span className="block text-xs text-stone-500">{structureKind(s.kind).label}{s.latitude == null ? ' · not on map' : ''}</span></span>
                      {s.animalCount > 0 && <Badge tone="brand">{s.animalCount}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
            {can('worker') && (
              <div className="border-t border-stone-100 p-3">
                <Menu align="left" trigger={<Button size="sm" variant="ghost"><Plus />Add without map</Button>}>
                  <MenuItem onClick={() => setSheet({ kind: 'parcel' })}>Field</MenuItem>
                  <MenuItem onClick={() => setSheet({ kind: 'structure' })}>Building or point</MenuItem>
                </Menu>
              </div>
            )}
          </Card>
        </div>
      </div>

      {sheet?.kind === 'parcel' && <ParcelSheet onClose={() => setSheet(null)} parcel={sheet.parcel} polygon={sheet.polygon} areaHa={sheet.areaHa} onSaved={(id) => setSelected({ type: 'parcel', id })} />}
      {sheet?.kind === 'structure' && <StructureSheet onClose={() => setSheet(null)} structure={sheet.structure} lat={sheet.lat} lng={sheet.lng} parcels={parcels} onSaved={(id) => setSelected({ type: 'structure', id })} />}
    </div>
  )
}

function ParcelSheet({ onClose, parcel, polygon, areaHa, onSaved }: { onClose: () => void; parcel?: Parcel; polygon?: string; areaHa?: number; onSaved: (id: number) => void }) {
  const { farm, can, currency } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [use, setUse] = useState(parcel?.landUse || 'pasture')
  const [tenure, setTenure] = useState(parcel?.tenure || 'owned')
  const save = useSave((b: any) => parcel ? api.put(`/api/land/${parcel.id}`, b) : api.post('/api/land', b), {
    invalidate: ['land'], success: parcel ? 'Field updated' : 'Field added', silentError: true, onSuccess: (r: any) => { onSaved(r.data.id); onClose() },
  })
  const area = parcel?.areaHa ?? areaHa
  const displayArea = area != null ? (farm.areaUnit === 'ac' ? Math.round(area * 2.47105 * 100) / 100 : area) : ''
  return (
    <Sheet open onClose={onClose} title={parcel ? `Edit ${parcel.name}` : 'New field'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="parcel-form" loading={save.isPending}>Save</Button></>}>
      <form id="parcel-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        const v = formValues(e.currentTarget)
        const ha = v.area == null ? null : farm.areaUnit === 'ac' ? v.area / 2.47105 : v.area
        delete v.area
        save.mutate({ ...v, landUse: use, tenure, areaHa: ha, ...(polygon ? { polygon } : {}) }, { onError: (err) => setError(err.message) })
      }}>
        <TextField label="Field name" name="name" required defaultValue={parcel?.name} placeholder="e.g. Top Park" maxLength={100} />
        <Field label="Use">
          <div className="flex flex-wrap gap-1.5">
            {LAND_USES.map((l) => (
              <button key={l.value} type="button" onClick={() => setUse(l.value)} aria-pressed={use === l.value}
                className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-medium ring-1 transition', use === l.value ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-600 ring-stone-200')}>
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />{l.label}
              </button>
            ))}
          </div>
        </Field>
        <FormGrid>
          <TextField label={`Area (${farm.areaUnit})`} name="area" type="number" step="0.01" min={0} defaultValue={displayArea} hint={polygon || parcel?.polygon ? 'Measured from the map, edit if needed' : undefined} />
          <TextField label="Capacity (head)" name="capacity" type="number" min={0} defaultValue={parcel?.capacity ?? ''} />
          <SelectField label="Tenure" value={tenure} onChange={(e) => setTenure(e.target.value)} options={TENURES} />
          {tenure !== 'owned' && can('manager') && <TextField label="Rent per year" name="rentAnnual" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={parcel?.rentAnnual ?? ''} />}
          <TextField label="Soil type" name="soilType" defaultValue={parcel?.soilType ?? ''} />
          <Field label="Colour on map"><Input type="color" name="color" defaultValue={parcel?.color || landUse(use).color} className="h-9 w-full p-1" /></Field>
        </FormGrid>
        <TextareaField label="Notes" name="notes" defaultValue={parcel?.notes ?? ''} placeholder="Drainage, reseeding, fencing…" />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

function StructureSheet({ onClose, structure, lat, lng, parcels, onSaved }: { onClose: () => void; structure?: Structure; lat?: number; lng?: number; parcels: Parcel[]; onSaved: (id: number) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState(structure?.kind || 'barn')
  const save = useSave((b: any) => structure ? api.put(`/api/structures/${structure.id}`, b) : api.post('/api/structures', b), {
    invalidate: ['structures'], success: structure ? 'Building updated' : 'Building added', silentError: true, onSuccess: (r: any) => { onSaved(r.data.id); onClose() },
  })
  return (
    <Sheet open onClose={onClose} title={structure ? `Edit ${structure.name}` : 'New building or point'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="structure-form" loading={save.isPending}>Save</Button></>}>
      <form id="structure-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ ...formValues(e.currentTarget), kind, ...(lat != null ? { latitude: lat, longitude: lng } : {}) }, { onError: (err) => setError(err.message) })
      }}>
        <Field label="Type">
          <div className="grid grid-cols-3 gap-1.5">
            {STRUCTURE_KINDS.map((k) => (
              <button key={k.value} type="button" onClick={() => setKind(k.value)} aria-pressed={kind === k.value}
                className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium ring-1 transition', kind === k.value ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-600 ring-stone-200')}>
                <span>{k.emoji}</span><span className="truncate">{k.label}</span>
              </button>
            ))}
          </div>
        </Field>
        <TextField label="Name" name="name" required defaultValue={structure?.name} placeholder="e.g. Cattle shed" maxLength={100} />
        <FormGrid>
          <SelectField label="In field" name="parcelId" data-number defaultValue={structure?.parcelId ?? ''} placeholder="—" options={parcels.map((p) => ({ value: p.id, label: p.name }))} />
          <TextField label="Capacity (head)" name="capacity" type="number" min={0} defaultValue={structure?.capacity ?? ''} />
          <SelectField label="Condition" name="condition" defaultValue={structure?.condition ?? ''} placeholder="—" options={[{ value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }]} />
        </FormGrid>
        <TextareaField label="Notes" name="notes" defaultValue={structure?.notes ?? ''} />
        {lat == null && structure?.latitude == null && <p className="text-xs text-stone-500">Tip: use “Add building” above the map to drop a pin where it is.</p>}
        <FormError error={error} />
      </form>
    </Sheet>
  )
}
