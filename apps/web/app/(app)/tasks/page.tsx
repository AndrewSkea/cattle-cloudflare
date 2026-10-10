'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ClipboardList, MoreHorizontal, Pencil, Plus, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from '@/components/ui/display'
import { Segmented } from '@/components/ui/form'
import { Menu, MenuItem, useConfirm } from '@/components/ui/overlay'
import { TaskSheet } from '@/components/forms/other-forms'
import { api, useSave, useTasks } from '@/lib/queries'
import { TASK_PRIORITY } from '@/lib/constants'
import { fmtDate, fmtDue } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

const COLUMNS: { value: Task['status']; label: string; dot: string }[] = [
  { value: 'todo', label: 'To do', dot: 'bg-stone-400' },
  { value: 'in_progress', label: 'In progress', dot: 'bg-sky-500' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-500' },
]

export default function TasksPage() {
  const { can, user } = useSession()
  const { data, isLoading } = useTasks()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<null | { task?: Task; status?: Task['status'] }>(null)
  const [who, setWho] = useState<'all' | 'mine'>('all')
  const [drag, setDrag] = useState<number | null>(null)
  const setStatus = useSave(({ id, status }: { id: number; status: Task['status'] }) => api.put(`/api/tasks/${id}`, { status }), { invalidate: ['tasks'] })
  const del = useSave((id: number) => api.del(`/api/tasks/${id}`), { invalidate: ['tasks'], success: 'Task deleted' })

  const tasks = useMemo(() => (data || []).filter((t) => who === 'all' || t.assigneeUserId === user?.id), [data, who, user])
  if (isLoading || !data) return <PageSkeleton />

  const byCol = (s: Task['status']) => tasks
    .filter((t) => t.status === s)
    .sort((a, b) => s === 'done'
      ? (b.completedAt || '').localeCompare(a.completedAt || '')
      : (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || ['high', 'normal', 'low'].indexOf(a.priority) - ['high', 'normal', 'low'].indexOf(b.priority))

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Jobs for you and your team. Drag cards between columns to update them."
        actions={<>
          <Segmented value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'Mine' }]} />
          {can('worker') && <Button onClick={() => setSheet({})}><Plus />New task</Button>}
        </>} />

      {tasks.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="No tasks" description="Add jobs like fencing repairs, TB tests or silage cuts and assign them to your team."
          action={can('worker') && <Button onClick={() => setSheet({})}><Plus />New task</Button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = byCol(col.value)
            return (
              <div key={col.value}
                onDragOver={(e) => { if (can('worker')) e.preventDefault() }}
                onDrop={() => { if (drag != null) { const t = data.find((x) => x.id === drag); if (t && t.status !== col.value) setStatus.mutate({ id: drag, status: col.value }) } setDrag(null) }}
                className={cn('rounded-2xl bg-stone-100/70 p-3 transition', drag != null && 'ring-2 ring-dashed ring-stone-300')}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-stone-700"><span className={cn('size-2 rounded-full', col.dot)} />{col.label}<span className="font-normal text-stone-400">{items.length}</span></p>
                  {can('worker') && col.value !== 'done' && <button onClick={() => setSheet({ status: col.value })} className="rounded-md p-1 text-stone-400 hover:bg-white hover:text-stone-700" aria-label={`Add to ${col.label}`}><Plus className="size-4" /></button>}
                </div>
                <div className="space-y-2">
                  {items.slice(0, col.value === 'done' ? 15 : 100).map((t) => (
                    <div key={t.id} draggable={can('worker')} onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}
                      className={cn('group rounded-xl bg-white p-3.5 shadow-card ring-1 ring-stone-900/5 transition', can('worker') && 'cursor-grab active:cursor-grabbing', drag === t.id && 'opacity-50')}>
                      <div className="flex items-start gap-2.5">
                        {can('worker') && (
                          <button onClick={() => setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'todo' : 'done' })} aria-label={t.status === 'done' ? 'Reopen task' : 'Complete task'}
                            className={cn('mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full ring-2 transition', t.status === 'done' ? 'bg-emerald-500 ring-emerald-500 text-white' : 'ring-stone-300 hover:ring-brand-500')}>
                            {t.status === 'done' && <CheckCircle2 className="size-3.5" />}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-medium text-stone-900', t.status === 'done' && 'text-stone-400 line-through')}>{t.title}</p>
                          {t.description && t.status !== 'done' && <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{t.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {t.priority !== 'normal' && t.status !== 'done' && <Badge tone={TASK_PRIORITY[t.priority].tone}>{TASK_PRIORITY[t.priority].label}</Badge>}
                            {t.dueDate && t.status !== 'done' && <span className={cn('text-xs', t.overdue ? 'font-medium text-clay-600' : 'text-stone-500')}>{t.overdue ? 'Overdue · ' : ''}{fmtDate(t.dueDate, 'd MMM')} ({fmtDue(t.dueDate)})</span>}
                            {t.status === 'done' && t.completedAt && <span className="text-xs text-stone-400">Done {fmtDate(t.completedAt, 'd MMM')}</span>}
                          </div>
                          {(t.animalTag || t.equipmentName || t.parcelName || t.assigneeName) && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                              {t.assigneeName && <span className="inline-flex items-center gap-1"><User className="size-3" />{t.assigneeName}</span>}
                              {t.animalTag && <Link href={`/livestock/view?id=${t.animalId}`} className="hover:text-brand-700">🐄 {t.animalTag}</Link>}
                              {t.equipmentName && <Link href={`/equipment/view?id=${t.equipmentId}`} className="hover:text-brand-700">🚜 {t.equipmentName}</Link>}
                              {t.parcelName && <span>📍 {t.parcelName}</span>}
                            </div>
                          )}
                        </div>
                        {can('worker') && (
                          <Menu trigger={<button className="rounded-md p-1 text-stone-300 opacity-0 transition hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100 focus:opacity-100" aria-label="Task actions"><MoreHorizontal className="size-4" /></button>}>
                            <MenuItem icon={Pencil} onClick={() => setSheet({ task: t })}>Edit</MenuItem>
                            {COLUMNS.filter((c) => c.value !== t.status).map((c) => <MenuItem key={c.value} onClick={() => setStatus.mutate({ id: t.id, status: c.value })}>Move to {c.label}</MenuItem>)}
                            <MenuItem icon={Trash2} danger onClick={async () => { if (await confirm({ title: 'Delete this task?', confirmLabel: 'Delete', danger: true })) del.mutate(t.id) }}>Delete</MenuItem>
                          </Menu>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-stone-400">Nothing here</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {sheet && <TaskSheet open onClose={() => setSheet(null)} task={sheet.task} defaults={sheet.status ? { status: sheet.status } : undefined} />}
    </div>
  )
}
