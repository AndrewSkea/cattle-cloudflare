'use client'

import { useEffect, useRef } from 'react'

export type CattleAction = 'addChild' | 'pronounceDead' | 'addVaccine' | 'addMedication' | 'addWeight' | 'addNotes' | 'sell' | 'moveToMart'

interface ContextMenuProps {
  x: number
  y: number
  onAction: (action: CattleAction) => void
  onClose: () => void
  multiSelect?: boolean
}

const singleMenuItems: Array<{ action: CattleAction; label: string; icon: string }> = [
  { action: 'addChild', label: 'Add Child', icon: '🐄' },
  { action: 'sell', label: 'Sell', icon: '£' },
  { action: 'moveToMart', label: 'Move to Mart', icon: '🚚' },
  { action: 'pronounceDead', label: 'Pronounce Dead', icon: '✝' },
  { action: 'addVaccine', label: 'Add Vaccine', icon: '💉' },
  { action: 'addMedication', label: 'Add Medication', icon: '💊' },
  { action: 'addWeight', label: 'Add Weight', icon: '⚖' },
  { action: 'addNotes', label: 'Add Notes', icon: '📝' },
]

const multiMenuItems: Array<{ action: CattleAction; label: string; icon: string }> = [
  { action: 'sell', label: 'Sell Selected', icon: '£' },
  { action: 'moveToMart', label: 'Move to Mart', icon: '🚚' },
]

export function ContextMenu({ x, y, onAction, onClose, multiSelect = false }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const el = menuRef.current
      if (rect.right > window.innerWidth) {
        el.style.left = `${x - rect.width}px`
      }
      if (rect.bottom > window.innerHeight) {
        el.style.top = `${y - rect.height}px`
      }
    }
  }, [x, y])

  const items = multiSelect ? multiMenuItems : singleMenuItems

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {multiSelect && (
        <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
          Batch Actions
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.action}
          onClick={(e) => {
            e.stopPropagation()
            onAction(item.action)
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
        >
          <span className="w-5 text-center">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
