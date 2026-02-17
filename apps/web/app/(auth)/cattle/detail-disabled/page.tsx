'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { format } from 'date-fns'

interface CattleDetail {
  id: number
  tagNo: string
  managementTag: string | null
  yob: number
  dob: string
  breed: string | null
  sex: string | null
  size: number | null
  onFarm: boolean
  currentStatus: string | null
  notes: string | null
  damId: number | null
  sireId: number | null
}

interface FamilyInfo {
  dam: { id: number; tagNo: string; managementTag: string | null } | null
  sire: { id: number; tagNo: string; managementTag: string | null } | null
  offspring: Array<{ id: number; tagNo: string; managementTag: string | null; yob: number; sex: string | null }>
  siblings: Array<{ id: number; tagNo: string; managementTag: string | null; yob: number; sex: string | null }>
}

interface ServiceRecord {
  id: number
  serviceDate: string
  bullId: number | null
  bullTag: string | null
  serviceType: string
  successful: boolean | null
  notes: string | null
}

interface CalvingRecord {
  id: number
  calvingDate: string
  calfId: number | null
  calfTag: string | null
  difficulty: string | null
  notes: string | null
}

interface HealthRecord {
  id: number
  date: string
  type: string
  description: string
  treatment: string | null
  vetName: string | null
  cost: number | null
}

interface SaleRecord {
  id: number
  saleDate: string
  salePrice: number
  weight: number | null
  buyer: string | null
  notes: string | null
}

export default function CattleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [cattle, setCattle] = useState<CattleDetail | null>(null)
  const [family, setFamily] = useState<FamilyInfo | null>(null)
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [calvings, setCalvings] = useState<CalvingRecord[]>([])
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([])
  const [saleRecord, setSaleRecord] = useState<SaleRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      loadCattleDetails()
    }
  }, [id])

  const loadCattleDetails = async () => {
    try {
      setLoading(true)
      setError(null)

      const cattleId = parseInt(id)

      const [cattleRes, familyRes, servicesRes, healthRes] = await Promise.allSettled([
        apiClient.getCattleById(cattleId),
        apiClient.getFamilyOverview(cattleId),
        apiClient.getServiceRecords({ cattleId, limit: 50 }),
        apiClient.getHealthRecords(cattleId)
      ])

      if (cattleRes.status === 'fulfilled') {
        const cattleData = (cattleRes.value as any).data || cattleRes.value
        setCattle(cattleData)

        // Check if cattle was sold
        if (!cattleData.onFarm) {
          try {
            const salesRes = await apiClient.getSales({})
            const allSales = (salesRes as any).data || salesRes || []
            const sale = allSales.find((s: any) => s.cattleId === cattleId)
            if (sale) setSaleRecord(sale)
          } catch (err) {
            console.error('Failed to load sale record:', err)
          }
        }
      }

      if (familyRes.status === 'fulfilled') {
        setFamily((familyRes.value as any).data || familyRes.value)
      }

      if (servicesRes.status === 'fulfilled') {
        const servicesData = (servicesRes.value as any).data || servicesRes.value || []
        setServices(servicesData)
      }

      if (healthRes.status === 'fulfilled') {
        const healthData = (healthRes.value as any).data || healthRes.value || []
        setHealthRecords(healthData)
      }

      // Load calvings if female
      if (cattleRes.status === 'fulfilled') {
        const cattleData = (cattleRes.value as any).data || cattleRes.value
        if (cattleData.sex === 'Female' || cattleData.sex === 'F') {
          try {
            const calvingsRes = await apiClient.getCalvings({})
            const allCalvings = (calvingsRes as any).data || calvingsRes || []
            const cattleCalvings = allCalvings.filter((c: any) => c.cattleId === cattleId)
            setCalvings(cattleCalvings)
          } catch (err) {
            console.error('Failed to load calvings:', err)
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load cattle details:', err)
      setError(err.message || 'Failed to load cattle details')
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
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
        <Link
          href={`/cattle/${id}/edit`}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2"
        >
          Edit Details
        </Link>
      </div>

      {/* Basic Information Card */}
      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
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
            <p className="text-sm text-gray-600 mb-1">Year of Birth</p>
            <p className="text-lg font-medium text-gray-900">{cattle.yob}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Date of Birth</p>
            <p className="text-lg font-medium text-gray-900">
              {format(new Date(cattle.dob), 'MMM dd, yyyy')}
            </p>
          </div>
          {cattle.size && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Size</p>
              <p className="text-lg font-medium text-gray-900">{cattle.size}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p className="text-lg font-medium text-gray-900">{cattle.currentStatus || 'Unknown'}</p>
          </div>
        </div>
        {cattle.notes && (
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600 mb-2">Notes</p>
            <p className="text-gray-900">{cattle.notes}</p>
          </div>
        )}
      </div>

      {/* Family Relationships */}
      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
        <h2 className="text-xl font-semibold mb-4">Family Relationships</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-3">Parents</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500">Dam (Mother)</p>
                {family?.dam ? (
                  <Link
                    href={`/cattle/${family.dam.id}`}
                    className="text-green-600 hover:text-green-700 font-medium"
                  >
                    {family.dam.managementTag || family.dam.tagNo}
                  </Link>
                ) : (
                  <p className="text-gray-400">Unknown</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Sire (Father)</p>
                {family?.sire ? (
                  <Link
                    href={`/cattle/${family.sire.id}`}
                    className="text-green-600 hover:text-green-700 font-medium"
                  >
                    {family.sire.managementTag || family.sire.tagNo}
                  </Link>
                ) : (
                  <p className="text-gray-400">Unknown</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-3">Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Offspring</span>
                <span className="font-medium">{family?.offspring?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Siblings</span>
                <span className="font-medium">{family?.siblings?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {family?.offspring && family.offspring.length > 0 && (
          <div className="pt-6 border-t">
            <h3 className="text-sm font-medium text-gray-600 mb-3">Offspring</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {family.offspring.map((child) => (
                <Link
                  key={child.id}
                  href={`/cattle/${child.id}`}
                  className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <p className="font-medium text-gray-900">
                    {child.managementTag || child.tagNo}
                  </p>
                  <p className="text-sm text-gray-500">
                    {child.sex} • {child.yob}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reproductive History - Only for females */}
      {(cattle.sex === 'Female' || cattle.sex === 'F') && (
        <div className="bg-white rounded-lg shadow-medium border-0 overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Reproductive History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {services.length === 0 && calvings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No reproductive history recorded
                    </td>
                  </tr>
                ) : (
                  <>
                    {services.map((service) => (
                      <tr key={`service-${service.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            Service
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(service.serviceDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {service.serviceType}
                          {service.bullTag && ` - Bull: ${service.bullTag}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            service.successful === true
                              ? 'bg-green-100 text-green-800'
                              : service.successful === false
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {service.successful === true ? 'Success' : service.successful === false ? 'Failed' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {calvings.map((calving) => (
                      <tr key={`calving-${calving.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Calving
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(calving.calvingDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {calving.calfTag ? `Calf: ${calving.calfTag}` : 'Calf tag not recorded'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            calving.difficulty === 'easy' || !calving.difficulty
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {calving.difficulty || 'Normal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Health Records Timeline */}
      <div className="bg-white rounded-lg shadow-medium border-0 p-6">
        <h2 className="text-xl font-semibold mb-4">Health Records</h2>
        {healthRecords.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No health records found</p>
        ) : (
          <div className="space-y-4">
            {healthRecords.map((record) => (
              <div key={record.id} className="border-l-4 border-green-600 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{record.type}</p>
                    <p className="text-sm text-gray-600 mt-1">{record.description}</p>
                    {record.treatment && (
                      <p className="text-sm text-gray-500 mt-1">Treatment: {record.treatment}</p>
                    )}
                    {record.vetName && (
                      <p className="text-xs text-gray-500 mt-1">Vet: {record.vetName}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{format(new Date(record.date), 'MMM dd, yyyy')}</p>
                    {record.cost && (
                      <p className="text-sm font-medium text-gray-900 mt-1">£{record.cost}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Financial Record - Only if sold */}
      {saleRecord && (
        <div className="bg-white rounded-lg shadow-medium border-0 p-6">
          <h2 className="text-xl font-semibold mb-4">Sale Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Sale Date</p>
              <p className="text-lg font-medium text-gray-900">
                {format(new Date(saleRecord.saleDate), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Sale Price</p>
              <p className="text-lg font-medium text-green-600">£{saleRecord.salePrice.toLocaleString()}</p>
            </div>
            {saleRecord.weight && (
              <>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Weight</p>
                  <p className="text-lg font-medium text-gray-900">{saleRecord.weight} kg</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Price per kg</p>
                  <p className="text-lg font-medium text-gray-900">
                    £{(saleRecord.salePrice / saleRecord.weight).toFixed(2)}
                  </p>
                </div>
              </>
            )}
            {saleRecord.buyer && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Buyer</p>
                <p className="text-lg font-medium text-gray-900">{saleRecord.buyer}</p>
              </div>
            )}
          </div>
          {saleRecord.notes && (
            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-gray-600 mb-2">Sale Notes</p>
              <p className="text-gray-900">{saleRecord.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
