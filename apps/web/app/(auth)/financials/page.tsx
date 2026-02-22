'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { StatCard } from '@/components/charts/stat-card'
import { LineChart } from '@/components/charts/line-chart'
import { format } from 'date-fns'
import { unparse } from 'papaparse'

interface Sale {
  id: number
  cattleId: number
  cattleTag: string
  saleDate: string
  salePrice: number
  weight?: number | null
  buyer?: string | null
  notes?: string | null
}

interface SalesMetrics {
  totalRevenue: number
  totalSales: number
  avgPrice: number
  avgWeight: number
  totalWeight: number
  avgPricePerKg: number
  ytdRevenue: number
  ytdSales: number
  monthlyRevenue: Array<{ month: string; revenue: number; count: number }>
}

interface PLData {
  revenue: { cattleSales: number; total: number }
  expenditure: { machineryPurchase: number; machineryRunning: number; payroll: number; fertiliser: number; seed: number; medicineVaccine: number; otherSupplies: number; total: number }
  netMargin: number
  categories: Array<{ name: string; amount: number }>
}

export default function FinancialsPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null)
  const [pl, setPL] = useState<PLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'saleDate' | 'salePrice' | 'weight'>('saleDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterBuyer, setFilterBuyer] = useState('')
  const [profitability, setProfitability] = useState<any>(null)

  useEffect(() => {
    loadFinancialData()
  }, [])

  const loadFinancialData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [salesRes, metricsRes, plRes, profitRes] = await Promise.all([
        apiClient.getSales({ sortBy, order: sortOrder }),
        apiClient.getSalesMetrics({ period: '12months' }),
        apiClient.getFinancialPL(),
        apiClient.getProfitability().catch(() => ({ data: null })),
      ])

      setSales((salesRes as any).data || salesRes || [])
      setMetrics((metricsRes as any).data || metricsRes)
      setPL((plRes as any).data || null)
      setProfitability((profitRes as any).data || null)
    } catch (err: any) {
      console.error('Failed to load financial data:', err)
      setError(err.message || 'Failed to load financial data')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (column: 'saleDate' | 'salePrice' | 'weight') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const exportToCSV = () => {
    const csvData = sales.map(sale => ({
      'Cattle Tag': sale.cattleTag,
      'Sale Date': format(new Date(sale.saleDate), 'yyyy-MM-dd'),
      'Sale Price (£)': sale.salePrice,
      'Weight (kg)': sale.weight || '',
      'Price per kg (£)': sale.weight ? (sale.salePrice / sale.weight).toFixed(2) : '',
      'Buyer': sale.buyer || '',
      'Notes': sale.notes || ''
    }))

    const csv = unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cattle-sales-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredSales = sales.filter(sale =>
    !filterBuyer || sale.buyer?.toLowerCase().includes(filterBuyer.toLowerCase())
  )

  const sortedSales = [...filteredSales].sort((a, b) => {
    let comparison = 0
    if (sortBy === 'saleDate') {
      comparison = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime()
    } else if (sortBy === 'salePrice') {
      comparison = a.salePrice - b.salePrice
    } else if (sortBy === 'weight') {
      comparison = (a.weight || 0) - (b.weight || 0)
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading financial data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={loadFinancialData}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Financial Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Track sales and analyze financial performance
          </p>
        </div>
        <div className="relative group">
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
          <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-10 py-1 min-w-[180px]">
            <button onClick={() => apiClient.downloadExport('sales')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Sales Report (XLSX)
            </button>
            <button onClick={() => apiClient.downloadExport('costs')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cost Report (XLSX)
            </button>
            <button onClick={() => apiClient.downloadExport('full')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Full Farm Report (XLSX)
            </button>
            <hr className="my-1" />
            <button onClick={exportToCSV} disabled={sales.length === 0} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Sales CSV (legacy)
            </button>
          </div>
        </div>
      </div>

      {/* Sales Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={metrics?.totalRevenue ? `£${metrics.totalRevenue.toLocaleString()}` : '£0'}
          description="All time sales"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Sales"
          value={metrics?.totalSales || 0}
          description="Animals sold"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="Avg Price per Head"
          value={metrics?.avgPrice ? `£${metrics.avgPrice.toFixed(0)}` : '£0'}
          description="Average sale price"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          }
        />
        <StatCard
          title="Avg Price per kg"
          value={metrics?.avgPricePerKg ? `£${metrics.avgPricePerKg.toFixed(2)}` : '£0'}
          description="Per kilogram"
          loading={loading}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Year to Date Performance</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">YTD Revenue</span>
              <span className="text-xl md:text-2xl font-bold text-green-600">
                £{metrics?.ytdRevenue?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">YTD Sales Count</span>
              <span className="text-xl md:text-2xl font-bold text-blue-600">
                {metrics?.ytdSales || 0}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Weight Statistics</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Total Weight Sold</span>
              <span className="text-xl md:text-2xl font-bold text-purple-600">
                {metrics?.totalWeight?.toLocaleString() || 0} kg
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Avg Weight per Head</span>
              <span className="text-xl md:text-2xl font-bold text-orange-600">
                {metrics?.avgWeight?.toFixed(0) || 0} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* P&L Breakdown */}
      {pl && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Profit & Loss</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${pl.netMargin >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              Net: {pl.netMargin >= 0 ? '+' : ''}£{pl.netMargin.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Income</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-700">Cattle Sales</span>
                  <span className="text-sm font-semibold text-green-700">£{pl.revenue.cattleSales.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center py-2 font-semibold">
                  <span className="text-sm text-gray-900">Total Income</span>
                  <span className="text-sm text-green-700">£{pl.revenue.total.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
            {/* Expenditure */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Expenditure</h3>
              <div className="space-y-1">
                {pl.categories.filter(c => c.amount > 0).map(cat => (
                  <div key={cat.name} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-600">{cat.name}</span>
                    <span className="text-sm font-medium text-gray-800">£{cat.amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
                {pl.categories.every(c => c.amount === 0) && (
                  <p className="text-sm text-gray-400 text-center py-3">No expenditure recorded yet</p>
                )}
                <div className="flex justify-between items-center py-2 font-semibold mt-1">
                  <span className="text-sm text-gray-900">Total Expenditure</span>
                  <span className="text-sm text-red-700">£{pl.expenditure.total.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Trends Chart */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-6">Revenue Trends (Last 12 Months)</h2>
        <LineChart
          data={metrics?.monthlyRevenue || []}
          lines={[
            { dataKey: 'revenue', name: 'Revenue (£)', color: '#10b981' },
            { dataKey: 'count', name: 'Sales Count', color: '#3b82f6' }
          ]}
          xAxisKey="month"
          height={350}
          loading={loading}
        />
      </div>

      {/* Per-Head Profitability */}
      {profitability && profitability.soldAnimals.length > 0 && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Per-Head Profitability</h2>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500">Animals Sold</p>
              <p className="text-lg font-bold">{profitability.summary.totalSold}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Revenue</p>
              <p className="text-lg font-bold">{'\u00A3'}{profitability.summary.totalRevenue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Allocated Costs</p>
              <p className="text-lg font-bold">{'\u00A3'}{profitability.summary.totalCosts.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Avg Margin</p>
              <p className={`text-lg font-bold ${profitability.summary.avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitability.summary.avgMargin}%
              </p>
            </div>
          </div>

          {/* Breed breakdown */}
          {profitability.byBreed.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">By Breed</h4>
              <div className="flex gap-3 flex-wrap">
                {profitability.byBreed.map((b: any) => (
                  <div key={b.breed} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium">{b.breed}</span>
                    <span className="text-gray-400 mx-1">{'\u00B7'}</span>
                    <span className={b.avgMargin >= 0 ? 'text-green-600' : 'text-red-600'}>{b.avgMargin}%</span>
                    <span className="text-gray-400 text-xs ml-1">({b.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent sold animals table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="pb-2 pr-3">Tag</th>
                  <th className="pb-2 pr-3">Breed</th>
                  <th className="pb-2 pr-3">Sale Date</th>
                  <th className="pb-2 pr-3 text-right">Sale Price</th>
                  <th className="pb-2 pr-3 text-right">Costs</th>
                  <th className="pb-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {profitability.soldAnimals.slice(0, 20).map((a: any) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-medium">{a.managementTag || a.tagNo}</td>
                    <td className="py-2 pr-3 text-gray-500">{a.breed || '\u2014'}</td>
                    <td className="py-2 pr-3 text-gray-500">{a.saleDate}</td>
                    <td className="py-2 pr-3 text-right">{'\u00A3'}{a.salePrice.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right text-gray-500">{'\u00A3'}{a.totalCosts.toLocaleString()}</td>
                    <td className={`py-2 text-right font-medium ${a.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {a.margin}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sales Records Table */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Sales Records</h2>
            <div className="text-sm text-gray-500">
              {sortedSales.length} record{sortedSales.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Filter by buyer..."
              value={filterBuyer}
              onChange={(e) => setFilterBuyer(e.target.value)}
              className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6">
              <p className="text-muted-foreground text-center py-8">Loading sales records...</p>
            </div>
          ) : sortedSales.length === 0 ? (
            <div className="p-6">
              <p className="text-muted-foreground text-center py-8">
                {filterBuyer ? 'No sales match your filter' : 'No sales records found'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cattle Tag
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('saleDate')}
                  >
                    <div className="flex items-center">
                      Sale Date
                      {sortBy === 'saleDate' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('salePrice')}
                  >
                    <div className="flex items-center">
                      Sale Price
                      {sortBy === 'salePrice' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('weight')}
                  >
                    <div className="flex items-center">
                      Weight
                      {sortBy === 'weight' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Price/kg
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Buyer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sale.cattleTag}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(sale.saleDate), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      £{sale.salePrice.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.weight ? `${sale.weight} kg` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.weight ? `£${(sale.salePrice / sale.weight).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.buyer || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {sale.notes || '-'}
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
