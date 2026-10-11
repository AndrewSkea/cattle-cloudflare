'use client'

import { useSyncExternalStore } from 'react'

// Chrome, Edge and Samsung Internet fire `beforeinstallprompt` once the app is installable. We keep the event
// (without preventDefault, so Chrome still shows its own install banner) to offer an "Install app" button too.
// Safari has no prompt, so iPhone/iPad and Mac users get instructions instead.

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export type InstallMode = 'prompt' | 'ios' | 'mac-safari' | null

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { deferred = e as InstallPromptEvent; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit() })
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}

function currentMode(): InstallMode {
  if (installed) return null
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return null
  if (deferred) return 'prompt'
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return 'ios'
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return 'mac-safari'
  return null
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useInstall() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => null)
  const promptInstall = async () => {
    if (!deferred) return false
    const e = deferred
    await e.prompt()
    const { outcome } = await e.userChoice
    deferred = null
    emit()
    return outcome === 'accepted'
  }
  return { mode, promptInstall }
}
