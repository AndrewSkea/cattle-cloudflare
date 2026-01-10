'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

export default function HealthPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      // Placeholder - health records page coming soon
      setRecords([])
    } catch (err) {
      console.error('Failed to load health records:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
          Health Records
        </h1>
        <p className="text-muted-foreground mt-2">
          Track health events across your herd
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
        <h2 className="text-2xl font-semibold mb-4">Recent Health Events</h2>
        <p className="text-center py-8 text-muted-foreground">
          Health records page coming soon
        </p>
      </div>
    </div>
  )
}
