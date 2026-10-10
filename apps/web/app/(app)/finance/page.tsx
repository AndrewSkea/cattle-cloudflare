'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownLeft, ArrowUpRight, Download, Lock, MoreHorizontal, Pencil, Plus, Scale, Search, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Select } from '@/components/ui/form'
import { Menu, MenuItem, useConfirm } from '@/components/ui/overlay'
import { TransactionSheet } from '@/components/forms/other-forms'
import { api, useSave, useTransactions } from '@/lib/queries'
import { getData } from '@/lib/api'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryLabel } from '@/lib/constants'
import { downloadUrl, fmtDate, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/lib/types'

interface Summary {
  from: string; to: string; income: number; expense: number; net: number; vat: number
  byCategory: { type: string; category: string; total: number; count: number }[]
  monthly: { month: string; income: number; expense: number; net: number }[]
  headCount: number; costPerHead: number | null; animalsSold: number; avgSalePrice: number | null; avgPricePerKg: number | null
}

function periods() {
  const t = todayISO()
  const y = Number(t.slice(0, 4))
  const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1)
  return {
    ytd: { label: `This year (${y})`, from: `${y}-01-01`, to: t },
    last: { label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    l12: { label: 'Last 12 months', from: d.toISOString().slice(0, 10), to: t },
    prev: { label: `${y - 2}`, from: `${y - 2}-01-01`, to: `${y - 2}-12-31` },
  }
}

const SOURCE_LABEL: Record<string, string> = { animal_sale: 'Animal sale', animal_purchase: 'Animal purchase', health: 'Health record', equipment_log: 'Equipment log' }

export default function FinancePage() {
  const { currency, can } = useSession()
  const confirm = useConfirm()
  const P = periods()
  const [period, setPeriod] = useState<keyof typeof P>('ytd')
  const { from, to } = P[period]
  const summary = useQuery({ queryKey: ['finance', 'summary', from, to], queryFn: () => getData<Summary>(`/api/finance/summary?from=${from}&to=${to}`), enabled: can('manager') })
  const { data: txns } = useTransactions(can('manager'))
  const [sheet, setSheet] = useState<null | { txn?: Transaction; type?: 'income' | 'expense' }>(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [cat, setCat] = useState('')
  const del = useSave((id: number) => api.del(`/api/finance/transactions/${id}`), { invalidate: ['finance'], success: 'Transaction deleted' })

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (txns || []).filter((t) => t.date >= from && t.date <= to && (!type || t.type === type) && (!cat || t.category === cat)
      && (!s || `${t.description || ''} ${t.counterparty || ''} ${t.reference || ''} ${categoryLabel(t.category)} ${t.animalTag || ''} ${t.equipmentName || ''}`.toLowerCase().includes(s)))
  }, [txns, q, type, cat, from, to])

  if (!can('manager')) return <EmptyState icon={Lock} title="Finances are for managers and owners" description="Ask the farm owner if you need access." />
  if (!summary.data || !txns) return <PageSkeleton />
  const s = summary.data
  const inc = s.byCategory.filter((c) => c.type === 'income')
  const exp = s.byCategory.filter((c) => c.type === 'expense')
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.total))
  const money = (v: number | null) => fmtMoney(v, currency, { decimals: false })

  return (
    <div className="space-y-6">
      <PageHeader title="Finances" description="Money in and out, profit and loss, and cost per head."
        actions={<>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as keyof typeof P)} className="w-44" aria-label="Period">
            {Object.entries(P).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => downloadUrl(api.url(`/api/finance/export?from=${from}&to=${to}`))}><Download />Export</Button>
          <Menu trigger={<Button><Plus />Add</Button>}>
            <MenuItem icon={ArrowDownLeft} onClick={() => setSheet({ type: 'income' })}>Money in</MenuItem>
            <MenuItem icon={ArrowUpRight} onClick={() => setSheet({ type: 'expense' })}>Money out</MenuItem>
          </Menu>
        </>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Money in" value={money(s.income)} icon={ArrowDownLeft} sub={`${inc.reduce((a, c) => a + c.count, 0)} transactions`} />
        <StatCard label="Money out" value={money(s.expense)} icon={ArrowUpRight} tone="clay" sub={`${exp.reduce((a, c) => a + c.count, 0)} transactions`} />
        <StatCard label="Net profit" value={money(s.net)} icon={Wallet} tone={s.net >= 0 ? 'brand' : 'clay'} sub={s.income ? `${fmtNum((s.net / s.income) * 100)}% margin` : undefined} />
        <StatCard label="Cost per head" value={s.costPerHead != null ? money(s.costPerHead) : '—'} icon={Scale} tone="wheat"
          sub={[s.headCount ? `${s.headCount} on farm` : null, s.avgSalePrice ? `avg sale ${money(s.avgSalePrice)}` : null, s.avgPricePerKg ? `${fmtMoney(s.avgPricePerKg, currency)}/kg` : null].filter(Boolean).join(' · ')} />
      </div>

      <Card>
        <CardHeader title="Month by month" description={`${fmtDate(s.from)} – ${fmtDate(s.to)}`} />
        <div className="h-72 px-2 pb-4 pt-4">
          <ResponsiveContainer>
            <ComposedChart data={s.monthly} margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => fmtDate(`${m}-01`, 'MMM')} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmtMoney(v, currency, { compact: true })} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={64} />
              <Tooltip formatter={(v: any, n: any) => [fmtMoney(v, currency), n]} labelFormatter={(m: any) => fmtDate(`${m}-01`, 'MMMM yyyy')} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }} cursor={{ fill: '#fafaf9' }} />
              <Bar dataKey="income" name="Money in" fill="#3f7d5c" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="Money out" fill="#e5a28e" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line dataKey="net" name="Net" type="monotone" stroke="#c8923a" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {[{ title: 'Where money came from', list: inc, color: 'from-brand-400 to-brand-700' }, { title: 'Where money went', list: exp, color: 'from-clay-300 to-clay-500' }].map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} />
            {g.list.length === 0 ? <p className="px-5 pb-6 pt-3 text-sm text-stone-500">Nothing recorded in this period.</p> : (
              <ul className="space-y-3 p-5">
                {g.list.map((c) => (
                  <li key={c.category}>
                    <button className="w-full text-left" onClick={() => { setCat(cat === c.category ? '' : c.category); setType('') }}>
                      <div className="flex justify-between text-sm"><span className={cn('text-stone-700', cat === c.category && 'font-semibold text-stone-900')}>{categoryLabel(c.category)}</span><span className="font-medium text-stone-900 tabular">{money(c.total)}</span></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"><div className={cn('h-full rounded-full bg-gradient-to-r', g.color)} style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, payee, reference…" aria-label="Search transactions"
              className="h-9 w-full rounded-lg border-0 bg-stone-50 pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-36" aria-label="Type"><option value="">In & out</option><option value="income">Money in</option><option value="expense">Money out</option></Select>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-52" aria-label="Category">
            <option value="">All categories</option>
            <optgroup label="Money in">{INCOME_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
            <optgroup label="Money out">{EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
          </Select>
        </div>
        {rows.length === 0 ? <EmptyState icon={Wallet} title="No transactions" description="Sales, vet bills and equipment costs appear here automatically. Add anything else by hand." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Description</th><th className="px-3 py-2.5 font-medium">Category</th><th className="px-3 py-2.5 font-medium">Linked to</th><th className="px-3 py-2.5 text-right font-medium">Amount</th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rows.slice(0, 500).map((t) => (
                  <tr key={t.id} className="hover:bg-stone-50">
                    <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2.5"><p className="text-stone-900">{t.description || categoryLabel(t.category)}</p>{t.counterparty && <p className="text-xs text-stone-400">{t.counterparty}{t.reference ? ` · ${t.reference}` : ''}</p>}</td>
                    <td className="px-3 py-2.5 text-stone-600">{categoryLabel(t.category)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {t.animalTag && <Link href={`/livestock/view?id=${t.animalId}&tab=money`} className="mr-2 text-brand-700 hover:underline">{t.animalTag}</Link>}
                      {t.equipmentName && <Link href={`/equipment/view?id=${t.equipmentId}`} className="mr-2 text-brand-700 hover:underline">{t.equipmentName}</Link>}
                      {t.parcelName && <span className="mr-2 text-stone-500">{t.parcelName}</span>}
                      {t.staffName && <span className="text-stone-500">{t.staffName}</span>}
                    </td>
                    <td className={cn('whitespace-nowrap px-3 py-2.5 text-right font-medium tabular', t.type === 'income' ? 'text-emerald-700' : 'text-stone-900')}>{t.type === 'income' ? '+' : '−'}{fmtMoney(t.amount, currency)}</td>
                    <td className="px-3 py-2.5">
                      {t.source ? <span title={`Created from ${SOURCE_LABEL[t.source] || t.source}. Edit it there.`} className="grid size-6 place-items-center text-stone-300"><Lock className="size-3.5" /></span> : (
                        <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                          <MenuItem icon={Pencil} onClick={() => setSheet({ txn: t })}>Edit</MenuItem>
                          <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: 'Delete this transaction?', confirmLabel: 'Delete', danger: true })) del.mutate(t.id) }}>Delete</MenuItem>
                        </Menu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-stone-200 bg-stone-50/60 text-sm">
                <tr><td colSpan={4} className="px-5 py-2.5 font-medium text-stone-600">{rows.length} transactions</td><td className="px-3 py-2.5 text-right font-semibold tabular text-stone-900">{fmtMoney(rows.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0), currency)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {sheet && <TransactionSheet open onClose={() => setSheet(null)} txn={sheet.txn} defaultType={sheet.type} />}
    </div>
  )
}
