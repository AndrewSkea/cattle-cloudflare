'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { format } from 'date-fns'
import FamilyTree from '@/components/family-tree'
import FamilyStats from '@/components/family-stats'

interface CattleDetail {
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
  notes: string | null
  dam: any
  offspring: any[]
  services: any[]
  sale: any
  healthEvents: any[]
  calvings: any[]
}

type TabId = 'info' | 'family' | 'health' | 'history'

function CattleDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''

  const [cattle, setCattle] = useState<CattleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('info')

  // Family tab data (lazy loaded)
  const [treeData, setTreeData] = useState<any>(null)
  const [statsData, setStatsData] = useState<any>(null)
  const [familyLoading, setFamilyLoading] = useState(false)
  const familyLoadedRef = useRef(false)

  useEffect(() => {
    if (id) {
      loadCattleDetails()
      // Reset family data when navigating to a different animal
      familyLoadedRef.current = false
      setTreeData(null)
      setStatsData(null)
      setActiveTab('info')
    }
  }, [id])

  // Lazy load family data when the family tab is first activated
  useEffect(() => {
    if (activeTab === 'family' && !familyLoadedRef.current && id) {
      familyLoadedRef.current = true
      loadFamilyData()
    }
  }, [activeTab, id])

  const loadCattleDetails = async () => {
    try {
      setLoading(true)
      setError(null)

      const cattleId = parseInt(id)
      const cattleRes = await apiClient.getCattleById(cattleId)
      const cattleData = (cattleRes as any).data || cattleRes
      setCattle(cattleData)
    } catch (err: any) {
      console.error('Failed to load cattle details:', err)
      setError(err.message || 'Failed to load cattle details')
    } finally {
      setLoading(false)
    }
  }

  const loadFamilyData = async () => {
    try {
      setFamilyLoading(true)
      const cattleId = parseInt(id)

      const [treeRes, statsRes] = await Promise.all([
        apiClient.getFamilyTree(cattleId).catch(() => null),
        apiClient.getEnhancedFamilyStats(cattleId).catch(() => null),
      ])

      if (treeRes) {
        setTreeData((treeRes as any).data || treeRes)
      }
      if (statsRes) {
        setStatsData((statsRes as any).data || statsRes)
      }
    } catch (err) {
      console.error('Failed to load family data:', err)
    } finally {
      setFamilyLoading(false)
    }
  }

  const handleSelectAnimal = (newId: number) => {
    router.push(`/cattle/detail?id=${newId}`)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
            <p className="text-muted-foreground">Loading cattle details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !cattle) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 font-medium">Error loading cattle details</p>
          <p className="text-red-600 text-sm mt-1">{error || 'Cattle not found'}</p>
          <div className="flex gap-3 mt-3">
            <button
              onClick={loadCattleDetails}
              className="text-sm text-red-800 underline hover:text-red-900"
            >
              Try again
            </button>
            <button
              onClick={() => router.push('/cattle')}
              className="text-sm text-red-800 underline hover:text-red-900"
            >
              Back to cattle list
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isFemale = cattle.sex === 'fem' || cattle.sex === 'hief'

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info', label: 'Info' },
    { id: 'family', label: 'Family' },
    { id: 'health', label: 'Health' },
    ...(isFemale ? [{ id: 'history' as TabId, label: 'History' }] : []),
  ]

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => router.push('/cattle')}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              {cattle.managementTag || cattle.tagNo}
            </h1>
            {cattle.onFarm ? (
              <span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                On Farm
              </span>
            ) : (
              <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">
                Sold
              </span>
            )}
          </div>
          <p className="text-muted-foreground">
            Official Tag: {cattle.tagNo}
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <InfoTab cattle={cattle} />
      )}

      {activeTab === 'family' && (
        <FamilyTab
          cattle={cattle}
          treeData={treeData}
          statsData={statsData}
          familyLoading={familyLoading}
          onSelectAnimal={handleSelectAnimal}
        />
      )}

      {activeTab === 'health' && (
        <HealthTab cattle={cattle} />
      )}

      {activeTab === 'history' && isFemale && (
        <HistoryTab cattle={cattle} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Info Tab                                                            */
/* ------------------------------------------------------------------ */
function InfoTab({ cattle }: { cattle: CattleDetail }) {
  return (
    <div className="space-y-6">
      {/* Basic Information Card */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Breed</p>
            <p className="text-lg font-medium text-gray-900">{cattle.breed || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Sex</p>
            <p className="text-lg font-medium text-gray-900">{cattle.sex || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Size</p>
            <div className="flex items-center">
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                cattle.size === 1 ? 'bg-purple-100 text-purple-800' :
                cattle.size === 2 ? 'bg-blue-100 text-blue-800' :
                cattle.size === 3 ? 'bg-yellow-100 text-yellow-800' :
                cattle.size === 4 ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {cattle.sizeLabel || 'Unknown'}
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Year of Birth</p>
            <p className="text-lg font-medium text-gray-900">{cattle.yob}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Date of Birth</p>
            <p className="text-lg font-medium text-gray-900">
              {format(new Date(cattle.dob), 'MMM dd, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p className="text-lg font-medium text-gray-900">{cattle.currentStatus || 'Unknown'}</p>
          </div>
          {cattle.sale?.weightKg && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Weight at Sale</p>
              <p className="text-lg font-medium text-gray-900">{cattle.sale.weightKg} kg</p>
            </div>
          )}
        </div>
        {cattle.notes && (
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600 mb-2">Notes</p>
            <p className="text-gray-900">{cattle.notes}</p>
          </div>
        )}
      </div>

      {/* Sale Information - Only if sold */}
      {cattle.sale && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Sale Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Sale Date</p>
              <p className="text-lg font-medium text-gray-900">
                {format(new Date(cattle.sale.eventDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Sale Price</p>
              <p className="text-lg font-medium text-green-600">{'\u00a3'}{cattle.sale.salePrice?.toLocaleString()}</p>
            </div>
            {cattle.sale.weightKg && (
              <>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Weight</p>
                  <p className="text-lg font-medium text-gray-900">{cattle.sale.weightKg} kg</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Price per kg</p>
                  <p className="text-lg font-medium text-gray-900">
                    {'\u00a3'}{(cattle.sale.salePrice / cattle.sale.weightKg).toFixed(2)}
                  </p>
                </div>
              </>
            )}
          </div>
          {cattle.sale.notes && (
            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-gray-600 mb-2">Sale Notes</p>
              <p className="text-gray-900">{cattle.sale.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Family Tab                                                          */
/* ------------------------------------------------------------------ */
function FamilyTab({
  cattle,
  treeData,
  statsData,
  familyLoading,
  onSelectAnimal,
}: {
  cattle: CattleDetail
  treeData: any
  statsData: any
  familyLoading: boolean
  onSelectAnimal: (id: number) => void
}) {
  if (familyLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mb-3"></div>
          <p className="text-sm text-gray-500">Loading family data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Family Tree */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Family Tree</h2>
        {treeData ? (
          <FamilyTree
            ancestors={treeData.ancestors || []}
            currentAnimal={{
              id: cattle.id,
              tagNo: cattle.tagNo,
              managementTag: cattle.managementTag,
              yob: cattle.yob,
              breed: cattle.breed,
              sex: cattle.sex,
              size: cattle.size,
              onFarm: cattle.onFarm,
            }}
            descendants={treeData.descendants || []}
            onSelectAnimal={onSelectAnimal}
          />
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No family tree data available for this animal.
          </p>
        )}
      </div>

      {/* Family Stats */}
      <FamilyStats data={statsData} loading={familyLoading} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Health Tab                                                          */
/* ------------------------------------------------------------------ */
function HealthTab({ cattle }: { cattle: CattleDetail }) {
  if (!cattle.healthEvents || cattle.healthEvents.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Health Records</h2>
        <p className="text-sm text-gray-500">No health records found for this animal.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
      <h2 className="text-xl font-semibold mb-4">Health Records</h2>
      <div className="space-y-4">
        {cattle.healthEvents.map((record: any) => (
          <div key={record.id} className="border-l-4 border-green-600 pl-4 py-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-900">{record.eventType}</p>
                <p className="text-sm text-gray-600 mt-1">{record.description}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">{format(new Date(record.eventDate), 'MMM dd, yyyy')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* History Tab (females only)                                          */
/* ------------------------------------------------------------------ */
function HistoryTab({ cattle }: { cattle: CattleDetail }) {
  const calvings = cattle.calvings || []
  const services = cattle.services || []

  const hasData = calvings.length > 0 || services.length > 0

  if (!hasData) {
    return (
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Reproductive History</h2>
        <p className="text-sm text-gray-500">No reproductive history found for this animal.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Calvings Timeline */}
      {calvings.length > 0 && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">
            Calvings
            <span className="ml-2 text-sm font-normal text-gray-500">({calvings.length})</span>
          </h2>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />

            <div className="space-y-6">
              {calvings.map((calving: any, index: number) => (
                <div key={calving.id || index} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-600" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {calving.calvingDate
                            ? format(new Date(calving.calvingDate), 'MMM dd, yyyy')
                            : 'Date unknown'}
                        </p>
                        {calving.assistanceLevel && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            calving.assistanceLevel === 'none' || calving.assistanceLevel === 'unassisted'
                              ? 'bg-green-100 text-green-700'
                              : calving.assistanceLevel === 'slight' || calving.assistanceLevel === 'easy'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          }`}>
                            {calving.assistanceLevel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Calf info */}
                    {calving.calf && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="text-gray-500">Calf: </span>
                        <Link
                          href={`/cattle/detail?id=${calving.calf.id || calving.calfId || calving.calf}`}
                          className="text-green-600 hover:text-green-700 font-medium"
                        >
                          {calving.calf.managementTag || calving.calf.tagNo || `#${calving.calf.id || calving.calfId || calving.calf}`}
                        </Link>
                        {calving.calf.sex && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                            calving.calf.sex === 'male' || calving.calf.sex === 'm'
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-pink-100 text-pink-700'
                          }`}>
                            {calving.calf.sex}
                          </span>
                        )}
                      </div>
                    )}

                    {calving.notes && (
                      <p className="mt-2 text-sm text-gray-500">{calving.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Services List */}
      {services.length > 0 && (
        <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">
            Services
            <span className="ml-2 text-sm font-normal text-gray-500">({services.length})</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">Date</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">Bull</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">Outcome</th>
                  <th className="text-left py-2 font-medium text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service: any, index: number) => (
                  <tr key={service.id || index} className="border-b border-gray-100">
                    <td className="py-2.5 pr-3 text-gray-900">
                      {service.serviceDate
                        ? format(new Date(service.serviceDate), 'MMM dd, yyyy')
                        : '-'}
                    </td>
                    <td className="py-2.5 pr-3">
                      {service.bull ? (
                        <Link
                          href={`/cattle/detail?id=${service.bull.id || service.bullId || service.bull}`}
                          className="text-green-600 hover:text-green-700 font-medium"
                        >
                          {service.bull.managementTag || service.bull.tagNo || `#${service.bull.id || service.bullId || service.bull}`}
                        </Link>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {service.outcome ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          service.outcome === 'confirmed' || service.outcome === 'pregnant'
                            ? 'bg-green-100 text-green-700'
                            : service.outcome === 'open' || service.outcome === 'not pregnant'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {service.outcome}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 text-gray-600 max-w-xs truncate">
                      {service.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CattleDetailPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <CattleDetailContent />
    </Suspense>
  )
}
