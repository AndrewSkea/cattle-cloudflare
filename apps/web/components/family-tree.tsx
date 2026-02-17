'use client'

import Link from 'next/link'

interface CattleNode {
  id: number
  tagNo: string
  managementTag: string | null
  yob: number
  breed: string | null
  sex: string | null
  size: number | null
  onFarm: boolean
  currentStatus?: string | null
}

interface FamilyTreeProps {
  ancestors: Array<{ generation: number; cattle: any }>
  currentAnimal: {
    id: number
    tagNo: string
    managementTag: string | null
    yob: number
    breed: string | null
    sex: string | null
    size: number | null
    onFarm: boolean
  }
  descendants: Array<{
    generation: number
    cattle: any
    descendants?: any[]
  }>
  onSelectAnimal?: (id: number) => void
}

const SIZE_CONFIG: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: 'Large', bg: 'bg-purple-100', text: 'text-purple-700' },
  2: { label: 'Med-Lg', bg: 'bg-blue-100', text: 'text-blue-700' },
  3: { label: 'Medium', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  4: { label: 'Small', bg: 'bg-orange-100', text: 'text-orange-700' },
}

function SizeBadge({ size }: { size: number | null }) {
  if (size == null || !SIZE_CONFIG[size]) return null
  const config = SIZE_CONFIG[size]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

function SexIndicator({ sex }: { sex: string | null }) {
  if (!sex) return null
  const isMale = sex.toLowerCase() === 'male' || sex.toLowerCase() === 'm'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${isMale ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'}`}>
      {isMale ? 'Male' : 'Female'}
    </span>
  )
}

function TreeNodeCard({
  cattle,
  isCurrent = false,
  descendantCount,
  onClick,
}: {
  cattle: CattleNode
  isCurrent?: boolean
  descendantCount?: number
  onClick?: (id: number) => void
}) {
  const displayTag = cattle.managementTag || cattle.tagNo
  const borderColor = isCurrent
    ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
    : cattle.onFarm
      ? 'border-green-300 bg-white'
      : 'border-gray-300 bg-gray-50'

  return (
    <button
      onClick={() => onClick?.(cattle.id)}
      className={`relative block w-48 rounded-lg border-2 ${borderColor} p-3 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-400`}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-900 truncate">{displayTag}</h4>
          {isCurrent && (
            <span className="ml-1 flex-shrink-0 inline-block w-2 h-2 rounded-full bg-green-500" />
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {cattle.breed || 'Unknown breed'} &middot; {cattle.yob}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SizeBadge size={cattle.size} />
          <SexIndicator sex={cattle.sex} />
        </div>
        {!cattle.onFarm && (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
            Sold
          </span>
        )}
      </div>
      {descendantCount != null && descendantCount > 0 && (
        <span className="absolute -bottom-2 -right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold shadow">
          +{descendantCount}
        </span>
      )}
    </button>
  )
}

function VerticalConnector() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-6 bg-gray-300" />
    </div>
  )
}

function countDescendants(node: any): number {
  if (!node.descendants || node.descendants.length === 0) return 0
  let count = node.descendants.length
  for (const child of node.descendants) {
    count += countDescendants(child)
  }
  return count
}

export default function FamilyTree({
  ancestors,
  currentAnimal,
  descendants,
  onSelectAnimal,
}: FamilyTreeProps) {
  // Sort ancestors by generation descending so oldest (highest generation) is at the top
  const sortedAncestors = [...ancestors].sort((a, b) => b.generation - a.generation)

  return (
    <div className="flex flex-col items-center space-y-0">
      {/* Ancestors section */}
      {sortedAncestors.length > 0 && (
        <div className="flex flex-col items-center">
          {sortedAncestors.map((ancestor, index) => (
            <div key={ancestor.cattle.id} className="flex flex-col items-center">
              {index > 0 && <VerticalConnector />}
              <div className="relative">
                <span className="absolute -left-20 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium whitespace-nowrap">
                  Gen {ancestor.generation}
                </span>
                <TreeNodeCard
                  cattle={ancestor.cattle}
                  onClick={onSelectAnimal}
                />
              </div>
            </div>
          ))}
          <VerticalConnector />
        </div>
      )}

      {/* Current animal - highlighted */}
      <div className="relative">
        <span className="absolute -left-20 top-1/2 -translate-y-1/2 text-xs text-green-600 font-semibold whitespace-nowrap">
          Current
        </span>
        <TreeNodeCard
          cattle={currentAnimal as CattleNode}
          isCurrent
          onClick={onSelectAnimal}
        />
      </div>

      {/* Descendants section */}
      {descendants.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Vertical line from current animal down to the horizontal connector */}
          <div className="flex justify-center">
            <div className="w-px h-6 bg-gray-300" />
          </div>

          {/* Horizontal connector bar */}
          <div className="relative flex items-start">
            {/* Horizontal line spanning across all children */}
            {descendants.length > 1 && (
              <div
                className="absolute top-0 h-px bg-gray-300"
                style={{
                  left: `calc(${(100 / descendants.length) * 0.5}% )`,
                  right: `calc(${(100 / descendants.length) * 0.5}% )`,
                }}
              />
            )}

            <div className="flex gap-4">
              {descendants.map((desc) => {
                const subDescCount = countDescendants(desc)
                return (
                  <div key={desc.cattle.id} className="flex flex-col items-center">
                    {/* Vertical line from horizontal bar to child card */}
                    <div className="w-px h-4 bg-gray-300" />
                    <TreeNodeCard
                      cattle={desc.cattle}
                      descendantCount={subDescCount > 0 ? subDescCount : undefined}
                      onClick={onSelectAnimal}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Generation label */}
          <p className="mt-2 text-xs text-gray-400">
            {descendants.length} direct offspring
          </p>
        </div>
      )}

      {/* Empty state */}
      {ancestors.length === 0 && descendants.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">
          No family connections found for this animal.
        </p>
      )}
    </div>
  )
}
