'use client'

import Link from 'next/link'

interface SiblingOrOffspring {
  id: number
  managementTag: string | null
  tagNo: string
  sex: string | null
  yob: number
  size: number | null
  sizeLabel: string | null
  onFarm: boolean
  sale: {
    salePrice: number | null
    weightKg: number | null
    ageMonths: number | null
    eventDate: string
  } | null
}

interface FamilyStatsProps {
  data: {
    siblings: SiblingOrOffspring[]
    siblingStats: {
      avgSalePrice: number | null
      avgWeight: number | null
      count: number
      soldCount: number
    }
    offspring: SiblingOrOffspring[]
    offspringStats: {
      avgSalePrice: number | null
      avgWeight: number | null
      count: number
      soldCount: number
      sizeDistribution: Record<string, number>
    }
    herdAvgSalePrice: number | null
    calvingIntervals: Array<{
      calvingDate: string
      daysSinceLastCalving: number | null
      calfId: number | null
      calfSex: string | null
    }>
  } | null
  loading?: boolean
}

const SIZE_COLORS: Record<string, { bg: string; text: string }> = {
  Large: { bg: 'bg-purple-100', text: 'text-purple-700' },
  'Medium-Large': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Med-Lg': { bg: 'bg-blue-100', text: 'text-blue-700' },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Small: { bg: 'bg-orange-100', text: 'text-orange-700' },
}

function formatCurrency(value: number | null): string {
  if (value == null) return '-'
  return `\u00a3${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatNumber(value: number | null, decimals: number = 0): string {
  if (value == null) return '-'
  return value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <div className="animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-5/6" />
              <div className="h-4 bg-gray-200 rounded w-4/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SiblingSalePrices({
  siblings,
  siblingStats,
  herdAvgSalePrice,
}: {
  siblings: SiblingOrOffspring[]
  siblingStats: { avgSalePrice: number | null; avgWeight: number | null; count: number; soldCount: number }
  herdAvgSalePrice: number | null
}) {
  const soldSiblings = siblings.filter((s) => s.sale && s.sale.salePrice != null)

  if (soldSiblings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Sibling Sale Prices</h3>
        <p className="text-sm text-gray-500">
          {siblings.length === 0
            ? 'No siblings found.'
            : `${siblings.length} sibling(s) found, none with sale data.`}
        </p>
      </div>
    )
  }

  // Find best and worst prices
  const prices = soldSiblings
    .map((s) => s.sale!.salePrice!)
    .filter((p) => p != null)
  const bestPrice = Math.max(...prices)
  const worstPrice = Math.min(...prices)

  const sibAvg = siblingStats.avgSalePrice
  const aboveHerd = sibAvg != null && herdAvgSalePrice != null && sibAvg >= herdAvgSalePrice

  return (
    <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Sibling Sale Prices</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-3 font-medium text-gray-600">Tag</th>
              <th className="text-left py-2 pr-3 font-medium text-gray-600">Sex</th>
              <th className="text-right py-2 pr-3 font-medium text-gray-600">Weight (kg)</th>
              <th className="text-right py-2 pr-3 font-medium text-gray-600">Sale Price</th>
              <th className="text-right py-2 pr-3 font-medium text-gray-600">Price/kg</th>
              <th className="text-right py-2 font-medium text-gray-600">Age (months)</th>
            </tr>
          </thead>
          <tbody>
            {soldSiblings.map((sib) => {
              const price = sib.sale!.salePrice!
              const weight = sib.sale!.weightKg
              const pricePerKg = price != null && weight != null && weight > 0
                ? price / weight
                : null
              const isBest = price === bestPrice && prices.length > 1
              const isWorst = price === worstPrice && prices.length > 1

              return (
                <tr
                  key={sib.id}
                  className={`border-b border-gray-100 ${isBest ? 'bg-green-50' : isWorst ? 'bg-red-50' : ''}`}
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`/cattle/detail?id=${sib.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {sib.managementTag || sib.tagNo}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{sib.sex || '-'}</td>
                  <td className="py-2 pr-3 text-right text-gray-700">{formatNumber(weight)}</td>
                  <td className={`py-2 pr-3 text-right font-medium ${isBest ? 'text-green-700' : isWorst ? 'text-red-700' : 'text-gray-900'}`}>
                    {formatCurrency(price)}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700">
                    {pricePerKg != null ? formatCurrency(Math.round(pricePerKg * 100) / 100) : '-'}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {sib.sale!.ageMonths != null ? formatNumber(sib.sale!.ageMonths) : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary row */}
      <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap gap-4 text-sm">
        <span className="text-gray-600">
          Sibling Avg:{' '}
          <span className={`font-semibold ${aboveHerd ? 'text-green-700' : 'text-red-700'}`}>
            {formatCurrency(sibAvg)}
          </span>
        </span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-600">
          Herd Avg:{' '}
          <span className="font-semibold text-gray-900">{formatCurrency(herdAvgSalePrice)}</span>
        </span>
        {sibAvg != null && herdAvgSalePrice != null && (
          <span className={`font-medium ${aboveHerd ? 'text-green-600' : 'text-red-600'}`}>
            ({aboveHerd ? '+' : ''}{formatCurrency(sibAvg - herdAvgSalePrice)} vs herd)
          </span>
        )}
      </div>
    </div>
  )
}

function OffspringStatistics({
  offspring,
  offspringStats,
}: {
  offspring: SiblingOrOffspring[]
  offspringStats: { avgSalePrice: number | null; avgWeight: number | null; count: number; soldCount: number; sizeDistribution: Record<string, number> }
}) {
  const { sizeDistribution, count, soldCount, avgSalePrice } = offspringStats

  if (count === 0) {
    return (
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Offspring Statistics</h3>
        <p className="text-sm text-gray-500">No offspring recorded.</p>
      </div>
    )
  }

  const sizeEntries = Object.entries(sizeDistribution || {})
  const totalSized = sizeEntries.reduce((sum, [, v]) => sum + v, 0)

  return (
    <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Offspring Statistics</h3>

      <div className="space-y-4">
        {/* Summary counts */}
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-gray-600">
            Total: <span className="font-semibold text-gray-900">{count}</span>
          </span>
          {soldCount > 0 && (
            <span className="text-gray-600">
              Sold: <span className="font-semibold text-gray-900">{soldCount}</span>
            </span>
          )}
          {avgSalePrice != null && (
            <span className="text-gray-600">
              Avg Sale Price: <span className="font-semibold text-gray-900">{formatCurrency(avgSalePrice)}</span>
            </span>
          )}
        </div>

        {/* Size distribution badges */}
        {sizeEntries.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-600 mb-2">Size Distribution</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {sizeEntries.map(([label, count]) => {
                const colors = SIZE_COLORS[label] || { bg: 'bg-gray-100', text: 'text-gray-700' }
                return (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                  >
                    {label}: {count}
                  </span>
                )
              })}
            </div>

            {/* Horizontal proportion bar */}
            {totalSized > 0 && (
              <div className="flex h-4 rounded-full overflow-hidden border border-gray-200">
                {sizeEntries.map(([label, count]) => {
                  const pct = (count / totalSized) * 100
                  const bgMap: Record<string, string> = {
                    Large: 'bg-purple-400',
                    'Medium-Large': 'bg-blue-400',
                    'Med-Lg': 'bg-blue-400',
                    Medium: 'bg-yellow-400',
                    Small: 'bg-orange-400',
                  }
                  return (
                    <div
                      key={label}
                      className={`${bgMap[label] || 'bg-gray-400'} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${label}: ${count} (${Math.round(pct)}%)`}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CalvingHistory({
  calvingIntervals,
}: {
  calvingIntervals: Array<{ calvingDate: string; daysSinceLastCalving: number | null; calfId: number | null; calfSex: string | null }>
}) {
  if (!calvingIntervals || calvingIntervals.length === 0) return null

  const intervals = calvingIntervals
    .filter((c) => c.daysSinceLastCalving != null)
    .map((c) => c.daysSinceLastCalving!)

  const avgInterval = intervals.length > 0
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : null

  return (
    <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Calving History</h3>

      {avgInterval != null && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-blue-700">
            Average calving interval:{' '}
            <span className="font-bold">{avgInterval} days</span>
            <span className="text-blue-500 ml-1">
              ({(avgInterval / 30.44).toFixed(1)} months)
            </span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        {calvingIntervals.map((calving, index) => {
          const date = new Date(calving.calvingDate)
          const formattedDate = date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })

          return (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-900 font-medium">{formattedDate}</span>
                {calving.calfId && (
                  <Link
                    href={`/cattle/detail?id=${calving.calfId}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Calf #{calving.calfId}
                  </Link>
                )}
                {calving.calfSex && (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    calving.calfSex.toLowerCase() === 'male' || calving.calfSex.toLowerCase() === 'm'
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-pink-100 text-pink-700'
                  }`}>
                    {calving.calfSex}
                  </span>
                )}
              </div>
              <div className="text-right">
                {calving.daysSinceLastCalving != null ? (
                  <span className="text-gray-600">
                    {calving.daysSinceLastCalving} days since last
                  </span>
                ) : (
                  <span className="text-gray-400 italic">First calving</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function FamilyStats({ data, loading }: FamilyStatsProps) {
  if (loading) {
    return <LoadingSkeleton />
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <p className="text-sm text-gray-500 text-center">No family statistics available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SiblingSalePrices
        siblings={data.siblings}
        siblingStats={data.siblingStats}
        herdAvgSalePrice={data.herdAvgSalePrice}
      />

      <OffspringStatistics
        offspring={data.offspring}
        offspringStats={data.offspringStats}
      />

      <CalvingHistory calvingIntervals={data.calvingIntervals} />
    </div>
  )
}
