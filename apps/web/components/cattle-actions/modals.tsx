'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

interface ModalWrapperProps {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

function ModalWrapper({ title, open, onClose, children }: ModalWrapperProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
const btnClass = 'w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'

interface ActionModalProps {
  open: boolean
  onClose: () => void
  animal: { id: number; tagNo: string; managementTag?: string | null } | null
  onSuccess: () => void
}

// ==================== ADD CHILD MODAL ====================

export function AddChildModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [calvingDate, setCalvingDate] = useState(new Date().toISOString().split('T')[0])
  const [calfTagNo, setCalfTagNo] = useState('')
  const [calfSex, setCalfSex] = useState('')
  const [sire, setSire] = useState('')
  const [sireType, setSireType] = useState<'natural' | 'ai'>('natural')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bulls, setBulls] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      apiClient.getCattle({ sex: 'male' }).then((res: any) => {
        setBulls((res.data || []).filter((c: any) => c.onFarm))
      }).catch(() => {})
      // Reset form
      setCalvingDate(new Date().toISOString().split('T')[0])
      setCalfTagNo('')
      setCalfSex('')
      setSire('')
      setSireType('natural')
      setNotes('')
      setError('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal || !calfTagNo) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.createCalvingWithCalf({
        motherId: animal.id,
        calvingDate,
        calfTagNo,
        calfSex: calfSex || undefined,
        sire: sire || undefined,
        sireType: sire ? sireType : undefined,
        notes: notes || undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add child')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Add Child — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Calving Date">
          <input type="date" value={calvingDate} onChange={(e) => setCalvingDate(e.target.value)} className={inputClass} required />
        </FormField>
        <FormField label="Calf Tag Number">
          <input type="text" value={calfTagNo} onChange={(e) => setCalfTagNo(e.target.value)} className={inputClass} placeholder="e.g. UK123456789012" required />
        </FormField>
        <FormField label="Calf Sex">
          <select value={calfSex} onChange={(e) => setCalfSex(e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="fem">Female</option>
          </select>
        </FormField>
        <FormField label="Sire Type">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="natural" checked={sireType === 'natural'} onChange={() => setSireType('natural')} />
              Natural
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="ai" checked={sireType === 'ai'} onChange={() => setSireType('ai')} />
              AI
            </label>
          </div>
        </FormField>
        <FormField label={sireType === 'ai' ? 'AI Sire Breed' : 'Bull'}>
          {sireType === 'natural' ? (
            <select value={sire} onChange={(e) => setSire(e.target.value)} className={inputClass}>
              <option value="">Select bull...</option>
              {bulls.map((b: any) => (
                <option key={b.id} value={b.managementTag || b.tagNo}>
                  {b.managementTag || b.tagNo} {b.breed ? `(${b.breed})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value={sire} onChange={(e) => setSire(e.target.value)} className={inputClass} placeholder="e.g. Charolais" />
          )}
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting || !calfTagNo} className={btnClass}>
          {submitting ? 'Adding...' : 'Add Child'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// ==================== PRONOUNCE DEAD MODAL ====================

export function PronounceDeadModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().split('T')[0])
      setNotes('')
      setError('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.pronounceDead(animal.id, {
        date,
        notes: notes ? `Died: ${date}. ${notes}` : `Died: ${date}`,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Pronounce Dead — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Date of Death">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </FormField>
        <FormField label="Cause / Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={3} placeholder="Cause of death, circumstances..." />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting} className={`${btnClass} !bg-red-600 hover:!bg-red-700`}>
          {submitting ? 'Updating...' : 'Confirm Death'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// ==================== ADD VACCINE MODAL ====================

export function AddVaccineModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [vaccine, setVaccine] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setDate(new Date().toISOString().split('T')[0]); setVaccine(''); setNotes(''); setError('') }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal || !vaccine) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.createHealthRecord({
        animalId: animal.id,
        eventDate: date,
        eventType: 'Vaccination',
        description: `${vaccine}${notes ? '. ' + notes : ''}`,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add vaccine')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Add Vaccine — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </FormField>
        <FormField label="Vaccine Name">
          <input type="text" value={vaccine} onChange={(e) => setVaccine(e.target.value)} className={inputClass} placeholder="e.g. BVD, Leptospirosis" required />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting || !vaccine} className={btnClass}>
          {submitting ? 'Adding...' : 'Add Vaccine'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// ==================== ADD MEDICATION MODAL ====================

export function AddMedicationModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [medication, setMedication] = useState('')
  const [dosage, setDosage] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setDate(new Date().toISOString().split('T')[0]); setMedication(''); setDosage(''); setNotes(''); setError('') }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal || !medication) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.createHealthRecord({
        animalId: animal.id,
        eventDate: date,
        eventType: 'Medication',
        description: `${medication}${dosage ? ' — Dosage: ' + dosage : ''}${notes ? '. ' + notes : ''}`,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add medication')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Add Medication — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </FormField>
        <FormField label="Medication">
          <input type="text" value={medication} onChange={(e) => setMedication(e.target.value)} className={inputClass} placeholder="e.g. Ivermectin, Metacam" required />
        </FormField>
        <FormField label="Dosage">
          <input type="text" value={dosage} onChange={(e) => setDosage(e.target.value)} className={inputClass} placeholder="e.g. 10ml" />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting || !medication} className={btnClass}>
          {submitting ? 'Adding...' : 'Add Medication'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// ==================== ADD WEIGHT MODAL ====================

export function AddWeightModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setDate(new Date().toISOString().split('T')[0]); setWeight(''); setNotes(''); setError('') }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal || !weight) return
    const weightNum = parseFloat(weight)
    if (isNaN(weightNum) || weightNum <= 0) {
      setError('Please enter a valid weight')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiClient.createHealthRecord({
        animalId: animal.id,
        eventDate: date,
        eventType: 'Weight',
        description: `${weightNum} kg${notes ? '. ' + notes : ''}`,
        numericValue: weightNum,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add weight')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Add Weight — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </FormField>
        <FormField label="Weight (kg)">
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} placeholder="e.g. 450" step="0.1" min="0" required />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting || !weight} className={btnClass}>
          {submitting ? 'Adding...' : 'Add Weight'}
        </button>
      </form>
    </ModalWrapper>
  )
}

// ==================== SELL MODAL (BATCH) ====================

interface SellModalProps {
  open: boolean
  onClose: () => void
  animals: Array<{ id: number; tagNo: string; managementTag?: string | null }>
  onSuccess: () => void
}

export function SellModal({ open, onClose, animals, onSuccess }: SellModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [eventDate, setEventDate] = useState(today)
  const [entries, setEntries] = useState<Record<number, { weight: string; price: string }>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setEventDate(today)
      setEntries({})
      setError('')
    }
  }, [open])

  const updateEntry = (id: number, field: 'weight' | 'price', value: string) => {
    setEntries(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animals.length) return
    setSubmitting(true)
    setError('')
    try {
      const sales = animals.map(a => {
        const entry = entries[a.id] || {}
        const weightKg = entry.weight ? parseFloat(entry.weight) : undefined
        const salePrice = entry.price ? parseFloat(entry.price) : undefined
        return {
          animalId: a.id,
          eventDate,
          weightKg: weightKg && !isNaN(weightKg) ? weightKg : undefined,
          salePrice: salePrice && !isNaN(salePrice) ? salePrice : undefined,
        }
      })
      await apiClient.batchSell(sales)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to record sales')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? '' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Sell {animals.length} Animal{animals.length !== 1 ? 's' : ''}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} required />
          </div>
          <div className="mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pb-2 font-medium">Animal</th>
                  <th className="pb-2 font-medium">Weight (kg)</th>
                  <th className="pb-2 font-medium">Price (£)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {animals.map(a => (
                  <tr key={a.id}>
                    <td className="py-2 pr-2 font-medium text-gray-900">{a.managementTag || a.tagNo}</td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        placeholder="e.g. 450"
                        step="0.1"
                        min="0"
                        value={entries[a.id]?.weight || ''}
                        onChange={e => updateEntry(a.id, 'weight', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        placeholder="e.g. 1200"
                        step="0.01"
                        min="0"
                        value={entries[a.id]?.price || ''}
                        onChange={e => updateEntry(a.id, 'price', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button type="submit" disabled={submitting} className={btnClass}>
            {submitting ? 'Recording...' : `Sell ${animals.length} Animal${animals.length !== 1 ? 's' : ''}`}
          </button>
        </form>
      </div>
    </div>
  )
}

// ==================== MOVE TO MART MODAL ====================

interface MoveToMartModalProps {
  open: boolean
  onClose: () => void
  animals: Array<{ id: number; tagNo: string; managementTag?: string | null }>
  onSuccess: () => void
}

export function MoveToMartModal({ open, onClose, animals, onSuccess }: MoveToMartModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setError('')
  }, [open])

  const handleConfirm = async () => {
    if (!animals.length) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.batchUpdateStatus(animals.map(a => a.id), 'At the Mart')
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Move to Mart</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            Move <span className="font-semibold">{animals.length} animal{animals.length !== 1 ? 's' : ''}</span> to mart? Their status will be updated to "At the Mart".
          </p>
          <div className="flex flex-wrap gap-1 mb-4">
            {animals.slice(0, 10).map(a => (
              <span key={a.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                {a.managementTag || a.tagNo}
              </span>
            ))}
            {animals.length > 10 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                +{animals.length - 10} more
              </span>
            )}
          </div>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={submitting} className="flex-1 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
              {submitting ? 'Moving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== ADD NOTES MODAL ====================

export function AddNotesModal({ open, onClose, animal, onSuccess }: ActionModalProps) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setNotes(''); setError('') }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!animal || !notes.trim()) return
    setSubmitting(true)
    setError('')
    try {
      // Append to existing notes
      const res: any = await apiClient.getCattleById(animal.id)
      const existing = res.data?.notes || ''
      const dateStr = new Date().toISOString().split('T')[0]
      const updated = existing
        ? `${existing}\n[${dateStr}] ${notes.trim()}`
        : `[${dateStr}] ${notes.trim()}`
      await apiClient.updateCattle(animal.id, { notes: updated })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to add notes')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalWrapper title={`Add Notes — ${animal?.managementTag || animal?.tagNo || ''}`} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={4} placeholder="Enter notes about this animal..." required />
        </FormField>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button type="submit" disabled={submitting || !notes.trim()} className={btnClass}>
          {submitting ? 'Saving...' : 'Save Notes'}
        </button>
      </form>
    </ModalWrapper>
  )
}
