'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FormError, FormGrid, Segmented, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { Picker } from '@/components/ui/picker'
import { api, useAnimalOptions, useEquipment, useMembers, useParcels, useSave, useStaff } from '@/lib/queries'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import type { Task, Transaction } from '@/lib/types'
import { animalOptions } from './livestock-forms'

function Footer({ formId, onClose, busy, label = 'Save' }: { formId: string; onClose: () => void; busy?: boolean; label?: string }) {
  return <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form={formId} loading={busy}>{label}</Button></>
}

export function TaskSheet({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<Task> }) {
  const { data: members = [] } = useMembers()
  const { data: animals = [] } = useAnimalOptions()
  const { data: equipment = [] } = useEquipment()
  const { data: parcels = [] } = useParcels()
  const init = { priority: 'normal', status: 'todo', ...defaults, ...task } as Partial<Task>
  const [animalId, setAnimalId] = useState<number | null>(init.animalId ?? null)
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => task ? api.put(`/api/tasks/${task.id}`, b) : api.post('/api/tasks', b), {
    invalidate: ['tasks'], success: task ? 'Task updated' : 'Task added', silentError: true, onSuccess: onClose,
  })
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} footer={<Footer formId="task-form" onClose={onClose} busy={save.isPending} />}>
      <form id="task-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...formValues(e.currentTarget), animalId }, { onError: (err) => setError(err.message) }) }}>
        <TextField label="Task" name="title" required maxLength={200} defaultValue={init.title ?? ''} placeholder="e.g. Check water troughs in North Field" />
        <TextareaField label="Details" name="description" defaultValue={init.description ?? ''} rows={3} />
        <FormGrid>
          <TextField label="Due date" name="dueDate" type="date" defaultValue={init.dueDate ?? ''} />
          <SelectField label="Priority" name="priority" defaultValue={init.priority} options={[{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }]} />
          <SelectField label="Assign to" name="assigneeUserId" data-number defaultValue={init.assigneeUserId ?? ''} placeholder="Unassigned" options={members.map((m) => ({ value: m.userId, label: m.name || m.email }))} />
          <SelectField label="Area" name="category" defaultValue={init.category ?? ''} placeholder="—" options={[{ value: 'livestock', label: 'Livestock' }, { value: 'land', label: 'Land' }, { value: 'equipment', label: 'Equipment' }, { value: 'admin', label: 'Admin' }, { value: 'other', label: 'Other' }]} />
          {task && <SelectField label="Status" name="status" defaultValue={init.status} options={[{ value: 'todo', label: 'To do' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }]} />}
        </FormGrid>
        <div className="space-y-4 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Link to (optional)</p>
          <Field label="Animal"><Picker label="Animal" options={animalOptions(animals, (a) => a.status === 'active')} value={animalId} onChange={setAnimalId} /></Field>
          <FormGrid>
            <SelectField label="Equipment" name="equipmentId" data-number defaultValue={init.equipmentId ?? ''} placeholder="—" options={equipment.map((x) => ({ value: x.id, label: x.name }))} />
            <SelectField label="Field" name="parcelId" data-number defaultValue={init.parcelId ?? ''} placeholder="—" options={parcels.map((x) => ({ value: x.id, label: x.name }))} />
          </FormGrid>
        </div>
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

export function TransactionSheet({ open, onClose, txn, defaultType = 'expense', preset }: { open: boolean; onClose: () => void; txn?: Transaction | null; defaultType?: 'income' | 'expense'; preset?: Partial<Transaction> }) {
  const base: Partial<Transaction> | undefined = txn ?? preset
  const { currency } = useSession()
  const { data: animals = [] } = useAnimalOptions()
  const { data: equipment = [] } = useEquipment()
  const { data: parcels = [] } = useParcels()
  const { data: staff = [] } = useStaff()
  const [type, setType] = useState<'income' | 'expense'>(base?.type || defaultType)
  const [animalId, setAnimalId] = useState<number | null>(base?.animalId ?? null)
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => txn ? api.put(`/api/finance/transactions/${txn.id}`, b) : api.post('/api/finance/transactions', b), {
    invalidate: ['finance', 'staff'], success: txn ? 'Transaction updated' : 'Transaction added', silentError: true, onSuccess: onClose,
  })
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return (
    <Sheet open={open} onClose={onClose} title={txn ? 'Edit transaction' : type === 'income' ? 'Record income' : 'Record expense'}
      footer={<Footer formId="txn-form" onClose={onClose} busy={save.isPending} />}>
      <form id="txn-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate({ ...formValues(e.currentTarget), type, animalId }, { onError: (err) => setError(err.message) }) }}>
        <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Money out' }, { value: 'income', label: 'Money in' }]} />
        <FormGrid>
          <TextField label="Amount" name="amount" type="number" step="0.01" min={0.01} required prefix={currency === 'GBP' ? '£' : undefined} defaultValue={base?.amount ?? ''} />
          <TextField label="Date" name="date" type="date" required defaultValue={txn?.date ?? todayISO()} />
          <SelectField key={type} label="Category" name="category" required defaultValue={base?.type === type && base.category ? base.category : cats[0].value} options={cats} />
          <TextField label="VAT included" name="vatAmount" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={txn?.vatAmount ?? ''} />
          <TextField label="Description" name="description" defaultValue={base?.description ?? ''} className="sm:col-span-2" placeholder="e.g. 10 t barley" />
          <TextField label={type === 'income' ? 'From (payer)' : 'To (supplier)'} name="counterparty" defaultValue={base?.counterparty ?? ''} />
          <TextField label="Reference" name="reference" defaultValue={txn?.reference ?? ''} placeholder="Invoice no." />
        </FormGrid>
        <div className="space-y-4 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200/70">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Link to (optional)</p>
          <Field label="Animal"><Picker label="Animal" options={animalOptions(animals)} value={animalId} onChange={setAnimalId} /></Field>
          <FormGrid>
            <SelectField label="Equipment" name="equipmentId" data-number defaultValue={txn?.equipmentId ?? ''} placeholder="—" options={equipment.map((x) => ({ value: x.id, label: x.name }))} />
            <SelectField label="Field" name="parcelId" data-number defaultValue={txn?.parcelId ?? ''} placeholder="—" options={parcels.map((x) => ({ value: x.id, label: x.name }))} />
            <SelectField label="Staff member" name="staffId" data-number defaultValue={base?.staffId ?? ''} placeholder="—" options={staff.map((x) => ({ value: x.id, label: x.name }))} className="sm:col-span-2" />
          </FormGrid>
        </div>
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

