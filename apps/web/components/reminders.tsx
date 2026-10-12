'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Send, Smartphone } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardHeader } from './ui/display'
import { useToast } from './ui/overlay'
import { api, getData } from '@/lib/api'
import { fmtRelative } from '@/lib/format'
import { type PushSupport, currentSubscription, disablePush, enablePush, pushSupport } from '@/lib/push'

interface PushInfo { publicKey: string | null; devices: { id: number; endpoint: string; label: string | null; lastSentAt: string | null; createdAt: string }[] }

/** Profile card: turn the 8am reminder on or off for this device, and see the other devices that get it. */
export function RemindersCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['push'], queryFn: () => getData<PushInfo>('/api/push') })
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setSupport(pushSupport())
    currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null)).catch(() => {})
  }, [])

  const here = !!endpoint && !!data?.devices.some((d) => d.endpoint === endpoint)
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try { await fn(); toast(done); await qc.invalidateQueries({ queryKey: ['push'] }) } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Card id="reminders" className="scroll-mt-20">
      <CardHeader title="Reminders" icon={Bell}
        description="A notification at 8am when something needs doing: calvings due, ScotEID deadlines, health follow-ups and your tasks. Nothing is sent on quiet days." />
      <div className="space-y-4 p-5">
        {!data?.publicKey ? (
          <p className="text-sm text-stone-500">Reminders aren’t set up on this server yet.</p>
        ) : support === 'ios-install' ? (
          <p className="text-sm text-stone-600">On iPhone and iPad, add HoovesWho to your Home Screen first (Share → Add to Home Screen), open it from there, then turn reminders on here.</p>
        ) : support === 'denied' ? (
          <p className="text-sm text-stone-600">Notifications are blocked for this site. Allow them in your browser’s site settings, then reload this page.</p>
        ) : support === 'unsupported' ? (
          <p className="text-sm text-stone-500">This browser can’t receive notifications.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {here ? (
              <>
                <Button variant="secondary" loading={busy} onClick={() => run(async () => { await disablePush(); setEndpoint(null) }, 'Reminders off on this device')}><BellOff />Turn off on this device</Button>
                <Button variant="ghost" loading={busy} onClick={() => run(() => api.post('/api/push/test'), 'Sent: check your notifications')}><Send />Send one now</Button>
              </>
            ) : (
              <Button loading={busy} onClick={() => run(async () => { const s = await enablePush(data.publicKey!); setEndpoint(s.endpoint) }, 'Reminders on for this device')}><Bell />Turn on for this device</Button>
            )}
          </div>
        )}
        {!!data?.devices.length && (
          <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-100">
            {data.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <Smartphone className="size-4 text-stone-400" />
                <span className="flex-1 text-stone-800">{d.label || 'Device'}{d.endpoint === endpoint && <span className="ml-2 text-xs text-brand-700">this device</span>}</span>
                <span className="text-xs text-stone-400">{d.lastSentAt ? `last sent ${fmtRelative(d.lastSentAt)}` : 'nothing sent yet'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
