'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import {
  ContextMenu,
  useCattleActions,
  AddChildModal,
  PronounceDeadModal,
  AddVaccineModal,
  AddMedicationModal,
  AddWeightModal,
  AddNotesModal,
  SellModal,
  MoveToMartModal,
  LogCostModal,
} from '@/components/cattle-actions'

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

type StatusFilter = 'All' | 'On Farm' | 'At the Mart' | 'Sold'

export default function CattlePage() {
  const [search, setSearch] = useState('')
  const [cattle, setCattle] = useState<Cattle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')

  // Batch modals
  const [sellModalOpen, setSellModalOpen] = useState(false)
  const [martModalOpen, setMartModalOpen] = useState(false)
  const [costModalOpen, setCostModalOpen] = useState(false)

  const {
    activeModal,
    selectedAnimal,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    openAction,
    closeAction,
    selectedIds,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  } = useCattleActions()

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

  // Filter cattle by search + status
  let filteredCattle = cattle.filter(c => {
    const matchesSearch = search === '' ||
      c.tagNo.toLowerCase().includes(search.toLowerCase()) ||
      c.managementTag?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'On Farm' && c.onFarm && c.currentStatus !== 'At the Mart') ||
      (statusFilter === 'At the Mart' && c.currentStatus === 'At the Mart') ||
      (statusFilter === 'Sold' && c.currentStatus === 'Sold')

    return matchesSearch && matchesStatus
  })

  // Sort cattle
  if (sortBy) {
    filteredCattle = [...filteredCattle].sort((a, b) => {
      let aVal: any = a[sortBy as keyof Cattle]
      let bVal: any = b[sortBy as keyof Cattle]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (sortBy === 'size') {
        const comparison = (aVal as number) - (bVal as number)
        return sortOrder === 'desc' ? comparison : -comparison
      }

      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      return sortOrder === 'desc' ? -comparison : comparison
    })
  }

  // Status counts
  const statusCounts: Record<StatusFilter, number> = {
    'All': cattle.length,
    'On Farm': cattle.filter(c => c.onFarm && c.currentStatus !== 'At the Mart').length,
    'At the Mart': cattle.filter(c => c.currentStatus === 'At the Mart').length,
    'Sold': cattle.filter(c => c.currentStatus === 'Sold').length,
  }

  const handleActionSuccess = () => {
    clearSelection()
    loadCattle()
  }

  // Animals for batch modals
  const selectedAnimals = filteredCattle.filter(c => isSelected(c.id))

  // Context menu handler — routes to single or batch actions
  const handleContextMenuAction = (action: string) => {
    if (contextMenu?.isMulti) {
      if (action === 'sell') setSellModalOpen(true)
      else if (action === 'moveToMart') setMartModalOpen(true)
      closeContextMenu()
    } else {
      openAction(action as any)
    }
  }

  // Select all visible rows
  const allVisibleIds = filteredCattle.map(c => c.id)
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => isSelected(id))
  const someVisibleSelected = allVisibleIds.some(id => isSelected(id))

  const handleHeaderCheckbox = () => {
    if (allVisibleSelected) {
      // Deselect all visible
      allVisibleIds.forEach(id => {
        if (isSelected(id)) toggleSelection(id)
      })
    } else {
      selectAll(allVisibleIds)
    }
  }

  const statusPillColors: Record<StatusFilter, string> = {
    'All': 'bg-gray-100 text-gray-700',
    'On Farm': 'bg-green-100 text-green-700',
    'At the Mart': 'bg-amber-100 text-amber-700',
    'Sold': 'bg-blue-100 text-blue-700',
  }

  const activeStatusPillColors: Record<StatusFilter, string> = {
    'All': 'bg-gray-700 text-white',
    'On Farm': 'bg-green-600 text-white',
    'At the Mart': 'bg-amber-500 text-white',
    'Sold': 'bg-blue-600 text-white',
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
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={() => apiClient.downloadExport('cattle', { status: statusFilter === 'On Farm' ? 'on_farm' : statusFilter === 'Sold' ? 'sold' : 'all' })}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 h-10 px-4 py-2"
          >
            Export
          </button>
          <Link
            href="/cattle/new"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 shadow-lg hover:shadow-xl flex-1 md:flex-none"
          >
            + Add New Cattle
          </Link>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input
            type="text"
            placeholder="Search by tag number or management tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {(['All', 'On Farm', 'At the Mart', 'Sold'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s ? activeStatusPillColors[s] : statusPillColors[s]
              }`}
            >
              {s} ({statusCounts[s]})
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">Right-click any row for quick actions</p>
      </div>

      {/* Selection Bar */}
      {selectedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-green-800">{selectedCount} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setSellModalOpen(true)}
              className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              £ Sell
            </button>
            <button
              onClick={() => setCostModalOpen(true)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Log Cost
            </button>
            <button
              onClick={() => setMartModalOpen(true)}
              className="px-3 py-1.5 text-sm font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors"
            >
              🚚 Move to Mart
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                      onChange={handleHeaderCheckbox}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                  </th>
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
                        <span className="ml-1">{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>
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
                {filteredCattle.map((animal) => {
                  const selected = isSelected(animal.id)
                  const multiActive = selectedCount > 0
                  return (
                    <tr
                      key={animal.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selected ? 'bg-green-50' : ''}`}
                      onClick={() => window.location.href = `/cattle/detail?id=${animal.id}`}
                      onContextMenu={(e) => {
                        // If right-clicking a selected row while multi-select is active → batch menu
                        const isMulti = multiActive && selected
                        openContextMenu(e, animal, isMulti)
                      }}
                    >
                      <td
                        className="px-4 py-4"
                        onClick={e => { e.stopPropagation(); toggleSelection(animal.id) }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelection(animal.id)}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
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
                          animal.currentStatus === 'Active' ? 'bg-green-100 text-green-800' :
                          animal.currentStatus === 'At the Mart' ? 'bg-amber-100 text-amber-800' :
                          animal.currentStatus === 'Sold' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {animal.currentStatus || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {animal.onFarm ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        )}
        {(search || statusFilter !== 'All') && filteredCattle.length === 0 && !loading && !error && (
          <div className="p-6">
            <p className="text-muted-foreground text-center py-4">
              No cattle match your search criteria
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextMenuAction}
          onClose={closeContextMenu}
          multiSelect={contextMenu.isMulti}
        />
      )}

      {/* Single-animal Action Modals */}
      <AddChildModal open={activeModal === 'addChild'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      <PronounceDeadModal open={activeModal === 'pronounceDead'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      <AddVaccineModal open={activeModal === 'addVaccine'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      <AddMedicationModal open={activeModal === 'addMedication'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      <AddWeightModal open={activeModal === 'addWeight'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      <AddNotesModal open={activeModal === 'addNotes'} onClose={closeAction} animal={selectedAnimal} onSuccess={handleActionSuccess} />
      {/* Single-animal sell/mart from context menu */}
      <SellModal
        open={activeModal === 'sell'}
        onClose={closeAction}
        animals={selectedAnimal ? [selectedAnimal] : []}
        onSuccess={handleActionSuccess}
      />
      <MoveToMartModal
        open={activeModal === 'moveToMart'}
        onClose={closeAction}
        animals={selectedAnimal ? [selectedAnimal] : []}
        onSuccess={handleActionSuccess}
      />

      {/* Batch Action Modals */}
      <SellModal
        open={sellModalOpen}
        onClose={() => setSellModalOpen(false)}
        animals={selectedAnimals}
        onSuccess={handleActionSuccess}
      />
      <MoveToMartModal
        open={martModalOpen}
        onClose={() => setMartModalOpen(false)}
        animals={selectedAnimals}
        onSuccess={handleActionSuccess}
      />
      <LogCostModal
        open={costModalOpen}
        onClose={() => setCostModalOpen(false)}
        animals={selectedAnimals}
        onSuccess={() => { setCostModalOpen(false); clearSelection(); }}
      />
    </div>
  )
}
