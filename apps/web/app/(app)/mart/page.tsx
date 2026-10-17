'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Check, ExternalLink, Gavel, RefreshCw, RotateCcw, Search, Settings2, Trophy, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { FormError, Segmented, TextField } from '@/components/ui/form'
import { Modal, Sheet, Tabs, useConfirm } from '@/components/ui/overlay'
import { ApiError, getData } from '@/lib/api'
import { api, useSave } from '@/lib/queries'
import { fmtAge, fmtDate, fmtMoney, fmtNum, fmtRelative, titleCase, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { MartCandidate, MartMatch, MartOverview } from '@/lib/types'
import { SaleStatementDrop, useStatementFlow, type SaleStatementItem } from '@/components/sale-statement'
import { MonthlyPricesSheet } from '@/components/animal-value'

type Tab = 'new' | 'imported' | 'dismissed' | 'statements' | 'prices'

const tooltipStyle = { borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }

export default function MartPage() {
  const { can } = useSession()
  const overview = useQuery({ queryKey: ['mart', 'overview'], queryFn: () => getData<MartOverview>('/api/mart') })
  const [tab, setTab] = useState<Tab>('new')
  const [settings, setSettings] = useState(false)
  const [importing, setImporting] = useState<MartMatch | null>(null)
  const [dismissBefore, setDismissBefore] = useState(false)
  const statement = useStatementFlow()
  const statements = useQuery({ queryKey: ['sale-statements'], queryFn: () => getData<SaleStatementItem[]>('/api/sale-statements'), enabled: can('worker') })
  const refresh = useSave(() => api.post<{ data: { updated: number; matched: number; skipped?: boolean } }>('/api/mart/refresh'), {
    invalidate: ['mart'],
    success: (r) => r.data.skipped ? 'Checked a moment ago — try again in a couple of minutes' : r.data.updated ? `${r.data.updated} new report${r.data.updated === 1 ? '' : 's'} read` : 'No new reports since last check',
  })

  if (overview.isLoading || !overview.data) return <PageSkeleton />
  const o = overview.data
  const configured = o.sellers.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mart sales"
        description={configured
          ? <>Your lots in Orkney Auction Mart sales reports, sold as <strong className="font-medium text-stone-700">{o.sellers.join(' or ')}</strong>.</>
          : 'Find your sales in Orkney Auction Mart reports automatically, and import them against your animals.'}
        actions={<>
          {can('worker') && <Button variant="secondary" onClick={() => refresh.mutate(undefined)} loading={refresh.isPending}><RefreshCw />Check for new reports</Button>}
          {configured && can('manager') && <Button variant="secondary" onClick={() => setSettings(true)}><Settings2 />Seller names</Button>}
        </>}
      />

      {can('worker') && <SaleStatementDrop onFile={statement.open} compact={configured} />}
      {statement.dialog}

      {!configured ? <SetupCard canEdit={can('manager')} onDone={() => setTab('new')} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="To review" value={fmtNum(o.counts.new)} icon={Gavel} tone="wheat" sub="Lots that look like yours" />
            <StatCard label="Imported" value={fmtNum(o.counts.imported)} icon={Check} tone="brand" sub="Linked to your animals" />
            <StatCard label="Reports read" value={fmtNum(o.reports)} icon={Search} tone="stone" sub={o.latestReport ? `Latest sale ${fmtDate(o.latestReport)}` : undefined} />
            <StatCard label="Last checked" value={o.lastSyncAt ? fmtRelative(o.lastSyncAt) : 'Automatic'} icon={RefreshCw} tone="sky" sub="New reports are picked up every 3 hours" />
          </div>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3">
              <Tabs value={tab} onChange={setTab} tabs={[
                { value: 'new', label: 'To review', count: o.counts.new },
                { value: 'imported', label: 'Imported', count: o.counts.imported },
                { value: 'dismissed', label: 'Not ours', count: o.counts.dismissed },
                ...(statements.data?.length ? [{ value: 'statements' as const, label: 'Statements', count: statements.data.filter((x) => x.status === 'imported').length }] : []),
                { value: 'prices', label: 'Market prices' },
              ]} />
              {tab === 'new' && o.counts.new > 0 && can('manager') && (
                <Button size="sm" variant="ghost" className="mb-2" onClick={() => setDismissBefore(true)}>Clear older sales…</Button>
              )}
            </div>
            {tab === 'prices' ? <Prices /> : tab === 'statements' ? <Statements rows={statements.data || []} /> : <Matches status={tab} onImport={setImporting} />}
          </Card>
        </>
      )}

      {settings && <SellerSheet initial={o.sellers} onClose={() => setSettings(false)} />}
      {importing && <ImportSheet match={importing} onClose={() => setImporting(null)} />}
      {dismissBefore && <DismissBeforeModal onClose={() => setDismissBefore(false)} />}
    </div>
  )
}

// ---------------- Setup / seller names ----------------

function useSellerSearch(q: string) {
  const [debounced, setDebounced] = useState(q)
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t) }, [q])
  return useQuery({
    queryKey: ['mart', 'sellers', debounced],
    queryFn: () => getData<{ key: string; seller: string; lots: number; last: string }[]>(`/api/mart/sellers?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  })
}

function SellerPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const results = useSellerSearch(q)
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your farm or parish, e.g. Staye or Deerness" aria-label="Search seller names"
          className="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-sm font-medium text-brand-800 ring-1 ring-brand-600/20">
              {v}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${v}`}><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && (
        <div className="max-h-72 overflow-y-auto rounded-xl ring-1 ring-stone-200 scrollbar-thin">
          {results.isLoading ? <p className="p-3 text-sm text-stone-500">Searching…</p> : !results.data?.length ? (
            <p className="p-3 text-sm text-stone-500">No seller by that name in the reports read so far.</p>
          ) : results.data.map((r) => {
            const picked = value.includes(r.seller)
            return (
              <button key={r.key} type="button" disabled={picked} onClick={() => { onChange([...value, r.seller]); setQ('') }}
                className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-stone-50 disabled:opacity-50">
                <span className="font-medium text-stone-800">{r.seller}</span>
                <span className="shrink-0 text-xs text-stone-500">{r.lots} lot{r.lots === 1 ? '' : 's'} · last {fmtDate(r.last)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SetupCard({ canEdit, onDone }: { canEdit: boolean; onDone: () => void }) {
  const [sellers, setSellers] = useState<string[]>([])
  const save = useSave((v: string[]) => api.put<{ data: { added: number } }>('/api/mart/settings', { sellers: v }), {
    invalidate: ['mart'], success: (r) => `Found ${r.data.added} sale${r.data.added === 1 ? '' : 's'}`, onSuccess: onDone,
  })
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1fr_1.2fr]">
        <div className="bg-gradient-to-br from-brand-900 to-brand-700 p-8 text-white">
          <Gavel className="size-8 text-wheat-300" />
          <h2 className="mt-4 font-display text-2xl font-semibold">Your mart sales, without the typing</h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-100">
            HoovesWho reads every Orkney Auction Mart sales report as it&rsquo;s published and picks out the lots sold under your farm&rsquo;s name.
            You choose which animals each lot was, and the sale, weight and price are recorded for you.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-brand-100">
            {['Weight, price and p/kg from the report', 'Compared with the market average that day', 'Sale income added to your finances'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="size-4 text-wheat-300" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="p-8">
          <h3 className="text-[15px] font-semibold text-stone-900">How does the mart print your name?</h3>
          <p className="mt-1 text-sm text-stone-500">Reports list sellers as <em>Farm, Parish</em> — for example &ldquo;Staye, Deerness&rdquo;. Search for yours and add every spelling you use.</p>
          {canEdit ? (
            <div className="mt-5 space-y-4">
              <SellerPicker value={sellers} onChange={setSellers} />
              <Button onClick={() => save.mutate(sellers)} disabled={!sellers.length} loading={save.isPending}>Find my sales</Button>
            </div>
          ) : <p className="mt-5 text-sm text-stone-600">Ask a farm manager or owner to set this up.</p>}
        </div>
      </div>
    </Card>
  )
}

function SellerSheet({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const [sellers, setSellers] = useState(initial)
  const save = useSave((v: string[]) => api.put<{ data: { added: number } }>('/api/mart/settings', { sellers: v }), {
    invalidate: ['mart'], success: (r) => r.data.added ? `Found ${r.data.added} more sale${r.data.added === 1 ? '' : 's'}` : 'Seller names saved', onSuccess: onClose,
  })
  return (
    <Sheet open onClose={onClose} title="Seller names" description="Lots sold under any of these names appear here for review."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(sellers)} loading={save.isPending}>Save</Button></>}>
      <SellerPicker value={sellers} onChange={setSellers} />
    </Sheet>
  )
}

function DismissBeforeModal({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(`${todayISO().slice(0, 4)}-01-01`)
  const go = useSave((d: string) => api.post<{ data: { dismissed: number } }>('/api/mart/matches/dismiss-before', { date: d }), {
    invalidate: ['mart'], success: (r) => `${r.data.dismissed} older sale${r.data.dismissed === 1 ? '' : 's'} cleared`, onSuccess: onClose,
  })
  return (
    <Modal open onClose={onClose} title="Clear older sales" description="Moves every unreviewed sale before this date to “Not ours” — useful when those sales are already in your records. You can restore any of them later."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => go.mutate(date)} loading={go.isPending}>Clear</Button></>}>
      <TextField label="Sales before" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} />
    </Modal>
  )
}

// ---------------- Lots ----------------

function vsMarket(m: MartMatch) {
  if (m.pricePerKg == null || m.marketPpk == null) return null
  return Math.round((m.pricePerKg - m.marketPpk) * 10) / 10
}

function Matches({ status, onImport }: { status: 'new' | 'imported' | 'dismissed'; onImport: (m: MartMatch) => void }) {
  const { can, currency } = useSession()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery({ queryKey: ['mart', 'matches', status], queryFn: () => getData<MartMatch[]>(`/api/mart/matches?status=${status}`) })
  const dismiss = useSave((id: number) => api.post(`/api/mart/matches/${id}/dismiss`), { invalidate: ['mart'], success: 'Moved to “Not ours”' })
  const restore = useSave((id: number) => api.post(`/api/mart/matches/${id}/restore`), { invalidate: ['mart', 'animals', 'finance', 'weights'], success: 'Moved back to review' })

  const groups = useMemo(() => {
    const g = new Map<string, MartMatch[]>()
    for (const m of data || []) g.set(`${m.date}|${m.reportId}`, [...(g.get(`${m.date}|${m.reportId}`) || []), m])
    return [...g.values()]
  }, [data])

  if (isLoading) return <div className="p-6 text-sm text-stone-500">Loading…</div>
  if (!data?.length) {
    return <EmptyState icon={Gavel}
      title={status === 'new' ? 'Nothing to review' : status === 'imported' ? 'No sales imported yet' : 'Nothing here'}
      description={status === 'new' ? 'New sales reports are checked every 3 hours. Lots sold under your name will appear here.' : status === 'imported' ? 'Import a lot from “To review” to record the sale against your animals.' : 'Lots you mark as not yours are kept here.'} />
  }

  return (
    <div className="divide-y divide-stone-100">
      {groups.map((lots) => (
        <section key={`${lots[0].date}${lots[0].reportId}`}>
          <div className="flex items-center justify-between gap-3 bg-stone-50/70 px-5 py-2.5">
            <p className="text-sm font-semibold text-stone-800">{fmtDate(lots[0].date, 'EEEE d MMMM yyyy')}</p>
            <a href={lots[0].reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
              {lots[0].reportTitle}<ExternalLink className="size-3" />
            </a>
          </div>
          <ul className="divide-y divide-stone-100">
            {lots.map((m) => {
              const diff = vsMarket(m)
              return (
                <li key={m.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">{m.section}</span>
                      {m.breed || m.breedCode ? <Badge tone="gray">{m.breed ? titleCase(m.breed) : m.breedCode}</Badge> : null}
                      {m.top && <Badge tone="amber"><Trophy className="size-3" />Top price</Badge>}
                      {m.headCount > 1 && <Badge tone="blue">{m.headCount} head</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-stone-500" title={m.raw}>{m.seller}{m.buyer ? ` · bought by ${m.buyer}` : ''}</p>
                    {m.animals.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        {m.animals.map((a) => <Link key={a.id} href={`/livestock/view?id=${a.id}`} className="rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-800 hover:bg-brand-100">{a.managementTag || a.tagNo}</Link>)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-6 tabular">
                    <Figure label="Weight" value={m.weightKg ? `${fmtNum(m.weightKg)} kg` : '—'} />
                    <Figure label="Price" value={fmtMoney(m.price, currency, { decimals: m.price < 1000 })} strong />
                    <Figure label="p/kg" value={m.pricePerKg ? `${fmtNum(m.pricePerKg, 1)}${m.ppkDerived ? '*' : ''}` : '—'} title={m.ppkDerived ? 'Worked out from price and weight' : undefined} />
                    <div className="w-28 text-right">
                      <p className="text-[11px] uppercase tracking-wide text-stone-400">vs market</p>
                      {diff == null ? <p className="text-sm text-stone-300">—</p> : (
                        <p className={cn('inline-flex items-center gap-0.5 text-sm font-semibold', diff >= 0 ? 'text-emerald-700' : 'text-clay-600')} title={`${m.marketLabel}: ${m.marketPpk}p/kg`}>
                          {diff >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{diff >= 0 ? '+' : ''}{fmtNum(diff, 1)}p
                        </p>
                      )}
                    </div>
                  </div>
                  {can('worker') && (
                    <div className="flex shrink-0 justify-end gap-2 lg:w-52">
                      {status === 'new' && <>
                        <Button size="sm" variant="secondary" onClick={() => dismiss.mutate(m.id)} aria-label={`Not ours: ${m.section} ${m.price}`}>Not ours</Button>
                        <Button size="sm" onClick={() => onImport(m)} aria-label={`Import ${m.section} £${m.price}`}>Import…</Button>
                      </>}
                      {status === 'imported' && (
                        <Button size="sm" variant="secondary" onClick={async () => {
                          if (await confirm({ title: 'Undo this import?', description: 'The animals go back into the herd and the sale is removed from your finances.', confirmLabel: 'Undo import' })) restore.mutate(m.id)
                        }}><Undo2 />Undo</Button>
                      )}
                      {status === 'dismissed' && <Button size="sm" variant="secondary" onClick={() => restore.mutate(m.id)}><RotateCcw />Review again</Button>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {data.some((m) => m.ppkDerived) && <p className="px-5 py-3 text-xs text-stone-400">* p/kg worked out from the price and weight in the report.</p>}
    </div>
  )
}

function Figure({ label, value, strong, title }: { label: string; value: React.ReactNode; strong?: boolean; title?: string }) {
  return (
    <div className="w-20 text-right" title={title}>
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className={cn('text-sm', strong ? 'font-semibold text-stone-900' : 'text-stone-700')}>{value}</p>
    </div>
  )
}

// ---------------- Import ----------------

function ImportSheet({ match: m, onClose }: { match: MartMatch; onClose: () => void }) {
  const { currency } = useSession()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery({ queryKey: ['mart', 'candidates', m.id], queryFn: () => getData<MartCandidate[]>(`/api/mart/matches/${m.id}/candidates`) })
  const [picked, setPicked] = useState<number[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const go = useSave((v: { ids: number[]; override: boolean }) => api.post(`/api/mart/matches/${m.id}/import`, { animalIds: v.ids, overrideWithdrawal: v.override }), {
    invalidate: ['mart', 'animals', 'finance', 'weights'], success: 'Sale imported', onSuccess: onClose, silentError: true,
  })

  const submit = async (override = false) => {
    setError(null)
    try {
      await go.mutateAsync({ ids: picked, override })
    } catch (e) {
      const err = e as ApiError
      if (err.status === 409 && err.details?.code === 'withdrawal') {
        if (await confirm({ title: 'Withdrawal period', description: `${err.message} Import anyway?`, confirmLabel: 'Import anyway', danger: true })) submit(true)
      } else setError(err.message)
    }
  }

  const rows = (data || []).filter((c) => !q || `${c.tagNo} ${c.managementTag || ''} ${c.name || ''}`.toLowerCase().includes(q.toLowerCase()))
  const best = data?.[0]?.score ?? 0
  const showBest = best > 0 && (data || []).filter((c) => c.score === best).length <= 3
  const toggle = (id: number) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  return (
    <Sheet open onClose={onClose} wide title="Import mart sale" description="Choose which of your animals were in this lot. They’ll be marked as sold on the sale date."
      footer={<>
        <span className="mr-auto text-sm text-stone-500">{picked.length} of {m.headCount} selected</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => submit()} disabled={!picked.length} loading={go.isPending}>Import sale</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-stone-500">Sale</p><p className="font-medium text-stone-900">{fmtDate(m.date)}</p></div>
          <div><p className="text-xs text-stone-500">Class</p><p className="font-medium text-stone-900">{m.section}</p></div>
          <div><p className="text-xs text-stone-500">Weight · breed</p><p className="font-medium text-stone-900">{m.weightKg ? `${fmtNum(m.weightKg)} kg` : '—'} · {m.breed ? titleCase(m.breed) : m.breedCode || '—'}</p></div>
          <div><p className="text-xs text-stone-500">Price{m.headCount > 1 ? ' per head' : ''}</p><p className="font-medium text-stone-900">{fmtMoney(m.price, currency)}{m.pricePerKg ? <span className="font-normal text-stone-500"> · {fmtNum(m.pricePerKg, 1)}p/kg</span> : null}</p></div>
        </div>
        {picked.length > m.headCount && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The report lists {m.headCount} head for this lot — each animal you pick is recorded at {fmtMoney(m.price, currency)}.</p>}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by tag…" aria-label="Filter animals"
            className="h-9 w-full rounded-lg border-0 bg-stone-50 pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        {isLoading ? <p className="text-sm text-stone-500">Finding likely animals…</p> : !rows.length ? (
          <p className="text-sm text-stone-500">No animals in the herd fit this lot ({m.section.toLowerCase()}).</p>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl ring-1 ring-stone-200">
            {rows.map((c) => {
              const on = picked.includes(c.id)
              return (
                <li key={c.id}>
                  <label className={cn('flex cursor-pointer items-start gap-3 px-4 py-3 transition', on ? 'bg-brand-50/70' : 'hover:bg-stone-50')}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="mt-1 size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" aria-label={`Select ${c.managementTag || c.tagNo}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-900">{c.managementTag || c.tagNo}</span>
                        {c.managementTag && <span className="text-xs text-stone-500">{c.tagNo}</span>}
                        {showBest && c.score === best && <Badge tone="green">Best match</Badge>}
                        {c.status !== 'active' && <Badge tone="gray">Already {c.status}</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {[c.sex === 'male' ? (c.castrated ? 'Steer' : 'Male') : 'Female', c.breed, c.ageMonths != null ? fmtAge(c.ageMonths) : null, c.lastWeightKg ? `last weighed ${fmtNum(c.lastWeightKg)} kg` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <FormError error={error} />
      </div>
    </Sheet>
  )
}

// ---------------- Imported sale statements ----------------

function Statements({ rows }: { rows: SaleStatementItem[] }) {
  const { can, currency } = useSession()
  const confirm = useConfirm()
  const [open, setOpen] = useState<number | null>(null)
  const undo = useSave((id: number) => api.post<{ data: { reinstated: number } }>(`/api/sale-statements/${id}/undo`), {
    invalidate: ['sale-statements', 'mart', 'animals', 'finance', 'weights', 'value'], success: (r) => `${r.data.reinstated} back in the herd`,
  })
  if (!rows.length) return <EmptyState icon={Gavel} title="No statements imported" description="Drop the mart’s PDF above to import a sale." />
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((st) => {
        const charges = (st.commission ?? 0) + (st.insurance ?? 0) + (st.vat ?? 0) + (st.otherCharges ?? 0)
        return (
          <li key={st.id} className={cn('px-5 py-4', st.status !== 'imported' && 'opacity-60')}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{fmtDate(st.date, 'EEEE d MMMM yyyy')}</span>
                  {st.saleRef && <Badge tone="gray">{st.saleRef}</Badge>}
                  {st.title && <span className="text-sm text-stone-600">{titleCase(st.title.toLowerCase())}</span>}
                  {st.status !== 'imported' && <Badge tone="gray">Undone</Badge>}
                </div>
                <p className="mt-1 truncate text-xs text-stone-500">{st.fileName}</p>
              </div>
              <div className="flex items-center gap-6 tabular">
                <Figure label="Head" value={fmtNum(st.headCount)} />
                <Figure label="Gross" value={fmtMoney(st.gross, currency, { decimals: false })} strong />
                <Figure label="Charges" value={charges ? fmtMoney(charges, currency, { decimals: false }) : '—'} />
                <Figure label="Net" value={st.net != null ? fmtMoney(st.net, currency, { decimals: false }) : '—'} />
              </div>
              <div className="flex shrink-0 justify-end gap-2 lg:w-52">
                <Button size="sm" variant="secondary" onClick={() => setOpen(open === st.id ? null : st.id)}>{open === st.id ? 'Hide' : 'Animals'}</Button>
                {st.status === 'imported' && can('worker') && (
                  <Button size="sm" variant="secondary" onClick={async () => {
                    if (await confirm({ title: 'Undo this sale?', description: `All ${st.headCount} animals go back into the herd, and the sale income, sale weights and mart charges are removed.`, confirmLabel: 'Undo sale', danger: true })) undo.mutate(st.id)
                  }}><Undo2 />Undo</Button>
                )}
              </div>
            </div>
            {open === st.id && (
              <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-stone-200 scrollbar-thin">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
                    <tr><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Tag</th><th className="px-3 py-2 text-right">Weight</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Buyer</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {st.lots.map((l) => (
                      <tr key={l.animalId}>
                        <td className="px-3 py-1.5 tabular">{l.lot}</td>
                        <td className="px-3 py-1.5"><Link href={`/livestock/view?id=${l.animalId}`} className="font-medium text-brand-700 hover:underline">{l.tag}</Link>{l.created && <span className="ml-1.5 text-xs text-amber-700">added</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular">{l.weightKg ? `${fmtNum(l.weightKg)} kg` : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular">{fmtMoney(l.price, currency)}</td>
                        <td className="px-3 py-1.5 text-stone-600">{l.buyer ? titleCase(l.buyer.toLowerCase()) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------- Market prices ----------------

const SERIES: Record<string, { label: string; color: string }[]> = {
  cattle: [{ label: 'steers', color: '#275040' }, { label: 'heifers', color: '#c8923a' }, { label: 'otm', color: '#c65a3f' }, { label: 'calves', color: '#0ea5e9' }],
  sheep: [{ label: 'lambs', color: '#275040' }, { label: 'hoggs', color: '#c8923a' }, { label: 'ewes', color: '#c65a3f' }],
}
const SERIES_NAMES: Record<string, string> = { steers: 'Steers', heifers: 'Heifers', otm: 'OTM cattle', calves: 'Calves', lambs: 'Lambs', hoggs: 'Hoggs', ewes: 'Ewes' }

function Prices() {
  const { can } = useSession()
  const [mine, setMine] = useState(false)
  const [species, setSpecies] = useState<'cattle' | 'sheep'>('cattle')
  const { data, isLoading } = useQuery({
    queryKey: ['mart', 'prices', species],
    queryFn: () => getData<{ market: { month: string; category: string; ppk: number; n: number }[]; mine: { month: string; category: string; ppk: number; n: number; total: number }[] }>(`/api/mart/prices?species=${species}`),
  })
  const chart = useMemo(() => {
    const months = new Map<string, Record<string, number | string>>()
    for (const r of data?.market || []) {
      const row = months.get(r.month) || { month: r.month }
      row[r.category] = r.ppk
      months.set(r.month, row)
    }
    for (const r of data?.mine || []) {
      const row = months.get(r.month) || { month: r.month }
      row.mine = r.ppk
      months.set(r.month, row)
    }
    return [...months.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)))
  }, [data])

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-stone-900">Orkney Mart prices, p/kg</h3>
          <p className="text-[13px] text-stone-500">Monthly average of every lot sold by weight{data?.mine.length ? ', with your own sales as dots' : ''}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('manager') && <Button size="sm" variant="secondary" onClick={() => setMine(true)}><Settings2 />Your prices per month</Button>}
          <Segmented size="sm" value={species} onChange={setSpecies} options={[{ value: 'cattle', label: 'Cattle' }, { value: 'sheep', label: 'Sheep' }]} />
        </div>
        {mine && <MonthlyPricesSheet onClose={() => setMine(false)} />}
      </div>
      {isLoading ? <div className="h-80 animate-pulse rounded-xl bg-stone-100" /> : chart.length < 2 ? (
        <EmptyState icon={Gavel} title="Not enough sales yet" description="Prices appear once a few reports have been read." />
      ) : (
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#f0eeec" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => fmtDate(`${m}-01`, 'MMM yy')} tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => fmtDate(`${m}-01`, 'MMMM yyyy')} formatter={(v, k) => [`${fmtNum(Number(v), 1)}p/kg`, k === 'mine' ? 'Your sales' : SERIES_NAMES[String(k)] || String(k)]} />
              <Legend formatter={(k: string) => k === 'mine' ? 'Your sales' : SERIES_NAMES[k] || k} wrapperStyle={{ fontSize: 12 }} />
              {SERIES[species].map((s) => <Line key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls />)}
              <Scatter dataKey="mine" fill="#111827" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-400">Source: <a className="underline" href="https://orkneymart.com/" target="_blank" rel="noreferrer">Orkney Auction Mart</a> sales reports.</p>
    </div>
  )
}
