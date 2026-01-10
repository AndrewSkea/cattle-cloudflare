'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { StatCard } from '@/components/charts/stat-card'
import { PieChart } from '@/components/charts/pie-chart'
import { format } from 'date-fns'

interface DashboardStats {
  totalCattle: number
  activeBreedingFemales: number
  upcomingCalvings: number
  ytdRevenue: number
  recentCalvings: Array<{
    id: number
    cattleId: number
    cattleTag: string
    calvingDate: string
    calfTag: string | null
    difficulty: string | null
  }>
  upcomingPredictions: Array<{
    cattleId: number
    cattleTag: string
    expectedDate: string
    daysUntil: number
  }>
  herdComposition: Array<{
    name: string
    value: number
  }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: any = await apiClient.getDashboardStats()
      setStats(response.data || response)
    } catch (err: any) {
      console.error('Failed to load dashboard:', err)
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading dashboard</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={loadDashboardData}
            className="mt-3 text-sm text-red-800 underline hover:text-red-900"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Overview of your cattle management system
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {format(new Date(), 'PPpp')}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Cattle"
          value={stats?.totalCattle || 0}
          description="Animals on farm"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
        />
        <StatCard
          title="Active Breeding Females"
          value={stats?.activeBreedingFemales || 0}
          description="Cows in breeding program"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          }
        />
        <StatCard
          title="Upcoming Calvings"
          value={stats?.upcomingCalvings || 0}
          description="Expected in next 30 days"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="YTD Revenue"
          value={stats?.ytdRevenue ? `£${stats.ytdRevenue.toLocaleString()}` : '£0'}
          description="Year to date sales"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-soft border-0 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            href="/cattle/new"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors"
          >
            <span className="text-lg">+</span>
            <span className="font-medium">Add Cattle</span>
          </Link>
          <Link
            href="/breeding"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
          >
            <span className="text-lg">📝</span>
            <span className="font-medium">Record Service</span>
          </Link>
          <Link
            href="/financials"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
          >
            <span className="text-lg">💷</span>
            <span className="font-medium">Record Sale</span>
          </Link>
          <Link
            href="/analytics"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors"
          >
            <span className="text-lg">📊</span>
            <span className="font-medium">View Reports</span>
          </Link>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Calving Events */}
        <div className="bg-white rounded-lg shadow-medium border-0 overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent Calving Events</h2>
              <Link href="/breeding" className="text-sm text-green-600 hover:text-green-700 font-medium">
                View All
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6">
                <p className="text-muted-foreground text-center py-8">Loading calving events...</p>
              </div>
            ) : !stats?.recentCalvings || stats.recentCalvings.length === 0 ? (
              <div className="p-6">
                <p className="text-muted-foreground text-center py-8">No recent calving events</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cow</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calf</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stats.recentCalvings.slice(0, 10).map((calving) => (
                    <tr key={calving.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {calving.cattleTag}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(calving.calvingDate), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {calving.calfTag || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          calving.difficulty === 'easy' || !calving.difficulty
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {calving.difficulty || 'Normal'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Upcoming Calving Predictions */}
        <div className="bg-white rounded-lg shadow-medium border-0 overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upcoming Calvings</h2>
              <Link href="/breeding" className="text-sm text-green-600 hover:text-green-700 font-medium">
                View All
              </Link>
            </div>
          </div>
          <div className="p-6">
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Loading predictions...</p>
            ) : !stats?.upcomingPredictions || stats.upcomingPredictions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No upcoming calvings predicted</p>
            ) : (
              <div className="space-y-4">
                {stats.upcomingPredictions.slice(0, 5).map((prediction) => (
                  <div key={prediction.cattleId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{prediction.cattleTag}</p>
                      <p className="text-sm text-gray-500">
                        Expected: {format(new Date(prediction.expectedDate), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">{prediction.daysUntil}</p>
                      <p className="text-xs text-gray-500">days</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Herd Composition Chart */}
      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
        <h2 className="text-lg font-semibold mb-6">Herd Composition by Breed</h2>
        <PieChart
          data={stats?.herdComposition || []}
          height={350}
          loading={loading}
        />
      </div>
    </div>
  )
}
