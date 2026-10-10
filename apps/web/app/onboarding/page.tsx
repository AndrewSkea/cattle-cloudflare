'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, KeyRound, LogOut, Sprout } from 'lucide-react'
import { Logo } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Field, FormError, Input, Select, TextField } from '@/components/ui/form'
import { api } from '@/lib/api'
import { SPECIES } from '@/lib/constants'
import { useMe, useSignOut } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Species } from '@/lib/types'
import type { LatLngZoom } from '@/components/map/location-picker'

const LocationPicker = dynamic(() => import('@/components/map/location-picker'), { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-stone-200" /> })

function Onboarding() {
  const { data: me, isLoading } = useMe()
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (isLoading) return
    if (me === null) router.replace('/login?next=/onboarding')
    else if (me?.farm && params.get('new') !== '1') router.replace('/dashboard')
  }, [me, isLoading, params, router])
  const qc = useQueryClient()
  const signOut = useSignOut()
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [species, setSpecies] = useState<Species[]>(['cattle'])
  const [loc, setLoc] = useState<LatLngZoom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const adding = params.get('new') === '1' && !!me?.farm

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true); setError(null)
    try {
      await api.post('/api/farms', {
        name: f.get('name'), holdingNumber: f.get('holdingNumber') || null, currency: f.get('currency'), areaUnit: f.get('areaUnit'),
        species, latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null, zoom: loc?.zoom ?? null,
      })
      qc.clear()
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message); setBusy(false)
    }
  }

  const join = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const raw = String(new FormData(e.currentTarget).get('code') || '').trim()
    const code = raw.includes('code=') ? new URL(raw, window.location.origin).searchParams.get('code') || '' : raw.split('/').pop() || ''
    setBusy(true); setError(null)
    try {
      await api.post('/api/farm/join', { code })
      qc.clear()
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Logo />
        {adding
          ? <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}><ArrowLeft />Back to {me?.farm?.name}</Button>
          : <Button variant="ghost" size="sm" onClick={signOut}><LogOut />Sign out</Button>}
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        {mode === 'choose' && (
          <div className="animate-slide-up">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900">
              {adding ? 'Add another farm' : `Welcome${me?.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}`}
            </h1>
            <p className="mt-2 text-stone-600">Set up your farm, or join one you’ve been invited to.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <button onClick={() => setMode('create')} className="group text-left focus-ring rounded-2xl">
                <Card className="h-full p-6 transition group-hover:shadow-lift group-hover:ring-brand-300">
                  <div className="grid size-11 place-items-center rounded-xl bg-brand-700 text-white"><Sprout className="size-5" /></div>
                  <h2 className="mt-5 text-lg font-semibold text-stone-900">Create a farm</h2>
                  <p className="mt-1 text-sm text-stone-500">You’ll be the owner. Invite your team afterwards.</p>
                </Card>
              </button>
              <button onClick={() => setMode('join')} className="group text-left focus-ring rounded-2xl">
                <Card className="h-full p-6 transition group-hover:shadow-lift group-hover:ring-brand-300">
                  <div className="grid size-11 place-items-center rounded-xl bg-wheat-100 text-wheat-800"><KeyRound className="size-5" /></div>
                  <h2 className="mt-5 text-lg font-semibold text-stone-900">Join with an invite</h2>
                  <p className="mt-1 text-sm text-stone-500">Paste the invite link or code someone sent you.</p>
                </Card>
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={create} className="animate-slide-up space-y-8">
            <div>
              <button type="button" onClick={() => setMode('choose')} className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" />Back</button>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Tell us about your farm</h1>
              <p className="mt-1 text-stone-600">You can change any of this later in farm settings.</p>
            </div>
            <Card className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Farm name" name="name" required maxLength={100} placeholder="e.g. Hillhead Farm" />
                <TextField label="Holding number" name="holdingNumber" placeholder="e.g. 12/345/6789" hint="CPH or herd number (optional)" />
              </div>
              <Field label="What do you keep?" hint="Choose all that apply">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SPECIES.filter((s) => s.value !== 'other').map((s) => {
                    const on = species.includes(s.value)
                    return (
                      <button type="button" key={s.value} aria-pressed={on}
                        onClick={() => setSpecies((x) => on ? (x.length > 1 ? x.filter((y) => y !== s.value) : x) : [...x, s.value])}
                        className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 transition',
                          on ? 'bg-brand-50 text-brand-900 ring-brand-400' : 'bg-white text-stone-700 ring-stone-200 hover:ring-stone-300')}>
                        <span className="text-lg">{s.emoji}</span>{s.plural}
                        {on && <Check className="ml-auto size-4 text-brand-700" />}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Currency"><Select name="currency" defaultValue="GBP">{['GBP', 'EUR', 'USD', 'AUD', 'NZD', 'CAD'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Land area unit"><Select name="areaUnit" defaultValue="ha"><option value="ha">Hectares</option><option value="ac">Acres</option></Select></Field>
              </div>
            </Card>
            <Card className="space-y-3 p-6">
              <div>
                <h2 className="font-semibold text-stone-900">Where is it?</h2>
                <p className="text-sm text-stone-500">Centres your farm map and gives you a local weather forecast.</p>
              </div>
              <LocationPicker value={loc} onChange={setLoc} height={300} />
            </Card>
            <FormError error={error} />
            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={busy}>Create farm</Button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={join} className="animate-slide-up space-y-6">
            <div>
              <button type="button" onClick={() => setMode('choose')} className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" />Back</button>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Join a farm</h1>
              <p className="mt-1 text-stone-600">Paste the invite link or the code at the end of it.</p>
            </div>
            <Card className="space-y-4 p-6">
              <Field label="Invite link or code"><Input name="code" required placeholder="https://…/join?code=abc123" /></Field>
              <FormError error={error} />
              <div className="flex justify-end"><Button type="submit" loading={busy}>Join farm</Button></div>
            </Card>
          </form>
        )}
      </main>
    </div>
  )
}

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>
}
