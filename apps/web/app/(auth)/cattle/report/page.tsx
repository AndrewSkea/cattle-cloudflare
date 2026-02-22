'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { apiClient } from '@/lib/api-client'

function ReportContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    apiClient.getAnimalReport(Number(id))
      .then((res: any) => setReport(res.data))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading report...</div>
  if (!report) return <div className="p-8 text-center text-red-500">Report not found</div>

  const { animal, sale, costs, summary } = report

  return (
    <div className="max-w-2xl mx-auto p-8 print:p-4">
      <div className="flex justify-between items-start mb-6 print:mb-4">
        <div>
          <h1 className="text-2xl font-bold">{animal.managementTag || animal.tagNo}</h1>
          <p className="text-gray-500">{animal.tagNo}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Animal Info */}
      <div className="border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Animal Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500">Breed:</span> {animal.breed || '\u2014'}</div>
          <div><span className="text-gray-500">Sex:</span> {animal.sex || '\u2014'}</div>
          <div><span className="text-gray-500">DOB:</span> {animal.dob}</div>
          <div><span className="text-gray-500">Status:</span> {animal.currentStatus || (animal.onFarm ? 'On Farm' : 'Off Farm')}</div>
        </div>
      </div>

      {/* Sale Info */}
      {sale && (
        <div className="border rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sale Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Date:</span> {sale.date}</div>
            <div><span className="text-gray-500">Price:</span> {'\u00A3'}{sale.price?.toFixed(2) || '\u2014'}</div>
            <div><span className="text-gray-500">Weight:</span> {sale.weightKg ? `${sale.weightKg} kg` : '\u2014'}</div>
            <div><span className="text-gray-500">{'\u00A3'}/kg:</span> {sale.pricePerKg?.toFixed(2) || '\u2014'}</div>
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Cost Breakdown</h2>
        {costs.length === 0 ? (
          <p className="text-sm text-gray-400">No costs recorded</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="pb-1">Date</th>
                <th className="pb-1">Description</th>
                <th className="pb-1">Category</th>
                <th className="pb-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{c.date}</td>
                  <td className="py-1">{c.description || '\u2014'}</td>
                  <td className="py-1 text-gray-500">{c.sourceType}</td>
                  <td className="py-1 text-right">{'\u00A3'}{c.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Profit Summary */}
      <div className="border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Profit Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Revenue</p>
            <p className="font-bold">{'\u00A3'}{summary.revenue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Total Costs</p>
            <p className="font-bold">{'\u00A3'}{summary.totalCosts.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Profit</p>
            <p className={`font-bold ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {'\u00A3'}{summary.profit.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Margin</p>
            <p className={`font-bold ${(summary.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.margin !== null ? `${summary.margin}%` : '\u2014'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <ReportContent />
    </Suspense>
  )
}
