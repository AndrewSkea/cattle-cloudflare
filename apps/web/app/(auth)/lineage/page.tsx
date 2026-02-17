'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import FamilyTree from '@/components/family-tree'
import FamilyStats from '@/components/family-stats'

export default function LineagePage() {
  const [mothers, setMothers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Selected animal state
  const [selectedAnimalId, setSelectedAnimalId] = useState<number | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<any>(null)
  const [treeData, setTreeData] = useState<any>(null)
  const [statsData, setStatsData] = useState<any>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)

  // Load foundation mothers on mount
  useEffect(() => {
    loadData()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load tree and stats when selectedAnimalId changes
  useEffect(() => {
    if (selectedAnimalId !== null) {
      loadAnimalData(selectedAnimalId)
    }
  }, [selectedAnimalId])

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

  const loadAnimalData = async (id: number) => {
    // Fetch cattle details, tree, and stats in parallel
    setTreeLoading(true)
    setStatsLoading(true)
    setTreeData(null)
    setStatsData(null)
    setSelectedAnimal(null)

    try {
      const [cattleRes, treeRes] = await Promise.all([
        apiClient.getCattleById(id),
        apiClient.getFamilyTree(id),
      ])
      setSelectedAnimal((cattleRes as any).data || null)
      setTreeData((treeRes as any).data || null)
    } catch (err) {
      console.error('Failed to load animal/tree data:', err)
    } finally {
      setTreeLoading(false)
    }

    try {
      const statsRes: any = await apiClient.getEnhancedFamilyStats(id)
      setStatsData((statsRes as any).data || null)
    } catch (err) {
      console.error('Failed to load family stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!value.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res: any = await apiClient.getCattle({ search: value.trim() })
        setSearchResults(res.data || [])
        setShowDropdown(true)
      } catch (err) {
        console.error('Search failed:', err)
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  const handleSelectAnimal = useCallback((id: number) => {
    setSelectedAnimalId(id)
    setSearchQuery('')
    setSearchResults([])
    setShowDropdown(false)
  }, [])

  const handleClearSelection = () => {
    setSelectedAnimalId(null)
    setSelectedAnimal(null)
    setTreeData(null)
    setStatsData(null)
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          Family Lineages
        </h1>
        <p className="text-muted-foreground mt-2">
          {selectedAnimal
            ? `Viewing lineage for ${selectedAnimal.managementTag || selectedAnimal.tagNo}`
            : loading
              ? 'Loading...'
              : `${mothers.length} foundation mothers`}
        </p>
      </div>

      {/* Search Bar */}
      <div ref={searchRef} className="relative max-w-lg">
        <label htmlFor="animal-search" className="sr-only">
          Search animals
        </label>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            id="animal-search"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true)
            }}
            placeholder="Search by tag number or management tag..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
          />
          {searchLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search Dropdown */}
        {showDropdown && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">
                No animals found
              </div>
            ) : (
              searchResults.map((animal: any) => (
                <button
                  key={animal.id}
                  onClick={() => handleSelectAnimal(animal.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">
                        {animal.managementTag || animal.tagNo}
                      </span>
                      {animal.managementTag && (
                        <span className="ml-2 text-xs text-gray-500">
                          Tag: {animal.tagNo}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {animal.breed || 'Unknown'}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                          animal.sex === 'Female'
                            ? 'bg-pink-100 text-pink-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {animal.sex || '?'}
                      </span>
                    </div>
                  </div>
                  {animal.yob && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Born: {animal.yob}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected Animal View */}
      {selectedAnimalId !== null && (
        <div className="space-y-4">
          {/* Back / Clear button */}
          <button
            onClick={handleClearSelection}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to foundation mothers
          </button>

          {/* Selected animal header */}
          {selectedAnimal && (
            <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-4 flex flex-wrap items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedAnimal.managementTag || selectedAnimal.tagNo}
                </h2>
                {selectedAnimal.managementTag && (
                  <p className="text-sm text-gray-500">
                    Tag: {selectedAnimal.tagNo}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAnimal.breed && (
                  <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {selectedAnimal.breed}
                  </span>
                )}
                {selectedAnimal.sex && (
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
                      selectedAnimal.sex === 'Female'
                        ? 'bg-pink-100 text-pink-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {selectedAnimal.sex}
                  </span>
                )}
                {selectedAnimal.yob && (
                  <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    Born {selectedAnimal.yob}
                  </span>
                )}
                {selectedAnimal.onFarm !== undefined && (
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${
                      selectedAnimal.onFarm
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {selectedAnimal.onFarm ? 'On Farm' : 'Off Farm'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Two-column layout: Tree + Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Family Tree - takes 2/3 on large screens */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow-soft border border-gray-200 p-6 min-h-[400px]">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Family Tree
              </h3>
              {treeLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-8 w-8 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin" />
                </div>
              ) : treeData ? (
                <FamilyTree
                  ancestors={treeData.ancestors || []}
                  currentAnimal={selectedAnimal}
                  descendants={treeData.descendants || []}
                  onSelectAnimal={handleSelectAnimal}
                />
              ) : (
                <p className="text-center py-8 text-gray-500">
                  No tree data available
                </p>
              )}
            </div>

            {/* Family Stats - takes 1/3 on large screens */}
            <div className="lg:col-span-1 bg-white rounded-lg shadow-soft border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Family Statistics
              </h3>
              <FamilyStats data={statsData} loading={statsLoading} />
            </div>
          </div>
        </div>
      )}

      {/* Foundation Mothers (default view when no animal selected) */}
      {selectedAnimalId === null && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-2xl font-semibold mb-4">Foundation Mothers</h2>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">
              Loading...
            </p>
          ) : mothers.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No foundation mothers found
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mothers.map((mother: any) => (
                <button
                  key={mother.cattle.id}
                  onClick={() => handleSelectAnimal(mother.cattle.id)}
                  className="block w-full text-left p-6 bg-gray-50 rounded-lg hover:shadow-lg transition-shadow border border-gray-200"
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
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
