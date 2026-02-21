'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient } from '@/lib/api-client'
import { Copy, Trash2, Plus, Check } from 'lucide-react'

interface Member {
  id: number
  userId: number
  userName: string
  userEmail: string
  role: string
  expiresAt: string | null
}

interface Invite {
  id: number
  code: string
  role: string
  maxUses: number | null
  useCount: number
  expiresAt: string | null
  accessDuration: number | null
}

export default function FarmSettingsPage() {
  const { activeFarmId, activeRole, refresh } = useAuth()
  const [farmName, setFarmName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteRole, setInviteRole] = useState('worker')
  const [inviteMaxUses, setInviteMaxUses] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState('')
  const [inviteAccessDuration, setInviteAccessDuration] = useState('')
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const isOwner = activeRole === 'owner'
  const isManager = activeRole === 'manager' || isOwner

  const loadData = useCallback(async () => {
    if (!activeFarmId) return
    try {
      const [membersRes, invitesRes]: any[] = await Promise.all([
        apiClient.getFarmMembers(activeFarmId),
        isManager ? apiClient.getInvites(activeFarmId) : Promise.resolve({ data: [] }),
      ])
      setMembers(membersRes.data || [])
      setInvites(invitesRes.data || [])

      const farmsRes: any = await apiClient.getFarms()
      const farm = (farmsRes.data || []).find((f: any) => f.id === activeFarmId)
      if (farm) {
        setFarmName(farm.name)
        setOriginalName(farm.name)
      }
    } catch {
      setError('Failed to load farm settings')
    }
  }, [activeFarmId, isManager])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveName = async () => {
    if (!activeFarmId || !farmName.trim() || farmName === originalName) return
    setSaving(true)
    setError(null)
    try {
      await apiClient.updateFarm(activeFarmId, { name: farmName.trim() })
      setOriginalName(farmName.trim())
      setSuccess('Farm name updated')
      await refresh()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update farm name')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (memberId: number) => {
    if (!activeFarmId || !confirm('Remove this member from the farm?')) return
    try {
      await apiClient.removeFarmMember(activeFarmId, memberId)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to remove member')
    }
  }

  const handleUpdateRole = async (memberId: number, newRole: string) => {
    if (!activeFarmId) return
    try {
      await apiClient.updateFarmMember(activeFarmId, memberId, { role: newRole })
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to update role')
    }
  }

  const handleCreateInvite = async () => {
    if (!activeFarmId) return
    setCreatingInvite(true)
    setError(null)
    try {
      await apiClient.createInvite(activeFarmId, {
        role: inviteRole,
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : undefined,
        expiresAt: inviteExpiry ? new Date(Date.now() + Number(inviteExpiry) * 3600000).toISOString() : undefined,
        accessDuration: inviteAccessDuration ? Number(inviteAccessDuration) : undefined,
      })
      setShowInviteForm(false)
      setInviteRole('worker')
      setInviteMaxUses('')
      setInviteExpiry('')
      setInviteAccessDuration('')
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to create invite')
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleDeleteInvite = async (inviteId: number) => {
    if (!activeFarmId || !confirm('Revoke this invite?')) return
    try {
      await apiClient.deleteInvite(activeFarmId, inviteId)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invite')
    }
  }

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/join?code=${code}`
    navigator.clipboard.writeText(url)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-700',
      manager: 'bg-blue-100 text-blue-700',
      worker: 'bg-green-100 text-green-700',
      viewer: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors[role] || colors.viewer}`}>
        {role}
      </span>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Farm Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {/* Farm Name */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Farm Details</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={farmName}
            onChange={(e) => setFarmName(e.target.value)}
            disabled={!isOwner}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
          {isOwner && (
            <button
              onClick={handleSaveName}
              disabled={saving || !farmName.trim() || farmName === originalName}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        {!isOwner && (
          <p className="text-xs text-gray-400 mt-2">Only the farm owner can change the farm name.</p>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Members</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Email</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Role</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500">Expires</th>
                {isOwner && <th className="text-right py-2 px-3 font-medium text-gray-500">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-900">{m.userName}</td>
                  <td className="py-2 px-3 text-gray-500">{m.userEmail}</td>
                  <td className="py-2 px-3">
                    {isOwner && m.role !== 'owner' ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="worker">Worker</option>
                        <option value="manager">Manager</option>
                      </select>
                    ) : (
                      roleBadge(m.role)
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-500 text-xs">
                    {m.expiresAt ? new Date(m.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  {isOwner && (
                    <td className="py-2 px-3 text-right">
                      {m.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-400 text-sm">No members found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invites */}
      {isManager && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Invites</h2>
            <button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Invite
            </button>
          </div>

          {showInviteForm && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="worker">Worker</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses (optional)</label>
                  <input
                    type="number"
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expires in (hours, optional)</label>
                  <input
                    type="number"
                    value={inviteExpiry}
                    onChange={(e) => setInviteExpiry(e.target.value)}
                    placeholder="Never"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Access Duration (days, optional)</label>
                  <input
                    type="number"
                    value={inviteAccessDuration}
                    onChange={(e) => setInviteAccessDuration(e.target.value)}
                    placeholder="Permanent"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowInviteForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInvite}
                  disabled={creatingInvite}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {creatingInvite ? 'Creating...' : 'Create Invite'}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Code</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Role</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Uses</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Expires</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-mono text-gray-900">{inv.code}</td>
                    <td className="py-2 px-3">{roleBadge(inv.role)}</td>
                    <td className="py-2 px-3 text-gray-500">
                      {inv.useCount}{inv.maxUses ? ` / ${inv.maxUses}` : ''}
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">
                      {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-2 px-3 text-right space-x-1">
                      <button
                        onClick={() => copyInviteLink(inv.code)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Copy invite link"
                      >
                        {copiedCode === inv.code ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteInvite(inv.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Revoke invite"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400 text-sm">No active invites</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
