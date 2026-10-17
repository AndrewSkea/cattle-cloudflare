'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

function useLockBody(open: boolean) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

function useAutoFocus(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      // Someone already clicked into a field (or the page was slow to settle): don't pull focus away mid-typing.
      if (ref.current?.contains(document.activeElement) && document.activeElement !== ref.current) return
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea')
      el?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [open, ref])
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? createPortal(children, document.body) : null
}

/** Right-hand slide-over panel — used for all create/edit forms. */
export function Sheet({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useLockBody(open)
  useEscape(open, onClose)
  useAutoFocus(open, ref)
  if (!open) return null
  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 animate-fade-in bg-stone-950/30 backdrop-blur-[2px]" onClick={onClose} />
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
          className={cn('absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col bg-white shadow-pop', wide ? 'max-w-2xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-5">
            <div>
              <h2 id={titleId} className="font-display text-xl font-semibold text-stone-900">{title}</h2>
              {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X /></Button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-6 py-4">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const xl = size === 'xl'
  useLockBody(open)
  useEscape(open, onClose)
  useAutoFocus(open, ref)
  if (!open) return null
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
        <div className="absolute inset-0 animate-fade-in bg-stone-950/35 backdrop-blur-[2px]" onClick={onClose} />
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
          className={cn('relative w-full animate-scale-in rounded-2xl bg-white shadow-pop', size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : xl ? 'flex max-h-[calc(100dvh-2rem)] max-w-6xl flex-col' : 'max-w-md')}>
          <div className={cn('px-6 pt-6', xl && 'shrink-0 max-sm:px-4')}>
            <h2 id={titleId} className="text-lg font-semibold text-stone-900">{title}</h2>
            {description && <div className="mt-1.5 text-sm text-stone-600">{description}</div>}
          </div>
          {children && <div className={cn('px-6 pt-4', xl && 'min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin max-sm:px-4')}>{children}</div>}
          <div className={cn('mt-6 flex justify-end gap-2 rounded-b-2xl border-t border-stone-100 bg-stone-50/60 px-6 py-4', xl && 'mt-0 shrink-0 flex-wrap items-center max-sm:px-4')}>{footer}</div>
        </div>
      </div>
    </Portal>
  )
}

// ---------------- Toasts ----------------

type ToastKind = 'success' | 'error' | 'info' | 'warning'
interface ToastItem { id: number; kind: ToastKind; message: string }

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind, message }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
  const colors = { success: 'text-emerald-600', error: 'text-clay-600', info: 'text-sky-600', warning: 'text-amber-600' }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <Portal>
        <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
          {items.map((t) => {
            const Icon = icons[t.kind]
            return (
              <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-pop ring-1 ring-stone-900/10">
                <Icon className={cn('mt-0.5 size-5 shrink-0', colors[t.kind])} />
                <p className="flex-1 text-sm text-stone-800">{t.message}</p>
                <button className="text-stone-400 hover:text-stone-600" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss"><X className="size-4" /></button>
              </div>
            )
          })}
        </div>
      </Portal>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

// ---------------- Confirm ----------------

interface ConfirmOptions { title: string; description?: React.ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title} description={state?.description} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>{state?.confirmLabel || 'Confirm'}</Button>
        </>} />
    </ConfirmCtx.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmCtx)

// ---------------- Dropdown menu ----------------

export function Menu({ trigger, children, align = 'right', side = 'bottom', className }: {
  trigger: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right' | 'center'; side?: 'bottom' | 'top'; className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div role="menu" onClick={() => setOpen(false)}
          className={cn('absolute z-40 min-w-48 animate-scale-in overflow-hidden rounded-xl bg-white p-1 shadow-pop ring-1 ring-stone-900/10',
            side === 'top' ? 'bottom-full mb-2' : 'mt-1.5',
            align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -ml-24 w-48' : 'left-0')}>
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ children, onClick, danger, icon: Icon, href }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; icon?: React.ComponentType<{ className?: string }>; href?: string }) {
  const cls = cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition', danger ? 'text-clay-700 hover:bg-clay-50' : 'text-stone-700 hover:bg-stone-100')
  const inner = <>{Icon && <Icon className="size-4 opacity-70" />}{children}</>
  if (href) return <a role="menuitem" href={href} className={cls}>{inner}</a>
  return <button role="menuitem" type="button" className={cls} onClick={onClick}>{inner}</button>
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-stone-100" />
}

// ---------------- Tabs ----------------

export function Tabs<T extends string>({ value, onChange, tabs, className }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number | null; hidden?: boolean }[]; className?: string
}) {
  return (
    <div className={cn('-mx-1 overflow-x-auto scrollbar-thin', className)}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-stone-200 px-1">
        {tabs.filter((t) => !t.hidden).map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition focus-ring rounded-t-md',
              value === t.value ? 'border-brand-700 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn('rounded-full px-1.5 py-px text-[11px] tabular', value === t.value ? 'bg-brand-100 text-brand-800' : 'bg-stone-100 text-stone-500')}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
