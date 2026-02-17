'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { StatCard } from '@/components/charts/stat-card'
import { LineChart } from '@/components/charts/line-chart'
import { PieChart } from '@/components/charts/pie-chart'

interface HerdStatistics {
  byBreed: Array<{ name: string; value: number }>
  bySex: Array<{ name: string; value: number }>
  byAgeGroup: Array<{ name: string; value: number }>
  totalCount: number
}

interface BreedingMetrics {
  calvingRate: number
  avgCalvingInterval: number
  successRate: number
  totalServices: number
  pregnantCows: number
}

interface FinancialSummary {
  totalRevenue: number
  totalSales: number
  avgPricePerHead: number
  avgWeight: number
  ytdRevenue: number
  ytdSales: number
}

interface TrendData {
  herdSize: Array<{ month: string; count: number }>
  birthsVsSales: Array<{ month: string; births: number; sales: number }>
}

export default function AnalyticsPage() {
  const [herdStats, setHerdStats] = useState<HerdStatistics | null>(null)
  const [breedingMetrics, setBreedingMetrics] = useState<BreedingMetrics | null>(null)
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalyticsData()
  }, [])

  const loadAnalyticsData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [herdRes, breedingRes, financialRes, trendsRes] = await Promise.all([
        apiClient.getHerdStatistics(),
        apiClient.getBreedingMetrics(),
        apiClient.getFinancialSummary(),
        apiClient.getHerdTrends({ period: '12months' })
      ])

      setHerdStats((herdRes as any).data || herdRes)
      setBreedingMetrics((breedingRes as any).data || breedingRes)
      setFinancialSummary((financialRes as any).data || financialRes)
      setTrends((trendsRes as any).data || trendsRes)
    } catch (err: any) {
      console.error('Failed to load analytics:', err)
      setError(err.message || 'Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading analytics</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={loadAnalyticsData}
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
          Analytics & Reports
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive insights into your herd performance
        </p>
      </div>

      {/* Herd Statistics Section */}
      <section>
        <h2 className="text-xl md:text-2xl font-bold mb-4">Herd Statistics</h2>
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6 mb-6">
          <StatCard
            title="Total Herd Size"
            value={herdStats?.totalCount || 0}
            description="Animals currently on farm"
            loading={loading}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">By Breed</h3>
            <PieChart
              data={herdStats?.byBreed || []}
              height={300}
              loading={loading}
            />
          </div>
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">By Sex</h3>
            <PieChart
              data={herdStats?.bySex || []}
              height={300}
              loading={loading}
              colors={['#3b82f6', '#ec4899']}
            />
          </div>
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">By Age Group</h3>
            <PieChart
              data={herdStats?.byAgeGroup || []}
              height={300}
              loading={loading}
              colors={['#10b981', '#f59e0b', '#ef4444']}
            />
          </div>
        </div>
      </section>

      {/* Breeding Metrics Section */}
      <section>
        <h2 className="text-xl md:text-2xl font-bold mb-4">Breeding Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard
            title="Calving Rate"
            value={breedingMetrics?.calvingRate ? `${breedingMetrics.calvingRate.toFixed(1)}%` : '0%'}
            description="Successful calvings"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Avg Calving Interval"
            value={breedingMetrics?.avgCalvingInterval ? `${Math.round(breedingMetrics.avgCalvingInterval)}d` : 'N/A'}
            description="Days between calvings"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Success Rate"
            value={breedingMetrics?.successRate ? `${breedingMetrics.successRate.toFixed(1)}%` : '0%'}
            description="Conception success"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
          <StatCard
            title="Total Services"
            value={breedingMetrics?.totalServices || 0}
            description="All time services"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <StatCard
            title="Pregnant Cows"
            value={breedingMetrics?.pregnantCows || 0}
            description="Currently pregnant"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Financial Summary Section */}
      <section>
        <h2 className="text-xl md:text-2xl font-bold mb-4">Financial Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Total Revenue"
            value={financialSummary?.totalRevenue ? `£${financialSummary.totalRevenue.toLocaleString()}` : '£0'}
            description="All time sales revenue"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="Total Sales"
            value={financialSummary?.totalSales || 0}
            description="Number of animals sold"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <StatCard
            title="Avg Price per Head"
            value={financialSummary?.avgPricePerHead ? `£${financialSummary.avgPricePerHead.toFixed(0)}` : '£0'}
            description="Average sale price"
            loading={loading}
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            }
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-2">Year to Date</h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-600">Revenue</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">
                  £{financialSummary?.ytdRevenue?.toLocaleString() || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Sales Count</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">
                  {financialSummary?.ytdSales || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-2">Performance Metrics</h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-600">Avg Weight</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">
                  {financialSummary?.avgWeight ? `${financialSummary.avgWeight.toFixed(0)} kg` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Price per kg</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">
                  {financialSummary?.avgPricePerHead && financialSummary?.avgWeight
                    ? `£${(financialSummary.avgPricePerHead / financialSummary.avgWeight).toFixed(2)}`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trend Charts Section */}
      <section>
        <h2 className="text-xl md:text-2xl font-bold mb-4">Trends</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Herd Size Over Time</h3>
            <LineChart
              data={trends?.herdSize || []}
              lines={[
                { dataKey: 'count', name: 'Herd Size', color: '#10b981' }
              ]}
              xAxisKey="month"
              height={300}
              loading={loading}
            />
          </div>
          <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Births vs Sales</h3>
            <LineChart
              data={trends?.birthsVsSales || []}
              lines={[
                { dataKey: 'births', name: 'Births', color: '#3b82f6' },
                { dataKey: 'sales', name: 'Sales', color: '#ef4444' }
              ]}
              xAxisKey="month"
              height={300}
              loading={loading}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
