'use client'

import { forwardRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const control =
  'block w-full rounded-lg border-0 bg-white text-sm text-stone-900 shadow-sm ring-1 ring-inset ring-stone-200 placeholder:text-stone-400 transition focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; prefix?: string; suffix?: string }>(
  function Input({ className, invalid, prefix, suffix, ...props }, ref) {
    if (prefix || suffix) {
      return (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-stone-400">{prefix}</span>}
          <input ref={ref} className={cn(control, 'h-9 px-3', prefix && 'pl-7', suffix && 'pr-10', invalid && 'ring-clay-400 focus:ring-clay-500', className)} aria-invalid={invalid || undefined} {...props} />
          {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-400">{suffix}</span>}
        </div>
      )
    }
    return <input ref={ref} className={cn(control, 'h-9 px-3', invalid && 'ring-clay-400 focus:ring-clay-500', className)} aria-invalid={invalid || undefined} {...props} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'px-3 py-2', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }>(
  function Select({ className, children, placeholder, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, 'h-9 appearance-none pl-3 pr-9', className)} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      </div>
    )
  },
)

export function Field({ label, hint, error, required, children, className, htmlFor }: {
  label?: string; hint?: React.ReactNode; error?: string | null; required?: boolean; children: React.ReactNode; className?: string; htmlFor?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-stone-700">
          {label}
          {required && <span aria-hidden className="ml-0.5 text-clay-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-clay-600">{error}</p> : hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
    </div>
  )
}

/** Label + control with auto id wiring. */
export function TextField({ label, hint, error, required, className, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode; error?: string | null; prefix?: string; suffix?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <Input id={id} required={required} invalid={!!error} {...props} />
    </Field>
  )
}

export function SelectField({ label, hint, error, required, className, options, placeholder, ...props }:
  React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | null; options: { value: string | number; label: string }[]; placeholder?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <Select id={id} required={required} placeholder={placeholder} {...props}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  )
}

export function TextareaField({ label, hint, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} className={className} htmlFor={id}>
      <Textarea id={id} {...props} />
    </Field>
  )
}

export function Checkbox({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" {...props} />
      <span>
        <span className="block text-sm text-stone-800">{label}</span>
        {description && <span className="block text-xs text-stone-500">{description}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string; size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg bg-stone-100 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition focus-ring',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return <div className={cn('grid gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3', className)}>{children}</div>
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-stone-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return <div role="alert" className="rounded-lg bg-clay-50 px-3 py-2.5 text-sm text-clay-700 ring-1 ring-inset ring-clay-200">{error}</div>
}

/** Collects named form values; empty strings become null, numeric inputs become numbers. */
export function formValues(form: HTMLFormElement): Record<string, any> {
  const out: Record<string, any> = {}
  for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!el.name || (el as HTMLInputElement).disabled) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') { out[el.name] = el.checked; continue }
    if (el instanceof HTMLInputElement && el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue }
    const v = el.value.trim()
    if (v === '') out[el.name] = null
    else if (el instanceof HTMLInputElement && el.type === 'number') out[el.name] = Number(v)
    else if (el.dataset.number !== undefined) out[el.name] = Number(v)
    else out[el.name] = v
  }
  return out
}
