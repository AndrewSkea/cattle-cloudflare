'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, eachDayOfInterval } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, PageHeader } from '@/components/ui/display'
import { getData } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Event { date: string; kind: 'task' | 'health' | 'birth' | 'equipment'; title: string; link: string; done?: boolean }

const KIND: Record<Event['kind'], { label: string; cls: string; dot: string }> = {
  task: { label: 'Tasks', cls: 'bg-stone-100 text-stone-700', dot: 'bg-stone-500' },
  health: { label: 'Health', cls: 'bg-sky-50 text-sky-800', dot: 'bg-sky-500' },
  birth: { label: 'Births due', cls: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  equipment: { label: 'Equipment', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const gridStart = startOfWeek(month, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const from = format(gridStart, 'yyyy-MM-dd')
  const to = format(gridEnd, 'yyyy-MM-dd')
  const { data = [] } = useQuery({ queryKey: ['calendar', from, to], queryFn: () => getData<Event[]>(`/api/dashboard/calendar?from=${from}&to=${to}`) })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>()
    for (const e of data) {
      if (hidden.has(e.kind)) continue
      if (!m.has(e.date)) m.set(e.date, [])
      m.get(e.date)!.push(e)
    }
    return m
  }, [data, hidden])
  const monthEvents = data.filter((e) => e.date.startsWith(format(month, 'yyyy-MM')) && !hidden.has(e.kind))

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Tasks, health follow-ups, due dates and machinery deadlines in one view."
        actions={<>
          <Button variant="secondary" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month"><ChevronLeft /></Button>
          <Button variant="secondary" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="secondary" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month"><ChevronRight /></Button>
        </>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-stone-900">{format(month, 'MMMM yyyy')}</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND) as Event['kind'][]).map((k) => (
            <button key={k} onClick={() => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n })}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition', hidden.has(k) ? 'bg-white text-stone-400 ring-stone-200' : 'bg-white text-stone-700 ring-stone-300')}>
              <span className={cn('size-2 rounded-full', hidden.has(k) ? 'bg-stone-300' : KIND[k].dot)} />{KIND[k].label}
            </button>
          ))}
        </div>
      </div>

      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/60 text-center text-xs font-medium text-stone-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd')
            const ev = byDay.get(key) || []
            return (
              <div key={key} className={cn('min-h-[112px] border-b border-r border-stone-100 p-1.5 [&:nth-child(7n)]:border-r-0', !isSameMonth(d, month) && 'bg-stone-50/50')}>
                <p className={cn('mb-1 grid size-6 place-items-center rounded-full text-xs', isToday(d) ? 'bg-brand-700 font-semibold text-white' : isSameMonth(d, month) ? 'text-stone-700' : 'text-stone-300')}>{format(d, 'd')}</p>
                <div className="space-y-0.5">
                  {ev.slice(0, 3).map((e, i) => (
                    <Link key={i} href={e.link} title={e.title} className={cn('block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:brightness-95', KIND[e.kind].cls, e.done && 'line-through opacity-60')}>{e.title}</Link>
                  ))}
                  {ev.length > 3 && <p className="px-1.5 text-[11px] text-stone-500">+{ev.length - 3} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="md:hidden">
        {monthEvents.length === 0 ? <p className="p-6 text-center text-sm text-stone-500">Nothing this month.</p> : (
          <ul className="divide-y divide-stone-100">
            {monthEvents.map((e, i) => (
              <li key={i}><Link href={e.link} className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 text-center"><span className="block text-[11px] uppercase text-stone-400">{format(new Date(e.date), 'EEE')}</span><span className="block text-lg font-semibold text-stone-900">{format(new Date(e.date), 'd')}</span></span>
                <span className={cn('size-2 rounded-full', KIND[e.kind].dot)} />
                <span className="flex-1 truncate text-sm text-stone-800">{e.title}</span>
              </Link></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
