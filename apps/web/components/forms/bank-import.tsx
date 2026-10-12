'use client'

import { useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Select } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { api, useSave } from '@/lib/queries'
import { type BankLine, type Columns, detectColumns, guessCategory, parseCsv, toLines } from '@/lib/bank-csv'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { fmtDate, fmtMoney } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

interface Row extends BankLine { type: 'income' | 'expense'; category: string; include: boolean }

const COLUMN_FIELDS: { key: keyof Columns; label: string; optional?: boolean }[] = [
  { key: 'date', label: 'Date' }, { key: 'description', label: 'Description', optional: true },
  { key: 'amount', label: 'Amount (+/−)', optional: true }, { key: 'paidIn', label: 'Paid in', optional: true }, { key: 'paidOut', label: 'Paid out', optional: true },
]

/**
 * Import a bank statement (CSV) as income and costs. Each line gets a guessed category to check; livestock sales
 * start unticked because sales are already recorded from the animals (mart imports and exits). Lines already in
 * Finances (same date, amount and description) are skipped by the server.
 */
export function BankImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency } = useSession()
  const [file, setFile] = useState<string | null>(null)
  const [csv, setCsv] = useState<string[][] | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [cols, setCols] = useState<Columns | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')

  const build = (data: string[][], h: number, c: Columns) => {
    const { lines, skipped } = toLines(data, h, c)
    setRows(lines.map((l) => {
      const type = l.amount > 0 ? 'income' : 'expense'
      const category = guessCategory(l.description, type)
      return { ...l, type, category, include: category !== 'livestock_sales' }
    }))
    setError(!lines.length ? 'No transactions found with these columns. Check the column choices below.' : skipped > 2 ? `${skipped} lines had no date or amount and were left out (e.g. balances or headings).` : null)
  }

  const load = async (f: File) => {
    const data = parseCsv(await f.text())
    setFile(f.name)
    setCsv(data)
    const d = detectColumns(data)
    if (!d) {
      setCols({ date: 0, description: 1, amount: 2, paidIn: -1, paidOut: -1 })
      setRows([])
      setError('Couldn’t find the date and amount columns automatically. Choose them below.')
      return
    }
    setHeaderRow(d.headerRow)
    setCols(d.cols)
    build(data, d.headerRow, d.cols)
  }

  const setCol = (k: keyof Columns, v: number) => {
    if (!csv || !cols) return
    const next = { ...cols, [k]: v }
    setCols(next)
    build(csv, headerRow, next)
  }
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const chosen = rows.filter((r) => r.include)
  const totals = useMemo(() => ({
    in: chosen.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
    out: chosen.filter((r) => r.type === 'expense').reduce((s, r) => s - r.amount, 0),
  }), [chosen])
  const shown = rows.filter((r) => filter === 'all' || r.type === filter)

  const save = useSave((body: any) => api.post<{ data: { imported: number; duplicates: number } }>('/api/finance/import', body).then((r) => r.data), {
    invalidate: ['finance', 'dashboard'], silentError: true, onSuccess: onClose,
    success: (r) => `Imported ${r.imported} transaction${r.imported === 1 ? '' : 's'}${r.duplicates ? ` (${r.duplicates} already in Finances, skipped)` : ''}`,
  })
  const header = csv?.[headerRow] || []

  return (
    <Sheet open={open} onClose={onClose} wide title="Import a bank statement"
      description="Download a CSV from your online banking, then check the category of each line before importing."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} disabled={!chosen.length} onClick={() => save.mutate({
          rows: chosen.map((r) => ({ type: r.type, category: r.category, amount: Math.abs(r.amount), date: r.date, description: r.description || null })),
        }, { onError: (e) => setError(e.message) })}>Import {chosen.length || ''}</Button>
      </>}>
      <div className="space-y-5">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 p-4 transition hover:border-brand-400 hover:bg-brand-50/40">
          <FileUp className="size-5 text-brand-700" />
          <span className="flex-1 text-sm"><span className="font-medium text-stone-900">{file || 'Choose a CSV file'}</span>
            <span className="block text-xs text-stone-500">Most UK banks: Statements → Export or Download → CSV</span></span>
          <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Bank statement CSV" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f) }} />
        </label>

        {cols && csv && (
          <details className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200" open={!rows.length}>
            <summary className="cursor-pointer font-medium text-stone-700">Columns</summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COLUMN_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Select value={cols[f.key]} onChange={(e) => setCol(f.key, Number(e.target.value))} aria-label={`${f.label} column`}>
                    {f.optional && <option value={-1}>—</option>}
                    {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          </details>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone-600">{chosen.length} of {rows.length} ticked ·
                <span className="font-medium text-emerald-700"> {fmtMoney(totals.in, currency)} in</span> ·
                <span className="font-medium text-clay-700"> {fmtMoney(totals.out, currency)} out</span></span>
              <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="ml-auto w-36" aria-label="Show">
                <option value="all">All lines</option><option value="expense">Money out</option><option value="income">Money in</option>
              </Select>
            </div>
            {rows.some((r) => r.category === 'livestock_sales') && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">Livestock sales start unticked: they are already in Finances from the animals’ sale records (and mart imports). Tick them only if they aren’t.</p>
            )}
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {shown.map((r) => (
                <li key={r.key} className={cn('flex items-start gap-3 px-3 py-2.5', !r.include && 'opacity-55')}>
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label={`Import ${r.description}`}
                    className="mt-0.5 size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800" title={r.description}>{r.description || '—'}</span>
                      <span className={cn('shrink-0 text-sm font-medium tabular', r.type === 'income' ? 'text-emerald-700' : 'text-stone-900')}>
                        {r.type === 'income' ? '+' : '−'}{fmtMoney(Math.abs(r.amount), currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-xs text-stone-500">{fmtDate(r.date, 'd MMM yyyy')}</span>
                      <Select value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} className="ml-auto h-8 w-44 py-0 text-xs" aria-label={`Category for ${r.description}`}>
                        {(r.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </Select>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <FormError error={error} />
      </div>
    </Sheet>
  )
}
