'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, getData } from './api'
import { useToast } from '@/components/ui/overlay'
import type {
  AnimalListItem, AnimalOption, BirthRecord, BreedingRecord, Equipment, HealthRecord, InventoryItem, Member,
  FeedbackItem, Parcel, StaffMember, Structure, Task, Transaction,
} from './types'

export const useList = <T,>(key: string, path: string, enabled = true) =>
  useQuery<T[]>({ queryKey: [key, path], queryFn: () => getData<T[]>(path), enabled })

export const useAnimals = (status: 'active' | 'all' | 'exited' = 'active') => useList<AnimalListItem>('animals', `/api/animals?status=${status}`)
export const useAnimalOptions = () => useList<AnimalOption>('animals', '/api/animals/options')
export const useParcels = () => useList<Parcel>('land', '/api/land')
export const useStructures = () => useList<Structure>('structures', '/api/structures')
export const useEquipment = () => useList<Equipment>('equipment', '/api/equipment')
export const useTasks = () => useList<Task>('tasks', '/api/tasks')
export const useInventory = () => useList<InventoryItem>('inventory', '/api/inventory')
export const useMembers = () => useList<Member>('members', '/api/farm/members')
export const useStaff = () => useList<StaffMember>('staff', '/api/staff')
export const useHealth = () => useList<HealthRecord>('health', '/api/health')
export const useBreeding = () => useList<BreedingRecord>('breeding', '/api/breeding')
export const useBirths = () => useList<BirthRecord>('births', '/api/births')
export const useFeedback = (enabled = true) => useList<FeedbackItem>('feedback', '/api/feedback', enabled)
export const useTransactions = (enabled = true) => useList<Transaction>('finance', '/api/finance/transactions', enabled)

/**
 * Mutation that shows a toast on success/failure and refreshes the given query groups.
 * Every write can touch several screens (e.g. a sale updates animals, finance and dashboard).
 */
export function useSave<V = any, R = any>(fn: (v: V) => Promise<R>, opts: { invalidate?: string[]; success?: string | ((r: R) => string); onSuccess?: (r: R) => void; silentError?: boolean } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation<R, ApiError, V>({
    mutationFn: fn,
    onSuccess: (r) => {
      const groups = new Set([...(opts.invalidate || []), 'dashboard', 'activity', 'calendar'])
      groups.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(r) : opts.success)
      opts.onSuccess?.(r)
    },
    onError: (e) => { if (!opts.silentError) toast(e.message, 'error') },
  })
}

export { api }
