'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Baby, Boxes, CheckCircle2, ChevronRight, CircleDot, ClipboardList, HeartPulse, Landmark, PawPrint, Plus,
  Gavel, ShieldAlert, Sprout, Tag, Tractor, TrendingUp, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { Menu, MenuItem } from '@/components/ui/overlay'
import { WeatherCard } from '@/components/weather'
import { AnimalSheet, BirthSheet, HealthSheet, WeightSheet } from '@/components/forms/livestock-forms'
import { TaskSheet, TransactionSheet } from '@/components/forms/other-forms'
import { api, useSave } from '@/lib/queries'
import { getData } from '@/lib/api'
import { CATEGORY_LABELS, speciesInfo } from '@/lib/constants'
import { fmtArea, fmtDue, fmtMoney, fmtNum, fmtRelative } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

interface Dashboard {
  herd: Record<string, { total: number; classes: Record<string, number> }>
  totals: { activeAnimals: number; birthsThisYear: number; birthLossesThisYear: number; soldThisYear: number; diedThisYear: number; pregnantOrServed: number; landHa: number; fields: number; equipment: number }
  alerts: {
    healthDue: { id: number; animalId: number; animalTag: string; title: string; date: string; overdue: boolean }[]
    withdrawals: { id: number; animalId: number; animalTag: string; title: string; until: string }[]
    dueBirths: { id: number; animalId: number; animalTag: string; date: string; overdue: boolean }[]
    equipment: { id: number; name: string; serviceState: string; serviceReasons: string[] }[]
    stock: { id: number; name: string; quantity: number; unit: string; reason: string }[]
    martNew: number
    compliance: { overdue: number; dueSoon: number; tagIssues: number }
  }
  tasks: { open: number; overdue: number; mine: Task[]; upcoming: Task[] }
  money: { income: number; expense: number; net: number } | null
  activity: { id: number; summary: string; createdAt: string; userName: string | null; userEmail: string | null; entity: string; entityId: number | null }[]
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

type Sheet = null | 'animal' | 'health' | 'birth' | 'weight' | 'task' | 'income' | 'expense'

export default function DashboardPage() {
  const { user, farm, can, currency } = useSession()
  const [sheet, setSheet] = useState<Sheet>(null)
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => getData<Dashboard>('/api/dashboard') })
  const complete = useSave((id: number) => api.put(`/api/tasks/${id}`, { status: 'done' }), { invalidate: ['tasks'], success: 'Task done' })

  if (isLoading || !data) return <PageSkeleton />
  const { totals, alerts, herd } = data
  const overdueBirths = alerts.dueBirths.filter((b) => b.overdue)

  const attention = [
    ...(alerts.compliance.overdue ? [{ key: 'cmp', icon: Landmark, tone: 'red' as const, text: `${alerts.compliance.overdue} ScotEID report${alerts.compliance.overdue === 1 ? '' : 's'} overdue`, meta: 'Births, deaths or movements past their deadline', href: '/traceability' }] : []),
    ...(alerts.compliance.dueSoon ? [{ key: 'cmp2', icon: Landmark, tone: 'amber' as const, text: `${alerts.compliance.dueSoon} ScotEID report${alerts.compliance.dueSoon === 1 ? '' : 's'} due within 3 days`, meta: 'Births, deaths or movements', href: '/traceability' }] : []),
    ...(alerts.martNew ? [{ key: 'mart', icon: Gavel, tone: 'amber' as const, text: `${alerts.martNew} mart sale${alerts.martNew === 1 ? '' : 's'} to review`, meta: 'Found in Orkney Mart reports — import them as sales', href: '/mart' }] : []),
    ...(alerts.compliance.tagIssues ? [{ key: 'tags', icon: Tag, tone: 'amber' as const, text: `${alerts.compliance.tagIssues} ear tag number${alerts.compliance.tagIssues === 1 ? '' : 's'} look wrong`, meta: 'Failed the UK check-digit test', href: '/traceability?tab=tags' }] : []),
    ...alerts.healthDue.filter((h) => h.overdue).map((h) => ({ key: `h${h.id}`, icon: HeartPulse, tone: 'red' as const, text: `${h.title}: ${h.animalTag}`, meta: `overdue ${fmtDue(h.date)}`, href: `/livestock/view?id=${h.animalId}&tab=health` })),
    ...(overdueBirths.length > 3
      ? [{ key: 'births', icon: Baby, tone: 'amber' as const, text: `${overdueBirths.length} pregnancies past their due date`, meta: 'Record the births, or mark them not in calf', href: '/breeding' }]
      : overdueBirths.map((b) => ({ key: `b${b.id}`, icon: Baby, tone: 'amber' as const, text: `${b.animalTag} past due date`, meta: fmtDue(b.date), href: `/livestock/view?id=${b.animalId}&tab=breeding` }))),
    ...alerts.equipment.filter((e) => e.serviceState === 'overdue').map((e) => ({ key: `e${e.id}`, icon: Tractor, tone: 'red' as const, text: e.name, meta: e.serviceReasons[0] || 'Service overdue', href: `/equipment/view?id=${e.id}` })),
    ...alerts.stock.map((s) => ({ key: `s${s.id}`, icon: Boxes, tone: s.reason === 'Expired' ? 'red' as const : 'amber' as const, text: s.name, meta: `${s.reason} · ${fmtNum(s.quantity, 1)} ${s.unit}`, href: '/inventory' })),
    ...alerts.withdrawals.map((w) => ({ key: `w${w.id}`, icon: ShieldAlert, tone: 'amber' as const, text: `${w.animalTag} withdrawal (${w.title})`, meta: `until ${w.until}`, href: `/livestock/view?id=${w.animalId}&tab=health` })),
    ...alerts.equipment.filter((e) => e.serviceState !== 'overdue').map((e) => ({ key: `e2${e.id}`, icon: Tractor, tone: 'amber' as const, text: e.name, meta: e.serviceReasons[0] || 'Service due soon', href: `/equipment/view?id=${e.id}` })),
  ]
  const upcoming = [
    ...alerts.healthDue.filter((h) => !h.overdue).map((h) => ({ key: `h${h.id}`, date: h.date, text: `${h.title}: ${h.animalTag}`, kind: 'Health', href: `/livestock/view?id=${h.animalId}&tab=health` })),
    ...alerts.dueBirths.filter((b) => !b.overdue).map((b) => ({ key: `b${b.id}`, date: b.date, text: `${b.animalTag} due to give birth`, kind: 'Birth', href: `/livestock/view?id=${b.animalId}&tab=breeding` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)

  const speciesKeys = Object.keys(herd)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description={`Here’s what’s happening on ${farm.name}.`}
        actions={can('worker') && (
          <Menu trigger={<Button><Plus />Quick add</Button>}>
            <MenuItem icon={PawPrint} onClick={() => setSheet('animal')}>Animal</MenuItem>
            <MenuItem icon={HeartPulse} onClick={() => setSheet('health')}>Health record</MenuItem>
            <MenuItem icon={Baby} onClick={() => setSheet('birth')}>Birth</MenuItem>
            <MenuItem icon={TrendingUp} onClick={() => setSheet('weight')}>Weight</MenuItem>
            <MenuItem icon={ClipboardList} onClick={() => setSheet('task')}>Task</MenuItem>
            {can('manager') && <MenuItem icon={Wallet} onClick={() => setSheet('expense')}>Expense</MenuItem>}
            {can('manager') && <MenuItem icon={Landmark} onClick={() => setSheet('income')}>Income</MenuItem>}
          </Menu>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Animals on farm" value={fmtNum(totals.activeAnimals)} icon={PawPrint} href="/livestock"
          sub={speciesKeys.map((s) => `${herd[s].total} ${speciesInfo(s).plural.toLowerCase()}`).join(' · ') || 'None yet'} />
        <StatCard label="Born this year" value={fmtNum(totals.birthsThisYear)} icon={Baby} tone="wheat" href="/breeding?tab=births"
          sub={totals.birthLossesThisYear ? `${totals.birthLossesThisYear} lost at birth` : 'No losses recorded'} />
        <StatCard label="Due to give birth" value={fmtNum(alerts.dueBirths.length)} icon={Sprout} tone="sky" href="/breeding"
          sub={alerts.dueBirths.filter((b) => b.overdue).length ? `${alerts.dueBirths.filter((b) => b.overdue).length} past due date` : 'Next 45 days'} />
        {data.money ? (
          <StatCard label="Net this year" value={fmtMoney(data.money.net, currency, { compact: Math.abs(data.money.net) >= 100000, decimals: false })} icon={Wallet} tone={data.money.net >= 0 ? 'brand' : 'clay'} href="/finance"
            sub={`${fmtMoney(data.money.income, currency, { decimals: false })} in · ${fmtMoney(data.money.expense, currency, { decimals: false })} out`} />
        ) : (
          <StatCard label="Open tasks" value={fmtNum(data.tasks.open)} icon={ClipboardList} tone="stone" href="/tasks" sub={data.tasks.overdue ? `${data.tasks.overdue} overdue` : 'All on track'} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Needs attention" icon={AlertTriangle} description={attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'}` : undefined} />
            {attention.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All clear" description="No overdue treatments, births, servicing or stock problems." className="py-10" />
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {attention.slice(0, 10).map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-stone-50">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', a.tone === 'red' ? 'bg-clay-50 text-clay-600' : 'bg-amber-50 text-amber-700')}><a.icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-800">{a.text}</span>
                        <span className="block truncate text-xs text-stone-500">{a.meta}</span>
                      </span>
                      <ChevronRight className="size-4 text-stone-300" />
                    </Link>
                  </li>
                ))}
                {attention.length > 10 && <li className="px-5 py-3 text-xs text-stone-500">+ {attention.length - 10} more</li>}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Coming up" description="Next 30–45 days" action={<Link href="/calendar" className="text-xs font-medium text-brand-700 hover:underline">Calendar</Link>} />
              {upcoming.length === 0 ? <p className="px-5 pb-6 pt-4 text-sm text-stone-500">Nothing scheduled.</p> : (
                <ul className="mt-3 space-y-1 px-2 pb-3">
                  {upcoming.map((u) => (
                    <li key={u.key}>
                      <Link href={u.href} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50">
                        <CircleDot className={cn('size-3.5', u.kind === 'Birth' ? 'text-emerald-500' : 'text-sky-500')} />
                        <span className="flex-1 truncate text-sm text-stone-800">{u.text}</span>
                        <span className="shrink-0 text-xs text-stone-400">{fmtDue(u.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Tasks" description={data.tasks.open ? `${data.tasks.open} open${data.tasks.overdue ? ` · ${data.tasks.overdue} overdue` : ''}` : 'Nothing to do'}
                action={<Link href="/tasks" className="text-xs font-medium text-brand-700 hover:underline">All tasks</Link>} />
              {(data.tasks.mine.length ? data.tasks.mine : data.tasks.upcoming).length === 0 ? (
                <div className="px-5 pb-6 pt-4">
                  {can('worker') ? <Button variant="secondary" size="sm" onClick={() => setSheet('task')}><Plus />Add a task</Button> : <p className="text-sm text-stone-500">No open tasks.</p>}
                </div>
              ) : (
                <ul className="mt-3 space-y-1 px-2 pb-3">
                  {(data.tasks.mine.length ? data.tasks.mine : data.tasks.upcoming).slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50">
                      {can('worker') && (
                        <button onClick={() => complete.mutate(t.id)} aria-label={`Mark ${t.title} done`}
                          className="size-4 shrink-0 rounded-full ring-2 ring-stone-300 transition hover:bg-brand-100 hover:ring-brand-500" />
                      )}
                      <span className="flex-1 truncate text-sm text-stone-800">{t.title}</span>
                      {t.dueDate && <span className={cn('shrink-0 text-xs', t.overdue ? 'font-medium text-clay-600' : 'text-stone-400')}>{fmtDue(t.dueDate)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Recent activity" />
            {data.activity.length === 0 ? <p className="px-5 pb-6 pt-4 text-sm text-stone-500">No activity yet.</p> : (
              <ul className="mt-2 px-5 pb-4">
                {data.activity.map((a, i) => (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < data.activity.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-stone-200" />}
                    <span className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                    <div className="min-w-0">
                      <p className="text-sm text-stone-800">{a.summary}</p>
                      <p className="text-xs text-stone-400">{a.userName || a.userEmail || 'Someone'} · {fmtRelative(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {farm.latitude != null && farm.longitude != null ? <WeatherCard lat={farm.latitude} lng={farm.longitude} /> : (
            <Card className="p-5">
              <p className="text-sm font-medium text-stone-800">Add your farm’s location</p>
              <p className="mt-1 text-sm text-stone-500">Get a local forecast here and centre your farm map.</p>
              <Link href="/settings" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Set location →</Link>
            </Card>
          )}
          <Card>
            <CardHeader title="Herd make-up" action={<Link href="/livestock" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
            <div className="space-y-5 p-5">
              {speciesKeys.length === 0 && <EmptyState icon={PawPrint} title="No animals yet" className="py-4" action={can('worker') && <Button size="sm" onClick={() => setSheet('animal')}><Plus />Add animal</Button>} />}
              {speciesKeys.map((s) => {
                const classes = Object.entries(herd[s].classes).sort((a, b) => b[1] - a[1])
                return (
                  <div key={s}>
                    <p className="mb-2 flex items-center justify-between text-sm font-medium text-stone-800">
                      <span>{speciesInfo(s).emoji} {speciesInfo(s).plural}</span><span className="text-stone-500 tabular">{herd[s].total}</span>
                    </p>
                    <div className="space-y-2">
                      {classes.map(([cls, n]) => (
                        <Link key={cls} href={`/livestock?species=${s}&category=${cls}`} className="group block">
                          <div className="flex justify-between text-xs text-stone-600"><span className="group-hover:text-brand-700">{CATEGORY_LABELS[cls] || cls}</span><span className="tabular">{n}</span></div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${(n / herd[s].total) * 100}%` }} /></div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-[13px] font-medium text-stone-500">Farm at a glance</p>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <div><dt className="text-xs text-stone-500">Land</dt><dd className="font-display text-xl font-semibold text-stone-900">{totals.fields ? fmtArea(totals.landHa, farm.areaUnit) : '—'}</dd><dd className="text-xs text-stone-400">{totals.fields} fields</dd></div>
              <div><dt className="text-xs text-stone-500">Machinery</dt><dd className="font-display text-xl font-semibold text-stone-900">{totals.equipment}</dd><dd className="text-xs text-stone-400">in use</dd></div>
              <div><dt className="text-xs text-stone-500">Sold this year</dt><dd className="font-display text-xl font-semibold text-stone-900">{totals.soldThisYear}</dd></div>
              <div><dt className="text-xs text-stone-500">Deaths this year</dt><dd className="font-display text-xl font-semibold text-stone-900">{totals.diedThisYear}</dd></div>
            </dl>
            {alerts.withdrawals.length > 0 && <Badge tone="amber" className="mt-4">{alerts.withdrawals.length} animal{alerts.withdrawals.length === 1 ? '' : 's'} in withdrawal</Badge>}
          </Card>
        </div>
      </div>

      {sheet === 'animal' && <AnimalSheet open onClose={() => setSheet(null)} />}
      {sheet === 'health' && <HealthSheet open onClose={() => setSheet(null)} />}
      {sheet === 'birth' && <BirthSheet open onClose={() => setSheet(null)} />}
      {sheet === 'weight' && <WeightSheet open onClose={() => setSheet(null)} />}
      {sheet === 'task' && <TaskSheet open onClose={() => setSheet(null)} />}
      {(sheet === 'income' || sheet === 'expense') && <TransactionSheet open onClose={() => setSheet(null)} defaultType={sheet} />}
    </div>
  )
}
