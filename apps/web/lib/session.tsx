'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Me, Role } from './types'

const ROLES: Role[] = ['viewer', 'worker', 'manager', 'owner']

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/api/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

/** Session for pages inside the app shell (the shell guarantees a farm). */
export function useSession() {
  const { data } = useMe()
  const me = data!
  const role = (me?.role || 'viewer') as Role
  return {
    me,
    user: me?.user,
    farm: me?.farm!,
    role,
    currency: me?.farm?.currency || 'GBP',
    can: (min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min),
  }
}

export function useSignOut() {
  const qc = useQueryClient()
  return async () => {
    await api.post('/api/auth/logout').catch(() => {})
    qc.clear()
    window.location.href = '/login'
  }
}

export function useSwitchFarm() {
  const qc = useQueryClient()
  return async (farmId: number) => {
    await api.post('/api/auth/switch-farm', { farmId })
    qc.clear()
    window.location.href = '/dashboard'
  }
}
