'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ExternalLink, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/display'
import { FormError, Segmented, Textarea, TextareaField } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { api, useFeedback, useSave } from '@/lib/queries'
import { fmtRelative } from '@/lib/format'
import type { Tone } from '@/lib/constants'
import type { FeedbackItem, FeedbackStatus } from '@/lib/types'

type Kind = FeedbackItem['kind']

const KINDS: { value: Kind; label: string; placeholder: string }[] = [
  { value: 'bug', label: 'Something’s wrong', placeholder: 'What happened, and what did you expect? e.g. “Saving a calving on the Breeding page shows an error”' },
  { value: 'change', label: 'Change how it works', placeholder: 'What should work differently? e.g. “Show the dam’s tag on the calf list”' },
  { value: 'idea', label: 'New feature', placeholder: 'What would you like the app to do? e.g. “Remind me when a cow is due to calve”' },
]

const STATUS: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  saved: { label: 'Saved', tone: 'gray' },
  queued: { label: 'Queued for Claude', tone: 'blue' },
  working: { label: 'Claude is working on it', tone: 'violet' },
  needs_info: { label: 'Claude has a question', tone: 'amber' },
  failed: { label: 'Couldn’t be done automatically', tone: 'red' },
  live: { label: 'Live', tone: 'green' },
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Send feedback" className="gap-1.5">
        <MessageSquarePlus className="size-4" /><span className="hidden sm:inline">Feedback</span>
      </Button>
      {open && <FeedbackSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [kind, setKind] = useState<Kind>('bug')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: items = [] } = useFeedback()
  const send = useSave((b: { kind: Kind; message: string; page: string }) => api.post<{ data: { issueNumber: number | null } }>('/api/feedback', b), {
    invalidate: ['feedback'], silentError: true,
    success: (r) => r.data.issueNumber ? 'Thanks — Claude will pick this up shortly' : 'Thanks — your feedback is saved',
    onSuccess: () => { setMessage(''); setError(null) },
  })
  const page = typeof window !== 'undefined' ? pathname + window.location.search : pathname
  return (
    <Sheet open onClose={onClose} title="Feedback"
      description="Report a problem or ask for a change. Claude makes the change, tests it and puts the new version live — usually within the hour."
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button type="submit" form="feedback-form" loading={send.isPending}>Send to Claude</Button></>}>
      <form id="feedback-form" className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        send.mutate({ kind, message, page }, { onError: (err) => setError(err.message) })
      }}>
        <Segmented value={kind} onChange={setKind} options={KINDS.map(({ value, label }) => ({ value, label }))} />
        <TextareaField label="Tell us about it" name="message" rows={6} required minLength={10} maxLength={4000} value={message}
          onChange={(e) => setMessage(e.target.value)} placeholder={KINDS.find((k) => k.value === kind)!.placeholder}
          hint={`Sent from ${page}. The more detail, the better the result.`} />
        <FormError error={error} />
      </form>
      {items.length > 0 && (
        <section className="mt-8 space-y-3">
          <h3 className="text-sm font-semibold text-stone-900">Recent requests</h3>
          <ul className="space-y-3">{items.map((f) => <FeedbackRow key={f.id} item={f} />)}</ul>
        </section>
      )}
    </Sheet>
  )
}

function FeedbackRow({ item }: { item: FeedbackItem }) {
  const [reply, setReply] = useState('')
  const answer = useSave((message: string) => api.post(`/api/feedback/${item.id}/reply`, { message }), {
    invalidate: ['feedback'], success: 'Sent — Claude will try again with your answer', onSuccess: () => setReply(''),
  })
  const s = STATUS[item.status]
  return (
    <li className="rounded-xl p-3 ring-1 ring-stone-200/80">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.tone} dot>{s.label}</Badge>
        <span className="text-xs text-stone-500">{item.userName} · {fmtRelative(item.createdAt)}</span>
        {item.issueUrl && (
          <a href={item.issueUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            #{item.issueNumber} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-stone-700">{item.message}</p>
      {item.status === 'needs_info' && (
        <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/70">
          {item.question && <p className="whitespace-pre-line text-sm text-stone-800">{item.question}</p>}
          <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
          <Button size="sm" disabled={reply.trim().length < 2} loading={answer.isPending} onClick={() => answer.mutate(reply)}>Send answer</Button>
        </div>
      )}
    </li>
  )
}
