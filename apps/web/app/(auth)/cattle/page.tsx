'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

interface Cattle {
  id: number
  tagNo: string
  managementTag: string | null
  yob: number
  dob: string
  breed: string | null
  sex: string | null
  size: number | null
  sizeLabel: string | null
  onFarm: boolean
  currentStatus: string | null
}

export default function CattlePage() {
  const [search, setSearch] = useState('')
  const [cattle, setCattle] = useState<Cattle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadCattle()
  }, [])

  const loadCattle = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: any = await apiClient.getCattle()
      setCattle(response.data || [])
    } catch (err: any) {
      console.error('Failed to load cattle:', err)
      setError(err.message || 'Failed to load cattle records')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Filter cattle
  let filteredCattle = cattle.filter(c =>
    search === '' ||
    c.tagNo.toLowerCase().includes(search.toLowerCase()) ||
    c.managementTag?.toLowerCase().includes(search.toLowerCase())
  )

  // Sort cattle
  if (sortBy) {
    filteredCattle = [...filteredCattle].sort((a, b) => {
      let aVal: any = a[sortBy as keyof Cattle]
      let bVal: any = b[sortBy as keyof Cattle]

      // Handle null values
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      // For size, reverse comparison (1=large, 4=small)
      if (sortBy === 'size') {
        const comparison = (aVal as number) - (bVal as number)
        return sortOrder === 'desc' ? comparison : -comparison
      }

      // For other fields
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      return sortOrder === 'desc' ? -comparison : comparison
    })
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Cattle Records
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
            {loading ? 'Loading...' : `${cattle.length} total records`}
          </p>
        </div>
        <Link
          href="/cattle/new"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 shadow-lg hover:shadow-xl w-full md:w-auto"
        >
          + Add New Cattle
        </Link>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Search by tag number or management tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        {error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-medium">Error loading cattle records</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              <button
                onClick={loadCattle}
                className="mt-3 text-sm text-red-800 underline hover:text-red-900"
              >
                Try again
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="p-6">
            <p className="text-muted-foreground text-center py-8">
              Loading cattle records...
            </p>
          </div>
        ) : cattle.length === 0 ? (
          <div className="p-6">
            <p className="text-muted-foreground text-center py-8">
              No cattle records found. Add your first cattle to get started.
            </p>
          </div>
        ) : (
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tag Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Management Tag
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Breed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sex
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('size')}
                  >
                    <div className="flex items-center">
                      Size
                      {sortBy === 'size' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    YOB
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    On Farm
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCattle.map((animal) => (
                  <tr
                    key={animal.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/cattle/detail?id=${animal.id}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {animal.tagNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {animal.managementTag || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {animal.breed || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {animal.sex || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        animal.size === 1 ? 'bg-purple-100 text-purple-800' :
                        animal.size === 2 ? 'bg-blue-100 text-blue-800' :
                        animal.size === 3 ? 'bg-yellow-100 text-yellow-800' :
                        animal.size === 4 ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {animal.sizeLabel || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {animal.yob}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        animal.currentStatus === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {animal.currentStatus || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {animal.onFarm ? 'Yes' : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
        {search && filteredCattle.length === 0 && !loading && !error && (
          <div className="p-6">
            <p className="text-muted-foreground text-center py-4">
              No cattle match your search criteria
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
