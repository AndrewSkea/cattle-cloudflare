'use client'

import { useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstall } from '@/lib/install'
import { Button } from './ui/button'
import { Modal } from './ui/overlay'

/** "Install app" link for the sidebar. Hidden when already installed or the browser can't install apps. */
export function InstallAppButton({ className }: { className?: string }) {
  const { mode, promptInstall } = useInstall()
  const [help, setHelp] = useState(false)
  if (!mode) return null
  return (
    <>
      <button className={className} onClick={() => (mode === 'prompt' ? promptInstall() : setHelp(true))}>
        <Download className="size-[18px] text-brand-300/80" /> Install app
      </button>
      <Modal open={help} onClose={() => setHelp(false)} size="sm" title="Install HoovesWho"
        description={mode === 'ios' ? 'Add it to your Home Screen to open it like any other app.' : 'Add it to your Dock to open it in its own window.'}
        footer={<Button onClick={() => setHelp(false)}>Done</Button>}>
        <ol className="space-y-3 text-sm text-stone-700">
          {mode === 'ios' ? (
            <>
              <Step n={1}>Tap <Share className="inline size-4 -translate-y-px text-sky-600" aria-label="Share" /> <b>Share</b> in Safari’s toolbar.</Step>
              <Step n={2}>Choose <SquarePlus className="inline size-4 -translate-y-px" aria-hidden /> <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
            </>
          ) : (
            <>
              <Step n={1}>In Safari’s menu bar choose <b>File</b>.</Step>
              <Step n={2}>Choose <b>Add to Dock…</b>, then <b>Add</b>.</Step>
            </>
          )}
        </ol>
      </Modal>
    </>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn('grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-brand-100')}>{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}
