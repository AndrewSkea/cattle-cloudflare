/**
 * Reads a mart seller's statement ("Sellers List for SPECIAL SALE" from Orkney Auction Mart) from OCR or PDF text.
 *
 *   S458            SPECIAL SALE                                  12/10/26
 *   522   1   SM  STR UK523801101382         21/02/25 605.0          2200.00
 *               AUCHTYDORE BLUE KID                        ← buyer of the line above
 *   …
 *   Gross 91100.00   *COMMISSION -2610.00   INSURANCE -67.50   Charges VAT -522.00   Net 87900.50
 *   45 STORE CATTLE   Av 530.36 wt  381.71 ppk  2024.44 pph
 *
 * Animals sold together as a batch appear as consecutive lines with the same weight and price. Whether that price
 * is per head (the usual case) or for the whole batch is decided by which reading adds up to the statement's gross.
 * Pure functions — no I/O.
 */

export interface StatementRow {
  lot: string
  qty: number
  breedCode: string | null
  sexCode: string | null
  tag: string
  dob: string | null
  weightKg: number | null
  /** As printed */
  printedPrice: number
  /** Per animal, after working out batches */
  price: number
  batchSize: number
  /** Index of the batch (consecutive lines with the same weight and price) */
  group: number
  buyer: string | null
  raw: string
}

export interface StatementTotals {
  gross: number | null
  commission: number | null
  insurance: number | null
  vat: number | null
  other: number | null
  net: number | null
  head: number | null
  avgWeightKg: number | null
  ppk: number | null
  pph: number | null
  label: string | null
}

export interface Statement {
  saleRef: string | null
  title: string | null
  date: string | null
  seller: string[]
  rows: StatementRow[]
  totals: StatementTotals
  unreadLines: string[]
}

export type PriceMode = 'per_head' | 'per_batch'

const TAG_RE = /\b([A-Z]{2})\s?([0-9OoIlSB]{6})\s?-?\s?([0-9OoIlSB]{6})\b/
const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/

const digitFix = (s: string) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8')

export function toNumber(s: string | undefined | null): number | null {
  if (!s) return null
  const t = s.replace(/[£,\s]/g, '').replace(/^\*/, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** "21/02/25" → "2025-02-21". Two-digit years after this year are taken as last century. */
export function toIsoDate(s: string | null | undefined, todayYear = new Date().getFullYear()): string | null {
  const m = s?.trim().match(DATE_RE)
  if (!m) return null
  let y = Number(m[3])
  if (m[3].length === 2) y += y + 2000 > todayYear + 1 ? 1900 : 2000
  const mo = Number(m[2]), d = Number(m[1])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseRow(line: string): Omit<StatementRow, 'price' | 'batchSize' | 'group' | 'buyer'> | null {
  const tm = line.match(TAG_RE)
  if (!tm || tm.index == null) return null
  const tag = `${tm[1].toUpperCase()}${digitFix(tm[2])}${digitFix(tm[3])}`
  if (!/^[A-Z]{2}\d{12}$/.test(tag)) return null
  const left = line.slice(0, tm.index).trim().split(/\s+/).filter(Boolean)
  const right = line.slice(tm.index + tm[0].length).trim().split(/\s+/).filter(Boolean)
  if (!left.length || !/^\d{1,5}[A-Z]?$/i.test(left[0])) return null
  // Price is the last number with two decimals; weight the number before it; date of birth before that.
  let i = right.length - 1
  const printedPrice = toNumber(right[i])
  if (printedPrice == null || !/\.\d{2}$/.test(right[i])) return null
  i--
  let weightKg: number | null = null
  if (i >= 0 && toNumber(right[i]) != null && !DATE_RE.test(right[i])) { weightKg = toNumber(right[i]); i-- }
  let dob: string | null = null
  if (i >= 0 && DATE_RE.test(right[i])) dob = toIsoDate(right[i])
  const [lot, qtyTok, ...rest] = left
  const sexCode = rest.length ? rest[rest.length - 1].toUpperCase() : null
  const breedCode = rest.length > 1 ? rest[rest.length - 2].toUpperCase() : null
  const qty = /^\d+$/.test(qtyTok ?? '') ? Math.max(1, Number(qtyTok)) : 1
  return { lot, qty, breedCode, sexCode, tag, dob, weightKg: weightKg && weightKg > 0 ? weightKg : null, printedPrice, raw: line.trim() }
}

const TOTAL_LABELS: [RegExp, keyof StatementTotals][] = [
  [/^gross\b/i, 'gross'],
  [/^\*?\s*commission\b/i, 'commission'],
  [/^insurance\b/i, 'insurance'],
  [/^(charges\s+)?vat\b/i, 'vat'],
  [/^net\b/i, 'net'],
]

function parseTotal(line: string): { key: keyof StatementTotals; value: number | null } | null {
  const m = line.trim().match(/^(.*?[A-Za-z].*?)\s+(-?\s?[£$\dSOo.,]+)$/)
  if (!m) return null
  const label = m[1].trim()
  const raw = m[2].replace(/\s/g, '')
  const value = toNumber(raw.replace(/^-/, ''))
  for (const [re, key] of TOTAL_LABELS) if (re.test(label)) return { key, value }
  // Anything else with a negative amount after the lots is a charge (haulage, levy…)
  if (raw.startsWith('-') && value != null) return { key: 'other', value }
  return null
}

const SUMMARY_RE = /(\d+)\s+([A-Z][A-Z ]+?)\s+[aoe]v\.?\s+([\d.,]+)\s*wt\s+([\d.,]+)\s*ppk\s+([\d.,]+)\s*pph/i
// OCR often reads the S of "S458" as 5 or $.
const HEADER_RE = /(?:^|\s)([A-Z$5]\d{2,4})\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/i

/** "S458-Sellers_List_for_SPECIAL_SALE_12-10-2026.pdf" → sale ref and date, for when the scan's header didn't read. */
export function fromFileName(name: string): { saleRef: string | null; date: string | null } {
  const ref = name.match(/(?:^|[^A-Za-z0-9])(S\d{2,4})(?=[^0-9]|$)/i)
  const d = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{4}|\d{2})(?!\d)/)
  return { saleRef: ref ? ref[1].toUpperCase() : null, date: d ? toIsoDate(`${d[1]}/${d[2]}/${d[3]}`) : null }
}

export function parseStatement(pages: string[]): Statement {
  const out: Statement = {
    saleRef: null, title: null, date: null, seller: [], rows: [], unreadLines: [],
    totals: { gross: null, commission: null, insurance: null, vat: null, other: null, net: null, head: null, avgWeightKg: null, ppk: null, pph: null, label: null },
  }
  type Row = Omit<StatementRow, 'price' | 'batchSize' | 'group'>
  const rows: Row[] = []
  let inTotals = false
  pages.forEach((text, pageNo) => {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
    // Skip the page header (address, VAT note, sale line, "FA/No") — everything up to the sale line / FA/No.
    let start = 0
    const fa = lines.findIndex((l) => /\bFA\s*\/\s*No\b/i.test(l))
    const hdr = lines.findIndex((l) => HEADER_RE.test(l) && !TAG_RE.test(l))
    if (hdr >= 0 && !out.saleRef) {
      const m = lines[hdr].match(HEADER_RE)!
      out.saleRef = m[1].toUpperCase().replace(/^[5$]/, 'S')
      out.title = m[2].trim().replace(/\s+/g, ' ').toUpperCase()
      out.date = toIsoDate(m[3])
    }
    // No "S458  SPECIAL SALE  12/10/26" line read cleanly: take the date from any header line ending in one.
    if (!out.date) {
      const firstRow = lines.findIndex((l) => parseRow(l))
      for (const l of lines.slice(0, firstRow < 0 ? lines.length : firstRow)) {
        const m = l.match(/(?:^|\s)(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/)
        if (m && toIsoDate(m[1])) {
          out.date = toIsoDate(m[1])
          const before = l.slice(0, l.length - m[0].length).trim().split(/\s{2,}/).filter(Boolean)
          if (!out.title && before.length) out.title = before[before.length - 1].replace(/\s+/g, ' ').toUpperCase()
          const ref = l.match(/^\s*[S$5](\d{2,4})\b/)
          if (!out.saleRef && ref) out.saleRef = `S${ref[1]}`
          break
        }
      }
    }
    if (pageNo === 0 && hdr > 0) out.seller = lines.slice(0, hdr).map((l) => l.split(/\s{3,}/)[0].trim()).filter((l) => l && !/vat|customs|cheque/i.test(l))
    start = Math.max(fa, hdr) + 1
    for (const line of lines.slice(start)) {
      const sm = line.match(SUMMARY_RE)
      if (sm) {
        inTotals = true
        out.totals.head = Number(sm[1]); out.totals.label = sm[2].trim()
        out.totals.avgWeightKg = toNumber(sm[3]); out.totals.ppk = toNumber(sm[4]); out.totals.pph = toNumber(sm[5])
        continue
      }
      const row = parseRow(line)
      if (row) { rows.push({ ...row, buyer: null }); continue }
      const total = rows.length ? parseTotal(line) : null
      if (total) {
        inTotals = true
        if (total.key === 'other') out.totals.other = (out.totals.other ?? 0) + (total.value ?? 0)
        else if (out.totals[total.key] == null) (out.totals as any)[total.key] = total.value
        continue
      }
      const t = line.trim()
      if (!inTotals && rows.length && rows[rows.length - 1].buyer == null && /[A-Za-z]{2}/.test(t) && !/\d{2}\/\d{2}\//.test(t)) {
        rows[rows.length - 1].buyer = t.replace(/\s+/g, ' ')
        continue
      }
      if (/\d/.test(t)) out.unreadLines.push(t)
    }
  })

  // Batches: consecutive lines with the same weight and price.
  let group = -1
  const sized = rows.map((r, i) => {
    const prev = rows[i - 1]
    if (!prev || prev.printedPrice !== r.printedPrice || prev.weightKg !== r.weightKg) group++
    return { ...r, group }
  })
  const sizes = new Map<number, number>()
  for (const r of sized) sizes.set(r.group, (sizes.get(r.group) ?? 0) + 1)
  out.rows = sized.map((r) => ({ ...r, batchSize: sizes.get(r.group)!, price: r.printedPrice }))
  return out
}

export interface Reconciled {
  mode: PriceMode
  /** The gross we trust: the printed one when it agrees with net + charges or head × average, else the one that does */
  gross: number | null
  grossSource: 'printed' | 'net_plus_charges' | 'average' | 'lines' | null
  charges: number
  /** Net paid: the printed figure when it equals gross − charges, otherwise worked out */
  net: number | null
  netSource: 'printed' | 'calculated' | null
  sumPerHead: number
  sumPerBatch: number
  matches: boolean
  hasBatches: boolean
}

const near = (a: number | null, b: number | null, tol = 1) => a != null && b != null && Math.abs(a - b) <= tol

/** Decides how to read batch prices, and checks the lines against the statement totals. */
export function reconcile(s: Statement): Reconciled {
  const t = s.totals
  const abs = (x: number | null) => Math.abs(x ?? 0)
  const charges = Math.round((abs(t.commission) + abs(t.insurance) + abs(t.vat) + abs(t.other)) * 100) / 100
  const sumPerHead = round2(s.rows.reduce((a, r) => a + r.printedPrice, 0))
  const seen = new Set<number>()
  let sumPerBatch = 0
  for (const r of s.rows) if (!seen.has(r.group)) { seen.add(r.group); sumPerBatch += r.printedPrice }
  sumPerBatch = round2(sumPerBatch)
  const hasBatches = s.rows.some((r) => r.batchSize > 1)
  const fromNet = t.net != null ? round2(t.net + charges) : null
  const fromAvg = t.head && t.pph ? round2(t.head * t.pph) : null
  const avgTol = t.head ? t.head * 0.006 + 0.02 : 1
  let gross: number | null = null
  let grossSource: Reconciled['grossSource'] = null
  if (t.gross != null && (near(t.gross, fromNet) || near(t.gross, fromAvg, avgTol))) { gross = t.gross; grossSource = 'printed' }
  else if (fromNet != null && (near(fromNet, fromAvg, avgTol) || near(fromNet, sumPerHead) || near(fromNet, sumPerBatch))) { gross = fromNet; grossSource = 'net_plus_charges' }
  else if (fromAvg != null && (near(fromAvg, sumPerHead, avgTol) || near(fromAvg, sumPerBatch, avgTol))) { gross = near(fromAvg, sumPerHead, avgTol) ? sumPerHead : sumPerBatch; grossSource = 'average' }
  else if (t.gross != null) { gross = t.gross; grossSource = 'printed' }
  else if (fromNet != null) { gross = fromNet; grossSource = 'net_plus_charges' }

  let mode: PriceMode = 'per_head'
  if (gross != null && hasBatches && !near(sumPerHead, gross) && near(sumPerBatch, gross)) mode = 'per_batch'
  const matches = gross != null && near(mode === 'per_head' ? sumPerHead : sumPerBatch, gross)
  if (gross == null) { gross = sumPerHead; grossSource = 'lines' }
  let net: number | null = null
  let netSource: Reconciled['netSource'] = null
  if (t.net != null && near(t.net, gross - charges)) { net = t.net; netSource = 'printed' }
  else if (t.net != null || charges) { net = round2(gross - charges); netSource = 'calculated' }
  return { mode, gross, grossSource, charges, net, netSource, sumPerHead, sumPerBatch, matches, hasBatches }
}

/** Per-animal prices for the chosen reading: a batch's price split evenly (pennies on the first animals). */
export function applyMode(rows: StatementRow[], mode: PriceMode): StatementRow[] {
  if (mode === 'per_head') return rows.map((r) => ({ ...r, price: r.printedPrice }))
  const idx = new Map<number, number>()
  return rows.map((r) => {
    const i = idx.get(r.group) ?? 0
    idx.set(r.group, i + 1)
    const pence = Math.round(r.printedPrice * 100)
    const base = Math.floor(pence / r.batchSize)
    const extra = i < pence - base * r.batchSize ? 1 : 0
    return { ...r, price: (base + extra) / 100 }
  })
}

function round2(x: number) {
  return Math.round(x * 100) / 100
}
