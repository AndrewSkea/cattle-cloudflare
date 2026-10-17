'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { useAnimals, useBirths } from '@/lib/queries'
import { SPECIES, speciesInfo } from '@/lib/constants'
import { fmtDate, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { getData } from '@/lib/api'
import type { AnimalListItem, BirthRecord } from '@/lib/types'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { HerdValueCard } from '@/components/animal-value'

const PALETTE = ['#275040', '#3f7d5c', '#5f9a79', '#8fbba1', '#c8923a', '#dfb96f', '#c65a3f', '#78716c', '#0ea5e9', '#a78bfa']
const tooltipStyle = { borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 text-xs text-stone-600">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</li>)}
    </ul>
  )
}

export default function ReportsPage() {
  const { farm, currency, can, shows } = useSession()
  const { data: animals, isLoading } = useAnimals('all')
  const { data: births } = useBirths()
  const present = useMemo(() => SPECIES.filter((s) => (animals || []).some((a) => a.species === s.value)), [animals])
  const [species, setSpecies] = useState<string>('')
  const sp = species || present[0]?.value || farm.species[0]

  const r = useMemo(() => {
    const list = (animals || []).filter((a) => a.species === sp)
    const active = list.filter((a) => a.status === 'active')
    const ids = new Set(list.map((a) => a.id))
    const b = (births || []).filter((x) => ids.has(x.damId))
    const today = todayISO()

    // Head count at each month end, derived from birth/purchase and exit dates.
    const start = list.reduce((m, a) => { const d = a.origin === 'purchased' ? a.purchaseDate || a.dob : a.dob; return d && d < m ? d : m }, today)
    const months: { month: string; head: number }[] = []
    const cur = new Date(Math.max(new Date(start).getTime(), new Date(Number(today.slice(0, 4)) - 4, 0, 1).getTime()))
    cur.setDate(1)
    while (cur.toISOString().slice(0, 7) <= today.slice(0, 7)) {
      const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).toISOString().slice(0, 10)
      const head = list.filter((a) => {
        const arrived = a.origin === 'purchased' ? a.purchaseDate || a.dob : a.dob
        return arrived && arrived <= end && (!a.exitDate || a.exitDate > end)
      }).length
      months.push({ month: end.slice(0, 7), head })
      cur.setMonth(cur.getMonth() + 1)
    }

    const ageBands = [
      { band: '< 1 yr', min: 0, max: 12 }, { band: '1–2', min: 12, max: 24 }, { band: '2–3', min: 24, max: 36 }, { band: '3–5', min: 36, max: 60 },
      { band: '5–8', min: 60, max: 96 }, { band: '8–12', min: 96, max: 144 }, { band: '12+', min: 144, max: 9999 },
    ].map((x) => ({
      band: x.band,
      female: active.filter((a) => a.sex === 'female' && a.ageMonths != null && a.ageMonths >= x.min && a.ageMonths < x.max).length,
      male: active.filter((a) => a.sex === 'male' && a.ageMonths != null && a.ageMonths >= x.min && a.ageMonths < x.max).length,
    }))

    const breedMap = new Map<string, number>()
    for (const a of active) breedMap.set(a.breed || 'Unknown', (breedMap.get(a.breed || 'Unknown') || 0) + 1)
    const breeds = [...breedMap.entries()].sort((x, y) => y[1] - x[1]).map(([name, value]) => ({ name, value }))

    const years = [...new Set([...b.map((x) => x.date.slice(0, 4)), ...list.filter((a) => a.exitDate).map((a) => a.exitDate!.slice(0, 4))])].sort().slice(-6)
    const yearly = years.map((y) => {
      const yb = b.filter((x) => x.date.startsWith(y))
      const exits = list.filter((a) => a.exitDate?.startsWith(y))
      const sold = exits.filter((a) => (a.status === 'sold' || a.status === 'culled') && a.salePrice)
      return {
        year: y, born: yb.filter((x) => x.outcome === 'alive').length, lost: yb.filter((x) => x.outcome !== 'alive').length,
        sold: exits.filter((a) => a.status === 'sold' || a.status === 'culled').length, died: exits.filter((a) => a.status === 'died').length,
        avgPrice: sold.length ? sold.reduce((s, a) => s + a.salePrice!, 0) / sold.length : null,
      }
    })

    // Birth intervals per dam
    const byDam = new Map<number, string[]>()
    for (const x of b) { if (!byDam.has(x.damId)) byDam.set(x.damId, []); byDam.get(x.damId)!.push(x.date) }
    const intervals: number[] = []
    for (const dates of byDam.values()) {
      dates.sort()
      for (let i = 1; i < dates.length; i++) { const d = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000; if (d > 200) intervals.push(d) }
    }
    const intervalBands = [[0, 365, '< 365'], [365, 395, '365–395'], [395, 425, '395–425'], [425, 485, '425–485'], [485, 99999, '485+']].map(([lo, hi, label]) => ({
      label: label as string, count: intervals.filter((d) => d >= (lo as number) && d < (hi as number)).length,
    }))
    const breedingFemales = active.filter((a) => a.sex === 'female' && (a.ageMonths ?? 0) >= 15).length
    const thisYear = today.slice(0, 4)
    const bornThisYear = b.filter((x) => x.date.startsWith(thisYear) && x.outcome === 'alive').length
    const lastYear = String(Number(thisYear) - 1)
    const bornLastYear = b.filter((x) => x.date.startsWith(lastYear) && x.outcome === 'alive').length
    const weighed = active.filter((a) => a.latestWeightKg)
    return {
      active, months, ageBands, breeds, yearly, intervalBands, breedingFemales, bornThisYear, bornLastYear,
      avgInterval: intervals.length ? intervals.reduce((s, x) => s + x, 0) / intervals.length : null,
      avgWeight: weighed.length ? weighed.reduce((s, a) => s + a.latestWeightKg!, 0) / weighed.length : null,
      lossRate: b.length ? (b.filter((x) => x.outcome !== 'alive').length / b.length) * 100 : null,
    }
  }, [animals, births, sp])

  if (isLoading || !animals) return <PageSkeleton />
  if (!animals.length) return <><PageHeader title="Reports" /><Card><EmptyState icon={BarChart3} title="No animals yet" description="Reports fill in as you record your herd." /></Card></>

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="How the herd is changing over time."
        actions={present.length > 1 && <Segmented value={sp} onChange={setSpecies} options={present.map((s) => ({ value: s.value, label: `${s.emoji} ${s.plural}` }))} />} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={`${speciesInfo(sp).plural} on farm`} value={r.active.length} sub={`${r.breedingFemales} breeding-age females`} />
        <StatCard label={`Born alive ${todayISO().slice(0, 4)}`} value={r.bornThisYear} tone="wheat" sub={`${r.bornLastYear} last year`} />
        <StatCard label="Average birth interval" value={r.avgInterval ? `${fmtNum(r.avgInterval)} d` : '—'} tone="sky" sub={r.lossRate != null ? `${fmtNum(r.lossRate, 1)}% losses at birth` : undefined} />
        <StatCard label="Average latest weight" value={r.avgWeight ? `${fmtNum(r.avgWeight)} kg` : '—'} tone="stone" sub={r.avgWeight ? `${r.active.filter((a) => a.latestWeightKg).length} weighed` : 'No weights yet'} />
      </div>

      <Card>
        <CardHeader title="Head count" description="Animals on farm at the end of each month" />
        <div className="h-64 px-2 pb-4 pt-4">
          <ResponsiveContainer>
            <AreaChart data={r.months} margin={{ left: -8, right: 16 }}>
              <defs><linearGradient id="hc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3f7d5c" stopOpacity={0.35} /><stop offset="100%" stopColor="#3f7d5c" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => m.slice(2).replace('-', '/')} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area dataKey="head" name="Head" type="monotone" stroke="#275040" strokeWidth={2} fill="url(#hc)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Age profile" description="Animals on farm by age and sex" />
          <div className="h-64 px-2 pb-4 pt-4">
            <ResponsiveContainer>
              <BarChart data={r.ageBands} margin={{ left: -16, right: 16 }}>
                <CartesianGrid stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#fafaf9' }} />
                <Bar dataKey="female" name="Female" stackId="a" fill="#8b5cf6" fillOpacity={0.75} />
                <Bar dataKey="male" name="Male" stackId="a" fill="#0ea5e9" fillOpacity={0.75} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'Female', color: '#a78bfa' }, { label: 'Male', color: '#38bdf8' }]} />
        </Card>
        <Card>
          <CardHeader title="Breeds" description="Animals on farm" />
          <div className="flex items-center gap-4 p-5">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={r.breeds} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
                    {r.breeds.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5">
              {r.breeds.slice(0, 8).map((b, i) => (
                <li key={b.name} className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="flex-1 truncate text-stone-700">{b.name}</span><span className="text-stone-500 tabular">{b.value}</span></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Births, sales and deaths by year" />
          {r.yearly.length === 0 ? <p className="px-5 pb-6 pt-3 text-sm text-stone-500">No births recorded.</p> : (
            <div className="h-64 px-2 pb-4 pt-4">
              <ResponsiveContainer>
                <BarChart data={r.yearly} margin={{ left: -16, right: 16 }}>
                  <CartesianGrid stroke="#f5f5f4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#fafaf9' }} />
                  <Bar dataKey="born" name="Born alive" fill="#3f7d5c" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="lost" name="Lost at birth" fill="#d6755b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="sold" name="Sold" fill="#c8923a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="died" name="Died" fill="#78716c" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {r.yearly.length > 0 && <Legend items={[{ label: 'Born alive', color: '#3f7d5c' }, { label: 'Lost at birth', color: '#d6755b' }, { label: 'Sold', color: '#c8923a' }, { label: 'Died', color: '#78716c' }]} />}
        </Card>
        <Card>
          <CardHeader title="Birth intervals" description="Days between births for the same mother" />
          <div className="h-64 px-2 pb-4 pt-4">
            <ResponsiveContainer>
              <BarChart data={r.intervalBands} margin={{ left: -16, right: 16 }}>
                <CartesianGrid stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#fafaf9' }} />
                <Bar dataKey="count" name="Intervals" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {r.intervalBands.map((_, i) => <Cell key={i} fill={i <= 1 ? '#3f7d5c' : i === 2 ? '#c8923a' : '#d6755b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'A calf a year (under 395 days)', color: '#3f7d5c' }, { label: 'Slipping', color: '#c8923a' }, { label: 'Late (over 425 days)', color: '#d6755b' }]} />
        </Card>
      </div>

      {sp === 'cattle' && <OffspringPerformance animals={animals} births={births || []} currency={currency} showMoney={can('manager')} />}

      {sp === 'cattle' && shows('mart') && <MartInsights currency={currency} />}

      {sp === 'cattle' && can('manager') && <HerdValueCard />}

      {can('manager') && r.yearly.some((y) => y.avgPrice) && (
        <Card>
          <CardHeader title="Average sale price by year" />
          <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-stone-100 sm:grid-cols-3', ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6'][r.yearly.length])}>
            {r.yearly.map((y) => (
              <div key={y.year} className="bg-white p-4"><p className="text-xs text-stone-500">{y.year}</p><p className="mt-1 font-display text-xl font-semibold text-stone-900">{y.avgPrice ? fmtMoney(y.avgPrice, currency, { decimals: false }) : '—'}</p><p className="text-xs text-stone-400">{y.sold} sold</p></div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

interface Group { key: string; calves: number; onFarm: number; sold: number; steers: number; heifers: number; price: number[]; weight: number[]; ppk: number[]; ageAtSale: number[]; gain: number[]; born: number; lost: number; assisted: number; easeKnown: number }

/** How each sire's (or breed's) calves did: sale price, weight, p/kg, age at sale and daily gain, plus calving. */
function OffspringPerformance({ animals, births, currency, showMoney }: { animals: AnimalListItem[]; births: BirthRecord[]; currency: string; showMoney: boolean }) {
  const [by, setBy] = useState<'sire' | 'breed'>('sire')
  const groups = useMemo(() => {
    const birthOf = new Map(births.filter((b) => b.offspringId).map((b) => [b.offspringId!, b]))
    const m = new Map<string, Group>()
    const g = (key: string) => {
      if (!m.has(key)) m.set(key, { key, calves: 0, onFarm: 0, sold: 0, steers: 0, heifers: 0, price: [], weight: [], ppk: [], ageAtSale: [], gain: [], born: 0, lost: 0, assisted: 0, easeKnown: 0 })
      return m.get(key)!
    }
    const keyOf = (a: AnimalListItem | undefined, b?: BirthRecord) => by === 'sire'
      ? a?.sireTag || a?.sireName || b?.sireTag || b?.sireName || 'Sire not recorded'
      : a?.breed || 'Breed not recorded'
    for (const a of animals) {
      if (a.species !== 'cattle' || (a.origin !== 'born' && !a.damId)) continue
      const x = g(keyOf(a, birthOf.get(a.id)))
      x.calves++
      if (a.status === 'active') x.onFarm++
      if ((a.status === 'sold' || a.status === 'culled') && a.salePrice && (a.ageMonths ?? 99) < 36) {
        x.sold++
        if (a.sex === 'female') x.heifers++; else x.steers++
        x.price.push(a.salePrice)
        if (a.saleWeightKg) {
          x.weight.push(a.saleWeightKg)
          x.ppk.push((a.salePrice / a.saleWeightKg) * 100)
          if (a.dob && a.exitDate) {
            const d = (new Date(a.exitDate).getTime() - new Date(a.dob).getTime()) / 86400000
            if (d > 60) { x.gain.push((a.saleWeightKg - 42) / d); x.ageAtSale.push(d / 30.44) }
          }
        }
      }
    }
    // Calving figures come from the birth records (they include calves that died)
    const animalById = new Map(animals.map((a) => [a.id, a]))
    for (const b of births) {
      const x = g(keyOf(b.offspringId ? animalById.get(b.offspringId) : undefined, b))
      x.born++
      if (b.outcome !== 'alive') x.lost++
      if (b.ease) { x.easeKnown++; if (b.ease !== 'unassisted') x.assisted++ }
    }
    return [...m.values()].filter((x) => x.calves || x.born)
      .sort((a, b) => (b.sold ? 1 : 0) - (a.sold ? 1 : 0) || avg(b.price) - avg(a.price) || b.calves - a.calves)
  }, [animals, births, by])
  const unknown = groups.find((x) => x.key.endsWith('not recorded'))
  return (
    <Card>
      <CardHeader title={by === 'sire' ? 'Which bull pays best' : 'Results by breed'}
        description="Calves born on the farm, and how those sold as stores (under 3 years) did at sale."
        action={<Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'sire', label: 'By sire' }, { value: 'breed', label: 'By breed' }]} />} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">{by === 'sire' ? 'Sire' : 'Breed'}</th>
              <th className="px-3 py-2.5 text-right font-medium">Calves</th>
              <th className="px-3 py-2.5 text-right font-medium">Sold</th>
              {showMoney && <th className="px-3 py-2.5 text-right font-medium">Avg price</th>}
              <th className="px-3 py-2.5 text-right font-medium">Avg weight</th>
              {showMoney && <th className="px-3 py-2.5 text-right font-medium">p/kg</th>}
              <th className="px-3 py-2.5 text-right font-medium">Age sold</th>
              <th className="px-3 py-2.5 text-right font-medium">Daily gain</th>
              <th className="px-3 py-2.5 text-right font-medium">Lost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {groups.map((x) => (
              <tr key={x.key} className={cn(x.key.endsWith('not recorded') && 'text-stone-500')}>
                <td className="max-w-[16rem] truncate px-5 py-2.5 font-medium text-stone-900">{x.key}</td>
                <td className="px-3 py-2.5 text-right tabular">{x.calves || x.born}<span className="text-xs text-stone-400">{x.onFarm ? ` · ${x.onFarm} here` : ''}</span></td>
                <td className="px-3 py-2.5 text-right tabular">{x.sold ? <>{x.sold}<span className="text-xs text-stone-400"> ({x.steers}♂ {x.heifers}♀)</span></> : '—'}</td>
                {showMoney && <td className="px-3 py-2.5 text-right font-medium tabular">{x.price.length ? fmtMoney(avg(x.price), currency, { decimals: false }) : '—'}</td>}
                <td className="px-3 py-2.5 text-right tabular">{x.weight.length ? `${fmtNum(avg(x.weight))} kg` : '—'}</td>
                {showMoney && <td className="px-3 py-2.5 text-right tabular">{x.ppk.length ? fmtNum(avg(x.ppk), 1) : '—'}</td>}
                <td className="px-3 py-2.5 text-right tabular">{x.ageAtSale.length ? `${fmtNum(avg(x.ageAtSale))} mo` : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular">{x.gain.length ? `${fmtNum(avg(x.gain), 2)} kg` : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular">{x.born ? `${fmtNum((x.lost / x.born) * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 pb-4 pt-3 text-xs text-stone-400">
        Daily gain is sale weight less a 42 kg birth weight, over age at sale.
        {by === 'sire' && unknown?.sold ? ` ${unknown.sold} sold calves have no sire recorded: add the sire on their birth or animal record to include them, or compare by breed.` : ''}
      </p>
    </Card>
  )
}

const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CATEGORY_NAMES: Record<string, string> = { steers: 'Steers', heifers: 'Heifers', calves: 'Calves', otm: 'Cull cows' }

interface Insights {
  valuation: null | { since: string; total: number; head: number; weighed: number; classes: { class: string; label: string; count: number; weighed: number; avgWeightKg: number | null; basis: string | null; value: number; avgValue: number | null; priced: number }[] }
  seasons: { categories: { category: string; months: { month: number; index: number | null; lots: number }[] }[] }
}

/** What the herd is worth at recent Orkney Mart prices, and the months that have paid best. */
function MartInsights({ currency }: { currency: string }) {
  const { data } = useQuery({ queryKey: ['mart', 'insights'], queryFn: () => getData<Insights>('/api/mart/insights'), staleTime: 10 * 60_000 })
  if (!data) return null
  const v = data.valuation
  const cell = (i: number | null) => i == null ? 'bg-stone-50 text-stone-300'
    : i >= 105 ? 'bg-emerald-600 text-white' : i >= 102 ? 'bg-emerald-200 text-emerald-900' : i > 98 ? 'bg-stone-100 text-stone-600'
      : i > 95 ? 'bg-clay-100 text-clay-800' : 'bg-clay-500 text-white'
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {v && (
        <Card>
          <CardHeader title="What the herd is worth" description={`At Orkney Mart prices since ${fmtDate(v.since)}`} />
          <div className="px-5 pt-3">
            <p className="font-display text-[32px] font-semibold leading-none tracking-tight text-stone-900 tabular">{fmtMoney(v.total, currency, { decimals: false })}</p>
            <p className="mt-1 text-xs text-stone-500">{v.head} cattle · {v.weighed ? `${v.weighed} weighed, the rest estimated from age` : 'weights estimated from age'}</p>
          </div>
          <table className="mt-4 w-full text-sm">
            <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500">
              <tr><th className="px-5 py-2 font-medium">Class</th><th className="px-3 py-2 text-right font-medium">Head</th><th className="px-3 py-2 text-right font-medium">Weight</th><th className="px-3 py-2 font-medium">Price</th><th className="px-5 py-2 text-right font-medium">Value</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {v.classes.map((c) => (
                <tr key={c.class}>
                  <td className="px-5 py-2 font-medium text-stone-900">{c.label}</td>
                  <td className="px-3 py-2 text-right tabular">{c.count}</td>
                  <td className="px-3 py-2 text-right tabular">{c.avgWeightKg ? `~${fmtNum(c.avgWeightKg)} kg` : '—'}</td>
                  <td className="px-3 py-2 text-stone-600">{c.basis || 'no recent prices'}</td>
                  <td className="px-5 py-2 text-right font-medium tabular">{c.priced ? fmtMoney(c.value, currency, { decimals: false }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 pb-4 pt-3 text-xs text-stone-400">A guide, not a valuation: stores at the average p/kg for their class, cows at cull-cow prices. Record weights for a closer figure.</p>
        </Card>
      )}
      {data.seasons.categories.length > 0 && (
        <Card className={cn(!v && 'lg:col-span-2')}>
          <CardHeader title="Best months to sell" description="Each month’s p/kg against that year’s average at Orkney Mart, over the years on record" />
          <div className="overflow-x-auto px-5 pb-2 pt-4">
            <table className="w-full table-fixed border-separate border-spacing-[3px] text-[11px]">
              <colgroup><col className="w-24 sm:w-28" />{MONTHS.map((_, i) => <col key={i} />)}</colgroup>
              <thead><tr><th />{MONTHS.map((m, i) => <th key={i} className="font-medium text-stone-400" title={MONTH_NAMES[i]}>{m}</th>)}</tr></thead>
              <tbody>
                {data.seasons.categories.map((c) => (
                  <tr key={c.category}>
                    <th className="truncate pr-1 text-left font-medium text-stone-700">{CATEGORY_NAMES[c.category] || c.category}</th>
                    {c.months.map((m) => (
                      <td key={m.month} title={m.index != null ? `${MONTH_NAMES[m.month - 1]}: ${fmtNum(m.index - 100, 1)}% vs the year’s average (${m.lots} lots)` : `${MONTH_NAMES[m.month - 1]}: no sales`}
                        className={cn('h-8 rounded px-0 text-center font-medium tabular', cell(m.index))}>
                        {m.index != null ? `${m.index >= 100 ? '+' : ''}${Math.round(m.index - 100)}` : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 pt-2 text-xs text-stone-500">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-600" />5%+ above average</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-200" />2–5% above</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-clay-100" />2–5% below</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-clay-500" />5%+ below</span>
          </div>
        </Card>
      )}
    </div>
  )
}
