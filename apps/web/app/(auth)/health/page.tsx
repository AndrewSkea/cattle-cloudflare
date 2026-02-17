'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { StatCard } from '@/components/charts/stat-card'
import { format } from 'date-fns'

interface HealthRecord {
  id: number
  animalId: number
  eventDate: string
  eventType: string | null
  description: string | null
  animal?: {
    id: number
    tagNo: string
    managementTag: string | null
    breed: string | null
  }
}

interface HealthSummary {
  totalEvents: number
  uniqueAnimals: number
  topEventTypes: Array<{ type: string; count: number }>
}

export default function HealthPage() {
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTag, setSearchTag] = useState('')
  const [filterType, setFilterType] = useState('')

  // Add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    animalId: '',
    eventDate: format(new Date(), 'yyyy-MM-dd'),
    eventType: '',
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [recordsRes, summaryRes, typesRes] = await Promise.all([
        apiClient.getHealthRecordsList(),
        apiClient.getHealthSummary(),
        apiClient.getHealthTypes(),
      ])

      setRecords((recordsRes as any).data || [])
      setSummary((summaryRes as any).data || null)
      setEventTypes((typesRes as any).data || [])
    } catch (err: any) {
      console.error('Failed to load health data:', err)
      setError(err.message || 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await apiClient.createHealthRecord({
        animalId: parseInt(formData.animalId),
        eventDate: formData.eventDate,
        eventType: formData.eventType,
        description: formData.description || undefined,
      })
      setShowAddForm(false)
      setFormData({
        animalId: '',
        eventDate: format(new Date(), 'yyyy-MM-dd'),
        eventType: '',
        description: '',
      })
      loadData()
    } catch (err: any) {
      alert('Failed to create record: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Filter records
  const filteredRecords = records.filter(r => {
    if (searchTag) {
      const tag = (r.animal?.managementTag || r.animal?.tagNo || '').toLowerCase()
      if (!tag.includes(searchTag.toLowerCase())) return false
    }
    if (filterType && r.eventType !== filterType) return false
    return true
  })

  const commonEventTypes = ['Vaccination', 'TB Test', 'Feet Trimming', 'Dosing', 'Vet Visit', 'Scanning', 'Other']

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading health data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button onClick={loadData} className="mt-3 text-sm text-red-800 underline hover:text-red-900">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Health Records</h1>
          <p className="text-sm text-gray-500 mt-1">Track health events across your herd</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2 w-full md:w-auto"
        >
          {showAddForm ? 'Cancel' : '+ Add Health Record'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Records"
          value={summary?.totalEvents || 0}
          description="All health events"
          loading={loading}
        />
        <StatCard
          title="Animals Tracked"
          value={summary?.uniqueAnimals || 0}
          description="With health records"
          loading={loading}
        />
        <StatCard
          title="Most Common"
          value={summary?.topEventTypes?.[0]?.type || 'N/A'}
          description={summary?.topEventTypes?.[0] ? `${summary.topEventTypes[0].count} events` : 'No events'}
          loading={loading}
        />
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-soft p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Health Record</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Animal ID *</label>
              <input
                type="number"
                required
                value={formData.animalId}
                onChange={(e) => setFormData({ ...formData, animalId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter cattle ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={formData.eventDate}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
              <select
                required
                value={formData.eventType}
                onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Select type...</option>
                {commonEventTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Optional description"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 h-10 px-6"
              >
                {submitting ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-soft p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Search by animal tag..."
            value={searchTag}
            onChange={(e) => setSearchTag(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">All Event Types</option>
            {[...new Set([...commonEventTypes, ...eventTypes])].map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <div className="text-sm text-gray-500 flex items-center">
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading health records...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 mb-2">No health records found</p>
              <p className="text-sm text-gray-400">
                {records.length === 0 ? 'Add your first health record to get started.' : 'Try adjusting your filters.'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Animal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Event Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/cattle/detail?id=${record.animalId}`}
                        className="text-sm font-medium text-green-600 hover:text-green-700"
                      >
                        {record.animal?.managementTag || record.animal?.tagNo || `ID: ${record.animalId}`}
                      </Link>
                      {record.animal?.breed && (
                        <p className="text-xs text-gray-400">{record.animal.breed}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(record.eventDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        {record.eventType || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {record.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
