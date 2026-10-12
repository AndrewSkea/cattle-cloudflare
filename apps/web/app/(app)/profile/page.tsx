'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, LogOut, Plus } from 'lucide-react'
import { Button, LinkButton } from '@/components/ui/button'
import { Avatar, Card, CardHeader, PageHeader } from '@/components/ui/display'
import { FormError, FormGrid, TextField, formValues } from '@/components/ui/form'
import { useToast } from '@/components/ui/overlay'
import { RoleBadge } from '@/components/shell'
import { RemindersCard } from '@/components/reminders'
import { api } from '@/lib/api'
import { fmtDate, initials } from '@/lib/format'
import { useSession, useSignOut, useSwitchFarm } from '@/lib/session'

export default function ProfilePage() {
  const { me, user, farm } = useSession()
  const qc = useQueryClient()
  const toast = useToast()
  const signOut = useSignOut()
  const switchFarm = useSwitchFarm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await api.put('/api/auth/me', formValues(e.currentTarget))
      await qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      toast('Profile saved')
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Your profile" />
      <Card>
        <div className="flex items-center gap-4 p-6">
          <Avatar name={initials(user.name, user.email)} src={user.avatarUrl} size={64} />
          <div>
            <p className="font-display text-xl font-semibold text-stone-900">{user.name || 'Add your name'}</p>
            <p className="text-sm text-stone-500">{user.email} · Google account</p>
            <p className="text-xs text-stone-400">Member since {fmtDate(user.createdAt)}</p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-5 border-t border-stone-100 p-6">
          <FormGrid>
            <TextField label="Display name" name="name" required defaultValue={user.name ?? ''} maxLength={100} hint="Shown to your team and in the activity log" />
            <TextField label="Phone" name="phone" type="tel" defaultValue={user.phone ?? ''} />
          </FormGrid>
          <div className="flex items-center justify-end gap-3"><FormError error={error} /><Button type="submit" loading={busy}>Save</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Your farms" action={<LinkButton href="/onboarding?new=1" size="sm" variant="secondary"><Plus />Create or join</LinkButton>} />
        <ul className="mt-3 divide-y divide-stone-100">
          {me.farms.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-900">{f.name}{f.id === farm.id && <span className="ml-2 text-xs font-normal text-brand-700">current</span>}</p>
                <p className="text-xs text-stone-500">Joined {fmtDate(f.joinedAt)}{f.expiresAt ? ` · access until ${fmtDate(f.expiresAt)}` : ''}</p>
              </div>
              <RoleBadge role={f.role} />
              {f.id !== farm.id && <Button size="sm" variant="secondary" onClick={() => switchFarm(f.id)}><ArrowRightLeft />Switch</Button>}
            </li>
          ))}
        </ul>
        <p className="px-5 pb-4 pt-2 text-xs text-stone-400">To leave a farm, open it and go to <Link href="/team" className="underline">Team</Link>.</p>
      </Card>

      <RemindersCard />

      <Button variant="secondary" onClick={signOut}><LogOut />Sign out</Button>
    </div>
  )
}
