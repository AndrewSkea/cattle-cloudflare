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

/**
 * Management numbers. Cows carry their own number (97); calves carry their mother's number and birth year
 * ("97/26", twins "97/26-A" and "97/26-B") until they're given their own number as a cow.
 */
export function calfNumber(damNumber: string | null | undefined, dateISO: string, taken: Iterable<string | null | undefined>): string {
  if (!damNumber) return ''
  const base = `${damNumber}/${dateISO.slice(2, 4)}`
  const used = new Set([...taken].filter(Boolean).map((t) => t!.toLowerCase()))
  if (!used.has(base.toLowerCase()) && !used.has(`${base}-a`.toLowerCase())) return base
  for (const s of 'BCDEFGH') if (!used.has(`${base}-${s}`.toLowerCase())) return `${base}-${s}`
  return base
}

/** The next unused whole number after the highest one the farm has ever used. */
export function nextHerdNumber(animals: { managementTag: string | null; formerTags?: string | null }[]): number {
  let max = 0
  for (const a of animals) {
    for (const t of [a.managementTag, ...(a.formerTags || '').split(' ')]) if (t && /^\d+$/.test(t)) max = Math.max(max, Number(t))
  }
  return max + 1
}

/** True for numbers that still need replacing with a cow's own number: calf numbers and "N.24" heifer numbers. */
export function isYoungStockNumber(tag: string | null | undefined): boolean {
  return !tag || /\//.test(tag) || /^\d+\.\d{2}$/.test(tag)
}
