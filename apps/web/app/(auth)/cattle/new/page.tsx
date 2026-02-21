'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

const BREED_OPTIONS = [
  'Angus', 'Hereford', 'Charolais', 'Simmental', 'Limousin',
  'Friesian', 'Holstein', 'Jersey', 'Shorthorn', 'Blonde d\'Aquitaine',
  'Belgian Blue', 'Parthenaise', 'Other',
]

const SEX_OPTIONS = [
  { value: 'M', label: 'Male (Bull)' },
  { value: 'F', label: 'Female (Cow/Heifer)' },
  { value: 'C', label: 'Castrated (Bullock)' },
]

const SIZE_OPTIONS = [
  { value: 1, label: 'Large' },
  { value: 2, label: 'Med-Large' },
  { value: 3, label: 'Med-Small' },
  { value: 4, label: 'Small' },
]

export default function NewCattlePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    tagNo: '',
    managementTag: '',
    yob: new Date().getFullYear(),
    dob: '',
    breed: '',
    sex: '',
    size: '' as '' | number,
    damTag: '' as '' | number,
    notes: '',
  })

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const payload: any = {
        tagNo: form.tagNo,
        yob: Number(form.yob),
        dob: form.dob,
      }
      if (form.managementTag) payload.managementTag = form.managementTag
      if (form.breed) payload.breed = form.breed
      if (form.sex) payload.sex = form.sex
      if (form.size !== '') payload.size = Number(form.size)
      if (form.damTag !== '') payload.damTag = Number(form.damTag)
      if (form.notes) payload.notes = form.notes

      await apiClient.createCattle(payload)
      router.push('/cattle')
    } catch (err: any) {
      setError(err.message || 'Failed to create cattle record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/cattle"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Cattle
        </Link>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Add New Cattle</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Register a new animal in your herd
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-soft border border-gray-200 p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tag Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tag Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.tagNo}
              onChange={e => handleChange('tagNo', e.target.value)}
              placeholder="e.g. IE123456789"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Management Tag
            </label>
            <input
              type="text"
              value={form.managementTag}
              onChange={e => handleChange('managementTag', e.target.value)}
              placeholder="e.g. 13-1"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Date of Birth & Year */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={form.dob}
              onChange={e => {
                const dob = e.target.value
                const yob = dob ? new Date(dob).getFullYear() : form.yob
                setForm(prev => ({ ...prev, dob, yob }))
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min={1900}
              max={new Date().getFullYear()}
              value={form.yob}
              onChange={e => handleChange('yob', parseInt(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Breed & Sex */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Breed</label>
            <select
              value={form.breed}
              onChange={e => handleChange('breed', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select breed</option>
              {BREED_OPTIONS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
            <select
              value={form.sex}
              onChange={e => handleChange('sex', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select sex</option>
              {SEX_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Size & Dam Tag */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
            <select
              value={form.size}
              onChange={e => handleChange('size', e.target.value === '' ? '' : parseInt(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select size</option>
              {SIZE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dam Tag ID
              <span className="text-xs text-muted-foreground ml-1">(cattle ID of mother)</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.damTag}
              onChange={e => handleChange('damTag', e.target.value === '' ? '' : parseInt(e.target.value))}
              placeholder="Cattle ID"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            rows={3}
            placeholder="Any additional notes about this animal..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t">
          <Link
            href="/cattle"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 h-10 px-4 py-2 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Cattle'}
          </button>
        </div>
      </form>
    </div>
  )
}
