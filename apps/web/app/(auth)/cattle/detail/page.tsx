'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

function CattleDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''

  const [cattle, setCattle] = useState<CattleDetail | null>(null)
  const [familyTree, setFamilyTree] = useState<any>(null)
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

      const [cattleRes, familyTreeRes] = await Promise.all([
        apiClient.getCattleById(cattleId),
        apiClient.getFamilyTree(cattleId).catch(() => null)
      ])

      const cattleData = (cattleRes as any).data || cattleRes
      setCattle(cattleData)

      if (familyTreeRes) {
        setFamilyTree((familyTreeRes as any).data || familyTreeRes)
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

      {/* Family Tree */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-6">Family Tree</h2>
        <div className="space-y-6">
          {/* Ancestors */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-4">Ancestors</h3>
            <div className="flex items-center justify-center">
              <div className="grid grid-cols-3 gap-8 max-w-4xl w-full">
                {/* Grandparents */}
                <div className="space-y-4">
                  <h4 className="text-xs text-gray-500 text-center">Paternal Grandparents</h4>
                  <div className="text-center p-3 bg-gray-50 rounded text-sm">-</div>
                  <div className="text-center p-3 bg-gray-50 rounded text-sm">-</div>
                </div>

                {/* Parents */}
                <div className="space-y-4">
                  <h4 className="text-xs text-gray-500 text-center">Parents</h4>
                  <div className="text-center p-3 bg-blue-50 border-2 border-blue-200 rounded">
                    <p className="text-xs text-gray-500">Sire</p>
                    <p className="font-medium">-</p>
                  </div>
                  <div className="text-center p-3 bg-pink-50 border-2 border-pink-200 rounded">
                    <p className="text-xs text-gray-500">Dam</p>
                    {cattle.dam ? (
                      <Link
                        href={`/cattle/detail?id=${cattle.dam.id}`}
                        className="font-medium text-green-600 hover:text-green-700"
                      >
                        {cattle.dam.managementTag || cattle.dam.tagNo}
                      </Link>
                    ) : (
                      <p className="font-medium">-</p>
                    )}
                  </div>
                </div>

                {/* Maternal Grandparents */}
                <div className="space-y-4">
                  <h4 className="text-xs text-gray-500 text-center">Maternal Grandparents</h4>
                  {cattle.dam?.dam ? (
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <Link
                        href={`/cattle/detail?id=${cattle.dam.dam.id}`}
                        className="text-sm text-green-600 hover:text-green-700"
                      >
                        {cattle.dam.dam.managementTag || cattle.dam.dam.tagNo}
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center p-3 bg-gray-50 rounded text-sm">-</div>
                  )}
                  <div className="text-center p-3 bg-gray-50 rounded text-sm">-</div>
                </div>
              </div>
            </div>
          </div>

          {/* This Animal */}
          <div className="flex justify-center">
            <div className="p-4 bg-green-50 border-2 border-green-500 rounded-lg shadow-lg">
              <p className="text-xs text-gray-500 text-center">Current Animal</p>
              <p className="text-lg font-bold text-center text-green-700">
                {cattle.managementTag || cattle.tagNo}
              </p>
              <p className="text-xs text-center text-gray-600">{cattle.sex} • {cattle.yob}</p>
            </div>
          </div>

          {/* Offspring */}
          {cattle.offspring && cattle.offspring.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-4">Offspring ({cattle.offspring.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {cattle.offspring.map((child: any) => (
                  <Link
                    key={child.id}
                    href={`/cattle/detail?id=${child.id}`}
                    className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
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
      </div>

      {/* Financial Record - Only if sold */}
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
              <p className="text-lg font-medium text-green-600">£{cattle.sale.salePrice?.toLocaleString()}</p>
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
                    £{(cattle.sale.salePrice / cattle.sale.weightKg).toFixed(2)}
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

      {/* Health Records */}
      {cattle.healthEvents && cattle.healthEvents.length > 0 && (
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
