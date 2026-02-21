'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { apiClient } from './api-client'

interface AuthUser {
  id: number
  email: string
  name: string | null
  avatarUrl: string | null
}

interface FarmMembership {
  id: number
  name: string
  slug: string
  role: string
  joinedAt: string | null
  expiresAt: string | null
}

interface AuthState {
  user: AuthUser | null
  farms: FarmMembership[]
  activeFarmId: number | null
  activeRole: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  switchFarm: (farmId: number) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    farms: [],
    activeFarmId: null,
    activeRole: null,
    isLoading: true,
    isAuthenticated: false,
  })

  const refresh = useCallback(async () => {
    try {
      const data: any = await apiClient.getMe()
      setState({
        user: data.user,
        farms: data.farms,
        activeFarmId: data.activeFarmId,
        activeRole: data.activeRole,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch {
      setState({
        user: null,
        farms: [],
        activeFarmId: null,
        activeRole: null,
        isLoading: false,
        isAuthenticated: false,
      })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const switchFarm = useCallback(async (farmId: number) => {
    await apiClient.switchFarm(farmId)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await apiClient.logout()
    setState({
      user: null,
      farms: [],
      activeFarmId: null,
      activeRole: null,
      isLoading: false,
      isAuthenticated: false,
    })
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, switchFarm, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
