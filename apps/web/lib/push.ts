'use client'

import { api } from './api'

// Reminder notifications (Web Push). The service worker (public/sw.js) shows them; the server sends one each
// morning when something needs doing. iPhones and iPads only allow it once the app is on the Home Screen.

export type PushSupport = 'ok' | 'ios-install' | 'unsupported' | 'denied'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios && !standalone) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

function keyBytes(b64url: string) {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** A short name so people can tell their devices apart in the profile. */
export function deviceLabel() {
  const ua = navigator.userAgent
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return browser ? `${device} · ${browser}` : device
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js')
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush(publicKey: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.')
  await registration()
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  const json = sub.toJSON()
  await api.post('/api/push/subscribe', { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() })
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
