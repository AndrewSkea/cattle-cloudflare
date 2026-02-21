'use client'

import { useAuth } from '@/lib/auth-context'

export default function ProfilePage() {
  const { user } = useAuth()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          {user?.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{user?.name}</h2>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
            <p className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              {user?.name || '—'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
            <p className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              {user?.email || '—'}
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Profile information is managed by your Google account.
        </p>
      </div>
    </div>
  )
}
