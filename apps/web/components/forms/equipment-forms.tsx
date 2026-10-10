'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormError, FormGrid, FormSection, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { api, useSave } from '@/lib/queries'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_LOG_TYPES, EQUIPMENT_STATUS } from '@/lib/constants'
import { todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Equipment, EquipmentLog } from '@/lib/types'

export function EquipmentSheet({ onClose, item }: { onClose: () => void; item?: Equipment }) {
  const { can, currency } = useSession()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => item ? api.put(`/api/equipment/${item.id}`, b) : api.post('/api/equipment', b), {
    invalidate: ['equipment'], success: item ? 'Equipment updated' : 'Equipment added', silentError: true,
    onSuccess: (r: any) => { onClose(); if (!item) router.push(`/equipment/view?id=${r.data.id}`) },
  })
  return (
    <Sheet open onClose={onClose} wide title={item ? `Edit ${item.name}` : 'Add equipment'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="equipment-form" loading={save.isPending}>Save</Button></>}>
      <form id="equipment-form" className="space-y-8" onSubmit={(e) => { e.preventDefault(); save.mutate(formValues(e.currentTarget), { onError: (err) => setError(err.message) }) }}>
        <FormSection title="Machine">
          <FormGrid>
            <TextField label="Name" name="name" required defaultValue={item?.name} placeholder="e.g. John Deere 6155R" maxLength={100} className="sm:col-span-2" />
            <SelectField label="Type" name="category" defaultValue={item?.category ?? 'tractor'} options={EQUIPMENT_CATEGORIES} />
            <SelectField label="Status" name="status" defaultValue={item?.status ?? 'active'} options={EQUIPMENT_STATUS} />
            <TextField label="Make" name="make" defaultValue={item?.make ?? ''} />
            <TextField label="Model" name="model" defaultValue={item?.model ?? ''} />
            <TextField label="Year" name="year" type="number" min={1900} max={2100} defaultValue={item?.year ?? ''} />
            <TextField label="Registration" name="registration" defaultValue={item?.registration ?? ''} />
            <TextField label="Serial / VIN" name="serialNumber" defaultValue={item?.serialNumber ?? ''} className="sm:col-span-2" />
          </FormGrid>
        </FormSection>
        <FormSection title="Servicing" description="Set an interval by hours, months or both. We’ll warn you when it’s coming due.">
          <FormGrid>
            <TextField label="Current hours / mileage" name="hours" type="number" step="0.1" min={0} defaultValue={item?.hours ?? ''} />
            <TextField label="Service every (hours)" name="serviceIntervalHours" type="number" min={0} defaultValue={item?.serviceIntervalHours ?? ''} placeholder="e.g. 500" />
            <TextField label="Service every (months)" name="serviceIntervalMonths" type="number" min={1} max={120} defaultValue={item?.serviceIntervalMonths ?? ''} placeholder="e.g. 12" />
            <TextField label="Last service date" name="lastServiceDate" type="date" max={todayISO()} defaultValue={item?.lastServiceDate ?? ''} />
            <TextField label="Hours at last service" name="lastServiceHours" type="number" step="0.1" min={0} defaultValue={item?.lastServiceHours ?? ''} />
            <TextField label="MOT due" name="motDue" type="date" defaultValue={item?.motDue ?? ''} />
            <TextField label="Insurance renewal" name="insuranceDue" type="date" defaultValue={item?.insuranceDue ?? ''} />
          </FormGrid>
        </FormSection>
        {can('manager') && (
          <FormSection title="Purchase">
            <FormGrid>
              <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={item?.purchaseDate ?? ''} />
              <TextField label="Purchase price" name="purchasePrice" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={item?.purchasePrice ?? ''} />
            </FormGrid>
          </FormSection>
        )}
        <TextareaField label="Notes" name="notes" defaultValue={item?.notes ?? ''} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

export function LogSheet({ onClose, equipment, log, defaultType }: { onClose: () => void; equipment: Equipment; log?: EquipmentLog; defaultType?: string }) {
  const { can, currency } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState(log?.type || defaultType || 'service')
  const save = useSave((b: any) => log ? api.put(`/api/equipment/${equipment.id}/logs/${log.id}`, b) : api.post(`/api/equipment/${equipment.id}/logs`, b), {
    invalidate: ['equipment', 'finance'], success: 'Log saved', silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open onClose={onClose} title={`${log ? 'Edit' : 'Log'} · ${equipment.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="log-form" loading={save.isPending}>Save</Button></>}>
      <form id="log-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...formValues(e.currentTarget), type }, { onError: (err) => setError(err.message) }) }}>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT_LOG_TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => setType(t.value)} aria-pressed={type === t.value}
              className={`rounded-lg px-2.5 py-1 text-[13px] font-medium ring-1 transition ${type === t.value ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-stone-600 ring-stone-200'}`}>{t.label}</button>
          ))}
        </div>
        <FormGrid>
          <TextField label="Date" name="date" type="date" required max={todayISO()} defaultValue={log?.date ?? todayISO()} />
          <TextField label="Hours / mileage reading" name="hours" type="number" step="0.1" min={0} defaultValue={log?.hours ?? equipment.hours ?? ''} />
          {can('manager') && type !== 'hours' && type !== 'note' && <TextField label="Cost" name="cost" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={log?.cost ?? ''} hint="Added to farm expenses" />}
          {type !== 'hours' && <TextField label={type === 'fuel' ? 'Supplier' : 'Done by'} name="performedBy" defaultValue={log?.performedBy ?? ''} />}
        </FormGrid>
        <TextareaField label="Description" name="description" defaultValue={log?.description ?? ''} placeholder={type === 'service' ? 'Oil, filters, greasing…' : type === 'fuel' ? 'e.g. 200 L red diesel' : ''} />
        {type === 'service' && <p className="text-xs text-stone-500">Logging a service resets the service countdown.</p>}
        <FormError error={error} />
      </form>
    </Sheet>
  )
}
