'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Minus, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, PageHeader, PageSkeleton, StatCard } from '@/components/ui/display'
import { FormError, FormGrid, Segmented, Select, SelectField, TextField, TextareaField, formValues } from '@/components/ui/form'
import { Menu, MenuItem, Sheet, useConfirm } from '@/components/ui/overlay'
import { api, useInventory, useSave } from '@/lib/queries'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
import { fmtDate, fmtDue, fmtMoney, fmtNum, todayISO } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { InventoryItem } from '@/lib/types'

export default function InventoryPage() {
  const { can, currency } = useSession()
  const { data, isLoading } = useInventory()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [sheet, setSheet] = useState<null | { kind: 'item'; item?: InventoryItem } | { kind: 'adjust'; item: InventoryItem; dir: 1 | -1 }>(null)
  const del = useSave((id: number) => api.del(`/api/inventory/${id}`), { invalidate: ['inventory'], success: 'Item deleted' })

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data || []).filter((i) => (!cat || i.category === cat) && (!s || `${i.name} ${i.supplier || ''} ${i.location || ''}`.toLowerCase().includes(s)))
  }, [data, q, cat])

  if (isLoading || !data) return <PageSkeleton />
  const value = data.reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Feed, medicines, vaccines, fertiliser, fuel and parts in stock."
        actions={can('worker') && <Button onClick={() => setSheet({ kind: 'item' })}><Plus />Add item</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items" value={data.length} icon={Boxes} />
        <StatCard label="Low stock" value={data.filter((i) => i.lowStock).length} icon={AlertTriangle} tone="wheat" />
        <StatCard label="Expired or expiring" value={data.filter((i) => i.expired || i.expiringSoon).length} icon={AlertTriangle} tone="clay" sub="Within 30 days" />
        {can('manager') && <StatCard label="Stock value" value={fmtMoney(value, currency, { decimals: false })} icon={Boxes} tone="stone" sub="At unit cost" />}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" aria-label="Search inventory"
              className="h-9 w-full rounded-lg border-0 bg-stone-50 pl-9 pr-3 text-sm ring-1 ring-inset ring-stone-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-44" aria-label="Category"><option value="">All categories</option>{INVENTORY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
        </div>
        {rows.length === 0 ? <EmptyState icon={Boxes} title={data.length ? 'Nothing matches' : 'No stock recorded'} description="Track what you have, and get a warning before it runs out or expires."
          action={!data.length && can('worker') && <Button onClick={() => setSheet({ kind: 'item' })}><Plus />Add item</Button>} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50/60 text-left text-xs text-stone-500"><tr><th className="px-5 py-2.5 font-medium">Item</th><th className="px-3 py-2.5 font-medium">Category</th><th className="px-3 py-2.5 text-right font-medium">In stock</th><th className="px-3 py-2.5 font-medium">Expiry</th><th className="px-3 py-2.5 font-medium">Location</th><th className="px-3 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3"><p className="font-medium text-stone-900">{i.name}</p><p className="text-xs text-stone-400">{[i.supplier, i.batchNo ? `batch ${i.batchNo}` : null].filter(Boolean).join(' · ')}</p></td>
                    <td className="px-3 py-3 text-stone-600">{INVENTORY_CATEGORIES.find((c) => c.value === i.category)?.label}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={cn('font-semibold tabular', i.lowStock ? 'text-amber-700' : 'text-stone-900')}>{fmtNum(i.quantity, 2)}</span> <span className="text-stone-500">{i.unit}</span>
                      {i.lowStock && <span className="block text-[11px] text-amber-700">Reorder at {fmtNum(i.reorderLevel, 2)}</span>}
                    </td>
                    <td className="px-3 py-3">{i.expiryDate ? <span className={cn('text-sm', i.expired ? 'font-medium text-clay-600' : i.expiringSoon ? 'text-amber-700' : 'text-stone-600')}>{fmtDate(i.expiryDate)}{(i.expired || i.expiringSoon) && <span className="block text-[11px]">{i.expired ? 'Expired' : fmtDue(i.expiryDate)}</span>}</span> : <span className="text-stone-300">—</span>}</td>
                    <td className="px-3 py-3 text-stone-600">{i.location || '—'}</td>
                    <td className="px-3 py-3">
                      {can('worker') && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'adjust', item: i, dir: -1 })} aria-label={`Use ${i.name}`}><Minus />Use</Button>
                          <Button size="sm" variant="secondary" onClick={() => setSheet({ kind: 'adjust', item: i, dir: 1 })} aria-label={`Receive ${i.name}`}><Plus />Receive</Button>
                          <Menu trigger={<button className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100" aria-label="More"><MoreHorizontal className="size-4" /></button>}>
                            <MenuItem icon={Pencil} onClick={() => setSheet({ kind: 'item', item: i })}>Edit</MenuItem>
                            <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: `Delete ${i.name}?`, confirmLabel: 'Delete', danger: true })) del.mutate(i.id) }}>Delete</MenuItem>
                          </Menu>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sheet?.kind === 'item' && <ItemSheet onClose={() => setSheet(null)} item={sheet.item} />}
      {sheet?.kind === 'adjust' && <AdjustSheet onClose={() => setSheet(null)} item={sheet.item} dir={sheet.dir} />}
    </div>
  )
}

function ItemSheet({ onClose, item }: { onClose: () => void; item?: InventoryItem }) {
  const { can, currency } = useSession()
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => item ? api.put(`/api/inventory/${item.id}`, b) : api.post('/api/inventory', b), { invalidate: ['inventory'], success: 'Saved', silentError: true, onSuccess: onClose })
  return (
    <Sheet open onClose={onClose} title={item ? `Edit ${item.name}` : 'Add stock item'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="item-form" loading={save.isPending}>Save</Button></>}>
      <form id="item-form" className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(formValues(e.currentTarget), { onError: (err) => setError(err.message) }) }}>
        <TextField label="Name" name="name" required defaultValue={item?.name} placeholder="e.g. Ewe nuts 18%" maxLength={150} />
        <FormGrid>
          <SelectField label="Category" name="category" defaultValue={item?.category ?? 'feed'} options={INVENTORY_CATEGORIES} />
          <TextField label="Unit" name="unit" required defaultValue={item?.unit ?? 'kg'} list="units" />
          <TextField label="Quantity in stock" name="quantity" type="number" step="any" min={0} required defaultValue={item?.quantity ?? 0} />
          <TextField label="Reorder when below" name="reorderLevel" type="number" step="any" min={0} defaultValue={item?.reorderLevel ?? ''} />
          {can('manager') && <TextField label="Cost per unit" name="unitCost" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} defaultValue={item?.unitCost ?? ''} />}
          <TextField label="Supplier" name="supplier" defaultValue={item?.supplier ?? ''} />
          <TextField label="Stored at" name="location" defaultValue={item?.location ?? ''} placeholder="e.g. Feed shed" />
          <TextField label="Batch number" name="batchNo" defaultValue={item?.batchNo ?? ''} />
          <TextField label="Expiry date" name="expiryDate" type="date" defaultValue={item?.expiryDate ?? ''} />
        </FormGrid>
        <datalist id="units">{['kg', 'tonnes', 'bags', 'litres', 'ml', 'doses', 'bottles', 'bales', 'units'].map((u) => <option key={u} value={u} />)}</datalist>
        <TextareaField label="Notes" name="notes" defaultValue={item?.notes ?? ''} rows={2} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

function AdjustSheet({ onClose, item, dir }: { onClose: () => void; item: InventoryItem; dir: 1 | -1 }) {
  const { can, currency } = useSession()
  const [mode, setMode] = useState<'in' | 'out'>(dir === 1 ? 'in' : 'out')
  const [error, setError] = useState<string | null>(null)
  const save = useSave((b: any) => api.post(`/api/inventory/${item.id}/adjust`, b), { invalidate: ['inventory', 'finance'], success: 'Stock updated', silentError: true, onSuccess: onClose })
  return (
    <Sheet open onClose={onClose} title={item.name} description={`${fmtNum(item.quantity, 2)} ${item.unit} in stock`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="adjust-form" loading={save.isPending}>Update stock</Button></>}>
      <form id="adjust-form" className="space-y-5" onSubmit={(e) => {
        e.preventDefault()
        const v = formValues(e.currentTarget)
        save.mutate({ change: (mode === 'in' ? 1 : -1) * Number(v.amount), note: v.note, totalCost: mode === 'in' ? v.totalCost : null, date: v.date || todayISO() }, { onError: (err) => setError(err.message) })
      }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'out', label: 'Used' }, { value: 'in', label: 'Received' }]} />
        <FormGrid>
          <TextField label={`Amount (${item.unit})`} name="amount" type="number" step="any" min={0.001} required />
          <TextField label="Date" name="date" type="date" defaultValue={todayISO()} max={todayISO()} />
          {mode === 'in' && can('manager') && <TextField label="Total cost" name="totalCost" type="number" step="0.01" min={0} prefix={currency === 'GBP' ? '£' : undefined} hint="Recorded as an expense" className="sm:col-span-2" />}
        </FormGrid>
        <TextField label="Note" name="note" placeholder={mode === 'out' ? 'e.g. Fed to weaned calves' : 'e.g. Delivery from merchant'} />
        <FormError error={error} />
      </form>
    </Sheet>
  )
}

