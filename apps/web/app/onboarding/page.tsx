'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient } from '@/lib/api-client'

export default function OnboardingPage() {
  const { user, refresh } = useAuth()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [farmName, setFarmName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [invitePreview, setInvitePreview] = useState<{ farmName: string; role: string; accessDuration: number | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateFarm = async () => {
    if (!farmName.trim()) return
    setLoading(true)
    setError(null)
    try {
      await apiClient.createFarm({ name: farmName.trim() })
      await refresh()
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Failed to create farm')
      setLoading(false)
    }
  }

  const handleLookupInvite = async () => {
    const code = inviteCode.trim().split('/').pop() || inviteCode.trim()
    if (!code) return
    setLoading(true)
    setError(null)
    try {
      const result: any = await apiClient.getInviteDetails(code)
      setInvitePreview(result.data)
    } catch (err: any) {
      setError(err.message || 'Invalid invite code')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async () => {
    const code = inviteCode.trim().split('/').pop() || inviteCode.trim()
    setLoading(true)
    setError(null)
    try {
      await apiClient.acceptInvite(code)
      await refresh()
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message || 'Failed to join farm')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-5xl">🐄</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">
            Welcome{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-gray-500 mt-2">Let&apos;s get you set up with a farm</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {mode === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('create')}
              className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-8 text-center hover:border-green-500 hover:shadow-xl transition-all"
            >
              <div className="text-4xl mb-4">🏗️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Create a Farm</h3>
              <p className="text-sm text-gray-500">Start fresh and invite your team</p>
            </button>
            <button
              onClick={() => setMode('join')}
              className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-8 text-center hover:border-blue-500 hover:shadow-xl transition-all"
            >
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Join a Farm</h3>
              <p className="text-sm text-gray-500">Enter an invite code or link</p>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Your Farm</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Farm Name</label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. Hillside Farm"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-400 mb-6">You&apos;ll be the farm owner and can invite others later.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setMode('choose'); setError(null) }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateFarm}
                disabled={!farmName.trim() || loading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? 'Creating...' : 'Create Farm'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Join a Farm</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Invite Code or Link</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value); setInvitePreview(null) }}
                placeholder="e.g. ABC12345 or https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                autoFocus
              />
            </div>

            {invitePreview && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  You&apos;ll join <strong>{invitePreview.farmName}</strong> as a <strong className="capitalize">{invitePreview.role}</strong>
                  {invitePreview.accessDuration && ` for ${invitePreview.accessDuration} days`}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setMode('choose'); setError(null); setInvitePreview(null) }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Back
              </button>
              {!invitePreview ? (
                <button
                  onClick={handleLookupInvite}
                  disabled={!inviteCode.trim() || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Looking up...' : 'Look Up Invite'}
                </button>
              ) : (
                <button
                  onClick={handleAcceptInvite}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Joining...' : 'Join Farm'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
