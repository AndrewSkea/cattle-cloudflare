'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Download, LayoutList, Lock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, PageHeader } from '@/components/ui/display'
import { Field, FormError, FormGrid, Input, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Modal, useToast } from '@/components/ui/overlay'
import { api } from '@/lib/api'
import { HIDEABLE_SECTIONS, SPECIES } from '@/lib/constants'
import { downloadUrl } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Species } from '@/lib/types'
import type { LatLngZoom } from '@/components/map/location-picker'

const LocationPicker = dynamic(() => import('@/components/map/location-picker'), { ssr: false, loading: () => <div className="h-[320px] animate-pulse rounded-xl bg-stone-200" /> })

export default function SettingsPage() {
  const { farm, can, role } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const editable = can('manager')
  const [species, setSpecies] = useState<Species[]>(farm.species)
  const [hidden, setHidden] = useState<string[]>(farm.hiddenSections || [])
  const [loc, setLoc] = useState<LatLngZoom | null>(farm.latitude != null && farm.longitude != null ? { latitude: farm.latitude, longitude: farm.longitude, zoom: farm.zoom ?? 15 } : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const v = formValues(e.currentTarget)
      await api.put('/api/farm', { ...v, species, hiddenSections: hidden, latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null, zoom: loc?.zoom ?? null })
      await qc.invalidateQueries({ queryKey: ['me'] })
      toast('Farm settings saved')
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  const removeFarm = async () => {
    try {
      await api.del('/api/farm', { confirmName })
      qc.clear()
      window.location.href = '/onboarding'
    } catch (err: any) { toast(err.message, 'error') }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Farm settings" description={editable ? 'Details, location and preferences for this farm.' : 'Only managers and owners can change these settings.'} />
      <form onSubmit={save} className="space-y-6">
        <fieldset disabled={!editable} className="space-y-6">
          <Card>
            <CardHeader title="Farm details" />
            <div className="space-y-5 p-5">
              <FormGrid>
                <TextField label="Farm name" name="name" required defaultValue={farm.name} maxLength={100} />
                <TextField label="Holding number (CPH)" name="holdingNumber" defaultValue={farm.holdingNumber ?? ''} placeholder="85/123/4567" />
                <TextField label="Herd mark" name="herdMark" defaultValue={farm.herdMark ?? ''} placeholder="523801" inputMode="numeric" maxLength={6} hint="The 6 digits after “UK” on calves born here" />
                <SelectField label="Currency" name="currency" defaultValue={farm.currency} options={['GBP', 'EUR', 'USD', 'AUD', 'NZD', 'CAD'].map((c) => ({ value: c, label: c }))} />
                <SelectField label="Land area unit" name="areaUnit" defaultValue={farm.areaUnit} options={[{ value: 'ha', label: 'Hectares' }, { value: 'ac', label: 'Acres' }]} />
              </FormGrid>
              <TextareaField label="Address" name="address" defaultValue={farm.address ?? ''} rows={2} />
              <Field label="Species kept" hint="Controls which species you can add and the tabs on the animals page">
                <div className="flex flex-wrap gap-2">
                  {SPECIES.map((s) => {
                    const on = species.includes(s.value)
                    return (
                      <button type="button" key={s.value} aria-pressed={on} onClick={() => setSpecies((x) => on ? (x.length > 1 ? x.filter((y) => y !== s.value) : x) : [...x, s.value])}
                        className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-600 ring-stone-200')}>
                        {s.emoji} {s.plural}{on && <Check className="size-3.5" />}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Sections in the menu" description="Hide the parts of the app this farm doesn’t use. Nothing is deleted; turn a section back on at any time." icon={LayoutList} />
            <div className="flex flex-wrap gap-2 p-5">
              {HIDEABLE_SECTIONS.map((sec) => {
                const on = !hidden.includes(sec.value)
                return (
                  <button type="button" key={sec.value} aria-pressed={on} onClick={() => setHidden((x) => on ? [...x, sec.value] : x.filter((y) => y !== sec.value))}
                    className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-400 line-through ring-stone-200')}>
                    {sec.label}{on && <Check className="size-3.5" />}
                  </button>
                )
              })}
            </div>
          </Card>
          <Card>
            <CardHeader title="Location" description="Centres the farm map and the weather forecast." icon={MapPin} />
            <div className="p-5">{editable ? <LocationPicker value={loc} onChange={setLoc} /> : <p className="text-sm text-stone-500">{loc ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : 'Not set'}</p>}</div>
          </Card>
        </fieldset>
        {editable && (
          <div className="flex items-center justify-end gap-3">
            <FormError error={error} />
            <Button type="submit" loading={busy}>Save settings</Button>
          </div>
        )}
      </form>

      <Card>
        <CardHeader title="Your data" description="Download your records as spreadsheets at any time." icon={Download} />
        <div className="flex flex-wrap gap-2 p-5">
          <Button variant="secondary" onClick={() => downloadUrl(api.url('/api/animals/export'))}><Download />Animals (CSV)</Button>
          {can('manager') && <Button variant="secondary" onClick={() => downloadUrl(api.url('/api/finance/export'))}><Download />Transactions (CSV)</Button>}
        </div>
      </Card>

      {role === 'owner' ? (
        <Card className="ring-clay-200">
          <CardHeader title="Delete farm" description="Permanently deletes this farm and every record in it for everyone. This cannot be undone." icon={AlertTriangle} />
          <div className="p-5"><Button variant="danger" onClick={() => setDeleting(true)}>Delete {farm.name}</Button></div>
        </Card>
      ) : (
        <p className="flex items-center gap-2 text-xs text-stone-400"><Lock className="size-3.5" />Only an owner can delete the farm.</p>
      )}

      <Modal open={deleting} onClose={() => setDeleting(false)} title={`Delete ${farm.name}?`}
        description={<>All animals, records, land, equipment, finances and team access will be permanently deleted. Type <strong>{farm.name}</strong> to confirm.</>}
        footer={<><Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="danger" disabled={confirmName !== farm.name} onClick={removeFarm}>Delete forever</Button></>}>
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={farm.name} aria-label="Farm name" />
      </Modal>
    </div>
  )
}
