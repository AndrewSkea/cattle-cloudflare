'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { useAnimals, useBirths } from '@/lib/queries'
import { SPECIES, speciesInfo } from '@/lib/constants'
import { fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'

const PALETTE = ['#275040', '#3f7d5c', '#5f9a79', '#8fbba1', '#c8923a', '#dfb96f', '#c65a3f', '#78716c', '#0ea5e9', '#a78bfa']
const tooltipStyle = { borderRadius: 10, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontSize: 12 }

export default function ReportsPage() {
  const { farm, currency, can } = useSession()
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <CardHeader title="Births and losses by year" />
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
        </Card>
      </div>

      {can('manager') && r.yearly.some((y) => y.avgPrice) && (
        <Card>
          <CardHeader title="Average sale price by year" />
          <div className="grid gap-px overflow-hidden rounded-b-2xl bg-stone-100 sm:grid-cols-3 lg:grid-cols-6">
            {r.yearly.map((y) => (
              <div key={y.year} className="bg-white p-4"><p className="text-xs text-stone-500">{y.year}</p><p className="mt-1 font-display text-xl font-semibold text-stone-900">{y.avgPrice ? fmtMoney(y.avgPrice, currency, { decimals: false }) : '—'}</p><p className="text-xs text-stone-400">{y.sold} sold</p></div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
