'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PickerOption { value: number; label: string; sub?: string; group?: string }

/** Searchable single select. Keyboard: ↑/↓ to move, Enter to choose, Esc to close. */
export function Picker({ options, value, onChange, placeholder = 'Select…', name, required, disabled, emptyText = 'No matches', allowClear = true, id, label }: {
  options: PickerOption[]; value: number | null; onChange: (v: number | null) => void; placeholder?: string; name?: string
  required?: boolean; disabled?: boolean; emptyText?: string; allowClear?: boolean; id?: string; label?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) || null
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(s)) : options
    return list.slice(0, 200)
  }, [q, options])

  useEffect(() => {
    if (!open) return
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 0)
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (o: PickerOption) => { onChange(o.value); setOpen(false); setQ('') }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value ?? ''} data-number />}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        className="flex h-9 w-full items-center gap-2 rounded-lg bg-white pl-3 pr-2 text-left text-sm shadow-sm ring-1 ring-inset ring-stone-200 transition hover:ring-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-stone-50"
      >
        <span className={cn('flex-1 truncate', !selected && 'text-stone-400')}>
          {selected ? <>{selected.label}{selected.sub && <span className="ml-1.5 text-stone-400">{selected.sub}</span>}</> : placeholder}
        </span>
        {selected && allowClear && !required ? (
          <span role="button" tabIndex={-1} aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(null) }} className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"><X className="size-3.5" /></span>
        ) : (
          <ChevronsUpDown className="size-4 text-stone-400" />
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-64 animate-scale-in overflow-hidden rounded-xl bg-white shadow-pop ring-1 ring-stone-900/10">
          <div className="flex items-center gap-2 border-b border-stone-100 px-3">
            <Search className="size-4 text-stone-400" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]) }
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="Search…"
              aria-label={label ? `Search ${label.toLowerCase()}` : 'Search'}
              className="h-10 w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-stone-500">{emptyText}</p>}
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                data-idx={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', i === active ? 'bg-stone-100' : '')}
              >
                <span className="flex-1 truncate text-stone-800">{o.label}{o.sub && <span className="ml-1.5 text-xs text-stone-400">{o.sub}</span>}</span>
                {o.value === value && <Check className="size-4 text-brand-700" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
