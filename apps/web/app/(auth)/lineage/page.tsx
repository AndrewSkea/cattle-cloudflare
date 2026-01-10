'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

export default function LineagePage() {
  const [mothers, setMothers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const response: any = await apiClient.getFoundationMothers()
      setMothers(response.data || [])
    } catch (err) {
      console.error('Failed to load lineage data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
          Family Lineages
        </h1>
        <p className="text-muted-foreground mt-2">
          {loading ? 'Loading...' : `${mothers.length} foundation mothers`}
        </p>
      </div>

      {/* Foundation Mothers */}
      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
        <h2 className="text-2xl font-semibold mb-4">Foundation Mothers</h2>
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : mothers.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No foundation mothers found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mothers.map((mother: any) => (
              <Link
                key={mother.cattle.id}
                href={`/cattle/${mother.cattle.id}`}
                className="block p-6 bg-gray-50 rounded-lg hover:shadow-lg transition-shadow border border-gray-200"
              >
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {mother.cattle.managementTag || mother.cattle.tagNo}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Tag: {mother.cattle.tagNo}
                  </p>
                  <p className="text-sm text-gray-600">
                    Breed: {mother.cattle.breed || 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600">
                    YOB: {mother.cattle.yob}
                  </p>
                  <div className="pt-3 border-t border-gray-300">
                    <p className="text-sm font-medium text-green-600">
                      {mother.offspringCount} offspring
                    </p>
                    <p className="text-sm text-gray-500">
                      {mother.descendantCount} total descendants
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
