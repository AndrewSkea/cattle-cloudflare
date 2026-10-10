'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { Logo } from '@/components/shell'
import { Button, LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { api, getData } from '@/lib/api'
import { ROLE_META } from '@/lib/constants'
import { useMe } from '@/lib/session'
import type { Role } from '@/lib/types'

function Join() {
  const params = useSearchParams()
  const code = params.get('code') || ''
  const urlError = params.get('error')
  const router = useRouter()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const [error, setError] = useState<string | null>(urlError)
  const [busy, setBusy] = useState(false)
  const invite = useQuery({
    queryKey: ['invite', code], enabled: !!code, retry: false,
    queryFn: () => getData<{ farmName: string; role: Role; invitedBy: string | null; email: string | null; accessDays: number | null }>(`/api/invites/${encodeURIComponent(code)}`),
  })

  const accept = async () => {
    setBusy(true); setError(null)
    try {
      await api.post('/api/farm/join', { code })
      qc.clear()
      router.replace('/dashboard')
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="px-6 py-5"><a href="/"><Logo /></a></header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <Card className="w-full max-w-md p-8 text-center">
          {invite.isLoading ? <Loader2 className="mx-auto size-6 animate-spin text-brand-600" /> : invite.isError || !code ? (
            <>
              <AlertCircle className="mx-auto size-10 text-clay-500" />
              <h1 className="mt-4 text-xl font-semibold text-stone-900">This invite can’t be used</h1>
              <p className="mt-2 text-sm text-stone-500">{(invite.error as Error)?.message || 'The link is missing its code.'} Ask the farm owner for a new link.</p>
              <LinkButton href="/" variant="secondary" className="mt-6">Go home</LinkButton>
            </>
          ) : (
            <>
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><Users className="size-7" /></div>
              <p className="mt-5 text-sm text-stone-500">{invite.data!.invitedBy ? `${invite.data!.invitedBy} invited you to join` : 'You’ve been invited to join'}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold text-stone-900">{invite.data!.farmName}</h1>
              <p className="mt-3 text-sm text-stone-600">as <span className="font-semibold">{ROLE_META[invite.data!.role].label}</span>: {ROLE_META[invite.data!.role].description.toLowerCase()}.</p>
              {invite.data!.accessDays && <p className="mt-1 text-xs text-stone-500">Access lasts {invite.data!.accessDays} days.</p>}
              {invite.data!.email && <p className="mt-1 text-xs text-stone-500">For {invite.data!.email}</p>}
              {error && <p role="alert" className="mt-5 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
              <div className="mt-7">
                {me
                  ? <Button size="lg" className="w-full" onClick={accept} loading={busy}>Join {invite.data!.farmName}</Button>
                  : <LinkButton href={`/login?invite=${encodeURIComponent(code)}`} size="lg" className="w-full">Sign in to join</LinkButton>}
              </div>
              {me && <p className="mt-3 text-xs text-stone-400">Signed in as {me.user.email}</p>}
            </>
          )}
        </Card>
      </main>
    </div>
  )
}

export default function JoinPage() {
  return <Suspense><Join /></Suspense>
}
