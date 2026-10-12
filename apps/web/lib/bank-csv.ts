/**
 * Bank statement CSV import: parsing, column detection and a first guess at each line's category.
 * Works with the usual UK bank exports (one signed Amount column, or Paid in / Paid out, or Credit / Debit).
 */

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()))
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()))
  return rows
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

/** UK-first date parsing: 31/01/2026, 31-01-26, 2026-01-31, 31 Jan 2026. Returns ISO or null. */
export function parseDate(v: string): string | null {
  const t = v.trim()
  let y: number, m: number, d: number
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] } else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) {
    d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000
  } else if ((r = /^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[\s-](\d{2,4})$/.exec(t))) {
    d = +r[1]; m = MONTHS[r[2].toLowerCase()] || 0; y = +r[3]; if (y < 100) y += 2000
  } else return null
  if (!m || m > 12 || !d || d > 31 || y < 1990 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "£1,234.50", "-12.00", "(12.00)", "12.00 DR" → signed number (money out negative). */
export function parseAmount(v: string): number | null {
  let t = v.trim()
  if (!t) return null
  let sign = 1
  if (/\bDR\b/i.test(t) || /^\(.*\)$/.test(t)) sign = -1
  t = t.replace(/\b(CR|DR)\b/gi, '').replace(/[£$€,\s()]/g, '')
  if (t.startsWith('-')) { sign = -sign; t = t.slice(1) }
  if (t.startsWith('+')) t = t.slice(1)
  const n = Number(t)
  return Number.isFinite(n) && t !== '' ? sign * n : null
}

export interface Columns { date: number; description: number; amount: number; paidIn: number; paidOut: number }

/** Finds the header row (the first with a date column and some amount column) and maps its columns. */
export function detectColumns(rows: string[][]): { headerRow: number; cols: Columns } | null {
  for (let h = 0; h < Math.min(rows.length, 15); h++) {
    const head = rows[h].map((c) => c.toLowerCase())
    const find = (re: RegExp, not?: RegExp) => head.findIndex((c) => re.test(c) && !(not && not.test(c)))
    const date = find(/date/, /value date/) >= 0 ? find(/date/, /value date/) : find(/date/)
    const amount = find(/^amount|^value$|amount \(|^sum$/)
    const paidIn = find(/paid in|money in|credit|deposit|receipts?|^in$/)
    const paidOut = find(/paid out|money out|debit|withdrawal|payments?|^out$/)
    if (date < 0 || (amount < 0 && (paidIn < 0 || paidOut < 0))) continue
    let description = find(/description|details|narrative|memo|payee|particulars/)
    if (description < 0) description = find(/name|reference|transaction|type/)
    return { headerRow: h, cols: { date, description, amount, paidIn, paidOut } }
  }
  return null
}

export interface BankLine { key: number; date: string; description: string; amount: number }

export function toLines(rows: string[][], headerRow: number, c: Columns): { lines: BankLine[]; skipped: number } {
  const lines: BankLine[] = []
  let skipped = 0
  rows.slice(headerRow + 1).forEach((r, i) => {
    const date = parseDate(r[c.date] || '')
    let amount: number | null = null
    if (c.amount >= 0) amount = parseAmount(r[c.amount] || '')
    else {
      const pin = parseAmount(r[c.paidIn] || ''), pout = parseAmount(r[c.paidOut] || '')
      if (pin) amount = Math.abs(pin)
      else if (pout) amount = -Math.abs(pout)
    }
    if (!date || !amount) { skipped++; return }
    lines.push({ key: i, date, description: (c.description >= 0 ? r[c.description] : '').replace(/\s+/g, ' ').slice(0, 500), amount })
  })
  return { lines, skipped }
}

const EXPENSE_RULES: [RegExp, string][] = [
  [/straw|bedding|sawdust|shavings/i, 'bedding'],
  [/\bvet|veterinary|medic|animal health|zoetis|\bmsd\b|elanco|boehringer/i, 'vet_medicine'],
  [/feed|nuts|cake|mineral|\blick|silage|\bhay\b|draff|barley|harbro|carrs|bibby|forfarmers|agrii|molasses/i, 'feed'],
  [/fuel|diesel|derv|petrol|\besso\b|\bshell\b|\bbp\b|texaco|gulf|certas|gas ?oil|\bred diesel/i, 'fuel'],
  [/wage|salary|payroll|\bhmrc paye/i, 'wages'],
  [/fertili[sz]|\bseed|\blime\b|yara|\bnitram/i, 'fertiliser_seed'],
  [/contractor|baling|shearing|haulage|\bhaulier|spraying|hedge ?cut/i, 'contractors'],
  [/repair|spares|\bparts?\b|tyres?|garage|welding/i, 'repairs'],
  [/tractor|machinery|john deere|massey|new holland|kubota|claas|hire purchase|\blease/i, 'machinery'],
  [/electric|\bsse\b|scottish ?power|\bedf\b|octopus|energy|scottish water|\bwater\b|\bbt\b|broadband|phone|vodafone|\bee\b/i, 'utilities'],
  [/insur|nfu mutual|\bnfum\b|aviva|zurich/i, 'insurance'],
  [/accountan|solicitor|bank charge|account fee|commission|subscription|\bnfus\b|scoteid|\bsac\b|consult/i, 'professional_fees'],
  [/\brent\b|\blease of land|grazing let/i, 'rent'],
  [/mart|auction|livestock|cattle|calves|\bstirks?\b/i, 'livestock_purchases'],
]
const INCOME_RULES: [RegExp, string][] = [
  [/rpid|scottish gov|\bsg\b|\bbps\b|basic payment|lfass|\bscheme|grant|suckler|ssbss|agri|subsid|beef calf/i, 'subsidies'],
  [/mart|auction|livestock|cattle|\babp\b|dunbia|scotbeef|woodhead|abattoir|\bmeat|stirks?\b|orkney meat/i, 'livestock_sales'],
  [/contract/i, 'contracting'],
  [/\brent\b|grazing/i, 'rent_received'],
  [/silage|hay|straw|barley|crop/i, 'crop_sales'],
  [/wool|milk|eggs/i, 'milk_wool'],
]

export function guessCategory(description: string, type: 'income' | 'expense'): string {
  for (const [re, cat] of type === 'income' ? INCOME_RULES : EXPENSE_RULES) if (re.test(description)) return cat
  return type === 'income' ? 'other_income' : 'other_expense'
}
