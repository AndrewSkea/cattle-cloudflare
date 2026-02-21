'use client'

import { useState, useEffect } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { apiClient, API_BASE_URL } from '@/lib/api-client'

export default function LoginPage() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [devLoading, setDevLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLocal, setIsLocal] = useState(false)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const urlError = searchParams?.get('error')

  useEffect(() => {
    // Show dev login button only when running on localhost
    setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  }, [])

  const handleGoogleLogin = async () => {
    if (!turnstileToken) return
    setLoading(true)
    setError(null)

    try {
      const result: any = await apiClient.getLoginUrl(turnstileToken)
      window.location.href = result.url
    } catch (err: any) {
      setError(err.message || 'Failed to initiate login')
      setLoading(false)
    }
  }

  const handleDevLogin = async () => {
    setDevLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@localhost', name: 'Dev User' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any
        throw new Error(body.error || 'Dev login failed — is DEV_AUTH_ENABLED=true in .dev.vars?')
      }
      const { token } = await res.json() as { token: string }
      document.cookie = `auth_token=${token}; path=/; SameSite=Lax`
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err.message)
      setDevLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">🐄</span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">HoovesWho</h1>
          <p className="text-gray-500 mt-2">Farm management made simple</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
            Sign in to your account
          </h2>

          {/* Error messages */}
          {(error || urlError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-red-800 text-sm">
                {error || (urlError === 'no_code' ? 'Login was cancelled' : 'Authentication failed. Please try again.')}
              </p>
            </div>
          )}

          {/* Dev login — localhost only */}
          {isLocal && (
            <div className="mb-6">
              <div className="relative flex items-center justify-center mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-amber-200" />
                </div>
                <span className="relative bg-white px-3 text-xs font-medium text-amber-600 uppercase tracking-wide">
                  Local Dev
                </span>
              </div>
              <button
                onClick={handleDevLogin}
                disabled={devLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-lg text-amber-800 font-medium hover:bg-amber-100 hover:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>🔧</span>
                {devLoading ? 'Logging in...' : 'Dev Login (local only)'}
              </button>
              <p className="text-center text-amber-600 text-xs mt-2">
                Bypasses Google OAuth · Uses local database only
              </p>
            </div>
          )}

          {/* Divider before Google login */}
          {isLocal && (
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <span className="relative bg-white px-3 text-xs text-gray-400">or sign in normally</span>
            </div>
          )}

          {/* Turnstile */}
          <div className="flex justify-center mb-6">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
              onSuccess={setTurnstileToken}
              onError={() => setError('Bot verification failed. Please refresh.')}
            />
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            disabled={!turnstileToken || loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? 'Redirecting...' : 'Sign in with Google'}
          </button>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Your credentials are handled securely by Google. We never store passwords.
        </p>
      </div>
    </div>
  )
}
