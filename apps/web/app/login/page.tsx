'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Logo } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { api } from '@/lib/api'
import { useMe } from '@/lib/session'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function LoginInner() {
  const params = useSearchParams()
  const router = useRouter()
  const { data: me, isLoading } = useMe()
  const next = params.get('next') || ''
  const error = params.get('error')
  const invite = params.get('invite') || ''
  const [going, setGoing] = useState(false)
  const [isLocal, setIsLocal] = useState(false)
  const [devEmail, setDevEmail] = useState('andrewskea.as@gmail.com')

  useEffect(() => setIsLocal(['localhost', '127.0.0.1'].includes(window.location.hostname)), [])
  useEffect(() => {
    if (!isLoading && me) router.replace(me.farm ? (next || '/dashboard') : '/onboarding')
  }, [me, isLoading, next, router])

  const google = () => {
    setGoing(true)
    const q = new URLSearchParams()
    if (next) q.set('next', next)
    if (invite) q.set('invite', invite)
    window.location.href = api.url(`/api/auth/google?${q}`)
  }

  const devLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await api.post<{ redirect: string }>('/api/auth/dev-login', { email: devEmail, invite: invite || undefined })
    window.location.href = next && !r.redirect.startsWith('/onboarding') && !r.redirect.startsWith('/join') ? next : r.redirect
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <a href="/"><Logo /></a>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Welcome back</h1>
          <p className="mt-2 text-sm text-stone-500">Sign in to manage your farm. New here? Signing in creates your account.</p>
          {error && (
            <div role="alert" className="mt-6 flex gap-2.5 rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-800 ring-1 ring-clay-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}
          <Button size="lg" variant="secondary" className="mt-8 w-full" onClick={google} disabled={going}>
            {going ? <Loader2 className="animate-spin" /> : <GoogleIcon />} Continue with Google
          </Button>
          <p className="mt-6 text-center text-xs leading-relaxed text-stone-400">
            We only use your name, email and profile photo from Google. We never see your password.
          </p>
          {isLocal && (
            <form onSubmit={devLogin} className="mt-10 space-y-2 rounded-xl border border-dashed border-stone-300 p-4">
              <p className="text-xs font-medium text-stone-500">Local development sign-in</p>
              <div className="flex gap-2">
                <Input name="devEmail" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} type="email" />
                <Button type="submit" variant="secondary">Sign in</Button>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,160,73,0.25),transparent_55%)]" />
        <svg className="absolute bottom-0 left-0 right-0 w-full text-brand-800" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 220 C 150 160, 300 260, 450 200 S 700 150, 800 190 L 800 300 L 0 300 Z" />
          <path fill="#1b342c" d="M0 260 C 200 220, 350 290, 520 250 S 720 230, 800 250 L 800 300 L 0 300 Z" />
        </svg>
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="max-w-md font-display text-4xl font-semibold leading-tight text-white">“Know every animal, every field and every pound, without the paperwork.”</p>
          <p className="mt-6 text-sm text-brand-200">Livestock · Land · Machinery · People · Money</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>
}
