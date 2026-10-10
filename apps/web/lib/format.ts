import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return format(d, 'yyyy-MM-dd')
}

export function fmtDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso.length > 10 ? iso.replace(' ', 'T') : iso), pattern)
  } catch {
    return iso
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseISO(iso.length > 10 ? iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z') : iso)
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

/** "in 3 days", "today", "5 days ago" for date-only values. */
export function fmtDue(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = differenceInCalendarDays(parseISO(iso), new Date())
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`
}

export function fmtAge(months: number | null | undefined): string {
  if (months == null) return '—'
  if (months < 1) return '< 1 mo'
  if (months < 24) return `${months} mo`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m ? `${y} y ${m} mo` : `${y} y`
}

const CURRENCY_LOCALE: Record<string, string> = { GBP: 'en-GB', EUR: 'en-IE', USD: 'en-US', AUD: 'en-AU', NZD: 'en-NZ', CAD: 'en-CA' }

export function fmtMoney(v: number | null | undefined, currency = 'GBP', opts: { compact?: boolean; decimals?: boolean } = {}): string {
  if (v == null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || 'en-GB', {
    style: 'currency', currency,
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : opts.decimals === false ? 0 : 2,
    minimumFractionDigits: opts.compact || opts.decimals === false ? 0 : 2,
  }).format(v)
}

export function fmtNum(v: number | null | undefined, dp = 0): string {
  if (v == null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: 0 }).format(v)
}

export function fmtArea(ha: number | null | undefined, unit: 'ha' | 'ac' = 'ha'): string {
  if (ha == null) return '—'
  return unit === 'ac' ? `${fmtNum(ha * 2.47105, 1)} ac` : `${fmtNum(ha, 2)} ha`
}

export function animalLabel(a: { managementTag?: string | null; tagNo: string; name?: string | null }): string {
  const main = a.managementTag || a.tagNo
  return a.name ? `${main} · ${a.name}` : main
}

export function initials(name: string | null | undefined, email?: string): string {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function downloadUrl(href: string) {
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
