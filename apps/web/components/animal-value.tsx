'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { PoundSterling, Settings2, TrendingUp, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { Sheet } from '@/components/ui/overlay'
import { getData } from '@/lib/api'
import { api, useSave } from '@/lib/queries'
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type PriceSource = 'yours' | 'mart' | 'yours_carried' | 'mart_nearest'
interface ValuePoint { month: string; date: string; ageMonths: number; weightKg: number; estimated: boolean; ppk: number | null; priceSource: PriceSource | null; value: number | null; sold?: boolean }
interface AnimalValue {
  dob: string; estimatedDob: boolean; end: string; series: ValuePoint[]; weighings: { date: string; weightKg: number }[]
  currentValue: number | null; currentWeightKg: number | null; perMonth: number | null; dailyGainKg: number | null; estimated: boolean
}

const SOURCE: Record<PriceSource, string> = {
  yours: 'your price', yours_carried: 'your last price', mart: 'Orkney Mart average', mart_nearest: 'Orkney Mart, nearest month',
}
const tooltipStyle = { borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }

/** Weight from 0 kg at birth and value each month (weight × that month's price per kg) for one animal. */
export function AnimalValueCard({ animalId, sold }: { animalId: number; sold: boolean }) {
  const { currency } = useSession()
  const [prices, setPrices] = useState(false)
  const [table, setTable] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['value', 'animal', animalId], queryFn: () => getData<AnimalValue | null>(`/api/value/animal/${animalId}`) })

  const chart = useMemo(() => (data?.series || []).map((p, i, all) => {
    const nextEst = all[i + 1]?.estimated
    return {
      ...p,
      weighed: !p.estimated ? p.weightKg : null,
      // Draw the estimated stretch dashed, joined to the last real point.
      est: p.estimated || (nextEst && !p.estimated) ? p.weightKg : null,
      scale: data!.weighings.find((w) => w.date.slice(0, 7) === p.month)?.weightKg ?? null,
    }
  }), [data])

  return (
    <Card>
      <CardHeader title="Growth & value" icon={TrendingUp}
        description="From 0 kg at birth, valued at each month’s price per kg"
        action={<Button size="sm" variant="secondary" onClick={() => setPrices(true)} aria-label="Prices per month"><Settings2 />Prices</Button>} />
      {isLoading ? <div className="mx-5 mb-5 h-64 animate-pulse rounded-xl bg-stone-100" /> : !data ? (
        <EmptyState icon={TrendingUp} title="No date of birth" description="Add a date of birth to track this animal’s growth and value." />
      ) : (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={sold ? 'Sold for' : 'Value now'} value={data.currentValue != null ? fmtMoney(data.currentValue, currency, { decimals: false }) : '—'} sub={data.estimated ? 'estimated weight' : undefined} />
            <Stat label={sold ? 'Sale weight' : 'Weight now'} value={data.currentWeightKg != null ? `${fmtNum(data.currentWeightKg)} kg` : '—'} sub={data.estimated ? 'estimated' : data.weighings.length ? `${data.weighings.length} weighing${data.weighings.length === 1 ? '' : 's'}` : undefined} />
            <Stat label="Per month of life" value={data.perMonth != null ? fmtMoney(data.perMonth, currency, { decimals: false }) : '—'} sub={`${fmtNum(data.series.length)} months`} />
            <Stat label="Daily gain" value={data.dailyGainKg != null ? `${fmtNum(data.dailyGainKg, 2)} kg` : '—'} sub="since birth" />
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8923a" stopOpacity={0.35} /><stop offset="100%" stopColor="#c8923a" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#f0eeec" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m) => fmtDate(`${m}-01`, 'MMM yy')} tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="kg" tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}kg`} width={56} />
                <YAxis yAxisId="gbp" orientation="right" tick={{ fontSize: 11, fill: '#a16207' }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => fmtDate(`${m}-01`, 'MMMM yyyy')}
                  formatter={(v, k, item) => {
                    const p = (item as { payload: ValuePoint }).payload
                    if (k === 'value') return [`${fmtMoney(Number(v), currency, { decimals: false })}${p.sold ? ' (sale price)' : p.ppk ? ` at ${fmtNum(p.ppk, 1)}p/kg, ${SOURCE[p.priceSource!]}` : ''}`, 'Value']
                    if (k === 'scale') return [`${fmtNum(Number(v))} kg`, 'Weighed']
                    return [`${fmtNum(Number(v))} kg`, k === 'est' ? 'Weight (estimated)' : 'Weight']
                  }} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(k: string) => ({ value: 'Value (£)', weighed: 'Weight', est: 'Weight, estimated', scale: 'Weighed' }[k] || k)} />
                <Area yAxisId="gbp" type="monotone" dataKey="value" stroke="#c8923a" strokeWidth={2} fill="url(#valueFill)" connectNulls />
                <Line yAxisId="kg" type="linear" dataKey="weighed" stroke="#275040" strokeWidth={2} dot={false} connectNulls={false} />
                <Line yAxisId="kg" type="linear" dataKey="est" stroke="#275040" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
                <Scatter yAxisId="kg" dataKey="scale" fill="#275040" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {data.estimatedDob && <p className="mt-2 text-xs text-amber-700">Only the year of birth is known, so growth starts on 1 January.</p>}
          {!data.weighings.length && <p className="mt-2 text-xs text-stone-500">Not weighed yet — the weight is estimated from typical daily gains. Add a weight to make it exact.</p>}
          <button type="button" onClick={() => setTable(!table)} className="mt-3 text-sm font-medium text-brand-700 hover:underline">{table ? 'Hide' : 'Show'} month by month</button>
          {table && (
            <div className="mt-2 max-h-80 overflow-auto rounded-xl ring-1 ring-stone-200 scrollbar-thin">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="sticky top-0 bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">Age</th><th className="px-3 py-2 text-right">Weight</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Value</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100 tabular">
                  {[...data.series].reverse().map((p) => (
                    <tr key={p.month}>
                      <td className="px-3 py-1.5">{fmtDate(`${p.month}-01`, 'MMM yyyy')}</td>
                      <td className="px-3 py-1.5 text-right">{p.ageMonths} mo</td>
                      <td className={cn('px-3 py-1.5 text-right', p.estimated && 'italic text-stone-500')}>{fmtNum(p.weightKg)} kg{p.estimated ? '*' : ''}</td>
                      <td className="px-3 py-1.5 text-right" title={p.priceSource ? SOURCE[p.priceSource] : undefined}>{p.sold ? 'sold' : p.ppk ? <>{fmtNum(p.ppk, 1)}p{p.priceSource === 'yours' ? <span className="ml-1 text-[10px] font-semibold text-brand-700">YOURS</span> : null}</> : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{p.value != null ? fmtMoney(p.value, currency, { decimals: false }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {prices && <MonthlyPricesSheet onClose={() => setPrices(false)} />}
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular text-stone-900">{value}</p>
      {sub && <p className="text-[11px] text-stone-500">{sub}</p>}
    </div>
  )
}

// ---------------- Prices per month ----------------

interface PriceMonth { month: string; ppk: number | null; mart: Record<string, number | null>; used: { ppk: number; source: PriceSource } | null }
const MART_LABEL: Record<string, string> = { calves: 'Calves', steers: 'Steers', heifers: 'Heifers', otm: 'OTM', lambs: 'Lambs', hoggs: 'Hoggs', ewes: 'Ewes' }

/** The farm's own price per kg for each month. Empty months use the Orkney Mart average for the animal's class. */
export function MonthlyPricesSheet({ onClose }: { onClose: () => void }) {
  const [species, setSpecies] = useState<'cattle' | 'sheep'>('cattle')
  const { data, isLoading } = useQuery({ queryKey: ['value', 'prices', species], queryFn: () => getData<{ months: PriceMonth[] }>(`/api/value/prices?species=${species}`) })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const save = useSave(() => api.put('/api/value/prices', {
    species, prices: Object.entries(edits).map(([month, v]) => ({ month, ppk: v.trim() === '' ? null : Number(v) })).filter((p) => p.ppk === null || p.ppk > 0),
  }), { invalidate: ['value'], success: 'Prices saved', onSuccess: onClose })
  const months = data?.months || []
  const cats = Object.keys(months[0]?.mart || {})
  const valueOf = (m: PriceMonth) => edits[m.month] ?? (m.ppk != null ? String(m.ppk) : '')
  const fill = () => {
    const next = { ...edits }
    for (const m of months) {
      if (valueOf(m) !== '') continue
      const ref = m.mart[species === 'sheep' ? 'lambs' : 'steers'] ?? Object.values(m.mart).find((x) => x != null)
      if (ref != null) next[m.month] = String(ref)
    }
    setEdits(next)
  }

  return (
    <Sheet open onClose={onClose} wide title="Prices per month"
      description="Your price in pence per kg liveweight for each month, used for every animal that month: value = weight × price. Leave a month empty to use the Orkney Mart average for each animal’s class (calves, steers, heifers or cull cows)."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate(undefined)} disabled={!Object.keys(edits).length} loading={save.isPending}>Save prices</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented size="sm" value={species} onChange={(v) => { setSpecies(v); setEdits({}) }} options={[{ value: 'cattle', label: 'Cattle' }, { value: 'sheep', label: 'Sheep' }]} />
          <Button size="sm" variant="ghost" onClick={fill}><Wand2 />Fill empty months from the mart</Button>
        </div>
        {isLoading ? <div className="h-64 animate-pulse rounded-xl bg-stone-100" /> : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200 scrollbar-thin">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2">Your price (p/kg)</th>
                  {cats.map((c) => <th key={c} className="px-2 py-2 text-right">{MART_LABEL[c] || c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular">
                {months.map((m) => (
                  <tr key={m.month} className={cn(edits[m.month] != null && 'bg-amber-50/60')}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-stone-800">{fmtDate(`${m.month}-01`, 'MMM yyyy')}</td>
                    <td className="px-3 py-1">
                      <input value={valueOf(m)} inputMode="decimal" aria-label={`Price for ${m.month}`}
                        placeholder={m.used ? `${fmtNum(m.used.ppk, 1)} (mart)` : '—'}
                        onChange={(e) => setEdits({ ...edits, [m.month]: e.target.value.replace(/[^\d.]/g, '') })}
                        className="h-8 w-28 rounded-md border-0 bg-white px-2 text-sm ring-1 ring-inset ring-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500" />
                    </td>
                    {cats.map((c) => <td key={c} className="px-2 py-1.5 text-right text-stone-500">{m.mart[c] != null ? fmtNum(m.mart[c]!, 1) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-stone-500">Mart columns are the Orkney Mart monthly averages (p/kg) for each class, from the sales reports.</p>
      </div>
    </Sheet>
  )
}

// ---------------- Herd ----------------

interface HerdValue {
  species: string
  series: { month: string; value: number; weightKg: number; head: number; estimated: number }[]
  animals: { id: number; tagNo: string; managementTag: string | null; name: string | null; sex: string; castrated: boolean; status: string; dob: string; exitDate: string | null; weightKg: number | null; value: number | null; perMonth: number | null; dailyGainKg: number | null; estimated: boolean; weighed: number }[]
  noDob: number
}

/** Herd value month by month, and every animal's value per month of life. */
export function HerdValueCard() {
  const { currency } = useSession()
  const [prices, setPrices] = useState(false)
  const [show, setShow] = useState<'active' | 'sold'>('active')
  const [all, setAll] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['value', 'herd'], queryFn: () => getData<HerdValue>('/api/value/herd?months=36') })
  const list = (data?.animals || []).filter((a) => (show === 'active' ? a.status === 'active' : a.status === 'sold'))
  return (
    <Card>
      <CardHeader title="Value over time" icon={PoundSterling}
        description="Every animal from 0 kg at birth, valued each month at your price per kg (or the Orkney Mart average)"
        action={<Button size="sm" variant="secondary" onClick={() => setPrices(true)} aria-label="Prices per month"><Settings2 />Prices</Button>} />
      {isLoading || !data ? <div className="mx-5 mb-5 h-64 animate-pulse rounded-xl bg-stone-100" /> : !data.series.length ? (
        <EmptyState icon={PoundSterling} title="Nothing to value yet" description="Animals need a date of birth, and a price for the month (yours or the mart’s)." />
      ) : (
        <div className="px-5 pb-5">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data.series} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
                <defs>
                  <linearGradient id="herdFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#275040" stopOpacity={0.3} /><stop offset="100%" stopColor="#275040" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#f0eeec" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(m) => fmtDate(`${m}-01`, 'MMM yy')} tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="gbp" tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v, currency, { compact: true })} width={60} />
                <YAxis yAxisId="head" orientation="right" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => fmtDate(`${m}-01`, 'MMMM yyyy')}
                  formatter={(v, k) => (k === 'value' ? [fmtMoney(Number(v), currency, { decimals: false }), 'Herd value'] : [fmtNum(Number(v)), 'Head'])} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(k: string) => (k === 'value' ? 'Herd value' : 'Head')} />
                <Area yAxisId="gbp" type="monotone" dataKey="value" stroke="#275040" strokeWidth={2} fill="url(#herdFill)" />
                <Line yAxisId="head" type="stepAfter" dataKey="head" stroke="#a8a29e" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-800">Value per month of life</p>
            <Segmented size="sm" value={show} onChange={setShow} options={[{ value: 'active', label: 'On farm' }, { value: 'sold', label: 'Sold' }]} />
          </div>
          {!list.length ? <p className="mt-2 text-sm text-stone-500">None.</p> : (
            <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-stone-200 scrollbar-thin">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-2">Animal</th><th className="px-3 py-2">Born</th><th className="px-3 py-2 text-right">Weight</th><th className="px-3 py-2 text-right">{show === 'sold' ? 'Sold for' : 'Value'}</th><th className="px-3 py-2 text-right">Per month</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100 tabular">
                  {(all ? list : list.slice(0, 15)).map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-1.5"><Link href={`/livestock/view?id=${a.id}`} className="font-medium text-brand-700 hover:underline">{a.managementTag || a.tagNo}</Link></td>
                      <td className="px-3 py-1.5 text-stone-600">{fmtDate(a.dob, 'MMM yyyy')}</td>
                      <td className={cn('px-3 py-1.5 text-right', a.estimated && 'italic text-stone-500')}>{a.weightKg != null ? `${fmtNum(a.weightKg)} kg${a.estimated ? '*' : ''}` : '—'}</td>
                      <td className="px-3 py-1.5 text-right">{a.value != null ? fmtMoney(a.value, currency, { decimals: false }) : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{a.perMonth != null ? fmtMoney(a.perMonth, currency, { decimals: false }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <span>* estimated from typical daily gains (not weighed recently).{data.noDob ? ` ${data.noDob} animals without a date of birth aren’t included.` : ''}</span>
            {list.length > 15 && <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setAll(!all)}>{all ? 'Show top 15' : `Show all ${list.length}`}</button>}
          </div>
        </div>
      )}
      {prices && <MonthlyPricesSheet onClose={() => setPrices(false)} />}
    </Card>
  )
}
