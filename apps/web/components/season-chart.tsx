'use client'

import Link from 'next/link'
import { CROPS, cropInfo, cropLabel, FIELD_EVENT_TYPES, fieldEventType } from '@/lib/constants'
import { fmtDate, todayISO } from '@/lib/format'
import type { FieldsOverview, Parcel } from '@/lib/types'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Every field across one year: crop bars (dashed when planned) and a dot for each record. */
export function SeasonChart({ data, parcels }: { data: FieldsOverview; parcels: Parcel[] }) {
  const y = data.year
  const start = Date.parse(`${y}-01-01`), end = Date.parse(`${y + 1}-01-01`)
  const pos = (d: string) => Math.max(0, Math.min(1, (Date.parse(d) - start) / (end - start))) * 100
  const t = todayISO()
  const todayPos = t.startsWith(String(y)) ? pos(t) : null
  const usedCrops = new Set(data.crops.map((c) => c.crop))
  const usedTypes = new Set(data.events.map((e) => e.type))

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="min-w-[680px] px-5 pb-4">
        <div className="grid grid-cols-[140px_1fr] items-end gap-3 pb-1 text-[11px] font-medium text-stone-400">
          <span />
          <div className="grid grid-cols-12">{MONTHS.map((m, i) => <span key={i} className="border-l border-stone-100 pl-1">{m}</span>)}</div>
        </div>
        {parcels.map((p) => {
          const crops = data.crops.filter((c) => c.parcelId === p.id)
          const events = data.events.filter((e) => e.parcelId === p.id)
          return (
            <div key={p.id} className="grid grid-cols-[140px_1fr] items-center gap-3 border-t border-stone-100 py-1.5">
              <Link href={`/land/field?id=${p.id}`} className="truncate text-[13px] font-medium text-stone-800 hover:text-brand-700">{p.name}</Link>
              <div className="relative h-7 rounded-md bg-[repeating-linear-gradient(to_right,transparent,transparent_calc(100%/12-1px),#f5f5f4_calc(100%/12-1px),#f5f5f4_calc(100%/12))]">
                {crops.map((c) => {
                  const from = c.startDate && c.startDate > `${y}-01-01` ? pos(c.startDate) : 0
                  const until = c.endDate ?? (c.status === 'planned' ? c.expectedHarvest ?? null : null)
                  const to = until && until < `${y + 1}-01-01` ? pos(until) : 100
                  const color = cropInfo(c.crop).color
                  return (
                    <span key={c.id} title={`${cropLabel(c)}${c.startDate ? ` · ${c.status === 'planned' ? 'planned' : 'sown'} ${fmtDate(c.startDate)}` : ''}${c.endDate ? ` → ${fmtDate(c.endDate)}` : ''}`}
                      className="absolute inset-y-1 rounded"
                      style={{ left: `${from}%`, width: `${Math.max(1, to - from)}%`, background: c.status === 'planned' ? 'transparent' : `${color}55`, border: `1.5px ${c.status === 'planned' ? 'dashed' : 'solid'} ${color}` }} />
                  )
                })}
                {expectedHarvests(crops, y).map((h) => (
                  <span key={`h${h.id}`} title={`Harvest expected ${fmtDate(h.date)}`} className="absolute inset-y-0.5 w-0.5 rounded bg-wheat-600/70" style={{ left: `${pos(h.date)}%` }} />
                ))}
                {events.map((e) => {
                  const m = fieldEventType(e.type)
                  return (
                    <Link key={e.id} href={`/land/field?id=${p.id}`} title={`${m.short}${e.product ? `: ${e.product}` : ''} · ${fmtDate(e.date)}${e.status === 'planned' ? ' (planned)' : ''}`}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                      style={{ left: `${pos(e.date)}%`, background: e.status === 'planned' ? 'white' : m.color, boxShadow: e.status === 'planned' ? `inset 0 0 0 2px ${m.color}` : undefined }} />
                  )
                })}
                {todayPos != null && <span className="pointer-events-none absolute -inset-y-1 w-px bg-clay-500" style={{ left: `${todayPos}%` }} />}
              </div>
            </div>
          )
        })}
        {(usedCrops.size > 0 || usedTypes.size > 0) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-[11px] text-stone-600">
            {CROPS.filter((c) => usedCrops.has(c.value)).map((c) => (
              <span key={c.value} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: `${c.color}55`, border: `1.5px solid ${c.color}` }} />{c.label}</span>
            ))}
            {FIELD_EVENT_TYPES.filter((x) => usedTypes.has(x.value)).map((x) => (
              <span key={x.value} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: x.color }} />{x.short}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-white ring-2 ring-inset ring-stone-400" />Planned</span>
            {todayPos != null && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-clay-500" />Today</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function expectedHarvests(crops: FieldsOverview['crops'], y: number) {
  return crops.filter((c) => c.status !== 'finished' && c.expectedHarvest?.startsWith(String(y))).map((c) => ({ id: c.id, date: c.expectedHarvest! }))
}
