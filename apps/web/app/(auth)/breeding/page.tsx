'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { StatCard } from '@/components/charts/stat-card'
import { format, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'

interface ServiceRecord {
  id: number
  cattleId: number
  cattleTag: string
  serviceDate: string
  bullId?: number | null
  bullTag?: string | null
  serviceType: string
  notes?: string | null
  successful?: boolean
}

interface CalvingPrediction {
  cattleId: number
  cattleTag: string
  expectedDate: string
  daysUntil: number
  serviceDate: string
  confidence: string
}

interface BreedingMetrics {
  totalServices: number
  pregnantCows: number
  successRate: number
  avgCalvingInterval: number
}

type TabType = 'services' | 'predictions' | 'calendar' | 'metrics'

export default function BreedingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('services')
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [predictions, setPredictions] = useState<CalvingPrediction[]>([])
  const [metrics, setMetrics] = useState<BreedingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [formData, setFormData] = useState({
    cattleId: '',
    serviceDate: format(new Date(), 'yyyy-MM-dd'),
    bullId: '',
    serviceType: 'AI',
    notes: ''
  })

  useEffect(() => {
    loadBreedingData()
  }, [])

  const loadBreedingData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [servicesRes, predictionsRes, metricsRes] = await Promise.all([
        apiClient.getServiceRecords({ limit: 100 }),
        apiClient.getCalvingPredictions(),
        apiClient.getBreedingMetrics()
      ])

      setServices((servicesRes as any).data || servicesRes || [])
      // API returns { data: { all: [...], dueSoon, overdue, upcoming, counts } }
      const predData = (predictionsRes as any).data
      setPredictions(Array.isArray(predData) ? predData : predData?.all || [])
      setMetrics((metricsRes as any).data || metricsRes)
    } catch (err: any) {
      console.error('Failed to load breeding data:', err)
      setError(err.message || 'Failed to load breeding data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiClient.createServiceRecord({
        cattleId: parseInt(formData.cattleId),
        serviceDate: formData.serviceDate,
        bullId: formData.bullId ? parseInt(formData.bullId) : null,
        serviceType: formData.serviceType,
        notes: formData.notes || null
      })
      setShowAddForm(false)
      setFormData({
        cattleId: '',
        serviceDate: format(new Date(), 'yyyy-MM-dd'),
        bullId: '',
        serviceType: 'AI',
        notes: ''
      })
      loadBreedingData()
    } catch (err: any) {
      console.error('Failed to create service record:', err)
      alert('Failed to create service record: ' + err.message)
    }
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading breeding data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={loadBreedingData}
            className="mt-3 text-sm text-red-800 underline hover:text-red-900"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          Breeding Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Track services, monitor pregnancies, and manage breeding calendar
        </p>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Services"
          value={metrics?.totalServices || 0}
          description="All recorded services"
          loading={loading}
        />
        <StatCard
          title="Pregnant Cows"
          value={metrics?.pregnantCows || 0}
          description="Currently pregnant"
          loading={loading}
        />
        <StatCard
          title="Success Rate"
          value={metrics?.successRate ? `${metrics.successRate.toFixed(1)}%` : '0%'}
          description="Conception success"
          loading={loading}
        />
        <StatCard
          title="Avg Calving Interval"
          value={metrics?.avgCalvingInterval ? `${Math.round(metrics.avgCalvingInterval)}d` : 'N/A'}
          description="Days between calvings"
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('services')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'services'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Service Records
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'predictions'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Calving Predictions
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'calendar'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Breeding Calendar
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'metrics'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Performance Metrics
            </button>
          </nav>
        </div>

        {/* Service Records Tab */}
        {activeTab === 'services' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Service Records</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2"
              >
                {showAddForm ? 'Cancel' : '+ Add Service Record'}
              </button>
            </div>

            {showAddForm && (
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">New Service Record</h3>
                <form onSubmit={handleSubmitService} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cattle ID *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.cattleId}
                      onChange={(e) => setFormData({ ...formData, cattleId: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Service Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.serviceDate}
                      onChange={(e) => setFormData({ ...formData, serviceDate: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bull ID
                    </label>
                    <input
                      type="number"
                      value={formData.bullId}
                      onChange={(e) => setFormData({ ...formData, bullId: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Service Type *
                    </label>
                    <select
                      required
                      value={formData.serviceType}
                      onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="AI">AI (Artificial Insemination)</option>
                      <option value="Natural">Natural Service</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 h-10 px-6 py-2"
                    >
                      Create Service Record
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              <p className="text-center text-gray-500 py-8">Loading service records...</p>
            ) : services.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No service records found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cow</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bull</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {services.map((service) => (
                      <tr key={service.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {service.cattleTag}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(service.serviceDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.bullTag || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.serviceType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            service.successful === true
                              ? 'bg-green-100 text-green-800'
                              : service.successful === false
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {service.successful === true ? 'Success' : service.successful === false ? 'Failed' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {service.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Calving Predictions Tab */}
        {activeTab === 'predictions' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-6">Calving Predictions</h2>
            {loading ? (
              <p className="text-center text-gray-500 py-8">Loading predictions...</p>
            ) : predictions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No pregnant cows with expected calving dates</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {predictions.map((prediction) => (
                  <div key={prediction.cattleId} className="bg-gray-50 rounded-lg p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{prediction.cattleTag}</h3>
                        <p className="text-sm text-gray-500">ID: {prediction.cattleId}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        prediction.daysUntil <= 7
                          ? 'bg-red-100 text-red-800'
                          : prediction.daysUntil <= 30
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {prediction.daysUntil} days
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-500">Expected Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(prediction.expectedDate), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Service Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(prediction.serviceDate), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Time Until Calving</p>
                        <p className="text-sm font-medium text-gray-900">
                          {formatDistanceToNow(new Date(prediction.expectedDate), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Breeding Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Breeding Calendar</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-900 min-w-[140px] text-center">
                  {format(calendarMonth, 'MMMM yyyy')}
                </span>
                <button
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => setCalendarMonth(new Date())}
                  className="text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 rounded hover:bg-green-50"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mb-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="text-gray-600">Service</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                <span className="text-gray-600">Expected Calving</span>
              </div>
            </div>

            {/* Calendar Grid */}
            {(() => {
              const monthStart = startOfMonth(calendarMonth)
              const monthEnd = endOfMonth(calendarMonth)
              const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
              const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
              const days = eachDayOfInterval({ start: calStart, end: calEnd })
              const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

              // Map events to dates
              const servicesByDate: Record<string, typeof services> = {}
              services.forEach(s => {
                const key = s.serviceDate.split('T')[0]
                if (!servicesByDate[key]) servicesByDate[key] = []
                servicesByDate[key].push(s)
              })

              const predictionsByDate: Record<string, typeof predictions> = {}
              predictions.forEach(p => {
                const key = p.expectedDate.split('T')[0]
                if (!predictionsByDate[key]) predictionsByDate[key] = []
                predictionsByDate[key].push(p)
              })

              return (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                    {weekDays.map(day => (
                      <div key={day} className="px-2 py-2 text-xs font-medium text-gray-500 text-center">
                        {day}
                      </div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7">
                    {days.map((day, i) => {
                      const dateKey = format(day, 'yyyy-MM-dd')
                      const dayServices = servicesByDate[dateKey] || []
                      const dayPredictions = predictionsByDate[dateKey] || []
                      const isCurrentMonth = isSameMonth(day, calendarMonth)
                      const isToday = isSameDay(day, new Date())

                      return (
                        <div
                          key={i}
                          className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${
                            !isCurrentMonth ? 'bg-gray-50/50' : ''
                          } ${isToday ? 'bg-green-50/50' : ''}`}
                        >
                          <div className={`text-xs mb-1 ${
                            isToday ? 'font-bold text-green-700' :
                            !isCurrentMonth ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                            {format(day, 'd')}
                          </div>
                          <div className="space-y-0.5">
                            {dayServices.map((s, j) => (
                              <div key={`s-${j}`} className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded truncate">
                                {s.cattleTag}
                              </div>
                            ))}
                            {dayPredictions.map((p, j) => (
                              <div key={`p-${j}`} className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded truncate">
                                {p.cattleTag}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Performance Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-6">Performance Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Conception Rates</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">Overall Success Rate</span>
                      <span className="text-sm font-medium">{metrics?.successRate?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${metrics?.successRate || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Breeding Efficiency</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Services</span>
                    <span className="text-lg font-bold">{metrics?.totalServices || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Pregnant Cows</span>
                    <span className="text-lg font-bold">{metrics?.pregnantCows || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Avg Calving Interval</span>
                    <span className="text-lg font-bold">
                      {metrics?.avgCalvingInterval ? `${Math.round(metrics.avgCalvingInterval)} days` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
