'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

const FarmMap = dynamic(() => import('@/components/map/farm-map'), { ssr: false })

const FIELD_TYPE_OPTIONS = [
  { value: 'grazing', label: 'Grazing', color: '#22c55e' },
  { value: 'silage', label: 'Silage', color: '#f59e0b' },
  { value: 'housing', label: 'Housing', color: '#3b82f6' },
  { value: 'hay', label: 'Hay', color: '#9ca3af' },
]

function getFieldTypeColor(fieldType: string | null): string {
  const opt = FIELD_TYPE_OPTIONS.find((o) => o.value === fieldType)
  return opt?.color || '#6b7280'
}

function getFieldTypeBadgeClasses(fieldType: string | null): string {
  switch (fieldType) {
    case 'grazing':
      return 'bg-green-100 text-green-800'
    case 'silage':
      return 'bg-amber-100 text-amber-800'
    case 'housing':
      return 'bg-blue-100 text-blue-800'
    case 'hay':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

interface Field {
  id: number
  name: string
  fieldType: string | null
  polygon: string | null
  centerLat: number | null
  centerLng: number | null
  color: string | null
  acreage: number | null
  notes: string | null
  currentCattle: any[]
  cattleCount: number
}

export default function FieldsPage() {
  const [fields, setFields] = useState<Field[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState('grazing')
  const [newFieldAcreage, setNewFieldAcreage] = useState('')
  const [newFieldNotes, setNewFieldNotes] = useState('')
  const [pendingPolygon, setPendingPolygon] = useState<string | null>(null)
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadFields = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: any = await apiClient.getFields()
      const data = response.data || response || []
      setFields(
        (Array.isArray(data) ? data : []).map((f: any) => ({
          ...f,
          currentCattle: f.currentCattle || [],
          cattleCount: f.cattleCount || f.currentCattle?.length || 0,
        }))
      )
    } catch (err: any) {
      console.error('Failed to load fields:', err)
      setError(err.message || 'Failed to load fields')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFields()
  }, [])

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null

  const handleFieldClick = useCallback((id: number) => {
    setSelectedFieldId((prev) => (prev === id ? null : id))
  }, [])

  const handlePolygonDrawn = useCallback(
    (geojson: string, center: { lat: number; lng: number }) => {
      setPendingPolygon(geojson)
      setPendingCenter(center)
      setDrawMode(false)
      setShowCreateForm(true)
    },
    []
  )

  const handleCreateField = async () => {
    if (!newFieldName.trim()) return

    try {
      setSaving(true)
      await apiClient.createField({
        name: newFieldName.trim(),
        fieldType: newFieldType,
        polygon: pendingPolygon,
        centerLat: pendingCenter?.lat || null,
        centerLng: pendingCenter?.lng || null,
        color: getFieldTypeColor(newFieldType),
        acreage: newFieldAcreage ? parseFloat(newFieldAcreage) : null,
        notes: newFieldNotes.trim() || null,
      })

      // Reset form
      setNewFieldName('')
      setNewFieldType('grazing')
      setNewFieldAcreage('')
      setNewFieldNotes('')
      setPendingPolygon(null)
      setPendingCenter(null)
      setShowCreateForm(false)

      // Reload fields
      await loadFields()
    } catch (err: any) {
      console.error('Failed to create field:', err)
      setError(err.message || 'Failed to create field')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteField = async (id: number) => {
    if (!confirm('Are you sure you want to delete this field?')) return

    try {
      await apiClient.deleteField(id)
      if (selectedFieldId === id) setSelectedFieldId(null)
      await loadFields()
    } catch (err: any) {
      console.error('Failed to delete field:', err)
      setError(err.message || 'Failed to delete field')
    }
  }

  const startDrawMode = () => {
    setDrawMode(true)
    setShowCreateForm(false)
    setSelectedFieldId(null)
  }

  const cancelCreate = () => {
    setDrawMode(false)
    setShowCreateForm(false)
    setPendingPolygon(null)
    setPendingCenter(null)
    setNewFieldName('')
    setNewFieldType('grazing')
    setNewFieldAcreage('')
    setNewFieldNotes('')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Fields &amp; Paddocks</h1>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              Manage your farm fields, paddocks, and cattle assignments
            </p>
          </div>
          <div className="flex gap-2">
            {!drawMode && !showCreateForm && (
              <button
                onClick={startDrawMode}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Field
              </button>
            )}
            {(drawMode || showCreateForm) && (
              <button
                onClick={cancelCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 md:mx-6 mb-3">
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center justify-between">
            <p className="text-red-800 text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 text-sm font-medium ml-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="px-4 md:px-6 pb-4">
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 overflow-hidden" style={{ height: '60vh' }}>
          {drawMode && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800">
              Click on the map to draw a polygon outline for your new field. Double-click or press
              Enter to finish. Press Escape to cancel.
            </div>
          )}
          <div className={drawMode ? 'h-[calc(100%-40px)]' : 'h-full'}>
            <FarmMap
              fields={fields}
              selectedFieldId={selectedFieldId}
              onFieldClick={handleFieldClick}
              onPolygonDrawn={handlePolygonDrawn}
              drawMode={drawMode}
            />
          </div>
        </div>
      </div>

      {/* Create field form */}
      {showCreateForm && (
        <div className="px-4 md:px-6 pb-4">
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Field</h2>
            {pendingPolygon && (
              <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2 mb-4">
                Polygon drawn successfully. Fill in the details below.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="e.g. North Paddock"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Type</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Acreage
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={newFieldAcreage}
                  onChange={(e) => setNewFieldAcreage(e.target.value)}
                  placeholder="e.g. 12.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newFieldNotes}
                  onChange={(e) => setNewFieldNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={cancelCreate}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              {!pendingPolygon && (
                <button
                  onClick={startDrawMode}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Draw Polygon First
                </button>
              )}
              <button
                onClick={handleCreateField}
                disabled={saving || !newFieldName.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Create Field'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field list and detail */}
      <div className="px-4 md:px-6 pb-6 flex-1">
        {loading ? (
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full mx-auto" />
            <p className="text-gray-500 mt-4">Loading fields...</p>
          </div>
        ) : fields.length === 0 ? (
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-12 text-center">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No fields yet</h3>
            <p className="text-gray-500 text-sm mb-4">
              Create your first field by clicking "Add Field" and drawing a polygon on the map.
            </p>
            <button
              onClick={startDrawMode}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Your First Field
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Field cards */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    onClick={() => handleFieldClick(field.id)}
                    className={`bg-white rounded-lg shadow-soft border p-4 text-left transition-all hover:shadow-md ${
                      selectedFieldId === field.id
                        ? 'border-green-500 ring-2 ring-green-200'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 truncate pr-2">{field.name}</h3>
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: getFieldTypeColor(field.fieldType) }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${getFieldTypeBadgeClasses(field.fieldType)}`}
                      >
                        {field.fieldType || 'Unknown'}
                      </span>
                      {field.acreage && (
                        <span className="text-xs text-gray-500">{field.acreage} acres</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                      <span>{field.cattleCount} cattle</span>
                    </div>
                    {!field.polygon && (
                      <p className="text-xs text-amber-600 mt-2">No polygon drawn</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-1">
              {selectedField ? (
                <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6 sticky top-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedField.name}</h2>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${getFieldTypeBadgeClasses(selectedField.fieldType)}`}
                      >
                        {selectedField.fieldType || 'Unknown'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteField(selectedField.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete field"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Field info */}
                  <div className="space-y-3 mb-6">
                    {selectedField.acreage && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Acreage</span>
                        <span className="font-medium text-gray-900">
                          {selectedField.acreage} acres
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Cattle count</span>
                      <span className="font-medium text-gray-900">{selectedField.cattleCount}</span>
                    </div>
                    {selectedField.notes && (
                      <div className="text-sm">
                        <span className="text-gray-500 block mb-1">Notes</span>
                        <p className="text-gray-700">{selectedField.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Cattle in field */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Cattle in this field
                    </h3>
                    {selectedField.currentCattle.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">
                        No cattle currently assigned
                      </p>
                    ) : (
                      <ul className="space-y-2 max-h-60 overflow-y-auto">
                        {selectedField.currentCattle.map((animal: any) => (
                          <li key={animal.id || animal.cattleId}>
                            <Link
                              href={`/cattle`}
                              className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                            >
                              <span className="font-medium text-gray-900">
                                {animal.tagNo || animal.tag || `#${animal.id || animal.cattleId}`}
                              </span>
                              <span className="text-gray-400 text-xs">
                                {animal.breed || ''}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6 text-center">
                  <svg
                    className="w-12 h-12 text-gray-300 mx-auto mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                    />
                  </svg>
                  <p className="text-sm text-gray-500">
                    Select a field to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
