'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Fuel, Gauge, MoreHorizontal, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, DescriptionList, EmptyState, PageSkeleton, ProgressBar } from '@/components/ui/display'
import { Menu, MenuItem, useConfirm } from '@/components/ui/overlay'
import { EquipmentSheet, LogSheet } from '@/components/forms/equipment-forms'
import { api, useSave } from '@/lib/queries'
import { getData } from '@/lib/api'
import { EQUIPMENT_CATEGORIES, EQUIPMENT_LOG_TYPES, EQUIPMENT_STATUS, SERVICE_STATE } from '@/lib/constants'
import { fmtDate, fmtDue, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Equipment, EquipmentLog } from '@/lib/types'

function EquipmentView() {
  const id = Number(useSearchParams().get('id'))
  const router = useRouter()
  const { can, currency } = useSession()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<null | { kind: 'edit' } | { kind: 'log'; log?: EquipmentLog; type?: string }>(null)
  const { data, isError } = useQuery({ queryKey: ['equipment', id], queryFn: () => getData<{ equipment: Equipment; logs: EquipmentLog[] }>(`/api/equipment/${id}/logs`), enabled: id > 0 })
  const delLog = useSave((logId: number) => api.del(`/api/equipment/${id}/logs/${logId}`), { invalidate: ['equipment', 'finance'], success: 'Log deleted' })
  const remove = useSave(() => api.del(`/api/equipment/${id}`), { invalidate: ['equipment'], success: 'Equipment deleted', onSuccess: () => router.push('/equipment') })

  if (isError) return <EmptyState title="Equipment not found" action={<Link href="/equipment" className="text-sm font-medium text-brand-700">Back to equipment</Link>} />
  if (!data) return <PageSkeleton />
  const { equipment: e, logs } = data
  const st = SERVICE_STATE[e.serviceState]
  const status = EQUIPMENT_STATUS.find((s) => s.value === e.status)!
  const yearStart = `${todayISO().slice(0, 4)}-01-01`
  const costYear = logs.filter((l) => l.date >= yearStart).reduce((s, l) => s + (l.cost || 0), 0)
  const costAll = logs.reduce((s, l) => s + (l.cost || 0), 0)
  const used = e.serviceIntervalHours && e.hours != null ? e.hours - (e.lastServiceHours ?? 0) : null

  return (
    <div className="space-y-6">
      <Link href="/equipment" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" />Equipment</Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{e.name}</h1>
          <p className="mt-1 text-sm text-stone-500">{[EQUIPMENT_CATEGORIES.find((c) => c.value === e.category)?.label, e.make, e.model, e.year].filter(Boolean).join(' · ')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {e.serviceReasons.map((r) => <Badge key={r} tone="amber">{r}</Badge>)}
          </div>
        </div>
        {can('worker') && (
          <div className="flex gap-2">
            <Button onClick={() => setSheet({ kind: 'log', type: 'service' })}><Wrench />Log service</Button>
            <Menu trigger={<Button variant="secondary"><Plus />Log…</Button>}>
              <MenuItem icon={Wrench} onClick={() => setSheet({ kind: 'log', type: 'repair' })}>Repair</MenuItem>
              <MenuItem icon={Fuel} onClick={() => setSheet({ kind: 'log', type: 'fuel' })}>Fuel</MenuItem>
              <MenuItem icon={Gauge} onClick={() => setSheet({ kind: 'log', type: 'hours' })}>Hours reading</MenuItem>
              <MenuItem onClick={() => setSheet({ kind: 'log', type: 'inspection' })}>Inspection</MenuItem>
              <MenuItem onClick={() => setSheet({ kind: 'log', type: 'note' })}>Note</MenuItem>
            </Menu>
            <Menu trigger={<Button variant="secondary" size="icon" aria-label="More"><MoreHorizontal /></Button>}>
              <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'edit' })}>Edit details</MenuItem>
              {can('manager') && <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: `Delete ${e.name}?`, description: 'All logs will be deleted. Linked costs stay in your finances. To keep history, set the status to Sold or Retired instead.', confirmLabel: 'Delete', danger: true })) remove.mutate(undefined) }}>Delete</MenuItem>}
            </Menu>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <p className="text-[13px] font-medium text-stone-500">Service</p>
          {e.serviceIntervalHours || e.serviceIntervalMonths ? (
            <div className="mt-3 space-y-4">
              {e.serviceIntervalHours && used != null && (
                <div>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="text-stone-800">{fmtNum(used)} of {fmtNum(e.serviceIntervalHours)} h</span><span className="text-stone-500">next at {fmtNum(e.nextServiceHours)} h</span></div>
                  <ProgressBar value={used} max={e.serviceIntervalHours} tone={used >= e.serviceIntervalHours ? 'red' : used >= e.serviceIntervalHours * 0.9 ? 'amber' : 'brand'} />
                </div>
              )}
              {e.nextServiceDate && <p className="text-sm text-stone-800">By date: <strong className={cn(e.nextServiceDate < todayISO() && 'text-clay-600')}>{fmtDate(e.nextServiceDate)}</strong> <span className="text-stone-400">({fmtDue(e.nextServiceDate)})</span></p>}
              <p className="text-xs text-stone-500">Last service {e.lastServiceDate ? fmtDate(e.lastServiceDate) : 'not recorded'}{e.lastServiceHours != null ? ` at ${fmtNum(e.lastServiceHours)} h` : ''}</p>
            </div>
          ) : <p className="mt-2 text-sm text-stone-500">No service interval set. <button className="font-medium text-brand-700 hover:underline" onClick={() => setSheet({ kind: 'edit' })}>Add one</button></p>}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4">
            <div><p className="text-xs text-stone-500">Hours / mileage</p><p className="font-display text-2xl font-semibold text-stone-900">{e.hours != null ? fmtNum(e.hours) : '—'}</p></div>
            {can('manager') && <div><p className="text-xs text-stone-500">Running costs this year</p><p className="font-display text-2xl font-semibold text-stone-900">{fmtMoney(costYear, currency, { decimals: false })}</p></div>}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <div className="p-5">
            <DescriptionList cols={3} items={[
              { label: 'Registration', value: e.registration },
              { label: 'Serial / VIN', value: e.serialNumber },
              { label: 'MOT due', value: e.motDue ? `${fmtDate(e.motDue)} (${fmtDue(e.motDue)})` : null },
              { label: 'Insurance renewal', value: e.insuranceDue ? fmtDate(e.insuranceDue) : null },
              { label: 'Purchased', value: e.purchaseDate ? fmtDate(e.purchaseDate) : null },
              { label: 'Purchase price', value: fmtMoney(e.purchasePrice, currency, { decimals: false }), hidden: !can('manager') || !e.purchasePrice },
              { label: 'Lifetime running costs', value: fmtMoney(costAll, currency, { decimals: false }), hidden: !can('manager') },
            ]} />
            {e.notes && <p className="mt-5 whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm text-stone-700">{e.notes}</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Log" description={`${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`} />
        {logs.length === 0 ? <EmptyState icon={Wrench} title="Nothing logged yet" description="Services, repairs, fuel and hours readings will build a full history." /> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Details</th><th className="px-3 py-2 text-right font-medium">Hours</th>{can('manager') && <th className="px-3 py-2 text-right font-medium">Cost</th>}<th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-stone-600">{fmtDate(l.date)}</td>
                    <td className="px-3 py-2.5"><Badge tone={l.type === 'service' ? 'green' : l.type === 'repair' ? 'red' : l.type === 'fuel' ? 'amber' : 'gray'}>{EQUIPMENT_LOG_TYPES.find((t) => t.value === l.type)?.label}</Badge></td>
                    <td className="px-3 py-2.5 text-stone-700">{l.description || '—'}{l.performedBy && <span className="block text-xs text-stone-400">{l.performedBy}</span>}</td>
                    <td className="px-3 py-2.5 text-right text-stone-600 tabular">{l.hours != null ? fmtNum(l.hours) : '—'}</td>
                    {can('manager') && <td className="px-3 py-2.5 text-right text-stone-600 tabular">{l.cost ? fmtMoney(l.cost, currency) : '—'}</td>}
                    <td className="px-3 py-2.5">{can('worker') && (
                      <Menu trigger={<button className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                        <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'log', log: l })}>Edit</MenuItem>
                        <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: 'Delete this log entry?', confirmLabel: 'Delete', danger: true })) delLog.mutate(l.id) }}>Delete</MenuItem>
                      </Menu>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sheet?.kind === 'edit' && <EquipmentSheet onClose={() => setSheet(null)} item={e} />}
      {sheet?.kind === 'log' && <LogSheet onClose={() => setSheet(null)} equipment={e} log={sheet.log} defaultType={sheet.type} />}
    </div>
  )
}

export default function EquipmentViewPage() {
  return <Suspense><EquipmentView /></Suspense>
}
