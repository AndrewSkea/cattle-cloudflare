'use client'

import { useState, useCallback } from 'react'
import type { CattleAction } from './context-menu'

interface AnimalRef {
  id: number
  tagNo: string
  managementTag?: string | null
}

export function useCattleActions() {
  const [activeModal, setActiveModal] = useState<CattleAction | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalRef | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isMulti: boolean } | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const openContextMenu = useCallback((e: React.MouseEvent, animal: AnimalRef, isMulti: boolean = false) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedAnimal(animal)
    setContextMenu({ x: e.clientX, y: e.clientY, isMulti })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const openAction = useCallback((action: CattleAction, animal?: AnimalRef) => {
    if (animal) setSelectedAnimal(animal)
    setActiveModal(action)
    setContextMenu(null)
  }, [])

  const closeAction = useCallback(() => {
    setActiveModal(null)
  }, [])

  // Multi-select helpers
  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds])

  return {
    activeModal,
    selectedAnimal,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    openAction,
    closeAction,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
  }
}
